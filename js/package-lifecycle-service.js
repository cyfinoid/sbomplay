/**
 * Package Lifecycle Service — Phase 4 of the lifecycle/heuristics plan.
 *
 * Looks up authoritative lifecycle status for a dependency from its native
 * registry (npm, PyPI, NuGet, Cargo) and from GitHub when a source repo is
 * known. Returns one of:
 *   - 'deprecated'             (npm: deprecated string; NuGet: deprecation block)
 *   - 'archived'               (GitHub: repo.archived === true; PyPI: status)
 *   - 'quarantined'            (PyPI: status === 'quarantined')
 *   - 'yanked'                 (Cargo: version.yanked === true)
 *   - 'unmaintained-suspected' (Phase 5 heuristics; never written by this service)
 *   - 'unknown'                (no signal found, or fetch failed)
 *
 * Caching: every result is persisted on the global `packages` cache under
 * `lifecycle: { status, reason, replacement, source, fetchedAt }` with a 7
 * day TTL (`LIFECYCLE_TTL_MS`). When the cached entry is fresh we skip the
 * network round-trip. Cache reads are always synchronous via
 * `cacheManager.getPackageSync` so the enrichment pipeline can decide
 * whether to enqueue a fetch without waiting on IndexedDB.
 *
 * Network I/O is funneled through `requestQueueManager` so this phase shares
 * the same per-lane concurrency budget as the licenses/authors phases.
 */
class PackageLifecycleService {
    constructor() {
        this.LIFECYCLE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
        // GitHub is rate-limited heavily so we de-dupe by `owner/repo` for
        // the lifetime of a pipeline run (the cache also persists across
        // runs but this avoids burning calls on the same repo twice in one
        // enrichment cycle).
        this._githubInflight = new Map();
    }

    _queuedFetch(lane, url, options) {
        const queue = (typeof window !== 'undefined') ? window.requestQueueManager : null;
        if (!queue) {
            return fetchWithTimeout(url, options);
        }
        return queue.execute(lane, () => fetchWithTimeout(url, options));
    }

    /**
     * Look up lifecycle status for a single dep. Always returns an object
     * with at least `{ status: 'unknown', source: null }`.
     */
    async fetchLifecycle(dep) {
        if (!dep || !dep.name) return { status: 'unknown', source: null };

        const ecosystem = (dep.category && dep.category.ecosystem || dep.ecosystem || '').toLowerCase();
        const packageKey = `${ecosystem}:${dep.name}`;

        // Cache check first — most deps will hit this branch.
        const cached = this._readCache(packageKey, dep.version);
        if (cached) return cached;

        let result = null;
        try {
            switch (ecosystem) {
                case 'npm':
                    result = await this._fetchNpmLifecycle(dep);
                    break;
                case 'pypi':
                    result = await this._fetchPypiLifecycle(dep);
                    break;
                case 'nuget':
                    result = await this._fetchNugetLifecycle(dep);
                    break;
                case 'cargo':
                    result = await this._fetchCargoLifecycle(dep);
                    break;
                default:
                    result = null;
            }
        } catch (err) {
            console.warn(`⚠️ Lifecycle lookup failed for ${packageKey}@${dep.version}:`, err.message);
            result = null;
        }

        // GitHub fallback: if the registry didn't surface anything, look at
        // the source repo (`dep.sourceRepoUrl`, populated by Phase 1.6) and
        // mark the dep as `archived` when GitHub says so. This catches Maven
        // / Hex / Pub / generic deps with no native deprecation channel.
        if ((!result || result.status === 'unknown') && dep.sourceRepoUrl) {
            const archivedResult = await this._fetchGithubArchived(dep.sourceRepoUrl);
            if (archivedResult) {
                result = archivedResult;
            }
        }

        // Always store SOMETHING so we don't keep retrying packages that
        // genuinely have no lifecycle signal. The cached "unknown" still
        // honors TTL and will be refreshed in 7 days.
        const finalResult = result || { status: 'unknown', source: null };
        finalResult.fetchedAt = new Date().toISOString();
        if (!finalResult.source) finalResult.source = 'unknown';
        await this._writeCache(packageKey, dep, finalResult);
        return finalResult;
    }

    // ---------- per-ecosystem fetchers ----------

    async _fetchNpmLifecycle(dep) {
        // npm exposes deprecation per-version on `versions[ver].deprecated`
        // as a free-form string. We treat any non-empty string as deprecated.
        const url = `https://registry.npmjs.org/${this._encodeNpmName(dep.name)}`;
        const resp = await this._queuedFetch('npm', url, { timeout: 10000 });
        if (!resp || !resp.ok) return null;
        const data = await resp.json();
        const versions = (data && data.versions) || {};
        const verData = versions[dep.version] || null;
        if (verData && typeof verData.deprecated === 'string' && verData.deprecated.trim()) {
            return {
                status: 'deprecated',
                reason: verData.deprecated,
                replacement: this._extractReplacementHint(verData.deprecated),
                source: 'npm-registry'
            };
        }
        // If the *latest* version is deprecated, surface that as a softer
        // signal so users see drift even when their pinned version still
        // looks clean.
        const latestTag = data && data['dist-tags'] && data['dist-tags'].latest;
        if (latestTag && versions[latestTag] && typeof versions[latestTag].deprecated === 'string') {
            return {
                status: 'deprecated',
                reason: `Latest version (${latestTag}): ${versions[latestTag].deprecated}`,
                replacement: this._extractReplacementHint(versions[latestTag].deprecated),
                source: 'npm-registry-latest'
            };
        }
        return { status: 'unknown', source: 'npm-registry' };
    }

    async _fetchPypiLifecycle(dep) {
        // PyPI's `info.status` field is currently informational; the
        // PEP 763 deprecation flag is still a draft. We surface 'archived'
        // and 'quarantined' so projects that already use status today get
        // the signal.
        const url = `https://pypi.org/pypi/${encodeURIComponent(dep.name)}/json`;
        const resp = await this._queuedFetch('pypi', url, { timeout: 10000 });
        if (!resp || !resp.ok) return null;
        const data = await resp.json();
        const info = (data && data.info) || {};
        const status = (info.status || '').toLowerCase();
        if (status === 'archived' || status === 'inactive') {
            return { status: 'archived', reason: info.status, source: 'pypi' };
        }
        if (status === 'quarantined') {
            return { status: 'quarantined', reason: info.status, source: 'pypi' };
        }
        return { status: 'unknown', source: 'pypi' };
    }

    async _fetchNugetLifecycle(dep) {
        // NuGet's deprecation block lives in the registration index per
        // catalog entry. We scan the catalog for the matching version.
        const url = `https://api.nuget.org/v3/registration5-gz-semver2/${encodeURIComponent(dep.name.toLowerCase())}/index.json`;
        const resp = await this._queuedFetch('default', url, { timeout: 10000 });
        if (!resp || !resp.ok) return null;
        const data = await resp.json();
        const items = Array.isArray(data && data.items) ? data.items : [];
        for (const page of items) {
            const entries = Array.isArray(page.items) ? page.items : [];
            for (const entry of entries) {
                const catalog = entry && entry.catalogEntry;
                if (!catalog) continue;
                if (catalog.version !== dep.version) continue;
                if (catalog.deprecation) {
                    const dep2 = catalog.deprecation;
                    return {
                        status: 'deprecated',
                        reason: Array.isArray(dep2.reasons) ? dep2.reasons.join(', ') : (dep2.message || null),
                        replacement: dep2.alternatePackage ? dep2.alternatePackage.id : null,
                        source: 'nuget'
                    };
                }
            }
        }
        return { status: 'unknown', source: 'nuget' };
    }

    async _fetchCargoLifecycle(dep) {
        // crates.io tags individual versions as yanked. Our lifecycle field
        // applies to the dep at its installed version, so we mark only that
        // version yanked — never bleed it onto other versions.
        if (!dep.version || dep.version === 'unknown') {
            return { status: 'unknown', source: 'cargo' };
        }
        const url = `https://crates.io/api/v1/crates/${encodeURIComponent(dep.name)}/${encodeURIComponent(dep.version)}`;
        const resp = await this._queuedFetch('cargo', url, { timeout: 10000 });
        if (!resp || !resp.ok) return null;
        const data = await resp.json();
        if (data && data.version && data.version.yanked === true) {
            return {
                status: 'yanked',
                reason: data.version.yank_message || 'Version yanked from registry',
                source: 'cargo'
            };
        }
        return { status: 'unknown', source: 'cargo' };
    }

    async _fetchGithubArchived(sourceRepoUrl) {
        const parsed = this._parseGithubRepoUrl(sourceRepoUrl);
        if (!parsed) return null;
        const key = `${parsed.owner}/${parsed.repo}`;

        if (this._githubInflight.has(key)) {
            return this._githubInflight.get(key);
        }
        const promise = (async () => {
            try {
                const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
                const headers = {};
                // Reuse the user's PAT when present so we don't burn the
                // anonymous quota. Token discovery mirrors what
                // github-client uses.
                if (typeof window !== 'undefined' && window.sessionStorage) {
                    const token = window.sessionStorage.getItem('github_token');
                    if (token) headers['Authorization'] = `token ${token}`;
                }
                const resp = await this._queuedFetch('github', url, { timeout: 10000, headers });
                if (!resp || !resp.ok) return null;
                const data = await resp.json();
                if (data && data.archived === true) {
                    return {
                        status: 'archived',
                        reason: 'Source repository is archived on GitHub',
                        source: 'github-repo'
                    };
                }
                return null;
            } catch (err) {
                console.warn(`⚠️ GitHub archived check failed for ${key}:`, err.message);
                return null;
            }
        })();
        this._githubInflight.set(key, promise);
        return promise;
    }

    // ---------- cache helpers ----------

    _readCache(packageKey, version) {
        if (!window.cacheManager || !window.cacheManager.getPackageSync) return null;
        const pkg = window.cacheManager.getPackageSync(packageKey);
        if (!pkg || !pkg.lifecycle) return null;
        const lc = pkg.lifecycle;
        if (!lc.fetchedAt) return null;
        if (lc.appliesToVersion && version && lc.appliesToVersion !== version) {
            // For yanked status the lifecycle is version-specific; if the
            // dep's version differs from the cached one, treat it as a miss.
            if (lc.status === 'yanked') return null;
        }
        const age = Date.now() - new Date(lc.fetchedAt).getTime();
        if (age > this.LIFECYCLE_TTL_MS) return null;
        return lc;
    }

    async _writeCache(packageKey, dep, lifecycle) {
        if (!window.cacheManager) return;
        try {
            const existing = window.cacheManager.getPackageSync
                ? (window.cacheManager.getPackageSync(packageKey) || {})
                : {};
            const merged = {
                ...existing,
                packageKey,
                ecosystem: (dep.category && dep.category.ecosystem) || dep.ecosystem || null,
                name: dep.name,
                lifecycle: {
                    ...lifecycle,
                    appliesToVersion: lifecycle.status === 'yanked' ? dep.version : null
                }
            };
            await window.cacheManager.savePackage(packageKey, merged);
        } catch (err) {
            console.warn(`⚠️ Failed to cache lifecycle for ${packageKey}:`, err.message);
        }
    }

    // ---------- helpers ----------

    _encodeNpmName(name) {
        // Scoped packages (`@scope/name`) require URL-encoding the slash to
        // %2f for the npm registry GET endpoint.
        if (name.startsWith('@') && name.includes('/')) {
            const [scope, base] = name.split('/');
            return `${encodeURIComponent(scope)}%2f${encodeURIComponent(base)}`;
        }
        return encodeURIComponent(name);
    }

    _parseGithubRepoUrl(url) {
        if (!url || typeof url !== 'string') return null;
        // Accept git+https://github.com/o/r.git, https://github.com/o/r,
        // git@github.com:o/r.git
        try {
            let normalized = url
                .replace(/^git\+/, '')
                .replace(/\.git(?:#.*)?$/, '')
                .replace(/^git@github\.com:/, 'https://github.com/');
            const u = new URL(normalized);
            if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts.length < 2) return null;
            return { owner: parts[0], repo: parts[1] };
        } catch {
            return null;
        }
    }

    _extractReplacementHint(text) {
        if (!text || typeof text !== 'string') return null;
        // Common patterns: "Use X instead", "please upgrade to X",
        // "moved to X". Keep it conservative — a noisy replacement field is
        // worse than no replacement.
        const patterns = [
            /(?:use|migrate to|switch to|please upgrade to|moved to)\s+([@\w./-]+)/i,
            /superseded by\s+([@\w./-]+)/i
        ];
        for (const re of patterns) {
            const m = text.match(re);
            if (m && m[1]) return m[1];
        }
        return null;
    }

    /**
     * Phase 5 — composite "Maintainer signal" computation. Combines the
     * official lifecycle status (this service's own output), repo metadata
     * (Phase 5.2), and textual heuristics (Phase 5.1) into a single
     * `{ level, factors[] }` object documented in the plan.
     *
     * Levels:
     *   - 'critical' = archived repo + active CVEs
     *   - 'risk'     = "looking for contributors" plus stale releases > 18 mo
     *                  OR archived OR last commit > 12 mo OR open-issue
     *                  backlog > 100 with low close rate
     *   - 'watch'    = last release > 24 mo + no recent commits
     *   - 'healthy'  = otherwise (including a bare "looking for contributors"
     *                  as community growth)
     *
     * Repo metadata fields expected (when present):
     *   { stargazerCount, openIssues, latestReleaseAt, lastCommitAt, mentionableUsers }
     */
    computeMaintainerSignal(dep, repoMeta = {}, heuristicSignals = []) {
        const factors = [];
        const lifecycle = (dep && dep.lifecycle) || null;
        const hasActiveCves = !!(dep && dep.vulnerabilityCount && dep.vulnerabilityCount > 0);
        const isArchived = lifecycle && lifecycle.status === 'archived';
        const isYanked = lifecycle && lifecycle.status === 'yanked';
        const isDeprecated = lifecycle && lifecycle.status === 'deprecated';

        // Helper: parse an ISO date and return age in months (rough; 30 day months).
        const ageMonths = (iso) => {
            if (!iso) return null;
            const t = Date.parse(iso);
            if (isNaN(t)) return null;
            return (Date.now() - t) / (1000 * 60 * 60 * 24 * 30);
        };

        const releaseAgeMo = ageMonths(repoMeta.latestReleaseAt);
        const commitAgeMo = ageMonths(repoMeta.lastCommitAt);
        const openIssues = typeof repoMeta.openIssues === 'number' ? repoMeta.openIssues : null;
        const closedRatio = (typeof repoMeta.closedIssues === 'number' && openIssues != null && (openIssues + repoMeta.closedIssues) > 0)
            ? repoMeta.closedIssues / (openIssues + repoMeta.closedIssues)
            : null;

        const lookingForContributors = Array.isArray(heuristicSignals)
            && heuristicSignals.some(s => /looking for (contributors|maintainer)/i.test(s.phrase || ''));

        if (lookingForContributors) factors.push({ key: 'looking-for-contributors' });
        if (isArchived) factors.push({ key: 'archived' });
        if (isYanked) factors.push({ key: 'yanked' });
        if (isDeprecated) factors.push({ key: 'deprecated' });
        if (releaseAgeMo != null) factors.push({ key: 'release-age-months', value: Math.round(releaseAgeMo) });
        if (commitAgeMo != null) factors.push({ key: 'commit-age-months', value: Math.round(commitAgeMo) });
        if (openIssues != null) factors.push({ key: 'open-issues', value: openIssues });
        if (hasActiveCves) factors.push({ key: 'active-cves' });

        // Critical: archived + active CVEs.
        if (isArchived && hasActiveCves) {
            return { level: 'critical', factors };
        }
        // Risk: looking-for-contributors plus structural staleness.
        const looksAtRisk = lookingForContributors && (
            isArchived
            || (releaseAgeMo != null && releaseAgeMo > 18)
            || (commitAgeMo != null && commitAgeMo > 12)
            || (openIssues != null && openIssues > 100 && closedRatio != null && closedRatio < 0.3)
        );
        if (looksAtRisk) return { level: 'risk', factors };
        // Watch: last release > 24 months and no recent commits.
        if (releaseAgeMo != null && releaseAgeMo > 24
            && commitAgeMo != null && commitAgeMo > 12) {
            return { level: 'watch', factors };
        }
        return { level: 'healthy', factors };
    }
}

if (typeof window !== 'undefined') {
    window.PackageLifecycleService = PackageLifecycleService;
    if (!window.packageLifecycleService) window.packageLifecycleService = new PackageLifecycleService();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PackageLifecycleService;
}
