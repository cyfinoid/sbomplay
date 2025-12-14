/**
 * JavaScript for findings.html page
 * Handles security findings page initialization and data loading
 * Focuses on: GitHub Actions security issues, Dependency confusion/hijacking risks
 */

document.addEventListener('DOMContentLoaded', async function() {
    // Wait for required classes to be available
    if (typeof StorageManager === 'undefined') {
        console.error('StorageManager is not defined. Please ensure storage-manager.js is loaded.');
        return;
    }
    
    // Use the global storageManager instance from storage-manager.js
    const storageManager = window.storageManager;
    if (!storageManager) {
        console.error('StorageManager is not available. Please ensure storage-manager.js is loaded.');
        return;
    }
    await storageManager.init();
    
    // Initialize cache manager if available
    if (typeof CacheManager !== 'undefined' && !window.cacheManager) {
        window.cacheManager = new CacheManager();
    }
    
    // Check for filters in URL and pre-select
    const urlParamsObj = getUrlParams(['severity', 'type']);
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('repo')) {
        urlParamsObj.repo = urlParams.get('repo'); // Preserve case for repository names
    }
    if (urlParamsObj.severity) {
        const severityFilter = document.getElementById('severityFilter');
        if (severityFilter) {
            severityFilter.value = urlParamsObj.severity;
        }
    }
    if (urlParamsObj.type) {
        const findingTypeFilter = document.getElementById('findingTypeFilter');
        if (findingTypeFilter) {
            findingTypeFilter.value = urlParamsObj.type;
        }
    }
    
    // Load analysis list into selector
    await loadAnalysesList('analysisSelector', storageManager, document.getElementById('noDataSection'));
    
    async function loadFindingsData() {
        const analysisSelector = document.getElementById('analysisSelector');
        const severityFilterEl = document.getElementById('severityFilter');
        const findingTypeFilterEl = document.getElementById('findingTypeFilter');
        const repoFilterEl = document.getElementById('repoFilter');
        
        if (!analysisSelector) {
            const container = document.getElementById('findings-page-content');
            if (container) {
                safeSetHTML(container, '<div class="alert alert-info">Please select an analysis to view security findings.</div>');
            }
            return;
        }
        
        // Use filters from form or URL
        const severityFilter = severityFilterEl ? severityFilterEl.value : (urlParamsObj.severity || 'all');
        const findingTypeFilter = findingTypeFilterEl ? findingTypeFilterEl.value : (urlParamsObj.type || 'all');
        const repoFilter = repoFilterEl ? repoFilterEl.value : (urlParamsObj.repo || 'all');
        
        await loadOrganizationData(analysisSelector.value, storageManager, {
            severityFilter: severityFilter === 'all' ? null : severityFilter,
            findingTypeFilter: findingTypeFilter === 'all' ? null : findingTypeFilter,
            repoFilter: repoFilter === 'all' ? null : repoFilter,
            containerId: 'findings-page-content',
            noDataSection: document.getElementById('noDataSection'),
            renderFunction: async (data, severityFilter, sectionFilter, repoFilter, categoryFilter) => {
                // Populate repository filter dropdown
                populateRepoFilter(data);
                
                // Set repo filter from URL if present (after populating dropdown)
                if (repoFilter && repoFilterEl) {
                    const option = repoFilterEl.querySelector(`option[value="${repoFilter}"]`);
                    if (option) {
                        repoFilterEl.value = repoFilter;
                    }
                }
                
                const container = document.getElementById('findings-page-content');
                // Get findingTypeFilter from the dropdown since it's not passed through
                const typeFilter = findingTypeFilterEl ? findingTypeFilterEl.value : 'all';
                // Render security findings
                const html = generateSecurityFindingsHTML(data, severityFilter || 'all', typeFilter, repoFilter || 'all');
                safeSetHTML(container, html);
            }
        });
    }
    
    /**
     * Populate repository filter dropdown
     */
    function populateRepoFilter(orgData) {
        const repoFilter = document.getElementById('repoFilter');
        if (!repoFilter) return;
        
        const repositories = orgData?.data?.allRepositories || [];
        const repoKeys = repositories.map(r => `${r.owner}/${r.name}`).sort();
        
        // Store current selection
        const currentValue = repoFilter.value;
        
        // Clear and repopulate
        repoFilter.innerHTML = '<option value="all">All Repositories</option>';
        
        repoKeys.forEach(repoKey => {
            const option = document.createElement('option');
            option.value = repoKey;
            option.textContent = repoKey;
            repoFilter.appendChild(option);
        });
        
        // Restore selection if it still exists
        if (currentValue && repoKeys.includes(currentValue)) {
            repoFilter.value = currentValue;
        } else if (urlParamsObj.repo && repoKeys.includes(urlParamsObj.repo)) {
            repoFilter.value = urlParamsObj.repo;
        }
    }
    
    // Load initial data (default to all projects combined)
    const analysisSelector = document.getElementById('analysisSelector');
    if (analysisSelector) {
        await loadFindingsData();
    }
    
    // Handle analysis selector change
    if (analysisSelector) {
        analysisSelector.addEventListener('change', loadFindingsData);
    }
    
    // Handle severity filter change
    const severityFilter = document.getElementById('severityFilter');
    if (severityFilter) {
        severityFilter.addEventListener('change', loadFindingsData);
    }
    
    // Handle finding type filter change
    const findingTypeFilter = document.getElementById('findingTypeFilter');
    if (findingTypeFilter) {
        findingTypeFilter.addEventListener('change', loadFindingsData);
    }
    
    // Handle repo filter change
    const repoFilter = document.getElementById('repoFilter');
    if (repoFilter) {
        repoFilter.addEventListener('change', loadFindingsData);
    }
    
    // Note: getFindingName, getFindingDescription, getSeverityBadgeClass, and generateRepoListHTML
    // are defined in page-common.js to avoid code duplication across audit-page.js and findings-page.js
    
    /**
     * Generate security findings HTML
     * Combines GitHub Actions findings and Dependency Confusion findings
     */
    function generateSecurityFindingsHTML(orgData, severityFilter = 'all', findingTypeFilter = 'all', repoFilter = 'all') {
        const allFindings = [];
        
        // === Collect GitHub Actions findings ===
        if (findingTypeFilter === 'all' || findingTypeFilter === 'github-actions') {
            const githubActionsAnalysis = orgData?.data?.githubActionsAnalysis;
            if (githubActionsAnalysis) {
                let gaFindings = [];
                
                // Collect findings from repositories (they have repository context)
                if (githubActionsAnalysis.repositories && Array.isArray(githubActionsAnalysis.repositories)) {
                    githubActionsAnalysis.repositories.forEach(repoResult => {
                        if (repoResult.findings && Array.isArray(repoResult.findings)) {
                            repoResult.findings.forEach(finding => {
                                gaFindings.push({
                                    ...finding,
                                    repository: finding.repository || repoResult.repository || null
                                });
                            });
                        }
                    });
                }
                
                // Fallback: use top-level findings if repositories structure not available
                if (gaFindings.length === 0 && githubActionsAnalysis.findings && githubActionsAnalysis.findings.length > 0) {
                    gaFindings = githubActionsAnalysis.findings;
                }
                
                // Filter by repository if specified
                if (repoFilter && repoFilter !== 'all') {
                    gaFindings = gaFindings.filter(f => f.repository === repoFilter);
                }
                
                // Filter by severity
                if (severityFilter && severityFilter !== 'all') {
                    gaFindings = gaFindings.filter(f => {
                        const severity = f.severity || 'warning';
                        return severity.toLowerCase() === severityFilter.toLowerCase();
                    });
                }
                
                gaFindings.forEach(finding => {
                    allFindings.push({
                        category: 'github-actions',
                        type: finding.rule_id || 'UNKNOWN',
                        typeName: getFindingName(finding.rule_id || 'UNKNOWN'),
                        description: getFindingDescription(finding.rule_id || 'UNKNOWN'),
                        severity: finding.severity || 'warning',
                        action: finding.action,
                        repository: finding.repository || null,
                        file: finding.file || null,
                        line: finding.line || null,
                        message: finding.message || '',
                        details: finding.details || '',
                        workflowLocations: finding.workflowLocations || null,
                        actionRepository: finding.actionRepository || null,
                        actionDockerfile: finding.actionDockerfile || null
                    });
                });
            }
        }
        
        // === Collect Dependency Confusion findings ===
        if (findingTypeFilter === 'all' || findingTypeFilter === 'dependency-confusion') {
            const allDependencies = orgData?.data?.allDependencies || [];
            
            // HIGH-CONFIDENCE: Namespace not found (more severe - attacker can register entire namespace)
            const namespaceNotFoundDeps = allDependencies.filter(dep => dep.namespaceNotFound === true);
            namespaceNotFoundDeps.forEach(dep => {
                const repos = dep.repositories || [];
                
                // Filter by repository
                if (repoFilter && repoFilter !== 'all' && !repos.includes(repoFilter)) {
                    return;
                }
                
                // Filter by severity (these are always high)
                if (severityFilter && severityFilter !== 'all' && severityFilter !== 'high') {
                    return;
                }
                
                // Use confusionPurlName if available (when PURL name differs from SBOM name)
                const checkedName = dep.confusionPurlName || dep.name;
                const checkedPurl = dep.confusionPurl || dep.purl || null;
                
                allFindings.push({
                    category: 'dependency-confusion',
                    type: 'NAMESPACE_NOT_IN_REGISTRY',
                    typeName: 'HIGH-CONFIDENCE Dependency Confusion (Namespace Missing)',
                    description: getFindingDescription('NAMESPACE_NOT_IN_REGISTRY'),
                    severity: 'high',
                    package: `${checkedName}@${dep.version || 'unknown'}`,
                    sbomName: dep.name,  // Original SBOM name for reference
                    purl: checkedPurl,
                    ecosystem: dep.category?.ecosystem || 'unknown',
                    repository: repos.length > 0 ? repos[0] : null,
                    repositories: repos,
                    confusionEvidence: dep.confusionEvidence || null,
                    message: `Namespace for "${checkedName}" not found in public registry (${dep.category?.ecosystem || 'unknown'}). HIGH-CONFIDENCE dependency confusion risk - attacker could register entire namespace.`
                });
            });
            
            // Package not found (less severe than namespace not found, but still a risk)
            const packageNotFoundDeps = allDependencies.filter(dep => 
                dep.registryNotFound === true && !dep.namespaceNotFound
            );
            packageNotFoundDeps.forEach(dep => {
                const repos = dep.repositories || [];
                
                // Filter by repository
                if (repoFilter && repoFilter !== 'all' && !repos.includes(repoFilter)) {
                    return;
                }
                
                // Filter by severity (these are high)
                if (severityFilter && severityFilter !== 'all' && severityFilter !== 'high') {
                    return;
                }
                
                // Use confusionPurlName if available (when PURL name differs from SBOM name)
                const checkedName = dep.confusionPurlName || dep.name;
                const checkedPurl = dep.confusionPurl || dep.purl || null;
                
                allFindings.push({
                    category: 'dependency-confusion',
                    type: 'PACKAGE_NOT_IN_REGISTRY',
                    typeName: 'Potential Dependency Confusion',
                    description: getFindingDescription('PACKAGE_NOT_IN_REGISTRY'),
                    severity: 'high',
                    package: `${checkedName}@${dep.version || 'unknown'}`,
                    sbomName: dep.name,  // Original SBOM name for reference
                    purl: checkedPurl,
                    ecosystem: dep.category?.ecosystem || 'unknown',
                    repository: repos.length > 0 ? repos[0] : null,
                    repositories: repos,
                    confusionEvidence: dep.confusionEvidence || null,
                    message: `Package "${checkedName}" not found in public registry (${dep.category?.ecosystem || 'unknown'}). Could be hijacked via dependency confusion attack.`
                });
            });
        }
        
        if (allFindings.length === 0) {
            return `<div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                <strong>No security findings!</strong> No GitHub Actions security issues or dependency confusion risks were detected for the selected filters.
            </div>`;
        }
        
        // Group findings by type
        const findingsByType = new Map();
        allFindings.forEach(finding => {
            const key = `${finding.category}:${finding.type}`;
            if (!findingsByType.has(key)) {
                findingsByType.set(key, {
                    category: finding.category,
                    type: finding.type,
                    typeName: finding.typeName,
                    description: finding.description,
                    severity: finding.severity,
                    instances: []
                });
            }
            findingsByType.get(key).instances.push(finding);
        });
        
        // Sort by severity (high first) then by count
        const sortedTypes = Array.from(findingsByType.entries()).sort((a, b) => {
            const severityOrder = { 'high': 3, 'error': 3, 'medium': 2, 'warning': 1, 'low': 0 };
            const aSev = severityOrder[a[1].severity] || 0;
            const bSev = severityOrder[b[1].severity] || 0;
            if (aSev !== bSev) return bSev - aSev;
            return b[1].instances.length - a[1].instances.length;
        });
        
        // Calculate statistics
        const stats = {
            total: allFindings.length,
            high: allFindings.filter(f => f.severity === 'high' || f.severity === 'error').length,
            medium: allFindings.filter(f => f.severity === 'medium').length,
            warning: allFindings.filter(f => f.severity === 'warning').length,
            low: allFindings.filter(f => f.severity === 'low').length,
            uniqueTypes: sortedTypes.length,
            githubActions: allFindings.filter(f => f.category === 'github-actions').length,
            dependencyConfusion: allFindings.filter(f => f.category === 'dependency-confusion').length
        };
        
        let html = '<div class="card mb-4">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-shield-alt me-2"></i>Security Findings Summary</h5></div>';
        html += '<div class="card-body">';
        
        // Statistics cards
        html += '<div class="row mb-4">';
        html += `<div class="col-md-2">
            <div class="card bg-light">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0">${stats.total}</h3>
                    <small class="text-muted">Total Findings</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-2">
            <div class="card ${stats.high > 0 ? 'bg-danger text-white' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0">${stats.high}</h3>
                    <small class="${stats.high > 0 ? '' : 'text-muted'}">High</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-2">
            <div class="card ${stats.medium > 0 ? 'bg-warning' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0">${stats.medium}</h3>
                    <small class="${stats.medium > 0 ? '' : 'text-muted'}">Medium</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-2">
            <div class="card ${stats.warning > 0 ? 'bg-info' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0">${stats.warning}</h3>
                    <small class="${stats.warning > 0 ? '' : 'text-muted'}">Warning</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-2">
            <div class="card bg-light">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0"><i class="fab fa-github"></i> ${stats.githubActions}</h3>
                    <small class="text-muted">GH Actions</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-2">
            <div class="card bg-light">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0"><i class="fas fa-box"></i> ${stats.dependencyConfusion}</h3>
                    <small class="text-muted">Dep Confusion</small>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        html += '</div></div>';
        
        // Findings grouped by type
        sortedTypes.forEach(([key, typeData], index) => {
            const collapseId = `finding-type-${index}`;
            const categoryIcon = typeData.category === 'github-actions' ? 'fab fa-github' : 'fas fa-box';
            const categoryLabel = typeData.category === 'github-actions' ? 'GitHub Actions' : 'Dependency Confusion';
            
            html += `<div class="card mb-3">
                <div class="card-header cursor-pointer" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge ${getSeverityBadgeClass(typeData.severity)}">${typeData.severity.toUpperCase()}</span>
                            <span class="badge bg-secondary"><i class="${categoryIcon} me-1"></i>${categoryLabel}</span>
                            <strong>${escapeHtml(typeData.typeName)}</strong>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-primary">${typeData.instances.length} finding${typeData.instances.length !== 1 ? 's' : ''}</span>
                            <i class="fas fa-chevron-down"></i>
                        </div>
                    </div>
                </div>
                <div class="collapse" id="${collapseId}">
                    <div class="card-body">
                        <p class="text-muted mb-3">${escapeHtml(typeData.description)}</p>
                        <div class="table-responsive">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        ${typeData.category === 'github-actions' ? 
                                            '<th>Action/File</th><th>Repository</th><th>Message</th>' :
                                            '<th>Package</th><th>Ecosystem</th><th>Repositories</th><th>Message</th>'
                                        }
                                    </tr>
                                </thead>
                                <tbody>
                                    ${typeData.instances.map(instance => {
                                        if (typeData.category === 'github-actions') {
                                            const actionDisplay = instance.action ? escapeHtml(instance.action) : (instance.file ? escapeHtml(instance.file) : '-');
                                            const repoDisplay = instance.repository ? 
                                                `<a href="https://github.com/${escapeHtml(instance.repository)}" target="_blank" rel="noreferrer noopener"><i class="fab fa-github me-1"></i>${escapeHtml(instance.repository)}</a>` : 
                                                '-';
                                            return `<tr>
                                                <td><code class="small">${actionDisplay}</code>${instance.line ? ` (line ${instance.line})` : ''}</td>
                                                <td>${repoDisplay}</td>
                                                <td class="small">${escapeHtml(instance.message || instance.details || '-')}</td>
                                            </tr>`;
                                        } else {
                                            // Dependency confusion
                                            // Show PURL if available, and note if SBOM name differs
                                            const packageDisplay = escapeHtml(instance.package || '-');
                                            const purlDisplay = instance.purl ? `<br><small class="text-muted">PURL: ${escapeHtml(instance.purl)}</small>` : '';
                                            const sbomNote = (instance.sbomName && instance.sbomName !== instance.package?.split('@')[0]) 
                                                ? `<br><small class="text-muted">SBOM name: ${escapeHtml(instance.sbomName)}</small>` 
                                                : '';
                                            
                                            return `<tr>
                                                <td><code class="small">${packageDisplay}</code>${purlDisplay}${sbomNote}</td>
                                                <td><span class="badge bg-secondary">${escapeHtml(instance.ecosystem || '-')}</span></td>
                                                <td>${instance.repositories && instance.repositories.length > 0 ? generateRepoListHTML(instance.repositories) : '-'}</td>
                                                <td class="small">${escapeHtml(instance.message || '-')}</td>
                                            </tr>`;
                                        }
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        });
        
        return html;
    }
});
