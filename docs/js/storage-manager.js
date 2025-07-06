/**
 * Storage Manager - Handles local storage operations
 */
class StorageManager {
    constructor() {
        this.storageKey = 'sbomplay_data';
        this.historyKey = 'sbomplay_history';
        this.organizationsKey = 'sbomplay_organizations';
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

            // Save organization-specific data with unique key
            const orgKey = `sbomplay_org_${orgName}`;
            localStorage.setItem(orgKey, JSON.stringify(analysisData));

            // Add to organizations list
            this.addToOrganizations(orgName, timestamp, data);

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
            console.log('🔍 Storage - loadAnalysisData - raw data:', data);
            
            if (data) {
                const parsedData = JSON.parse(data);
                console.log('🔍 Storage - loadAnalysisData - parsed data:', parsedData);
                return parsedData;
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to load data:', error);
            return null;
        }
    }

    /**
     * Load analysis data for a specific organization
     */
    loadAnalysisDataForOrganization(orgName) {
        try {
            // Try to load from organization-specific key first
            const orgKey = `sbomplay_org_${orgName}`;
            const orgData = localStorage.getItem(orgKey);
            
            if (orgData) {
                return JSON.parse(orgData);
            }
            
            // Fallback to organizations list
            const organizations = this.getOrganizations();
            const orgDataFromList = organizations.find(org => org.organization === orgName);
            return orgDataFromList || null;
        } catch (error) {
            console.error('❌ Failed to load organization data:', error);
            return null;
        }
    }

    /**
     * Get all stored organizations
     */
    getOrganizations() {
        try {
            const data = localStorage.getItem(this.organizationsKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('❌ Failed to load organizations:', error);
            return [];
        }
    }

    /**
     * Add analysis to organizations list
     */
    addToOrganizations(orgName, timestamp, data) {
        try {
            const organizations = this.getOrganizations();
            
            // Check if organization already exists
            const existingIndex = organizations.findIndex(org => org.organization === orgName);
            
            if (existingIndex !== -1) {
                // Update existing organization data
                organizations[existingIndex] = {
                    organization: orgName,
                    timestamp: timestamp,
                    data: data
                };
            } else {
                // Add new organization
                organizations.push({
                    organization: orgName,
                    timestamp: timestamp,
                    data: data
                });
            }

            localStorage.setItem(this.organizationsKey, JSON.stringify(organizations));
        } catch (error) {
            console.error('❌ Failed to save to organizations:', error);
        }
    }

    /**
     * Remove analysis data for a specific organization
     */
    removeOrganizationData(orgName) {
        try {
            // Remove organization-specific data
            const orgKey = `sbomplay_org_${orgName}`;
            localStorage.removeItem(orgKey);
            
            const organizations = this.getOrganizations();
            const filteredOrganizations = organizations.filter(org => org.organization !== orgName);
            localStorage.setItem(this.organizationsKey, JSON.stringify(filteredOrganizations));
            
            // Also remove from history
            const history = this.getHistory();
            const filteredHistory = history.filter(entry => entry.organization !== orgName);
            localStorage.setItem(this.historyKey, JSON.stringify(filteredHistory));
            
            console.log(`✅ Removed data for organization: ${orgName}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to remove organization data:', error);
            return false;
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

            // Keep only last 50 entries (increased from 10)
            if (history.length > 50) {
                history.splice(50);
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
            localStorage.removeItem(this.organizationsKey);
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
     * Export all organizations data as JSON file
     */
    exportAllData(filename = 'sbom-all-analyses.json') {
        try {
            const organizations = this.getOrganizations();
            const history = this.getHistory();
            
            const exportData = {
                organizations: organizations,
                history: history,
                exportTimestamp: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
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
            
            console.log('✅ All data exported successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to export all data:', error);
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
            const organizationsData = localStorage.getItem(this.organizationsKey);
            
            const currentSize = currentData ? new Blob([currentData]).size : 0;
            const historySize = historyData ? new Blob([historyData]).size : 0;
            const organizationsSize = organizationsData ? new Blob([organizationsData]).size : 0;
            const totalSize = currentSize + historySize + organizationsSize;
            
            const organizations = this.getOrganizations();
            
            return {
                currentDataSize: currentSize,
                historyDataSize: historySize,
                organizationsDataSize: organizationsSize,
                totalSize: totalSize,
                hasData: currentData !== null,
                historyCount: this.getHistory().length,
                organizationsCount: organizations.length,
                organizations: organizations.map(org => ({
                    name: org.organization,
                    timestamp: org.timestamp,
                    repositories: org.data.statistics.totalRepositories,
                    dependencies: org.data.statistics.totalDependencies
                }))
            };
        } catch (error) {
            console.error('❌ Failed to get storage info:', error);
            return {
                currentDataSize: 0,
                historyDataSize: 0,
                organizationsDataSize: 0,
                totalSize: 0,
                hasData: false,
                historyCount: 0,
                organizationsCount: 0,
                organizations: []
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

    /**
     * Get all organizations (alias for getOrganizations)
     */
    getAllOrganizations() {
        return this.getOrganizations();
    }

    /**
     * Get organization data by name
     */
    getOrganizationData(orgName) {
        return this.loadAnalysisDataForOrganization(orgName);
    }
}

// Export for use in other modules
window.StorageManager = StorageManager;

// Create global instance
const storageManager = new StorageManager();
window.storageManager = storageManager; 