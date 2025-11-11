/**
 * JavaScript for quality.html page
 * Handles SBOM quality assessment display and interactions
 */

// Quality Page Application
class QualityApp {
    constructor() {
        this.allRepositories = [];
        this.filteredRepositories = [];
        this.currentSort = { column: 'repository', direction: 'asc' };
        this.qualityModal = null;
        this.storageManager = window.storageManager || new StorageManager();
    }

    async init() {
        try {
            // Initialize storage manager
            await this.storageManager.init();
            
            // Initialize modal
            this.qualityModal = new bootstrap.Modal(document.getElementById('qualityDetailsModal'));
            
            // Check for repo parameter in URL
            const urlParams = new URLSearchParams(window.location.search);
            const repoParam = urlParams.get('repo');
            
            // Load data
            console.log('📋 Quality page - Loading combined data...');
            const data = await this.storageManager.getCombinedData();
            console.log('📋 Quality page - Data loaded:', data ? 'yes' : 'no');
            if (data && data.data) {
                console.log(`📋 Quality page - Repositories: ${data.data.allRepositories?.length || 0}`);
            }
            
            if (!data || !data.data || !data.data.allRepositories) {
                console.warn('⚠️ Quality page - No repository data found');
                this.showError('No repository data found. Please run an analysis first.');
                return;
            }

            this.allRepositories = data.data.allRepositories;
            this.populateOrganizations();
            
            // Apply repo filter from URL parameter if present
            if (repoParam) {
                const searchBox = document.getElementById('searchBox');
                if (searchBox) {
                    searchBox.value = repoParam;
                }
            }
            
            this.updateSummaryCards();
            this.applyFilters();

            // Setup event listeners
            this.setupEventListeners();
            
            // Attach event listeners to dynamically generated buttons
            this.attachDynamicEventListeners();
        } catch (error) {
            console.error('Failed to load quality data:', error);
            this.showError('Failed to load quality data: ' + error.message);
        }
    }

    populateOrganizations() {
        // Extract unique organizations from repositories
        const organizations = new Set();
        this.allRepositories.forEach(repo => {
            if (repo.owner) {
                organizations.add(repo.owner);
            }
        });

        // Sort organizations alphabetically
        const sortedOrgs = Array.from(organizations).sort();

        // Populate the dropdown
        const orgFilter = document.getElementById('orgFilter');
        sortedOrgs.forEach(org => {
            const option = document.createElement('option');
            option.value = org;
            option.textContent = org;
            orgFilter.appendChild(option);
        });
    }

    setupEventListeners() {
        // Filter changes
        document.getElementById('orgFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('gradeFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('sbomFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('scoreMin').addEventListener('input', () => this.applyFilters());
        document.getElementById('scoreMax').addEventListener('input', () => this.applyFilters());
        document.getElementById('searchBox').addEventListener('input', () => this.applyFilters());

        // Reset filters
        document.getElementById('resetFilters').addEventListener('click', () => {
            document.getElementById('orgFilter').value = 'all';
            document.getElementById('gradeFilter').value = 'all';
            document.getElementById('sbomFilter').value = 'all';
            document.getElementById('scoreMin').value = '0';
            document.getElementById('scoreMax').value = '100';
            document.getElementById('searchBox').value = '';
            this.applyFilters();
        });

        // Sort headers
        document.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.sort;
                this.sortTable(column);
            });
        });
    }

    attachDynamicEventListeners() {
        // Use event delegation for dynamically generated buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-show-details')) {
                const button = e.target.closest('.btn-show-details');
                const repoName = button.getAttribute('data-repo-name');
                if (repoName) {
                    this.showDetails(repoName);
                }
            }
        });
    }

    updateSummaryCards(selectedOrg = 'all') {
        // Filter repositories by organization if one is selected
        const repositoriesToAnalyze = selectedOrg === 'all' 
            ? this.allRepositories 
            : this.allRepositories.filter(r => r.owner === selectedOrg);
        
        const reposWithSBOM = repositoriesToAnalyze.filter(r => r.qualityAssessment).length;
        const avgQuality = reposWithSBOM > 0 
            ? Math.round(repositoriesToAnalyze
                .filter(r => r.qualityAssessment)
                .reduce((sum, r) => sum + r.qualityAssessment.overallScore, 0) / reposWithSBOM)
            : 0;
        
        // Convert to 0-10 display scale
        const avgQualityDisplay = (avgQuality / 10).toFixed(1);
        
        // Calculate average grade
        const grades = repositoriesToAnalyze
            .filter(r => r.qualityAssessment)
            .map(r => r.qualityAssessment.grade);
        const avgGrade = grades.length > 0 ? this.calculateAverageGrade(grades) : '-';

        // Update summary cards
        document.getElementById('totalRepos').textContent = repositoriesToAnalyze.length;
        document.getElementById('reposWithSBOM').textContent = reposWithSBOM;
        document.getElementById('avgQuality').textContent = avgQualityDisplay;
        document.getElementById('avgGrade').textContent = avgGrade;
        
        // Update summary scope badge
        const summaryScope = document.getElementById('summaryScope');
        if (selectedOrg === 'all') {
            summaryScope.textContent = 'All Repositories';
            summaryScope.className = 'badge bg-secondary';
        } else {
            summaryScope.textContent = selectedOrg;
            summaryScope.className = 'badge bg-primary';
        }
    }

    calculateAverageGrade(grades) {
        const gradeValues = { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 };
        const gradeLabels = ['F', 'D', 'C', 'B', 'A'];
        const avg = grades.reduce((sum, g) => sum + (gradeValues[g] || 0), 0) / grades.length;
        return gradeLabels[Math.round(avg)];
    }

    applyFilters() {
        const orgFilter = document.getElementById('orgFilter').value;
        const gradeFilter = document.getElementById('gradeFilter').value;
        const sbomFilter = document.getElementById('sbomFilter').value;
        const scoreMin = parseInt(document.getElementById('scoreMin').value) || 0;
        const scoreMax = parseInt(document.getElementById('scoreMax').value) || 100;
        const searchTerm = document.getElementById('searchBox').value.toLowerCase();

        // Update summary cards based on selected organization
        this.updateSummaryCards(orgFilter);

        this.filteredRepositories = this.allRepositories.filter(repo => {
            const repoName = `${repo.owner}/${repo.name}`.toLowerCase();
            const hasSBOM = !!repo.qualityAssessment;
            const score = hasSBOM ? repo.qualityAssessment.overallScore : 0;
            const grade = hasSBOM ? repo.qualityAssessment.grade : 'F';

            // Apply filters
            if (orgFilter !== 'all' && repo.owner !== orgFilter) return false;
            if (gradeFilter !== 'all' && grade !== gradeFilter) return false;
            if (sbomFilter === 'has-sbom' && !hasSBOM) return false;
            if (sbomFilter === 'no-sbom' && hasSBOM) return false;
            if (hasSBOM && (score < scoreMin || score > scoreMax)) return false;
            if (searchTerm && !repoName.includes(searchTerm)) return false;

            return true;
        });

        this.sortTable(this.currentSort.column, false);
        this.renderTable();
    }

    sortTable(column, toggleDirection = true) {
        if (toggleDirection && this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            if (!toggleDirection) {
                // Keep current direction
            } else {
                this.currentSort.direction = 'asc';
            }
        }

        this.filteredRepositories.sort((a, b) => {
            let aVal, bVal;

            switch (column) {
                case 'repository':
                    aVal = `${a.owner}/${a.name}`.toLowerCase();
                    bVal = `${b.owner}/${b.name}`.toLowerCase();
                    break;
                case 'sbom':
                    aVal = a.qualityAssessment ? 1 : 0;
                    bVal = b.qualityAssessment ? 1 : 0;
                    break;
                case 'score':
                    aVal = a.qualityAssessment ? a.qualityAssessment.overallScore : 0;
                    bVal = b.qualityAssessment ? b.qualityAssessment.overallScore : 0;
                    break;
                case 'grade':
                    const gradeValues = { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 };
                    aVal = a.qualityAssessment ? (gradeValues[a.qualityAssessment.grade] || 0) : 0;
                    bVal = b.qualityAssessment ? (gradeValues[b.qualityAssessment.grade] || 0) : 0;
                    break;
                default:
                    return 0;
            }

            if (aVal < bVal) return this.currentSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        // Update sort indicators
        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            if (th.dataset.sort === column) {
                th.classList.add(this.currentSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        });

        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('qualityTableBody');
        document.getElementById('visibleCount').textContent = this.filteredRepositories.length;

        if (this.filteredRepositories.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-4">
                        <i class="fas fa-search fa-2x mb-3"></i>
                        <p>No repositories match your filters</p>
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = this.filteredRepositories.map(repo => {
            const hasSBOM = !!repo.qualityAssessment;
            const repoName = `${repo.owner}/${repo.name}`;
            
            if (!hasSBOM) {
                return `
                    <tr>
                        <td><strong>${escapeHtml(repoName)}</strong></td>
                        <td class="text-center">
                            <span class="badge bg-danger sbom-status-badge">
                                <i class="fas fa-times"></i> No SBOM
                            </span>
                        </td>
                        <td class="text-center">-</td>
                        <td class="text-center">-</td>
                        <td class="text-center">
                            <span class="text-muted small">No data available</span>
                        </td>
                    </tr>`;
            }

            const qa = repo.qualityAssessment;
            const gradeColor = this.getGradeColor(qa.grade);
            const scoreColor = this.getScoreColor(qa.overallScore);
            const displayScore = qa.displayScore || (qa.overallScore / 10).toFixed(1);

            return `
                <tr>
                    <td><strong>${escapeHtml(repoName)}</strong></td>
                    <td class="text-center">
                        <span class="badge bg-success sbom-status-badge">
                            <i class="fas fa-check"></i> Has SBOM
                        </span>
                    </td>
                    <td class="text-center">
                        <div class="progress">
                            <div class="progress-bar ${scoreColor} progress-bar-dynamic" role="progressbar" 
                                 style="--progress-width: ${qa.overallScore}%" 
                                 aria-valuenow="${qa.overallScore}" aria-valuemin="0" aria-valuemax="100">
                                ${displayScore}/10
                            </div>
                        </div>
                    </td>
                    <td class="text-center">
                        <span class="badge bg-${gradeColor} fs-6" title="${qa.gradeLabel || ''}">${qa.grade}</span>
                    </td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-primary btn-show-details" data-repo-name="${escapeJsString(repoName)}">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                    </td>
                </tr>`;
        }).join('');
        
        // Re-attach event listeners after rendering
        this.attachDynamicEventListeners();
    }

    showDetails(repoName) {
        const repo = this.allRepositories.find(r => `${r.owner}/${r.name}` === repoName);
        if (!repo || !repo.qualityAssessment) {
            alert('Quality assessment not available for this repository');
            return;
        }

        const qa = repo.qualityAssessment;
        const content = document.getElementById('qualityDetailsContent');

        // Extract all 6 category scores
        const identScore = qa.categories?.identification?.score ?? 0;
        const provenanceScore = qa.categories?.provenance?.score ?? 0;
        const dependenciesScore = qa.categories?.dependencies?.score ?? 0;
        const metadataScore = qa.categories?.metadata?.score ?? 0;
        const licensingScore = qa.categories?.licensing?.score ?? 0;
        const vulnerabilityScore = qa.categories?.vulnerability?.score ?? 0;
        
        const displayScore = qa.displayScore || (qa.overallScore / 10).toFixed(1);
        
        content.innerHTML = `
            <div class="mb-3">
                <h5>${escapeHtml(repoName)}</h5>
                <div class="d-flex gap-3 mb-3">
                    <div class="flex-fill text-center p-3 bg-light rounded">
                        <strong>Overall Score</strong><br>
                        <span class="fs-3 text-${this.getScoreColor(qa.overallScore || 0)}">${displayScore}/10.0</span>
                    </div>
                    <div class="flex-fill text-center p-3 bg-light rounded">
                        <strong>Grade</strong><br>
                        <span class="fs-3 badge bg-${this.getGradeColor(qa.grade || 'F')}">${qa.grade || 'F'}</span>
                    </div>
                </div>
                ${qa.gradeLabel ? `<p class="text-center text-muted"><em>${escapeHtml(qa.gradeLabel)}</em></p>` : ''}
            </div>

            <h6>Category Scores (6 categories, GitHub-optimized weights):</h6>
            <div class="row g-2 mb-3">
                <div class="col-md-6">
                    <div class="p-2 border rounded">
                        <strong>Identification (25%):</strong> ${identScore}/100
                        <div class="progress mt-1 h-8px">
                            <div class="progress-bar ${this.getScoreColor(identScore)} progress-bar-dynamic" 
                                 style="--progress-width: ${identScore}%"></div>
                        </div>
                        ${qa.categories?.identification?.details ? `<small class="text-muted d-block mt-1">${escapeHtml(qa.categories.identification.details)}</small>` : ''}
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="p-2 border rounded">
                        <strong>Provenance (20%):</strong> ${provenanceScore}/100
                        <div class="progress mt-1 h-8px">
                            <div class="progress-bar ${this.getScoreColor(provenanceScore)} progress-bar-dynamic" 
                                 style="--progress-width: ${provenanceScore}%"></div>
                        </div>
                        ${qa.categories?.provenance?.details ? `<small class="text-muted d-block mt-1">${escapeHtml(qa.categories.provenance.details)}</small>` : ''}
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="p-2 border rounded">
                        <strong>Dependencies (10%):</strong> ${dependenciesScore}/100
                        <div class="progress mt-1 h-8px">
                            <div class="progress-bar ${this.getScoreColor(dependenciesScore)} progress-bar-dynamic" 
                                 style="--progress-width: ${dependenciesScore}%"></div>
                        </div>
                        ${qa.categories?.dependencies?.details ? `<small class="text-muted d-block mt-1">${escapeHtml(qa.categories.dependencies.details)}</small>` : ''}
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="p-2 border rounded">
                        <strong>Metadata (10%):</strong> ${metadataScore}/100
                        <div class="progress mt-1 h-8px">
                            <div class="progress-bar ${this.getScoreColor(metadataScore)} progress-bar-dynamic" 
                                 style="--progress-width: ${metadataScore}%"></div>
                        </div>
                        ${qa.categories?.metadata?.details ? `<small class="text-muted d-block mt-1">${escapeHtml(qa.categories.metadata.details)}</small>` : ''}
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="p-2 border rounded">
                        <strong>Licensing (10%):</strong> ${licensingScore}/100
                        <div class="progress mt-1 h-8px">
                            <div class="progress-bar ${this.getScoreColor(licensingScore)} progress-bar-dynamic" 
                                 style="--progress-width: ${licensingScore}%"></div>
                        </div>
                        ${qa.categories?.licensing?.details ? `<small class="text-muted d-block mt-1">${escapeHtml(qa.categories.licensing.details)}</small>` : ''}
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="p-2 border rounded">
                        <strong>Vulnerability (15%):</strong> ${vulnerabilityScore}/100
                        <div class="progress mt-1 h-8px">
                            <div class="progress-bar ${this.getScoreColor(vulnerabilityScore)} progress-bar-dynamic" 
                                 style="--progress-width: ${vulnerabilityScore}%"></div>
                        </div>
                        ${qa.categories?.vulnerability?.details ? `<small class="text-muted d-block mt-1">${escapeHtml(qa.categories.vulnerability.details)}</small>` : ''}
                    </div>
                </div>
            </div>

            ${qa.issues && qa.issues.length > 0 ? `
                <h6>Issues Found:</h6>
                <div class="issues-container">
                    ${qa.issues.map(categoryIssues => `
                        <div class="mb-3">
                            <h6 class="text-muted small mb-2">
                                <i class="fas fa-exclamation-circle me-1"></i>${escapeHtml(categoryIssues.category)}
                            </h6>
                            <ul class="list-group">
                                ${categoryIssues.issues.map(issueMsg => `
                                    <li class="list-group-item">
                                        <i class="fas fa-info-circle text-info me-2"></i>
                                        ${escapeHtml(issueMsg)}
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
            ` : '<p class="text-success"><i class="fas fa-check-circle me-2"></i>No issues found</p>'}
            
            ${qa.summary ? `
                <div class="mt-3 p-3 bg-light rounded">
                    <h6>Summary:</h6>
                    <p class="mb-0">${escapeHtml(qa.summary)}</p>
                </div>
            ` : ''}
        `;

        this.qualityModal.show();
    }

    getGradeColor(grade) {
        const colors = { 'A': 'success', 'B': 'primary', 'C': 'warning', 'D': 'danger', 'F': 'dark' };
        return colors[grade] || 'secondary';
    }

    getScoreColor(score) {
        if (score >= 90) return 'bg-success';
        if (score >= 75) return 'bg-primary';
        if (score >= 60) return 'bg-warning';
        return 'bg-danger';
    }

    showError(message) {
        document.getElementById('qualityTableBody').innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p>${escapeHtml(message)}</p>
                </td>
            </tr>`;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.qualityApp = new QualityApp();
    window.qualityApp.init();
});

