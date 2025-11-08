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
        this.initialized = false;
        
        // Warn user before navigating away during analysis
        window.addEventListener('beforeunload', (e) => {
            if (this.isAnalyzing) {
                const message = 'Analysis is still in progress. If you leave now, you will lose unsaved progress. Are you sure you want to leave?';
                e.preventDefault();
                e.returnValue = message; // Standard way for most browsers
                return message; // For older browsers
            }
        });
        
        // Initialize asynchronously
        this.initializeApp().catch(error => {
            console.error('Failed to initialize app:', error);
        });
    }

    /**
     * Initialize the application (async)
     */
    async initializeApp() {
        try {
            // Initialize IndexedDB
            await this.storageManager.init();
            this.initialized = true;
            
            await this.checkStorageAvailability();
            
            // Only initialize UI elements if they exist on the current page
            if (document.getElementById('storageStatus')) {
                await this.showStorageStatus();
            }
            if (document.getElementById('storageStatusIndicator')) {
                await this.showStorageStatusIndicator();
            }
            if (document.getElementById('resultsSection')) {
                await this.loadPreviousResults();
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
            
            // Show results section if there are stored entries
            const storageInfo = await this.storageManager.getStorageInfo();
            if (storageInfo.totalEntries > 0 && document.getElementById('resultsSection')) {
                document.getElementById('resultsSection').style.display = 'block';
                // Also display stats dashboard on page load
                await this.displayStatsDashboard();
            }
            
            // Show Quick Analysis Access section if there are stored entries
            if (storageInfo.totalEntries > 0 && document.getElementById('quickAnalysisSection')) {
                document.getElementById('quickAnalysisSection').style.display = 'block';
            }
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showAlert('Failed to initialize storage. Please refresh the page.', 'danger');
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
     * Check if storage is available and show status (async)
     */
    async checkStorageAvailability() {
        if (!this.storageManager.isStorageAvailable()) {
            this.showAlert('IndexedDB is not available. Some features may not work properly.', 'warning');
            return false;
        }
        
        // Show storage status
        const storageInfo = await this.storageManager.showStorageStatus();
        if (storageInfo) {
            const usagePercent = storageInfo.usagePercent;
            
            if (usagePercent > 90) {
                this.showAlert('Storage is nearly full! Please export your data and clear old analyses.', 'danger');
            } else if (usagePercent > 70) {
                this.showAlert('Storage usage is high. Consider exporting data to free up space.', 'warning');
            }
        }
        
        return true;
    }

    /**
     * Load previous results (async)
     */
    async loadPreviousResults() {
        const data = await this.storageManager.loadAnalysisData();
        if (data) {
            await this.displayResults(data.data, data.organization || data.fullName);
        } else {
            // Show overview of stored entries even if no current analysis
            await this.displayResults(null, null);
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
     * Parse GitHub URL or input to extract owner and repo
     * Supports formats:
     * - username
     * - owner/repo
     * - https://github.com/owner/repo
     * - https://github.com/owner/
     * - github.com/owner/repo
     */
    parseGitHubInput(input) {
        // Remove trailing slashes
        input = input.replace(/\/+$/, '');
        
        // Check if it's a URL
        const urlPattern = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)(?:\/([^\/]+))?/i;
        const urlMatch = input.match(urlPattern);
        
        if (urlMatch) {
            // It's a GitHub URL
            const owner = urlMatch[1];
            const repo = urlMatch[2];
            
            return {
                owner,
                repo: repo || null,
                isRepo: !!repo,
                original: input
            };
        }
        
        // Not a URL, check if it's owner/repo format
        if (input.includes('/')) {
            const parts = input.split('/');
            if (parts.length === 2 && parts[0] && parts[1]) {
                return {
                    owner: parts[0],
                    repo: parts[1],
                    isRepo: true,
                    original: input
                };
            }
        }
        
        // Just an organization or username
        return {
            owner: input,
            repo: null,
            isRepo: false,
            original: input
        };
    }

    /**
     * Start analysis - detects org/user or single repo format
     */
    async startAnalysis() {
        const input = document.getElementById('orgName').value.trim();
        
        if (!input) {
            this.showAlert('Please enter an organization, user name, or repository (owner/repo)', 'warning');
            return;
        }

        if (this.isAnalyzing) {
            return;
        }

        // Parse the input (handles URLs, owner/repo, or just username)
        const parsed = this.parseGitHubInput(input);
        
        if (parsed.isRepo) {
            await this.analyzeSingleRepository(parsed.owner, parsed.repo);
        } else {
            await this.analyzeOrganization(parsed.owner);
        }
    }

    /**
     * Analyze a single repository
     */
    async analyzeSingleRepository(owner, repo) {
        this.isAnalyzing = true;
        this.sbomProcessor.reset();
        
        const repoKey = `${owner}/${repo}`;
        
        // Store current repo for rate limit state
        localStorage.setItem('current_analysis_org', repoKey);
        
        // Update UI
        const analyzeBtn = document.getElementById('analyzeBtn');
        const progressSection = document.getElementById('progressSection');
        const resultsSection = document.getElementById('resultsSection');
        
        if (analyzeBtn) analyzeBtn.disabled = true;
        if (progressSection) progressSection.style.display = 'block';
        if (resultsSection) resultsSection.style.display = 'none';
        
        this.updateProgress(0, 'Initializing repository analysis...');

        try {
            // Get rate limit info
            const rateLimitInfo = await this.githubClient.getRateLimitInfo();
            this.updateRateLimitInfo(rateLimitInfo);

            // Fetch repository metadata
            this.updateProgress(10, `Fetching repository ${repoKey}...`);
            const repoData = await this.githubClient.getRepository(owner, repo);
            
            if (!repoData) {
                this.showAlert(`Repository ${repoKey} not found`, 'danger');
                this.finishAnalysis();
                return;
            }

            // Fetch SBOM
            this.updateProgress(30, 'Fetching SBOM data...');
            const sbomData = await this.githubClient.fetchSBOM(owner, repo);
            
            if (!sbomData) {
                this.showAlert(`No SBOM data available for ${repoKey}. Ensure Dependency Graph is enabled.`, 'warning');
                this.finishAnalysis();
                return;
            }

            // Process SBOM
            this.updateProgress(50, 'Processing SBOM data...');
            this.sbomProcessor.setTotalRepositories(1);
            const success = this.sbomProcessor.processSBOM(owner, repo, sbomData);
            
            if (!success) {
                this.showAlert(`Failed to process SBOM data for ${repoKey}`, 'danger');
                this.finishAnalysis();
                return;
            }

            // Resolve full dependency trees with API queries
            this.updateProgress(75, 'Resolving dependency trees...');
            try {
                console.log('🌲 Resolving full dependency trees with registry APIs...');
                await this.sbomProcessor.resolveFullDependencyTrees((progress) => {
                    if (progress.phase === 'resolving-tree') {
                        this.updateProgress(75 + (progress.processed / progress.total) * 5, 
                            `Resolving ${progress.ecosystem} dependencies...`);
                    }
                });
                console.log('✅ Dependency tree resolution complete');
            } catch (error) {
                console.error('❌ Dependency tree resolution failed:', error);
                console.log('⚠️ Continuing with partial dependency information...');
            }
            
            // Generate results (use let so we can reload after author analysis)
            this.updateProgress(80, 'Generating analysis results...');
            let results = this.sbomProcessor.exportData();
            
            // Run license compliance analysis
            const repoStats = this.sbomProcessor.repositories.get(repoKey);
            if (repoStats && repoStats.totalDependencies > 0) {
                this.updateProgress(85, 'Analyzing license compliance...');
                try {
                    const licenseAnalysis = this.sbomProcessor.analyzeLicenseCompliance();
                    if (licenseAnalysis) {
                        results.licenseAnalysis = licenseAnalysis;
                        console.log('📊 License Compliance Analysis Results:', licenseAnalysis);
                    }
                } catch (error) {
                    console.error('❌ License compliance analysis failed:', error);
                }
            }
            
            // Save initial results to storage (required for vulnerability and author analysis)
            this.updateProgress(87, 'Saving initial results...');
            let saveSuccess = await this.storageManager.saveAnalysisData(repoKey, results);
            if (!saveSuccess) {
                console.warn('⚠️ Failed to save initial analysis data to storage');
            }
            
            // Run vulnerability and author analysis (these need data in storage)
            if (repoStats && repoStats.totalDependencies > 0) {
                // Run vulnerability analysis
                this.updateProgress(90, 'Analyzing vulnerabilities...');
                try {
                    console.log('🔍 Starting vulnerability analysis...');
                    // Pass progress callback to show real-time updates
                    await this.sbomProcessor.analyzeVulnerabilitiesWithIncrementalSaving(repoKey, (percent, message) => {
                        // Map vulnerability progress (0-100%) to progress bar range (90-93%)
                        const mappedProgress = 90 + (percent * 0.03);
                        this.updateProgress(mappedProgress, message);
                    });
                    console.log('✅ Vulnerability analysis complete');
                } catch (error) {
                    console.error('❌ Vulnerability analysis failed:', error);
                }
                
                // Run author analysis
                this.updateProgress(93, 'Fetching author information...');
                try {
                    console.log('👥 Analyzing package authors...');
                    await this.analyzeAuthors(repoKey);
                    console.log('✅ Author analysis complete');
                    
                    // Reload data to get the updated results with author analysis
                    const updatedData = await this.storageManager.loadAnalysisDataForOrganization(repoKey);
                    if (updatedData && updatedData.data) {
                        results = updatedData.data;
                        console.log('✅ Reloaded data with author analysis');
                    }
                } catch (error) {
                    console.error('❌ Author analysis failed:', error);
                }
            }
            
            // Log summary
            console.log(`📊 Single Repository Analysis Summary for ${repoKey}:`);
            console.log(`   Total dependencies: ${results.statistics.totalDependencies}`);
            
            // Final save to storage (to include vulnerability and author data)
            this.updateProgress(95, 'Saving final results...');
            saveSuccess = await this.storageManager.saveAnalysisData(repoKey, results);
            if (!saveSuccess) {
                console.warn('⚠️ Failed to save analysis data to storage');
                this.showAlert('Analysis completed but failed to save to storage.', 'warning');
            } else {
                await this.showStorageStatusIndicator();
            }
            
            // Display results
            await this.displaySingleRepoResults(results, repoKey);
            
            this.updateProgress(100, 'Analysis complete!');
            this.showAlert(`Analysis complete for ${repoKey}!`, 'success');
            
        } catch (error) {
            console.error('Single repository analysis failed:', error);
            this.showAlert(`Analysis failed: ${error.message}`, 'danger');
        } finally {
            this.finishAnalysis();
        }
    }

    /**
     * Analyze an organization or user
     */
    async analyzeOrganization(ownerName) {
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
                    
                    const saveSuccess = await this.storageManager.saveIncrementalAnalysisData(ownerName, partialData, isComplete);
                    if (saveSuccess) {
                        console.log(`✅ Incremental data saved for ${ownerName} (${isComplete ? 'complete' : 'partial'})`);
                        
                        // Check data size and warn if too large
                        const sizeCheck = await this.storageManager.checkDataSizeAndWarn(ownerName);
                        if (sizeCheck.isLarge) {
                            this.showAlert(sizeCheck.message, 'warning');
                        }
                        
                        // Clear memory after successful save to prevent DOM from holding unnecessary data
                        this.sbomProcessor.clearMemoryAfterSave();
                        
                        // Update storage indicators (only show indicator, not full status)
                        await this.showStorageStatusIndicator();
                    } else {
                        console.warn(`⚠️ Failed to save incremental data for ${ownerName}`);
                    }
                }

                // Add small delay to be respectful to GitHub API
                await this.sleep(100);
            }

            // Resolve full dependency trees with API queries
            this.updateProgress(85, 'Resolving dependency trees...');
            try {
                console.log('🌲 Resolving full dependency trees with registry APIs...');
                await this.sbomProcessor.resolveFullDependencyTrees((progress) => {
                    if (progress.phase === 'resolving-tree') {
                        this.updateProgress(85 + (progress.processed / progress.total) * 5, 
                            `Resolving ${progress.ecosystem} dependencies...`);
                    }
                });
                console.log('✅ Dependency tree resolution complete');
            } catch (error) {
                console.error('❌ Dependency tree resolution failed:', error);
                console.log('⚠️ Continuing with partial dependency information...');
            }
            
            // Generate results (use let so we can reload after author analysis)
            this.updateProgress(90, 'Generating analysis results...');
            let results = this.sbomProcessor.exportData();

            // Run license compliance analysis
            if (reposWithDeps > 0) {
                this.updateProgress(92, 'Analyzing license compliance...');
                try {
                    const licenseAnalysis = this.sbomProcessor.analyzeLicenseCompliance();
                    if (licenseAnalysis) {
                        results.licenseAnalysis = licenseAnalysis;
                        console.log('📊 License Compliance Analysis Results:', licenseAnalysis);
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
            
            // Save initial results to storage (required for vulnerability and author analysis)
            this.updateProgress(93, 'Saving initial results...');
            let saveSuccess = await this.storageManager.saveAnalysisData(ownerName, results);
            if (!saveSuccess) {
                console.warn('⚠️ Failed to save initial analysis data to storage');
            } else {
                await this.showStorageStatusIndicator();
            }
            
            // Run vulnerability and author analysis (these need data in storage)
            if (reposWithDeps > 0) {
                // Run vulnerability analysis
                this.updateProgress(94, 'Analyzing vulnerabilities...');
                try {
                    console.log('🔍 Starting vulnerability analysis...');
                    // Pass progress callback to show real-time updates
                    await this.sbomProcessor.analyzeVulnerabilitiesWithIncrementalSaving(ownerName, (percent, message) => {
                        // Map vulnerability progress (0-100%) to progress bar range (94-96%)
                        const mappedProgress = 94 + (percent * 0.02);
                        this.updateProgress(mappedProgress, message);
                    });
                    console.log('✅ Vulnerability analysis complete');
                } catch (error) {
                    console.error('❌ Vulnerability analysis failed:', error);
                }
                
                // Run author analysis
                this.updateProgress(96, 'Fetching author information...');
                try {
                    console.log('👥 Analyzing package authors...');
                    await this.analyzeAuthors(ownerName);
                    console.log('✅ Author analysis complete');
                    
                    // Reload data to get the updated results with author analysis
                    const updatedData = await this.storageManager.loadAnalysisDataForOrganization(ownerName);
                    if (updatedData && updatedData.data) {
                        results = updatedData.data;
                        console.log('✅ Reloaded data with author analysis');
                    }
                } catch (error) {
                    console.error('❌ Author analysis failed:', error);
                }
            }
            
            // Final save to storage (to include vulnerability and author data)
            this.updateProgress(98, 'Saving final results...');
            saveSuccess = await this.storageManager.saveAnalysisData(ownerName, results);
            if (!saveSuccess) {
                console.warn('⚠️ Failed to save analysis data to storage');
                this.showAlert('Analysis completed but failed to save to storage. Consider exporting your data and clearing old analyses.', 'warning');
            } else {
                // Update storage indicators after successful save (only indicator, not full status)
                await this.showStorageStatusIndicator();
            }
            
            // Display results
            await this.displayResults(results, ownerName);
            
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
     * Display analysis results (async)
     */
    async displayResults(results, ownerName) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContent = document.getElementById('resultsContent');
        
        // Check if the results elements exist on this page
        if (!resultsSection || !resultsContent) {
            console.log('Results section elements not found on this page');
            return;
        }
        
        // Get storage info to show all entries
        const storageInfo = await this.storageManager.getStorageInfo();
        const allEntries = [...storageInfo.organizations, ...storageInfo.repositories];
        
        let html = '';
        
        // Show stored entries overview
        if (allEntries.length > 0) {
            html += `
                <div class="row mb-4">
                    <div class="col-12">
                        <h6><i class="fas fa-database me-2"></i>Stored Analyses (${allEntries.length})</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Repositories</th>
                                        <th>Dependencies</th>
                                        <th>Last Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${allEntries.map(entry => {
                                        const date = new Date(entry.timestamp).toLocaleDateString();
                                        const time = new Date(entry.timestamp).toLocaleTimeString();
                                        // Escape HTML for display
                                        const escapeHtml = (text) => {
                                            if (!text) return '';
                                            const div = document.createElement('div');
                                            div.textContent = text;
                                            return div.innerHTML;
                                        };
                                        const orgNameEscaped = escapeHtml(entry.name);
                                        return `
                                            <tr>
                                                <td>
                                                    <strong>
                                                        <a href="deps.html?org=${encodeURIComponent(entry.name)}" class="text-decoration-none">
                                                            ${orgNameEscaped}
                                                        </a>
                                                    </strong>
                                                </td>
                                                <td><span class="badge bg-primary">${entry.repositories}</span></td>
                                                <td><span class="badge bg-success">${entry.dependencies}</span></td>
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
        
        // Show no data message if no entries stored
        if (allEntries.length === 0) {
            html += `
                <div class="alert alert-info">
                    <h6><i class="fas fa-info-circle me-2"></i>No Stored Analyses</h6>
                    <p class="mb-2">You haven't analyzed any organizations or repositories yet. Start your first analysis above!</p>
                </div>
            `;
        }
        
        resultsContent.innerHTML = html;
        resultsSection.style.display = 'block';
        
        // Show/hide Quick Analysis Access section based on stored entries
        const quickAnalysisSection = document.getElementById('quickAnalysisSection');
        if (quickAnalysisSection) {
            if (allEntries.length > 0) {
                quickAnalysisSection.style.display = 'block';
            } else {
                quickAnalysisSection.style.display = 'none';
            }
        }
        
        // Show stats dashboard if we have data
        if (allEntries.length > 0) {
            await this.displayStatsDashboard();
        }
    }
    
    /**
     * Display stats dashboard (similar to stats.html)
     */
    async displayStatsDashboard() {
        const statsOverview = document.getElementById('statsDashboardOverview');
        const statsQuality = document.getElementById('statsQualityDashboard');
        const statsCards = document.getElementById('statsCards');
        
        // Check if stats elements exist on this page
        if (!statsOverview || !statsCards) {
            return; // Stats sections don't exist on this page
        }
        
        // Load combined data
        const combinedData = await this.storageManager.getCombinedData();
        
        if (!combinedData) {
            statsOverview.style.display = 'none';
            statsQuality.style.display = 'none';
            statsCards.style.display = 'none';
            return;
        }
        
        // Show stats sections
        statsOverview.style.display = 'block';
        statsCards.style.display = 'block';
        
        // Display overview
        await this.displayStatsOverview(combinedData);
        
        // Display quality dashboard
        this.displayStatsQuality(combinedData);
        
        // Display stats cards
        this.displayStatsCards(combinedData);
        
        // Display top common dependencies
        this.displayTopCommonDependencies(combinedData);
        
        // Display version sprawl
        this.displayVersionSprawl(combinedData);
        
        // Display license distribution
        this.displayLicenseDistribution(combinedData);
    }
    
    /**
     * Display stats overview
     */
    async displayStatsOverview(data) {
        const content = document.getElementById('statsOverviewContent');
        if (!content) return;
        
        // Calculate high-level stats
        const totalRepos = data.data.allRepositories?.length || 0;
        const totalDeps = data.data.allDependencies?.length || 0;
        
        // Extract vulnerabilities from vulnerabilityAnalysis
        let totalVulns = 0;
        if (data.data.vulnerabilityAnalysis && data.data.vulnerabilityAnalysis.vulnerableDependencies) {
            totalVulns = data.data.vulnerabilityAnalysis.vulnerableDependencies.reduce((total, dep) => {
                return total + (dep.vulnerabilities?.length || 0);
            }, 0);
        }
        
        // Extract licenses from licenseAnalysis
        let totalLicenses = 0;
        if (data.data.licenseAnalysis && data.data.licenseAnalysis.summary) {
            totalLicenses = data.data.licenseAnalysis.summary.totalDependencies || 0;
        }
        
        // Count packages and authors seeking sponsorship/donations
        const fundingStats = await this.getFundingStats(data);
        
        const html = `
            <div class="row">
                <div class="col-md-6">
                    <h6>📊 Combined Analysis Summary</h6>
                    <p class="text-muted small mb-3">
                        Aggregated data from all analyzed organizations
                    </p>
                </div>
                <div class="col-md-6 text-end">
                    <a href="license-compliance.html" class="btn btn-outline-primary btn-sm me-2">
                        <i class="fas fa-file-contract me-1"></i>License Details
                    </a>
                    <a href="vuln.html" class="btn btn-outline-warning btn-sm me-2">
                        <i class="fas fa-shield-alt me-1"></i>Vulnerability Details
                    </a>
                    <a href="deps.html" class="btn btn-outline-info btn-sm">
                        <i class="fas fa-cubes me-1"></i>Dependency Details
                    </a>
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-md-3">
                    <div class="text-center">
                        <h4 class="text-primary">${totalRepos}</h4>
                        <small class="text-muted">Repositories</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="text-center">
                        <h4 class="text-success">${totalDeps}</h4>
                        <small class="text-muted">Dependencies</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="text-center">
                        <h4 class="text-warning">${totalVulns}</h4>
                        <small class="text-muted">Vulnerabilities</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="text-center">
                        <h4 class="text-info">${totalLicenses}</h4>
                        <small class="text-muted">Licenses</small>
                    </div>
                </div>
            </div>
            ${fundingStats.packagesWithFunding > 0 || fundingStats.authorsWithFunding > 0 ? `
            <div class="row mt-3 pt-3 border-top">
                <div class="col-12 mb-2">
                    <h6><i class="fas fa-heart me-2"></i>Funding & Sponsorship Opportunities</h6>
                </div>
                <div class="col-md-4">
                    <div class="text-center">
                        ${fundingStats.directPackagesWithFunding > 0 ? `
                        <a href="deps.html?funding=true&direct=true" class="text-decoration-none text-success">
                            <h4 class="text-success">
                                <i class="fas fa-layer-group me-2"></i>${fundingStats.directPackagesWithFunding}
                            </h4>
                            <small class="text-muted">Direct Dependencies</small>
                            <p class="text-muted small mb-0 mt-1">
                                <i class="fas fa-info-circle me-1"></i>
                                Packages directly used by your repositories
                            </p>
                        </a>
                        ` : `
                        <h4 class="text-success">
                            <i class="fas fa-layer-group me-2"></i>0
                        </h4>
                        <small class="text-muted">Direct Dependencies</small>
                        <p class="text-muted small mb-0 mt-1">No direct dependencies with funding</p>
                        `}
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="text-center">
                        ${fundingStats.packagesWithFunding > 0 ? `
                        <a href="deps.html?funding=true" class="text-decoration-none text-info">
                            <h4 class="text-info">
                                <i class="fas fa-sitemap me-2"></i>${fundingStats.packagesWithFunding}
                            </h4>
                            <small class="text-muted">All Dependencies</small>
                            <p class="text-muted small mb-0 mt-1">
                                <i class="fas fa-info-circle me-1"></i>
                                Includes transitive dependencies in supply chain
                            </p>
                        </a>
                        ` : `
                        <h4 class="text-info">
                            <i class="fas fa-sitemap me-2"></i>0
                        </h4>
                        <small class="text-muted">All Dependencies</small>
                        <p class="text-muted small mb-0 mt-1">No dependencies with funding found</p>
                        `}
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="text-center">
                        ${fundingStats.authorsWithFunding > 0 ? `
                        <a href="authors.html?funding=true" class="text-decoration-none text-primary">
                            <h4 class="text-primary">
                                <i class="fas fa-users me-2"></i>${fundingStats.authorsWithFunding}
                            </h4>
                            <small class="text-muted">Package Authors</small>
                            <p class="text-muted small mb-0 mt-1">
                                <i class="fas fa-info-circle me-1"></i>
                                Maintainers accepting personal sponsorships
                            </p>
                        </a>
                        ` : `
                        <h4 class="text-primary">
                            <i class="fas fa-users me-2"></i>0
                        </h4>
                        <small class="text-muted">Package Authors</small>
                        <p class="text-muted small mb-0 mt-1">No authors with funding found</p>
                        `}
                    </div>
                </div>
            </div>
            ` : ''}
        `;
        
        content.innerHTML = html;
    }
    
    /**
     * Display SBOM Quality Dashboard
     */
    displayStatsQuality(data) {
        const qualityDashboard = document.getElementById('statsQualityDashboard');
        const qualityContent = document.getElementById('statsQualityContent');
        
        if (!qualityDashboard || !qualityContent) return;
        
        if (!data.data.qualityAnalysis) {
            qualityDashboard.style.display = 'none';
            return;
        }
        
        qualityDashboard.style.display = 'block';
        const qa = data.data.qualityAnalysis;
        
        // Get color class for score
        const getScoreColor = (score) => {
            if (score >= 80) return 'success';
            if (score >= 60) return 'warning';
            return 'danger';
        };
        
        // Convert to 0-10 display scale
        const displayScore = qa.averageDisplayScore || (qa.averageOverallScore / 10).toFixed(1);
        
        // Build HTML
        let html = `
            <div class="alert alert-warning mb-3">
                <i class="fas fa-flask me-2"></i>
                <strong>Experimental SBOM Quality Assessment:</strong> Based on parameters listed in <a href="about.html" class="alert-link">about.html</a>.
            </div>
            
            <div class="row mb-4">
                <div class="col-md-12 text-center mb-3">
                    <h2 class="text-${getScoreColor(qa.averageOverallScore)}">${displayScore}/10.0</h2>
                    <p class="text-muted">Average Quality Score Across All Repositories</p>
                </div>
            </div>
            
            <h6 class="mb-3">Average Category Scores (6 categories):</h6>
            <div class="row g-3 mb-4">
                <div class="col-lg-4 col-md-6">
                    <div class="card">
                        <div class="card-body p-2">
                            <p class="mb-1 small"><strong>Identification (25%)</strong></p>
                            <div class="progress" style="height: 25px;">
                                <div class="progress-bar bg-${getScoreColor(qa.averageIdentification || 0)}" 
                                     role="progressbar" 
                                     style="width: ${qa.averageIdentification || 0}%">${qa.averageIdentification || 0}/100</div>
                            </div>
                            <small class="text-muted">Names, versions, PURLs</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4 col-md-6">
                    <div class="card">
                        <div class="card-body p-2">
                            <p class="mb-1 small"><strong>Provenance (20%)</strong></p>
                            <div class="progress" style="height: 25px;">
                                <div class="progress-bar bg-${getScoreColor(qa.averageProvenance || 0)}" 
                                     role="progressbar" 
                                     style="width: ${qa.averageProvenance || 0}%">${qa.averageProvenance || 0}/100</div>
                            </div>
                            <small class="text-muted">Creator, timestamp, tool</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4 col-md-6">
                    <div class="card">
                        <div class="card-body p-2">
                            <p class="mb-1 small"><strong>Dependencies (10%)</strong></p>
                            <div class="progress" style="height: 25px;">
                                <div class="progress-bar bg-${getScoreColor(qa.averageDependencies || 0)}" 
                                     role="progressbar" 
                                     style="width: ${qa.averageDependencies || 0}%">${qa.averageDependencies || 0}/100</div>
                            </div>
                            <small class="text-muted">Relationship mapping</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4 col-md-6">
                    <div class="card">
                        <div class="card-body p-2">
                            <p class="mb-1 small"><strong>Metadata (10%)</strong></p>
                            <div class="progress" style="height: 25px;">
                                <div class="progress-bar bg-${getScoreColor(qa.averageMetadata || 0)}" 
                                     role="progressbar" 
                                     style="width: ${qa.averageMetadata || 0}%">${qa.averageMetadata || 0}/100</div>
                            </div>
                            <small class="text-muted">Copyright, download location</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4 col-md-6">
                    <div class="card">
                        <div class="card-body p-2">
                            <p class="mb-1 small"><strong>Licensing (10%)</strong></p>
                            <div class="progress" style="height: 25px;">
                                <div class="progress-bar bg-${getScoreColor(qa.averageLicensing || 0)}" 
                                     role="progressbar" 
                                     style="width: ${qa.averageLicensing || 0}%">${qa.averageLicensing || 0}/100</div>
                            </div>
                            <small class="text-muted">License presence, validity</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4 col-md-6">
                    <div class="card">
                        <div class="card-body p-2">
                            <p class="mb-1 small"><strong>Vulnerability (15%)</strong></p>
                            <div class="progress" style="height: 25px;">
                                <div class="progress-bar bg-${getScoreColor(qa.averageVulnerability || 0)}" 
                                     role="progressbar" 
                                     style="width: ${qa.averageVulnerability || 0}%">${qa.averageVulnerability || 0}/100</div>
                            </div>
                            <small class="text-muted">PURL, CPE identifiers</small>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row mb-3">
                <div class="col-md-12">
                    <h6>Grade Distribution</h6>
                    <div class="d-flex gap-3">
                        <span class="badge bg-success">A: ${qa.gradeDistribution.A || 0}</span>
                        <span class="badge bg-info">B: ${qa.gradeDistribution.B || 0}</span>
                        <span class="badge bg-primary">C: ${qa.gradeDistribution.C || 0}</span>
                        <span class="badge bg-warning">D: ${qa.gradeDistribution.D || 0}</span>
                        <span class="badge bg-danger">F: ${qa.gradeDistribution.F || 0}</span>
                        ${qa.gradeDistribution['N/A'] > 0 ? `<span class="badge bg-secondary">N/A: ${qa.gradeDistribution['N/A']}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Add repositories needing attention
        if (qa.repositoriesNeedingAttention && qa.repositoriesNeedingAttention.length > 0) {
            html += `
                <div class="alert alert-warning">
                    <h6><i class="fas fa-exclamation-triangle me-2"></i>Repositories Needing Attention (showing top ${Math.min(qa.repositoriesNeedingAttention.length, 5)} of ${qa.repositoriesNeedingAttention.length})</h6>
                    <p class="small mb-2">These repositories have SBOM quality scores below 70%:</p>
                    <div class="table-responsive">
                        <table class="table table-sm table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>Repository</th>
                                    <th>Score</th>
                                    <th>Grade</th>
                                    <th>Top Issues</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            qa.repositoriesNeedingAttention.slice(0, 5).forEach(repo => {
                const issueCategories = repo.topIssues.map(issue => issue.category).join(', ');
                const repoDisplayScore = repo.displayScore || (repo.score / 10).toFixed(1);
                html += `
                    <tr>
                        <td><code>${repo.repository}</code></td>
                        <td><span class="badge bg-${getScoreColor(repo.score)}">${repoDisplayScore}/10</span></td>
                        <td><span class="badge bg-secondary">${repo.grade}</span></td>
                        <td><small>${issueCategories}</small></td>
                    </tr>
                `;
            });
            
            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
        
        qualityContent.innerHTML = html;
    }
    
    /**
     * Display stats cards
     */
    displayStatsCards(data) {
        const statsContainer = document.getElementById('statsCards');
        if (!statsContainer) return;
        
        // Calculate additional stats
        const topLanguages = this.getTopLanguages(data);
        const topVulnerabilities = this.getTopVulnerabilities(data);
        const licenseCompliance = this.getLicenseCompliance(data);

        const html = `
            <div class="row gy-3">
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-header">
                            <h6 class="mb-0"><i class="fas fa-code me-2"></i>Top Languages</h6>
                        </div>
                        <div class="card-body">
                            ${this.renderTopLanguages(topLanguages)}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-header">
                            <h6 class="mb-0"><i class="fas fa-exclamation-triangle me-2"></i>Critical Issues</h6>
                        </div>
                        <div class="card-body">
                            ${this.renderTopVulnerabilities(topVulnerabilities)}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-header">
                            <h6 class="mb-0"><i class="fas fa-file-contract me-2"></i>License Status</h6>
                        </div>
                        <div class="card-body">
                            ${this.renderLicenseCompliance(licenseCompliance)}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        statsContainer.innerHTML = html;
    }
    
    /**
     * Display top common dependencies
     */
    displayTopCommonDependencies(data) {
        const section = document.getElementById('topCommonDependencies');
        const content = document.getElementById('topCommonDependenciesContent');
        
        if (!section || !content) return;
        
        const topDeps = this.getTopCommonDependencies(data);
        
        if (topDeps.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        section.style.display = 'block';
        content.innerHTML = this.renderTopCommonDependencies(topDeps);
    }
    
    /**
     * Display version sprawl dependencies
     */
    displayVersionSprawl(data) {
        const section = document.getElementById('versionSprawl');
        const content = document.getElementById('versionSprawlContent');
        
        if (!section || !content) return;
        
        const sprawlDeps = this.getVersionSprawlDependencies(data);
        
        if (sprawlDeps.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        section.style.display = 'block';
        content.innerHTML = this.renderVersionSprawl(sprawlDeps);
    }
    
    /**
     * Get top languages from data
     */
    getTopLanguages(data) {
        if (!data.data.languageStats) {
            return [];
        }
        
        return Object.entries(data.data.languageStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([lang, count]) => ({ language: lang, count }));
    }
    
    /**
     * Get top vulnerabilities from data
     */
    getTopVulnerabilities(data) {
        if (!data.data.vulnerabilityAnalysis || !data.data.vulnerabilityAnalysis.vulnerableDependencies) {
            return [];
        }
        
        const vulnCounts = {};
        data.data.vulnerabilityAnalysis.vulnerableDependencies.forEach(dep => {
            if (dep.vulnerabilities) {
                dep.vulnerabilities.forEach(vuln => {
                    const severity = vuln.severity || 'unknown';
                    vulnCounts[severity] = (vulnCounts[severity] || 0) + 1;
                });
            }
        });
        
        return Object.entries(vulnCounts)
            .sort(([,a], [,b]) => b - a)
            .map(([severity, count]) => ({ severity, count }));
    }
    
    /**
     * Get license compliance stats
     */
    getLicenseCompliance(data) {
        if (!data.data.licenseAnalysis || !data.data.licenseAnalysis.summary) {
            return { total: 0, compliant: 0, nonCompliant: 0 };
        }
        
        const summary = data.data.licenseAnalysis.summary;
        const total = summary.totalDependencies || 0;
        const compliant = summary.licensedDependencies || 0;
        
        return {
            total,
            compliant,
            nonCompliant: total - compliant
        };
    }
    
    /**
     * Render top languages
     */
    renderTopLanguages(languages) {
        if (languages.length === 0) {
            return '<p class="text-muted small">No language data available</p>';
        }
        
        return languages.map(lang => 
            `<div class="d-flex justify-content-between align-items-center mb-2">
                <span class="small">${lang.language}</span>
                <span class="badge bg-primary">${lang.count}</span>
            </div>`
        ).join('');
    }
    
    /**
     * Render top vulnerabilities
     */
    renderTopVulnerabilities(vulnerabilities) {
        if (vulnerabilities.length === 0) {
            return '<p class="text-muted small">No vulnerability data available</p>';
        }
        
        const severityColors = {
            'critical': 'danger',
            'high': 'warning',
            'medium': 'info',
            'low': 'secondary',
            'unknown': 'light',
            'CRITICAL': 'danger',
            'HIGH': 'warning',
            'MEDIUM': 'info',
            'LOW': 'secondary',
            'UNKNOWN': 'light'
        };
        
        return vulnerabilities.map(vuln => {
            const severity = vuln.severity || 'unknown';
            const color = severityColors[severity] || 'light';
            return `<div class="d-flex justify-content-between align-items-center mb-2">
                <span class="small text-capitalize">${severity.toLowerCase()}</span>
                <span class="badge bg-${color}">${vuln.count}</span>
            </div>`;
        }).join('');
    }
    
    /**
     * Render license compliance
     */
    renderLicenseCompliance(compliance) {
        if (compliance.total === 0) {
            return '<p class="text-muted small">No license data available</p>';
        }
        
        const compliantPercent = compliance.total > 0 ? 
            ((compliance.compliant / compliance.total) * 100).toFixed(1) : 0;
        
        return `
            <div class="text-center mb-3">
                <h4 class="text-${compliantPercent >= 80 ? 'success' : compliantPercent >= 60 ? 'warning' : 'danger'}">${compliantPercent}%</h4>
                <small class="text-muted">Compliant</small>
            </div>
            <div class="row text-center">
                <div class="col-6">
                    <small class="text-success">${compliance.compliant} Compliant</small>
                </div>
                <div class="col-6">
                    <small class="text-danger">${compliance.nonCompliant} Issues</small>
                </div>
            </div>
        `;
    }
    
    /**
     * Get top 5 most commonly used dependencies (by name@version)
     */
    getTopCommonDependencies(data) {
        if (!data.data.allDependencies || !Array.isArray(data.data.allDependencies)) {
            return [];
        }
        
        // Sort by count (repository count) descending and take top 5
        return data.data.allDependencies
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .slice(0, 5)
            .map(dep => ({
                name: dep.name,
                version: dep.version,
                count: dep.count || 0,
                repositories: dep.repositories || []
            }));
    }
    
    /**
     * Get top 5 dependencies with version sprawl (multiple versions)
     */
    getVersionSprawlDependencies(data) {
        if (!data.data.allDependencies || !Array.isArray(data.data.allDependencies)) {
            return [];
        }
        
        // Group by dependency name (ignoring version)
        const nameMap = new Map();
        
        data.data.allDependencies.forEach(dep => {
            const name = dep.name;
            if (!nameMap.has(name)) {
                nameMap.set(name, {
                    name: name,
                    versions: new Set(),
                    versionDetails: []
                });
            }
            const entry = nameMap.get(name);
            entry.versions.add(dep.version);
            entry.versionDetails.push({
                version: dep.version,
                count: dep.count || 0
            });
        });
        
        // Filter to dependencies with > 1 version, sort by version count, take top 5
        return Array.from(nameMap.values())
            .filter(entry => entry.versions.size > 1)
            .map(entry => ({
                name: entry.name,
                versionCount: entry.versions.size,
                versions: Array.from(entry.versions).sort(),
                versionDetails: entry.versionDetails.sort((a, b) => (b.count || 0) - (a.count || 0))
            }))
            .sort((a, b) => b.versionCount - a.versionCount)
            .slice(0, 5);
    }
    
    /**
     * Render top common dependencies
     */
    renderTopCommonDependencies(deps) {
        if (deps.length === 0) {
            return '<p class="text-muted small">No dependency data available</p>';
        }
        
        return deps.map(dep => {
            const depKey = `${dep.name}@${dep.version}`;
            return `
                <div class="d-flex justify-content-between align-items-center mb-2 p-2 border rounded">
                    <div>
                        <strong><code>${this.escapeHtml(dep.name)}@${this.escapeHtml(dep.version)}</code></strong>
                        <br>
                        <small class="text-muted">Used in ${dep.count} ${dep.count === 1 ? 'repository' : 'repositories'}</small>
                    </div>
                    <a href="deps.html?search=${encodeURIComponent(dep.name)}" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-external-link-alt me-1"></i>View
                    </a>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Render version sprawl dependencies
     */
    renderVersionSprawl(deps) {
        if (deps.length === 0) {
            return '<p class="text-muted small">No version sprawl detected. All dependencies use single versions.</p>';
        }
        
        return deps.map(dep => {
            const versionsDisplay = dep.versions.length > 5 
                ? dep.versions.slice(0, 5).join(', ') + ` ... and ${dep.versions.length - 5} more`
                : dep.versions.join(', ');
            
            return `
                <div class="d-flex justify-content-between align-items-start mb-3 p-2 border rounded ${dep.versionCount > 1 ? 'border-warning' : ''}">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <strong><code>${this.escapeHtml(dep.name)}</code></strong>
                            <span class="badge bg-${dep.versionCount > 1 ? 'warning' : 'secondary'}">${dep.versionCount} ${dep.versionCount === 1 ? 'version' : 'versions'}</span>
                            ${dep.versionCount > 1 ? '<span class="badge bg-danger">Version Sprawl</span>' : ''}
                        </div>
                        <small class="text-muted">Versions: ${this.escapeHtml(versionsDisplay)}</small>
                    </div>
                    <a href="deps.html?search=${encodeURIComponent(dep.name)}" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-external-link-alt me-1"></i>View
                    </a>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Display license distribution with pie chart and cards
     */
    displayLicenseDistribution(data) {
        const licenseSection = document.getElementById('licenseDistribution');
        const licenseContent = document.getElementById('licenseDistributionContent');
        
        if (!licenseSection || !licenseContent) return;
        
        if (!data.data.licenseAnalysis || !data.data.licenseAnalysis.summary) {
            licenseSection.style.display = 'none';
            return;
        }
        
        licenseSection.style.display = 'block';
        const summary = data.data.licenseAnalysis.summary;
        const breakdown = summary.categoryBreakdown || {};
        
        // Calculate copyleft (including LGPL)
        const copyleftCount = (breakdown.copyleft || 0) + (breakdown.lgpl || 0);
        const totalLicensed = summary.licensedDependencies || 0;
        const unlicensed = summary.unlicensedDependencies || 0;
        const proprietary = breakdown.proprietary || 0;
        const unknown = breakdown.unknown || 0;
        const permissive = breakdown.permissive || 0;
        
        // Calculate percentages for pie chart
        const total = totalLicensed + unlicensed;
        if (total === 0) {
            licenseSection.style.display = 'none';
            return;
        }
        
        const copyleftPercent = total > 0 ? ((copyleftCount / total) * 100).toFixed(1) : 0;
        const permissivePercent = total > 0 ? ((permissive / total) * 100).toFixed(1) : 0;
        const proprietaryPercent = total > 0 ? ((proprietary / total) * 100).toFixed(1) : 0;
        const unknownPercent = total > 0 ? ((unknown / total) * 100).toFixed(1) : 0;
        const unlicensedPercent = total > 0 ? ((unlicensed / total) * 100).toFixed(1) : 0;
        
        // Build pie chart using CSS (conic-gradient)
        const pieChartHtml = `
            <div class="row mb-4">
                <div class="col-md-6">
                    <h6 class="mb-3">License Distribution</h6>
                    <div class="d-flex justify-content-center align-items-center">
                        <div style="width: 200px; height: 200px; border-radius: 50%; background: conic-gradient(
                            #28a745 ${permissivePercent}%,
                            #ffc107 ${parseFloat(permissivePercent)}% ${parseFloat(permissivePercent) + parseFloat(copyleftPercent)}%,
                            #dc3545 ${parseFloat(permissivePercent) + parseFloat(copyleftPercent)}% ${parseFloat(permissivePercent) + parseFloat(copyleftPercent) + parseFloat(proprietaryPercent)}%,
                            #6c757d ${parseFloat(permissivePercent) + parseFloat(copyleftPercent) + parseFloat(proprietaryPercent)}% ${parseFloat(permissivePercent) + parseFloat(copyleftPercent) + parseFloat(proprietaryPercent) + parseFloat(unknownPercent)}%,
                            #17a2b8 ${parseFloat(permissivePercent) + parseFloat(copyleftPercent) + parseFloat(proprietaryPercent) + parseFloat(unknownPercent)}%
                        ); position: relative;">
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100px; height: 100px; background: var(--bg-color, #fff); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <strong>${total}</strong>
                            </div>
                        </div>
                    </div>
                    <div class="mt-3 text-center">
                        <small class="text-muted">Total Dependencies</small>
                    </div>
                </div>
                <div class="col-md-6">
                    <h6 class="mb-3">Legend</h6>
                    <div class="d-flex flex-column gap-2">
                        <div class="d-flex align-items-center gap-2">
                            <div style="width: 20px; height: 20px; background: #28a745; border-radius: 4px;"></div>
                            <span>Permissive (${permissivePercent}%)</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div style="width: 20px; height: 20px; background: #ffc107; border-radius: 4px;"></div>
                            <span>Copyleft (${copyleftPercent}%)</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div style="width: 20px; height: 20px; background: #dc3545; border-radius: 4px;"></div>
                            <span>Proprietary (${proprietaryPercent}%)</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div style="width: 20px; height: 20px; background: #6c757d; border-radius: 4px;"></div>
                            <span>Unknown (${unknownPercent}%)</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div style="width: 20px; height: 20px; background: #17a2b8; border-radius: 4px;"></div>
                            <span>Unlicensed (${unlicensedPercent}%)</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Build license cards similar to license-compliance.html
        const licenseCardsHtml = `
            <div class="row g-3 mb-3">
                <div class="col-md-4">
                    <div class="card border-primary">
                        <div class="card-body text-center">
                            <h6 class="text-primary">📊 Total Licensed</h6>
                            <h4 class="text-primary">${totalLicensed}</h4>
                            <small class="text-muted">licensed dependencies</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-warning">
                        <div class="card-body text-center">
                            <h6 class="text-warning">⚠️ Copyleft</h6>
                            <h4 class="text-warning">${copyleftCount}</h4>
                            <small class="text-muted">high risk</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card border-danger">
                        <div class="card-body text-center">
                            <h6 class="text-danger">🔒 Proprietary</h6>
                            <h4 class="text-danger">${proprietary}</h4>
                            <small class="text-muted">medium risk</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card border-secondary">
                        <div class="card-body text-center">
                            <h6 class="text-secondary">❓ Unknown</h6>
                            <h4 class="text-secondary">${unknown}</h4>
                            <small class="text-muted">high risk</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card border-info">
                        <div class="card-body text-center">
                            <h6 class="text-info">🚨 Unlicensed</h6>
                            <h4 class="text-info">${unlicensed}</h4>
                            <small class="text-muted">unlicensed deps</small>
                        </div>
                    </div>
                </div>
            </div>
            <div class="text-center mt-3">
                <a href="license-compliance.html" class="btn btn-outline-primary">
                    <i class="fas fa-file-contract me-2"></i>View Detailed License Analysis
                </a>
            </div>
        `;
        
        licenseContent.innerHTML = pieChartHtml + licenseCardsHtml;
    }
    
    /**
     * Escape HTML helper
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Get funding statistics (packages and authors seeking sponsorship)
     */
    async getFundingStats(data) {
        let packagesWithFunding = 0;
        let directPackagesWithFunding = 0;
        let authorsWithFunding = 0;

        if (!window.cacheManager || !window.indexedDBManager) {
            return { packagesWithFunding: 0, directPackagesWithFunding: 0, authorsWithFunding: 0 };
        }

        try {
            // Count packages with funding
            if (data.data.allDependencies && Array.isArray(data.data.allDependencies)) {
                const uniquePackages = new Set();
                data.data.allDependencies.forEach(dep => {
                    let packageKey = null;
                    
                    if (dep.packageKey) {
                        packageKey = dep.packageKey;
                    } else if (dep.purl) {
                        const purlMatch = dep.purl.match(/pkg:([^\/]+)\/([^@\/]+)/);
                        if (purlMatch) {
                            packageKey = `${purlMatch[1]}:${purlMatch[2]}`;
                        }
                    } else if (dep.name && dep.ecosystem) {
                        packageKey = `${dep.ecosystem}:${dep.name}`;
                    } else if (dep.name && dep.category?.ecosystem) {
                        packageKey = `${dep.category.ecosystem}:${dep.name}`;
                    }

                    if (packageKey) {
                        uniquePackages.add(packageKey);
                    }
                });

                // Track which packages are direct vs transitive
                const directPackages = new Set();
                data.data.allDependencies.forEach(dep => {
                    if (dep.directIn && Array.isArray(dep.directIn) && dep.directIn.length > 0) {
                        let packageKey = null;
                        if (dep.packageKey) {
                            packageKey = dep.packageKey;
                        } else if (dep.purl) {
                            const purlMatch = dep.purl.match(/pkg:([^\/]+)\/([^@\/]+)/);
                            if (purlMatch) {
                                packageKey = `${purlMatch[1]}:${purlMatch[2]}`;
                            }
                        } else if (dep.name && dep.category?.ecosystem) {
                            packageKey = `${dep.category.ecosystem}:${dep.name}`;
                        }
                        if (packageKey) {
                            directPackages.add(packageKey);
                        }
                    }
                });

                // Check each package for funding
                const packageArray = Array.from(uniquePackages);
                const packageChecks = packageArray.map(async (packageKey) => {
                    const packageData = await window.cacheManager.getPackage(packageKey);
                    const hasFunding = packageData && packageData.funding ? 1 : 0;
                    const isDirect = directPackages.has(packageKey) ? 1 : 0;
                    return { hasFunding, isDirect };
                });

                const results = await Promise.all(packageChecks);
                packagesWithFunding = results.reduce((sum, pkg) => sum + pkg.hasFunding, 0);
                directPackagesWithFunding = results.reduce((sum, pkg) => sum + (pkg.hasFunding && pkg.isDirect ? 1 : 0), 0);
            }

            // Count authors with funding
            if (data.data.authorAnalysis && data.data.authorAnalysis.authors) {
                const authorRefs = data.data.authorAnalysis.authors;
                const uniqueAuthorKeys = new Set();

                authorRefs.forEach(ref => {
                    if (ref.authorKey) {
                        uniqueAuthorKeys.add(ref.authorKey);
                    }
                });

                const authorChecks = Array.from(uniqueAuthorKeys).map(async (authorKey) => {
                    const authorEntity = await window.cacheManager.getAuthorEntity(authorKey);
                    return authorEntity && authorEntity.funding ? 1 : 0;
                });

                const authorResults = await Promise.all(authorChecks);
                authorsWithFunding = authorResults.reduce((sum, count) => sum + count, 0);
            }

        } catch (error) {
            console.error('❌ Failed to calculate funding stats:', error);
        }

        return { packagesWithFunding, directPackagesWithFunding, authorsWithFunding };
    }

    /**
     * Display single repository results
     */
    async displaySingleRepoResults(results, repoKey) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContent = document.getElementById('resultsContent');
        
        if (!resultsSection || !resultsContent) {
            console.log('Results section elements not found on this page');
            return;
        }
        
        const stats = results.statistics;
        const licenseAnalysis = results.licenseAnalysis;
        
        let html = `
            <div class="alert alert-success">
                <h5><i class="fas fa-check-circle me-2"></i>Analysis Complete for ${repoKey}</h5>
                <p class="mb-0">Repository analysis has been completed and saved.</p>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <h3 class="text-primary">${stats.totalDependencies || 0}</h3>
                            <p class="text-muted mb-0">Total Dependencies</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <h3 class="text-success">${results.topDependencies?.length || 0}</h3>
                            <p class="text-muted mb-0">Unique Packages</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <h3 class="text-info">${results.languageStats?.length || 0}</h3>
                            <p class="text-muted mb-0">Languages Detected</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        if (licenseAnalysis) {
            html += `
                <div class="alert alert-info">
                    <h6><i class="fas fa-shield-alt me-2"></i>License Compliance</h6>
                    <p class="mb-0">
                        <strong>${licenseAnalysis.totalLicenses || 0}</strong> licenses found. 
                        <strong>${licenseAnalysis.conflicts?.length || 0}</strong> potential conflicts detected.
                    </p>
                </div>
            `;
        }
        
        html += `
            <div class="alert alert-primary">
                <h6><i class="fas fa-info-circle me-2"></i>Explore Results</h6>
                <p class="mb-2">View detailed analysis in the specialized pages:</p>
                <div class="d-flex gap-2">
                    <a href="index.html" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-chart-bar me-1"></i>Statistics
                    </a>
                    <a href="license-compliance.html" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-shield-alt me-1"></i>Licenses
                    </a>
                    <a href="vuln.html" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-bug me-1"></i>Vulnerabilities
                    </a>
                    <a href="deps.html" class="btn btn-sm btn-outline-primary">
                        <i class="fas fa-sitemap me-1"></i>Dependencies
                    </a>
                </div>
            </div>
        `;
        
        resultsContent.innerHTML = html;
        resultsSection.style.display = 'block';
        
        // Show Quick Analysis Access section
        const quickAnalysisSection = document.getElementById('quickAnalysisSection');
        if (quickAnalysisSection) {
            quickAnalysisSection.style.display = 'block';
        }
    }

    /**
     * Export current results (async)
     */
    async exportResults() {
        const currentData = await this.storageManager.loadAnalysisData();
        if (currentData) {
            const name = currentData.organization || currentData.fullName;
            const filename = `sbom-analysis-${name}-${new Date().toISOString().split('T')[0]}.json`;
            this.storageManager.exportData(currentData, filename);
        } else {
            this.showAlert('No data to export', 'warning');
        }
    }

    /**
     * Clear current data (async)
     */
    async clearData() {
        const currentData = await this.storageManager.loadAnalysisData();
        if (currentData) {
            const name = currentData.organization || currentData.fullName;
            if (confirm(`Are you sure you want to remove data for ${name}?`)) {
                await this.storageManager.removeOrganizationData(name);
                await this.displayResults(null, null); // Refresh display
                this.showAlert('Data cleared successfully', 'success');
            }
        } else {
            this.showAlert('No data to clear', 'warning');
        }
    }

    /**
     * Show storage status in UI (async)
     */
    async showStorageStatus() {
        const storageInfo = await this.storageManager.getStorageInfo();
        const storageStatusDiv = document.getElementById('storageStatus');
        
        // Check if the storage status div exists on this page
        if (!storageStatusDiv) {
            console.log('Storage status div not found on this page');
            return;
        }
        
        if (storageInfo) {
            const usagePercent = storageInfo.usagePercent;
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
                            <strong>Repositories:</strong> ${storageInfo.repositoriesCount}
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
     * Show storage status indicator in header (async)
     */
    async showStorageStatusIndicator() {
        const storageInfo = await this.storageManager.getStorageInfo();
        const indicatorDiv = document.getElementById('storageStatusIndicator');
        const statusTextDiv = document.getElementById('storageStatusText');
        
        // Check if the indicator elements exist on this page
        if (!indicatorDiv || !statusTextDiv) {
            console.log('Storage status indicator elements not found on this page');
            return;
        }
        
        if (storageInfo && storageInfo.hasData) {
            const usagePercent = storageInfo.usagePercent;
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
                    ${storageInfo.totalEntries} entries stored
                </span>
            `;
            
            indicatorDiv.style.display = 'block';
        } else {
            indicatorDiv.style.display = 'none';
        }
    }

    /**
     * Export all data (async)
     */
    async exportAllData() {
        try {
            const filename = `sbom-all-data-${new Date().toISOString().split('T')[0]}.json`;
            await this.storageManager.exportAllData(filename);
            this.showAlert('All data exported successfully', 'success');
        } catch (error) {
            console.error('Export failed:', error);
            this.showAlert('Failed to export data', 'danger');
        }
    }

    /**
     * Clear old data (keep only recent) (async)
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
                await this.displayResults(null, null); // Refresh display
                await this.showStorageStatusIndicator(); // Update header indicator
            } catch (error) {
                console.error('Clear old data failed:', error);
                this.showAlert('Failed to clear old data', 'danger');
            }
        }
    }

    /**
     * Clear all data (async)
     */
    async clearAllData() {
        if (confirm('Are you sure you want to clear ALL stored data? This action cannot be undone.')) {
            try {
                await this.storageManager.clearAllData();
                this.showAlert('All data cleared successfully', 'success');
                await this.displayResults(null, null); // Refresh display
                await this.showStorageStatusIndicator(); // Update header indicator
            } catch (error) {
                console.error('Clear all data failed:', error);
                this.showAlert('Failed to clear all data', 'danger');
            }
        }
    }

    /**
     * Finish analysis and reset UI
     */
    finishAnalysis() {
        this.isAnalyzing = false;
        
        const analyzeBtn = document.getElementById('analyzeBtn');
        const progressSection = document.getElementById('progressSection');
        
        if (analyzeBtn) analyzeBtn.disabled = false;
        if (progressSection) progressSection.style.display = 'none';
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

    /**
     * Analyze authors for all dependencies
     */
    async analyzeAuthors(identifier) {
        if (!window.AuthorService) {
            console.warn('AuthorService not loaded, skipping author analysis');
            return;
        }
        
        const authorService = new window.AuthorService();
        const data = await this.storageManager.loadAnalysisDataForOrganization(identifier);
        
        if (!data || !data.data || !data.data.allDependencies) {
            console.warn('No dependency data found for author analysis');
            return;
        }
        
        // Extract unique packages with ecosystem info
        console.log('🔍 Extracting PURLs from dependencies...');
        console.log(`Total allDependencies: ${data.data.allDependencies.length}`);
        
        // Debug: Show first few dependencies
        if (data.data.allDependencies.length > 0) {
            console.log('Sample dependency structure:', data.data.allDependencies[0]);
        }
        
        // Build packages array with repository information and deduplicate by name+ecosystem
        const packageMap = new Map(); // Key: ecosystem:name, Value: {package info with merged repositories}
        
        data.data.allDependencies
            .filter(dep => dep.purl)  // Only include dependencies with PURL
            .forEach(dep => {
                const ecosystem = this.getEcosystemFromPurl(dep.purl);
                const name = this.getPackageNameFromPurl(dep.purl);
                
                if (!ecosystem || !name) return;
                
                const key = `${ecosystem}:${name}`;
                const repositories = dep.repositories || [];
                
                if (packageMap.has(key)) {
                    // Merge repositories from this occurrence
                    const existing = packageMap.get(key);
                    const existingRepos = new Set(existing.repositories || []);
                    repositories.forEach(repo => existingRepos.add(repo));
                    existing.repositories = Array.from(existingRepos);
                } else {
                    // First occurrence of this package
                    packageMap.set(key, {
                        ecosystem: ecosystem,
                        name: name,
                        purl: dep.purl,  // Keep first PURL encountered
                        repositories: Array.from(new Set(repositories))  // Deduplicate repos
                    });
                }
            });
        
        const packages = Array.from(packageMap.values());
        
        console.log(`📦 Found ${packages.length} unique packages with valid PURLs for author analysis`);
        
        // Debug: Show some sample packages with repo info
        if (packages.length > 0) {
            console.log('Sample packages for author analysis:');
            packages.slice(0, 3).forEach(pkg => {
                console.log(`  - ${pkg.ecosystem}:${pkg.name} (used in ${pkg.repositories.length} repos)`);
            });
        }
        
        // Fetch authors with progress callback (includes repository tracking)
        const authorResults = await authorService.fetchAuthorsForPackages(
            packages,
            (processed, total) => {
                this.updateProgress(96 + (processed / total * 2), `Fetching authors: ${processed}/${total}`);
            }
        );
        
        // Convert Map to array and sort by repository count (risk factor) then package count
        // Higher repository count = higher risk (single point of failure across multiple projects)
        const authorsList = Array.from(authorResults.values())
            .sort((a, b) => {
                // Primary sort: repository count (descending) - identifies single points of failure
                if (b.repositoryCount !== a.repositoryCount) {
                    return b.repositoryCount - a.repositoryCount;
                }
                // Secondary sort: package count (descending)
                const aPackageCount = [...new Set(a.packages)].length;
                const bPackageCount = [...new Set(b.packages)].length;
                if (bPackageCount !== aPackageCount) {
                    return bPackageCount - aPackageCount;
                }
                // Tertiary sort: total occurrences (descending)
                return b.count - a.count;
            });
        
        // Store only references (author keys) instead of full author data
        // Full author details will be looked up from cache when displaying
        const authorReferences = authorsList.map(author => {
            // Determine authorKey
            let authorKey;
            if (author.author.includes(':')) {
                authorKey = author.author;  // Already prefixed
            } else {
                authorKey = `${author.ecosystem}:${author.author}`;
            }
            
            return {
                authorKey: authorKey,
                ecosystem: author.ecosystem,
                packages: [...new Set(author.packages)],  // Unique package names only
                packageRepositories: author.packageRepositories,  // Keep this for display
                repositories: author.repositories,  // Array of repository keys
                repositoryCount: author.repositoryCount,
                count: author.count  // Total occurrences
            };
        });
        
        // Save to analysis data (STORES ONLY REFERENCES, NOT FULL AUTHOR DATA)
        data.data.authorAnalysis = {
            timestamp: Date.now(),
            totalAuthors: authorReferences.length,
            totalPackages: packages.length,
            authors: authorReferences,  // References only
            _cacheVersion: 3  // Mark as using new cache architecture
        };
        
        await this.storageManager.saveAnalysisData(identifier, data.data);
        console.log(`✅ Saved ${authorsList.length} unique authors for ${identifier}`);
    }

    /**
     * Extract ecosystem from PURL
     */
    getEcosystemFromPurl(purl) {
        if (!purl) return null;
        const match = purl.match(/^pkg:([^/]+)/);
        return match ? match[1] : null;
    }

    /**
     * Extract package name from PURL
     */
    getPackageNameFromPurl(purl) {
        if (!purl) return null;
        const match = purl.match(/^pkg:[^/]+\/([^@?]+)/);
        return match ? match[1] : null;
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