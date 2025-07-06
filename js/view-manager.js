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
        const stats = orgData.data.statistics;
        const topDeps = orgData.data.topDependencies;
        const topRepos = orgData.data.topRepositories;
        const allDeps = orgData.data.allDependencies;
        const allRepos = orgData.data.allRepositories;

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
                    <div class="stat-number">${stats.totalRepositories}</div>
                    <div class="stat-detail">${stats.processedRepositories} processed</div>
                </div>
                <div class="stat-card">
                    <h3>📦 Dependencies</h3>
                    <div class="stat-number">${stats.totalDependencies}</div>
                    <div class="stat-detail">${stats.averageDependenciesPerRepo} avg per repo</div>
                </div>
                <div class="stat-card">
                    <h3>✅ Success Rate</h3>
                    <div class="stat-number">${stats.successfulRepositories}</div>
                    <div class="stat-detail">${stats.failedRepositories} failed</div>
                </div>
            </div>

            <div class="view-sections">
                <div class="section">
                    <h3>🏆 Top Dependencies</h3>
                    <div class="dependency-list">
                        ${topDeps.slice(0, 10).map(dep => `
                            <div class="dependency-item" onclick="viewManager.showDependencyDetails(${JSON.stringify(dep)}, ${JSON.stringify(orgData)})">
                                <div class="dep-name">${dep.name}</div>
                                <div class="dep-version">${dep.version}</div>
                                <div class="dep-count">${dep.count} repos</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="section">
                    <h3>📁 Top Repositories</h3>
                    <div class="repository-list">
                        ${topRepos.slice(0, 10).map(repo => `
                            <div class="repository-item" onclick="viewManager.showRepositoryDetails(${JSON.stringify(repo)}, ${JSON.stringify(orgData)})">
                                <div class="repo-name">${repo.owner}/${repo.name}</div>
                                <div class="repo-deps">${repo.totalDependencies} deps</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="section">
                    <h3>📊 All Dependencies (${allDeps.length})</h3>
                    <div class="search-box">
                        <input type="text" id="dep-search" placeholder="Search dependencies..." onkeyup="viewManager.filterDependencies()">
                    </div>
                    <div class="dependency-grid" id="all-dependencies">
                        ${allDeps.map(dep => `
                            <div class="dependency-card" onclick="viewManager.showDependencyDetails(${JSON.stringify(dep)}, ${JSON.stringify(orgData)})">
                                <div class="dep-name">${dep.name}</div>
                                <div class="dep-version">${dep.version}</div>
                                <div class="dep-count">${dep.count} repos</div>
                            </div>
                        `).join('')}
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
                <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverview(${JSON.stringify(orgData)})">
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
                    </div>
                </div>

                <div class="detail-section">
                    <h3>📁 Used in Repositories</h3>
                    <div class="repository-list">
                        ${matchingRepos.map(repo => `
                            <div class="repository-item">
                                <div class="repo-name">${repo.owner}/${repo.name}</div>
                                <div class="repo-deps">${repo.totalDependencies} total deps</div>
                            </div>
                        `).join('')}
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
                <button class="btn btn-secondary" onclick="viewManager.showOrganizationOverview(${JSON.stringify(orgData)})">
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
                        ${repoDeps.map(dep => `
                            <div class="dependency-card" onclick="viewManager.showDependencyDetails(${JSON.stringify({name: dep.name, version: dep.version, count: 1, repositories: [`${repo.owner}/${repo.name}`]})}, ${JSON.stringify(orgData)})">
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
            document.getElementById('analysis-section').style.display = 'block';
            document.getElementById('view-container').style.display = 'none';
        } else if (this.currentView === 'dependency' || this.currentView === 'repository') {
            // Go back to organization overview
            this.showOrganizationOverview(this.currentOrganization);
        }
    }
}

// Initialize view manager
const viewManager = new ViewManager(); 