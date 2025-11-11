/**
 * JavaScript for audit.html page
 * Handles audit findings page initialization and data loading
 * Supports multiple audit sections: GitHub Actions, Package Deprecation, Repository Audits
 */

document.addEventListener('DOMContentLoaded', async function() {
    // Wait for required classes to be available
    if (typeof StorageManager === 'undefined') {
        console.error('StorageManager is not defined. Please ensure storage-manager.js is loaded.');
        return;
    }
    
    // Use the global storageManager instance from storage-manager.js
    const storageManager = new StorageManager();
    await storageManager.init();
    
    // Make storageManager available globally
    window.storageManager = storageManager;
    
    // Initialize cache manager if available
    if (typeof CacheManager !== 'undefined' && !window.cacheManager) {
        window.cacheManager = new CacheManager();
    }
    
    // Load analysis list into selector
    await loadAnalysesList();
    
    // Check for filters in URL and pre-select
    const urlParams = new URLSearchParams(window.location.search);
    const severityParam = urlParams.get('severity');
    const sectionParam = urlParams.get('section');
    if (severityParam) {
        const severityFilter = document.getElementById('severityFilter');
        if (severityFilter) {
            severityFilter.value = severityParam.toLowerCase();
        }
    }
    if (sectionParam) {
        const sectionFilter = document.getElementById('sectionFilter');
        if (sectionFilter) {
            sectionFilter.value = sectionParam.toLowerCase();
        }
    }
    
    // Load entry data for audit analysis
    window.loadOrganizationData = async function(name, severityFilter = null, sectionFilter = null) {
        let data;
        
        // If name is '__ALL__' or null/undefined, load combined data
        if (!name || name === '__ALL__') {
            data = await storageManager.getCombinedData();
            if (!data) {
                data = {
                    name: 'All Projects (Combined)',
                    organization: 'All Projects (Combined)',
                    data: {}
                };
            }
        } else {
            data = await storageManager.loadAnalysisDataForOrganization(name);
        }
        
        const container = document.getElementById('audit-analysis-page');
        const noDataSection = document.getElementById('noDataSection');
        
        if (!data || !data.data) {
            container.innerHTML = '<div class="alert alert-warning">No data found for this entry.</div>';
            noDataSection.classList.remove('d-none');
            return;
        }
        
        // Use filters from parameters or URL or form
        if (!severityFilter) {
            const severityEl = document.getElementById('severityFilter');
            severityFilter = severityEl ? severityEl.value : urlParams.get('severity')?.toLowerCase() || 'all';
        }
        if (!sectionFilter) {
            const sectionEl = document.getElementById('sectionFilter');
            sectionFilter = sectionEl ? sectionEl.value : urlParams.get('section')?.toLowerCase() || 'all';
        }
        
        // Render audit findings with all sections
        const html = await generateAllAuditSectionsHTML(data, severityFilter, sectionFilter);
        safeSetHTML(container, html);
        
        // Hide no data section if we have data
        noDataSection.classList.add('d-none');
    };
    
    // Load initial data (default to all projects combined)
    const analysisSelector = document.getElementById('analysisSelector');
    if (analysisSelector && analysisSelector.value) {
        await loadOrganizationData(analysisSelector.value);
    }
    
    // Handle analysis selector change
    analysisSelector.addEventListener('change', async function() {
        await loadOrganizationData(this.value);
    });
    
    // Handle severity filter change
    const severityFilter = document.getElementById('severityFilter');
    if (severityFilter) {
        severityFilter.addEventListener('change', async function() {
            const analysisSelector = document.getElementById('analysisSelector');
            const sectionFilter = document.getElementById('sectionFilter');
            if (analysisSelector && analysisSelector.value) {
                await loadOrganizationData(analysisSelector.value, this.value, sectionFilter?.value || 'all');
            }
        });
    }
    
    // Handle section filter change
    const sectionFilter = document.getElementById('sectionFilter');
    if (sectionFilter) {
        sectionFilter.addEventListener('change', async function() {
            const analysisSelector = document.getElementById('analysisSelector');
            const severityFilter = document.getElementById('severityFilter');
            if (analysisSelector && analysisSelector.value) {
                await loadOrganizationData(analysisSelector.value, severityFilter?.value || 'all', this.value);
            }
        });
    }
    
    // Load analyses list
    async function loadAnalysesList() {
        const analysisSelector = document.getElementById('analysisSelector');
        if (!analysisSelector) return;
        
        try {
            const storageInfo = await storageManager.getStorageInfo();
            const allEntries = [...storageInfo.organizations, ...storageInfo.repositories];
            
            analysisSelector.innerHTML = '<option value="__ALL__">All Projects (Combined)</option>';
            
            if (allEntries.length === 0) {
                // No data available
                return;
            }
            
            // Add individual entries
            allEntries.forEach(entry => {
                const option = document.createElement('option');
                option.value = entry.name;
                option.textContent = `${entry.name} (${entry.dependencies || 0} deps)`;
                analysisSelector.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading analyses list:', error);
        }
    }
    
    /**
     * Generate all audit sections HTML
     */
    async function generateAllAuditSectionsHTML(orgData, severityFilter = 'all', sectionFilter = 'all') {
        let html = '';
        
        // GitHub Actions Audit Section
        if (sectionFilter === 'all' || sectionFilter === 'github-actions') {
            const githubActionsHTML = generateGitHubActionsAuditHTML(orgData, severityFilter);
            if (githubActionsHTML) {
                html += `<div id="github-actions-section" class="audit-section mb-4">${githubActionsHTML}</div>`;
            }
        }
        
        // Package Deprecation Section
        if (sectionFilter === 'all' || sectionFilter === 'package-deprecation') {
            const deprecationHTML = await generatePackageDeprecationHTML(orgData, severityFilter);
            if (deprecationHTML) {
                html += `<div id="package-deprecation-section" class="audit-section mb-4">${deprecationHTML}</div>`;
            }
        }
        
        // Repository Audit Section (only show if explicitly selected, since it's a placeholder)
        if (sectionFilter === 'repository-audit') {
            const repoAuditHTML = generateRepositoryAuditHTML(orgData, severityFilter);
            if (repoAuditHTML) {
                html += `<div id="repository-audit-section" class="audit-section mb-4">${repoAuditHTML}</div>`;
            }
        }
        
        if (!html) {
            return `<div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                No audit findings found for the selected filters.
            </div>`;
        }
        
        return html;
    }
    
    /**
     * Generate GitHub Actions audit findings HTML
     */
    function generateGitHubActionsAuditHTML(orgData, severityFilter = 'all') {
        // Try multiple possible data structure paths
        const githubActionsAnalysis = orgData?.data?.githubActionsAnalysis || 
                                     orgData?.githubActionsAnalysis ||
                                     (orgData?.data && orgData.data.githubActionsAnalysis);
        
        if (!githubActionsAnalysis || !githubActionsAnalysis.findings || githubActionsAnalysis.findings.length === 0) {
            return '';
        }

        let findings = githubActionsAnalysis.findings;
        
        // Filter by severity if specified
        if (severityFilter && severityFilter !== 'all') {
            findings = findings.filter(f => {
                const severity = f.severity || 'warning';
                return severity.toLowerCase() === severityFilter.toLowerCase();
            });
        }
        
        if (findings.length === 0) {
            return '';
        }
        
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
            .sort((a, b) => b[1].length - a[1].length);

        // Calculate statistics
        const stats = {
            total: findings.length,
            high: findings.filter(f => f.severity === 'high' || f.severity === 'error').length,
            medium: findings.filter(f => f.severity === 'medium').length,
            warning: findings.filter(f => f.severity === 'warning').length,
            uniqueActions: githubActionsAnalysis.uniqueActions || 0
        };

        let html = '<div class="card">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fab fa-github me-2"></i>GitHub Actions Audit</h5></div>';
        html += '<div class="card-body">';
        
        // Statistics cards
        html += '<div class="row mb-3">';
        html += `<div class="col-md-3">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3 class="text-primary">${stats.total}</h3>
                    <p class="text-muted mb-0">Total Findings</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3 class="text-danger">${stats.high}</h3>
                    <p class="text-muted mb-0">High Severity</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3 class="text-warning">${stats.medium}</h3>
                    <p class="text-muted mb-0">Medium Severity</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3 class="text-info">${stats.warning}</h3>
                    <p class="text-muted mb-0">Warnings</p>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        // Summary
        html += `<div class="alert alert-info mb-3">
            <strong>Summary:</strong> Found <strong>${stats.total}</strong> audit findings across <strong>${stats.uniqueActions}</strong> GitHub Actions.
        </div>`;

        // Findings by type
        html += '<h6 class="mb-2">Findings by Type</h6>';
        html += '<ul class="list-group mb-3">';
        sortedTypes.forEach(([ruleId, typeFindings]) => {
            const severity = typeFindings[0].severity || 'warning';
            const severityClass = severity === 'high' || severity === 'error' ? 'danger' : 
                                 severity === 'medium' ? 'warning' : 'info';
            html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                <span><span class="badge bg-${severityClass} me-2">${severity}</span>${getFindingName(ruleId)}</span>
                <span class="badge bg-primary rounded-pill">${typeFindings.length}</span>
            </li>`;
        });
        html += '</ul>';

        // Detailed findings
        html += '<h6 class="mb-2">Detailed Findings</h6>';
        html += '<div class="table-responsive"><table class="table table-sm table-hover">';
        html += '<thead><tr><th>Severity</th><th>Rule</th><th>Action</th><th>Message</th><th>Details</th></tr></thead><tbody>';
        
        findings.slice(0, 100).forEach(finding => {
            const severity = finding.severity || 'warning';
            const severityClass = severity === 'high' || severity === 'error' ? 'danger' : 
                                 severity === 'medium' ? 'warning' : 'info';
            const actionLink = finding.action ? 
                `<a href="https://github.com/${finding.action.split('@')[0]}" target="_blank" rel="noreferrer noopener">${escapeHtml(finding.action)}</a>` : 
                'N/A';
            
            html += `<tr>
                <td><span class="badge bg-${severityClass}">${severity}</span></td>
                <td><code>${escapeHtml(finding.rule_id || 'N/A')}</code></td>
                <td>${actionLink}</td>
                <td>${escapeHtml(finding.message || 'N/A')}</td>
                <td>${finding.details ? escapeHtml(finding.details) : ''}</td>
            </tr>`;
        });
        
        if (findings.length > 100) {
            html += `<tr><td colspan="5" class="text-center text-muted">... and ${findings.length - 100} more findings</td></tr>`;
        }
        
        html += '</tbody></table></div>';
        html += '</div></div>';

        return html;
    }
    
    /**
     * Generate Package Deprecation audit findings HTML
     */
    async function generatePackageDeprecationHTML(orgData, severityFilter = 'all') {
        // Get dependencies from the analysis data
        const allDependencies = orgData?.data?.allDependencies || [];
        
        if (!allDependencies || allDependencies.length === 0) {
            return '';
        }
        
        if (!window.cacheManager) {
            return '<div class="alert alert-warning">Cache manager not available. Cannot load package deprecation data.</div>';
        }
        
        // Check each dependency for deprecation warnings
        const deprecatedPackages = [];
        const batchSize = 50;
        
        for (let i = 0; i < allDependencies.length; i += batchSize) {
            const batch = allDependencies.slice(i, i + batchSize);
            const batchChecks = await Promise.all(batch.map(async (dep) => {
                if (dep.packageKey) {
                    try {
                        const packageData = await window.cacheManager.getPackage(dep.packageKey);
                        if (packageData && packageData.warnings && packageData.warnings.isDeprecated) {
                            return {
                                name: dep.name,
                                version: dep.version,
                                ecosystem: dep.ecosystem || 'unknown',
                                repositories: dep.repositories || [],
                                replacement: packageData.warnings.replacement || null,
                                warningType: 'deprecated'
                            };
                        }
                    } catch (e) {
                        // Ignore errors
                    }
                }
                return null;
            }));
            
            deprecatedPackages.push(...batchChecks.filter(p => p !== null));
        }
        
        if (deprecatedPackages.length === 0) {
            return '';
        }
        
        // Filter by severity (deprecated packages are always high severity)
        if (severityFilter && severityFilter !== 'all' && severityFilter !== 'high') {
            return '';
        }
        
        let html = '<div class="card">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-exclamation-triangle me-2"></i>Package Deprecation</h5></div>';
        html += '<div class="card-body">';
        
        // Statistics
        html += '<div class="row mb-3">';
        html += `<div class="col-md-4">
            <div class="card text-center bg-danger bg-opacity-10">
                <div class="card-body">
                    <h3 class="text-danger">${deprecatedPackages.length}</h3>
                    <p class="text-muted mb-0">Deprecated Packages</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3 class="text-primary">${new Set(deprecatedPackages.map(p => p.ecosystem)).size}</h3>
                    <p class="text-muted mb-0">Ecosystems Affected</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3 class="text-primary">${new Set(deprecatedPackages.flatMap(p => p.repositories)).size}</h3>
                    <p class="text-muted mb-0">Repositories Affected</p>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        // Summary
        html += `<div class="alert alert-danger mb-3">
            <strong>Warning:</strong> Found <strong>${deprecatedPackages.length}</strong> deprecated packages that should be replaced or updated.
        </div>`;
        
        // Detailed list
        html += '<h6 class="mb-2">Deprecated Packages</h6>';
        html += '<div class="table-responsive"><table class="table table-sm table-hover">';
        html += '<thead><tr><th>Package</th><th>Version</th><th>Ecosystem</th><th>Repositories</th><th>Replacement</th></tr></thead><tbody>';
        
        deprecatedPackages.forEach(pkg => {
            const repoList = pkg.repositories.length > 3 
                ? `${pkg.repositories.slice(0, 3).join(', ')} and ${pkg.repositories.length - 3} more`
                : pkg.repositories.join(', ');
            
            html += `<tr>
                <td><code>${escapeHtml(pkg.name)}</code></td>
                <td>${escapeHtml(pkg.version)}</td>
                <td><span class="badge bg-secondary">${escapeHtml(pkg.ecosystem)}</span></td>
                <td><small>${escapeHtml(repoList)}</small></td>
                <td>${pkg.replacement ? `<code>${escapeHtml(pkg.replacement)}</code>` : '<span class="text-muted">None specified</span>'}</td>
            </tr>`;
        });
        
        html += '</tbody></table></div>';
        html += '</div></div>';
        
        return html;
    }
    
    /**
     * Generate Repository Audit findings HTML (placeholder for future implementation)
     */
    function generateRepositoryAuditHTML(orgData, severityFilter = 'all') {
        // Placeholder for repository-level audits
        // Future: inactivity detection, signed commits, etc.
        
        const repositories = orgData?.data?.allRepositories || [];
        
        if (!repositories || repositories.length === 0) {
            return '';
        }
        
        // For now, just show a placeholder message
        let html = '<div class="card">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-code-branch me-2"></i>Repository Audit</h5></div>';
        html += '<div class="card-body">';
        html += '<div class="alert alert-info mb-0">';
        html += '<i class="fas fa-info-circle me-2"></i>';
        html += '<strong>Coming Soon:</strong> Repository-level audit findings including inactivity detection, ';
        html += 'signed commits verification, and other repository security checks will be displayed here.';
        html += '</div>';
        html += '</div></div>';
        
        return html;
    }
    
    /**
     * Get finding name from rule ID
     */
    function getFindingName(ruleId) {
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
            'INDIRECT_UNPINNABLE_ACTION': 'Indirect Unpinnable Action'
        };
        return findingNames[ruleId] || ruleId;
    }
    
    /**
     * Safe HTML setter (using ViewManager's method if available)
     */
    function safeSetHTML(element, html) {
        if (window.viewManager && typeof window.viewManager.safeSetHTML === 'function') {
            window.viewManager.safeSetHTML(element, html);
        } else {
            element.innerHTML = html;
        }
    }
    
    /**
     * Escape HTML (using utils if available)
     */
    function escapeHtml(text) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(text);
        }
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
