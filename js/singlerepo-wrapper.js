/**
 * Single Repository Analysis Wrapper
 * Reuses existing functionality without modification
 */
class SingleRepoAnalyzer {
    constructor() {
        this.githubClient = new GitHubClient();
        this.sbomProcessor = new SBOMProcessor();
        this.osvService = new OSVService();
        this.licenseProcessor = new LicenseProcessor();
        this.depsDevService = null; // Initialize when needed
        this.githubActionsService = new GitHubActionsService(this.githubClient); // Pass GitHub client for token access
        
        this.currentAnalysis = null;
        this.isAnalyzing = false;
        
        // Initialize dependency details properties
        this.allDependencyDetails = [];
        this.filteredDependencyDetails = [];
        this.currentDependencyPage = 1;
        this.dependencyPageSize = 25;
        this.dependencySortField = 'name';
        this.dependencySortDirection = 'asc';
        
        this.initializeApp();
    }

    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            // Initialize IndexedDB storage
            await singleRepoStorage.init();
            
            // Load previous analyses
            this.loadPreviousAnalyses();
            
            // Setup event listeners
            this.setupEventListeners();
            
            console.log('✅ SingleRepo Analyzer: Initialization complete');
        } catch (error) {
            console.error('❌ SingleRepo Analyzer: Initialization failed:', error);
            this.showAlert('Failed to initialize storage. Some features may not work properly.', 'warning');
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Repository URL input validation
        const repoUrlInput = document.getElementById('repoUrl');
        if (repoUrlInput) {
            repoUrlInput.addEventListener('input', (e) => {
                const url = e.target.value.trim();
                const analyzeBtn = document.getElementById('analyzeRepoBtn');
                if (analyzeBtn) {
                    analyzeBtn.disabled = !url || this.isAnalyzing;
                }
            });

            // Enter key support
            repoUrlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    startSingleRepoAnalysis();
                }
            });
        }

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
     * Parse GitHub repository URL
     * Supports: https://github.com/owner/repo, owner/repo, git@github.com:owner/repo.git, https://github.com/owner/repo/tree/branch
     */
    parseRepoUrl(url) {
        if (!url || !url.trim()) {
            throw new Error('Repository URL is required');
        }

        const cleanUrl = url.trim();
        
        // Pattern 1: https://github.com/owner/repo or https://github.com/owner/repo/tree/branch
        const httpsMatch = cleanUrl.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/.*)?$/);
        if (httpsMatch) {
            return {
                owner: httpsMatch[1],
                name: httpsMatch[2]
            };
        }
        
        // Pattern 2: git@github.com:owner/repo.git
        const sshMatch = cleanUrl.match(/^git@github\.com:([^\/]+)\/(.+?)(?:\.git)?$/);
        if (sshMatch) {
            return {
                owner: sshMatch[1],
                name: sshMatch[2].replace(/\.git$/, '')
            };
        }
        
        // Pattern 3: owner/repo
        const shortMatch = cleanUrl.match(/^([^\/\s]+)\/([^\/\s]+)$/);
        if (shortMatch) {
            return {
                owner: shortMatch[1],
                name: shortMatch[2]
            };
        }
        
        throw new Error('Invalid repository URL format. Supported formats: https://github.com/owner/repo, owner/repo, or git@github.com:owner/repo.git');
    }

    /**
     * Start single repository analysis
     */
    async startAnalysis(repoUrl) {
        if (this.isAnalyzing) {
            return;
        }

        try {
            // Parse repository URL
            const { owner, name } = this.parseRepoUrl(repoUrl);
            
            this.isAnalyzing = true;
            this.currentAnalysis = null;
            
            // Update UI
            this.showProgress(true);
            this.showResults(false);
            this.updateProgress(0, 'Initializing analysis...');
            
            // Set GitHub token if provided
            const token = document.getElementById('githubToken')?.value?.trim();
            if (token) {
                this.githubClient.setToken(token);
            }

            // Phase 1: Fetch repository information and SBOM (0-25%)
            this.updateProgress(5, 'Fetching repository information...');
            
            const repoInfo = await this.fetchRepositoryInfo(owner, name);
            this.displayRepositoryInfo(repoInfo);
            
            this.updateProgress(15, 'Fetching SBOM data...');
            
            const sbomData = await this.githubClient.fetchSBOM(owner, name);
            if (!sbomData) {
                throw new Error('SBOM data not available. Please ensure the dependency graph is enabled for this repository.');
            }

            // Process SBOM data
            this.updateProgress(25, 'Processing SBOM data...');
            this.sbomProcessor.reset();
            this.sbomProcessor.setTotalRepositories(1);
            
            const success = this.sbomProcessor.processSBOM(owner, name, sbomData);
            if (!success) {
                throw new Error('Failed to process SBOM data');
            }

            // Phase 2: Transitive dependency analysis (25-50%)
            this.updateProgress(30, 'Analyzing transitive dependencies...');
            
            let depsDevAnalysis = null;
            try {
                if (!this.depsDevService) {
                    this.depsDevService = new DepsDevService();
                }
                
                const dependencies = Array.from(this.sbomProcessor.dependencies.values()).map(dep => ({
                    name: dep.name,
                    version: dep.version,
                    ecosystem: dep.category ? dep.category.ecosystem : null, // Use ecosystem from SBOM processor
                    purl: dep.originalPackage ? this.extractPurlFromPackage(dep.originalPackage) : null
                }));

                if (dependencies.length > 0) {
                    depsDevAnalysis = await this.depsDevService.analyzeDependencies(dependencies, 
                        (progress, message) => {
                            const mappedProgress = 30 + (progress * 0.2); // 30-50% range
                            this.updateProgress(mappedProgress, message);
                        }
                    );
                    this.sbomProcessor.depsDevAnalysis = depsDevAnalysis;
                }
            } catch (error) {
                console.warn('⚠️ Transitive dependency analysis failed:', error);
            }

            // Phase 3: Vulnerability analysis (50-75%)
            this.updateProgress(50, 'Analyzing vulnerabilities...');
            
            let vulnerabilityAnalysis = null;
            try {
                vulnerabilityAnalysis = await this.sbomProcessor.analyzeVulnerabilities(
                    (progress, message) => {
                        const mappedProgress = 50 + (progress * 0.25); // 50-75% range
                        this.updateProgress(mappedProgress, message);
                    }
                );
            } catch (error) {
                console.warn('⚠️ Vulnerability analysis failed:', error);
            }

            // Phase 4: License compliance analysis (75-85%)
            this.updateProgress(75, 'Analyzing license compliance...');
            
            let licenseAnalysis = null;
            try {
                licenseAnalysis = this.sbomProcessor.analyzeLicenseCompliance(
                    (progress, message) => {
                        const mappedProgress = 75 + (progress * 0.10); // 75-85% range
                        this.updateProgress(mappedProgress, message);
                    }
                );
            } catch (error) {
                console.warn('⚠️ License compliance analysis failed:', error);
            }

            // Phase 5: Dependency drift analysis (85-95%)
            this.updateProgress(85, 'Checking for outdated dependencies...');
            
            let driftAnalysis = null;
            try {
                // Get all dependencies from the SBOM processor
                // Pass full dependency objects with all metadata (purl, ecosystem, etc.)
                const allDependencies = Array.from(this.sbomProcessor.dependencies.values());
                
                if (allDependencies.length > 0) {
                    console.log(`📊 Starting drift analysis with ${allDependencies.length} dependencies (including full metadata)`);
                    driftAnalysis = await this.analyzeDependencyDrift(allDependencies);
                } else {
                    console.log('No dependencies found for drift analysis');
                }
            } catch (error) {
                console.warn('⚠️ Dependency drift analysis failed:', error);
            }

            // Generate final results
            this.updateProgress(95, 'Generating analysis results...');
            
            const analysisData = {
                repository: { owner, name, info: repoInfo },
                sbomData: this.sbomProcessor.exportData(),
                depsDevAnalysis: depsDevAnalysis,
                vulnerabilityAnalysis: vulnerabilityAnalysis,
                licenseAnalysis: licenseAnalysis,
                driftAnalysis: driftAnalysis,
                timestamp: new Date().toISOString()
            };

            // Save to IndexedDB
            await singleRepoStorage.saveAnalysis(owner, name, analysisData);
            
            this.currentAnalysis = analysisData;
            this.updateProgress(100, 'Analysis complete!');
            
            // Display results
            this.displayResults(analysisData);
            this.loadPreviousAnalyses(); // Refresh the list
            
            console.log(`✅ Analysis complete for ${owner}/${name}`);
            
        } catch (error) {
            console.error('❌ Analysis failed:', error);
            this.showAlert(`Analysis failed: ${error.message}`, 'danger');
        } finally {
            this.isAnalyzing = false;
            this.showProgress(false);
            
            // Re-enable analyze button
            const analyzeBtn = document.getElementById('analyzeRepoBtn');
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
            }
        }
    }

    /**
     * Fetch repository information from GitHub API
     */
    async fetchRepositoryInfo(owner, name) {
        try {
            const url = `https://api.github.com/repos/${owner}/${name}`;
            const response = await this.githubClient.makeRequest(url);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Repository ${owner}/${name} not found or is private`);
                } else if (response.status === 403) {
                    throw new Error('Access denied. Repository may be private or require authentication.');
                } else {
                    throw new Error(`Failed to fetch repository information: ${response.status} ${response.statusText}`);
                }
            }
            
            return await response.json();
        } catch (error) {
            console.error(`❌ Failed to fetch repository info for ${owner}/${name}:`, error);
            throw error;
        }
    }

    /**
     * Extract PURL from package data (reuse existing function)
     */
    extractPurlFromPackage(pkg) {
        if (pkg.externalRefs) {
            const purlRef = pkg.externalRefs.find(ref => ref.referenceType === 'purl');
            if (purlRef && purlRef.referenceLocator) {
                return purlRef.referenceLocator;
            }
        }
        return null;
    }

    /**
     * Display repository information
     */
    displayRepositoryInfo(repoInfo) {
        const repoInfoSection = document.getElementById('repoInfoSection');
        const repoInfoContent = document.getElementById('repoInfoContent');
        
        if (!repoInfoSection || !repoInfoContent) return;

        const html = `
            <div class="row">
                <div class="col-md-8">
                    <h5>
                        <a href="${repoInfo.html_url}" target="_blank" class="text-decoration-none">
                            <i class="fab fa-github me-2"></i>${repoInfo.full_name}
                        </a>
                    </h5>
                    <p class="text-muted mb-2">${repoInfo.description || 'No description available'}</p>
                    <div class="d-flex gap-3 text-muted small">
                        <span><i class="fas fa-code me-1"></i>${repoInfo.language || 'Unknown'}</span>
                        <span><i class="fas fa-star me-1"></i>${repoInfo.stargazers_count.toLocaleString()} stars</span>
                        <span><i class="fas fa-code-branch me-1"></i>${repoInfo.forks_count.toLocaleString()} forks</span>
                        <span><i class="fas fa-eye me-1"></i>${repoInfo.watchers_count.toLocaleString()} watchers</span>
                    </div>
                </div>
                <div class="col-md-4 text-end">
                    <div class="text-muted small">
                        <div><strong>Created:</strong> ${new Date(repoInfo.created_at).toLocaleDateString()}</div>
                        <div><strong>Updated:</strong> ${new Date(repoInfo.updated_at).toLocaleDateString()}</div>
                        <div><strong>Size:</strong> ${(repoInfo.size / 1024).toFixed(1)} MB</div>
                        ${repoInfo.license ? `<div><strong>License:</strong> ${repoInfo.license.name}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        repoInfoContent.innerHTML = html;
        repoInfoSection.style.display = 'block';
    }

    /**
     * Display analysis results
     */
    displayResults(analysisData) {
        this.displayDependenciesOverview(analysisData);
        this.displayVulnerabilityAnalysis(analysisData);
        this.displayLicenseCompliance(analysisData);
        this.displayDependencyDetails(analysisData);
        
        this.showResults(true);
        this.showExportSection(true);
    }

    /**
     * Display dependencies overview
     */
    displayDependenciesOverview(analysisData) {
        const container = document.getElementById('dependenciesOverview');
        if (!container) return;

        const stats = analysisData.sbomData.statistics;
        const categoryStats = analysisData.sbomData.categoryStats;
        const languageStats = analysisData.sbomData.languageStats;

        let html = `
            <div class="row mb-3">
                <div class="col-md-3">
                    <div class="text-center">
                        <h3 class="text-primary mb-0">${stats.totalDependencies}</h3>
                        <small class="text-muted">Total Dependencies</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="text-center">
                        <h3 class="text-success mb-0">${categoryStats.code?.uniqueDependencies || 0}</h3>
                        <small class="text-muted">Code Dependencies</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="text-center">
                        <h3 class="text-info mb-0">${categoryStats.workflow?.uniqueDependencies || 0}</h3>
                        <small class="text-muted">Workflow Dependencies</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="text-center">
                        <h3 class="text-warning mb-0">${categoryStats.infrastructure?.uniqueDependencies || 0}</h3>
                        <small class="text-muted">Infrastructure Dependencies</small>
                    </div>
                </div>
            </div>
        `;

        // Add transitive dependencies info if available
        if (analysisData.depsDevAnalysis) {
            const depsDevStats = analysisData.depsDevAnalysis.summary;
            html += `
                <div class="alert alert-info">
                    <h6><i class="fas fa-sitemap me-2"></i>Transitive Dependencies</h6>
                    <div class="row">
                        <div class="col-md-4">
                            <strong>Direct:</strong> ${analysisData.depsDevAnalysis.totalDependencies}
                        </div>
                        <div class="col-md-4">
                            <strong>Transitive:</strong> ${depsDevStats.totalTransitiveDependencies}
                        </div>
                        <div class="col-md-4">
                            <strong>Average per package:</strong> ${depsDevStats.averageTransitiveDependencies.toFixed(1)}
                        </div>
                    </div>
                </div>
            `;
        }

        // Language breakdown
        if (languageStats && languageStats.length > 0) {
            html += `
                <div class="mt-3">
                    <h6>Languages & Ecosystems</h6>
                    <div class="d-flex flex-wrap gap-2">
                        ${languageStats.slice(0, 10).map(lang => `
                            <span class="badge bg-secondary">${lang.language} (${lang.uniqueDependencies})</span>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    /**
     * Display vulnerability analysis
     */
    displayVulnerabilityAnalysis(analysisData) {
        const container = document.getElementById('vulnerabilityAnalysis');
        if (!container) return;

        const vulnAnalysis = analysisData.vulnerabilityAnalysis;
        
        if (!vulnAnalysis) {
            container.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-shield-alt fa-2x mb-2"></i>
                    <p>Vulnerability analysis not available</p>
                </div>
            `;
            return;
        }

        const stats = vulnAnalysis;

        let html = `
            <div class="row mb-3">
                <div class="col-md-3 col-6">
                    <div class="text-center">
                        <h4 class="text-danger mb-0">${stats.vulnerablePackages}</h4>
                        <small class="text-muted">Vulnerable Packages</small>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="text-center">
                        <h4 class="text-warning mb-0">${stats.totalVulnerabilities}</h4>
                        <small class="text-muted">Total Vulnerabilities</small>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="text-center">
                        <h4 class="text-info mb-0">${stats.totalPackages}</h4>
                        <small class="text-muted">Total Packages</small>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="text-center">
                        <h4 class="text-success mb-0">${stats.totalPackages - stats.vulnerablePackages}</h4>
                        <small class="text-muted">Clean Packages</small>
                    </div>
                </div>
            </div>
        `;

        // Severity breakdown
        if (stats.totalVulnerabilities > 0) {
            html += `
                <div class="row text-center mb-3">
                    <div class="col-md-3 col-6 mb-2">
                        <div class="text-danger">
                            <strong>${stats.criticalVulnerabilities}</strong>
                            <br><small>Critical</small>
                        </div>
                    </div>
                    <div class="col-md-3 col-6 mb-2">
                        <div class="text-warning">
                            <strong>${stats.highVulnerabilities}</strong>
                            <br><small>High</small>
                        </div>
                    </div>
                    <div class="col-md-3 col-6 mb-2">
                        <div class="text-info">
                            <strong>${stats.mediumVulnerabilities}</strong>
                            <br><small>Medium</small>
                        </div>
                    </div>
                    <div class="col-md-3 col-6 mb-2">
                        <div class="text-secondary">
                            <strong>${stats.lowVulnerabilities}</strong>
                            <br><small>Low</small>
                        </div>
                    </div>
                </div>
            `;

            // Show detailed vulnerability information
            if (stats.vulnerableDependencies && stats.vulnerableDependencies.length > 0) {
                // Sort dependencies by highest severity first
                const sortedDependencies = this.sortVulnerableDependenciesBySeverity([...stats.vulnerableDependencies]);
                
                // Store all vulnerable dependencies for show all functionality
                this.allVulnerableDependencies = sortedDependencies;
                this.vulnerableDepDisplayLimit = 10;
                this.showingAllVulnerableDeps = false;

                html += `
                    <div class="mt-3">
                        <h6>🚨 Vulnerable Dependencies</h6>
                        <div class="vulnerable-deps-list" id="vulnerableDependenciesList">
                            <!-- Will be populated by renderVulnerableDependencies -->
                        </div>
                    </div>
                `;
            }
        } else {
            html += `
                <div class="alert alert-success text-center">
                    <i class="fas fa-check-circle me-2"></i>
                    No vulnerabilities found
                </div>
            `;
        }

        container.innerHTML = html;

        // Render vulnerable dependencies after HTML is inserted
        if (this.allVulnerableDependencies) {
            this.renderVulnerableDependencies();
        }
    }

    /**
     * Render vulnerable dependencies with show all functionality
     */
    renderVulnerableDependencies() {
        if (!this.allVulnerableDependencies) return;

        const container = document.getElementById('vulnerableDependenciesList');
        if (!container) return;

        const displayCount = this.showingAllVulnerableDeps ? 
            this.allVulnerableDependencies.length : 
            Math.min(this.vulnerableDepDisplayLimit, this.allVulnerableDependencies.length);

        const dependenciesToShow = this.allVulnerableDependencies.slice(0, displayCount);

        let html = '';
        dependenciesToShow.forEach((dep, index) => {
            // Sort vulnerabilities within each dependency by severity
            const sortedVulnerabilities = this.sortVulnerabilitiesBySeverity([...dep.vulnerabilities]);
            html += `
                <div class="vulnerable-dep-item">
                    <div class="vuln-dep-info">
                        <div class="vuln-dep-name">
                            <code>${dep.name}@${dep.version}</code> - ${dep.vulnerabilities.length} vulnerabilities
                        </div>
                        <div class="vuln-severity-badges">
                            ${sortedVulnerabilities.map(vuln => {
                                if (!vuln || typeof vuln !== 'object') return '';
                                const severity = vuln.severity || 'UNKNOWN';
                                const tooltip = `${vuln.id || 'Unknown ID'}\\n${vuln.summary || 'No summary'}`;
                                const cssSeverity = severity.toLowerCase() === 'moderate' ? 'medium' : severity.toLowerCase();
                                return `
                                    <span class="badge severity-${cssSeverity} clickable-severity-badge" 
                                          title="${tooltip}" 
                                          onclick="singleRepoAnalyzer.showVulnerabilityDetails('${dep.name}', '${dep.version}', [${JSON.stringify(vuln).replace(/"/g, '&quot;')}])">
                                        ${severity.toUpperCase()}
                                    </span>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    <div class="vuln-dep-actions">
                        <button class="btn btn-sm btn-outline-info" onclick="singleRepoAnalyzer.showVulnerabilityDetails('${dep.name}', '${dep.version}', ${JSON.stringify(sortedVulnerabilities).replace(/"/g, '&quot;')})">
                            <i class="fas fa-eye me-1"></i>View Details
                        </button>
                    </div>
                </div>
            `;
        });

        // Add show more/less button if needed
        if (this.allVulnerableDependencies.length > this.vulnerableDepDisplayLimit) {
            html += `
                <div class="text-center mt-3">
                    <button class="btn btn-outline-primary btn-sm" onclick="singleRepoAnalyzer.toggleVulnerableDependencies()">
                        ${this.showingAllVulnerableDeps ? 
                            `<i class="fas fa-chevron-up me-1"></i>Show Less` : 
                            `<i class="fas fa-chevron-down me-1"></i>Show All ${this.allVulnerableDependencies.length} Dependencies`
                        }
                    </button>
                    <div class="text-muted mt-1">
                        ${this.showingAllVulnerableDeps ? 
                            `Showing all ${this.allVulnerableDependencies.length} vulnerable dependencies` :
                            `Showing ${displayCount} of ${this.allVulnerableDependencies.length} vulnerable dependencies (sorted by severity)`
                        }
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    /**
     * Toggle showing all vulnerable dependencies
     */
    toggleVulnerableDependencies() {
        this.showingAllVulnerableDeps = !this.showingAllVulnerableDeps;
        this.renderVulnerableDependencies();
    }

    /**
     * Display license compliance
     */
    displayLicenseCompliance(analysisData) {
        const container = document.getElementById('licenseCompliance');
        if (!container) return;

        const licenseAnalysis = analysisData.licenseAnalysis;
        
        if (!licenseAnalysis) {
            container.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-balance-scale fa-2x mb-2"></i>
                    <p>License analysis not available</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="row mb-3">
                <div class="col-md-4 col-6">
                    <div class="text-center">
                        <h4 class="text-primary mb-0">${licenseAnalysis.totalLicenses || 0}</h4>
                        <small class="text-muted">Unique Licenses</small>
                    </div>
                </div>
                <div class="col-md-4 col-6">
                    <div class="text-center">
                        <h4 class="text-danger mb-0">${licenseAnalysis.conflicts?.length || 0}</h4>
                        <small class="text-muted">License Conflicts</small>
                    </div>
                </div>
                <div class="col-md-4 col-12">
                    <div class="text-center">
                        <h4 class="text-warning mb-0">${licenseAnalysis.highRiskDependencies?.length || 0}</h4>
                        <small class="text-muted">High-Risk Licenses</small>
                    </div>
                </div>
            </div>
        `;

        // License Details Table
        html += `
            <div class="mt-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0">
                        <i class="fas fa-table me-2"></i>License Details
                    </h6>
                    <div class="d-flex gap-2 align-items-center">
                        <small class="text-muted" id="licenseCount">${licenseAnalysis.summary?.licensedDependencies || 0} licensed dependencies</small>
                        <select class="form-select form-select-sm" id="licensePageSize" style="width: auto;">
                            <option value="10">10 per page</option>
                            <option value="25" selected>25 per page</option>
                            <option value="50">50 per page</option>
                            <option value="100">100 per page</option>
                        </select>
                    </div>
                </div>
                
                <!-- Filtering Controls -->
                <div class="p-3 border rounded mb-3">
                    <div class="row g-2">
                        <div class="col-md-3">
                            <label class="form-label small">Search Package</label>
                            <input type="text" class="form-control form-control-sm" id="licensePackageFilter" placeholder="Filter by package name...">
                        </div>
                        <div class="col-md-2">
                            <label class="form-label small">License Type</label>
                            <select class="form-select form-select-sm" id="licenseTypeFilter">
                                <option value="">All Licenses</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label small">Risk Level</label>
                            <select class="form-select form-select-sm" id="licenseRiskFilter">
                                <option value="">All Risk Levels</option>
                                <option value="high">High Risk</option>
                                <option value="medium">Medium Risk</option>
                                <option value="low">Low Risk</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small">Concern</label>
                            <select class="form-select form-select-sm" id="licenseConcernFilter">
                                <option value="">All Concerns</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label small">&nbsp;</label>
                            <button class="btn btn-outline-secondary btn-sm w-100" onclick="singleRepoAnalyzer.clearLicenseFilters()" title="Clear all filters">
                                <i class="fas fa-times me-1"></i>Clear
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="table-responsive">
                    <table class="table table-hover mb-0" id="licenseTable">
                        <thead class="table-dark">
                            <tr>
                                <th class="sortable" data-sort="name" style="cursor: pointer;">
                                    Package Name <i class="fas fa-sort ms-1"></i>
                                </th>
                                <th class="sortable" data-sort="version" style="cursor: pointer;">
                                    Version <i class="fas fa-sort ms-1"></i>
                                </th>
                                <th class="sortable" data-sort="license" style="cursor: pointer;">
                                    License <i class="fas fa-sort ms-1"></i>
                                </th>
                                <th class="sortable" data-sort="risk" style="cursor: pointer;">
                                    Risk Level <i class="fas fa-sort ms-1"></i>
                                </th>
                                <th class="sortable" data-sort="concern" style="cursor: pointer;">
                                    Concern <i class="fas fa-sort ms-1"></i>
                                </th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="licenseTableBody">
                            <!-- License rows will be populated here -->
                        </tbody>
                    </table>
                </div>
                
                <div class="d-flex justify-content-between align-items-center p-3 border-top">
                    <div class="text-muted" id="licensePaginationInfo">
                        Showing 0-0 of 0 licenses
                    </div>
                    <nav>
                        <ul class="pagination pagination-sm mb-0" id="licensePagination">
                            <!-- Pagination buttons will be populated here -->
                        </ul>
                    </nav>
                </div>
            </div>
        `;
        
        // License conflicts section (full width)
        if (licenseAnalysis.conflicts && licenseAnalysis.conflicts.length > 0) {
            // Store for show all functionality
            this.allLicenseConflicts = licenseAnalysis.conflicts;
            this.showingAllConflicts = false;
            
            html += `
                <div class="alert alert-danger mb-3">
                    <h6><i class="fas fa-times-circle me-2"></i>License Conflicts</h6>
                    <div class="small" id="licenseConflictsList">
                        <!-- Will be populated by renderLicenseConflicts -->
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="alert alert-success mb-3">
                    <h6><i class="fas fa-check-circle me-2"></i>License Conflicts</h6>
                    <div class="small">No license conflicts detected</div>
                </div>
            `;
        }

        container.innerHTML = html;

        // Initialize license table
        this.initializeLicenseTable(licenseAnalysis);
        
        // Render license conflicts if any
        if (this.allLicenseConflicts) {
            this.renderLicenseConflicts();
        }
    }

    /**
     * Initialize license table with data and functionality
     */
    initializeLicenseTable(licenseAnalysis) {
        if (!licenseAnalysis) return;

        // Prepare license data for table
        this.allLicenseData = [];
        
        // Get all dependencies from the current analysis
        const allDependencies = Array.from(this.sbomProcessor.dependencies.values());
        
        allDependencies.forEach(dep => {
            const licenseInfo = this.sbomProcessor.licenseProcessor.parseLicense(dep.originalPackage);
            
            if (licenseInfo.license && licenseInfo.license !== 'NOASSERTION') {
                const concern = licenseInfo.warnings && licenseInfo.warnings.length > 0 ? 
                    licenseInfo.warnings[0] : this.getDefaultLicenseConcern(licenseInfo.license);
                
                this.allLicenseData.push({
                    name: dep.name,
                    version: dep.version,
                    license: licenseInfo.license,
                    risk: licenseInfo.risk,
                    concern: concern,
                    category: licenseInfo.category,
                    originalPackage: dep.originalPackage,
                    warnings: licenseInfo.warnings || []
                });
            }
        });

        // Initialize table state
        this.licenseCurrentPage = 1;
        this.licensePageSize = 25;
        this.licenseSortField = 'name';
        this.licenseSortDirection = 'asc';
        this.licenseFilters = {
            package: '',
            licenseType: '',
            risk: '',
            concern: ''
        };

        // Populate filter dropdowns
        this.populateLicenseFilters();
        
        // Render initial table
        this.renderLicenseTable();
        
        // Add event listeners
        this.addLicenseTableEventListeners();
    }

    /**
     * Populate license filter dropdowns
     */
    populateLicenseFilters() {
        // Check if license data exists
        if (!this.allLicenseData || !Array.isArray(this.allLicenseData)) {
            console.warn('No license data available for filter population');
            return;
        }

        // License types
        const licenseTypes = [...new Set(this.allLicenseData.map(item => item.license))].sort();
        const licenseTypeSelect = document.getElementById('licenseTypeFilter');
        if (licenseTypeSelect) {
            licenseTypeSelect.innerHTML = '<option value="">All Licenses</option>' +
                licenseTypes.map(type => `<option value="${type}">${type}</option>`).join('');
        }

        // Concerns
        const concerns = [...new Set(this.allLicenseData.map(item => item.concern))].sort();
        const concernSelect = document.getElementById('licenseConcernFilter');
        if (concernSelect) {
            concernSelect.innerHTML = '<option value="">All Concerns</option>' +
                concerns.map(concern => `<option value="${concern}">${concern}</option>`).join('');
        }
    }

    /**
     * Render license table with current filters and sorting
     */
    renderLicenseTable() {
        // Check if license data exists
        if (!this.allLicenseData || !Array.isArray(this.allLicenseData)) {
            console.warn('No license data available for table rendering');
            return;
        }

        // Apply filters
        let filteredData = this.allLicenseData.filter(item => {
            return (!this.licenseFilters.package || item.name.toLowerCase().includes(this.licenseFilters.package.toLowerCase())) &&
                   (!this.licenseFilters.licenseType || item.license === this.licenseFilters.licenseType) &&
                   (!this.licenseFilters.risk || item.risk === this.licenseFilters.risk) &&
                   (!this.licenseFilters.concern || item.concern === this.licenseFilters.concern);
        });

        // Apply sorting
        filteredData.sort((a, b) => {
            let aVal = a[this.licenseSortField];
            let bVal = b[this.licenseSortField];
            
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (aVal < bVal) return this.licenseSortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.licenseSortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        // Pagination
        const totalItems = filteredData.length;
        const totalPages = Math.ceil(totalItems / this.licensePageSize);
        const startIndex = (this.licenseCurrentPage - 1) * this.licensePageSize;
        const endIndex = Math.min(startIndex + this.licensePageSize, totalItems);
        const pageData = filteredData.slice(startIndex, endIndex);

        // Update count
        const countElement = document.getElementById('licenseCount');
        if (countElement) {
            countElement.textContent = `${totalItems} licensed dependencies`;
        }

        // Render table body
        const tbody = document.getElementById('licenseTableBody');
        if (!tbody) return;

        tbody.innerHTML = pageData.map(item => {
            const riskColor = this.getLicenseRiskColor(item.license);
            const packageLicenseUrl = this.getPackageLicenseUrl(item);
            
            return `
                <tr>
                    <td><code>${item.name}</code></td>
                    <td><small class="text-muted">${item.version || 'N/A'}</small></td>
                    <td><span class="badge bg-${riskColor}">${item.license}</span></td>
                    <td><span class="badge bg-${riskColor}">${item.risk.toUpperCase()}</span></td>
                    <td><small class="text-muted">${item.concern}</small></td>
                    <td>
                        ${packageLicenseUrl ? 
                            `<a href="${packageLicenseUrl}" target="_blank" class="btn btn-sm btn-outline-info" title="View package license">
                                <i class="fas fa-external-link-alt me-1"></i>License
                            </a>` : 
                            '<span class="text-muted">N/A</span>'
                        }
                    </td>
                </tr>
            `;
        }).join('');

        // Update pagination info
        const paginationInfo = document.getElementById('licensePaginationInfo');
        if (paginationInfo) {
            paginationInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalItems} licenses`;
        }

        // Render pagination
        this.renderLicensePagination(totalPages);
    }

    /**
     * Render license pagination
     */
    renderLicensePagination(totalPages) {
        const pagination = document.getElementById('licensePagination');
        if (!pagination) return;

        let html = '';
        
        // Previous button
        html += `
            <li class="page-item ${this.licenseCurrentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="singleRepoAnalyzer.changeLicensePage(${this.licenseCurrentPage - 1}); return false;">Previous</a>
            </li>
        `;

        // Page numbers
        const startPage = Math.max(1, this.licenseCurrentPage - 2);
        const endPage = Math.min(totalPages, this.licenseCurrentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <li class="page-item ${i === this.licenseCurrentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="singleRepoAnalyzer.changeLicensePage(${i}); return false;">${i}</a>
                </li>
            `;
        }

        // Next button
        html += `
            <li class="page-item ${this.licenseCurrentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="singleRepoAnalyzer.changeLicensePage(${this.licenseCurrentPage + 1}); return false;">Next</a>
            </li>
        `;

        pagination.innerHTML = html;
    }

    /**
     * Add event listeners for license table
     */
    addLicenseTableEventListeners() {
        // Filter inputs
        const packageFilter = document.getElementById('licensePackageFilter');
        if (packageFilter) {
            packageFilter.addEventListener('input', (e) => {
                this.licenseFilters.package = e.target.value;
                this.licenseCurrentPage = 1;
                this.renderLicenseTable();
            });
        }

        const licenseTypeFilter = document.getElementById('licenseTypeFilter');
        if (licenseTypeFilter) {
            licenseTypeFilter.addEventListener('change', (e) => {
                this.licenseFilters.licenseType = e.target.value;
                this.licenseCurrentPage = 1;
                this.renderLicenseTable();
            });
        }

        const riskFilter = document.getElementById('licenseRiskFilter');
        if (riskFilter) {
            riskFilter.addEventListener('change', (e) => {
                this.licenseFilters.risk = e.target.value;
                this.licenseCurrentPage = 1;
                this.renderLicenseTable();
            });
        }

        const concernFilter = document.getElementById('licenseConcernFilter');
        if (concernFilter) {
            concernFilter.addEventListener('change', (e) => {
                this.licenseFilters.concern = e.target.value;
                this.licenseCurrentPage = 1;
                this.renderLicenseTable();
            });
        }

        // Page size selector
        const pageSizeSelect = document.getElementById('licensePageSize');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                this.licensePageSize = parseInt(e.target.value);
                this.licenseCurrentPage = 1;
                this.renderLicenseTable();
            });
        }

        // Sortable headers
        const sortableHeaders = document.querySelectorAll('#licenseTable .sortable');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                if (this.licenseSortField === sortField) {
                    this.licenseSortDirection = this.licenseSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.licenseSortField = sortField;
                    this.licenseSortDirection = 'asc';
                }
                
                // Update header icons
                sortableHeaders.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
                header.classList.add(`sort-${this.licenseSortDirection}`);
                
                this.renderLicenseTable();
            });
        });
    }

    /**
     * Change license table page
     */
    changeLicensePage(page) {
        // Check if license data exists
        if (!this.allLicenseData || !Array.isArray(this.allLicenseData)) {
            console.warn('No license data available - cannot change page');
            return;
        }

        this.licenseCurrentPage = page;
        this.renderLicenseTable();
    }

    /**
     * Clear all license filters
     */
    clearLicenseFilters() {
        // Check if license data exists
        if (!this.allLicenseData || !Array.isArray(this.allLicenseData)) {
            console.warn('No license data available - cannot clear filters');
            return;
        }

        this.licenseFilters = {
            package: '',
            licenseType: '',
            risk: '',
            concern: ''
        };
        
        // Reset form inputs (with null checks)
        const packageFilter = document.getElementById('licensePackageFilter');
        const typeFilter = document.getElementById('licenseTypeFilter');
        const riskFilter = document.getElementById('licenseRiskFilter');
        const concernFilter = document.getElementById('licenseConcernFilter');
        
        if (packageFilter) packageFilter.value = '';
        if (typeFilter) typeFilter.value = '';
        if (riskFilter) riskFilter.value = '';
        if (concernFilter) concernFilter.value = '';
        
        this.licenseCurrentPage = 1;
        this.renderLicenseTable();
    }

    /**
     * Render high-risk licenses with show all functionality
     */
    renderHighRiskLicenses() {
        console.log('🎨 Rendering high-risk licenses');
        console.log('allHighRiskLicenses:', this.allHighRiskLicenses);
        console.log('showingAllHighRisk:', this.showingAllHighRisk);
        
        if (!this.allHighRiskLicenses) {
            console.log('❌ No high-risk licenses data available');
            return;
        }

        const container = document.getElementById('highRiskLicensesList');
        if (!container) {
            console.log('❌ Container not found: highRiskLicensesList');
            return;
        }

        const displayCount = this.showingAllHighRisk ? 
            this.allHighRiskLicenses.length : 
            Math.min(5, this.allHighRiskLicenses.length);

        console.log(`📊 Displaying ${displayCount} out of ${this.allHighRiskLicenses.length} licenses`);

        const licensesToShow = this.allHighRiskLicenses.slice(0, displayCount);

        // Group licenses by license type
        const groupedLicenses = this.groupLicensesByType(licensesToShow);
        
        let html = this.renderGroupedHighRiskLicenses(groupedLicenses);

        // Add show more/less button if needed
        if (this.allHighRiskLicenses.length > 5) {
            html += `
                <div class="text-center mt-2">
                    <button class="btn btn-outline-warning btn-sm" id="toggleHighRiskBtn">
                        ${this.showingAllHighRisk ? 
                            `<i class="fas fa-chevron-up me-1"></i>Show Less` : 
                            `<i class="fas fa-chevron-down me-1"></i>Show All ${this.allHighRiskLicenses.length}`
                        }
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;

        // Add event listener for the button
        const toggleBtn = document.getElementById('toggleHighRiskBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                console.log('High-risk licenses toggle button clicked');
                this.toggleHighRiskLicenses();
            });
        }
    }

    /**
     * Group high-risk licenses by license type
     */
    groupLicensesByType(licenses) {
        const grouped = new Map();
        
        licenses.forEach(dep => {
            const licenseType = dep.license || 'Unknown';
            if (!grouped.has(licenseType)) {
                grouped.set(licenseType, []);
            }
            grouped.get(licenseType).push(dep);
        });
        
        // Sort groups by license name and sort packages within each group
        const sortedGroups = new Map([...grouped.entries()].sort());
        sortedGroups.forEach((packages, license) => {
            packages.sort((a, b) => a.name.localeCompare(b.name));
        });
        
        return sortedGroups;
    }

    /**
     * Render grouped high-risk licenses organized by concerns first
     */
    renderGroupedHighRiskLicenses(groupedLicenses) {
        // First, reorganize by concerns instead of license types
        const concernGroups = this.groupLicensesByConcern(groupedLicenses);
        
        let html = '';
        
        for (const [concern, licenseTypes] of concernGroups) {
            const concernColor = this.getConcernRiskColor(concern);
            const concernIcon = this.getConcernIcon(concern);
            
            // Count total packages under this concern
            const totalPackages = Array.from(licenseTypes.values()).reduce((sum, packages) => sum + packages.length, 0);
            
            html += `
                <div class="concern-group mb-4">
                    <div class="concern-header mb-3">
                        <div class="d-flex align-items-center mb-2">
                            <i class="${concernIcon} me-2 text-${concernColor}"></i>
                            <strong class="text-${concernColor} h6 mb-0">Concern: ${concern}</strong>
                            <span class="badge bg-${concernColor} ms-2">${totalPackages} package${totalPackages !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="concern-licenses ms-3">
            `;
            
            // Now render license types under this concern
            for (const [licenseType, packages] of licenseTypes) {
                const licenseColor = this.getLicenseRiskColor(licenseType);
                const licenseIcon = this.getLicenseIcon(licenseType);
                
                html += `
                    <div class="license-group mb-3">
                        <div class="license-group-header mb-2">
                            <div class="d-flex align-items-center mb-1">
                                <i class="${licenseIcon} me-2 text-${licenseColor}"></i>
                                <strong class="text-${licenseColor}">${licenseType}</strong>
                                <span class="badge bg-${licenseColor} ms-2">${packages.length}</span>
                            </div>
                        </div>
                        <div class="license-packages ms-3">
                `;
                
                packages.forEach(dep => {
                    const packageLicenseUrl = this.getPackageLicenseUrl(dep);
                    
                    html += `
                        <div class="package-item-simple d-flex justify-content-between align-items-center mb-1 py-1">
                            <div class="package-info-simple">
                                <code class="package-name">${dep.name}</code>
                                ${dep.version ? `<small class="text-muted ms-2">v${dep.version}</small>` : ''}
                            </div>
                            <div class="package-actions-simple">
                                ${packageLicenseUrl ? 
                                    `<a href="${packageLicenseUrl}" target="_blank" class="btn btn-sm btn-outline-info" title="View package license">
                                        <i class="fas fa-external-link-alt me-1"></i>License
                                    </a>` : ''
                                }
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
            
            html += `
                    </div>
                </div>
            `;
        }
        
        return html;
    }

    /**
     * Group licenses by concern/warning messages
     */
    groupLicensesByConcern(groupedLicenses) {
        const concernGroups = new Map();
        
        for (const [licenseType, packages] of groupedLicenses) {
            // Get the concern for this license type
            const firstPackage = packages[0];
            const concern = firstPackage?.warnings && firstPackage.warnings.length > 0 ? 
                firstPackage.warnings[0] : this.getDefaultLicenseConcern(licenseType);
            
            if (!concernGroups.has(concern)) {
                concernGroups.set(concern, new Map());
            }
            
            concernGroups.get(concern).set(licenseType, packages);
        }
        
        // Sort concerns by severity (most severe first)
        const sortedConcerns = new Map([...concernGroups.entries()].sort((a, b) => {
            const severityOrder = {
                'Network copyleft license with strict requirements': 1,
                'Copyleft license requiring source code disclosure': 2,
                'Lesser GPL with linking restrictions': 3,
                'Weak copyleft license requiring file-level disclosure': 4,
                'Eclipse license with patent provisions': 5,
                'License not specified - requires investigation': 6,
                'Complex license combination detected': 7,
                'License requires review': 8
            };
            
            const severityA = severityOrder[a[0]] || 9;
            const severityB = severityOrder[b[0]] || 9;
            
            return severityA - severityB;
        }));
        
        return sortedConcerns;
    }

    /**
     * Get default concern message for license type
     */
    getDefaultLicenseConcern(licenseType) {
        const concerns = {
            'GPL-2.0': 'Copyleft license requiring source code disclosure',
            'GPL-3.0': 'Copyleft license requiring source code disclosure',
            'GPL-2.0-only': 'Copyleft license requiring source code disclosure',
            'GPL-2.0-or-later': 'Copyleft license requiring source code disclosure',
            'GPL-3.0-only': 'Copyleft license requiring source code disclosure',
            'GPL-3.0-or-later': 'Copyleft license requiring source code disclosure',
            'AGPL-3.0': 'Network copyleft license with strict requirements',
            'LGPL-2.1': 'Lesser GPL with linking restrictions',
            'LGPL-3.0': 'Lesser GPL with linking restrictions',
            'MPL-2.0': 'Weak copyleft license requiring file-level disclosure',
            'EPL-2.0': 'Eclipse license with patent provisions',
            'NOASSERTION': 'License not specified - requires investigation',
            'UNKNOWN': 'License not specified - requires investigation',
            'NONE': 'License not specified - requires investigation',
            '': 'License not specified - requires investigation'
        };
        
        // Handle complex license combinations
        if (licenseType.includes(' AND ') || licenseType.includes(' OR ')) {
            return 'Complex license combination detected';
        }
        
        return concerns[licenseType] || 'License requires review';
    }

    /**
     * Get color class for concern risk level
     */
    getConcernRiskColor(concern) {
        const concernColors = {
            'Network copyleft license with strict requirements': 'danger',
            'Copyleft license requiring source code disclosure': 'danger',
            'Lesser GPL with linking restrictions': 'warning',
            'Weak copyleft license requiring file-level disclosure': 'warning',
            'Eclipse license with patent provisions': 'warning',
            'License not specified - requires investigation': 'danger',
            'Complex license combination detected': 'warning',
            'License requires review': 'warning'
        };
        
        return concernColors[concern] || 'warning';
    }

    /**
     * Get icon for concern type
     */
    getConcernIcon(concern) {
        const concernIcons = {
            'Network copyleft license with strict requirements': 'fas fa-ban',
            'Copyleft license requiring source code disclosure': 'fas fa-exclamation-triangle',
            'Lesser GPL with linking restrictions': 'fas fa-exclamation-circle',
            'Weak copyleft license requiring file-level disclosure': 'fas fa-info-circle',
            'Eclipse license with patent provisions': 'fas fa-info-circle',
            'License not specified - requires investigation': 'fas fa-question-circle',
            'Complex license combination detected': 'fas fa-code-branch',
            'License requires review': 'fas fa-search'
        };
        
        return concernIcons[concern] || 'fas fa-exclamation-triangle';
    }

    /**
     * Generate package-specific license URL based on ecosystem and package name
     */
    getPackageLicenseUrl(dep) {
        if (!dep || !dep.name) {
            return null;
        }
        
        // Try to determine ecosystem from dependency data
        let ecosystem = null;
        
        // Check if we have ecosystem info from deps.dev enrichment
        if (this.currentAnalysis?.depsDevAnalysis?.enrichedDependenciesArray && 
            Array.isArray(this.currentAnalysis.depsDevAnalysis.enrichedDependenciesArray)) {
            const enrichedDep = this.currentAnalysis.depsDevAnalysis.enrichedDependenciesArray.find(
                enriched => enriched.name === dep.name && enriched.version === dep.version
            );
            if (enrichedDep?.ecosystem) {
                ecosystem = enrichedDep.ecosystem;
            }
        }
        
        // Fallback: try to extract from original package PURL
        if (!ecosystem && dep.originalPackage?.externalRefs) {
            const purlRef = dep.originalPackage.externalRefs.find(ref => ref.referenceType === 'purl');
            if (purlRef && purlRef.referenceLocator) {
                const purl = purlRef.referenceLocator;
                const purlParts = purl.split('/');
                if (purlParts.length >= 2) {
                    ecosystem = purlParts[0].replace('pkg:', '');
                }
            }
        }
        
        if (!ecosystem) {
            return null;
        }
        
        // Generate ecosystem-specific license URLs
        switch (ecosystem.toLowerCase()) {
            case 'npm':
                return `https://www.npmjs.com/package/${dep.name}?activeTab=readme`;
                
            case 'pypi':
                return `https://pypi.org/project/${dep.name}/`;
                
            case 'maven':
                // Maven packages often have group:artifact format
                const [groupId, artifactId] = dep.name.includes(':') ? dep.name.split(':') : ['', dep.name];
                if (groupId && artifactId) {
                    return `https://mvnrepository.com/artifact/${groupId}/${artifactId}`;
                }
                return `https://search.maven.org/search?q=a:${dep.name}`;
                
            case 'nuget':
                return `https://www.nuget.org/packages/${dep.name}/`;
                
            case 'cargo':
                return `https://crates.io/crates/${dep.name}`;
                
            case 'go':
            case 'golang':
                return `https://pkg.go.dev/${dep.name}`;
                
            case 'composer':
                return `https://packagist.org/packages/${dep.name}`;
                
            case 'rubygems':
                return `https://rubygems.org/gems/${dep.name}`;
                
            default:
                // For unknown ecosystems, try to construct a generic search URL
                return `https://github.com/search?q=${encodeURIComponent(dep.name)}&type=repositories`;
        }
    }

    /**
     * Get repository URL from current analysis
     */
    getRepositoryUrl() {
        if (!this.currentAnalysis?.repository) {
            return null;
        }
        
        const { owner, name } = this.currentAnalysis.repository;
        return `https://github.com/${owner}/${name}`;
    }

    /**
     * Get repository license URL
     */
    getRepositoryLicenseUrl(repoUrl) {
        if (!repoUrl) {
            return null;
        }
        
        return `${repoUrl}/blob/main/LICENSE`;
    }

    /**
     * Get color class for license risk level
     */
    getLicenseRiskColor(licenseType) {
        // Map common high-risk licenses to appropriate colors
        const riskColors = {
            'GPL-2.0': 'danger',
            'GPL-3.0': 'danger',
            'GPL-2.0-only': 'danger',
            'GPL-2.0-or-later': 'danger',
            'GPL-3.0-only': 'danger',
            'GPL-3.0-or-later': 'danger',
            'AGPL-3.0': 'danger',
            'LGPL-2.1': 'warning',
            'LGPL-3.0': 'warning',
            'MPL-2.0': 'warning',
            'EPL-2.0': 'warning',
            'NOASSERTION': 'danger',
            'UNKNOWN': 'danger',
            'NONE': 'danger',
            '': 'danger'
        };
        
        return riskColors[licenseType] || 'warning';
    }

    /**
     * Get icon for license type
     */
    getLicenseIcon(licenseType) {
        // Map license types to appropriate icons
        const licenseIcons = {
            'GPL-2.0': 'fas fa-exclamation-triangle',
            'GPL-3.0': 'fas fa-exclamation-triangle',
            'GPL-2.0-only': 'fas fa-exclamation-triangle',
            'GPL-2.0-or-later': 'fas fa-exclamation-triangle',
            'GPL-3.0-only': 'fas fa-exclamation-triangle',
            'GPL-3.0-or-later': 'fas fa-exclamation-triangle',
            'AGPL-3.0': 'fas fa-ban',
            'LGPL-2.1': 'fas fa-exclamation-circle',
            'LGPL-3.0': 'fas fa-exclamation-circle',
            'MPL-2.0': 'fas fa-info-circle',
            'EPL-2.0': 'fas fa-info-circle',
            'NOASSERTION': 'fas fa-question-circle',
            'UNKNOWN': 'fas fa-question-circle',
            'NONE': 'fas fa-question-circle',
            '': 'fas fa-question-circle'
        };
        
        return licenseIcons[licenseType] || 'fas fa-exclamation-triangle';
    }

    /**
     * Toggle showing all high-risk licenses
     */
    toggleHighRiskLicenses() {
        console.log('🔄 Toggling high-risk licenses display');
        console.log('Current showingAllHighRisk:', this.showingAllHighRisk);
        console.log('All high-risk licenses count:', this.allHighRiskLicenses?.length);
        
        this.showingAllHighRisk = !this.showingAllHighRisk;
        
        console.log('New showingAllHighRisk:', this.showingAllHighRisk);
        
        this.renderHighRiskLicenses();
    }

    /**
     * Toggle showing all license conflicts
     */
    toggleLicenseConflicts() {
        this.showingAllConflicts = !this.showingAllConflicts;
        this.renderLicenseConflicts();
    }

    /**
     * Render license conflicts with show all functionality
     */
    renderLicenseConflicts() {
        if (!this.allLicenseConflicts) return;

        const container = document.getElementById('licenseConflictsList');
        if (!container) return;

        const displayCount = this.showingAllConflicts ? 
            this.allLicenseConflicts.length : 
            Math.min(5, this.allLicenseConflicts.length);

        const conflictsToShow = this.allLicenseConflicts.slice(0, displayCount);

        let html = conflictsToShow.map(conflict => 
            `<div class="mb-2">
                <div class="fw-bold">${conflict.type || 'Conflict'}</div>
                <div class="text-muted">${conflict.description || 'License compatibility issue detected'}</div>
            </div>`
        ).join('');

        // Add show more/less button if needed
        if (this.allLicenseConflicts.length > 5) {
            html += `
                <div class="text-center mt-2">
                    <button class="btn btn-outline-danger btn-sm" id="toggleLicenseConflictsBtn">
                        ${this.showingAllConflicts ? 
                            `<i class="fas fa-chevron-up me-1"></i>Show Less` : 
                            `<i class="fas fa-chevron-down me-1"></i>Show All ${this.allLicenseConflicts.length}`
                        }
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;

        // Add event listener for the button
        const toggleBtn = document.getElementById('toggleLicenseConflictsBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                console.log('License conflicts toggle button clicked');
                this.toggleLicenseConflicts();
            });
        }
    }

    /**
     * Toggle showing all license conflicts
     */
    toggleLicenseConflicts() {
        this.showingAllConflicts = !this.showingAllConflicts;
        this.renderLicenseConflicts();
    }

    /**
     * Rerun vulnerability analysis only
     */
    async rerunVulnerabilityAnalysis() {
        if (!this.currentAnalysis || !this.currentAnalysis.sbomData) {
            this.showAlert('No SBOM data available. Please run full analysis first.', 'warning');
            return;
        }

        try {
            // Show loading state
            const container = document.getElementById('vulnerabilityAnalysis');
            container.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Rerunning vulnerability analysis...</span>
                    </div>
                    <p class="mt-2">Rerunning vulnerability analysis...</p>
                </div>
            `;

            // Rerun vulnerability analysis using the SBOM processor
            const vulnerabilityAnalysis = await this.sbomProcessor.analyzeVulnerabilities(
                (progress, message) => {
                    // Update the loading message in the container during rerun
                    const container = document.getElementById('vulnerabilityAnalysis');
                    if (container) {
                        container.innerHTML = `
                            <div class="text-center">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Rerunning vulnerability analysis...</span>
                                </div>
                                <p class="mt-2">${message}</p>
                                <div class="progress mt-2" style="height: 1rem;">
                                    <div class="progress-bar" style="width: ${progress}%">${Math.round(progress)}%</div>
                                </div>
                            </div>
                        `;
                    }
                }
            );
            
            // Update the analysis data
            this.currentAnalysis.vulnerabilityAnalysis = vulnerabilityAnalysis;
            
            // Re-display the results
            this.displayVulnerabilityAnalysis(this.currentAnalysis);
            
            // Save updated analysis
            const { owner, name } = this.currentAnalysis.repository;
            await singleRepoStorage.saveAnalysis(owner, name, this.currentAnalysis);
            
            this.showAlert('Vulnerability analysis updated successfully!', 'success');
        } catch (error) {
            console.error('Error rerunning vulnerability analysis:', error);
            this.showAlert('Failed to rerun vulnerability analysis: ' + error.message, 'danger');
        }
    }

    /**
     * Rerun license analysis only
     */
    async rerunLicenseAnalysis() {
        if (!this.currentAnalysis || !this.currentAnalysis.sbomData) {
            this.showAlert('No SBOM data available. Please run full analysis first.', 'warning');
            return;
        }

        try {
            // Show loading state
            const container = document.getElementById('licenseCompliance');
            container.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-success" role="status">
                        <span class="visually-hidden">Rerunning license analysis...</span>
                    </div>
                    <p class="mt-2">Rerunning license analysis...</p>
                </div>
            `;

            // Rerun license analysis using the SBOM processor
            const licenseAnalysis = this.sbomProcessor.analyzeLicenseCompliance(
                (progress, message) => {
                    // Update the loading message in the container during rerun
                    const container = document.getElementById('licenseCompliance');
                    if (container) {
                        container.innerHTML = `
                            <div class="text-center">
                                <div class="spinner-border text-success" role="status">
                                    <span class="visually-hidden">Rerunning license analysis...</span>
                                </div>
                                <p class="mt-2">${message}</p>
                                <div class="progress mt-2" style="height: 1rem;">
                                    <div class="progress-bar bg-success" style="width: ${progress}%">${Math.round(progress)}%</div>
                                </div>
                            </div>
                        `;
                    }
                }
            );
            
            // Update the analysis data
            this.currentAnalysis.licenseAnalysis = licenseAnalysis;
            
            // Re-display the results
            this.displayLicenseCompliance(this.currentAnalysis);
            
            // Save updated analysis
            const { owner, name } = this.currentAnalysis.repository;
            await singleRepoStorage.saveAnalysis(owner, name, this.currentAnalysis);
            
            this.showAlert('License analysis updated successfully!', 'success');
        } catch (error) {
            console.error('Error rerunning license analysis:', error);
            this.showAlert('Failed to rerun license analysis: ' + error.message, 'danger');
        }
    }

    /**
     * Rerun dependency drift analysis only
     */
    async rerunDependencyDrift() {
        if (!this.currentAnalysis || !this.currentAnalysis.sbomData) {
            this.showAlert('No SBOM data available. Please run full analysis first.', 'warning');
            return;
        }

        try {
            // Show loading state
            const container = document.getElementById('dependencyDrift');
            container.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border text-warning" role="status">
                        <span class="visually-hidden">Rerunning dependency drift analysis...</span>
                    </div>
                    <p class="mt-2">Rerunning dependency drift analysis...</p>
                </div>
            `;

            // Rerun dependency drift analysis
            // Pass full dependency objects with all metadata (purl, ecosystem, etc.)
            const dependencies = Array.from(this.sbomProcessor.dependencies.values());

            const driftAnalysis = await this.analyzeDependencyDrift(dependencies);
            
            // Update the analysis data
            this.currentAnalysis.driftAnalysis = driftAnalysis;
            
            // Re-display the results
            this.displayDependencyDrift(this.currentAnalysis);
            
            // Save updated analysis
            const { owner, name } = this.currentAnalysis.repository;
            await singleRepoStorage.saveAnalysis(owner, name, this.currentAnalysis);
            
            this.showAlert('Dependency drift analysis updated successfully!', 'success');
        } catch (error) {
            console.error('Error rerunning dependency drift analysis:', error);
            this.showAlert('Failed to rerun dependency drift analysis: ' + error.message, 'danger');
        }
    }

    /**
     * Display dependency details
     */
    displayDependencyDetails(analysisData) {
        const dependencies = analysisData.sbomData.allDependencies || [];
        const driftAnalysis = analysisData.driftAnalysis;
        const vulnerabilityAnalysis = analysisData.vulnerabilityAnalysis;
        
        if (dependencies.length === 0) {
            const tableBody = document.getElementById('dependencyTableBody');
            const countElement = document.getElementById('dependencyCount');
            const paginationInfo = document.getElementById('dependencyPaginationInfo');
            const pagination = document.getElementById('dependencyPagination');
            
            if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No dependencies found</td></tr>';
            if (countElement) countElement.textContent = '0 dependencies';
            if (paginationInfo) paginationInfo.textContent = 'Showing 0-0 of 0 dependencies';
            if (pagination) pagination.innerHTML = '';
            return;
        }

        // Enrich dependencies with drift and vulnerability data
        const enrichedDependencies = dependencies.map(dep => {
            // Find drift data from all dependencies (both outdated and up-to-date)
            const driftInfo = driftAnalysis?.allDependencies?.find(d => d.name === dep.name);
            
            // Find vulnerability data
            const vulnInfo = vulnerabilityAnalysis?.vulnerableDependencies?.find(v => v.name === dep.name);
            
            // Use enhanced version status if drift info is available
            let versionStatus = 'unknown';
            let statusMessage = 'Unknown';
            let statusDetails = '';
            let latestVersion = null;
            let isOutdated = false;
            
            if (driftInfo) {
                versionStatus = driftInfo.status || 'unknown';
                statusMessage = driftInfo.statusMessage || 'Unknown';
                statusDetails = driftInfo.statusDetails || '';
                latestVersion = driftInfo.latestVersion;
                isOutdated = driftInfo.isOutdated || false;
            }
            
            return {
                ...dep,
                latestVersion: latestVersion,
                isOutdated: isOutdated,
                versionStatus: versionStatus,
                statusMessage: statusMessage,
                statusDetails: statusDetails,
                vulnerabilityCount: vulnInfo?.vulnerabilities?.length || 0,
                vulnerabilities: vulnInfo?.vulnerabilities || [],
                highestSeverity: vulnInfo ? this.getHighestVulnerabilitySeverity(vulnInfo.vulnerabilities) : null
            };
        });

        // Store for pagination and filtering
        this.allDependencyDetails = enrichedDependencies;
        this.filteredDependencyDetails = enrichedDependencies;
        this.currentDependencyPage = 1;
        this.dependencyPageSize = parseInt(document.getElementById('dependencyPageSize')?.value || '25');
        this.dependencySortField = 'name';
        this.dependencySortDirection = 'asc';

        // Initialize filter options
        this.populateFilterOptions(enrichedDependencies);

        // Update count
        const countElement = document.getElementById('dependencyCount');
        if (countElement) {
            countElement.textContent = `${dependencies.length} dependencies`;
        }

        // Render first page
        this.renderDependencyDetailsPage();
        this.setupDependencyDetailsSorting();
        this.setupDependencyDetailsPagination();
        this.setupDependencyFiltering();
    }

    /**
     * Render dependency details page with pagination and sorting
     */
    renderDependencyDetailsPage() {
        // Ensure filtered dependency details are initialized
        if (!this.filteredDependencyDetails) {
            if (this.allDependencyDetails && Array.isArray(this.allDependencyDetails)) {
                console.log('🔄 Initializing filtered dependency details from all dependency details');
                this.filteredDependencyDetails = [...this.allDependencyDetails];
            } else {
                console.warn('❌ No dependency details available to render');
                return;
            }
        }

        // Sort dependencies
        const sortedDependencies = [...this.filteredDependencyDetails].sort((a, b) => {
            let aVal = a[this.dependencySortField];
            let bVal = b[this.dependencySortField];
            
            // Handle special sorting cases
            if (this.dependencySortField === 'vulnerabilities') {
                aVal = a.vulnerabilityCount;
                bVal = b.vulnerabilityCount;
                
                // Numeric comparison for vulnerability counts
                const result = (aVal || 0) - (bVal || 0);
                return this.dependencySortDirection === 'asc' ? result : -result;
                
            } else if (this.dependencySortField === 'versionStatus') {
                aVal = a.versionStatus;
                bVal = b.versionStatus;
            } else if (this.dependencySortField === 'ecosystem') {
                aVal = a.category?.ecosystem;
                bVal = b.category?.ecosystem;
            } else if (this.dependencySortField === 'language') {
                aVal = a.category?.language;
                bVal = b.category?.language;
            }
            
            // Convert to strings for comparison (for non-numeric fields)
            aVal = String(aVal || '').toLowerCase();
            bVal = String(bVal || '').toLowerCase();
            
            const result = aVal.localeCompare(bVal);
            return this.dependencySortDirection === 'asc' ? result : -result;
        });

        // Paginate
        const startIndex = (this.currentDependencyPage - 1) * this.dependencyPageSize;
        const endIndex = startIndex + this.dependencyPageSize;
        const pageData = sortedDependencies.slice(startIndex, endIndex);

        // Render table body
        const tableBody = document.getElementById('dependencyTableBody');
        if (!tableBody) return;

        let html = '';
        pageData.forEach(dep => {
            const ecosystemBadge = this.getEcosystemBadge(dep.category?.ecosystem);
            const vulnerabilityBadge = dep.vulnerabilityCount > 0 ? 
                `<span class="badge bg-danger">${dep.vulnerabilityCount}</span>` : 
                `<span class="badge bg-success">0</span>`;
            
            // Enhanced version display with constraints
            const { constraint } = this.extractVersionConstraint(dep.version);
            const constraintDisplay = constraint ? `<span class="version-constraint">${constraint}</span>` : '';
            
            // Truncate long SHAs (commit hashes) for display
            const displayVersion = this.truncateSHA(dep.version);
            
            const versionInfo = dep.isOutdated ? 
                `${constraintDisplay}<span class="badge bg-warning text-dark ms-1" title="${dep.version}">${displayVersion}</span>` :
                `${constraintDisplay}<span class="badge bg-success ms-1" title="${dep.version}">${displayVersion}</span>`;
            
            // Enhanced version status display
            // Use pre-computed status if available (e.g., from GitHub Actions service)
            let versionStatusBadge;
            if (dep.statusMessage) {
                // Use pre-computed status (from GitHub Actions or other specialized services)
                const badgeColor = this.getStatusBadgeColor(dep.status);
                versionStatusBadge = `<span class="badge bg-${badgeColor}">${dep.statusMessage}</span>`;
                if (dep.statusDetails) {
                    versionStatusBadge += `<br><small class="text-muted">${dep.statusDetails}</small>`;
                }
            } else {
                // Fallback to constraint-aware semantic versioning
                const enhancedStatus = this.getEnhancedVersionStatus(dep.version, dep.latestVersion);
                versionStatusBadge = `<span class="badge bg-${enhancedStatus.badge}">${enhancedStatus.message}</span>`;
                if (enhancedStatus.details) {
                    versionStatusBadge += `<br><small class="text-muted">${enhancedStatus.details}</small>`;
                }
            }

            html += `
                <tr>
                    <td>
                        <code class="package-name-clickable" style="cursor: pointer; color: var(--cyfinoid-accent);" 
                              onclick="singleRepoAnalyzer.showPackageDetails('${dep.name.replace(/'/g, "\\'")}', '${dep.version}', '${dep.category?.ecosystem || 'Unknown'}')"
                              title="Click for package details">
                            ${dep.name}
                        </code>
                    </td>
                    <td>${versionInfo}</td>
                    <td>${ecosystemBadge}</td>
                    <td>${vulnerabilityBadge}</td>
                    <td><span class="badge bg-secondary">${dep.category?.language || 'Unknown'}</span></td>
                    <td>${versionStatusBadge}</td>
                    <td>
                        ${dep.vulnerabilityCount > 0 ? 
                            `<button class="btn btn-sm btn-outline-danger view-vuln-btn" data-package-name="${dep.name.replace(/"/g, '&quot;')}">
                                <i class="fas fa-bug me-1"></i>View
                            </button>` : 
                            `<span class="text-muted">Clean</span>`
                        }
                    </td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;

        // Add event listeners for vulnerability view buttons
        const vulnButtons = document.querySelectorAll('.view-vuln-btn');
        vulnButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const packageName = e.target.closest('button').getAttribute('data-package-name');
                if (packageName) {
                    console.log(`🔍 View vulnerabilities clicked for: ${packageName}`);
                    this.showDependencyVulnerabilities(packageName);
                }
            });
        });

        // Update pagination info
        const paginationInfo = document.getElementById('dependencyPaginationInfo');
        if (paginationInfo) {
            const total = sortedDependencies.length;
            const start = Math.min(startIndex + 1, total);
            const end = Math.min(endIndex, total);
            const filteredText = this.filteredDependencyDetails.length !== this.allDependencyDetails.length ? 
                ` (filtered from ${this.allDependencyDetails.length})` : '';
            paginationInfo.textContent = `Showing ${start}-${end} of ${total} dependencies${filteredText}`;
        }

        // Update pagination controls
        this.renderDependencyPagination(sortedDependencies.length);
    }

    /**
     * Setup dependency details sorting
     */
    setupDependencyDetailsSorting() {
        const sortableHeaders = document.querySelectorAll('#dependencyTable .sortable');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                
                if (this.dependencySortField === sortField) {
                    this.dependencySortDirection = this.dependencySortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.dependencySortField = sortField;
                    this.dependencySortDirection = 'asc';
                }
                
                // Update header classes
                sortableHeaders.forEach(h => {
                    h.classList.remove('sort-asc', 'sort-desc');
                });
                header.classList.add(`sort-${this.dependencySortDirection}`);
                
                this.renderDependencyDetailsPage();
            });
        });

        // Setup page size change
        const pageSizeSelect = document.getElementById('dependencyPageSize');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', () => {
                this.dependencyPageSize = parseInt(pageSizeSelect.value);
                this.currentDependencyPage = 1;
                this.renderDependencyDetailsPage();
            });
        }
    }

    /**
     * Setup dependency details pagination
     */
    setupDependencyDetailsPagination() {
        // This will be called by renderDependencyPagination
    }

    /**
     * Render dependency pagination controls
     */
    renderDependencyPagination(totalItems) {
        const pagination = document.getElementById('dependencyPagination');
        if (!pagination) return;

        const totalPages = Math.ceil(totalItems / this.dependencyPageSize);
        
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let html = '';
        
        // Previous button
        html += `
            <li class="page-item ${this.currentDependencyPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="singleRepoAnalyzer.changeDependencyPage(${this.currentDependencyPage - 1}); return false;">
                    <i class="fas fa-chevron-left"></i>
                </a>
            </li>
        `;
        
        // Page numbers
        const startPage = Math.max(1, this.currentDependencyPage - 2);
        const endPage = Math.min(totalPages, this.currentDependencyPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            html += `
                <li class="page-item ${i === this.currentDependencyPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="singleRepoAnalyzer.changeDependencyPage(${i}); return false;">
                        ${i}
                    </a>
                </li>
            `;
        }
        
        // Next button
        html += `
            <li class="page-item ${this.currentDependencyPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="singleRepoAnalyzer.changeDependencyPage(${this.currentDependencyPage + 1}); return false;">
                    <i class="fas fa-chevron-right"></i>
                </a>
            </li>
        `;
        
        pagination.innerHTML = html;
    }

    /**
     * Change dependency details page
     */
    changeDependencyPage(page) {
        // Validate that we have filtered dependency details
        if (!this.filteredDependencyDetails || !Array.isArray(this.filteredDependencyDetails)) {
            console.warn('No filtered dependency details available for pagination');
            return;
        }

        const totalPages = Math.ceil(this.filteredDependencyDetails.length / this.dependencyPageSize);
        
        if (page >= 1 && page <= totalPages) {
            this.currentDependencyPage = page;
            this.renderDependencyDetailsPage();
        } else {
            console.warn(`Invalid page number: ${page}. Valid range: 1-${totalPages}`);
        }
    }

    /**
     * Show package details modal
     */
    showPackageDetails(packageName, version, ecosystem) {
        console.log(`📦 Showing package details for: ${packageName}@${version} (${ecosystem})`);
        
        // Find the dependency in our data
        const dep = this.allDependencyDetails?.find(d => d.name === packageName);
        
        // Generate package URLs
        const packageUrls = this.generatePackageUrls(packageName, ecosystem);
        
        // Create modal HTML
        const modalHtml = `
            <div class="modal fade" id="packageDetailsModal" tabindex="-1" aria-labelledby="packageDetailsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="packageDetailsModalLabel">
                                <i class="fas fa-cube me-2"></i>Package Details
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            ${this.renderPackageDetailsContent(packageName, version, ecosystem, dep, packageUrls)}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if present
        const existingModal = document.getElementById('packageDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('packageDetailsModal'));
        modal.show();
        
        // Clean up modal after it's hidden
        document.getElementById('packageDetailsModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    /**
     * Generate package URLs for different ecosystems
     */
    generatePackageUrls(packageName, ecosystem) {
        const urls = {
            registry: null,
            repository: null,
            documentation: null,
            homepage: null
        };
        
        switch (ecosystem?.toLowerCase()) {
            case 'npm':
                urls.registry = `https://www.npmjs.com/package/${packageName}`;
                urls.repository = `https://github.com/npm/${packageName}`; // This might not always be correct
                urls.documentation = `https://www.npmjs.com/package/${packageName}#readme`;
                break;
                
            case 'pypi':
                urls.registry = `https://pypi.org/project/${packageName}/`;
                urls.repository = `https://github.com/pypi/${packageName}`; // This might not always be correct
                urls.documentation = `https://pypi.org/project/${packageName}/#description`;
                break;
                
            case 'maven':
                const [groupId, artifactId] = packageName.includes(':') ? packageName.split(':') : ['', packageName];
                if (groupId && artifactId) {
                    urls.registry = `https://mvnrepository.com/artifact/${groupId}/${artifactId}`;
                    urls.repository = `https://github.com/${groupId}/${artifactId}`; // This might not always be correct
                }
                break;
                
            case 'nuget':
                urls.registry = `https://www.nuget.org/packages/${packageName}/`;
                urls.repository = `https://github.com/NuGet/${packageName}`; // This might not always be correct
                urls.documentation = `https://www.nuget.org/packages/${packageName}/#readme-body-tab`;
                break;
                
            case 'cargo':
                urls.registry = `https://crates.io/crates/${packageName}`;
                urls.repository = `https://github.com/rust-lang/${packageName}`; // This might not always be correct
                urls.documentation = `https://docs.rs/${packageName}/`;
                break;
                
            case 'go':
                urls.registry = `https://pkg.go.dev/${packageName}`;
                urls.repository = `https://${packageName}`;
                urls.documentation = `https://pkg.go.dev/${packageName}#section-documentation`;
                break;
                
            case 'composer':
                urls.registry = `https://packagist.org/packages/${packageName}`;
                urls.repository = `https://github.com/${packageName}`;
                break;
                
            case 'rubygems':
                urls.registry = `https://rubygems.org/gems/${packageName}`;
                urls.repository = `https://github.com/${packageName}`;
                urls.documentation = `https://www.rubydoc.info/gems/${packageName}`;
                break;
        }
        
        return urls;
    }

    /**
     * Render package details content
     */
    renderPackageDetailsContent(packageName, version, ecosystem, dep, urls) {
        const { constraint, cleanVersion } = this.extractVersionConstraint(version);
        
        let html = `
            <div class="package-header mb-4">
                <div class="d-flex align-items-center mb-3">
                    <div class="package-icon me-3">
                        ${this.getEcosystemBadge(ecosystem)}
                    </div>
                    <div>
                        <h4 class="mb-1">${packageName}</h4>
                        <div class="package-version">
                            ${constraint ? `<span class="version-constraint me-1">${constraint}</span>` : ''}
                            <span class="badge bg-primary">${cleanVersion}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="package-info">
                <div class="row">
                    <div class="col-md-6">
                        <div class="info-section mb-3">
                            <h6><i class="fas fa-info-circle me-2"></i>Basic Information</h6>
                            <table class="table table-sm">
                                <tr>
                                    <td><strong>Package Name:</strong></td>
                                    <td><code>${packageName}</code></td>
                                </tr>
                                <tr>
                                    <td><strong>Version:</strong></td>
                                    <td>
                                        ${constraint ? `<span class="text-info">${constraint}</span>` : ''}
                                        <code>${cleanVersion}</code>
                                    </td>
                                </tr>
                                <tr>
                                    <td><strong>Ecosystem:</strong></td>
                                    <td>${this.getEcosystemBadge(ecosystem)}</td>
                                </tr>
                                <tr>
                                    <td><strong>Language:</strong></td>
                                    <td><span class="badge bg-secondary">${dep?.category?.language || 'Unknown'}</span></td>
                                </tr>
                            </table>
                        </div>
                    </div>
                    
                    <div class="col-md-6">
                        <div class="info-section mb-3">
                            <h6><i class="fas fa-chart-bar me-2"></i>Analysis Summary</h6>
                            <table class="table table-sm">
                                <tr>
                                    <td><strong>Vulnerabilities:</strong></td>
                                    <td>
                                        ${dep?.vulnerabilityCount > 0 ? 
                                            `<span class="badge bg-danger">${dep.vulnerabilityCount}</span>` : 
                                            `<span class="badge bg-success">0</span>`
                                        }
                                    </td>
                                </tr>
                                <tr>
                                    <td><strong>Version Status:</strong></td>
                                    <td>
                                        ${dep?.statusMessage ? 
                                            `<span class="badge bg-${this.getStatusBadgeColor(dep.versionStatus)}">${dep.statusMessage}</span>` :
                                            `<span class="badge bg-secondary">Unknown</span>`
                                        }
                                    </td>
                                </tr>
                                ${dep?.latestVersion ? `
                                <tr>
                                    <td><strong>Latest Version:</strong></td>
                                    <td><code>${dep.latestVersion}</code></td>
                                </tr>
                                ` : ''}
                            </table>
                        </div>
                    </div>
                </div>

                <div class="package-links mt-4">
                    <h6><i class="fas fa-external-link-alt me-2"></i>External Links</h6>
                    <div class="row">
                        ${urls.registry ? `
                        <div class="col-md-6 mb-2">
                            <a href="${urls.registry}" target="_blank" class="btn btn-outline-primary btn-sm w-100">
                                <i class="fas fa-box me-2"></i>Package Registry
                            </a>
                        </div>
                        ` : ''}
                        
                        ${urls.repository ? `
                        <div class="col-md-6 mb-2">
                            <a href="${urls.repository}" target="_blank" class="btn btn-outline-secondary btn-sm w-100">
                                <i class="fab fa-github me-2"></i>Source Repository
                            </a>
                        </div>
                        ` : ''}
                        
                        ${urls.documentation ? `
                        <div class="col-md-6 mb-2">
                            <a href="${urls.documentation}" target="_blank" class="btn btn-outline-info btn-sm w-100">
                                <i class="fas fa-book me-2"></i>Documentation
                            </a>
                        </div>
                        ` : ''}
                        
                        ${urls.homepage ? `
                        <div class="col-md-6 mb-2">
                            <a href="${urls.homepage}" target="_blank" class="btn btn-outline-success btn-sm w-100">
                                <i class="fas fa-home me-2"></i>Homepage
                            </a>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        return html;
    }

    /**
     * Get badge color for version status
     */
    getStatusBadgeColor(status) {
        const colorMap = {
            'up-to-date': 'success',
            'up-to-date-in-branch': 'success',
            'outdated': 'danger',
            'major-update': 'danger',
            'minor-update': 'warning',
            'patch-update': 'info',
            'unknown': 'secondary'
        };
        
        return colorMap[status] || 'secondary';
    }

    /**
     * Truncate long commit SHAs for display
     * @param {string} version - Version string (may be SHA or semantic version)
     * @returns {string} Truncated version for display
     */
    truncateSHA(version) {
        if (!version) return 'Unknown';
        
        // Check if it looks like a commit hash (40 hex characters)
        const isSHA = /^[a-f0-9]{40}$/i.test(version);
        
        // Also check for shorter SHAs (7-39 chars)
        const isShortSHA = /^[a-f0-9]{7,39}$/i.test(version) && version.length > 10;
        
        if (isSHA || isShortSHA) {
            // Truncate to 10 characters + ellipsis
            return version.substring(0, 10) + '...';
        }
        
        // Not a SHA, return as-is (but still truncate if unreasonably long)
        if (version.length > 20) {
            return version.substring(0, 17) + '...';
        }
        
        return version;
    }

    /**
     * Show vulnerabilities for a specific dependency
     */
    showDependencyVulnerabilities(packageName) {
        console.log(`🔍 Showing vulnerabilities for package: ${packageName}`);
        
        // Validate inputs
        if (!packageName) {
            console.error('Package name is required');
            this.showAlert('Invalid package name provided.', 'error');
            return;
        }

        // Check if we have dependency details
        if (!this.allDependencyDetails || !Array.isArray(this.allDependencyDetails)) {
            console.error('No dependency details available');
            this.showAlert('No dependency analysis data available.', 'error');
            return;
        }

        const dep = this.allDependencyDetails.find(d => d.name === packageName);
        if (!dep) {
            console.warn(`Dependency not found: ${packageName}`);
            console.log('Available dependencies:', this.allDependencyDetails.map(d => d.name));
            this.showAlert('Dependency not found in current analysis.', 'error');
            return;
        }

        console.log(`📦 Found dependency:`, dep);

        // First try to get vulnerabilities from the enriched dependency object
        let vulnerabilities = dep.vulnerabilities;
        
        // If not available, try to get from the main vulnerability analysis
        if (!vulnerabilities || vulnerabilities.length === 0) {
            console.log('🔍 Trying to get vulnerabilities from main analysis...');
            const vulnerabilityAnalysis = this.currentAnalysis?.vulnerabilityAnalysis;
            if (vulnerabilityAnalysis && vulnerabilityAnalysis.vulnerableDependencies) {
                const vulnInfo = vulnerabilityAnalysis.vulnerableDependencies.find(v => v.name === packageName);
                vulnerabilities = vulnInfo?.vulnerabilities || [];
                console.log(`📋 Found ${vulnerabilities.length} vulnerabilities from main analysis`);
            }
        } else {
            console.log(`📋 Found ${vulnerabilities.length} vulnerabilities from enriched data`);
        }

        // Check if we have any vulnerabilities to show
        if (!vulnerabilities || vulnerabilities.length === 0) {
            console.warn(`No vulnerability information found for ${packageName}`);
            this.showAlert('No vulnerabilities found for this dependency.', 'info');
            return;
        }

        // Show the vulnerability details modal
        console.log(`🚀 Showing vulnerability details for ${packageName} with ${vulnerabilities.length} vulnerabilities`);
        this.showVulnerabilityDetails(packageName, dep.version, vulnerabilities);
    }

    /**
     * Populate filter options based on available data
     */
    populateFilterOptions(dependencies) {
        // Populate ecosystem filter
        const ecosystems = [...new Set(dependencies.map(dep => dep.category?.ecosystem).filter(Boolean))].sort();
        const ecosystemFilter = document.getElementById('ecosystemFilter');
        if (ecosystemFilter) {
            ecosystemFilter.innerHTML = '<option value="">All Ecosystems</option>' + 
                ecosystems.map(eco => `<option value="${eco}">${eco}</option>`).join('');
        }

        // Populate version status filter with enhanced status messages
        const versionStatuses = [...new Set(dependencies.map(dep => dep.statusMessage || dep.versionStatus).filter(Boolean))].sort();
        const versionStatusFilter = document.getElementById('versionStatusFilter');
        if (versionStatusFilter) {
            versionStatusFilter.innerHTML = '<option value="">All Statuses</option>' + 
                versionStatuses.map(status => `<option value="${status}">${status}</option>`).join('');
        }

        // Populate language filter
        const languages = [...new Set(dependencies.map(dep => dep.category?.language).filter(Boolean))].sort();
        const languageFilter = document.getElementById('languageFilter');
        if (languageFilter) {
            languageFilter.innerHTML = '<option value="">All Languages</option>' + 
                languages.map(lang => `<option value="${lang}">${lang}</option>`).join('');
        }
    }

    /**
     * Setup dependency filtering
     */
    setupDependencyFiltering() {
        const filters = ['packageNameFilter', 'ecosystemFilter', 'versionStatusFilter', 'vulnerabilityFilter', 'languageFilter'];
        
        filters.forEach(filterId => {
            const filterElement = document.getElementById(filterId);
            if (filterElement) {
                filterElement.addEventListener('input', () => {
                    this.applyDependencyFilters();
                });
                filterElement.addEventListener('change', () => {
                    this.applyDependencyFilters();
                });
            }
        });
    }

    /**
     * Apply dependency filters
     */
    applyDependencyFilters() {
        if (!this.allDependencyDetails || !Array.isArray(this.allDependencyDetails)) {
            console.warn('No dependency data available to apply filters');
            return;
        }

        const nameFilter = document.getElementById('packageNameFilter')?.value?.toLowerCase() || '';
        const ecosystemFilter = document.getElementById('ecosystemFilter')?.value || '';
        const versionStatusFilter = document.getElementById('versionStatusFilter')?.value || '';
        const dependencyTypeFilter = document.getElementById('dependencyTypeFilter')?.value || '';  // ✅ Added missing filter
        const vulnerabilityFilter = document.getElementById('vulnerabilityFilter')?.value || '';
        const languageFilter = document.getElementById('languageFilter')?.value || '';

        this.filteredDependencyDetails = this.allDependencyDetails.filter(dep => {
            // Name filter
            if (nameFilter && !dep.name.toLowerCase().includes(nameFilter)) {
                return false;
            }

            // Ecosystem filter
            if (ecosystemFilter && dep.category?.ecosystem !== ecosystemFilter) {
                return false;
            }

            // Version status filter (check both status and message)
            if (versionStatusFilter && 
                dep.versionStatus !== versionStatusFilter && 
                dep.statusMessage !== versionStatusFilter) {
                return false;
            }

            // Dependency type filter (direct/transitive)
            if (dependencyTypeFilter) {
                if (dependencyTypeFilter === 'direct' && dep.type !== 'direct') {
                    return false;
                }
                if (dependencyTypeFilter === 'transitive' && dep.type !== 'transitive') {
                    return false;
                }
            }

            // Vulnerability filter
            if (vulnerabilityFilter) {
                if (vulnerabilityFilter === 'vulnerable' && dep.vulnerabilityCount === 0) {
                    return false;
                }
                if (vulnerabilityFilter === 'clean' && dep.vulnerabilityCount > 0) {
                    return false;
                }
            }

            // Language filter
            if (languageFilter && dep.category?.language !== languageFilter) {
                return false;
            }

            return true;
        });

        // Reset to first page when filters change
        this.currentDependencyPage = 1;

        // Update count display
        const countElement = document.getElementById('dependencyCount');
        if (countElement) {
            const filteredCount = this.filteredDependencyDetails.length;
            const totalCount = this.allDependencyDetails.length;
            if (filteredCount === totalCount) {
                countElement.textContent = `${totalCount} dependencies`;
            } else {
                countElement.textContent = `${filteredCount} of ${totalCount} dependencies`;
            }
        }

        // Re-render the page
        this.renderDependencyDetailsPage();
    }

    /**
     * Clear all dependency filters
     */
    clearDependencyFilters() {
        // Check if we have dependency data to work with
        if (!this.allDependencyDetails || !Array.isArray(this.allDependencyDetails)) {
            console.warn('No dependency data available to clear filters');
            return;
        }

        console.log('🧹 Clearing all dependency filters...');

        const filters = [
            'packageNameFilter', 
            'ecosystemFilter', 
            'versionStatusFilter', 
            'dependencyTypeFilter',  // ✅ Added missing filter
            'vulnerabilityFilter', 
            'languageFilter'
        ];
        
        filters.forEach(filterId => {
            const filterElement = document.getElementById(filterId);
            if (filterElement) {
                const oldValue = filterElement.value;
                filterElement.value = '';
                console.log(`  ✅ Cleared ${filterId}: "${oldValue}" → ""`);
            } else {
                console.warn(`  ❌ Filter element not found: ${filterId}`);
            }
        });

        // Reset filtered data to all data
        console.log(`📊 Before reset - allDependencyDetails: ${this.allDependencyDetails.length}, filteredDependencyDetails: ${this.filteredDependencyDetails?.length || 0}`);
        
        this.filteredDependencyDetails = [...this.allDependencyDetails];
        this.currentDependencyPage = 1;

        console.log(`📊 After reset - showing all ${this.allDependencyDetails.length} dependencies`);
        console.log(`📊 Sample dependencies:`, this.allDependencyDetails.slice(0, 3).map(d => d.name));

        // Update count display
        const countElement = document.getElementById('dependencyCount');
        if (countElement) {
            countElement.textContent = `${this.allDependencyDetails.length} dependencies`;
        }

        // Re-render the page directly (don't apply filters since we want to show all)
        this.renderDependencyDetailsPage();
    }

    /**
     * Get category badge HTML
     */
    getCategoryBadge(category) {
        const badges = {
            'code': '<span class="badge bg-success">Code</span>',
            'workflow': '<span class="badge bg-info">Workflow</span>',
            'infrastructure': '<span class="badge bg-warning">Infrastructure</span>',
            'unknown': '<span class="badge bg-secondary">Unknown</span>'
        };
        return badges[category] || badges['unknown'];
    }

    /**
     * Get ecosystem badge HTML
     */
    getEcosystemBadge(ecosystem) {
        if (!ecosystem || ecosystem === 'Unknown') {
            return '<span class="badge bg-secondary">Unknown</span>';
        }

        const ecosystemBadges = {
            'npm': '<span class="badge bg-danger">npm</span>',
            'PyPI': '<span class="badge bg-primary">PyPI</span>',
            'Maven': '<span class="badge bg-warning text-dark">Maven</span>',
            'NuGet': '<span class="badge bg-info">NuGet</span>',
            'Cargo': '<span class="badge bg-dark">Cargo</span>',
            'Go': '<span class="badge bg-success">Go</span>',
            'Composer': '<span class="badge bg-secondary">Composer</span>',
            'RubyGems': '<span class="badge bg-danger">RubyGems</span>',
            'GitHub Actions': '<span class="badge bg-dark">GitHub Actions</span>',
            'Docker': '<span class="badge bg-primary">Docker</span>',
            'Helm': '<span class="badge bg-info">Helm</span>',
            'Terraform': '<span class="badge bg-secondary">Terraform</span>'
        };

        return ecosystemBadges[ecosystem] || `<span class="badge bg-light text-dark">${ecosystem}</span>`;
    }

    /**
     * Get highest vulnerability severity from a list of vulnerabilities
     */
    getHighestVulnerabilitySeverity(vulnerabilities) {
        const severityLevels = {
            'CRITICAL': 5,
            'HIGH': 4,
            'MEDIUM': 3,
            'MODERATE': 3,
            'LOW': 2,
            'INFORMATIONAL': 1,
            'UNKNOWN': 0
        };

        let highestSeverity = 'UNKNOWN';
        let highestLevel = 0;

        vulnerabilities.forEach(vuln => {
            const severity = vuln.severity || 'UNKNOWN';
            const level = severityLevels[severity.toUpperCase()] || 0;
            if (level > highestLevel) {
                highestLevel = level;
                highestSeverity = severity.toUpperCase();
            }
        });

        return highestSeverity;
    }

    /**
     * Get severity badge HTML
     */
    getSeverityBadge(severity) {
        const badges = {
            'CRITICAL': '<span class="badge bg-danger">Critical</span>',
            'HIGH': '<span class="badge bg-warning">High</span>',
            'MEDIUM': '<span class="badge bg-info">Medium</span>',
            'MODERATE': '<span class="badge bg-info">Medium</span>',
            'LOW': '<span class="badge bg-secondary">Low</span>',
            'INFORMATIONAL': '<span class="badge bg-light text-dark">Info</span>',
            'UNKNOWN': '<span class="badge bg-secondary">Unknown</span>'
        };
        return badges[severity] || badges['UNKNOWN'];
    }

    /**
     * Get severity class for styling
     */
    getSeverityClass(severity) {
        const classes = {
            'CRITICAL': 'danger',
            'HIGH': 'warning',
            'MEDIUM': 'info',
            'MODERATE': 'info',
            'LOW': 'secondary',
            'INFORMATIONAL': 'light',
            'UNKNOWN': 'secondary'
        };
        return classes[severity.toUpperCase()] || 'secondary';
    }

    /**
     * Get severity level for sorting (higher number = more severe)
     */
    getSeverityLevel(severity) {
        const levels = {
            'CRITICAL': 5,
            'HIGH': 4,
            'MEDIUM': 3,
            'MODERATE': 3,
            'LOW': 2,
            'INFORMATIONAL': 1,
            'UNKNOWN': 0
        };
        return levels[severity.toUpperCase()] || 0;
    }

    /**
     * Sort vulnerabilities by severity (most severe first)
     */
    sortVulnerabilitiesBySeverity(vulnerabilities) {
        return vulnerabilities.sort((a, b) => {
            const severityA = a.severity || 'UNKNOWN';
            const severityB = b.severity || 'UNKNOWN';
            const levelA = this.getSeverityLevel(severityA);
            const levelB = this.getSeverityLevel(severityB);
            
            // Sort by severity level (descending), then by ID for consistency
            if (levelA !== levelB) {
                return levelB - levelA;
            }
            
            // If same severity, sort by ID alphabetically
            const idA = a.id || '';
            const idB = b.id || '';
            return idA.localeCompare(idB);
        });
    }

    /**
     * Sort vulnerable dependencies by highest severity (most severe first)
     */
    sortVulnerableDependenciesBySeverity(dependencies) {
        return dependencies.sort((a, b) => {
            const highestSeverityA = this.getHighestVulnerabilitySeverity(a.vulnerabilities);
            const highestSeverityB = this.getHighestVulnerabilitySeverity(b.vulnerabilities);
            const levelA = this.getSeverityLevel(highestSeverityA);
            const levelB = this.getSeverityLevel(highestSeverityB);
            
            // Sort by highest severity level (descending), then by name for consistency
            if (levelA !== levelB) {
                return levelB - levelA;
            }
            
            // If same highest severity, sort by package name alphabetically
            return a.name.localeCompare(b.name);
        });
    }

    /**
     * Analyze dependency drift - compare current versions with latest available
     */
    async analyzeDependencyDrift(dependencies) {
        console.log('Starting dependency drift analysis...');
        const driftAnalysis = {
            totalDependencies: dependencies.length,
            outdatedDependencies: [],
            upToDateDependencies: [],
            unknownDependencies: [],
            majorUpdatesAvailable: 0,
            minorUpdatesAvailable: 0,
            patchUpdatesAvailable: 0
        };

        // Process dependencies in batches to avoid rate limiting
        const batchSize = 10;
        for (let i = 0; i < dependencies.length; i += batchSize) {
            const batch = dependencies.slice(i, i + batchSize);
            const batchPromises = batch.map(dep => this.checkLatestVersion(dep));
            
            try {
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(result => {
                    if (result.status === 'outdated') {
                        driftAnalysis.outdatedDependencies.push(result);
                        
                        // Categorize update type
                        const updateType = this.getUpdateType(result.currentVersion, result.latestVersion);
                        if (updateType === 'major') {
                            driftAnalysis.majorUpdatesAvailable++;
                        } else if (updateType === 'minor') {
                            driftAnalysis.minorUpdatesAvailable++;
                        } else if (updateType === 'patch') {
                            driftAnalysis.patchUpdatesAvailable++;
                        }
                    } else if (result.status === 'up-to-date') {
                        driftAnalysis.upToDateDependencies.push(result);
                    } else {
                        driftAnalysis.unknownDependencies.push(result);
                    }
                });
            } catch (error) {
                console.warn('Error in batch drift analysis:', error);
            }

            // Add delay between batches to be respectful to APIs
            if (i + batchSize < dependencies.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Sort outdated dependencies by severity (major updates first)
        driftAnalysis.outdatedDependencies.sort((a, b) => {
            const typeA = this.getUpdateType(a.currentVersion, a.latestVersion);
            const typeB = this.getUpdateType(b.currentVersion, b.latestVersion);
            const severityOrder = { 'major': 3, 'minor': 2, 'patch': 1 };
            return (severityOrder[typeB] || 0) - (severityOrder[typeA] || 0);
        });

        // Add allDependencies field for easy lookup (combines all categories)
        driftAnalysis.allDependencies = [
            ...driftAnalysis.outdatedDependencies,
            ...driftAnalysis.upToDateDependencies,
            ...driftAnalysis.unknownDependencies
        ];

        console.log('Dependency drift analysis completed:', driftAnalysis);
        console.log(`📊 Drift analysis summary: ${driftAnalysis.outdatedDependencies.length} outdated, ${driftAnalysis.upToDateDependencies.length} up-to-date, ${driftAnalysis.unknownDependencies.length} unknown`);
        return driftAnalysis;
    }

    /**
     * Check latest version for a dependency
     */
    async checkLatestVersion(dependency) {
        try {
            // Check if this is a GitHub Action first
            if (this.githubActionsService.isGitHubAction(dependency)) {
                console.log(`🎬 Checking GitHub Action version for ${dependency.name}`);
                return await this.githubActionsService.checkVersion(dependency);
            }
            
            // Extract ecosystem from dependency data (PURL, ecosystem field, or fallback to name-based detection)
            const ecosystem = this.extractEcosystemFromDependency(dependency);
            let latestVersion = null;

            if (ecosystem === 'npm') {
                latestVersion = await this.getNpmLatestVersion(dependency.name);
            } else if (ecosystem === 'pypi') {
                latestVersion = await this.getPypiLatestVersion(dependency.name);
            } else if (ecosystem === 'maven') {
                latestVersion = await this.getMavenLatestVersion(dependency.name);
            } else if (ecosystem === 'nuget') {
                latestVersion = await this.getNugetLatestVersion(dependency.name);
            }

            if (!latestVersion) {
                return {
                    name: dependency.name,
                    currentVersion: dependency.version,
                    status: 'unknown',
                    ecosystem: ecosystem
                };
            }

            const enhancedStatus = this.getEnhancedVersionStatus(dependency.version, latestVersion);
            const { cleanVersion } = this.extractVersionConstraint(dependency.version);
            const isOutdated = this.compareVersions(cleanVersion, latestVersion);
            
            return {
                name: dependency.name,
                currentVersion: dependency.version,
                latestVersion: latestVersion,
                status: enhancedStatus.status,
                statusMessage: enhancedStatus.message,
                statusDetails: enhancedStatus.details,
                isOutdated: isOutdated,
                ecosystem: ecosystem,
                daysOld: isOutdated ? await this.calculateDaysOld(dependency.name, latestVersion, ecosystem) : 0
            };

        } catch (error) {
            console.warn(`Error checking latest version for ${dependency.name}:`, error);
            return {
                name: dependency.name,
                currentVersion: dependency.version,
                status: 'unknown',
                ecosystem: 'unknown',
                error: error.message
            };
        }
    }

    /**
     * Get latest NPM version
     */
    async getNpmLatestVersion(packageName) {
        try {
            const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
            if (!response.ok) return null;
            const data = await response.json();
            return data.version;
        } catch (error) {
            console.warn(`Error fetching NPM version for ${packageName}:`, error);
            return null;
        }
    }

    /**
     * Get latest PyPI version
     */
    async getPypiLatestVersion(packageName) {
        try {
            const response = await fetch(`https://pypi.org/pypi/${packageName}/json`);
            if (!response.ok) return null;
            const data = await response.json();
            return data.info.version;
        } catch (error) {
            console.warn(`Error fetching PyPI version for ${packageName}:`, error);
            return null;
        }
    }

    /**
     * Get latest Maven version (simplified - would need more robust implementation)
     */
    async getMavenLatestVersion(packageName) {
        try {
            // This is a simplified approach - in practice, you'd need to parse group:artifact
            const [groupId, artifactId] = packageName.includes(':') ? packageName.split(':') : [null, packageName];
            if (!groupId || !artifactId) return null;
            
            const response = await fetch(`https://search.maven.org/solrsearch/select?q=g:"${groupId}"+AND+a:"${artifactId}"&rows=1&wt=json`);
            if (!response.ok) return null;
            const data = await response.json();
            
            if (data.response.docs.length > 0) {
                return data.response.docs[0].latestVersion;
            }
            return null;
        } catch (error) {
            console.warn(`Error fetching Maven version for ${packageName}:`, error);
            return null;
        }
    }

    /**
     * Get latest NuGet version
     */
    async getNugetLatestVersion(packageName) {
        try {
            const response = await fetch(`https://api.nuget.org/v3-flatcontainer/${packageName.toLowerCase()}/index.json`);
            if (!response.ok) return null;
            const data = await response.json();
            
            if (data.versions && data.versions.length > 0) {
                return data.versions[data.versions.length - 1]; // Last version is typically latest
            }
            return null;
        } catch (error) {
            console.warn(`Error fetching NuGet version for ${packageName}:`, error);
            return null;
        }
    }

    /**
     * Extract ecosystem from dependency object (PURL, ecosystem field, or name-based detection)
     * @param {Object} dependency - Dependency object
     * @returns {string} Ecosystem name (npm, pypi, maven, nuget, etc.)
     */
    extractEcosystemFromDependency(dependency) {
        // Extract PURL from various possible locations
        const purl = dependency.purl || 
                     dependency.originalPackage?.purl || 
                     dependency.pkg;
        
        // Extract ecosystem from various possible locations
        const ecosystemField = dependency.ecosystem || 
                              dependency.originalPackage?.ecosystem ||
                              dependency.category?.ecosystem;
        
        // Debug: log what we have
        console.log(`🔍 Extracting ecosystem for ${dependency.name}:`, {
            hasPurl: !!purl,
            purl: purl,
            hasEcosystem: !!ecosystemField,
            ecosystem: ecosystemField
        });
        
        // 1. Try to extract from PURL (most reliable)
        if (purl) {
            const purlMatch = purl.match(/^pkg:([^\/]+)\//);
            if (purlMatch) {
                const ecosystem = purlMatch[1].toLowerCase();
                console.log(`✅ Extracted ecosystem from PURL for ${dependency.name}: ${ecosystem}`);
                return this.normalizeEcosystem(ecosystem);
            } else {
                console.warn(`⚠️ PURL exists but didn't match pattern for ${dependency.name}: ${purl}`);
            }
        }
        
        // 2. Try to use ecosystem field directly
        if (ecosystemField) {
            console.log(`✅ Using ecosystem field for ${dependency.name}: ${ecosystemField}`);
            return this.normalizeEcosystem(ecosystemField);
        }
        
        // 3. Fallback to name-based detection (least reliable)
        console.warn(`⚠️ Fallback to name-based ecosystem detection for ${dependency.name} (no PURL or ecosystem field)`);
        return this.detectEcosystem(dependency.name);
    }

    /**
     * Normalize ecosystem name to standard format
     * @param {string} ecosystem - Raw ecosystem name
     * @returns {string} Normalized ecosystem name
     */
    normalizeEcosystem(ecosystem) {
        const normalized = ecosystem.toLowerCase();
        
        // Map various ecosystem names to standard format
        const ecosystemMap = {
            'pypi': 'pypi',
            'npm': 'npm',
            'maven': 'maven',
            'nuget': 'nuget',
            'cargo': 'cargo',
            'composer': 'composer',
            'go': 'go',
            'golang': 'go',
            'rubygems': 'rubygems'
        };
        
        return ecosystemMap[normalized] || normalized;
    }

    /**
     * Detect ecosystem based on package name patterns (fallback only)
     * NOTE: This is unreliable and should only be used as last resort when PURL is not available
     */
    detectEcosystem(packageName) {
        const name = packageName.toLowerCase();
        
        // Maven packages (Java) - contain colons
        if (name.includes(':') && name.split(':').length >= 2) {
            return 'maven';
        }
        
        // NuGet packages (C#/.NET) - often PascalCase with dots
        if (packageName.match(/^[A-Z][a-zA-Z0-9]*(\.[A-Z][a-zA-Z0-9]*)+$/)) {
            return 'nuget';
        }
        
        // NPM scoped packages
        if (name.startsWith('@') && name.includes('/')) {
            return 'npm';
        }
        
        // For ambiguous cases, default to npm
        // (This is why PURL-based detection is critical!)
        return 'npm';
    }

    /**
     * Compare versions to determine if current is outdated
     */
    compareVersions(current, latest) {
        try {
            // Remove common prefixes
            const cleanCurrent = current.replace(/^[v^~>=<]/, '');
            const cleanLatest = latest.replace(/^[v^~>=<]/, '');
            
            const currentParts = cleanCurrent.split('.').map(part => parseInt(part.replace(/[^\d]/g, '')) || 0);
            const latestParts = cleanLatest.split('.').map(part => parseInt(part.replace(/[^\d]/g, '')) || 0);
            
            // Pad arrays to same length
            const maxLength = Math.max(currentParts.length, latestParts.length);
            while (currentParts.length < maxLength) currentParts.push(0);
            while (latestParts.length < maxLength) latestParts.push(0);
            
            for (let i = 0; i < maxLength; i++) {
                if (latestParts[i] > currentParts[i]) {
                    return true; // Latest is newer
                } else if (latestParts[i] < currentParts[i]) {
                    return false; // Current is newer (shouldn't happen but handle it)
                }
            }
            
            return false; // Versions are equal
        } catch (error) {
            console.warn('Error comparing versions:', error);
            return false;
        }
    }

    /**
     * Extract version constraint from version string
     */
    extractVersionConstraint(version) {
        if (!version) return { constraint: '', cleanVersion: version };
        
        const constraintMatch = version.match(/^([~^>=<]+)/);
        if (constraintMatch) {
            return {
                constraint: constraintMatch[1],
                cleanVersion: version.replace(/^[~^>=<]+/, '')
            };
        }
        
        return { constraint: '', cleanVersion: version };
    }

    /**
     * Check if a version satisfies a constraint relative to current version
     */
    satisfiesConstraint(currentVersion, latestVersion, constraint) {
        try {
            const currentParts = currentVersion.split('.').map(part => parseInt(part.replace(/[^\d]/g, '')) || 0);
            const latestParts = latestVersion.split('.').map(part => parseInt(part.replace(/[^\d]/g, '')) || 0);
            
            // Pad arrays to same length
            const maxLength = Math.max(currentParts.length, latestParts.length);
            while (currentParts.length < maxLength) currentParts.push(0);
            while (latestParts.length < maxLength) latestParts.push(0);
            
            switch (constraint) {
                case '^': // Compatible within same major version
                    return currentParts[0] === latestParts[0];
                case '~': // Compatible within same major.minor version
                    return currentParts[0] === latestParts[0] && currentParts[1] === latestParts[1];
                case '>=': // Greater than or equal
                    return this.compareVersions(latestVersion, currentVersion) || latestVersion === currentVersion;
                case '>': // Greater than
                    return this.compareVersions(latestVersion, currentVersion);
                case '<=': // Less than or equal
                    return this.compareVersions(currentVersion, latestVersion) || latestVersion === currentVersion;
                case '<': // Less than
                    return this.compareVersions(currentVersion, latestVersion);
                default: // No constraint or exact match
                    return true;
            }
        } catch (error) {
            console.warn('Error checking constraint satisfaction:', error);
            return false;
        }
    }

    /**
     * Get enhanced version status with constraint awareness
     */
    getEnhancedVersionStatus(currentVersionRaw, latestVersion) {
        if (!latestVersion) {
            return {
                status: 'unknown',
                message: 'Unknown',
                badge: 'secondary',
                details: ''
            };
        }

        const { constraint, cleanVersion: currentVersion } = this.extractVersionConstraint(currentVersionRaw);
        const isOutdated = this.compareVersions(currentVersion, latestVersion);
        
        if (!isOutdated) {
            return {
                status: 'up-to-date',
                message: 'Up to Date',
                badge: 'success',
                details: ''
            };
        }

        const updateType = this.getUpdateType(currentVersion, latestVersion);
        const satisfiesConstraint = constraint ? this.satisfiesConstraint(currentVersion, latestVersion, constraint) : false;

        // If there's a constraint and latest version satisfies it
        if (constraint && satisfiesConstraint) {
            const branchInfo = this.getBranchInfo(currentVersion, constraint);
            return {
                status: 'up-to-date-in-branch',
                message: `Up to date in ${branchInfo}`,
                badge: 'success',
                details: `Latest: ${latestVersion}`
            };
        }

        // If there's a constraint but latest version doesn't satisfy it
        if (constraint && !satisfiesConstraint) {
            const branchInfo = this.getBranchInfo(currentVersion, constraint);
            return {
                status: `${updateType}-update-outside-constraint`,
                message: `Up to date in ${branchInfo}`,
                badge: updateType === 'major' ? 'warning' : 'info',
                details: `${updateType.charAt(0).toUpperCase() + updateType.slice(1)} update available: ${latestVersion}`
            };
        }

        // No constraint, standard update available
        return {
            status: `${updateType}-update`,
            message: `${updateType.charAt(0).toUpperCase() + updateType.slice(1)} Update`,
            badge: updateType === 'major' ? 'danger' : updateType === 'minor' ? 'warning' : 'info',
            details: `Latest: ${latestVersion}`
        };
    }

    /**
     * Get branch information based on version and constraint
     */
    getBranchInfo(version, constraint) {
        const parts = version.split('.').map(part => parseInt(part.replace(/[^\d]/g, '')) || 0);
        
        switch (constraint) {
            case '^':
                return `${parts[0]}.x branch`;
            case '~':
                return `${parts[0]}.${parts[1]}.x branch`;
            default:
                return 'current range';
        }
    }

    /**
     * Determine update type (major, minor, patch)
     */
    getUpdateType(current, latest) {
        try {
            const cleanCurrent = current.replace(/^[v^~>=<]/, '');
            const cleanLatest = latest.replace(/^[v^~>=<]/, '');
            
            const currentParts = cleanCurrent.split('.').map(part => parseInt(part.replace(/[^\d]/g, '')) || 0);
            const latestParts = cleanLatest.split('.').map(part => parseInt(part.replace(/[^\d]/g, '')) || 0);
            
            if (latestParts[0] > currentParts[0]) {
                return 'major';
            } else if (latestParts[1] > currentParts[1]) {
                return 'minor';
            } else if (latestParts[2] > currentParts[2]) {
                return 'patch';
            }
            
            return 'unknown';
        } catch (error) {
            console.warn('Error determining update type:', error);
            return 'unknown';
        }
    }

    /**
     * Calculate how many days old the current version is
     */
    async calculateDaysOld(packageName, latestVersion, ecosystem) {
        try {
            // This would require additional API calls to get release dates
            // For now, return a placeholder
            return 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Show vulnerability details for a specific package in a modal
     */
    showVulnerabilityDetails(packageName, version, vulnerabilities) {
        // Ensure vulnerabilities is an array
        if (!Array.isArray(vulnerabilities)) {
            console.error('Vulnerabilities must be an array');
            return;
        }

        // Sort vulnerabilities by severity (most severe first)
        const sortedVulnerabilities = this.sortVulnerabilitiesBySeverity([...vulnerabilities]);

        // Remove any existing modal
        const existingModal = document.getElementById('vulnerabilityModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalTitle = `${packageName}@${version} - Vulnerabilities (${sortedVulnerabilities.length})`;
        
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'vulnerabilityModal';
        modal.tabIndex = -1;
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${modalTitle}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="vulnerability-list">
                            ${sortedVulnerabilities.map(vuln => {
                                // Defensive programming: ensure vuln is valid
                                if (!vuln || typeof vuln !== 'object') {
                                    return '<div class="alert alert-secondary">Invalid vulnerability data</div>';
                                }
                                
                                const severity = vuln.severity || 'UNKNOWN';
                                return `
                                    <div class="alert alert-${this.getSeverityClass(severity)}">
                                        <h6>${vuln.id || 'Unknown'} - ${severity.toUpperCase()}</h6>
                                        <p><strong>Summary:</strong> ${vuln.summary || 'No summary available'}</p>
                                        <p><strong>Details:</strong> ${vuln.details || 'No details available'}</p>
                                        <p><strong>Published:</strong> ${vuln.published ? new Date(vuln.published).toLocaleDateString() : 'Unknown'}</p>
                                        ${vuln.references && Array.isArray(vuln.references) && vuln.references.length > 0 ? `
                                        <div class="mt-2">
                                            <strong>External Links:</strong>
                                            <div class="vulnerability-references">
                                                ${vuln.references.map(ref => `
                                                    <a href="${ref.url}" target="_blank" class="btn btn-sm btn-outline-primary me-1 mb-1">
                                                        <i class="fas fa-external-link-alt me-1"></i>${ref.type}
                                                    </a>
                                                `).join('')}
                                            </div>
                                        </div>` : ''
                                        }
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();

        // Clean up modal when hidden
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }

    /**
     * Render vulnerability details
     */
    renderVulnerabilityDetails(vulnerabilities) {
        let html = '';
        
        vulnerabilities.forEach((vuln, index) => {
            const severityBadge = this.getSeverityBadge(vuln.severity);
            const publishedDate = vuln.published ? new Date(vuln.published).toLocaleDateString() : 'Unknown';
            const modifiedDate = vuln.modified ? new Date(vuln.modified).toLocaleDateString() : 'Unknown';
            
            html += `
                <div class="vulnerability-item ${index > 0 ? 'mt-3 pt-3 border-top' : ''}">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="mb-0">
                            <a href="https://osv.dev/vulnerability/${vuln.id}" target="_blank" class="text-decoration-none">
                                ${vuln.id} <i class="fas fa-external-link-alt fa-sm"></i>
                            </a>
                        </h6>
                        ${severityBadge}
                    </div>
                    
                    ${vuln.summary ? `
                        <p class="mb-2"><strong>Summary:</strong> ${vuln.summary}</p>
                    ` : ''}
                    
                    ${vuln.details ? `
                        <div class="mb-2">
                            <strong>Details:</strong>
                            <div class="small text-muted mt-1" style="max-height: 100px; overflow-y: auto;">
                                ${vuln.details.length > 300 ? vuln.details.substring(0, 300) + '...' : vuln.details}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="row">
                        <div class="col-md-6">
                            <small class="text-muted">
                                <strong>Published:</strong> ${publishedDate}
                            </small>
                        </div>
                        <div class="col-md-6">
                            <small class="text-muted">
                                <strong>Modified:</strong> ${modifiedDate}
                            </small>
                        </div>
                    </div>
                    
                    ${vuln.references && vuln.references.length > 0 ? `
                        <div class="mt-2">
                            <small><strong>References:</strong></small>
                            <div class="d-flex flex-wrap gap-1 mt-1">
                                ${vuln.references.slice(0, 3).map(ref => `
                                    <a href="${ref.url}" target="_blank" class="btn btn-outline-primary btn-sm">
                                        <i class="fas fa-link me-1"></i>${ref.type || 'Link'}
                                    </a>
                                `).join('')}
                                ${vuln.references.length > 3 ? `
                                    <small class="text-muted align-self-center">+${vuln.references.length - 3} more</small>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        return html;
    }

    /**
     * Load and display previous analyses
     */
    async loadPreviousAnalyses() {
        try {
            const analyses = await singleRepoStorage.getAllAnalyses();
            const container = document.getElementById('previousAnalysesContent');
            
            if (!container) return;

            if (analyses.length === 0) {
                container.innerHTML = `
                    <div class="text-center text-muted">
                        <i class="fas fa-history fa-2x mb-2"></i>
                        <p>No previous analyses found</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div class="row">
                    ${analyses.slice(0, 6).map(analysis => `
                        <div class="col-md-6 col-lg-4 mb-3">
                            <div class="card h-100">
                                <div class="card-body">
                                    <h6 class="card-title">
                                        <i class="fab fa-github me-1"></i>
                                        ${analysis.owner}/${analysis.name}
                                    </h6>
                                    <p class="card-text small text-muted">
                                        Analyzed: ${new Date(analysis.timestamp).toLocaleDateString()}
                                    </p>
                                    <div class="d-flex gap-1">
                                        <button class="btn btn-outline-primary btn-sm" 
                                                onclick="loadPreviousAnalysis('${analysis.owner}', '${analysis.name}')">
                                            <i class="fas fa-eye me-1"></i>View
                                        </button>
                                        <button class="btn btn-outline-success btn-sm" 
                                                onclick="exportPreviousAnalysis('${analysis.owner}', '${analysis.name}')">
                                            <i class="fas fa-download me-1"></i>Export
                                        </button>
                                        <button class="btn btn-outline-danger btn-sm" 
                                                onclick="deletePreviousAnalysis('${analysis.owner}', '${analysis.name}')">
                                            <i class="fas fa-trash me-1"></i>Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            if (analyses.length > 6) {
                html += `
                    <div class="text-center text-muted mt-2">
                        <small>Showing 6 of ${analyses.length} analyses</small>
                    </div>
                `;
            }

            container.innerHTML = html;
        } catch (error) {
            console.error('❌ Failed to load previous analyses:', error);
        }
    }

    /**
     * Load a previous analysis
     */
    async loadPreviousAnalysis(owner, name) {
        try {
            const analysis = await singleRepoStorage.loadAnalysis(owner, name);
            if (analysis) {
                this.currentAnalysis = analysis.analysisData;
                
                // Restore sbomProcessor state from stored analysis
                if (analysis.analysisData.sbomData) {
                    // Recreate dependencies in sbomProcessor
                    this.sbomProcessor = new SBOMProcessor();
                    if (analysis.analysisData.sbomData.allDependencies) {
                        analysis.analysisData.sbomData.allDependencies.forEach(dep => {
                            const key = `${dep.name}@${dep.version}`;
                            this.sbomProcessor.dependencies.set(key, dep);
                        });
                    }
                    
                    // Restore license processor if needed
                    if (!this.sbomProcessor.licenseProcessor) {
                        this.sbomProcessor.licenseProcessor = new LicenseProcessor();
                    }
                    
                    // Restore deps.dev analysis if available
                    if (analysis.analysisData.depsDevAnalysis) {
                        this.sbomProcessor.depsDevAnalysis = analysis.analysisData.depsDevAnalysis;
                    }
                }
                
                this.displayRepositoryInfo(analysis.analysisData.repository.info);
                this.displayResults(analysis.analysisData);
                
                // Scroll to results
                document.getElementById('repoInfoSection')?.scrollIntoView({ behavior: 'smooth' });
                
                this.showAlert(`Loaded analysis for ${owner}/${name}`, 'success');
            }
        } catch (error) {
            console.error('❌ Failed to load analysis:', error);
            this.showAlert('Failed to load analysis', 'danger');
        }
    }

    /**
     * Export a previous analysis
     */
    async exportPreviousAnalysis(owner, name) {
        try {
            await singleRepoStorage.exportAnalysis(owner, name);
            this.showAlert(`Analysis exported for ${owner}/${name}`, 'success');
        } catch (error) {
            console.error('❌ Failed to export analysis:', error);
            this.showAlert('Failed to export analysis', 'danger');
        }
    }

    /**
     * Delete a previous analysis
     */
    async deletePreviousAnalysis(owner, name) {
        if (confirm(`Are you sure you want to delete the analysis for ${owner}/${name}?`)) {
            try {
                await singleRepoStorage.deleteAnalysis(owner, name);
                this.loadPreviousAnalyses(); // Refresh the list
                this.showAlert(`Analysis deleted for ${owner}/${name}`, 'success');
            } catch (error) {
                console.error('❌ Failed to delete analysis:', error);
                this.showAlert('Failed to delete analysis', 'danger');
            }
        }
    }

    /**
     * Export current analysis
     */
    async exportCurrentAnalysis() {
        if (!this.currentAnalysis) {
            this.showAlert('No analysis to export', 'warning');
            return;
        }

        try {
            const repo = this.currentAnalysis.repository;
            await singleRepoStorage.exportAnalysis(repo.owner, repo.name);
            this.showAlert('Analysis exported successfully', 'success');
        } catch (error) {
            console.error('❌ Failed to export current analysis:', error);
            this.showAlert('Failed to export analysis', 'danger');
        }
    }

    /**
     * Clear current analysis results
     */
    clearCurrentAnalysis() {
        this.currentAnalysis = null;
        this.showResults(false);
        this.showExportSection(false);
        
        // Clear repository info
        const repoInfoSection = document.getElementById('repoInfoSection');
        if (repoInfoSection) {
            repoInfoSection.style.display = 'none';
        }
        
        // Clear input
        const repoUrlInput = document.getElementById('repoUrl');
        if (repoUrlInput) {
            repoUrlInput.value = '';
        }
        
        this.showAlert('Results cleared', 'info');
    }

    /**
     * Save GitHub token
     */
    saveToken() {
        const token = document.getElementById('githubToken')?.value?.trim();
        
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
        if (statusDiv) {
            if (message) {
                statusDiv.innerHTML = `<div class="alert alert-${type} alert-sm">${message}</div>`;
            } else {
                statusDiv.innerHTML = '';
            }
        }
    }

    /**
     * Update progress display
     */
    updateProgress(percentage, message) {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const phaseInfo = document.getElementById('phaseInfo');
        const currentPhase = document.getElementById('currentPhase');
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.textContent = `${Math.round(percentage)}%`;
        }
        
        if (progressText) {
            progressText.textContent = message;
        }

        // Determine current phase based on progress percentage and update phase info
        if (phaseInfo && currentPhase) {
            phaseInfo.style.display = 'block';
            
            let phase = 'Initializing';
            if (percentage >= 95) {
                phase = 'Finalizing Results';
            } else if (percentage >= 85) {
                phase = 'Dependency Drift Analysis';
            } else if (percentage >= 75) {
                phase = 'License Compliance Analysis';
            } else if (percentage >= 50) {
                phase = 'Vulnerability Analysis';
            } else if (percentage >= 25) {
                phase = 'Transitive Dependencies Analysis';
            } else if (percentage >= 5) {
                phase = 'Repository & SBOM Processing';
            }
            
            currentPhase.textContent = phase;
        }
    }

    /**
     * Show/hide progress section
     */
    showProgress(show) {
        const progressSection = document.getElementById('progressSection');
        if (progressSection) {
            progressSection.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Show/hide results section
     */
    showResults(show) {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) {
            resultsSection.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Show/hide export section
     */
    showExportSection(show) {
        const exportSection = document.getElementById('exportSection');
        if (exportSection) {
            exportSection.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Show alert message as toast notification
     */
    showAlert(message, type) {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            toastContainer.style.zIndex = '1055';
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toastId = 'toast-' + Date.now();
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = 'toast';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        
        // Determine icon and colors based on type
        let icon, bgClass, textClass;
        switch (type) {
            case 'success':
                icon = 'fas fa-check-circle';
                bgClass = 'bg-success';
                textClass = 'text-white';
                break;
            case 'danger':
                icon = 'fas fa-exclamation-triangle';
                bgClass = 'bg-danger';
                textClass = 'text-white';
                break;
            case 'warning':
                icon = 'fas fa-exclamation-circle';
                bgClass = 'bg-warning';
                textClass = 'text-dark';
                break;
            case 'info':
                icon = 'fas fa-info-circle';
                bgClass = 'bg-info';
                textClass = 'text-white';
                break;
            default:
                icon = 'fas fa-info-circle';
                bgClass = 'bg-secondary';
                textClass = 'text-white';
        }

        toast.innerHTML = `
            <div class="toast-header ${bgClass} ${textClass}">
                <i class="${icon} me-2"></i>
                <strong class="me-auto">SBOM Play</strong>
                <button type="button" class="btn-close ${textClass === 'text-white' ? 'btn-close-white' : ''}" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        `;

        // Add toast to container
        toastContainer.appendChild(toast);

        // Initialize and show toast
        const bsToast = new bootstrap.Toast(toast, {
            autohide: true,
            delay: 5000
        });
        
        bsToast.show();

        // Clean up after toast is hidden
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
            
            // Remove container if no more toasts
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
            }
        });
    }

    /**
     * Display dependency drift analysis
     */
    displayDependencyDrift(analysisData) {
        const container = document.getElementById('dependencyDrift');
        if (!container) return;

        const driftAnalysis = analysisData.driftAnalysis;
        
        if (!driftAnalysis) {
            container.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-clock fa-2x mb-2"></i>
                    <p>Dependency drift analysis not available</p>
                </div>
            `;
            return;
        }

        const outdatedRate = driftAnalysis.totalDependencies > 0 ? 
            (driftAnalysis.outdatedDependencies.length / driftAnalysis.totalDependencies * 100).toFixed(1) : 0;

        let html = `
            <div class="row mb-3">
                <div class="col-md-3 col-6">
                    <div class="text-center">
                        <h4 class="text-warning mb-0">${driftAnalysis.outdatedDependencies.length}</h4>
                        <small class="text-muted">Outdated Packages</small>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="text-center">
                        <h4 class="text-success mb-0">${driftAnalysis.upToDateDependencies.length}</h4>
                        <small class="text-muted">Up-to-Date Packages</small>
                    </div>
                </div>
                <div class="col-md-6 col-12">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <small>Outdated Rate</small>
                        <small>${outdatedRate}%</small>
                    </div>
                    <div class="progress" style="height: 8px;">
                        <div class="progress-bar bg-warning" style="width: ${outdatedRate}%"></div>
                    </div>
                </div>
            </div>
        `;

        // Update type breakdown
        if (driftAnalysis.outdatedDependencies.length > 0) {
            html += `
                <div class="row text-center mb-3">
                    <div class="col-md-4 col-4">
                        <div class="text-danger">
                            <strong>${driftAnalysis.majorUpdatesAvailable}</strong>
                            <br><small>Major Updates</small>
                        </div>
                    </div>
                    <div class="col-md-4 col-4">
                        <div class="text-warning">
                            <strong>${driftAnalysis.minorUpdatesAvailable}</strong>
                            <br><small>Minor Updates</small>
                        </div>
                    </div>
                    <div class="col-md-4 col-4">
                        <div class="text-info">
                            <strong>${driftAnalysis.patchUpdatesAvailable}</strong>
                            <br><small>Patch Updates</small>
                        </div>
                    </div>
                </div>
            `;

            // Show outdated dependencies
            html += `
                <div class="mt-3">
                    <h6>📅 Outdated Dependencies</h6>
                    <div class="vulnerable-deps-list">
            `;

            driftAnalysis.outdatedDependencies.slice(0, 10).forEach((dep, index) => {
                const updateType = this.getUpdateType(dep.currentVersion, dep.latestVersion);
                const updateBadge = this.getUpdateTypeBadge(updateType);
                
                html += `
                    <div class="vulnerable-dep-item">
                        <div class="vuln-dep-info">
                            <div class="vuln-dep-name">
                                <code>${dep.name}</code>
                                <span class="badge bg-secondary ms-2">${dep.ecosystem}</span>
                            </div>
                            <div class="mt-1">
                                <small class="text-muted">
                                    Current: <code>${dep.currentVersion}</code> → Latest: <code>${dep.latestVersion}</code>
                                </small>
                            </div>
                        </div>
                        <div class="vuln-dep-actions">
                            ${updateBadge}
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
            `;

            if (driftAnalysis.outdatedDependencies.length > 10) {
                html += `
                    <div class="text-center mt-2">
                        <small class="text-muted">Showing first 10 of ${driftAnalysis.outdatedDependencies.length} outdated dependencies</small>
                    </div>
                `;
            }

            html += `</div>`;
        } else {
            html += `
                <div class="alert alert-success text-center">
                    <i class="fas fa-check-circle me-2"></i>
                    All dependencies are up to date!
                </div>
            `;
        }

        // Show unknown dependencies if any
        if (driftAnalysis.unknownDependencies.length > 0) {
            html += `
                <div class="mt-3">
                    <div class="alert alert-info">
                        <h6><i class="fas fa-question-circle me-2"></i>Unknown Status</h6>
                        <div class="small">
                            ${driftAnalysis.unknownDependencies.length} dependencies could not be checked for updates
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    /**
     * Get update type badge
     */
    getUpdateTypeBadge(updateType) {
        const badges = {
            'major': '<span class="badge bg-danger">Major Update</span>',
            'minor': '<span class="badge bg-warning">Minor Update</span>',
            'patch': '<span class="badge bg-info">Patch Update</span>',
            'unknown': '<span class="badge bg-secondary">Update Available</span>'
        };
        return badges[updateType] || badges['unknown'];
    }
}

// Global functions for HTML onclick handlers
function startSingleRepoAnalysis() {
    const repoUrl = document.getElementById('repoUrl')?.value?.trim();
    if (repoUrl && window.singleRepoAnalyzer) {
        window.singleRepoAnalyzer.startAnalysis(repoUrl);
    }
}

function saveToken() {
    if (window.singleRepoAnalyzer) {
        window.singleRepoAnalyzer.saveToken();
    }
}

function toggleTokenSection() {
    const body = document.getElementById('tokenSectionBody');
    const icon = document.getElementById('tokenToggleIcon');
    
    if (body && icon) {
        if (body.style.display === 'none') {
            body.style.display = 'block';
            icon.className = 'fas fa-chevron-up';
        } else {
            body.style.display = 'none';
            icon.className = 'fas fa-chevron-down';
        }
    }
}

function loadPreviousAnalysis(owner, name) {
    if (window.singleRepoAnalyzer) {
        window.singleRepoAnalyzer.loadPreviousAnalysis(owner, name);
    }
}

function exportPreviousAnalysis(owner, name) {
    if (window.singleRepoAnalyzer) {
        window.singleRepoAnalyzer.exportPreviousAnalysis(owner, name);
    }
}

function deletePreviousAnalysis(owner, name) {
    if (window.singleRepoAnalyzer) {
        window.singleRepoAnalyzer.deletePreviousAnalysis(owner, name);
    }
}

function exportCurrentAnalysis() {
    if (window.singleRepoAnalyzer) {
        window.singleRepoAnalyzer.exportCurrentAnalysis();
    }
}

function clearCurrentAnalysis() {
    if (window.singleRepoAnalyzer) {
        window.singleRepoAnalyzer.clearCurrentAnalysis();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check IndexedDB support
    if (!SingleRepoStorage.isSupported()) {
        alert('Your browser does not support IndexedDB. Some features may not work properly.');
        return;
    }
    
    // Initialize the single repo analyzer
    window.singleRepoAnalyzer = new SingleRepoAnalyzer();
});
