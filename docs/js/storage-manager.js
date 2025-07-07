/**
 * Storage Manager - Handles local storage operations
 */
class StorageManager {
    constructor() {
        this.organizationsKey = 'sbomplay_organizations';
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

            // Add to organizations list (this is the single source of truth)
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
     * Load analysis data from local storage (for backward compatibility)
     */
    loadAnalysisData() {
        try {
            // Try to get the most recent analysis from organizations list
            const organizations = this.getOrganizations();
            if (organizations.length > 0) {
                // Return the most recent analysis
                const mostRecent = organizations.reduce((latest, current) => 
                    new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
                );
                console.log('🔍 Storage - loadAnalysisData - most recent data:', mostRecent);
                return mostRecent;
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
            // Get from organizations list (single source of truth)
            const organizations = this.getOrganizations();
            const orgData = organizations.find(org => org.organization === orgName);
            return orgData || null;
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
            // Remove from organizations list
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
            localStorage.removeItem(this.historyKey);
            localStorage.removeItem(this.organizationsKey);
            
            // Clean up any legacy organization-specific keys
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('sbomplay_org_')) {
                    localStorage.removeItem(key);
                }
            });
            
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
            const historyData = localStorage.getItem(this.historyKey);
            const organizationsData = localStorage.getItem(this.organizationsKey);
            
            const historySize = historyData ? new Blob([historyData]).size : 0;
            const organizationsSize = organizationsData ? new Blob([organizationsData]).size : 0;
            const totalSize = historySize + organizationsSize;
            
            const organizations = this.getOrganizations();
            
            return {
                historyDataSize: historySize,
                organizationsDataSize: organizationsSize,
                totalSize: totalSize,
                hasData: organizations.length > 0,
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

    /**
     * Get combined data from all organizations
     */
    getCombinedData() {
        try {
            const organizations = this.getOrganizations();
            if (organizations.length === 0) {
                return null;
            }

            // Collect all data from organizations
            const allData = [];
            for (const org of organizations) {
                const orgData = this.getOrganizationData(org.organization);
                if (orgData && orgData.data) {
                    allData.push(orgData);
                }
            }

            if (allData.length === 0) {
                return null;
            }

            // Combine the data
            const combinedData = this.combineOrganizationData(allData);
            return {
                organization: 'All Organizations Combined',
                timestamp: new Date().toISOString(),
                data: combinedData
            };
        } catch (error) {
            console.error('❌ Failed to get combined data:', error);
            return null;
        }
    }

    /**
     * Combine data from multiple organizations
     */
    combineOrganizationData(organizationsData) {
        const combined = {
            statistics: {
                totalRepositories: 0,
                processedRepositories: 0,
                successfulRepositories: 0,
                failedRepositories: 0,
                repositoriesWithDependencies: 0,
                totalDependencies: 0,
                averageDependenciesPerRepo: 0
            },
            topDependencies: [],
            topRepositories: [],
            allDependencies: [],
            allRepositories: [],
            categoryStats: {},
            languageStats: {}
        };

        // Aggregate statistics
        for (const orgData of organizationsData) {
            const stats = orgData.data.statistics;
            combined.statistics.totalRepositories += stats.totalRepositories;
            combined.statistics.processedRepositories += stats.processedRepositories;
            combined.statistics.successfulRepositories += stats.successfulRepositories;
            combined.statistics.failedRepositories += stats.failedRepositories;
            combined.statistics.repositoriesWithDependencies += stats.repositoriesWithDependencies;
            combined.statistics.totalDependencies += stats.totalDependencies;
        }

        // Calculate average dependencies per repo
        if (combined.statistics.repositoriesWithDependencies > 0) {
            combined.statistics.averageDependenciesPerRepo = 
                Math.round(combined.statistics.totalDependencies / combined.statistics.repositoriesWithDependencies);
        }

        // Combine dependencies across all organizations
        const dependencyMap = new Map();
        const repoMap = new Map();

        for (const orgData of organizationsData) {
            const orgName = orgData.organization;
            
            // Process all dependencies
            if (orgData.data.allDependencies) {
                for (const dep of orgData.data.allDependencies) {
                    const key = `${dep.name}@${dep.version}`;
                    if (dependencyMap.has(key)) {
                        const existing = dependencyMap.get(key);
                        existing.count += dep.count;
                        existing.repositories = [...new Set([...existing.repositories, ...dep.repositories])];
                    } else {
                        dependencyMap.set(key, {
                            ...dep,
                            repositories: [...dep.repositories]
                        });
                    }
                }
            }

            // Process all repositories
            if (orgData.data.allRepositories) {
                for (const repo of orgData.data.allRepositories) {
                    const repoKey = `${repo.owner}/${repo.name}`;
                    if (repoMap.has(repoKey)) {
                        const existing = repoMap.get(repoKey);
                        existing.totalDependencies += repo.totalDependencies;
                        existing.owner = repo.owner;
                        existing.name = repo.name;
                    } else {
                        repoMap.set(repoKey, {
                            ...repo,
                            owner: repo.owner,
                            name: repo.name
                        });
                    }
                }
            }
        }

        // Convert maps to arrays and sort
        combined.allDependencies = Array.from(dependencyMap.values())
            .sort((a, b) => b.count - a.count);

        combined.topDependencies = combined.allDependencies.slice(0, 50);

        combined.allRepositories = Array.from(repoMap.values())
            .sort((a, b) => b.totalDependencies - a.totalDependencies);

        combined.topRepositories = combined.allRepositories.slice(0, 50);

        // Combine category and language stats
        console.log('🔍 Storage Manager - Combining category and language stats...');
        for (const orgData of organizationsData) {
            console.log(`Processing org: ${orgData.organization}`);
            
            if (orgData.data.categoryStats) {
                console.log('Category stats for', orgData.organization, ':', orgData.data.categoryStats);
                for (const [category, value] of Object.entries(orgData.data.categoryStats)) {
                    // Handle both object format (with count property) and simple number format
                    let count = 0;
                    if (typeof value === 'object' && value !== null && value.count !== undefined) {
                        count = value.count;
                        console.log(`  ${category}: object format, count = ${count}`);
                    } else {
                        count = parseInt(value) || 0;
                        console.log(`  ${category}: simple format, count = ${count}`);
                    }
                    combined.categoryStats[category] = (combined.categoryStats[category] || 0) + count;
                }
            }
            if (orgData.data.languageStats) {
                console.log('Language stats for', orgData.organization, ':', orgData.data.languageStats);
                for (const [language, value] of Object.entries(orgData.data.languageStats)) {
                    // Handle both object format (with count property) and simple number format
                    let count = 0;
                    if (typeof value === 'object' && value !== null && value.count !== undefined) {
                        count = value.count;
                        console.log(`  ${language}: object format, count = ${count}`);
                    } else {
                        count = parseInt(value) || 0;
                        console.log(`  ${language}: simple format, count = ${count}`);
                    }
                    combined.languageStats[language] = (combined.languageStats[language] || 0) + count;
                }
            }
        }
        
        console.log('Final combined category stats:', combined.categoryStats);
        console.log('Final combined language stats:', combined.languageStats);

        return combined;
    }
}

// Export for use in other modules
window.StorageManager = StorageManager;

// Create global instance
const storageManager = new StorageManager();
window.storageManager = storageManager; 