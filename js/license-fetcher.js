/**
 * License Fetcher - Shared module for fetching licenses from external APIs
 * Used by both app.js and upload-page.js
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
     * Fetch licenses for all dependencies that are missing license info
     * @param {Array} dependencies - Array of dependency objects
     * @param {Function} onProgress - Optional progress callback (current, total, message)
     * @returns {Promise<{fetched: number, total: number}>}
     */
    async fetchLicenses(dependencies, onProgress = null) {
        if (!dependencies || dependencies.length === 0) {
            return { fetched: 0, total: 0 };
        }

        // Filter dependencies that need license fetching
        const depsNeedingLicenses = dependencies.filter(dep => {
            const hasLicense = dep.license && 
                dep.license !== 'Unknown' && 
                dep.license !== 'NOASSERTION' &&
                String(dep.license).trim() !== '';
            const hasVersion = dep.version && dep.version !== 'unknown';
            return !hasLicense && dep.name && hasVersion;
        });

        if (depsNeedingLicenses.length === 0) {
            console.log('ℹ️ All dependencies already have licenses');
            return { fetched: 0, total: 0 };
        }

        console.log(`📄 Fetching licenses for ${depsNeedingLicenses.length} packages...`);
        
        // Process in batches
        const batchSize = 10;
        let fetched = 0;
        const total = depsNeedingLicenses.length;

        for (let i = 0; i < depsNeedingLicenses.length; i += batchSize) {
            const batch = depsNeedingLicenses.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (dep) => {
                const result = await this.fetchLicenseForPackage(dep);
                if (result) {
                    fetched++;
                }
            }));

            // Report progress
            if (onProgress) {
                const processed = Math.min(i + batchSize, total);
                onProgress(processed, total, `Fetched ${fetched} licenses...`);
            }

            // Small delay between batches to avoid rate limiting
            if (i + batchSize < depsNeedingLicenses.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`✅ License fetching complete: ${fetched}/${total} licenses fetched from external sources`);
        return { fetched, total };
    }

    /**
     * Fetch license for a single package from deps.dev API
     * Falls back to GitHub API for Go packages hosted on github.com
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

            // Try deps.dev API first
            const url = `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodeURIComponent(dep.name)}/versions/${encodeURIComponent(dep.version)}`;

            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.licenses && data.licenses.length > 0) {
                    const licenseIds = data.licenses.map(l => l.license || l).filter(Boolean);
                    const licenseStr = licenseIds.join(' AND ');
                    
                    // Update the dependency object
                    dep.license = licenseStr;
                    dep.licenseFull = licenseStr;
                    dep.licenseAugmented = true;
                    dep.licenseSource = 'deps.dev';
                    
                    return true;
                }
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
     * Update sbomProcessor dependencies with fetched licenses
     * Call this after fetchLicenses to sync the licenses back to the processor
     * @param {Array} dependencies - Array of dependency objects with fetched licenses
     * @param {Object} sbomProcessor - SBOMProcessor instance
     */
    syncToProcessor(dependencies, sbomProcessor) {
        if (!sbomProcessor || !sbomProcessor.dependencies) {
            return;
        }

        let synced = 0;
        for (const dep of dependencies) {
            if (dep.licenseAugmented && dep.license) {
                const packageKey = `${dep.name}@${dep.version}`;
                const processorDep = sbomProcessor.dependencies.get(packageKey);
                if (processorDep) {
                    processorDep.license = dep.license;
                    processorDep.licenseFull = dep.licenseFull;
                    processorDep._licenseAugmented = true;
                    processorDep._licenseSource = dep.licenseSource;
                    synced++;
                }
            }
        }
        
        if (synced > 0) {
            console.log(`📄 Synced ${synced} licenses to processor`);
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.LicenseFetcher = LicenseFetcher;
    window.licenseFetcher = new LicenseFetcher();
}
