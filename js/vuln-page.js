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
                // view so they don't pollute severity charts. They get
                // their own dedicated `malware.html` page. Hydrate
                // `affected[]` from the per-package OSV cache first so
                // strict version matching can correctly drop legacy
                // false positives (e.g. importlib-metadata@2.0.0 vs
                // MAL-2024-2506) that pre-date the `affected[]`
                // persistence on stored vulnerability records.
                if (window.malwareService && data?.data?.vulnerabilityAnalysis) {
                    await window.malwareService.hydrateAffectedFromCache(data.data.vulnerabilityAnalysis);
                }
                const { filteredData, malwareCount } = excludeMalwareFromVulnAnalysis(data);

                let bannerHtml = '';
                if (malwareCount > 0) {
                    bannerHtml = `
                        <div class="alert alert-danger d-flex align-items-center justify-content-between" role="alert">
                            <div>
                                <i class="fas fa-biohazard me-2"></i>
                                <strong>${malwareCount} malicious package advisor${malwareCount === 1 ? 'y' : 'ies'} detected.</strong>
                                These are not listed below — see the dedicated Malware page for full details.
                            </div>
                            <a href="malware.html" class="btn btn-sm btn-light">
                                <i class="fas fa-arrow-right me-1"></i>Open Malware page
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

    // ---------- Phase 3 (VEX) wiring ----------
    // Upload, suppression toggle, and management modal. Upload triggers a
    // re-run of `applyVexStatements` for the current analysis so the page
    // re-renders without requiring a full enrichment cycle.
    const vexInput = document.getElementById('vexUploadInput');
    const vexSuppressToggle = document.getElementById('vexSuppressToggle');
    const vexUploadStatus = document.getElementById('vexUploadStatus');
    const vexManageBtn = document.getElementById('vexManageBtn');
    const vexSummary = document.getElementById('vexSummary');

    // Suppression preference is per-browser (machine-local) so it does not
    // mutate the analysis blob. Stored in localStorage with a sensible
    // default of "off" — users should opt into suppression deliberately.
    if (vexSuppressToggle) {
        vexSuppressToggle.checked = localStorage.getItem('sbomplay_vex_suppress') === '1';
        window.__vexSuppress = vexSuppressToggle.checked;
        vexSuppressToggle.addEventListener('change', async () => {
            window.__vexSuppress = vexSuppressToggle.checked;
            localStorage.setItem('sbomplay_vex_suppress', vexSuppressToggle.checked ? '1' : '0');
            await loadVulnerabilityData();
        });
    }

    if (vexInput) {
        vexInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (!window.vexService) {
                vexUploadStatus.textContent = 'VEX service not loaded.';
                return;
            }
            try {
                vexUploadStatus.textContent = 'Parsing VEX document...';
                const text = await file.text();
                const parsed = window.vexService.parseDocument(text, { filename: file.name });
                const analysisName = document.getElementById('analysisSelector').value || null;
                await storageManager.indexedDB.saveVexDocument(parsed.vexId, {
                    ...parsed,
                    analysisIdentifier: analysisName // null = applies to all
                });
                vexUploadStatus.innerHTML = `<span class="text-success"><i class="fas fa-check me-1"></i>${parsed.format}: ${parsed.statementCount} statement(s) saved.</span>`;

                // Re-run the VEX phase against the active analysis so the
                // page re-renders annotations without a full enrichment cycle.
                await reapplyVexForCurrentAnalysis();
                await loadVulnerabilityData();
            } catch (err) {
                console.error('VEX upload failed:', err);
                vexUploadStatus.innerHTML = `<span class="text-danger">${err.message}</span>`;
            } finally {
                event.target.value = '';
            }
        });
    }

    if (vexManageBtn) {
        vexManageBtn.addEventListener('click', async () => {
            await openVexManageDialog();
        });
    }

    // Render VEX summary line under the toggle so the user sees the impact
    // of any uploaded documents without opening another page.
    async function refreshVexSummary() {
        try {
            const docs = await storageManager.indexedDB.getAllVexDocuments();
            if (!docs || docs.length === 0) {
                vexSummary.textContent = 'No VEX/VDR documents uploaded.';
                return;
            }
            const totalStmts = docs.reduce((sum, d) => sum + (d.statementCount || 0), 0);
            vexSummary.innerHTML = `<i class="fas fa-shield-alt me-1"></i>${docs.length} document(s), ${totalStmts} statement(s) on file.`;
        } catch {
            vexSummary.textContent = '';
        }
    }
    await refreshVexSummary();

    async function reapplyVexForCurrentAnalysis() {
        const analysisName = document.getElementById('analysisSelector').value;
        if (!analysisName) return; // No-op for "All Analyses" aggregate view.
        try {
            // Lightweight re-application: load the analysis, run the VEX
            // phase against an in-memory sbomProcessor surrogate, and write
            // back via updateAnalysisWithVulnerabilities.
            const data = await storageManager.loadAnalysisDataForOrganization(analysisName);
            if (!data || !data.vulnerabilityAnalysis) return;
            const surrogate = { vulnerabilityAnalysis: data.vulnerabilityAnalysis };
            const pipeline = new EnrichmentPipeline(surrogate, storageManager);
            await pipeline.applyVexStatements(analysisName);
        } catch (err) {
            console.warn('VEX re-application failed:', err.message);
        }
        await refreshVexSummary();
    }

    async function openVexManageDialog() {
        const docs = await storageManager.indexedDB.getAllVexDocuments();
        if (!docs || docs.length === 0) {
            alert('No VEX documents have been uploaded yet.');
            return;
        }
        const lines = docs.map(d =>
            `${d.format}\t${d.filename || '(no filename)'}\t${d.statementCount || 0} stmts\tscope: ${d.analysisIdentifier || 'all analyses'}`
        ).join('\n');
        const choice = prompt(
            `Uploaded VEX documents:\n\n${lines}\n\nEnter a vexId to delete, or leave blank to cancel.\n\nIDs:\n${docs.map(d => d.vexId).join('\n')}`
        );
        if (choice && choice.trim()) {
            await storageManager.indexedDB.deleteVexDocument(choice.trim());
            await reapplyVexForCurrentAnalysis();
            await loadVulnerabilityData();
            await refreshVexSummary();
        }
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

