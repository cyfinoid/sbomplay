/**
 * Version Drift Analyzer - Checks for available version updates
 * Detects major and minor version updates for dependencies
 */
class VersionDriftAnalyzer {
    constructor() {
        this.cache = new Map(); // In-memory cache for version checks
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours cache
        this.requestTimeout = 10000; // 10 seconds timeout
        
        // Registry URLs for fetching latest versions
        this.registryUrls = {
            npm: 'https://registry.npmjs.org',
            pypi: 'https://pypi.org/pypi',
            cargo: 'https://crates.io/api/v1/crates',
            rubygems: 'https://rubygems.org/api/v1/gems',
            maven: 'https://search.maven.org/solrsearch/select',
            nuget: 'https://api.nuget.org/v3-flatcontainer'
        };
    }

    /**
     * Check version drift for a package
     * @param {string} packageName - Package name
     * @param {string} currentVersion - Current version
     * @param {string} ecosystem - Ecosystem (npm, pypi, cargo, etc.)
     * @param {boolean} forceRefresh - Force refresh even if cached (default: false)
     * @returns {Promise<Object>} - {hasMajorUpdate: bool, hasMinorUpdate: bool, latestVersion: string, checkedAt: timestamp}
     */
    async checkVersionDrift(packageName, currentVersion, ecosystem, forceRefresh = false) {
        if (!packageName || !currentVersion || !ecosystem) {
            return {
                hasMajorUpdate: false,
                hasMinorUpdate: false,
                latestVersion: null,
                checkedAt: Date.now()
            };
        }

        // Normalize ecosystem for packageKey
        let normalizedEcosystem = ecosystem.toLowerCase();
        if (normalizedEcosystem === 'rubygems' || normalizedEcosystem === 'gem') {
            normalizedEcosystem = 'gem';
        } else if (normalizedEcosystem === 'go' || normalizedEcosystem === 'golang') {
            normalizedEcosystem = 'golang';
        } else if (normalizedEcosystem === 'packagist' || normalizedEcosystem === 'composer') {
            normalizedEcosystem = 'composer';
        }
        
        const packageKey = `${normalizedEcosystem}:${packageName}`;
        const versionDriftKey = `${packageKey}@${currentVersion}`;
        const cacheKey = `drift:${ecosystem}:${packageName}:${currentVersion}`;
        
        // Check persistent cache first (from database)
        if (!forceRefresh && window.cacheManager) {
            try {
                const packageData = await window.cacheManager.getPackage(packageKey);
                if (packageData && packageData.versionDrift && packageData.versionDrift[currentVersion]) {
                    const cachedDrift = packageData.versionDrift[currentVersion];
                    // Check if cache is still valid (24 hours)
                    if (cachedDrift.checkedAt && (Date.now() - cachedDrift.checkedAt) < this.cacheExpiry) {
                        console.log(`📦 Version drift cache hit: ${packageKey}@${currentVersion}`);
                        return cachedDrift;
                    }
                }
            } catch (e) {
                console.debug('Cache check failed, will fetch:', e);
            }
        }
        
        // Check in-memory cache
        const cached = this.cache.get(cacheKey);
        if (!forceRefresh && cached && (Date.now() - cached.checkedAt) < this.cacheExpiry) {
            return cached;
        }

        try {
            const latestVersion = await this.fetchLatestVersion(packageName, ecosystem);
            
            if (!latestVersion) {
                const result = {
                    hasMajorUpdate: false,
                    hasMinorUpdate: false,
                    latestVersion: null,
                    checkedAt: Date.now()
                };
                // Still cache the result (even if null) to avoid repeated failed requests
                this.cache.set(cacheKey, result);
                if (window.cacheManager) {
                    await this.saveVersionDriftToCache(packageKey, currentVersion, result);
                }
                return result;
            }

            // Normalize versions for comparison
            const normalizedCurrent = window.normalizeVersion ? window.normalizeVersion(currentVersion) : currentVersion;
            const normalizedLatest = window.normalizeVersion ? window.normalizeVersion(latestVersion) : latestVersion;

            // Check if versions are the same
            if (normalizedCurrent === normalizedLatest) {
                const result = {
                    hasMajorUpdate: false,
                    hasMinorUpdate: false,
                    latestVersion: latestVersion,
                    checkedAt: Date.now()
                };
                this.cache.set(cacheKey, result);
                if (window.cacheManager) {
                    await this.saveVersionDriftToCache(packageKey, currentVersion, result);
                }
                return result;
            }

            // Check for major/minor updates
            const hasMajor = window.VersionUtils && window.VersionUtils.hasMajorUpdate 
                ? window.VersionUtils.hasMajorUpdate(normalizedCurrent, normalizedLatest)
                : false;
            const hasMinor = window.VersionUtils && window.VersionUtils.hasMinorUpdate
                ? window.VersionUtils.hasMinorUpdate(normalizedCurrent, normalizedLatest)
                : false;

            const result = {
                hasMajorUpdate: hasMajor,
                hasMinorUpdate: hasMinor,
                latestVersion: latestVersion,
                checkedAt: Date.now()
            };

            // Cache the result (both in-memory and persistent)
            this.cache.set(cacheKey, result);
            if (window.cacheManager) {
                await this.saveVersionDriftToCache(packageKey, currentVersion, result);
            }
            return result;

        } catch (error) {
            console.warn(`⚠️ Version drift check failed for ${ecosystem}:${packageName}:`, error);
            return {
                hasMajorUpdate: false,
                hasMinorUpdate: false,
                latestVersion: null,
                checkedAt: Date.now()
            };
        }
    }

    /**
     * Save version drift data to persistent cache
     * @param {string} packageKey - Package key (ecosystem:packageName)
     * @param {string} version - Package version
     * @param {Object} driftData - Version drift data
     */
    async saveVersionDriftToCache(packageKey, version, driftData) {
        if (!window.cacheManager) return;
        
        try {
            // Get existing package data
            const packageData = await window.cacheManager.getPackage(packageKey) || {
                packageKey: packageKey,
                name: packageKey.split(':')[1] || packageKey,
                ecosystem: packageKey.split(':')[0] || 'unknown'
            };
            
            // Initialize versionDrift object if needed
            if (!packageData.versionDrift) {
                packageData.versionDrift = {};
            }
            
            // Store drift data for this version
            packageData.versionDrift[version] = driftData;
            
            // Save updated package data
            await window.cacheManager.savePackage(packageKey, packageData);
            console.log(`💾 Saved version drift for ${packageKey}@${version}`);
        } catch (error) {
            console.warn(`⚠️ Failed to save version drift to cache:`, error);
        }
    }

    /**
     * Get version drift from cache
     * @param {string} packageKey - Package key (ecosystem:packageName)
     * @param {string} version - Package version
     * @returns {Promise<Object|null>} - Cached drift data or null
     */
    async getVersionDriftFromCache(packageKey, version) {
        if (!window.cacheManager) return null;
        
        try {
            const packageData = await window.cacheManager.getPackage(packageKey);
            if (packageData && packageData.versionDrift && packageData.versionDrift[version]) {
                const drift = packageData.versionDrift[version];
                // Check if cache is still valid (24 hours)
                if (drift.checkedAt && (Date.now() - drift.checkedAt) < this.cacheExpiry) {
                    return drift;
                }
            }
            return null;
        } catch (error) {
            console.warn(`⚠️ Failed to get version drift from cache:`, error);
            return null;
        }
    }

    /**
     * Check if a dependency is stale (6+ months old, no newer version)
     * @param {string} packageName - Package name
     * @param {string} currentVersion - Current version
     * @param {string} ecosystem - Ecosystem
     * @returns {Promise<Object>} - {isStale: bool, lastReleaseDate: date, monthsSinceRelease: number}
     */
    async checkStaleness(packageName, currentVersion, ecosystem) {
        if (!packageName || !currentVersion || !ecosystem) {
            return {
                isStale: false,
                lastReleaseDate: null,
                monthsSinceRelease: 0
            };
        }

        // Normalize ecosystem for packageKey
        let normalizedEcosystem = ecosystem.toLowerCase();
        if (normalizedEcosystem === 'rubygems' || normalizedEcosystem === 'gem') {
            normalizedEcosystem = 'gem';
        } else if (normalizedEcosystem === 'go' || normalizedEcosystem === 'golang') {
            normalizedEcosystem = 'golang';
        } else if (normalizedEcosystem === 'packagist' || normalizedEcosystem === 'composer') {
            normalizedEcosystem = 'composer';
        }
        
        const packageKey = `${normalizedEcosystem}:${packageName}`;
        const cacheKey = `stale:${ecosystem}:${packageName}:${currentVersion}`;
        
        // Check persistent cache first (from database)
        if (window.cacheManager) {
            try {
                const packageData = await window.cacheManager.getPackage(packageKey);
                if (packageData && packageData.versionDrift && packageData.versionDrift[currentVersion]) {
                    const drift = packageData.versionDrift[currentVersion];
                    if (drift.staleness && drift.staleness.stalenessCheckedAt) {
                        // Check if staleness cache is still valid (7 days)
                        if ((Date.now() - drift.staleness.stalenessCheckedAt) < (7 * 24 * 60 * 60 * 1000)) {
                            return drift.staleness;
                        }
                    }
                }
            } catch (e) {
                console.debug('Staleness cache check failed, will calculate:', e);
            }
        }
        
        // Check in-memory cache (7 days expiry for staleness)
        const cached = this.cache.get(cacheKey);
        if (cached && cached.stalenessCheckedAt && (Date.now() - cached.stalenessCheckedAt) < (7 * 24 * 60 * 60 * 1000)) {
            return cached.staleness || {
                isStale: false,
                lastReleaseDate: null,
                monthsSinceRelease: 0
            };
        }

        try {
            // First check if there's a newer version
            const drift = await this.checkVersionDrift(packageName, currentVersion, ecosystem);
            
            // If there's a newer version, it's not stale
            if (drift.hasMajorUpdate || drift.hasMinorUpdate || drift.latestVersion !== currentVersion) {
                const result = {
                    isStale: false,
                    lastReleaseDate: null,
                    monthsSinceRelease: 0,
                    stalenessCheckedAt: Date.now()
                };
                this.cache.set(cacheKey, { staleness: result, stalenessCheckedAt: Date.now() });
                // Also save to persistent cache
                if (window.cacheManager) {
                    await this.saveStalenessToCache(packageKey, currentVersion, result);
                }
                return result;
            }

            // Get publish date for current version
            const publishDate = await this.fetchVersionPublishDate(packageName, currentVersion, ecosystem);
            
            if (!publishDate) {
                const result = {
                    isStale: false,
                    lastReleaseDate: null,
                    monthsSinceRelease: 0,
                    stalenessCheckedAt: Date.now()
                };
                this.cache.set(cacheKey, { staleness: result, stalenessCheckedAt: Date.now() });
                return result;
            }

            const monthsSinceRelease = this.calculateMonthsSince(publishDate);
            const isStale = monthsSinceRelease >= 6;

            const result = {
                isStale: isStale,
                lastReleaseDate: publishDate,
                monthsSinceRelease: monthsSinceRelease,
                stalenessCheckedAt: Date.now()
            };

            // Cache the result (both in-memory and persistent)
            this.cache.set(cacheKey, { staleness: result, stalenessCheckedAt: Date.now() });
            if (window.cacheManager) {
                await this.saveStalenessToCache(packageKey, currentVersion, result);
            }
            return result;

        } catch (error) {
            console.warn(`⚠️ Staleness check failed for ${ecosystem}:${packageName}:`, error);
            return {
                isStale: false,
                lastReleaseDate: null,
                monthsSinceRelease: 0
            };
        }
    }

    /**
     * Save staleness data to persistent cache
     * @param {string} packageKey - Package key (ecosystem:packageName)
     * @param {string} version - Package version
     * @param {Object} stalenessData - Staleness data
     */
    async saveStalenessToCache(packageKey, version, stalenessData) {
        if (!window.cacheManager) return;
        
        try {
            // Get existing package data
            const packageData = await window.cacheManager.getPackage(packageKey) || {
                packageKey: packageKey,
                name: packageKey.split(':')[1] || packageKey,
                ecosystem: packageKey.split(':')[0] || 'unknown'
            };
            
            // Initialize versionDrift object if needed
            if (!packageData.versionDrift) {
                packageData.versionDrift = {};
            }
            
            // Initialize drift data for this version if needed
            if (!packageData.versionDrift[version]) {
                packageData.versionDrift[version] = {
                    hasMajorUpdate: false,
                    hasMinorUpdate: false,
                    latestVersion: null,
                    checkedAt: Date.now()
                };
            }
            
            // Store staleness data
            packageData.versionDrift[version].staleness = stalenessData;
            
            // Save updated package data
            await window.cacheManager.savePackage(packageKey, packageData);
            console.log(`💾 Saved staleness for ${packageKey}@${version}`);
        } catch (error) {
            console.warn(`⚠️ Failed to save staleness to cache:`, error);
        }
    }

    /**
     * Fetch publish date for a specific version
     * @param {string} packageName - Package name
     * @param {string} version - Version
     * @param {string} ecosystem - Ecosystem
     * @returns {Promise<string|null>} - ISO date string or null
     */
    async fetchVersionPublishDate(packageName, version, ecosystem) {
        const normalizedEcosystem = ecosystem.toLowerCase();
        
        try {
            switch (normalizedEcosystem) {
                case 'npm':
                    return await this.fetchNpmVersionDate(packageName, version);
                case 'pypi':
                    return await this.fetchPyPiVersionDate(packageName, version);
                case 'cargo':
                    return await this.fetchCargoVersionDate(packageName, version);
                default:
                    return null;
            }
        } catch (error) {
            console.warn(`⚠️ Failed to fetch publish date for ${ecosystem}:${packageName}@${version}:`, error);
            return null;
        }
    }

    /**
     * Calculate months since a date
     */
    calculateMonthsSince(dateString) {
        if (!dateString) return 0;
        const date = new Date(dateString);
        const now = new Date();
        const monthsDiff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
        return monthsDiff;
    }

    /**
     * Fetch publish date from npm registry
     */
    async fetchNpmVersionDate(packageName, version) {
        const url = `${this.registryUrls.npm}/${encodeURIComponent(packageName)}`;
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        // npm stores publish dates in time field: time["1.2.3"]
        return data.time?.[version] || data.time?.[`v${version}`] || null;
    }

    /**
     * Fetch publish date from PyPI
     */
    async fetchPyPiVersionDate(packageName, version) {
        const url = `${this.registryUrls.pypi}/${encodeURIComponent(packageName)}/json`;
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        // PyPI stores upload_time in releases[version][0].upload_time
        const release = data.releases?.[version]?.[0];
        return release?.upload_time || null;
    }

    /**
     * Fetch publish date from crates.io
     */
    async fetchCargoVersionDate(packageName, version) {
        const url = `${this.registryUrls.cargo}/${encodeURIComponent(packageName)}`;
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        // Find the specific version in versions array
        const versionData = data.versions?.find(v => v.num === version);
        return versionData?.created_at || null;
    }

    /**
     * Fetch latest version from registry
     * @param {string} packageName - Package name
     * @param {string} ecosystem - Ecosystem
     * @returns {Promise<string|null>} - Latest version string or null
     */
    async fetchLatestVersion(packageName, ecosystem) {
        const normalizedEcosystem = ecosystem.toLowerCase();
        
        try {
            switch (normalizedEcosystem) {
                case 'npm':
                    return await this.fetchNpmLatestVersion(packageName);
                case 'pypi':
                    return await this.fetchPyPiLatestVersion(packageName);
                case 'cargo':
                    return await this.fetchCargoLatestVersion(packageName);
                case 'rubygems':
                case 'gem':
                    return await this.fetchRubyGemsLatestVersion(packageName);
                default:
                    console.log(`⚠️ Version drift: Unsupported ecosystem ${ecosystem}`);
                    return null;
            }
        } catch (error) {
            console.warn(`⚠️ Failed to fetch latest version for ${ecosystem}:${packageName}:`, error);
            return null;
        }
    }

    /**
     * Fetch latest version from npm registry
     */
    async fetchNpmLatestVersion(packageName) {
        const url = `${this.registryUrls.npm}/${encodeURIComponent(packageName)}`;
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        return data['dist-tags']?.latest || data.version || null;
    }

    /**
     * Fetch latest version from PyPI
     */
    async fetchPyPiLatestVersion(packageName) {
        const url = `${this.registryUrls.pypi}/${encodeURIComponent(packageName)}/json`;
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        return data.info?.version || null;
    }

    /**
     * Fetch latest version from crates.io
     */
    async fetchCargoLatestVersion(packageName) {
        const url = `${this.registryUrls.cargo}/${encodeURIComponent(packageName)}`;
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        return data.crate?.max_version || null;
    }

    /**
     * Fetch latest version from RubyGems
     */
    async fetchRubyGemsLatestVersion(packageName) {
        const url = `${this.registryUrls.rubygems}/${encodeURIComponent(packageName)}.json`;
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        return data.version || null;
    }

    /**
     * Fetch with timeout
     */
    async fetchWithTimeout(url, options = {}, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            // Debug: Log URL call with context
            console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
            const caller = new Error().stack.split('\n')[2]?.trim() || 'unknown';
            if (url.includes('rubygems.org')) {
                console.log(`   Reason: Fetching RubyGems package metadata for latest version information (called from: ${caller})`);
            } else if (url.includes('registry.npmjs.org')) {
                console.log(`   Reason: Fetching npm package metadata for latest version information (called from: ${caller})`);
            } else if (url.includes('pypi.org')) {
                console.log(`   Reason: Fetching PyPI package metadata for latest version information (called from: ${caller})`);
            } else if (url.includes('crates.io')) {
                console.log(`   Reason: Fetching crates.io package metadata for latest version information (called from: ${caller})`);
            } else {
                console.log(`   Reason: Fetching package metadata for version information (called from: ${caller})`);
            }
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            // Debug: Log response and extract information
            if (response.ok) {
                try {
                    const data = await response.clone().json(); // Clone to avoid consuming the stream
                    const version = data.version || data.info?.version || data.crate?.max_version || null;
                    console.log(`   ✅ Response: Status ${response.status}, Extracted: Latest version: ${version || 'unknown'}`);
                } catch (e) {
                    // If JSON parsing fails, just log status
                    console.log(`   ✅ Response: Status ${response.status}`);
                }
            } else {
                console.log(`   ❌ Response: Status ${response.status} ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    /**
     * Refresh version drift data for a package (force refresh from API)
     * Useful for periodic refresh of cached data
     * @param {string} packageName - Package name
     * @param {string} version - Package version
     * @param {string} ecosystem - Ecosystem
     * @returns {Promise<Object>} - Updated version drift data
     */
    async refreshVersionDrift(packageName, version, ecosystem) {
        return await this.checkVersionDrift(packageName, version, ecosystem, true);
    }

    /**
     * Batch refresh version drift for multiple packages
     * @param {Array<{name: string, version: string, ecosystem: string}>} packages - Array of package info
     * @param {Function} onProgress - Progress callback (processed, total)
     * @returns {Promise<void>}
     */
    async refreshVersionDriftBatch(packages, onProgress = null) {
        const total = packages.length;
        let processed = 0;
        
        const batchSize = 10; // Process 10 at a time
        
        for (let i = 0; i < packages.length; i += batchSize) {
            const batch = packages.slice(i, i + batchSize);
            await Promise.all(batch.map(async (pkg) => {
                try {
                    await this.refreshVersionDrift(pkg.name, pkg.version, pkg.ecosystem);
                    processed++;
                    if (onProgress) {
                        onProgress(processed, total);
                    }
                } catch (e) {
                    console.warn(`Failed to refresh version drift for ${pkg.name}@${pkg.version}:`, e);
                }
            }));
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.VersionDriftAnalyzer = VersionDriftAnalyzer;
    window.versionDriftAnalyzer = new VersionDriftAnalyzer();
}

