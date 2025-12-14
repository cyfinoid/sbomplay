/**
 * Upload Page - Handles SBOM file upload and analysis
 * Experimental feature for processing uploaded SPDX/CycloneDX SBOMs
 * Supports multiple file upload with queuing
 */
console.log('📤 Upload Page loaded');

class UploadPage {
    constructor() {
        this.sbomParser = new window.SBOMParser();
        this.sbomProcessor = null;
        this.storageManager = null;
        this.fileQueue = []; // Queue of files to process
        this.isProcessing = false; // Flag to track if processing is in progress
        this.processedResults = []; // Store results for all processed files
        this.analysisStartTime = null;
        this.elapsedTimeInterval = null;
        
        this.init();
    }

    async init() {
        console.log('📤 Initializing Upload Page...');
        
        // Wait for required dependencies
        await this.waitForDependencies();
        
        // Initialize components
        this.sbomProcessor = new window.SBOMProcessor();
        this.storageManager = window.storageManager || new window.StorageManager();
        
        // Ensure storage manager is initialized
        if (!this.storageManager.initialized) {
            await this.storageManager.init();
        }
        
        // Load GitHub token from sessionStorage (shared across pages)
        this.loadGitHubToken();
        
        // Setup UI event listeners
        this.setupEventListeners();
        
        console.log('✅ Upload Page initialized');
    }
    
    /**
     * Load GitHub token from sessionStorage and display status
     * Token is shared across all pages via sessionStorage
     */
    loadGitHubToken() {
        const token = sessionStorage.getItem('github_token');
        const tokenStatusEl = document.getElementById('tokenStatus');
        
        if (token) {
            const maskedToken = token.length > 8 
                ? `${token.substring(0, 4)}...${token.substring(token.length - 4)}` 
                : '****';
            console.log(`🔑 GitHub token loaded from sessionStorage: ${maskedToken}`);
            
            if (tokenStatusEl) {
                tokenStatusEl.innerHTML = `<span class="text-success"><i class="fas fa-check-circle me-1"></i>Token active</span>`;
            }
        } else {
            console.log('⚠️ No GitHub token found - author enrichment will be rate-limited');
            
            if (tokenStatusEl) {
                tokenStatusEl.innerHTML = `<span class="text-warning"><i class="fas fa-exclamation-triangle me-1"></i>No token - <a href="settings.html">add in Settings</a></span>`;
            }
        }
    }

    async waitForDependencies() {
        const maxWait = 5000;
        const startTime = Date.now();
        
        while (!window.SBOMProcessor || !window.StorageManager || !window.SBOMParser) {
            if (Date.now() - startTime > maxWait) {
                console.error('❌ Required dependencies not loaded');
                this.showError('Failed to load required components. Please refresh the page.');
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    setupEventListeners() {
        // File input
        const fileInput = document.getElementById('sbomFileInput');
        const dropZone = document.getElementById('dropZone');
        const analyzeBtn = document.getElementById('analyzeUploadBtn');

        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        if (dropZone) {
            // Drag and drop events
            dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
            dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            dropZone.addEventListener('drop', (e) => this.handleDrop(e));
            dropZone.addEventListener('click', () => fileInput?.click());
        }

        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => this.startAnalysis());
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        const dropZone = document.getElementById('dropZone');
        if (dropZone) {
            dropZone.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        const dropZone = document.getElementById('dropZone');
        if (dropZone) {
            dropZone.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const dropZone = document.getElementById('dropZone');
        if (dropZone) {
            dropZone.classList.remove('drag-over');
        }

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            this.addFilesToQueue(Array.from(files));
        }
    }

    handleFileSelect(e) {
        const files = e.target?.files;
        if (files && files.length > 0) {
            this.addFilesToQueue(Array.from(files));
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    }

    async addFilesToQueue(files) {
        for (const file of files) {
            // Validate file extension
            if (!this.sbomParser.isValidExtension(file.name)) {
                this.showError(`Invalid file type: ${file.name}. Supported formats: ${this.sbomParser.getSupportedExtensions().join(', ')}`);
                continue;
            }

            // Validate file size (max 50MB)
            const maxSize = 50 * 1024 * 1024;
            if (file.size > maxSize) {
                this.showError(`File too large: ${file.name}. Maximum file size is 50MB.`);
                continue;
            }

            // Check if file already in queue
            if (this.fileQueue.some(item => item.file.name === file.name && item.file.size === file.size)) {
                continue; // Skip duplicates
            }

            // Parse the file to validate and extract info
            try {
                const content = await this.readFile(file);
                const result = this.sbomParser.parse(content, file.name);
                
                if (!result.success) {
                    this.showError(`${file.name}: ${result.error}`);
                    continue;
                }

                // Add to queue with parsed data
                this.fileQueue.push({
                    file: file,
                    content: content,
                    parsedData: result,
                    status: 'pending', // pending, processing, completed, failed
                    error: null,
                    results: null
                });
            } catch (error) {
                this.showError(`Error reading ${file.name}: ${error.message}`);
            }
        }

        // Update queue display
        this.updateQueueDisplay();
        
        // Enable analyze button if queue has items
        const analyzeBtn = document.getElementById('analyzeUploadBtn');
        if (analyzeBtn && this.fileQueue.length > 0) {
            analyzeBtn.disabled = false;
        }
    }

    updateQueueDisplay() {
        const queueSection = document.getElementById('queueSection');
        const queueList = document.getElementById('queueList');
        const queueCount = document.getElementById('queueCount');
        
        if (!queueSection || !queueList) return;
        
        if (this.fileQueue.length === 0) {
            queueSection.classList.add('d-none');
            return;
        }
        
        queueSection.classList.remove('d-none');
        if (queueCount) {
            queueCount.textContent = this.fileQueue.length;
        }
        
        // Build queue list HTML
        const listHtml = this.fileQueue.map((item, index) => {
            const formatDisplay = `${item.parsedData.format.format.toUpperCase()}${item.parsedData.format.version ? ` ${item.parsedData.format.version}` : ''}`;
            const packageCount = item.parsedData.data?.sbom?.packages?.length || 0;
            const projectDisplayName = item.parsedData.projectInfo?.displayName || 'Unknown';
            
            let statusBadge = '';
            let statusIcon = '';
            switch (item.status) {
                case 'pending':
                    statusBadge = '<span class="badge bg-secondary">Pending</span>';
                    statusIcon = '<i class="fas fa-clock text-secondary"></i>';
                    break;
                case 'processing':
                    statusBadge = '<span class="badge bg-primary">Processing</span>';
                    statusIcon = '<i class="fas fa-spinner fa-spin text-primary"></i>';
                    break;
                case 'completed':
                    statusBadge = '<span class="badge bg-success">Completed</span>';
                    statusIcon = '<i class="fas fa-check-circle text-success"></i>';
                    break;
                case 'failed':
                    statusBadge = '<span class="badge bg-danger">Failed</span>';
                    statusIcon = '<i class="fas fa-times-circle text-danger"></i>';
                    break;
            }
            
            return `
                <div class="queue-item d-flex align-items-center justify-content-between p-2 border-bottom" data-index="${index}">
                    <div class="d-flex align-items-center flex-grow-1">
                        ${statusIcon}
                        <div class="ms-3">
                            <strong>${this.escapeHtml(item.file.name)}</strong>
                            <br>
                            <small class="text-muted">
                                ${formatDisplay} · ${packageCount} packages · <code>${this.escapeHtml(projectDisplayName)}</code>
                            </small>
                            ${item.error ? `<br><small class="text-danger">${this.escapeHtml(item.error)}</small>` : ''}
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        ${statusBadge}
                        ${item.status === 'pending' ? `<button class="btn btn-sm btn-outline-danger remove-queue-item" data-index="${index}" title="Remove"><i class="fas fa-times"></i></button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        queueList.innerHTML = listHtml;
        
        // Add event listeners for remove buttons
        queueList.querySelectorAll('.remove-queue-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.removeFromQueue(index);
            });
        });
    }

    removeFromQueue(index) {
        if (index >= 0 && index < this.fileQueue.length) {
            // Only allow removing pending items
            if (this.fileQueue[index].status === 'pending') {
                this.fileQueue.splice(index, 1);
                this.updateQueueDisplay();
                
                // Disable button if queue is empty
                const analyzeBtn = document.getElementById('analyzeUploadBtn');
                if (analyzeBtn && this.fileQueue.filter(f => f.status === 'pending').length === 0) {
                    analyzeBtn.disabled = true;
                }
            }
        }
    }

    clearCompletedFromQueue() {
        this.fileQueue = this.fileQueue.filter(item => item.status === 'pending');
        this.updateQueueDisplay();
    }

    escapeHtml(text) {
        if (window.escapeHtml) {
            return window.escapeHtml(text);
        }
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    async startAnalysis() {
        const pendingItems = this.fileQueue.filter(item => item.status === 'pending');
        
        if (pendingItems.length === 0) {
            this.showError('No files to analyze. Please upload SBOM files first.');
            return;
        }

        if (this.isProcessing) {
            this.showError('Analysis already in progress. Please wait.');
            return;
        }

        console.log(`🚀 Starting SBOM analysis for ${pendingItems.length} file(s)...`);
        this.isProcessing = true;
        this.processedResults = [];
        
        // Disable button during analysis
        const analyzeBtn = document.getElementById('analyzeUploadBtn');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Analyzing...';
        }

        // Show progress section
        this.showProgressSection();
        this.analysisStartTime = new Date();
        this.startElapsedTimer();

        let completedCount = 0;
        let failedCount = 0;

        // Process each pending file in the queue
        for (let i = 0; i < this.fileQueue.length; i++) {
            const item = this.fileQueue[i];
            
            if (item.status !== 'pending') continue;
            
            item.status = 'processing';
            this.updateQueueDisplay();
            
            const fileProgress = (completedCount / pendingItems.length) * 100;
            this.updateProgress(fileProgress, `Processing ${item.file.name}...`);

            try {
                const results = await this.analyzeFile(item, (phase, pct, msg) => {
                    // Calculate overall progress
                    const itemProgress = pct / pendingItems.length;
                    const overallPct = fileProgress + itemProgress;
                    this.updateProgress(overallPct, `[${completedCount + 1}/${pendingItems.length}] ${msg}`);
                });
                
                item.status = 'completed';
                item.results = results;
                this.processedResults.push({
                    filename: item.file.name,
                    projectInfo: item.parsedData.projectInfo,
                    results: results,
                    success: true
                });
                completedCount++;
                
            } catch (error) {
                console.error(`❌ Analysis failed for ${item.file.name}:`, error);
                item.status = 'failed';
                item.error = error.message;
                this.processedResults.push({
                    filename: item.file.name,
                    projectInfo: item.parsedData.projectInfo,
                    error: error.message,
                    success: false
                });
                failedCount++;
            }
            
            this.updateQueueDisplay();
        }

        // Complete
        this.updateProgress(100, `Analysis complete! ${completedCount} succeeded, ${failedCount} failed.`);
        this.stopElapsedTimer();
        this.isProcessing = false;
        
        // Update progress section header to show completion
        this.updateProgressHeader(true, failedCount > 0);
        
        // Show combined results
        this.showCombinedResults();

        // Re-enable button if there are new pending items
        if (analyzeBtn) {
            const newPending = this.fileQueue.filter(item => item.status === 'pending').length;
            analyzeBtn.disabled = newPending === 0;
            analyzeBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Analysis';
        }

        console.log(`✅ Batch analysis complete: ${completedCount} succeeded, ${failedCount} failed`);
    }

    async analyzeFile(item, onProgress) {
        const { data, projectInfo } = item.parsedData;
        const projectName = projectInfo.projectName;
        // Use 'upload' as owner marker and projectName as repo for processor
        const owner = 'upload';
        const repo = projectName;

        // Reset processor for each file
        this.sbomProcessor.reset();
        this.sbomProcessor.setTotalRepositories(1);

        // Upload metadata to persist across saves
        const uploadInfo = {
            filename: item.file.name,
            format: item.parsedData.format,
            uploadedAt: new Date().toISOString(),
            projectName: projectName
        };

        // Helper to save current state
        const saveProgress = async (phaseName) => {
            let results = this.sbomProcessor.exportData();
            results.uploadInfo = uploadInfo;
            await this.storageManager.saveAnalysisData(projectName, results);
            console.log(`💾 Saved after ${phaseName}`);
            return results;
        };

        // Phase 1: Process SBOM (10-30%)
        onProgress('sbom', 10, `Processing SBOM data...`);
        const success = await this.sbomProcessor.processSBOM(owner, repo, data, null, false);
        
        if (!success) {
            throw new Error('Failed to process SBOM data');
        }
        this.sbomProcessor.updateProgress(true);
        await saveProgress('Phase 1: SBOM Processing');

        // Phase 2: Resolve dependency trees (30-50%)
        onProgress('deps', 30, `Resolving dependency trees...`);
        await this.sbomProcessor.resolveFullDependencyTrees((progress) => {
            if (progress.phase === 'resolving-package') {
                const pct = 30 + (progress.processed / Math.max(progress.total, 1)) * 20;
                onProgress('deps', pct, `Resolving ${progress.packageName || 'dependencies'}...`);
            }
        });
        await saveProgress('Phase 2: Dependency Trees + Confusion Detection');

        // Phase 3: License compliance from SBOM data (50-55%)
        onProgress('license', 50, `Analyzing license compliance...`);
        this.sbomProcessor.analyzeLicenseCompliance();
        await saveProgress('Phase 3: License Compliance');

        // Phase 4: Export initial results (55%)
        onProgress('export', 55, `Exporting results...`);
        let results = this.sbomProcessor.exportData();
        results.uploadInfo = uploadInfo;

        // Phase 5-8: Run shared enrichment pipeline (55-98%)
        // Uses EnrichmentPipeline - same logic as app.js
        // This ensures upload flow produces identical results to GitHub flow
        if (window.EnrichmentPipeline) {
            const pipeline = new window.EnrichmentPipeline(this.sbomProcessor, this.storageManager);
            results = await pipeline.runFullEnrichment(results, projectName, (phase, pct, msg) => {
                onProgress(phase, pct, msg);
            });
        } else {
            console.warn('⚠️ EnrichmentPipeline not available, using fallback');
            // Fallback to basic enrichment if pipeline not loaded
            await this.fallbackEnrichment(results, projectName, onProgress);
        }

        // Save to IndexedDB using projectName as the storage key
        // Each uploaded SBOM is stored independently (like a direct repo scan)
        await this.storageManager.saveAnalysisData(projectName, results);

        onProgress('complete', 100, `Completed ${item.file.name}`);
        
        return results;
    }

    /**
     * Fallback enrichment if EnrichmentPipeline is not available
     * This provides basic functionality but should not be the primary path
     */
    async fallbackEnrichment(results, projectName, onProgress) {
        // Basic license fetching via LicenseFetcher
        if (window.licenseFetcher && results.allDependencies) {
            onProgress('licenses', 65, 'Fetching licenses...');
            await window.licenseFetcher.fetchLicenses(results.allDependencies);
            window.licenseFetcher.syncToProcessor(results.allDependencies, this.sbomProcessor);
        }

        // Basic version drift
        if (window.versionDriftAnalyzer && results.allDependencies) {
            onProgress('version-drift', 80, 'Checking version drift...');
            for (const dep of results.allDependencies.slice(0, 50)) { // Limit for fallback
                try {
                    const ecosystem = dep.category?.ecosystem || '';
                    await window.versionDriftAnalyzer.checkVersionDrift(dep.name, dep.version, ecosystem);
                } catch (e) { /* skip */ }
            }
        }

        // Basic author fetching
        if (window.AuthorService && results.allDependencies) {
            onProgress('authors', 90, 'Fetching authors...');
            const authorService = new window.AuthorService();
            const packages = results.allDependencies
                .filter(d => d.name && d.category?.ecosystem)
                .slice(0, 50) // Limit for fallback
                .map(d => ({ name: d.name, version: d.version, ecosystem: d.category.ecosystem }));
            await authorService.fetchAuthorsForPackages(packages);
        }
    }

    showProgressSection() {
        const progressSection = document.getElementById('progressSection');
        if (progressSection) {
            progressSection.classList.remove('d-none');
        }
        
        // Reset header to show spinning icon
        this.updateProgressHeader(false);
        
        // Reset progress bar styling
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.classList.remove('bg-success', 'bg-warning');
            progressBar.classList.add('progress-bar-animated', 'progress-bar-striped');
        }
        
        // Show timing info
        const startTime = document.getElementById('startTime');
        const startTimeValue = document.getElementById('startTimeValue');
        if (startTime && startTimeValue) {
            startTime.classList.remove('d-none');
            startTimeValue.textContent = new Date().toLocaleTimeString();
        }
        
        const elapsedTime = document.getElementById('elapsedTime');
        if (elapsedTime) {
            elapsedTime.classList.remove('d-none');
        }
    }

    updateProgress(percent, message) {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.textContent = `${Math.round(percent)}%`;
            
            // Update color based on progress
            if (percent >= 100) {
                progressBar.classList.remove('progress-bar-animated', 'progress-bar-striped');
                progressBar.classList.add('bg-success');
            }
        }
        
        if (progressText) {
            progressText.textContent = message;
        }
    }

    updateProgressHeader(isComplete, hasFailures = false) {
        const progressHeader = document.getElementById('progressSection')?.querySelector('.card-header h5');
        if (!progressHeader) return;
        
        if (isComplete) {
            if (hasFailures) {
                // Some failures - show warning icon
                progressHeader.innerHTML = '<i class="fas fa-exclamation-triangle text-warning me-2"></i>Analysis Complete (with errors)';
            } else {
                // All success - show green checkmark
                progressHeader.innerHTML = '<i class="fas fa-check-circle text-success me-2"></i>Analysis Complete';
            }
        } else {
            // In progress - show spinning icon
            progressHeader.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Analysis Progress';
        }
    }

    startElapsedTimer() {
        const elapsedTimeValue = document.getElementById('elapsedTimeValue');
        if (!elapsedTimeValue) return;

        this.elapsedTimeInterval = setInterval(() => {
            if (this.analysisStartTime) {
                const elapsed = Math.floor((Date.now() - this.analysisStartTime.getTime()) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                elapsedTimeValue.textContent = minutes > 0 
                    ? `${minutes}m ${seconds}s` 
                    : `${seconds}s`;
            }
        }, 1000);
    }

    stopElapsedTimer() {
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
            this.elapsedTimeInterval = null;
        }
        
        // Show end time and total time
        const endTime = document.getElementById('endTime');
        const endTimeValue = document.getElementById('endTimeValue');
        const totalTime = document.getElementById('totalTime');
        const totalTimeValue = document.getElementById('totalTimeValue');
        
        if (endTime && endTimeValue) {
            endTime.classList.remove('d-none');
            endTimeValue.textContent = new Date().toLocaleTimeString();
        }
        
        if (totalTime && totalTimeValue && this.analysisStartTime) {
            totalTime.classList.remove('d-none');
            const elapsed = Math.floor((Date.now() - this.analysisStartTime.getTime()) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            totalTimeValue.textContent = minutes > 0 
                ? `${minutes}m ${seconds}s` 
                : `${seconds}s`;
        }
    }

    showCombinedResults() {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContent = document.getElementById('resultsContent');
        
        if (!resultsSection || !resultsContent) return;
        
        resultsSection.classList.remove('d-none');
        
        const successResults = this.processedResults.filter(r => r.success);
        const failedResults = this.processedResults.filter(r => !r.success);
        
        // Calculate totals across all successful results
        let totalDeps = 0;
        let totalVulnerable = 0;
        let totalCriticalHigh = 0;
        
        successResults.forEach(r => {
            const stats = r.results?.statistics || {};
            const vulnAnalysis = r.results?.vulnerabilityAnalysis || {};
            totalDeps += stats.totalDependencies || 0;
            totalVulnerable += vulnAnalysis.vulnerableDependencies?.length || 0;
            totalCriticalHigh += (vulnAnalysis.bySeverity?.critical || 0) + (vulnAnalysis.bySeverity?.high || 0);
        });
        
        // Build results HTML
        let html = `
            <div class="row mb-4">
                <div class="col-md-3 mb-3">
                    <div class="card bg-light">
                        <div class="card-body text-center">
                            <h3 class="text-primary">${successResults.length}</h3>
                            <small class="text-muted">Files Processed</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card bg-light">
                        <div class="card-body text-center">
                            <h3 class="text-info">${totalDeps}</h3>
                            <small class="text-muted">Total Dependencies</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card bg-light">
                        <div class="card-body text-center">
                            <h3 class="${totalVulnerable > 0 ? 'text-danger' : 'text-success'}">${totalVulnerable}</h3>
                            <small class="text-muted">Vulnerable</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card bg-light">
                        <div class="card-body text-center">
                            <h3 class="${totalCriticalHigh > 0 ? 'text-danger' : 'text-secondary'}">${totalCriticalHigh}</h3>
                            <small class="text-muted">Critical/High</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Show per-file results
        if (successResults.length > 0) {
            html += `<h6 class="mb-3"><i class="fas fa-check-circle text-success me-2"></i>Successfully Processed</h6>`;
            html += `<div class="list-group mb-3">`;
            successResults.forEach(r => {
                const stats = r.results?.statistics || {};
                const vulnAnalysis = r.results?.vulnerabilityAnalysis || {};
                const vulnCount = vulnAnalysis.vulnerableDependencies?.length || 0;
                html += `
                    <div class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${this.escapeHtml(r.filename)}</strong>
                            <br>
                            <small class="text-muted">Stored as: <code>${this.escapeHtml(r.projectInfo?.displayName || 'Unknown')}</code></small>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-primary">${stats.totalDependencies || 0} deps</span>
                            ${vulnCount > 0 ? `<span class="badge bg-danger">${vulnCount} vulns</span>` : '<span class="badge bg-success">No vulns</span>'}
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }
        
        if (failedResults.length > 0) {
            html += `<h6 class="mb-3"><i class="fas fa-times-circle text-danger me-2"></i>Failed</h6>`;
            html += `<div class="list-group mb-3">`;
            failedResults.forEach(r => {
                html += `
                    <div class="list-group-item list-group-item-danger d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${this.escapeHtml(r.filename)}</strong>
                            <br>
                            <small>${this.escapeHtml(r.error || 'Unknown error')}</small>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }
        
        html += `
            <div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                <strong>Analysis Complete!</strong> Results have been saved and are now available on all pages.
            </div>
            
            <div class="d-flex flex-wrap gap-2 mt-3">
                <a href="deps.html" class="btn btn-primary">
                    <i class="fas fa-sitemap me-1"></i>View Dependencies
                </a>
                <a href="vuln.html" class="btn btn-outline-danger">
                    <i class="fas fa-shield-alt me-1"></i>View Vulnerabilities
                </a>
                <a href="licenses.html" class="btn btn-outline-warning">
                    <i class="fas fa-file-contract me-1"></i>View Licenses
                </a>
                <a href="repos.html" class="btn btn-outline-secondary">
                    <i class="fas fa-folder me-1"></i>View Projects
                </a>
                <button class="btn btn-outline-primary" onclick="window.uploadPage.clearCompletedFromQueue(); window.uploadPage.updateQueueDisplay();">
                    <i class="fas fa-plus me-1"></i>Upload More
                </button>
            </div>
        `;
        
        if (window.safeSetHTML) {
            window.safeSetHTML(resultsContent, html);
        } else {
            resultsContent.innerHTML = html;
        }
    }

    showError(message) {
        const errorSection = document.getElementById('errorSection');
        const errorMessage = document.getElementById('errorMessage');
        
        if (errorSection && errorMessage) {
            errorSection.classList.remove('d-none');
            errorMessage.textContent = message;
        } else {
            // Fallback to alert
            console.error(message);
        }
    }

    clearError() {
        const errorSection = document.getElementById('errorSection');
        if (errorSection) {
            errorSection.classList.add('d-none');
        }
    }
}

// Initialize page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.uploadPage = new UploadPage();
});
