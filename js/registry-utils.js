/**
 * Registry Manager - Shared utility for managing ecosyste.ms registry mappings
 * Consolidates duplicate registry initialization code from multiple services
 */
class RegistryManager {
    constructor() {
        this.ecosystemsBaseUrl = 'https://packages.ecosyste.ms/api/v1';
        this.registryCache = null;  // Cache for registry mappings (purl -> registry name)
        this.registryList = null;   // Cache for full registry objects array
        this.registryPromise = null;  // Promise for fetching registries
    }

    /**
     * Initialize registries list - fetch once at startup and cache locally
     */
    async initializeRegistries() {
        if (this.registryList) {
            return; // Already initialized
        }

        // If already fetching, wait for that request
        if (this.registryPromise) {
            await this.registryPromise;
            return;
        }

        // Start fetching
        this.registryPromise = (async () => {
            try {
                const url = `${this.ecosystemsBaseUrl}/registries/`;
                debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
                debugLogUrl(`   Reason: Fetching ecosyste.ms registry list to initialize registry mappings`);
                
                const response = await fetchWithTimeout(url);
                if (!response.ok) {
                    console.warn('Failed to fetch registry list from ecosyste.ms');
                    console.log(`   ❌ Response: Status ${response.status} ${response.statusText}`);
                    this.registryList = [];
                    this.registryCache = this.getDefaultMappings();
                    return;
                }

                const registries = await response.json();
                console.log(`   ✅ Response: Status ${response.status}, Extracted: ${registries.length} registry/registries`);
                this.registryList = registries; // Store full registry objects array
                
                // Build mapping from purl_type to registry name for backwards compatibility
                // Prefer registries with default: true when multiple exist for same purl_type
                const mapping = {};
                registries.forEach(registry => {
                    if (!registry.purl_type || !registry.name) {
                        return; // Skip registries with missing required fields
                    }
                    
                    // Registry has purl_type field (e.g., "pypi", "npm", etc.)
                    const purlType = registry.purl_type.toLowerCase();
                    
                    // If we haven't seen this purl_type yet, or if current is default and existing is not
                    if (!mapping[purlType]) {
                        mapping[purlType] = registry.name;
                    } else if (registry.default === true) {
                        // Prefer default registries when multiple exist for same purl_type
                        mapping[purlType] = registry.name;
                    }
                    // Otherwise keep the existing mapping (first non-default or already default)
                });

                console.log('✅ Loaded', registries.length, 'registries from ecosyste.ms');
                this.registryCache = mapping;
            } catch (error) {
                console.warn('Error fetching registry list:', error.message);
                this.registryList = [];
                this.registryCache = this.getDefaultMappings();
            } finally {
                this.registryPromise = null;
            }
        })();

        return this.registryPromise;
    }

    /**
     * Fetch registry mappings from ecosyste.ms (uses cached data)
     * This provides the authoritative list of registry names and their purl types
     */
    async fetchRegistryMappings() {
        // Ensure registries are loaded
        await this.initializeRegistries();
        
        // Return cached mapping
        return this.registryCache || this.getDefaultMappings();
    }
    
    /**
     * Find registry object by purl type
     * Prefers registries with default: true when multiple exist for same purl_type
     */
    findRegistryByPurl(purlType) {
        if (!this.registryList || this.registryList.length === 0) {
            return null;
        }
        
        let normalizedPurl = purlType.toLowerCase();
        
        // Handle aliases: "go" -> "golang" (API uses "golang" as purl_type)
        if (normalizedPurl === 'go') {
            normalizedPurl = 'golang';
        }
        
        // Search through registry list for matching purl_type
        // Prefer registries with default: true when multiple exist for same purl_type
        let foundRegistry = null;
        for (const registry of this.registryList) {
            if (!registry.purl_type || registry.purl_type.toLowerCase() !== normalizedPurl) {
                continue;
            }
            
            // If we haven't found one yet, or this is a default registry, use it
            if (!foundRegistry || registry.default === true) {
                foundRegistry = registry;
                // If we found a default registry, we can stop (there should only be one default per purl_type)
                if (registry.default === true) {
                    break;
                }
            }
        }
        
        return foundRegistry;
    }

    /**
     * Get registry name for an ecosystem, using cached mappings
     */
    async getRegistryName(ecosystem) {
        // Ensure registries are initialized
        await this.initializeRegistries();
        
        let normalizedEcosystem = ecosystem.toLowerCase();
        
        // Handle aliases: "go" -> "golang" (API uses "golang" as purl_type)
        if (normalizedEcosystem === 'go') {
            normalizedEcosystem = 'golang';
        }
        
        return this.registryCache?.[normalizedEcosystem] || null;
    }

    /**
     * Get default mappings as fallback
     * Based on https://packages.ecosyste.ms/api/v1/registries
     * Includes comprehensive mapping for all supported ecosystems
     */
    getDefaultMappings() {
        return {
            // Map purl types to ecosyste.ms registry names
            'npm': 'npmjs.org',
            'pypi': 'pypi.org',
            'cargo': 'crates.io',
            'maven': 'repo1.maven.org',
            'golang': 'proxy.golang.org',
            'go': 'proxy.golang.org',
            'gem': 'rubygems.org',
            'rubygems': 'rubygems.org',
            'nuget': 'nuget.org',
            'composer': 'packagist.org',
            'packagist': 'packagist.org',
            'docker': 'hub.docker.com'
        };
    }

    /**
     * Get the full registry list (for services that need full objects)
     */
    getRegistryList() {
        return this.registryList || [];
    }

    // ========================================
    // Latest Version Fetching (consolidated)
    // ========================================

    /**
     * Fetch latest version for a package in an ecosystem
     * Consolidated from duplicate implementations in dependency-tree-resolver.js and version-drift-analyzer.js
     * @param {string} packageName - Package name
     * @param {string} ecosystem - Ecosystem (npm, pypi, cargo, etc.)
     * @returns {Promise<string|null>} - Latest version string or null
     */
    async fetchLatestVersion(packageName, ecosystem) {
        const normalizedEcosystem = ecosystem.toLowerCase();
        const cacheKey = `latest:${normalizedEcosystem}:${packageName}`;
        
        // Check in-memory cache first
        if (!this._versionCache) {
            this._versionCache = new Map();
        }
        if (this._versionCache.has(cacheKey)) {
            return this._versionCache.get(cacheKey);
        }
        
        try {
            let latestVersion = null;
            
            switch (normalizedEcosystem) {
                case 'npm':
                    latestVersion = await this._fetchNpmLatestVersion(packageName);
                    break;
                case 'pypi':
                    latestVersion = await this._fetchPyPiLatestVersion(packageName);
                    break;
                case 'cargo':
                    latestVersion = await this._fetchCargoLatestVersion(packageName);
                    break;
                case 'rubygems':
                case 'gem':
                    latestVersion = await this._fetchRubyGemsLatestVersion(packageName);
                    break;
                case 'maven':
                    latestVersion = await this._fetchMavenLatestVersion(packageName);
                    break;
                case 'go':
                case 'golang':
                    latestVersion = await this._fetchGoLatestVersion(packageName);
                    break;
                case 'composer':
                case 'packagist':
                    latestVersion = await this._fetchComposerLatestVersion(packageName);
                    break;
                case 'nuget':
                    latestVersion = await this._fetchNuGetLatestVersion(packageName);
                    break;
                case 'github actions':
                case 'githubactions':
                    // GitHub Actions don't have a traditional registry
                    return null;
                default:
                    console.log(`⚠️ Latest version fetch: Unsupported ecosystem ${ecosystem}`);
                    return null;
            }
            
            // Cache the result (even if null to avoid repeated failed requests)
            this._versionCache.set(cacheKey, latestVersion);
            return latestVersion;
        } catch (error) {
            console.log(`⚠️ Failed to fetch latest version for ${ecosystem}:${packageName}: ${error.message}`);
            this._versionCache.set(cacheKey, null);
            return null;
        }
    }

    /**
     * Fetch latest version from npm registry
     */
    async _fetchNpmLatestVersion(packageName) {
        const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data['dist-tags']?.latest || data.version || null;
    }

    /**
     * Fetch latest version from PyPI
     */
    async _fetchPyPiLatestVersion(packageName) {
        const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data.info?.version || null;
    }

    /**
     * Fetch latest version from crates.io
     */
    async _fetchCargoLatestVersion(packageName) {
        const url = `https://crates.io/api/v1/crates/${encodeURIComponent(packageName)}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data.crate?.max_version || null;
    }

    /**
     * Fetch latest version from RubyGems via ecosyste.ms
     */
    async _fetchRubyGemsLatestVersion(packageName) {
        try {
            const registryName = await this.getRegistryName('rubygems');
            if (!registryName) return null;
            
            const url = `${this.ecosystemsBaseUrl}/registries/${registryName}/packages/${encodeURIComponent(packageName)}`;
            const response = await fetchWithTimeout(url);
            if (!response.ok) return null;
            const data = await response.json();
            return data.latest_release_number || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Fetch latest version from Maven via ecosyste.ms
     * Maven packages are formatted as "groupId:artifactId"
     */
    async _fetchMavenLatestVersion(packageName) {
        try {
            const registryName = await this.getRegistryName('maven');
            if (!registryName) return null;
            
            // Parse Maven package name: "groupId:artifactId"
            const parts = packageName.split(':');
            if (parts.length < 2) {
                console.log(`⚠️ Invalid Maven package format: ${packageName} (expected groupId:artifactId)`);
                return null;
            }
            
            const groupId = parts[0];
            const artifactId = parts[1];
            
            const url = `${this.ecosystemsBaseUrl}/registries/${registryName}/packages/${encodeURIComponent(groupId)}/${encodeURIComponent(artifactId)}`;
            const response = await fetchWithTimeout(url);
            if (!response.ok) return null;
            const data = await response.json();
            return data.latest_release_number || null;
        } catch (error) {
            console.log(`⚠️ Failed to fetch Maven version: ${error.message}`);
            return null;
        }
    }

    /**
     * Fetch latest version from Go proxy via ecosyste.ms
     */
    async _fetchGoLatestVersion(packageName) {
        try {
            const registryName = await this.getRegistryName('go');
            if (!registryName) return null;
            
            const url = `${this.ecosystemsBaseUrl}/registries/${registryName}/packages/${encodeURIComponent(packageName)}`;
            const response = await fetchWithTimeout(url);
            if (!response.ok) return null;
            const data = await response.json();
            return data.latest_release_number || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Fetch latest version from Composer/Packagist via ecosyste.ms
     */
    async _fetchComposerLatestVersion(packageName) {
        try {
            const registryName = await this.getRegistryName('composer');
            if (!registryName) return null;
            
            const url = `${this.ecosystemsBaseUrl}/registries/${registryName}/packages/${encodeURIComponent(packageName)}`;
            const response = await fetchWithTimeout(url);
            if (!response.ok) return null;
            const data = await response.json();
            return data.latest_release_number || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Fetch latest version from NuGet via ecosyste.ms
     */
    async _fetchNuGetLatestVersion(packageName) {
        try {
            const registryName = await this.getRegistryName('nuget');
            if (!registryName) return null;
            
            const url = `${this.ecosystemsBaseUrl}/registries/${registryName}/packages/${encodeURIComponent(packageName)}`;
            const response = await fetchWithTimeout(url);
            if (!response.ok) return null;
            const data = await response.json();
            return data.latest_release_number || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Clear the version cache
     */
    clearVersionCache() {
        if (this._versionCache) {
            this._versionCache.clear();
        }
    }
}

// Create global instance
window.RegistryManager = RegistryManager;
window.registryManager = new RegistryManager();

