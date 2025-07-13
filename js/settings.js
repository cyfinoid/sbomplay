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
    initializeSettings() {
        this.loadSavedToken();
        this.showStorageStatus();
        this.displayOrganizationsOverview();
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
    showStorageStatus() {
        const storageInfo = this.storageManager.getStorageInfo();
        const statusElement = document.getElementById('storageStatus');
        
        const usagePercentage = (storageInfo.usedBytes / storageInfo.totalBytes) * 100;
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
                        ${(storageInfo.usedBytes / 1024 / 1024).toFixed(2)}MB used of 
                        ${(storageInfo.totalBytes / 1024 / 1024).toFixed(2)}MB total
                    </p>
                </div>
                <div class="col-md-6">
                    <h6>Data Summary</h6>
                    <ul class="list-unstyled small">
                        <li><strong>Organizations:</strong> ${storageInfo.organizationsCount}</li>
                        <li><strong>History Entries:</strong> ${storageInfo.historyCount}</li>
                        <li><strong>Vulnerability Data:</strong> ${storageInfo.vulnerabilityCount}</li>
                        <li><strong>Available Space:</strong> ${(storageInfo.availableBytes / 1024 / 1024).toFixed(2)}MB</li>
                    </ul>
                </div>
            </div>
        `;
    }

    /**
     * Export all data
     */
    exportAllData() {
        try {
            this.storageManager.exportAllData();
            this.showAlert('All data exported successfully!', 'success');
        } catch (error) {
            this.showAlert(`Export failed: ${error.message}`, 'danger');
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
    clearAllData() {
        if (confirm('Are you sure you want to clear ALL data? This action cannot be undone.')) {
            try {
                this.storageManager.clearAllData();
                this.showAlert('All data cleared successfully!', 'success');
                this.showStorageStatus(); // Refresh display
                this.displayOrganizationsOverview(); // Refresh display
            } catch (error) {
                this.showAlert(`Failed to clear data: ${error.message}`, 'danger');
            }
        }
    }

    /**
     * Clear old data (keep only recent)
     */
    clearOldData() {
        if (confirm('This will remove old analysis data while keeping the most recent. Continue?')) {
            try {
                const storageInfo = this.storageManager.getStorageInfo();
                const organizations = storageInfo.organizations;
                
                if (organizations.length <= 3) {
                    this.showAlert('Not enough data to clear. Keep at least 3 recent analyses.', 'info');
                    return;
                }
                
                // Keep only the 3 most recent organizations
                organizations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const toRemove = organizations.slice(3);
                
                let removedCount = 0;
                for (const org of toRemove) {
                    if (this.storageManager.removeOrganizationData(org.name)) {
                        removedCount++;
                    }
                }
                
                this.showAlert(`Cleared ${removedCount} old analyses. Kept 3 most recent.`, 'success');
                this.displayOrganizationsOverview(); // Refresh display
                this.showStorageStatus(); // Update storage status
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
    displayOrganizationsOverview() {
        const storageInfo = this.storageManager.getStorageInfo();
        
        if (storageInfo.organizationsCount === 0) {
            document.getElementById('organizationsSection').style.display = 'none';
            document.getElementById('noDataSection').style.display = 'block';
            return;
        }

        const content = document.getElementById('organizationsContent');
        const organizations = storageInfo.organizations;
        
        let html = `
            <div class="row mb-3">
                <div class="col-md-6">
                    <h6>Stored Organizations (${organizations.length})</h6>
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

        // Add combined view if there are multiple organizations
        if (organizations.length > 1) {
            const combinedStats = organizations.reduce((acc, org) => {
                acc.repositories += org.repositories;
                acc.dependencies += org.dependencies;
                return acc;
            }, { repositories: 0, dependencies: 0 });

            html += `
                <div class="alert alert-info mb-3">
                    <div class="row align-items-center">
                        <div class="col-md-8">
                            <h6 class="mb-1"><i class="fas fa-layer-group me-2"></i>Combined Analysis</h6>
                            <p class="mb-0 small">View aggregated data from all ${organizations.length} organizations</p>
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

        if (organizations.length > 0) {
            html += `
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Organization</th>
                                <th>Repositories</th>
                                <th>Dependencies</th>
                                <th>Last Updated</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            organizations.forEach(org => {
                const date = new Date(org.timestamp).toLocaleDateString();
                const time = new Date(org.timestamp).toLocaleTimeString();
                
                html += `
                    <tr>
                        <td><strong>${org.name}</strong></td>
                        <td><span class="badge bg-primary">${org.repositories}</span></td>
                        <td><span class="badge bg-success">${org.dependencies}</span></td>
                        <td><small>${date} ${time}</small></td>
                        <td>
                            <button class="btn btn-outline-primary btn-sm" onclick="settingsApp.showDetailedViewForOrg('${org.name}')">
                                <i class="fas fa-eye me-1"></i>View
                            </button>
                            <button class="btn btn-outline-info btn-sm" onclick="settingsApp.debugOrganizationData('${org.name}')">
                                <i class="fas fa-bug me-1"></i>Debug
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="settingsApp.removeOrganizationData('${org.name}')">
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
     * Show detailed view for a specific organization
     */
    showDetailedViewForOrg(orgName) {
        const data = this.storageManager.loadAnalysisDataForOrganization(orgName);
        if (data) {
            console.log('Loading detailed view for:', orgName, data);
            // Redirect to stats.html with organization parameter
            window.location.href = `stats.html?org=${encodeURIComponent(orgName)}`;
        } else {
            this.showAlert(`No detailed data found for ${orgName}`, 'warning');
        }
    }

    /**
     * Show combined view from all organizations
     */
    showCombinedView() {
        const combinedData = this.storageManager.getCombinedData();
        if (combinedData) {
            console.log('Loading combined view:', combinedData);
            // Redirect to stats.html with combined parameter
            window.location.href = 'stats.html?combined=true';
        } else {
            this.showAlert('No data available for combined view', 'warning');
        }
    }

    /**
     * Debug organization data
     */
    debugOrganizationData(orgName) {
        const data = this.storageManager.loadAnalysisDataForOrganization(orgName);
        if (data) {
            console.log('🔍 Organization Data Debug:', orgName, data);
            this.showAlert(`Debug data for ${orgName} logged to console`, 'info');
        } else {
            this.showAlert(`No data found for ${orgName}`, 'warning');
        }
    }

    /**
     * Debug combined data structure
     */
    debugCombinedData() {
        const combinedData = this.storageManager.getCombinedData();
        if (combinedData) {
            console.log('🔍 Combined Data Structure:', combinedData);
            this.showAlert('Combined data debug info logged to console', 'info');
        } else {
            this.showAlert('No combined data available for debugging', 'warning');
        }
    }

    /**
     * Remove organization data
     */
    removeOrganizationData(orgName) {
        if (confirm(`Are you sure you want to remove all data for ${orgName}?`)) {
            const success = this.storageManager.removeOrganizationData(orgName);
            if (success) {
                this.showAlert(`Data for ${orgName} has been removed`, 'success');
                this.displayOrganizationsOverview();
                this.showStorageStatus(); // Update storage status
            } else {
                this.showAlert(`Failed to remove data for ${orgName}`, 'danger');
            }
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