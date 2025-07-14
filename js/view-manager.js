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
     * Show organization overview
     */
    showOrganizationOverview(orgData) {
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
            container.innerHTML = this.generateOverviewHTML(orgData);
            
            // Add event listeners for navigation
            this.addOverviewEventListeners();
            
            console.log('📊 Showing organization overview');
        } else {
            console.error('No suitable container found for organization overview');
            this.showAlert('Unable to display organization overview - no container found', 'warning');
        }
    }

    /**
     * Show dependency details from index (safe for HTML)
     */
    showDependencyDetailsFromIndex(index, organization) {
        console.log('Showing dependency details from index:', index, 'for org:', organization);
        
        // Handle combined data
        if (organization === 'All Organizations Combined') {
            const combinedData = storageManager.getCombinedData();
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
        
        // Get data from storage for individual organization
        const orgData = storageManager.getOrganizationData(organization);
        if (!orgData) {
            console.error('Organization data not found:', organization);
            this.showError('Organization data not found');
            return;
        }
        
        const topDeps = orgData.data.topDependencies || [];
        if (index < 0 || index >= topDeps.length) {
            console.error('Invalid dependency index:', index);
            this.showError('Invalid dependency index');
            return;
        }
        
        const dependency = topDeps[index];
        console.log('Retrieved dependency:', dependency);
        
        this.showDependencyDetails(dependency, orgData);
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
            container.innerHTML = this.generateDependencyHTML(dependency, orgData);
            
            // Add event listeners
            this.addDependencyEventListeners();
            
            console.log('📦 Showing dependency details:', dependency.name);
        } else {
            console.error('No suitable container found for dependency details');
            this.showAlert('Unable to display dependency details - no container found', 'warning');
        }
    }

    /**
     * Show repository details from index (safe for HTML)
     */
    showRepositoryDetailsFromIndex(index, organization) {
        console.log('Showing repository details from index:', index, 'for org:', organization);
        
        // Handle combined data
        if (organization === 'All Organizations Combined') {
            const combinedData = storageManager.getCombinedData();
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
        const orgData = storageManager.getOrganizationData(organization);
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
    showRepositoryDetailsFromAllReposIndex(index, organization) {
        console.log('Showing repository details from all repos index:', index, 'for org:', organization);
        
        // Handle combined data
        if (organization === 'All Organizations Combined') {
            const combinedData = storageManager.getCombinedData();
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
        const orgData = storageManager.getOrganizationData(organization);
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
    showDependencyDetailsFromAllDepsIndex(index, organization) {
        console.log('Showing dependency details from all deps index:', index, 'for org:', organization);
        
        // Handle combined data
        if (organization === 'All Organizations Combined') {
            const combinedData = storageManager.getCombinedData();
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
        const orgData = storageManager.getOrganizationData(organization);
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
    showDependencyDetailsFromRepoIndex(index, organization, repoFullName) {
        console.log('Showing dependency details from repo index:', index, 'for org:', organization, 'repo:', repoFullName);
        
        // Get data from storage
        const orgData = storageManager.getOrganizationData(organization);
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
    showOrganizationOverviewFromStorage(organization) {
        console.log('Showing organization overview from storage for:', organization);
        
        // Get data from storage
        const orgData = storageManager.getOrganizationData(organization);
        if (!orgData) {
            console.error('Organization data not found:', organization);
            this.showError('Organization data not found');
            return;
        }
        
        this.showOrganizationOverview(orgData);
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
            container.innerHTML = this.generateRepositoryHTML(repo, orgData);
            
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
    generateOverviewHTML(orgData) {
        console.log('🔍 View Manager - Received orgData:', orgData);
        
        // Validate orgData structure
        if (!orgData || !orgData.data) {
            console.error('❌ Invalid orgData structure:', orgData);
            return `
                <div class="view-header">
                    <button class="btn btn-secondary" onclick="viewManager.goBack()">
                        ← Back to Analysis
                    </button>
                    <h2>📊 Error - Invalid Data Structure</h2>
                </div>
                <div class="alert alert-danger">
                    <h6>❌ Data Structure Error</h6>
                    <p>The organization data is missing or improperly formatted.</p>
                    <pre class="bg-light p-2 rounded">${JSON.stringify(orgData, null, 2)}</pre>
                </div>
            `;
        }
        
        // Use the new methods for each section
        return `
            <div class="view-header">
                <button class="btn btn-secondary" onclick="viewManager.goBack()">
                    ← Back to Analysis
                </button>
                <h2>📊 ${orgData.organization} - Dependency Overview</h2>
                <p class="text-muted">Analyzed on ${new Date(orgData.timestamp).toLocaleString()}</p>
                <div class="mt-2">
                    <button class="btn btn-primary btn-sm" onclick="viewManager.runBatchVulnerabilityQuery('${orgData.organization}')">
                        <i class="fas fa-shield-alt"></i> Vulnerability Scan (All Repos)
                    </button>
                    <button class="btn btn-success btn-sm" onclick="viewManager.runLicenseComplianceCheck('${orgData.organization}')">
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
            </div>
            ${this.generateDependencyOverviewHTML(orgData)}
            ${this.generateVulnerabilityAnalysisHTML(orgData)}
            <div id="license-section" class="independent-section">
                <div class="license-breakdown">
                    <h3>⚖️ License Compliance Analysis</h3>
                    ${orgData.data.licenseAnalysis ? this.generateLicenseComplianceHTML(orgData) : `
                    <div class="alert alert-info">
                        <h6>📋 No License Analysis Yet</h6>
                        <p>This organization hasn't been analyzed for license compliance yet. License analysis is performed automatically during the SBOM processing.</p>
                        <p><strong>Note:</strong> License analysis includes detection of copyleft licenses, license conflicts, and compliance recommendations.</p>
                        <div class="mt-3">
                            <button class="btn btn-success btn-sm" onclick="viewManager.runLicenseComplianceCheck('${orgData.organization}')">
                                <i class="fas fa-gavel"></i> Run License Compliance Check
                            </button>
                        </div>
                    </div>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * Generate dependency details HTML
     */
    generateDependencyHTML(dependency, orgData) {
        const allRepos = orgData.data.allRepositories;
        const matchingRepos = allRepos.filter(repo => 
            repo.dependencies.some(dep => dep === `${dependency.name}@${dependency.version}`)
        );

        return `
            <div class="view-header">
                <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverviewFromStorage('${orgData.organization}')">
                    ← Back to Overview
                </button>
                <h2>📦 ${dependency.name}@${dependency.version}</h2>
                <p class="text-muted">Used in ${dependency.count} repositories</p>
            </div>

            <div class="dependency-details">
                <div class="detail-section">
                    <h3>📋 Dependency Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Name:</label>
                            <span>${dependency.name}</span>
                        </div>
                        <div class="info-item">
                            <label>Version:</label>
                            <span>${dependency.version}</span>
                        </div>
                        <div class="info-item">
                            <label>Usage Count:</label>
                            <span>${dependency.count} repositories</span>
                        </div>
                        ${dependency.category ? `
                        <div class="info-item">
                            <label>Type:</label>
                            <span class="badge badge-${dependency.category.type}">${dependency.category.type}</span>
                        </div>
                        <div class="info-item">
                            <label>Language:</label>
                            <span>${dependency.category.language}</span>
                        </div>
                        <div class="info-item">
                            <label>Ecosystem:</label>
                            <span>${dependency.category.ecosystem}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <div class="detail-section">
                    <h3>📁 Used in Repositories</h3>
                    <div class="repository-list">
                        ${matchingRepos.map(repo => {
                            const allRepos = orgData.data.allRepositories;
                            const originalIndex = allRepos.findIndex(r => r.owner === repo.owner && r.name === repo.name);
                            return `
                                <div class="repository-item" onclick="viewManager.showRepositoryDetailsFromAllReposIndex(${originalIndex}, '${orgData.organization}')" style="cursor: pointer;">
                                    <div class="repo-name">${repo.owner}/${repo.name}</div>
                                    <div class="repo-deps">${repo.totalDependencies} total deps</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="detail-section">
                    <h3>🔍 Security Analysis</h3>
                    <div class="mt-3">
                        <button class="btn btn-primary btn-sm" onclick="viewManager.quickScanDependency('${dependency.name}', '${dependency.version}', '${orgData.organization}')">
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
                    ${orgData.data.licenseAnalysis ? `
                    <div class="license-info">
                        ${(() => {
                            // Find this dependency in the license analysis
                            const highRiskDep = orgData.data.licenseAnalysis.highRiskDependencies?.find(dep => 
                                dep.name === dependency.name && dep.version === dependency.version
                            );
                            
                            if (highRiskDep) {
                                return `
                                <div class="alert alert-warning">
                                    <h6>⚠️ High-Risk License Detected</h6>
                                    <div class="license-details">
                                        <div class="license-name"><strong>License:</strong> ${highRiskDep.license}</div>
                                        <div class="license-category"><strong>Category:</strong> ${highRiskDep.category}</div>
                                        ${highRiskDep.warnings && highRiskDep.warnings.length > 0 ? `
                                        <div class="license-warnings">
                                            <strong>Warnings:</strong>
                                            <ul>
                                                ${highRiskDep.warnings.map(warning => `<li>${warning}</li>`).join('')}
                                            </ul>
                                        </div>
                                        ` : ''}
                                    </div>
                                </div>
                                `;
                            } else {
                                // Check if it's in the license families
                                const licenseFamilies = orgData.data.licenseAnalysis.licenseFamilies;
                                if (licenseFamilies) {
                                    // Handle both Map and Object structures
                                    const entries = licenseFamilies instanceof Map ? licenseFamilies.entries() : Object.entries(licenseFamilies);
                                    for (const [familyName, deps] of entries) {
                                        const familyDep = deps.find(dep => 
                                            dep.name === dependency.name && dep.version === dependency.version
                                        );
                                        if (familyDep) {
                                            return `
                                            <div class="alert alert-info">
                                                <h6>📋 License Information</h6>
                                                <div class="license-details">
                                                    <div class="license-family"><strong>Family:</strong> ${familyName}</div>
                                                    <div class="license-name"><strong>License:</strong> ${familyDep.licenseInfo?.license || 'Unknown'}</div>
                                                    <div class="license-category"><strong>Category:</strong> ${familyDep.licenseInfo?.category || 'Unknown'}</div>
                                                    <div class="license-risk"><strong>Risk Level:</strong> ${familyDep.licenseInfo?.risk || 'Unknown'}</div>
                                                    ${familyDep.licenseInfo?.description ? `
                                                    <div class="license-description"><strong>Description:</strong> ${familyDep.licenseInfo.description}</div>
                                                    ` : ''}
                                                </div>
                                            </div>
                                            `;
                                        }
                                    }
                                }
                                
                                return `
                                <div class="alert alert-secondary">
                                    <h6>📋 License Information</h6>
                                    <p>No specific license information available for this dependency in the current analysis.</p>
                                    <p><em>Note: License analysis is performed during SBOM processing. If this dependency was added after the initial analysis, license information may not be available.</em></p>
                                </div>
                                `;
                            }
                        })()}
                    </div>
                    ` : `
                    <div class="alert alert-info">
                        <h6>📋 No License Analysis Available</h6>
                        <p>License analysis hasn't been performed for this organization yet. License information will be available after the next analysis run.</p>
                        <div class="mt-3">
                            <button class="btn btn-success btn-sm" onclick="viewManager.runLicenseComplianceCheck('${orgData.organization}')">
                                <i class="fas fa-gavel"></i> Run License Compliance Check
                            </button>
                        </div>
                    </div>
                    `}
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
            </div>
        `;
    }

    /**
     * Generate repository details HTML
     */
    generateRepositoryHTML(repo, orgData) {
        const allDeps = orgData.data.allDependencies;
        const repoDeps = repo.dependencies.map(depKey => {
            const [name, version] = depKey.split('@');
            return { name, version, key: depKey };
        });

        return `
            <div class="view-header">
                <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverviewFromStorage('${orgData.organization}')">
                    ← Back to Overview
                </button>
                <h2>📁 ${repo.owner}/${repo.name}</h2>
                <p class="text-muted">${repo.totalDependencies} dependencies</p>
            </div>

            <div class="repository-details">
                <div class="detail-section">
                    <h3>📋 Repository Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Repository:</label>
                            <span>${repo.owner}/${repo.name}</span>
                        </div>
                        <div class="info-item">
                            <label>Total Dependencies:</label>
                            <span>${repo.totalDependencies}</span>
                        </div>
                    </div>
                    <div class="mt-3">
                        <button class="btn btn-primary btn-sm" onclick="viewManager.runRepositoryVulnerabilityQuery('${repo.owner}', '${repo.name}', '${orgData.organization}')">
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
                            <div class="dependency-card" onclick="viewManager.showDependencyDetailsFromRepoIndex(${index}, '${orgData.organization}', '${repo.owner}/${repo.name}')">
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
    goBack() {
        if (this.currentView === 'overview') {
            // Go back to main analysis view
            document.getElementById('resultsSection').style.display = 'block';
            document.getElementById('view-container').style.display = 'none';
        } else if (this.currentView === 'dependency' || this.currentView === 'repository') {
            // Go back to organization overview
            this.showOrganizationOverview(this.currentOrganization);
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
            container.innerHTML = `
                <div class="view-header">
                    <button class="btn btn-secondary" onclick="viewManager.goBack()">
                        ← Back to Overview
                    </button>
                    <h2>❌ Error</h2>
                </div>
                <div class="alert alert-danger">
                    <h6>❌ Error</h6>
                    <p>${message}</p>
                </div>
            `;
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
            container.innerHTML = `
                <div class="view-header">
                    <button class="btn btn-secondary" onclick="viewManager.goBack()">
                        ← Back to Analysis
                    </button>
                    <h2>🔍 Raw Data Debug</h2>
                </div>
                <div class="alert alert-info">
                    <h6>📋 Raw Organization Data</h6>
                    <pre class="bg-light p-3 rounded" style="max-height: 400px; overflow-y: auto;">${JSON.stringify(orgData, null, 2)}</pre>
                </div>
            `;
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
            const orgData = storageManager.getOrganizationData(organization);
            if (!orgData || !orgData.data.allDependencies) {
                this.showAlert('No dependencies found for analysis', 'warning');
                return;
            }

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
            storageManager.saveAnalysisData(organization, orgData.data);
            
            // Refresh the view
            this.showOrganizationOverview(orgData);
            
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
                                return `
                                    <div class="alert alert-${this.getSeverityClass(severity)}">
                                        <h6>${vuln.id || 'Unknown'} - ${severity}</h6>
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
        
        // Clean up modal after it's hidden
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.removeChild(modal);
        });
    }





    /**
     * Show vulnerability cache statistics
     */
    showVulnerabilityCacheStats() {
        if (!window.osvService) {
            this.showAlert('OSV Service not available', 'warning');
            return;
        }

        const stats = window.osvService.getCacheStats();
        const centralizedStats = window.storageManager ? window.storageManager.getVulnerabilityStorageStats() : null;
        
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
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
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
            const orgData = storageManager.getOrganizationData(organization);
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
            const orgData = storageManager.getOrganizationData(organization);
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
                storageManager.saveAnalysisData(organization, orgData.data);
                
                // Refresh the view
                this.showOrganizationOverview(orgData);
                
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
            // Skip dependencies without originalPackage data
            if (!dep.originalPackage) {
                console.warn('Dependency missing originalPackage data:', dep.name);
                return;
            }
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
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
        const licenseProcessor = new LicenseProcessor();
        const repositories = orgData.data.allRepositories;
        const dependencies = orgData.data.allDependencies;
        
        let matchingRepos = new Set();
        
        dependencies.forEach(dep => {
            // Skip dependencies without originalPackage data
            if (!dep.originalPackage) {
                console.warn('Dependency missing originalPackage data:', dep.name);
                return;
            }
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
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
        const licenseProcessor = new LicenseProcessor();
        const repositories = orgData.data.allRepositories;
        const dependencies = orgData.data.allDependencies;
        
        let matchingRepos = new Set();
        
        dependencies.forEach(dep => {
            // Skip dependencies without originalPackage data
            if (!dep.originalPackage) {
                console.warn('Dependency missing originalPackage data:', dep.name);
                return;
            }
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
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
    showLicenseRepositories(organization, licenseType) {
        const orgData = storageManager.getOrganizationData(organization);
        if (!orgData || !orgData.data.licenseAnalysis) {
            this.showAlert('No license analysis data available', 'warning');
            return;
        }

        const licenseProcessor = new LicenseProcessor();
        const dependencies = orgData.data.allDependencies;
        const licenseRepos = new Map(); // Map of repo -> dependencies with this license

        dependencies.forEach(dep => {
            // Skip dependencies without originalPackage data
            if (!dep.originalPackage) {
                console.warn('Dependency missing originalPackage data:', dep.name);
                return;
            }
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
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
            licenseSection.innerHTML = html;
        } else {
            // Fallback to full container if section doesn't exist
            document.getElementById('view-container').innerHTML = html;
            document.getElementById('view-container').style.display = 'block';
        }
    }

    /**
     * Show detailed view for license conflicts
     */
    showLicenseConflictDetails(organization, conflictIndex) {
        const orgData = storageManager.getOrganizationData(organization);
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
            // Skip dependencies without originalPackage data
            if (!dep.originalPackage) {
                console.warn('Dependency missing originalPackage data:', dep.name);
                return;
            }
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
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
            licenseSection.innerHTML = html;
        }
    }

    /**
     * Show detailed view for high-risk licenses
     */
    showHighRiskLicenseDetails(organization, packageName, version) {
        const orgData = storageManager.getOrganizationData(organization);
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
                        ${affectedRepos.map(repo => `
                            <div class="repository-item">
                                <div class="repo-header">
                                    <h5>${repo.owner}/${repo.name}</h5>
                                    <span class="badge bg-primary">${repo.totalDependencies} total deps</span>
                                </div>
                                <div class="repo-actions">
                                    <button class="btn btn-outline-primary btn-sm" onclick="viewManager.showRepositoryDetailsFromAllReposIndex(${orgData.data.allRepositories.findIndex(r => r.owner === repo.owner && r.name === repo.name)}, '${organization}')">
                                        <i class="fas fa-eye me-1"></i>View Repository
                                    </button>
                                </div>
                            </div>
                        `).join('')}
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
            licenseSection.innerHTML = html;
        }
    }

    /**
     * Show detailed view for recommendations
     */
    showRecommendationDetails(organization, recommendationIndex) {
        const orgData = storageManager.getOrganizationData(organization);
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
        const licenseProcessor = new LicenseProcessor();
        const dependencies = orgData.data.allDependencies;
        const relatedDeps = [];
        const affectedRepos = new Map();

        // Determine which dependencies are related based on recommendation type
        dependencies.forEach(dep => {
            // Skip dependencies without originalPackage data
            if (!dep.originalPackage) {
                console.warn('Dependency missing originalPackage data:', dep.name);
                return;
            }
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
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
            licenseSection.innerHTML = html;
        }
    }

    /**
     * Toggle license repositories panel (slide-out)
     */
    toggleLicenseRepositoriesPanel(organization, licenseType) {
        const panel = document.getElementById('license-repositories-panel');
        const title = document.getElementById('license-panel-title');
        const content = document.getElementById('license-repositories-content');
        
        if (panel.style.display === 'none') {
            // Show panel
            const orgData = storageManager.getOrganizationData(organization);
            if (!orgData) {
                this.showAlert('Organization data not found', 'error');
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
            
            // Load content
            const repositories = this.getLicenseRepositoriesList(orgData, licenseType);
            const dependencies = this.getLicenseDependenciesList(orgData, licenseType);
            
            content.innerHTML = `
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
                            const repoIndex = orgData.data.allRepositories.findIndex(r => r.owner === owner && r.name === name);
                            return `
                                <div class="repository-item" onclick="viewManager.showRepositoryDetailsFromAllReposIndex(${repoIndex}, '${organization}')" style="cursor: pointer;">
                                    <div class="repo-name">${repo}</div>
                                    <div class="repo-deps">${orgData.data.allRepositories[repoIndex]?.totalDependencies || 0} total deps</div>
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
                                <div class="dep-name">${dep.name}@${dep.version}</div>
                                <div class="dep-license">${dep.license}</div>
                                <div class="dep-category">${dep.category}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            
            panel.style.display = 'block';
            setTimeout(() => {
                panel.classList.add('panel-open');
            }, 10);
        } else {
            // Hide panel
            this.closeLicenseRepositoriesPanel();
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
    getLicenseDependenciesList(orgData, licenseType) {
        const licenseProcessor = new LicenseProcessor();
        const dependencies = orgData.data.allDependencies;
        const matchingDeps = [];
        
        dependencies.forEach(dep => {
            // Skip dependencies without originalPackage data
            if (!dep.originalPackage) {
                console.warn('Dependency missing originalPackage data:', dep.name);
                return;
            }
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
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
    showLicenseConflictDetailsModal(organization, conflictIndex) {
        const orgData = storageManager.getOrganizationData(organization);
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
            // Skip dependencies without originalPackage data
            if (!dep.originalPackage) {
                console.warn('Dependency missing originalPackage data:', dep.name);
                return;
            }
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
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

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);

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
    showHighRiskLicenseDetailsModal(organization, packageName, version) {
        const orgData = storageManager.getOrganizationData(organization);
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
                                    ${affectedRepos.map(repo => `
                                        <div class="repository-item">
                                            <div class="repo-header">
                                                <h6>${repo.owner}/${repo.name}</h6>
                                                <span class="badge bg-primary">${repo.totalDependencies} total deps</span>
                                            </div>
                                            <div class="repo-actions">
                                                <button class="btn btn-outline-primary btn-sm" onclick="viewManager.showRepositoryDetailsFromAllReposIndex(${orgData.data.allRepositories.findIndex(r => r.owner === repo.owner && r.name === repo.name)}, '${organization}')">
                                                    <i class="fas fa-eye me-1"></i>View Repository
                                                </button>
                                            </div>
                                        </div>
                                    `).join('')}
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

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('highRiskLicenseModal'));
        modal.show();

        // Clean up modal when hidden
        document.getElementById('highRiskLicenseModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    /**
     * Generate License Compliance HTML (standalone section)
     */
    generateLicenseComplianceHTML(orgData) {
        if (!orgData || !orgData.data) {
            return `<div class="alert alert-danger">No organization data available.</div>`;
        }
        if (!orgData.data.licenseAnalysis) {
            return `<div class="alert alert-info">No license analysis found for this organization.</div>`;
        }
        
        // Calculate combined copyleft (includes LGPL)
        const copyleftCount = (orgData.data.licenseAnalysis.summary?.categoryBreakdown?.copyleft || 0) + 
                             (orgData.data.licenseAnalysis.summary?.categoryBreakdown?.lgpl || 0);
        
        return `
        <div class="license-stats">
            <div class="license-stat-card total clickable-license-card license-card" 
                 onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'total')">
                <h4>📊 Total</h4>
                <div class="license-number">${orgData.data.licenseAnalysis.summary?.licensedDependencies || 0}</div>
                <div class="license-detail">licensed deps</div>
                <div class="license-tooltip">
                    <div class="license-tooltip-content">
                        <div class="license-tooltip-header">📊 All Licensed Dependencies</div>
                        <div class="license-tooltip-stats">
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${orgData.data.licenseAnalysis.summary?.licensedDependencies || 0}</span>
                                <span class="license-tooltip-stat-label">Dependencies</span>
                            </div>
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${this.getLicenseRepositoriesCount(orgData, 'total')}</span>
                                <span class="license-tooltip-stat-label">Repositories</span>
                            </div>
                        </div>
                        <div class="license-tooltip-repos">
                            ${this.getLicenseRepositoriesList(orgData, 'total').slice(0, 5).map(repo => `
                                <div class="license-tooltip-repo">${repo}</div>
                            `).join('')}
                            ${this.getLicenseRepositoriesList(orgData, 'total').length > 5 ? `
                                <div class="license-tooltip-repo">... and ${this.getLicenseRepositoriesList(orgData, 'total').length - 5} more</div>
                            ` : ''}
                        </div>
                        <div class="license-tooltip-footer">
                            <button class="license-tooltip-click" onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'total')">Click to view all</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="license-stat-card copyleft clickable-license-card license-card" 
                 onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'copyleft')">
                <h4>⚠️ Copyleft</h4>
                <div class="license-number">${copyleftCount}</div>
                <div class="license-detail">high risk</div>
                <div class="license-tooltip">
                    <div class="license-tooltip-content">
                        <div class="license-tooltip-header">⚠️ Copyleft Licenses (GPL, LGPL, AGPL, MPL, EPL)</div>
                        <div class="license-tooltip-stats">
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${copyleftCount}</span>
                                <span class="license-tooltip-stat-label">Dependencies</span>
                            </div>
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${this.getLicenseRepositoriesCount(orgData, 'copyleft') + this.getLicenseRepositoriesCount(orgData, 'lgpl')}</span>
                                <span class="license-tooltip-stat-label">Repositories</span>
                            </div>
                        </div>
                        <div class="license-tooltip-repos">
                            ${[...this.getLicenseRepositoriesList(orgData, 'copyleft'), ...this.getLicenseRepositoriesList(orgData, 'lgpl')].slice(0, 5).map(repo => `
                                <div class="license-tooltip-repo">${repo}</div>
                            `).join('')}
                            ${[...this.getLicenseRepositoriesList(orgData, 'copyleft'), ...this.getLicenseRepositoriesList(orgData, 'lgpl')].length > 5 ? `
                                <div class="license-tooltip-repo">... and ${[...this.getLicenseRepositoriesList(orgData, 'copyleft'), ...this.getLicenseRepositoriesList(orgData, 'lgpl')].length - 5} more</div>
                            ` : ''}
                        </div>
                        <div class="license-tooltip-footer">
                            <button class="license-tooltip-click" onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'copyleft')">Click to view all</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="license-stat-card proprietary clickable-license-card license-card" 
                 onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'proprietary')">
                <h4>🔒 Proprietary</h4>
                <div class="license-number">${orgData.data.licenseAnalysis.summary?.categoryBreakdown?.proprietary || 0}</div>
                <div class="license-detail">medium risk</div>
                <div class="license-tooltip">
                    <div class="license-tooltip-content">
                        <div class="license-tooltip-header">🔒 Proprietary Licenses</div>
                        <div class="license-tooltip-stats">
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${orgData.data.licenseAnalysis.summary?.categoryBreakdown?.proprietary || 0}</span>
                                <span class="license-tooltip-stat-label">Dependencies</span>
                            </div>
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${this.getLicenseRepositoriesCount(orgData, 'proprietary')}</span>
                                <span class="license-tooltip-stat-label">Repositories</span>
                            </div>
                        </div>
                        <div class="license-tooltip-repos">
                            ${this.getLicenseRepositoriesList(orgData, 'proprietary').slice(0, 5).map(repo => `
                                <div class="license-tooltip-repo">${repo}</div>
                            `).join('')}
                            ${this.getLicenseRepositoriesList(orgData, 'proprietary').length > 5 ? `
                                <div class="license-tooltip-repo">... and ${this.getLicenseRepositoriesList(orgData, 'proprietary').length - 5} more</div>
                            ` : ''}
                        </div>
                        <div class="license-tooltip-footer">
                            <button class="license-tooltip-click" onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'proprietary')">Click to view all</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="license-stat-card unknown clickable-license-card license-card" 
                 onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'unknown')">
                <h4>❓ Unknown</h4>
                <div class="license-number">${orgData.data.licenseAnalysis.summary?.categoryBreakdown?.unknown || 0}</div>
                <div class="license-detail">high risk</div>
                <div class="license-tooltip">
                    <div class="license-tooltip-content">
                        <div class="license-tooltip-header">❓ Unknown Licenses</div>
                        <div class="license-tooltip-stats">
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${orgData.data.licenseAnalysis.summary?.categoryBreakdown?.unknown || 0}</span>
                                <span class="license-tooltip-stat-label">Dependencies</span>
                            </div>
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${this.getLicenseRepositoriesCount(orgData, 'unknown')}</span>
                                <span class="license-tooltip-stat-label">Repositories</span>
                            </div>
                        </div>
                        <div class="license-tooltip-repos">
                            ${this.getLicenseRepositoriesList(orgData, 'unknown').slice(0, 5).map(repo => `
                                <div class="license-tooltip-repo">${repo}</div>
                            `).join('')}
                            ${this.getLicenseRepositoriesList(orgData, 'unknown').length > 5 ? `
                                <div class="license-tooltip-repo">... and ${this.getLicenseRepositoriesList(orgData, 'unknown').length - 5} more</div>
                            ` : ''}
                        </div>
                        <div class="license-tooltip-footer">
                            <button class="license-tooltip-click" onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'unknown')">Click to view all</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="license-stat-card unlicensed clickable-license-card license-card" 
                 onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'unlicensed')">
                <h4>🚨 Unlicensed</h4>
                <div class="license-number">${orgData.data.licenseAnalysis.summary?.unlicensedDependencies || 0}</div>
                <div class="license-detail">unlicensed deps</div>
                <div class="license-tooltip">
                    <div class="license-tooltip-content">
                        <div class="license-tooltip-header">🚨 Unlicensed Dependencies</div>
                        <div class="license-tooltip-stats">
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${orgData.data.licenseAnalysis.summary?.unlicensedDependencies || 0}</span>
                                <span class="license-tooltip-stat-label">Dependencies</span>
                            </div>
                            <div class="license-tooltip-stat">
                                <span class="license-tooltip-stat-value">${this.getLicenseRepositoriesCount(orgData, 'unlicensed')}</span>
                                <span class="license-tooltip-stat-label">Repositories</span>
                            </div>
                        </div>
                        <div class="license-tooltip-repos">
                            ${this.getLicenseRepositoriesList(orgData, 'unlicensed').slice(0, 5).map(repo => `
                                <div class="license-tooltip-repo">${repo}</div>
                            `).join('')}
                            ${this.getLicenseRepositoriesList(orgData, 'unlicensed').length > 5 ? `
                                <div class="license-tooltip-repo">... and ${this.getLicenseRepositoriesList(orgData, 'unlicensed').length - 5} more</div>
                            ` : ''}
                        </div>
                        <div class="license-tooltip-footer">
                            <button class="license-tooltip-click" onclick="viewManager.toggleLicenseRepositoriesPanel('${orgData.organization}', 'unlicensed')">Click to view all</button>
                        </div>
                    </div>
                </div>
            </div>
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
        </div>
        
        ${orgData.data.licenseAnalysis.conflicts && orgData.data.licenseAnalysis.conflicts.length > 0 ? `
        <div class="license-conflicts">
            <h4>🚨 License Conflicts</h4>
            <div class="license-conflicts-list">
                ${orgData.data.licenseAnalysis.conflicts.slice(0, 5).map((conflict, index) => `
                    <div class="license-conflict-item">
                        <div class="conflict-info">
                            <div class="conflict-type">${conflict.type}</div>
                            <div class="conflict-description">${conflict.description}</div>
                            <div class="conflict-licenses">
                                ${conflict.licenses.map(license => `<span class="badge badge-license">${license}</span>`).join('')}
                            </div>
                            <div class="conflict-actions">
                                <button class="btn btn-outline-danger btn-sm" onclick="viewManager.showLicenseConflictDetailsModal('${orgData.organization}', ${index})">
                                    <i class="fas fa-eye me-1"></i>View Affected Repositories
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        
        ${orgData.data.licenseAnalysis.highRiskDependencies && orgData.data.licenseAnalysis.highRiskDependencies.length > 0 ? `
        <div class="high-risk-licenses">
            <h4>⚠️ High-Risk Licenses</h4>
            <div class="high-risk-list">
                ${orgData.data.licenseAnalysis.highRiskDependencies.slice(0, 10).map((dep, index) => `
                    <div class="high-risk-item">
                        <div class="risk-info">
                            <div class="risk-name">${dep.name}@${dep.version}</div>
                            <div class="risk-license">${dep.license}</div>
                            <div class="risk-category">${dep.category}</div>
                            ${dep.warnings && dep.warnings.length > 0 ? `
                            <div class="risk-warnings">
                                ${dep.warnings.map(warning => `<span class="badge badge-warning">${warning}</span>`).join('')}
                            </div>
                            ` : ''}
                        </div>
                        <div class="risk-actions">
                            <button class="btn btn-outline-warning btn-sm" onclick="viewManager.showHighRiskLicenseDetailsModal('${orgData.organization}', '${dep.name}', '${dep.version}')">
                                <i class="fas fa-eye me-1"></i>View Affected Repositories
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        
        ${orgData.data.licenseAnalysis.recommendations && orgData.data.licenseAnalysis.recommendations.length > 0 ? `
        <div class="license-recommendations">
            <h4>💡 Recommendations</h4>
            <div class="recommendations-list">
                ${orgData.data.licenseAnalysis.recommendations.map((rec, index) => `
                    <div class="recommendation-item ${rec.type}">
                        <div class="rec-priority">${rec.priority}</div>
                        <div class="rec-message">${rec.message}</div>
                        <div class="rec-actions">
                            <button class="btn btn-outline-info btn-sm" onclick="viewManager.showRecommendationDetails('${orgData.organization}', ${index})">
                                <i class="fas fa-eye me-1"></i>View Details
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        `;
    }

    generateDependencyOverviewHTML(orgData) {
        // Extracted from generateOverviewHTML: stats, category breakdown, language stats, top deps, all deps
        const stats = orgData.data.statistics;
        const topDeps = orgData.data.topDependencies;
        const allDeps = orgData.data.allDependencies;
        const categoryStats = orgData.data.categoryStats;
        const languageStats = orgData.data.languageStats;
        const isCombinedView = orgData.organization === 'All Organizations Combined';
        return `
            <div class="stats-grid">
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
            </div>
            ${categoryStats ? `
            <div class="category-breakdown">
                <h3>📊 Dependency Categories</h3>
                <div class="category-grid">
                    <div class="category-card code">
                        <h4>💻 Code Dependencies</h4>
                        <div class="category-number">${isCombinedView ? 
                            (parseInt(categoryStats.code) || 0) : 
                            (typeof categoryStats.code === 'object' ? (categoryStats.code.count || 0) : (categoryStats.code || 0))
                        }</div>
                        <div class="category-detail">${isCombinedView ? 'N/A' : 
                            (typeof categoryStats.code === 'object' ? (categoryStats.code.uniqueDependencies || 0) : 'N/A')
                        } unique</div>
                    </div>
                    <div class="category-card workflow">
                        <h4>⚙️ Workflow Dependencies</h4>
                        <div class="category-number">${isCombinedView ? 
                            (parseInt(categoryStats.workflow) || 0) : 
                            (typeof categoryStats.workflow === 'object' ? (categoryStats.workflow.count || 0) : (categoryStats.workflow || 0))
                        }</div>
                        <div class="category-detail">${isCombinedView ? 'N/A' : 
                            (typeof categoryStats.workflow === 'object' ? (categoryStats.workflow.uniqueDependencies || 0) : 'N/A')
                        } unique</div>
                    </div>
                    <div class="category-card infrastructure">
                        <h4>🏗️ Infrastructure Dependencies</h4>
                        <div class="category-number">${isCombinedView ? 
                            (parseInt(categoryStats.infrastructure) || 0) : 
                            (typeof categoryStats.infrastructure === 'object' ? (categoryStats.infrastructure.count || 0) : (categoryStats.infrastructure || 0))
                        }</div>
                        <div class="category-detail">${isCombinedView ? 'N/A' : 
                            (typeof categoryStats.infrastructure === 'object' ? (categoryStats.infrastructure.uniqueDependencies || 0) : 'N/A')
                        } unique</div>
                    </div>
                    <div class="category-card unknown">
                        <h4>❓ Unknown Dependencies</h4>
                        <div class="category-number">${isCombinedView ? 
                            (parseInt(categoryStats.unknown) || 0) : 
                            (typeof categoryStats.unknown === 'object' ? (categoryStats.unknown.count || 0) : (categoryStats.unknown || 0))
                        }</div>
                        <div class="category-detail">${isCombinedView ? 'N/A' : 
                            (typeof categoryStats.unknown === 'object' ? (categoryStats.unknown.uniqueDependencies || 0) : 'N/A')
                        } unique</div>
                    </div>
                </div>
            </div>
            ` : ''}
            ${languageStats ? `
            <div class="language-breakdown">
                <h3>🌐 Programming Languages</h3>
                <div class="language-grid">
                    ${Array.isArray(languageStats) ? 
                        languageStats.slice(0, 6).map(lang => `
                            <div class="language-card">
                                <h4>${lang.language}</h4>
                                <div class="language-number">${lang.count}</div>
                                <div class="language-detail">${lang.uniqueDependencies} unique deps</div>
                            </div>
                        `).join('') :
                        Object.entries(languageStats).slice(0, 6).map(([lang, count]) => `
                            <div class="language-card">
                                <h4>${lang}</h4>
                                <div class="language-number">${count}</div>
                                <div class="language-detail">N/A unique deps</div>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
            ` : ''}
            <div class="view-sections">
                <div class="section">
                    <h3>🏆 Top Dependencies (${topDeps ? topDeps.length : 0})</h3>
                    <div class="filter-buttons">
                        <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('all')">All</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('code')">Code</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('workflow')">Workflow</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('infrastructure')">Infrastructure</button>
                    </div>
                    <div class="dependency-grid" id="top-dependencies">
                        ${topDeps && topDeps.length > 0 ? topDeps.slice(0, 12).map((dep, index) => `
                            <div class="dependency-item ${dep.category?.type || 'unknown'}">
                                <div class="dep-content" onclick="viewManager.showDependencyDetailsFromIndex(${index}, '${orgData.organization}')">
                                    <div class="dep-name">${dep.name || 'Unknown'}</div>
                                    <div class="dep-version">${dep.version || 'Unknown'}</div>
                                    <div class="dep-count">${dep.count || 0} repos</div>
                                    <div class="dep-category">${dep.category?.type || 'unknown'}</div>
                                </div>
                                <div class="dep-actions">
                                    <button class="btn btn-sm btn-outline-primary" onclick="viewManager.queryVulnerabilityForDependency('${dep.name}', '${dep.version}', '${orgData.organization}')" title="Query vulnerabilities">
                                        <i class="fas fa-shield-alt"></i>
                                    </button>
                                    ${!orgData.data.vulnerabilityAnalysis ? `
                                    <button class="btn btn-sm btn-outline-success" onclick="viewManager.quickScanDependency('${dep.name}', '${dep.version}', '${orgData.organization}')" title="Quick scan for vulnerabilities">
                                        <i class="fas fa-bolt"></i>
                                    </button>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('') : '<p class="text-muted">No dependencies found</p>'}
                    </div>
                </div>
                </div>
            </div>
            ${allDeps && allDeps.length > 0 ? `
            <div class="all-dependencies">
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
                    ${allDeps.map((dep, index) => `
                        <div class="dependency-card ${dep.category ? dep.category.type : 'unknown'}">
                            <div class="dep-content" onclick="viewManager.showDependencyDetailsFromAllDepsIndex(${index}, '${orgData.organization}')">
                                <div class="dep-name">${dep.name || 'Unknown'}</div>
                                <div class="dep-version">${dep.version || 'Unknown'}</div>
                                <div class="dep-count">${dep.count || 0} repos</div>
                                <div class="dep-category">${dep.category?.type || 'unknown'}</div>
                            </div>
                            <div class="dep-actions">
                                <button class="btn btn-sm btn-outline-primary" onclick="viewManager.queryVulnerabilityForDependency('${dep.name}', '${dep.version}', '${orgData.organization}')" title="Query vulnerabilities">
                                    <i class="fas fa-shield-alt"></i>
                                </button>
                                ${!orgData.data.vulnerabilityAnalysis ? `
                                <button class="btn btn-sm btn-outline-success" onclick="viewManager.quickScanDependency('${dep.name}', '${dep.version}', '${orgData.organization}')" title="Quick scan for vulnerabilities">
                                    <i class="fas fa-bolt"></i>
                                </button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        `;
    }

    generateVulnerabilityAnalysisHTML(orgData) {
        // Extracted from generateOverviewHTML: vulnerability section only
        return `
        <div id="vulnerability-section" class="independent-section">
            <div class="vulnerability-breakdown">
                <h3>🔒 Vulnerability Analysis</h3>
                ${orgData.data.vulnerabilityAnalysis ? `
                <div class="vulnerability-actions mb-3">
                    <button class="btn btn-primary btn-sm" onclick="viewManager.runBatchVulnerabilityQuery('${orgData.organization}')">
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
                        <div class="vuln-number">${orgData.data.vulnerabilityAnalysis.criticalVulnerabilities || 0}</div>
                        <div class="vuln-detail">vulnerabilities</div>
                    </div>
                    <div class="vuln-stat-card high">
                        <h4>⚠️ High</h4>
                        <div class="vuln-number">${orgData.data.vulnerabilityAnalysis.highVulnerabilities || 0}</div>
                        <div class="vuln-detail">vulnerabilities</div>
                    </div>
                    <div class="vuln-stat-card medium">
                        <h4>⚡ Medium</h4>
                        <div class="vuln-number">${orgData.data.vulnerabilityAnalysis.mediumVulnerabilities || 0}</div>
                        <div class="vuln-detail">vulnerabilities</div>
                    </div>
                    <div class="vuln-stat-card low">
                        <h4>ℹ️ Low</h4>
                        <div class="vuln-number">${orgData.data.vulnerabilityAnalysis.lowVulnerabilities || 0}</div>
                        <div class="vuln-detail">vulnerabilities</div>
                    </div>
                    <div class="vuln-stat-card total">
                        <h4>📊 Total</h4>
                        <div class="vuln-number">${orgData.data.vulnerabilityAnalysis.vulnerablePackages || 0}</div>
                        <div class="vuln-detail">vulnerable packages</div>
                    </div>
                    <div class="vuln-stat-card rate">
                        <h4>📈 Rate</h4>
                        <div class="vuln-number">${orgData.data.vulnerabilityAnalysis.vulnerabilityRate || 0}%</div>
                        <div class="vuln-detail">vulnerability rate</div>
                    </div>
                </div>
                ${orgData.data.vulnerabilityAnalysis.vulnerableDependencies && orgData.data.vulnerabilityAnalysis.vulnerableDependencies.length > 0 ? `
                <div class="vulnerable-dependencies">
                    <h4>🚨 Vulnerable Dependencies</h4>
                    <div class="vulnerable-deps-list">
                        ${orgData.data.vulnerabilityAnalysis.vulnerableDependencies.slice(0, 10).map(dep => `
                            <div class="vulnerable-dep-item">
                                <div class="vuln-dep-info">
                                    <div class="vuln-dep-name">${dep.name}@${dep.version}</div>
                                    <div class="vuln-dep-count">${dep.vulnerabilities.length} vulnerabilities</div>
                                    <div class="vuln-severity-badges">
                                        ${dep.vulnerabilities.map(vuln => {
                                            if (!vuln || typeof vuln !== 'object') return '';
                                            const severity = window.osvService ? window.osvService.getHighestSeverity(vuln) : 'UNKNOWN';
                                            const tooltip = `${vuln.id || 'Unknown ID'}\n${vuln.summary || 'No summary'}`;
                                            const cssSeverity = severity.toLowerCase() === 'moderate' ? 'medium' : severity.toLowerCase();
                                            return `
                                                <span class="badge severity-${cssSeverity} clickable-severity-badge" 
                                                      title="${tooltip}" 
                                                      onclick="viewManager.showVulnerabilityDetails('${dep.name}', '${dep.version}', [${JSON.stringify(vuln).replace(/"/g, '&quot;')}])">
                                                    ${severity}
                                                </span>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                                <div class="vuln-dep-actions">
                                    <button class="btn btn-sm btn-outline-info" onclick="viewManager.showVulnerabilityDetails('${dep.name}', '${dep.version}', ${JSON.stringify(dep.vulnerabilities).replace(/"/g, '&quot;')})">
                                        <i class="fas fa-eye me-1"></i>View Details
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                ` : `
                <div class="vulnerability-actions mb-3">
                    <button class="btn btn-primary btn-sm" onclick="viewManager.runBatchVulnerabilityQuery('${orgData.organization}')">
                        <i class="fas fa-search"></i> Run Initial Vulnerability Analysis
                    </button>
                    <button class="btn btn-info btn-sm" onclick="viewManager.showVulnerabilityCacheStats()">
                        <i class="fas fa-database"></i> Cache Stats
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="viewManager.clearVulnerabilityCache()">
                        <i class="fas fa-trash"></i> Clear Cache
                    </button>
                    <button class="btn btn-success btn-sm" onclick="window.osvService.testVulnerabilityDetails()">
                        <i class="fas fa-eye"></i> Test External Links
                    </button>
                </div>
                <div class="alert alert-info">
                    <h6>📋 No Vulnerability Analysis Yet</h6>
                    <p>This organization hasn't been analyzed for vulnerabilities yet. Click "Run Initial Vulnerability Analysis" to scan all dependencies for known vulnerabilities.</p>
                    <p><strong>Note:</strong> This will query the OSV API for each dependency and may take a few minutes depending on the number of dependencies.</p>
                </div>
                `}
            </div>
        </div>
        `;
    }
}