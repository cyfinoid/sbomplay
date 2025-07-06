/**
 * SBOM Play - Main Application
 */
class SBOMPlayApp {
    constructor() {
        this.githubClient = new GitHubClient();
        this.sbomProcessor = new SBOMProcessor();
        this.storageManager = new StorageManager();
        this.isAnalyzing = false;
        this.rateLimitTimer = null;
        
        this.initializeApp();
    }

    /**
     * Initialize the application
     */
    initializeApp() {
        this.loadSavedToken();
        this.checkStorageAvailability();
        this.loadPreviousResults();
        this.setupEventListeners();
        this.checkRateLimitState();
        this.displayOrganizationsOverview();
    }

    /**
     * Check for existing rate limit state
     */
    checkRateLimitState() {
        const rateLimitState = this.githubClient.loadRateLimitState();
        if (rateLimitState) {
            const now = Math.floor(Date.now() / 1000);
            const timeElapsed = now - (rateLimitState.timestamp / 1000);
            const remainingWait = rateLimitState.waitTime - timeElapsed;
            
            if (remainingWait > 0) {
                this.showResumeSection(rateLimitState, remainingWait);
            } else {
                // Rate limit has expired, clear the state
                this.githubClient.clearRateLimitState();
            }
        }
    }

    /**
     * Show resume analysis section
     */
    showResumeSection(rateLimitState, remainingWait) {
        const resumeSection = document.getElementById('resumeSection');
        const resumeInfo = document.getElementById('resumeInfo');
        const resetDate = new Date(rateLimitState.resetTime * 1000);
        
        resumeInfo.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <p><strong>Organization:</strong> ${rateLimitState.organization}</p>
                    <p><strong>Reset Time:</strong> ${resetDate.toLocaleTimeString()}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Time Remaining:</strong> <span id="resumeCountdown">${this.formatTime(remainingWait)}</span></p>
                    <p><strong>Status:</strong> <span class="badge bg-warning">Waiting for Rate Limit Reset</span></p>
                </div>
            </div>
        `;
        
        resumeSection.style.display = 'block';
        
        // Start countdown for resume section
        this.startResumeCountdown(remainingWait);
    }

    /**
     * Start countdown timer for resume section
     */
    startResumeCountdown(seconds) {
        const countdownInterval = setInterval(() => {
            const countdownElement = document.getElementById('resumeCountdown');
            if (countdownElement) {
                countdownElement.textContent = this.formatTime(seconds);
            }
            
            seconds--;
            
            if (seconds <= 0) {
                clearInterval(countdownInterval);
                // Hide resume section and clear state
                document.getElementById('resumeSection').style.display = 'none';
                this.githubClient.clearRateLimitState();
            }
        }, 1000);
    }

    /**
     * Resume analysis
     */
    resumeAnalysis() {
        const rateLimitState = this.githubClient.loadRateLimitState();
        if (rateLimitState) {
            // Set the organization name
            document.getElementById('orgName').value = rateLimitState.organization;
            
            // Clear the rate limit state
            this.githubClient.clearRateLimitState();
            
            // Hide resume section
            document.getElementById('resumeSection').style.display = 'none';
            
            // Start analysis
            this.startAnalysis();
        }
    }

    /**
     * Clear rate limit state
     */
    clearRateLimitState() {
        this.githubClient.clearRateLimitState();
        document.getElementById('resumeSection').style.display = 'none';
        this.showAlert('Rate limit state cleared', 'info');
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

        // Organization input validation
        document.getElementById('orgName').addEventListener('input', (e) => {
            const orgName = e.target.value.trim();
            const analyzeBtn = document.getElementById('analyzeBtn');
            analyzeBtn.disabled = !orgName || this.isAnalyzing;
        });

        // Rate limit event listeners
        this.githubClient.addEventListener('rateLimitExceeded', (event) => {
            this.showRateLimitWaiting(event.detail.waitTime, event.detail.resetTime);
        });

        this.githubClient.addEventListener('rateLimitReset', () => {
            this.hideRateLimitWaiting();
        });
    }

    /**
     * Show rate limit waiting message
     */
    showRateLimitWaiting(waitTime, resetTime) {
        const resetDate = new Date(resetTime * 1000);
        const resetTimeStr = resetDate.toLocaleTimeString();
        
        // Update progress section
        const progressSection = document.getElementById('progressSection');
        const progressText = document.getElementById('progressText');
        
        progressSection.style.display = 'block';
        progressText.innerHTML = `
            <div class="alert alert-warning">
                <h6><i class="fas fa-clock me-2"></i>Rate Limit Exceeded</h6>
                <p class="mb-2">GitHub API rate limit has been reached. Waiting for reset...</p>
                <p class="mb-0"><strong>Reset Time:</strong> ${resetTimeStr}</p>
                <p class="mb-0"><strong>Time Remaining:</strong> <span id="rateLimitCountdown">${this.formatTime(waitTime)}</span></p>
            </div>
        `;
        
        // Start countdown timer
        this.startRateLimitCountdown(waitTime);
        
        // Disable analyze button
        document.getElementById('analyzeBtn').disabled = true;
    }

    /**
     * Hide rate limit waiting message
     */
    hideRateLimitWaiting() {
        const progressText = document.getElementById('progressText');
        progressText.textContent = 'Rate limit reset. Continuing analysis...';
        
        // Re-enable analyze button
        document.getElementById('analyzeBtn').disabled = false;
        
        // Clear countdown timer
        if (this.rateLimitTimer) {
            clearInterval(this.rateLimitTimer);
            this.rateLimitTimer = null;
        }
    }

    /**
     * Start countdown timer for rate limit
     */
    startRateLimitCountdown(seconds) {
        if (this.rateLimitTimer) {
            clearInterval(this.rateLimitTimer);
        }
        
        this.rateLimitTimer = setInterval(() => {
            const countdownElement = document.getElementById('rateLimitCountdown');
            if (countdownElement) {
                countdownElement.textContent = this.formatTime(seconds);
            }
            
            seconds--;
            
            if (seconds <= 0) {
                clearInterval(this.rateLimitTimer);
                this.rateLimitTimer = null;
            }
        }, 1000);
    }

    /**
     * Format time in MM:SS
     */
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Load saved GitHub token
     */
    loadSavedToken() {
        // Don't load token from localStorage - tokens are not persisted
        // This method is kept for future use if needed
    }

    /**
     * Check if local storage is available
     */
    checkStorageAvailability() {
        if (!this.storageManager.isStorageAvailable()) {
            this.showAlert('Local storage is not available. Some features may not work properly.', 'warning');
        }
    }

    /**
     * Load previous results
     */
    loadPreviousResults() {
        const data = this.storageManager.loadAnalysisData();
        if (data) {
            this.displayResults(data.data, data.organization);
        }
    }

    /**
     * Save GitHub token
     */
    saveToken() {
        const token = document.getElementById('githubToken').value.trim();
        
        if (token && !token.startsWith('ghp_')) {
            this.updateTokenStatus('Invalid token format. Should start with "ghp_"', 'danger');
            return;
        }

        this.githubClient.setToken(token);
        
        if (token) {
            this.updateTokenStatus('Token set successfully (not saved)', 'success');
        } else {
            this.updateTokenStatus('Token cleared', 'info');
        }
    }

    /**
     * Update token status display
     */
    updateTokenStatus(message, type) {
        const statusDiv = document.getElementById('tokenStatus');
        if (message) {
            statusDiv.innerHTML = `<div class="alert alert-${type} alert-sm">${message}</div>`;
        } else {
            statusDiv.innerHTML = '';
        }
    }

    /**
     * Start analysis
     */
    async startAnalysis() {
        const ownerName = document.getElementById('orgName').value.trim();
        
        if (!ownerName) {
            this.showAlert('Please enter an organization or user name', 'warning');
            return;
        }

        if (this.isAnalyzing) {
            return;
        }

        this.isAnalyzing = true;
        this.sbomProcessor.reset();
        
        // Store current owner for rate limit state
        localStorage.setItem('current_analysis_org', ownerName);
        
        // Update UI
        document.getElementById('analyzeBtn').disabled = true;
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'none';
        
        this.updateProgress(0, 'Initializing analysis...');

        try {
            // Get rate limit info
            const rateLimitInfo = await this.githubClient.getRateLimitInfo();
            this.updateRateLimitInfo(rateLimitInfo);

            // Fetch repositories
            this.updateProgress(10, 'Fetching repositories...');
            const repositories = await this.githubClient.getRepositories(ownerName);
            
            if (repositories.length === 0) {
                this.showAlert('No public repositories found for this organization or user', 'info');
                this.finishAnalysis();
                return;
            }

            this.sbomProcessor.setTotalRepositories(repositories.length);
            this.updateProgress(20, `Found ${repositories.length} repositories. Starting SBOM analysis...`);

            // Process each repository
            let successfulRepos = 0;
            let failedRepos = 0;
            let reposWithDeps = 0;
            
            for (let i = 0; i < repositories.length; i++) {
                const repo = repositories[i];
                const owner = repo.owner.login;
                const name = repo.name;
                const progress = 20 + (i / repositories.length) * 70;
                
                this.updateProgress(progress, `Analyzing ${owner}/${name}...`);
                
                try {
                    const sbomData = await this.githubClient.fetchSBOM(owner, name);
                    
                    if (sbomData) {
                        const success = this.sbomProcessor.processSBOM(owner, name, sbomData);
                        this.sbomProcessor.updateProgress(success);
                        if (success) {
                            successfulRepos++;
                            const repoData = this.sbomProcessor.repositories.get(`${owner}/${name}`);
                            if (repoData && repoData.totalDependencies > 0) {
                                reposWithDeps++;
                            }
                        } else {
                            failedRepos++;
                        }
                    } else {
                        this.sbomProcessor.updateProgress(false);
                        failedRepos++;
                    }
                } catch (error) {
                    console.error(`Error processing ${owner}/${name}:`, error);
                    this.sbomProcessor.updateProgress(false);
                    failedRepos++;
                }

                // Add small delay to be respectful to GitHub API
                await this.sleep(100);
            }

            // Generate results
            this.updateProgress(95, 'Generating analysis results...');
            const results = this.sbomProcessor.exportData();
            
            // Log summary
            console.log(`📊 Analysis Summary for ${ownerName}:`);
            console.log(`   Total repositories: ${repositories.length}`);
            console.log(`   Successful: ${successfulRepos}`);
            console.log(`   Failed: ${failedRepos}`);
            console.log(`   With dependencies: ${reposWithDeps}`);
            
            if (reposWithDeps === 0) {
                console.log(`⚠️  No repositories with dependencies found. This could be because:`);
                console.log(`   1. Dependency Graph is not enabled on the repositories`);
                console.log(`   2. Repositories don't have dependency files (package.json, requirements.txt, etc.)`);
                console.log(`   3. Authentication is required for private repositories`);
                console.log(`   4. Rate limiting prevented access to some repositories`);
            }
            
            // Save to storage
            this.storageManager.saveAnalysisData(ownerName, results);
            
            // Display results
            this.displayResults(results, ownerName);
            
            this.updateProgress(100, 'Analysis complete!');
            
        } catch (error) {
            console.error('Analysis failed:', error);
            this.showAlert(`Analysis failed: ${error.message}`, 'danger');
        } finally {
            this.finishAnalysis();
        }
    }

    /**
     * Update progress display
     */
    updateProgress(percentage, message) {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        
        progressBar.style.width = `${percentage}%`;
        progressBar.textContent = `${Math.round(percentage)}%`;
        progressText.textContent = message;
    }

    /**
     * Update rate limit information
     */
    updateRateLimitInfo(info) {
        const rateLimitDiv = document.getElementById('rateLimitInfo');
        const resetTime = new Date(info.reset * 1000).toLocaleTimeString();
        
        rateLimitDiv.innerHTML = `
            <div class="alert alert-info alert-sm">
                <strong>Rate Limit:</strong> ${info.remaining}/${info.limit} requests remaining
                <br><strong>Reset Time:</strong> ${resetTime}
                <br><strong>Authenticated:</strong> ${info.authenticated}
            </div>
        `;
    }

    /**
     * Display analysis results
     */
    displayResults(results, ownerName) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContent = document.getElementById('resultsContent');
        
        const stats = results.statistics;
        const topDeps = results.topDependencies.slice(0, 10);
        const topRepos = results.topRepositories.slice(0, 10);
        
        // Check if no dependencies were found
        const noDependenciesFound = stats.totalDependencies === 0;
        
        let troubleshootingInfo = '';
        if (noDependenciesFound) {
            troubleshootingInfo = `
                <div class="alert alert-warning">
                    <h6><i class="fas fa-exclamation-triangle me-2"></i>No Dependencies Found</h6>
                    <p class="mb-2">The analysis found 0 dependencies. This could be due to:</p>
                    <ul class="mb-2">
                        <li>Dependency Graph not enabled on repositories</li>
                        <li>Repositories don't have dependency files (package.json, requirements.txt, etc.)</li>
                        <li>Authentication required for private repositories</li>
                        <li>Rate limiting prevented access</li>
                    </ul>
                    <p class="mb-0"><strong>Tip:</strong> Check the browser console for detailed error messages.</p>
                </div>
            `;
        }
        
        resultsContent.innerHTML = `
            ${troubleshootingInfo}
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <h6>Analysis Summary</h6>
                    <table class="table table-sm">
                        <tr><td>Owner:</td><td><strong>${ownerName}</strong></td></tr>
                        <tr><td>Total Repositories:</td><td>${stats.totalRepositories}</td></tr>
                        <tr><td>Processed:</td><td>${stats.processedRepositories}</td></tr>
                        <tr><td>Successful:</td><td class="text-success">${stats.successfulRepositories}</td></tr>
                        <tr><td>Failed:</td><td class="text-danger">${stats.failedRepositories}</td></tr>
                        <tr><td>With Dependencies:</td><td>${stats.repositoriesWithDependencies}</td></tr>
                        <tr><td>Total Dependencies:</td><td>${stats.totalDependencies}</td></tr>
                        <tr><td>Avg per Repo:</td><td>${stats.averageDependenciesPerRepo}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6>Actions</h6>
                    <div class="d-grid gap-2">
                        <button class="btn btn-outline-primary btn-sm" onclick="app.exportResults()">
                            <i class="fas fa-download me-2"></i>Export Data
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="app.clearData()">
                            <i class="fas fa-trash me-2"></i>Clear Data
                        </button>
                    </div>
                </div>
            </div>
            
            ${noDependenciesFound ? '' : `
            <div class="row">
                <div class="col-md-6">
                    <h6>Top Dependencies</h6>
                    <div class="dependencies-chart">
                        ${topDeps.map(dep => `
                            <div class="dependency-bar">
                                <div class="dependency-info">
                                    <span class="dependency-name">${dep.name}@${dep.version}</span>
                                    <span class="dependency-count">${dep.count}</span>
                                </div>
                                <div class="dependency-progress">
                                    <div class="progress-fill" style="width: ${(dep.count / topDeps[0].count) * 100}%"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="col-md-6">
                    <h6>Top Repositories</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Repository</th>
                                    <th>Dependencies</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${topRepos.map(repo => `
                                    <tr>
                                        <td><code>${repo.owner}/${repo.name}</code></td>
                                        <td><span class="badge bg-primary">${repo.totalDependencies}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            `}
        `;
        
        resultsSection.style.display = 'block';
    }

    /**
     * Export current results
     */
    exportResults() {
        const currentData = this.storageManager.loadAnalysisData();
        if (currentData) {
            const filename = `sbom-analysis-${currentData.organization}-${new Date().toISOString().split('T')[0]}.json`;
            this.storageManager.exportData(currentData, filename);
        } else {
            this.showAlert('No data to export', 'warning');
        }
    }

    /**
     * Clear current data
     */
    clearData() {
        const currentData = this.storageManager.loadAnalysisData();
        if (currentData) {
            if (confirm(`Are you sure you want to remove data for ${currentData.organization}?`)) {
                this.storageManager.removeOrganizationData(currentData.organization);
                document.getElementById('resultsSection').style.display = 'none';
                this.displayOrganizationsOverview();
                this.showAlert('Data cleared successfully', 'success');
            }
        } else {
            this.showAlert('No data to clear', 'warning');
        }
    }

    /**
     * Finish analysis and reset UI
     */
    finishAnalysis() {
        this.isAnalyzing = false;
        document.getElementById('analyzeBtn').disabled = false;
        
        // Refresh organizations overview
        this.displayOrganizationsOverview();
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
        
        const container = document.querySelector('.container');
        container.insertBefore(alertDiv, container.firstChild);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Display organizations overview
     */
    displayOrganizationsOverview() {
        const storageInfo = this.storageManager.getStorageInfo();
        
        if (storageInfo.organizationsCount === 0) {
            return;
        }

        // Create organizations section if it doesn't exist
        let orgSection = document.getElementById('organizationsSection');
        if (!orgSection) {
            orgSection = document.createElement('div');
            orgSection.id = 'organizationsSection';
            orgSection.className = 'card mb-4';
            orgSection.innerHTML = `
                <div class="card-header">
                    <h5 class="mb-0">
                        <i class="fas fa-database me-2"></i>Stored Analyses
                    </h5>
                </div>
                <div class="card-body">
                    <div id="organizationsContent"></div>
                </div>
            `;
            
            // Insert after the organization input card
            const orgInputCard = document.querySelector('.card:nth-child(3)');
            orgInputCard.parentNode.insertBefore(orgSection, orgInputCard.nextSibling);
        }

        const content = document.getElementById('organizationsContent');
        const organizations = storageInfo.organizations;
        
        let html = `
            <div class="row mb-3">
                <div class="col-md-6">
                    <h6>Stored Organizations (${organizations.length})</h6>
                </div>
                <div class="col-md-6 text-end">
                    <button class="btn btn-outline-primary btn-sm" onclick="app.exportAllData()">
                        <i class="fas fa-download me-2"></i>Export All
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="app.clearAllData()">
                        <i class="fas fa-trash me-2"></i>Clear All
                    </button>
                </div>
            </div>
        `;

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
                            <button class="btn btn-outline-primary btn-sm" onclick="app.loadOrganizationData('${org.name}')">
                                <i class="fas fa-eye me-1"></i>View
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="app.removeOrganizationData('${org.name}')">
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
        orgSection.style.display = 'block';
    }

    /**
     * Load organization data
     */
    loadOrganizationData(orgName) {
        const data = this.storageManager.loadAnalysisDataForOrganization(orgName);
        if (data) {
            this.displayResults(data.data, data.organization);
            document.getElementById('orgName').value = orgName;
            
            // Scroll to results
            document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
        } else {
            this.showAlert(`No data found for ${orgName}`, 'warning');
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
                
                // If this was the currently displayed data, clear the results
                const currentData = this.storageManager.loadAnalysisData();
                if (currentData && currentData.organization === orgName) {
                    document.getElementById('resultsSection').style.display = 'none';
                }
            } else {
                this.showAlert(`Failed to remove data for ${orgName}`, 'danger');
            }
        }
    }

    /**
     * Export all data
     */
    exportAllData() {
        const success = this.storageManager.exportAllData();
        if (success) {
            this.showAlert('All data exported successfully', 'success');
        } else {
            this.showAlert('Failed to export all data', 'danger');
        }
    }

    /**
     * Clear all data
     */
    clearAllData() {
        if (confirm('Are you sure you want to clear all stored data? This action cannot be undone.')) {
            const success = this.storageManager.clearAllData();
            if (success) {
                this.showAlert('All data cleared successfully', 'success');
                document.getElementById('resultsSection').style.display = 'none';
                document.getElementById('organizationsSection').style.display = 'none';
            } else {
                this.showAlert('Failed to clear data', 'danger');
            }
        }
    }
}

// Global functions for HTML onclick handlers
function saveToken() {
    app.saveToken();
}

function startAnalysis() {
    app.startAnalysis();
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SBOMPlayApp();
}); 