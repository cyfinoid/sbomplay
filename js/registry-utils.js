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
}

// Create global instance
window.RegistryManager = RegistryManager;
window.registryManager = new RegistryManager();

