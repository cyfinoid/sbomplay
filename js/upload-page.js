/**
 * Upload Page - Handles SBOM file upload and analysis
 * Experimental feature for processing uploaded SPDX/CycloneDX SBOMs
 */
console.log('📤 Upload Page loaded');

class UploadPage {
    constructor() {
        this.sbomParser = new window.SBOMParser();
        this.sbomProcessor = null;
        this.storageManager = null;
        this.currentFile = null;
        this.parsedData = null;
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
        
        // Setup UI event listeners
        this.setupEventListeners();
        
        console.log('✅ Upload Page initialized');
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
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target?.files;
        if (files && files.length > 0) {
            this.processFile(files[0]);
        }
    }

    async processFile(file) {
        console.log(`📁 Processing file: ${file.name}`);
        
        // Validate file extension
        if (!this.sbomParser.isValidExtension(file.name)) {
            this.showError(`Invalid file type. Supported formats: ${this.sbomParser.getSupportedExtensions().join(', ')}`);
            return;
        }

        // Validate file size (max 50MB)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            this.showError('File too large. Maximum file size is 50MB.');
            return;
        }

        this.currentFile = file;
        this.updateFileInfo(file.name, 'Reading file...');

        try {
            // Read file content
            const content = await this.readFile(file);
            
            // Parse SBOM
            const result = this.sbomParser.parse(content, file.name);
            
            if (!result.success) {
                this.showError(result.error);
                this.updateFileInfo(file.name, 'Parse failed');
                return;
            }

            this.parsedData = result;
            
            // Update UI with detected format and project info
            const formatDisplay = `${result.format.format.toUpperCase()}${result.format.version ? ` ${result.format.version}` : ''}`;
            this.updateFileInfo(file.name, 'Ready for analysis');
            this.updateFormatInfo(formatDisplay);
            this.updateProjectInfo(result.projectInfo);
            
            // Enable analyze button
            const analyzeBtn = document.getElementById('analyzeUploadBtn');
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
            }

            // Show package count preview
            const packageCount = result.data?.sbom?.packages?.length || 0;
            this.updatePreview(packageCount, result.format.format);

        } catch (error) {
            console.error('Error processing file:', error);
            this.showError(`Error processing file: ${error.message}`);
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    updateFileInfo(filename, status) {
        const fileInfo = document.getElementById('fileInfo');
        if (fileInfo) {
            fileInfo.classList.remove('d-none');
            const filenameEl = fileInfo.querySelector('.filename');
            const statusEl = fileInfo.querySelector('.status');
            if (filenameEl) filenameEl.textContent = filename;
            if (statusEl) statusEl.textContent = status;
        }
    }

    updateFormatInfo(format) {
        const formatInfo = document.getElementById('formatInfo');
        if (formatInfo) {
            formatInfo.classList.remove('d-none');
            const formatValue = formatInfo.querySelector('.format-value');
            if (formatValue) formatValue.textContent = format;
        }
    }

    updateProjectInfo(projectInfo) {
        const projectInfoEl = document.getElementById('projectInfo');
        if (projectInfoEl) {
            projectInfoEl.classList.remove('d-none');
            const projectValue = projectInfoEl.querySelector('.project-value');
            if (projectValue) projectValue.textContent = projectInfo.fullName;
        }
    }

    updatePreview(packageCount, format) {
        const preview = document.getElementById('previewInfo');
        if (preview) {
            preview.classList.remove('d-none');
            const countEl = preview.querySelector('.package-count');
            if (countEl) countEl.textContent = `${packageCount} packages found`;
        }
    }

    async startAnalysis() {
        if (!this.parsedData || !this.parsedData.success) {
            this.showError('No valid SBOM data to analyze. Please upload a file first.');
            return;
        }

        console.log('🚀 Starting SBOM analysis...');
        
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

        try {
            const { data, projectInfo } = this.parsedData;
            const { owner, repo } = projectInfo;
            const orgName = owner; // Use owner as org name for storage

            // Reset processor
            this.sbomProcessor.reset();
            this.sbomProcessor.setTotalRepositories(1);

            // Phase 1: Process SBOM
            this.updateProgress(10, 'Processing SBOM data...');
            const success = await this.sbomProcessor.processSBOM(owner, repo, data, null, false);
            
            if (!success) {
                throw new Error('Failed to process SBOM data');
            }
            this.sbomProcessor.updateProgress(true);

            // Phase 2: Resolve dependency trees
            this.updateProgress(30, 'Resolving dependency trees...');
            await this.sbomProcessor.resolveFullDependencyTrees((progress) => {
                if (progress.phase === 'resolving-package') {
                    const pct = 30 + (progress.processed / progress.total) * 20;
                    this.updateProgress(pct, `Resolving ${progress.packageName || 'dependencies'}...`);
                }
            });

            // Phase 3: Vulnerability analysis
            this.updateProgress(50, 'Analyzing vulnerabilities...');
            if (window.osvService) {
                await this.sbomProcessor.analyzeVulnerabilities();
            } else {
                console.warn('⚠️ OSV service not available, skipping vulnerability analysis');
            }

            // Phase 4: License compliance
            this.updateProgress(70, 'Analyzing license compliance...');
            this.sbomProcessor.analyzeLicenseCompliance();

            // Phase 5: Export and save
            this.updateProgress(85, 'Saving results...');
            const results = this.sbomProcessor.exportData();
            
            // Add upload metadata
            results.uploadInfo = {
                filename: this.currentFile?.name || 'unknown',
                format: this.parsedData.format,
                uploadedAt: new Date().toISOString()
            };

            // Save to IndexedDB
            await this.storageManager.saveResults(orgName, results);

            // Phase 6: Complete
            this.updateProgress(100, 'Analysis complete!');
            this.stopElapsedTimer();
            
            // Show results
            this.showResults(results, projectInfo);

            console.log('✅ SBOM analysis complete');

        } catch (error) {
            console.error('❌ Analysis failed:', error);
            this.showError(`Analysis failed: ${error.message}`);
            this.stopElapsedTimer();
        } finally {
            // Re-enable button
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Analysis';
            }
        }
    }

    showProgressSection() {
        const progressSection = document.getElementById('progressSection');
        if (progressSection) {
            progressSection.classList.remove('d-none');
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

    showResults(results, projectInfo) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsContent = document.getElementById('resultsContent');
        
        if (!resultsSection || !resultsContent) return;
        
        resultsSection.classList.remove('d-none');
        
        const stats = results.statistics || {};
        const vulnAnalysis = results.vulnerabilityAnalysis || {};
        const licenseAnalysis = results.licenseAnalysis || {};
        
        const vulnerableCount = vulnAnalysis.vulnerableDependencies?.length || 0;
        const criticalCount = vulnAnalysis.bySeverity?.critical || 0;
        const highCount = vulnAnalysis.bySeverity?.high || 0;
        
        // Use safeSetHTML if available, otherwise use textContent approach
        const html = `
            <div class="row">
                <div class="col-md-3 mb-3">
                    <div class="card bg-light">
                        <div class="card-body text-center">
                            <h3 class="text-primary">${stats.totalDependencies || 0}</h3>
                            <small class="text-muted">Dependencies</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card bg-light">
                        <div class="card-body text-center">
                            <h3 class="${vulnerableCount > 0 ? 'text-danger' : 'text-success'}">${vulnerableCount}</h3>
                            <small class="text-muted">Vulnerable</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card bg-light">
                        <div class="card-body text-center">
                            <h3 class="${criticalCount > 0 ? 'text-danger' : 'text-secondary'}">${criticalCount + highCount}</h3>
                            <small class="text-muted">Critical/High</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-3">
                    <div class="card bg-light">
                        <div class="card-body text-center">
                            <h3 class="text-info">${Object.keys(licenseAnalysis.byCategory || {}).length}</h3>
                            <small class="text-muted">License Types</small>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="alert alert-success mt-3">
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
