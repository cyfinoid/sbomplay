/**
 * Author Service - Fetches author data from ecosyste.ms API
 */
class AuthorService {
    constructor() {
        this.baseUrl = 'https://packages.ecosyste.ms/api/v1';
        this.cache = new Map();
    }

    /**
     * Fetch authors for a package
     * @param {string} ecosystem - e.g., 'npm', 'pypi', 'maven'
     * @param {string} packageName - package name
     * @returns {Promise<Array>} - array of author names
     */
    async fetchAuthors(ecosystem, packageName) {
        const packageKey = `${ecosystem}:${packageName}`;
        
        // Check memory cache first
        if (this.cache.has(packageKey)) {
            return this.cache.get(packageKey);
        }
        
        // Check IndexedDB cache
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            const cached = await this.getCachedAuthors(packageKey);
            if (cached && this.isCacheValid(cached.timestamp)) {
                this.cache.set(packageKey, cached.authors);
                return cached.authors;
            }
        }
        
        // Fetch from ecosyste.ms
        try {
            const url = `${this.baseUrl}/registries/${ecosystem}/packages/${encodeURIComponent(packageName)}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                // If API returns error, return empty array
                console.warn(`API returned ${response.status} for ${packageKey}`);
                return [];
            }
            
            const data = await response.json();
            const authors = this.extractAuthors(data);
            
            // Cache in IndexedDB
            if (dbManager && dbManager.db) {
                await this.cacheAuthors({
                    packageKey,
                    ecosystem,
                    packageName,
                    authors,
                    source: 'ecosystems',
                    timestamp: Date.now()
                });
            }
            
            this.cache.set(packageKey, authors);
            return authors;
            
        } catch (error) {
            console.warn(`Failed to fetch authors for ${packageKey}:`, error.message);
            // Return empty array on failure
            return [];
        }
    }

    /**
     * Extract authors from ecosyste.ms response
     */
    extractAuthors(data) {
        const authors = [];
        
        // Check various author fields
        if (data.maintainers && Array.isArray(data.maintainers)) {
            authors.push(...data.maintainers.map(m => m.name || m.email || m));
        }
        if (data.owners && Array.isArray(data.owners)) {
            authors.push(...data.owners.map(o => o.name || o.email || o));
        }
        if (data.author) {
            authors.push(typeof data.author === 'string' ? data.author : data.author.name);
        }
        
        // Deduplicate and clean
        return [...new Set(authors.filter(Boolean))];
    }

    /**
     * Check if cache is still valid (24 hours)
     */
    isCacheValid(timestamp) {
        const oneDay = 24 * 60 * 60 * 1000;
        return Date.now() - timestamp < oneDay;
    }

    /**
     * Batch fetch authors for multiple packages
     */
    async fetchAuthorsForPackages(packages, onProgress) {
        const results = new Map();
        let processed = 0;
        
        for (const pkg of packages) {
            const authors = await this.fetchAuthors(pkg.ecosystem, pkg.name);
            
            // Store with ecosystem prefix
            authors.forEach(author => {
                const authorKey = `${pkg.ecosystem}:${author}`;
                if (!results.has(authorKey)) {
                    results.set(authorKey, {
                        author,
                        ecosystem: pkg.ecosystem,
                        count: 0,
                        packages: []
                    });
                }
                const entry = results.get(authorKey);
                entry.count++;
                entry.packages.push(pkg.name);
            });
            
            processed++;
            if (onProgress) {
                onProgress(processed, packages.length);
            }
            
            // Rate limiting: wait 100ms between requests
            await this.sleep(100);
        }
        
        return results;
    }

    /**
     * Get cached authors from IndexedDB
     */
    async getCachedAuthors(packageKey) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = window.indexedDBManager.db.transaction(['authors'], 'readonly');
                const store = transaction.objectStore('authors');
                const request = store.get(packageKey);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                resolve(null);
            }
        });
    }

    /**
     * Cache authors in IndexedDB
     */
    async cacheAuthors(data) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = window.indexedDBManager.db.transaction(['authors'], 'readwrite');
                const store = transaction.objectStore('authors');
                const request = store.put(data);
                
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            } catch (error) {
                console.warn('Failed to cache authors:', error);
                resolve(false);
            }
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

window.AuthorService = AuthorService;

