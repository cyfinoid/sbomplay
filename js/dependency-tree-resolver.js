/**
 * Dependency Tree Resolver
 * Builds full dependency trees by querying package registries, deps.dev, and ecosyste.ms
 */

class DependencyTreeResolver {
    constructor() {
        this.cache = new Map(); // Cache API responses to minimize calls
        this.ecosystemsApiCache = new Map();
        this.depsDevCache = new Map();
        this.maxDepth = 10; // Prevent infinite recursion
        this.requestDelay = 100; // ms between requests to avoid rate limiting
        this.lastRequestTime = 0;
        
        // Registry URL templates
        this.registryAPIs = {
            npm: 'https://registry.npmjs.org/{package}',
            pypi: 'https://pypi.org/pypi/{package}/json',
            cargo: 'https://crates.io/api/v1/crates/{package}',
            rubygems: 'https://rubygems.org/api/v1/gems/{package}.json',
            maven: 'https://search.maven.org/solrsearch/select?q=g:{group}+AND+a:{artifact}&rows=1&wt=json',
            golang: 'https://proxy.golang.org/{package}/@v/{version}.mod',
            go: 'https://proxy.golang.org/{package}/@v/{version}.mod'
        };
        
        this.depsDevAPI = 'https://api.deps.dev/v3alpha/systems/{system}/packages/{package}/versions/{version}:dependencies';
        this.ecosystemsAPI = 'https://packages.ecosyste.ms/api/v1/registries/{registry}/packages/{package}';
        
        // Initialize registry mappings on startup (using shared RegistryManager)
        if (window.registryManager) {
            window.registryManager.initializeRegistries();
        }
    }
    
    /**
     * Get registry name for an ecosystem, using cached mappings
     */
    async getRegistryName(ecosystem) {
        if (!window.registryManager) {
            return null;
        }
        return await window.registryManager.getRegistryName(ecosystem);
    }

    /**
     * Rate limiting helper
     */
    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.requestDelay) {
            await new Promise(resolve => setTimeout(resolve, this.requestDelay - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();
    }
    
    /**
     * Main entry point: Resolve full dependency tree for all direct dependencies
     */
    async resolveDependencyTree(directDependencies, allPackages, ecosystem) {
        console.log(`🌲 Starting dependency tree resolution for ${directDependencies.size} direct dependencies`);
        
        const tree = new Map(); // packageKey -> { dependencies: Map, depth: number, parent: string }
        const resolved = new Set(); // Track what we've already resolved
        
        // Process each direct dependency
        for (const depKey of directDependencies) {
            const pkg = allPackages.get(depKey);
            if (!pkg) continue;
            
            console.log(`  📦 Resolving tree for direct dependency: ${depKey}`);
            
            await this.resolvePackageDependencies(
                pkg.name,
                pkg.version,
                ecosystem,
                1, // depth starts at 1 for direct deps
                depKey, // parent is the direct dep itself
                tree,
                resolved
            );
        }
        
        console.log(`✅ Resolved ${tree.size} dependency relationships`);
        return tree;
    }
    
    /**
     * Recursively resolve dependencies for a single package
     */
    async resolvePackageDependencies(packageName, version, ecosystem, depth, parent, tree, resolved) {
        // Check depth limit
        if (depth > this.maxDepth) {
            console.log(`    ⚠️  Max depth reached for ${packageName}@${version}`);
            return;
        }
        
        const packageKey = `${packageName}@${version}`;
        
        // Check if already resolved
        if (resolved.has(packageKey)) {
            return;
        }
        
        resolved.add(packageKey);
        
        // Try to get dependencies from various sources
        let dependencies = null;
        
        // 1. Try deps.dev first (most comprehensive)
        dependencies = await this.getDependenciesFromDepsDev(packageName, version, ecosystem);
        
        // 2. Try native registry
        if (!dependencies || dependencies.length === 0) {
            dependencies = await this.getDependenciesFromRegistry(packageName, version, ecosystem);
        }
        
        // 3. Try ecosyste.ms as fallback
        if (!dependencies || dependencies.length === 0) {
            dependencies = await this.getDependenciesFromEcosystems(packageName, version, ecosystem);
        }
        
        if (!dependencies || dependencies.length === 0) {
            console.log(`    ℹ️  No dependencies found for ${packageKey} at depth ${depth}`);
            return;
        }
        
        console.log(`    ✓ Found ${dependencies.length} dependencies for ${packageKey} at depth ${depth}`);
        
        // Store the relationships
        for (const dep of dependencies) {
            const depKey = `${dep.name}@${dep.version}`;
            
            if (!tree.has(depKey)) {
                tree.set(depKey, {
                    name: dep.name,
                    version: dep.version,
                    depth: depth,
                    parents: new Set([parent]),
                    children: new Set()
                });
            } else {
                // Add this parent to existing entry
                tree.get(depKey).parents.add(parent);
            }
            
            // Add child reference to parent
            if (tree.has(parent)) {
                tree.get(parent).children.add(depKey);
            }
            
            // Recursively resolve this dependency's dependencies
            await this.resolvePackageDependencies(
                dep.name,
                dep.version,
                ecosystem,
                depth + 1,
                depKey,
                tree,
                resolved
            );
        }
    }
    
    /**
     * Get dependencies from deps.dev API
     */
    async getDependenciesFromDepsDev(packageName, version, ecosystem) {
        const cacheKey = `depsdav:${ecosystem}:${packageName}:${version}`;
        if (this.depsDevCache.has(cacheKey)) {
            return this.depsDevCache.get(cacheKey);
        }
        
        try {
            await this.rateLimit();
            
            // Map ecosystem to deps.dev system names
            const systemMap = {
                'npm': 'npm',
                'pypi': 'pypi',
                'cargo': 'cargo',
                'maven': 'maven',
                'go': 'go',
                'golang': 'go',
                'rubygems': 'rubygems',
                'gem': 'rubygems'
            };
            
            const system = systemMap[ecosystem.toLowerCase()];
            if (!system) {
                return null;
            }
            
            // Normalize version
            const normalizedVersion = this.normalizeVersion(version);
            
            const url = this.depsDevAPI
                .replace('{system}', system)
                .replace('{package}', encodeURIComponent(packageName))
                .replace('{version}', encodeURIComponent(normalizedVersion));
            
            console.log(`      🔍 Querying deps.dev: ${packageName}@${normalizedVersion}`);
            
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status !== 404) {
                    console.log(`      ⚠️  deps.dev returned ${response.status} for ${packageName}@${normalizedVersion}`);
                }
                this.depsDevCache.set(cacheKey, null);
                return null;
            }
            
            const data = await response.json();
            
            // Parse deps.dev response
            const dependencies = [];
            if (data.nodes && Array.isArray(data.nodes)) {
                for (const node of data.nodes) {
                    if (node.relation === 'DIRECT' && node.versionKey) {
                        dependencies.push({
                            name: node.versionKey.name || packageName,
                            version: node.versionKey.version || 'unknown'
                        });
                    }
                }
            }
            
            this.depsDevCache.set(cacheKey, dependencies);
            return dependencies;
            
        } catch (error) {
            console.log(`      ❌ Error querying deps.dev for ${packageName}: ${error.message}`);
            this.depsDevCache.set(cacheKey, null);
            return null;
        }
    }
    
    /**
     * Get dependencies from native registry APIs
     */
    async getDependenciesFromRegistry(packageName, version, ecosystem) {
        const cacheKey = `registry:${ecosystem}:${packageName}:${version}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        try {
            await this.rateLimit();
            
            let dependencies = null;
            
            switch (ecosystem.toLowerCase()) {
                case 'npm':
                    dependencies = await this.getNpmDependencies(packageName, version);
                    break;
                case 'pypi':
                    dependencies = await this.getPyPIDependencies(packageName, version);
                    break;
                case 'cargo':
                    dependencies = await this.getCargoDependencies(packageName, version);
                    break;
                case 'rubygems':
                    dependencies = await this.getRubyGemsDependencies(packageName, version);
                    break;
                case 'golang':
                case 'go':
                    dependencies = await this.getGoDependencies(packageName, version);
                    break;
                default:
                    dependencies = null;
            }
            
            this.cache.set(cacheKey, dependencies);
            return dependencies;
            
        } catch (error) {
            console.log(`      ❌ Error querying registry for ${packageName}: ${error.message}`);
            this.cache.set(cacheKey, null);
            return null;
        }
    }
    
    /**
     * Get npm package dependencies
     */
    async getNpmDependencies(packageName, version) {
        const url = this.registryAPIs.npm.replace('{package}', encodeURIComponent(packageName));
        
        console.log(`      🔍 Querying npm: ${packageName}@${version}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        
        // Find the specific version or use latest
        let versionData = data.versions?.[version];
        if (!versionData && data.versions) {
            // Try to find closest version match
            const normalizedVersion = this.normalizeVersion(version);
            versionData = data.versions[normalizedVersion] || data.versions[data['dist-tags']?.latest];
        }
        
        if (!versionData || !versionData.dependencies) {
            return [];
        }
        
        // Parse dependencies
        const dependencies = [];
        for (const [name, versionRange] of Object.entries(versionData.dependencies)) {
            dependencies.push({
                name: name,
                version: this.normalizeVersion(versionRange)
            });
        }
        
        return dependencies;
    }
    
    /**
     * Get PyPI package dependencies
     */
    async getPyPIDependencies(packageName, version) {
        const url = this.registryAPIs.pypi.replace('{package}', encodeURIComponent(packageName));
        
        console.log(`      🔍 Querying PyPI: ${packageName}@${version}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        
        // PyPI doesn't provide dependency info in the JSON API reliably
        // We'll need to parse from requires_dist in the release data
        const dependencies = [];
        
        if (data.info?.requires_dist && Array.isArray(data.info.requires_dist)) {
            for (const req of data.info.requires_dist) {
                // Skip optional/extra dependencies (e.g., "package[extra]" or "extra == 'dev'")
                if (req.includes('extra ==') || req.includes('extra==')) {
                    continue;
                }
                
                // Parse requirement like "requests (>=2.28.0)" or "requests>=2.28.0"
                // Also handles markers like "typing-extensions>=4.1.0; python_version < '3.11'"
                const match = req.match(/^([a-zA-Z0-9_-]+)/);
                if (match) {
                    dependencies.push({
                        name: match[1],
                        version: 'unknown' // PyPI doesn't give us exact versions
                    });
                }
            }
        }
        
        return dependencies;
    }
    
    /**
     * Get Cargo package dependencies
     */
    async getCargoDependencies(packageName, version) {
        const url = this.registryAPIs.cargo.replace('{package}', encodeURIComponent(packageName));
        
        console.log(`      🔍 Querying crates.io: ${packageName}@${version}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        
        // Get the specific version
        const versionData = data.versions?.find(v => v.num === version || v.num === this.normalizeVersion(version));
        
        if (!versionData) {
            return [];
        }
        
        // Get dependencies for this version
        const depsUrl = `https://crates.io/api/v1/crates/${encodeURIComponent(packageName)}/${encodeURIComponent(versionData.num)}/dependencies`;
        
        await this.rateLimit();
        const depsResponse = await fetch(depsUrl);
        if (!depsResponse.ok) {
            return [];
        }
        
        const depsData = await depsResponse.json();
        
        const dependencies = [];
        if (depsData.dependencies && Array.isArray(depsData.dependencies)) {
            for (const dep of depsData.dependencies) {
                if (dep.kind === 'normal') { // Only normal dependencies, not dev or build
                    dependencies.push({
                        name: dep.crate_id,
                        version: dep.req || 'unknown'
                    });
                }
            }
        }
        
        return dependencies;
    }
    
    /**
     * Get RubyGems package dependencies
     * NOTE: RubyGems API doesn't support CORS, so we skip it and rely on ecosyste.ms and deps.dev
     */
    async getRubyGemsDependencies(packageName, version) {
        // RubyGems API doesn't support CORS, so we can't use it directly from the browser
        // Return null to fall back to ecosyste.ms and deps.dev which do support CORS
        console.log(`      🔍 RubyGems: Skipping direct API (no CORS), will use ecosyste.ms/deps.dev for ${packageName}@${version}`);
            return null;
    }
    
    /**
     * Get Go module dependencies
     */
    async getGoDependencies(packageName, version) {
        // Go modules don't have a traditional registry API like npm or PyPI
        // We'll rely primarily on deps.dev which has excellent Go module support
        // The Go proxy (proxy.golang.org) returns .mod files which require parsing
        
        console.log(`      🔍 Go modules: Will use deps.dev API for ${packageName}@${version}`);
        
        // Return null to trigger deps.dev fallback
        // Alternatively, we could parse go.mod files from proxy.golang.org
        return null;
    }
    
    /**
     * Get dependencies from ecosyste.ms API
     */
    async getDependenciesFromEcosystems(packageName, version, ecosystem) {
        const cacheKey = `ecosystems:${ecosystem}:${packageName}:${version}`;
        if (this.ecosystemsApiCache.has(cacheKey)) {
            return this.ecosystemsApiCache.get(cacheKey);
        }
        
        try {
            await this.rateLimit();
            
            // Get registry name from cached mappings (fetched from /registries/ endpoint)
            const registry = await this.getRegistryName(ecosystem);
            if (!registry) {
                console.log(`      ⚠️  No registry mapping found for ecosystem: ${ecosystem}`);
                return null;
            }
            
            const url = this.ecosystemsAPI
                .replace('{registry}', registry)
                .replace('{package}', encodeURIComponent(packageName));
            
            console.log(`      🔍 Querying ecosyste.ms: ${packageName}@${version} (registry: ${registry})`);
            
            const response = await fetch(url);
            if (!response.ok) {
                this.ecosystemsApiCache.set(cacheKey, null);
                return null;
            }
            
            const data = await response.json();
            
            // Find the specific version
            const versionData = data.versions?.find(v => 
                v.number === version || 
                v.number === this.normalizeVersion(version)
            );
            
            if (!versionData || !versionData.dependencies) {
                this.ecosystemsApiCache.set(cacheKey, []);
                return [];
            }
            
            // Parse dependencies
            const dependencies = [];
            for (const dep of versionData.dependencies) {
                if (dep.kind === 'runtime' || dep.kind === 'normal') {
                    dependencies.push({
                        name: dep.package_name,
                        version: dep.requirements || 'unknown'
                    });
                }
            }
            
            this.ecosystemsApiCache.set(cacheKey, dependencies);
            return dependencies;
            
        } catch (error) {
            console.log(`      ❌ Error querying ecosyste.ms for ${packageName}: ${error.message}`);
            this.ecosystemsApiCache.set(cacheKey, null);
            return null;
        }
    }
    
    /**
     * Normalize version strings
     * Uses shared VersionUtils for consistency
     */
    normalizeVersion(version) {
        if (window.normalizeVersion) {
            const normalized = window.normalizeVersion(version);
            return normalized || 'unknown';
        }
        // Fallback if VersionUtils not available
        if (!version) return 'unknown';
        return version.trim()
            .replace(/^[><=^~]+\s*/, '')
            .replace(/\s+-\s+[\d.]+.*$/, '')  // Only remove ranges with spaces around dash
            .replace(/\s*\|\|.*$/, '')
            .replace(/\s+/g, '') || 'unknown';
    }
    
    /**
     * Get statistics about the resolved tree
     */
    getTreeStats(tree) {
        const stats = {
            totalPackages: tree.size,
            byDepth: new Map(),
            maxDepth: 0,
            packagesWithMultipleParents: 0
        };
        
        for (const [key, data] of tree) {
            const depth = data.depth;
            
            if (!stats.byDepth.has(depth)) {
                stats.byDepth.set(depth, 0);
            }
            stats.byDepth.set(depth, stats.byDepth.get(depth) + 1);
            
            if (depth > stats.maxDepth) {
                stats.maxDepth = depth;
            }
            
            if (data.parents.size > 1) {
                stats.packagesWithMultipleParents++;
            }
        }
        
        return stats;
    }
}

// Export for use in other modules and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DependencyTreeResolver;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.DependencyTreeResolver = DependencyTreeResolver;
}

