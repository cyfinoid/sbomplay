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
        this.loadRateLimitInfo();
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Token input validation
        document.getElementById('githubToken').addEventListener('input', (e) => {
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
            } catch (error) {
                this.showAlert(`Failed to clear data: ${error.message}`, 'danger');
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