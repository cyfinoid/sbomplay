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
});

