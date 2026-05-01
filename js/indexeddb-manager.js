/**
 * IndexedDB Manager - Handles IndexedDB operations for SBOM Play
 */
class IndexedDBManager {
    constructor() {
        this.dbName = 'sbomplay_db';
        // Phase 2.1 (VEX) bumped this to 7 in order to add the `vexDocuments`
        // store. The store is created in onupgradeneeded with `if (!contains)`
        // guards, so existing v6 databases upgrade in place without losing
        // analyses, vulnerabilities, or other caches.
        this.version = 7;
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

                // NEW: EOX (End-of-Life) data cache
                if (!db.objectStoreNames.contains('eoxData')) {
                    const eoxStore = db.createObjectStore('eoxData', { keyPath: 'key' });
                    eoxStore.createIndex('fetchedAt', 'fetchedAt', { unique: false });
                    console.log('✅ Created eoxData object store');
                }

                // Phase 2.1 — VEX/VDR documents the user has uploaded.
                // keyPath is `vexId`, a stable, content-derived id that the
                // VEX service computes (sha256 prefix of the document body)
                // so re-uploads of the same file collapse into one row.
                // We index by source format and uploadedAt so the settings
                // UI can list documents in upload order without scanning.
                if (!db.objectStoreNames.contains('vexDocuments')) {
                    const vexStore = db.createObjectStore('vexDocuments', { keyPath: 'vexId' });
                    vexStore.createIndex('format', 'format', { unique: false });
                    vexStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
                    console.log('✅ Created vexDocuments object store');
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
     * Clear all data. Phase 1.8: now also clears `locations` and `eoxData` so
     * "Clear All Data" actually leaves no traces. Stores that don't exist on
     * older databases are skipped gracefully via `objectStoreNames.contains`.
     */
    async clearAll() {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const allStores = [
                'organizations', 'repositories', 'vulnerabilities', 'metadata', 'authors',
                'packages', 'packageAuthors', 'authorEntities', 'locations', 'eoxData',
                // Phase 2.1 — VEX documents must also be wiped by "Clear All Data"
                // or stale suppression statements from a prior tenant could
                // continue to mute findings on a newly imported analysis.
                'vexDocuments'
            ];
            const presentStores = allStores.filter(name => this.db.objectStoreNames.contains(name));
            if (presentStores.length === 0) return true;

            const transaction = this.db.transaction(presentStores, 'readwrite');
            await Promise.all(presentStores.map(name =>
                this._promisifyRequest(transaction.objectStore(name).clear())
            ));

            console.log(`✅ Cleared all IndexedDB data (${presentStores.join(', ')})`);
            return true;
        } catch (error) {
            console.error('❌ Failed to clear all data:', error);
            return false;
        }
    }

    /**
     * Clear a specific subset of object stores in a single atomic transaction.
     * Used by Phase 1.8 import "Replace" mode so a restore wipes the affected
     * stores before re-inserting, preventing orphaned rows from a smaller
     * snapshot. Stores not present on this DB version are silently skipped.
     *
     * @param {string[]} storeNames
     * @returns {Promise<boolean>}
     */
    async clearStores(storeNames) {
        try {
            if (!this.db) return false;
            if (!Array.isArray(storeNames) || storeNames.length === 0) return true;
            const present = storeNames.filter(name => this.db.objectStoreNames.contains(name));
            if (present.length === 0) return true;
            const tx = this.db.transaction(present, 'readwrite');
            await Promise.all(present.map(name =>
                this._promisifyRequest(tx.objectStore(name).clear())
            ));
            console.log(`✅ Cleared stores: ${present.join(', ')}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to clear stores:', error);
            return false;
        }
    }

    /**
     * Save a single EOX cache row (Phase 1.8 import support).
     * Schema mirrors what `cacheManager.saveEOXProduct` writes via the
     * existing `eoxData` store: `{ key, ...payload }`.
     */
    async saveEoxData(key, payload) {
        try {
            if (!this.db || !this.db.objectStoreNames.contains('eoxData')) return false;
            const transaction = this.db.transaction(['eoxData'], 'readwrite');
            const store = transaction.objectStore('eoxData');
            await this._promisifyRequest(store.put({ ...payload, key }));
            return true;
        } catch (error) {
            console.error('❌ Failed to save EOX data:', error);
            return false;
        }
    }

    /**
     * Save a single legacy `authors` cache row (Phase 1.8 import support).
     */
    async saveLegacyAuthor(packageKey, payload) {
        try {
            if (!this.db || !this.db.objectStoreNames.contains('authors')) return false;
            const transaction = this.db.transaction(['authors'], 'readwrite');
            const store = transaction.objectStore('authors');
            await this._promisifyRequest(store.put({ ...payload, packageKey }));
            return true;
        } catch (error) {
            console.error('❌ Failed to save legacy author:', error);
            return false;
        }
    }

    /**
     * ============================================
     * VEX/VDR DOCUMENT STORAGE (Phase 2)
     * ============================================
     * VEX documents are user-supplied and never auto-fetched. They are stored
     * verbatim alongside the parsed statements so we can reuse them across
     * future analyses and so the user can always re-export their original
     * upload from settings without losing fidelity.
     */

    async saveVexDocument(vexId, payload) {
        try {
            if (!this.db || !this.db.objectStoreNames.contains('vexDocuments')) return false;
            const transaction = this.db.transaction(['vexDocuments'], 'readwrite');
            const store = transaction.objectStore('vexDocuments');
            const entry = {
                vexId,
                ...payload,
                uploadedAt: payload && payload.uploadedAt ? payload.uploadedAt : new Date().toISOString()
            };
            await this._promisifyRequest(store.put(entry));
            return true;
        } catch (error) {
            console.error('❌ Failed to save VEX document:', error);
            return false;
        }
    }

    async getVexDocument(vexId) {
        try {
            if (!this.db || !this.db.objectStoreNames.contains('vexDocuments')) return null;
            const transaction = this.db.transaction(['vexDocuments'], 'readonly');
            const store = transaction.objectStore('vexDocuments');
            const result = await this._promisifyRequest(store.get(vexId));
            return result || null;
        } catch (error) {
            console.error('❌ Failed to get VEX document:', error);
            return null;
        }
    }

    async getAllVexDocuments() {
        try {
            if (!this.db || !this.db.objectStoreNames.contains('vexDocuments')) return [];
            const transaction = this.db.transaction(['vexDocuments'], 'readonly');
            const store = transaction.objectStore('vexDocuments');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all VEX documents:', error);
            return [];
        }
    }

    async deleteVexDocument(vexId) {
        try {
            if (!this.db || !this.db.objectStoreNames.contains('vexDocuments')) return false;
            const transaction = this.db.transaction(['vexDocuments'], 'readwrite');
            const store = transaction.objectStore('vexDocuments');
            await this._promisifyRequest(store.delete(vexId));
            return true;
        } catch (error) {
            console.error('❌ Failed to delete VEX document:', error);
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
     * Save one package + N author entities + N package-author relationships in a single
     * IndexedDB transaction across all three stores (T3.3).
     *
     * Replaces the per-author 1+N+N transaction pattern in saveAuthorsToCache with a
     * single multi-store transaction so that committing N authors for one package costs
     * 1 transaction instead of 2N+1. Falls back gracefully when the db isn't ready.
     *
     * @param {Object} bundle
     * @param {{packageKey: string, packageData: Object}|null} bundle.package - package row to upsert (optional)
     * @param {Array<[string, Object]>} bundle.authorEntities - [authorKey, entityData] pairs
     * @param {Array<{packageKey: string, authorKey: string, isMaintainer?: boolean}>} bundle.relationships
     * @returns {Promise<boolean>}
     */
    async batchSavePackageAuthorBundle(bundle) {
        try {
            if (!this.db) {
                console.warn('⚠️ IndexedDB not initialized yet');
                return false;
            }
            const pkg = bundle?.package || null;
            const authorEntities = bundle?.authorEntities || [];
            const relationships = bundle?.relationships || [];
            if (!pkg && authorEntities.length === 0 && relationships.length === 0) {
                return true;
            }

            const stores = [];
            if (pkg) stores.push('packages');
            if (authorEntities.length > 0) stores.push('authorEntities');
            if (relationships.length > 0) stores.push('packageAuthors');

            const transaction = this.db.transaction(stores, 'readwrite');
            const timestamp = new Date().toISOString();
            const promises = [];

            if (pkg) {
                const pkgStore = transaction.objectStore('packages');
                const pkgEntry = {
                    packageKey: pkg.packageKey,
                    ...pkg.packageData,
                    timestamp
                };
                promises.push(this._promisifyRequest(pkgStore.put(pkgEntry)));
            }

            if (authorEntities.length > 0) {
                const entityStore = transaction.objectStore('authorEntities');
                authorEntities.forEach(([authorKey, authorData]) => {
                    const entry = {
                        authorKey,
                        ...authorData,
                        timestamp
                    };
                    promises.push(this._promisifyRequest(entityStore.put(entry)));
                });
            }

            if (relationships.length > 0) {
                const relStore = transaction.objectStore('packageAuthors');
                relationships.forEach(({ packageKey, authorKey, isMaintainer = false }) => {
                    const entry = {
                        packageAuthorKey: `${packageKey}:${authorKey}`,
                        packageKey,
                        authorKey,
                        isMaintainer,
                        timestamp
                    };
                    promises.push(this._promisifyRequest(relStore.put(entry)));
                });
            }

            await Promise.all(promises);
            return true;
        } catch (error) {
            console.error('❌ Failed to batch save package-author bundle:', error);
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
     * Get all geocoded location records (for export coverage in Phase 1.8).
     * Safe when the store is missing on older databases — returns [].
     */
    async getAllLocations() {
        try {
            if (!this.db || !this.db.objectStoreNames.contains('locations')) return [];
            const transaction = this.db.transaction(['locations'], 'readonly');
            const store = transaction.objectStore('locations');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all locations:', error);
            return [];
        }
    }

    /**
     * Get all End-of-Life/Support cache records (Phase 1.8 export coverage).
     */
    async getAllEoxData() {
        try {
            if (!this.db || !this.db.objectStoreNames.contains('eoxData')) return [];
            const transaction = this.db.transaction(['eoxData'], 'readonly');
            const store = transaction.objectStore('eoxData');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all EOX data:', error);
            return [];
        }
    }

    /**
     * Get all legacy `authors` cache rows. The post-migration cache lives in
     * `authorEntities` + `packageAuthors`, but author-service still writes to
     * the legacy store for backward compatibility (see js/author-service.js
     * cacheAuthors). Phase 1.8 export covers both so a restore is faithful.
     */
    async getAllLegacyAuthors() {
        try {
            if (!this.db || !this.db.objectStoreNames.contains('authors')) return [];
            const transaction = this.db.transaction(['authors'], 'readonly');
            const store = transaction.objectStore('authors');
            const result = await this._promisifyRequest(store.getAll());
            return result || [];
        } catch (error) {
            console.error('❌ Failed to get all legacy authors:', error);
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

