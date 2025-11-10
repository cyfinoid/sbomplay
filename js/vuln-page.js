/**
 * JavaScript for vuln.html page
 * Handles vulnerability analysis page initialization and data loading
 */

document.addEventListener('DOMContentLoaded', async function() {
    // Wait for required classes to be available
    if (typeof StorageManager === 'undefined') {
        console.error('StorageManager is not defined. Please ensure storage-manager.js is loaded.');
        return;
    }
    if (typeof ViewManager === 'undefined') {
        console.error('ViewManager is not defined. Please ensure view-manager.js is loaded.');
        return;
    }
    
    // Use the global storageManager instance from storage-manager.js
    const storageManager = new StorageManager();
    await storageManager.init();
    
    // Make storageManager available globally for use in ViewManager methods
    window.storageManager = storageManager;
    
    const viewManager = new ViewManager();
    
    // Make viewManager available globally for HTML onclick handlers
    window.viewManager = viewManager;
    
    // Load analysis list into selector
    await loadAnalysesList();
    
    // Check for severity and repo filters in URL and pre-select
    const urlParams = new URLSearchParams(window.location.search);
    const severityParam = urlParams.get('severity');
    const repoParam = urlParams.get('repo');
    if (severityParam) {
        const severityFilter = document.getElementById('severityFilter');
        if (severityFilter) {
            severityFilter.value = severityParam.toLowerCase();
        }
    }
    
    // Load entry data for vulnerability analysis (define before use)
    window.loadOrganizationData = async function(name, severityFilter = null) {
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
        
        const container = document.getElementById('vulnerability-analysis-page');
        
        if (!data || !data.data) {
            container.innerHTML = '<div class="alert alert-warning">No data found for this entry.</div>';
            return;
        }
        
        // Filter by repository if repo parameter is present
        if (repoParam && data.data.vulnerabilityAnalysis && data.data.vulnerabilityAnalysis.vulnerableDependencies) {
            const filteredVulnDeps = data.data.vulnerabilityAnalysis.vulnerableDependencies.filter(dep => {
                // Check if this dependency is used in the specified repository
                if (dep.repositories && Array.isArray(dep.repositories)) {
                    return dep.repositories.includes(repoParam);
                }
                // Also check allDependencies for repository usage
                if (data.data.allDependencies) {
                    const matchingDep = data.data.allDependencies.find(d => 
                        d.name === dep.name && d.version === dep.version
                    );
                    return matchingDep && matchingDep.repositories && matchingDep.repositories.includes(repoParam);
                }
                return false;
            });
            // Create a copy of data and filter vulnerable dependencies
            data = JSON.parse(JSON.stringify(data)); // Deep copy
            data.data.vulnerabilityAnalysis.vulnerableDependencies = filteredVulnDeps;
        }
        
        // Use severity filter from parameter or URL
        if (!severityFilter) {
            const urlParams = new URLSearchParams(window.location.search);
            severityFilter = urlParams.get('severity')?.toUpperCase();
        }
        
        // Render full vulnerability analysis dashboard (await the async method)
        // Default to showing first 25 entries
        viewManager.safeSetHTML(container, await viewManager.generateVulnerabilityAnalysisHTML(data, severityFilter, 25, 0));
        if (typeof viewManager.addOverviewEventListeners === 'function') {
            viewManager.addOverviewEventListeners();
        }
    };
    
    async function loadAnalysesList() {
        const storageInfo = await storageManager.getStorageInfo();
        const selector = document.getElementById('analysisSelector');
        const allEntries = [...storageInfo.organizations, ...storageInfo.repositories];
        
        if (allEntries.length === 0) {
            document.getElementById('noDataSection').style.display = 'block';
            selector.disabled = true;
            return;
        }
        
        // Add individual entries
        allEntries.forEach(entry => {
            const option = document.createElement('option');
            option.value = entry.name;
            option.textContent = `${entry.name} (${entry.dependencies} deps)`;
            selector.appendChild(option);
        });
    }
    
    async function loadVulnerabilityData() {
        const analysisName = document.getElementById('analysisSelector').value;
        const severityFilter = document.getElementById('severityFilter').value;
        
        if (!analysisName) {
            document.getElementById('vulnerability-analysis-page').innerHTML = '<div class="alert alert-info">Please select an analysis to view vulnerability data.</div>';
            return;
        }
        
        await loadOrganizationData(analysisName, severityFilter === 'all' ? null : severityFilter.toUpperCase());
    }
    
    // Setup event listeners
    document.getElementById('analysisSelector').addEventListener('change', loadVulnerabilityData);
    document.getElementById('severityFilter').addEventListener('change', loadVulnerabilityData);
    
    // Load initial data
    await loadVulnerabilityData();
});

