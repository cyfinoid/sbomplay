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
            
            console.log(`💾 Saving analysis data for: ${name} (${isRepo ? 'repository' : 'organization'})`);
            console.log(`   - Dependencies: ${data?.statistics?.totalDependencies || 0}`);
            if (isRepo) {
                console.log(`   - Repositories: 1`);
            } else {
                console.log(`   - Repositories: ${data?.statistics?.totalRepositories || 0}`);
            }
            
            const analysisData = {
                timestamp: timestamp,
                data: data
            };

            let saveResult;
            if (isRepo) {
                saveResult = await this.indexedDB.saveRepository(name, {
                    fullName: name,
                    timestamp: timestamp,
                    data: data,
                    type: 'repository'
                });
            } else {
                saveResult = await this.indexedDB.saveOrganization(name, {
                    organization: name,
                    timestamp: timestamp,
                    data: data,
                    type: 'organization'
                });
            }
            
            if (saveResult) {
                console.log(`✅ Successfully saved analysis data for: ${name}`);
                // Verify the data was saved by immediately checking storage info
                const verifyInfo = await this.getStorageInfo();
                const found = isRepo 
                    ? verifyInfo.repositories.some(r => r.name === name)
                    : verifyInfo.organizations.some(o => o.name === name);
                if (found) {
                    console.log(`✅ Verified: ${name} is now in storage`);
                } else {
                    console.warn(`⚠️ Warning: ${name} not found in storage immediately after save`);
                }
            } else {
                console.error(`❌ Failed to save analysis data for: ${name}`);
            }
            
            return saveResult;
        } catch (error) {
            console.error('❌ Failed to save analysis data:', error);
            console.error('   Error details:', error.stack);
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
     * Generate SHA-256 checksum for data (excluding checksum field)
     * This ensures consistent checksum calculation
     */
    async generateChecksum(data) {
        try {
            // Create a copy without checksum field to ensure consistent hashing
            const dataForChecksum = { ...data };
            delete dataForChecksum.checksum;
            
            // Sort keys for consistent JSON stringification (optional but helps with consistency)
            const sortedData = {};
            Object.keys(dataForChecksum).sort().forEach(key => {
                sortedData[key] = dataForChecksum[key];
            });
            
            const jsonString = JSON.stringify(sortedData);
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(jsonString);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        } catch (error) {
            console.error('❌ Failed to generate checksum:', error);
            throw error;
        }
    }

    /**
     * Generic export function for different data types
     * @param {string} type - Export type: 'all', 'cached', 'authors', 'packages', 'vulnerabilities', 'analysis'
     * @param {string} filename - Output filename
     * @returns {Promise<boolean>} - Success status
     */
    async _exportDataByType(type, filename) {
        try {
            const dataGetters = {
                'all': async () => ({
                    entries: await this.indexedDB.getAllEntries(),
                    vulnerabilities: await this.indexedDB.getAllVulnerabilities(),
                    authorEntities: await this.indexedDB.getAllAuthorEntities(),
                    packageAuthors: await this.indexedDB.getAllPackageAuthors(),
                    packages: await this.indexedDB.getAllPackages()
                }),
                'cached': async () => ({
                    authorEntities: await this.indexedDB.getAllAuthorEntities(),
                    packageAuthors: await this.indexedDB.getAllPackageAuthors(),
                    packages: await this.indexedDB.getAllPackages(),
                    vulnerabilities: await this.indexedDB.getAllVulnerabilities()
                }),
                'authors': async () => ({
                    authorEntities: await this.indexedDB.getAllAuthorEntities(),
                    packageAuthors: await this.indexedDB.getAllPackageAuthors()
                }),
                'packages': async () => ({
                    packages: await this.indexedDB.getAllPackages()
                }),
                'vulnerabilities': async () => ({
                    vulnerabilities: await this.indexedDB.getAllVulnerabilities()
                }),
                'analysis': async () => ({
                    entries: await this.indexedDB.getAllEntries()
                })
            };
            
            const getData = dataGetters[type];
            if (!getData) {
                throw new Error(`Unknown export type: ${type}`);
            }
            
            const data = await getData();
            const exportData = {
                version: '1.0',
                type: type,
                ...data,
                exportTimestamp: new Date().toISOString()
            };
            
            // Generate checksum (before adding checksum field)
            const checksum = await this.generateChecksum(exportData);
            exportData.checksum = checksum;
            
            return this.exportData(exportData, filename);
        } catch (error) {
            console.error(`❌ Failed to export ${type} data:`, error);
            return false;
        }
    }

    /**
     * Export all data
     */
    async exportAllData(filename = 'sbom-all-analyses.json') {
        return this._exportDataByType('all', filename);
    }

    /**
     * Export cached databases (authors, packages, vulnerabilities)
     */
    async exportCachedDatabases(filename = 'sbom-cached-databases.json') {
        return this._exportDataByType('cached', filename);
    }

    /**
     * Export authors cache
     */
    async exportAuthorsCache(filename = 'sbom-authors-cache.json') {
        return this._exportDataByType('authors', filename);
    }

    /**
     * Export packages cache
     */
    async exportPackagesCache(filename = 'sbom-packages-cache.json') {
        return this._exportDataByType('packages', filename);
    }

    /**
     * Export vulnerabilities cache
     */
    async exportVulnerabilitiesCache(filename = 'sbom-vulnerabilities-cache.json') {
        return this._exportDataByType('vulnerabilities', filename);
    }

    /**
     * Export analysis data only (organizations and repositories)
     */
    async exportAnalysisData(filename = 'sbom-analysis-data.json') {
        return this._exportDataByType('analysis', filename);
    }

    /**
     * Verify checksum of imported data
     */
    async verifyChecksum(jsonData) {
        try {
            if (!jsonData.checksum) {
                return { valid: false, error: 'No checksum found in imported data' };
            }

            // Extract checksum
            const providedChecksum = jsonData.checksum;

            // Recalculate checksum (generateChecksum already excludes checksum field)
            const calculatedChecksum = await this.generateChecksum(jsonData);

            if (providedChecksum !== calculatedChecksum) {
                return { 
                    valid: false, 
                    error: `Checksum mismatch! File may be corrupted or tampered with. Expected: ${calculatedChecksum.substring(0, 16)}..., Got: ${providedChecksum.substring(0, 16)}...` 
                };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Checksum verification failed: ${error.message}` };
        }
    }

    /**
     * Import all data from JSON file
     */
    async importAllData(jsonData) {
        try {
            // Validate data structure
            if (!jsonData || typeof jsonData !== 'object') {
                throw new Error('Invalid data format: Expected JSON object');
            }

            // Verify checksum if present
            if (jsonData.checksum) {
                const checksumResult = await this.verifyChecksum(jsonData);
                if (!checksumResult.valid) {
                    throw new Error(checksumResult.error);
                }
            }

            // Handle different import types
            if (jsonData.type === 'all') {
                return await this._importAllData(jsonData);
            } else if (jsonData.type === 'cached') {
                return await this._importCachedDatabases(jsonData);
            } else if (jsonData.type === 'authors') {
                return await this._importAuthorsCache(jsonData);
            } else if (jsonData.type === 'packages') {
                return await this._importPackagesCache(jsonData);
            } else if (jsonData.type === 'vulnerabilities') {
                return await this._importVulnerabilitiesCache(jsonData);
            } else if (jsonData.type === 'analysis') {
                return await this._importAnalysisData(jsonData);
            } else {
                // Legacy format - try to import as all data
                return await this._importAllData(jsonData);
            }
        } catch (error) {
            console.error('❌ Failed to import data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generic import handler for different data types
     * @param {string} type - Import type
     * @param {Object} jsonData - Data to import
     * @returns {Promise<Object>} - Import result
     */
    async _importDataByType(type, jsonData) {
        // Verify checksum if present
        if (jsonData.checksum) {
            const checksumResult = await this.verifyChecksum(jsonData);
            if (!checksumResult.valid) {
                throw new Error(checksumResult.error);
            }
        }

        const result = {
            success: true,
            errors: []
        };

        // Import handlers for different data types
        const importHandlers = {
            entries: async (entries) => {
                if (!Array.isArray(entries)) {
                    throw new Error('Invalid data format: Missing or invalid entries array');
                }
                let importedEntries = 0;
                let skippedEntries = 0;
                for (const entry of entries) {
                    try {
                        if (!entry.name && !entry.fullName) {
                            skippedEntries++;
                            continue;
                        }
                        if (entry.type === 'organization' || entry.organization) {
                            const success = await this.indexedDB.saveOrganization(entry.name || entry.organization, entry);
                            if (success) importedEntries++;
                            else result.errors.push(`Failed to import organization: ${entry.name || entry.organization}`);
                        } else if (entry.type === 'repository' || entry.fullName) {
                            const success = await this.indexedDB.saveRepository(entry.fullName, entry);
                            if (success) importedEntries++;
                            else result.errors.push(`Failed to import repository: ${entry.fullName}`);
                        } else {
                            skippedEntries++;
                        }
                    } catch (error) {
                        result.errors.push(`Error importing entry ${entry.name || entry.fullName}: ${error.message}`);
                    }
                }
                result.importedEntries = importedEntries;
                result.skippedEntries = skippedEntries;
            },
            vulnerabilities: async (vulnerabilities) => {
                if (!Array.isArray(vulnerabilities)) return;
                let count = 0;
                for (const vuln of vulnerabilities) {
                    try {
                        if (!vuln.packageKey) continue;
                        const success = await this.indexedDB.saveVulnerability(vuln.packageKey, vuln.data || vuln);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing vulnerability ${vuln.packageKey}: ${error.message}`);
                    }
                }
                result.importedVulnerabilities = count;
            },
            authorEntities: async (authors) => {
                if (!Array.isArray(authors)) return;
                let count = 0;
                for (const author of authors) {
                    try {
                        if (!author.authorKey) continue;
                        const success = await this.indexedDB.saveAuthorEntity(author.authorKey, author);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing author ${author.authorKey}: ${error.message}`);
                    }
                }
                result.importedAuthors = count;
            },
            packageAuthors: async (relationships) => {
                if (!Array.isArray(relationships)) return;
                let count = 0;
                for (const rel of relationships) {
                    try {
                        if (!rel.packageAuthorKey) continue;
                        const success = await this.indexedDB.savePackageAuthor(rel.packageKey, rel.authorKey);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing package-author relationship: ${error.message}`);
                    }
                }
                if (type === 'authors') {
                    result.importedRelationships = count;
                } else {
                    result.importedPackages = (result.importedPackages || 0) + count;
                }
            },
            packages: async (packages) => {
                if (!Array.isArray(packages)) return;
                let count = 0;
                for (const pkg of packages) {
                    try {
                        if (!pkg.packageKey) continue;
                        const success = await this.indexedDB.savePackage(pkg.packageKey, pkg);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing package ${pkg.packageKey}: ${error.message}`);
                    }
                }
                result.importedPackages = (result.importedPackages || 0) + count;
            }
        };

        // Import based on type
        if (type === 'all') {
            await importHandlers.entries(jsonData.entries);
            await importHandlers.vulnerabilities(jsonData.vulnerabilities);
            await importHandlers.authorEntities(jsonData.authorEntities);
            await importHandlers.packageAuthors(jsonData.packageAuthors);
            await importHandlers.packages(jsonData.packages);
        } else if (type === 'cached') {
            await importHandlers.authorEntities(jsonData.authorEntities);
            await importHandlers.packageAuthors(jsonData.packageAuthors);
            await importHandlers.packages(jsonData.packages);
            await importHandlers.vulnerabilities(jsonData.vulnerabilities);
        } else if (type === 'authors') {
            await importHandlers.authorEntities(jsonData.authorEntities);
            await importHandlers.packageAuthors(jsonData.packageAuthors);
        } else if (type === 'packages') {
            await importHandlers.packages(jsonData.packages);
        } else if (type === 'vulnerabilities') {
            await importHandlers.vulnerabilities(jsonData.vulnerabilities);
        } else if (type === 'analysis') {
            await importHandlers.entries(jsonData.entries);
        }

        result.errors = result.errors.length > 0 ? result.errors : null;
        return result;
    }

    /**
     * Import all data (legacy and new format)
     */
    async _importAllData(jsonData) {
        return this._importDataByType('all', jsonData);
    }

    /**
     * Import cached databases (authors, packages, vulnerabilities)
     */
    async _importCachedDatabases(jsonData) {
        return this._importDataByType('cached', jsonData);
    }

    /**
     * Import authors cache
     */
    async _importAuthorsCache(jsonData) {
        return this._importDataByType('authors', jsonData);
    }

    /**
     * Import packages cache
     */
    async _importPackagesCache(jsonData) {
        return this._importDataByType('packages', jsonData);
    }

    /**
     * Import vulnerabilities cache
     */
    async _importVulnerabilitiesCache(jsonData) {
        return this._importDataByType('vulnerabilities', jsonData);
    }

    /**
     * Import analysis data only
     */
    async _importAnalysisData(jsonData) {
        return this._importDataByType('analysis', jsonData);
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
            
            console.log('📊 Getting storage info...');
            const orgs = await this.indexedDB.getAllOrganizations();
            const repos = await this.indexedDB.getAllRepositories();
            const estimate = await this.indexedDB.getStorageEstimate();
            
            const totalEntries = orgs.length + repos.length;
            
            console.log(`📊 Storage info summary: ${orgs.length} orgs, ${repos.length} repos, ${totalEntries} total entries`);
            
            const storageInfo = {
                totalSize: estimate ? estimate.usage : 0,
                maxStorageSize: estimate ? estimate.quota : 0,
                availableSpace: estimate ? (estimate.quota - estimate.usage) : 0,
                hasData: totalEntries > 0,
                organizationsCount: orgs.length,
                repositoriesCount: repos.length,
                totalEntries: totalEntries,
                organizations: orgs.map(org => {
                    const name = org.organization || org.name;
                    // Calculate from actual data arrays for accuracy (matches Statistics Dashboard)
                    const actualRepos = org.data?.allRepositories?.length || org.data?.statistics?.totalRepositories || 0;
                    const actualDeps = org.data?.allDependencies?.length || org.data?.statistics?.totalDependencies || 0;
                    console.log(`   📋 Org: ${name} - ${actualRepos} repos, ${actualDeps} deps (from ${org.data?.allRepositories ? 'allRepositories' : 'statistics'})`);
                    return {
                        name: name,
                        timestamp: org.timestamp,
                        repositories: actualRepos,
                        dependencies: actualDeps,
                        type: 'organization'
                    };
                }),
                repositories: repos.map(repo => {
                    // Calculate from actual data arrays for accuracy (matches Statistics Dashboard)
                    const actualDeps = repo.data?.allDependencies?.length || repo.data?.statistics?.totalDependencies || 0;
                    console.log(`   📋 Repo: ${repo.fullName} - ${actualDeps} deps (from ${repo.data?.allDependencies ? 'allDependencies' : 'statistics'})`);
                    return {
                        name: repo.fullName,
                        timestamp: repo.timestamp,
                        repositories: 1,
                        dependencies: actualDeps,
                        type: 'repository'
                    };
                }),
                usagePercent: estimate ? parseFloat(estimate.usagePercent) : 0
            };
            
            console.log(`✅ Storage info retrieved: ${storageInfo.organizations.length} orgs, ${storageInfo.repositories.length} repos`);
            return storageInfo;
        } catch (error) {
            console.error('❌ Failed to get storage info:', error);
            console.error('   Error details:', error.stack);
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
            licenseAnalysis: null,
            qualityAnalysis: null,
            githubActionsAnalysis: null
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
                    // Ensure repositories is always an array, never undefined
                    const depRepositories = Array.isArray(dep.repositories) ? dep.repositories : [];
                    
                    if (dependencyMap.has(key)) {
                        const existing = dependencyMap.get(key);
                        existing.count += dep.count;
                        // Merge repositories, ensuring we don't add duplicates
                        existing.repositories = [...new Set([...existing.repositories, ...depRepositories])];
                    } else {
                        dependencyMap.set(key, {
                            ...dep,
                            repositories: [...depRepositories]
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

        // Aggregate quality analysis from all repositories
        if (window.SBOMQualityProcessor) {
            const qualityProcessor = new window.SBOMQualityProcessor();
            const allQualityAssessments = combined.allRepositories
                .filter(repo => repo.qualityAssessment)
                .map(repo => repo.qualityAssessment);
            
            if (allQualityAssessments.length > 0) {
                combined.qualityAnalysis = qualityProcessor.calculateAggregateQuality(allQualityAssessments);
            }
        }

        // Combine vulnerability analysis from all organizations
        const vulnerabilityMap = new Map(); // key: name@version
        let totalCriticalVulnerabilities = 0;
        let totalHighVulnerabilities = 0;
        let totalMediumVulnerabilities = 0;
        let totalLowVulnerabilities = 0;

        for (const entry of entriesData) {
            if (entry.data.vulnerabilityAnalysis) {
                const vulnAnalysis = entry.data.vulnerabilityAnalysis;
                
                // Aggregate vulnerability counts (these are counts of vulnerabilities, not packages)
                totalCriticalVulnerabilities += vulnAnalysis.criticalVulnerabilities || 0;
                totalHighVulnerabilities += vulnAnalysis.highVulnerabilities || 0;
                totalMediumVulnerabilities += vulnAnalysis.mediumVulnerabilities || 0;
                totalLowVulnerabilities += vulnAnalysis.lowVulnerabilities || 0;

                // Combine vulnerable dependencies (deduplicate by name@version)
                if (vulnAnalysis.vulnerableDependencies) {
                    for (const vulnDep of vulnAnalysis.vulnerableDependencies) {
                        const key = `${vulnDep.name}@${vulnDep.version}`;
                        if (vulnerabilityMap.has(key)) {
                            // Merge vulnerabilities if same package exists in multiple orgs
                            const existing = vulnerabilityMap.get(key);
                            // Combine vulnerabilities, deduplicate by ID
                            const vulnIdMap = new Map();
                            existing.vulnerabilities.forEach(v => vulnIdMap.set(v.id, v));
                            vulnDep.vulnerabilities.forEach(v => {
                                if (!vulnIdMap.has(v.id)) {
                                    vulnIdMap.set(v.id, v);
                                }
                            });
                            existing.vulnerabilities = Array.from(vulnIdMap.values());
                        } else {
                            vulnerabilityMap.set(key, {
                                name: vulnDep.name,
                                version: vulnDep.version,
                                vulnerabilities: [...(vulnDep.vulnerabilities || [])]
                            });
                        }
                    }
                }
            }
        }

        // Create combined vulnerability analysis
        if (vulnerabilityMap.size > 0) {
            combined.vulnerabilityAnalysis = {
                vulnerablePackages: vulnerabilityMap.size,
                vulnerableDependencies: Array.from(vulnerabilityMap.values()),
                criticalVulnerabilities: totalCriticalVulnerabilities,
                highVulnerabilities: totalHighVulnerabilities,
                mediumVulnerabilities: totalMediumVulnerabilities,
                lowVulnerabilities: totalLowVulnerabilities
            };
        }

        // Combine license analysis from all organizations
        let totalLicensedDeps = 0;
        let totalUnlicensedDeps = 0;
        let totalDeps = 0;
        const categoryBreakdown = {
            permissive: 0,
            copyleft: 0,
            lgpl: 0,
            proprietary: 0,
            unknown: 0
        };
        const riskBreakdown = {
            low: 0,
            medium: 0,
            high: 0
        };
        const allConflicts = [];
        const allRecommendations = [];
        const allHighRiskDependencies = [];
        const licenseFamiliesMap = new Map();

        for (const entry of entriesData) {
            if (entry.data.licenseAnalysis) {
                const licenseAnalysis = entry.data.licenseAnalysis;
                
                // Combine summary
                if (licenseAnalysis.summary) {
                    const summary = licenseAnalysis.summary;
                    totalDeps += summary.totalDependencies || 0;
                    totalLicensedDeps += summary.licensedDependencies || 0;
                    totalUnlicensedDeps += summary.unlicensedDependencies || 0;
                    
                    // Combine category breakdown
                    if (summary.categoryBreakdown) {
                        categoryBreakdown.permissive += summary.categoryBreakdown.permissive || 0;
                        categoryBreakdown.copyleft += summary.categoryBreakdown.copyleft || 0;
                        categoryBreakdown.lgpl += summary.categoryBreakdown.lgpl || 0;
                        categoryBreakdown.proprietary += summary.categoryBreakdown.proprietary || 0;
                        categoryBreakdown.unknown += summary.categoryBreakdown.unknown || 0;
                    }
                    
                    // Combine risk breakdown
                    if (summary.riskBreakdown) {
                        riskBreakdown.low += summary.riskBreakdown.low || 0;
                        riskBreakdown.medium += summary.riskBreakdown.medium || 0;
                        riskBreakdown.high += summary.riskBreakdown.high || 0;
                    }
                }
                
                // Combine conflicts
                if (licenseAnalysis.conflicts && Array.isArray(licenseAnalysis.conflicts)) {
                    allConflicts.push(...licenseAnalysis.conflicts);
                }
                
                // Combine recommendations
                if (licenseAnalysis.recommendations && Array.isArray(licenseAnalysis.recommendations)) {
                    allRecommendations.push(...licenseAnalysis.recommendations);
                }
                
                // Combine high-risk dependencies (deduplicate by name@version)
                if (licenseAnalysis.highRiskDependencies && Array.isArray(licenseAnalysis.highRiskDependencies)) {
                    for (const dep of licenseAnalysis.highRiskDependencies) {
                        const key = `${dep.name}@${dep.version}`;
                        if (!allHighRiskDependencies.find(d => `${d.name}@${d.version}` === key)) {
                            allHighRiskDependencies.push(dep);
                        }
                    }
                }
                
                // Combine license families
                if (licenseAnalysis.licenseFamilies && licenseAnalysis.licenseFamilies instanceof Map) {
                    for (const [family, deps] of licenseAnalysis.licenseFamilies.entries()) {
                        if (!licenseFamiliesMap.has(family)) {
                            licenseFamiliesMap.set(family, []);
                        }
                        const existingDeps = licenseFamiliesMap.get(family);
                        if (Array.isArray(deps)) {
                            existingDeps.push(...deps);
                        }
                    }
                }
            }
        }

        // Combine GitHub Actions analysis from all organizations
        const allGARepositories = [];
        const allGAFindings = [];
        const allGAFindingsByType = {};
        let totalGAActions = 0;
        let uniqueGAActions = 0;
        const uniqueActionsSet = new Set();

        for (const entry of entriesData) {
            if (entry.data.githubActionsAnalysis) {
                const gaAnalysis = entry.data.githubActionsAnalysis;
                
                // Aggregate repositories
                if (gaAnalysis.repositories && Array.isArray(gaAnalysis.repositories)) {
                    allGARepositories.push(...gaAnalysis.repositories);
                }
                
                // Aggregate findings
                if (gaAnalysis.findings && Array.isArray(gaAnalysis.findings)) {
                    allGAFindings.push(...gaAnalysis.findings);
                }
                
                // Aggregate findings by type
                if (gaAnalysis.findingsByType) {
                    for (const [type, count] of Object.entries(gaAnalysis.findingsByType)) {
                        allGAFindingsByType[type] = (allGAFindingsByType[type] || 0) + count;
                    }
                }
                
                // Aggregate action counts
                totalGAActions += gaAnalysis.totalActions || 0;
                
                // Count unique actions across all repositories
                if (gaAnalysis.repositories && Array.isArray(gaAnalysis.repositories)) {
                    for (const repoData of gaAnalysis.repositories) {
                        if (repoData.actions && Array.isArray(repoData.actions)) {
                            for (const action of repoData.actions) {
                                const actionKey = `${action.owner}/${action.repo}${action.path ? '/' + action.path : ''}@${action.ref}`;
                                uniqueActionsSet.add(actionKey);
                                
                                // Also count nested actions
                                if (action.nested && Array.isArray(action.nested)) {
                                    const checkNested = (nestedAction) => {
                                        if (nestedAction.owner && nestedAction.repo) {
                                            const nestedKey = `${nestedAction.owner}/${nestedAction.repo}${nestedAction.path ? '/' + nestedAction.path : ''}@${nestedAction.ref}`;
                                            uniqueActionsSet.add(nestedKey);
                                            if (nestedAction.nested && Array.isArray(nestedAction.nested)) {
                                                nestedAction.nested.forEach(checkNested);
                                            }
                                        }
                                    };
                                    action.nested.forEach(checkNested);
                                }
                            }
                        }
                    }
                }
            }
        }

        uniqueGAActions = uniqueActionsSet.size;

        if (allGARepositories.length > 0 || allGAFindings.length > 0) {
            combined.githubActionsAnalysis = {
                repositories: allGARepositories,
                totalActions: totalGAActions,
                uniqueActions: uniqueGAActions,
                findings: allGAFindings,
                findingsByType: allGAFindingsByType
            };
        }

        // Create combined license analysis
        if (totalDeps > 0) {
            combined.licenseAnalysis = {
                summary: {
                    totalDependencies: totalDeps,
                    licensedDependencies: totalLicensedDeps,
                    unlicensedDependencies: totalUnlicensedDeps,
                    categoryBreakdown: categoryBreakdown,
                    riskBreakdown: riskBreakdown
                },
                conflicts: allConflicts,
                recommendations: allRecommendations,
                licenseFamilies: licenseFamiliesMap,
                highRiskDependencies: allHighRiskDependencies
            };
        }

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
