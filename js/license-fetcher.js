/**
 * License Fetcher - Shared module for fetching licenses from external APIs
 * Used by both app.js and upload-page.js
 * Note: Author fetching is handled by AuthorService (author-service.js)
 */
console.log('📄 License Fetcher loaded');

class LicenseFetcher {
    constructor() {
        // Map ecosystem names to deps.dev system names
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
            'gem': 'rubygems',
            'composer': 'npm', // Packagist uses npm-like API
            'packagist': 'npm'
        };
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
     * Fetch license for a single package from deps.dev API.
     * Also captures repository / homepage links from the same response so callers
     * (feed-url-builder, dead-source-repo validation) can reuse them without a
     * second registry GET. Falls back to GitHub API for Go packages on github.com.
     * @param {Object} dep - Dependency object
     * @returns {Promise<boolean>} - True if license was fetched successfully
     */
    async fetchLicenseForPackage(dep) {
        try {
            const ecosystem = (dep.category?.ecosystem || dep.ecosystem || '').toLowerCase();
            const system = this.ecosystemMap[ecosystem];

            if (!system) {
                return false; // Unsupported ecosystem
            }

            const url = `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodeURIComponent(dep.name)}/versions/${encodeURIComponent(dep.version)}`;

            const response = await fetch(url);
            let licenseFetched = false;
            if (response.ok) {
                const data = await response.json();
                this._applyDepsDevLinks(dep, data.links);

                if (data.licenses && data.licenses.length > 0) {
                    const licenseIds = data.licenses.map(l => l.license || l).filter(Boolean);
                    const licenseStr = licenseIds.join(' AND ');

                    dep.license = licenseStr;
                    dep.licenseFull = licenseStr;
                    dep.licenseAugmented = true;
                    dep.licenseSource = 'deps.dev';

                    licenseFetched = true;
                }
            }

            if (licenseFetched) {
                return true;
            }

            // Fallback: For Go packages hosted on github.com, try GitHub API
            // deps.dev may not have license info for older versions
            if ((system === 'go') && dep.name.startsWith('github.com/')) {
                const githubLicense = await this.fetchLicenseFromGitHub(dep.name);
                if (githubLicense) {
                    dep.license = githubLicense;
                    dep.licenseFull = githubLicense;
                    dep.licenseAugmented = true;
                    dep.licenseSource = 'github';
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
                processorDep._licenseSource = dep.licenseSource;
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
