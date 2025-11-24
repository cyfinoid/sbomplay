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
    const storageManager = window.storageManager;
    if (!storageManager) {
        console.error('StorageManager is not available. Please ensure storage-manager.js is loaded.');
        return;
    }
    await storageManager.init();
    
    const viewManager = new ViewManager();
    
    // Make viewManager available globally for HTML onclick handlers
    window.viewManager = viewManager;
    
    // Check for severity and repo filters in URL and pre-select
    const urlParamsObj = getUrlParams(['severity', 'repo']);
    if (urlParamsObj.severity) {
        const severityFilter = document.getElementById('severityFilter');
        if (severityFilter) {
            severityFilter.value = urlParamsObj.severity;
        }
    }
    
    // Load analysis list into selector
    await loadAnalysesList('analysisSelector', storageManager, document.getElementById('noDataSection'));
    
    async function loadVulnerabilityData() {
        const analysisName = document.getElementById('analysisSelector').value;
        const severityFilter = document.getElementById('severityFilter').value;
        
        // Note: analysisName can be empty string '' for aggregated view - don't skip loading!
        console.log(`📋 Loading vulnerability data for: ${analysisName || 'All Analyses (aggregated)'}`);
        
        // Use severity filter from parameter or URL
        const severityFilterValue = severityFilter === 'all' ? null : severityFilter.toUpperCase();
        
        const data = await loadOrganizationData(analysisName, storageManager, {
            severityFilter: severityFilterValue,
            repoFilter: urlParamsObj.repo || null,
            containerId: 'vulnerability-analysis-page',
            noDataSection: document.getElementById('noDataSection'),
            renderFunction: async (data, severityFilter, sectionFilter, repoFilter, categoryFilter) => {
                console.log(`📋 Rendering vulnerability data:`, data?.data?.vulnerabilityAnalysis ? 
                    `${data.data.vulnerabilityAnalysis.vulnerablePackages || 0} vulnerable packages` : 
                    'No vulnerability analysis found');
                    
                const container = document.getElementById('vulnerability-analysis-page');
                // Render full vulnerability analysis dashboard (await the async method)
                // Default to showing first 25 entries
                const html = await viewManager.generateVulnerabilityAnalysisHTML(data, severityFilter, 25, 0);
                viewManager.safeSetHTML(container, html);
                if (typeof viewManager.addOverviewEventListeners === 'function') {
                    viewManager.addOverviewEventListeners();
                }
            }
        });
        
        return data;
    }
    
    // Setup event listeners
    document.getElementById('analysisSelector').addEventListener('change', loadVulnerabilityData);
    document.getElementById('severityFilter').addEventListener('change', loadVulnerabilityData);
    
    // Load initial data
    await loadVulnerabilityData();
});

