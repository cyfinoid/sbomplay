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
        
        const container = document.getElementById('view-container');
        container.innerHTML = this.generateOverviewHTML(orgData);
        
        // Add event listeners for navigation
        this.addOverviewEventListeners();
        
        console.log('📊 Showing organization overview');
    }

    /**
     * Show dependency details from index (safe for HTML)
     */
    showDependencyDetailsFromIndex(index, organization) {
        console.log('Showing dependency details from index:', index, 'for org:', organization);
        
        // Get data from storage
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
        
        const container = document.getElementById('view-container');
        container.innerHTML = this.generateDependencyHTML(dependency, orgData);
        
        // Add event listeners
        this.addDependencyEventListeners();
        
        console.log('📦 Showing dependency details:', dependency.name);
    }

    /**
     * Show repository details from index (safe for HTML)
     */
    showRepositoryDetailsFromIndex(index, organization) {
        console.log('Showing repository details from index:', index, 'for org:', organization);
        
        // Get data from storage
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
        
        // Get data from storage
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
        
        // Get data from storage
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
        
        const container = document.getElementById('view-container');
        container.innerHTML = this.generateRepositoryHTML(repo, orgData);
        
        // Add event listeners
        this.addRepositoryEventListeners();
        
        console.log('📁 Showing repository details:', repo.name);
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
        
        const stats = orgData.data.statistics;
        const topDeps = orgData.data.topDependencies;
        const topRepos = orgData.data.topRepositories;
        const allDeps = orgData.data.allDependencies;
        const allRepos = orgData.data.allRepositories;
        const categoryStats = orgData.data.categoryStats;
        const languageStats = orgData.data.languageStats;
        
        console.log('📊 Stats:', stats);
        console.log('🏆 Top Dependencies:', topDeps);
        console.log('📁 Top Repositories:', topRepos);
        console.log('📦 All Dependencies:', allDeps);
        console.log('📂 All Repositories:', allRepos);
        console.log('📊 Category Stats:', categoryStats);
        console.log('🌐 Language Stats:', languageStats);
        
        // Debug category stats structure
        if (categoryStats) {
            console.log('🔍 Category Stats Debug:');
            Object.entries(categoryStats).forEach(([key, value]) => {
                console.log(`  ${key}:`, value, `(type: ${typeof value})`);
            });
        }
        
        // Debug language stats structure
        if (languageStats) {
            console.log('🔍 Language Stats Debug:');
            if (Array.isArray(languageStats)) {
                console.log('  Array format:', languageStats);
            } else {
                Object.entries(languageStats).forEach(([key, value]) => {
                    console.log(`  ${key}:`, value, `(type: ${typeof value})`);
                });
            }
        }

        // Validate data structure
        if (!stats || !topDeps || !topRepos || !allDeps || !allRepos) {
            console.error('❌ Invalid data structure in orgData:', orgData);
            return `
                <div class="view-header">
                    <button class="btn btn-secondary" onclick="viewManager.goBack()">
                        ← Back to Analysis
                    </button>
                    <h2>📊 ${orgData.organization} - Dependency Overview</h2>
                    <p class="text-muted">Analyzed on ${new Date(orgData.timestamp).toLocaleString()}</p>
                </div>
                <div class="alert alert-warning">
                    <h6>⚠️ Data Processing Issue</h6>
                    <p>The analysis data appears to be incomplete or improperly formatted. This might be due to:</p>
                    <ul>
                        <li>No dependencies found in the analyzed repositories</li>
                        <li>Rate limiting prevented complete analysis</li>
                        <li>Data storage format issue</li>
                    </ul>
                    <p><strong>Available data:</strong></p>
                    <pre class="bg-light p-2 rounded">${JSON.stringify(orgData.data, null, 2)}</pre>
                </div>
            `;
        }

        return `
            <div class="view-header">
                <button class="btn btn-secondary" onclick="viewManager.goBack()">
                    ← Back to Analysis
                </button>
                <h2>📊 ${orgData.organization} - Dependency Overview</h2>
                <p class="text-muted">Analyzed on ${new Date(orgData.timestamp).toLocaleString()}</p>
            </div>

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
                        <div class="category-number">${typeof categoryStats.code === 'object' ? (categoryStats.code.count || 0) : (categoryStats.code || 0)}</div>
                        <div class="category-detail">${typeof categoryStats.code === 'object' ? (categoryStats.code.uniqueDependencies || 0) : 'N/A'} unique</div>
                    </div>
                    <div class="category-card workflow">
                        <h4>⚙️ Workflow Dependencies</h4>
                        <div class="category-number">${typeof categoryStats.workflow === 'object' ? (categoryStats.workflow.count || 0) : (categoryStats.workflow || 0)}</div>
                        <div class="category-detail">${typeof categoryStats.workflow === 'object' ? (categoryStats.workflow.uniqueDependencies || 0) : 'N/A'} unique</div>
                    </div>
                    <div class="category-card infrastructure">
                        <h4>🏗️ Infrastructure Dependencies</h4>
                        <div class="category-number">${typeof categoryStats.infrastructure === 'object' ? (categoryStats.infrastructure.count || 0) : (categoryStats.infrastructure || 0)}</div>
                        <div class="category-detail">${typeof categoryStats.infrastructure === 'object' ? (categoryStats.infrastructure.uniqueDependencies || 0) : 'N/A'} unique</div>
                    </div>
                    <div class="category-card unknown">
                        <h4>❓ Unknown Dependencies</h4>
                        <div class="category-number">${typeof categoryStats.unknown === 'object' ? (categoryStats.unknown.count || 0) : (categoryStats.unknown || 0)}</div>
                        <div class="category-detail">${typeof categoryStats.unknown === 'object' ? (categoryStats.unknown.uniqueDependencies || 0) : 'N/A'} unique</div>
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
                    <h3>🏆 Top Dependencies (${topDeps.length})</h3>
                    <div class="filter-buttons">
                        <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('all')">All</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('code')">Code</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('workflow')">Workflow</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="viewManager.filterDependenciesByCategory('infrastructure')">Infrastructure</button>
                    </div>
                    <div class="dependency-list" id="top-dependencies">
                        ${topDeps.length > 0 ? topDeps.slice(0, 10).map((dep, index) => `
                            <div class="dependency-item ${dep.category?.type || 'unknown'}" onclick="viewManager.showDependencyDetailsFromIndex(${index}, '${orgData.organization}')">
                                <div class="dep-name">${dep.name || 'Unknown'}</div>
                                <div class="dep-version">${dep.version || 'Unknown'}</div>
                                <div class="dep-count">${dep.count || 0} repos</div>
                                <div class="dep-category">${dep.category?.type || 'unknown'}</div>
                            </div>
                        `).join('') : '<p class="text-muted">No dependencies found</p>'}
                    </div>
                </div>

                <div class="section">
                    <h3>📁 Top Repositories (${topRepos.length})</h3>
                    <div class="repository-list">
                        ${topRepos.length > 0 ? topRepos.slice(0, 10).map((repo, index) => `
                            <div class="repository-item" onclick="viewManager.showRepositoryDetailsFromIndex(${index}, '${orgData.organization}')">
                                <div class="repo-name">${repo.owner || 'Unknown'}/${repo.name || 'Unknown'}</div>
                                <div class="repo-deps">${repo.totalDependencies || 0} deps</div>
                                ${repo.categoryBreakdown ? `
                                <div class="repo-categories">
                                    <span class="badge badge-code">${repo.categoryBreakdown.code}</span>
                                    <span class="badge badge-workflow">${repo.categoryBreakdown.workflow}</span>
                                    <span class="badge badge-infrastructure">${repo.categoryBreakdown.infrastructure}</span>
                                </div>
                                ` : ''}
                            </div>
                        `).join('') : '<p class="text-muted">No repositories found</p>'}
                    </div>
                </div>

                <div class="section">
                    <h3>📊 All Dependencies (${allDeps.length})</h3>
                    <div class="search-box">
                        <input type="text" id="dep-search" placeholder="Search dependencies..." onkeyup="viewManager.filterDependencies()">
                    </div>
                    <div class="dependency-grid" id="all-dependencies">
                        ${allDeps.length > 0 ? allDeps.map((dep, index) => `
                            <div class="dependency-card ${dep.category?.type || 'unknown'}" onclick="viewManager.showDependencyDetailsFromAllDepsIndex(${index}, '${orgData.organization}')">
                                <div class="dep-name">${dep.name || 'Unknown'}</div>
                                <div class="dep-version">${dep.version || 'Unknown'}</div>
                                <div class="dep-count">${dep.count || 0} repos</div>
                                <div class="dep-category">${dep.category?.type || 'unknown'}</div>
                            </div>
                        `).join('') : '<p class="text-muted">No dependencies found</p>'}
                    </div>
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
                            <span class="enhancement-icon">⚠️</span>
                            <span>Security vulnerability data</span>
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
        const container = document.getElementById('view-container');
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
    }

    /**
     * Debug method to show raw data
     */
    showRawData(orgData) {
        const container = document.getElementById('view-container');
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
    }
}

// Initialize view manager
const viewManager = new ViewManager(); 