/**
 * Feed URL Builder - Resolves an RSS/Atom feed URL for a dependency.
 *
 * Each dependency object passed in is assumed to be the shape produced by
 * `processData()` in deps-page.js, i.e.:
 *   {
 *     name, version, ecosystem, repositories,
 *     raw: {
 *       originalPackage: { externalRefs: [...], ... },
 *       ...
 *     },
 *     type: 'direct' | 'transitive',
 *     ...
 *   }
 *
 * Resolution strategy (per ecosystem):
 *  1. Native registry feed when one exists (PyPI, RubyGems, Packagist).
 *  2. GitHub Releases atom feed when we can identify a GitHub source repo
 *     (via SBOM externalRefs, package-name heuristics, or cached package
 *     metadata).
 *  3. GitHub Tags atom feed as a softer fallback for GitHub repos that do
 *     not publish Releases (caller can request this; default chain only
 *     yields it when we have evidence).
 *  4. Otherwise: no feed (status = "uncovered").
 *
 * Returned shape:
 *   {
 *     status: 'native' | 'github-releases' | 'github-tags' | 'uncovered',
 *     url:    string|null,
 *     htmlUrl: string|null,    // browser-facing project page (for OPML htmlUrl)
 *     title:  string,          // package name as resolved
 *     ecosystem: string,       // canonical ecosystem name
 *     reason: string|null      // why uncovered, when status === 'uncovered'
 *   }
 */
console.log('📡 Feed URL Builder loaded');

class FeedUrlBuilder {
    constructor() {
        // Lower-case ecosystem aliases -> canonical key used by the resolver switch.
        this.ecosystemAliasMap = {
            'pypi': 'pypi',
            'python': 'pypi',
            'npm': 'npm',
            'nodejs': 'npm',
            'rubygems': 'rubygems',
            'gem': 'rubygems',
            'composer': 'composer',
            'packagist': 'composer',
            'php': 'composer',
            'maven': 'maven',
            'java': 'maven',
            'cargo': 'cargo',
            'rust': 'cargo',
            'crates.io': 'cargo',
            'nuget': 'nuget',
            'dotnet': 'nuget',
            'go': 'go',
            'golang': 'go',
            'github actions': 'githubactions',
            'githubactions': 'githubactions',
            'github': 'githubactions',
            'hex': 'hex',
            'pub': 'pub',
            'cocoapods': 'cocoapods'
        };
    }

    /**
     * Resolve a feed for one dependency.
     * @param {Object} dep - Dependency object (deps-page processed shape).
     * @returns {Object} Result object (see file header).
     */
    resolveFeed(dep) {
        if (!dep || !dep.name) {
            return this._uncovered(dep, 'Missing dependency name');
        }

        const ecosystem = this._normalizeEcosystem(dep.ecosystem);
        const packageName = dep.name;

        switch (ecosystem) {
            case 'pypi':
                return this._buildPyPi(packageName, dep);
            case 'rubygems':
                return this._buildRubyGems(packageName, dep);
            case 'composer':
                return this._buildPackagist(packageName, dep);
            case 'githubactions':
                return this._buildGitHubAction(packageName, dep);
            case 'go':
                return this._buildGo(packageName, dep);
            case 'npm':
            case 'maven':
            case 'cargo':
            case 'nuget':
            case 'hex':
            case 'pub':
            case 'cocoapods':
                return this._buildGenericGithubFallback(packageName, dep, ecosystem);
            default:
                return this._buildGenericGithubFallback(packageName, dep, ecosystem);
        }
    }

    /**
     * Hydrate `dep.repositoryUrl` / `dep.homepage` from the persistent package
     * cache (`cacheManager` / IndexedDB `packages` store). The author-fetch
     * pipeline writes `repository_url` / `homepage` onto the package row for
     * every package it touches (including ecosystems with no native registry
     * fetch like Maven / NuGet / Go), so reading them here lets us cover deps
     * whose stored analysis predates the LicenseFetcher dep-mutation pass — or
     * deps where license fetching was skipped entirely (e.g. an SBOM that
     * already carried full SPDX licenses but no source-control externalRef).
     *
     * Mutates `deps` in place: for every dep whose `repositoryUrl` is empty
     * we copy it from the cache row matching `${ecosystem}:${name}` (the same
     * key shape AuthorService.fetchAuthors stores under). `homepage` and
     * `issueTrackerUrl` are populated symmetrically.
     *
     * Safe to call when no cache exists (returns silently); idempotent across
     * repeated calls; never overwrites a value the dep already carries.
     *
     * @param {Array<Object>} deps - Canonical dep objects (deps-page shape).
     * @returns {Promise<{hydrated: number, scanned: number}>}
     */
    async hydrateFromCache(deps) {
        const stats = { hydrated: 0, scanned: 0 };
        if (!Array.isArray(deps) || deps.length === 0) return stats;

        const dbManager = (typeof window !== 'undefined') ? window.indexedDBManager : null;
        if (!dbManager || typeof dbManager.getAllPackages !== 'function') {
            return stats;
        }

        let allPackages;
        try {
            allPackages = await dbManager.getAllPackages();
        } catch (e) {
            console.warn('FeedUrlBuilder.hydrateFromCache: failed to read packages cache:', e?.message || e);
            return stats;
        }
        if (!Array.isArray(allPackages) || allPackages.length === 0) return stats;

        const byKey = new Map();
        for (const pkg of allPackages) {
            if (pkg && pkg.packageKey) {
                byKey.set(pkg.packageKey, pkg);
            }
        }
        if (byKey.size === 0) return stats;

        for (const dep of deps) {
            if (!dep || !dep.name) continue;
            stats.scanned++;
            const ecosystem = (dep.ecosystem || dep.raw?.category?.ecosystem || '').toString().toLowerCase();
            if (!ecosystem) continue;
            const cached = byKey.get(`${ecosystem}:${dep.name}`);
            if (!cached) continue;
            let didHydrate = false;
            if (!dep.repositoryUrl && cached.repositoryUrl) {
                dep.repositoryUrl = cached.repositoryUrl;
                didHydrate = true;
            }
            if (!dep.homepage && cached.homepage) {
                dep.homepage = cached.homepage;
                didHydrate = true;
            }
            if (!dep.issueTrackerUrl && cached.issueTrackerUrl) {
                dep.issueTrackerUrl = cached.issueTrackerUrl;
                didHydrate = true;
            }
            if (didHydrate) stats.hydrated++;
        }

        if (stats.hydrated > 0) {
            console.log(`📡 FeedUrlBuilder.hydrateFromCache: filled repository URLs on ${stats.hydrated} of ${stats.scanned} deps from package cache`);
        }
        return stats;
    }

    /**
     * Resolve feeds for many deps and roll up coverage stats.
     * @param {Array<Object>} deps
     * @returns {{ entries: Array<Object>, stats: Object }}
     */
    resolveAll(deps) {
        const entries = [];
        const stats = {
            total: 0,
            native: 0,
            githubReleases: 0,
            githubTags: 0,
            uncovered: 0,
            covered: 0,
            direct: 0,
            transitive: 0,
            directCovered: 0,
            transitiveCovered: 0
        };

        if (!Array.isArray(deps)) {
            return { entries, stats };
        }

        for (const dep of deps) {
            const result = this.resolveFeed(dep);
            const entry = { dep, feed: result };
            entries.push(entry);

            stats.total++;
            const isDirect = (dep.type === 'direct') ||
                (Array.isArray(dep.directIn) && dep.directIn.length > 0);
            if (isDirect) {
                stats.direct++;
            } else {
                stats.transitive++;
            }

            switch (result.status) {
                case 'native':
                    stats.native++; stats.covered++;
                    if (isDirect) stats.directCovered++; else stats.transitiveCovered++;
                    break;
                case 'github-releases':
                    stats.githubReleases++; stats.covered++;
                    if (isDirect) stats.directCovered++; else stats.transitiveCovered++;
                    break;
                case 'github-tags':
                    stats.githubTags++; stats.covered++;
                    if (isDirect) stats.directCovered++; else stats.transitiveCovered++;
                    break;
                default:
                    stats.uncovered++;
                    break;
            }
        }

        return { entries, stats };
    }

    // ------------------------------------------------------------------
    // Per-ecosystem resolvers
    // ------------------------------------------------------------------

    _buildPyPi(packageName, dep) {
        const safeName = encodeURIComponent(packageName);
        return {
            status: 'native',
            url: `https://pypi.org/rss/project/${safeName}/releases.xml`,
            htmlUrl: `https://pypi.org/project/${safeName}/`,
            title: packageName,
            ecosystem: 'PyPI',
            reason: null
        };
    }

    _buildRubyGems(packageName, dep) {
        const safeName = encodeURIComponent(packageName);
        return {
            status: 'native',
            url: `https://rubygems.org/gems/${safeName}/versions.atom`,
            htmlUrl: `https://rubygems.org/gems/${safeName}`,
            title: packageName,
            ecosystem: 'RubyGems',
            reason: null
        };
    }

    _buildPackagist(packageName, dep) {
        // Packagist requires a vendor/name format. If we don't have a slash we
        // can't build a native feed reliably; fall back to GitHub.
        if (packageName.includes('/')) {
            const safeName = packageName.split('/').map(encodeURIComponent).join('/');
            return {
                status: 'native',
                url: `https://packagist.org/feeds/package.${safeName}.rss`,
                htmlUrl: `https://packagist.org/packages/${safeName}`,
                title: packageName,
                ecosystem: 'Composer',
                reason: null
            };
        }
        return this._buildGenericGithubFallback(packageName, dep, 'composer');
    }

    _buildGitHubAction(packageName, dep) {
        // Action names look like "owner/repo@ref" or "owner/repo/path@ref".
        const match = String(packageName).match(/^([^\/@]+)\/([^\/@]+)(?:\/.*)?(?:@.*)?$/);
        if (match) {
            const owner = match[1];
            const repo = match[2];
            return {
                status: 'github-releases',
                url: `https://github.com/${owner}/${repo}/releases.atom`,
                htmlUrl: `https://github.com/${owner}/${repo}`,
                title: `${owner}/${repo}`,
                ecosystem: 'GitHub Actions',
                reason: null
            };
        }
        return this._uncovered(dep, 'GitHub Action name did not match owner/repo pattern');
    }

    _buildGo(packageName, dep) {
        // Go modules hosted on GitHub are usable directly.
        if (typeof packageName === 'string' && packageName.startsWith('github.com/')) {
            const parts = packageName.replace('github.com/', '').split('/');
            if (parts.length >= 2 && parts[0] && parts[1]) {
                const owner = parts[0];
                const repo = parts[1];
                return {
                    status: 'github-releases',
                    url: `https://github.com/${owner}/${repo}/releases.atom`,
                    htmlUrl: `https://github.com/${owner}/${repo}`,
                    title: `${owner}/${repo}`,
                    ecosystem: 'Go',
                    reason: null
                };
            }
        }
        // Other Go hosts (golang.org/..., gopkg.in/..., custom domains) — try
        // to extract a GitHub repo from SBOM externalRefs first; otherwise
        // mark uncovered.
        const githubRepo = this._extractGitHubRepoFromDep(dep);
        if (githubRepo) {
            return this._githubFallbackResult(githubRepo, packageName, 'Go');
        }
        return this._uncovered(dep, 'Go module is not hosted on GitHub and no source repo URL was found');
    }

    /**
     * Generic fallback for ecosystems without a native per-package RSS feed
     * (npm, Maven, NuGet, crates.io, Hex, Pub, CocoaPods, etc.).
     */
    _buildGenericGithubFallback(packageName, dep, ecosystem) {
        const githubRepo = this._extractGitHubRepoFromDep(dep);
        if (githubRepo) {
            return this._githubFallbackResult(githubRepo, packageName, this._displayEcosystemLabel(ecosystem));
        }
        return this._uncovered(
            dep,
            `${this._displayEcosystemLabel(ecosystem)} has no native per-package feed and no GitHub source repo was found in the SBOM`
        );
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    _normalizeEcosystem(value) {
        if (!value) return 'unknown';
        const lower = String(value).toLowerCase().trim();
        if (this.ecosystemAliasMap[lower]) return this.ecosystemAliasMap[lower];
        return lower;
    }

    _displayEcosystemLabel(ecosystem) {
        const map = {
            npm: 'npm',
            pypi: 'PyPI',
            rubygems: 'RubyGems',
            composer: 'Composer',
            maven: 'Maven',
            cargo: 'Cargo',
            nuget: 'NuGet',
            go: 'Go',
            githubactions: 'GitHub Actions',
            hex: 'Hex',
            pub: 'Pub',
            cocoapods: 'CocoaPods',
            unknown: 'Unknown'
        };
        return map[ecosystem] || ecosystem;
    }

    _githubFallbackResult(github, packageName, ecosystemLabel) {
        const { owner, repo } = github;
        return {
            status: 'github-releases',
            url: `https://github.com/${owner}/${repo}/releases.atom`,
            htmlUrl: `https://github.com/${owner}/${repo}`,
            title: packageName,
            ecosystem: ecosystemLabel,
            reason: null
        };
    }

    _uncovered(dep, reason) {
        return {
            status: 'uncovered',
            url: null,
            htmlUrl: null,
            title: dep && dep.name ? dep.name : '',
            ecosystem: dep ? this._displayEcosystemLabel(this._normalizeEcosystem(dep.ecosystem)) : 'Unknown',
            reason: reason || 'No feed available'
        };
    }

    /**
     * Build a synthetic feed entry that points at the OpenSSF Malicious
     * Packages atom feed. Used by the feeds page (and OPML export) when
     * the loaded analysis has at least one malicious-package match, so
     * users get ongoing notifications about new advisories in their RSS
     * reader without us needing per-package malware feeds.
     *
     * @returns {{ dep: Object, feed: Object }}
     */
    buildMalwareAdvisoryEntry() {
        return {
            dep: {
                name: 'OpenSSF Malicious Packages',
                version: 'feed',
                ecosystem: 'Malware',
                type: 'direct',
                directIn: ['SBOM Play'],
                transitiveIn: [],
                repositories: []
            },
            feed: {
                status: 'native',
                url: 'https://github.com/ossf/malicious-packages/commits/main.atom',
                htmlUrl: 'https://github.com/ossf/malicious-packages',
                title: 'OpenSSF Malicious Packages advisories',
                ecosystem: 'Malware',
                reason: null
            }
        };
    }

    /**
     * Try to extract a {owner, repo} pair from a dependency by inspecting
     * the embedded SPDX/CycloneDX externalRefs that the SBOM parser stored.
     * @param {Object} dep
     * @returns {{owner: string, repo: string}|null}
     */
    _extractGitHubRepoFromDep(dep) {
        if (!dep) return null;
        const candidates = [];

        const raw = dep.raw || dep;
        const original = raw && raw.originalPackage;
        if (original && Array.isArray(original.externalRefs)) {
            for (const ref of original.externalRefs) {
                const refType = ref.referenceType;
                const locator = ref.referenceLocator || ref.referenceUrl || '';
                if (!locator) continue;
                if (refType === 'vcs' || refType === 'repository' || refType === 'website' || refType === 'documentation') {
                    candidates.push(locator);
                } else if (refType === 'purl' && typeof locator === 'string') {
                    const matches = locator.match(/https?:\/\/[^\s)]+/gi);
                    if (matches) candidates.push(...matches);
                }
            }
        }

        // Also check explicit known fields some callers populate.
        if (dep.repositoryUrl) candidates.push(dep.repositoryUrl);
        if (raw && raw.repositoryUrl) candidates.push(raw.repositoryUrl);

        for (const candidate of candidates) {
            const parsed = this._parseGitHubRepoFromUrl(candidate);
            if (parsed) return parsed;
        }
        return null;
    }

    _parseGitHubRepoFromUrl(url) {
        if (!url || typeof url !== 'string') return null;
        let cleaned = url.trim().replace(/^git\+/, '').replace(/^ssh:\/\/git@/, 'https://');
        // SCP-style SSH: "git@github.com:owner/repo.git" → "https://github.com/owner/repo.git"
        const scpMatch = cleaned.match(/^git@([^:]+):(.+)$/);
        if (scpMatch) {
            cleaned = `https://${scpMatch[1]}/${scpMatch[2]}`;
        }
        if (cleaned.startsWith('github:')) {
            cleaned = cleaned.replace(/^github:/, 'https://github.com/');
        }
        if (!/^https?:\/\//i.test(cleaned)) {
            cleaned = 'https://' + cleaned;
        }
        try {
            const parsed = new URL(cleaned);
            // Accept github.com and any subdomain like www.github.com
            const host = parsed.hostname.toLowerCase();
            if (host !== 'github.com' && !host.endsWith('.github.com')) return null;
            const segments = parsed.pathname.split('/').filter(Boolean);
            if (segments.length < 2) return null;
            const owner = segments[0];
            let repo = segments[1].replace(/\.git$/, '');
            if (!owner || !repo) return null;
            // Disallow nonsense owners that signify GitHub-internal paths.
            const reservedOwners = new Set(['orgs', 'sponsors', 'features', 'topics', 'collections', 'enterprise', 'about', 'pricing', 'login', 'join', 'marketplace']);
            if (reservedOwners.has(owner.toLowerCase())) return null;
            return { owner, repo };
        } catch (e) {
            return null;
        }
    }
}

window.FeedUrlBuilder = FeedUrlBuilder;
window.feedUrlBuilder = new FeedUrlBuilder();
