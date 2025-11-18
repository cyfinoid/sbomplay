/**
 * Settings App - Handles settings page functionality
 */
class SettingsApp {
    constructor() {
        this.githubClient = new GitHubClient();
        this.storageManager = window.storageManager || new StorageManager();
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
        this.displaySanctionsStatus();  // Load and display sanctions status
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
        
        // Attach event listeners for buttons that previously used onclick handlers
        this.attachButtonListeners();
    }
    
    /**
     * Attach event listeners to all buttons
     */
    attachButtonListeners() {
        // Use event delegation for all buttons with data-action attributes
        document.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (!button) return;
            
            const action = button.getAttribute('data-action');
            const cache = button.getAttribute('data-cache');
            
            switch (action) {
                case 'showStorageStatus':
                    this.showStorageStatus();
                    break;
                case 'testStorageQuota':
                    this.testStorageQuota();
                    break;
                case 'migrateOldData':
                    this.migrateOldData();
                    break;
                case 'clearOldData':
                    this.clearOldData();
                    break;
                case 'clearAllData':
                    this.clearAllData();
                    break;
                case 'exportAllData':
                    this.exportAllData();
                    break;
                case 'exportCachedDatabases':
                    this.exportCachedDatabases();
                    break;
                case 'exportAnalysisData':
                    this.exportAnalysisData();
                    break;
                case 'importAllData':
                    this.importAllData();
                    break;
                case 'importCachedDatabases':
                    this.importCachedDatabases();
                    break;
                case 'importAnalysisData':
                    this.importAnalysisData();
                    break;
                case 'exportAuthorsCache':
                    this.exportAuthorsCache();
                    break;
                case 'exportPackagesCache':
                    this.exportPackagesCache();
                    break;
                case 'exportVulnerabilitiesCache':
                    this.exportVulnerabilitiesCache();
                    break;
                case 'importAuthorsCache':
                    this.importAuthorsCache();
                    break;
                case 'importPackagesCache':
                    this.importPackagesCache();
                    break;
                case 'importVulnerabilitiesCache':
                    this.importVulnerabilitiesCache();
                    break;
                case 'clearCache':
                    if (cache) {
                        this.clearCache(cache);
                    }
                    break;
                case 'clearAnalysisData':
                    this.clearAnalysisData();
                    break;
                case 'saveOrgSanctions':
                    this.saveOrgSanctions();
                    break;
            }
        });
        
        // Token section toggle
        const tokenHeader = document.getElementById('tokenSectionHeader');
        if (tokenHeader) {
            tokenHeader.addEventListener('click', () => {
                console.log('🔽 Token section header clicked');
                this.toggleTokenSection();
            });
            // Also add cursor pointer style if not already applied
            tokenHeader.style.cursor = 'pointer';
        } else {
            console.warn('⚠️ Token section header not found');
        }
        
        // Save token button
        const saveTokenBtn = document.getElementById('saveTokenBtn');
        if (saveTokenBtn) {
            saveTokenBtn.addEventListener('click', () => this.saveToken());
        }
        
        // File input for imports
        const importFileInput = document.getElementById('importFileInput');
        if (importFileInput) {
            importFileInput.addEventListener('change', (e) => this.handleFileImport(e));
        }
        
        // Theme select (already handled by theme-manager.js, but keeping for completeness)
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                if (window.themeManager) {
                    window.themeManager.applyTheme(e.target.value);
                }
            });
        }

        // Analysis settings
        const maxDepthInput = document.getElementById('maxDepth');
        if (maxDepthInput) {
            // Load saved max depth
            const savedMaxDepth = localStorage.getItem('maxDepth') || '10';
            maxDepthInput.value = savedMaxDepth;
            document.getElementById('currentMaxDepth').textContent = savedMaxDepth;
            
            maxDepthInput.addEventListener('input', (e) => {
                document.getElementById('currentMaxDepth').textContent = e.target.value;
            });
        }

        const saveAnalysisSettingsBtn = document.getElementById('saveAnalysisSettingsBtn');
        if (saveAnalysisSettingsBtn) {
            saveAnalysisSettingsBtn.addEventListener('click', () => this.saveAnalysisSettings());
        }

        const resetAnalysisSettingsBtn = document.getElementById('resetAnalysisSettingsBtn');
        if (resetAnalysisSettingsBtn) {
            resetAnalysisSettingsBtn.addEventListener('click', () => this.resetAnalysisSettings());
        }

        // API settings
        this.loadApiSettings();
        const saveApiSettingsBtn = document.getElementById('saveApiSettingsBtn');
        if (saveApiSettingsBtn) {
            saveApiSettingsBtn.addEventListener('click', () => this.saveApiSettings());
        }

        const resetApiSettingsBtn = document.getElementById('resetApiSettingsBtn');
        if (resetApiSettingsBtn) {
            resetApiSettingsBtn.addEventListener('click', () => this.resetApiSettings());
        }

        // Redo author detection
        const redoOrgSelect = document.getElementById('redoOrgSelect');
        const redoAuthorDetectionBtn = document.getElementById('redoAuthorDetectionBtn');
        
        if (redoOrgSelect) {
            // Populate dropdown with saved organizations/repositories
            this.populateRedoOrgDropdown();
            
            // Enable/disable button based on selection
            redoOrgSelect.addEventListener('change', (e) => {
                redoAuthorDetectionBtn.disabled = !e.target.value;
            });
        }
        
        if (redoAuthorDetectionBtn) {
            redoAuthorDetectionBtn.addEventListener('click', () => this.redoAuthorDetection());
        }
    }

    /**
     * Populate the redo organization dropdown with saved entries
     */
    async populateRedoOrgDropdown() {
        const select = document.getElementById('redoOrgSelect');
        if (!select) return;

        try {
            const storageInfo = await this.storageManager.getStorageInfo();
            const allEntries = [...storageInfo.organizations, ...storageInfo.repositories];
            
            // Clear existing options except the first placeholder
            select.innerHTML = '<option value="">-- Select an organization or repository --</option>';
            
            if (allEntries.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No saved analyses found';
                option.disabled = true;
                select.appendChild(option);
                return;
            }
            
            // Sort entries by name
            allEntries.sort((a, b) => a.name.localeCompare(b.name));
            
            // Add each entry to dropdown
            allEntries.forEach(entry => {
                const option = document.createElement('option');
                option.value = entry.name;
                option.textContent = `${entry.name} (${entry.repositories} repos, ${entry.dependencies} deps)`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to populate redo org dropdown:', error);
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Error loading entries';
            option.disabled = true;
            select.appendChild(option);
        }
    }

    /**
     * Save analysis settings
     */
    saveAnalysisSettings() {
        const maxDepth = document.getElementById('maxDepth').value;
        const depth = parseInt(maxDepth, 10);
        
        if (isNaN(depth) || depth < 1 || depth > 50) {
            this.showAlert('Maximum depth must be between 1 and 50', 'warning');
            return;
        }

        localStorage.setItem('maxDepth', depth.toString());
        
        // Update dependency tree resolver if available
        if (window.dependencyTreeResolver) {
            window.dependencyTreeResolver.maxDepth = depth;
        }
        
        this.showAlert(`Settings saved! Maximum depth set to ${depth}`, 'success');
        document.getElementById('currentMaxDepth').textContent = depth.toString();
    }

    /**
     * Reset analysis settings to defaults
     */
    resetAnalysisSettings() {
        if (confirm('Reset all analysis settings to defaults?')) {
            localStorage.removeItem('maxDepth');
            document.getElementById('maxDepth').value = '10';
            document.getElementById('currentMaxDepth').textContent = '10';
            
            if (window.dependencyTreeResolver) {
                window.dependencyTreeResolver.maxDepth = 10;
            }
            
            this.showAlert('Settings reset to defaults', 'success');
        }
    }

    /**
     * Load API settings from localStorage
     */
    loadApiSettings() {
        const apiTimeout = localStorage.getItem('apiTimeout');
        const timeoutSeconds = apiTimeout ? parseInt(apiTimeout, 10) / 1000 : 10;
        const apiTimeoutInput = document.getElementById('apiTimeout');
        if (apiTimeoutInput) {
            apiTimeoutInput.value = timeoutSeconds.toString();
            document.getElementById('currentApiTimeout').textContent = timeoutSeconds.toString();
        }

        const debugUrlLogging = localStorage.getItem('debugUrlLogging') === 'true';
        const debugUrlLoggingCheckbox = document.getElementById('debugUrlLogging');
        if (debugUrlLoggingCheckbox) {
            debugUrlLoggingCheckbox.checked = debugUrlLogging;
        }
    }

    /**
     * Save API settings
     */
    saveApiSettings() {
        const apiTimeoutInput = document.getElementById('apiTimeout');
        const timeoutSeconds = parseInt(apiTimeoutInput.value, 10);
        
        if (isNaN(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) {
            this.showAlert('API timeout must be between 1 and 300 seconds', 'warning');
            return;
        }

        const timeoutMs = timeoutSeconds * 1000;
        localStorage.setItem('apiTimeout', timeoutMs.toString());
        document.getElementById('currentApiTimeout').textContent = timeoutSeconds.toString();

        const debugUrlLoggingCheckbox = document.getElementById('debugUrlLogging');
        const debugUrlLogging = debugUrlLoggingCheckbox.checked;
        localStorage.setItem('debugUrlLogging', debugUrlLogging.toString());

        this.showAlert('API settings saved!', 'success');
    }

    /**
     * Reset API settings to defaults
     */
    resetApiSettings() {
        if (confirm('Reset all API settings to defaults?')) {
            localStorage.removeItem('apiTimeout');
            localStorage.removeItem('debugUrlLogging');
            
            document.getElementById('apiTimeout').value = '10';
            document.getElementById('currentApiTimeout').textContent = '10';
            document.getElementById('debugUrlLogging').checked = false;
            
            this.showAlert('API settings reset to defaults', 'success');
        }
    }

    /**
     * Redo author detection for specific organization/repository
     */
    async redoAuthorDetection() {
        console.log('🔄 Redo author detection started');
        const orgSelect = document.getElementById('redoOrgSelect');
        const orgName = orgSelect?.value?.trim();
        
        if (!orgName) {
            console.warn('⚠️ No organization selected');
            this.showAlert('Please select an organization or repository', 'warning');
            return;
        }

        console.log(`📋 Selected organization: ${orgName}`);

        // Check if GitHub token is needed before proceeding
        // Load the analysis data to count packages
        const storageInfo = await this.storageManager.getStorageInfo();
        const allEntries = [...storageInfo.organizations, ...storageInfo.repositories];
        const matchingEntry = allEntries.find(e => 
            e.name.toLowerCase() === orgName.toLowerCase() ||
            e.name.toLowerCase().includes(orgName.toLowerCase())
        );

        if (!matchingEntry) {
            this.showAlert(`No analysis found for "${orgName}"`, 'warning');
            return;
        }

        const analysisData = await this.storageManager.loadAnalysisDataForOrganization(matchingEntry.name);
        if (!analysisData || !analysisData.data || !analysisData.data.allDependencies) {
            this.showAlert(`No dependency data found for "${orgName}"`, 'warning');
            return;
        }

        // Count unique packages that will need author detection
        const packageKeys = new Set();
        analysisData.data.allDependencies.forEach(dep => {
            if (dep.purl) {
                const ecosystem = this.getEcosystemFromPurl(dep.purl);
                const name = this.getPackageNameFromPurl(dep.purl);
                if (ecosystem && name) {
                    packageKeys.add(`${ecosystem}:${name}`);
                }
            }
        });
        const packageCount = packageKeys.size;
        console.log(`📦 Found ${packageCount} unique packages for author detection`);

        // Check rate limit
        let rateLimitInfo;
        try {
            rateLimitInfo = await this.githubClient.getRateLimitInfo();
            console.log(`📊 Rate limit: ${rateLimitInfo.remaining}/${rateLimitInfo.limit} remaining`);
        } catch (error) {
            console.warn('⚠️ Failed to get rate limit info:', error);
            rateLimitInfo = { remaining: 60, limit: 60 }; // Default to unauthenticated limit
        }

        // Check if token is needed
        const hasToken = !!this.githubClient.token || !!sessionStorage.getItem('github_token');
        const needsToken = packageCount > 10 || (packageCount <= 10 && rateLimitInfo.remaining < 60);

        if (needsToken && !hasToken) {
            const message = packageCount > 10 
                ? `GitHub token is required for author detection with ${packageCount} packages (>10). Please set a GitHub token in the settings above.`
                : `GitHub token is required. Rate limit remaining (${rateLimitInfo.remaining}) is below 60, and you have ${packageCount} packages to process. Please set a GitHub token in the settings above.`;
            
            this.showAlert(message, 'warning');
            console.warn('⚠️ GitHub token required but not set');
            
            // Scroll to token section and open it
            const tokenSection = document.getElementById('tokenSectionHeader');
            if (tokenSection) {
                tokenSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    const tokenBody = document.getElementById('tokenSectionBody');
                    if (tokenBody && tokenBody.classList.contains('d-none')) {
                        this.toggleTokenSection();
                    }
                }, 500);
            }
            return;
        }

        if (!confirm(`This will clear cached author data for "${orgName}" and re-fetch from APIs. Continue?`)) {
            console.log('❌ User cancelled');
            return;
        }

        // Show progress bar
        const progressContainer = document.getElementById('authorDetectionProgress');
        const progressBar = document.getElementById('authorDetectionProgressBar');
        const statusText = document.getElementById('authorDetectionStatus');
        const detailsText = document.getElementById('authorDetectionDetails');
        const redoBtn = document.getElementById('redoAuthorDetectionBtn');
        
        if (!progressContainer || !progressBar || !statusText || !detailsText || !redoBtn) {
            console.error('❌ Progress bar elements not found');
            this.showAlert('Progress bar elements not found. Please refresh the page.', 'danger');
            return;
        }
        
        console.log('📊 Showing progress bar');
        progressContainer.classList.remove('d-none');
        redoBtn.disabled = true;
        
        const updateProgress = (percent, status, details = '') => {
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
            progressBar.textContent = `${Math.round(percent)}%`;
            statusText.textContent = status;
            if (details) {
                detailsText.textContent = details;
            }
        };

        try {
            updateProgress(5, 'Loading analysis data...', '');
            
            // Note: We already loaded analysisData above for validation, but we'll reload it here
            // to ensure we have the latest data
            updateProgress(10, 'Loading package data...', '');
            
            // Re-load to ensure we have fresh data (already loaded above, but keeping for consistency)
            const storageInfoReload = await this.storageManager.getStorageInfo();
            const allEntriesReload = [...storageInfoReload.organizations, ...storageInfoReload.repositories];
            const matchingEntryReload = allEntriesReload.find(e => 
                e.name.toLowerCase() === orgName.toLowerCase() ||
                e.name.toLowerCase().includes(orgName.toLowerCase())
            );

            if (!matchingEntryReload) {
                this.showAlert(`No analysis found for "${orgName}"`, 'warning');
                progressContainer.classList.add('d-none');
                redoBtn.disabled = false;
                return;
            }

            // Use the already loaded analysisData from validation above
            if (!analysisData || !analysisData.data || !analysisData.data.allDependencies) {
                this.showAlert(`No dependency data found for "${orgName}"`, 'warning');
                progressContainer.classList.add('d-none');
                redoBtn.disabled = false;
                return;
            }

            updateProgress(15, 'Clearing cached author data...', '');
            
            // Clear author cache for packages in this analysis
            const dbManager = window.indexedDBManager;
            if (dbManager && dbManager.db) {
                const dependencies = analysisData.data.allDependencies || [];
                const packageKeys = new Set();
                
                dependencies.forEach(dep => {
                    if (dep.purl) {
                        const ecosystem = this.getEcosystemFromPurl(dep.purl);
                        const name = this.getPackageNameFromPurl(dep.purl);
                        if (ecosystem && name) {
                            packageKeys.add(`${ecosystem}:${name}`);
                        }
                    }
                });
                
                let clearedCount = 0;
                let totalRelationships = 0;
                const totalPackages = packageKeys.size;
                
                // First, count total relationships to clear
                for (const packageKey of packageKeys) {
                    const relationships = await dbManager.getPackageAuthors(packageKey);
                    totalRelationships += relationships.length;
                }
                
                // Now delete relationships for each package
                for (const packageKey of packageKeys) {
                    const relationships = await dbManager.getPackageAuthors(packageKey);
                    
                    // Delete each relationship in a single transaction per package
                    if (relationships.length > 0) {
                        const transaction = dbManager.db.transaction(['packageAuthors'], 'readwrite');
                        const store = transaction.objectStore('packageAuthors');
                        
                        // Delete all relationships for this package
                        const deletePromises = relationships.map(rel => 
                            dbManager._promisifyRequest(store.delete(rel.packageAuthorKey))
                        );
                        await Promise.all(deletePromises);
                        clearedCount += relationships.length;
                    }
                    
                    const progressPercent = 15 + (clearedCount / Math.max(totalRelationships, 1) * 10);
                    updateProgress(progressPercent, 
                        `Clearing cache: ${clearedCount} relationships...`,
                        `Cleared ${clearedCount} package-author relationships`);
                }
                
                updateProgress(25, 'Cache cleared. Starting author detection...', `Cleared ${clearedCount} package-author relationships`);
            } else {
                updateProgress(25, 'Database not available, proceeding without clearing cache...', '');
            }

            // Now actually re-run author detection
            if (!window.AuthorService) {
                console.error('❌ AuthorService not available. Make sure author-service.js is loaded.');
                this.showAlert('AuthorService not available. Please refresh the page.', 'warning');
                progressContainer.classList.add('d-none');
                redoBtn.disabled = false;
                return;
            }

            console.log('✅ AuthorService available, initializing...');
            updateProgress(30, 'Initializing author service...', '');
            
            const authorService = new window.AuthorService();
            console.log('✅ AuthorService initialized');
            
            // Extract unique packages with ecosystem info (similar to analyzeAuthors)
            updateProgress(35, 'Extracting packages from dependencies...', '');
            
            const packageMap = new Map();
            analysisData.data.allDependencies
                .filter(dep => dep.purl)
                .forEach(dep => {
                    const ecosystem = this.getEcosystemFromPurl(dep.purl);
                    const name = this.getPackageNameFromPurl(dep.purl);
                    
                    if (!ecosystem || !name) return;
                    
                    const key = `${ecosystem}:${name}`;
                    const repositories = dep.repositories || [];
                    
                    if (packageMap.has(key)) {
                        const existing = packageMap.get(key);
                        const existingRepos = new Set(existing.repositories || []);
                        repositories.forEach(repo => existingRepos.add(repo));
                        existing.repositories = Array.from(existingRepos);
                    } else {
                        packageMap.set(key, {
                            ecosystem: ecosystem,
                            name: name,
                            purl: dep.purl,
                            repositories: Array.from(new Set(repositories))
                        });
                    }
                });
            
            const packages = Array.from(packageMap.values());
            updateProgress(40, `Found ${packages.length} unique packages`, `Processing ${packages.length} packages for author detection`);
            
            // Fetch authors with progress callback
            updateProgress(45, 'Fetching author information from APIs...', 'This may take a while...');
            
            const authorResults = await authorService.fetchAuthorsForPackages(
                packages,
                (processed, total) => {
                    const percent = 45 + (processed / total * 50);
                    updateProgress(percent, 
                        `Fetching authors: ${processed}/${total} packages`,
                        `Processing ${processed} of ${total} packages...`);
                }
            );
            
            updateProgress(95, 'Saving author analysis results...', '');
            
            // Convert Map to array and sort by repository count
            const authorsList = Array.from(authorResults.values())
                .sort((a, b) => {
                    if (b.repositoryCount !== a.repositoryCount) {
                        return b.repositoryCount - a.repositoryCount;
                    }
                    const aPackageCount = [...new Set(a.packages)].length;
                    const bPackageCount = [...new Set(b.packages)].length;
                    if (bPackageCount !== aPackageCount) {
                        return bPackageCount - aPackageCount;
                    }
                    return b.count - a.count;
                });
            
            // Store only references (author keys) instead of full author data
            const authorReferences = authorsList.map(author => {
                let authorKey;
                if (author.author.includes(':')) {
                    authorKey = author.author;
                } else {
                    authorKey = `${author.ecosystem}:${author.author}`;
                }
                
                return {
                    authorKey: authorKey,
                    ecosystem: author.ecosystem,
                    packages: [...new Set(author.packages)],
                    packageRepositories: author.packageRepositories,
                    repositories: author.repositories,
                    repositoryCount: author.repositoryCount,
                    count: author.count
                };
            });
            
            // Save to analysis data
            analysisData.data.authorAnalysis = {
                timestamp: Date.now(),
                totalAuthors: authorReferences.length,
                totalPackages: packages.length,
                authors: authorReferences,
                _cacheVersion: 3
            };
            
            await this.storageManager.saveAnalysisData(matchingEntry.name, analysisData.data);
            
            updateProgress(100, 'Author detection complete!', `Detected ${authorsList.length} unique authors for ${packages.length} packages`);
            console.log(`✅ Author detection complete! Found ${authorsList.length} unique authors for ${packages.length} packages`);
            
            // Show success message
            setTimeout(() => {
                this.showAlert(`Author detection complete! Found ${authorsList.length} unique authors for ${packages.length} packages.`, 'success');
                progressContainer.classList.add('d-none');
                redoBtn.disabled = false;
                console.log('✅ Progress bar hidden, button re-enabled');
            }, 2000);
            
        } catch (error) {
            console.error('❌ Redo author detection failed:', error);
            console.error('Error stack:', error.stack);
            updateProgress(0, 'Error occurred', error.message);
            this.showAlert(`Failed to redo author detection: ${error.message}`, 'danger');
            progressContainer.classList.add('d-none');
            redoBtn.disabled = false;
        }
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

    /**
     * Toggle token section visibility
     */
    toggleTokenSection() {
        const tokenSection = document.getElementById('tokenSectionBody');
        const toggleIcon = document.getElementById('tokenToggleIcon');
        
        if (!tokenSection || !toggleIcon) {
            console.warn('⚠️ Token section elements not found');
            return;
        }
        
        // Toggle Bootstrap d-none class
        const isHidden = tokenSection.classList.contains('d-none');
        console.log(`🔄 Toggling token section: ${isHidden ? 'showing' : 'hiding'}`);
        
        if (isHidden) {
            tokenSection.classList.remove('d-none');
            toggleIcon.className = 'fas fa-chevron-up';
            console.log('✅ Token section shown');
        } else {
            tokenSection.classList.add('d-none');
            toggleIcon.className = 'fas fa-chevron-down';
            console.log('✅ Token section hidden');
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
            const maskedToken = savedToken.length > 8 ? `${savedToken.substring(0, 4)}...${savedToken.substring(savedToken.length - 4)}` : '****';
            console.log(`🔑 Loaded GitHub token from sessionStorage: ${maskedToken}`);
            this.updateTokenStatus('Token loaded from session', 'success');
        } else {
            console.log('🔑 No GitHub token found in sessionStorage');
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
            const maskedToken = token.length > 8 ? `${token.substring(0, 4)}...${token.substring(token.length - 4)}` : '****';
            console.log(`🔑 GitHub token saved to sessionStorage: ${maskedToken}`);
            this.githubClient.setToken(token);
            this.updateTokenStatus('Token saved to session (not persistent)', 'success');
            
            // Reload rate limit info
            this.loadRateLimitInfo();
        } else {
            // Clear token
            sessionStorage.removeItem('github_token');
            console.log('🔑 GitHub token removed from sessionStorage');
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
                        <div class="progress-bar bg-${statusClass} progress-bar-dynamic" role="progressbar" 
                             style="--progress-width: ${usagePercentage}%" 
                             aria-valuenow="${usagePercentage}" aria-valuemin="0" aria-valuemax="100">
                            ${usagePercentage.toFixed(1)}%
                        </div>
                    </div>
                    <p class="small text-muted mb-0">
                        <strong>${(storageInfo.totalSize / 1024 / 1024).toFixed(2)}MB</strong> used of 
                        <strong>${(storageInfo.maxStorageSize / 1024 / 1024).toFixed(2)}MB</strong> quota 
                        (${((storageInfo.totalSize / storageInfo.maxStorageSize) * 100).toFixed(3)}%)
                    </p>
                    ${storageInfo.totalSize > 0 && storageInfo.totalEntries === 0 ? 
                        '<p class="small text-info mt-2 mb-0"><i class="fas fa-info-circle me-1"></i>Storage includes entity caches (authors, packages, vulnerabilities) that persist even when analysis data is cleared.</p>' : ''}
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
        
        // Refresh the redo org dropdown when organizations list is updated
        await this.populateRedoOrgDropdown();
        
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
     * Save organization-specific sanctioned countries
     */
    saveOrgSanctions() {
        const input = document.getElementById('orgSanctions');
        if (!input) {
            this.showAlert('Sanctions input field not found', 'danger');
            return;
        }

        const value = input.value.trim();
        
        if (!value) {
            // Clear org sanctions if input is empty
            if (window.SanctionsService) {
                const sanctionsService = new SanctionsService();
                sanctionsService.saveOrgSanctions([]);
                this.showAlert('Organization sanctions cleared', 'success');
                this.displaySanctionsStatus();
                return;
            }
        }

        // Parse country codes (comma-separated, trim whitespace)
        const countryCodes = value.split(',')
            .map(code => code.trim().toUpperCase())
            .filter(code => code.length === 2);

        if (countryCodes.length === 0) {
            this.showAlert('Please enter valid ISO 3166-1 alpha-2 country codes (e.g., CN, RU, BY)', 'warning');
            return;
        }

        // Validate country codes (basic check - should be 2 uppercase letters)
        const invalidCodes = countryCodes.filter(code => !/^[A-Z]{2}$/.test(code));
        if (invalidCodes.length > 0) {
            this.showAlert(`Invalid country codes: ${invalidCodes.join(', ')}. Please use ISO 3166-1 alpha-2 format (2 uppercase letters)`, 'warning');
            return;
        }

        if (window.SanctionsService) {
            const sanctionsService = new SanctionsService();
            const success = sanctionsService.saveOrgSanctions(countryCodes);
            if (success) {
                this.showAlert(`Saved ${countryCodes.length} organization-sanctioned countries`, 'success');
                this.displaySanctionsStatus();
            } else {
                this.showAlert('Failed to save organization sanctions', 'danger');
            }
        } else {
            this.showAlert('Sanctions service not available', 'warning');
        }
    }

    /**
     * Display current sanctions status
     */
    displaySanctionsStatus() {
        const statusDiv = document.getElementById('sanctionsStatus');
        if (!statusDiv) {
            return;
        }

        if (!window.SanctionsService) {
            statusDiv.innerHTML = '<div class="alert alert-warning">Sanctions service not available</div>';
            return;
        }

        const sanctionsService = new SanctionsService();
        const allSanctions = sanctionsService.getAllSanctions();

        let html = '<div class="row">';
        
        // USA Sanctions
        html += '<div class="col-md-4 mb-3">';
        html += '<h6 class="small text-muted mb-2">USA (OFAC) Sanctions</h6>';
        if (allSanctions.usa.length > 0) {
            html += `<div class="small"><code>${allSanctions.usa.join(', ')}</code></div>`;
            html += `<div class="text-muted small mt-1">${allSanctions.usa.length} countries</div>`;
        } else {
            html += '<div class="text-muted small">None configured</div>';
        }
        html += '</div>';

        // UN Sanctions
        html += '<div class="col-md-4 mb-3">';
        html += '<h6 class="small text-muted mb-2">UN Sanctions</h6>';
        if (allSanctions.un.length > 0) {
            html += `<div class="small"><code>${allSanctions.un.join(', ')}</code></div>`;
            html += `<div class="text-muted small mt-1">${allSanctions.un.length} countries</div>`;
        } else {
            html += '<div class="text-muted small">None configured</div>';
        }
        html += '</div>';

        // Organization Sanctions
        html += '<div class="col-md-4 mb-3">';
        html += '<h6 class="small text-muted mb-2">Organization Sanctions</h6>';
        if (allSanctions.org.length > 0) {
            html += `<div class="small"><code>${allSanctions.org.join(', ')}</code></div>`;
            html += `<div class="text-muted small mt-1">${allSanctions.org.length} countries</div>`;
        } else {
            html += '<div class="text-muted small">None configured</div>';
        }
        html += '</div>';

        html += '</div>';

        // Load current org sanctions into input field
        const orgSanctionsInput = document.getElementById('orgSanctions');
        if (orgSanctionsInput) {
            orgSanctionsInput.value = allSanctions.org.join(', ');
        }

        statusDiv.innerHTML = html;
    }

    /**
     * Show alert message
     */
    showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        // Escape HTML to prevent XSS attacks
        const escapedMessage = escapeHtml(message);
        // Use safeSetHTML if available, otherwise use innerHTML with escaped content
        if (window.viewManager && typeof window.viewManager.safeSetHTML === 'function') {
            window.viewManager.safeSetHTML(alertDiv, `
                ${escapedMessage}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `);
        } else {
            alertDiv.innerHTML = `
                ${escapedMessage}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
        }
        
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