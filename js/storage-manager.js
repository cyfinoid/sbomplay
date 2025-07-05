/**
 * Storage Manager - Handles local storage operations
 */
class StorageManager {
    constructor() {
        this.storageKey = 'sbomplay_data';
        this.historyKey = 'sbomplay_history';
    }

    /**
     * Save analysis data to local storage
     */
    saveAnalysisData(orgName, data) {
        try {
            const timestamp = new Date().toISOString();
            const analysisData = {
                organization: orgName,
                timestamp: timestamp,
                data: data
            };

            // Save current analysis
            localStorage.setItem(this.storageKey, JSON.stringify(analysisData));

            // Add to history
            this.addToHistory(orgName, timestamp, data);

            console.log('✅ Analysis data saved to local storage');
            return true;
        } catch (error) {
            console.error('❌ Failed to save data:', error);
            return false;
        }
    }

    /**
     * Load analysis data from local storage
     */
    loadAnalysisData() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                return JSON.parse(data);
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to load data:', error);
            return null;
        }
    }

    /**
     * Add analysis to history
     */
    addToHistory(orgName, timestamp, data) {
        try {
            const history = this.getHistory();
            
            // Add new entry
            history.unshift({
                organization: orgName,
                timestamp: timestamp,
                statistics: data.statistics
            });

            // Keep only last 10 entries
            if (history.length > 10) {
                history.splice(10);
            }

            localStorage.setItem(this.historyKey, JSON.stringify(history));
        } catch (error) {
            console.error('❌ Failed to save to history:', error);
        }
    }

    /**
     * Get analysis history
     */
    getHistory() {
        try {
            const history = localStorage.getItem(this.historyKey);
            return history ? JSON.parse(history) : [];
        } catch (error) {
            console.error('❌ Failed to load history:', error);
            return [];
        }
    }

    /**
     * Clear all stored data
     */
    clearAllData() {
        try {
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem(this.historyKey);
            console.log('✅ All data cleared from local storage');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear data:', error);
            return false;
        }
    }

    /**
     * Export data as JSON file
     */
    exportData(data, filename = 'sbom-analysis.json') {
        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('✅ Data exported successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to export data:', error);
            return false;
        }
    }

    /**
     * Get storage usage information
     */
    getStorageInfo() {
        try {
            const currentData = localStorage.getItem(this.storageKey);
            const historyData = localStorage.getItem(this.historyKey);
            
            const currentSize = currentData ? new Blob([currentData]).size : 0;
            const historySize = historyData ? new Blob([historyData]).size : 0;
            const totalSize = currentSize + historySize;
            
            return {
                currentDataSize: currentSize,
                historyDataSize: historySize,
                totalSize: totalSize,
                hasData: currentData !== null,
                historyCount: this.getHistory().length
            };
        } catch (error) {
            console.error('❌ Failed to get storage info:', error);
            return {
                currentDataSize: 0,
                historyDataSize: 0,
                totalSize: 0,
                hasData: false,
                historyCount: 0
            };
        }
    }

    /**
     * Check if storage is available
     */
    isStorageAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get available storage space (approximate)
     */
    getAvailableStorage() {
        try {
            const testKey = '__storage_test__';
            const testData = 'x'.repeat(1024); // 1KB chunks
            let totalSize = 0;
            
            while (true) {
                try {
                    localStorage.setItem(testKey + totalSize, testData);
                    totalSize += 1024;
                } catch (error) {
                    break;
                }
            }
            
            // Clean up test data
            for (let i = 0; i < totalSize; i += 1024) {
                localStorage.removeItem(testKey + i);
            }
            
            return totalSize;
        } catch (error) {
            return 0;
        }
    }
}

// Export for use in other modules
window.StorageManager = StorageManager; 