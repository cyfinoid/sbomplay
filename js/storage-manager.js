/**
 * Storage Manager - Handles IndexedDB storage operations
 */
class StorageManager {
    constructor() {
        this.indexedDB = new IndexedDBManager();
        this.initialized = false;
    }

    /**
     * Initialize the storage manager
     */
    async init() {
        if (!this.initialized) {
            await this.indexedDB.initDB();
            // Expose indexedDBManager globally for cache access
            window.indexedDBManager = this.indexedDB;
            this.initialized = true;
        }
        return this.initialized;
    }

    /**
     * Save analysis data (auto-detects org vs repo)
     */
    async saveAnalysisData(name, data) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            
            const isRepo = name.includes('/') && name.split('/').length === 2;
            const timestamp = new Date().toISOString();
            
            const analysisData = {
                timestamp: timestamp,
                data: data
            };

            if (isRepo) {
                return await this.indexedDB.saveRepository(name, {
                    fullName: name,
                    timestamp: timestamp,
                    data: data,
                    type: 'repository'
                });
            } else {
                return await this.indexedDB.saveOrganization(name, {
                    organization: name,
                    timestamp: timestamp,
                    data: data,
                    type: 'organization'
                });
            }
        } catch (error) {
            console.error('❌ Failed to save analysis data:', error);
            return false;
        }
    }

    /**
     * Load analysis data (most recent entry)
     */
    async loadAnalysisData() {
        try {
            const entries = await this.indexedDB.getAllEntries();
            if (entries.length > 0) {
                // Return the most recent entry
                return entries[0];
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to load analysis data:', error);
            return null;
        }
    }

    /**
     * Load analysis data for a specific organization or repository
     */
    async loadAnalysisDataForOrganization(name) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            
            const isRepo = name.includes('/');
            
            if (isRepo) {
                return await this.indexedDB.getRepository(name);
            } else {
                return await this.indexedDB.getOrganization(name);
            }
        } catch (error) {
            console.error('❌ Failed to load data for:', name, error);
            return null;
        }
    }

    /**
     * Get all stored organizations
     */
    async getOrganizations() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.getAllOrganizations();
        } catch (error) {
            console.error('❌ Failed to get organizations:', error);
            return [];
        }
    }

    /**
     * Get all stored repositories
     */
    async getRepositories() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.getAllRepositories();
        } catch (error) {
            console.error('❌ Failed to get repositories:', error);
            return [];
        }
    }

    /**
     * Get all entries (organizations and repositories)
     */
    async getAllEntries() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.getAllEntries();
        } catch (error) {
            console.error('❌ Failed to get all entries:', error);
            return [];
        }
    }

    /**
     * Get full data for an organization or repository
     */
    async getFullOrganizationData(name) {
        return await this.loadAnalysisDataForOrganization(name);
    }

    /**
     * Remove analysis data for a specific organization or repository
     */
    async removeOrganizationData(name) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.deleteEntry(name);
        } catch (error) {
            console.error('❌ Failed to remove data:', error);
            return false;
        }
    }

    /**
     * Clear all stored data
     */
    async clearAllData() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.clearAll();
        } catch (error) {
            console.error('❌ Failed to clear all data:', error);
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
     * Export all data
     */
    async exportAllData(filename = 'sbom-all-analyses.json') {
        try {
            const entries = await this.indexedDB.getAllEntries();
            const vulnerabilities = await this.indexedDB.getAllVulnerabilities();
            
            const exportData = {
                entries: entries,
                vulnerabilities: vulnerabilities,
                exportTimestamp: new Date().toISOString()
            };
            
            return this.exportData(exportData, filename);
        } catch (error) {
            console.error('❌ Failed to export all data:', error);
            return false;
        }
    }

    /**
     * Get storage usage information
     */
    async getStorageInfo() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            
            const orgs = await this.indexedDB.getAllOrganizations();
            const repos = await this.indexedDB.getAllRepositories();
            const estimate = await this.indexedDB.getStorageEstimate();
            
            const totalEntries = orgs.length + repos.length;
            
            return {
                totalSize: estimate ? estimate.usage : 0,
                maxStorageSize: estimate ? estimate.quota : 0,
                availableSpace: estimate ? (estimate.quota - estimate.usage) : 0,
                hasData: totalEntries > 0,
                organizationsCount: orgs.length,
                repositoriesCount: repos.length,
                totalEntries: totalEntries,
                organizations: orgs.map(org => ({
                    name: org.organization || org.name,
                    timestamp: org.timestamp,
                    repositories: org.statistics?.totalRepositories || 0,
                    dependencies: org.statistics?.totalDependencies || 0,
                    type: 'organization'
                })),
                repositories: repos.map(repo => ({
                    name: repo.fullName,
                    timestamp: repo.timestamp,
                    repositories: 1,
                    dependencies: repo.statistics?.totalDependencies || 0,
                    type: 'repository'
                })),
                usagePercent: estimate ? parseFloat(estimate.usagePercent) : 0
            };
        } catch (error) {
            console.error('❌ Failed to get storage info:', error);
            return {
                totalSize: 0,
                maxStorageSize: 0,
                availableSpace: 0,
                hasData: false,
                organizationsCount: 0,
                repositoriesCount: 0,
                totalEntries: 0,
                organizations: [],
                repositories: [],
                usagePercent: 0
            };
        }
    }

    /**
     * Check if storage is available
     */
    isStorageAvailable() {
        return 'indexedDB' in window;
    }

    /**
     * Show storage status
     */
    async showStorageStatus() {
        try {
            const storageInfo = await this.getStorageInfo();
            const usagePercent = storageInfo.usagePercent;
            
            console.log(`📊 Storage Status:`);
            console.log(`   Total Usage: ${(storageInfo.totalSize / 1024 / 1024).toFixed(2)}MB / ${(storageInfo.maxStorageSize / 1024 / 1024).toFixed(2)}MB (${usagePercent.toFixed(1)}%)`);
            console.log(`   Available: ${(storageInfo.availableSpace / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   Organizations: ${storageInfo.organizationsCount}`);
            console.log(`   Repositories: ${storageInfo.repositoriesCount}`);
            
            if (usagePercent > 80) {
                console.warn('⚠️ Storage usage is high. Consider exporting data.');
            }
            
            return storageInfo;
        } catch (error) {
            console.error('❌ Failed to show storage status:', error);
            return null;
        }
    }

    /**
     * Save vulnerability data
     */
    async saveVulnerabilityData(packageKey, vulnerabilityData) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.saveVulnerability(packageKey, vulnerabilityData);
        } catch (error) {
            console.error('❌ Failed to save vulnerability data:', error);
            return false;
        }
    }

    /**
     * Get vulnerability data
     */
    async getVulnerabilityData() {
        try {
            const vulnerabilities = await this.indexedDB.getAllVulnerabilities();
            const result = {};
            for (const vuln of vulnerabilities) {
                result[vuln.packageKey] = vuln.data;
            }
            return result;
        } catch (error) {
            console.error('❌ Failed to get vulnerability data:', error);
            return {};
        }
    }

    /**
     * Get vulnerability data for a specific package
     */
    async getVulnerabilityDataForPackage(packageKey) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.getVulnerability(packageKey);
        } catch (error) {
            console.error('❌ Failed to get vulnerability for package:', error);
            return null;
        }
    }

    /**
     * Check if vulnerability data exists for a package
     */
    async hasVulnerabilityData(packageKey) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            const data = await this.indexedDB.getVulnerability(packageKey);
            return data !== null;
        } catch (error) {
            console.error('❌ Failed to check vulnerability data:', error);
            return false;
        }
    }

    /**
     * Clear all vulnerability data
     */
    async clearVulnerabilityData() {
        try {
            return await this.indexedDB.clearVulnerabilities();
        } catch (error) {
            console.error('❌ Failed to clear vulnerability data:', error);
            return false;
        }
    }

    /**
     * Get combined data from all organizations
     */
    async getCombinedData() {
        try {
            const entries = await this.indexedDB.getAllEntries();
            if (entries.length === 0) {
                return null;
            }

            // Collect all data from entries
            const allData = entries.filter(entry => entry.data);

            if (allData.length === 0) {
                return null;
            }

            // Combine the data
            const combinedData = this.combineOrganizationData(allData);
            return {
                organization: 'All Entries Combined',
                timestamp: new Date().toISOString(),
                data: combinedData
            };
        } catch (error) {
            console.error('❌ Failed to get combined data:', error);
            return null;
        }
    }

    /**
     * Combine data from multiple organizations/repositories
     */
    combineOrganizationData(entriesData) {
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
            languageStats: {},
            vulnerabilities: [],
            licenses: [],
            vulnerabilityAnalysis: null,
            licenseAnalysis: null
        };

        // Aggregate statistics
        for (const entry of entriesData) {
            const stats = entry.data.statistics;
            if (stats) {
                combined.statistics.totalRepositories += stats.totalRepositories || 0;
                combined.statistics.processedRepositories += stats.processedRepositories || 0;
                combined.statistics.successfulRepositories += stats.successfulRepositories || 0;
                combined.statistics.failedRepositories += stats.failedRepositories || 0;
                combined.statistics.repositoriesWithDependencies += stats.repositoriesWithDependencies || 0;
                combined.statistics.totalDependencies += stats.totalDependencies || 0;
            }
        }

        // Calculate average dependencies per repo
        if (combined.statistics.repositoriesWithDependencies > 0) {
            combined.statistics.averageDependenciesPerRepo = 
                Math.round(combined.statistics.totalDependencies / combined.statistics.repositoriesWithDependencies);
        }

        // Combine dependencies across all entries
        const dependencyMap = new Map();
        const repoMap = new Map();

        for (const entry of entriesData) {
            // Process all dependencies
            if (entry.data.allDependencies) {
                for (const dep of entry.data.allDependencies) {
                    const key = `${dep.name}@${dep.version}`;
                    if (dependencyMap.has(key)) {
                        const existing = dependencyMap.get(key);
                        existing.count += dep.count;
                        existing.repositories = [...new Set([...existing.repositories, ...(dep.repositories || [])])];
                    } else {
                        dependencyMap.set(key, {
                            ...dep,
                            repositories: [...(dep.repositories || [])]
                        });
                    }
                }
            }

            // Process all repositories
            if (entry.data.allRepositories) {
                for (const repo of entry.data.allRepositories) {
                    const repoKey = `${repo.owner}/${repo.name}`;
                    if (!repoMap.has(repoKey)) {
                        repoMap.set(repoKey, repo);
                    }
                }
            }

            // Combine category stats
            if (entry.data.categoryStats) {
                for (const [category, value] of Object.entries(entry.data.categoryStats)) {
                    let count = 0;
                    if (typeof value === 'object' && value !== null && value.count !== undefined) {
                        count = value.count;
                    } else {
                        count = parseInt(value) || 0;
                    }
                    combined.categoryStats[category] = (combined.categoryStats[category] || 0) + count;
                }
            }

            // Combine language stats
            if (entry.data.languageStats) {
                if (Array.isArray(entry.data.languageStats)) {
                    for (const langStat of entry.data.languageStats) {
                        const language = langStat.language;
                        const count = langStat.count;
                        combined.languageStats[language] = (combined.languageStats[language] || 0) + count;
                    }
                } else {
                    for (const [language, value] of Object.entries(entry.data.languageStats)) {
                        let count = 0;
                        if (typeof value === 'object' && value !== null && value.count !== undefined) {
                            count = value.count;
                        } else {
                            count = parseInt(value) || 0;
                        }
                        combined.languageStats[language] = (combined.languageStats[language] || 0) + count;
                    }
                }
            }
        }

        // Convert maps to arrays and sort
        combined.allDependencies = Array.from(dependencyMap.values())
            .sort((a, b) => b.count - a.count);

        combined.topDependencies = combined.allDependencies.slice(0, 50);

        combined.allRepositories = Array.from(repoMap.values())
            .sort((a, b) => (b.totalDependencies || 0) - (a.totalDependencies || 0));

        combined.topRepositories = combined.allRepositories.slice(0, 50);

        return combined;
    }

    /**
     * Save incremental analysis data
     */
    async saveIncrementalAnalysisData(name, partialData, isComplete = false) {
        try {
            return await this.saveAnalysisData(name, partialData);
        } catch (error) {
            console.error('❌ Failed to save incremental data:', error);
            return false;
        }
    }

    /**
     * Update analysis with vulnerabilities
     */
    async updateAnalysisWithVulnerabilities(name, vulnerabilityData) {
        try {
            const existingData = await this.loadAnalysisDataForOrganization(name);
            if (!existingData) {
                console.warn('⚠️ No existing data found for:', name);
                return false;
            }

            existingData.data.vulnerabilityAnalysis = vulnerabilityData;
            existingData.timestamp = new Date().toISOString();

            return await this.saveAnalysisData(name, existingData.data);
        } catch (error) {
            console.error('❌ Failed to update analysis with vulnerabilities:', error);
            return false;
        }
    }

    /**
     * Check data size and warn
     */
    async checkDataSizeAndWarn(name) {
        try {
            const estimate = await this.indexedDB.getStorageEstimate();
            if (estimate && estimate.usagePercent > 80) {
                return {
                    isLarge: true,
                    usagePercent: estimate.usagePercent,
                    message: `Storage usage is ${estimate.usagePercent}%. Consider exporting and clearing old data.`
                };
            }
            return { isLarge: false };
        } catch (error) {
            console.error('❌ Failed to check data size:', error);
            return { isLarge: false };
        }
    }
}

// Export for use in other modules
window.StorageManager = StorageManager;

// Create global instance
const storageManager = new StorageManager();
window.storageManager = storageManager;
