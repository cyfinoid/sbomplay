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
    // Note: getUrlParams lowercases values, so we need to get repo separately to preserve case
    const urlParamsObj = getUrlParams(['severity', 'section']);
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
    if (urlParamsObj.section) {
        const sectionFilter = document.getElementById('sectionFilter');
        if (sectionFilter) {
            sectionFilter.value = urlParamsObj.section;
        }
    }
    // Note: repo filter will be set after repositories are loaded
    
    // Load analysis list into selector
    await loadAnalysesList('analysisSelector', storageManager, document.getElementById('noDataSection'));
    
    async function loadAuditData() {
        const analysisSelector = document.getElementById('analysisSelector');
        const severityFilterEl = document.getElementById('severityFilter');
        const sectionFilterEl = document.getElementById('sectionFilter');
        const repoFilterEl = document.getElementById('repoFilter');
        
        if (!analysisSelector) {
            const container = document.getElementById('audit-analysis-page');
            if (container) {
                container.innerHTML = '<div class="alert alert-info">Please select an analysis to view audit findings.</div>';
            }
            return;
        }
        
        // Allow empty analysisSelector.value - it means "All Analyses (aggregated)"
        
        // Use filters from form or URL
        const severityFilter = severityFilterEl ? severityFilterEl.value : (urlParamsObj.severity || 'all');
        const sectionFilter = sectionFilterEl ? sectionFilterEl.value : (urlParamsObj.section || 'all');
        const repoFilter = repoFilterEl ? repoFilterEl.value : (urlParamsObj.repo || 'all');
        
        await loadOrganizationData(analysisSelector.value, storageManager, {
            severityFilter: severityFilter === 'all' ? null : severityFilter,
            sectionFilter: sectionFilter === 'all' ? null : sectionFilter,
            repoFilter: repoFilter === 'all' ? null : repoFilter,
            containerId: 'audit-analysis-page',
            noDataSection: document.getElementById('noDataSection'),
            renderFunction: async (data, severityFilter, sectionFilter, repoFilter, categoryFilter) => {
                // Populate repository filter dropdown
                populateRepoFilter(data);
                
                // Set repo filter from URL if present (after populating dropdown)
                // Use the repoFilter passed from loadOrganizationData which already handles URL params
                if (repoFilter && repoFilterEl) {
                    const option = repoFilterEl.querySelector(`option[value="${repoFilter}"]`);
                    if (option) {
                        repoFilterEl.value = repoFilter;
                    }
                }
                
                const container = document.getElementById('audit-analysis-page');
                // Render audit findings with all sections
                const html = await generateAllAuditSectionsHTML(data, severityFilter || 'all', sectionFilter || 'all', repoFilter || 'all');
                safeSetHTML(container, html);
            }
        });
    }
    
    /**
     * Generate repository list HTML with modal support for many repos
     * @param {Array} repositories - Array of repository names (e.g., ['owner/repo1', 'owner/repo2'])
     * @returns {string} HTML string with repository links, and modal if needed
     */
    function generateRepoListHTML(repositories) {
        const repoCount = repositories.length;
        const repoLinks = repositories.map(r => 
            `<a href="https://github.com/${r}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><i class="fab fa-github me-1"></i>${escapeHtml(r)}</a>`
        );
        
        if (repoCount <= 3) {
            // Show all repositories if 3 or fewer
            return repoLinks.join(', ');
        } else {
            // Show first 3 with clickable link to modal for 4+ repos
            const modalId = `repos-modal-${Math.random().toString(36).substr(2, 9)}`;
            const visibleRepos = repoLinks.slice(0, 3).join(', ');
            
            return `${visibleRepos} 
                <a href="#" class="text-primary" data-bs-toggle="modal" data-bs-target="#${modalId}" onclick="event.preventDefault();">
                    and ${repoCount - 3} more
                </a>
                <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">All Repositories (${repoCount})</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <div class="list-group">
                                    ${repositories.map((repo, idx) => `
                                        <div class="list-group-item">
                                            <div class="d-flex align-items-center gap-2">
                                                <span class="badge bg-secondary">${idx + 1}</span>
                                                <a href="https://github.com/${repo}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">
                                                    <i class="fab fa-github me-1"></i>${escapeHtml(repo)}
                                                </a>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        }
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
        // Load data even if value is empty string (aggregated view)
        await loadAuditData();
    }
    
    // Handle analysis selector change
    if (analysisSelector) {
        analysisSelector.addEventListener('change', loadAuditData);
    }
    
    // Handle severity filter change
    const severityFilter = document.getElementById('severityFilter');
    if (severityFilter) {
        severityFilter.addEventListener('change', loadAuditData);
    }
    
    // Handle section filter change
    const sectionFilter = document.getElementById('sectionFilter');
    if (sectionFilter) {
        sectionFilter.addEventListener('change', loadAuditData);
    }
    
    // Handle repository filter change
    const repoFilter = document.getElementById('repoFilter');
    if (repoFilter) {
        repoFilter.addEventListener('change', loadAuditData);
    }
    
    
    /**
     * Generate all audit sections HTML
     */
    async function generateAllAuditSectionsHTML(orgData, severityFilter = 'all', sectionFilter = 'all', repoFilter = 'all') {
        let html = '';
        
        // Unified Security & SBOM Audit Findings (combines GitHub Actions and SBOM Deficiencies)
        if (sectionFilter === 'all' || sectionFilter === 'github-actions' || sectionFilter === 'sbom-deficiencies') {
            const unifiedHTML = generateUnifiedAuditFindingsHTML(orgData, severityFilter, repoFilter);
            if (unifiedHTML) {
                html += `<div id="unified-audit-findings-section" class="audit-section mb-4">${unifiedHTML}</div>`;
            }
        }
        
        // Package Deprecation Section
        if (sectionFilter === 'all' || sectionFilter === 'package-deprecation') {
            const deprecationHTML = await generatePackageDeprecationHTML(orgData, severityFilter, repoFilter);
            if (deprecationHTML) {
                html += `<div id="package-deprecation-section" class="audit-section mb-4">${deprecationHTML}</div>`;
            }
        }
        
        // Version Drift Section
        if (sectionFilter === 'all' || sectionFilter === 'version-drift') {
            const versionDriftHTML = await generateVersionDriftHTML(orgData, severityFilter, repoFilter);
            if (versionDriftHTML) {
                html += `<div id="version-drift-section" class="audit-section mb-4">${versionDriftHTML}</div>`;
            }
        }
        
        // Stale Dependencies Section
        if (sectionFilter === 'all' || sectionFilter === 'stale-dependencies') {
            const staleHTML = await generateStaleDependenciesHTML(orgData, severityFilter, repoFilter);
            if (staleHTML) {
                html += `<div id="stale-dependencies-section" class="audit-section mb-4">${staleHTML}</div>`;
            }
        }
        
        // EOX (End-of-Life) Dependencies Section
        if (sectionFilter === 'all' || sectionFilter === 'eox-dependencies') {
            const eoxHTML = await generateEOXDependenciesHTML(orgData, severityFilter, repoFilter);
            if (eoxHTML) {
                html += `<div id="eox-dependencies-section" class="audit-section mb-4">${eoxHTML}</div>`;
            }
        }
        
        // License Compatibility Section
        if (sectionFilter === 'all' || sectionFilter === 'license-compatibility') {
            const licenseHTML = await generateLicenseCompatibilityHTML(orgData, severityFilter, repoFilter);
            if (licenseHTML) {
                html += `<div id="license-compatibility-section" class="audit-section mb-4">${licenseHTML}</div>`;
            }
        }
        
        // SBOM Audit Section
        if (sectionFilter === 'all' || sectionFilter === 'sbom-audit') {
            const sbomAuditHTML = await generateSBOMAuditHTML(orgData, severityFilter, repoFilter);
            if (sbomAuditHTML) {
                html += `<div id="sbom-audit-section" class="audit-section mb-4">${sbomAuditHTML}</div>`;
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
     * Get finding description from rule ID
     */
    function getFindingDescription(ruleId) {
        const descriptions = {
            'UNPINNED_ACTION_REFERENCE': 'Actions referenced without a commit SHA are mutable and can change, posing security risks. Always pin actions to a full 40-character commit SHA.',
            'MUTABLE_TAG_REFERENCE': 'Tags like "latest", "main", or version ranges can change over time. Use immutable commit SHAs instead.',
            'DOCKER_FLOATING_TAG': 'Docker images using floating tags (e.g., "latest", version ranges) are not immutable and can introduce unexpected changes.',
            'DOCKER_IMPLICIT_LATEST': 'Docker images without explicit tags default to "latest", which is mutable and insecure.',
            'DOCKERFILE_FLOATING_BASE_IMAGE': 'Dockerfile base images using floating tags can change, affecting build reproducibility and security.',
            'DOCKER_UNPINNED_DEPENDENCIES': 'Docker container dependencies should be pinned to specific versions for security and reproducibility.',
            'DOCKER_REMOTE_CODE_NO_INTEGRITY': 'Remote code execution in Docker without integrity checks can lead to supply chain attacks.',
            'COMPOSITE_NESTED_UNPINNED_ACTION': 'Composite actions calling other actions without pinning create nested security risks.',
            'COMPOSITE_UNPINNED_DEPENDENCIES': 'Composite actions with unpinned dependencies can introduce vulnerabilities.',
            'COMPOSITE_REMOTE_CODE_NO_INTEGRITY': 'Composite actions executing remote code without integrity verification pose security risks.',
            'JS_REMOTE_CODE_NO_INTEGRITY': 'JavaScript actions executing remote code without integrity checks can be compromised.',
            'JS_RUNTIME_UNPINNED_DEPENDENCIES': 'JavaScript actions with unpinned runtime dependencies may include vulnerable packages.',
            'INDIRECT_UNPINNABLE_ACTION': 'Actions that cannot be pinned due to indirect references create security blind spots.',
            'PACKAGE_NOT_IN_REGISTRY': 'Package not found in public registry. This could indicate a private/internal package that is vulnerable to dependency confusion attacks. Attackers can register a package with the same name on public registries.',
            'PULL_REQUEST_TARGET_CHECKOUT': 'Dangerous pattern: pull_request_target workflow checks out PR code, which can execute untrusted code with elevated permissions.',
            'EXCESSIVE_WORKFLOW_PERMISSIONS': 'Workflow uses broad permissions like write-all, violating the principle of least privilege.',
            'EXCESSIVE_JOB_PERMISSIONS': 'Job uses write-all permissions. Specify only the required permissions.',
            'POTENTIAL_HARDCODED_SECRET': 'Environment variable appears to contain a hardcoded secret. Use GitHub Secrets instead.'
        };
        return descriptions[ruleId] || 'Security issue detected.';
    }
    
    /**
     * Generate unified audit findings HTML with collapsible sections
     * Combines GitHub Actions and SBOM Deficiencies
     */
    function generateUnifiedAuditFindingsHTML(orgData, severityFilter = 'all', repoFilter = 'all') {
        const allFindings = [];
        
        // Collect GitHub Actions findings
        const githubActionsAnalysis = orgData?.data?.githubActionsAnalysis;
        if (githubActionsAnalysis) {
            let gaFindings = [];
            
            // Collect findings from repositories (they have repository context)
            if (githubActionsAnalysis.repositories && Array.isArray(githubActionsAnalysis.repositories)) {
                githubActionsAnalysis.repositories.forEach(repoResult => {
                    if (repoResult.findings && Array.isArray(repoResult.findings)) {
                        // Add repository info to each finding if not already present
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
                    // Preserve Docker finding context
                    workflowLocations: finding.workflowLocations || null,
                    actionRepository: finding.actionRepository || null,
                    actionDockerfile: finding.actionDockerfile || null
                });
            });
        }
        
        // Collect SBOM Deficiencies findings
        const repositories = orgData?.data?.allRepositories || [];
        let filteredRepos = repositories;
        if (repoFilter && repoFilter !== 'all') {
            filteredRepos = repositories.filter(r => `${r.owner}/${r.name}` === repoFilter);
        }
        
        if (typeof SBOMQualityProcessor !== 'undefined') {
            filteredRepos.forEach(repo => {
                if (!repo.qualityAssessment) return;
                
                const repoKey = `${repo.owner}/${repo.name}`;
                const qa = repo.qualityAssessment;
                
                // Collect issues from all categories
                const categories = ['identification', 'licensing', 'metadata', 'dependencies'];
                categories.forEach(category => {
                    if (qa.categories?.[category]?.issues) {
                        qa.categories[category].issues.forEach(issue => {
                            let type = null;
                            let typeName = null;
                            let description = null;
                            let severity = 'medium';
                            
                            if (issue.includes('missing version')) {
                                type = 'SBOM_MISSING_VERSION';
                                typeName = 'Missing Version Information';
                                description = 'SBOM packages without version information cannot be properly tracked or scanned for vulnerabilities.';
                                severity = 'high';
                            } else if (issue.includes('Missing component name')) {
                                type = 'SBOM_MISSING_COMPONENT_NAME';
                                typeName = 'Missing Component Name';
                                description = 'SBOM packages without component names cannot be properly identified.';
                                severity = 'high';
                            } else if (issue.includes('missing SPDXID')) {
                                type = 'SBOM_MISSING_SPDXID';
                                typeName = 'Missing SPDXID';
                                description = 'SPDXID is required for proper SBOM structure and package identification.';
                                severity = 'medium';
                            } else if (issue.includes('missing or invalid PURL') || issue.includes('no external references')) {
                                type = 'SBOM_MISSING_PURL';
                                typeName = 'Missing PURL Identifier';
                                description = 'PURL (Package URL) identifiers are critical for vulnerability scanning and package tracking.';
                                severity = 'high';
                            } else if (issue.includes('NOASSERTION') || issue.includes('missing license')) {
                                type = 'SBOM_MISSING_LICENSE';
                                typeName = 'Missing License Information';
                                description = 'Packages without license information create compliance and legal risks.';
                                severity = 'medium';
                            } else if (issue.includes('Missing copyright')) {
                                type = 'SBOM_MISSING_COPYRIGHT';
                                typeName = 'Missing Copyright Information';
                                description = 'Copyright information helps identify package ownership and licensing terms.';
                                severity = 'low';
                            } else if (issue.includes('Missing download location')) {
                                type = 'SBOM_MISSING_DOWNLOAD_LOCATION';
                                typeName = 'Missing Download Location';
                                description = 'Download locations help verify package authenticity and enable reproducible builds.';
                                severity = 'low';
                            } else if (issue.includes('Missing relationships')) {
                                type = 'SBOM_MISSING_RELATIONSHIPS';
                                typeName = 'Missing Relationship Data';
                                description = 'Dependency relationships are essential for understanding the dependency graph.';
                                severity = 'medium';
                            }
                            
                            if (type) {
                                // Filter by severity
                                if (severityFilter && severityFilter !== 'all' && severity !== severityFilter) {
                                    return;
                                }
                                
                                allFindings.push({
                                    category: 'sbom-deficiencies',
                                    type: type,
                                    typeName: typeName,
                                    description: description,
                                    severity: severity,
                                    repository: repoKey,
                                    message: issue,
                                    details: issue
                                });
                            }
                        });
                    }
                });
            });
        }
        
        // Collect Dependency Confusion findings (packages not found in public registries)
        const allDependencies = orgData?.data?.allDependencies || [];
        const notFoundDeps = allDependencies.filter(dep => dep.registryNotFound === true);
        if (notFoundDeps.length > 0) {
            notFoundDeps.forEach(dep => {
                const repos = dep.repositories || [];
                allFindings.push({
                    category: 'dependency-confusion',
                    type: 'PACKAGE_NOT_IN_REGISTRY',
                    typeName: 'Potential Dependency Confusion',
                    description: getFindingDescription('PACKAGE_NOT_IN_REGISTRY'),
                    severity: 'high',
                    package: `${dep.name}@${dep.version || 'unknown'}`,
                    ecosystem: dep.category?.ecosystem || 'unknown',
                    repository: repos.length > 0 ? repos[0] : null,
                    repositories: repos,
                    message: `Package "${dep.name}" not found in public registry (${dep.category?.ecosystem || 'unknown'}). Could be hijacked via dependency confusion attack.`
                });
            });
            console.log(`📍 Found ${notFoundDeps.length} dependency confusion risks`);
        }
        
        if (allFindings.length === 0) {
            return '';
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
            const severityOrder = { 'high': 3, 'medium': 2, 'warning': 1, 'low': 0 };
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
            uniqueTypes: sortedTypes.length
        };
        
        let html = '<div class="card">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-shield-alt me-2"></i>Security & SBOM Audit Findings</h5></div>';
        html += '<div class="card-body">';
        
        // Statistics cards
        html += '<div class="row mb-3">';
        html += `<div class="col-md-3">
            <div class="card text-center bg-primary bg-opacity-10">
                <div class="card-body">
                    <h3>${stats.total}</h3>
                    <p class="stats-card-label mb-0">Total Findings</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-danger bg-opacity-10">
                <div class="card-body">
                    <h3>${stats.high}</h3>
                    <p class="stats-card-label mb-0">High Severity</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-warning bg-opacity-10">
                <div class="card-body">
                    <h3>${stats.medium}</h3>
                    <p class="stats-card-label mb-0">Medium Severity</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-info bg-opacity-10">
                <div class="card-body">
                    <h3>${stats.uniqueTypes}</h3>
                    <p class="stats-card-label mb-0">Finding Types</p>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        // Summary
        html += `<div class="alert alert-info mb-3">
            <strong>Summary:</strong> Found <strong>${stats.total}</strong> audit findings across <strong>${stats.uniqueTypes}</strong> different types.
        </div>`;
        
        // Collapsible findings sections
        html += '<div class="accordion" id="auditFindingsAccordion">';
        
        sortedTypes.forEach(([key, typeData], index) => {
            const severityClass = typeData.severity === 'high' || typeData.severity === 'error' ? 'danger' : 
                                 typeData.severity === 'medium' ? 'warning' : 
                                 typeData.severity === 'low' ? 'info' : 'secondary';
            const accordionId = `finding-${index}`;
            const categoryBadge = typeData.category === 'github-actions' 
                ? '<span class="badge bg-dark me-2"><i class="fab fa-github"></i> Actions</span>'
                : '<span class="badge bg-secondary me-2"><i class="fas fa-file-code"></i> SBOM</span>';
            
            html += `<div class="accordion-item">`;
            html += `<h2 class="accordion-header" id="heading-${index}">`;
            html += `<button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#${accordionId}" aria-expanded="true" aria-controls="${accordionId}">`;
            html += `<span class="badge bg-${severityClass} me-2">${typeData.severity.toUpperCase()}</span>`;
            html += `${categoryBadge}`;
            html += `<strong>${escapeHtml(typeData.typeName)}</strong>`;
            html += `<span class="badge bg-primary rounded-pill ms-auto me-2">${typeData.instances.length} instances</span>`;
            html += `</button>`;
            html += `</h2>`;
            html += `<div id="${accordionId}" class="accordion-collapse collapse show" aria-labelledby="heading-${index}" data-bs-parent="#auditFindingsAccordion">`;
            html += `<div class="accordion-body">`;
            
            // Description
            html += `<div class="alert alert-${severityClass} mb-3">`;
            html += `<strong>${escapeHtml(typeData.typeName)}:</strong> ${escapeHtml(typeData.description)}`;
            html += `</div>`;
            
            // Instances table
            html += '<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">';
            html += '<thead class="table-light"><tr>';
            if (typeData.category === 'github-actions') {
                html += '<th style="width: 250px;">Action</th>';
                html += '<th>Used In Repository → Workflow File</th>';
            } else {
                html += '<th style="width: 250px;">Repository</th>';
                html += '<th>Affected Component</th>';
            }
            html += '</tr></thead><tbody>';
            
            typeData.instances.slice(0, 100).forEach(instance => {
                if (typeData.category === 'github-actions') {
                    // Check if this is a Docker finding (Docker image, not GitHub action)
                    // Note: instance.type contains the rule_id (see line 292 where findings are converted)
                    const isDockerFinding = instance.type && (
                        instance.type.startsWith('DOCKER_') || 
                        instance.type === 'DOCKERFILE_FLOATING_BASE_IMAGE'
                    );
                    
                    // Build action link - extract owner/repo from action name
                    // Action format: owner/repo@ref or owner/repo/path@ref
                    // For links, we want just owner/repo (remove path component)
                    // For Docker findings, show the Docker image name as text (not a link)
                    let actionLink = '<span class="text-muted">N/A</span>';
                    if (instance.action) {
                        if (isDockerFinding) {
                            // For Docker findings, show the image name/action as text
                            // Check if it's a Docker image name (contains : or is a known Docker image format)
                            const isDockerImage = instance.action.includes(':') || 
                                                  instance.action.includes('/') ||
                                                  instance.action === 'Dockerfile';
                            if (isDockerImage) {
                                actionLink = `<span class="text-muted"><i class="fab fa-docker me-1"></i>${escapeHtml(instance.action)}</span>`;
                            } else {
                                actionLink = `<span class="text-muted">${escapeHtml(instance.action)}</span>`;
                            }
                        } else {
                            // For GitHub actions, create a link
                            const actionName = instance.action.split('@')[0]; // Get part before @
                            // Extract owner/repo (first two parts, remove any path components)
                            const actionParts = actionName.split('/');
                            if (actionParts.length >= 2) {
                                const owner = actionParts[0];
                                const repo = actionParts[1];
                                const actionRepoUrl = `https://github.com/${owner}/${repo}`;
                                actionLink = `<a href="${actionRepoUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">
                            <i class="fab fa-github me-1"></i>${escapeHtml(instance.action)}
                                </a>`;
                            } else {
                                // Fallback if format is unexpected
                                actionLink = `<span class="text-muted">${escapeHtml(instance.action)}</span>`;
                            }
                        }
                    }
                    
                    // Build location cell with file and line link if available
                    let locationCell = '<small class="text-muted">—</small>';
                    
                    // For Docker findings, show the full path: Repository → Workflow → Action → Dockerfile
                    if (isDockerFinding) {
                        const workflowLocations = instance.workflowLocations || [];
                        const actionRepository = instance.actionRepository || instance.action?.split('@')[0] || null;
                        const actionDockerfile = instance.actionDockerfile || 'Dockerfile';
                        
                        if (workflowLocations.length > 0 && actionRepository) {
                            // Build the full path chain
                            const pathParts = [];
                            const links = [];
                            
                            // Get the first workflow location (primary one)
                            const primaryLocation = workflowLocations[0];
                            const workflowRepo = primaryLocation.repository || instance.repository;
                            const workflowFile = primaryLocation.workflow;
                            const workflowLine = primaryLocation.line;
                            
                            // Parse repositories
                            const workflowRepoParts = workflowRepo?.split('/');
                            const actionRepoParts = actionRepository.split('/');
                            
                            if (workflowRepoParts && workflowRepoParts.length === 2 && actionRepoParts.length === 2) {
                                const [workflowOwner, workflowRepoName] = workflowRepoParts;
                                const [actionOwner, actionRepoName] = actionRepoParts;
                                
                                // Build path: Repository → Workflow File → Action → Dockerfile
                                // 1. Repository (where workflow is)
                                const workflowRepoUrl = `https://github.com/${workflowOwner}/${workflowRepoName}`;
                                pathParts.push(`<a href="${workflowRepoUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(workflowRepo)}</code></a>`);
                                
                                // 2. Workflow File
                                if (workflowFile) {
                                    const workflowFileUrl = `https://github.com/${workflowOwner}/${workflowRepoName}/blob/HEAD/${workflowFile}${workflowLine ? `#L${workflowLine}` : ''}`;
                                    const workflowFileName = workflowFile.split('/').pop();
                                    pathParts.push(`<a href="${workflowFileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(workflowFileName)}${workflowLine ? `:${workflowLine}` : ''}</code></a>`);
                                }
                                
                                // 3. Action
                                const actionUrl = `https://github.com/${actionOwner}/${actionRepoName}`;
                                pathParts.push(`<a href="${actionUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(actionRepository)}</code></a>`);
                                
                                // 4. Dockerfile (in action repository)
                                const dockerfileUrl = `https://github.com/${actionOwner}/${actionRepoName}/blob/HEAD/${actionDockerfile}${instance.line ? `#L${instance.line}` : ''}`;
                                const dockerfileName = actionDockerfile.split('/').pop();
                                pathParts.push(`<a href="${dockerfileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(dockerfileName)}${instance.line ? `:${instance.line}` : ''}</code></a>`);
                                
                                // Build the full path display
                                locationCell = `<div class="d-flex flex-wrap align-items-center gap-1" style="font-size: 0.85em;">
                                    ${pathParts.join(' <i class="fas fa-arrow-right text-muted" style="font-size: 0.7em;"></i> ')}
                                </div>`;
                            } else {
                                // Fallback: just show action repository Dockerfile link
                                if (actionRepoParts.length === 2) {
                                    const [actionOwner, actionRepoName] = actionRepoParts;
                                    const dockerfileUrl = `https://github.com/${actionOwner}/${actionRepoName}/blob/HEAD/${actionDockerfile}${instance.line ? `#L${instance.line}` : ''}`;
                                    const dockerfileName = actionDockerfile.split('/').pop();
                                    locationCell = `<a href="${dockerfileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">
                                        <i class="fas fa-code me-1"></i><code class="small">${escapeHtml(actionRepository)}/${escapeHtml(dockerfileName)}${instance.line ? `:${instance.line}` : ''}</code>
                                    </a>`;
                                }
                            }
                        } else if (actionRepository) {
                            // Fallback: just link to action repository Dockerfile
                            const actionRepoParts = actionRepository.split('/');
                            if (actionRepoParts.length === 2) {
                                const [actionOwner, actionRepoName] = actionRepoParts;
                                const dockerfileUrl = `https://github.com/${actionOwner}/${actionRepoName}/blob/HEAD/${actionDockerfile}${instance.line ? `#L${instance.line}` : ''}`;
                                const dockerfileName = actionDockerfile.split('/').pop();
                                locationCell = `<a href="${dockerfileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">
                                    <i class="fas fa-code me-1"></i><code class="small">${escapeHtml(actionRepository)}/${escapeHtml(dockerfileName)}${instance.line ? `:${instance.line}` : ''}</code>
                                </a>`;
                            }
                        }
                    } else {
                        // For non-Docker findings, show repository and workflow file information
                        const workflowLocations = instance.workflowLocations || [];
                        
                        if (workflowLocations.length > 0) {
                            // Show all workflow locations where this action is used
                            const locationParts = [];
                            
                            workflowLocations.forEach((loc, idx) => {
                                const workflowRepo = loc.repository || instance.repository;
                                const workflowFile = loc.workflow;
                                const workflowLine = loc.line;
                                
                                if (workflowRepo && workflowFile) {
                                    const repoParts = workflowRepo.split('/');
                        if (repoParts.length === 2) {
                            const [owner, repo] = repoParts;
                                        const ref = 'HEAD';
                                        
                                        // Build repository link
                                        const repoUrl = `https://github.com/${owner}/${repo}`;
                                        const repoLink = `<a href="${repoUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(workflowRepo)}</code></a>`;
                                        
                                        // Build workflow file link
                                        const fileUrl = `https://github.com/${owner}/${repo}/blob/${ref}/${workflowFile}${workflowLine ? `#L${workflowLine}` : ''}`;
                                        const fileDisplay = workflowFile.split('/').pop();
                                        const lineDisplay = workflowLine ? `:${workflowLine}` : '';
                                        const fileLink = `<a href="${fileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code class="small">${escapeHtml(fileDisplay)}${lineDisplay}</code></a>`;
                                        
                                        // Combine: Repository → Workflow File
                                        locationParts.push(`${repoLink} <i class="fas fa-arrow-right text-muted" style="font-size: 0.7em;"></i> ${fileLink}`);
                                    }
                                }
                            });
                            
                            if (locationParts.length > 0) {
                                // Show multiple locations if there are multiple workflows using this action
                                if (locationParts.length === 1) {
                                    locationCell = `<div class="d-flex flex-wrap align-items-center gap-1" style="font-size: 0.85em;">
                                        ${locationParts[0]}
                                    </div>`;
                                } else if (locationParts.length <= 3) {
                                    // Show all locations if there are 2-3 total
                                    locationCell = `<div class="d-flex flex-column gap-1" style="font-size: 0.85em;">
                                        ${locationParts.join('<br>')}
                                    </div>`;
                                } else {
                                    // Show first location with clickable link to modal for 4+ locations
                                    const modalId = `locations-modal-${Math.random().toString(36).substr(2, 9)}`;
                                    locationCell = `<div class="d-flex flex-column gap-1" style="font-size: 0.85em;">
                                        ${locationParts[0]}
                                        <a href="#" class="text-primary small" data-bs-toggle="modal" data-bs-target="#${modalId}">
                                            <i class="fas fa-list me-1"></i>+ ${locationParts.length - 1} more location${locationParts.length - 1 > 1 ? 's' : ''}
                                        </a>
                                    </div>
                                    <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
                                        <div class="modal-dialog modal-lg">
                                            <div class="modal-content">
                                                <div class="modal-header">
                                                    <h5 class="modal-title">All Locations (${locationParts.length})</h5>
                                                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                                </div>
                                                <div class="modal-body">
                                                    <div class="list-group">
                                                        ${locationParts.map((loc, idx) => `
                                                            <div class="list-group-item">
                                                                <div class="d-flex align-items-center gap-2">
                                                                    <span class="badge bg-secondary">${idx + 1}</span>
                                                                    <div>${loc}</div>
                                                                </div>
                                                            </div>
                                                        `).join('')}
                                                    </div>
                                                </div>
                                                <div class="modal-footer">
                                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>`;
                                }
                            }
                        } else if (instance.repository && instance.file) {
                            // Fallback: use repository and file if workflowLocations not available
                            const repoParts = instance.repository.split('/');
                            if (repoParts.length === 2) {
                                const [owner, repo] = repoParts;
                                const ref = 'HEAD';
                                
                                // Build repository link
                                const repoUrl = `https://github.com/${owner}/${repo}`;
                                const repoLink = `<a href="${repoUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(instance.repository)}</code></a>`;
                                
                                // Build workflow file link
                            let githubUrl = `https://github.com/${owner}/${repo}/blob/${ref}/${instance.file}`;
                            if (instance.line) {
                                githubUrl += `#L${instance.line}`;
                            }
                            
                                const fileDisplay = instance.file.split('/').pop();
                            const lineDisplay = instance.line ? `:${instance.line}` : '';
                                const fileLink = `<a href="${githubUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code class="small">${escapeHtml(fileDisplay)}${lineDisplay}</code></a>`;
                                
                                locationCell = `<div class="d-flex flex-wrap align-items-center gap-1" style="font-size: 0.85em;">
                                    ${repoLink} <i class="fas fa-arrow-right text-muted" style="font-size: 0.7em;"></i> ${fileLink}
                                </div>`;
                        } else {
                            locationCell = `<small class="text-muted"><code>${escapeHtml(instance.file)}${instance.line ? ':' + instance.line : ''}</code></small>`;
                        }
                    } else if (instance.message) {
                        locationCell = `<small class="text-muted">${escapeHtml(instance.message)}</small>`;
                        }
                    }
                    
                    html += `<tr>
                        <td>${actionLink}</td>
                        <td>${locationCell}</td>
                    </tr>`;
                } else {
                    // SBOM Deficiencies - link to deps.html with repository filter
                    let repoLink = '<span class="text-muted">N/A</span>';
                    if (instance.repository) {
                        // Get current organization context for the link
                        const currentOrg = document.getElementById('analysisSelector')?.value || '';
                        const orgParam = (!currentOrg || currentOrg === '') ? '' : currentOrg;
                        
                        // Build deps.html URL with repository filter
                        const params = new URLSearchParams();
                        if (orgParam && orgParam !== '') {
                            params.set('org', orgParam);
                        }
                        params.set('repo', instance.repository);
                        const depsUrl = `deps.html?${params.toString()}`;
                        
                        repoLink = `<a href="${depsUrl}" class="text-decoration-none">
                            <i class="fab fa-github me-1"></i>${escapeHtml(instance.repository)}
                        </a>`;
                    }
                    html += `<tr>
                        <td>${repoLink}</td>
                        <td><small class="text-muted">${escapeHtml(instance.message || '—')}</small></td>
                    </tr>`;
                }
            });
            
            if (typeData.instances.length > 100) {
                html += `<tr><td colspan="2" class="text-center text-muted py-2"><em>... and ${typeData.instances.length - 100} more instances</em></td></tr>`;
            }
            
            html += '</tbody></table></div>';
            html += `</div></div></div>`;
        });
        
        html += '</div>'; // End accordion
        html += '</div></div>'; // End card-body and card
        
        return html;
    }
    
    /**
     * Generate GitHub Actions audit findings HTML (legacy - kept for backward compatibility)
     * Now redirects to unified view
     */
    function generateGitHubActionsAuditHTML(orgData, severityFilter = 'all', repoFilter = 'all') {
        // Use unified view if both GitHub Actions and SBOM sections are requested
        // Otherwise, generate standalone GitHub Actions view
        return generateUnifiedAuditFindingsHTML(orgData, severityFilter, repoFilter);
    }
    
    /**
     * Generate Package Deprecation audit findings HTML
     */
    async function generatePackageDeprecationHTML(orgData, severityFilter = 'all', repoFilter = 'all') {
        // Get dependencies from the analysis data
        const allDependencies = orgData?.data?.allDependencies || [];
        
        if (!allDependencies || allDependencies.length === 0) {
            return '';
        }
        
        if (!window.cacheManager) {
            return '<div class="alert alert-warning">Cache manager not available. Cannot load package deprecation data.</div>';
        }
        
        // Filter dependencies by repository if specified
        let filteredDependencies = allDependencies;
        if (repoFilter && repoFilter !== 'all') {
            filteredDependencies = allDependencies.filter(dep => 
                dep.repositories && dep.repositories.includes(repoFilter)
            );
        }
        
        // Check each dependency for deprecation warnings
        const deprecatedPackages = [];
        const batchSize = 50;
        
        for (let i = 0; i < filteredDependencies.length; i += batchSize) {
            const batch = filteredDependencies.slice(i, i + batchSize);
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
                    <h3>${deprecatedPackages.length}</h3>
                    <p class="stats-card-label mb-0">Deprecated Packages</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3>${new Set(deprecatedPackages.map(p => p.ecosystem)).size}</h3>
                    <p class="stats-card-label mb-0">Ecosystems Affected</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3>${new Set(deprecatedPackages.flatMap(p => p.repositories)).size}</h3>
                    <p class="stats-card-label mb-0">Repositories Affected</p>
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
        html += '<div class="table-responsive"><table class="table table-sm table-hover align-middle">';
        html += '<thead class="table-light"><tr>';
        html += '<th style="width: 250px;">Package</th>';
        html += '<th style="width: 150px;">Version</th>';
        html += '<th style="width: 120px;">Ecosystem</th>';
        html += '<th>Affected Repositories</th>';
        html += '<th style="width: 200px;">Replacement</th>';
        html += '</tr></thead><tbody>';
        
        deprecatedPackages.forEach(pkg => {
            const repoCount = pkg.repositories.length;
            const repoList = repoCount > 3 
                ? `${pkg.repositories.slice(0, 3).map(r => `<a href="https://github.com/${r}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><i class="fab fa-github me-1"></i>${escapeHtml(r)}</a>`).join(', ')} and ${repoCount - 3} more`
                : pkg.repositories.map(r => `<a href="https://github.com/${r}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><i class="fab fa-github me-1"></i>${escapeHtml(r)}</a>`).join(', ');
            
            html += `<tr>
                <td><code class="small">${escapeHtml(pkg.name)}</code></td>
                <td><span class="text-muted">${escapeHtml(pkg.version)}</span></td>
                <td><span class="badge bg-secondary">${escapeHtml(pkg.ecosystem)}</span></td>
                <td><small>${repoList}</small></td>
                <td>${pkg.replacement ? `<code class="small text-success">${escapeHtml(pkg.replacement)}</code>` : '<span class="text-muted"><em>None specified</em></span>'}</td>
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
     * Generate Version Drift audit findings HTML
     * Checks for major and minor version updates available
     */
    async function generateVersionDriftHTML(orgData, severityFilter = 'all', repoFilter = 'all') {
        let allDependencies = orgData?.data?.allDependencies || [];
        
        if (!allDependencies || allDependencies.length === 0) {
            return '';
        }
        
        // Filter dependencies by repository if specified
        if (repoFilter && repoFilter !== 'all') {
            allDependencies = allDependencies.filter(dep => 
                dep.repositories && dep.repositories.includes(repoFilter)
            );
        }
        
        if (!window.versionDriftAnalyzer) {
            return '';
        }
        
        const majorDrift = [];
        const minorDrift = [];
        const batchSize = 50;
        
        // Check version drift for dependencies
        for (let i = 0; i < allDependencies.length; i += batchSize) {
            const batch = allDependencies.slice(i, i + batchSize);
            const batchChecks = await Promise.all(batch.map(async (dep) => {
                if (!dep.name || !dep.version || !dep.ecosystem) {
                    return null;
                }
                
                try {
                    // Normalize ecosystem
                    let ecosystem = dep.ecosystem.toLowerCase();
                    if (ecosystem === 'rubygems' || ecosystem === 'gem') {
                        ecosystem = 'gem';
                    } else if (ecosystem === 'go' || ecosystem === 'golang') {
                        ecosystem = 'golang';
                    } else if (ecosystem === 'packagist' || ecosystem === 'composer') {
                        ecosystem = 'composer';
                    }
                    
                    const packageKey = `${ecosystem}:${dep.name}`;
                    let driftData = await window.versionDriftAnalyzer.getVersionDriftFromCache(packageKey, dep.version);
                    
                    if (!driftData) {
                        driftData = await window.versionDriftAnalyzer.checkVersionDrift(
                            dep.name,
                            dep.version,
                            dep.ecosystem
                        );
                    }
                    
                    if (driftData && driftData.hasMajorUpdate) {
                        return {
                            name: dep.name,
                            version: dep.version,
                            latestVersion: driftData.latestVersion,
                            ecosystem: dep.ecosystem || 'unknown',
                            repositories: dep.repositories || [],
                            driftType: 'major'
                        };
                    } else if (driftData && driftData.hasMinorUpdate) {
                        return {
                            name: dep.name,
                            version: dep.version,
                            latestVersion: driftData.latestVersion,
                            ecosystem: dep.ecosystem || 'unknown',
                            repositories: dep.repositories || [],
                            driftType: 'minor'
                        };
                    }
                } catch (e) {
                    // Ignore errors
                }
                return null;
            }));
            
            batchChecks.forEach(result => {
                if (result) {
                    if (result.driftType === 'major') {
                        majorDrift.push(result);
                    } else if (result.driftType === 'minor') {
                        minorDrift.push(result);
                    }
                }
            });
        }
        
        // Filter by severity (major = high, minor = medium)
        let filteredMajor = majorDrift;
        let filteredMinor = minorDrift;
        
        if (severityFilter === 'high') {
            filteredMinor = [];
        } else if (severityFilter === 'medium') {
            filteredMajor = [];
        } else if (severityFilter === 'warning' || severityFilter === 'low') {
            return '';
        }
        
        const allDrift = [...filteredMajor, ...filteredMinor];
        
        if (allDrift.length === 0) {
            return '';
        }
        
        let html = '<div class="card">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-arrow-up me-2"></i>Version Drift</h5></div>';
        html += '<div class="card-body">';
        
        // Statistics
        html += '<div class="row mb-3">';
        html += `<div class="col-md-4">
            <div class="card text-center bg-danger bg-opacity-10">
                <div class="card-body">
                    <h3>${filteredMajor.length}</h3>
                    <p class="stats-card-label mb-0">Major Updates Available</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-warning bg-opacity-10">
                <div class="card-body">
                    <h3>${filteredMinor.length}</h3>
                    <p class="stats-card-label mb-0">Minor Updates Available</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3>${new Set(allDrift.flatMap(d => d.repositories)).size}</h3>
                    <p class="stats-card-label mb-0">Repositories Affected</p>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        // Summary
        html += `<div class="alert alert-info mb-3">
            <strong>Summary:</strong> Found <strong>${allDrift.length}</strong> packages with version drift 
            (<strong>${filteredMajor.length}</strong> major, <strong>${filteredMinor.length}</strong> minor updates available).
        </div>`;
        
        // Detailed list
        html += '<h6 class="mb-2">Packages with Version Drift</h6>';
        html += '<div class="table-responsive"><table class="table table-sm table-hover align-middle">';
        html += '<thead class="table-light"><tr>';
        html += '<th style="width: 100px;">Severity</th>';
        html += '<th style="width: 250px;">Package</th>';
        html += '<th style="width: 150px;">Current Version</th>';
        html += '<th style="width: 150px;">Latest Version</th>';
        html += '<th style="width: 120px;">Ecosystem</th>';
        html += '<th>Affected Repositories</th>';
        html += '</tr></thead><tbody>';
        
        // Show major drift first
        filteredMajor.slice(0, 100).forEach(pkg => {
            const repoList = generateRepoListHTML(pkg.repositories);
            
            html += `<tr>
                <td><span class="badge bg-danger">HIGH</span></td>
                <td><code class="small">${escapeHtml(pkg.name)}</code></td>
                <td><span class="text-muted">${escapeHtml(pkg.version)}</span></td>
                <td><strong class="text-success">${escapeHtml(pkg.latestVersion)}</strong></td>
                <td><span class="badge bg-secondary">${escapeHtml(pkg.ecosystem)}</span></td>
                <td><small>${repoList}</small></td>
            </tr>`;
        });
        
        // Then minor drift
        filteredMinor.slice(0, Math.max(0, 100 - filteredMajor.length)).forEach(pkg => {
            const repoList = generateRepoListHTML(pkg.repositories);
            
            html += `<tr>
                <td><span class="badge bg-warning text-dark">MEDIUM</span></td>
                <td><code class="small">${escapeHtml(pkg.name)}</code></td>
                <td><span class="text-muted">${escapeHtml(pkg.version)}</span></td>
                <td><strong class="text-success">${escapeHtml(pkg.latestVersion)}</strong></td>
                <td><span class="badge bg-secondary">${escapeHtml(pkg.ecosystem)}</span></td>
                <td><small>${repoList}</small></td>
            </tr>`;
        });
        
        html += '</tbody></table></div>';
        
        if (allDrift.length > 100) {
            const modalId = `all-drift-modal-${Math.random().toString(36).substr(2, 9)}`;
            html += `<div class="text-center mt-3">
                <button class="btn btn-outline-primary" data-bs-toggle="modal" data-bs-target="#${modalId}">
                    <i class="fas fa-list me-2"></i>Show All ${allDrift.length} Packages with Version Drift
                </button>
            </div>
            <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">All Packages with Version Drift (${allDrift.length})</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                            <table class="table table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th style="width: 100px;">Severity</th>
                                        <th>Package</th>
                                        <th style="width: 120px;">Current</th>
                                        <th style="width: 120px;">Latest</th>
                                        <th style="width: 120px;">Ecosystem</th>
                                        <th>Affected Repositories</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${allDrift.map(pkg => {
                                        const badge = pkg.hasMajorUpdate ? '<span class="badge bg-danger">HIGH</span>' : '<span class="badge bg-warning text-dark">MEDIUM</span>';
                                        const repoList = generateRepoListHTML(pkg.repositories);
                                        return `<tr>
                                            <td>${badge}</td>
                                            <td><code class="small">${escapeHtml(pkg.name)}</code></td>
                                            <td><span class="text-muted">${escapeHtml(pkg.version)}</span></td>
                                            <td><strong class="text-success">${escapeHtml(pkg.latestVersion)}</strong></td>
                                            <td><span class="badge bg-secondary">${escapeHtml(pkg.ecosystem)}</span></td>
                                            <td><small>${repoList}</small></td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }
        
        html += '</div></div>';
        
        return html;
    }
    
    /**
     * Generate Stale Dependencies audit findings HTML
     * Checks for dependencies that are 6+ months old with no newer version
     */
    async function generateStaleDependenciesHTML(orgData, severityFilter = 'all', repoFilter = 'all') {
        let allDependencies = orgData?.data?.allDependencies || [];
        
        if (!allDependencies || allDependencies.length === 0) {
            return '';
        }
        
        // Filter dependencies by repository if specified
        if (repoFilter && repoFilter !== 'all') {
            allDependencies = allDependencies.filter(dep => 
                dep.repositories && dep.repositories.includes(repoFilter)
            );
        }
        
        if (!window.versionDriftAnalyzer) {
            return '';
        }
        
        // Filter by severity (stale dependencies are low severity)
        if (severityFilter && severityFilter !== 'all' && severityFilter !== 'low' && severityFilter !== 'warning') {
            return '';
        }
        
        const staleDeps = [];
        const batchSize = 50;
        
        // Check staleness for dependencies
        for (let i = 0; i < allDependencies.length; i += batchSize) {
            const batch = allDependencies.slice(i, i + batchSize);
            const batchChecks = await Promise.all(batch.map(async (dep) => {
                if (!dep.name || !dep.version || !dep.ecosystem) {
                    return null;
                }
                
                try {
                    const staleness = await window.versionDriftAnalyzer.checkStaleness(
                        dep.name,
                        dep.version,
                        dep.ecosystem
                    );
                    
                    if (staleness && staleness.isStale) {
                        return {
                            name: dep.name,
                            version: dep.version,
                            ecosystem: dep.ecosystem || 'unknown',
                            repositories: dep.repositories || [],
                            monthsSinceRelease: staleness.monthsSinceRelease,
                            lastReleaseDate: staleness.lastReleaseDate
                        };
                    }
                } catch (e) {
                    // Ignore errors
                }
                return null;
            }));
            
            staleDeps.push(...batchChecks.filter(d => d !== null));
        }
        
        if (staleDeps.length === 0) {
            return '';
        }
        
        let html = '<div class="card">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-clock me-2"></i>Stale Dependencies</h5></div>';
        html += '<div class="card-body">';
        
        // Statistics
        html += '<div class="row mb-3">';
        html += `<div class="col-md-4">
            <div class="card text-center bg-warning bg-opacity-10">
                <div class="card-body">
                    <h3>${staleDeps.length}</h3>
                    <p class="stats-card-label mb-0">Stale Packages</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3>${new Set(staleDeps.map(d => d.ecosystem)).size}</h3>
                    <p class="stats-card-label mb-0">Ecosystems Affected</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3>${new Set(staleDeps.flatMap(d => d.repositories)).size}</h3>
                    <p class="stats-card-label mb-0">Repositories Affected</p>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        // Summary
        html += `<div class="alert alert-warning mb-3">
            <strong>Summary:</strong> Found <strong>${staleDeps.length}</strong> stale dependencies 
            (6+ months old with no newer version available).
        </div>`;
        
        // Detailed list
        html += '<h6 class="mb-2">Stale Dependencies</h6>';
        html += '<div class="table-responsive"><table class="table table-sm table-hover align-middle">';
        html += '<thead class="table-light"><tr>';
        html += '<th style="width: 250px;">Package</th>';
        html += '<th style="width: 150px;">Version</th>';
        html += '<th style="width: 120px;">Ecosystem</th>';
        html += '<th style="width: 180px;">Age</th>';
        html += '<th>Affected Repositories</th>';
        html += '</tr></thead><tbody>';
        
        staleDeps.slice(0, 100).sort((a, b) => b.monthsSinceRelease - a.monthsSinceRelease).forEach(pkg => {
            const repoCount = pkg.repositories.length;
            const repoList = repoCount > 3 
                ? `${pkg.repositories.slice(0, 3).map(r => `<a href="https://github.com/${r}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><i class="fab fa-github me-1"></i>${escapeHtml(r)}</a>`).join(', ')} and ${repoCount - 3} more`
                : pkg.repositories.map(r => `<a href="https://github.com/${r}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><i class="fab fa-github me-1"></i>${escapeHtml(r)}</a>`).join(', ');
            
            const ageBadgeClass = pkg.monthsSinceRelease >= 12 ? 'bg-danger' : 
                                 pkg.monthsSinceRelease >= 9 ? 'bg-warning' : 'bg-warning text-dark';
            
            html += `<tr>
                <td><code class="small">${escapeHtml(pkg.name)}</code></td>
                <td><span class="text-muted">${escapeHtml(pkg.version)}</span></td>
                <td><span class="badge bg-secondary">${escapeHtml(pkg.ecosystem)}</span></td>
                <td><span class="badge ${ageBadgeClass}"><i class="fas fa-clock me-1"></i>${pkg.monthsSinceRelease} months</span></td>
                <td><small>${repoList}</small></td>
            </tr>`;
        });
        
        if (staleDeps.length > 100) {
            html += `<tr><td colspan="5" class="text-center text-muted py-3"><em>... and ${staleDeps.length - 100} more stale packages</em></td></tr>`;
        }
        
        html += '</tbody></table></div>';
        html += '</div></div>';
        
        return html;
    }
    
    /**
     * Generate EOX (End-of-Life) Dependencies audit findings HTML
     * Checks for dependencies that have reached end-of-life or end-of-support
     */
    async function generateEOXDependenciesHTML(orgData, severityFilter = 'all', repoFilter = 'all') {
        let allDependencies = orgData?.data?.allDependencies || [];
        
        if (!allDependencies || allDependencies.length === 0) {
            return '';
        }
        
        // Filter dependencies by repository if specified
        if (repoFilter && repoFilter !== 'all') {
            allDependencies = allDependencies.filter(dep => 
                dep.repositories && dep.repositories.includes(repoFilter)
            );
        }
        
        if (!window.eoxService) {
            return '';
        }
        
        // Filter by severity (EOL = high, EOS = medium)
        if (severityFilter && severityFilter !== 'all' && severityFilter !== 'high' && severityFilter !== 'medium') {
            return '';
        }
        
        const eolDeps = [];
        const eosDeps = [];
        const batchSize = 20; // Smaller batch for EOX since it involves external API
        
        // Check EOX status for dependencies
        for (let i = 0; i < allDependencies.length; i += batchSize) {
            const batch = allDependencies.slice(i, i + batchSize);
            const batchChecks = await Promise.all(batch.map(async (dep) => {
                if (!dep.name || !dep.ecosystem) {
                    return null;
                }
                
                try {
                    const eoxStatus = await window.eoxService.checkEOX(
                        dep.name,
                        dep.version,
                        dep.ecosystem
                    );
                    
                    if (eoxStatus && (eoxStatus.isEOL || eoxStatus.isEOS)) {
                        return {
                            name: dep.name,
                            version: dep.version || 'unknown',
                            ecosystem: dep.ecosystem || 'unknown',
                            repositories: dep.repositories || [],
                            isEOL: eoxStatus.isEOL,
                            isEOS: eoxStatus.isEOS,
                            eolDate: eoxStatus.eolDate,
                            eosDate: eoxStatus.eosDate,
                            latestVersion: eoxStatus.latestVersion,
                            successor: eoxStatus.successor,
                            productMatched: eoxStatus.productMatched
                        };
                    }
                } catch (e) {
                    // Ignore errors
                }
                return null;
            }));
            
            batchChecks.filter(d => d !== null).forEach(dep => {
                if (dep.isEOL) {
                    eolDeps.push(dep);
                } else if (dep.isEOS) {
                    eosDeps.push(dep);
                }
            });
        }
        
        // Apply severity filter
        let filteredEOL = eolDeps;
        let filteredEOS = eosDeps;
        
        if (severityFilter === 'high') {
            filteredEOS = [];
        } else if (severityFilter === 'medium') {
            filteredEOL = [];
        }
        
        const allEOX = [...filteredEOL, ...filteredEOS];
        
        if (allEOX.length === 0) {
            return '';
        }
        
        let html = '<div class="card">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-skull-crossbones me-2"></i>End-of-Life Dependencies</h5></div>';
        html += '<div class="card-body">';
        
        // Statistics
        html += '<div class="row mb-3">';
        html += `<div class="col-md-4">
            <div class="card text-center bg-danger bg-opacity-10">
                <div class="card-body">
                    <h3>${filteredEOL.length}</h3>
                    <p class="stats-card-label mb-0">End of Life (EOL)</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-warning bg-opacity-10">
                <div class="card-body">
                    <h3>${filteredEOS.length}</h3>
                    <p class="stats-card-label mb-0">End of Support (EOS)</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-4">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3>${new Set(allEOX.flatMap(d => d.repositories)).size}</h3>
                    <p class="stats-card-label mb-0">Repositories Affected</p>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        // Summary
        html += `<div class="alert alert-danger mb-3">
            <strong>Critical:</strong> Found <strong>${allEOX.length}</strong> dependencies at end-of-life 
            (<strong>${filteredEOL.length}</strong> EOL, <strong>${filteredEOS.length}</strong> EOS). 
            These packages no longer receive updates or security patches.
        </div>`;
        
        // Detailed list
        html += '<h6 class="mb-2">End-of-Life Dependencies</h6>';
        html += '<div class="table-responsive"><table class="table table-sm table-hover align-middle">';
        html += '<thead class="table-light"><tr>';
        html += '<th style="width: 100px;">Status</th>';
        html += '<th style="width: 250px;">Package</th>';
        html += '<th style="width: 150px;">Version</th>';
        html += '<th style="width: 120px;">Ecosystem</th>';
        html += '<th style="width: 150px;">EOL/EOS Date</th>';
        html += '<th>Affected Repositories</th>';
        html += '</tr></thead><tbody>';
        
        // Show EOL first (higher severity)
        filteredEOL.slice(0, 50).forEach(pkg => {
            const repoList = generateRepoListHTML(pkg.repositories);
            const dateDisplay = pkg.eolDate || 'Unknown';
            
            html += `<tr>
                <td><span class="badge bg-danger"><i class="fas fa-skull me-1"></i>EOL</span></td>
                <td><code class="small">${escapeHtml(pkg.name)}</code></td>
                <td><span class="text-muted">${escapeHtml(pkg.version)}</span></td>
                <td><span class="badge bg-secondary">${escapeHtml(pkg.ecosystem)}</span></td>
                <td><small class="text-danger">${escapeHtml(dateDisplay)}</small></td>
                <td><small>${repoList}</small></td>
            </tr>`;
        });
        
        // Then EOS
        filteredEOS.slice(0, Math.max(0, 50 - filteredEOL.length)).forEach(pkg => {
            const repoList = generateRepoListHTML(pkg.repositories);
            const dateDisplay = pkg.eosDate || 'Unknown';
            
            html += `<tr>
                <td><span class="badge bg-warning text-dark"><i class="fas fa-exclamation-triangle me-1"></i>EOS</span></td>
                <td><code class="small">${escapeHtml(pkg.name)}</code></td>
                <td><span class="text-muted">${escapeHtml(pkg.version)}</span></td>
                <td><span class="badge bg-secondary">${escapeHtml(pkg.ecosystem)}</span></td>
                <td><small class="text-warning">${escapeHtml(dateDisplay)}</small></td>
                <td><small>${repoList}</small></td>
            </tr>`;
        });
        
        if (allEOX.length > 50) {
            html += `<tr><td colspan="6" class="text-center text-muted py-3"><em>... and ${allEOX.length - 50} more EOX packages</em></td></tr>`;
        }
        
        html += '</tbody></table></div>';
        
        // Info about data source
        html += `<div class="alert alert-info mt-3 mb-0">
            <i class="fas fa-info-circle me-2"></i>
            <small>EOL/EOS data sourced from <a href="https://endoflife.date" target="_blank" rel="noreferrer noopener">endoflife.date</a>. 
            Only packages with known EOL information are shown.</small>
        </div>`;
        
        html += '</div></div>';
        
        return html;
    }
    
    /**
     * Generate SBOM Audit section HTML
     * Provides detailed SBOM quality breakdown, NTIA compliance, and freshness
     */
    async function generateSBOMAuditHTML(orgData, severityFilter = 'all', repoFilter = 'all') {
        const allRepositories = orgData?.data?.allRepositories || [];
        
        if (!allRepositories || allRepositories.length === 0) {
            return '';
        }
        
        if (typeof SBOMQualityProcessor === 'undefined') {
            return '';
        }
        
        const sbomProcessor = new SBOMQualityProcessor();
        
        // Filter repositories
        let filteredRepos = allRepositories;
        if (repoFilter && repoFilter !== 'all') {
            filteredRepos = allRepositories.filter(r => `${r.owner}/${r.name}` === repoFilter);
        }
        
        // Collect SBOM audit data
        const auditData = [];
        const gradeDistribution = { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0, 'N/A': 0 };
        let totalNTIACompliant = 0;
        let totalFresh = 0;
        let totalCompleteness = 0;
        let reposWithSBOM = 0;
        
        filteredRepos.forEach(repo => {
            const repoKey = `${repo.owner}/${repo.name}`;
            const quality = repo.qualityAssessment;
            
            if (!quality) {
                gradeDistribution['N/A']++;
                return;
            }
            
            reposWithSBOM++;
            gradeDistribution[quality.grade]++;
            
            // Calculate NTIA compliance (simplified based on quality categories)
            const ntiaCompliant = quality.overallScore >= 70 && 
                                 quality.categories?.identification?.score >= 70 &&
                                 quality.categories?.provenance?.score >= 70;
            if (ntiaCompliant) totalNTIACompliant++;
            
            // Estimate freshness from timestamp
            let freshness = { isFresh: false, status: 'Unknown', ageInDays: null };
            if (quality.timestamp) {
                const ageMs = Date.now() - quality.timestamp;
                const ageInDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
                freshness.ageInDays = ageInDays;
                freshness.isFresh = ageInDays <= 90;
                freshness.status = ageInDays <= 7 ? 'Very Fresh' :
                                  ageInDays <= 30 ? 'Fresh' :
                                  ageInDays <= 90 ? 'Recent' :
                                  ageInDays <= 180 ? 'Aging' :
                                  ageInDays <= 365 ? 'Old' : 'Stale';
            }
            if (freshness.isFresh) totalFresh++;
            
            // Calculate completeness score
            const completenessScore = Math.round(
                (quality.categories?.identification?.score || 0) * 0.3 +
                (quality.categories?.metadata?.score || 0) * 0.3 +
                (quality.categories?.licensing?.score || 0) * 0.2 +
                (quality.categories?.vulnerability?.score || 0) * 0.2
            );
            totalCompleteness += completenessScore;
            
            // Determine if this repo needs attention based on severity filter
            let includeInResults = true;
            if (severityFilter === 'high') {
                includeInResults = quality.grade === 'F' || quality.grade === 'D';
            } else if (severityFilter === 'medium') {
                includeInResults = quality.grade === 'C' || quality.grade === 'D';
            } else if (severityFilter === 'warning' || severityFilter === 'low') {
                includeInResults = quality.grade === 'B' || quality.grade === 'C';
            }
            
            if (includeInResults) {
                auditData.push({
                    repository: repoKey,
                    grade: quality.grade,
                    score: quality.overallScore,
                    displayScore: quality.displayScore,
                    ntiaCompliant: ntiaCompliant,
                    freshness: freshness,
                    completeness: completenessScore,
                    categories: quality.categories,
                    issues: quality.issues || []
                });
            }
        });
        
        // Sort by score (lowest first for attention)
        auditData.sort((a, b) => a.score - b.score);
        
        if (auditData.length === 0 && severityFilter !== 'all') {
            return '';
        }
        
        let html = '<div class="card">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-file-invoice me-2"></i>SBOM Audit</h5></div>';
        html += '<div class="card-body">';
        
        // Statistics
        html += '<div class="row mb-3">';
        html += `<div class="col-md-3">
            <div class="card text-center bg-primary bg-opacity-10">
                <div class="card-body">
                    <h3>${reposWithSBOM}/${filteredRepos.length}</h3>
                    <p class="stats-card-label mb-0">Repositories with SBOM</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-success bg-opacity-10">
                <div class="card-body">
                    <h3>${totalNTIACompliant}</h3>
                    <p class="stats-card-label mb-0">NTIA Compliant</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-info bg-opacity-10">
                <div class="card-body">
                    <h3>${totalFresh}</h3>
                    <p class="stats-card-label mb-0">Fresh SBOMs</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-secondary bg-opacity-10">
                <div class="card-body">
                    <h3>${reposWithSBOM > 0 ? Math.round(totalCompleteness / reposWithSBOM) : 0}%</h3>
                    <p class="stats-card-label mb-0">Avg Completeness</p>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        // Grade Distribution
        html += '<h6 class="mb-2">Grade Distribution</h6>';
        html += '<div class="d-flex gap-2 mb-3 flex-wrap">';
        const gradeColors = { 'A': 'success', 'B': 'info', 'C': 'warning', 'D': 'danger', 'F': 'dark', 'N/A': 'secondary' };
        for (const [grade, count] of Object.entries(gradeDistribution)) {
            if (count > 0) {
                html += `<span class="badge bg-${gradeColors[grade]} fs-6">${grade}: ${count}</span>`;
            }
        }
        html += '</div>';
        
        // NTIA Compliance Summary
        const ntiaPercentage = reposWithSBOM > 0 ? Math.round((totalNTIACompliant / reposWithSBOM) * 100) : 0;
        const ntiaAlertClass = ntiaPercentage >= 80 ? 'success' : ntiaPercentage >= 50 ? 'warning' : 'danger';
        html += `<div class="alert alert-${ntiaAlertClass} mb-3">
            <strong>NTIA Compliance:</strong> ${totalNTIACompliant}/${reposWithSBOM} repositories (${ntiaPercentage}%) 
            meet NTIA Minimum Elements requirements.
        </div>`;
        
        // Detailed list (only show repos needing attention)
        if (auditData.length > 0) {
            html += '<h6 class="mb-2">Repository SBOM Quality</h6>';
            html += '<div class="table-responsive"><table class="table table-sm table-hover align-middle">';
            html += '<thead class="table-light"><tr>';
            html += '<th style="width: 250px;">Repository</th>';
            html += '<th style="width: 80px;">Grade</th>';
            html += '<th style="width: 100px;">Score</th>';
            html += '<th style="width: 100px;">NTIA</th>';
            html += '<th style="width: 120px;">Freshness</th>';
            html += '<th style="width: 100px;">Complete</th>';
            html += '<th>Top Issues</th>';
            html += '</tr></thead><tbody>';
            
            auditData.slice(0, 50).forEach(audit => {
                const gradeClass = gradeColors[audit.grade] || 'secondary';
                const ntiaIcon = audit.ntiaCompliant ? 
                    '<i class="fas fa-check-circle text-success"></i>' : 
                    '<i class="fas fa-times-circle text-danger"></i>';
                const freshnessClass = audit.freshness.isFresh ? 'success' : 
                                      audit.freshness.status === 'Aging' ? 'warning' : 'danger';
                
                // Get top issues
                const topIssues = audit.issues
                    .flatMap(cat => cat.issues || [])
                    .slice(0, 2)
                    .map(issue => `<small class="text-muted">${escapeHtml(issue.substring(0, 50))}...</small>`)
                    .join('<br>') || '<small class="text-muted">None</small>';
                
                html += `<tr>
                    <td>
                        <a href="https://github.com/${audit.repository}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">
                            <i class="fab fa-github me-1"></i>${escapeHtml(audit.repository)}
                        </a>
                    </td>
                    <td><span class="badge bg-${gradeClass}">${audit.grade}</span></td>
                    <td>${audit.displayScore}/10</td>
                    <td>${ntiaIcon}</td>
                    <td><span class="badge bg-${freshnessClass}">${audit.freshness.status}</span></td>
                    <td>${audit.completeness}%</td>
                    <td>${topIssues}</td>
                </tr>`;
            });
            
            if (auditData.length > 50) {
                html += `<tr><td colspan="7" class="text-center text-muted py-3"><em>... and ${auditData.length - 50} more repositories</em></td></tr>`;
            }
            
            html += '</tbody></table></div>';
        }
        
        html += '</div></div>';
        
        return html;
    }
    
    /**
     * Generate License Compatibility audit findings HTML
     * Checks for incompatible license chains
     */
    async function generateLicenseCompatibilityHTML(orgData, severityFilter = 'all', repoFilter = 'all') {
        const allDependencies = orgData?.data?.allDependencies || [];
        const allRepositories = orgData?.data?.allRepositories || [];
        
        if (!allDependencies || allDependencies.length === 0) {
            return '';
        }
        
        if (typeof LicenseProcessor === 'undefined') {
            return '';
        }
        
        const licenseProcessor = new LicenseProcessor();
        const conflicts = [];
        
        // Filter dependencies by repository if specified
        let filteredDependencies = allDependencies;
        if (repoFilter && repoFilter !== 'all') {
            filteredDependencies = allDependencies.filter(dep => 
                dep.repositories && dep.repositories.includes(repoFilter)
            );
        }
        
        // Check license conflicts for each dependency
        filteredDependencies.forEach(dep => {
            // Skip dependencies without any package information
            if (!dep.originalPackage && !dep.license && !dep.licenseFull) {
                return;
            }
            
            // Try to get license from multiple sources (in order of preference)
            let dependencyLicense = null;
            
            // 1. Check dep.licenseFull (most complete, from deps.dev API)
            if (dep.licenseFull && 
                dep.licenseFull !== 'Unknown' && 
                dep.licenseFull !== 'NOASSERTION' && 
                String(dep.licenseFull).trim() !== '') {
                dependencyLicense = dep.licenseFull;
            }
            // 2. Check dep.license (short form, from deps.dev API) - only if licenseFull not found
            if (!dependencyLicense && dep.license && 
                dep.license !== 'Unknown' && 
                dep.license !== 'NOASSERTION' && 
                String(dep.license).trim() !== '') {
                dependencyLicense = dep.license;
            }
            // 3. Parse from originalPackage (from SBOM) - always check this as fallback
            if (!dependencyLicense && dep.originalPackage) {
            const licenseInfo = licenseProcessor.parseLicense(dep.originalPackage);
                if (licenseInfo.license && 
                    licenseInfo.license !== 'NOASSERTION' && 
                    licenseInfo.license !== 'Unknown' &&
                    String(licenseInfo.license).trim() !== '') {
                    dependencyLicense = licenseInfo.license;
                }
            }
            
            // Skip if no license found after checking all sources
            if (!dependencyLicense || dependencyLicense === 'NOASSERTION' || dependencyLicense === 'Unknown' || dependencyLicense.trim() === '') {
                return;
            }
            
            // Parse license to get category for severity determination
            // Create a temporary package object for parsing if needed
            const tempPackage = dep.originalPackage || {
                licenseConcluded: dependencyLicense,
                licenseDeclared: dependencyLicense
            };
            const licenseInfo = licenseProcessor.parseLicense(tempPackage);
            
            const depRepos = dep.repositories || [];
            
            // Filter repositories if repo filter is specified
            const reposToCheck = repoFilter && repoFilter !== 'all' 
                ? depRepos.filter(r => r === repoFilter)
                : depRepos;
            
            // Check compatibility with repository licenses
            reposToCheck.forEach(repoKey => {
                const repo = allRepositories.find(r => `${r.owner}/${r.name}` === repoKey);
                if (repo && repo.license) {
                    const compatibility = licenseProcessor.isDependencyCompatibleWithRepository(
                        dependencyLicense,
                        repo.license
                    );
                    
                    if (compatibility === false) {
                        conflicts.push({
                            dependency: dep.name,
                            dependencyVersion: dep.version,
                            dependencyLicense: dependencyLicense,
                            repository: repoKey,
                            repositoryLicense: repo.license,
                            ecosystem: dep.ecosystem || dep.category?.ecosystem || 'unknown',
                            severity: licenseInfo.category === 'copyleft' ? 'high' : 'medium'
                        });
                    }
                }
            });
        });
        
        if (conflicts.length === 0) {
            return '';
        }
        
        // Filter by severity if specified
        let filteredConflicts = conflicts;
        if (severityFilter && severityFilter !== 'all') {
            filteredConflicts = conflicts.filter(c => c.severity === severityFilter);
        }
        
        if (filteredConflicts.length === 0) {
            return '';
        }
        
        // Calculate statistics
        const stats = {
            total: filteredConflicts.length,
            high: filteredConflicts.filter(c => c.severity === 'high').length,
            medium: filteredConflicts.filter(c => c.severity === 'medium').length,
            uniqueRepos: new Set(filteredConflicts.map(c => c.repository)).size,
            uniqueDeps: new Set(filteredConflicts.map(c => `${c.dependency}@${c.dependencyVersion}`)).size
        };
        
        let html = '<div class="card">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-balance-scale me-2"></i>License Compatibility</h5></div>';
        html += '<div class="card-body">';
        
        // Statistics
        html += '<div class="row mb-3">';
        html += `<div class="col-md-3">
            <div class="card text-center bg-primary bg-opacity-10">
                <div class="card-body">
                    <h3>${stats.total}</h3>
                    <p class="stats-card-label mb-0">Total Conflicts</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-danger bg-opacity-10">
                <div class="card-body">
                    <h3>${stats.high}</h3>
                    <p class="stats-card-label mb-0">High Severity</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-warning bg-opacity-10">
                <div class="card-body">
                    <h3>${stats.medium}</h3>
                    <p class="stats-card-label mb-0">Medium Severity</p>
                </div>
            </div>
        </div>`;
        html += `<div class="col-md-3">
            <div class="card text-center bg-light">
                <div class="card-body">
                    <h3>${stats.uniqueRepos}</h3>
                    <p class="stats-card-label mb-0">Repositories Affected</p>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        // Summary
        html += `<div class="alert alert-danger mb-3">
            <strong>Warning:</strong> Found <strong>${stats.total}</strong> incompatible license combinations 
            across <strong>${stats.uniqueRepos}</strong> repositories and <strong>${stats.uniqueDeps}</strong> dependencies.
        </div>`;
        
        // Detailed list
        html += '<h6 class="mb-2">Incompatible License Chains</h6>';
        html += '<div class="table-responsive"><table class="table table-sm table-hover align-middle">';
        html += '<thead class="table-light"><tr>';
        html += '<th style="width: 100px;">Severity</th>';
        html += '<th style="width: 250px;">Dependency</th>';
        html += '<th style="width: 180px;">Dependency License</th>';
        html += '<th style="width: 250px;">Repository</th>';
        html += '<th style="width: 180px;">Repository License</th>';
        html += '<th style="width: 120px;">Ecosystem</th>';
        html += '</tr></thead><tbody>';
        
        filteredConflicts.slice(0, 100).forEach(conflict => {
            const severityClass = conflict.severity === 'high' ? 'danger' : 'warning';
            const repoLink = `<a href="https://github.com/${conflict.repository}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">
                <i class="fab fa-github me-1"></i>${escapeHtml(conflict.repository)}
            </a>`;
            
            html += `<tr>
                <td><span class="badge bg-${severityClass}">${conflict.severity.toUpperCase()}</span></td>
                <td><code class="small">${escapeHtml(conflict.dependency)}@${escapeHtml(conflict.dependencyVersion)}</code></td>
                <td><span class="badge bg-secondary">${escapeHtml(conflict.dependencyLicense)}</span></td>
                <td>${repoLink}</td>
                <td><span class="badge bg-info">${escapeHtml(conflict.repositoryLicense)}</span></td>
                <td><span class="badge bg-secondary">${escapeHtml(conflict.ecosystem)}</span></td>
            </tr>`;
        });
        
        if (filteredConflicts.length > 100) {
            html += `<tr><td colspan="6" class="text-center text-muted py-3"><em>... and ${filteredConflicts.length - 100} more conflicts</em></td></tr>`;
        }
        
        html += '</tbody></table></div>';
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
            'INDIRECT_UNPINNABLE_ACTION': 'Indirect Unpinnable Action',
            'PACKAGE_NOT_IN_REGISTRY': 'Potential Dependency Confusion',
            'PULL_REQUEST_TARGET_CHECKOUT': 'Dangerous PR Target Pattern',
            'EXCESSIVE_WORKFLOW_PERMISSIONS': 'Excessive Workflow Permissions',
            'EXCESSIVE_JOB_PERMISSIONS': 'Excessive Job Permissions',
            'POTENTIAL_HARDCODED_SECRET': 'Potential Hardcoded Secret'
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
});
