/**
 * Settings App - Handles settings page functionality
 */
class SettingsApp {
    constructor() {
        this.githubClient = new GitHubClient();
        this.storageManager = new StorageManager();
        this.initializeSettings();
    }

    /**
     * Initialize settings page
     */
    async initializeSettings() {
        await this.storageManager.init();  // This will initialize IndexedDB and expose window.indexedDBManager
        this.loadSavedToken();
        await this.showStorageStatus();
        await this.displayOrganizationsOverview();
        await this.showCacheStats();  // Load cache statistics
        this.loadRateLimitInfo();
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Token input validation
        const tokenInput = document.getElementById('githubToken');
        if (tokenInput) {
            tokenInput.addEventListener('input', (e) => {
                const token = e.target.value.trim();
                if (token && !token.startsWith('ghp_')) {
                    this.updateTokenStatus('Token should start with "ghp_"', 'warning');
                } else if (token) {
                    this.updateTokenStatus('Token format looks valid', 'success');
                } else {
                    this.updateTokenStatus('', '');
                }
            });
        }
    }

    /**
     * Toggle token section visibility
     */
    toggleTokenSection() {
        const tokenSection = document.getElementById('tokenSectionBody');
        const toggleIcon = document.getElementById('tokenToggleIcon');
        
        if (tokenSection.style.display === 'none') {
            tokenSection.style.display = 'block';
            toggleIcon.className = 'fas fa-chevron-up';
        } else {
            tokenSection.style.display = 'none';
            toggleIcon.className = 'fas fa-chevron-down';
        }
    }

    /**
     * Load saved token from session storage
     */
    loadSavedToken() {
        const savedToken = sessionStorage.getItem('github_token');
        if (savedToken) {
            document.getElementById('githubToken').value = savedToken;
            this.githubClient.setToken(savedToken);
            this.updateTokenStatus('Token loaded from session', 'success');
        }
    }

    /**
     * Save token to session storage
     */
    saveToken() {
        const token = document.getElementById('githubToken').value.trim();
        
        if (token) {
            if (!token.startsWith('ghp_')) {
                this.updateTokenStatus('Token should start with "ghp_"', 'warning');
                return;
            }
            
            // Save to session storage (not persistent)
            sessionStorage.setItem('github_token', token);
            this.githubClient.setToken(token);
            this.updateTokenStatus('Token saved to session (not persistent)', 'success');
            
            // Reload rate limit info
            this.loadRateLimitInfo();
        } else {
            // Clear token
            sessionStorage.removeItem('github_token');
            this.githubClient.setToken(null);
            this.updateTokenStatus('Token cleared', 'info');
            this.loadRateLimitInfo();
        }
    }

    /**
     * Update token status display
     */
    updateTokenStatus(message, type) {
        const statusElement = document.getElementById('tokenStatus');
        if (message) {
            const alertClass = type === 'success' ? 'alert-success' : 
                             type === 'warning' ? 'alert-warning' : 
                             type === 'info' ? 'alert-info' : 'alert-danger';
            statusElement.innerHTML = `<div class="alert ${alertClass} alert-sm mb-0">${message}</div>`;
        } else {
            statusElement.innerHTML = '';
        }
    }

    /**
     * Load and display rate limit information
     */
    async loadRateLimitInfo() {
        const statusElement = document.getElementById('rateLimitStatus');
        statusElement.innerHTML = '<p class="text-muted">Loading rate limit information...</p>';
        
        try {
            const rateLimitInfo = await this.githubClient.getRateLimitInfo();
            const resetTime = new Date(rateLimitInfo.reset * 1000);
            
            statusElement.innerHTML = `
                <div class="row">
                    <div class="col-12">
                        <p><strong>Limit:</strong> ${rateLimitInfo.limit}</p>
                        <p><strong>Remaining:</strong> ${rateLimitInfo.remaining}</p>
                        <p><strong>Reset Time:</strong> ${resetTime.toLocaleString()}</p>
                        <p><strong>Authenticated:</strong> ${rateLimitInfo.authenticated}</p>
                    </div>
                </div>
            `;
        } catch (error) {
            statusElement.innerHTML = `<p class="text-danger">Failed to load rate limit information: ${error.message}</p>`;
        }
    }

    /**
     * Show storage status
     */
    async showStorageStatus() {
        const storageInfo = await this.storageManager.getStorageInfo();
        const statusElement = document.getElementById('storageStatus');
        
        const usagePercentage = storageInfo.usagePercent || 0;
        let statusClass = 'success';
        if (usagePercentage > 90) statusClass = 'danger';
        else if (usagePercentage > 70) statusClass = 'warning';
        
        statusElement.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Storage Usage</h6>
                    <div class="progress mb-2" style="height: 1.5rem;">
                        <div class="progress-bar bg-${statusClass}" role="progressbar" 
                             style="width: ${usagePercentage}%" 
                             aria-valuenow="${usagePercentage}" aria-valuemin="0" aria-valuemax="100">
                            ${usagePercentage.toFixed(1)}%
                        </div>
                    </div>
                    <p class="small text-muted mb-0">
                        ${(storageInfo.totalSize / 1024 / 1024).toFixed(2)}MB used of 
                        ${(storageInfo.maxStorageSize / 1024 / 1024).toFixed(2)}MB total
                    </p>
                </div>
                <div class="col-md-6">
                    <h6>Data Summary</h6>
                    <ul class="list-unstyled small">
                        <li><strong>Organizations:</strong> ${storageInfo.organizationsCount}</li>
                        <li><strong>Repositories:</strong> ${storageInfo.repositoriesCount}</li>
                        <li><strong>Total Entries:</strong> ${storageInfo.totalEntries}</li>
                        <li><strong>Available Space:</strong> ${(storageInfo.availableSpace / 1024 / 1024).toFixed(2)}MB</li>
                    </ul>
                </div>
            </div>
        `;
    }

    /**
     * Export all data
     */
    async exportAllData() {
        try {
            await this.storageManager.exportAllData();
            this.showAlert('All data exported successfully with checksum!', 'success');
        } catch (error) {
            this.showAlert(`Export failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Export cached databases (authors, packages, vulnerabilities)
     */
    async exportCachedDatabases() {
        try {
            await this.storageManager.exportCachedDatabases();
            this.showAlert('Cached databases exported successfully with checksum!', 'success');
        } catch (error) {
            this.showAlert(`Export failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Export authors cache
     */
    async exportAuthorsCache() {
        try {
            await this.storageManager.exportAuthorsCache();
            this.showAlert('Authors cache exported successfully with checksum!', 'success');
        } catch (error) {
            this.showAlert(`Export failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Export packages cache
     */
    async exportPackagesCache() {
        try {
            await this.storageManager.exportPackagesCache();
            this.showAlert('Packages cache exported successfully with checksum!', 'success');
        } catch (error) {
            this.showAlert(`Export failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Export vulnerabilities cache
     */
    async exportVulnerabilitiesCache() {
        try {
            await this.storageManager.exportVulnerabilitiesCache();
            this.showAlert('Vulnerabilities cache exported successfully with checksum!', 'success');
        } catch (error) {
            this.showAlert(`Export failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Export analysis data only
     */
    async exportAnalysisData() {
        try {
            await this.storageManager.exportAnalysisData();
            this.showAlert('Analysis data exported successfully with checksum!', 'success');
        } catch (error) {
            this.showAlert(`Export failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Import all data - trigger file input
     */
    importAllData() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.setAttribute('data-import-type', 'all');
            fileInput.click();
        }
    }

    /**
     * Import cached databases - trigger file input
     */
    importCachedDatabases() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.setAttribute('data-import-type', 'cached');
            fileInput.click();
        }
    }

    /**
     * Import authors cache - trigger file input
     */
    importAuthorsCache() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.setAttribute('data-import-type', 'authors');
            fileInput.click();
        }
    }

    /**
     * Import packages cache - trigger file input
     */
    importPackagesCache() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.setAttribute('data-import-type', 'packages');
            fileInput.click();
        }
    }

    /**
     * Import vulnerabilities cache - trigger file input
     */
    importVulnerabilitiesCache() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.setAttribute('data-import-type', 'vulnerabilities');
            fileInput.click();
        }
    }

    /**
     * Import analysis data - trigger file input
     */
    importAnalysisData() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.setAttribute('data-import-type', 'analysis');
            fileInput.click();
        }
    }

    /**
     * Handle file import
     */
    async handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        // Validate file type
        if (!file.name.endsWith('.json')) {
            this.showAlert('Please select a JSON file', 'warning');
            event.target.value = ''; // Reset file input
            return;
        }

        // Confirm import
        if (!confirm('This will import data from the selected file. Existing entries with the same name will be overwritten. Continue?')) {
            event.target.value = ''; // Reset file input
            return;
        }

        try {
            // Read file
            const text = await file.text();
            const jsonData = JSON.parse(text);

            // Show loading message
            this.showAlert('Importing data...', 'info');

            // Import data
            const result = await this.storageManager.importAllData(jsonData);

            if (result.success) {
                let message = `Import completed! `;
                
                // Build message based on import type
                if (result.importedEntries !== undefined) {
                    message += `Imported ${result.importedEntries} entries. `;
                }
                if (result.importedVulnerabilities !== undefined) {
                    message += `Imported ${result.importedVulnerabilities} vulnerabilities. `;
                }
                if (result.importedAuthors !== undefined) {
                    message += `Imported ${result.importedAuthors} authors. `;
                }
                if (result.importedPackages !== undefined) {
                    message += `Imported ${result.importedPackages} packages. `;
                }
                if (result.importedRelationships !== undefined) {
                    message += `Imported ${result.importedRelationships} package-author relationships. `;
                }
                
                if (result.skippedEntries > 0) {
                    message += ` Skipped ${result.skippedEntries} invalid entries.`;
                }

                if (result.errors && result.errors.length > 0) {
                    message += ` ${result.errors.length} errors occurred. Check console for details.`;
                    console.error('Import errors:', result.errors);
                }

                // Check if checksum was verified
                if (jsonData.checksum) {
                    message += ' Checksum verified successfully.';
                }

                this.showAlert(message, result.errors ? 'warning' : 'success');
                
                // Refresh displays
                await this.showStorageStatus();
                await this.displayOrganizationsOverview();
                await this.showCacheStats();
            } else {
                this.showAlert(`Import failed: ${result.error}`, 'danger');
            }
        } catch (error) {
            console.error('Import error:', error);
            this.showAlert(`Import failed: ${error.message}`, 'danger');
        } finally {
            // Reset file input
            event.target.value = '';
        }
    }

    /**
     * Test storage quota
     */
    testStorageQuota() {
        try {
            this.storageManager.testStorageQuota();
            this.showAlert('Storage test completed successfully!', 'success');
            this.showStorageStatus(); // Refresh display
        } catch (error) {
            this.showAlert(`Storage test failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Migrate old data
     */
    migrateOldData() {
        try {
            this.storageManager.migrateOldData();
            this.showAlert('Data migration completed!', 'success');
            this.showStorageStatus(); // Refresh display
        } catch (error) {
            this.showAlert(`Migration failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Clear old data
     */
    clearOldData() {
        if (confirm('Are you sure you want to clear old data? This will remove old history entries and keep only recent analyses.')) {
            try {
                this.storageManager.clearOldData();
                this.showAlert('Old data cleared successfully!', 'success');
                this.showStorageStatus(); // Refresh display
            } catch (error) {
                this.showAlert(`Failed to clear old data: ${error.message}`, 'danger');
            }
        }
    }

    /**
     * Clear all data
     */
    async clearAllData() {
        if (confirm('Are you sure you want to clear ALL data? This action cannot be undone.')) {
            try {
                await this.storageManager.clearAllData();
                this.showAlert('All data cleared successfully!', 'success');
                await this.showStorageStatus(); // Refresh display
                await this.displayOrganizationsOverview(); // Refresh display
            } catch (error) {
                this.showAlert(`Failed to clear data: ${error.message}`, 'danger');
            }
        }
    }

    /**
     * Clear old data (keep only recent)
     */
    async clearOldData() {
        if (confirm('This will remove old analysis data while keeping the most recent. Continue?')) {
            try {
                const storageInfo = await this.storageManager.getStorageInfo();
                const allEntries = [...storageInfo.organizations, ...storageInfo.repositories];
                
                if (allEntries.length <= 3) {
                    this.showAlert('Not enough data to clear. Keep at least 3 recent analyses.', 'info');
                    return;
                }
                
                // Keep only the 3 most recent entries
                allEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const toRemove = allEntries.slice(3);
                
                let removedCount = 0;
                for (const entry of toRemove) {
                    if (await this.storageManager.removeOrganizationData(entry.name)) {
                        removedCount++;
                    }
                }
                
                this.showAlert(`Cleared ${removedCount} old analyses. Kept 3 most recent.`, 'success');
                await this.displayOrganizationsOverview(); // Refresh display
                await this.showStorageStatus(); // Update storage status
            } catch (error) {
                console.error('Clear old data failed:', error);
                this.showAlert('Failed to clear old data', 'danger');
            }
        }
    }

    /**
     * Test storage quota management
     */
    testStorageQuota() {
        try {
            const testResults = this.storageManager.testStorageQuota();
            if (testResults) {
                console.log('🧪 Storage quota test results:', testResults);
                this.showAlert(`Storage test completed. Check console for details. Compression ratio: ${testResults.compressionRatio.toFixed(1)}%`, 'info');
            } else {
                this.showAlert('Storage test failed. Check console for details.', 'warning');
            }
        } catch (error) {
            console.error('Storage test failed:', error);
            this.showAlert('Storage test failed', 'danger');
        }
    }

    /**
     * Migrate old data to new compressed format
     */
    migrateOldData() {
        try {
            const migratedCount = this.storageManager.migrateOldData();
            if (migratedCount > 0) {
                this.showAlert(`Successfully migrated ${migratedCount} organizations to compressed format.`, 'success');
                this.showStorageStatus(); // Update storage status
                this.displayOrganizationsOverview(); // Refresh display
            } else {
                this.showAlert('No old data found to migrate. All data is already in compressed format.', 'info');
            }
        } catch (error) {
            console.error('Migration failed:', error);
            this.showAlert('Failed to migrate old data', 'danger');
        }
    }

    /**
     * Display organizations overview
     */
    async displayOrganizationsOverview() {
        const storageInfo = await this.storageManager.getStorageInfo();
        
        if (storageInfo.totalEntries === 0) {
            document.getElementById('organizationsSection').style.display = 'none';
            document.getElementById('noDataSection').style.display = 'block';
            return;
        }

        const content = document.getElementById('organizationsContent');
        const allEntries = [...storageInfo.organizations, ...storageInfo.repositories];
        
        let html = `
            <div class="row mb-3">
                <div class="col-md-6">
                    <h6>Stored Analyses (${allEntries.length})</h6>
                </div>
                <div class="col-md-6 text-end">
                    <button class="btn btn-outline-primary btn-sm" onclick="settingsApp.exportAllData()">
                        <i class="fas fa-download me-2"></i>Export All
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="settingsApp.clearAllData()">
                        <i class="fas fa-trash me-2"></i>Clear All
                    </button>
                </div>
            </div>
        `;

        // Add combined view if there are multiple entries
        if (allEntries.length > 1) {
            const combinedStats = allEntries.reduce((acc, entry) => {
                acc.repositories += entry.repositories;
                acc.dependencies += entry.dependencies;
                return acc;
            }, { repositories: 0, dependencies: 0 });

            html += `
                <div class="alert alert-info mb-3">
                    <div class="row align-items-center">
                        <div class="col-md-8">
                            <h6 class="mb-1"><i class="fas fa-layer-group me-2"></i>Combined Analysis</h6>
                            <p class="mb-0 small">View aggregated data from all ${allEntries.length} entries</p>
                        </div>
                        <div class="col-md-4 text-end">
                            <button class="btn btn-primary btn-sm" onclick="settingsApp.showCombinedView()">
                                <i class="fas fa-chart-line me-2"></i>View Combined
                            </button>
                            <button class="btn btn-outline-info btn-sm ms-1" onclick="settingsApp.debugCombinedData()">
                                <i class="fas fa-bug me-1"></i>Debug
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        if (allEntries.length > 0) {
            html += `
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Repositories</th>
                                <th>Dependencies</th>
                                <th>Last Updated</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            allEntries.forEach(entry => {
                const date = new Date(entry.timestamp).toLocaleDateString();
                const time = new Date(entry.timestamp).toLocaleTimeString();
                
                html += `
                    <tr>
                        <td><strong>${entry.name}</strong></td>
                        <td><span class="badge bg-primary">${entry.repositories}</span></td>
                        <td><span class="badge bg-success">${entry.dependencies}</span></td>
                        <td><small>${date} ${time}</small></td>
                        <td>
                            <button class="btn btn-outline-primary btn-sm" onclick="settingsApp.showDetailedViewForOrg('${entry.name}')">
                                <i class="fas fa-eye me-1"></i>View
                            </button>
                            <button class="btn btn-outline-info btn-sm" onclick="settingsApp.debugOrganizationData('${entry.name}')">
                                <i class="fas fa-bug me-1"></i>Debug
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="settingsApp.removeOrganizationData('${entry.name}')">
                                <i class="fas fa-trash me-1"></i>Remove
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        content.innerHTML = html;
        document.getElementById('organizationsSection').style.display = 'block';
    }

    /**
     * Show detailed view for a specific organization or repository
     */
    async showDetailedViewForOrg(name) {
        const data = await this.storageManager.loadAnalysisDataForOrganization(name);
        if (data) {
            console.log('Loading detailed view for:', name, data);
            // Redirect to index.html (stats are now integrated)
            window.location.href = `index.html`;
        } else {
            this.showAlert(`No detailed data found for ${name}`, 'warning');
        }
    }

    /**
     * Show combined view from all entries
     */
    async showCombinedView() {
        const combinedData = await this.storageManager.getCombinedData();
        if (combinedData) {
            console.log('Loading combined view:', combinedData);
            // Redirect to index.html (stats are now integrated)
            window.location.href = 'index.html';
        } else {
            this.showAlert('No data available for combined view', 'warning');
        }
    }

    /**
     * Debug entry data
     */
    async debugOrganizationData(name) {
        const data = await this.storageManager.loadAnalysisDataForOrganization(name);
        if (data) {
            console.log('🔍 Entry Data Debug:', name, data);
            this.showAlert(`Debug data for ${name} logged to console`, 'info');
        } else {
            this.showAlert(`No data found for ${name}`, 'warning');
        }
    }

    /**
     * Debug combined data structure
     */
    async debugCombinedData() {
        const combinedData = await this.storageManager.getCombinedData();
        if (combinedData) {
            console.log('🔍 Combined Data Structure:', combinedData);
            this.showAlert('Combined data debug info logged to console', 'info');
        } else {
            this.showAlert('No combined data available for debugging', 'warning');
        }
    }

    /**
     * Remove entry data
     */
    async removeOrganizationData(name) {
        if (confirm(`Are you sure you want to remove all data for ${name}?`)) {
            const success = await this.storageManager.removeOrganizationData(name);
            if (success) {
                this.showAlert(`Data for ${name} has been removed`, 'success');
                await this.displayOrganizationsOverview();
                await this.showStorageStatus(); // Update storage status
            } else {
                this.showAlert(`Failed to remove data for ${name}`, 'danger');
            }
        }
    }

    /**
     * Show cache statistics
     */
    async showCacheStats() {
        const statsElement = document.getElementById('cacheStats');
        if (!statsElement) return;

        try {
            // Ensure database is initialized
            if (!this.storageManager.initialized) {
                await this.storageManager.init();
            }

            // Try to get indexedDBManager from storageManager if not globally available
            const dbManager = window.indexedDBManager || this.storageManager.indexedDB;
            
            if (!dbManager || !dbManager.db) {
                statsElement.innerHTML = '<p class="text-muted">Cache not available. Database not initialized.</p>';
                console.warn('IndexedDB not available. dbManager:', dbManager, 'db:', dbManager?.db);
                return;
            }

            const stats = await dbManager.getCacheStats();
            if (!stats) {
                statsElement.innerHTML = '<p class="text-muted">Failed to load cache statistics.</p>';
                return;
            }

            statsElement.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <h6>Entity Caches</h6>
                        <ul class="list-unstyled small">
                            <li><i class="fas fa-users me-2"></i><strong>Authors:</strong> ${stats.authorEntities.toLocaleString()} entities</li>
                            <li><i class="fas fa-box me-2"></i><strong>Packages:</strong> ${stats.packages.toLocaleString()} packages</li>
                            <li><i class="fas fa-shield-alt me-2"></i><strong>Vulnerabilities:</strong> ${stats.vulnerabilities.toLocaleString()} entries</li>
                            <li><i class="fas fa-link me-2"></i><strong>Relationships:</strong> ${stats.packageAuthors.toLocaleString()} links</li>
                        </ul>
                    </div>
                    <div class="col-md-6">
                        <h6>Analysis Data</h6>
                        <ul class="list-unstyled small">
                            <li><i class="fas fa-building me-2"></i><strong>Organizations:</strong> ${stats.organizations.toLocaleString()} analyses</li>
                            <li><i class="fas fa-code-branch me-2"></i><strong>Repositories:</strong> ${stats.repositories.toLocaleString()} analyses</li>
                        </ul>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Failed to load cache stats:', error);
            statsElement.innerHTML = '<p class="text-danger">Failed to load cache statistics.</p>';
        }
    }

    /**
     * Clear specific cache
     */
    async clearCache(cacheType) {
        const cacheTypeNames = {
            'authors': 'Authors',
            'packages': 'Packages',
            'vulnerabilities': 'Vulnerabilities',
            'all': 'All Entity Caches'
        };

        const name = cacheTypeNames[cacheType] || cacheType;
        if (!confirm(`Are you sure you want to clear the ${name} cache? This will remove cached data but keep analysis data intact.`)) {
            return;
        }

        try {
            if (window.cacheManager) {
                const success = await window.cacheManager.clearCache(cacheType);
                if (success) {
                    this.showAlert(`${name} cache cleared successfully!`, 'success');
                    await this.showCacheStats();  // Refresh stats
                } else {
                    this.showAlert(`Failed to clear ${name} cache`, 'danger');
                }
            } else {
                this.showAlert('Cache manager not available', 'warning');
            }
        } catch (error) {
            console.error('Clear cache failed:', error);
            this.showAlert(`Failed to clear ${name} cache: ${error.message}`, 'danger');
        }
    }

    /**
     * Clear only analysis data (keep entity caches)
     */
    async clearAnalysisData() {
        if (!confirm('Are you sure you want to clear all analysis data? This will remove all organization/repository analyses but keep the global entity caches (authors, packages, vulnerabilities) intact. You can re-analyze faster using cached data.')) {
            return;
        }

        try {
            // Ensure database is initialized
            if (!this.storageManager.initialized) {
                await this.storageManager.init();
            }

            // Try to get indexedDBManager from storageManager if not globally available
            const dbManager = window.indexedDBManager || this.storageManager.indexedDB;
            
            if (dbManager && dbManager.db) {
                const success = await dbManager.clearAnalysisData();
                if (success) {
                    this.showAlert('Analysis data cleared successfully! Entity caches remain intact.', 'success');
                    await this.showStorageStatus();  // Refresh storage status
                    await this.displayOrganizationsOverview();  // Refresh organizations list
                    await this.showCacheStats();  // Refresh cache stats
                } else {
                    this.showAlert('Failed to clear analysis data', 'danger');
                }
            } else {
                this.showAlert('Database not available', 'warning');
            }
        } catch (error) {
            console.error('Clear analysis data failed:', error);
            this.showAlert(`Failed to clear analysis data: ${error.message}`, 'danger');
        }
    }

    /**
     * Show alert message
     */
    showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        // Insert at the top of the container
        const container = document.querySelector('.container');
        container.insertBefore(alertDiv, container.firstChild);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
}

// Initialize settings app when page loads
let settingsApp;
document.addEventListener('DOMContentLoaded', () => {
    settingsApp = new SettingsApp();
}); 