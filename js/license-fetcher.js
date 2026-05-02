/**
 * License Fetcher - Shared module for fetching licenses from external APIs
 * Used by both app.js and upload-page.js
 * Note: Author fetching is handled by AuthorService (author-service.js)
 */
console.log('📄 License Fetcher loaded');

class LicenseFetcher {
    constructor() {
        // Map ecosystem names to deps.dev system names.
        //
        // Composer / Packagist is intentionally absent: deps.dev does NOT serve
        // Packagist (`/v3alpha/systems/packagist/...` and the previous mistaken
        // `npm` fallback both 404). Including them just wastes one 404 per
        // Composer package on every analysis. License + repo URL for Composer
        // come from `AuthorService.fetchFromEcosystems` (ecosyste.ms covers
        // packagist.org natively).
        this.ecosystemMap = {
            'go': 'go',
            'golang': 'go',
            'npm': 'npm',
            'nodejs': 'npm',
            'pypi': 'pypi',
            'python': 'pypi',
            'maven': 'maven',
            'java': 'maven',
            'cargo': 'cargo',
            'rust': 'cargo',
            'nuget': 'nuget',
            'dotnet': 'nuget',
            'rubygems': 'rubygems',
            'gem': 'rubygems'
        };
    }

    /**
     * Clean an SBOM-supplied version string into something a registry API will
     * accept. SBOMs from `pip freeze`-style tooling sometimes carry range
     * specifiers (`1.0.108,< 2.0.0`) or whitespace-padded ranges (`3.5,< 4.0`)
     * in the version field; deps.dev rejects those and returns 404. Pick the
     * lower-bound version (everything before the first `,` or space) so the
     * fetch has a chance.
     */
    _cleanVersion(version) {
        if (!version) return version;
        let cleaned = String(version).trim();
        if (cleaned.includes(',')) cleaned = cleaned.split(',')[0].trim();
        if (cleaned.includes(' ')) cleaned = cleaned.split(' ')[0].trim();
        return cleaned;
    }

    /**
     * Build the deps.dev URL-segment version for a given system. Go module
     * versions in deps.dev are required to carry the `v` prefix (`v1.2.3`),
     * even when the SBOM ships them without it. Other systems use the version
     * verbatim.
     */
    _depsDevVersion(system, version) {
        if (system === 'go' && version && !version.startsWith('v')) {
            return `v${version}`;
        }
        return version;
    }

    /**
     * Format an SPDX license string for compact display (`license` field) while
     * keeping the full string in `licenseFull`. Mirrors the legacy formatting
     * in `app.js::fetchLicensesForAllEcosystems` so the licenses page / table
     * cells render the same after this consolidation:
     *   - `Apache-2.0`        → display `Apache`
     *   - `MIT AND Apache-2.0`→ display `MIT` (first ID, truncated if needed)
     *   - any single ID > 8 ch → first 8 chars + `...`
     *   - shorter / non-Apache single IDs → unchanged
     */
    _formatLicenseDisplay(licenseFull) {
        if (!licenseFull) return licenseFull;
        if (licenseFull.includes(' AND ')) {
            const first = licenseFull.split(' AND ')[0];
            if (first.startsWith('Apache')) return 'Apache';
            return first.length > 8 ? `${first.substring(0, 8)}...` : first;
        }
        if (licenseFull.startsWith('Apache')) return 'Apache';
        return licenseFull.length > 8 ? `${licenseFull.substring(0, 8)}...` : licenseFull;
    }

    /**
     * Fetch licenses + deps.dev source-repo links for all dependencies that are
     * missing EITHER a license OR a repository URL. The single deps.dev GET
     * carries both the license SPDX ID and a labeled `links[]` array with
     * `SOURCE_REPO` / `HOMEPAGE` / `ISSUE_TRACKER`, so we make the call whenever
     * either piece of metadata is incomplete — this completes Maven / NuGet / Go
     * packages that often arrive in SBOMs with a license but no repository URL.
     *
     * @param {Array} dependencies - Array of dependency objects
     * @param {Function} onProgress - Optional progress callback (current, total, message)
     * @returns {Promise<{fetched: number, total: number}>} - `fetched` counts licenses fetched (kept stable for callers); `total` is the number of deps actually queried
     */
    async fetchLicenses(dependencies, onProgress = null) {
        if (!dependencies || dependencies.length === 0) {
            return { fetched: 0, total: 0 };
        }

        const depsNeedingFetch = dependencies.filter(dep => {
            const hasLicense = dep.license &&
                dep.license !== 'Unknown' &&
                dep.license !== 'NOASSERTION' &&
                String(dep.license).trim() !== '';
            const hasRepoUrl = !!(dep.repositoryUrl && String(dep.repositoryUrl).trim() !== '');
            const hasVersion = dep.version && dep.version !== 'unknown';
            return dep.name && hasVersion && (!hasLicense || !hasRepoUrl);
        });

        if (depsNeedingFetch.length === 0) {
            console.log('ℹ️ All dependencies already have license + repository URL');
            return { fetched: 0, total: 0 };
        }

        console.log(`📄 Fetching licenses + source-repo links for ${depsNeedingFetch.length} packages from deps.dev...`);

        const batchSize = 10;
        let fetched = 0;
        const total = depsNeedingFetch.length;

        for (let i = 0; i < depsNeedingFetch.length; i += batchSize) {
            const batch = depsNeedingFetch.slice(i, i + batchSize);

            await Promise.all(batch.map(async (dep) => {
                const result = await this.fetchLicenseForPackage(dep);
                if (result) {
                    fetched++;
                }
            }));

            if (onProgress) {
                const processed = Math.min(i + batchSize, total);
                onProgress(processed, total, `Fetched ${fetched} licenses...`);
            }

            if (i + batchSize < depsNeedingFetch.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`✅ License fetching complete: ${fetched}/${total} licenses fetched (source-repo links applied opportunistically across all ${total} queried packages)`);
        return { fetched, total };
    }

    /**
     * Fetch license + source-repo metadata for a single package via deps.dev,
     * with two scoped fallbacks for the cases deps.dev itself can't answer.
     *
     * One single deps.dev GET returns BOTH the license SPDX list AND the
     * labeled `links[]` array (`SOURCE_REPO` / `HOMEPAGE` / `ISSUE_TRACKER`),
     * so we extract every useful field from that one response — never issue a
     * second deps.dev call to harvest the other piece. Per the AGENTS.md /
     * "make each API call once" rule.
     *
     * Fallbacks (only when the dep is still missing a license after deps.dev):
     *   - PyPI: query `pypi.org/pypi/{name}/json` for `license_expression`
     *     (PEP 639), then `info.license`, then `classifiers[]`. This covers
     *     the long tail of PyPI packages whose licenses deps.dev doesn't index.
     *   - Go on `github.com/...`: query `api.github.com/repos/{owner}/{repo}`
     *     for the SPDX ID. Covers older Go module versions deps.dev hasn't
     *     scanned yet.
     *
     * Both fallbacks fire only when the cheap deps.dev call left the dep
     * without a license — they're "free" from the duplication-budget POV
     * because deps.dev didn't return useful license data.
     *
     * @param {Object} dep - Dependency object (mutated in place)
     * @returns {Promise<boolean>} - True if a license was successfully captured
     */
    async fetchLicenseForPackage(dep) {
        try {
            const ecosystem = (dep.category?.ecosystem || dep.ecosystem || '').toLowerCase();
            const system = this.ecosystemMap[ecosystem];

            if (!system) {
                return false; // Unsupported ecosystem (deps.dev would 404)
            }

            const cleanVersion = this._cleanVersion(dep.version);
            if (!cleanVersion || cleanVersion === 'unknown') {
                return false;
            }
            const depsDevVersion = this._depsDevVersion(system, cleanVersion);

            const url = `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodeURIComponent(dep.name)}/versions/${encodeURIComponent(depsDevVersion)}`;
            if (typeof debugLogUrl === 'function') {
                debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
                debugLogUrl(`   Reason: deps.dev metadata for ${system} ${dep.name}@${depsDevVersion} (license + SOURCE_REPO/HOMEPAGE/ISSUE_TRACKER links in one call)`);
            }

            const response = await (typeof fetchWithTimeout === 'function' ? fetchWithTimeout(url) : fetch(url));
            let licenseFetched = false;
            if (response.ok) {
                const data = await response.json();
                this._applyDepsDevLinks(dep, data.links);

                // Filter the deps.dev license list before joining: deps.dev
                // sometimes emits sentinel values (`non-standard`, `NOASSERTION`,
                // `UNKNOWN`) that aren't real SPDX IDs and shouldn't be
                // displayed as if they were.
                if (Array.isArray(data.licenses) && data.licenses.length > 0) {
                    const licenseIds = data.licenses
                        .map(l => (typeof l === 'string' ? l : l?.license))
                        .filter(l => l && l !== 'non-standard' && l !== 'NOASSERTION' && l !== 'UNKNOWN');

                    if (licenseIds.length > 0) {
                        const licenseStr = licenseIds.join(' AND ');
                        this._applyLicenseToDep(dep, licenseStr, 'deps.dev');
                        licenseFetched = true;
                    }
                }
            }

            if (licenseFetched) {
                return true;
            }

            // PyPI fallback: PEP 639 `license_expression`, then `info.license`,
            // then `classifiers[]`. Single GET, all three extracted in one shot.
            if (system === 'pypi') {
                const pypiLicense = await this._fetchPyPIFallbackLicense(dep.name);
                if (pypiLicense) {
                    this._applyLicenseToDep(dep, pypiLicense, 'pypi');
                    return true;
                }
            }

            // Go on github.com fallback (older versions deps.dev hasn't indexed)
            if (system === 'go' && dep.name.startsWith('github.com/')) {
                const githubLicense = await this.fetchLicenseFromGitHub(dep.name);
                if (githubLicense) {
                    this._applyLicenseToDep(dep, githubLicense, 'github');
                    return true;
                }
            }

            return false;
        } catch (e) {
            console.debug(`Failed to fetch license for ${dep.name}:`, e.message);
            return false;
        }
    }

    /**
     * PyPI JSON API fallback for license-only lookups. Hits
     * `pypi.org/pypi/{name}/json` once and walks the three license sources
     * PyPI exposes, in priority order:
     *   1. `info.license_expression` (PEP 639 — modern, SPDX-compliant)
     *   2. `info.license` (legacy free-text — try to canonicalize to SPDX
     *      when the text is long, otherwise pass through)
     *   3. `info.classifiers[]` Trove classifiers (`License :: OSI Approved ::
     *      MIT License` → `MIT`)
     *
     * Only invoked when deps.dev didn't return a usable license, so this is
     * not duplicating an earlier PyPI call from this module — and the
     * AuthorService PyPI native-registry fetch hits the SAME URL but only
     * extracts authors / repo / funding (not license), so we can still do
     * better here by extracting license from the same response when possible.
     * (TODO across services: have AuthorService.fetchFromNativeRegistry write
     * the license into the package cache too, then read from cache here.)
     *
     * @param {string} packageName
     * @returns {Promise<string|null>} canonical / SPDX-ish license or null
     */
    async _fetchPyPIFallbackLicense(packageName) {
        try {
            const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
            const response = await (typeof fetchWithTimeout === 'function' ? fetchWithTimeout(url) : fetch(url));
            if (!response.ok) return null;
            const data = await response.json();
            const info = data?.info;
            if (!info) return null;

            if (info.license_expression && String(info.license_expression).trim()) {
                return String(info.license_expression).trim();
            }

            if (info.license && String(info.license).trim() && info.license !== 'UNKNOWN') {
                const text = String(info.license).trim();
                if (text.length > 100) {
                    const lower = text.toLowerCase();
                    if (lower.includes('bsd') && lower.includes('3-clause')) return 'BSD-3-Clause';
                    if (lower.includes('bsd') && lower.includes('2-clause')) return 'BSD-2-Clause';
                    if (lower.includes('mit license')) return 'MIT';
                    if (lower.includes('apache license')) return 'Apache-2.0';
                    return `${text.substring(0, 50).trim()}...`;
                }
                return text;
            }

            if (Array.isArray(info.classifiers)) {
                const licenseClassifiers = info.classifiers.filter(c =>
                    typeof c === 'string' &&
                    c.startsWith('License ::') &&
                    !c.includes('DFSG approved') &&
                    !c.includes('Free For Home Use')
                );
                if (licenseClassifiers.length > 0) {
                    const match = licenseClassifiers[0].match(/License :: (?:OSI Approved :: )?(.+?)(?: License)?$/);
                    if (match) {
                        let label = match[1].trim();
                        if (label === 'Apache Software License' || label === 'Apache Software') return 'Apache-2.0';
                        if (label === 'BSD License' || label === 'BSD') return 'BSD-3-Clause';
                        if (label === 'MIT License' || label === 'MIT') return 'MIT';
                        if (label.includes('GPL') && !label.includes('-')) {
                            label = label.replace(' ', '-');
                        }
                        return label;
                    }
                }
            }

            return null;
        } catch (e) {
            console.debug(`PyPI fallback license fetch failed for ${packageName}:`, e?.message || e);
            return null;
        }
    }

    /**
     * Write a fetched license onto a dependency, preserving the persistence
     * paths the deleted legacy fetchers (`fetchPyPILicenses`, `fetchGoLicenses`,
     * `fetchLicensesForAllEcosystems`) used:
     *   - `dep.license` / `dep.licenseFull` for direct UI consumption.
     *   - `dep._licenseEnriched = true` — read by `js/deps-page.js` to show the
     *     green "✓ enriched" badge on the deps table.
     *   - `dep.licenseAugmented = true` / `dep.licenseSource` — read by
     *     `syncToProcessor` to mirror fields onto `sbomProcessor.dependencies`.
     *   - `dep.originalPackage.licenseConcluded` / `licenseDeclared` —
     *     `js/sbom-processor.js::exportData` reads these as a fallback when
     *     the live `dep.license` is missing on a re-export, so writing them
     *     here keeps licenses durable across analysis save/load cycles.
     */
    _applyLicenseToDep(dep, licenseFull, source) {
        if (!dep || !licenseFull) return;
        dep.license = this._formatLicenseDisplay(licenseFull);
        dep.licenseFull = licenseFull;
        dep.licenseAugmented = true;
        dep._licenseEnriched = true;
        dep.licenseSource = source;
        if (dep.originalPackage) {
            dep.originalPackage.licenseConcluded = licenseFull;
            dep.originalPackage.licenseDeclared = licenseFull;
        }
    }

    /**
     * deps.dev returns version metadata under `links: [{label, url}, ...]` with
     * stable labels SOURCE_REPO / HOMEPAGE / ISSUE_TRACKER / ORIGIN. We promote
     * the first SOURCE_REPO (or HOMEPAGE as fallback) to dep.repositoryUrl when
     * the dep doesn't already carry one from a higher-priority source (native
     * registry / ecosyste.ms / SBOM externalRefs). HOMEPAGE / ISSUE_TRACKER are
     * stored on the dep as well so downstream consumers (feed-url-builder,
     * findings page, package details modal) can surface them without re-fetching.
     */
    _applyDepsDevLinks(dep, links) {
        if (!Array.isArray(links) || links.length === 0) return;

        const findLink = (label) => {
            const entry = links.find(l => l && l.label === label && l.url);
            return entry ? entry.url : null;
        };

        const sourceRepo = findLink('SOURCE_REPO');
        const homepage = findLink('HOMEPAGE');
        const issueTracker = findLink('ISSUE_TRACKER');

        if (!dep.repositoryUrl && (sourceRepo || homepage)) {
            dep.repositoryUrl = sourceRepo || homepage;
            dep.repositoryUrlSource = 'deps.dev';
        }
        if (!dep.homepage && homepage) {
            dep.homepage = homepage;
        }
        if (!dep.issueTrackerUrl && issueTracker) {
            dep.issueTrackerUrl = issueTracker;
        }
    }

    /**
     * Fetch license from GitHub API for github.com hosted packages
     * @param {string} packageName - Package name like "github.com/owner/repo"
     * @returns {Promise<string|null>} - License SPDX ID or null
     */
    async fetchLicenseFromGitHub(packageName) {
        try {
            // Extract owner/repo from package name
            // Handle: github.com/owner/repo or github.com/owner/repo/subpath
            const parts = packageName.replace('github.com/', '').split('/');
            if (parts.length < 2) {
                return null;
            }
            const owner = parts[0];
            const repo = parts[1];
            
            const url = `https://api.github.com/repos/${owner}/${repo}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                return null;
            }
            
            const data = await response.json();
            if (data.license && (data.license.spdx_id || data.license.key)) {
                // Prefer SPDX ID, fall back to key (uppercase)
                return data.license.spdx_id || data.license.key.toUpperCase();
            }
            
            return null;
        } catch (e) {
            console.debug(`Failed to fetch license from GitHub for ${packageName}:`, e.message);
            return null;
        }
    }

    /**
     * Update sbomProcessor dependencies with fetched licenses + deps.dev links.
     * Call this after fetchLicenses to mirror the augmented data back to the
     * processor's Map so exportData() carries it.
     * @param {Array} dependencies - Array of dependency objects with fetched data
     * @param {Object} sbomProcessor - SBOMProcessor instance
     */
    syncToProcessor(dependencies, sbomProcessor) {
        if (!sbomProcessor || !sbomProcessor.dependencies) {
            return;
        }

        let licensesSynced = 0;
        let reposSynced = 0;
        for (const dep of dependencies) {
            const packageKey = `${dep.name}@${dep.version}`;
            const processorDep = sbomProcessor.dependencies.get(packageKey);
            if (!processorDep) continue;

            if (dep.licenseAugmented && dep.license) {
                processorDep.license = dep.license;
                processorDep.licenseFull = dep.licenseFull;
                processorDep._licenseAugmented = true;
                processorDep._licenseEnriched = true;
                processorDep._licenseSource = dep.licenseSource;
                if (processorDep.originalPackage) {
                    processorDep.originalPackage.licenseConcluded = dep.licenseFull;
                    processorDep.originalPackage.licenseDeclared = dep.licenseFull;
                }
                licensesSynced++;
            }

            // Mirror the deps.dev-discovered repo/homepage/issue tracker fields too,
            // so feed-url-builder.js and the dead-source-repo validation see them
            // even when the dep object passed to fetchLicenses isn't the same
            // reference as the one in the processor's Map.
            if (dep.repositoryUrl && !processorDep.repositoryUrl) {
                processorDep.repositoryUrl = dep.repositoryUrl;
                if (dep.repositoryUrlSource) {
                    processorDep.repositoryUrlSource = dep.repositoryUrlSource;
                }
                reposSynced++;
            }
            if (dep.homepage && !processorDep.homepage) {
                processorDep.homepage = dep.homepage;
            }
            if (dep.issueTrackerUrl && !processorDep.issueTrackerUrl) {
                processorDep.issueTrackerUrl = dep.issueTrackerUrl;
            }
        }

        if (licensesSynced > 0) {
            console.log(`📄 Synced ${licensesSynced} licenses to processor`);
        }
        if (reposSynced > 0) {
            console.log(`🔗 Synced ${reposSynced} repository URLs (deps.dev links) to processor`);
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.LicenseFetcher = LicenseFetcher;
    window.licenseFetcher = new LicenseFetcher();
}
