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
        
        // Only initialize UI elements if they exist on the current page
        if (document.getElementById('storageStatus')) {
            this.showStorageStatus();
        }
        if (document.getElementById('storageStatusIndicator')) {
            this.showStorageStatusIndicator();
        }
        if (document.getElementById('resultsSection')) {
            this.loadPreviousResults();
        }
        if (document.getElementById('githubToken') && document.getElementById('orgName') && document.getElementById('analyzeBtn')) {
            this.setupEventListeners();
        }
        if (document.getElementById('resumeSection')) {
            this.checkRateLimitState();
        }
        if (document.getElementById('orgName')) {
            this.handleURLParameters();
        }
        
        // Show results section if there are stored organizations
        const storageInfo = this.storageManager.getStorageInfo();
        if (storageInfo.organizationsCount > 0 && document.getElementById('resultsSection')) {
            document.getElementById('resultsSection').style.display = 'block';
        }
        
        // Show Quick Analysis Access section if there are stored organizations
        if (storageInfo.organizationsCount > 0 && document.getElementById('quickAnalysisSection')) {
            document.getElementById('quickAnalysisSection').style.display = 'block';
        }
    }

    /**
     * Handle URL parameters for pre-filling and focusing
     */
    handleURLParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const orgParam = urlParams.get('org');
        const focusParam = urlParams.get('focus');
        
        if (orgParam) {
            // Pre-fill organization name
            document.getElementById('orgName').value = orgParam;
            
            // Handle different focus types
            if (focusParam) {
                let message = '';
                switch (focusParam) {
                    case 'license':
                        message = 'Organization pre-filled for license compliance analysis. Click "Start Analysis" to begin.';
                        break;
                    case 'deps':
                        message = 'Organization pre-filled for dependency analysis. Click "Start Analysis" to begin.';
                        break;
                    case 'vuln':
                        message = 'Organization pre-filled for vulnerability analysis. Click "Start Analysis" to begin.';
                        break;
                    default:
                        message = 'Organization pre-filled. Click "Start Analysis" to begin.';
                }
                
                this.showAlert(message, 'info');
                
                // Scroll to the organization input section
                document.getElementById('orgName').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
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
     * Check if local storage is available and show status
     */
    checkStorageAvailability() {
        if (!this.storageManager.isStorageAvailable()) {
            this.showAlert('Local storage is not available. Some features may not work properly.', 'warning');
            return false;
        }
        
        // Show storage status
        const storageInfo = this.storageManager.showStorageStatus();
        if (storageInfo) {
            const usagePercent = (storageInfo.totalSize / storageInfo.maxStorageSize) * 100;
            
            if (usagePercent > 90) {
                this.showAlert('Storage is nearly full! Please export your data and clear old analyses.', 'danger');
            } else if (usagePercent > 70) {
                this.showAlert('Storage usage is high. Consider exporting data to free up space.', 'warning');
            }
        }
        
        return true;
    }

    /**
     * Load previous results
     */
    loadPreviousResults() {
        const data = this.storageManager.loadAnalysisData();
        if (data) {
            this.displayResults(data.data, data.organization);
        } else {
            // Show overview of stored organizations even if no current analysis
            this.displayResults(null, null);
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
        
        // Update UI (only if elements exist)
        const analyzeBtn = document.getElementById('analyzeBtn');
        const progressSection = document.getElementById('progressSection');
        const resultsSection = document.getElementById('resultsSection');
        
        if (analyzeBtn) analyzeBtn.disabled = true;
        if (progressSection) progressSection.style.display = 'block';
        if (resultsSection) resultsSection.style.display = 'none';
        
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
            
            // Show partial data info if we have many repositories
            const partialDataInfo = document.getElementById('partialDataInfo');
            if (repositories.length > 10 && partialDataInfo) {
                partialDataInfo.style.display = 'block';
            }

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

                // Save incrementally every 10 repositories
                if ((i + 1) % 10 === 0 || i === repositories.length - 1) {
                    console.log(`💾 Saving incremental data (${i + 1}/${repositories.length} repositories processed)`);
                    
                    const partialData = this.sbomProcessor.exportPartialData();
                    const isComplete = (i === repositories.length - 1);
                    
                    const saveSuccess = this.storageManager.saveIncrementalAnalysisData(ownerName, partialData, isComplete);
                    if (saveSuccess) {
                        console.log(`✅ Incremental data saved for ${ownerName} (${isComplete ? 'complete' : 'partial'})`);
                        
                        // Check data size and warn if too large
                        const sizeCheck = this.storageManager.checkDataSizeAndWarn(ownerName);
                        if (sizeCheck.isLarge) {
                            this.showAlert(sizeCheck.message, 'warning');
                        }
                        
                        // Clear memory after successful save to prevent DOM from holding unnecessary data
                        this.sbomProcessor.clearMemoryAfterSave();
                        
                        // Update storage indicators (only show indicator, not full status)
                        this.showStorageStatusIndicator();
                    } else {
                        console.warn(`⚠️ Failed to save incremental data for ${ownerName}`);
                    }
                }

                // Add small delay to be respectful to GitHub API
                await this.sleep(100);
            }

            // Generate results
            this.updateProgress(90, 'Generating analysis results...');
            const results = this.sbomProcessor.exportData();
            
            // Note: Vulnerability analysis has been disabled to improve performance
            // Users can run vulnerability analysis separately from the view page if needed

            // Run license compliance analysis
            if (reposWithDeps > 0) {
                this.updateProgress(95, 'Analyzing license compliance...');
                try {
                    const licenseAnalysis = this.sbomProcessor.analyzeLicenseCompliance();
                    if (licenseAnalysis) {
                        results.licenseAnalysis = licenseAnalysis;
                        console.log('🔍 License Compliance Analysis Results:', licenseAnalysis);
                    }
                } catch (error) {
                    console.error('❌ License compliance analysis failed:', error);
                }
            }
            
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
            
            // Save to storage with better error handling
            const saveSuccess = this.storageManager.saveAnalysisData(ownerName, results);
            if (!saveSuccess) {
                console.warn('⚠️ Failed to save analysis data to storage');
                this.showAlert('Analysis completed but failed to save to storage. Consider exporting your data and clearing old analyses.', 'warning');
            } else {
                // Update storage indicators after successful save (only indicator, not full status)
                this.showStorageStatusIndicator();
            }
            
            // Display results
            this.displayResults(results, ownerName);
            
            // Show message about partial data availability
            if (repositories.length > 10) {
                this.showAlert(
                    `Analysis complete! Data was saved incrementally every 10 repositories, so you can start exploring results even during long analyses.`,
                    'success'
                );
            }
            
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
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.textContent = `${Math.round(percentage)}%`;
        }
        
        if (progressText) {
            progressText.textContent = message;
        }
        
        // Log progress for pages without UI elements
        if (!progressBar && !progressText) {
            console.log(`Progress: ${Math.round(percentage)}% - ${message}`);
        }
    }

    /**
     * Update rate limit information
     */
    updateRateLimitInfo(info) {
        const rateLimitDiv = document.getElementById('rateLimitInfo');
        if (rateLimitDiv) {
            const resetTime = new Date(info.reset * 1000).toLocaleTimeString();
            
            rateLimitDiv.innerHTML = `
                <div class="alert alert-info alert-sm">
                    <strong>Rate Limit:</strong> ${info.remaining}/${info.limit} requests remaining
                    <br><strong>Reset Time:</strong> ${resetTime}
                    <br><strong>Authenticated:</strong> ${info.authenticated}
                </div>
            `;
        }
    }

    /**
     * Display analysis results
     */
    displayResults(results, ownerName) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContent = document.getElementById('resultsContent');
        
        // Check if the results elements exist on this page
        if (!resultsSection || !resultsContent) {
            console.log('Results section elements not found on this page');
            return;
        }
        
        // Get storage info to show all organizations
        const storageInfo = this.storageManager.getStorageInfo();
        const organizations = storageInfo.organizations;
        
        // Get combined stats if multiple organizations exist
        const combinedData = organizations.length > 1 ? this.storageManager.getCombinedData() : null;
        
        let html = '';
        
        // Note: Analysis completion is handled by the progress section
        // The results section focuses on stored data overview
        
        // Show stored organizations overview
        if (organizations.length > 0) {
            html += `
                <div class="row mb-4">
                    <div class="col-12">
                        <h6><i class="fas fa-database me-2"></i>Stored Organizations (${organizations.length})</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Organization</th>
                                        <th>Repositories</th>
                                        <th>Dependencies</th>
                                        <th>Last Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${organizations.map(org => {
                                        const date = new Date(org.timestamp).toLocaleDateString();
                                        const time = new Date(org.timestamp).toLocaleTimeString();
                                        return `
                                            <tr>
                                                <td><strong>${org.name}</strong></td>
                                                <td><span class="badge bg-primary">${org.repositories}</span></td>
                                                <td><span class="badge bg-success">${org.dependencies}</span></td>
                                                <td><small>${date} ${time}</small></td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }
        

        
        // Show no data message if no organizations stored
        if (organizations.length === 0) {
            html += `
                <div class="alert alert-info">
                    <h6><i class="fas fa-info-circle me-2"></i>No Stored Analyses</h6>
                    <p class="mb-2">You haven't analyzed any organizations yet. Start your first analysis above!</p>
                </div>
            `;
        }
        
        resultsContent.innerHTML = html;
        resultsSection.style.display = 'block';
        
        // Show/hide Quick Analysis Access section based on stored organizations
        const quickAnalysisSection = document.getElementById('quickAnalysisSection');
        if (quickAnalysisSection) {
            if (organizations.length > 0) {
                quickAnalysisSection.style.display = 'block';
            } else {
                quickAnalysisSection.style.display = 'none';
            }
        }
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
                this.displayResults(null, null); // Refresh display
                this.showAlert('Data cleared successfully', 'success');
            }
        } else {
            this.showAlert('No data to clear', 'warning');
        }
    }

    /**
     * Show storage status in UI
     */
    showStorageStatus() {
        const storageInfo = this.storageManager.getStorageInfo();
        const storageStatusDiv = document.getElementById('storageStatus');
        
        // Check if the storage status div exists on this page
        if (!storageStatusDiv) {
            console.log('Storage status div not found on this page');
            return;
        }
        
        if (storageInfo) {
            const usagePercent = (storageInfo.totalSize / storageInfo.maxStorageSize) * 100;
            const usageClass = usagePercent > 90 ? 'danger' : usagePercent > 70 ? 'warning' : 'success';
            
            storageStatusDiv.innerHTML = `
                <div class="alert alert-${usageClass}">
                    <h6><i class="fas fa-hdd me-2"></i>Storage Status</h6>
                    <div class="row">
                        <div class="col-md-6">
                            <strong>Usage:</strong> ${(storageInfo.totalSize / 1024 / 1024).toFixed(2)}MB / ${(storageInfo.maxStorageSize / 1024 / 1024).toFixed(2)}MB (${usagePercent.toFixed(1)}%)
                        </div>
                        <div class="col-md-6">
                            <strong>Available:</strong> ${(storageInfo.availableSpace / 1024 / 1024).toFixed(2)}MB
                        </div>
                    </div>
                    <div class="row mt-2">
                        <div class="col-md-6">
                            <strong>Organizations:</strong> ${storageInfo.organizationsCount}
                        </div>
                        <div class="col-md-6">
                            <strong>History Entries:</strong> ${storageInfo.historyCount}
                        </div>
                    </div>
                    ${usagePercent > 80 ? '<div class="mt-2"><strong>⚠️ Warning:</strong> Storage usage is high. Consider exporting data.</div>' : ''}
                </div>
            `;
        } else {
            storageStatusDiv.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Unable to retrieve storage status
                </div>
            `;
        }
    }

    /**
     * Show storage status indicator in header
     */
    showStorageStatusIndicator() {
        const storageInfo = this.storageManager.getStorageInfo();
        const indicatorDiv = document.getElementById('storageStatusIndicator');
        const statusTextDiv = document.getElementById('storageStatusText');
        
        // Check if the indicator elements exist on this page
        if (!indicatorDiv || !statusTextDiv) {
            console.log('Storage status indicator elements not found on this page');
            return;
        }
        
        if (storageInfo && storageInfo.hasData) {
            const usagePercent = (storageInfo.totalSize / storageInfo.maxStorageSize) * 100;
            let statusClass = 'text-muted';
            let statusIcon = 'fas fa-hdd';
            
            if (usagePercent > 90) {
                statusClass = 'text-danger';
                statusIcon = 'fas fa-exclamation-triangle';
            } else if (usagePercent > 70) {
                statusClass = 'text-warning';
                statusIcon = 'fas fa-exclamation-circle';
            } else if (usagePercent > 30) {
                statusClass = 'text-info';
                statusIcon = 'fas fa-info-circle';
            }
            
            statusTextDiv.innerHTML = `
                <i class="${statusIcon} me-1"></i>
                <span class="${statusClass}">
                    ${(storageInfo.totalSize / 1024 / 1024).toFixed(2)}MB used (${usagePercent.toFixed(1)}%) - 
                    ${storageInfo.organizationsCount} organizations stored
                </span>
            `;
            
            indicatorDiv.style.display = 'block';
        } else {
            indicatorDiv.style.display = 'none';
        }
    }

    /**
     * Export all data
     */
    exportAllData() {
        try {
            const filename = `sbom-all-data-${new Date().toISOString().split('T')[0]}.json`;
            this.storageManager.exportAllData(filename);
            this.showAlert('All data exported successfully', 'success');
        } catch (error) {
            console.error('Export failed:', error);
            this.showAlert('Failed to export data', 'danger');
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
                this.displayResults(null, null); // Refresh display
                this.showStorageStatusIndicator(); // Update header indicator
            } catch (error) {
                console.error('Clear old data failed:', error);
                this.showAlert('Failed to clear old data', 'danger');
            }
        }
    }

    /**
     * Clear all data
     */
    clearAllData() {
        if (confirm('Are you sure you want to clear ALL stored data? This action cannot be undone.')) {
            try {
                this.storageManager.clearAllData();
                this.showAlert('All data cleared successfully', 'success');
                this.displayResults(null, null); // Refresh display
                this.showStorageStatusIndicator(); // Update header indicator
            } catch (error) {
                console.error('Clear all data failed:', error);
                this.showAlert('Failed to clear all data', 'danger');
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
                this.showStorageStatusIndicator(); // Update header indicator
            } else {
                this.showAlert('No old data found to migrate. All data is already in compressed format.', 'info');
            }
        } catch (error) {
            console.error('Migration failed:', error);
            this.showAlert('Failed to migrate old data', 'danger');
        }
    }

    /**
     * Finish analysis and reset UI
     */
    finishAnalysis() {
        this.isAnalyzing = false;
        
        const analyzeBtn = document.getElementById('analyzeBtn');
        const progressSection = document.getElementById('progressSection');
        const partialDataInfo = document.getElementById('partialDataInfo');
        
        if (analyzeBtn) analyzeBtn.disabled = false;
        if (progressSection) progressSection.style.display = 'none';
        if (partialDataInfo) partialDataInfo.style.display = 'none';
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
        if (container) {
            container.insertBefore(alertDiv, container.firstChild);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.remove();
                }
            }, 5000);
        } else {
            // Fallback: just log to console if no container found
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }




}

// Global functions for HTML onclick handlers
function saveToken() {
    app.saveToken();
}

function startAnalysis() {
    app.startAnalysis();
}

function toggleTokenSection() {
    const body = document.getElementById('tokenSectionBody');
    const icon = document.getElementById('tokenToggleIcon');
    
    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.className = 'fas fa-chevron-up';
    } else {
        body.style.display = 'none';
        icon.className = 'fas fa-chevron-down';
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    // Always initialize the app - it's needed for analysis functions
    app = new SBOMPlayApp();
}); 