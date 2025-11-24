/**
 * Common page initialization functions
 * Shared functions used across multiple page files to reduce duplication
 */

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

