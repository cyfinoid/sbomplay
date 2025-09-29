/**
 * SingleRepo Storage Manager - IndexedDB based storage for single repository analyses
 */
class SingleRepoStorage {
    constructor() {
        this.dbName = 'SBOMPlaySingleRepo';
        this.dbVersion = 1;
        this.storeName = 'repositories';
        this.db = null;
    }

    /**
     * Initialize IndexedDB
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('❌ SingleRepo Storage: Failed to open IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ SingleRepo Storage: IndexedDB initialized');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store for repositories
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('owner', 'owner', { unique: false });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ SingleRepo Storage: Object store created');
                }
            };
        });
    }

    /**
     * Generate unique ID for repository
     */
    generateRepoId(owner, name) {
        return `${owner}/${name}`.toLowerCase();
    }

    /**
     * Save repository analysis
     */
    async saveAnalysis(owner, name, analysisData) {
        if (!this.db) {
            await this.init();
        }

        const repoData = {
            id: this.generateRepoId(owner, name),
            owner: owner,
            name: name,
            timestamp: new Date().toISOString(),
            analysisData: analysisData
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(repoData);
            
            request.onerror = () => {
                console.error('❌ SingleRepo Storage: Failed to save analysis:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                console.log(`✅ SingleRepo Storage: Analysis saved for ${owner}/${name}`);
                resolve(repoData);
            };
        });
    }

    /**
     * Load repository analysis
     */
    async loadAnalysis(owner, name) {
        if (!this.db) {
            await this.init();
        }

        const repoId = this.generateRepoId(owner, name);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(repoId);
            
            request.onerror = () => {
                console.error('❌ SingleRepo Storage: Failed to load analysis:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    console.log(`✅ SingleRepo Storage: Analysis loaded for ${owner}/${name}`);
                } else {
                    console.log(`ℹ️ SingleRepo Storage: No analysis found for ${owner}/${name}`);
                }
                resolve(result);
            };
        });
    }

    /**
     * Get all stored analyses
     */
    async getAllAnalyses() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onerror = () => {
                console.error('❌ SingleRepo Storage: Failed to get all analyses:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                const results = request.result || [];
                // Sort by timestamp (newest first)
                results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                console.log(`✅ SingleRepo Storage: Retrieved ${results.length} analyses`);
                resolve(results);
            };
        });
    }

    /**
     * Delete repository analysis
     */
    async deleteAnalysis(owner, name) {
        if (!this.db) {
            await this.init();
        }

        const repoId = this.generateRepoId(owner, name);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(repoId);
            
            request.onerror = () => {
                console.error('❌ SingleRepo Storage: Failed to delete analysis:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                console.log(`✅ SingleRepo Storage: Analysis deleted for ${owner}/${name}`);
                resolve(true);
            };
        });
    }

    /**
     * Clear all analyses
     */
    async clearAll() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onerror = () => {
                console.error('❌ SingleRepo Storage: Failed to clear all analyses:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                console.log('✅ SingleRepo Storage: All analyses cleared');
                resolve(true);
            };
        });
    }

    /**
     * Export analysis data
     */
    async exportAnalysis(owner, name) {
        const analysis = await this.loadAnalysis(owner, name);
        if (!analysis) {
            throw new Error(`No analysis found for ${owner}/${name}`);
        }

        const exportData = {
            repository: `${owner}/${name}`,
            exportTimestamp: new Date().toISOString(),
            analysisTimestamp: analysis.timestamp,
            data: analysis.analysisData
        };

        // Create and download file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sbom-analysis-${owner}-${name}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`✅ SingleRepo Storage: Analysis exported for ${owner}/${name}`);
        return true;
    }

    /**
     * Get storage statistics
     */
    async getStorageStats() {
        const analyses = await this.getAllAnalyses();
        
        let totalSize = 0;
        analyses.forEach(analysis => {
            totalSize += JSON.stringify(analysis).length;
        });

        return {
            totalAnalyses: analyses.length,
            totalSize: totalSize,
            sizeInMB: (totalSize / 1024 / 1024).toFixed(2),
            oldestAnalysis: analyses.length > 0 ? analyses[analyses.length - 1].timestamp : null,
            newestAnalysis: analyses.length > 0 ? analyses[0].timestamp : null
        };
    }

    /**
     * Check if IndexedDB is supported
     */
    static isSupported() {
        return 'indexedDB' in window;
    }
}

// Export for use in other modules
window.SingleRepoStorage = SingleRepoStorage;

// Create global instance
const singleRepoStorage = new SingleRepoStorage();
window.singleRepoStorage = singleRepoStorage;
