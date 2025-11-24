/**
 * Dependency Tree Resolver
 * Builds full dependency trees by querying package registries, deps.dev, and ecosyste.ms
 */

class DependencyTreeResolver {
    constructor() {
        this.cache = new Map(); // Cache API responses to minimize calls
        this.ecosystemsApiCache = new Map();
        this.depsDevCache = new Map();
        // Load maxDepth from localStorage or use default of 10
        const savedMaxDepth = localStorage.getItem('maxDepth');
        this.maxDepth = savedMaxDepth ? parseInt(savedMaxDepth, 10) : 10;
        this.requestDelay = 100; // ms between requests to avoid rate limiting
        this.lastRequestTime = 0;
        this.requestTimeout = 10000; // 10 seconds timeout for API requests
        this.onProgress = null; // Progress callback
        this.totalDirectDeps = 0; // Total direct dependencies
        this.processedDirectDeps = 0; // Direct dependencies processed
        this.totalPackagesProcessed = 0; // Total packages processed (direct + transitive)
        this.currentDepChain = []; // Current dependency chain being resolved
        this.currentEcosystem = null; // Current ecosystem being resolved
        this.currentDirectDep = null; // Current direct dependency being resolved
        
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
     * Fetch with timeout (uses shared utility)
     */
    async fetchWithTimeout(url, options = {}, timeout = null) {
        // Use shared utility, but allow timeout override
        const timeoutOverride = timeout !== null ? timeout : (parseInt(localStorage.getItem('apiTimeout'), 10) || this.requestTimeout);
        
        // Debug: Log URL call with context
        const caller = new Error().stack.split('\n')[2]?.trim() || 'unknown';
        if (isUrlFromHostname(url, 'deps.dev')) {
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Querying deps.dev API for package dependency information (called from: ${caller})`);
        } else if (isUrlFromHostname(url, 'ecosyste.ms')) {
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Querying ecosyste.ms API for package dependency information (called from: ${caller})`);
        } else if (isUrlFromHostname(url, 'registry.npmjs.org')) {
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Querying npm registry for package dependency information (called from: ${caller})`);
        } else if (isUrlFromHostname(url, 'pypi.org')) {
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Querying PyPI registry for package dependency information (called from: ${caller})`);
        } else if (isUrlFromHostname(url, 'crates.io')) {
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Querying crates.io registry for package dependency information (called from: ${caller})`);
        } else if (isUrlFromHostname(url, 'rubygems.org')) {
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Querying RubyGems registry for package dependency information (called from: ${caller})`);
        } else {
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Fetching dependency information (called from: ${caller})`);
        }
        
        const response = await window.fetchWithTimeout(url, options, timeoutOverride);
        
        // Debug: Log response and extract information
        if (response.ok) {
            try {
                const data = await response.clone().json(); // Clone to avoid consuming the stream
                let extractedInfo = `Status: ${response.status}`;
                
                if (isUrlFromHostname(url, 'deps.dev')) {
                    const depCount = data.nodes?.filter(n => n.relation === 'DIRECT')?.length || 0;
                    extractedInfo += `, Extracted: ${depCount} direct dependency/dependencies`;
                } else if (isUrlFromHostname(url, 'ecosyste.ms')) {
                    const depCount = data.dependencies?.length || 0;
                    extractedInfo += `, Extracted: ${depCount} dependency/dependencies`;
                } else if (isUrlFromHostname(url, 'registry.npmjs.org') || isUrlFromHostname(url, 'pypi.org') || isUrlFromHostname(url, 'crates.io') || isUrlFromHostname(url, 'rubygems.org')) {
                    const depCount = data.dependencies ? Object.keys(data.dependencies).length : 0;
                    extractedInfo += `, Extracted: Package metadata with ${depCount} dependency/dependencies`;
                }
                
                debugLogUrl(`   ✅ Response: ${extractedInfo}`);
            } catch (e) {
                // If JSON parsing fails, just log status
                debugLogUrl(`   ✅ Response: Status ${response.status}`);
            }
        } else {
            debugLogUrl(`   ❌ Response: Status ${response.status} ${response.statusText}`);
        }
        
        return response;
    }
    
    /**
     * Update progress if callback is available
     */
    updateProgress(message, packageName = null, depChain = null, ecosystem = null) {
        if (this.onProgress && this.totalDirectDeps > 0) {
            this.onProgress({
                phase: 'resolving-package',
                message: message,
                packageName: packageName,
                ecosystem: ecosystem || this.currentEcosystem,
                processed: this.processedDirectDeps,
                total: this.totalDirectDeps,
                remaining: this.totalDirectDeps - this.processedDirectDeps,
                totalPackagesProcessed: this.totalPackagesProcessed,
                depChain: depChain || this.currentDepChain,
                percent: (this.processedDirectDeps / this.totalDirectDeps) * 100
            });
        }
    }
    
    /**
     * Main entry point: Resolve full dependency tree for all direct dependencies
     */
    async resolveDependencyTree(directDependencies, allPackages, ecosystem, onProgress = null) {
        console.log(`🌲 Starting dependency tree resolution for ${directDependencies.size} direct dependencies`);
        
        this.onProgress = onProgress;
        this.processedDirectDeps = 0;
        this.totalDirectDeps = directDependencies.size;
        this.totalPackagesProcessed = 0;
        this.currentDepChain = [];
        this.currentEcosystem = ecosystem;
        this.currentDirectDep = null;
        
        const tree = new Map(); // packageKey -> { dependencies: Map, depth: number, parent: string }
        const resolved = new Set(); // Track what we've already resolved
        
        // Process each direct dependency
        for (const depKey of directDependencies) {
            const pkg = allPackages.get(depKey);
            if (!pkg) continue;
            
            this.processedDirectDeps++;
            this.currentDirectDep = pkg.name; // Track current direct dependency
            const progressMsg = `Resolving ${ecosystem} dependencies (${this.processedDirectDeps}/${this.totalDirectDeps} direct)...`;
            console.log(`  📦 [${this.processedDirectDeps}/${this.totalDirectDeps}] Resolving tree for direct dependency: ${depKey}`);
            
            // Initialize dependency chain with the direct dependency
            this.currentDepChain = [pkg.name];
            
            if (this.onProgress) {
                this.onProgress({
                    phase: 'resolving-package',
                    message: progressMsg,
                    package: depKey,
                    packageName: pkg.name,
                    ecosystem: ecosystem,
                    processed: this.processedDirectDeps,
                    total: this.totalDirectDeps,
                    remaining: this.totalDirectDeps - this.processedDirectDeps,
                    totalPackagesProcessed: this.totalPackagesProcessed,
                    depChain: [pkg.name]
                });
            }
            
            try {
                await this.resolvePackageDependencies(
                    pkg.name,
                    pkg.version,
                    ecosystem,
                    1, // depth starts at 1 for direct deps
                    depKey, // parent is the direct dep itself
                    tree,
                    resolved,
                    [pkg.name] // Start the chain with direct dependency
                );
            } catch (error) {
                console.error(`    ❌ Error resolving ${depKey}:`, error.message);
                // Continue with next package instead of failing completely
            }
        }
        
        console.log(`✅ Resolved ${tree.size} dependency relationships`);
        return tree;
    }
    
    /**
     * Recursively resolve dependencies for a single package
     */
    async resolvePackageDependencies(packageName, version, ecosystem, depth, parent, tree, resolved, depChain = []) {
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
        this.totalPackagesProcessed++; // Increment total packages counter
        
        // Update dependency chain
        this.currentDepChain = [...depChain];
        this.updateProgress(`Processing ${packageKey} (depth ${depth})...`, packageName, this.currentDepChain, ecosystem);
        
        // Try to get dependencies from various sources with timeout handling
        let dependencies = null;
        
        try {
            // 1. Try deps.dev first (most comprehensive)
            try {
                dependencies = await Promise.race([
                    this.getDependenciesFromDepsDev(packageName, version, ecosystem),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('deps.dev timeout')), this.requestTimeout)
                    )
                ]);
            } catch (error) {
                // Timeout or error - try next source
                dependencies = null;
            }
            
            // 2. Try native registry
            if (!dependencies || dependencies.length === 0) {
                try {
                    dependencies = await Promise.race([
                        this.getDependenciesFromRegistry(packageName, version, ecosystem),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('registry timeout')), this.requestTimeout)
                        )
                    ]);
                } catch (error) {
                    // Timeout or error - try next source
                    dependencies = null;
                }
            }
            
            // 3. Try ecosyste.ms as fallback (or primary for RubyGems)
            // For RubyGems, prioritize ecosyste.ms since RubyGems API lacks CORS
            const isRubyGems = ecosystem.toLowerCase() === 'rubygems' || ecosystem.toLowerCase() === 'gem';
            if (isRubyGems || (!dependencies || dependencies.length === 0)) {
                try {
                    dependencies = await Promise.race([
                        this.getDependenciesFromEcosystems(packageName, version, ecosystem),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('ecosyste.ms timeout')), this.requestTimeout)
                        )
                    ]);
                } catch (error) {
                    // Timeout or error - no dependencies found
                    dependencies = null;
                }
            }
        } catch (error) {
            console.log(`    ⚠️  Error resolving dependencies for ${packageKey}: ${error.message}`);
            // Continue without dependencies rather than failing completely
            dependencies = null;
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
            try {
                // Build new dependency chain for child
                const newDepChain = [...depChain, dep.name];
                
                await this.resolvePackageDependencies(
                    dep.name,
                    dep.version,
                    ecosystem,
                    depth + 1,
                    depKey,
                    tree,
                    resolved,
                    newDepChain
                );
            } catch (error) {
                console.log(`    ⚠️  Error resolving child ${depKey}: ${error.message}`);
                // Continue with next dependency
            }
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
            
            // Skip if version is unknown or empty (to avoid unnecessary 404 errors)
            if (!normalizedVersion || normalizedVersion === 'unknown' || normalizedVersion === '') {
                console.log(`      ⏭️  Skipping deps.dev query for ${packageName}@${version} (unknown version)`);
                return null;
            }
            
            const url = this.depsDevAPI
                .replace('{system}', system)
                .replace('{package}', encodeURIComponent(packageName))
                .replace('{version}', encodeURIComponent(normalizedVersion));
            
            console.log(`      🔍 Querying deps.dev: ${packageName}@${normalizedVersion}`);
            
            const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
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
        
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
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
        // Skip built-in Python modules (they're not PyPI packages)
        // Common built-in modules from Python standard library
        const builtInModules = new Set([
            'json', 'sys', 'os', 're', 'math', 'datetime', 'collections', 'itertools',
            'functools', 'operator', 'string', 'random', 'hashlib', 'base64', 'urllib',
            'urllib2', 'http', 'socket', 'ssl', 'email', 'csv', 'xml', 'html', 'sqlite3',
            'threading', 'multiprocessing', 'queue', 'time', 'calendar', 'locale', 'gettext',
            'codecs', 'unicodedata', 'copy', 'pickle', 'shelve', 'marshal', 'dbm', 'gdbm',
            'zlib', 'gzip', 'bz2', 'lzma', 'zipfile', 'tarfile', 'shutil', 'glob', 'fnmatch',
            'linecache', 'tempfile', 'fileinput', 'stat', 'filecmp', 'pathlib', 'io',
            'argparse', 'getopt', 'logging', 'warnings', 'traceback', 'errno', 'ctypes',
            'struct', 'stringprep', 'readline', 'rlcompleter', 'cmd', 'shlex', 'configparser',
            'netrc', 'xdrlib', 'plistlib', 'secrets', 'hmac', 'uuid', 'ipaddress',
            'binascii', 'quopri', 'uu', 'binhex'
        ]);
        
        if (builtInModules.has(packageName.toLowerCase())) {
            console.log(`      ⏭️  Skipping PyPI query for ${packageName} (built-in Python module)`);
            return [];
        }
        
        const url = this.registryAPIs.pypi.replace('{package}', encodeURIComponent(packageName));
        
        console.log(`      🔍 Querying PyPI: ${packageName}@${version}`);
        
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
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
        
        const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
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
        const depsResponse = await this.fetchWithTimeout(depsUrl, {}, this.requestTimeout);
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
     * Check CORS support for RubyGems API
     * @returns {Promise<boolean>} - True if CORS is supported, false otherwise
     */
    async checkRubyGemsCORS() {
        const testUrl = 'https://rubygems.org/api/v1/gems/rails.json';
        try {
            const response = await this.fetchWithTimeout(testUrl, { method: 'HEAD' });
            const corsHeader = response.headers.get('Access-Control-Allow-Origin');
            const hasCORS = corsHeader !== null;
            console.log(`      ℹ️  RubyGems CORS check: ${hasCORS ? 'Supported' : 'Not supported'} (header: ${corsHeader || 'none'})`);
            return hasCORS;
        } catch (error) {
            console.log(`      ⚠️  RubyGems CORS check failed: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Get RubyGems package dependencies
     * NOTE: RubyGems API doesn't support CORS, so we skip it and rely on ecosyste.ms and deps.dev
     */
    async getRubyGemsDependencies(packageName, version) {
        // RubyGems API doesn't support CORS, so we can't use it directly from the browser
        // Check CORS status (will be cached after first check)
        const corsCacheKey = 'rubygems_cors_check';
        if (!this.cache.has(corsCacheKey)) {
            const hasCORS = await this.checkRubyGemsCORS();
            this.cache.set(corsCacheKey, hasCORS);
        }
        const hasCORS = this.cache.get(corsCacheKey);
        
        if (!hasCORS) {
        console.log(`      🔍 RubyGems: Skipping direct API (no CORS), will use ecosyste.ms/deps.dev for ${packageName}@${version}`);
        }
        return null;  // Always return null to use ecosyste.ms/deps.dev
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
            
            const response = await this.fetchWithTimeout(url, {}, this.requestTimeout);
            if (!response.ok) {
                this.ecosystemsApiCache.set(cacheKey, null);
                return null;
            }
            
            const data = await response.json();
            
            // For RubyGems, ecosyste.ms returns package data with versions array
            // Find the specific version
            let versionData = null;
            if (data.versions && Array.isArray(data.versions)) {
                versionData = data.versions.find(v => 
                v.number === version || 
                    v.number === this.normalizeVersion(version) ||
                    v.number === `v${version}` ||
                    v.number === `v${this.normalizeVersion(version)}`
                );
            }
            
            // If version not found, try to get latest version dependencies (for RubyGems)
            if (!versionData && ecosystem.toLowerCase() === 'rubygems' && data.latest_release_number) {
                versionData = data.versions?.find(v => v.number === data.latest_release_number);
            }
            
            if (!versionData || !versionData.dependencies) {
                this.ecosystemsApiCache.set(cacheKey, []);
                return [];
            }
            
            // Parse dependencies
            const dependencies = [];
            for (const dep of versionData.dependencies) {
                if (dep.kind === 'runtime' || dep.kind === 'normal' || !dep.kind) {
                    // Extract version from requirements (e.g., ">= 1.0" -> "1.0")
                    let depVersion = dep.requirements || 'unknown';
                    if (depVersion.includes('>=') || depVersion.includes('~>')) {
                        // Extract version number from requirement string
                        const match = depVersion.match(/(\d+\.\d+\.\d+|\d+\.\d+|\d+)/);
                        if (match) {
                            depVersion = match[1];
                        }
                    }
                    dependencies.push({
                        name: dep.package_name,
                        version: depVersion
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
     * Fetch latest version for a package in an ecosystem
     * @param {string} packageName - Package name
     * @param {string} ecosystem - Ecosystem
     * @returns {Promise<string|null>} - Latest version string or null
     */
    async fetchLatestVersion(packageName, ecosystem) {
        const normalizedEcosystem = ecosystem.toLowerCase();
        const cacheKey = `latest:${normalizedEcosystem}:${packageName}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        try {
            await this.rateLimit();
            let latestVersion = null;
            
            switch (normalizedEcosystem) {
                case 'npm':
                    latestVersion = await this.fetchNpmLatestVersion(packageName);
                    break;
                case 'pypi':
                    latestVersion = await this.fetchPyPiLatestVersion(packageName);
                    break;
                case 'cargo':
                    latestVersion = await this.fetchCargoLatestVersion(packageName);
                    break;
                case 'rubygems':
                case 'gem':
                    // Use ecosyste.ms for RubyGems (no CORS on RubyGems API)
                    latestVersion = await this.fetchRubyGemsLatestVersion(packageName);
                    break;
                case 'maven':
                    // Use ecosyste.ms for Maven (Maven Central search API has CORS issues)
                    latestVersion = await this.fetchMavenLatestVersion(packageName);
                    break;
                default:
                    console.log(`      ⚠️  Latest version fetch: Unsupported ecosystem ${ecosystem}`);
                    return null;
            }
            
            // Cache the result (even if null to avoid repeated failed requests)
            this.cache.set(cacheKey, latestVersion);
            return latestVersion;
        } catch (error) {
            console.log(`      ⚠️  Failed to fetch latest version for ${ecosystem}:${packageName}: ${error.message}`);
            this.cache.set(cacheKey, null);
            return null;
        }
    }
    
    /**
     * Fetch latest version from npm registry
     */
    async fetchNpmLatestVersion(packageName) {
        const url = this.registryAPIs.npm.replace('{package}', encodeURIComponent(packageName));
        const response = await this.fetchWithTimeout(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data['dist-tags']?.latest || data.version || null;
    }
    
    /**
     * Fetch latest version from PyPI
     */
    async fetchPyPiLatestVersion(packageName) {
        const url = this.registryAPIs.pypi.replace('{package}', encodeURIComponent(packageName));
        const response = await this.fetchWithTimeout(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data.info?.version || null;
    }
    
    /**
     * Fetch latest version from crates.io
     */
    async fetchCargoLatestVersion(packageName) {
        const url = this.registryAPIs.cargo.replace('{package}', encodeURIComponent(packageName));
        const response = await this.fetchWithTimeout(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data.crate?.max_version || null;
    }
    
    /**
     * Fetch latest version from RubyGems via ecosyste.ms
     */
    async fetchRubyGemsLatestVersion(packageName) {
        try {
            const registryName = await this.getRegistryName('rubygems');
            if (!registryName) return null;
            
            const url = this.ecosystemsAPI
                .replace('{registry}', registryName)
                .replace('{package}', encodeURIComponent(packageName));
            const response = await this.fetchWithTimeout(url);
            if (!response.ok) return null;
            const data = await response.json();
            return data.latest_release_number || null;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Fetch latest version from Maven via ecosyste.ms
     * Maven packages are formatted as "groupId:artifactId" (e.g., "org.springframework.boot:spring-boot-starter")
     * ecosyste.ms Maven API URL format: /registries/repo1.maven.org/packages/{groupId}/{artifactId}
     */
    async fetchMavenLatestVersion(packageName) {
        try {
            const registryName = await this.getRegistryName('maven');
            if (!registryName) return null;
            
            // Parse Maven package name: "groupId:artifactId"
            const parts = packageName.split(':');
            if (parts.length < 2) {
                console.log(`      ⚠️  Invalid Maven package format: ${packageName} (expected groupId:artifactId)`);
                return null;
            }
            
            const groupId = parts[0];
            const artifactId = parts[1];
            
            // Build ecosyste.ms URL for Maven package
            // Format: /registries/repo1.maven.org/packages/{groupId}/{artifactId}
            const url = `https://packages.ecosyste.ms/api/v1/registries/${registryName}/packages/${encodeURIComponent(groupId)}/${encodeURIComponent(artifactId)}`;
            
            const response = await this.fetchWithTimeout(url);
            if (!response.ok) return null;
            
            const data = await response.json();
            return data.latest_release_number || null;
        } catch (error) {
            console.log(`      ⚠️  Failed to fetch Maven version from ecosyste.ms: ${error.message}`);
            return null;
        }
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

