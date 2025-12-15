/**
 * JavaScript for index.html page
 * Handles collapse icon rotation and page-specific functionality
 */

document.addEventListener('DOMContentLoaded', function() {
    // Setup collapse icon rotations for all collapsible sections
    const collapseConfigs = [
        { collapseId: 'resultsCollapse', iconId: 'resultsCollapseIcon' },
        { collapseId: 'statsOverviewCollapse', iconId: 'statsOverviewCollapseIcon' },
        { collapseId: 'qualityCollapse', iconId: 'qualityCollapseIcon' },
        { collapseId: 'licenseDistributionCollapse', iconId: 'licenseDistributionCollapseIcon' },
        { collapseId: 'topCommonDependenciesCollapse', iconId: 'topCommonDependenciesCollapseIcon' },
        { collapseId: 'versionSprawlCollapse', iconId: 'versionSprawlCollapseIcon' }
    ];
    
    collapseConfigs.forEach(config => {
        setupCollapseIcon(config.collapseId, config.iconId);
    });
    
    // Attach event listeners for buttons that previously used onclick handlers
    // Resume Analysis button
    const resumeBtn = document.getElementById('resumeBtn');
    if (resumeBtn) {
        resumeBtn.addEventListener('click', function() {
            if (window.app && typeof window.app.resumeAnalysis === 'function') {
                window.app.resumeAnalysis();
            }
        });
    }
    
    // Clear Rate Limit State button
    const clearRateLimitBtn = document.getElementById('clearRateLimitBtn');
    if (clearRateLimitBtn) {
        clearRateLimitBtn.addEventListener('click', function() {
            if (window.app && typeof window.app.clearRateLimitState === 'function') {
                window.app.clearRateLimitState();
            }
        });
    }
    
    // Start Analysis button
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', function() {
            if (typeof startAnalysis === 'function') {
                startAnalysis();
            }
        });
    }
    
    // Token section toggle
    const tokenHeader = document.getElementById('tokenSectionHeader');
    if (tokenHeader) {
        tokenHeader.addEventListener('click', function() {
            if (typeof toggleTokenSection === 'function') {
                toggleTokenSection();
            }
        });
    }
    
    // Save Token button
    const saveTokenBtn = document.getElementById('saveTokenBtn');
    if (saveTokenBtn) {
        saveTokenBtn.addEventListener('click', function() {
            if (typeof saveToken === 'function') {
                saveToken();
            }
        });
    }
    
    // Handle URL hash to activate upload tab if coming from upload.html redirect
    if (window.location.hash === '#upload-tab') {
        const uploadTab = document.getElementById('upload-tab');
        if (uploadTab) {
            // Use Bootstrap's Tab API to show the upload tab
            const tab = new bootstrap.Tab(uploadTab);
            tab.show();
            // Scroll to the input section
            const inputCard = uploadTab.closest('.card');
            if (inputCard) {
                inputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }
});

