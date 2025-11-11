/**
 * SBOM Play - Main Application
 */
class SBOMPlayApp {
    constructor() {
        this.githubClient = new GitHubClient();
        this.sbomProcessor = new SBOMProcessor();
        this.storageManager = window.storageManager || new StorageManager();
        this.isAnalyzing = false;
        this.rateLimitTimer = null;
        this.initialized = false;
        this.analysisStartTime = null;
        this.analysisEndTime = null;
        this.elapsedTimeInterval = null;
        
        // Time-based progress tracking
        this.progressTracker = {
            phases: [],
            currentPhase: null,
            phaseStartTime: null,
            totalEstimatedTime: 0, // milliseconds
            phaseWeights: {
                'initialization': 0.02,      // 2%
                'fetching-repo': 0.05,      // 5%
                'fetching-sbom': 0.10,      // 10%
                'processing-sbom': 0.08,    // 8%
                'resolving-trees': 0.50,    // 50% (often takes longest)
                'generating-results': 0.05, // 5%
                'license-analysis': 0.05,   // 5%
                'saving-initial': 0.02,      // 2%
                'vulnerability-analysis': 0.08, // 8%
                'author-analysis': 0.04,    // 4%
                'github-actions-analysis': 0.05, // 5%
                'saving-final': 0.01         // 1%
            },
            phaseTimes: {} // Track actual time spent per phase
        };
        
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
                const resultsSection = document.getElementById('resultsSection');
                resultsSection.classList.remove('d-none');
                resultsSection.classList.add('d-block');
                // Also display stats dashboard on page load
                await this.displayStatsDashboard();
            }
            
            // Show Quick Analysis Access section if there are stored entries
            if (storageInfo.totalEntries > 0 && document.getElementById('quickAnalysisSection')) {
                const quickSection = document.getElementById('quickAnalysisSection');
                quickSection.classList.remove('d-none');
                quickSection.classList.add('d-block');
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
                    <p><strong>Organization:</strong> ${this.escapeHtml(rateLimitState.organization)}</p>
                    <p><strong>Reset Time:</strong> ${this.escapeHtml(resetDate.toLocaleTimeString())}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Time Remaining:</strong> <span id="resumeCountdown">${this.escapeHtml(this.formatTime(remainingWait))}</span></p>
                    <p><strong>Status:</strong> <span class="badge bg-warning">Waiting for Rate Limit Reset</span></p>
                </div>
            </div>
        `;
        
        resumeSection.classList.remove('d-none');
        resumeSection.classList.add('d-block');
        
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
                const resumeSection = document.getElementById('resumeSection');
                resumeSection.classList.add('d-none');
                resumeSection.classList.remove('d-block');
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
            const resumeSection = document.getElementById('resumeSection');
            resumeSection.classList.add('d-none');
            resumeSection.classList.remove('d-block');
            
            // Start analysis
            this.startAnalysis();
        }
    }

    /**
     * Clear rate limit state
     */
    clearRateLimitState() {
        this.githubClient.clearRateLimitState();
        const resumeSection = document.getElementById('resumeSection');
        if (resumeSection) {
            resumeSection.classList.add('d-none');
            resumeSection.classList.remove('d-block');
        }
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
        
        progressSection.classList.remove('d-none');
        progressSection.classList.add('d-block');
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
        if (progressSection) {
            progressSection.classList.remove('d-none');
            progressSection.classList.add('d-block');
        }
        if (resultsSection) {
            resultsSection.classList.add('d-none');
            resultsSection.classList.remove('d-block');
        }
        
        // Reset progress tracker
        this.progressTracker.phaseTimes = {};
        this.progressTracker.currentPhase = null;
        this.progressTracker.phaseStartTime = null;
        
        // Hide estimated time element initially
        this.updateProgress(0, 'Initializing repository analysis...', 'initialization');
        this.startTiming();

        try {
            // Get rate limit info
            const rateLimitInfo = await this.githubClient.getRateLimitInfo();
            this.updateRateLimitInfo(rateLimitInfo);

            // Fetch repository metadata
            this.updateProgress(10, `Fetching repository ${repoKey}...`, 'fetching-repo');
            const repoData = await this.githubClient.getRepository(owner, repo);
            
            if (!repoData) {
                this.showAlert(`Repository ${repoKey} not found`, 'danger');
                this.finishAnalysis();
                return;
            }

            // Fetch SBOM
            this.updateProgress(30, 'Fetching SBOM data from GitHub...', 'fetching-sbom');
            const sbomData = await this.githubClient.fetchSBOM(owner, repo);
            
            if (!sbomData) {
                this.showAlert(`No SBOM data available for ${repoKey}. Ensure Dependency Graph is enabled.`, 'warning');
                this.finishAnalysis();
                return;
            }

            // Process SBOM
            this.updateProgress(50, 'Processing SBOM data and extracting dependencies...', 'processing-sbom');
            this.sbomProcessor.setTotalRepositories(1);
            // Extract repository license from GitHub API response
            const repositoryLicense = repoData.license?.spdx_id || repoData.license?.key || null;
            const success = this.sbomProcessor.processSBOM(owner, repo, sbomData, repositoryLicense);
            
            if (!success) {
                this.showAlert(`Failed to process SBOM data for ${repoKey}`, 'danger');
                this.finishAnalysis();
                return;
            }

            // Resolve full dependency trees with API queries
            this.updateProgress(75, 'Resolving full dependency trees...', 'resolving-trees');
            try {
                console.log('🌲 Resolving full dependency trees with registry APIs...');
                await this.sbomProcessor.resolveFullDependencyTrees((progress) => {
                    if (progress.phase === 'resolving-tree') {
                        const subProgressPercent = (progress.processed / progress.total) * 100;
                        this.updateProgress(75, 
                            `Resolving ${progress.ecosystem} dependencies...`, 
                            'resolving-trees',
                            {
                                processed: progress.processed,
                                total: progress.total,
                                ecosystem: progress.ecosystem,
                                packageName: progress.packageName
                            });
                    }
                });
                console.log('✅ Dependency tree resolution complete');
            } catch (error) {
                console.error('❌ Dependency tree resolution failed:', error);
                console.log('⚠️ Continuing with partial dependency information...');
            }
            
            // Generate results (use let so we can reload after author analysis)
            this.updateProgress(80, 'Generating analysis results...', 'generating-results');
            let results = this.sbomProcessor.exportData();
            
            // Run license compliance analysis
            const repoStats = this.sbomProcessor.repositories.get(repoKey);
            if (repoStats && repoStats.totalDependencies > 0) {
                this.updateProgress(85, 'Analyzing license compliance and conflicts...', 'license-analysis');
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
            this.updateProgress(87, 'Saving initial results to storage...', 'saving-initial');
            let saveSuccess = await this.storageManager.saveAnalysisData(repoKey, results);
            if (!saveSuccess) {
                console.warn('⚠️ Failed to save initial analysis data to storage');
            }
            
            // Run vulnerability and author analysis (these need data in storage)
            if (repoStats && repoStats.totalDependencies > 0) {
                // Run vulnerability analysis
                this.updateProgress(90, 'Analyzing vulnerabilities using OSV.dev...', 'vulnerability-analysis');
                try {
                    console.log('🔍 Starting vulnerability analysis...');
                    // Pass progress callback to show real-time updates
                    await this.sbomProcessor.analyzeVulnerabilitiesWithIncrementalSaving(repoKey, (percent, message) => {
                        // Use sub-progress for vulnerability analysis
                        this.updateProgress(90, message, 'vulnerability-analysis', percent);
                    });
                    console.log('✅ Vulnerability analysis complete');
                } catch (error) {
                    console.error('❌ Vulnerability analysis failed:', error);
                }
                
                // Run author analysis
                this.updateProgress(93, 'Fetching package author information...', 'author-analysis');
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

                // Run GitHub Actions analysis
                this.updateProgress(94, 'Analyzing GitHub Actions workflows...', 'github-actions-analysis');
                try {
                    console.log('⚙️ Analyzing GitHub Actions...');
                    const authorService = window.authorService || new AuthorService();
                    await this.sbomProcessor.analyzeGitHubActions(this.githubClient, authorService, (progress) => {
                        if (progress.message) {
                            this.updateProgress(94, progress.message, 'github-actions-analysis');
                        }
                    });
                    console.log('✅ GitHub Actions analysis complete');
                    
                    // Update results with GitHub Actions analysis
                    const exportData = this.sbomProcessor.exportData();
                    if (exportData) {
                        results = exportData;
                        // Save updated results
                        await this.storageManager.saveAnalysisData(repoKey, results);
                        console.log('✅ Saved data with GitHub Actions analysis');
                    }
                } catch (error) {
                    console.error('❌ GitHub Actions analysis failed:', error);
                }
            }
            
            // Log summary
            console.log(`📊 Single Repository Analysis Summary for ${repoKey}:`);
            console.log(`   Total dependencies: ${results.statistics.totalDependencies}`);
            
            // Fetch licenses for PyPI packages and version drift data in background
            // These are non-blocking and will save to IndexedDB for future use
            if (repoStats && repoStats.totalDependencies > 0 && results.allDependencies) {
                this.updateProgress(96, 'Fetching package licenses and version drift data...', 'fetching-metadata');
                try {
                    // Fetch licenses for PyPI packages missing license info
                    await this.fetchPyPILicenses(results.allDependencies, repoKey);
                    
                    // Fetch version drift for all packages (already saves to cache/IndexedDB)
                    await this.fetchVersionDriftData(results.allDependencies);
                    
                    console.log('✅ License and version drift fetching complete');
                } catch (error) {
                    console.error('❌ License/version drift fetching failed:', error);
                    // Don't fail the entire analysis if this fails
                }
            }
            
            // Final save to storage (to include vulnerability, author, license, and version drift data)
            this.updateProgress(97, 'Saving final results to storage...', 'saving-final');
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
            this.stopTiming();
            this.showAlert(`Analysis complete for ${repoKey}!`, 'success');
            
        } catch (error) {
            console.error('Single repository analysis failed:', error);
            this.stopTiming();
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
        if (progressSection) {
            progressSection.classList.remove('d-none');
            progressSection.classList.add('d-block');
        }
        if (resultsSection) {
            resultsSection.classList.add('d-none');
            resultsSection.classList.remove('d-block');
        }
        
        // Reset progress tracker
        this.progressTracker.phaseTimes = {};
        this.progressTracker.currentPhase = null;
        this.progressTracker.phaseStartTime = null;
        
        this.updateProgress(0, 'Initializing analysis...', 'initialization');
        this.startTiming();

        try {
            // Get rate limit info
            const rateLimitInfo = await this.githubClient.getRateLimitInfo();
            this.updateRateLimitInfo(rateLimitInfo);

            // Fetch repositories
            this.updateProgress(10, 'Fetching repositories from GitHub...', 'fetching-repo');
            const repositories = await this.githubClient.getRepositories(ownerName);
            
            if (repositories.length === 0) {
                this.showAlert('No public repositories found for this organization or user', 'info');
                this.finishAnalysis();
                return;
            }

            this.sbomProcessor.setTotalRepositories(repositories.length);
            this.updateProgress(20, `Found ${repositories.length} repositories. Starting SBOM analysis...`, 'fetching-sbom');

            // Process repositories in parallel with concurrency limit
            const CONCURRENCY_LIMIT = 8; // Process 8 repositories concurrently
            let successfulRepos = 0;
            let failedRepos = 0;
            let reposWithDeps = 0;
            let processedCount = 0;
            
            // Helper function to process a single repository
            const processRepository = async (repo, index) => {
                const owner = repo.owner.login;
                const name = repo.name;
                let result = { success: false, hasDeps: false };
                
                try {
                    const sbomData = await this.githubClient.fetchSBOM(owner, name);
                    
                    if (sbomData) {
                        // Extract repository license from GitHub API response
                        const repositoryLicense = repo.license?.spdx_id || repo.license?.key || null;
                        // Extract archived status from GitHub API response
                        const archived = repo.archived || false;
                        const success = this.sbomProcessor.processSBOM(owner, name, sbomData, repositoryLicense, archived);
                        this.sbomProcessor.updateProgress(success);
                        if (success) {
                            result.success = true;
                            const repoData = this.sbomProcessor.repositories.get(`${owner}/${name}`);
                            if (repoData && repoData.totalDependencies > 0) {
                                result.hasDeps = true;
                            }
                        }
                    } else {
                        this.sbomProcessor.updateProgress(false);
                    }
                } catch (error) {
                    console.error(`Error processing ${owner}/${name}:`, error);
                    this.sbomProcessor.updateProgress(false);
                }
                
                return result;
            };
            
            // Process repositories in batches with concurrency limit
            for (let i = 0; i < repositories.length; i += CONCURRENCY_LIMIT) {
                const batch = repositories.slice(i, i + CONCURRENCY_LIMIT);
                const batchPromises = batch.map((repo) => processRepository(repo, i));
                
                // Wait for all repositories in this batch to complete
                const results = await Promise.allSettled(batchPromises);
                
                // Update counters from results (thread-safe)
                results.forEach((result, batchIndex) => {
                    if (result.status === 'fulfilled') {
                        if (result.value.success) {
                            successfulRepos++;
                            if (result.value.hasDeps) {
                                reposWithDeps++;
                            }
                        } else {
                            failedRepos++;
                        }
                    } else {
                        failedRepos++;
                    }
                    processedCount++;
                });
                
                // Update progress with sub-progress info
                const progress = 20 + (processedCount / repositories.length) * 50;
                this.updateProgress(progress, 
                    `Analyzing repositories...`, 
                    'fetching-sbom',
                    {
                        processed: processedCount,
                        total: repositories.length
                    });
                
                // Save incrementally every 10 repositories or at the end
                if (processedCount % 10 === 0 || processedCount === repositories.length) {
                    console.log(`💾 Saving incremental data (${processedCount}/${repositories.length} repositories processed)`);
                    
                    const partialData = this.sbomProcessor.exportPartialData();
                    const isComplete = (processedCount === repositories.length);
                    
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
            }

            // Process SBOM phase
            this.updateProgress(70, 'Processing SBOM data and extracting dependencies...', 'processing-sbom');
            
            // Resolve full dependency trees with API queries
            this.updateProgress(75, 'Resolving full dependency trees...', 'resolving-trees');
            try {
                console.log('🌲 Resolving full dependency trees with registry APIs...');
                await this.sbomProcessor.resolveFullDependencyTrees((progress) => {
                    if (progress.phase === 'resolving-tree') {
                        // Use sub-progress for detailed status
                        this.updateProgress(75, 
                            `Resolving ${progress.ecosystem} dependencies...`, 
                            'resolving-trees',
                            {
                                processed: progress.processed || (progress.packageProgress?.processed || 0),
                                total: progress.total || (progress.packageProgress?.total || 1),
                                ecosystem: progress.ecosystem,
                                packageName: progress.packageProgress?.packageName
                            });
                    }
                });
                console.log('✅ Dependency tree resolution complete');
            } catch (error) {
                console.error('❌ Dependency tree resolution failed:', error);
                console.log('⚠️ Continuing with partial dependency information...');
            }
            
            // Generate results (use let so we can reload after author analysis)
            this.updateProgress(80, 'Generating analysis results...', 'generating-results');
            let results = this.sbomProcessor.exportData();

            // Run license compliance analysis
            if (reposWithDeps > 0) {
                this.updateProgress(85, 'Analyzing license compliance and conflicts...', 'license-analysis');
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
            this.updateProgress(87, 'Saving initial results to storage...', 'saving-initial');
            let saveSuccess = await this.storageManager.saveAnalysisData(ownerName, results);
            if (!saveSuccess) {
                console.warn('⚠️ Failed to save initial analysis data to storage');
            } else {
                await this.showStorageStatusIndicator();
            }
            
            // Run vulnerability and author analysis (these need data in storage)
            if (reposWithDeps > 0) {
                // Run vulnerability analysis
                this.updateProgress(90, 'Analyzing vulnerabilities using OSV.dev...', 'vulnerability-analysis');
                try {
                    console.log('🔍 Starting vulnerability analysis...');
                    // Pass progress callback to show real-time updates
                    await this.sbomProcessor.analyzeVulnerabilitiesWithIncrementalSaving(ownerName, (percent, message) => {
                        // Use sub-progress for vulnerability analysis
                        this.updateProgress(90, message, 'vulnerability-analysis', percent);
                    });
                    console.log('✅ Vulnerability analysis complete');
                } catch (error) {
                    console.error('❌ Vulnerability analysis failed:', error);
                }
                
                // Run author analysis
                this.updateProgress(93, 'Fetching package author information...', 'author-analysis');
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

                // Run GitHub Actions analysis
                this.updateProgress(94, 'Analyzing GitHub Actions workflows...', 'github-actions-analysis');
                try {
                    console.log('⚙️ Analyzing GitHub Actions...');
                    const authorService = window.authorService || new AuthorService();
                    await this.sbomProcessor.analyzeGitHubActions(this.githubClient, authorService, (progress) => {
                        if (progress.message) {
                            this.updateProgress(94, progress.message, 'github-actions-analysis');
                        }
                    });
                    console.log('✅ GitHub Actions analysis complete');
                    
                    // Update results with GitHub Actions analysis
                    const exportData = this.sbomProcessor.exportData();
                    if (exportData) {
                        results = exportData;
                        // Save updated results
                        await this.storageManager.saveAnalysisData(ownerName, results);
                        console.log('✅ Saved data with GitHub Actions analysis');
                    }
                } catch (error) {
                    console.error('❌ GitHub Actions analysis failed:', error);
                }
            }
            
            // Fetch licenses for PyPI packages and version drift data in background
            // These are non-blocking and will save to IndexedDB for future use
            if (reposWithDeps > 0 && results.allDependencies) {
                this.updateProgress(96, 'Fetching package licenses and version drift data...', 'fetching-metadata');
                try {
                    // Fetch licenses for PyPI packages missing license info
                    await this.fetchPyPILicenses(results.allDependencies, ownerName);
                    
                    // Fetch version drift for all packages (already saves to cache/IndexedDB)
                    await this.fetchVersionDriftData(results.allDependencies);
                    
                    console.log('✅ License and version drift fetching complete');
                } catch (error) {
                    console.error('❌ License/version drift fetching failed:', error);
                    // Don't fail the entire analysis if this fails
                }
            }
            
            // Final save to storage (to include vulnerability, author, license, and version drift data)
            this.updateProgress(97, 'Saving final results to storage...', 'saving-final');
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
            this.stopTiming();
            
        } catch (error) {
            console.error('Analysis failed:', error);
            this.stopTiming();
            this.showAlert(`Analysis failed: ${error.message}`, 'danger');
        } finally {
            this.finishAnalysis();
        }
    }

    /**
     * Start a new progress phase
     */
    startPhase(phaseName, estimatedDurationMs = null) {
        // End previous phase if exists
        if (this.progressTracker.currentPhase && this.progressTracker.phaseStartTime) {
            const phaseDuration = Date.now() - this.progressTracker.phaseStartTime;
            this.progressTracker.phaseTimes[this.progressTracker.currentPhase] = 
                (this.progressTracker.phaseTimes[this.progressTracker.currentPhase] || 0) + phaseDuration;
        }
        
        // Start new phase
        this.progressTracker.currentPhase = phaseName;
        this.progressTracker.phaseStartTime = Date.now();
        
        if (estimatedDurationMs) {
            this.progressTracker.totalEstimatedTime = estimatedDurationMs;
        }
    }
    
    /**
     * Update progress display with time-based calculation
     */
    updateProgress(percentage, message, phaseName = null, subProgress = null) {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        
        // If phase name provided, track it
        if (phaseName && phaseName !== this.progressTracker.currentPhase) {
            this.startPhase(phaseName);
        }
        
        // Calculate time-based progress if we have phase information
        let calculatedPercentage = percentage;
        let enhancedMessage = message;
        
        if (this.progressTracker.currentPhase && this.analysisStartTime) {
            const elapsed = Date.now() - this.analysisStartTime;
            const phaseWeight = this.progressTracker.phaseWeights[this.progressTracker.currentPhase] || 0;
            
            // Calculate progress based on completed phases + current phase progress
            let completedProgress = 0;
            let currentPhaseProgress = 0;
            
            // Sum up completed phases
            Object.keys(this.progressTracker.phaseWeights).forEach(phase => {
                if (this.progressTracker.phaseTimes[phase] && phase !== this.progressTracker.currentPhase) {
                    completedProgress += this.progressTracker.phaseWeights[phase] * 100;
                }
            });
            
            // Calculate current phase progress
            if (phaseWeight > 0 && subProgress !== null) {
                if (typeof subProgress === 'object') {
                    // Sub-progress object with details (processed/total)
                    const { processed, total } = subProgress;
                    if (typeof processed === 'number' && typeof total === 'number' && total > 0) {
                        const subProgressPercent = (processed / total) * 100;
                        currentPhaseProgress = phaseWeight * 100 * (subProgressPercent / 100);
                    } else {
                        // Fall back to provided percentage if sub-progress is invalid
                        currentPhaseProgress = phaseWeight * 100 * (percentage / 100);
                    }
                } else if (typeof subProgress === 'number') {
                    // Numeric sub-progress (0-100)
                    currentPhaseProgress = phaseWeight * 100 * (subProgress / 100);
                } else {
                    // Fall back to provided percentage
                    currentPhaseProgress = phaseWeight * 100 * (percentage / 100);
                }
            } else if (phaseWeight > 0) {
                // Estimate based on time spent vs expected time
                const phaseElapsed = Date.now() - this.progressTracker.phaseStartTime;
                const avgPhaseTime = this.progressTracker.phaseTimes[this.progressTracker.currentPhase] || 0;
                
                // If we have historical data, use it; otherwise use percentage directly
                if (avgPhaseTime > 0 && phaseElapsed < avgPhaseTime * 2) {
                    // Use time-based estimate, but cap at reasonable bounds
                    const timeBasedProgress = Math.min(95, (phaseElapsed / avgPhaseTime) * 100);
                    currentPhaseProgress = phaseWeight * 100 * (timeBasedProgress / 100);
                } else {
                    // Fall back to provided percentage
                    currentPhaseProgress = phaseWeight * 100 * (percentage / 100);
                }
            }
            
            calculatedPercentage = Math.min(99, completedProgress + currentPhaseProgress);
            
            // Enhance message with time info
            if (subProgress !== null && typeof subProgress === 'object') {
                // Sub-progress object with details
                const { processed, total, ecosystem, packageName } = subProgress;
                if (ecosystem && processed !== undefined && total !== undefined) {
                    enhancedMessage = `Resolving ${ecosystem} dependencies (${processed}/${total} packages)${packageName ? `: ${packageName}` : '...'}`;
                } else if (processed !== undefined && total !== undefined) {
                    enhancedMessage = `${message} (${processed}/${total})`;
                }
            }
        }
        
        if (progressBar) {
            progressBar.style.setProperty('--progress-width', `${calculatedPercentage}%`);
            progressBar.classList.add('progress-bar-dynamic');
            progressBar.classList.remove('progress-bar-initial');
            progressBar.textContent = `${Math.round(calculatedPercentage)}%`;
        }
        
        if (progressText) {
            progressText.textContent = enhancedMessage;
        }
        
        // Log progress for pages without UI elements
        if (!progressBar && !progressText) {
            console.log(`Progress: ${Math.round(calculatedPercentage)}% - ${enhancedMessage}`);
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
                                        // escapeHtml is provided by utils.js
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
        resultsSection.classList.remove('d-none');
        resultsSection.classList.add('d-block');
        
        // Show/hide Quick Analysis Access section based on stored entries
        const quickAnalysisSection = document.getElementById('quickAnalysisSection');
        if (quickAnalysisSection) {
            if (allEntries.length > 0) {
                quickAnalysisSection.classList.remove('d-none');
                quickAnalysisSection.classList.add('d-block');
            } else {
                quickAnalysisSection.classList.add('d-none');
                quickAnalysisSection.classList.remove('d-block');
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
        
        // Check if stats elements exist on this page
        if (!statsOverview) {
            return; // Stats sections don't exist on this page
        }
        
        // Load combined data
        const combinedData = await this.storageManager.getCombinedData();
        
        if (!combinedData) {
            statsOverview.classList.add('d-none');
            statsOverview.classList.remove('d-block');
            statsQuality.classList.add('d-none');
            statsQuality.classList.remove('d-block');
            return;
        }
        
        // Show stats sections
        statsOverview.classList.remove('d-none');
        statsOverview.classList.add('d-block');
        
        // Display overview
        await this.displayStatsOverview(combinedData);
        
        // Display quality dashboard
        this.displayStatsQuality(combinedData);
        
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
                    <a href="licenses.html" class="btn btn-outline-primary btn-sm me-2">
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
                        <a href="authors.html?funding=true" class="text-decoration-none text-primary">
                            <h4 class="text-primary">
                                <i class="fas fa-users me-2"></i>${fundingStats.authorsWithFunding}
                            </h4>
                            <small class="text-muted">Package Authors</small>
                            <p class="text-muted small mb-0 mt-1">
                                <i class="fas fa-info-circle me-1"></i>
                                ${fundingStats.authorsWithFunding > 0 
                                    ? 'Maintainers accepting personal sponsorships' 
                                    : 'No authors with funding found'}
                            </p>
                        </a>
                    </div>
                </div>
            </div>
            ` : ''}
            
            <!-- Top Ecosystems Section -->
            <div class="mt-4 pt-3 border-top">
                <div class="mb-3">
                    <h6><i class="fas fa-layer-group me-2"></i>Top 5 Ecosystems</h6>
                </div>
                <div class="d-flex justify-content-between align-items-start">
                    ${this.renderTopEcosystemsWithDeps(data)}
                </div>
            </div>
            
            <!-- Issues Section -->
            <div class="row mt-4 pt-3 border-top">
                <div class="col-12 mb-3">
                    <h6><i class="fas fa-exclamation-triangle me-2"></i>Issues by Severity</h6>
                </div>
                ${this.renderVulnerabilityCounts(data)}
            </div>
        `;
        
        content.innerHTML = html;
    }
    
    /**
     * Get dependency count per ecosystem (including both direct and transitive dependencies)
     */
    getEcosystemDependencyCounts(data) {
        if (!data.data.allDependencies) {
            return {};
        }
        
        const ecosystemDeps = {};
        
        // Iterate through all dependencies (includes both direct and transitive)
        // Count each dependency occurrence weighted by how many repositories use it
        data.data.allDependencies.forEach(dep => {
            // Get ecosystem from category.ecosystem or extract from PURL
            let ecosystem = dep.category?.ecosystem;
            
            if (!ecosystem && dep.purl) {
                // Extract from PURL: pkg:ecosystem/name@version
                const purlMatch = dep.purl.match(/pkg:([^\/]+)\//);
                if (purlMatch) {
                    ecosystem = purlMatch[1];
                }
            }
            
            if (!ecosystem) {
                ecosystem = 'unknown';
            }
            
            // Normalize ecosystem name (capitalize first letter)
            ecosystem = ecosystem.charAt(0).toUpperCase() + ecosystem.slice(1).toLowerCase();
            
            if (!ecosystemDeps[ecosystem]) {
                ecosystemDeps[ecosystem] = 0;
            }
            // Count occurrences: dep.count represents the number of repositories 
            // using this dependency (whether direct or transitive)
            // This ensures transitive dependencies are included in the count
            ecosystemDeps[ecosystem] += dep.count || 1;
        });
        
        return ecosystemDeps;
    }
    
    /**
     * Get ecosystem icon
     */
    getEcosystemIcon(ecosystem) {
        const iconMap = {
            'Npm': 'fab fa-npm',
            'Pypi': 'fab fa-python',
            'Maven': 'fab fa-java',
            'Go': 'fab fa-golang',
            'Cargo': 'fas fa-code',
            'Nuget': 'fab fa-microsoft',
            'Packagist': 'fab fa-php',
            'Rubygems': 'fas fa-gem',
            'Docker': 'fab fa-docker',
            'Githubactions': 'fab fa-github',
            'Terraform': 'fas fa-cloud',
            'Helm': 'fas fa-ship',
            'Unknown': 'fas fa-cube'
        };
        
        return iconMap[ecosystem] || 'fas fa-cube';
    }
    
    /**
     * Render top ecosystems with dependency counts
     */
    renderTopEcosystemsWithDeps(data) {
        const ecosystemDeps = this.getEcosystemDependencyCounts(data);
        
        if (Object.keys(ecosystemDeps).length === 0) {
            return '<div class="col-12"><p class="text-muted small">No ecosystem data available</p></div>';
        }
        
        const topEcosystems = Object.entries(ecosystemDeps)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([eco, count]) => ({ ecosystem: eco, depCount: count }));
        
        return topEcosystems.map(eco => {
            // Create link to deps.html with ecosystem filter
            const ecosystemLower = eco.ecosystem.toLowerCase();
            const depsLink = `deps.html?ecosystem=${encodeURIComponent(ecosystemLower)}`;
            
            return `
                <div style="flex: 1 1 0; min-width: 0; max-width: 20%;" class="me-2">
                    <a href="${depsLink}" class="text-decoration-none text-reset">
                        <div class="text-center p-3 border rounded h-100 hover-shadow" style="transition: all 0.2s; cursor: pointer;">
                            <i class="${this.getEcosystemIcon(eco.ecosystem)} fa-3x mb-2 text-primary"></i>
                            <div class="fw-bold small">${this.escapeHtml(eco.ecosystem)}</div>
                            <div class="text-muted small">${eco.depCount} dependencies</div>
                        </div>
                    </a>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Render vulnerability counts by severity
     */
    renderVulnerabilityCounts(data) {
        const vulnAnalysis = data.data.vulnerabilityAnalysis || {};
        
        const counts = {
            critical: vulnAnalysis.criticalVulnerabilities || 0,
            high: vulnAnalysis.highVulnerabilities || 0,
            medium: vulnAnalysis.mediumVulnerabilities || 0,
            low: vulnAnalysis.lowVulnerabilities || 0
        };
        
        const total = counts.critical + counts.high + counts.medium + counts.low;
        
        if (total === 0) {
            return '<div class="col-12"><p class="text-muted small">No vulnerability data available</p></div>';
        }
        
        return `
            <div class="col-md-3">
                <a href="vuln.html?severity=critical" class="text-decoration-none text-reset">
                    <div class="text-center p-3 border rounded hover-shadow" style="background-color: rgba(220, 53, 69, 0.1); transition: all 0.2s; cursor: pointer;">
                        <h4 class="mb-1" style="color: #dc3545;">${counts.critical}</h4>
                        <small style="color: var(--text-secondary, #6c757d);">Critical</small>
                    </div>
                </a>
            </div>
            <div class="col-md-3">
                <a href="vuln.html?severity=high" class="text-decoration-none text-reset">
                    <div class="text-center p-3 border rounded hover-shadow" style="background-color: rgba(255, 193, 7, 0.1); transition: all 0.2s; cursor: pointer;">
                        <h4 class="mb-1" style="color: #ffc107;">${counts.high}</h4>
                        <small style="color: var(--text-secondary, #6c757d);">High</small>
                    </div>
                </a>
            </div>
            <div class="col-md-3">
                <a href="vuln.html?severity=medium" class="text-decoration-none text-reset">
                    <div class="text-center p-3 border rounded hover-shadow" style="background-color: rgba(13, 202, 240, 0.1); transition: all 0.2s; cursor: pointer;">
                        <h4 class="mb-1" style="color: #0dcaf0;">${counts.medium}</h4>
                        <small style="color: var(--text-secondary, #6c757d);">Medium</small>
                    </div>
                </a>
            </div>
            <div class="col-md-3">
                <a href="vuln.html?severity=low" class="text-decoration-none text-reset">
                    <div class="text-center p-3 border rounded hover-shadow" style="background-color: rgba(108, 117, 125, 0.1); transition: all 0.2s; cursor: pointer;">
                        <h4 class="mb-1" style="color: #6c757d;">${counts.low}</h4>
                        <small style="color: var(--text-secondary, #6c757d);">Low</small>
                    </div>
                </a>
            </div>
        `;
    }
    
    /**
     * Render license status with graph
     */
    renderLicenseStatus(data) {
        const compliance = this.getLicenseCompliance(data);
        
        if (compliance.total === 0) {
            return '<div class="col-12"><p class="text-muted small">No license data available</p></div>';
        }
        
        const breakdown = compliance.categoryBreakdown;
        const total = compliance.total;
        
        // Calculate counts for each category
        const proprietary = breakdown.proprietary || 0;
        const copyleft = breakdown.copyleft || 0;
        const lgpl = breakdown.lgpl || 0;
        const unknown = breakdown.unknown || 0;
        const unlicensed = breakdown.unlicensed || 0;
        
        // Calculate percentages
        const proprietaryPercent = total > 0 ? ((proprietary / total) * 100).toFixed(1) : 0;
        const copyleftPercent = total > 0 ? ((copyleft / total) * 100).toFixed(1) : 0;
        const lgplPercent = total > 0 ? ((lgpl / total) * 100).toFixed(1) : 0;
        const unknownPercent = total > 0 ? ((unknown / total) * 100).toFixed(1) : 0;
        const unlicensedPercent = total > 0 ? ((unlicensed / total) * 100).toFixed(1) : 0;
        
        // Calculate cumulative percentages for conic-gradient
        let cumulative = 0;
        const proprietaryStart = cumulative;
        cumulative += parseFloat(proprietaryPercent);
        const proprietaryEnd = cumulative;
        
        const copyleftStart = cumulative;
        cumulative += parseFloat(copyleftPercent);
        const copyleftEnd = cumulative;
        
        const lgplStart = cumulative;
        cumulative += parseFloat(lgplPercent);
        const lgplEnd = cumulative;
        
        const unknownStart = cumulative;
        cumulative += parseFloat(unknownPercent);
        const unknownEnd = cumulative;
        
        const unlicensedStart = cumulative;
        cumulative += parseFloat(unlicensedPercent);
        const unlicensedEnd = cumulative;
        
        // Color scheme
        const colors = {
            proprietary: '#dc3545',    // Red
            copyleft: '#ffc107',       // Yellow/Warning
            lgpl: '#fd7e14',           // Orange
            unknown: '#6c757d',        // Gray
            unlicensed: '#17a2b8'      // Cyan/Info
        };
        
        // escapeHtml is provided by utils.js
        
        // Helper function to generate category item HTML
        const generateCategoryItem = (category, count, percent, color, hoverBg, title, label) => {
            return `
                <a href="licenses.html?category=${category}" class="text-decoration-none text-reset license-category-link" data-category="${category}" data-category-color="${color}" data-category-hover-bg="${hoverBg}">
                    <div class="mb-3 p-2 rounded license-category-item" style="--category-color: ${color}; --category-hover-bg: ${hoverBg};">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <span class="badge me-2 license-category-badge" style="--category-color: ${color};"></span>
                                <strong>${label}</strong>
                                <i class="fas fa-info-circle ms-2 text-muted small" style="font-size: 0.8em;" title="${title}"></i>
                            </div>
                            <div>
                                <span class="h5 mb-0">${count}</span>
                                <small class="text-muted"> (${percent}%)</small>
                            </div>
                        </div>
                        <div class="progress h-8px">
                            <div class="progress-bar progress-bar-dynamic" role="progressbar" style="--progress-width: ${percent}%; background-color: ${color};"></div>
                        </div>
                    </div>
                </a>
            `;
        };
        
        return `
            <div class="col-md-6">
                <div class="text-center">
                    <div class="license-pie-chart-container">
                        <div class="license-pie-chart" style="background: conic-gradient(
                            ${proprietary > 0 ? `${colors.proprietary} ${proprietaryStart}% ${proprietaryEnd}%,` : ''}
                            ${copyleft > 0 ? `${colors.copyleft} ${copyleftStart}% ${copyleftEnd}%,` : ''}
                            ${lgpl > 0 ? `${colors.lgpl} ${lgplStart}% ${lgplEnd}%,` : ''}
                            ${unknown > 0 ? `${colors.unknown} ${unknownStart}% ${unknownEnd}%,` : ''}
                            ${unlicensed > 0 ? `${colors.unlicensed} ${unlicensedStart}% ${unlicensedEnd}%` : ''}
                        );" id="licensePieChart">
                            <div class="license-pie-chart-center">
                                <div class="h4 mb-0">${total}</div>
                                <small class="text-muted">Total</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="d-flex flex-column justify-content-center h-100">
                    ${proprietary > 0 ? generateCategoryItem('proprietary', proprietary, proprietaryPercent, colors.proprietary, 'rgba(220, 53, 69, 0.1)', 'Proprietary licenses require special attention', 'Proprietary') : ''}
                    ${copyleft > 0 ? generateCategoryItem('copyleft', copyleft, copyleftPercent, colors.copyleft, 'rgba(255, 193, 7, 0.1)', 'Copyleft licenses (GPL, AGPL, MPL, EPL) require derivative works to be open source', 'Copyleft') : ''}
                    ${lgpl > 0 ? generateCategoryItem('lgpl', lgpl, lgplPercent, colors.lgpl, 'rgba(253, 126, 20, 0.1)', 'Lesser GPL - allows linking with proprietary software', 'LGPL') : ''}
                    ${unknown > 0 ? generateCategoryItem('unknown', unknown, unknownPercent, colors.unknown, 'rgba(108, 117, 125, 0.1)', 'Unknown or unrecognized license types', 'Unknown') : ''}
                    ${unlicensed > 0 ? generateCategoryItem('unlicensed', unlicensed, unlicensedPercent, colors.unlicensed, 'rgba(23, 162, 184, 0.1)', 'Dependencies without any license information', 'Unlicensed') : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * Setup hover effects for license category items (called after renderLicenseStatus)
     */
    setupLicenseCategoryHoversFromRender() {
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
            this.setupLicenseCategoryHovers();
        }, 0);
    }
    
    /**
     * Display SBOM Quality Dashboard
     */
    displayStatsQuality(data) {
        const qualityDashboard = document.getElementById('statsQualityDashboard');
        const qualityContent = document.getElementById('statsQualityContent');
        
        if (!qualityDashboard || !qualityContent) return;
        
        if (!data.data.qualityAnalysis) {
            qualityDashboard.classList.add('d-none');
            qualityDashboard.classList.remove('d-block');
            return;
        }
        
        qualityDashboard.classList.remove('d-none');
        qualityDashboard.classList.add('d-block');
        const qa = data.data.qualityAnalysis;
        
        // Get color class for score
        const getScoreColor = (score) => {
            if (score >= 80) return 'success';
            if (score >= 60) return 'warning';
            return 'danger';
        };
        
        // Get color class for grade
        const getGradeColor = (grade) => {
            const colors = { 'A': 'success', 'B': 'primary', 'C': 'warning', 'D': 'danger', 'F': 'dark' };
            return colors[grade] || 'secondary';
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
                                <div class="progress-bar bg-${getScoreColor(qa.averageIdentification || 0)} progress-bar-dynamic" 
                                     role="progressbar" 
                                     style="--progress-width: ${qa.averageIdentification || 0}%">${qa.averageIdentification || 0}/100</div>
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
                                <div class="progress-bar bg-${getScoreColor(qa.averageProvenance || 0)} progress-bar-dynamic" 
                                     role="progressbar" 
                                     style="--progress-width: ${qa.averageProvenance || 0}%">${qa.averageProvenance || 0}/100</div>
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
                                <div class="progress-bar bg-${getScoreColor(qa.averageDependencies || 0)} progress-bar-dynamic" 
                                     role="progressbar" 
                                     style="--progress-width: ${qa.averageDependencies || 0}%">${qa.averageDependencies || 0}/100</div>
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
                                <div class="progress-bar bg-${getScoreColor(qa.averageMetadata || 0)} progress-bar-dynamic" 
                                     role="progressbar" 
                                     style="--progress-width: ${qa.averageMetadata || 0}%">${qa.averageMetadata || 0}/100</div>
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
                                <div class="progress-bar bg-${getScoreColor(qa.averageLicensing || 0)} progress-bar-dynamic" 
                                     role="progressbar" 
                                     style="--progress-width: ${qa.averageLicensing || 0}%">${qa.averageLicensing || 0}/100</div>
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
                                <div class="progress-bar bg-${getScoreColor(qa.averageVulnerability || 0)} progress-bar-dynamic" 
                                     role="progressbar" 
                                     style="--progress-width: ${qa.averageVulnerability || 0}%">${qa.averageVulnerability || 0}/100</div>
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
                        <td><span class="badge bg-${getGradeColor(repo.grade)}">${repo.grade}</span></td>
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
     * Display top common dependencies
     */
    displayTopCommonDependencies(data) {
        const section = document.getElementById('topCommonDependencies');
        const content = document.getElementById('topCommonDependenciesContent');
        
        if (!section || !content) return;
        
        const topDeps = this.getTopCommonDependencies(data);
        
        if (topDeps.length === 0) {
            section.classList.add('d-none');
            section.classList.remove('d-block');
            return;
        }
        
        section.classList.remove('d-none');
        section.classList.add('d-block');
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
            section.classList.add('d-none');
            section.classList.remove('d-block');
            return;
        }
        
        section.classList.remove('d-none');
        section.classList.add('d-block');
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
            return { 
                total: 0, 
                compliant: 0, 
                nonCompliant: 0,
                categoryBreakdown: {
                    proprietary: 0,
                    copyleft: 0,
                    lgpl: 0,
                    unknown: 0,
                    unlicensed: 0
                }
            };
        }
        
        const summary = data.data.licenseAnalysis.summary;
        const total = summary.totalDependencies || 0;
        const compliant = summary.licensedDependencies || 0;
        const breakdown = summary.categoryBreakdown || {};
        
        return {
            total,
            compliant,
            nonCompliant: total - compliant,
            categoryBreakdown: {
                proprietary: breakdown.proprietary || 0,
                copyleft: breakdown.copyleft || 0,
                lgpl: breakdown.lgpl || 0,
                unknown: breakdown.unknown || 0,
                unlicensed: summary.unlicensedDependencies || 0
            }
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
                    <a href="deps.html?search=${encodeURIComponent(depKey)}" class="btn btn-sm btn-outline-primary">
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
            licenseSection.classList.add('d-none');
            licenseSection.classList.remove('d-block');
            return;
        }
        
        licenseSection.classList.remove('d-none');
        licenseSection.classList.add('d-block');
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
            licenseSection.classList.add('d-none');
            licenseSection.classList.remove('d-block');
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
                        <div class="license-pie-chart license-pie-chart-small" style="background: conic-gradient(
                            #28a745 ${permissivePercent}%,
                            #ffc107 ${parseFloat(permissivePercent)}% ${parseFloat(permissivePercent) + parseFloat(copyleftPercent)}%,
                            #dc3545 ${parseFloat(permissivePercent) + parseFloat(copyleftPercent)}% ${parseFloat(permissivePercent) + parseFloat(copyleftPercent) + parseFloat(proprietaryPercent)}%,
                            #6c757d ${parseFloat(permissivePercent) + parseFloat(copyleftPercent) + parseFloat(proprietaryPercent)}% ${parseFloat(permissivePercent) + parseFloat(copyleftPercent) + parseFloat(proprietaryPercent) + parseFloat(unknownPercent)}%,
                            #17a2b8 ${parseFloat(permissivePercent) + parseFloat(copyleftPercent) + parseFloat(proprietaryPercent) + parseFloat(unknownPercent)}%
                        );">
                            <div class="license-pie-chart-center">
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
                            <div class="license-legend-box" style="--legend-color: #28a745;"></div>
                            <span>Permissive (${permissivePercent}%)</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="license-legend-box" style="--legend-color: #ffc107;"></div>
                            <span>Copyleft (${copyleftPercent}%)</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="license-legend-box" style="--legend-color: #dc3545;"></div>
                            <span>Proprietary (${proprietaryPercent}%)</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="license-legend-box" style="--legend-color: #6c757d;"></div>
                            <span>Unknown (${unknownPercent}%)</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="license-legend-box" style="--legend-color: #17a2b8;"></div>
                            <span>Unlicensed (${unlicensedPercent}%)</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Build license cards similar to licenses.html
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
                <a href="licenses.html" class="btn btn-outline-primary">
                    <i class="fas fa-file-contract me-2"></i>View Detailed License Analysis
                </a>
            </div>
        `;
        
        licenseContent.innerHTML = pieChartHtml + licenseCardsHtml;
        
        // Attach event listeners for license category hover effects
        this.setupLicenseCategoryHovers();
    }
    
    /**
     * Setup hover effects for license category items using event delegation
     */
    setupLicenseCategoryHovers() {
        document.querySelectorAll('.license-category-link').forEach(link => {
            const item = link.querySelector('.license-category-item');
            if (!item) return;
            
            const color = link.getAttribute('data-category-color');
            const hoverBg = link.getAttribute('data-category-hover-bg');
            
            link.addEventListener('mouseenter', () => {
                if (item && color && hoverBg) {
                    item.style.borderColor = color;
                    item.style.backgroundColor = hoverBg;
                }
            });
            
            link.addEventListener('mouseleave', () => {
                if (item) {
                    item.style.borderColor = 'transparent';
                    item.style.backgroundColor = 'transparent';
                }
            });
        });
    }
    
    /**
     * Escape HTML helper - delegates to shared utility from utils.js
     */
    escapeHtml(text) {
        return escapeHtml(text);
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
                    // Check if author has actual funding platforms (same logic as authors.html)
                    if (authorEntity && authorEntity.funding) {
                        const funding = authorEntity.funding;
                        if (funding.github || funding.opencollective || funding.patreon || funding.tidelift || funding.url) {
                            return 1;
                        }
                    }
                    return 0;
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
                    <a href="licenses.html" class="btn btn-sm btn-outline-primary">
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
        resultsSection.classList.remove('d-none');
        resultsSection.classList.add('d-block');
        
        // Show Quick Analysis Access section
        const quickAnalysisSection = document.getElementById('quickAnalysisSection');
        if (quickAnalysisSection) {
            quickAnalysisSection.classList.remove('d-none');
            quickAnalysisSection.classList.add('d-block');
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
            
            indicatorDiv.classList.remove('d-none');
            indicatorDiv.classList.add('d-block');
        } else {
            indicatorDiv.classList.add('d-none');
            indicatorDiv.classList.remove('d-block');
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
     * Start timing for analysis
     */
    startTiming() {
        // Clear any previous timing interval
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
            this.elapsedTimeInterval = null;
        }
        
        this.analysisStartTime = Date.now();
        this.analysisEndTime = null;
        
        const startDate = new Date(this.analysisStartTime);
        const startTimeString = startDate.toLocaleString();
        
        // Reset/hide previous timing display elements
        const endTimeElement = document.getElementById('endTime');
        const totalTimeElement = document.getElementById('totalTime');
        
        if (endTimeElement) {
            endTimeElement.classList.add('d-none');
        }
        if (totalTimeElement) {
            totalTimeElement.classList.add('d-none');
        }
        
        // Update UI with start time (console logging happens at completion)
        const startTimeElement = document.getElementById('startTime');
        const startTimeValue = document.getElementById('startTimeValue');
        const elapsedTimeElement = document.getElementById('elapsedTime');
        const elapsedTimeValue = document.getElementById('elapsedTimeValue');
        
        if (startTimeElement && startTimeValue) {
            startTimeValue.textContent = startTimeString;
            startTimeElement.classList.remove('d-none');
        }
        
        if (elapsedTimeElement) {
            elapsedTimeElement.classList.remove('d-none');
        }
        
        if (elapsedTimeValue) {
            elapsedTimeValue.textContent = '0s';
        }
        
        // Update elapsed time every second
        this.elapsedTimeInterval = setInterval(() => {
            this.updateElapsedTime();
        }, 1000);
        
        // Initial update
        this.updateElapsedTime();
    }

    /**
     * Update elapsed time display
     */
    updateElapsedTime() {
        if (!this.analysisStartTime) return;
        
        const elapsed = Date.now() - this.analysisStartTime;
        const formattedDuration = this.formatDuration(elapsed);
        
        // Update UI only (no console logging per second)
        const elapsedTimeValue = document.getElementById('elapsedTimeValue');
        if (elapsedTimeValue) {
            elapsedTimeValue.textContent = formattedDuration;
        }
    }

    /**
     * Stop timing and show final results
     */
    stopTiming() {
        this.analysisEndTime = Date.now();
        
        // Clear interval
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
            this.elapsedTimeInterval = null;
        }
        
        // Update UI with end time and total duration
        const endTimeElement = document.getElementById('endTime');
        const endTimeValue = document.getElementById('endTimeValue');
        const totalTimeElement = document.getElementById('totalTime');
        const totalTimeValue = document.getElementById('totalTimeValue');
        
        if (this.analysisStartTime && this.analysisEndTime) {
            const totalDuration = this.analysisEndTime - this.analysisStartTime;
            const formattedDuration = this.formatDuration(totalDuration);
            const endDate = new Date(this.analysisEndTime);
            const endTimeString = endDate.toLocaleString();
            
            // Log to console (final values only)
            console.log(`⏱️ Started: ${new Date(this.analysisStartTime).toLocaleString()}`);
            console.log(`⏱️ Finished: ${endTimeString}`);
            console.log(`⏱️ Total Time: ${formattedDuration}`);
            
            if (endTimeElement && endTimeValue) {
                endTimeValue.textContent = endTimeString;
                endTimeElement.classList.remove('d-none');
            }
            
            if (totalTimeElement && totalTimeValue) {
                totalTimeValue.textContent = formattedDuration;
                totalTimeElement.classList.remove('d-none');
            }
            
            // Final elapsed time update
            this.updateElapsedTime();
        }
    }

    /**
     * Format duration in milliseconds to human-readable string
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Finish analysis and reset UI
     */
    finishAnalysis() {
        this.isAnalyzing = false;
        
        // Clear timing interval if still running
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
            this.elapsedTimeInterval = null;
        }
        
        const analyzeBtn = document.getElementById('analyzeBtn');
        const progressSection = document.getElementById('progressSection');
        
        if (analyzeBtn) analyzeBtn.disabled = false;
        if (progressSection) {
            progressSection.classList.add('d-none');
            progressSection.classList.remove('d-block');
        }
    }

    /**
     * Show alert message
     */
    showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${this.escapeHtml(message)}
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
    /**
     * Fetch PyPI package licenses from deps.dev API and save to IndexedDB
     */
    async fetchPyPILicenses(dependencies, identifier) {
        if (!dependencies || dependencies.length === 0) return;
        
        // Filter PyPI packages that need licenses
        const pypiDeps = dependencies.filter(dep => 
            dep.category?.ecosystem === 'PyPI' && 
            dep.name && 
            dep.version &&
            (!dep.licenseFull || dep.licenseFull === 'Unknown' || dep.licenseFull === 'NOASSERTION')
        );
        
        if (pypiDeps.length === 0) {
            console.log('ℹ️ No PyPI packages need license fetching');
            return;
        }
        
        console.log(`📄 Fetching licenses for ${pypiDeps.length} PyPI packages...`);
        
        // Process in batches to avoid overwhelming the API
        const batchSize = 20;
        let fetched = 0;
        let saved = 0;
        
        for (let i = 0; i < pypiDeps.length; i += batchSize) {
            const batch = pypiDeps.slice(i, i + batchSize);
            await Promise.all(batch.map(async (dep) => {
                try {
                    // Fetch license from deps.dev API
                    const url = `https://api.deps.dev/v3alpha/systems/pypi/packages/${encodeURIComponent(dep.name)}/versions/${encodeURIComponent(dep.version)}`;
                    const response = await fetch(url);
                    if (!response.ok) {
                        return;
                    }
                    
                    const data = await response.json();
                    if (data.licenses && data.licenses.length > 0) {
                        const licenseFull = data.licenses.join(' AND ');
                        let licenseText = licenseFull;
                        
                        // Format license text
                        if (licenseFull.includes(' AND ')) {
                            const firstLicense = licenseFull.split(' AND ')[0];
                            licenseText = firstLicense.startsWith('Apache') ? 'Apache' : (firstLicense.length > 8 ? firstLicense.substring(0, 8) + '...' : firstLicense);
                        } else if (licenseFull.startsWith('Apache')) {
                            licenseText = 'Apache';
                        } else {
                            licenseText = licenseFull.length > 8 ? licenseFull.substring(0, 8) + '...' : licenseFull;
                        }
                        
                        // Update dependency object
                        dep.license = licenseText;
                        dep.licenseFull = licenseFull;
                        dep._licenseEnriched = true;
                        
                        fetched++;
                        
                        if (fetched % 10 === 0) {
                            console.log(`📄 Licenses: ${fetched}/${pypiDeps.length} fetched`);
                        }
                    }
                } catch (e) {
                    console.debug(`Failed to fetch license for ${dep.name}@${dep.version}:`, e);
                }
            }));
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Note: Licenses are updated in-place in the dependencies array
        // The caller should save the updated results to IndexedDB after this function completes
        console.log(`✅ License fetching complete: ${fetched} licenses fetched`);
    }
    
    /**
     * Fetch version drift data for all dependencies and save to IndexedDB
     */
    async fetchVersionDriftData(dependencies) {
        if (!dependencies || dependencies.length === 0 || !window.VersionDriftAnalyzer) return;
        
        const versionDriftAnalyzer = new window.VersionDriftAnalyzer();
        const uniquePackageVersions = new Map(); // Key: packageKey, Value: Set of versions
        
        // Collect unique package versions from dependencies
        dependencies.forEach(dep => {
            if (dep.name && dep.version && dep.category?.ecosystem) {
                let ecosystem = dep.category.ecosystem.toLowerCase();
                // Normalize ecosystem aliases
                if (ecosystem === 'rubygems' || ecosystem === 'gem') {
                    ecosystem = 'gem';
                } else if (ecosystem === 'go' || ecosystem === 'golang') {
                    ecosystem = 'golang';
                } else if (ecosystem === 'packagist' || ecosystem === 'composer') {
                    ecosystem = 'composer';
                }
                const packageKey = `${ecosystem}:${dep.name}`;
                if (!uniquePackageVersions.has(packageKey)) {
                    uniquePackageVersions.set(packageKey, new Set());
                }
                uniquePackageVersions.get(packageKey).add(dep.version);
            }
        });
        
        const totalVersions = Array.from(uniquePackageVersions.values()).reduce((sum, versions) => sum + versions.size, 0);
        console.log(`📦 Fetching version drift for ${uniquePackageVersions.size} packages (${totalVersions} versions)...`);
        
        let processed = 0;
        const batchSize = 10; // Process 10 packages at a time
        const packageKeys = Array.from(uniquePackageVersions.keys());
        
        for (let i = 0; i < packageKeys.length; i += batchSize) {
            const batch = packageKeys.slice(i, i + batchSize);
            await Promise.all(batch.map(async (packageKey) => {
                const [ecosystem, packageName] = packageKey.split(':');
                const versions = Array.from(uniquePackageVersions.get(packageKey));
                
                // Fetch drift for each version (checkVersionDrift already saves to IndexedDB via cacheManager)
                for (const version of versions) {
                    try {
                        // Check cache first - only fetch if not cached
                        const cached = await versionDriftAnalyzer.getVersionDriftFromCache(packageKey, version);
                        if (!cached) {
                            await versionDriftAnalyzer.checkVersionDrift(packageName, version, ecosystem);
                            processed++;
                            if (processed % 10 === 0) {
                                console.log(`📦 Version drift: ${processed}/${totalVersions} versions processed`);
                            }
                        }
                    } catch (e) {
                        console.debug(`Failed to fetch version drift for ${packageKey}@${version}:`, e);
                    }
                }
            }));
            
            // Small delay between batches to avoid overwhelming APIs
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`✅ Version drift fetching complete: ${processed} versions fetched`);
    }

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
        
        // Fetch version drift data for all unique package versions in background
        // This populates the cache so deps.html can read from it instead of fetching at runtime
        if (window.VersionDriftAnalyzer) {
            const versionDriftAnalyzer = new window.VersionDriftAnalyzer();
            const uniquePackageVersions = new Map(); // Key: packageKey, Value: Set of versions
            
            // Collect unique package versions from dependencies
            data.data.allDependencies.forEach(dep => {
                if (dep.name && dep.version && dep.category?.ecosystem) {
                    let ecosystem = dep.category.ecosystem.toLowerCase();
                    // Normalize ecosystem aliases
                    if (ecosystem === 'rubygems' || ecosystem === 'gem') {
                        ecosystem = 'gem';
                    } else if (ecosystem === 'go' || ecosystem === 'golang') {
                        ecosystem = 'golang';
                    } else if (ecosystem === 'packagist' || ecosystem === 'composer') {
                        ecosystem = 'composer';
                    }
                    const packageKey = `${ecosystem}:${dep.name}`;
                    if (!uniquePackageVersions.has(packageKey)) {
                        uniquePackageVersions.set(packageKey, new Set());
                    }
                    uniquePackageVersions.get(packageKey).add(dep.version);
                }
            });
            
            // Fetch version drift in batches (don't block, run in background)
            const totalVersions = Array.from(uniquePackageVersions.values()).reduce((sum, versions) => sum + versions.size, 0);
            console.log(`📦 Fetching version drift for ${uniquePackageVersions.size} packages (${totalVersions} versions) in background...`);
            
            // Run in background without blocking
            setTimeout(async () => {
                let processed = 0;
                const batchSize = 10; // Process 10 packages at a time
                const packageKeys = Array.from(uniquePackageVersions.keys());
                
                for (let i = 0; i < packageKeys.length; i += batchSize) {
                    const batch = packageKeys.slice(i, i + batchSize);
                    await Promise.all(batch.map(async (packageKey) => {
                        const [ecosystem, packageName] = packageKey.split(':');
                        const versions = Array.from(uniquePackageVersions.get(packageKey));
                        
                        // Fetch drift for each version
                        for (const version of versions) {
                            try {
                                // Check cache first - only fetch if not cached
                                const cached = await versionDriftAnalyzer.getVersionDriftFromCache(packageKey, version);
                                if (!cached) {
                                    await versionDriftAnalyzer.checkVersionDrift(packageName, version, ecosystem);
                                    processed++;
                                    if (processed % 10 === 0) {
                                        console.log(`📦 Version drift: ${processed}/${totalVersions} versions processed`);
                                    }
                                }
                            } catch (e) {
                                console.debug(`Failed to fetch version drift for ${packageKey}@${version}:`, e);
                            }
                        }
                    }));
                    
                    // Small delay between batches to avoid overwhelming APIs
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                console.log(`✅ Version drift fetching complete: ${processed} versions fetched`);
            }, 1000); // Start after a short delay
        }
        
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
    
    if (body.classList.contains('d-none')) {
        body.classList.remove('d-none');
        body.classList.add('d-block');
        icon.className = 'fas fa-chevron-up';
    } else {
        body.classList.add('d-none');
        body.classList.remove('d-block');
        icon.className = 'fas fa-chevron-down';
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    // Always initialize the app - it's needed for analysis functions
    app = new SBOMPlayApp();
}); 