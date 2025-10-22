/**
 * IndexedDB Manager - Handles IndexedDB operations for SBOM Play
 */
class IndexedDBManager {
    constructor() {
        this.dbName = 'sbomplay_db';
        this.version = 2;
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
                ['organizations', 'repositories', 'vulnerabilities', 'metadata'], 
                'readwrite'
            );
            
            await Promise.all([
                this._promisifyRequest(transaction.objectStore('organizations').clear()),
                this._promisifyRequest(transaction.objectStore('repositories').clear()),
                this._promisifyRequest(transaction.objectStore('vulnerabilities').clear()),
                this._promisifyRequest(transaction.objectStore('metadata').clear())
            ]);
            
            console.log('✅ Cleared all IndexedDB data');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear all data:', error);
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

