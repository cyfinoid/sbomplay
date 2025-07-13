/**
 * Storage Manager - Handles local storage operations with quota management
 */
class StorageManager {
    constructor() {
        this.organizationsKey = 'sbomplay_organizations';
        this.historyKey = 'sbomplay_history';
        this.vulnerabilitiesKey = 'sbomplay_vulnerabilities';
        this.maxStorageSize = 4.5 * 1024 * 1024; // 4.5MB to leave some buffer
        this.maxHistoryEntries = 20; // Reduced from 50 to save space
        this.maxOrganizations = 10; // Limit number of organizations stored
    }

    /**
     * Compress data using simple compression techniques
     */
    compressData(data) {
        try {
            // Remove unnecessary whitespace and use shorter property names
            const compressed = JSON.stringify(data, null, 0);
            
            // For very large data, we can implement more aggressive compression
            if (compressed.length > 1024 * 1024) { // If > 1MB
                console.log('⚠️ Large data detected, applying aggressive compression');
                // Remove detailed dependency lists for compression
                const minimalData = {
                    organization: data.organization,
                    timestamp: data.timestamp,
                    data: {
                        statistics: data.data.statistics,
                        topDependencies: data.data.topDependencies?.slice(0, 20) || [],
                        topRepositories: data.data.topRepositories?.slice(0, 20) || [],
                        categoryStats: data.data.categoryStats || {},
                        languageStats: data.data.languageStats || {}
                    }
                };
                return JSON.stringify(minimalData, null, 0);
            }
            
            return compressed;
        } catch (error) {
            console.error('❌ Compression failed:', error);
            // Fallback to basic compression
            try {
                return JSON.stringify(data, null, 0);
            } catch (fallbackError) {
                console.error('❌ Fallback compression also failed:', fallbackError);
                throw new Error('Data compression failed completely');
            }
        }
    }

    /**
     * Decompress data
     */
    decompressData(compressedData) {
        try {
            return JSON.parse(compressedData);
        } catch (error) {
            console.error('❌ Decompression failed:', error);
            return null;
        }
    }

    /**
     * Check if we have enough storage space
     */
    hasEnoughStorage(dataSize) {
        try {
            const currentUsage = this.getCurrentStorageUsage();
            const availableSpace = this.maxStorageSize - currentUsage;
            return dataSize <= availableSpace;
        } catch (error) {
            console.error('❌ Failed to check storage space:', error);
            return false;
        }
    }

    /**
     * Get current storage usage
     */
    getCurrentStorageUsage() {
        try {
            let totalSize = 0;
            const keys = Object.keys(localStorage);
            
            for (const key of keys) {
                const value = localStorage.getItem(key);
                if (value) {
                    totalSize += new Blob([value]).size;
                }
            }
            
            return totalSize;
        } catch (error) {
            console.error('❌ Failed to calculate storage usage:', error);
            return 0;
        }
    }

    /**
     * Clean up old data to make space
     */
    cleanupOldData(requiredSpace) {
        try {
            console.log('🧹 Cleaning up old data to make space...');
            
            // First, try to clean up history
            const history = this.getHistory();
            if (history.length > this.maxHistoryEntries) {
                const excessEntries = history.length - this.maxHistoryEntries;
                history.splice(this.maxHistoryEntries, excessEntries);
                localStorage.setItem(this.historyKey, JSON.stringify(history));
                console.log(`🗑️ Removed ${excessEntries} old history entries`);
            }

            // If still not enough space, remove oldest organizations
            const organizations = this.getOrganizations();
            if (organizations.length > this.maxOrganizations) {
                // Sort by timestamp and remove oldest
                organizations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                const excessOrgs = organizations.length - this.maxOrganizations;
                organizations.splice(0, excessOrgs);
                localStorage.setItem(this.organizationsKey, JSON.stringify(organizations));
                console.log(`🗑️ Removed ${excessOrgs} oldest organizations`);
            }

            // Check if we have enough space now
            const currentUsage = this.getCurrentStorageUsage();
            const availableSpace = this.maxStorageSize - currentUsage;
            
            if (availableSpace < requiredSpace) {
                // Last resort: clear all data except the most recent organization
                console.log('⚠️ Storage still full, clearing all data except most recent');
                const mostRecent = organizations[organizations.length - 1];
                this.clearAllData();
                if (mostRecent) {
                    this.addToOrganizations(mostRecent.organization, mostRecent.timestamp, mostRecent.data);
                }
            }

            return this.getCurrentStorageUsage();
        } catch (error) {
            console.error('❌ Failed to cleanup old data:', error);
            return 0;
        }
    }

    /**
     * Save analysis data to local storage with quota management
     */
    saveAnalysisData(orgName, data) {
        try {
            const timestamp = new Date().toISOString();
            const analysisData = {
                organization: orgName,
                timestamp: timestamp,
                data: data
            };

            // Compress the data
            const compressedData = this.compressData(analysisData);
            const dataSize = new Blob([compressedData]).size;

            console.log(`📊 Data size: ${(dataSize / 1024 / 1024).toFixed(2)}MB`);

            // Check if we have enough space
            if (!this.hasEnoughStorage(dataSize)) {
                console.log('⚠️ Storage quota exceeded, attempting cleanup...');
                this.cleanupOldData(dataSize);
                
                // Check again after cleanup
                if (!this.hasEnoughStorage(dataSize)) {
                    throw new Error('Storage quota exceeded even after cleanup. Please export and clear some data.');
                }
            }

            // Add to organizations list (this is the single source of truth)
            this.addToOrganizations(orgName, timestamp, data, compressedData);

            // Add to history
            this.addToHistory(orgName, timestamp, data);

            console.log('✅ Analysis data saved to local storage');
            return true;
        } catch (error) {
            console.error('❌ Failed to save data:', error);
            
            // Show user-friendly error message
            if (error.message.includes('Storage quota exceeded')) {
                alert('Storage quota exceeded! Please export your data and clear some old analyses to continue.');
            }
            
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
                
                // Get the full data for the most recent organization
                const fullData = this.getFullOrganizationData(mostRecent.organization);
                if (fullData) {
                    console.log('🔍 Storage - loadAnalysisData - most recent data:', fullData);
                    return fullData;
                }
                
                // Fallback to metadata if full data not available
                console.log('🔍 Storage - loadAnalysisData - most recent metadata:', mostRecent);
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
            // Try to get full decompressed data first
            const fullData = this.getFullOrganizationData(orgName);
            if (fullData) {
                return fullData;
            }
            
            // Fallback to organizations list
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
            const organizations = data ? JSON.parse(data) : [];
            
            // Handle backward compatibility for old format
            return organizations.map(org => {
                // If org has the old format with full data, convert to new format
                if (org.data && org.data.statistics) {
                    return {
                        organization: org.organization,
                        timestamp: org.timestamp,
                        statistics: org.data.statistics
                    };
                }
                // If already in new format, return as is
                return org;
            });
        } catch (error) {
            console.error('❌ Failed to load organizations:', error);
            return [];
        }
    }

    /**
     * Get full organization data (decompressed)
     */
    getFullOrganizationData(orgName) {
        try {
            const compressedData = localStorage.getItem(`compressed_${orgName}`);
            if (compressedData) {
                return this.decompressData(compressedData);
            }
            
            // Fallback to old format if compressed data not found
            // This handles backward compatibility for data stored before compression
            const organizations = this.getOrganizations();
            const orgData = organizations.find(org => org.organization === orgName);
            
            // If we found metadata but no compressed data, try to reconstruct
            if (orgData && orgData.statistics) {
                console.log('⚠️ Found metadata but no compressed data for', orgName, '- this is expected for old data');
                // Return a minimal structure for backward compatibility
                return {
                    organization: orgName,
                    timestamp: orgData.timestamp,
                    data: {
                        statistics: orgData.statistics,
                        topDependencies: [],
                        topRepositories: [],
                        allDependencies: [],
                        allRepositories: [],
                        categoryStats: {},
                        languageStats: {}
                    }
                };
            }
            
            return orgData || null;
        } catch (error) {
            console.error('❌ Failed to load full organization data:', error);
            return null;
        }
    }

    /**
     * Add analysis to organizations list
     */
    addToOrganizations(orgName, timestamp, data, compressedData) {
        try {
            const organizations = this.getOrganizations();
            
            // Check if organization already exists
            const existingIndex = organizations.findIndex(org => org.organization === orgName);
            
            // Create metadata-only entry (without the full data object)
            const metadata = {
                organization: orgName,
                timestamp: timestamp,
                statistics: data.statistics // Store only the statistics for quick access
            };
            
            if (existingIndex !== -1) {
                // Update existing organization metadata
                organizations[existingIndex] = metadata;
            } else {
                // Add new organization metadata
                organizations.push(metadata);
            }

            // Store the compressed data separately
            localStorage.setItem(this.organizationsKey, JSON.stringify(organizations));
            localStorage.setItem(`compressed_${orgName}`, compressedData);
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
            
            // Remove compressed data
            localStorage.removeItem(`compressed_${orgName}`);
            
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
            
            // Clean up any legacy organization-specific keys and compressed data
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('sbomplay_org_') || key.startsWith('compressed_')) {
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
            
            // Calculate compressed data size
            let compressedDataSize = 0;
            const organizations = this.getOrganizations();
            for (const org of organizations) {
                const compressedData = localStorage.getItem(`compressed_${org.organization}`);
                if (compressedData) {
                    compressedDataSize += new Blob([compressedData]).size;
                }
            }
            
            const totalSize = historySize + organizationsSize + compressedDataSize;
            
            return {
                historyDataSize: historySize,
                organizationsDataSize: organizationsSize,
                compressedDataSize: compressedDataSize,
                totalSize: totalSize,
                maxStorageSize: this.maxStorageSize,
                availableSpace: this.maxStorageSize - totalSize,
                hasData: organizations.length > 0,
                historyCount: this.getHistory().length,
                organizationsCount: organizations.length,
                organizations: organizations.map(org => ({
                    name: org.organization,
                    timestamp: org.timestamp,
                    repositories: org.statistics.totalRepositories,
                    dependencies: org.statistics.totalDependencies
                }))
            };
        } catch (error) {
            console.error('❌ Failed to get storage info:', error);
            return {
                historyDataSize: 0,
                organizationsDataSize: 0,
                compressedDataSize: 0,
                totalSize: 0,
                maxStorageSize: this.maxStorageSize,
                availableSpace: this.maxStorageSize,
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
     * Get storage management recommendations
     */
    getStorageRecommendations() {
        try {
            const storageInfo = this.getStorageInfo();
            const recommendations = [];
            
            if (storageInfo.totalSize > this.maxStorageSize * 0.8) {
                recommendations.push({
                    type: 'warning',
                    message: 'Storage is nearly full. Consider exporting and clearing old data.',
                    action: 'export_and_clear'
                });
            }
            
            if (storageInfo.organizationsCount > this.maxOrganizations * 0.8) {
                recommendations.push({
                    type: 'info',
                    message: `You have ${storageInfo.organizationsCount} organizations stored. Consider removing old ones.`,
                    action: 'review_organizations'
                });
            }
            
            if (storageInfo.historyCount > this.maxHistoryEntries * 0.8) {
                recommendations.push({
                    type: 'info',
                    message: `You have ${storageInfo.historyCount} history entries. Old entries will be automatically cleaned up.`,
                    action: 'review_history'
                });
            }
            
            return {
                recommendations: recommendations,
                storageInfo: storageInfo
            };
        } catch (error) {
            console.error('❌ Failed to get storage recommendations:', error);
            return {
                recommendations: [],
                storageInfo: null
            };
        }
    }

    /**
     * Show storage status to user
     */
    showStorageStatus() {
        try {
            const storageInfo = this.getStorageInfo();
            const usagePercent = (storageInfo.totalSize / storageInfo.maxStorageSize) * 100;
            
            console.log(`📊 Storage Status:`);
            console.log(`   Total Usage: ${(storageInfo.totalSize / 1024 / 1024).toFixed(2)}MB / ${(storageInfo.maxStorageSize / 1024 / 1024).toFixed(2)}MB (${usagePercent.toFixed(1)}%)`);
            console.log(`   Available: ${(storageInfo.availableSpace / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   Organizations: ${storageInfo.organizationsCount}`);
            console.log(`   History Entries: ${storageInfo.historyCount}`);
            
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
     * Test storage quota management (for debugging)
     */
    testStorageQuota() {
        try {
            console.log('🧪 Testing storage quota management...');
            
            // Test current storage status
            const currentStatus = this.getStorageInfo();
            console.log('Current storage status:', currentStatus);
            
            // Test compression
            const testData = {
                organization: 'test-org',
                timestamp: new Date().toISOString(),
                data: {
                    statistics: {
                        totalRepositories: 100,
                        totalDependencies: 5000
                    },
                    topDependencies: Array.from({length: 100}, (_, i) => ({
                        name: `test-dep-${i}`,
                        version: '1.0.0',
                        count: Math.floor(Math.random() * 100)
                    })),
                    topRepositories: Array.from({length: 50}, (_, i) => ({
                        name: `test-repo-${i}`,
                        totalDependencies: Math.floor(Math.random() * 200)
                    }))
                }
            };
            
            const compressed = this.compressData(testData);
            const compressedSize = new Blob([compressed]).size;
            console.log(`Test data compressed size: ${(compressedSize / 1024).toFixed(2)}KB`);
            
            // Test storage space check
            const hasSpace = this.hasEnoughStorage(compressedSize);
            console.log(`Has enough space for test data: ${hasSpace}`);
            
            return {
                currentStatus,
                testDataSize: compressedSize,
                hasSpace,
                compressionRatio: (compressedSize / (JSON.stringify(testData).length)) * 100
            };
        } catch (error) {
            console.error('❌ Storage quota test failed:', error);
            return null;
        }
    }

    /**
     * Migrate old data to new compressed format
     */
    migrateOldData() {
        try {
            console.log('🔄 Migrating old data to new compressed format...');
            
            const organizations = this.getOrganizations();
            let migratedCount = 0;
            
            for (const org of organizations) {
                // Check if this organization has old format data (full data in organizations list)
                const oldData = localStorage.getItem(this.organizationsKey);
                if (oldData) {
                    const oldOrgs = JSON.parse(oldData);
                    const oldOrg = oldOrgs.find(o => o.organization === org.organization);
                    
                    if (oldOrg && oldOrg.data) {
                        console.log(`🔄 Migrating ${org.organization} to compressed format...`);
                        
                        // Compress the old data
                        const compressedData = this.compressData(oldOrg);
                        
                        // Store compressed data
                        localStorage.setItem(`compressed_${org.organization}`, compressedData);
                        
                        // Update the organizations list to use new format
                        const updatedOrgs = oldOrgs.map(o => {
                            if (o.organization === org.organization) {
                                return {
                                    organization: o.organization,
                                    timestamp: o.timestamp,
                                    statistics: o.data.statistics
                                };
                            }
                            return o;
                        });
                        
                        localStorage.setItem(this.organizationsKey, JSON.stringify(updatedOrgs));
                        migratedCount++;
                    }
                }
            }
            
            console.log(`✅ Migrated ${migratedCount} organizations to compressed format`);
            return migratedCount;
        } catch (error) {
            console.error('❌ Failed to migrate old data:', error);
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
                const orgData = this.getFullOrganizationData(org.organization);
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
            languageStats: {},
            vulnerabilities: [],
            licenses: [],
            vulnerabilityAnalysis: null,
            licenseAnalysis: null
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
                
                // Handle language stats as array (from sbom-processor.js)
                if (Array.isArray(orgData.data.languageStats)) {
                    for (const langStat of orgData.data.languageStats) {
                        const language = langStat.language;
                        const count = langStat.count;
                        combined.languageStats[language] = (combined.languageStats[language] || 0) + count;
                        console.log(`  ${language}: array format, count = ${count}`);
                    }
                } else {
                    // Handle as object (fallback for old format)
                    for (const [language, value] of Object.entries(orgData.data.languageStats)) {
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
            
            // Combine vulnerabilities
            if (orgData.data.vulnerabilities) {
                console.log('Vulnerabilities for', orgData.organization, ':', orgData.data.vulnerabilities.length);
                combined.vulnerabilities.push(...orgData.data.vulnerabilities);
            }
            
            // Combine licenses
            if (orgData.data.licenses) {
                console.log('Licenses for', orgData.organization, ':', orgData.data.licenses.length);
                combined.licenses.push(...orgData.data.licenses);
            }

            // Combine vulnerability analysis
            if (orgData.data.vulnerabilityAnalysis) {
                combined.vulnerabilityAnalysis = orgData.data.vulnerabilityAnalysis;
            }

            // Combine license analysis
            if (orgData.data.licenseAnalysis) {
                combined.licenseAnalysis = orgData.data.licenseAnalysis;
            }
        }
        
        console.log('Final combined category stats:', combined.categoryStats);
        console.log('Final combined language stats:', combined.languageStats);
        console.log('Final combined vulnerabilities:', combined.vulnerabilities.length);
        console.log('Final combined licenses:', combined.licenses.length);

        return combined;
    }

    /**
     * Save vulnerability data to centralized storage
     */
    saveVulnerabilityData(packageKey, vulnerabilityData) {
        try {
            const vulnerabilities = this.getVulnerabilityData();
            vulnerabilities[packageKey] = {
                ...vulnerabilityData,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem(this.vulnerabilitiesKey, JSON.stringify(vulnerabilities));
            console.log(`✅ Saved vulnerability data for ${packageKey}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to save vulnerability data:', error);
            return false;
        }
    }

    /**
     * Get vulnerability data from centralized storage
     */
    getVulnerabilityData() {
        try {
            const data = localStorage.getItem(this.vulnerabilitiesKey);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('❌ Failed to get vulnerability data:', error);
            return {};
        }
    }

    /**
     * Get vulnerability data for a specific package
     */
    getVulnerabilityDataForPackage(packageKey) {
        const vulnerabilities = this.getVulnerabilityData();
        return vulnerabilities[packageKey] || null;
    }

    /**
     * Check if vulnerability data exists for a package
     */
    hasVulnerabilityData(packageKey) {
        const vulnerabilities = this.getVulnerabilityData();
        return packageKey in vulnerabilities;
    }

    /**
     * Get all vulnerability data keys
     */
    getAllVulnerabilityKeys() {
        const vulnerabilities = this.getVulnerabilityData();
        return Object.keys(vulnerabilities);
    }

    /**
     * Clear all vulnerability data
     */
    clearVulnerabilityData() {
        try {
            localStorage.removeItem(this.vulnerabilitiesKey);
            console.log('✅ Cleared all vulnerability data');
            return true;
        } catch (error) {
            console.error('❌ Failed to clear vulnerability data:', error);
            return false;
        }
    }

    /**
     * Get vulnerability storage statistics
     */
    getVulnerabilityStorageStats() {
        const vulnerabilities = this.getVulnerabilityData();
        const keys = Object.keys(vulnerabilities);
        const totalSize = new Blob([JSON.stringify(vulnerabilities)]).size;
        
        return {
            totalPackages: keys.length,
            totalSize: totalSize,
            sizeInMB: (totalSize / 1024 / 1024).toFixed(2),
            packages: keys.slice(0, 10) // First 10 packages for display
        };
    }

    /**
     * Clean up old vulnerability data (older than 30 days)
     */
    cleanupOldVulnerabilityData() {
        try {
            const vulnerabilities = this.getVulnerabilityData();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            let cleanedCount = 0;
            const cleanedVulnerabilities = {};
            
            for (const [key, data] of Object.entries(vulnerabilities)) {
                const dataDate = new Date(data.timestamp);
                if (dataDate > thirtyDaysAgo) {
                    cleanedVulnerabilities[key] = data;
                } else {
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                localStorage.setItem(this.vulnerabilitiesKey, JSON.stringify(cleanedVulnerabilities));
                console.log(`🧹 Cleaned up ${cleanedCount} old vulnerability entries`);
            }
            
            return cleanedCount;
        } catch (error) {
            console.error('❌ Failed to cleanup old vulnerability data:', error);
            return 0;
        }
    }

    /**
     * Save incremental analysis data (every 10 repositories)
     */
    saveIncrementalAnalysisData(orgName, partialData, isComplete = false) {
        try {
            const timestamp = new Date().toISOString();
            
            // Get existing data to merge with
            const existingData = this.getFullOrganizationData(orgName);
            let mergedData;
            
            if (existingData && existingData.data) {
                // Merge with existing data
                mergedData = this.mergeAnalysisData(existingData.data, partialData);
                console.log(`🔄 Merging incremental data with existing data for ${orgName}`);
            } else {
                // First save, use partial data as is
                mergedData = partialData;
                console.log(`🆕 First incremental save for ${orgName}`);
            }

            const analysisData = {
                organization: orgName,
                timestamp: timestamp,
                data: mergedData,
                isComplete: isComplete
            };

            // Compress the data
            const compressedData = this.compressData(analysisData);
            const dataSize = new Blob([compressedData]).size;

            console.log(`📊 Incremental data size: ${(dataSize / 1024 / 1024).toFixed(2)}MB`);

            // Check if we have enough space
            if (!this.hasEnoughStorage(dataSize)) {
                console.log('⚠️ Storage quota exceeded during incremental save, attempting cleanup...');
                this.cleanupOldData(dataSize);
                
                // Check again after cleanup
                if (!this.hasEnoughStorage(dataSize)) {
                    throw new Error('Storage quota exceeded even after cleanup. Please export and clear some data.');
                }
            }

            // Add to organizations list (this is the single source of truth)
            this.addToOrganizations(orgName, timestamp, mergedData, compressedData);

            // Add to history only when complete
            if (isComplete) {
                this.addToHistory(orgName, timestamp, mergedData);
            }

            console.log(`✅ Incremental analysis data saved to local storage (${isComplete ? 'complete' : 'partial'})`);
            return true;
        } catch (error) {
            console.error('❌ Failed to save incremental data:', error);
            
            // Show user-friendly error message
            if (error.message.includes('Storage quota exceeded')) {
                alert('Storage quota exceeded! Please export your data and clear some old analyses to continue.');
            }
            
            return false;
        }
    }

    /**
     * Merge partial analysis data with existing data
     */
    mergeAnalysisData(existingData, newData) {
        try {
            const merged = { ...existingData };
            
            // Merge statistics
            if (newData.statistics) {
                merged.statistics = {
                    ...merged.statistics,
                    ...newData.statistics,
                    // Update processed counts
                    processedRepositories: Math.max(merged.statistics.processedRepositories || 0, newData.statistics.processedRepositories || 0),
                    successfulRepositories: Math.max(merged.statistics.successfulRepositories || 0, newData.statistics.successfulRepositories || 0),
                    failedRepositories: Math.max(merged.statistics.failedRepositories || 0, newData.statistics.failedRepositories || 0)
                };
            }
            
            // Merge dependencies (avoid duplicates)
            if (newData.allDependencies) {
                const existingDeps = new Map();
                if (merged.allDependencies) {
                    merged.allDependencies.forEach(dep => {
                        existingDeps.set(`${dep.name}@${dep.version}`, dep);
                    });
                }
                
                // Add new dependencies
                newData.allDependencies.forEach(dep => {
                    const key = `${dep.name}@${dep.version}`;
                    if (!existingDeps.has(key)) {
                        existingDeps.set(key, dep);
                    } else {
                        // Merge repositories if dependency already exists
                        const existing = existingDeps.get(key);
                        const newRepos = new Set(dep.repositories || []);
                        const existingRepos = new Set(existing.repositories || []);
                        existing.repositories = Array.from(new Set([...existingRepos, ...newRepos]));
                        existing.count = Math.max(existing.count || 0, dep.count || 0);
                    }
                });
                
                merged.allDependencies = Array.from(existingDeps.values());
            }
            
            // Merge repositories (avoid duplicates)
            if (newData.allRepositories) {
                const existingRepos = new Map();
                if (merged.allRepositories) {
                    merged.allRepositories.forEach(repo => {
                        existingRepos.set(`${repo.owner}/${repo.name}`, repo);
                    });
                }
                
                // Add new repositories
                newData.allRepositories.forEach(repo => {
                    const key = `${repo.owner}/${repo.name}`;
                    if (!existingRepos.has(key)) {
                        existingRepos.set(key, repo);
                    }
                });
                
                merged.allRepositories = Array.from(existingRepos.values());
            }
            
            // Merge top dependencies (keep the most recent top 20)
            if (newData.topDependencies) {
                const allDeps = new Map();
                if (merged.topDependencies) {
                    merged.topDependencies.forEach(dep => {
                        allDeps.set(`${dep.name}@${dep.version}`, dep);
                    });
                }
                
                newData.topDependencies.forEach(dep => {
                    const key = `${dep.name}@${dep.version}`;
                    if (!allDeps.has(key)) {
                        allDeps.set(key, dep);
                    }
                });
                
                // Sort by count and take top 20
                merged.topDependencies = Array.from(allDeps.values())
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 20);
            }
            
            // Merge top repositories (keep the most recent top 10)
            if (newData.topRepositories) {
                const allRepos = new Map();
                if (merged.topRepositories) {
                    merged.topRepositories.forEach(repo => {
                        allRepos.set(`${repo.owner}/${repo.name}`, repo);
                    });
                }
                
                newData.topRepositories.forEach(repo => {
                    const key = `${repo.owner}/${repo.name}`;
                    if (!allRepos.has(key)) {
                        allRepos.set(key, repo);
                    }
                });
                
                // Sort by dependency count and take top 10
                merged.topRepositories = Array.from(allRepos.values())
                    .sort((a, b) => b.totalDependencies - a.totalDependencies)
                    .slice(0, 10);
            }
            
            // Merge category stats
            if (newData.categoryStats) {
                merged.categoryStats = { ...merged.categoryStats, ...newData.categoryStats };
            }
            
            // Merge language stats
            if (newData.languageStats) {
                merged.languageStats = { ...merged.languageStats, ...newData.languageStats };
            }
            
            // Merge dependency distribution
            if (newData.dependencyDistribution) {
                merged.dependencyDistribution = { ...merged.dependencyDistribution, ...newData.dependencyDistribution };
            }
            
            // Keep existing vulnerability and license analysis if not in new data
            if (!newData.vulnerabilityAnalysis && merged.vulnerabilityAnalysis) {
                // Keep existing vulnerability analysis
            }
            if (!newData.licenseAnalysis && merged.licenseAnalysis) {
                // Keep existing license analysis
            }
            
            console.log(`🔄 Merged analysis data: ${merged.allDependencies?.length || 0} dependencies, ${merged.allRepositories?.length || 0} repositories`);
            return merged;
        } catch (error) {
            console.error('❌ Failed to merge analysis data:', error);
            // Fallback to new data if merge fails
            return newData;
        }
    }

    /**
     * Update existing analysis data with new vulnerability information
     */
    updateAnalysisWithVulnerabilities(orgName, vulnerabilityData) {
        try {
            // Get existing data
            const existingData = this.getFullOrganizationData(orgName);
            if (!existingData) {
                console.warn('⚠️ No existing data found for organization:', orgName);
                return false;
            }

            // Update with new vulnerability data
            existingData.data.vulnerabilityAnalysis = vulnerabilityData;
            existingData.timestamp = new Date().toISOString();

            // Save updated data
            return this.saveIncrementalAnalysisData(orgName, existingData.data, true);
        } catch (error) {
            console.error('❌ Failed to update analysis with vulnerabilities:', error);
            return false;
        }
    }

    /**
     * Get partial analysis data for an organization
     */
    getPartialAnalysisData(orgName) {
        try {
            const fullData = this.getFullOrganizationData(orgName);
            if (fullData && fullData.data) {
                return {
                    organization: orgName,
                    timestamp: fullData.timestamp,
                    data: fullData.data,
                    isComplete: !fullData.data.vulnerabilityAnalysis // Consider incomplete if no vulnerability analysis
                };
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to get partial analysis data:', error);
            return null;
        }
    }

    /**
     * Check if analysis data is getting too large and warn user
     */
    checkDataSizeAndWarn(orgName) {
        try {
            const fullData = this.getFullOrganizationData(orgName);
            if (fullData && fullData.data) {
                const dataSize = new Blob([JSON.stringify(fullData.data)]).size;
                const sizeInMB = dataSize / 1024 / 1024;
                
                if (sizeInMB > 10) {
                    console.warn(`⚠️ Analysis data for ${orgName} is large (${sizeInMB.toFixed(2)}MB). This may impact performance.`);
                    return {
                        isLarge: true,
                        sizeInMB: sizeInMB,
                        message: `Analysis data is ${sizeInMB.toFixed(2)}MB. Consider exporting and clearing old data for better performance.`
                    };
                }
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