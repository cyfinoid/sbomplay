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
        showFilterLoading('vulnerability-analysis-page');
        try {
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

                // Strip MAL- (malicious package) advisories out of the CVE
                // view so they don't pollute severity charts. Hydrate
                // `affected[]` from the per-package OSV cache first so
                // strict version matching can correctly drop legacy
                // false positives (e.g. importlib-metadata@2.0.0 vs
                // MAL-2024-2506) that pre-date the `affected[]`
                // persistence on stored vulnerability records.
                if (window.malwareService && data?.data?.vulnerabilityAnalysis) {
                    await window.malwareService.hydrateAffectedFromCache(data.data.vulnerabilityAnalysis);
                }
                const { filteredData, malwareCount } = excludeMalwareFromVulnAnalysis(data);

                // Apply reach filter (direct/transitive)
                const reachVal = document.getElementById('reachFilter')?.value || 'all';
                if (reachVal !== 'all' && filteredData?.data?.vulnerabilityAnalysis?.vulnerableDependencies) {
                    const allDeps = filteredData.data.allDependencies || [];
                    const allRepos = filteredData.data.allRepositories || [];
                    const directMap = window.InsightsAggregator
                        ? window.InsightsAggregator.buildDirectMap(allRepos)
                        : buildSimpleDirectMap(allRepos);
                    const va = filteredData.data.vulnerabilityAnalysis;
                    va.vulnerableDependencies = va.vulnerableDependencies.filter(vd => {
                        const key = `${vd.name}@${vd.version}`;
                        const isDirect = directMap.has(key) && directMap.get(key).size > 0;
                        return reachVal === 'direct' ? isDirect : !isDirect;
                    });
                    va.vulnerablePackages = va.vulnerableDependencies.length;
                }

                let bannerHtml = '';
                if (malwareCount > 0) {
                    bannerHtml = `
                        <div class="alert alert-danger d-flex align-items-center justify-content-between" role="alert">
                            <div>
                                <i class="fas fa-biohazard me-2"></i>
                                <strong>${malwareCount} malicious package advisor${malwareCount === 1 ? 'y' : 'ies'} detected.</strong>
                                These are not listed below — see the Findings page for full details.
                            </div>
                            <a href="findings.html" class="btn btn-sm btn-light">
                                <i class="fas fa-arrow-right me-1"></i>Open Findings page
                            </a>
                        </div>`;
                }

                const html = await viewManager.generateVulnerabilityAnalysisHTML(filteredData, severityFilter, 25, 0);
                viewManager.safeSetHTML(container, bannerHtml + html);
                if (typeof viewManager.addOverviewEventListeners === 'function') {
                    viewManager.addOverviewEventListeners();
                }
            }
        });
        
        return data;
        } finally {
            hideFilterLoading('vulnerability-analysis-page');
        }
    }
    
    // Setup event listeners
    document.getElementById('analysisSelector').addEventListener('change', loadVulnerabilityData);
    document.getElementById('severityFilter').addEventListener('change', loadVulnerabilityData);
    const reachFilterEl = document.getElementById('reachFilter');
    if (reachFilterEl) {
        reachFilterEl.addEventListener('change', loadVulnerabilityData);
    }
    
    // Load initial data
    await loadVulnerabilityData();
});

/**
 * Return a deep-cloned copy of the analysis data with malware advisories
 * (`kind: 'malware'` or `id` starting with `MAL-`) stripped from
 * `vulnerabilityAnalysis.vulnerableDependencies`. Packages that are left
 * with zero CVE-style vulns after stripping are removed entirely.
 * Counts (`vulnerablePackages`, severity buckets) are recomputed.
 *
 * @param {Object} data - Loaded organization analysis data.
 * @returns {{ filteredData: Object, malwareCount: number }}
 */
function excludeMalwareFromVulnAnalysis(data) {
    if (!data || !data.data || !data.data.vulnerabilityAnalysis) {
        return { filteredData: data, malwareCount: 0 };
    }
    const cloned = JSON.parse(JSON.stringify(data));
    const va = cloned.data.vulnerabilityAnalysis;
    if (!Array.isArray(va.vulnerableDependencies)) {
        return { filteredData: cloned, malwareCount: 0 };
    }

    const isMalware = v => !!v && (
        v.kind === 'malware' ||
        (typeof v.id === 'string' && v.id.startsWith('MAL-'))
    );

    let malwareCount = 0;
    const filteredDeps = [];
    for (const dep of va.vulnerableDependencies) {
        const vulns = Array.isArray(dep.vulnerabilities) ? dep.vulnerabilities : [];
        const cveOnly = [];
        const ecosystem = dep.ecosystem || dep.category?.ecosystem || null;
        for (const v of vulns) {
            if (isMalware(v)) {
                // Sanitize legacy data: a MAL- advisory only counts toward
                // the malware banner if it actually applies to this dep's
                // version. Stored analyses produced before strict version
                // matching existed may carry false positives - we drop
                // them silently instead of inflating the banner.
                const applies = window.osvService
                    ? window.osvService.advisoryAppliesToVersion(v, dep.version, ecosystem)
                    : true;
                if (applies) malwareCount++;
            } else {
                cveOnly.push(v);
            }
        }
        if (cveOnly.length > 0) {
            filteredDeps.push({ ...dep, vulnerabilities: cveOnly });
        }
    }
    va.vulnerableDependencies = filteredDeps;
    va.vulnerablePackages = filteredDeps.length;

    // Recompute severity counters so the dashboard tiles stay accurate.
    let critical = 0, high = 0, medium = 0, low = 0;
    for (const dep of filteredDeps) {
        for (const v of dep.vulnerabilities || []) {
            const sev = window.osvService ? window.osvService.getHighestSeverity(v) : (v.severity || 'UNKNOWN');
            if (sev === 'CRITICAL') critical++;
            else if (sev === 'HIGH') high++;
            else if (sev === 'MEDIUM' || sev === 'MODERATE') medium++;
            else if (sev === 'LOW') low++;
        }
    }
    va.criticalVulnerabilities = critical;
    va.highVulnerabilities = high;
    va.mediumVulnerabilities = medium;
    va.lowVulnerabilities = low;

    return { filteredData: cloned, malwareCount };
}

function buildSimpleDirectMap(allRepos) {
    const map = new Map();
    for (const repo of (allRepos || [])) {
        const repoKey = `${repo.owner}/${repo.name}`;
        for (const depKey of (repo.directDependencies || [])) {
            if (!map.has(depKey)) map.set(depKey, new Set());
            map.get(depKey).add(repoKey);
        }
    }
    return map;
}

