/**
 * Common page initialization functions
 * Shared functions used across multiple page files to reduce duplication
 */

/**
 * Safely set innerHTML on an element
 * Uses viewManager if available, otherwise sets directly
 * Note: HTML should already have user data escaped before calling this
 * @param {HTMLElement} element - The element to set HTML content for
 * @param {string} html - The HTML string to insert
 */
function safeSetHTML(element, html) {
    if (!element) return;
    
    if (window.viewManager && typeof window.viewManager.safeSetHTML === 'function') {
        window.viewManager.safeSetHTML(element, html);
    } else {
        // Fallback - set innerHTML directly (HTML should already be escaped)
        element.innerHTML = html || '';
    }
}

/**
 * Load analyses list into a selector dropdown
 * Shows aggregated data by default, individual analyses when selected
 * @param {string} selectorId - ID of the select element
 * @param {StorageManager} storageManager - StorageManager instance
 * @param {HTMLElement|null} noDataSection - Optional element to show when no data
 */
async function loadAnalysesList(selectorId, storageManager, noDataSection = null) {
    const selector = document.getElementById(selectorId);
    if (!selector) {
        console.error(`Selector element not found: ${selectorId}`);
        return;
    }
    
    try {
        console.log(`📋 Loading analyses list for selector: ${selectorId}`);
        
        // Ensure storage manager is initialized
        if (!storageManager.initialized) {
            await storageManager.init();
        }
        
        const storageInfo = await storageManager.getStorageInfo();
        console.log(`📋 Storage info retrieved: ${storageInfo.organizations.length} orgs, ${storageInfo.repositories.length} repos`);
        
        // Filter out:
        // 1. __ALL__ entries (legacy internal identifier)
        // 2. Entries with 0 dependencies (repositories without SBOM/dependency graph)
        const allEntries = [...storageInfo.organizations, ...storageInfo.repositories]
            .filter(entry => entry.name !== '__ALL__' && entry.dependencies > 0);
        
        const filteredOutCount = (storageInfo.organizations.length + storageInfo.repositories.length) - allEntries.length;
        if (filteredOutCount > 0) {
            console.log(`📋 Filtered out ${filteredOutCount} entries (no dependencies/SBOM)`);
        }
        console.log(`📋 Total entries to add: ${allEntries.length}`);
        
        selector.innerHTML = '';
        
        if (allEntries.length === 0) {
            console.warn(`⚠️ No entries found in storage. Selector will be disabled.`);
            if (noDataSection) {
                noDataSection.style.display = 'block';
                noDataSection.classList.remove('d-none');
            }
            selector.disabled = true;
            return;
        }
        
        // Add placeholder option for "All Analyses"
        const allOption = document.createElement('option');
        allOption.value = '';
        const totalDeps = allEntries.reduce((sum, entry) => sum + (entry.dependencies || 0), 0);
        allOption.textContent = `All Analyses (${totalDeps} deps)`;
        selector.appendChild(allOption);
        console.log(`📋 Added "All Analyses" placeholder option`);
        
        // Add individual entries
        allEntries.forEach(entry => {
            const option = document.createElement('option');
            option.value = entry.name;
            const depCount = entry.dependencies || 0;
            option.textContent = `${entry.name} (${depCount} deps)`;
            selector.appendChild(option);
            console.log(`📋 Added option: ${entry.name} (${depCount} deps)`);
        });
        
        if (noDataSection) {
            noDataSection.style.display = 'none';
            noDataSection.classList.add('d-none');
        }
        selector.disabled = false;
        console.log(`✅ Analysis selector populated with ${allEntries.length} entries`);
    } catch (error) {
        console.error('❌ Error loading analyses list:', error);
        console.error('   Error details:', error.stack);
        if (noDataSection) {
            noDataSection.style.display = 'block';
            noDataSection.classList.remove('d-none');
        }
        selector.disabled = true;
    }
}

/**
 * Load organization data with common filtering and validation
 * @param {string} name - Organization/repository name, or empty/null for aggregated data
 * @param {StorageManager} storageManager - StorageManager instance
 * @param {Object} options - Configuration options
 * @param {string|null} options.severityFilter - Severity filter value
 * @param {string|null} options.sectionFilter - Section filter value (for audit page)
 * @param {string|null} options.repoFilter - Repository filter value
 * @param {string} options.containerId - ID of container element
 * @param {HTMLElement|null} options.noDataSection - Optional no-data section element
 * @param {Function} options.renderFunction - Function to render the data
 * @returns {Promise<Object|null>} - Loaded data or null
 */
async function loadOrganizationData(name, storageManager, options = {}) {
    const {
        severityFilter = null,
        sectionFilter = null,
        repoFilter = null,
        categoryFilter = null, // For license page
        containerId,
        noDataSection = null,
        renderFunction
    } = options;
    
    let data;
    
    console.log(`📋 Loading organization data for: ${name || 'All Analyses (aggregated)'}`);
    
    // If name is empty or null/undefined, load combined data (aggregated from all analyses)
    if (!name || name === '') {
        data = await storageManager.getCombinedData();
        if (!data) {
            data = {
                name: 'All Analyses',
                organization: 'All Analyses',
                data: {}
            };
        }
    } else {
        data = await storageManager.loadAnalysisDataForOrganization(name);
    }
    
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container element not found: ${containerId}`);
        return null;
    }
    
    if (!data || !data.data) {
        console.warn(`⚠️ No data found for: ${name || 'aggregated data'}`);
        if (noDataSection) {
            noDataSection.classList.remove('d-none');
        }
        // Use safeSetHTML if available, otherwise escape and use innerHTML
        const alertHtml = '<div class="alert alert-warning">No data found for this entry.</div>';
        if (window.viewManager && typeof window.viewManager.safeSetHTML === 'function') {
            window.viewManager.safeSetHTML(container, alertHtml);
        } else {
            container.innerHTML = alertHtml;
        }
        return null;
    }
    
    console.log(`✅ Data loaded: ${data.organization || data.name}, has licenseAnalysis: ${!!data.data.licenseAnalysis}`);
    
    // Filter by repository if repo parameter is present
    if (repoFilter && data.data.vulnerabilityAnalysis && data.data.vulnerabilityAnalysis.vulnerableDependencies) {
        const filteredVulnDeps = data.data.vulnerabilityAnalysis.vulnerableDependencies.filter(dep => {
            if (dep.repositories && Array.isArray(dep.repositories)) {
                return dep.repositories.includes(repoFilter);
            }
            if (data.data.allDependencies) {
                const matchingDep = data.data.allDependencies.find(d => 
                    d.name === dep.name && d.version === dep.version
                );
                return matchingDep && matchingDep.repositories && matchingDep.repositories.includes(repoFilter);
            }
            return false;
        });
        // Create a copy of data and filter vulnerable dependencies
        data = JSON.parse(JSON.stringify(data));
        data.data.vulnerabilityAnalysis.vulnerableDependencies = filteredVulnDeps;
    }
    
    // Hide no data section if we have data
    if (noDataSection) {
        noDataSection.classList.add('d-none');
    }
    
    // Call render function if provided
    // Pass all filters: severityFilter, sectionFilter, repoFilter, categoryFilter
    // Different pages use different filters, so we pass all of them
    if (renderFunction && typeof renderFunction === 'function') {
        await renderFunction(data, severityFilter, sectionFilter, repoFilter, categoryFilter);
    } else if (!renderFunction && containerId === 'license-compliance-page') {
        // Default rendering for license page if no renderFunction provided
        if (window.viewManager && typeof window.viewManager.generateLicenseComplianceHTML === 'function') {
            const html = await window.viewManager.generateLicenseComplianceHTML(data, categoryFilter);
            window.viewManager.safeSetHTML(container, html);
        }
    }
    
    return data;
}

/**
 * Get URL parameters as an object with parsed values
 * @param {Array<string>} filterNames - Array of parameter names to extract
 * @returns {Object} - Object with parameter values
 */
function getUrlParams(filterNames = []) {
    const urlParams = new URLSearchParams(window.location.search);
    const result = {};
    
    filterNames.forEach(name => {
        const value = urlParams.get(name);
        if (value !== null) {
            result[name] = value.toLowerCase();
        }
    });
    
    return result;
}

/**
 * Get finding name from rule ID
 * Shared function for audit and findings pages
 * @param {string} ruleId - Rule identifier
 * @returns {string} - Human-readable name
 */
function getFindingName(ruleId) {
    const names = {
        'UNPINNED_ACTION_REFERENCE': 'Unpinned Action Reference',
        'MUTABLE_TAG_REFERENCE': 'Mutable Tag Reference',
        'DOCKER_FLOATING_TAG': 'Docker Floating Tag',
        'DOCKER_IMPLICIT_LATEST': 'Docker Implicit Latest Tag',
        'DOCKERFILE_FLOATING_BASE_IMAGE': 'Dockerfile Floating Base Image',
        'DOCKER_UNPINNED_DEPENDENCIES': 'Docker Unpinned Dependencies',
        'DOCKER_REMOTE_CODE_NO_INTEGRITY': 'Docker Remote Code Without Integrity Check',
        'COMPOSITE_NESTED_UNPINNED_ACTION': 'Composite Nested Unpinned Action',
        'COMPOSITE_UNPINNED_DEPENDENCIES': 'Composite Unpinned Dependencies',
        'COMPOSITE_REMOTE_CODE_NO_INTEGRITY': 'Composite Remote Code Without Integrity Check',
        'JS_REMOTE_CODE_NO_INTEGRITY': 'JavaScript Remote Code Without Integrity Check',
        'JS_RUNTIME_UNPINNED_DEPENDENCIES': 'JavaScript Runtime Unpinned Dependencies',
        'INDIRECT_UNPINNABLE_ACTION': 'Indirect Unpinnable Action',
        'NAMESPACE_NOT_IN_REGISTRY': 'Namespace Not Found (Dependency Confusion)',
        'PACKAGE_NOT_IN_REGISTRY': 'Package Not Found (Dependency Confusion)',
        'PULL_REQUEST_TARGET_CHECKOUT': 'Dangerous PR Target Checkout',
        'EXCESSIVE_WORKFLOW_PERMISSIONS': 'Excessive Workflow Permissions',
        'EXCESSIVE_JOB_PERMISSIONS': 'Excessive Job Permissions',
        'POTENTIAL_HARDCODED_SECRET': 'Potential Hardcoded Secret',
        'ACTION_METADATA_UNAVAILABLE': 'Action Metadata Unavailable',
        'ANALYSIS_ERROR': 'Analysis Error'
    };
    return names[ruleId] || ruleId;
}

/**
 * Get finding description from rule ID
 * Shared function for audit and findings pages
 * @param {string} ruleId - Rule identifier
 * @returns {string} - Description of the finding
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
        'NAMESPACE_NOT_IN_REGISTRY': 'Namespace/organization not found in public registry. This is a HIGH-CONFIDENCE dependency confusion risk. An attacker could register this namespace and all packages under it would be vulnerable to hijacking.',
        'PACKAGE_NOT_IN_REGISTRY': 'Package not found in public registry. This could indicate a private/internal package that is vulnerable to dependency confusion attacks. Attackers can register a package with the same name on public registries.',
        'PULL_REQUEST_TARGET_CHECKOUT': 'Dangerous pattern: pull_request_target workflow checks out PR code, which can execute untrusted code with elevated permissions.',
        'EXCESSIVE_WORKFLOW_PERMISSIONS': 'Workflow uses broad permissions like write-all, violating the principle of least privilege.',
        'EXCESSIVE_JOB_PERMISSIONS': 'Job uses write-all permissions. Specify only the required permissions.',
        'POTENTIAL_HARDCODED_SECRET': 'Environment variable appears to contain a hardcoded secret. Use GitHub Secrets instead.',
        'ACTION_METADATA_UNAVAILABLE': 'Could not retrieve action metadata. The action may be unavailable or the repository may have been deleted.',
        'ANALYSIS_ERROR': 'An error occurred during analysis of this action.'
    };
    return descriptions[ruleId] || 'Security issue detected.';
}

/**
 * Get severity badge class for Bootstrap
 * Shared function for audit and findings pages
 * @param {string} severity - Severity level
 * @returns {string} - Bootstrap badge class
 */
function getSeverityBadgeClass(severity) {
    switch (severity?.toLowerCase()) {
        case 'high':
        case 'error':
            return 'bg-danger';
        case 'medium':
            return 'bg-warning text-dark';
        case 'warning':
            return 'bg-info text-dark';
        case 'low':
            return 'bg-secondary';
        default:
            return 'bg-secondary';
    }
}

/**
 * Generate repository list HTML with modal support for many repos
 * Shared function for audit and findings pages
 * @param {Array} repositories - Array of repository names
 * @returns {string} - HTML string with repository links
 */
function generateRepoListHTML(repositories) {
    if (!repositories || repositories.length === 0) {
        return '-';
    }
    
    const repoCount = repositories.length;
    const repoLinks = repositories.map(r => 
        `<a href="https://github.com/${escapeHtml(r)}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><i class="fab fa-github me-1"></i>${escapeHtml(r)}</a>`
    );
    
    if (repoCount <= 3) {
        return repoLinks.join(', ');
    } else {
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
                                            <a href="https://github.com/${escapeHtml(repo)}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">
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

