/**
 * IndexedDB Manager - Handles IndexedDB operations for SBOM Play
 */
class IndexedDBManager {
    constructor() {
        this.dbName = 'sbomplay_db';
        this.version = 3; // Bump version for new normalized schema
        this.db = null;
    }

    /**
     * Initialize IndexedDB connection
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('❌ Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('🔄 Upgrading IndexedDB schema...');

                // Create object stores
                if (!db.objectStoreNames.contains('organizations')) {
                    const orgStore = db.createObjectStore('organizations', { keyPath: 'name' });
                    orgStore.createIndex('timestamp', 'timestamp', { unique: false });
                    orgStore.createIndex('type', 'type', { unique: false });
                    console.log('✅ Created organizations object store');
                }

                if (!db.objectStoreNames.contains('repositories')) {
                    const repoStore = db.createObjectStore('repositories', { keyPath: 'fullName' });
                    repoStore.createIndex('timestamp', 'timestamp', { unique: false });
                    repoStore.createIndex('type', 'type', { unique: false });
                    console.log('✅ Created repositories object store');
                }

                if (!db.objectStoreNames.contains('vulnerabilities')) {
                    const vulnStore = db.createObjectStore('vulnerabilities', { keyPath: 'packageKey' });
                    vulnStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ Created vulnerabilities object store');
                }

                if (!db.objectStoreNames.contains('metadata')) {
                    const metaStore = db.createObjectStore('metadata', { keyPath: 'key' });
                    console.log('✅ Created metadata object store');
                }

                if (!db.objectStoreNames.contains('authors')) {
                    const authorStore = db.createObjectStore('authors', { keyPath: 'packageKey' });
                    authorStore.createIndex('ecosystem', 'ecosystem', { unique: false });
                    authorStore.createIndex('author', 'author', { unique: false });
                    authorStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ Created authors object store');
                }

                // NEW: Global package metadata cache
                if (!db.objectStoreNames.contains('packages')) {
                    const packageStore = db.createObjectStore('packages', { keyPath: 'packageKey' });
                    packageStore.createIndex('ecosystem', 'ecosystem', { unique: false });
                    packageStore.createIndex('name', 'name', { unique: false });
                    packageStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ Created packages object store');
                }

                // NEW: Junction table for package-author relationships
                if (!db.objectStoreNames.contains('packageAuthors')) {
                    const pkgAuthorStore = db.createObjectStore('packageAuthors', { keyPath: 'packageAuthorKey' });
                    pkgAuthorStore.createIndex('packageKey', 'packageKey', { unique: false });
                    pkgAuthorStore.createIndex('authorKey', 'authorKey', { unique: false });
                    pkgAuthorStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ Created packageAuthors object store');
                }

                // NEW: Global author entity cache (by authorKey, not packageKey)
                if (!db.objectStoreNames.contains('authorEntities')) {
                    const authorEntityStore = db.createObjectStore('authorEntities', { keyPath: 'authorKey' });
                    authorEntityStore.createIndex('ecosystem', 'ecosystem', { unique: false });
                    authorEntityStore.createIndex('author', 'author', { unique: false });
                    authorEntityStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ Created authorEntities object store');
                }
            };
        });
    }

    /**
     * Save organization analysis data
     */
    async saveOrganization(name, data) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['organizations'], 'readwrite');
            const store = transaction.objectStore('organizations');
            
            const entry = {
                name: name,
                organization: name,
                timestamp: data.timestamp || new Date().toISOString(),
                data: data.data || data,
                type: 'organization',
                statistics: data.data?.statistics || data.statistics
            };

            await this._promisifyRequest(store.put(entry));
            console.log(`✅ Saved organization: ${name}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to save organization:', error);
            return false;
        }
    }

    /**
     * Save repository analysis data
     */
    async saveRepository(fullName, data) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['repositories'], 'readwrite');
            const store = transaction.objectStore('repositories');
            
            const entry = {
                fullName: fullName,
                timestamp: data.timestamp || new Date().toISOString(),
                data: data.data || data,
                type: 'repository',
                statistics: data.data?.statistics || data.statistics
            };

            await this._promisifyRequest(store.put(entry));
            console.log(`✅ Saved repository: ${fullName}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to save repository:', error);
            return false;
        }
    }

    /**
     * Get organization data
     */
    async getOrganization(name) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return null;
            }
            const transaction = this.db.transaction(['organizations'], 'readonly');
            const store = transaction.objectStore('organizations');
            const result = await this._promisifyRequest(store.get(name));
            return result || null;
        } catch (error) {
            console.error('❌ Failed to get organization:', error);
            return null;
        }
    }

    /**
     * Get repository data
     */
    async getRepository(fullName) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return null;
            }
            const transaction = this.db.transaction(['repositories'], 'readonly');
            const store = transaction.objectStore('repositories');
            const result = await this._promisifyRequest(store.get(fullName));
            return result || null;
        } catch (error) {
            console.error('❌ Failed to get repository:', error);
            return null;
        }
    }

    /**
     * Get all organizations
     */
    async getAllOrganizations() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return [];
            }
            const transaction = this.db.transaction(['organizations'], 'readonly');
            const store = transaction.objectStore('organizations');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all organizations:', error);
            return [];
        }
    }

    /**
     * Get all repositories
     */
    async getAllRepositories() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return [];
            }
            const transaction = this.db.transaction(['repositories'], 'readonly');
            const store = transaction.objectStore('repositories');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all repositories:', error);
            return [];
        }
    }

    /**
     * Get all entries (organizations and repositories combined)
     */
    async getAllEntries() {
        try {
            const orgs = await this.getAllOrganizations();
            const repos = await this.getAllRepositories();
            
            // Combine and sort by timestamp (newest first)
            const combined = [...orgs, ...repos].sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );
            
            return combined;
        } catch (error) {
            console.error('❌ Failed to get all entries:', error);
            return [];
        }
    }

    /**
     * Delete an entry (organization or repository)
     */
    async deleteEntry(name) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            // Try to delete from organizations first
            const isRepo = name.includes('/');
            const storeName = isRepo ? 'repositories' : 'organizations';
            const keyName = isRepo ? name : name; // fullName for repos, name for orgs
            
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            await this._promisifyRequest(store.delete(keyName));
            
            console.log(`✅ Deleted entry: ${name}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to delete entry:', error);
            return false;
        }
    }

    /**
     * Clear all data
     */
    async clearAll() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(
                ['organizations', 'repositories', 'vulnerabilities', 'metadata', 'authors', 
                 'packages', 'packageAuthors', 'authorEntities'], 
                'readwrite'
            );
            
            await Promise.all([
                this._promisifyRequest(transaction.objectStore('organizations').clear()),
                this._promisifyRequest(transaction.objectStore('repositories').clear()),
                this._promisifyRequest(transaction.objectStore('vulnerabilities').clear()),
                this._promisifyRequest(transaction.objectStore('metadata').clear()),
                this._promisifyRequest(transaction.objectStore('authors').clear()),
                this._promisifyRequest(transaction.objectStore('packages').clear()),
                this._promisifyRequest(transaction.objectStore('packageAuthors').clear()),
                this._promisifyRequest(transaction.objectStore('authorEntities').clear())
            ]);
            
            console.log('✅ Cleared all IndexedDB data');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear all data:', error);
            return false;
        }
    }

    /**
     * ============================================
     * GLOBAL ENTITY CACHE METHODS (New Architecture)
     * ============================================
     */

    /**
     * Save package metadata to global cache
     */
    async savePackage(packageKey, packageData) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['packages'], 'readwrite');
            const store = transaction.objectStore('packages');
            
            const entry = {
                packageKey: packageKey,
                ...packageData,
                timestamp: new Date().toISOString()
            };

            await this._promisifyRequest(store.put(entry));
            return true;
        } catch (error) {
            console.error('❌ Failed to save package:', error);
            return false;
        }
    }

    /**
     * Batch save multiple packages in a single transaction
     */
    async batchSavePackages(packages) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            if (!packages || packages.length === 0) {
                return true;
            }
            
            const transaction = this.db.transaction(['packages'], 'readwrite');
            const store = transaction.objectStore('packages');
            
            const timestamp = new Date().toISOString();
            const promises = packages.map(([packageKey, packageData]) => {
                const entry = {
                    packageKey: packageKey,
                    ...packageData,
                    timestamp: timestamp
                };
                return this._promisifyRequest(store.put(entry));
            });

            await Promise.all(promises);
            console.log(`✅ Batch saved ${packages.length} packages`);
            return true;
        } catch (error) {
            console.error('❌ Failed to batch save packages:', error);
            return false;
        }
    }

    /**
     * Get package metadata from global cache
     */
    async getPackage(packageKey) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return null;
            }
            const transaction = this.db.transaction(['packages'], 'readonly');
            const store = transaction.objectStore('packages');
            const result = await this._promisifyRequest(store.get(packageKey));
            return result || null;
        } catch (error) {
            console.error('❌ Failed to get package:', error);
            return null;
        }
    }

    /**
     * Save author entity to global cache
     */
    async saveAuthorEntity(authorKey, authorData) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['authorEntities'], 'readwrite');
            const store = transaction.objectStore('authorEntities');
            
            const entry = {
                authorKey: authorKey,
                ...authorData,
                timestamp: new Date().toISOString()
            };

            await this._promisifyRequest(store.put(entry));
            return true;
        } catch (error) {
            console.error('❌ Failed to save author entity:', error);
            return false;
        }
    }

    /**
     * Batch save multiple author entities in a single transaction
     */
    async batchSaveAuthorEntities(authorEntities) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            if (!authorEntities || authorEntities.length === 0) {
                return true;
            }
            
            const transaction = this.db.transaction(['authorEntities'], 'readwrite');
            const store = transaction.objectStore('authorEntities');
            
            const timestamp = new Date().toISOString();
            const promises = authorEntities.map(([authorKey, authorData]) => {
                const entry = {
                    authorKey: authorKey,
                    ...authorData,
                    timestamp: timestamp
                };
                return this._promisifyRequest(store.put(entry));
            });

            await Promise.all(promises);
            console.log(`✅ Batch saved ${authorEntities.length} author entities`);
            return true;
        } catch (error) {
            console.error('❌ Failed to batch save author entities:', error);
            return false;
        }
    }

    /**
     * Get author entity from global cache
     */
    async getAuthorEntity(authorKey) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return null;
            }
            const transaction = this.db.transaction(['authorEntities'], 'readonly');
            const store = transaction.objectStore('authorEntities');
            const result = await this._promisifyRequest(store.get(authorKey));
            return result || null;
        } catch (error) {
            console.error('❌ Failed to get author entity:', error);
            return null;
        }
    }

    /**
     * Save package-author relationship
     */
    async savePackageAuthor(packageKey, authorKey, isMaintainer = false) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['packageAuthors'], 'readwrite');
            const store = transaction.objectStore('packageAuthors');
            
            const packageAuthorKey = `${packageKey}:${authorKey}`;
            const entry = {
                packageAuthorKey: packageAuthorKey,
                packageKey: packageKey,
                authorKey: authorKey,
                isMaintainer: isMaintainer,
                timestamp: new Date().toISOString()
            };

            await this._promisifyRequest(store.put(entry));
            return true;
        } catch (error) {
            console.error('❌ Failed to save package-author relationship:', error);
            return false;
        }
    }

    /**
     * Batch save multiple package-author relationships in a single transaction
     */
    async batchSavePackageAuthors(relationships) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            if (!relationships || relationships.length === 0) {
                return true;
            }
            
            const transaction = this.db.transaction(['packageAuthors'], 'readwrite');
            const store = transaction.objectStore('packageAuthors');
            
            const timestamp = new Date().toISOString();
            const promises = relationships.map(({ packageKey, authorKey, isMaintainer = false }) => {
                const packageAuthorKey = `${packageKey}:${authorKey}`;
                const entry = {
                    packageAuthorKey: packageAuthorKey,
                    packageKey: packageKey,
                    authorKey: authorKey,
                    isMaintainer: isMaintainer,
                    timestamp: timestamp
                };
                return this._promisifyRequest(store.put(entry));
            });

            await Promise.all(promises);
            console.log(`✅ Batch saved ${relationships.length} package-author relationships`);
            return true;
        } catch (error) {
            console.error('❌ Failed to batch save package-author relationships:', error);
            return false;
        }
    }

    /**
     * Get all authors for a package
     */
    async getPackageAuthors(packageKey) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return [];
            }
            const transaction = this.db.transaction(['packageAuthors'], 'readonly');
            const store = transaction.objectStore('packageAuthors');
            const index = store.index('packageKey');
            const result = await this._promisifyRequest(index.getAll(packageKey));
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get package authors:', error);
            return [];
        }
    }

    /**
     * Get all packages for an author
     */
    async getAuthorPackages(authorKey) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return [];
            }
            const transaction = this.db.transaction(['packageAuthors'], 'readonly');
            const store = transaction.objectStore('packageAuthors');
            const index = store.index('authorKey');
            const result = await this._promisifyRequest(index.getAll(authorKey));
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get author packages:', error);
            return [];
        }
    }

    /**
     * Get cache statistics
     */
    async getCacheStats() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return null;
            }
            
            const [packages, authorEntities, packageAuthors, vulnerabilities, organizations, repositories] = await Promise.all([
                this._promisifyRequest(this.db.transaction(['packages'], 'readonly').objectStore('packages').count()),
                this._promisifyRequest(this.db.transaction(['authorEntities'], 'readonly').objectStore('authorEntities').count()),
                this._promisifyRequest(this.db.transaction(['packageAuthors'], 'readonly').objectStore('packageAuthors').count()),
                this._promisifyRequest(this.db.transaction(['vulnerabilities'], 'readonly').objectStore('vulnerabilities').count()),
                this._promisifyRequest(this.db.transaction(['organizations'], 'readonly').objectStore('organizations').count()),
                this._promisifyRequest(this.db.transaction(['repositories'], 'readonly').objectStore('repositories').count())
            ]);

            return {
                packages: packages || 0,
                authorEntities: authorEntities || 0,
                packageAuthors: packageAuthors || 0,
                vulnerabilities: vulnerabilities || 0,
                organizations: organizations || 0,
                repositories: repositories || 0
            };
        } catch (error) {
            console.error('❌ Failed to get cache stats:', error);
            return null;
        }
    }

    /**
     * Clear specific cache stores
     */
    async clearCacheStore(storeName) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            
            const validStores = ['packages', 'authorEntities', 'packageAuthors', 'vulnerabilities', 
                                 'authors', 'organizations', 'repositories', 'metadata'];
            
            if (!validStores.includes(storeName)) {
                console.error(`❌ Invalid store name: ${storeName}`);
                return false;
            }
            
            const transaction = this.db.transaction([storeName], 'readwrite');
            await this._promisifyRequest(transaction.objectStore(storeName).clear());
            console.log(`✅ Cleared ${storeName} cache`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to clear ${storeName}:`, error);
            return false;
        }
    }

    /**
     * Clear only analysis data (organizations/repositories), keep entity caches
     */
    async clearAnalysisData() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['organizations', 'repositories'], 'readwrite');
            
            await Promise.all([
                this._promisifyRequest(transaction.objectStore('organizations').clear()),
                this._promisifyRequest(transaction.objectStore('repositories').clear())
            ]);
            
            console.log('✅ Cleared analysis data (kept entity caches)');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear analysis data:', error);
            return false;
        }
    }

    /**
     * Save vulnerability data
     */
    async saveVulnerability(packageKey, data) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['vulnerabilities'], 'readwrite');
            const store = transaction.objectStore('vulnerabilities');
            
            const entry = {
                packageKey: packageKey,
                data: data,
                timestamp: new Date().toISOString()
            };

            await this._promisifyRequest(store.put(entry));
            console.log(`✅ Saved vulnerability data for: ${packageKey}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to save vulnerability:', error);
            return false;
        }
    }

    /**
     * Batch save multiple vulnerability data entries in a single transaction
     */
    async batchSaveVulnerabilities(vulnerabilities) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            if (!vulnerabilities || vulnerabilities.length === 0) {
                return true;
            }
            
            const transaction = this.db.transaction(['vulnerabilities'], 'readwrite');
            const store = transaction.objectStore('vulnerabilities');
            
            const timestamp = new Date().toISOString();
            const promises = vulnerabilities.map(([packageKey, data]) => {
                const entry = {
                    packageKey: packageKey,
                    data: data,
                    timestamp: timestamp
                };
                return this._promisifyRequest(store.put(entry));
            });

            await Promise.all(promises);
            console.log(`✅ Batch saved ${vulnerabilities.length} vulnerability data entries`);
            return true;
        } catch (error) {
            console.error('❌ Failed to batch save vulnerability data:', error);
            return false;
        }
    }

    /**
     * Get vulnerability data
     */
    async getVulnerability(packageKey) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return null;
            }
            const transaction = this.db.transaction(['vulnerabilities'], 'readonly');
            const store = transaction.objectStore('vulnerabilities');
            const result = await this._promisifyRequest(store.get(packageKey));
            return result ? result.data : null;
        } catch (error) {
            console.error('❌ Failed to get vulnerability:', error);
            return null;
        }
    }

    /**
     * Get all vulnerabilities
     */
    async getAllVulnerabilities() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return [];
            }
            const transaction = this.db.transaction(['vulnerabilities'], 'readonly');
            const store = transaction.objectStore('vulnerabilities');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all vulnerabilities:', error);
            return [];
        }
    }

    /**
     * Clear all vulnerability data
     */
    async clearVulnerabilities() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['vulnerabilities'], 'readwrite');
            const store = transaction.objectStore('vulnerabilities');
            await this._promisifyRequest(store.clear());
            console.log('✅ Cleared all vulnerability data');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear vulnerabilities:', error);
            return false;
        }
    }

    /**
     * Get all author entities
     */
    async getAllAuthorEntities() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return [];
            }
            const transaction = this.db.transaction(['authorEntities'], 'readonly');
            const store = transaction.objectStore('authorEntities');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all author entities:', error);
            return [];
        }
    }

    /**
     * Get all package-author relationships
     */
    async getAllPackageAuthors() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return [];
            }
            const transaction = this.db.transaction(['packageAuthors'], 'readonly');
            const store = transaction.objectStore('packageAuthors');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all package-author relationships:', error);
            return [];
        }
    }

    /**
     * Get all packages
     */
    async getAllPackages() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return [];
            }
            const transaction = this.db.transaction(['packages'], 'readonly');
            const store = transaction.objectStore('packages');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all packages:', error);
            return [];
        }
    }

    /**
     * Get storage size estimate
     */
    async getStorageEstimate() {
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const estimate = await navigator.storage.estimate();
                return {
                    usage: estimate.usage || 0,
                    quota: estimate.quota || 0,
                    usagePercent: estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0
                };
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to get storage estimate:', error);
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
     * Check if database is initialized
     */
    isInitialized() {
        return this.db !== null;
    }
}

// Export for use in other modules
window.IndexedDBManager = IndexedDBManager;

