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
     * @returns {Promise<Object>} - {hasMajorUpdate: bool, hasMinorUpdate: bool, latestVersion: string, checkedAt: timestamp}
     */
    async checkVersionDrift(packageName, currentVersion, ecosystem) {
        if (!packageName || !currentVersion || !ecosystem) {
            return {
                hasMajorUpdate: false,
                hasMinorUpdate: false,
                latestVersion: null,
                checkedAt: Date.now()
            };
        }

        const cacheKey = `drift:${ecosystem}:${packageName}:${currentVersion}`;
        
        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.checkedAt) < this.cacheExpiry) {
            return cached;
        }

        try {
            const latestVersion = await this.fetchLatestVersion(packageName, ecosystem);
            
            if (!latestVersion) {
                return {
                    hasMajorUpdate: false,
                    hasMinorUpdate: false,
                    latestVersion: null,
                    checkedAt: Date.now()
                };
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

            // Cache the result
            this.cache.set(cacheKey, result);
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

        const cacheKey = `stale:${ecosystem}:${packageName}:${currentVersion}`;
        
        // Check cache first (7 days expiry for staleness)
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
                    monthsSinceRelease: 0
                };
                this.cache.set(cacheKey, { staleness: result, stalenessCheckedAt: Date.now() });
                return result;
            }

            // Get publish date for current version
            const publishDate = await this.fetchVersionPublishDate(packageName, currentVersion, ecosystem);
            
            if (!publishDate) {
                return {
                    isStale: false,
                    lastReleaseDate: null,
                    monthsSinceRelease: 0
                };
            }

            const monthsSinceRelease = this.calculateMonthsSince(publishDate);
            const isStale = monthsSinceRelease >= 6;

            const result = {
                isStale: isStale,
                lastReleaseDate: publishDate,
                monthsSinceRelease: monthsSinceRelease
            };

            // Cache the result
            this.cache.set(cacheKey, { staleness: result, stalenessCheckedAt: Date.now() });
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
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.VersionDriftAnalyzer = VersionDriftAnalyzer;
    window.versionDriftAnalyzer = new VersionDriftAnalyzer();
}

