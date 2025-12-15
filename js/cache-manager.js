/**
 * Cache Manager - Unified caching layer for all services
 * Provides consistent cache checking across the entire application
 */
class CacheManager {
    constructor() {
        this.memoryCache = new Map(); // In-memory cache for current session
        this.cacheExpiry = {
            authors: 7 * 24 * 60 * 60 * 1000,  // 7 days
            vulnerabilities: 24 * 60 * 60 * 1000,  // 1 day
            packages: 7 * 24 * 60 * 60 * 1000  // 7 days
        };
    }

    /**
     * Check if cached data is still valid
     */
    isCacheValid(timestamp, cacheType = 'authors') {
        if (!timestamp) return false;
        const expiry = this.cacheExpiry[cacheType] || this.cacheExpiry.authors;
        const age = Date.now() - new Date(timestamp).getTime();
        return age < expiry;
    }

    /**
     * Get from memory cache
     */
    getFromMemory(key) {
        return this.memoryCache.get(key);
    }

    /**
     * Set in memory cache
     */
    setInMemory(key, value) {
        this.memoryCache.set(key, value);
    }

    /**
     * ============================================
     * AUTHOR CACHE METHODS
     * ============================================
     */

    /**
     * Get author entity from cache
     * @param {string} authorKey - Format: ecosystem:authorName
     * @returns {Promise<Object|null>} - Cached author entity or null
     */
    async getAuthorEntity(authorKey) {
        // Check memory cache first
        const memoryKey = `author:${authorKey}`;
        const cached = this.memoryCache.get(memoryKey);
        if (cached) {
            return cached;
        }

        // Check IndexedDB
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                const entity = await dbManager.getAuthorEntity(authorKey);
                if (entity && this.isCacheValid(entity.timestamp, 'authors')) {
                    // Store in memory for faster access
                    this.memoryCache.set(memoryKey, entity);
                    return entity;
                }
            } catch (error) {
                console.warn('⚠️ Cache: Failed to get author entity:', error);
            }
        }
        return null;
    }

    /**
     * Save author entity to cache
     * @param {string} authorKey - Format: ecosystem:authorName
     * @param {Object} authorData - Author entity data
     */
    async saveAuthorEntity(authorKey, authorData) {
        // Store in memory
        const memoryKey = `author:${authorKey}`;
        this.memoryCache.set(memoryKey, { ...authorData, timestamp: new Date().toISOString() });

        // Store in IndexedDB
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                await dbManager.saveAuthorEntity(authorKey, authorData);
            } catch (error) {
                console.warn('⚠️ Cache: Failed to save author entity:', error);
            }
        }
    }

    /**
     * Find author entity by email in the same ecosystem
     * Used for correlating authors (e.g., "Kyle Robinson Young" with "shama" if same email)
     * @param {string} email - Email address to search for
     * @param {string} ecosystem - Ecosystem to filter by
     * @returns {Promise<{authorKey: string, entity: Object}|null>} - Found author or null
     */
    async findAuthorByEmail(email, ecosystem) {
        if (!email || !ecosystem) return null;
        
        const dbManager = window.indexedDBManager;
        if (!dbManager || !dbManager.db) {
            return null;
        }

        try {
            // Use email index if available for faster lookup
            const transaction = dbManager.db.transaction(['authorEntities'], 'readonly');
            const store = transaction.objectStore('authorEntities');
            let index;
            try {
                index = store.index('email');
            } catch (e) {
                // Index might not exist, fall back to getAll
                const allAuthors = await dbManager.getAllAuthorEntities();
                if (!allAuthors || !Array.isArray(allAuthors)) {
                    return null;
                }
                
                for (const authorData of allAuthors) {
                    if (!authorData || !authorData.authorKey) {
                        continue;
                    }
                    
                    const authorKey = authorData.authorKey;
                    const [authorEcosystem] = authorKey.split(':');
                    
                    if (authorEcosystem === ecosystem && authorData.email === email) {
                        return {
                            authorKey: authorKey,
                            entity: authorData
                        };
                    }
                }
                return null;
            }
            
            // Use index for faster lookup
            const request = index.getAll(email);
            const results = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (!results || results.length === 0) {
                return null;
            }
            
            // Find matching ecosystem
            for (const authorData of results) {
                if (!authorData || !authorData.authorKey) {
                    continue;
                }
                
                const authorKey = authorData.authorKey;
                const [authorEcosystem] = authorKey.split(':');
                
                if (authorEcosystem === ecosystem) {
                    return {
                        authorKey: authorKey,
                        entity: authorData
                    };
                }
            }
            
            return null;
        } catch (error) {
            console.warn('⚠️ Cache: Failed to find author by email:', error);
            return null;
        }
    }

    /**
     * Find author entity by GitHub username (across all ecosystems)
     * Used for correlating authors with same GitHub profile (e.g., same person across npm, pypi, etc.)
     * @param {string} githubUsername - GitHub username to search for
     * @returns {Promise<{authorKey: string, entity: Object}|null>} - Found author or null
     */
    async findAuthorByGitHub(githubUsername) {
        if (!githubUsername) return null;
        
        const dbManager = window.indexedDBManager;
        if (!dbManager || !dbManager.db) {
            return null;
        }

        try {
            // Use github index if available for faster lookup
            const transaction = dbManager.db.transaction(['authorEntities'], 'readonly');
            const store = transaction.objectStore('authorEntities');
            let index;
            try {
                index = store.index('github');
            } catch (e) {
                // Index might not exist, fall back to getAll
                const allAuthors = await dbManager.getAllAuthorEntities();
                if (!allAuthors || !Array.isArray(allAuthors)) {
                    return null;
                }
                
                for (const authorData of allAuthors) {
                    if (!authorData || !authorData.authorKey || !authorData.metadata) {
                        continue;
                    }
                    
                    if (authorData.metadata.github === githubUsername) {
                        return {
                            authorKey: authorData.authorKey,
                            entity: authorData
                        };
                    }
                }
                return null;
            }
            
            // Use index for faster lookup
            const request = index.getAll(githubUsername);
            const results = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (!results || results.length === 0) {
                return null;
            }
            
            // Return first match (GitHub username should be unique)
            // Prefer author with more complete data (location, email, etc.)
            let bestMatch = null;
            let bestScore = 0;
            
            for (const authorData of results) {
                if (!authorData || !authorData.authorKey) {
                    continue;
                }
                
                // Score based on data completeness
                let score = 0;
                if (authorData.email) score += 2;
                if (authorData.metadata?.location) score += 1;
                if (authorData.metadata?.company) score += 1;
                if (authorData.metadata && Object.keys(authorData.metadata).length > 1) score += 1;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = authorData;
                }
            }
            
            if (bestMatch) {
                return {
                    authorKey: bestMatch.authorKey,
                    entity: bestMatch
                };
            }
            
            return null;
        } catch (error) {
            console.warn('⚠️ Cache: Failed to find author by GitHub:', error);
            return null;
        }
    }

    /**
     * Helper to promisify IndexedDB requests
     */
    _promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get authors for a package (from packageAuthors junction table)
     * @param {string} packageKey - Format: ecosystem:packageName
     * @returns {Promise<Array>} - Array of author entities
     */
    async getPackageAuthors(packageKey) {
        const dbManager = window.indexedDBManager;
        if (!dbManager || !dbManager.db) {
            return [];
        }

        try {
            // Get relationships
            const relationships = await dbManager.getPackageAuthors(packageKey);
            
            // Fetch author entities
            const authors = await Promise.all(
                relationships.map(async (rel) => {
                    const authorEntity = await this.getAuthorEntity(rel.authorKey);
                    if (authorEntity) {
                        return {
                            ...authorEntity,
                            isMaintainer: rel.isMaintainer || false
                        };
                    }
                    return null;
                })
            );

            return authors.filter(a => a !== null);
        } catch (error) {
            console.warn('⚠️ Cache: Failed to get package authors:', error);
            return [];
        }
    }

    /**
     * Save package-author relationship
     * @param {string} packageKey - Format: ecosystem:packageName
     * @param {string} authorKey - Format: ecosystem:authorName
     * @param {boolean} isMaintainer - Whether author is maintainer
     */
    async savePackageAuthorRelationship(packageKey, authorKey, isMaintainer = false) {
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                await dbManager.savePackageAuthor(packageKey, authorKey, isMaintainer);
            } catch (error) {
                console.warn('⚠️ Cache: Failed to save package-author relationship:', error);
            }
        }
    }

    /**
     * ============================================
     * PACKAGE CACHE METHODS
     * ============================================
     */

    /**
     * Get package metadata from cache
     * @param {string} packageKey - Format: ecosystem:packageName
     * @returns {Promise<Object|null>} - Cached package data or null
     */
    async getPackage(packageKey) {
        // Check memory cache first
        const memoryKey = `package:${packageKey}`;
        const cached = this.memoryCache.get(memoryKey);
        if (cached) {
            return cached;
        }

        // Check IndexedDB
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                const pkg = await dbManager.getPackage(packageKey);
                if (pkg && this.isCacheValid(pkg.timestamp, 'packages')) {
                    // Store in memory
                    this.memoryCache.set(memoryKey, pkg);
                    return pkg;
                }
            } catch (error) {
                console.warn('⚠️ Cache: Failed to get package:', error);
            }
        }
        return null;
    }

    /**
     * Save package metadata to cache
     * @param {string} packageKey - Format: ecosystem:packageName
     * @param {Object} packageData - Package metadata
     */
    async savePackage(packageKey, packageData) {
        // Store in memory
        const memoryKey = `package:${packageKey}`;
        this.memoryCache.set(memoryKey, { ...packageData, timestamp: new Date().toISOString() });

        // Store in IndexedDB
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                await dbManager.savePackage(packageKey, packageData);
            } catch (error) {
                console.warn('⚠️ Cache: Failed to save package:', error);
            }
        }
    }

    /**
     * ============================================
     * VULNERABILITY CACHE METHODS
     * ============================================
     */

    /**
     * Get vulnerability data from cache
     * @param {string} packageKey - Format: packageName@version or ecosystem:packageName@version
     * @returns {Promise<Object|null>} - Cached vulnerability data or null
     */
    async getVulnerability(packageKey) {
        // Check memory cache first
        const memoryKey = `vuln:${packageKey}`;
        const cached = this.memoryCache.get(memoryKey);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry.vulnerabilities) {
            return cached.data;
        }

        // Check IndexedDB
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                const vuln = await dbManager.getVulnerability(packageKey);
                if (vuln && this.isCacheValid(vuln.timestamp, 'vulnerabilities')) {
                    // Store in memory
                    this.memoryCache.set(memoryKey, {
                        data: vuln,
                        timestamp: Date.now()
                    });
                    return vuln;
                }
            } catch (error) {
                console.warn('⚠️ Cache: Failed to get vulnerability:', error);
            }
        }
        return null;
    }

    /**
     * Save vulnerability data to cache
     * @param {string} packageKey - Format: packageName@version or ecosystem:packageName@version
     * @param {Object} vulnerabilityData - Vulnerability data
     */
    async saveVulnerability(packageKey, vulnerabilityData) {
        // Store in memory
        const memoryKey = `vuln:${packageKey}`;
        this.memoryCache.set(memoryKey, {
            data: vulnerabilityData,
            timestamp: Date.now()
        });

        // Store in IndexedDB
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                await dbManager.saveVulnerability(packageKey, vulnerabilityData);
            } catch (error) {
                console.warn('⚠️ Cache: Failed to save vulnerability:', error);
            }
        }
    }

    /**
     * ============================================
     * GITHUB REPOSITORY CACHE METHODS
     * ============================================
     */

    /**
     * Get GitHub repository info from cache
     * @param {string} repoKey - Format: owner/repo
     * @returns {Promise<Object|null>} - Cached repository info or null
     */
    async getGitHubRepo(repoKey) {
        const memoryKey = `github-repo:${repoKey}`;
        const cached = this.memoryCache.get(memoryKey);
        if (cached) {
            return cached.data;
        }
        return null;
    }

    /**
     * Save GitHub repository info to cache
     * @param {string} repoKey - Format: owner/repo
     * @param {Object} repoData - Repository data from GitHub API
     */
    async saveGitHubRepo(repoKey, repoData) {
        const memoryKey = `github-repo:${repoKey}`;
        this.memoryCache.set(memoryKey, {
            data: repoData,
            timestamp: Date.now()
        });
    }

    /**
     * ============================================
     * EOX (END-OF-LIFE) CACHE METHODS
     * ============================================
     */

    /**
     * Get EOX product list from cache
     * @returns {Promise<Object|null>} - Cached product list or null
     */
    async getEOXProductList() {
        const memoryKey = 'eox:productList';
        const cached = this.memoryCache.get(memoryKey);
        if (cached && this.isCacheValid(cached.fetchedAt, 'packages')) {
            return cached;
        }

        // Check IndexedDB
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                const transaction = dbManager.db.transaction(['eoxData'], 'readonly');
                const store = transaction.objectStore('eoxData');
                const request = store.get('productList');
                const result = await this._promisifyRequest(request);
                if (result && result.fetchedAt && this.isCacheValid(result.fetchedAt, 'packages')) {
                    this.memoryCache.set(memoryKey, result);
                    return result;
                }
            } catch (error) {
                console.debug('⚠️ Cache: Failed to get EOX product list:', error);
            }
        }
        return null;
    }

    /**
     * Save EOX product list to cache
     * @param {Object} productListData - { products: [], fetchedAt: timestamp }
     */
    async saveEOXProductList(productListData) {
        const memoryKey = 'eox:productList';
        this.memoryCache.set(memoryKey, productListData);

        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                const transaction = dbManager.db.transaction(['eoxData'], 'readwrite');
                const store = transaction.objectStore('eoxData');
                await this._promisifyRequest(store.put({ 
                    key: 'productList', 
                    ...productListData 
                }));
            } catch (error) {
                console.debug('⚠️ Cache: Failed to save EOX product list:', error);
            }
        }
    }

    /**
     * Get EOX data for a specific product from cache
     * @param {string} product - Product identifier (e.g., 'python', 'nodejs')
     * @returns {Promise<Object|null>} - Cached EOX data or null
     */
    async getEOXProduct(product) {
        const memoryKey = `eox:product:${product}`;
        const cached = this.memoryCache.get(memoryKey);
        if (cached && this.isCacheValid(cached.fetchedAt, 'packages')) {
            return cached;
        }

        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                const transaction = dbManager.db.transaction(['eoxData'], 'readonly');
                const store = transaction.objectStore('eoxData');
                const request = store.get(`product:${product}`);
                const result = await this._promisifyRequest(request);
                if (result && result.fetchedAt && this.isCacheValid(result.fetchedAt, 'packages')) {
                    this.memoryCache.set(memoryKey, result);
                    return result;
                }
            } catch (error) {
                console.debug(`⚠️ Cache: Failed to get EOX product ${product}:`, error);
            }
        }
        return null;
    }

    /**
     * Save EOX data for a specific product to cache
     * @param {string} product - Product identifier
     * @param {Object} productData - { data: [], fetchedAt: timestamp }
     */
    async saveEOXProduct(product, productData) {
        const memoryKey = `eox:product:${product}`;
        this.memoryCache.set(memoryKey, productData);

        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                const transaction = dbManager.db.transaction(['eoxData'], 'readwrite');
                const store = transaction.objectStore('eoxData');
                await this._promisifyRequest(store.put({ 
                    key: `product:${product}`, 
                    ...productData 
                }));
            } catch (error) {
                console.debug(`⚠️ Cache: Failed to save EOX product ${product}:`, error);
            }
        }
    }

    /**
     * ============================================
     * LEGACY SUPPORT (for backward compatibility)
     * ============================================
     */

    /**
     * Get cached authors by packageKey (legacy format)
     * This maintains backward compatibility with old cache structure
     */
    async getCachedAuthorsByPackage(packageKey) {
        // First try new structure (packageAuthors)
        const authors = await this.getPackageAuthors(packageKey);
        if (authors.length > 0) {
            return authors;
        }

        // Fallback to old structure (authors store by packageKey)
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            try {
                const transaction = dbManager.db.transaction(['authors'], 'readonly');
                const store = transaction.objectStore('authors');
                const request = store.get(packageKey);
                const result = await new Promise((resolve, reject) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                if (result && this.isCacheValid(result.timestamp, 'authors')) {
                    // Convert old format to new format
                    const authorData = result.data || result.authors || [];
                    if (Array.isArray(authorData)) {
                        return authorData;
                    }
                    return [];
                }
            } catch (error) {
                console.warn('⚠️ Cache: Failed to get cached authors (legacy):', error);
            }
        }
        return null;
    }

    /**
     * Clear memory cache
     */
    clearMemoryCache() {
        this.memoryCache.clear();
    }

    /**
     * Clear specific cache type
     */
    async clearCache(cacheType) {
        const dbManager = window.indexedDBManager;
        if (!dbManager || !dbManager.db) {
            return false;
        }

        const storeMap = {
            'authors': 'authorEntities',
            'packages': 'packages',
            'vulnerabilities': 'vulnerabilities',
            'all': null  // Will be handled specially
        };

        if (cacheType === 'all') {
            await Promise.all([
                dbManager.clearCacheStore('authorEntities'),
                dbManager.clearCacheStore('packages'),
                dbManager.clearCacheStore('vulnerabilities'),
                dbManager.clearCacheStore('packageAuthors')
            ]);
            this.clearMemoryCache();
            return true;
        }

        const storeName = storeMap[cacheType];
        if (storeName) {
            await dbManager.clearCacheStore(storeName);
            // Clear related memory cache entries
            if (cacheType === 'authors') {
                for (const [key] of this.memoryCache) {
                    if (key.startsWith('author:')) {
                        this.memoryCache.delete(key);
                    }
                }
            } else if (cacheType === 'packages') {
                for (const [key] of this.memoryCache) {
                    if (key.startsWith('package:')) {
                        this.memoryCache.delete(key);
                    }
                }
            } else if (cacheType === 'vulnerabilities') {
                for (const [key] of this.memoryCache) {
                    if (key.startsWith('vuln:')) {
                        this.memoryCache.delete(key);
                    }
                }
            }
            return true;
        }

        return false;
    }
}

// Create global instance
window.CacheManager = CacheManager;
window.cacheManager = new CacheManager();

