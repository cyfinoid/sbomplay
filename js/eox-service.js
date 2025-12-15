/**
 * EOX Service - End-of-Life/End-of-Support Detection
 * 
 * Fetches EOL/EOS data from endoflife.date API and caches results in IndexedDB.
 * Distinguishes between:
 * - Stale: Old package with no updates, but not officially EOL
 * - EOL (End-of-Life): No longer receiving any updates
 * - EOS (End-of-Support): No longer receiving security updates
 * 
 * Data Sources:
 * - Primary: endoflife.date API (https://endoflife.date/docs/api)
 * - Future: OpenEOX standard (https://openeox.org/)
 */
class EOXService {
    constructor() {
        this.baseUrl = 'https://endoflife.date/api';
        this.cache = new Map(); // In-memory cache
        this.cacheExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days cache
        this.requestTimeout = 10000; // 10 seconds timeout
        
        // Product list cache
        this.productList = null;
        this.productListFetchedAt = null;
        
        // Mapping from ecosystem/package names to endoflife.date product identifiers
        // This helps match SBOM packages to their EOL data
        this.productMappings = {
            // Programming Languages/Runtimes
            'python': 'python',
            'nodejs': 'nodejs',
            'node': 'nodejs',
            'ruby': 'ruby',
            'php': 'php',
            'go': 'go',
            'golang': 'go',
            'java': 'java',
            'openjdk': 'openjdk',
            'dotnet': 'dotnet',
            '.net': 'dotnet',
            'rust': 'rust',
            'perl': 'perl',
            'elixir': 'elixir',
            'erlang': 'erlang',
            
            // Frameworks
            'django': 'django',
            'rails': 'rails',
            'ruby-on-rails': 'rails',
            'laravel': 'laravel',
            'symfony': 'symfony',
            'spring-boot': 'spring-boot',
            'spring-framework': 'spring-framework',
            'angular': 'angular',
            'angularjs': 'angularjs',
            'react': 'react',
            'vue': 'vue',
            'vuejs': 'vue',
            'nuxt': 'nuxt',
            'nextjs': 'nextjs',
            'next': 'nextjs',
            'express': 'express',
            'fastapi': 'fastapi',
            'flask': 'flask',
            'jquery': 'jquery',
            'bootstrap': 'bootstrap',
            
            // Databases
            'mysql': 'mysql',
            'postgresql': 'postgresql',
            'postgres': 'postgresql',
            'mongodb': 'mongodb',
            'redis': 'redis',
            'elasticsearch': 'elasticsearch',
            'mariadb': 'mariadb',
            'sqlite': 'sqlite',
            'oracle-database': 'oracle-database',
            'mssqlserver': 'mssqlserver',
            'sql-server': 'mssqlserver',
            
            // Web Servers/Proxies
            'nginx': 'nginx',
            'apache': 'apache',
            'apache-http-server': 'apache',
            'tomcat': 'tomcat',
            'apache-tomcat': 'tomcat',
            'haproxy': 'haproxy',
            
            // Container/Cloud
            'kubernetes': 'kubernetes',
            'k8s': 'kubernetes',
            'docker': 'docker-engine',
            'docker-engine': 'docker-engine',
            'terraform': 'terraform',
            'ansible': 'ansible',
            'helm': 'helm',
            
            // Operating Systems
            'ubuntu': 'ubuntu',
            'debian': 'debian',
            'centos': 'centos',
            'rhel': 'rhel',
            'red-hat-enterprise-linux': 'rhel',
            'alpine': 'alpine',
            'amazon-linux': 'amazon-linux',
            'windows-server': 'windows-server',
            
            // Package Managers/Build Tools
            'npm': 'npm',
            'yarn': 'yarn',
            'pip': 'pip',
            'composer': 'composer',
            'gradle': 'gradle',
            'maven': 'maven',
            
            // Other Common
            'openssl': 'openssl',
            'openssh': 'openssh',
            'git': 'git',
            'linux': 'linux',
            'linux-kernel': 'linux',
            'log4j': 'log4j',
            'spring': 'spring-framework'
        };
        
        // Reverse mapping: endoflife.date product -> common package names
        this.reverseProductMappings = this.buildReverseMappings();
    }
    
    /**
     * Build reverse mappings from product identifiers to package names
     */
    buildReverseMappings() {
        const reverse = {};
        for (const [packageName, product] of Object.entries(this.productMappings)) {
            if (!reverse[product]) {
                reverse[product] = [];
            }
            reverse[product].push(packageName);
        }
        return reverse;
    }
    
    /**
     * Get all available products from endoflife.date
     * @returns {Promise<Array<string>>} List of product identifiers
     */
    async getAllProducts() {
        // Check if we have a recent product list cached
        if (this.productList && this.productListFetchedAt && 
            (Date.now() - this.productListFetchedAt) < this.cacheExpiry) {
            return this.productList;
        }
        
        // Check IndexedDB cache
        if (window.cacheManager) {
            try {
                const cached = await window.cacheManager.getEOXProductList();
                if (cached && cached.fetchedAt && 
                    (Date.now() - cached.fetchedAt) < this.cacheExpiry) {
                    this.productList = cached.products;
                    this.productListFetchedAt = cached.fetchedAt;
                    return this.productList;
                }
            } catch (e) {
                console.debug('EOX product list cache miss:', e);
            }
        }
        
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/all.json`);
            if (!response.ok) {
                throw new Error(`Failed to fetch product list: ${response.status}`);
            }
            
            const products = await response.json();
            this.productList = products;
            this.productListFetchedAt = Date.now();
            
            // Save to IndexedDB
            if (window.cacheManager) {
                try {
                    await window.cacheManager.saveEOXProductList({
                        products: products,
                        fetchedAt: Date.now()
                    });
                } catch (e) {
                    console.debug('Failed to cache EOX product list:', e);
                }
            }
            
            console.log(`📦 EOX: Loaded ${products.length} products from endoflife.date`);
            return products;
        } catch (error) {
            console.warn('⚠️ EOX: Failed to fetch product list:', error);
            return [];
        }
    }
    
    /**
     * Get EOL/EOS data for a specific product
     * @param {string} product - Product identifier (e.g., 'python', 'nodejs')
     * @returns {Promise<Object|null>} Product lifecycle data or null
     */
    async getProductEOX(product) {
        if (!product) return null;
        
        const normalizedProduct = product.toLowerCase().trim();
        const cacheKey = `eox:${normalizedProduct}`;
        
        // Check in-memory cache
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.fetchedAt) < this.cacheExpiry) {
            return cached.data;
        }
        
        // Check IndexedDB cache
        if (window.cacheManager) {
            try {
                const cachedData = await window.cacheManager.getEOXProduct(normalizedProduct);
                if (cachedData && cachedData.fetchedAt && 
                    (Date.now() - cachedData.fetchedAt) < this.cacheExpiry) {
                    this.cache.set(cacheKey, cachedData);
                    return cachedData.data;
                }
            } catch (e) {
                console.debug(`EOX cache miss for ${normalizedProduct}:`, e);
            }
        }
        
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/${encodeURIComponent(normalizedProduct)}.json`);
            if (!response.ok) {
                if (response.status === 404) {
                    // Product not found - cache the negative result
                    const negativeResult = { data: null, fetchedAt: Date.now(), notFound: true };
                    this.cache.set(cacheKey, negativeResult);
                    return null;
                }
                throw new Error(`Failed to fetch EOX data: ${response.status}`);
            }
            
            const data = await response.json();
            const result = { data: data, fetchedAt: Date.now() };
            
            // Cache in memory
            this.cache.set(cacheKey, result);
            
            // Cache in IndexedDB
            if (window.cacheManager) {
                try {
                    await window.cacheManager.saveEOXProduct(normalizedProduct, result);
                } catch (e) {
                    console.debug(`Failed to cache EOX data for ${normalizedProduct}:`, e);
                }
            }
            
            return data;
        } catch (error) {
            console.warn(`⚠️ EOX: Failed to fetch data for ${normalizedProduct}:`, error);
            return null;
        }
    }
    
    /**
     * Check EOX status for a package
     * @param {string} packageName - Package name
     * @param {string} version - Package version
     * @param {string} ecosystem - Package ecosystem (npm, pypi, etc.)
     * @returns {Promise<Object>} EOX status
     */
    async checkEOX(packageName, version, ecosystem) {
        const result = {
            isEOL: false,
            isEOS: false,
            eolDate: null,
            eosDate: null,
            latestVersion: null,
            successor: null,
            support: null,
            lts: false,
            checkedAt: Date.now(),
            source: 'endoflife.date',
            productMatched: null
        };
        
        if (!packageName) return result;
        
        // Try to find a matching product
        const product = this.findProduct(packageName, ecosystem);
        if (!product) {
            return result;
        }
        
        result.productMatched = product;
        
        // Get product EOX data
        const eoxData = await this.getProductEOX(product);
        if (!eoxData || !Array.isArray(eoxData)) {
            return result;
        }
        
        // Find the matching version cycle
        const versionCycle = this.findVersionCycle(eoxData, version);
        if (!versionCycle) {
            // Use the latest cycle for general product EOX info
            const latestCycle = eoxData[0];
            if (latestCycle) {
                result.latestVersion = latestCycle.latest || latestCycle.cycle;
            }
            return result;
        }
        
        // Parse EOX dates and status
        const now = new Date();
        
        // EOL (End of Life) - no more updates of any kind
        if (versionCycle.eol !== undefined) {
            if (versionCycle.eol === true) {
                result.isEOL = true;
            } else if (versionCycle.eol === false) {
                result.isEOL = false;
            } else if (typeof versionCycle.eol === 'string') {
                const eolDate = new Date(versionCycle.eol);
                result.eolDate = versionCycle.eol;
                result.isEOL = eolDate <= now;
            }
        }
        
        // EOS (End of Support) - no more security updates
        // endoflife.date uses 'support' for active support and 'eol' for security support end
        if (versionCycle.support !== undefined) {
            if (versionCycle.support === true) {
                result.isEOS = false;
            } else if (versionCycle.support === false) {
                result.isEOS = true;
            } else if (typeof versionCycle.support === 'string') {
                const eosDate = new Date(versionCycle.support);
                result.eosDate = versionCycle.support;
                result.isEOS = eosDate <= now;
            }
        }
        
        // Additional metadata
        result.latestVersion = versionCycle.latest || null;
        result.lts = versionCycle.lts === true;
        result.support = versionCycle.support;
        
        // Check for successor/replacement
        if (versionCycle.link) {
            result.successor = versionCycle.link;
        }
        
        return result;
    }
    
    /**
     * Find the matching product identifier for a package
     * @param {string} packageName - Package name
     * @param {string} ecosystem - Package ecosystem
     * @returns {string|null} Product identifier or null
     */
    findProduct(packageName, ecosystem) {
        if (!packageName) return null;
        
        const normalizedName = packageName.toLowerCase().trim();
        const normalizedEcosystem = ecosystem ? ecosystem.toLowerCase().trim() : '';
        
        // Direct mapping lookup
        if (this.productMappings[normalizedName]) {
            return this.productMappings[normalizedName];
        }
        
        // Try with ecosystem prefix
        const withEcosystem = `${normalizedEcosystem}-${normalizedName}`;
        if (this.productMappings[withEcosystem]) {
            return this.productMappings[withEcosystem];
        }
        
        // Try common variations
        const variations = [
            normalizedName,
            normalizedName.replace(/-/g, ''),
            normalizedName.replace(/_/g, '-'),
            normalizedName.replace(/\./g, '-'),
            normalizedName.split('/').pop(), // Handle scoped packages like @org/package
        ];
        
        for (const variation of variations) {
            if (this.productMappings[variation]) {
                return this.productMappings[variation];
            }
        }
        
        // Check if it's directly a known product (async check against product list)
        // For now, return null if no mapping found
        return null;
    }
    
    /**
     * Find the version cycle that matches the given version
     * @param {Array} cycles - Array of version cycles from endoflife.date
     * @param {string} version - Version to match
     * @returns {Object|null} Matching cycle or null
     */
    findVersionCycle(cycles, version) {
        if (!cycles || !Array.isArray(cycles) || !version) return null;
        
        // Normalize version
        const normalizedVersion = version.replace(/^v/, '').trim();
        
        // Try exact match first
        for (const cycle of cycles) {
            if (cycle.cycle === normalizedVersion || cycle.cycle === version) {
                return cycle;
            }
        }
        
        // Try major.minor match
        const versionParts = normalizedVersion.split('.');
        if (versionParts.length >= 2) {
            const majorMinor = `${versionParts[0]}.${versionParts[1]}`;
            for (const cycle of cycles) {
                if (cycle.cycle === majorMinor) {
                    return cycle;
                }
            }
        }
        
        // Try major version match
        if (versionParts.length >= 1) {
            const major = versionParts[0];
            for (const cycle of cycles) {
                if (cycle.cycle === major || cycle.cycle === `${major}.x` || cycle.cycle === `${major}.0`) {
                    return cycle;
                }
            }
        }
        
        // Try to find a cycle where our version falls within the range
        for (const cycle of cycles) {
            if (this.versionInCycle(normalizedVersion, cycle)) {
                return cycle;
            }
        }
        
        return null;
    }
    
    /**
     * Check if a version falls within a cycle's range
     * @param {string} version - Version to check
     * @param {Object} cycle - Version cycle
     * @returns {boolean}
     */
    versionInCycle(version, cycle) {
        if (!cycle.cycle || !version) return false;
        
        const cycleParts = String(cycle.cycle).split('.');
        const versionParts = version.split('.');
        
        // Check if version starts with cycle prefix
        for (let i = 0; i < cycleParts.length && i < versionParts.length; i++) {
            if (cycleParts[i] !== versionParts[i] && cycleParts[i] !== 'x') {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Batch check EOX status for multiple packages
     * @param {Array<{name: string, version: string, ecosystem: string}>} packages
     * @param {Function} onProgress - Progress callback (processed, total)
     * @returns {Promise<Map<string, Object>>} Map of package key to EOX status
     */
    async checkEOXBatch(packages, onProgress = null) {
        const results = new Map();
        const total = packages.length;
        let processed = 0;
        
        // Process in batches to avoid overwhelming the API
        const batchSize = 10;
        
        for (let i = 0; i < packages.length; i += batchSize) {
            const batch = packages.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (pkg) => {
                const key = `${pkg.ecosystem || 'unknown'}:${pkg.name}@${pkg.version}`;
                try {
                    const eoxStatus = await this.checkEOX(pkg.name, pkg.version, pkg.ecosystem);
                    results.set(key, eoxStatus);
                } catch (error) {
                    console.warn(`Failed to check EOX for ${key}:`, error);
                    results.set(key, {
                        isEOL: false,
                        isEOS: false,
                        error: error.message,
                        checkedAt: Date.now()
                    });
                }
                
                processed++;
                if (onProgress) {
                    onProgress(processed, total);
                }
            }));
            
            // Small delay between batches to be nice to the API
            if (i + batchSize < packages.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    }
    
    /**
     * Fetch with timeout
     */
    async fetchWithTimeout(url, options = {}) {
        const timeout = this.requestTimeout;
        
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
            throw error;
        }
    }
    
    /**
     * Add a custom product mapping
     * @param {string} packageName - Package name to map
     * @param {string} product - endoflife.date product identifier
     */
    addProductMapping(packageName, product) {
        this.productMappings[packageName.toLowerCase()] = product.toLowerCase();
        this.reverseProductMappings = this.buildReverseMappings();
    }
    
    /**
     * Get the severity level for an EOX status
     * @param {Object} eoxStatus - EOX status object
     * @returns {string} Severity: 'high', 'medium', 'low', or 'none'
     */
    getEOXSeverity(eoxStatus) {
        if (!eoxStatus) return 'none';
        
        if (eoxStatus.isEOL) {
            return 'high'; // End of Life is high severity
        }
        
        if (eoxStatus.isEOS) {
            return 'medium'; // End of Support (security) is medium severity
        }
        
        // Check if EOL/EOS is coming soon (within 6 months)
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
        
        if (eoxStatus.eolDate) {
            const eolDate = new Date(eoxStatus.eolDate);
            if (eolDate <= sixMonthsFromNow) {
                return 'low'; // EOL coming soon
            }
        }
        
        if (eoxStatus.eosDate) {
            const eosDate = new Date(eoxStatus.eosDate);
            if (eosDate <= sixMonthsFromNow) {
                return 'low'; // EOS coming soon
            }
        }
        
        return 'none';
    }
    
    /**
     * Format EOX status for display
     * @param {Object} eoxStatus - EOX status object
     * @returns {string} Human-readable status
     */
    formatEOXStatus(eoxStatus) {
        if (!eoxStatus) return 'Unknown';
        
        if (eoxStatus.isEOL) {
            return eoxStatus.eolDate 
                ? `End of Life (${eoxStatus.eolDate})`
                : 'End of Life';
        }
        
        if (eoxStatus.isEOS) {
            return eoxStatus.eosDate
                ? `End of Support (${eoxStatus.eosDate})`
                : 'End of Support';
        }
        
        if (eoxStatus.eolDate || eoxStatus.eosDate) {
            const dates = [];
            if (eoxStatus.eosDate) dates.push(`EOS: ${eoxStatus.eosDate}`);
            if (eoxStatus.eolDate) dates.push(`EOL: ${eoxStatus.eolDate}`);
            return `Active (${dates.join(', ')})`;
        }
        
        return 'Active';
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.EOXService = EOXService;
    window.eoxService = new EOXService();
}

