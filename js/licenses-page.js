/**
 * JavaScript for licenses.html page
 * Handles license compliance page initialization and data loading
 * Converted from ES6 module to regular script for file:// compatibility
 */

document.addEventListener('DOMContentLoaded', async function() {
    const storageManager = new StorageManager();
    await storageManager.init();
    const viewManager = new ViewManager();
    
    // Make viewManager and storageManager available globally for onclick handlers
    window.viewManager = viewManager;
    window.storageManager = storageManager;
    
    // Load analysis list into selector
    await loadAnalysesList('analysisSelector', storageManager, true, document.getElementById('noDataSection'));
    
    // Check for category and repo filters in URL and pre-select
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    const repoParam = urlParams.get('repo');
    if (categoryParam) {
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.value = categoryParam.toLowerCase();
        }
    }
    
    async function loadLicenseData() {
        try {
            const analysisName = document.getElementById('analysisSelector')?.value;
            const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
            const container = document.getElementById('license-compliance-page');
            
            if (!analysisName) {
                if (container) {
                    container.innerHTML = '<div class="alert alert-info">Please select an analysis to view license compliance data.</div>';
                }
                return;
            }
            
            console.log(`📋 Loading license data for: ${analysisName}, filter: ${categoryFilter}`);
            
            const filterValue = categoryFilter === 'all' ? null : categoryFilter;
            
            const data = await loadOrganizationData(analysisName, storageManager, {
                categoryFilter: filterValue,
                containerId: 'license-compliance-page',
                noDataSection: document.getElementById('noDataSection'),
                renderFunction: async (orgData, severityFilter, sectionFilter, repoFilter, categoryFilter) => {
                    if (!orgData || !orgData.data) {
                        console.warn('⚠️ No organization data found');
                        return;
                    }
                    
                    // Check if license analysis exists
                    if (!orgData.data.licenseAnalysis) {
                        console.warn('⚠️ No license analysis found in data');
                        const container = document.getElementById('license-compliance-page');
                        if (container) {
                            container.innerHTML = '<div class="alert alert-warning">No license compliance analysis found. Please run a license compliance check in the main app.</div>';
                        }
                        return;
                    }
                    
                    console.log('✅ License analysis found, rendering...');
                    // Render license compliance HTML with the filter value
                    if (window.viewManager && typeof window.viewManager.generateLicenseComplianceHTML === 'function') {
                        const html = await window.viewManager.generateLicenseComplianceHTML(orgData, categoryFilter);
                        const container = document.getElementById('license-compliance-page');
                        if (container) {
                            window.viewManager.safeSetHTML(container, html);
                            
                            // If category filter is present, automatically expand that section
                            if (categoryFilter && typeof categoryFilter === 'string') {
                                // Wait a bit for DOM to be ready, then trigger the click
                                setTimeout(() => {
                                    const categoryCard = document.querySelector(`.license-card.${categoryFilter}`);
                                    if (categoryCard) {
                                        categoryCard.click();
                                    }
                                }, 100);
                            }
                        }
                    }
                }
            });
            
            if (!data || !data.data || !data.data.licenseAnalysis) {
                console.warn('⚠️ License analysis data not found');
                if (container) {
                    container.innerHTML = '<div class="alert alert-warning">No license compliance analysis found. Please run a license compliance check in the main app.</div>';
                }
            }
        } catch (error) {
            console.error('❌ Error loading license data:', error);
            console.error('   Error details:', error.stack);
            const container = document.getElementById('license-compliance-page');
            if (container) {
                container.innerHTML = '<div class="alert alert-danger">Error loading license data. Please try again.</div>';
            }
        }
    }
    
    async function updateCountsOnly() {
        const categoryFilter = document.getElementById('categoryFilter').value;
        const filterValue = categoryFilter === 'all' ? null : categoryFilter;
        if (window.viewManager && typeof window.viewManager.updateLicenseCardCounts === 'function') {
            await window.viewManager.updateLicenseCardCounts(filterValue);
        }
    }
    
    // Setup event listeners
    document.getElementById('analysisSelector').addEventListener('change', loadLicenseData);
    document.getElementById('categoryFilter').addEventListener('change', async function() {
        // Reload data to update both counts and high-risk list with new filter
        await loadLicenseData();
    });
    
    // Load initial data
    await loadLicenseData();
});

