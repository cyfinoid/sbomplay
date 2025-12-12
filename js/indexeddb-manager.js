/**
 * IndexedDB Manager - Handles IndexedDB operations for SBOM Play
 */
class IndexedDBManager {
    constructor() {
        this.dbName = 'sbomplay_db';
        this.version = 5; // Current database version
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
                    // Indexes for location and company fields (for filtering and deduplication)
                    authorEntityStore.createIndex('location', 'metadata.location', { unique: false });
                    authorEntityStore.createIndex('company', 'metadata.company', { unique: false });
                    authorEntityStore.createIndex('github', 'metadata.github', { unique: false });
                    authorEntityStore.createIndex('email', 'email', { unique: false });
                    console.log('✅ Created authorEntities object store with location/company/GitHub indexes');
                } else {
                    // Upgrade existing store - add new indexes if they don't exist
                    const transaction = event.target.transaction;
                    const authorEntityStore = transaction.objectStore('authorEntities');
                    try {
                        if (!authorEntityStore.indexNames.contains('location')) {
                            authorEntityStore.createIndex('location', 'metadata.location', { unique: false });
                            console.log('✅ Added location index to authorEntities');
                        }
                        if (!authorEntityStore.indexNames.contains('company')) {
                            authorEntityStore.createIndex('company', 'metadata.company', { unique: false });
                            console.log('✅ Added company index to authorEntities');
                        }
                        if (!authorEntityStore.indexNames.contains('github')) {
                            authorEntityStore.createIndex('github', 'metadata.github', { unique: false });
                            console.log('✅ Added github index to authorEntities');
                        }
                        if (!authorEntityStore.indexNames.contains('email')) {
                            authorEntityStore.createIndex('email', 'email', { unique: false });
                            console.log('✅ Added email index to authorEntities');
                        }
                    } catch (error) {
                        // Indexes might already exist, ignore error
                        console.debug('Index creation (may already exist):', error.message);
                    }
                }

                // NEW: Geocoded locations cache
                if (!db.objectStoreNames.contains('locations')) {
                    const locationStore = db.createObjectStore('locations', { keyPath: 'locationString' });
                    locationStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ Created locations object store');
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
            
            // Ensure data structure is consistent - data should be the analysis data object
            // If data already has a 'data' property, use it; otherwise use data directly
            const analysisData = data.data || data;
            
            const entry = {
                name: name,
                organization: name,
                timestamp: data.timestamp || new Date().toISOString(),
                data: analysisData,
                type: 'organization',
                // Note: statistics should only be accessed via entry.data.statistics
                // Removed duplicate statistics field to avoid inconsistency
            };

            // Save the entry and wait for transaction to complete
            await this._promisifyRequest(store.put(entry));
            
            // Wait for transaction to complete before returning
            await new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(`✅ Saved organization: ${name} (transaction completed)`);
                    console.log(`   - Repositories: ${analysisData?.statistics?.totalRepositories || 0}`);
                    console.log(`   - Dependencies: ${analysisData?.statistics?.totalDependencies || 0}`);
                    console.log(`   - Timestamp: ${entry.timestamp}`);
                    resolve(true);
                };
                transaction.onerror = () => {
                    console.error(`❌ Transaction failed for organization: ${name}`, transaction.error);
                    reject(transaction.error);
                };
            });
            
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
            
            // Ensure data structure is consistent - data should be the analysis data object
            // If data already has a 'data' property, use it; otherwise use data directly
            const analysisData = data.data || data;
            
            const entry = {
                fullName: fullName,
                timestamp: data.timestamp || new Date().toISOString(),
                data: analysisData,
                type: 'repository',
                // Note: statistics should only be accessed via entry.data.statistics
                // Removed duplicate statistics field to avoid inconsistency
            };

            // Save the entry and wait for transaction to complete
            await this._promisifyRequest(store.put(entry));
            
            // Wait for transaction to complete before returning
            await new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log(`✅ Saved repository: ${fullName} (transaction completed)`);
                    console.log(`   - Dependencies: ${analysisData?.statistics?.totalDependencies || 0}`);
                    console.log(`   - Timestamp: ${entry.timestamp}`);
                    resolve(true);
                };
                transaction.onerror = () => {
                    console.error(`❌ Transaction failed for repository: ${fullName}`, transaction.error);
                    reject(transaction.error);
                };
            });
            
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
            const orgs = result || [];
            console.log(`🏢 Retrieved ${orgs.length} organizations from IndexedDB`);
            if (orgs.length > 0) {
                orgs.forEach(org => {
                    const name = org.organization || org.name;
                    console.log(`   - ${name} (${org.data?.statistics?.totalRepositories || 0} repos, ${org.data?.statistics?.totalDependencies || 0} deps)`);
                });
            }
            return orgs;
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
            const repos = result || [];
            console.log(`📦 Retrieved ${repos.length} repositories from IndexedDB`);
            if (repos.length > 0) {
                repos.forEach(repo => {
                    console.log(`   - ${repo.fullName} (${repo.data?.statistics?.totalDependencies || 0} deps)`);
                });
            }
            return repos;
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
            // Use same logic as saveAnalysisData: repo has exactly 2 parts (owner/repo)
            // Names with 3+ parts (e.g., github.com/owner/repo) are treated as organizations
            const isRepo = name.includes('/') && name.split('/').length === 2;
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
     * Save author entity to global cache (IndexedDB)
     * This persists all author data including metadata.location and metadata.company
     */
    async saveAuthorEntity(authorKey, authorData) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['authorEntities'], 'readwrite');
            const store = transaction.objectStore('authorEntities');
            
            // Preserve all fields from authorData, including nested metadata object
            const entry = {
                authorKey: authorKey,
                ...authorData,
                timestamp: new Date().toISOString()
            };

            // Verify metadata structure includes location data if present
            if (entry.metadata?.location || entry.metadata?.company) {
                console.log(`💾 Saving author entity to IndexedDB: ${authorKey} with location data:`, {
                    location: entry.metadata.location || null,
                    company: entry.metadata.company || null
                });
            }

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

    /**
     * ============================================
     * LOCATION CACHE METHODS
     * ============================================
     */

    /**
     * Save geocoded location to cache
     * @param {string} locationString - Location string (e.g., "San Francisco, CA")
     * @param {Object} geocodedData - {lat: number, lng: number, displayName: string}
     */
    async saveLocation(locationString, geocodedData) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const transaction = this.db.transaction(['locations'], 'readwrite');
            const store = transaction.objectStore('locations');
            
            // Handle failed geocoding attempts (cached to avoid retries)
            // IMPORTANT: locationString is already normalized by LocationService.normalizeLocationString()
            // We use .trim() to ensure consistent key format (normalizeLocationString already trims, but be safe)
            const normalizedKey = locationString.trim();
            const entry = {
                locationString: normalizedKey,
                timestamp: new Date().toISOString()
            };
            
            // Debug: Log the key being saved (only occasionally to avoid spam)
            if (Math.random() < 0.1) { // Log ~10% of saves
                console.log(`💾 Saving location to cache with key: "${normalizedKey}"`);
            }
            
            if (geocodedData.failed === true) {
                // Store failed marker
                entry.failed = true;
            } else {
                // Store successful geocoding data
                entry.lat = geocodedData.lat;
                entry.lng = geocodedData.lng;
                entry.displayName = geocodedData.displayName || locationString;
                entry.countryCode = geocodedData.countryCode || null;
                entry.country = geocodedData.country || null;
            }

            await this._promisifyRequest(store.put(entry));
            return true;
        } catch (error) {
            console.error('❌ Failed to save location:', error);
            return false;
        }
    }

    /**
     * Get geocoded location from cache
     * @param {string} locationString - Location string
     * @returns {Promise<Object|null>} - {lat: number, lng: number, displayName: string} or null
     */
    async getLocation(locationString) {
        try {
            if (!this.db) {
                return null;
            }
            const transaction = this.db.transaction(['locations'], 'readonly');
            const store = transaction.objectStore('locations');
            const entry = await this._promisifyRequest(store.get(locationString.trim()));
            
            if (entry) {
                // Check if this is a failed attempt marker
                if (entry.failed === true) {
                    return { failed: true };
                }
                // Return successful geocoding data
                return {
                    lat: entry.lat,
                    lng: entry.lng,
                    displayName: entry.displayName || locationString,
                    countryCode: entry.countryCode || null,
                    country: entry.country || null
                };
            }
            return null;
        } catch (error) {
            console.warn('⚠️ Failed to get location from cache:', error);
            return null;
        }
    }

    /**
     * Batch get multiple locations from cache
     * @param {Array<string>} locationStrings - Array of location strings
     * @returns {Promise<Map>} - Map of locationString -> geocoded data (or null if not cached)
     */
    async batchGetLocations(locationStrings) {
        const results = new Map();
        if (!this.db) {
            locationStrings.forEach(loc => results.set(loc, null));
            return results;
        }

        try {
            const transaction = this.db.transaction(['locations'], 'readonly');
            const store = transaction.objectStore('locations');
            
            // Get all locations in parallel
            // Note: locationStrings are already normalized by LocationService.batchGeocode
            // However, we need to ensure we use the same normalization that was used when saving
            const promises = locationStrings.map(async (locationString) => {
                try {
                    // Normalize the location string to match how it was saved
                    // Locations are saved with normalized strings (from LocationService.normalizeLocationString)
                    // Since locationStrings are already normalized, we just need to trim to match saveLocation
                    // IMPORTANT: saveLocation uses locationString.trim(), so we must match that exactly
                    const normalizedKey = locationString.trim();
                    
                    // Debug: Log the key being queried (only for first few to avoid spam)
                    if (locationStrings.indexOf(locationString) < 3) {
                        console.log(`🔍 Querying cache for location key: "${normalizedKey}"`);
                    }
                    
                    const entry = await this._promisifyRequest(store.get(normalizedKey));
                    if (entry) {
                        // Debug: Log cache hit (only for first few to avoid spam)
                        if (locationStrings.indexOf(locationString) < 3) {
                            console.log(`✅ Cache HIT for location key: "${normalizedKey}"`);
                        }
                        
                        // Check if this is a failed attempt marker
                        if (entry.failed === true) {
                            return {
                                location: locationString,
                                data: { failed: true }
                            };
                        }
                        // Return successful geocoding data
                        return {
                            location: locationString,
                            data: {
                                lat: entry.lat,
                                lng: entry.lng,
                                displayName: entry.displayName || locationString,
                                countryCode: entry.countryCode || null,
                                country: entry.country || null
                            }
                        };
                    }
                    
                    // Debug: Log cache miss (only for first few to avoid spam)
                    if (locationStrings.indexOf(locationString) < 3) {
                        console.log(`❌ Cache MISS for location key: "${normalizedKey}"`);
                    }
                    
                    return { location: locationString, data: null };
                } catch (error) {
                    return { location: locationString, data: null };
                }
            });

            const batchResults = await Promise.allSettled(promises);
            batchResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    results.set(result.value.location, result.value.data);
                } else {
                    results.set(result.value?.location || 'unknown', null);
                }
            });

            return results;
        } catch (error) {
            console.warn('⚠️ Failed to batch get locations:', error);
            locationStrings.forEach(loc => results.set(loc, null));
            return results;
        }
    }
}

// Export for use in other modules
window.IndexedDBManager = IndexedDBManager;

