/**
 * View Manager - Handles detailed views of SBOM data
 */
class ViewManager {
    constructor() {
        this.currentView = 'overview';
        this.currentOrganization = null;
        this.currentDependency = null;
    }

    /**
     * Safely set HTML content to an element using DOMPurify (preferred) or DOMParser (fallback)
     * DOMPurify provides better XSS protection by sanitizing HTML
     * Falls back to DOMParser if DOMPurify is not available
     * Note: The HTML string should already have user-controlled data escaped
     * by the caller (e.g., using escapeHtml() before building the HTML string)
     * @param {HTMLElement} element - The element to set HTML content for
     * @param {string} html - The HTML string to insert (should have user data already escaped)
     */
    safeSetHTML(element, html) {
        if (!element || !html) {
            if (element) element.innerHTML = '';
            return;
        }
        try {
            // Prefer DOMPurify if available (better XSS protection)
            if (typeof DOMPurify !== 'undefined') {
                // Sanitize HTML using DOMPurify with permissive settings for application HTML
                // This allows Bootstrap classes, icons, and other safe HTML elements
                const cleanHTML = DOMPurify.sanitize(html, {
                    // Allow common HTML elements used in the application
                    ALLOWED_TAGS: ['div', 'span', 'p', 'strong', 'em', 'b', 'i', 'u', 'code', 'pre', 'ul', 'ol', 'li', 
                                   'a', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 
                                   'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'button', 'input', 
                                   'select', 'option', 'form', 'label', 'small', 'sup', 'sub', 'img', 'svg', 'path'],
                    // Allow common attributes including Bootstrap classes and data attributes
                    ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'title', 'target', 'rel', 'role', 'aria-label', 
                                   'aria-labelledby', 'aria-hidden', 'data-bs-toggle', 'data-bs-target', 'data-bs-dismiss',
                                   'data-sort', 'data-dep-index', 'data-repos', 'data-parents', 'data-parents-by-repo',
                                   'data-package', 'data-package-key', 'data-package-name', 'data-package-version',
                                   'data-package-ecosystem', 'data-package-repos', 'data-package-raw', 'onclick',
                                   'src', 'alt', 'width', 'height', 'type', 'value', 'checked', 'disabled', 'readonly'],
                    // Allow safe URLs
                    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
                    // Keep relative URLs
                    ALLOW_UNKNOWN_PROTOCOLS: false
                });
                element.innerHTML = cleanHTML;
            } else {
                // Fallback to DOMParser if DOMPurify is not available
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                // Clear the element and append the parsed content
                element.innerHTML = '';
                // Append all nodes from the parsed document body
                while (doc.body.firstChild) {
                    element.appendChild(doc.body.firstChild);
                }
            }
        } catch (e) {
            // Fallback to empty content if parsing fails
            console.error('Error parsing HTML:', e);
            element.innerHTML = '';
        }
    }


    /**
     * Render overview header HTML
     */
    renderOverviewHeader(organization, analyzedDate) {
        // escapeHtml is provided by utils.js
        return `<div class="view-header">
    <button class="btn btn-secondary" onclick="viewManager.goBack()">
        ← Back to Analysis
    </button>
    <h2>📊 ${escapeHtml(organization)} - Dependency Overview</h2>
    <p class="text-muted">Analyzed on ${escapeHtml(analyzedDate)}</p>
    <div class="mt-2">
        <button class="btn btn-primary btn-sm" onclick="viewManager.runBatchVulnerabilityQuery('${escapeJsString(escapeHtml(organization))}')">
            <i class="fas fa-shield-alt"></i> Vulnerability Scan (All Repos)
        </button>
        <button class="btn btn-success btn-sm" onclick="viewManager.runLicenseComplianceCheck('${escapeJsString(escapeHtml(organization))}')">
            <i class="fas fa-gavel"></i> License Compliance Check
        </button>
        <button class="btn btn-info btn-sm" onclick="viewManager.showVulnerabilityCacheStats()">
            <i class="fas fa-database"></i> Cache Stats
        </button>
        <button class="btn btn-warning btn-sm" onclick="viewManager.clearVulnerabilityCache()">
            <i class="fas fa-trash"></i> Clear Cache
        </button>
        <button class="btn btn-secondary btn-sm" onclick="viewManager.showCentralizedVulnerabilityStats()">
            <i class="fas fa-server"></i> Centralized Storage
        </button>
    </div>
</div>`;
    }

    /**
     * Render license section HTML
     */
    renderLicenseSection(hasLicenseAnalysis, licenseComplianceHTML, organization) {
        // escapeHtml is provided by utils.js
        if (hasLicenseAnalysis) {
            return `<div id="license-section" class="independent-section">
    <div class="license-breakdown">
        <h3>⚖️ License Compliance Analysis</h3>
        ${licenseComplianceHTML}
    </div>
</div>`;
        } else {
            return `<div id="license-section" class="independent-section">
    <div class="license-breakdown">
        <h3>⚖️ License Compliance Analysis</h3>
        <div class="alert alert-info">
            <h6>📋 No License Analysis Yet</h6>
            <p>This organization hasn't been analyzed for license compliance yet. License analysis is performed automatically during the SBOM processing.</p>
            <p><strong>Note:</strong> License analysis includes detection of copyleft licenses, license conflicts, and compliance recommendations.</p>
            <div class="mt-3">
                <button class="btn btn-success btn-sm" onclick="viewManager.runLicenseComplianceCheck('${escapeJsString(escapeHtml(organization))}')">
                    <i class="fas fa-gavel"></i> Run License Compliance Check
                </button>
            </div>
        </div>
    </div>
</div>`;
        }
    }

    /**
     * Render dependency details HTML
     */
    renderDependencyDetails(data) {
        // escapeHtml is provided by utils.js
        let fundingHTML = '';
        if (data.packageFunding) {
            const fundingButtons = [];
            if (data.fundingGitHub) {
                fundingButtons.push(`<a href="${escapeHtml(data.fundingUrl)}" target="_blank" class="btn btn-sm btn-outline-danger">
                <i class="fas fa-heart me-1"></i>GitHub Sponsors
            </a>`);
            }
            if (data.fundingOpenCollective) {
                fundingButtons.push(`<a href="${escapeHtml(data.fundingUrl)}" target="_blank" class="btn btn-sm btn-outline-primary">
                <i class="fas fa-hand-holding-usd me-1"></i>Open Collective
            </a>`);
            }
            if (data.fundingPatreon) {
                fundingButtons.push(`<a href="${escapeHtml(data.fundingUrl)}" target="_blank" class="btn btn-sm btn-outline-danger">
                <i class="fab fa-patreon me-1"></i>Patreon
            </a>`);
            }
            if (data.fundingTidelift) {
                fundingButtons.push(`<a href="${escapeHtml(data.fundingUrl)}" target="_blank" class="btn btn-sm btn-outline-warning">
                <i class="fas fa-gift me-1"></i>Tidelift
            </a>`);
            }
            if (data.fundingGeneric) {
                fundingButtons.push(`<a href="${escapeHtml(data.fundingUrl)}" target="_blank" class="btn btn-sm btn-outline-info">
                <i class="fas fa-donate me-1"></i>Support
            </a>`);
            }
            
            fundingHTML = `<div class="detail-section">
        <h3>💝 Package Funding</h3>
        <div class="alert alert-info mb-2">
            <small>
                <i class="fas fa-info-circle me-1"></i>
                This package accepts donations/sponsorships.
            </small>
        </div>
        <div class="d-flex flex-wrap gap-2">
            ${fundingButtons.join('\n            ')}
        </div>
    </div>`;
        }

        const repositoriesHTML = data.repositories.map(repo => {
            const archivedBadge = repo.archived ? '<span class="badge bg-secondary ms-2" title="Archived Repository"><i class="fas fa-archive"></i> Archived</span>' : '';
            const archivedClass = repo.archived ? ' archived-repo' : '';
            return `
            <div class="repository-item${archivedClass}" onclick="viewManager.showRepositoryDetailsFromAllReposIndex(${repo.index}, '${escapeJsString(escapeHtml(repo.organization))}')">
                <div class="repo-name">${escapeHtml(repo.owner)}/${escapeHtml(repo.name)}${archivedBadge}</div>
                <div class="repo-deps">${repo.totalDependencies} total deps</div>
            </div>`;
        }).join('');

        let categoryHTML = '';
        if (data.category) {
            categoryHTML = `
            <div class="info-item">
                <label>Type:</label>
                <span class="badge badge-${escapeHtml(data.category.type)}">${escapeHtml(data.category.type)}</span>
            </div>
            <div class="info-item">
                <label>Language:</label>
                <span>${escapeHtml(data.category.language)}</span>
            </div>
            <div class="info-item">
                <label>Ecosystem:</label>
                <span>${escapeHtml(data.category.ecosystem)}</span>
            </div>`;
        }

        let licenseHTML = '';
        if (data.hasLicenseAnalysis) {
            licenseHTML = data.licenseInfoHTML;
        } else {
            licenseHTML = `<div class="alert alert-info">
            <h6>📋 No License Analysis Available</h6>
            <p>License analysis hasn't been performed for this organization yet. License information will be available after the next analysis run.</p>
            <div class="mt-3">
                <button class="btn btn-success btn-sm" onclick="viewManager.runLicenseComplianceCheck('${escapeJsString(escapeHtml(data.organization))}')">
                    <i class="fas fa-gavel"></i> Run License Compliance Check
                </button>
            </div>
        </div>`;
        }

        return `<div class="view-header">
    <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverviewFromStorage('${escapeJsString(escapeHtml(data.organization))}')">
        ← Back to Overview
    </button>
    <h2>📦 ${escapeHtml(data.name)}@${escapeHtml(data.version)}</h2>
    <p class="text-muted">Used in ${data.count} repositories</p>
</div>

<div class="dependency-details">
    <div class="detail-section">
        <h3>📋 Dependency Information</h3>
        <div class="info-grid">
            <div class="info-item">
                <label>Name:</label>
                <span>${escapeHtml(data.name)}</span>
            </div>
            <div class="info-item">
                <label>Version:</label>
                <span>${escapeHtml(data.version)}</span>
            </div>
            <div class="info-item">
                <label>Usage Count:</label>
                <span>${data.count} repositories</span>
            </div>
            ${categoryHTML}
        </div>
    </div>

    ${fundingHTML}

    <div class="detail-section">
        <h3>📁 Used in Repositories</h3>
        <div class="repository-list">
            ${repositoriesHTML}
        </div>
    </div>

    <div class="detail-section">
        <h3>🔍 Security Analysis</h3>
        <div class="mt-3">
            <button class="btn btn-primary btn-sm" onclick="viewManager.quickScanDependency('${escapeJsString(escapeHtml(data.name))}', '${escapeJsString(escapeHtml(data.version))}', '${escapeJsString(escapeHtml(data.organization))}')">
                <i class="fas fa-shield-alt"></i> Quick Vulnerability Scan
            </button>
            <button class="btn btn-info btn-sm" onclick="viewManager.showVulnerabilityCacheStats()">
                <i class="fas fa-database"></i> Cache Stats
            </button>
            <button class="btn btn-warning btn-sm" onclick="viewManager.clearVulnerabilityCache()">
                <i class="fas fa-trash"></i> Clear Cache
            </button>
        </div>
    </div>

    <div class="detail-section">
        <h3>⚖️ License Information</h3>
        ${licenseHTML}
    </div>

    <div class="detail-section">
        <h3>🔍 Future Enhancements</h3>
        <div class="enhancement-list">
            <div class="enhancement-item">
                <span class="enhancement-icon">🔗</span>
                <span>GitHub Package Registry info</span>
            </div>
            <div class="enhancement-item">
                <span class="enhancement-icon">📊</span>
                <span>NPM download statistics</span>
            </div>
            <div class="enhancement-item">
                <span class="enhancement-icon">📈</span>
                <span>Version popularity trends</span>
            </div>
        </div>
    </div>
</div>`;
    }

    /**
     * Show organization overview
     */
    async showOrganizationOverview(orgData) {
        this.currentOrganization = orgData;
        this.currentView = 'overview';
        
        // Try different container IDs based on the current page
        let container = document.getElementById('view-container');
        if (!container) {
            container = document.getElementById('vulnerability-analysis-page');
        }
        if (!container) {
            container = document.querySelector('.container');
        }
        
        if (container) {
            const html = await this.generateOverviewHTML(orgData);
            this.safeSetHTML(container, html);
            
            // Add event listeners for navigation
            this.addOverviewEventListeners();
            
            console.log('📊 Showing organization overview');
        } else {
            console.error('No suitable container found for organization overview');
            this.showAlert('Unable to display organization overview - no container found', 'warning');
        }
    }

    /**
     * Show dependency details from index (safe for HTML) - async
     */
    async showDependencyDetailsFromIndex(index, organization) {
        console.log('Showing dependency details from index:', index, 'for org:', organization);
        
        // Handle combined data
        if (organization === 'All Organizations Combined') {
            const combinedData = await storageManager.getCombinedData();
            if (!combinedData) {
                console.error('Combined data not found');
                this.showError('Combined data not found');
                return;
            }
            
            const topDeps = combinedData.data.topDependencies || [];
            if (index < 0 || index >= topDeps.length) {
                console.error('Invalid dependency index:', index);
                this.showError('Invalid dependency index');
                return;
            }
            
            const dependency = topDeps[index];
            console.log('Retrieved dependency from combined data:', dependency);
            
            this.showDependencyDetails(dependency, combinedData);
            return;
        }
        
        // Get data from storage for individual entry (org or repo)
        const entryData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!entryData) {
            console.error('Entry data not found:', organization);
            this.showError('Entry data not found');
            return;
        }
        
        const topDeps = entryData.data.topDependencies || [];
        if (index < 0 || index >= topDeps.length) {
            console.error('Invalid dependency index:', index);
            this.showError('Invalid dependency index');
            return;
        }
        
        const dependency = topDeps[index];
        console.log('Retrieved dependency:', dependency);
        
        this.showDependencyDetails(dependency, entryData);
    }

    /**
     * Show dependency details
     */
    showDependencyDetails(dependency, orgData) {
        this.currentDependency = dependency;
        this.currentView = 'dependency';
        
        // Try different container IDs based on the current page
        let container = document.getElementById('view-container');
        if (!container) {
            container = document.getElementById('vulnerability-analysis-page');
        }
        if (!container) {
            container = document.querySelector('.container');
        }
        
        if (container) {
            // generateDependencyHTML is now async (to fetch package funding)
            this.generateDependencyHTML(dependency, orgData).then(html => {
                this.safeSetHTML(container, html);
                // Add event listeners
                this.addDependencyEventListeners();
                console.log('📦 Showing dependency details:', dependency.name);
            }).catch(err => {
                console.error('Error generating dependency HTML:', err);
                const errorHtml = `<div class="alert alert-danger">Error loading dependency details: ${this.escapeHtml(err.message)}</div>`;
                this.safeSetHTML(container, errorHtml);
            });
        } else {
            console.error('No suitable container found for dependency details');
            this.showAlert('Unable to display dependency details - no container found', 'warning');
        }
    }

    /**
     * Show repository details from index (safe for HTML)
     */
    async showRepositoryDetailsFromIndex(index, organization) {
        console.log('Showing repository details from index:', index, 'for org:', organization);
        
        // Handle combined data
        if (organization === 'All Organizations Combined') {
            const combinedData = await storageManager.getCombinedData();
            if (!combinedData) {
                console.error('Combined data not found');
                this.showError('Combined data not found');
                return;
            }
            
            const topRepos = combinedData.data.topRepositories || [];
            if (index < 0 || index >= topRepos.length) {
                console.error('Invalid repository index:', index);
                this.showError('Invalid repository index');
                return;
            }
            
            const repo = topRepos[index];
            console.log('Retrieved repository from combined data:', repo);
            
            this.showRepositoryDetails(repo, combinedData);
            return;
        }
        
        // Get data from storage for individual organization
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData) {
            console.error('Organization data not found:', organization);
            this.showError('Organization data not found');
            return;
        }
        
        const topRepos = orgData.data.topRepositories || [];
        if (index < 0 || index >= topRepos.length) {
            console.error('Invalid repository index:', index);
            this.showError('Invalid repository index');
            return;
        }
        
        const repo = topRepos[index];
        console.log('Retrieved repository:', repo);
        
        this.showRepositoryDetails(repo, orgData);
    }

    /**
     * Show repository details from all repositories index (safe for HTML)
     */
    async showRepositoryDetailsFromAllReposIndex(index, organization) {
        console.log('Showing repository details from all repos index:', index, 'for org:', organization);
        
        // Handle combined data
        if (organization === 'All Organizations Combined') {
            const combinedData = await storageManager.getCombinedData();
            if (!combinedData) {
                console.error('Combined data not found');
                this.showError('Combined data not found');
                return;
            }
            
            const allRepos = combinedData.data.allRepositories || [];
            if (index < 0 || index >= allRepos.length) {
                console.error('Invalid repository index:', index);
                this.showError('Invalid repository index');
                return;
            }
            
            const repo = allRepos[index];
            console.log('Retrieved repository from combined data:', repo);
            
            this.showRepositoryDetails(repo, combinedData);
            return;
        }
        
        // Get data from storage for individual organization
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData) {
            console.error('Organization data not found:', organization);
            this.showError('Organization data not found');
            return;
        }
        
        const allRepos = orgData.data.allRepositories || [];
        if (index < 0 || index >= allRepos.length) {
            console.error('Invalid repository index:', index);
            this.showError('Invalid repository index');
            return;
        }
        
        const repo = allRepos[index];
        console.log('Retrieved repository from all repos:', repo);
        
        this.showRepositoryDetails(repo, orgData);
    }

    /**
     * Show dependency details from all dependencies index (safe for HTML)
     */
    async showDependencyDetailsFromAllDepsIndex(index, organization) {
        console.log('Showing dependency details from all deps index:', index, 'for org:', organization);
        
        // Handle combined data
        if (organization === 'All Organizations Combined') {
            const combinedData = await storageManager.getCombinedData();
            if (!combinedData) {
                console.error('Combined data not found');
                this.showError('Combined data not found');
                return;
            }
            
            const allDeps = combinedData.data.allDependencies || [];
            if (index < 0 || index >= allDeps.length) {
                console.error('Invalid dependency index:', index);
                this.showError('Invalid dependency index');
                return;
            }
            
            const dependency = allDeps[index];
            console.log('Retrieved dependency from combined data:', dependency);
            
            this.showDependencyDetails(dependency, combinedData);
            return;
        }
        
        // Get data from storage for individual organization
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData) {
            console.error('Organization data not found:', organization);
            this.showError('Organization data not found');
            return;
        }
        
        const allDeps = orgData.data.allDependencies || [];
        if (index < 0 || index >= allDeps.length) {
            console.error('Invalid dependency index:', index);
            this.showError('Invalid dependency index');
            return;
        }
        
        const dependency = allDeps[index];
        console.log('Retrieved dependency from all deps:', dependency);
        
        this.showDependencyDetails(dependency, orgData);
    }

    /**
     * Show dependency details from repository index (safe for HTML)
     */
    async showDependencyDetailsFromRepoIndex(index, organization, repoFullName) {
        console.log('Showing dependency details from repo index:', index, 'for org:', organization, 'repo:', repoFullName);
        
        // Get data from storage
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData) {
            console.error('Organization data not found:', organization);
            this.showError('Organization data not found');
            return;
        }
        
        // Find the repository
        const allRepos = orgData.data.allRepositories || [];
        const repo = allRepos.find(r => `${r.owner}/${r.name}` === repoFullName);
        if (!repo) {
            console.error('Repository not found:', repoFullName);
            this.showError('Repository not found');
            return;
        }
        
        const repoDeps = repo.dependencies.map(depKey => {
            const [name, version] = depKey.split('@');
            return { name, version, key: depKey };
        });
        
        if (index < 0 || index >= repoDeps.length) {
            console.error('Invalid dependency index:', index);
            this.showError('Invalid dependency index');
            return;
        }
        
        const dep = repoDeps[index];
        const dependency = {
            name: dep.name,
            version: dep.version,
            count: 1,
            repositories: [repoFullName]
        };
        
        console.log('Retrieved dependency from repo:', dependency);
        
        this.showDependencyDetails(dependency, orgData);
    }

    /**
     * Show organization overview from storage (safe for HTML)
     */
    async showOrganizationOverviewFromStorage(organization) {
        console.log('Showing organization overview from storage for:', organization);
        
        // Get data from storage
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData) {
            console.error('Organization data not found:', organization);
            this.showError('Organization data not found');
            return;
        }
        
        await this.showOrganizationOverview(orgData);
    }

    /**
     * Show repository details
     */
    showRepositoryDetails(repo, orgData) {
        this.currentView = 'repository';
        
        // Try different container IDs based on the current page
        let container = document.getElementById('view-container');
        if (!container) {
            container = document.getElementById('vulnerability-analysis-page');
        }
        if (!container) {
            container = document.querySelector('.container');
        }
        
        if (container) {
            const html = this.generateRepositoryHTML(repo, orgData);
            this.safeSetHTML(container, html);
            
            // Add event listeners
            this.addRepositoryEventListeners();
            
            console.log('📁 Showing repository details:', repo.name);
        } else {
            console.error('No suitable container found for repository details');
            this.showAlert('Unable to display repository details - no container found', 'warning');
        }
    }

    /**
     * Generate overview HTML
     */
    async generateOverviewHTML(orgData) {
        console.log('🔍 View Manager - Received orgData:', orgData);
        
        // Validate orgData structure
        if (!orgData || !orgData.data) {
            console.error('❌ Invalid orgData structure:', orgData);
            const errorData = {
                organization: 'Error - Invalid Data Structure',
                analyzedDate: new Date().toLocaleString(),
                errorMessage: JSON.stringify(orgData, null, 2)
            };
            const headerHTML = this.renderOverviewHeader(errorData.organization, errorData.analyzedDate);
            return `${headerHTML}
                <div class="alert alert-danger">
                    <h6>❌ Data Structure Error</h6>
                    <p>The organization data is missing or improperly formatted.</p>
                    <pre class="bg-light p-2 rounded">${errorData.errorMessage}</pre>
                </div>`;
        }
        
        const orgName = orgData.organization || orgData.name;
        
        // Render header
        const headerHTML = this.renderOverviewHeader(orgName, new Date(orgData.timestamp).toLocaleString());
        
        // Render dependency overview
        const dependencyHTML = await this.generateDependencyOverviewHTML(orgData);
        
        // Render vulnerability analysis
        const vulnerabilityHTML = await this.generateVulnerabilityAnalysisHTML(orgData);
        
        // Render license section
        const licenseComplianceHTML = orgData.data.licenseAnalysis 
            ? await this.generateLicenseComplianceHTML(orgData) 
            : '';
        
        const licenseSectionHTML = this.renderLicenseSection(!!orgData.data.licenseAnalysis, licenseComplianceHTML, orgName);
        
        return headerHTML + dependencyHTML + vulnerabilityHTML + licenseSectionHTML;
    }

    /**
     * Generate dependency details HTML
     */
    async generateDependencyHTML(dependency, orgData) {
        // Add null check before accessing array
        const allRepos = orgData.data?.allRepositories || [];
        if (allRepos.length === 0) {
            console.warn('No repositories found in orgData.data.allRepositories');
            return '';
        }
        const matchingRepos = allRepos.filter(repo => 
            repo.dependencies && repo.dependencies.some(dep => dep === `${dependency.name}@${dependency.version}`)
        );

        // Get package funding (package-level, not author-level)
        let packageFunding = null;
        if (dependency.category?.ecosystem && window.cacheManager) {
            const packageKey = `${dependency.category.ecosystem}:${dependency.name}`;
            const packageData = await window.cacheManager.getPackage(packageKey);
            packageFunding = packageData?.funding || null;
        }

        // Prepare funding data for template
        let fundingData = null;
        if (packageFunding) {
            const fundingUrl = packageFunding.url || `https://github.com/sponsors/${encodeURIComponent(dependency.name)}`;
            fundingData = {
                packageFunding: true,
                fundingUrl: fundingUrl,
                fundingGitHub: packageFunding.github || isUrlFromHostname(fundingUrl, 'github.com', '/sponsors'),
                fundingOpenCollective: packageFunding.opencollective || isUrlFromHostname(fundingUrl, 'opencollective.com'),
                fundingPatreon: packageFunding.patreon || isUrlFromHostname(fundingUrl, 'patreon.com'),
                fundingTidelift: packageFunding.tidelift || isUrlFromHostname(fundingUrl, 'tidelift.com'),
                fundingGeneric: packageFunding.url && !packageFunding.github && !packageFunding.opencollective && !packageFunding.patreon && !packageFunding.tidelift
            };
        }

        // Prepare repositories for template
        const reposForTemplate = matchingRepos.map(repo => {
            const allRepos = orgData.data.allRepositories;
            const originalIndex = allRepos.findIndex(r => r.owner === repo.owner && r.name === repo.name);
            return {
                owner: repo.owner,
                name: repo.name,
                totalDependencies: repo.totalDependencies,
                index: originalIndex,
                organization: orgData.organization || orgData.name
            };
        });

        // Generate license info HTML (complex logic stays in JS)
        let licenseInfoHTML = '';
        if (orgData.data.licenseAnalysis) {
            const highRiskDep = orgData.data.licenseAnalysis.highRiskDependencies?.find(dep => 
                dep.name === dependency.name && dep.version === dependency.version
            );
            
            if (highRiskDep) {
                const warningsHTML = highRiskDep.warnings && highRiskDep.warnings.length > 0
                    ? `<div class="license-warnings"><strong>Warnings:</strong><ul>${highRiskDep.warnings.map(w => `<li>${w}</li>`).join('')}</ul></div>`
                    : '';
                licenseInfoHTML = `
                    <div class="alert alert-warning">
                        <h6>⚠️ High-Risk License Detected</h6>
                        <div class="license-details">
                            <div class="license-name"><strong>License:</strong> ${highRiskDep.license}</div>
                            <div class="license-category"><strong>Category:</strong> ${highRiskDep.category}</div>
                            ${warningsHTML}
                        </div>
                    </div>
                `;
            } else {
                // Check license families
                const licenseFamilies = orgData.data.licenseAnalysis.licenseFamilies;
                if (licenseFamilies) {
                    const entries = licenseFamilies instanceof Map ? licenseFamilies.entries() : Object.entries(licenseFamilies);
                    for (const [familyName, deps] of entries) {
                        const familyDep = deps.find(dep => 
                            dep.name === dependency.name && dep.version === dependency.version
                        );
                        if (familyDep) {
                            const descHTML = familyDep.licenseInfo?.description
                                ? `<div class="license-description"><strong>Description:</strong> ${familyDep.licenseInfo.description}</div>`
                                : '';
                            licenseInfoHTML = `
                                <div class="alert alert-info">
                                    <h6>📋 License Information</h6>
                                    <div class="license-details">
                                        <div class="license-family"><strong>Family:</strong> ${familyName}</div>
                                        <div class="license-name"><strong>License:</strong> ${familyDep.licenseInfo?.license || 'Unknown'}</div>
                                        <div class="license-category"><strong>Category:</strong> ${familyDep.licenseInfo?.category || 'Unknown'}</div>
                                        <div class="license-risk"><strong>Risk Level:</strong> ${familyDep.licenseInfo?.risk || 'Unknown'}</div>
                                        ${descHTML}
                                    </div>
                                </div>
                            `;
                            break;
                        }
                    }
                }
                
                if (!licenseInfoHTML) {
                    licenseInfoHTML = `
                        <div class="alert alert-secondary">
                            <h6>📋 License Information</h6>
                            <p>No specific license information available for this dependency in the current analysis.</p>
                            <p><em>Note: License analysis is performed during SBOM processing. If this dependency was added after the initial analysis, license information may not be available.</em></p>
                        </div>
                    `;
                }
            }
        }

        // Prepare template data
        const templateData = {
            name: dependency.name || 'Unknown',
            version: dependency.version || 'Unknown',
            count: dependency.count || 0,
            category: dependency.category || null,
            organization: orgData.organization || orgData.name,
            packageFunding: fundingData,
            repositories: reposForTemplate,
            hasLicenseAnalysis: !!orgData.data.licenseAnalysis,
            licenseInfoHTML: licenseInfoHTML
        };

        // Merge funding data into template data if available
        if (fundingData) {
            Object.assign(templateData, fundingData);
        }

        return this.renderDependencyDetails(templateData);
    }

    /**
     * Generate repository details HTML
     */
    generateRepositoryHTML(repo, orgData) {
        // Add null checks before accessing arrays
        const allDeps = orgData.data?.allDependencies || [];
        if (!repo.dependencies || !Array.isArray(repo.dependencies)) {
            console.warn('Repository dependencies not found or not an array:', repo);
            return '';
        }
        const repoDeps = repo.dependencies.map(depKey => {
            const [name, version] = depKey.split('@');
            return { name, version, key: depKey };
        });

        return `
            <div class="view-header">
                <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverviewFromStorage('${orgData.organization || orgData.name}')">
                    ← Back to Overview
                </button>
                <h2>📁 ${repo.owner}/${repo.name}${repo.archived ? ' <span class="badge bg-secondary" title="Archived Repository"><i class="fas fa-archive"></i> Archived</span>' : ''}</h2>
                <p class="text-muted">${repo.totalDependencies} dependencies</p>
            </div>

            <div class="repository-details">
                <div class="detail-section">
                    <h3>📋 Repository Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Repository:</label>
                            <span>${repo.owner}/${repo.name}${repo.archived ? ' <span class="badge bg-secondary" title="Archived Repository"><i class="fas fa-archive"></i> Archived</span>' : ''}</span>
                        </div>
                        <div class="info-item">
                            <label>Total Dependencies:</label>
                            <span>${repo.totalDependencies}</span>
                        </div>
                    </div>
                    <div class="mt-3">
                        <button class="btn btn-primary btn-sm" onclick="viewManager.runRepositoryVulnerabilityQuery('${repo.owner}', '${repo.name}', '${orgData.organization || orgData.name}')">
                            <i class="fas fa-shield-alt"></i> Vulnerability Scan (This Repo)
                        </button>
                        <button class="btn btn-info btn-sm" onclick="viewManager.showVulnerabilityCacheStats()">
                            <i class="fas fa-database"></i> Cache Stats
                        </button>
                        <button class="btn btn-warning btn-sm" onclick="viewManager.clearVulnerabilityCache()">
                            <i class="fas fa-trash"></i> Clear Cache
                        </button>
                    </div>
                </div>

                <div class="detail-section">
                    <h3>📦 Dependencies</h3>
                    <div class="search-box">
                        <input type="text" id="repo-dep-search" placeholder="Search dependencies..." onkeyup="viewManager.filterRepoDependencies()">
                    </div>
                    <div class="dependency-grid" id="repo-dependencies">
                        ${repoDeps.map((dep, index) => `
                            <div class="dependency-card" onclick="viewManager.showDependencyDetailsFromRepoIndex(${index}, '${orgData.organization || orgData.name}', '${repo.owner}/${repo.name}')">
                                <div class="dep-name">${dep.name}</div>
                                <div class="dep-version">${dep.version}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Add overview event listeners
     */
    addOverviewEventListeners() {
        // Search functionality will be added here
    }

    /**
     * Add dependency event listeners
     */
    addDependencyEventListeners() {
        // Future enhancements
    }

    /**
     * Add repository event listeners
     */
    addRepositoryEventListeners() {
        // Search functionality
    }

    /**
     * Filter dependencies by category
     */
    filterDependenciesByCategory(category) {
        const deps = document.querySelectorAll('#top-dependencies .dependency-item');
        
        deps.forEach(dep => {
            if (category === 'all' || dep.classList.contains(category)) {
                dep.style.display = 'block';
            } else {
                dep.style.display = 'none';
            }
        });
        
        // Update button states
        document.querySelectorAll('.filter-buttons .btn').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-primary');
        });
        
        const activeBtn = document.querySelector(`.filter-buttons .btn[onclick*="${category}"]`);
        if (activeBtn) {
            activeBtn.classList.remove('btn-outline-primary');
            activeBtn.classList.add('btn-primary');
        }
    }

    /**
     * Filter dependencies
     */
    filterDependencies() {
        const searchTerm = document.getElementById('dep-search').value.toLowerCase();
        const deps = document.querySelectorAll('#all-dependencies .dependency-card');
        
        deps.forEach(dep => {
            const name = dep.querySelector('.dep-name').textContent.toLowerCase();
            const version = dep.querySelector('.dep-version').textContent.toLowerCase();
            
            if (name.includes(searchTerm) || version.includes(searchTerm)) {
                dep.style.display = 'block';
            } else {
                dep.style.display = 'none';
            }
        });
    }

    /**
     * Filter repository dependencies
     */
    filterRepoDependencies() {
        const searchTerm = document.getElementById('repo-dep-search').value.toLowerCase();
        const deps = document.querySelectorAll('#repo-dependencies .dependency-card');
        
        deps.forEach(dep => {
            const name = dep.querySelector('.dep-name').textContent.toLowerCase();
            const version = dep.querySelector('.dep-version').textContent.toLowerCase();
            
            if (name.includes(searchTerm) || version.includes(searchTerm)) {
                dep.style.display = 'block';
            } else {
                dep.style.display = 'none';
            }
        });
    }

    /**
     * Go back to previous view
     */
    async goBack() {
        if (this.currentView === 'overview') {
            // Go back to main analysis view
            document.getElementById('resultsSection').style.display = 'block';
            document.getElementById('view-container').style.display = 'none';
        } else if (this.currentView === 'dependency' || this.currentView === 'repository') {
            // Go back to organization overview
            await this.showOrganizationOverview(this.currentOrganization);
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        // Try different container IDs based on the current page
        let container = document.getElementById('view-container');
        if (!container) {
            container = document.getElementById('vulnerability-analysis-page');
        }
        if (!container) {
            container = document.querySelector('.container');
        }
        
        if (container) {
            const errorHtml = `
                <div class="view-header">
                    <button class="btn btn-secondary" onclick="viewManager.goBack()">
                        ← Back to Overview
                    </button>
                    <h2>❌ Error</h2>
                </div>
                <div class="alert alert-danger">
                    <h6>❌ Error</h6>
                    <p>${this.escapeHtml(message)}</p>
                </div>
            `;
            this.safeSetHTML(container, errorHtml);
        } else {
            console.error('No suitable container found for error display');
            this.showAlert(`Error: ${message}`, 'danger');
        }
    }

    /**
     * Debug method to show raw data
     */
    showRawData(orgData) {
        // Try different container IDs based on the current page
        let container = document.getElementById('view-container');
        if (!container) {
            container = document.getElementById('vulnerability-analysis-page');
        }
        if (!container) {
            container = document.querySelector('.container');
        }
        
        if (container) {
            const rawDataHtml = `
                <div class="view-header">
                    <button class="btn btn-secondary" onclick="viewManager.goBack()">
                        ← Back to Analysis
                    </button>
                    <h2>🔍 Raw Data Debug</h2>
                </div>
                <div class="alert alert-info">
                    <h6>📋 Raw Organization Data</h6>
                    <pre class="bg-light p-3 rounded" style="max-height: 400px; overflow-y: auto;">${this.escapeHtml(JSON.stringify(orgData, null, 2))}</pre>
                </div>
            `;
            this.safeSetHTML(container, rawDataHtml);
        } else {
            console.error('No suitable container found for raw data display');
            this.showAlert('Unable to display raw data - no container found', 'warning');
        }
    }

    /**
     * Run batch vulnerability query for an organization
     */
    async runBatchVulnerabilityQuery(organization) {
        if (!window.osvService) {
            this.showAlert('OSV Service not available', 'warning');
            return;
        }

        try {
            // Get organization data
            const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
            
            console.log('🔍 Vulnerability Query - Organization:', organization);
            console.log('🔍 Vulnerability Query - Loaded orgData:', orgData);
            
            if (!orgData) {
                this.showAlert(`No data found for organization: ${organization}`, 'warning');
                return;
            }
            
            if (!orgData.data) {
                this.showAlert('Organization data structure is invalid (missing .data)', 'warning');
                console.error('Invalid orgData structure:', orgData);
                return;
            }
            
            if (!orgData.data.allDependencies || orgData.data.allDependencies.length === 0) {
                this.showAlert(`No dependencies found for analysis. Dependencies count: ${orgData.data.allDependencies ? orgData.data.allDependencies.length : 0}`, 'warning');
                console.error('No dependencies in orgData.data:', orgData.data);
                return;
            }
            
            console.log(`✅ Found ${orgData.data.allDependencies.length} dependencies for vulnerability analysis`);

            // Show loading state
            this.showAlert('Running batch vulnerability query...', 'info');
            
            // Convert dependencies to the format expected by OSV service
            const dependencies = orgData.data.allDependencies.map(dep => ({
                name: dep.name,
                version: dep.version
            }));

            // Run vulnerability analysis with incremental saving
            const vulnerabilityAnalysis = await window.osvService.analyzeDependenciesWithIncrementalSaving(
                dependencies,
                organization,
                (progressPercent, message) => {
                    // Update progress during vulnerability analysis
                    console.log(`Vulnerability analysis progress: ${progressPercent}% - ${message}`);
                }
            );
            
            // Update the organization data with new vulnerability analysis
            orgData.data.vulnerabilityAnalysis = vulnerabilityAnalysis;
            orgData.timestamp = new Date().toISOString();
            
            // Save updated data
            await storageManager.saveAnalysisData(organization, orgData.data);
            
            // Refresh the view
            await this.showOrganizationOverview(orgData);
            
            this.showAlert(`Vulnerability analysis complete! Found ${vulnerabilityAnalysis.vulnerablePackages} vulnerable packages.`, 'success');
            
        } catch (error) {
            console.error('Batch vulnerability query failed:', error);
            this.showAlert(`Vulnerability analysis failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Query vulnerability for a specific dependency
     */
    async queryVulnerabilityForDependency(packageName, version, organization) {
        if (!window.osvService) {
            this.showAlert('OSV Service not available', 'warning');
            return;
        }

        try {
            // Show loading state
            this.showAlert(`Querying vulnerabilities for ${packageName}@${version}...`, 'info');
            
            // Query the vulnerability
            const result = await window.osvService.queryVulnerabilities(packageName, version);
            const vulns = result.vulns || [];
            
            // Display results
            let message = `Found ${vulns.length} vulnerabilities for ${packageName}@${version}`;
            let alertType = 'success';
            
            if (vulns.length > 0) {
                const criticalCount = vulns.filter(v => window.osvService.getHighestSeverity(v) === 'CRITICAL').length;
                const highCount = vulns.filter(v => window.osvService.getHighestSeverity(v) === 'HIGH').length;
                
                if (criticalCount > 0) {
                    alertType = 'danger';
                    message += ` (${criticalCount} critical, ${highCount} high)`;
                } else if (highCount > 0) {
                    alertType = 'warning';
                    message += ` (${highCount} high)`;
                } else {
                    alertType = 'info';
                }
            }
            
            this.showAlert(message, alertType);
            
            // Show detailed results in a modal or expandable section
            if (vulns.length > 0) {
                this.showVulnerabilityDetails(packageName, version, vulns);
            }
            
        } catch (error) {
            console.error('Vulnerability query failed:', error);
            this.showAlert(`Vulnerability query failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Show vulnerability details for a specific package
     */
    showVulnerabilityDetails(packageName, version, vulnerabilities) {
        // Ensure vulnerabilities is an array
        if (!Array.isArray(vulnerabilities)) {
            vulnerabilities = [vulnerabilities];
        }

        // Filter out invalid vulnerabilities
        vulnerabilities = vulnerabilities.filter(vuln => vuln && typeof vuln === 'object');

        if (vulnerabilities.length === 0) {
            this.showAlert('No valid vulnerabilities found', 'warning');
            return;
        }
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'vulnerabilityModal';
        
        // Create a more descriptive title
        let modalTitle = `🔒 Vulnerabilities for ${packageName}@${version}`;
        if (vulnerabilities.length === 1) {
            const vuln = vulnerabilities[0];
            const severity = window.osvService ? window.osvService.getHighestSeverity(vuln) : 'UNKNOWN';
            modalTitle = `🔒 ${severity} Vulnerability: ${vuln.id || 'Unknown ID'} - ${packageName}@${version}`;
        } else if (vulnerabilities.length > 1) {
            const severities = [...new Set(vulnerabilities.map(v => 
                window.osvService ? window.osvService.getHighestSeverity(v) : 'UNKNOWN'
            ))];
            if (severities.length === 1) {
                modalTitle = `🔒 ${severities[0]} Vulnerabilities (${vulnerabilities.length}) - ${packageName}@${version}`;
            }
        }
        
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${modalTitle}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="vulnerability-list">
                            ${vulnerabilities.map(vuln => {
                                // Defensive programming: ensure vuln is valid
                                if (!vuln || typeof vuln !== 'object') {
                                    console.warn('⚠️ ViewManager: Invalid vulnerability object:', vuln);
                                    return '';
                                }
                                
                                const severity = window.osvService ? window.osvService.getHighestSeverity(vuln) : 'UNKNOWN';
                                
                                // Safely render markdown in details
                                const detailsText = vuln.details || 'No details available';
                                const safeDetailsHTML = this.renderSafeMarkdown(detailsText);
                                const summaryText = vuln.summary || 'No summary available';
                                const safeSummaryHTML = this.renderSafeMarkdown(summaryText);
                                
                                return `
                                    <div class="alert alert-${this.getSeverityClass(severity)}">
                                        <h6>${vuln.id || 'Unknown'} - ${severity}</h6>
                                        <p><strong>Summary:</strong></p>
                                        <div class="vulnerability-summary">${safeSummaryHTML}</div>
                                        <p class="mt-2"><strong>Details:</strong></p>
                                        <div class="vulnerability-details">${safeDetailsHTML}</div>
                                        <p class="mt-2"><strong>Published:</strong> ${vuln.published ? new Date(vuln.published).toLocaleDateString() : 'Unknown'}</p>
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
        
        // Clean up modal after it's hidden
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }





    /**
     * Show vulnerability cache statistics
     */
    async showVulnerabilityCacheStats() {
        if (!window.osvService) {
            this.showAlert('OSV Service not available', 'warning');
            return;
        }

        const stats = window.osvService.getCacheStats();
        const centralizedStats = window.storageManager ? await window.storageManager.getVulnerabilityStorageStats() : null;
        
        let message = `In-memory cache: ${stats.size} entries. Cached packages: ${stats.entries.slice(0, 5).join(', ')}${stats.entries.length > 5 ? '...' : ''}`;
        
        if (centralizedStats) {
            message += `\nCentralized storage: ${centralizedStats.totalPackages} packages (${centralizedStats.sizeInMB}MB). Sample: ${centralizedStats.packages.slice(0, 3).join(', ')}${centralizedStats.packages.length > 3 ? '...' : ''}`;
        }
        
        this.showAlert(message, 'info');
    }

    /**
     * Clear vulnerability cache
     */
    clearVulnerabilityCache() {
        if (!window.osvService) {
            this.showAlert('OSV Service not available', 'warning');
            return;
        }

        // Clear in-memory cache
        window.osvService.clearCache();
        
        // Clear centralized storage
        if (window.storageManager) {
            window.storageManager.clearVulnerabilityData();
        }
        
        this.showAlert('Vulnerability cache and centralized storage cleared', 'success');
    }

    /**
     * Show centralized vulnerability storage statistics
     */
    showCentralizedVulnerabilityStats() {
        if (!window.storageManager) {
            this.showAlert('Storage Manager not available', 'warning');
            return;
        }

        const stats = window.storageManager.getVulnerabilityStorageStats();
        const keys = window.storageManager.getAllVulnerabilityKeys();
        
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'centralizedVulnModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">🔒 Centralized Vulnerability Storage</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-md-3">
                                <div class="text-center">
                                    <h4 class="text-primary">${stats.totalPackages}</h4>
                                    <small>Total Packages</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="text-center">
                                    <h4 class="text-info">${stats.sizeInMB}MB</h4>
                                    <small>Storage Size</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="text-center">
                                    <h4 class="text-success">${keys.length}</h4>
                                    <small>Unique Keys</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="text-center">
                                    <button class="btn btn-warning btn-sm" onclick="viewManager.cleanupOldVulnerabilityData()">
                                        <i class="fas fa-broom"></i> Cleanup Old
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <h6>Stored Packages (${keys.length}):</h6>
                        <div class="vulnerability-keys-list" style="max-height: 300px; overflow-y: auto;">
                            ${keys.map(key => `
                                <div class="alert alert-light py-2 mb-1">
                                    <small>${key}</small>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-danger" onclick="viewManager.clearCentralizedVulnerabilityData()">
                            <i class="fas fa-trash"></i> Clear All Data
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
        
        // Clean up modal after it's hidden
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }

    /**
     * Clean up old vulnerability data
     */
    cleanupOldVulnerabilityData() {
        if (!window.storageManager) {
            this.showAlert('Storage Manager not available', 'warning');
            return;
        }

        const cleanedCount = window.storageManager.cleanupOldVulnerabilityData();
        this.showAlert(`Cleaned up ${cleanedCount} old vulnerability entries (older than 30 days)`, 'success');
        
        // Refresh the modal if it's open
        const modal = document.getElementById('centralizedVulnModal');
        if (modal) {
            const modalInstance = bootstrap.Modal.getInstance(modal);
            if (modalInstance) {
                modalInstance.hide();
                setTimeout(() => this.showCentralizedVulnerabilityStats(), 100);
            }
        }
    }

    /**
     * Clear centralized vulnerability data
     */
    clearCentralizedVulnerabilityData() {
        if (!window.storageManager) {
            this.showAlert('Storage Manager not available', 'warning');
            return;
        }

        if (confirm('Are you sure you want to clear all centralized vulnerability data? This action cannot be undone.')) {
            window.storageManager.clearVulnerabilityData();
            this.showAlert('All centralized vulnerability data cleared', 'success');
            
            // Close the modal
            const modal = document.getElementById('centralizedVulnModal');
            if (modal) {
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) {
                    modalInstance.hide();
                }
            }
        }
    }

    /**
     * Get Bootstrap alert class for severity
     */
    getSeverityClass(severity) {
        switch (severity) {
            case 'CRITICAL': return 'danger';
            case 'HIGH': return 'warning';
            case 'MEDIUM': return 'info';
            case 'LOW': return 'success';
            default: return 'secondary';
        }
    }

    /**
     * Show alert message
     */
    showAlert(message, type) {
        // Create alert element
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        const alertHtml = `
            ${this.escapeHtml(message)}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        this.safeSetHTML(alertDiv, alertHtml);
        
        // Try different container IDs based on the current page
        let container = document.getElementById('view-container');
        if (!container) {
            container = document.getElementById('vulnerability-analysis-page');
        }
        if (!container) {
            container = document.querySelector('.container');
        }
        if (!container) {
            // Fallback to body if no suitable container found
            container = document.body;
        }
        
        if (container) {
            container.insertBefore(alertDiv, container.firstChild);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.remove();
                }
            }, 5000);
        } else {
            // Last resort: just log to console
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Quick scan a dependency for vulnerabilities
     */
    async quickScanDependency(packageName, version, organization) {
        if (!window.osvService) {
            this.showAlert('OSV Service not available', 'warning');
            return;
        }

        try {
            // Show loading state
            this.showAlert(`Quick scanning for vulnerabilities for ${packageName}@${version}...`, 'info');
            
            // Query the vulnerability
            const result = await window.osvService.queryVulnerabilities(packageName, version);
            const vulns = result.vulns || [];
            
            // Display results
            let message = `Found ${vulns.length} vulnerabilities for ${packageName}@${version}`;
            let alertType = 'success';
            
            if (vulns.length > 0) {
                const criticalCount = vulns.filter(v => window.osvService.getHighestSeverity(v) === 'CRITICAL').length;
                const highCount = vulns.filter(v => window.osvService.getHighestSeverity(v) === 'HIGH').length;
                
                if (criticalCount > 0) {
                    alertType = 'danger';
                    message += ` (${criticalCount} critical, ${highCount} high)`;
                } else if (highCount > 0) {
                    alertType = 'warning';
                    message += ` (${highCount} high)`;
                } else {
                    alertType = 'info';
                }
            }
            
            this.showAlert(message, alertType);
            
            // Show detailed results in a modal or expandable section
            if (vulns.length > 0) {
                this.showVulnerabilityDetails(packageName, version, vulns);
            }
            
        } catch (error) {
            console.error('Quick scan failed:', error);
            this.showAlert(`Quick scan failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Run batch vulnerability query for a repository
     */
    async runRepositoryVulnerabilityQuery(owner, repoName, organization) {
        if (!window.osvService) {
            this.showAlert('OSV Service not available', 'warning');
            return;
        }
        try {
            // Get organization data
            const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
            if (!orgData || !orgData.data.allRepositories) {
                this.showAlert('No repository data found', 'warning');
                return;
            }
            // Find the repository
            const repo = orgData.data.allRepositories.find(r => r.owner === owner && r.name === repoName);
            if (!repo || !repo.dependencies) {
                this.showAlert('No dependencies found for this repository', 'warning');
                return;
            }
            // Show loading state
            this.showAlert(`Running vulnerability scan for ${owner}/${repoName}...`, 'info');
            // Prepare dependencies
            const dependencies = repo.dependencies.map(depKey => {
                const [name, version] = depKey.split('@');
                return { name, version };
            });
            // Run vulnerability analysis (leverages cache)
            const analysis = await window.osvService.analyzeDependencies(dependencies);
            // Show results in a modal
            this.showRepositoryVulnerabilityResults(owner, repoName, analysis);
            this.showAlert(`Vulnerability scan complete! Found ${analysis.vulnerablePackages} vulnerable packages.`, 'success');
        } catch (error) {
            console.error('Repository vulnerability query failed:', error);
            this.showAlert(`Vulnerability scan failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Show repository vulnerability results in a modal
     */
    showRepositoryVulnerabilityResults(owner, repoName, analysis) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'repoVulnModal';
        const stats = window.osvService.getVulnerabilityStats(analysis);
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">🔒 Vulnerability Results for ${owner}/${repoName}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-2"><div class="text-center"><h4 class="text-danger">${stats.criticalCount}</h4><small>Critical</small></div></div>
                            <div class="col-md-2"><div class="text-center"><h4 class="text-warning">${stats.highCount}</h4><small>High</small></div></div>
                            <div class="col-md-2"><div class="text-center"><h4 class="text-info">${stats.mediumCount}</h4><small>Medium</small></div></div>
                            <div class="col-md-2"><div class="text-center"><h4 class="text-success">${stats.lowCount}</h4><small>Low</small></div></div>
                            <div class="col-md-2"><div class="text-center"><h4>${stats.vulnerablePackages}</h4><small>Vulnerable</small></div></div>
                            <div class="col-md-2"><div class="text-center"><h4>${stats.vulnerabilityRate}%</h4><small>Rate</small></div></div>
                        </div>
                        ${analysis.vulnerableDependencies && analysis.vulnerableDependencies.length > 0 ? `
                        <h6 class="mt-3">Vulnerable Dependencies</h6>
                        ${analysis.vulnerableDependencies.map(dep => `
                            <div class="alert alert-warning">
                                <strong>${dep.name}@${dep.version}</strong> - ${dep.vulnerabilities.length} vulnerabilities
                                <div class="mt-2">
                                    ${dep.vulnerabilities.map(vuln => 
                                        `<span class="badge bg-${this.getSeverityClass(vuln.severity)}">${vuln.severity}</span>`
                                    ).join(' ')}
                                </div>
                            </div>
                        `).join('')}
                        ` : '<div class="alert alert-success mt-3">No vulnerable dependencies found.</div>'}
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
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }

    /**
     * Run license compliance check for an organization
     */
    async runLicenseComplianceCheck(organization) {
        try {
            // Get organization data
            const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
            if (!orgData || !orgData.data.allDependencies) {
                this.showAlert('No dependencies found for license analysis', 'warning');
                return;
            }

            // Show loading state
            this.showAlert('Running license compliance check...', 'info');
            
            // Convert dependencies to the format expected by license processor
            const dependencies = orgData.data.allDependencies.map(dep => ({
                name: dep.name,
                version: dep.version,
                originalPackage: dep.originalPackage || {
                    licenseConcluded: 'UNKNOWN',
                    copyrightText: 'NOASSERTION'
                }
            }));

            // Create a license processor directly
            if (typeof LicenseProcessor === 'undefined') {
                this.showAlert('License processor not available. Please ensure license-processor.js is loaded.', 'danger');
                return;
            }
            
            const licenseProcessor = new LicenseProcessor();
            
            // Generate license compliance report
            const licenseAnalysis = licenseProcessor.generateComplianceReport(dependencies);
            
            if (licenseAnalysis) {
                // Update the organization data with new license analysis
                orgData.data.licenseAnalysis = licenseAnalysis;
                orgData.timestamp = new Date().toISOString();
                
                // Save updated data
                await storageManager.saveAnalysisData(organization, orgData.data);
                
                // Refresh the view
                await this.showOrganizationOverview(orgData);
                
                this.showAlert(`License compliance check complete! Found ${licenseAnalysis.summary.licensedDependencies} licensed dependencies and ${licenseAnalysis.summary.unlicensedDependencies} unlicensed dependencies.`, 'success');
            } else {
                this.showAlert('License compliance check failed', 'danger');
            }
            
        } catch (error) {
            console.error('License compliance check failed:', error);
            this.showAlert(`License compliance check failed: ${error.message}`, 'danger');
        }
    }

    /**
     * Get license repositories tooltip text
     */
    getLicenseRepositoriesTooltip(orgData, licenseType) {
        const licenseProcessor = new LicenseProcessor();
        const repositories = orgData.data.allRepositories;
        const dependencies = orgData.data.allDependencies;
        
        let matchingRepos = new Set();
        
        dependencies.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Use unified method to get license info
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
            
            // If no license info found, skip for repository matching
            if (!licenseInfo || !licenseInfo.license || licenseInfo.license === 'NOASSERTION') {
                return;
            }
            
            let shouldInclude = false;
            
            switch (licenseType) {
                case 'permissive':
                    shouldInclude = licenseInfo.category === 'permissive';
                    break;
                case 'copyleft':
                    shouldInclude = licenseInfo.category === 'copyleft';
                    break;
                case 'proprietary':
                    shouldInclude = licenseInfo.category === 'proprietary';
                    break;
                case 'unknown':
                    shouldInclude = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
                case 'total':
                    shouldInclude = licenseInfo.license && licenseInfo.license !== 'NOASSERTION';
                    break;
                case 'unlicensed':
                    shouldInclude = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
            }
            
            if (shouldInclude) {
                repositories.forEach(repo => {
                    if (repo.dependencies.some(depKey => depKey === `${dep.name}@${dep.version}`)) {
                        matchingRepos.add(`${repo.owner}/${repo.name}`);
                    }
                });
            }
        });
        
        const repoList = Array.from(matchingRepos);
        if (repoList.length === 0) {
            return 'No repositories found';
        }
        
        const displayList = repoList.slice(0, 3);
        const remaining = repoList.length - 3;
        
        let tooltip = displayList.join(', ');
        if (remaining > 0) {
            tooltip += ` and ${remaining} more`;
        }
        
        return tooltip;
    }

    /**
     * Get count of repositories for a license type
     */
    getLicenseRepositoriesCount(orgData, licenseType) {
        const repositories = orgData.data.allRepositories;
        const dependencies = orgData.data.allDependencies;
        
        let matchingRepos = new Set();
        
        dependencies.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Use unified method to get license info
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
            if (!licenseInfo) {
                return;
            }
            let shouldInclude = false;
            
            switch (licenseType) {
                case 'permissive':
                    shouldInclude = licenseInfo.category === 'permissive';
                    break;
                case 'copyleft':
                    shouldInclude = licenseInfo.category === 'copyleft';
                    break;
                case 'proprietary':
                    shouldInclude = licenseInfo.category === 'proprietary';
                    break;
                case 'unknown':
                    shouldInclude = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
                case 'total':
                    shouldInclude = licenseInfo.license && licenseInfo.license !== 'NOASSERTION';
                    break;
                case 'unlicensed':
                    shouldInclude = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
            }
            
            if (shouldInclude) {
                repositories.forEach(repo => {
                    if (repo.dependencies.some(depKey => depKey === `${dep.name}@${dep.version}`)) {
                        matchingRepos.add(`${repo.owner}/${repo.name}`);
                    }
                });
            }
        });
        
        return matchingRepos.size;
    }

    /**
     * Get list of repositories for a license type
     */
    getLicenseRepositoriesList(orgData, licenseType) {
        const repositories = orgData.data.allRepositories;
        const dependencies = orgData.data.allDependencies;
        
        let matchingRepos = new Set();
        
        dependencies.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Use unified method to get license info
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
            if (!licenseInfo) {
                return;
            }
            let shouldInclude = false;
            
            switch (licenseType) {
                case 'permissive':
                    shouldInclude = licenseInfo.category === 'permissive';
                    break;
                case 'copyleft':
                    shouldInclude = licenseInfo.category === 'copyleft';
                    break;
                case 'proprietary':
                    shouldInclude = licenseInfo.category === 'proprietary';
                    break;
                case 'unknown':
                    shouldInclude = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
                case 'total':
                    shouldInclude = licenseInfo.license && licenseInfo.license !== 'NOASSERTION';
                    break;
                case 'unlicensed':
                    shouldInclude = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
            }
            
            if (shouldInclude) {
                repositories.forEach(repo => {
                    if (repo.dependencies.some(depKey => depKey === `${dep.name}@${dep.version}`)) {
                        matchingRepos.add(`${repo.owner}/${repo.name}`);
                    }
                });
            }
        });
        
        return Array.from(matchingRepos).sort();
    }

    /**
     * Show license repositories for a specific license type
     */
    async showLicenseRepositories(organization, licenseType) {
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData || !orgData.data.licenseAnalysis) {
            this.showAlert('No license analysis data available', 'warning');
            return;
        }

        const licenseProcessor = new LicenseProcessor();
        const dependencies = orgData.data.allDependencies;
        const licenseRepos = new Map(); // Map of repo -> dependencies with this license

        dependencies.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Use unified method to get license info
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
            if (!licenseInfo) {
                return;
            }
            let matches = false;

            switch (licenseType) {
                case 'permissive':
                    matches = licenseInfo.category === 'permissive';
                    break;
                case 'copyleft':
                    matches = licenseInfo.category === 'copyleft';
                    break;
                case 'proprietary':
                    matches = licenseInfo.category === 'proprietary';
                    break;
                case 'unknown':
                    matches = licenseInfo.category === 'unknown' || !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
                case 'total':
                    matches = licenseInfo.license && licenseInfo.license !== 'NOASSERTION';
                    break;
                case 'unlicensed':
                    matches = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
            }

            if (matches) {
                // Find repositories that use this dependency
                orgData.data.allRepositories.forEach(repo => {
                    if (repo.dependencies.some(depKey => depKey === `${dep.name}@${dep.version}`)) {
                        const repoKey = `${repo.owner}/${repo.name}`;
                        if (!licenseRepos.has(repoKey)) {
                            licenseRepos.set(repoKey, []);
                        }
                        licenseRepos.get(repoKey).push({
                            name: dep.name,
                            version: dep.version,
                            license: licenseInfo.license || 'Unknown',
                            category: licenseInfo.category
                        });
                    }
                });
            }
        });

        // Generate HTML for the license repositories view
        const licenseTypeNames = {
            'permissive': 'Permissive Licenses',
            'copyleft': 'Copyleft Licenses',
            'proprietary': 'Proprietary Licenses',
            'unknown': 'Unknown Licenses',
            'total': 'All Licensed Dependencies',
            'unlicensed': 'Unlicensed Dependencies'
        };

        const licenseTypeIcons = {
            'permissive': '✅',
            'copyleft': '⚠️',
            'proprietary': '🔒',
            'unknown': '❓',
            'total': '📊',
            'unlicensed': '🚨'
        };

        let html = `
            <div class="view-header">
                <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverviewFromStorage('${organization}')">
                    ← Back to Overview
                </button>
                <h2>${licenseTypeIcons[licenseType]} ${licenseTypeNames[licenseType]}</h2>
                <p class="text-muted">Found in ${licenseRepos.size} repositories</p>
            </div>

            <div class="license-repositories">
                <div class="license-repos-list">
        `;

        if (licenseRepos.size === 0) {
            html += `
                <div class="alert alert-info">
                    <h6>📋 No Repositories Found</h6>
                    <p>No repositories were found with ${licenseType} licenses in this organization.</p>
                </div>
            `;
        } else {
            // Sort repositories by number of dependencies
            const sortedRepos = Array.from(licenseRepos.entries())
                .sort((a, b) => b[1].length - a[1].length);

            sortedRepos.forEach(([repoKey, deps]) => {
                const [owner, name] = repoKey.split('/');
                const repo = orgData.data.allRepositories.find(r => r.owner === owner && r.name === name);
                
                html += `
                    <div class="license-repo-item">
                        <div class="repo-header">
                            <h4>${repoKey}</h4>
                            <span class="badge bg-primary">${deps.length} ${licenseType} dependencies</span>
                        </div>
                        <div class="repo-dependencies">
                            ${deps.slice(0, 5).map(dep => `
                                <div class="license-dep-item">
                                    <span class="dep-name">${dep.name}@${dep.version}</span>
                                    <span class="badge badge-license">${dep.license}</span>
                                    <span class="badge badge-${dep.category}">${dep.category}</span>
                                </div>
                            `).join('')}
                            ${deps.length > 5 ? `
                                <div class="license-dep-more">
                                    <em>... and ${deps.length - 5} more dependencies</em>
                                </div>
                            ` : ''}
                        </div>
                        <div class="repo-actions">
                            <button class="btn btn-outline-primary btn-sm" onclick="viewManager.showRepositoryDetailsFromAllReposIndex(${orgData.data.allRepositories.findIndex(r => r.owner === owner && r.name === name)}, '${organization}')">
                                <i class="fas fa-eye me-1"></i>View Repository
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        `;

        // Show the view in the license section
        const licenseSection = document.getElementById('license-section');
        if (licenseSection) {
            this.safeSetHTML(licenseSection, html);
        } else {
            // Fallback to full container if section doesn't exist
            const viewContainer = document.getElementById('view-container');
            if (viewContainer) {
                this.safeSetHTML(viewContainer, html);
                viewContainer.style.display = 'block';
            }
        }
    }

    /**
     * Show detailed view for license conflicts
     */
    async showLicenseConflictDetails(organization, conflictIndex) {
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData || !orgData.data.licenseAnalysis || !orgData.data.licenseAnalysis.conflicts) {
            this.showAlert('No license conflict data available', 'warning');
            return;
        }

        const conflict = orgData.data.licenseAnalysis.conflicts[conflictIndex];
        if (!conflict) {
            this.showAlert('Conflict not found', 'warning');
            return;
        }

        // Find dependencies involved in this conflict
        const licenseProcessor = new LicenseProcessor();
        const dependencies = orgData.data.allDependencies;
        const conflictDeps = [];
        const affectedRepos = new Map();

        dependencies.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Use unified method to get license info
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
            if (!licenseInfo) {
                return;
            }
            if (conflict.licenses.includes(licenseInfo.license)) {
                conflictDeps.push({
                    name: dep.name,
                    version: dep.version,
                    license: licenseInfo.license,
                    category: licenseInfo.category
                });

                // Find repositories that use this dependency
                orgData.data.allRepositories.forEach(repo => {
                    if (repo.dependencies.some(depKey => depKey === `${dep.name}@${dep.version}`)) {
                        const repoKey = `${repo.owner}/${repo.name}`;
                        if (!affectedRepos.has(repoKey)) {
                            affectedRepos.set(repoKey, []);
                        }
                        affectedRepos.get(repoKey).push({
                            name: dep.name,
                            version: dep.version,
                            license: licenseInfo.license
                        });
                    }
                });
            }
        });

        let html = `
            <div class="view-header">
                <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverviewFromStorage('${organization}')">
                    ← Back to Overview
                </button>
                <h2>🚨 License Conflict Details</h2>
                <p class="text-muted">${conflict.type}: ${conflict.description}</p>
            </div>

            <div class="conflict-details">
                <div class="conflict-summary">
                    <h4>📋 Conflict Summary</h4>
                    <div class="alert alert-danger">
                        <strong>Type:</strong> ${conflict.type}<br>
                        <strong>Description:</strong> ${conflict.description}<br>
                        <strong>Incompatible Licenses:</strong> 
                        ${conflict.licenses.map(license => `<span class="badge badge-license">${license}</span>`).join(' ')}
                    </div>
                </div>

                <div class="affected-dependencies">
                    <h4>📦 Affected Dependencies (${conflictDeps.length})</h4>
                    <div class="dependency-list">
                        ${conflictDeps.map(dep => `
                            <div class="dependency-item">
                                <div class="dep-info">
                                    <div class="dep-name">${dep.name}@${dep.version}</div>
                                    <div class="dep-license">${dep.license}</div>
                                    <div class="dep-category">${dep.category}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="affected-repositories">
                    <h4>📁 Affected Repositories (${affectedRepos.size})</h4>
                    <div class="repository-list">
                        ${Array.from(affectedRepos.entries()).map(([repoKey, deps]) => `
                            <div class="repository-item">
                                <div class="repo-header">
                                    <h5>${repoKey}</h5>
                                    <span class="badge bg-danger">${deps.length} conflicting deps</span>
                                </div>
                                <div class="repo-dependencies">
                                    ${deps.map(dep => `
                                        <div class="repo-dep-item">
                                            <span class="dep-name">${dep.name}@${dep.version}</span>
                                            <span class="badge badge-license">${dep.license}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        // Show in license section
        const licenseSection = document.getElementById('license-section');
        if (licenseSection) {
            this.safeSetHTML(licenseSection, html);
        }
    }

    /**
     * Show detailed view for high-risk licenses
     */
    async showHighRiskLicenseDetails(organization, packageName, version) {
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData || !orgData.data.licenseAnalysis) {
            this.showAlert('No license analysis data available', 'warning');
            return;
        }

        // Find the specific high-risk dependency
        const highRiskDep = orgData.data.licenseAnalysis.highRiskDependencies?.find(dep => 
            dep.name === packageName && dep.version === version
        );

        if (!highRiskDep) {
            this.showAlert('High-risk dependency not found', 'warning');
            return;
        }

        // Find repositories that use this dependency
        const affectedRepos = [];
        orgData.data.allRepositories.forEach(repo => {
            if (repo.dependencies.some(depKey => depKey === `${packageName}@${version}`)) {
                affectedRepos.push({
                    owner: repo.owner,
                    name: repo.name,
                    totalDependencies: repo.totalDependencies
                });
            }
        });

        let html = `
            <div class="view-header">
                <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverviewFromStorage('${organization}')">
                    ← Back to Overview
                </button>
                <h2>⚠️ High-Risk License Details</h2>
                <p class="text-muted">${packageName}@${version}</p>
            </div>

            <div class="high-risk-details">
                <div class="dependency-summary">
                    <h4>📦 Dependency Information</h4>
                    <div class="alert alert-warning">
                        <strong>Package:</strong> ${packageName}@${version}<br>
                        <strong>License:</strong> ${highRiskDep.license}<br>
                        <strong>Category:</strong> ${highRiskDep.category}<br>
                        ${highRiskDep.warnings && highRiskDep.warnings.length > 0 ? `
                        <strong>Warnings:</strong><br>
                        ${highRiskDep.warnings.map(warning => `• ${warning}`).join('<br>')}
                        ` : ''}
                    </div>
                </div>

                <div class="affected-repositories">
                    <h4>📁 Affected Repositories (${affectedRepos.length})</h4>
                    <div class="repository-list">
                        ${affectedRepos.map(repo => {
                            const archivedBadge = repo.archived ? ' <span class="badge bg-secondary" title="Archived Repository"><i class="fas fa-archive"></i> Archived</span>' : '';
                            const archivedClass = repo.archived ? ' archived-repo' : '';
                            return `
                            <div class="repository-item${archivedClass}">
                                <div class="repo-header">
                                    <h5>${repo.owner}/${repo.name}${archivedBadge}</h5>
                                    <span class="badge bg-primary">${repo.totalDependencies} total deps</span>
                                </div>
                                <div class="repo-actions">
                                    <button class="btn btn-outline-primary btn-sm" onclick="viewManager.showRepositoryDetailsFromAllReposIndex(${orgData.data.allRepositories.findIndex(r => r.owner === repo.owner && r.name === repo.name)}, '${organization}')">
                                        <i class="fas fa-eye me-1"></i>View Repository
                                    </button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <div class="recommendations">
                    <h4>💡 Recommendations</h4>
                    <div class="recommendation-list">
                        <div class="recommendation-item warning">
                            <div class="rec-priority">High Priority</div>
                            <div class="rec-message">Consider replacing ${packageName}@${version} with an alternative that has a more permissive license.</div>
                        </div>
                        <div class="recommendation-item info">
                            <div class="rec-priority">Medium Priority</div>
                            <div class="rec-message">Review the license terms and ensure compliance with your project's requirements.</div>
                        </div>
                        <div class="recommendation-item info">
                            <div class="rec-priority">Low Priority</div>
                            <div class="rec-message">Document the license usage and maintain records for compliance purposes.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Show in license section
        const licenseSection = document.getElementById('license-section');
        if (licenseSection) {
            this.safeSetHTML(licenseSection, html);
        }
    }

    /**
     * Show detailed view for recommendations
     */
    async showRecommendationDetails(organization, recommendationIndex) {
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData || !orgData.data.licenseAnalysis || !orgData.data.licenseAnalysis.recommendations) {
            this.showAlert('No recommendation data available', 'warning');
            return;
        }

        const recommendation = orgData.data.licenseAnalysis.recommendations[recommendationIndex];
        if (!recommendation) {
            this.showAlert('Recommendation not found', 'warning');
            return;
        }

        // Find dependencies related to this recommendation
        const dependencies = orgData.data.allDependencies;
        const relatedDeps = [];
        const affectedRepos = new Map();

        // Determine which dependencies are related based on recommendation type
        dependencies.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Use unified method to get license info
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
            if (!licenseInfo) {
                return;
            }
            let isRelated = false;

            switch (recommendation.type) {
                case 'warning':
                    // For warnings about unlicensed dependencies
                    if (recommendation.message.includes('unlicensed') && (!licenseInfo.license || licenseInfo.license === 'NOASSERTION')) {
                        isRelated = true;
                    }
                    // For warnings about high-risk licenses
                    if (recommendation.message.includes('high-risk') && licenseInfo.risk === 'high') {
                        isRelated = true;
                    }
                    break;
                case 'error':
                    // For license conflicts
                    if (recommendation.message.includes('conflicts')) {
                        // Check if this dependency is involved in any conflicts
                        const conflicts = orgData.data.licenseAnalysis.conflicts || [];
                        conflicts.forEach(conflict => {
                            if (conflict.licenses.includes(licenseInfo.license)) {
                                isRelated = true;
                            }
                        });
                    }
                    break;
                case 'info':
                    // For general recommendations
                    isRelated = true;
                    break;
            }

            if (isRelated) {
                relatedDeps.push({
                    name: dep.name,
                    version: dep.version,
                    license: licenseInfo.license || 'Unknown',
                    category: licenseInfo.category,
                    risk: licenseInfo.risk
                });

                // Find repositories that use this dependency
                orgData.data.allRepositories.forEach(repo => {
                    if (repo.dependencies.some(depKey => depKey === `${dep.name}@${dep.version}`)) {
                        const repoKey = `${repo.owner}/${repo.name}`;
                        if (!affectedRepos.has(repoKey)) {
                            affectedRepos.set(repoKey, []);
                        }
                        affectedRepos.get(repoKey).push({
                            name: dep.name,
                            version: dep.version,
                            license: licenseInfo.license || 'Unknown'
                        });
                    }
                });
            }
        });

        let html = `
            <div class="view-header">
                <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverviewFromStorage('${organization}')">
                    ← Back to Overview
                </button>
                <h2>💡 Recommendation Details</h2>
                <p class="text-muted">${recommendation.priority} Priority</p>
            </div>

            <div class="recommendation-details">
                <div class="recommendation-summary">
                    <h4>📋 Recommendation</h4>
                    <div class="alert alert-${recommendation.type === 'error' ? 'danger' : recommendation.type === 'warning' ? 'warning' : 'info'}">
                        <strong>Type:</strong> ${recommendation.type}<br>
                        <strong>Priority:</strong> ${recommendation.priority}<br>
                        <strong>Message:</strong> ${recommendation.message}
                    </div>
                </div>

                <div class="related-dependencies">
                    <h4>📦 Related Dependencies (${relatedDeps.length})</h4>
                    <div class="dependency-list">
                        ${relatedDeps.map(dep => `
                            <div class="dependency-item">
                                <div class="dep-info">
                                    <div class="dep-name">${dep.name}@${dep.version}</div>
                                    <div class="dep-license">${dep.license}</div>
                                    <div class="dep-category">${dep.category}</div>
                                    <div class="dep-risk">Risk: ${dep.risk}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="affected-repositories">
                    <h4>📁 Affected Repositories (${affectedRepos.size})</h4>
                    <div class="repository-list">
                        ${Array.from(affectedRepos.entries()).map(([repoKey, deps]) => `
                            <div class="repository-item">
                                <div class="repo-header">
                                    <h5>${repoKey}</h5>
                                    <span class="badge bg-info">${deps.length} related deps</span>
                                </div>
                                <div class="repo-dependencies">
                                    ${deps.map(dep => `
                                        <div class="repo-dep-item">
                                            <span class="dep-name">${dep.name}@${dep.version}</span>
                                            <span class="badge badge-license">${dep.license}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        // Show in license section
        const licenseSection = document.getElementById('license-section');
        if (licenseSection) {
            this.safeSetHTML(licenseSection, html);
        }
    }

    /**
     * Toggle license repositories panel (slide-out)
     */
    async toggleLicenseRepositoriesPanel(organization, licenseType) {
        try {
            console.log('[License Panel] Toggle called', { organization, licenseType });
            
            const panel = document.getElementById('license-repositories-panel');
            const title = document.getElementById('license-panel-title');
            const content = document.getElementById('license-repositories-content');
            
            // Debug: Check if panel elements exist
            if (!panel) {
                console.error('[License Panel] Panel element not found: license-repositories-panel');
                console.log('[License Panel] Available elements:', {
                    hasPanel: !!panel,
                    hasTitle: !!title,
                    hasContent: !!content
                });
                return;
            }
            
            if (!title) {
                console.error('[License Panel] Title element not found: license-panel-title');
                return;
            }
            
            if (!content) {
                console.error('[License Panel] Content element not found: license-repositories-content');
                return;
            }
            
            const isPanelHidden = panel.style.display === 'none' || 
                                   panel.style.display === '' || 
                                   !panel.classList.contains('panel-open');
            
            if (isPanelHidden) {
                // Show panel
                console.log('[License Panel] Showing panel for:', { organization, licenseType });
                
                // Check if storageManager is available
                if (!window.storageManager) {
                    console.error('[License Panel] storageManager not available');
                    return;
                }
                
                // Check if this is combined data (empty/null means aggregated)
                const isCombinedData = !organization || organization === '' || 
                                      organization === 'All Entries Combined' ||
                                      organization === 'All Analyses';
                
                console.log('[License Panel] Data type:', { 
                    organization, 
                    isCombinedData 
                });
                
                let orgData;
                try {
                    if (isCombinedData) {
                        console.log('[License Panel] Loading combined data');
                        orgData = await storageManager.getCombinedData();
                    } else {
                        console.log('[License Panel] Loading organization data:', organization);
                        orgData = await storageManager.loadAnalysisDataForOrganization(organization);
                    }
                    console.log('[License Panel] Loaded org data:', {
                        found: !!orgData,
                        hasData: !!(orgData && orgData.data),
                        hasLicenseAnalysis: !!(orgData && orgData.data && orgData.data.licenseAnalysis),
                        orgName: orgData?.name || orgData?.organization
                    });
                } catch (error) {
                    console.error('[License Panel] Error loading organization data:', error);
                    console.log('[License Panel] Error details:', {
                        organization,
                        isCombinedData,
                        errorMessage: error.message,
                        errorStack: error.stack
                    });
                    return;
                }
                
                if (!orgData) {
                    console.error('[License Panel] Organization data not found:', organization);
                    try {
                        const storageInfo = await storageManager.getStorageInfo();
                        console.log('[License Panel] Available organizations:', {
                            organizations: storageInfo.organizations.map(o => o.name),
                            repositories: storageInfo.repositories.map(r => r.name)
                        });
                    } catch (err) {
                        console.error('[License Panel] Error getting storage info:', err);
                    }
                    return;
                }
                
                if (!orgData.data) {
                    console.error('[License Panel] Organization data missing .data property:', organization);
                    console.log('[License Panel] Org data structure:', Object.keys(orgData));
                    return;
                }
                
                // Set title based on license type
                const titles = {
                    'permissive': '✅ Permissive License Repositories',
                    'copyleft': '⚠️ Copyleft License Repositories',
                    'proprietary': '🔒 Proprietary License Repositories',
                    'unknown': '❓ Unknown License Repositories',
                    'total': '📊 All Licensed Dependencies',
                    'unlicensed': '🚨 Unlicensed Dependencies'
                };
                
                title.textContent = titles[licenseType] || 'License Repositories';
                console.log('[License Panel] Set title:', title.textContent);
                
                // Load content
                let repositories, dependencies;
                try {
                    repositories = this.getLicenseRepositoriesList(orgData, licenseType);
                    dependencies = this.getLicenseDependenciesList(orgData, licenseType);
                    console.log('[License Panel] Retrieved data:', {
                        repositoriesCount: repositories.length,
                        dependenciesCount: dependencies.length,
                        licenseType
                    });
                } catch (error) {
                    console.error('[License Panel] Error getting license lists:', error);
                    console.log('[License Panel] Error details:', {
                        errorMessage: error.message,
                        errorStack: error.stack,
                        licenseType,
                        hasAllRepositories: !!(orgData.data.allRepositories),
                        hasAllDependencies: !!(orgData.data.allDependencies)
                    });
                    return;
                }
                
                const contentHtml = `
                    <div class="license-panel-stats">
                        <div class="stat-item">
                            <span class="stat-value">${repositories.length}</span>
                            <span class="stat-label">Repositories</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${dependencies.length}</span>
                            <span class="stat-label">Dependencies</span>
                        </div>
                    </div>
                    
                    <div class="license-panel-repositories">
                        <h5>📁 Repositories</h5>
                        <div class="repository-list">
                            ${repositories.map(repo => {
                                const [owner, name] = repo.split('/');
                                const allRepos = orgData.data?.allRepositories || [];
                                const repoIndex = allRepos.findIndex(r => r.owner === owner && r.name === name);
                                const repoData = repoIndex >= 0 ? allRepos[repoIndex] : null;
                                const isArchived = repoData && repoData.archived;
                                const archivedBadge = isArchived ? ' <span class="badge bg-secondary ms-2" title="Archived Repository"><i class="fas fa-archive"></i> Archived</span>' : '';
                                const archivedClass = isArchived ? ' archived-repo' : '';
                                const escapedOrg = escapeJsString(escapeHtml(organization));
                                const escapedRepo = this.escapeHtml(repo);
                                return `
                                    <div class="repository-item${archivedClass}" onclick="viewManager.showRepositoryDetailsFromAllReposIndex(${repoIndex}, '${escapedOrg}')" style="cursor: pointer;">
                                        <div class="repo-name">${escapedRepo}${archivedBadge}</div>
                                        <div class="repo-deps">${repoData ? (repoData.totalDependencies || 0) : 0} total deps</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    
                    <div class="license-panel-dependencies">
                        <h5>📦 Dependencies</h5>
                        <div class="dependency-list">
                            ${dependencies.map(dep => `
                                <div class="dependency-item">
                                    <div class="dep-name">${this.escapeHtml(dep.name)}@${this.escapeHtml(dep.version)}</div>
                                    <div class="dep-license">${this.escapeHtml(dep.license)}</div>
                                    <div class="dep-category">${this.escapeHtml(dep.category)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                
                try {
                    this.safeSetHTML(content, contentHtml);
                    console.log('[License Panel] Content HTML set successfully');
                } catch (error) {
                    console.error('[License Panel] Error setting content HTML:', error);
                    return;
                }
                
                panel.style.display = 'block';
                setTimeout(() => {
                    panel.classList.add('panel-open');
                    console.log('[License Panel] Panel opened successfully');
                }, 10);
            } else {
                // Hide panel
                console.log('[License Panel] Hiding panel');
                this.closeLicenseRepositoriesPanel();
            }
        } catch (error) {
            console.error('[License Panel] Unexpected error:', error);
            console.log('[License Panel] Full error details:', {
                errorMessage: error.message,
                errorStack: error.stack,
                organization,
                licenseType
            });
        }
    }

    /**
     * Close license repositories panel
     */
    closeLicenseRepositoriesPanel() {
        const panel = document.getElementById('license-repositories-panel');
        panel.classList.remove('panel-open');
        setTimeout(() => {
            panel.style.display = 'none';
        }, 300);
    }

    /**
     * Get list of dependencies for a license type
     */
    /**
     * Unified method to extract license information from a dependency
     * Checks all possible sources: licenseFull, license, GitHub Actions metadata, originalPackage
     * Returns: { licenseInfo: LicenseInfo object, source: string }
     */
    getDependencyLicenseInfo(dep, orgData = null) {
        const licenseProcessor = new LicenseProcessor();
        let licenseInfo = null;
        let source = null;
        
        // 1. Check dep.licenseFull (most complete, from deps.dev API)
        if (dep.licenseFull && 
            dep.licenseFull !== 'Unknown' && 
            dep.licenseFull !== 'NOASSERTION' && 
            String(dep.licenseFull).trim() !== '') {
            licenseInfo = licenseProcessor.parseLicense({
                licenseConcluded: dep.licenseFull,
                licenseDeclared: dep.licenseFull
            });
            source = 'licenseFull';
        }
        // 2. Check dep.license (short form, from deps.dev API)
        else if (dep.license && 
                 dep.license !== 'Unknown' && 
                 dep.license !== 'NOASSERTION' && 
                 String(dep.license).trim() !== '') {
            licenseInfo = licenseProcessor.parseLicense({
                licenseConcluded: dep.license,
                licenseDeclared: dep.license
            });
            source = 'license';
        }
        // 2b. Check dep.raw.licenseFull (stored license from previous fetches)
        else if (dep.raw && dep.raw.licenseFull && 
                 dep.raw.licenseFull !== 'Unknown' && 
                 dep.raw.licenseFull !== 'NOASSERTION' && 
                 String(dep.raw.licenseFull).trim() !== '') {
            licenseInfo = licenseProcessor.parseLicense({
                licenseConcluded: dep.raw.licenseFull,
                licenseDeclared: dep.raw.licenseFull
            });
            source = 'raw.licenseFull';
        }
        // 2c. Check dep.raw.license (stored license short form)
        else if (dep.raw && dep.raw.license && 
                 dep.raw.license !== 'Unknown' && 
                 dep.raw.license !== 'NOASSERTION' && 
                 String(dep.raw.license).trim() !== '') {
            licenseInfo = licenseProcessor.parseLicense({
                licenseConcluded: dep.raw.license,
                licenseDeclared: dep.raw.license
            });
            source = 'raw.license';
        }
        // 3. Check GitHub Actions analysis metadata (for GitHub Actions dependencies)
        else if (dep.category?.ecosystem === 'GitHub Actions' || dep.ecosystem === 'GitHub Actions') {
            // Check dep._gaMetadata first (if set during processing)
            if (dep._gaMetadata && dep._gaMetadata.license) {
                licenseInfo = licenseProcessor.parseLicense({
                    licenseConcluded: dep._gaMetadata.license,
                    licenseDeclared: dep._gaMetadata.license
                });
                source = 'gaMetadata';
            } else if (orgData) {
                // Fallback: search githubActionsAnalysis
                const enrichedLicense = this.getEnrichedGitHubActionLicense(dep, orgData);
                if (enrichedLicense) {
                    licenseInfo = licenseProcessor.parseLicense({
                        licenseConcluded: enrichedLicense,
                        licenseDeclared: enrichedLicense
                    });
                    source = 'githubActionsAnalysis';
                }
            }
        }
        // 4. Parse from originalPackage (from SBOM) - always check this as fallback
        if (!licenseInfo && dep.originalPackage) {
            licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
            if (licenseInfo && licenseInfo.license && licenseInfo.license !== 'NOASSERTION') {
                source = 'originalPackage';
            }
        }
        
        // 5. Final fallback: Use repository license if available
        // Many SBOMs don't include license info for individual packages,
        // so we infer it from the repository license as a last resort
        if (!licenseInfo && orgData && dep.repositories && dep.repositories.length > 0) {
            // Get license from first repository (most dependencies come from one repo)
            const repoName = dep.repositories[0];
            const allRepos = orgData.data?.allRepositories || [];
            const repo = allRepos.find(r => `${r.owner}/${r.name}` === repoName);
            
            if (repo && (repo.repositoryLicense || repo.license)) {
                const repoLicense = repo.repositoryLicense || repo.license;
                if (repoLicense && repoLicense !== 'NOASSERTION') {
                    licenseInfo = licenseProcessor.parseLicense({
                        licenseConcluded: repoLicense,
                        licenseDeclared: repoLicense
                    });
                    if (licenseInfo && licenseInfo.license && licenseInfo.license !== 'NOASSERTION') {
                        source = 'repositoryLicense';
                    }
                }
            }
        }
        
        return { licenseInfo, source };
    }

    /**
     * Get enriched GitHub Actions license from githubActionsAnalysis
     */
    getEnrichedGitHubActionLicense(dep, orgData) {
        if (!orgData?.data?.githubActionsAnalysis || !dep.name) {
            return null;
        }
        
        try {
            // Build full name with version if not already present
            let fullName = dep.name;
            if (dep.version && !fullName.includes('@')) {
                fullName = `${dep.name}@${dep.version}`;
            }
            
            // Parse GitHub Action name: owner/repo@ref or owner/repo/path@ref
            let match = fullName.match(/^([^/@]+)\/([^/@]+)(?:\/(.+))?@(.+)$/);
            if (!match) {
                // Try without @ref - just owner/repo or owner/repo/path
                match = fullName.match(/^([^/@]+)\/([^/@]+)(?:\/(.+))?$/);
                if (!match) {
                    return null;
                }
            }
            
            const [, owner, repo, path] = match;
            const normalizedPath = path || '';
            
            // Search through repositories - match on owner/repo/path only (ignore ref)
            const repositories = orgData.data.githubActionsAnalysis.repositories || [];
            
            for (const repoData of repositories) {
                // Check direct actions in this repository
                if (repoData.actions && Array.isArray(repoData.actions)) {
                    for (const action of repoData.actions) {
                        // Match on owner/repo/path (ignore ref)
                        const actionPath = action.path || '';
                        if (action.owner === owner && 
                            action.repo === repo && 
                            actionPath === normalizedPath && 
                            action.license) {
                            return action.license;
                        }
                        
                        // Recursively check nested actions
                        if (action.nested && Array.isArray(action.nested)) {
                            const checkNested = (nestedAction) => {
                                const nestedPath = nestedAction.path || '';
                                if (nestedAction.owner === owner && 
                                    nestedAction.repo === repo && 
                                    nestedPath === normalizedPath && 
                                    nestedAction.license) {
                                    return nestedAction.license;
                                }
                                
                                // Recursively check deeper nested actions
                                if (nestedAction.nested && Array.isArray(nestedAction.nested)) {
                                    for (const deeperNested of nestedAction.nested) {
                                        const result = checkNested(deeperNested);
                                        if (result) return result;
                                    }
                                }
                                
                                return null;
                            };
                            
                            for (const nestedAction of action.nested) {
                                const result = checkNested(nestedAction);
                                if (result) return result;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Error getting enriched GitHub Action license:', error);
        }
        
        return null;
    }

    getLicenseDependenciesList(orgData, licenseType) {
        const licenseProcessor = new LicenseProcessor();
        const dependencies = orgData.data.allDependencies;
        const matchingDeps = [];
        
        dependencies.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Use unified method to get license info
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
            
            // If no license info found, treat as unlicensed/unknown
            if (!licenseInfo || !licenseInfo.license || licenseInfo.license === 'NOASSERTION') {
                if (licenseType === 'unlicensed' || licenseType === 'unknown') {
                    matchingDeps.push({
                        name: dep.name,
                        version: dep.version,
                        license: 'Unknown',
                        category: 'unknown'
                    });
                }
                return;
            }
            
            let shouldInclude = false;
            
            switch (licenseType) {
                case 'permissive':
                    shouldInclude = licenseInfo.category === 'permissive';
                    break;
                case 'copyleft':
                    shouldInclude = licenseInfo.category === 'copyleft';
                    break;
                case 'proprietary':
                    shouldInclude = licenseInfo.category === 'proprietary';
                    break;
                case 'unknown':
                    shouldInclude = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
                case 'total':
                    shouldInclude = licenseInfo.license && licenseInfo.license !== 'NOASSERTION';
                    break;
                case 'unlicensed':
                    shouldInclude = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                    break;
            }
            
            if (shouldInclude) {
                matchingDeps.push({
                    name: dep.name,
                    version: dep.version,
                    license: licenseInfo.license || 'Unknown',
                    category: licenseInfo.category
                });
            }
        });
        
        return matchingDeps;
    }

    /**
     * Show license conflict details in a popout modal
     */
    async showLicenseConflictDetailsModal(organization, conflictIndex) {
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData || !orgData.data.licenseAnalysis || !orgData.data.licenseAnalysis.conflicts) {
            this.showAlert('No license conflict data available', 'warning');
            return;
        }

        const conflict = orgData.data.licenseAnalysis.conflicts[conflictIndex];
        if (!conflict) {
            this.showAlert('Conflict not found', 'warning');
            return;
        }

        // Find dependencies involved in this conflict
        const licenseProcessor = new LicenseProcessor();
        const dependencies = orgData.data.allDependencies;
        const conflictDeps = [];
        const affectedRepos = new Map();

        dependencies.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Use unified method to get license info
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
            if (!licenseInfo) {
                return;
            }
            if (conflict.licenses.includes(licenseInfo.license)) {
                conflictDeps.push({
                    name: dep.name,
                    version: dep.version,
                    license: licenseInfo.license,
                    category: licenseInfo.category
                });

                // Find repositories that use this dependency
                orgData.data.allRepositories.forEach(repo => {
                    if (repo.dependencies.some(depKey => depKey === `${dep.name}@${dep.version}`)) {
                        const repoKey = `${repo.owner}/${repo.name}`;
                        if (!affectedRepos.has(repoKey)) {
                            affectedRepos.set(repoKey, []);
                        }
                        affectedRepos.get(repoKey).push({
                            name: dep.name,
                            version: dep.version,
                            license: licenseInfo.license
                        });
                    }
                });
            }
        });

        const modalHtml = `
            <div class="modal fade" id="licenseConflictModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">🚨 License Conflict Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="conflict-summary mb-3">
                                <div class="alert alert-danger">
                                    <strong>Type:</strong> ${conflict.type}<br>
                                    <strong>Description:</strong> ${conflict.description}<br>
                                    <strong>Incompatible Licenses:</strong> 
                                    ${conflict.licenses.map(license => `<span class="badge badge-license">${license}</span>`).join(' ')}
                                </div>
                            </div>

                            <div class="affected-dependencies mb-3">
                                <h6>📦 Affected Dependencies (${conflictDeps.length})</h6>
                                <div class="dependency-list">
                                    ${conflictDeps.map(dep => `
                                        <div class="dependency-item">
                                            <div class="dep-info">
                                                <div class="dep-name">${dep.name}@${dep.version}</div>
                                                <div class="dep-license">${dep.license}</div>
                                                <div class="dep-category">${dep.category}</div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>

                            <div class="affected-repositories">
                                <h6>📁 Affected Repositories (${affectedRepos.size})</h6>
                                <div class="repository-list">
                                    ${Array.from(affectedRepos.entries()).map(([repoKey, deps]) => `
                                        <div class="repository-item">
                                            <div class="repo-header">
                                                <h6>${repoKey}</h6>
                                                <span class="badge bg-danger">${deps.length} conflicting deps</span>
                                            </div>
                                            <div class="repo-dependencies">
                                                ${deps.map(dep => `
                                                    <div class="repo-dep-item">
                                                        <span class="dep-name">${dep.name}@${dep.version}</span>
                                                        <span class="badge badge-license">${dep.license}</span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('licenseConflictModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body using safe method
        const tempDiv = document.createElement('div');
        this.safeSetHTML(tempDiv, modalHtml);
        const modalElement = tempDiv.firstElementChild;
        if (modalElement) {
            document.body.appendChild(modalElement);
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('licenseConflictModal'));
        modal.show();

        // Clean up modal when hidden
        document.getElementById('licenseConflictModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    /**
     * Show high-risk license details in a popout modal
     */
    async showHighRiskLicenseDetailsModal(organization, packageName, version) {
        const orgData = await storageManager.loadAnalysisDataForOrganization(organization);
        if (!orgData || !orgData.data.licenseAnalysis) {
            this.showAlert('No license analysis data available', 'warning');
            return;
        }

        // Find the specific high-risk dependency
        const highRiskDep = orgData.data.licenseAnalysis.highRiskDependencies?.find(dep => 
            dep.name === packageName && dep.version === version
        );

        if (!highRiskDep) {
            this.showAlert('High-risk dependency not found', 'warning');
            return;
        }

        // Find repositories that use this dependency
        const affectedRepos = [];
        orgData.data.allRepositories.forEach(repo => {
            if (repo.dependencies.some(depKey => depKey === `${packageName}@${version}`)) {
                affectedRepos.push({
                    owner: repo.owner,
                    name: repo.name,
                    totalDependencies: repo.totalDependencies
                });
            }
        });

        const modalHtml = `
            <div class="modal fade" id="highRiskLicenseModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">⚠️ High-Risk License Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="dependency-summary mb-3">
                                <div class="alert alert-warning">
                                    <strong>Package:</strong> ${packageName}@${version}<br>
                                    <strong>License:</strong> ${highRiskDep.license}<br>
                                    <strong>Category:</strong> ${highRiskDep.category}<br>
                                    ${highRiskDep.warnings && highRiskDep.warnings.length > 0 ? `
                                    <strong>Warnings:</strong><br>
                                    ${highRiskDep.warnings.map(warning => `• ${warning}`).join('<br>')}
                                    ` : ''}
                                </div>
                            </div>

                            <div class="affected-repositories mb-3">
                                <h6>📁 Affected Repositories (${affectedRepos.length})</h6>
                                <div class="repository-list">
                                    ${affectedRepos.map(repo => {
                                        const archivedBadge = repo.archived ? ' <span class="badge bg-secondary" title="Archived Repository"><i class="fas fa-archive"></i> Archived</span>' : '';
                                        const archivedClass = repo.archived ? ' archived-repo' : '';
                                        return `
                                        <div class="repository-item${archivedClass}">
                                            <div class="repo-header">
                                                <h6>${repo.owner}/${repo.name}${archivedBadge}</h6>
                                                <span class="badge bg-primary">${repo.totalDependencies} total deps</span>
                                            </div>
                                            <div class="repo-actions">
                                                <button class="btn btn-outline-primary btn-sm" onclick="viewManager.showRepositoryDetailsFromAllReposIndex(${orgData.data.allRepositories.findIndex(r => r.owner === repo.owner && r.name === repo.name)}, '${organization}')">
                                                    <i class="fas fa-eye me-1"></i>View Repository
                                                </button>
                                            </div>
                                        </div>`;
                                    }).join('')}
                                </div>
                            </div>

                            <div class="recommendations">
                                <h6>💡 Recommendations</h6>
                                <div class="recommendation-list">
                                    <div class="recommendation-item warning">
                                        <div class="rec-priority">High Priority</div>
                                        <div class="rec-message">Consider replacing ${packageName}@${version} with an alternative that has a more permissive license.</div>
                                    </div>
                                    <div class="recommendation-item info">
                                        <div class="rec-priority">Medium Priority</div>
                                        <div class="rec-message">Review the license terms and ensure compliance with your project's requirements.</div>
                                    </div>
                                    <div class="recommendation-item info">
                                        <div class="rec-priority">Low Priority</div>
                                        <div class="rec-message">Document the license usage and maintain records for compliance purposes.</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('highRiskLicenseModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body using safe method
        const tempDiv = document.createElement('div');
        this.safeSetHTML(tempDiv, modalHtml);
        const modalElement = tempDiv.firstElementChild;
        if (modalElement) {
            document.body.appendChild(modalElement);
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('highRiskLicenseModal'));
        modal.show();

        // Clean up modal when hidden
        document.getElementById('highRiskLicenseModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    /**
     * Calculate license counts based on category filter
     */
    calculateLicenseCounts(orgData, categoryFilter = null) {
        if (!orgData || !orgData.data || !orgData.data.allDependencies) {
            return {
                total: 0,
                copyleft: 0,
                proprietary: 0,
                unknown: 0,
                unlicensed: 0
            };
        }

        const dependencies = orgData.data.allDependencies;
        const licenseProcessor = new LicenseProcessor(); // Still needed for isDependencyCompatibleWithRepository
        
        const counts = {
            total: 0,
            copyleft: 0,
            proprietary: 0,
            unknown: 0,
            unlicensed: 0
        };

        // If filter is active, only count dependencies matching that category
        if (categoryFilter && categoryFilter !== 'all') {
            // When filtering, only show count for the filtered category
            let filteredCount = 0;
            dependencies.forEach(dep => {
                // Use unified method to get license info (includes GitHub Actions enriched data)
                const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
                
                // If no license info found, treat as unlicensed
                if (!licenseInfo || !licenseInfo.license || licenseInfo.license === 'NOASSERTION') {
                    if (categoryFilter === 'unlicensed') {
                        counts.unlicensed++;
                        filteredCount++;
                    }
                    return;
                }
                
                let matches = false;
                
                switch (categoryFilter) {
                    case 'proprietary':
                        matches = licenseInfo.category === 'proprietary';
                        if (matches) {
                            counts.proprietary++;
                            filteredCount++;
                        }
                        break;
                    case 'copyleft':
                        matches = licenseInfo.category === 'copyleft' || licenseInfo.category === 'lgpl';
                        if (matches) {
                            counts.copyleft++;
                            filteredCount++;
                        }
                        break;
                    case 'lgpl':
                        matches = licenseInfo.category === 'lgpl';
                        if (matches) {
                            counts.copyleft++; // LGPL is part of copyleft
                            filteredCount++;
                        }
                        break;
                    case 'unknown':
                        matches = !licenseInfo.license || licenseInfo.license === 'NOASSERTION' || licenseInfo.category === 'unknown';
                        if (matches) {
                            counts.unknown++;
                            filteredCount++;
                        }
                        break;
                    case 'unlicensed':
                        matches = !licenseInfo.license || licenseInfo.license === 'NOASSERTION';
                        if (matches) {
                            counts.unlicensed++;
                            filteredCount++;
                        }
                        break;
                }
            });
            // Set total to the filtered count
            counts.total = filteredCount;
        } else {
            // No filter: count all dependencies normally, but exclude copyleft dependencies
            // that are compatible with all repository licenses
            const allRepos = orgData.data?.allRepositories || [];
            dependencies.forEach(dep => {
                // Use unified method to get license info (includes GitHub Actions enriched data)
                const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
                
                if (!licenseInfo || !licenseInfo.license || licenseInfo.license === 'NOASSERTION') {
                    counts.unlicensed++;
                    return;
                }
                
                // For copyleft dependencies, check compatibility with repository licenses
                if (licenseInfo.category === 'copyleft' || licenseInfo.category === 'lgpl') {
                    const depRepos = dep.repositories || [];
                    let isCompatibleWithAllRepos = true;
                    
                    if (depRepos.length > 0 && allRepos.length > 0) {
                        // Check each repository that uses this dependency
                        for (const repoKey of depRepos) {
                            const repo = allRepos.find(r => `${r.owner}/${r.name}` === repoKey);
                            if (repo && repo.license) {
                                const compatibility = licenseProcessor.isDependencyCompatibleWithRepository(
                                    licenseInfo.license, 
                                    repo.license
                                );
                                if (compatibility === false) {
                                    isCompatibleWithAllRepos = false;
                                    break; // Found at least one incompatible repo
                                } else if (compatibility === null) {
                                    // Unknown compatibility - treat as potentially incompatible
                                    isCompatibleWithAllRepos = false;
                                }
                            } else {
                                // Repository license not available - treat as potentially incompatible
                                isCompatibleWithAllRepos = false;
                            }
                        }
                    }
                    
                    // Only count copyleft dependencies that are incompatible with at least one repo
                    if (!isCompatibleWithAllRepos) {
                        counts.copyleft++;
                    }
                    // Always count in total
                    counts.total++;
                } else {
                    counts.total++;
                    
                    if (licenseInfo.category === 'proprietary') {
                        counts.proprietary++;
                    } else if (licenseInfo.category === 'unknown') {
                        counts.unknown++;
                    }
                }
            });
        }

        return counts;
    }

    /**
     * Update license card counts based on category filter
     */
    async updateLicenseCardCounts(categoryFilter = null) {
        const analysisSelector = document.getElementById('analysisSelector');
        if (!analysisSelector) return;

        const analysisName = analysisSelector.value;
        // Allow empty string for aggregated view
        if (analysisName === null || analysisName === undefined) return;

        // Determine if this is combined data (empty/null means aggregated)
        const isCombinedData = !analysisName || analysisName === '' || 
                               analysisName === 'All Entries Combined' ||
                               analysisName === 'All Analyses';

        let orgData;
        if (isCombinedData) {
            if (!window.storageManager) return;
            orgData = await storageManager.getCombinedData();
        } else {
            if (!window.storageManager) return;
            orgData = await storageManager.loadAnalysisDataForOrganization(analysisName);
        }

        if (!orgData || !orgData.data) return;

        const counts = this.calculateLicenseCounts(orgData, categoryFilter);

        // Calculate transitions count from ALL dependencies (not just high-risk)
        // This matches the logic in generateLicenseComplianceHTML
        let transitionCount = 0;
        if (orgData.data.allDependencies && orgData.data.allDependencies.length > 0) {
            const allLicenseTransitions = this.processAllDependenciesForLicenseChanges(orgData.data.allDependencies, orgData);
            transitionCount = allLicenseTransitions.length;
        }

        // Update each card's count
        const cardTypes = ['total', 'copyleft', 'proprietary', 'unknown', 'unlicensed', 'transitions'];
        cardTypes.forEach(type => {
            const countElement = document.getElementById(`license-count-${type}`);
            if (countElement) {
                if (type === 'transitions') {
                    countElement.textContent = transitionCount || 0;
                } else {
                    countElement.textContent = counts[type] || 0;
                }
            }
        });
    }

    /**
     * Generate license types table data - groups dependencies by unique license name
     */
    generateLicenseTypesTableData(allDependencies, categoryFilter = null, orgData = null) {
        if (!allDependencies || allDependencies.length === 0) {
            return [];
        }

        const licenseProcessor = new LicenseProcessor();
        const licenseMap = new Map(); // license name -> { category, risk, packages: Set, repositories: Set }

        allDependencies.forEach(dep => {
            // Use unified method to get license info
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);
            
            if (!licenseInfo) return;
            
            const license = licenseInfo.license || 'Unknown';
            const category = licenseInfo.category || 'unknown';
            const risk = licenseInfo.risk || 'low';

            // Apply category filter if active
            if (categoryFilter && categoryFilter !== 'all') {
                if (categoryFilter === 'unlicensed') {
                    // Skip licensed dependencies when filtering unlicensed
                    if (license && license !== 'Unknown' && license !== 'NOASSERTION') {
                        return;
                    }
                } else if (category !== categoryFilter) {
                    return;
                }
            }

            // Skip unlicensed when not filtering for unlicensed
            if (!categoryFilter || categoryFilter === 'all') {
                if (!license || license === 'Unknown' || license === 'NOASSERTION') {
                    return;
                }
            }

            if (!licenseMap.has(license)) {
                licenseMap.set(license, {
                    license: license,
                    category: category,
                    risk: risk,
                    packages: new Set(),
                    repositories: new Set()
                });
            }

            const licenseData = licenseMap.get(license);
            const packageKey = `${dep.name}@${dep.version}`;
            licenseData.packages.add(packageKey);

            // Add repositories
            if (dep.repositories && Array.isArray(dep.repositories)) {
                dep.repositories.forEach(repo => {
                    licenseData.repositories.add(repo);
                });
            }
        });

        // Convert to array and sort by risk level (high first), then by package count (descending)
        const riskOrder = { 'high': 0, 'medium': 1, 'low': 2 };
        return Array.from(licenseMap.values())
            .map(licenseData => ({
                license: licenseData.license,
                category: licenseData.category,
                risk: (licenseData.risk || 'low').toLowerCase(),
                packageCount: licenseData.packages.size,
                repositoryCount: licenseData.repositories.size
            }))
            .sort((a, b) => {
                // First sort by risk level (high first)
                const riskA = riskOrder[a.risk] ?? 99;
                const riskB = riskOrder[b.risk] ?? 99;
                const riskDiff = riskA - riskB;
                if (riskDiff !== 0) return riskDiff;
                // Then sort by package count (descending)
                return b.packageCount - a.packageCount;
            });
    }

    /**
     * Generate unlicensed dependencies table data
     */
    generateUnlicensedTableData(allDependencies, orgData = null) {
        if (!allDependencies || allDependencies.length === 0) {
            return [];
        }

        const packageMap = new Map();

        allDependencies.forEach(dep => {
            // Use unified method to get license info (includes GitHub Actions enriched data)
            const { licenseInfo } = this.getDependencyLicenseInfo(dep, orgData);

            // Check if unlicensed
            if (!licenseInfo || !licenseInfo.license || licenseInfo.license === 'NOASSERTION') {
                const packageName = dep.name || 'Unknown';
                if (!packageName || packageName === 'Unknown') return;

                if (!packageMap.has(packageName)) {
                    packageMap.set(packageName, {
                        name: packageName,
                        versions: new Set(),
                        repositories: new Set(),
                        totalUsage: 0
                    });
                }

                const pkg = packageMap.get(packageName);
                if (dep.version) pkg.versions.add(dep.version);
                if (dep.repositories && Array.isArray(dep.repositories)) {
                    dep.repositories.forEach(repo => {
                        pkg.repositories.add(repo);
                        pkg.totalUsage++;
                    });
                }
            }
        });

        // Convert to array and sort by usage (most used first)
        return Array.from(packageMap.values())
            .map(pkg => ({
                name: pkg.name,
                versions: Array.from(pkg.versions),
                repositories: Array.from(pkg.repositories),
                totalUsage: pkg.totalUsage,
                repositoryCount: pkg.repositories.size,
                versionCount: pkg.versions.size  // Use .size for Set, not .length
            }))
            .sort((a, b) => b.totalUsage - a.totalUsage);
    }

    /**
     * Process ALL dependencies to detect license changes (not just high-risk)
     */
    processAllDependenciesForLicenseChanges(allDependencies, orgData) {
        if (!allDependencies || allDependencies.length === 0) {
            return [];
        }

        const licenseProcessor = new LicenseProcessor();
        const transitions = [];

        // Group by package name
        const packageMap = new Map();
        
        allDependencies.forEach(dep => {
            const packageName = dep.name || 'Unknown';
            if (!packageName || packageName === 'Unknown') return;
            
            // Parse license for this dependency
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage || {});
            const license = licenseInfo.license || 'Unknown';
            
            // Get ecosystem for display
            const ecosystem = dep.ecosystem || dep.category?.ecosystem || null;
            
            if (!packageMap.has(packageName)) {
                packageMap.set(packageName, []);
            }
            packageMap.get(packageName).push({
                version: dep.version || 'Unknown',
                license: license,
                category: licenseInfo.category || 'unknown',
                repositories: dep.repositories || [],
                ecosystem: ecosystem
            });
        });

        // Process each package to detect license changes
        packageMap.forEach((versions, packageName) => {
            // Skip if only one version
            if (versions.length < 2) return;
            
            // Sort versions chronologically
            versions.sort((a, b) => {
                return a.version.localeCompare(b.version, undefined, { numeric: true, sensitivity: 'base' });
            });

            // Detect transitions between consecutive versions
            for (let i = 0; i < versions.length - 1; i++) {
                const current = versions[i];
                const next = versions[i + 1];
                
                // Normalize licenses before comparison to avoid false positives
                const licenseProcessor = window.LicenseProcessor ? new window.LicenseProcessor() : null;
                const normalizedCurrent = licenseProcessor ? licenseProcessor.normalizeLicenseName(current.license) : current.license;
                const normalizedNext = licenseProcessor ? licenseProcessor.normalizeLicenseName(next.license) : next.license;
                
                // Only report if licenses are different after normalization
                if (normalizedCurrent !== normalizedNext && normalizedCurrent !== 'Unknown' && normalizedNext !== 'Unknown') {
                    // Combine repositories from both versions
                    const allRepos = new Set([...(current.repositories || []), ...(next.repositories || [])]);
                    
                    // Use ecosystem from either version (they should be the same)
                    const ecosystem = current.ecosystem || next.ecosystem || null;
                    
                    transitions.push({
                        type: 'license-transition',
                        packageName: packageName,
                        ecosystem: ecosystem,
                        fromLicense: normalizedCurrent,
                        toLicense: normalizedNext,
                        fromVersion: current.version,
                        toVersion: next.version,
                        fromCategory: current.category,
                        toCategory: next.category,
                        repositories: Array.from(allRepos)
                    });
                }
            }
        });

        return transitions;
    }

    /**
     * Process high-risk dependencies: group by package/license and detect transitions
     */
    processHighRiskDependencies(highRiskDeps) {
        if (!highRiskDeps || highRiskDeps.length === 0) {
            return [];
        }

        // Group by package name
        const packageMap = new Map();
        
        highRiskDeps.forEach(dep => {
            const packageName = dep.name || 'Unknown';
            if (!packageMap.has(packageName)) {
                packageMap.set(packageName, []);
            }
            packageMap.get(packageName).push({
                version: dep.version || 'Unknown',
                license: dep.license || 'Unknown',
                category: dep.category || 'Unknown',
                warnings: dep.warnings || []
            });
        });

        const issues = [];

        // Process each package
        packageMap.forEach((versions, packageName) => {
            // Sort versions (simple string sort, could be improved with semver)
            versions.sort((a, b) => {
                // Try to sort by version if possible
                return a.version.localeCompare(b.version, undefined, { numeric: true, sensitivity: 'base' });
            });

            // Group by license
            const licenseGroups = new Map();
            versions.forEach(v => {
                const license = v.license;
                if (!licenseGroups.has(license)) {
                    licenseGroups.set(license, []);
                }
                licenseGroups.get(license).push(v);
            });

            // If all versions have the same license, create one issue
            if (licenseGroups.size === 1) {
                const license = Array.from(licenseGroups.keys())[0];
                const versionsList = licenseGroups.get(license);
                issues.push({
                    type: 'same-license',
                    packageName: packageName,
                    license: license,
                    category: versionsList[0].category,
                    versions: versionsList.map(v => v.version),
                    warnings: versionsList[0].warnings || []
                });
            } else {
                // Multiple licenses detected - detect all transitions between consecutive versions
                // Each transition is highlighted as a separate issue
                for (let i = 0; i < versions.length - 1; i++) {
                    const current = versions[i];
                    const next = versions[i + 1];
                    
                    if (current.license !== next.license) {
                        // Found a transition - create a separate issue for each transition
                        issues.push({
                            type: 'license-transition',
                            packageName: packageName,
                            fromLicense: current.license,
                            toLicense: next.license,
                            fromVersion: current.version,
                            toVersion: next.version,
                            category: next.category, // Use the "to" category
                            warnings: [...(current.warnings || []), ...(next.warnings || [])]
                        });
                    }
                }
            }
        });

        return issues;
    }

    /**
     * Find repositories for a license issue by matching packages
     */
    findRepositoriesForIssue(issue, orgData) {
        const repositories = new Map(); // Map: repoKey -> { packages: [{name, version}] }
        
        if (!orgData || !orgData.data || !orgData.data.allRepositories || !orgData.data.allDependencies) {
            return repositories;
        }

        const allRepos = orgData.data.allRepositories;
        const allDeps = orgData.data.allDependencies;

        if (issue.type === 'same-license') {
            // Find all versions of this package with this license
            issue.versions.forEach(version => {
                const depKey = `${issue.packageName}@${version}`;
                allRepos.forEach(repo => {
                    if (repo.dependencies && repo.dependencies.includes(depKey)) {
                        const repoKey = `${repo.owner}/${repo.name}`;
                        if (!repositories.has(repoKey)) {
                            repositories.set(repoKey, { packages: [] });
                        }
                        repositories.get(repoKey).packages.push({
                            name: issue.packageName,
                            version: version
                        });
                    }
                });
            });
        } else if (issue.type === 'license-transition') {
            // Find repositories with either version (from or to)
            const fromDepKey = `${issue.packageName}@${issue.fromVersion}`;
            const toDepKey = `${issue.packageName}@${issue.toVersion}`;
            
            allRepos.forEach(repo => {
                if (repo.dependencies) {
                    const hasFrom = repo.dependencies.includes(fromDepKey);
                    const hasTo = repo.dependencies.includes(toDepKey);
                    
                    if (hasFrom || hasTo) {
                        const repoKey = `${repo.owner}/${repo.name}`;
                        if (!repositories.has(repoKey)) {
                            repositories.set(repoKey, { packages: [] });
                        }
                        if (hasFrom) {
                            repositories.get(repoKey).packages.push({
                                name: issue.packageName,
                                version: issue.fromVersion,
                                license: issue.fromLicense
                            });
                        }
                        if (hasTo) {
                            repositories.get(repoKey).packages.push({
                                name: issue.packageName,
                                version: issue.toVersion,
                                license: issue.toLicense
                            });
                        }
                    }
                }
            });
        }

        return repositories;
    }

    /**
     * Group issues by license and find repositories for each
     * For license transitions, create separate entries for both "from" and "to" licenses
     */
    groupIssuesByLicense(processedIssues, orgData) {
        const licenseGroups = new Map(); // Map: license -> { issues: [], repositories: Map }

        processedIssues.forEach(issue => {
            if (issue.type === 'same-license') {
                // Same license issues: group by the license
                const licenseKey = issue.license;
                
                if (!licenseGroups.has(licenseKey)) {
                    licenseGroups.set(licenseKey, {
                        license: licenseKey,
                        category: issue.category,
                        issues: [],
                        repositories: new Map()
                    });
                }

                const group = licenseGroups.get(licenseKey);
                group.issues.push(issue);

                // Find repositories for this issue
                const issueRepos = this.findRepositoriesForIssue(issue, orgData);
                issueRepos.forEach((repoData, repoKey) => {
                    if (!group.repositories.has(repoKey)) {
                        group.repositories.set(repoKey, { packages: [] });
                    }
                    // Merge packages from this issue into the repository
                    repoData.packages.forEach(pkg => {
                        group.repositories.get(repoKey).packages.push({
                            ...pkg,
                            issueType: issue.type,
                            issuePackageName: issue.packageName
                        });
                    });
                });
            } else if (issue.type === 'license-transition') {
                // License transitions: create separate entries for both "from" and "to" licenses
                const allDeps = orgData.data?.allDependencies || [];
                
                // Helper function to normalize versions for comparison
                const normalizeVersion = window.normalizeVersion || ((version) => {
                    if (!version) return '';
                    return String(version).trim()
                        .replace(/^[><=^~]+\s*/, '')
                        .replace(/\s+-\s+[\d.]+.*$/, '')
                        .replace(/\s*\|\|.*$/, '')
                        .replace(/\s+/g, '');
                });
                
                const normalizedFromVersion = normalizeVersion(issue.fromVersion);
                const normalizedToVersion = normalizeVersion(issue.toVersion);
                
                // Process "from" license
                const fromLicenseKey = issue.fromLicense;
                if (!licenseGroups.has(fromLicenseKey)) {
                    // Determine category for from license
                    const licenseProcessor = new LicenseProcessor();
                    const fromPkg = { licenseDeclared: issue.fromLicense };
                    const fromInfo = licenseProcessor.parseLicense(fromPkg);
                    
                    licenseGroups.set(fromLicenseKey, {
                        license: fromLicenseKey,
                        category: fromInfo.category || 'unknown',
                        issues: [],
                        repositories: new Map()
                    });
                }
                
                const fromGroup = licenseGroups.get(fromLicenseKey);
                fromGroup.issues.push({
                    ...issue,
                    isTransitionPart: 'from'
                });
                
                // Find repositories with the "from" version using allDependencies
                // Try exact match first, then normalized match
                let fromDep = allDeps.find(dep => 
                    dep.name === issue.packageName && dep.version === issue.fromVersion
                );
                if (!fromDep) {
                    fromDep = allDeps.find(dep => 
                        dep.name === issue.packageName && normalizeVersion(dep.version) === normalizedFromVersion
                    );
                }
                if (fromDep && fromDep.repositories) {
                    fromDep.repositories.forEach(repoKey => {
                        if (!fromGroup.repositories.has(repoKey)) {
                            fromGroup.repositories.set(repoKey, { packages: [] });
                        }
                        fromGroup.repositories.get(repoKey).packages.push({
                            name: issue.packageName,
                            version: issue.fromVersion,
                            license: issue.fromLicense,
                            issueType: issue.type,
                            issuePackageName: issue.packageName,
                            isTransitionPart: 'from'
                        });
                    });
                }
                
                // Process "to" license
                const toLicenseKey = issue.toLicense;
                if (!licenseGroups.has(toLicenseKey)) {
                    // Determine category for to license
                    const licenseProcessor = new LicenseProcessor();
                    const toPkg = { licenseDeclared: issue.toLicense };
                    const toInfo = licenseProcessor.parseLicense(toPkg);
                    
                    licenseGroups.set(toLicenseKey, {
                        license: toLicenseKey,
                        category: toInfo.category || issue.category || 'unknown',
                        issues: [],
                        repositories: new Map()
                    });
                }
                
                const toGroup = licenseGroups.get(toLicenseKey);
                toGroup.issues.push({
                    ...issue,
                    isTransitionPart: 'to'
                });
                
                // Find repositories with the "to" version using allDependencies
                // Try exact match first, then normalized match
                let toDep = allDeps.find(dep => 
                    dep.name === issue.packageName && dep.version === issue.toVersion
                );
                if (!toDep) {
                    toDep = allDeps.find(dep => 
                        dep.name === issue.packageName && normalizeVersion(dep.version) === normalizedToVersion
                    );
                }
                if (toDep && toDep.repositories) {
                    toDep.repositories.forEach(repoKey => {
                        if (!toGroup.repositories.has(repoKey)) {
                            toGroup.repositories.set(repoKey, { packages: [] });
                        }
                        toGroup.repositories.get(repoKey).packages.push({
                            name: issue.packageName,
                            version: issue.toVersion,
                            license: issue.toLicense,
                            issueType: issue.type,
                            issuePackageName: issue.packageName,
                            isTransitionPart: 'to'
                        });
                    });
                }
            } else {
                // Unknown issue type
                const licenseKey = 'Unknown';
                if (!licenseGroups.has(licenseKey)) {
                    licenseGroups.set(licenseKey, {
                        license: licenseKey,
                        category: 'unknown',
                        issues: [],
                        repositories: new Map()
                    });
                }
                
                const group = licenseGroups.get(licenseKey);
                group.issues.push(issue);
                
                // Find repositories for this issue
                const issueRepos = this.findRepositoriesForIssue(issue, orgData);
                issueRepos.forEach((repoData, repoKey) => {
                    if (!group.repositories.has(repoKey)) {
                        group.repositories.set(repoKey, { packages: [] });
                    }
                    repoData.packages.forEach(pkg => {
                        group.repositories.get(repoKey).packages.push({
                            ...pkg,
                            issueType: issue.type,
                            issuePackageName: issue.packageName
                        });
                    });
                });
            }
        });

        return licenseGroups;
    }

    /**
     * Generate License Compliance HTML (standalone section)
     */
    async generateLicenseComplianceHTML(orgData, categoryFilter = null) {
        if (!orgData || !orgData.data) {
            return `<div class="alert alert-danger">No organization data available.</div>`;
        }
        if (!orgData.data.licenseAnalysis) {
            return `<div class="alert alert-info">No license analysis found for this organization.</div>`;
        }
        
        const licenseAnalysis = orgData.data.licenseAnalysis;
        const orgName = orgData.organization || orgData.name;
        
        // Show filter notice if category filter is active
        const filterNotice = categoryFilter ? `
            <div class="alert alert-info alert-dismissible fade show mb-3">
                <i class="fas fa-filter me-2"></i>
                <strong>Category Filter Active:</strong> Showing only ${escapeHtml(categoryFilter)} license category.
                <a href="licenses.html" class="btn btn-sm btn-outline-primary ms-2">
                    <i class="fas fa-times me-1"></i>Clear Filter
                </a>
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        ` : '';
        
        // escapeHtml is provided by utils.js
        
        // Calculate counts based on filter
        const counts = this.calculateLicenseCounts(orgData, categoryFilter);
        
        // Process ALL dependencies for license changes (needed before cardConfigs)
        const allDeps = orgData.data?.allDependencies || [];
        const allLicenseTransitions = this.processAllDependenciesForLicenseChanges(allDeps, orgData);
        const transitionCount = allLicenseTransitions.length;
        
        // Re-process high-risk dependencies from allDependencies using current license processor
        // This ensures we use the latest license classifications, not stored old data
        const licenseProcessor = new LicenseProcessor();
        const allRepos = orgData.data?.allRepositories || [];
        const rawHighRiskDeps = [];
        allDeps.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Try to get license from multiple sources (in order of preference)
            let licenseInfo = null;
            
            // 1. Check dep.licenseFull (most complete, from deps.dev API)
            if (dep.licenseFull && 
                dep.licenseFull !== 'Unknown' && 
                dep.licenseFull !== 'NOASSERTION' && 
                String(dep.licenseFull).trim() !== '') {
                licenseInfo = licenseProcessor.parseLicense({
                    licenseConcluded: dep.licenseFull,
                    licenseDeclared: dep.licenseFull
                });
            }
            // 2. Check dep.license (short form, from deps.dev API)
            else if (dep.license && 
                     dep.license !== 'Unknown' && 
                     dep.license !== 'NOASSERTION' && 
                     String(dep.license).trim() !== '') {
                licenseInfo = licenseProcessor.parseLicense({
                    licenseConcluded: dep.license,
                    licenseDeclared: dep.license
                });
            }
            // 3. Check GitHub Actions analysis metadata (for GitHub Actions dependencies)
            else if (dep.category?.ecosystem === 'GitHub Actions' || dep.ecosystem === 'GitHub Actions') {
                // Check dep._gaMetadata first (if set during processing)
                if (dep._gaMetadata && dep._gaMetadata.license) {
                    licenseInfo = licenseProcessor.parseLicense({
                        licenseConcluded: dep._gaMetadata.license,
                        licenseDeclared: dep._gaMetadata.license
                    });
                } else {
                    // Fallback: search githubActionsAnalysis
                    const enrichedLicense = this.getEnrichedGitHubActionLicense(dep, orgData);
                    if (enrichedLicense) {
                        licenseInfo = licenseProcessor.parseLicense({
                            licenseConcluded: enrichedLicense,
                            licenseDeclared: enrichedLicense
                        });
                    }
                }
            }
            // 4. Parse from originalPackage (from SBOM) - always check this as fallback
            if (!licenseInfo && dep.originalPackage) {
                licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
            }
            
            // If no license info found, treat as unlicensed/unknown
            if (!licenseInfo || !licenseInfo.license || licenseInfo.license === 'NOASSERTION') {
                // Include in high-risk if unlicensed
                rawHighRiskDeps.push({
                    name: dep.name || 'Unknown',
                    version: dep.version || 'Unknown',
                    license: 'Unknown',
                    category: 'unknown',
                    warnings: ['No license information found'],
                    originalPackage: dep.originalPackage || null,
                    isIncompatibleWithAnyRepo: false
                });
                return;
            }
            
            // Check if this dependency is used by any repositories and if it's compatible
            const depRepos = dep.repositories || [];
            let isIncompatibleWithAnyRepo = false;
            let isCompatibleWithAllRepos = true;
            
            // For copyleft dependencies (GPL/LGPL), check compatibility with repository licenses
            if (licenseInfo.category === 'copyleft' || licenseInfo.category === 'lgpl') {
                if (depRepos.length > 0 && allRepos.length > 0) {
                    // Check each repository that uses this dependency
                    for (const repoKey of depRepos) {
                        const repo = allRepos.find(r => `${r.owner}/${r.name}` === repoKey);
                        if (repo && repo.license) {
                            const compatibility = licenseProcessor.isDependencyCompatibleWithRepository(
                                licenseInfo.license, 
                                repo.license
                            );
                            if (compatibility === false) {
                                isIncompatibleWithAnyRepo = true;
                                isCompatibleWithAllRepos = false;
                                break; // Found at least one incompatible repo
                            } else if (compatibility === null) {
                                // Unknown compatibility - treat as potentially incompatible
                                isCompatibleWithAllRepos = false;
                            }
                        } else {
                            // Repository license not available - treat as potentially incompatible
                            isCompatibleWithAllRepos = false;
                        }
                    }
                    
                    // If copyleft dependency is compatible with all repositories, don't flag it as high-risk
                    if (isCompatibleWithAllRepos && !isIncompatibleWithAnyRepo) {
                        return; // Skip this dependency - it's compatible with all repos
                    }
                }
            }
            
            // Only include high-risk dependencies (copyleft, unknown, or unlicensed)
            // But skip copyleft dependencies that are compatible with all repositories
            if (licenseInfo.risk === 'high' || licenseInfo.category === 'copyleft' || 
                licenseInfo.category === 'unknown' || !licenseInfo.license || 
                licenseInfo.license === 'NOASSERTION') {
                // For copyleft dependencies, only include if incompatible with at least one repo
                if (licenseInfo.category === 'copyleft' || licenseInfo.category === 'lgpl') {
                    if (!isIncompatibleWithAnyRepo && isCompatibleWithAllRepos) {
                        return; // Skip - compatible with all repositories
                    }
                }
                
                rawHighRiskDeps.push({
                    name: dep.name || 'Unknown',
                    version: dep.version || 'Unknown',
                    license: licenseInfo.license || 'Unknown',
                    category: licenseInfo.category || 'unknown',
                    warnings: licenseInfo.warnings || [],
                    originalPackage: dep.originalPackage,
                    isIncompatibleWithAnyRepo: isIncompatibleWithAnyRepo
                });
            }
        });
        let processedIssues = this.processHighRiskDependencies(rawHighRiskDeps);
        
        // Filter processedIssues by categoryFilter if active
        if (categoryFilter && categoryFilter !== 'all') {
            processedIssues = this.filterIssuesByCategory(processedIssues, categoryFilter);
        }
        
        // Prepare license cards
        // Order: High risk first (unlicensed, copyleft, unknown), then medium risk (proprietary), then summary/info (total, transitions)
        const licenseCards = [];
        const cardConfigs = [
            {
                type: 'unlicensed',
                title: '🚨 Unlicensed',
                count: counts.unlicensed,
                detail: 'unlicensed deps',
                licenseType: 'unlicensed'
            },
            {
                type: 'copyleft',
                title: '⚠️ Copyleft',
                count: counts.copyleft,
                detail: 'high risk',
                licenseType: 'copyleft'
            },
            {
                type: 'unknown',
                title: '❓ Unknown',
                count: counts.unknown,
                detail: 'high risk',
                licenseType: 'unknown'
            },
            {
                type: 'proprietary',
                title: '🔒 Proprietary',
                count: counts.proprietary,
                detail: 'medium risk',
                licenseType: 'proprietary'
            },
            {
                type: 'total',
                title: '📊 Total',
                count: counts.total,
                detail: 'licensed deps',
                licenseType: 'total'
            },
            {
                type: 'transitions',
                title: '🔄 License Changes',
                count: transitionCount,
                detail: 'transitions',
                licenseType: 'transitions'
            }
        ];
        
        // Generate license card HTML for each type (with click handlers for filtering)
        for (const config of cardConfigs) {
            // All cards are clickable - Total shows all, others filter
            const clickHandler = `onclick="viewManager.filterHighRiskList('${config.type}')" style="cursor: pointer;"`;
            const cardHTML = `<div class="license-stat-card ${config.type} license-card clickable-license-card" id="license-card-${config.type}" ${clickHandler}>
    <h4>${escapeHtml(config.title)}</h4>
    <div class="license-number" id="license-count-${config.type}">${config.count}</div>
    <div class="license-detail">${escapeHtml(config.detail)}</div>
</div>`;
            
            licenseCards.push(cardHTML);
        }
        
        // Prepare conflicts
        const conflicts = (licenseAnalysis.conflicts || []).slice(0, 5).map(conflict => ({
            type: conflict.type || 'Unknown',
            description: conflict.description || '',
            licenses: conflict.licenses || [],
            organization: orgName
        }));
        
        // Process high-risk dependencies: group by package/license and detect transitions
        // (Note: processedIssues was already calculated above for transitionCount)
        
        // Generate license cards HTML
        const licenseCardsHTML = `${filterNotice}<div class="license-stats">
    ${licenseCards.join('\n    ')}
</div>

<!-- License Repositories Slide-out Panel -->
<div id="license-repositories-panel" class="license-repositories-panel" style="display: none;">
    <div class="panel-header">
        <h4 id="license-panel-title">License Repositories</h4>
        <button class="btn btn-sm btn-outline-secondary" onclick="viewManager.closeLicenseRepositoriesPanel()">
            <i class="fas fa-times"></i> Close
        </button>
    </div>
    <div id="license-repositories-content" class="panel-content">
        <!-- Content will be loaded here -->
    </div>
</div>`;

        // Generate conflicts HTML
        let conflictsHTML = '';
        if (conflicts.length > 0) {
            const conflictItems = conflicts.map((conflict, index) => `
        <div class="license-conflict-item">
            <div class="conflict-info">
                <div class="conflict-type">${escapeHtml(conflict.type)}</div>
                <div class="conflict-description">${escapeHtml(conflict.description)}</div>
                <div class="conflict-licenses">
                    ${conflict.licenses.map(lic => `<span class="badge badge-license">${escapeHtml(lic)}</span>`).join('\n                    ')}
                </div>
                <div class="conflict-actions">
                    <button class="btn btn-outline-danger btn-sm" onclick="viewManager.showLicenseConflictDetailsModal('${escapeJsString(escapeHtml(orgName))}', ${index})">
                        <i class="fas fa-eye me-1"></i>View Affected Repositories
                    </button>
                </div>
            </div>
        </div>`).join('');
            
            conflictsHTML = `<div class="license-conflicts">
    <h4>🚨 License Conflicts</h4>
    <div class="license-conflicts-list">
        ${conflictItems}
    </div>
</div>`;
        }

        // Handle combined data names for deps.html URL (use empty for aggregated)
        const orgParam = (!orgName || orgName === '' || orgName === 'All Entries Combined' || orgName === 'All Analyses') 
            ? '' 
            : orgName;
        
        // Helper function to create deps.html URL
        const createDepsUrl = (packageName, version) => {
            const searchTerm = version ? `${packageName}@${version}` : packageName;
            return `deps.html?org=${encodeURIComponent(orgParam)}&search=${encodeURIComponent(searchTerm)}`;
        };

        // Generate License Changes section (all dependencies)
        // allLicenseTransitions already calculated above for transitionCount
        let licenseChangesHTML = '';
        if (allLicenseTransitions.length > 0) {
            const transitionRows = allLicenseTransitions.map(transition => {
                const repoCount = transition.repositories ? transition.repositories.length : 0;
                // Format dependency as ecosystem:name if ecosystem is available
                const displayName = transition.ecosystem 
                    ? `${transition.ecosystem}:${transition.packageName}` 
                    : transition.packageName;
                return `
                <tr>
                    <td>
                        <a href="${createDepsUrl(transition.packageName, null)}" class="dependency-link" target="_blank">
                            <code>${escapeHtml(displayName)}</code>
                        </a>
                    </td>
                    <td>
                        <a href="${createDepsUrl(transition.packageName, transition.fromVersion)}" class="text-decoration-none" target="_blank">
                            <code>${escapeHtml(transition.fromVersion)}</code>
                        </a>
                        <span class="badge badge-license ms-2">${escapeHtml(transition.fromLicense)}</span>
                    </td>
                    <td>
                        <a href="${createDepsUrl(transition.packageName, transition.toVersion)}" class="text-decoration-none" target="_blank">
                            <code>${escapeHtml(transition.toVersion)}</code>
                        </a>
                        <span class="badge badge-license ms-2">${escapeHtml(transition.toLicense)}</span>
                    </td>
                    <td class="text-center">
                        <strong>${repoCount}</strong>
                    </td>
                </tr>`;
            }).join('');
            
            licenseChangesHTML = `<div class="license-changes-section" id="license-changes-section">
    <h4>🔄 License Changes Detected</h4>
    <p class="text-muted mb-3">All license changes across all dependencies (not just high-risk)</p>
    <div class="table-responsive">
        <table class="table table-striped table-hover">
            <thead>
                <tr>
                    <th>Dependency</th>
                    <th>Version 1 @ License 1</th>
                    <th>Version 2 @ License 2</th>
                    <th class="text-center">Repositories</th>
                </tr>
            </thead>
            <tbody>
                ${transitionRows}
            </tbody>
        </table>
    </div>
</div>`;
        }

        // Generate License Types Table
        const licenseTypesData = this.generateLicenseTypesTableData(allDeps, categoryFilter, orgData);
        let licenseTypesHTML = '';
        if (licenseTypesData.length > 0) {
            const getRiskBadgeClass = (risk) => {
                switch(risk) {
                    case 'high': return 'bg-danger';
                    case 'medium': return 'bg-warning';
                    case 'low': return 'bg-success';
                    default: return 'bg-secondary';
                }
            };

            const getCategoryBadgeClass = (category) => {
                switch(category) {
                    case 'copyleft': return 'bg-danger';
                    case 'proprietary': return 'bg-warning text-dark';
                    case 'lgpl': return 'bg-info';
                    case 'permissive': return 'bg-success';
                    case 'unknown': return 'bg-warning text-dark';
                    default: return 'bg-secondary text-dark';
                }
            };

            const licenseTypesRows = licenseTypesData.map(licenseData => {
                return `
                <tr>
                    <td>
                        <span class="badge badge-license ${getCategoryBadgeClass(licenseData.category)}">${escapeHtml(licenseData.license)}</span>
                    </td>
                    <td>
                        <span class="badge ${getCategoryBadgeClass(licenseData.category)}">${escapeHtml(licenseData.category)}</span>
                    </td>
                    <td class="text-center">
                        <strong>${licenseData.packageCount}</strong>
                    </td>
                    <td class="text-center">
                        <strong>${licenseData.repositoryCount}</strong>
                    </td>
                    <td>
                        <span class="badge ${getRiskBadgeClass(licenseData.risk)}">${escapeHtml(licenseData.risk)}</span>
                    </td>
                    <td>
                        <a href="deps.html?org=${encodeURIComponent(orgParam)}&license=${encodeURIComponent(licenseData.license)}" class="btn btn-sm btn-outline-primary" target="_blank" title="View all packages with ${escapeHtml(licenseData.license)} license">
                            <i class="fas fa-external-link-alt me-1"></i>View
                        </a>
                    </td>
                </tr>`;
            }).join('');

            licenseTypesHTML = `<div class="license-types-section mb-4" id="license-types-section">
    <h4>📋 License Types</h4>
    <p class="text-muted mb-3">All unique licenses found in dependencies</p>
    <div class="table-responsive">
        <table class="table table-striped table-hover" id="license-types-table">
            <thead>
                <tr>
                    <th>License Name</th>
                    <th>Category</th>
                    <th class="text-center">Packages</th>
                    <th class="text-center">Repositories</th>
                    <th>Risk Level</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${licenseTypesRows}
            </tbody>
        </table>
    </div>
</div>`;
        }

        // Generate Unlicensed Dependencies Table
        const unlicensedData = this.generateUnlicensedTableData(allDeps, orgData);
        let unlicensedHTML = '';
        if (unlicensedData.length > 0) {
            const unlicensedRows = unlicensedData.map(pkg => {
                return `
                <tr>
                    <td>
                        <a href="${createDepsUrl(pkg.name, null)}" class="dependency-link" target="_blank">
                            <code>${escapeHtml(pkg.name)}</code>
                        </a>
                    </td>
                    <td class="text-center">
                        <strong>${pkg.repositoryCount}</strong>
                    </td>
                    <td class="text-center">
                        <strong>${pkg.versionCount}</strong>
                    </td>
                </tr>`;
            }).join('');

            unlicensedHTML = `<div class="unlicensed-section mb-4" id="unlicensed-section">
    <h4>🚨 Unlicensed Dependencies</h4>
    <p class="text-muted mb-3">Dependencies without license information</p>
    <div class="table-responsive">
        <table class="table table-striped table-hover" id="unlicensed-table">
            <thead>
                <tr>
                    <th>Dependency</th>
                    <th class="text-center">Used by Repos</th>
                    <th class="text-center">Version Count</th>
                </tr>
            </thead>
            <tbody>
                ${unlicensedRows}
            </tbody>
        </table>
    </div>
</div>`;
        }

        // Store data for filtering
        const highRiskListContainerId = 'license-tables-container';
        const categoryFilterValue = categoryFilter || 'all';
        const allIssuesJson = JSON.stringify(processedIssues).replace(/"/g, '&quot;');
        const orgDataName = orgName;

        return licenseCardsHTML + conflictsHTML + 
            `<div id="${highRiskListContainerId}" data-all-issues='${allIssuesJson}' data-org-name='${escapeHtml(orgName)}' data-category-filter='${escapeHtml(categoryFilterValue)}' data-org-data-name='${escapeHtml(orgDataName)}'>
                ${licenseTypesHTML}
                ${unlicensedHTML}
                ${licenseChangesHTML}
            </div>`;
    }

    /**
     * Filter issues by category filter
     */
    filterIssuesByCategory(issues, categoryFilter) {
        if (!categoryFilter || categoryFilter === 'all') {
            return issues;
        }

        const licenseProcessor = new LicenseProcessor();

        return issues.filter(issue => {
            // For license transitions, check if either from or to license matches the category
            if (issue.type === 'license-transition') {
                // Parse both licenses to get their categories
                const fromPkg = { licenseDeclared: issue.fromLicense };
                const toPkg = { licenseDeclared: issue.toLicense };
                const fromInfo = licenseProcessor.parseLicense(fromPkg);
                const toInfo = licenseProcessor.parseLicense(toPkg);
                
                switch (categoryFilter) {
                    case 'copyleft':
                        return fromInfo.category === 'copyleft' || fromInfo.category === 'lgpl' ||
                               toInfo.category === 'copyleft' || toInfo.category === 'lgpl';
                    case 'proprietary':
                        return fromInfo.category === 'proprietary' || toInfo.category === 'proprietary';
                    case 'unknown':
                        return fromInfo.category === 'unknown' || toInfo.category === 'unknown' ||
                               !fromInfo.license || !toInfo.license;
                    case 'unlicensed':
                        return fromInfo.category === 'unknown' && (!fromInfo.license || fromInfo.license === 'NOASSERTION') ||
                               toInfo.category === 'unknown' && (!toInfo.license || toInfo.license === 'NOASSERTION');
                    default:
                        return true;
                }
            }
            
            // For same-license issues, check category
            switch (categoryFilter) {
                case 'copyleft':
                    return issue.category === 'copyleft' || issue.category === 'lgpl' ||
                           (issue.license && (issue.license.toLowerCase().includes('gpl') || issue.license.toLowerCase().includes('copyleft')));
                case 'proprietary':
                    return issue.category === 'proprietary' ||
                           (issue.license && issue.license.toLowerCase().includes('proprietary'));
                case 'unknown':
                    return issue.category === 'unknown' || issue.license === 'Unknown' || !issue.license;
                case 'unlicensed':
                    return issue.category === 'unlicensed' || issue.license === 'Unlicensed' || !issue.license;
                default:
                    return true;
            }
        });
    }

    /**
     * Filter tables based on clicked stat card
     */
    async filterHighRiskList(filterType) {
        const container = document.getElementById('license-tables-container');
        if (!container) return;

        // Get current category filter from dropdown
        const categoryFilterDropdown = document.getElementById('categoryFilter');
        const currentCategoryFilter = categoryFilterDropdown?.value === 'all' ? null : categoryFilterDropdown?.value;

        // Check if same card is clicked (toggle filter)
        const activeCard = document.getElementById(`license-card-${filterType}`);
        const isActive = activeCard?.classList.contains('active-filter');
        
        // Get storageManager from global scope
        const storageManager = window.storageManager;
        if (!storageManager) return;

        const orgName = container.getAttribute('data-org-name') || 
                      document.querySelector('#analysisSelector')?.value || '';
        const orgDataName = container.getAttribute('data-org-data-name') || orgName;

        // Load orgData (empty/null means aggregated data)
        let orgData;
        if (!orgDataName || orgDataName === '' || orgDataName === 'All Entries Combined' || orgDataName === 'All Analyses') {
            orgData = await storageManager.getCombinedData();
        } else {
            orgData = await storageManager.loadAnalysisDataForOrganization(orgDataName);
        }

        if (!orgData || !orgData.data) return;

        const allDeps = orgData.data.allDependencies || [];
        const orgParam = (!orgName || orgName === '' || orgName === 'All Entries Combined' || orgName === 'All Analyses') 
            ? '' 
            : orgName;

        // Determine which filter to apply
        let filterCategory = currentCategoryFilter;
        if (filterType === 'total' || isActive) {
            // Show all - use current category filter or none
            filterCategory = currentCategoryFilter;
        } else {
            // Apply filter based on card type
            switch (filterType) {
                case 'copyleft':
                case 'proprietary':
                case 'unknown':
                    filterCategory = filterType;
                    break;
                case 'unlicensed':
                    filterCategory = 'unlicensed';
                    break;
                case 'transitions':
                    filterCategory = null; // Show transitions table
                    break;
            }
        }

        // Regenerate tables with new filter
        // escapeHtml is provided by utils.js

        const createDepsUrl = (packageName, version) => {
            const searchTerm = version ? `${packageName}@${version}` : packageName;
            return `deps.html?org=${encodeURIComponent(orgParam)}&search=${encodeURIComponent(searchTerm)}`;
        };

        // Generate License Types Table
        const licenseTypesData = this.generateLicenseTypesTableData(allDeps, filterCategory, orgData);
        let licenseTypesHTML = '';
        if (licenseTypesData.length > 0) {
            const getRiskBadgeClass = (risk) => {
                switch(risk) {
                    case 'high': return 'bg-danger';
                    case 'medium': return 'bg-warning';
                    case 'low': return 'bg-success';
                    default: return 'bg-secondary';
                }
            };

            const getCategoryBadgeClass = (category) => {
                switch(category) {
                    case 'copyleft': return 'bg-danger';
                    case 'proprietary': return 'bg-warning text-dark';
                    case 'lgpl': return 'bg-info';
                    case 'permissive': return 'bg-success';
                    case 'unknown': return 'bg-warning text-dark';
                    default: return 'bg-secondary text-dark';
                }
            };

            const licenseTypesRows = licenseTypesData.map(licenseData => {
                return `
                <tr>
                    <td>
                        <span class="badge badge-license ${getCategoryBadgeClass(licenseData.category)}">${escapeHtml(licenseData.license)}</span>
                    </td>
                    <td>
                        <span class="badge ${getCategoryBadgeClass(licenseData.category)}">${escapeHtml(licenseData.category)}</span>
                    </td>
                    <td class="text-center">
                        <strong>${licenseData.packageCount}</strong>
                    </td>
                    <td class="text-center">
                        <strong>${licenseData.repositoryCount}</strong>
                    </td>
                    <td>
                        <span class="badge ${getRiskBadgeClass(licenseData.risk)}">${escapeHtml(licenseData.risk)}</span>
                    </td>
                    <td>
                        <a href="deps.html?org=${encodeURIComponent(orgParam)}&license=${encodeURIComponent(licenseData.license)}" class="btn btn-sm btn-outline-primary" target="_blank" title="View all packages with ${escapeHtml(licenseData.license)} license">
                            <i class="fas fa-external-link-alt me-1"></i>View
                        </a>
                    </td>
                </tr>`;
            }).join('');

            licenseTypesHTML = `<div class="license-types-section mb-4" id="license-types-section">
    <h4>📋 License Types</h4>
    <p class="text-muted mb-3">All unique licenses found in dependencies</p>
    <div class="table-responsive">
        <table class="table table-striped table-hover" id="license-types-table">
            <thead>
                <tr>
                    <th>License Name</th>
                    <th>Category</th>
                    <th class="text-center">Packages</th>
                    <th class="text-center">Repositories</th>
                    <th>Risk Level</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${licenseTypesRows}
            </tbody>
        </table>
    </div>
</div>`;
        }

        // Generate Unlicensed Dependencies Table
        const unlicensedData = this.generateUnlicensedTableData(allDeps, orgData);
        let unlicensedHTML = '';
        if (unlicensedData.length > 0) {
            const unlicensedRows = unlicensedData.map(pkg => {
                return `
                <tr>
                    <td>
                        <a href="${createDepsUrl(pkg.name, null)}" class="dependency-link" target="_blank">
                            <code>${escapeHtml(pkg.name)}</code>
                        </a>
                    </td>
                    <td class="text-center">
                        <strong>${pkg.repositoryCount}</strong>
                    </td>
                    <td class="text-center">
                        <strong>${pkg.versionCount}</strong>
                    </td>
                </tr>`;
            }).join('');

            unlicensedHTML = `<div class="unlicensed-section mb-4" id="unlicensed-section">
    <h4>🚨 Unlicensed Dependencies</h4>
    <p class="text-muted mb-3">Dependencies without license information</p>
    <div class="table-responsive">
        <table class="table table-striped table-hover" id="unlicensed-table">
            <thead>
                <tr>
                    <th>Dependency</th>
                    <th class="text-center">Used by Repos</th>
                    <th class="text-center">Version Count</th>
                </tr>
            </thead>
            <tbody>
                ${unlicensedRows}
            </tbody>
        </table>
    </div>
</div>`;
        }

        // Generate License Changes Table
        const allLicenseTransitions = this.processAllDependenciesForLicenseChanges(allDeps, orgData);
        let licenseChangesHTML = '';
        if (allLicenseTransitions.length > 0) {
            const transitionRows = allLicenseTransitions.map(transition => {
                const repoCount = transition.repositories ? transition.repositories.length : 0;
                return `
                <tr>
                    <td>
                        <a href="${createDepsUrl(transition.packageName, null)}" class="dependency-link" target="_blank">
                            <code>${escapeHtml(transition.packageName)}</code>
                        </a>
                    </td>
                    <td>
                        <a href="${createDepsUrl(transition.packageName, transition.fromVersion)}" class="text-decoration-none" target="_blank">
                            <code>${escapeHtml(transition.fromVersion)}</code>
                        </a>
                        <span class="badge badge-license ms-2">${escapeHtml(transition.fromLicense)}</span>
                    </td>
                    <td>
                        <a href="${createDepsUrl(transition.packageName, transition.toVersion)}" class="text-decoration-none" target="_blank">
                            <code>${escapeHtml(transition.toVersion)}</code>
                        </a>
                        <span class="badge badge-license ms-2">${escapeHtml(transition.toLicense)}</span>
                    </td>
                    <td class="text-center">
                        <strong>${repoCount}</strong>
                    </td>
                </tr>`;
            }).join('');

            licenseChangesHTML = `<div class="license-changes-section mb-4" id="license-changes-section">
    <h4>🔄 License Changes Detected</h4>
    <p class="text-muted mb-3">All license changes across all dependencies (not just high-risk)</p>
    <div class="table-responsive">
        <table class="table table-striped table-hover" id="license-changes-table">
            <thead>
                <tr>
                    <th>Dependency</th>
                    <th>Version 1 @ License 1</th>
                    <th>Version 2 @ License 2</th>
                    <th class="text-center">Repositories</th>
                </tr>
            </thead>
            <tbody>
                ${transitionRows}
            </tbody>
        </table>
    </div>
</div>`;
        }

        // Update container with new HTML
        container.innerHTML = licenseTypesHTML + unlicensedHTML + licenseChangesHTML;

        // Show/hide sections based on filter type (get elements after innerHTML update)
        const licenseTypesSection = document.getElementById('license-types-section');
        const unlicensedSection = document.getElementById('unlicensed-section');
        const licenseChangesSection = document.getElementById('license-changes-section');

        if (filterType === 'unlicensed') {
            if (licenseTypesSection) licenseTypesSection.style.display = 'none';
            if (licenseChangesSection) licenseChangesSection.style.display = 'none';
            if (unlicensedSection) unlicensedSection.style.display = 'block';
        } else if (filterType === 'transitions') {
            if (licenseTypesSection) licenseTypesSection.style.display = 'none';
            if (unlicensedSection) unlicensedSection.style.display = 'none';
            if (licenseChangesSection) licenseChangesSection.style.display = 'block';
        } else {
            // Show all tables for other filters (total, copyleft, proprietary, unknown)
            if (licenseTypesSection) licenseTypesSection.style.display = 'block';
            if (unlicensedSection && unlicensedData.length > 0) unlicensedSection.style.display = 'block';
            if (licenseChangesSection && allLicenseTransitions.length > 0) licenseChangesSection.style.display = 'block';
        }

        // Update active filter state on cards
        document.querySelectorAll('.license-stat-card').forEach(card => {
            card.classList.remove('active-filter');
        });
        const isFiltering = filterType !== 'total' && !isActive;
        if (activeCard && isFiltering) {
            activeCard.classList.add('active-filter');
        }
    }


    async generateDependencyOverviewHTML(orgData) {
        // Extracted from generateOverviewHTML: stats, category breakdown, language stats, top deps, all deps
        const stats = orgData.data.statistics || {};
        const topDeps = orgData.data.topDependencies || [];
        const allDeps = orgData.data.allDependencies || [];
        const categoryStats = orgData.data.categoryStats;
        const languageStats = orgData.data.languageStats;
        const isCombinedView = orgData.organization === 'All Organizations Combined';
        const orgName = orgData.organization || orgData.name;
        
        // escapeHtml is provided by utils.js
        
        // Prepare category cards
        const categoryCards = [];
        if (categoryStats) {
            const categories = ['code', 'workflow', 'infrastructure', 'unknown'];
            const titles = {
                'code': '💻 Code Dependencies',
                'workflow': '⚙️ Workflow Dependencies',
                'infrastructure': '🏗️ Infrastructure Dependencies',
                'unknown': '❓ Unknown Dependencies'
            };
            
            categories.forEach(type => {
                const cat = categoryStats[type];
                const count = isCombinedView 
                    ? (parseInt(cat) || 0)
                    : (typeof cat === 'object' ? (cat.count || 0) : (cat || 0));
                const unique = isCombinedView 
                    ? 'N/A'
                    : (typeof cat === 'object' ? (cat.uniqueDependencies || 0) : 'N/A');
                
                categoryCards.push({
                    type: type,
                    title: titles[type],
                    count: count,
                    unique: unique
                });
            });
        }
        
        // Prepare language cards
        const languageCards = [];
        if (languageStats) {
            if (Array.isArray(languageStats)) {
                languageStats.slice(0, 6).forEach(lang => {
                    languageCards.push({
                        language: lang.language,
                        count: lang.count,
                        uniqueDeps: lang.uniqueDependencies || 'N/A'
                    });
                });
            } else {
                Object.entries(languageStats).slice(0, 6).forEach(([lang, count]) => {
                    languageCards.push({
                        language: lang,
                        count: count,
                        uniqueDeps: 'N/A'
                    });
                });
            }
        }
        
        // Prepare top dependencies
        const topDepsForTemplate = topDeps.slice(0, 12).map((dep, index) => ({
            name: dep.name || 'Unknown',
            version: dep.version || 'Unknown',
            count: dep.count || 0,
            categoryType: dep.category?.type || 'unknown',
            organization: orgName,
            index: index,
            showQuickScan: !orgData.data.vulnerabilityAnalysis
        }));
        
        // Prepare all dependencies
        const allDepsForTemplate = allDeps.map((dep, index) => ({
            name: dep.name || 'Unknown',
            version: dep.version || 'Unknown',
            count: dep.count || 0,
            categoryType: dep.category?.type || 'unknown',
            organization: orgName,
            index: index,
            showQuickScan: !orgData.data.vulnerabilityAnalysis
        }));
        
        // Generate stats grid HTML
        const statsGridHTML = `<div class="stats-grid">
    <div class="stat-card">
        <h3>📁 Repositories</h3>
        <div class="stat-number">${stats.totalRepositories || 0}</div>
        <div class="stat-detail">${stats.processedRepositories || 0} processed</div>
    </div>
    <div class="stat-card">
        <h3>📦 Dependencies</h3>
        <div class="stat-number">${stats.totalDependencies || 0}</div>
        <div class="stat-detail">${stats.averageDependenciesPerRepo || 0} avg per repo</div>
    </div>
    <div class="stat-card">
        <h3>✅ Success Rate</h3>
        <div class="stat-number">${stats.successfulRepositories || 0}</div>
        <div class="stat-detail">${stats.failedRepositories || 0} failed</div>
    </div>
</div>`;

        // Generate category breakdown HTML
        let categoryHTML = '';
        if (categoryStats) {
            const categoryCardsHTML = categoryCards.map(card => `
        <div class="category-card ${card.type}">
            <h4>${escapeHtml(card.title)}</h4>
            <div class="category-number">${card.count}</div>
            <div class="category-detail">${escapeHtml(String(card.unique))} unique</div>
        </div>`).join('');
            
            categoryHTML = `<div class="category-breakdown">
    <h3>📊 Dependency Categories</h3>
    <div class="category-grid">
        ${categoryCardsHTML}
    </div>
</div>`;
        }

        // Generate language breakdown HTML
        let languageHTML = '';
        if (languageStats) {
            const languageCardsHTML = languageCards.map(card => `
        <div class="language-card">
            <h4>${escapeHtml(card.language)}</h4>
            <div class="language-number">${card.count}</div>
            <div class="language-detail">${escapeHtml(String(card.uniqueDeps))} unique deps</div>
        </div>`).join('');
            
            languageHTML = `<div class="language-breakdown">
    <h3>🌐 Programming Languages</h3>
    <div class="language-grid">
        ${languageCardsHTML}
    </div>
</div>`;
        }

        // Generate top dependencies HTML
        const topDepsHTML = topDepsForTemplate.length > 0 
            ? topDepsForTemplate.map(dep => `
            <div class="dependency-item ${dep.categoryType}">
                <div class="dep-content" onclick="viewManager.showDependencyDetailsFromIndex(${dep.index}, '${escapeJsString(escapeHtml(orgName))}')">
                    <div class="dep-name">${escapeHtml(dep.name)}</div>
                    <div class="dep-version">${escapeHtml(dep.version)}</div>
                    <div class="dep-count">${dep.count} repos</div>
                    <div class="dep-category">${escapeHtml(dep.categoryType)}</div>
                </div>
                <div class="dep-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="viewManager.queryVulnerabilityForDependency('${escapeJsString(escapeHtml(dep.name))}', '${escapeJsString(escapeHtml(dep.version))}', '${escapeJsString(escapeHtml(orgName))}'))" title="Query vulnerabilities">
                        <i class="fas fa-shield-alt"></i>
                    </button>
                    ${dep.showQuickScan ? `<button class="btn btn-sm btn-outline-success" onclick="viewManager.quickScanDependency('${escapeJsString(escapeHtml(dep.name))}', '${escapeJsString(escapeHtml(dep.version))}', '${escapeJsString(escapeHtml(orgName))}')" title="Quick scan for vulnerabilities">
                        <i class="fas fa-bolt"></i>
                    </button>` : ''}
                </div>
            </div>`).join('')
            : '<p class="text-muted">No dependencies found</p>';

        const topDependenciesSection = `<div class="view-sections">
    <div class="section">
        <h3>🏆 Top Dependencies (${topDeps.length})</h3>
        <div class="filter-buttons">
            <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('all')">All</button>
            <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('code')">Code</button>
            <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('workflow')">Workflow</button>
            <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('infrastructure')">Infrastructure</button>
        </div>
        <div class="dependency-grid" id="top-dependencies">
            ${topDepsHTML}
        </div>
    </div>
</div>`;

        // Generate all dependencies HTML
        let allDependenciesSection = '';
        if (allDepsForTemplate.length > 0) {
            const allDepsHTML = allDepsForTemplate.map(dep => `
        <div class="dependency-card ${dep.categoryType}">
            <div class="dep-content" onclick="viewManager.showDependencyDetailsFromAllDepsIndex(${dep.index}, '${escapeJsString(escapeHtml(orgName))}')">
                <div class="dep-name">${escapeHtml(dep.name)}</div>
                <div class="dep-version">${escapeHtml(dep.version)}</div>
                <div class="dep-count">${dep.count} repos</div>
                <div class="dep-category">${escapeHtml(dep.categoryType)}</div>
            </div>
            <div class="dep-actions">
                <button class="btn btn-sm btn-outline-primary" onclick="viewManager.queryVulnerabilityForDependency('${escapeJsString(escapeHtml(dep.name))}', '${escapeJsString(escapeHtml(dep.version))}', '${escapeJsString(escapeHtml(orgName))}'))" title="Query vulnerabilities">
                    <i class="fas fa-shield-alt"></i>
                </button>
                ${dep.showQuickScan ? `<button class="btn btn-sm btn-outline-success" onclick="viewManager.quickScanDependency('${escapeJsString(escapeHtml(dep.name))}', '${escapeJsString(escapeHtml(dep.version))}', '${escapeJsString(escapeHtml(orgName))}')" title="Quick scan for vulnerabilities">
                    <i class="fas fa-bolt"></i>
                </button>` : ''}
            </div>
        </div>`).join('');
            
            allDependenciesSection = `<div class="all-dependencies">
    <h3>📊 All Dependencies (${allDeps.length})</h3>
    <div class="search-box">
        <input type="text" id="dep-search" placeholder="Search dependencies..." onkeyup="viewManager.filterDependencies()">
    </div>
    <div class="filter-buttons">
        <button class="btn btn-outline-primary btn-sm" onclick="viewManager.filterDependenciesByCategory('all')">All</button>
        <button class="btn btn-outline-primary btn-sm" onclick="viewManager.filterDependenciesByCategory('code')">Code</button>
        <button class="btn btn-outline-primary btn-sm" onclick="viewManager.filterDependenciesByCategory('workflow')">Workflow</button>
        <button class="btn btn-outline-primary btn-sm" onclick="viewManager.filterDependenciesByCategory('infrastructure')">Infrastructure</button>
        <button class="btn btn-outline-primary btn-sm" onclick="viewManager.filterDependenciesByCategory('unknown')">Unknown</button>
    </div>
    <div class="dependency-grid" id="all-dependencies">
        ${allDepsHTML}
    </div>
</div>`;
        }
        
        return statsGridHTML + categoryHTML + languageHTML + topDependenciesSection + allDependenciesSection;
    }

    /**
     * Build dependency path for a transitive dependency
     */
    buildDependencyPath(repo, targetDep, allDependencies) {
        // Use shared normalizeVersion utility if available, otherwise inline fallback
        const normalizeVersion = window.normalizeVersion || ((version) => {
            if (!version) return '';
            return version.trim()
                .replace(/^[><=^~]+\s*/, '')
                .replace(/\s+-\s+[\d.]+.*$/, '')  // Only remove ranges with spaces around dash
                .replace(/\s*\|\|.*$/, '')
                .replace(/\s+/g, '');
        });

        // Build SPDXID to package mapping
        const spdxToPackage = new Map();
        if (repo.spdxPackages) {
            repo.spdxPackages.forEach(pkg => {
                if (pkg.SPDXID && pkg.name) {
                    const normalizedVersion = normalizeVersion(pkg.version || '');
                    spdxToPackage.set(pkg.SPDXID, {
                        name: pkg.name,
                        version: normalizedVersion,
                        key: `${pkg.name}@${normalizedVersion}`
                    });
                }
            });
        }

        const targetKey = `${targetDep.name}@${targetDep.version}`;
        
        // Find the SPDXID for the target dependency
        let targetSpdxId = null;
        for (const [spdxId, pkg] of spdxToPackage.entries()) {
            if (pkg.key === targetKey) {
                targetSpdxId = spdxId;
                break;
            }
        }

        if (!targetSpdxId || !repo.relationships) {
            return null;
        }

        // Build reverse relationship map (child -> parent)
        const parentMap = new Map();
        repo.relationships.forEach(rel => {
            if (!rel.isDirectFromMain && rel.to === targetSpdxId) {
                parentMap.set(targetSpdxId, rel.from);
            }
        });

        // If it's a direct dependency, return early
        const isDirect = repo.relationships.some(rel => 
            rel.to === targetSpdxId && rel.isDirectFromMain
        );
        if (isDirect) {
            return {
                isDirect: true,
                path: [targetKey],
                repoKey: `${repo.owner}/${repo.name}`
            };
        }

        // Trace back through parent dependencies
        const path = [];
        let currentSpdxId = targetSpdxId;
        const visited = new Set();

        while (currentSpdxId && !visited.has(currentSpdxId)) {
            visited.add(currentSpdxId);
            const pkg = spdxToPackage.get(currentSpdxId);
            if (pkg) {
                path.unshift(pkg.key); // Add to front
            }

            // Find parent
            const parentRel = repo.relationships.find(rel => 
                rel.to === currentSpdxId && !rel.isDirectFromMain
            );
            
            if (parentRel) {
                currentSpdxId = parentRel.from;
            } else {
                // Check if current is a direct dependency
                const directRel = repo.relationships.find(rel => 
                    rel.to === currentSpdxId && rel.isDirectFromMain
                );
                if (directRel) {
                    break; // Reached root
                }
                currentSpdxId = null;
            }
        }

        return {
            isDirect: false,
            path: path,
            repoKey: `${repo.owner}/${repo.name}`
        };
    }

    /**
     * Get repository usage and paths for a vulnerable dependency
     */
    getVulnerableDepUsage(vulnDep, orgData) {
        const allDeps = orgData.data.allDependencies || [];
        const repos = orgData.data.allRepositories || [];
        
        // Find the dependency in allDependencies
        // Try exact match first, then try matching by displayVersion or assumedVersion
        // This handles cases where vulnerability analysis used dep.version but exportData used displayVersion
        let fullDep = allDeps.find(d => 
            d.name === vulnDep.name && d.version === vulnDep.version
        );
        
        // If not found, try matching by displayVersion or assumedVersion
        if (!fullDep) {
            fullDep = allDeps.find(d => 
                d.name === vulnDep.name && (
                    d.displayVersion === vulnDep.version ||
                    d.assumedVersion === vulnDep.version ||
                    d.version === vulnDep.version
                )
            );
        }
        
        // If still not found, try fuzzy matching (normalize versions)
        if (!fullDep && window.normalizeVersion) {
            const normalizedVulnVersion = window.normalizeVersion(vulnDep.version);
            fullDep = allDeps.find(d => {
                if (d.name !== vulnDep.name) return false;
                const normalizedDepVersion = window.normalizeVersion(d.version || '');
                const normalizedDisplayVersion = window.normalizeVersion(d.displayVersion || '');
                return normalizedDepVersion === normalizedVulnVersion || 
                       normalizedDisplayVersion === normalizedVulnVersion;
            });
        }

        if (!fullDep) {
            console.warn(`⚠️ Could not find dependency ${vulnDep.name}@${vulnDep.version} in allDependencies for repository usage`);
            return [];
        }

        const usage = [];
        const repoKeys = fullDep.repositories || [];
        
        // If no repositories found, this is a data integrity issue
        if (repoKeys.length === 0) {
            console.warn(`⚠️ Dependency ${vulnDep.name}@${vulnDep.version} found but has no repositories linked`);
            return [];
        }

        repoKeys.forEach(repoKey => {
            const repo = repos.find(r => `${r.owner}/${r.name}` === repoKey);
            if (!repo) {
                console.warn(`⚠️ Repository ${repoKey} not found in allRepositories for dependency ${vulnDep.name}@${vulnDep.version}`);
                return;
            }

            const pathInfo = this.buildDependencyPath(repo, vulnDep, allDeps);
            if (pathInfo) {
                // Add repository archived status
                pathInfo.isArchived = repo.archived || false;
                usage.push(pathInfo);
            }
        });

        return usage;
    }

    async generateVulnerabilityAnalysisHTML(orgData, severityFilter = null, limit = 25, offset = 0) {
        const vulnAnalysis = orgData.data.vulnerabilityAnalysis;
        const orgName = orgData.organization || orgData.name;
        
        // Check for severity filter from URL parameter if not provided
        if (!severityFilter) {
            const urlParams = new URLSearchParams(window.location.search);
            severityFilter = urlParams.get('severity')?.toUpperCase();
        }
        
        // escapeHtml is provided by utils.js
        
        // Pre-process vulnerable dependencies with usage info
        let vulnerableDepsHTML = '';
        if (vulnAnalysis && vulnAnalysis.vulnerableDependencies) {
            let vulnerableDeps = vulnAnalysis.vulnerableDependencies || [];
            
            // Filter by severity if parameter is present
            if (severityFilter) {
                vulnerableDeps = vulnerableDeps.filter(dep => {
                    if (!dep.vulnerabilities || !Array.isArray(dep.vulnerabilities)) return false;
                    return dep.vulnerabilities.some(vuln => {
                        if (!vuln || typeof vuln !== 'object') return false;
                        const severity = window.osvService ? window.osvService.getHighestSeverity(vuln) : 'UNKNOWN';
                        return severity === severityFilter;
                    });
                });
            }
            
            const processedDeps = [];
            
            // Store total count before slicing
            const totalCount = vulnerableDeps.length;
            
            // Apply pagination: slice based on offset and limit
            const paginatedDeps = vulnerableDeps.slice(offset, offset + limit);
            const hasMore = offset + limit < totalCount;
            
            // Process dependencies sequentially to handle async version drift lookups
            for (const dep of paginatedDeps) {
                const usage = this.getVulnerableDepUsage(dep, orgData);
                const uniqueRepos = [...new Set(usage.map(u => u.repoKey))];
                
                // Prepare vulnerabilities for template
                // Filter by severity if filter is active
                let depVulnerabilities = (dep.vulnerabilities || []).filter(v => v && typeof v === 'object');
                if (severityFilter) {
                    depVulnerabilities = depVulnerabilities.filter(vuln => {
                        const severity = window.osvService ? window.osvService.getHighestSeverity(vuln) : 'UNKNOWN';
                        return severity === severityFilter;
                    });
                }
                
                const vulnerabilities = depVulnerabilities.map(vuln => {
                    const severity = window.osvService ? window.osvService.getHighestSeverity(vuln) : 'UNKNOWN';
                    const tooltip = `${vuln.id || 'Unknown ID'}\n${vuln.summary || 'No summary'}`;
                    const cssSeverity = severity.toLowerCase() === 'moderate' ? 'medium' : severity.toLowerCase();
                    return {
                        severity: severity,
                        cssSeverity: cssSeverity,
                        tooltip: tooltip,
                        vulnJson: JSON.stringify(vuln).replace(/"/g, '&quot;')
                    };
                });
                
                // Skip this dependency if no vulnerabilities match the filter
                if (severityFilter && vulnerabilities.length === 0) {
                    continue;
                }
                
                // Get version drift information - try from vulnerable dependency first, then from allDependencies, then from cache
                let versionDrift = dep.versionDrift || null;
                
                // Fallback: Find the full dependency to get version drift data if not on vulnerable dep
                let fullDep = null;
                if (!versionDrift) {
                    fullDep = orgData.data.allDependencies?.find(d => 
                        d.name === dep.name && d.version === dep.version
                    );
                    versionDrift = fullDep?.versionDrift || null;
                }
                
                // If still not found, try to get from cache (async)
                if (!versionDrift && window.VersionDriftAnalyzer) {
                    const depForLookup = fullDep || dep;
                    const ecosystemValue = depForLookup.category?.ecosystem || depForLookup.ecosystem;
                    if (ecosystemValue && depForLookup.name && depForLookup.version) {
                        try {
                            let ecosystem = ecosystemValue.toLowerCase();
                            // Normalize ecosystem aliases
                            if (ecosystem === 'rubygems' || ecosystem === 'gem') {
                                ecosystem = 'gem';
                            } else if (ecosystem === 'go' || ecosystem === 'golang') {
                                ecosystem = 'golang';
                            } else if (ecosystem === 'packagist' || ecosystem === 'composer') {
                                ecosystem = 'composer';
                            }
                            const packageKey = `${ecosystem}:${depForLookup.name}`;
                            const versionDriftAnalyzer = new window.VersionDriftAnalyzer();
                            versionDrift = await versionDriftAnalyzer.getVersionDriftFromCache(packageKey, depForLookup.version);
                        } catch (e) {
                            console.debug('Failed to get version drift from cache:', e);
                        }
                    }
                }
                
                const hasMajorUpdate = versionDrift?.hasMajorUpdate || false;
                const hasMinorUpdate = versionDrift?.hasMinorUpdate || false;
                const latestVersion = versionDrift?.latestVersion || null;
                
                // Prepare usage paths with repository info
                const usageForTemplate = usage.map(u => ({
                    repoKey: u.repoKey,
                    pathStr: u.isDirect ? u.path[0] : u.path.join(' → '),
                    isArchived: u.isArchived || false
                }));
                
                processedDeps.push({
                    name: dep.name || 'Unknown',
                    version: dep.version || 'Unknown',
                    vulnerabilityCount: vulnerabilities.length, // Use filtered count
                    vulnerabilityPlural: vulnerabilities.length !== 1 ? 'ies' : 'y',
                    vulnerabilities: vulnerabilities,
                    depName: dep.name,
                    depVersion: dep.version,
                    hasUsage: usage.length > 0,
                    uniqueReposCount: uniqueRepos.length,
                    reposPlural: uniqueRepos.length !== 1 ? 'ies' : 'y',
                    reposWord: uniqueRepos.length !== 1 ? 'repositories' : 'repository',
                    usage: usageForTemplate,
                    allVulnsJson: JSON.stringify(depVulnerabilities).replace(/"/g, '&quot;'), // Use filtered vulnerabilities
                    hasMajorUpdate: hasMajorUpdate,
                    hasMinorUpdate: hasMinorUpdate,
                    latestVersion: latestVersion
                });
            }
            
            if (processedDeps.length > 0) {
                // Render each dependency item inline
                const depItems = processedDeps.map(depData => {
                    // Build version upgrade badges (inline with package name)
                    // Show both major and minor badges if both are available
                    const versionBadges = [];
                    if (depData.hasMajorUpdate && depData.latestVersion) {
                        versionBadges.push(`<span class="badge bg-danger ms-2" title="Major version upgrade available"><i class="fas fa-arrow-up me-1"></i>Major: ${escapeHtml(depData.latestVersion)}</span>`);
                    }
                    if (depData.hasMinorUpdate && depData.latestVersion) {
                        versionBadges.push(`<span class="badge bg-warning text-dark ms-2" title="Minor version upgrade available"><i class="fas fa-arrow-up me-1"></i>Minor: ${escapeHtml(depData.latestVersion)}</span>`);
                    }
                    const versionBadgesHTML = versionBadges.join('');
                    
                    const usageHTML = depData.hasUsage 
                        ? `<div class="vuln-repo-usage mt-3 p-2 bg-light rounded">
            <small class="text-muted d-block mb-2">
                <i class="fas fa-code-branch me-1"></i>
                <strong>Used in ${depData.uniqueReposCount} ${depData.reposWord}:</strong>
            </small>
            <div class="vuln-paths" style="font-size: 0.85em;">
                ${depData.usage.map(u => {
                    const archivedBadge = u.isArchived ? '<span class="badge bg-secondary ms-1" title="Archived Repository"><i class="fas fa-archive"></i> Archived</span>' : '';
                    return `
                <div class="mb-2" style="padding-left: 10px;">
                    <code class="text-primary fw-bold">${escapeHtml(u.repoKey)}</code>${archivedBadge}: <code>${escapeHtml(u.pathStr)}</code>
                </div>`;
                }).join('')}
            </div>
        </div>`
                        : `<div class="mt-2">
            <small class="text-muted">
                <i class="fas fa-info-circle me-1"></i>Repository usage information not available
            </small>
        </div>`;
                    
                    return `<div class="vulnerable-dep-item mb-3" style="border-left: 3px solid #dc3545; padding-left: 15px;">
    <div class="vuln-dep-info">
        <div class="vuln-dep-name d-flex align-items-center flex-wrap" style="font-weight: bold; font-size: 1.1em;">
            <span>${escapeHtml(depData.name)}@${escapeHtml(depData.version)}</span>${versionBadgesHTML}
        </div>
        <div class="vuln-dep-count mb-2">${depData.vulnerabilityCount} ${depData.vulnerabilityCount !== 1 ? 'vulnerabilities' : 'vulnerability'}</div>
        <div class="vuln-severity-badges mb-2">
            ${depData.vulnerabilities.map(vuln => `
            <span class="badge severity-${vuln.cssSeverity} clickable-severity-badge me-1" 
                  title="${escapeHtml(vuln.tooltip)}" 
                  onclick="viewManager.showVulnerabilityDetails('${escapeJsString(escapeHtml(depData.depName))}', '${escapeJsString(escapeHtml(depData.depVersion))}', [${vuln.vulnJson}])">
                ${escapeHtml(vuln.severity)}
            </span>`).join('')}
        </div>
        ${usageHTML}
    </div>
    <div class="vuln-dep-actions mt-2">
        <button class="btn btn-sm btn-outline-info" onclick="viewManager.showVulnerabilityDetails('${escapeJsString(escapeHtml(depData.name))}', '${escapeJsString(escapeHtml(depData.version))}', ${depData.allVulnsJson})">
            <i class="fas fa-eye me-1"></i>View Details
        </button>
    </div>
</div>`;
                });
                
                // Add load more button if there are more items
                // Use empty string for aggregated data, otherwise use orgName
                const loadMoreIdentifier = (!orgName || orgName === '' || orgName === 'All Entries Combined' || orgName === 'All Analyses') ? '' : orgName;
                const remainingCount = totalCount - (offset + limit);
                const loadMoreHTML = hasMore ? `
                    <div class="text-center mt-3">
                        <button class="btn btn-primary" onclick="viewManager.loadMoreVulnerabilities('${escapeJsString(escapeHtml(loadMoreIdentifier))}', '${severityFilter || ''}', ${offset + limit}, ${remainingCount})">
                            <i class="fas fa-list me-2"></i>Show All Remaining (${remainingCount})
                        </button>
                    </div>
                ` : '';
                
                vulnerableDepsHTML = `
                <div class="vulnerable-dependencies">
                    <h4>🚨 Vulnerable Dependencies <small class="text-muted">(${Math.min(offset + limit, totalCount)} of ${totalCount})</small></h4>
                    <div class="vulnerable-deps-list" id="vulnerable-deps-list">
                        ${depItems.join('')}
                    </div>
                    ${loadMoreHTML}
                </div>
                `;
            }
        }

        // Generate vulnerability section HTML
        if (vulnAnalysis) {
            // Show filter notice if severity filter is active
            const filterNotice = severityFilter ? `
        <div class="alert alert-info alert-dismissible fade show mb-3">
            <i class="fas fa-filter me-2"></i>
            <strong>Severity Filter Active:</strong> Showing only ${severityFilter} severity vulnerabilities.
            <a href="vuln.html" class="btn btn-sm btn-outline-primary ms-2">
                <i class="fas fa-times me-1"></i>Clear Filter
            </a>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
            ` : '';
            
            return `<div id="vulnerability-section" class="independent-section">
    <div class="vulnerability-breakdown">
        <h3>🔒 Vulnerability Analysis</h3>
        ${filterNotice}
        <div class="vulnerability-actions mb-3">
            <button class="btn btn-primary btn-sm" onclick="viewManager.runBatchVulnerabilityQuery('${escapeJsString(escapeHtml(orgName))}')">
                <i class="fas fa-search"></i> Re-run Batch Vulnerability Query
            </button>
            <button class="btn btn-info btn-sm" onclick="viewManager.showVulnerabilityCacheStats()">
                <i class="fas fa-database"></i> Cache Stats
            </button>
            <button class="btn btn-warning btn-sm" onclick="viewManager.clearVulnerabilityCache()">
                <i class="fas fa-trash"></i> Clear Cache
            </button>
        </div>
        <div class="vulnerability-stats">
            <div class="vuln-stat-card critical">
                <h4>🚨 Critical</h4>
                <div class="vuln-number">${vulnAnalysis.criticalVulnerabilities || 0}</div>
                <div class="vuln-detail">vulnerabilities</div>
            </div>
            <div class="vuln-stat-card high">
                <h4>⚠️ High</h4>
                <div class="vuln-number">${vulnAnalysis.highVulnerabilities || 0}</div>
                <div class="vuln-detail">vulnerabilities</div>
            </div>
            <div class="vuln-stat-card medium">
                <h4>⚡ Medium</h4>
                <div class="vuln-number">${vulnAnalysis.mediumVulnerabilities || 0}</div>
                <div class="vuln-detail">vulnerabilities</div>
            </div>
            <div class="vuln-stat-card low">
                <h4>ℹ️ Low</h4>
                <div class="vuln-number">${vulnAnalysis.lowVulnerabilities || 0}</div>
                <div class="vuln-detail">vulnerabilities</div>
            </div>
            <div class="vuln-stat-card total">
                <h4>📊 Total</h4>
                <div class="vuln-number">${vulnAnalysis.vulnerablePackages || 0}</div>
                <div class="vuln-detail">vulnerable packages</div>
            </div>
        </div>
        ${vulnerableDepsHTML}
    </div>
</div>`;
        } else {
            // Show empty stats (0 vulnerabilities) instead of "No Analysis Yet" message
            return `<div id="vulnerability-section" class="independent-section">
    <div class="vulnerability-breakdown">
        <h3>🔒 Vulnerability Analysis</h3>
        <div class="vulnerability-actions mb-3">
            <button class="btn btn-primary btn-sm" onclick="viewManager.runBatchVulnerabilityQuery('${escapeJsString(escapeHtml(orgName))}')">
                <i class="fas fa-search"></i> Run Vulnerability Analysis
            </button>
            <button class="btn btn-info btn-sm" onclick="viewManager.showVulnerabilityCacheStats()">
                <i class="fas fa-database"></i> Cache Stats
            </button>
            <button class="btn btn-warning btn-sm" onclick="viewManager.clearVulnerabilityCache()">
                <i class="fas fa-trash"></i> Clear Cache
            </button>
        </div>
        <div class="vulnerability-stats">
            <div class="vuln-stat-card critical">
                <h4>🚨 Critical</h4>
                <div class="vuln-number">0</div>
                <div class="vuln-detail">vulnerabilities</div>
            </div>
            <div class="vuln-stat-card high">
                <h4>⚠️ High</h4>
                <div class="vuln-number">0</div>
                <div class="vuln-detail">vulnerabilities</div>
            </div>
            <div class="vuln-stat-card medium">
                <h4>🔶 Medium</h4>
                <div class="vuln-number">0</div>
                <div class="vuln-detail">vulnerabilities</div>
            </div>
            <div class="vuln-stat-card low">
                <h4>ℹ️ Low</h4>
                <div class="vuln-number">0</div>
                <div class="vuln-detail">vulnerabilities</div>
            </div>
            <div class="vuln-stat-card packages">
                <h4>📦 Packages</h4>
                <div class="vuln-number">0</div>
                <div class="vuln-detail">vulnerable packages</div>
            </div>
        </div>
    </div>
</div>`;
        }
    }

    /**
     * Generate audit findings card HTML
     */
    generateAuditFindingsCard(orgData) {
        // Standardized access pattern: githubActionsAnalysis is always at orgData.data.githubActionsAnalysis
        const githubActionsAnalysis = orgData?.data?.githubActionsAnalysis;
        
        if (!githubActionsAnalysis || !githubActionsAnalysis.findings || githubActionsAnalysis.findings.length === 0) {
            return `<div class="vuln-stat-card audit-findings">
                <h4>🔍 Audit Findings</h4>
                <div class="vuln-number">0</div>
                <div class="vuln-detail">findings</div>
            </div>`;
        }

        const findings = githubActionsAnalysis.findings;
        const findingsBySeverity = {
            high: findings.filter(f => f.severity === 'high' || f.severity === 'error').length,
            medium: findings.filter(f => f.severity === 'medium').length,
            warning: findings.filter(f => f.severity === 'warning').length
        };
        const totalFindings = findings.length;

        return `<div class="vuln-stat-card audit-findings" style="cursor: pointer;" onclick="viewManager.scrollToAuditFindings()">
            <h4>🔍 Audit Findings</h4>
            <div class="vuln-number">${totalFindings}</div>
            <div class="vuln-detail">total findings</div>
            <div class="mt-2" style="font-size: 0.75rem; color: var(--text-secondary, #6c757d);">
                <div>High: ${findingsBySeverity.high}</div>
                <div>Medium: ${findingsBySeverity.medium}</div>
                <div>Warning: ${findingsBySeverity.warning}</div>
            </div>
        </div>`;
    }

    /**
     * Generate audit findings section HTML
     */
    generateAuditFindingsSection(orgData) {
        // Standardized access pattern: githubActionsAnalysis is always at orgData.data.githubActionsAnalysis
        const githubActionsAnalysis = orgData?.data?.githubActionsAnalysis;
        
        if (!githubActionsAnalysis || !githubActionsAnalysis.findings || githubActionsAnalysis.findings.length === 0) {
            return '';
        }

        const findings = githubActionsAnalysis.findings;
        const findingsByType = githubActionsAnalysis.findingsByType || {};
        
        // Group findings by type
        const findingsByTypeMap = new Map();
        findings.forEach(finding => {
            const ruleId = finding.rule_id;
            if (!findingsByTypeMap.has(ruleId)) {
                findingsByTypeMap.set(ruleId, []);
            }
            findingsByTypeMap.get(ruleId).push(finding);
        });

        // Sort by count (descending)
        const sortedTypes = Array.from(findingsByTypeMap.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 10); // Top 10

        // Generate findings HTML
        let findingsHTML = '<div id="audit-findings-section" class="mt-4">';
        findingsHTML += '<h3 class="mb-3">🔍 GitHub Actions Audit Findings</h3>';
        
        // Summary
        findingsHTML += `<div class="card mb-3">
            <div class="card-body">
                <h5>Summary</h5>
                <p>Found <strong>${findings.length}</strong> audit findings across <strong>${githubActionsAnalysis.uniqueActions || 0}</strong> GitHub Actions.</p>
                <div class="row">
                    <div class="col-md-4">
                        <strong>High Severity:</strong> ${findings.filter(f => f.severity === 'high' || f.severity === 'error').length}
                    </div>
                    <div class="col-md-4">
                        <strong>Medium Severity:</strong> ${findings.filter(f => f.severity === 'medium').length}
                    </div>
                    <div class="col-md-4">
                        <strong>Warning:</strong> ${findings.filter(f => f.severity === 'warning').length}
                    </div>
                </div>
            </div>
        </div>`;

        // Findings by type
        findingsHTML += '<div class="card mb-3"><div class="card-body"><h5>Findings by Type</h5><ul class="list-group">';
        sortedTypes.forEach(([ruleId, typeFindings]) => {
            const severity = typeFindings[0].severity;
            const severityClass = severity === 'high' || severity === 'error' ? 'danger' : 
                                 severity === 'medium' ? 'warning' : 'info';
            findingsHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">
                <span><span class="badge bg-${severityClass} me-2">${severity}</span>${this.getFindingName(ruleId)}</span>
                <span class="badge bg-primary rounded-pill">${typeFindings.length}</span>
            </li>`;
        });
        findingsHTML += '</ul></div></div>';

        // Detailed findings
        findingsHTML += '<div class="card"><div class="card-body"><h5>Detailed Findings</h5>';
        findingsHTML += '<div class="table-responsive"><table class="table table-sm table-hover">';
        findingsHTML += '<thead><tr><th>Severity</th><th>Rule</th><th>Action</th><th>Message</th><th>Details</th></tr></thead><tbody>';
        
        findings.slice(0, 50).forEach(finding => {
            const severity = finding.severity || 'warning';
            const severityClass = severity === 'high' || severity === 'error' ? 'danger' : 
                                 severity === 'medium' ? 'warning' : 'info';
            // Build action link - extract owner/repo from action name
            // Action format: owner/repo@ref or owner/repo/path@ref
            // For links, we want just owner/repo (remove path component)
            let actionLink = 'N/A';
            if (finding.action) {
                const actionName = finding.action.split('@')[0]; // Get part before @
                // Extract owner/repo (first two parts, remove any path components)
                const actionParts = actionName.split('/');
                if (actionParts.length >= 2) {
                    const owner = actionParts[0];
                    const repo = actionParts[1];
                    const actionRepoUrl = `https://github.com/${owner}/${repo}`;
                    actionLink = `<a href="${actionRepoUrl}" target="_blank" rel="noreferrer noopener">${escapeHtml(finding.action)}</a>`;
                } else {
                    // Fallback if format is unexpected
                    actionLink = escapeHtml(finding.action);
                }
            }
            
            findingsHTML += `<tr>
                <td><span class="badge bg-${severityClass}">${severity}</span></td>
                <td><code>${escapeHtml(finding.rule_id || 'N/A')}</code></td>
                <td>${actionLink}</td>
                <td>${escapeHtml(finding.message || 'N/A')}</td>
                <td>${finding.details ? escapeHtml(finding.details) : ''}</td>
            </tr>`;
        });
        
        if (findings.length > 50) {
            findingsHTML += `<tr><td colspan="5" class="text-center text-muted">... and ${findings.length - 50} more findings</td></tr>`;
        }
        
        findingsHTML += '</tbody></table></div></div></div>';
        findingsHTML += '</div>';

        return findingsHTML;
    }

    /**
     * Get finding name from rule ID
     */
    getFindingName(ruleId) {
        const findingNames = {
            'UNPINNED_ACTION_REFERENCE': 'Unpinned Action Reference',
            'MUTABLE_TAG_REFERENCE': 'Mutable Tag Reference',
            'DOCKER_FLOATING_TAG': 'Docker Floating Tag',
            'DOCKER_IMPLICIT_LATEST': 'Docker Implicit Latest Tag',
            'DOCKERFILE_FLOATING_BASE_IMAGE': 'Dockerfile Floating Base Image',
            'DOCKER_UNPINNED_DEPENDENCIES': 'Docker Unpinned Dependencies',
            'DOCKER_REMOTE_CODE_NO_INTEGRITY': 'Docker Remote Code Without Integrity',
            'COMPOSITE_NESTED_UNPINNED_ACTION': 'Composite Nested Unpinned Action',
            'COMPOSITE_UNPINNED_DEPENDENCIES': 'Composite Unpinned Dependencies',
            'COMPOSITE_REMOTE_CODE_NO_INTEGRITY': 'Composite Remote Code Without Integrity',
            'JS_REMOTE_CODE_NO_INTEGRITY': 'JavaScript Remote Code Without Integrity',
            'JS_RUNTIME_UNPINNED_DEPENDENCIES': 'JavaScript Runtime Unpinned Dependencies',
            'INDIRECT_UNPINNABLE_ACTION': 'Indirect Unpinnable Action',
            'REMOTE_CODE_NO_INTEGRITY': 'Remote Code Without Integrity',
            'UNPINNED_PACKAGE_INSTALL': 'Unpinned Package Installation',
            'ACTION_METADATA_UNAVAILABLE': 'Action Metadata Unavailable',
            'ANALYSIS_ERROR': 'Analysis Error'
        };
        return findingNames[ruleId] || ruleId;
    }

    /**
     * Scroll to audit findings section
     */
    scrollToAuditFindings() {
        const section = document.getElementById('audit-findings-section');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Load more vulnerabilities (pagination)
     */
    async loadMoreVulnerabilities(orgName, severityFilter, offset, limit = 25) {
        // Get the current org data
        if (!window.storageManager) {
            console.error('StorageManager not available. Cannot load more vulnerabilities.');
            return;
        }
        
        const storageManager = window.storageManager;
        
        // Try to get the current analysis selector value from the page
        // This is more reliable than relying on the orgName parameter
        let analysisName = null;
        try {
            const analysisSelector = document.getElementById('analysisSelector');
            if (analysisSelector) {
                analysisName = analysisSelector.value;
            }
        } catch (e) {
            console.warn('Could not get analysis selector value:', e);
        }
        
        // Use analysis selector value if available, otherwise fall back to orgName
        const identifier = analysisName || orgName;
        
        // Determine which data to load based on identifier
        // Handle aggregated data (empty/null identifier)
        const isCombined = !identifier || identifier === '' || 
                          identifier === 'All Entries Combined' ||
                          identifier === 'All Analyses';
        
        let orgData;
        try {
            if (isCombined) {
                orgData = await storageManager.getCombinedData();
                // Ensure consistent naming
                if (orgData) {
                    orgData.organization = 'All Entries Combined';
                    orgData.name = 'All Entries Combined';
                }
            } else {
                orgData = await storageManager.loadAnalysisDataForOrganization(identifier);
            }
        } catch (error) {
            console.error('Error loading organization data:', error);
            console.error('Identifier used:', identifier);
            return;
        }
        
        if (!orgData || !orgData.data) {
            console.error('Failed to load organization data');
            console.error('Identifier used:', identifier);
            console.error('isCombined:', isCombined);
            console.error('orgData:', orgData);
            return;
        }
        
        // Generate HTML for the next batch
        const nextBatchHTML = await this.generateVulnerabilityAnalysisHTML(
            orgData, 
            severityFilter || null, 
            limit, // limit - passed as parameter (defaults to 25, or all remaining when button clicked)
            offset // offset
        );
        
        // Extract just the vulnerable dependencies section
        const tempDiv = document.createElement('div');
        this.safeSetHTML(tempDiv, nextBatchHTML);
        const vulnerableSection = tempDiv.querySelector('.vulnerable-dependencies');
        
        if (vulnerableSection) {
            const depsList = vulnerableSection.querySelector('.vulnerable-deps-list');
            const loadMoreBtn = vulnerableSection.querySelector('.btn-primary');
            
            // Append new items to existing list
            const existingList = document.getElementById('vulnerable-deps-list');
            if (existingList && depsList) {
                // Use safer method to append nodes instead of innerHTML +=
                const tempContainer = document.createElement('div');
                this.safeSetHTML(tempContainer, depsList.innerHTML);
                while (tempContainer.firstChild) {
                    existingList.appendChild(tempContainer.firstChild);
                }
                
                // Update the header count
                const header = existingList.closest('.vulnerable-dependencies')?.querySelector('h4');
                if (header) {
                    const totalMatch = vulnerableSection.querySelector('h4')?.textContent.match(/\((\d+) of (\d+)\)/);
                    if (totalMatch) {
                        // Escape the numbers even though they come from regex (defense in depth)
                        const headerHtml = `🚨 Vulnerable Dependencies <small class="text-muted">(${this.escapeHtml(totalMatch[1])} of ${this.escapeHtml(totalMatch[2])})</small>`;
                        this.safeSetHTML(header, headerHtml);
                    }
                }
                
                // Replace load more button
                const existingLoadMore = existingList.closest('.vulnerable-dependencies')?.querySelector('.btn-primary');
                if (loadMoreBtn && existingLoadMore) {
                    // Use replaceWith instead of outerHTML for safer DOM manipulation
                    existingLoadMore.replaceWith(loadMoreBtn.cloneNode(true));
                } else if (loadMoreBtn && !existingLoadMore) {
                    existingList.insertAdjacentElement('afterend', loadMoreBtn.cloneNode(true));
                } else if (!loadMoreBtn && existingLoadMore) {
                    existingLoadMore.remove();
                }
            }
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} - Escaped HTML string
     */
    escapeHtml(text) {
        if (!text) return '';
        const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Safely render markdown text to HTML
     * Uses marked.js for markdown parsing and DOMPurify for XSS protection
     * @param {string} markdownText - The markdown text to render
     * @returns {string} - Safe HTML string
     */
    renderSafeMarkdown(markdownText) {
        if (!markdownText || typeof markdownText !== 'string') {
            return '';
        }
        
        // Check if marked and DOMPurify are available
        if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
            // Fallback: escape HTML and convert basic markdown manually
            return this.escapeHtml(markdownText)
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/`(.+?)`/g, '<code>$1</code>')
                .replace(/\n/g, '<br>');
        }
        
        try {
            // Configure marked to be safe (disable HTML in markdown, only allow safe features)
            marked.setOptions({
                breaks: true, // Convert \n to <br>
                gfm: true, // GitHub Flavored Markdown
                sanitize: false // We'll use DOMPurify instead
            });
            
            // Parse markdown to HTML
            const rawHTML = marked.parse(markdownText);
            
            // Sanitize HTML to prevent XSS attacks
            // Allow safe markdown elements: p, strong, em, code, pre, ul, ol, li, a, br, h1-h6, blockquote
            const cleanHTML = DOMPurify.sanitize(rawHTML, {
                ALLOWED_TAGS: ['p', 'strong', 'em', 'b', 'i', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
                ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
                ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
                // Add hooks to ensure all links open in new tab with security attributes
                ADD_ATTR: ['target', 'rel']
            });
            
            // Post-process to ensure all links have target="_blank" and rel="noreferrer noopener"
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = cleanHTML;
            const links = tempDiv.querySelectorAll('a[href]');
            links.forEach(link => {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noreferrer noopener');
            });
            
            return tempDiv.innerHTML;
        } catch (error) {
            console.warn('Error rendering markdown:', error);
            // Fallback to escaped HTML
            return this.escapeHtml(markdownText).replace(/\n/g, '<br>');
        }
    }

    /**
     * Render SBOM quality badge
     */
    renderQualityBadge(score, size = 'normal') {
        if (score === null || score === undefined) {
            return '<span class="badge bg-secondary">N/A</span>';
        }
        
        const getColorClass = (score) => {
            if (score >= 80) return 'success';
            if (score >= 60) return 'warning';
            return 'danger';
        };
        
        const sizeClass = size === 'large' ? 'fs-5' : '';
        const color = getColorClass(score);
        
        return `<span class="badge bg-${color} ${sizeClass}">${score}/100</span>`;
    }

    /**
     * Render quality grade badge
     */
    renderQualityGradeBadge(grade) {
        if (!grade || grade === 'N/A') {
            return '<span class="badge bg-secondary">N/A</span>';
        }
        
        const colorMap = {
            'A': 'success',
            'B': 'info',
            'C': 'primary',
            'D': 'warning',
            'F': 'danger'
        };
        
        const color = colorMap[grade] || 'secondary';
        return `<span class="badge bg-${color}">${grade}</span>`;
    }

    /**
     * Render quality score breakdown
     */
    renderQualityBreakdown(qualityAssessment, detailed = false) {
        if (!qualityAssessment) {
            return '<p class="text-muted">No quality assessment available</p>';
        }
        
        const qa = qualityAssessment;
        const cats = qa.categories;
        
        const getColorClass = (score) => {
            if (score >= 80) return 'success';
            if (score >= 60) return 'warning';
            return 'danger';
        };
        
        let html = `
            <div class="row mb-3">
                <div class="col-md-3 text-center">
                    ${this.renderQualityBadge(qa.overallScore, 'large')}
                    <p class="small text-muted mt-1">Overall</p>
                </div>
                <div class="col-md-9">
                    <div class="row">
                        <div class="col-6 col-md-3 mb-2">
                            <small class="d-block">Identification</small>
                            ${this.renderQualityBadge(cats.identification.score)}
                        </div>
                        <div class="col-6 col-md-3 mb-2">
                            <small class="d-block">Structure</small>
                            ${this.renderQualityBadge(cats.structure.score)}
                        </div>
                        <div class="col-6 col-md-3 mb-2">
                            <small class="d-block">Metadata</small>
                            ${this.renderQualityBadge(cats.metadata.score)}
                        </div>
                        <div class="col-6 col-md-3 mb-2">
                            <small class="d-block">Completeness</small>
                            ${this.renderQualityBadge(cats.completeness.score)}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        if (detailed && qa.summary) {
            html += `
                <div class="alert alert-info">
                    <small>${qa.summary}</small>
                </div>
            `;
        }
        
        if (detailed && qa.issues && qa.issues.length > 0) {
            html += '<div class="mt-3"><h6>Issues Found:</h6>';
            qa.issues.forEach(issueGroup => {
                if (issueGroup.issues.length > 0) {
                    html += `
                        <div class="mb-2">
                            <strong class="text-muted">${issueGroup.category}:</strong>
                            <ul class="small mb-0">
                    `;
                    issueGroup.issues.slice(0, 5).forEach(issue => {
                        html += `<li>${issue}</li>`;
                    });
                    if (issueGroup.issues.length > 5) {
                        html += `<li><em>... and ${issueGroup.issues.length - 5} more</em></li>`;
                    }
                    html += '</ul></div>';
                }
            });
            html += '</div>';
        }
        
        return html;
    }

    /**
     * Render repository quality table
     */
    renderRepositoryQualityTable(repositories) {
        if (!repositories || repositories.length === 0) {
            return '<p class="text-muted">No repository quality data available</p>';
        }
        
        // Filter repositories with quality assessments
        const reposWithQuality = repositories.filter(repo => repo.qualityAssessment);
        
        if (reposWithQuality.length === 0) {
            return '<p class="text-muted">No quality assessments available for repositories</p>';
        }
        
        // Sort by quality score (lowest first to highlight issues)
        const sorted = [...reposWithQuality].sort((a, b) => 
            a.qualityAssessment.overallScore - b.qualityAssessment.overallScore
        );
        
        let html = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Repository</th>
                            <th>Overall Score</th>
                            <th>Grade</th>
                            <th>Identification</th>
                            <th>Structure</th>
                            <th>Metadata</th>
                            <th>Completeness</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        sorted.forEach(repo => {
            const qa = repo.qualityAssessment;
            const repoName = `${repo.owner}/${repo.name}`;
            
            html += `
                <tr>
                    <td><code>${repoName}</code></td>
                    <td>${this.renderQualityBadge(qa.overallScore)}</td>
                    <td>${this.renderQualityGradeBadge(qa.grade)}</td>
                    <td>${this.renderQualityBadge(qa.categories.identification.score)}</td>
                    <td>${this.renderQualityBadge(qa.categories.structure.score)}</td>
                    <td>${this.renderQualityBadge(qa.categories.metadata.score)}</td>
                    <td>${this.renderQualityBadge(qa.categories.completeness.score)}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        return html;
    }

    /**
     * Render quality summary card
     */
    renderQualitySummaryCard(qualityAnalysis) {
        if (!qualityAnalysis) {
            return '';
        }
        
        const getColorClass = (score) => {
            if (score >= 80) return 'success';
            if (score >= 60) return 'warning';
            return 'danger';
        };
        
        const qa = qualityAnalysis;
        
        return `
            <div class="card">
                <div class="card-header">
                    <h5 class="mb-0"><i class="fas fa-certificate me-2"></i>SBOM Quality</h5>
                </div>
                <div class="card-body">
                    <div class="text-center mb-3">
                        <h2 class="text-${getColorClass(qa.averageOverallScore)}">${qa.averageOverallScore}/100</h2>
                        <p class="text-muted">Average Quality Score</p>
                        <p class="small">Across ${qa.totalRepositories} repositories</p>
                    </div>
                    
                    <div class="row text-center mb-3">
                        <div class="col-3">
                            <small class="d-block text-muted">Identification</small>
                            <strong class="text-${getColorClass(qa.averageIdentification)}">${qa.averageIdentification}</strong>
                        </div>
                        <div class="col-3">
                            <small class="d-block text-muted">Structure</small>
                            <strong class="text-${getColorClass(qa.averageStructure)}">${qa.averageStructure}</strong>
                        </div>
                        <div class="col-3">
                            <small class="d-block text-muted">Metadata</small>
                            <strong class="text-${getColorClass(qa.averageMetadata)}">${qa.averageMetadata}</strong>
                        </div>
                        <div class="col-3">
                            <small class="d-block text-muted">Completeness</small>
                            <strong class="text-${getColorClass(qa.averageCompleteness)}">${qa.averageCompleteness}</strong>
                        </div>
                    </div>
                    
                    <div class="border-top pt-3">
                        <h6>Grade Distribution</h6>
                        <div class="d-flex gap-2">
                            <span class="badge bg-success">A: ${qa.gradeDistribution.A || 0}</span>
                            <span class="badge bg-info">B: ${qa.gradeDistribution.B || 0}</span>
                            <span class="badge bg-primary">C: ${qa.gradeDistribution.C || 0}</span>
                            <span class="badge bg-warning">D: ${qa.gradeDistribution.D || 0}</span>
                            <span class="badge bg-danger">F: ${qa.gradeDistribution.F || 0}</span>
                        </div>
                    </div>
                    
                    ${qa.repositoriesNeedingAttention && qa.repositoriesNeedingAttention.length > 0 ? `
                    <div class="alert alert-warning mt-3 mb-0">
                        <small>
                            <i class="fas fa-exclamation-triangle me-1"></i>
                            <strong>${qa.repositoriesNeedingAttention.length}</strong> repositories need attention (score < 70)
                        </small>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
}

// Export for use in other modules
window.ViewManager = ViewManager;