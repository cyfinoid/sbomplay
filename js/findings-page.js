/**
 * JavaScript for findings.html page
 * Handles security findings page initialization and data loading
 * Focuses on: GitHub Actions security issues, Dependency confusion/hijacking risks,
 *             EOX (End-of-Life/Support) issues, and dead source repository detection
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
    const urlParamsObj = getUrlParams(['severity', 'type']);
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
    if (urlParamsObj.type) {
        const findingTypeFilter = document.getElementById('findingTypeFilter');
        if (findingTypeFilter) {
            findingTypeFilter.value = urlParamsObj.type;
        }
    }
    
    // Load analysis list into selector
    await loadAnalysesList('analysisSelector', storageManager, document.getElementById('noDataSection'));
    
    /**
     * Attach click handlers for package details links
     * @param {Object} data - The analysis data
     * @param {string} currentOrg - Current organization selector value
     */
    function attachPackageDetailsHandlers(data, currentOrg) {
        const links = document.querySelectorAll('.package-details-link');
        links.forEach(link => {
            if (link.hasAttribute('data-handler-attached')) return;
            link.setAttribute('data-handler-attached', 'true');
            
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                
                const packageName = link.getAttribute('data-package-name');
                const packageVersion = link.getAttribute('data-package-version');
                const packageEcosystem = link.getAttribute('data-package-ecosystem');
                let repositories = [];
                let depInfo = null;
                
                try {
                    repositories = JSON.parse(link.getAttribute('data-package-repos') || '[]');
                } catch (err) {
                    console.warn('Failed to parse package repos:', err);
                }
                
                try {
                    depInfo = JSON.parse(link.getAttribute('data-dep-info') || '{}');
                } catch (err) {
                    console.warn('Failed to parse dep info:', err);
                }
                
                // Check if the shared modal function is available
                if (typeof window.showPackageDetailsModal === 'function') {
                    await window.showPackageDetailsModal({
                        packageName,
                        packageVersion,
                        ecosystem: packageEcosystem,
                        repositories,
                        depInfo,
                        analysisData: data?.data || null,
                        currentOrg: currentOrg || ''
                    });
                } else {
                    console.error('Package details modal not available');
                }
            });
        });
    }
    
    async function loadFindingsData() {
        const analysisSelector = document.getElementById('analysisSelector');
        const severityFilterEl = document.getElementById('severityFilter');
        const findingTypeFilterEl = document.getElementById('findingTypeFilter');
        const repoFilterEl = document.getElementById('repoFilter');
        
        if (!analysisSelector) {
            const container = document.getElementById('findings-page-content');
            if (container) {
                safeSetHTML(container, '<div class="alert alert-info">Please select an analysis to view security findings.</div>');
            }
            return;
        }
        
        // Use filters from form or URL
        const severityFilter = severityFilterEl ? severityFilterEl.value : (urlParamsObj.severity || 'all');
        const findingTypeFilter = findingTypeFilterEl ? findingTypeFilterEl.value : (urlParamsObj.type || 'all');
        const repoFilter = repoFilterEl ? repoFilterEl.value : (urlParamsObj.repo || 'all');
        
        await loadOrganizationData(analysisSelector.value, storageManager, {
            severityFilter: severityFilter === 'all' ? null : severityFilter,
            findingTypeFilter: findingTypeFilter === 'all' ? null : findingTypeFilter,
            repoFilter: repoFilter === 'all' ? null : repoFilter,
            containerId: 'findings-page-content',
            noDataSection: document.getElementById('noDataSection'),
            renderFunction: async (data, severityFilter, sectionFilter, repoFilter, categoryFilter) => {
                // Populate repository filter dropdown
                populateRepoFilter(data);
                
                // Set repo filter from URL if present (after populating dropdown)
                if (repoFilter && repoFilterEl) {
                    const option = repoFilterEl.querySelector(`option[value="${repoFilter}"]`);
                    if (option) {
                        repoFilterEl.value = repoFilter;
                    }
                }
                
                const container = document.getElementById('findings-page-content');
                // Get findingTypeFilter from the dropdown since it's not passed through
                const typeFilter = findingTypeFilterEl ? findingTypeFilterEl.value : 'all';
                // Render security findings (async to support cache lookups)
                const html = await generateSecurityFindingsHTML(data, severityFilter || 'all', typeFilter, repoFilter || 'all', storageManager);
                safeSetHTML(container, html);
                
                // Attach click handlers for package details links
                attachPackageDetailsHandlers(data, analysisSelector.value);
            }
        });
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
        await loadFindingsData();
    }
    
    // Handle analysis selector change
    if (analysisSelector) {
        analysisSelector.addEventListener('change', loadFindingsData);
    }
    
    // Handle severity filter change
    const severityFilter = document.getElementById('severityFilter');
    if (severityFilter) {
        severityFilter.addEventListener('change', loadFindingsData);
    }
    
    // Handle finding type filter change
    const findingTypeFilter = document.getElementById('findingTypeFilter');
    if (findingTypeFilter) {
        findingTypeFilter.addEventListener('change', loadFindingsData);
    }
    
    // Handle repo filter change
    const repoFilter = document.getElementById('repoFilter');
    if (repoFilter) {
        repoFilter.addEventListener('change', loadFindingsData);
    }
    
    // Note: getFindingName, getFindingDescription, getSeverityBadgeClass, and generateRepoListHTML
    // are defined in page-common.js to avoid code duplication across audit-page.js and findings-page.js
    
    /**
     * Get staleness data for a dependency from IndexedDB packages cache
     * @param {Object} storageManager - StorageManager instance
     * @param {Object} dep - Dependency object
     * @returns {Object|null} - Staleness data or null
     */
    async function getStalenessFromCache(storageManager, dep) {
        try {
            if (!storageManager?.indexedDB) return null;
            
            // Normalize ecosystem for package key (same as deps-page.js)
            let ecosystem = (dep.category?.ecosystem || dep.ecosystem || '').toLowerCase();
            if (ecosystem === 'rubygems' || ecosystem === 'gem') {
                ecosystem = 'gem';
            } else if (ecosystem === 'go' || ecosystem === 'golang') {
                ecosystem = 'golang';
            } else if (ecosystem === 'packagist' || ecosystem === 'composer') {
                ecosystem = 'composer';
            } else if (ecosystem === 'github actions') {
                ecosystem = 'github actions';
            }
            
            const packageKey = `${ecosystem}:${dep.name}`;
            const pkg = await storageManager.indexedDB.getPackage(packageKey);
            
            if (pkg && pkg.versionDrift && pkg.versionDrift[dep.version]) {
                return pkg.versionDrift[dep.version].staleness || null;
            }
            return null;
        } catch (e) {
            console.warn('Failed to get staleness from cache:', e);
            return null;
        }
    }
    
    /**
     * Get EOX status for a dependency dynamically using eoxService
     * @param {Object} dep - Dependency object
     * @returns {Object|null} - EOX status or null
     */
    async function getEOXStatusDynamic(dep) {
        try {
            if (!window.eoxService) return null;
            
            const ecosystem = dep.category?.ecosystem || dep.ecosystem || '';
            const eoxStatus = await window.eoxService.checkEOX(
                dep.name,
                dep.version,
                ecosystem
            );
            
            return eoxStatus || null;
        } catch (e) {
            // EOX check is optional, don't log errors
            return null;
        }
    }
    
    /**
     * Get staleness data dynamically using versionDriftAnalyzer
     * @param {Object} dep - Dependency object
     * @returns {Object|null} - Staleness data or null
     */
    async function getStalenessDynamic(dep) {
        try {
            if (!window.versionDriftAnalyzer) return null;
            
            const ecosystem = dep.category?.ecosystem || dep.ecosystem || '';
            const staleness = await window.versionDriftAnalyzer.checkStaleness(
                dep.name,
                dep.version,
                ecosystem
            );
            
            return staleness || null;
        } catch (e) {
            // Staleness check is optional, don't log errors
            return null;
        }
    }
    
    /**
     * Generate security findings HTML
     * Combines GitHub Actions findings and Dependency Confusion findings
     */
    async function generateSecurityFindingsHTML(orgData, severityFilter = 'all', findingTypeFilter = 'all', repoFilter = 'all', storageManager = null) {
        const allFindings = [];

        // === Collect Malware findings ===
        // Malware advisories are the most severe class of finding here -
        // they always map to "critical" severity and link out to the
        // dedicated Malware page for the full report.
        if (findingTypeFilter === 'all' || findingTypeFilter === 'malware') {
            // Always prefer to re-derive from `vulnerabilityAnalysis` so the
            // OSV-spec strict version filter (advisoryAppliesToVersion)
            // gets re-applied at read time. This cleans up legacy stored
            // analyses that pre-date strict matching without requiring
            // a re-enrichment. Fall back to the persisted malwareAnalysis
            // only when the source data is unavailable.
            let malwareAnalysis = null;
            if (window.malwareService && orgData?.data?.vulnerabilityAnalysis) {
                await window.malwareService.hydrateAffectedFromCache(orgData.data.vulnerabilityAnalysis);
                malwareAnalysis = window.malwareService.classifyFromVulnerabilityAnalysis(
                    orgData.data.vulnerabilityAnalysis,
                    orgData.data.allDependencies || []
                );
            }
            if (!malwareAnalysis) {
                malwareAnalysis = orgData?.data?.malwareAnalysis || null;
            }

            if (malwareAnalysis && Array.isArray(malwareAnalysis.maliciousDependencies)) {
                for (const md of malwareAnalysis.maliciousDependencies) {
                    const repos = Array.isArray(md.repositories) ? md.repositories : [];
                    if (repoFilter && repoFilter !== 'all' && !repos.includes(repoFilter)) continue;
                    if (severityFilter && severityFilter !== 'all' && severityFilter !== 'critical') continue;

                    const advisoryIds = (md.advisories || []).map(a => a.id).filter(Boolean);
                    const ecosystem = md.ecosystem || md.category?.ecosystem || 'unknown';
                    const summary = md.advisories && md.advisories[0] && md.advisories[0].summary
                        ? md.advisories[0].summary
                        : '';
                    const advisoryRef = advisoryIds.length > 0 ? advisoryIds[0] : null;

                    allFindings.push({
                        category: 'malware',
                        type: 'KNOWN_MALICIOUS_PACKAGE',
                        typeName: 'Known Malicious Package',
                        description: 'Dependency matches an OSV `MAL-*` advisory or the OpenSSF Malicious Packages dataset. Remove or replace immediately and rotate any secrets that may have been exposed.',
                        severity: 'critical',
                        package: `${md.name}@${md.version || 'unknown'}`,
                        packageName: md.name,
                        packageVersion: md.version || 'unknown',
                        ecosystem: ecosystem,
                        repository: repos.length > 0 ? repos[0] : null,
                        repositories: repos,
                        advisoryIds: advisoryIds,
                        primaryAdvisory: advisoryRef,
                        primaryAdvisoryUrl: advisoryRef ? `https://osv.dev/vulnerability/${encodeURIComponent(advisoryRef)}` : null,
                        message: advisoryIds.length === 1
                            ? `Advisory ${advisoryIds[0]}: ${summary || 'Malicious package detected.'}`
                            : `${advisoryIds.length} malware advisor${advisoryIds.length === 1 ? 'y' : 'ies'} detected. ${summary}`,
                        depInfo: {
                            name: md.name,
                            version: md.version,
                            type: 'direct',
                            license: null,
                            parentsByRepo: null
                        }
                    });
                }
            }
        }

        // === Collect GitHub Actions findings ===
        if (findingTypeFilter === 'all' || findingTypeFilter === 'github-actions') {
            const githubActionsAnalysis = orgData?.data?.githubActionsAnalysis;
            if (githubActionsAnalysis) {
                let gaFindings = [];
                
                // Collect findings from repositories (they have repository context)
                if (githubActionsAnalysis.repositories && Array.isArray(githubActionsAnalysis.repositories)) {
                    githubActionsAnalysis.repositories.forEach(repoResult => {
                        if (repoResult.findings && Array.isArray(repoResult.findings)) {
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
                
                // Read-time dedup: legacy stored analyses (pre-fix) emitted both
                // MUTABLE_TAG_REFERENCE and UNPINNED_ACTION_REFERENCE for the same
                // mutable-tag ref. Now that the analyzer emits exactly one of them,
                // suppress the redundant UNPINNED_ACTION_REFERENCE here too so old
                // stored data self-declutters on next page load (no re-enrichment).
                const mutableTagActions = new Set(
                    gaFindings
                        .filter(f => f.rule_id === 'MUTABLE_TAG_REFERENCE' && f.action)
                        .map(f => f.action)
                );
                if (mutableTagActions.size > 0) {
                    gaFindings = gaFindings.filter(f => !(
                        f.rule_id === 'UNPINNED_ACTION_REFERENCE' &&
                        f.action &&
                        mutableTagActions.has(f.action)
                    ));
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
                        workflowLocations: finding.workflowLocations || null,
                        actionRepository: finding.actionRepository || null,
                        actionDockerfile: finding.actionDockerfile || null
                    });
                });
            }
        }
        
        // === Collect Dependency Confusion findings ===
        if (findingTypeFilter === 'all' || findingTypeFilter === 'dependency-confusion') {
            const allDependencies = orgData?.data?.allDependencies || [];
            
            // HIGH-CONFIDENCE: Namespace not found (more severe - attacker can register entire namespace)
            const namespaceNotFoundDeps = allDependencies.filter(dep => dep.namespaceNotFound === true);
            namespaceNotFoundDeps.forEach(dep => {
                const repos = dep.repositories || [];
                
                // Filter by repository
                if (repoFilter && repoFilter !== 'all' && !repos.includes(repoFilter)) {
                    return;
                }
                
                // Filter by severity (these are always high)
                if (severityFilter && severityFilter !== 'all' && severityFilter !== 'high') {
                    return;
                }
                
                // Use confusionPurlName if available (when PURL name differs from SBOM name)
                const checkedName = dep.confusionPurlName || dep.name;
                const checkedPurl = dep.confusionPurl || dep.purl || null;
                
                allFindings.push({
                    category: 'dependency-confusion',
                    type: 'NAMESPACE_NOT_IN_REGISTRY',
                    typeName: 'HIGH-CONFIDENCE Dependency Confusion (Namespace Missing)',
                    description: getFindingDescription('NAMESPACE_NOT_IN_REGISTRY'),
                    severity: 'high',
                    package: `${checkedName}@${dep.version || 'unknown'}`,
                    sbomName: dep.name,  // Original SBOM name for reference
                    purl: checkedPurl,
                    ecosystem: dep.category?.ecosystem || 'unknown',
                    repository: repos.length > 0 ? repos[0] : null,
                    repositories: repos,
                    confusionEvidence: dep.confusionEvidence || null,
                    message: `Namespace for "${checkedName}" not found in public registry (${dep.category?.ecosystem || 'unknown'}). HIGH-CONFIDENCE dependency confusion risk - attacker could register entire namespace.`
                });
            });
            
            // Package not found (less severe than namespace not found, but still a risk)
            const packageNotFoundDeps = allDependencies.filter(dep => 
                dep.registryNotFound === true && !dep.namespaceNotFound
            );
            packageNotFoundDeps.forEach(dep => {
                const repos = dep.repositories || [];
                
                // Filter by repository
                if (repoFilter && repoFilter !== 'all' && !repos.includes(repoFilter)) {
                    return;
                }
                
                // Use confusionSeverity from dep if available, default to 'high'
                const findingSeverity = dep.confusionSeverity || 'high';
                
                // Filter by severity
                if (severityFilter && severityFilter !== 'all' && severityFilter !== findingSeverity) {
                    return;
                }
                
                // Use confusionPurlName if available (when PURL name differs from SBOM name)
                const checkedName = dep.confusionPurlName || dep.name;
                const checkedPurl = dep.confusionPurl || dep.purl || null;
                
                // Use confusionMessage if available, otherwise generate default message
                const ecosystem = dep.category?.ecosystem || 'unknown';
                const defaultMessage = `Package "${checkedName}" not found in public registry (${ecosystem}). Could be hijacked via dependency confusion attack.`;
                const findingMessage = dep.confusionMessage || defaultMessage;
                
                // Determine type name based on severity
                const typeName = findingSeverity === 'low' 
                    ? 'Potential Dependency Confusion (Low Risk - Likely System Package)' 
                    : 'Potential Dependency Confusion';
                
                allFindings.push({
                    category: 'dependency-confusion',
                    type: 'PACKAGE_NOT_IN_REGISTRY',
                    typeName: typeName,
                    description: getFindingDescription('PACKAGE_NOT_IN_REGISTRY'),
                    severity: findingSeverity,
                    package: `${checkedName}@${dep.version || 'unknown'}`,
                    sbomName: dep.name,  // Original SBOM name for reference
                    purl: checkedPurl,
                    ecosystem: ecosystem,
                    repository: repos.length > 0 ? repos[0] : null,
                    repositories: repos,
                    confusionEvidence: dep.confusionEvidence || null,
                    message: findingMessage
                });
            });
        }
        
        // === Collect EOX (End-of-Life/Support) findings ===
        if (findingTypeFilter === 'all' || findingTypeFilter === 'eox') {
            const allDependencies = orgData?.data?.allDependencies || [];
            
            for (const dep of allDependencies) {
                const repos = dep.repositories || [];
                
                // Filter by repository
                if (repoFilter && repoFilter !== 'all' && !repos.includes(repoFilter)) {
                    continue;
                }
                
                const ecosystem = dep.category?.ecosystem || dep.ecosystem || 'unknown';
                
                // Try to get EOX status:
                // 1. First check if eoxStatus exists directly on the dependency (new exports)
                //    -- but only if it was produced by the current matcher logic; older
                //    versions had false positives (e.g. @tailwindcss/node matched as Node.js).
                // 2. Otherwise compute dynamically via eoxService.
                const currentLogicVersion = (window.EOXService && window.EOXService.LOGIC_VERSION) || 0;
                let eoxStatus = dep.eoxStatus || null;
                if (eoxStatus && currentLogicVersion) {
                    const ver = Number(eoxStatus.logicVersion) || 0;
                    if (ver < currentLogicVersion) {
                        eoxStatus = null;
                    }
                }
                if (!eoxStatus && window.eoxService) {
                    eoxStatus = await getEOXStatusDynamic(dep);
                }
                
                // Check for EOL/EOS from eoxStatus
                if (eoxStatus) {
                    // Build a citation back to the endoflife.date page that confirmed
                    // the EOL/EOS so the Findings row can link to its source.
                    const productMatched = eoxStatus.productMatched || null;
                    const sourceUrl = productMatched
                        ? `https://endoflife.date/${encodeURIComponent(productMatched)}`
                        : null;
                    const sourceName = 'endoflife.date';

                    if (eoxStatus.isEOL) {
                        // Filter by severity (EOL is high)
                        if (severityFilter && severityFilter !== 'all' && severityFilter !== 'high') {
                            continue;
                        }
                        
                        allFindings.push({
                            category: 'eox',
                            type: 'EOL',
                            typeName: 'End-of-Life (EOL)',
                            description: 'Package has reached end-of-life and no longer receives security updates.',
                            severity: 'high',
                            package: `${dep.name}@${dep.version || 'unknown'}`,
                            packageName: dep.name,
                            packageVersion: dep.version || 'unknown',
                            ecosystem: ecosystem,
                            repository: repos.length > 0 ? repos[0] : null,
                            repositories: repos,
                            eolDate: eoxStatus.eolDate || null,
                            productMatched: productMatched,
                            sourceUrl: sourceUrl,
                            sourceName: sourceName,
                            message: `${dep.name} has reached End-of-Life${eoxStatus.eolDate ? ` (${eoxStatus.eolDate})` : ''}. No security updates are provided.`,
                            // Store minimal depInfo for the modal
                            depInfo: {
                                name: dep.name,
                                version: dep.version,
                                type: dep.type || 'direct',
                                license: dep.license,
                                parentsByRepo: dep.parentsByRepo
                            }
                        });
                        continue; // Don't add other EOX findings for this package
                    }
                    
                    if (eoxStatus.isEOS) {
                        // Filter by severity (EOS is medium)
                        if (severityFilter && severityFilter !== 'all' && severityFilter !== 'medium') {
                            continue;
                        }
                        
                        allFindings.push({
                            category: 'eox',
                            type: 'EOS',
                            typeName: 'End-of-Support (EOS)',
                            description: 'Package has reached end-of-support and may not receive security updates.',
                            severity: 'medium',
                            package: `${dep.name}@${dep.version || 'unknown'}`,
                            packageName: dep.name,
                            packageVersion: dep.version || 'unknown',
                            ecosystem: ecosystem,
                            repository: repos.length > 0 ? repos[0] : null,
                            repositories: repos,
                            eosDate: eoxStatus.eosDate || null,
                            productMatched: productMatched,
                            sourceUrl: sourceUrl,
                            sourceName: sourceName,
                            message: `${dep.name} has reached End-of-Support${eoxStatus.eosDate ? ` (${eoxStatus.eosDate})` : ''}. Security updates may not be provided.`,
                            // Store minimal depInfo for the modal
                            depInfo: {
                                name: dep.name,
                                version: dep.version,
                                type: dep.type || 'direct',
                                license: dep.license,
                                parentsByRepo: dep.parentsByRepo
                            }
                        });
                        continue;
                    }
                }
                
                // Try to get staleness data:
                // 1. First check if staleness exists directly on the dependency (new exports)
                // 2. If not, try to look up from IndexedDB packages cache
                // 3. If still not found, try to compute dynamically via versionDriftAnalyzer
                let staleness = dep.staleness || null;
                if (!staleness && storageManager) {
                    staleness = await getStalenessFromCache(storageManager, dep);
                }
                if (!staleness && window.versionDriftAnalyzer) {
                    staleness = await getStalenessDynamic(dep);
                }
                
                // Check for staleness-based probable EOL (from version drift analyzer)
                if (staleness && staleness.isProbableEOL) {
                    const monthsSince = staleness.monthsSinceRelease || 0;
                    
                    if (monthsSince >= 36) {
                        // Highly Likely EOL (3+ years) - high severity
                        if (severityFilter && severityFilter !== 'all' && severityFilter !== 'high') {
                            continue;
                        }
                        
                        allFindings.push({
                            category: 'eox',
                            type: 'HIGHLY_LIKELY_EOL',
                            typeName: 'Highly Likely EOL (Abandoned)',
                            description: 'Package has not been updated for 3+ years and is highly likely abandoned or end-of-life.',
                            severity: 'high',
                            package: `${dep.name}@${dep.version || 'unknown'}`,
                            packageName: dep.name,
                            packageVersion: dep.version || 'unknown',
                            ecosystem: ecosystem,
                            repository: repos.length > 0 ? repos[0] : null,
                            repositories: repos,
                            monthsSinceRelease: monthsSince,
                            lastReleaseDate: staleness.lastReleaseDate || null,
                            message: staleness.probableEOLReason || `No updates for ${Math.floor(monthsSince / 12)} years - highly likely abandoned/EOL`,
                            // Store minimal depInfo for the modal
                            depInfo: {
                                name: dep.name,
                                version: dep.version,
                                type: dep.type || 'direct',
                                license: dep.license,
                                parentsByRepo: dep.parentsByRepo
                            }
                        });
                    } else {
                        // Probable EOL (2-3 years) - medium severity
                        if (severityFilter && severityFilter !== 'all' && severityFilter !== 'medium') {
                            continue;
                        }
                        
                        allFindings.push({
                            category: 'eox',
                            type: 'PROBABLE_EOL',
                            typeName: 'Probable EOL',
                            description: 'Package has not been updated for 2+ years and may be abandoned or end-of-life.',
                            severity: 'medium',
                            package: `${dep.name}@${dep.version || 'unknown'}`,
                            packageName: dep.name,
                            packageVersion: dep.version || 'unknown',
                            ecosystem: ecosystem,
                            repository: repos.length > 0 ? repos[0] : null,
                            repositories: repos,
                            monthsSinceRelease: monthsSince,
                            lastReleaseDate: staleness.lastReleaseDate || null,
                            message: staleness.probableEOLReason || `No updates for 2+ years - probable EOL`,
                            // Store minimal depInfo for the modal
                            depInfo: {
                                name: dep.name,
                                version: dep.version,
                                type: dep.type || 'direct',
                                license: dep.license,
                                parentsByRepo: dep.parentsByRepo
                            }
                        });
                    }
                }
            }
        }
        
        // === Collect Source Repository findings (dead repos) ===
        if (findingTypeFilter === 'all' || findingTypeFilter === 'source-repo') {
            const allDependencies = orgData?.data?.allDependencies || [];
            
            for (const dep of allDependencies) {
                const repos = dep.repositories || [];
                
                // Filter by repository
                if (repoFilter && repoFilter !== 'all' && !repos.includes(repoFilter)) {
                    continue;
                }
                
                // Check for dead source repos
                if (dep.sourceRepoStatus && Array.isArray(dep.sourceRepoStatus)) {
                    for (const repoStatus of dep.sourceRepoStatus) {
                        if (repoStatus.valid === false) {
                            // Filter by severity (dead repos are medium severity)
                            if (severityFilter && severityFilter !== 'all' && severityFilter !== 'medium') {
                                continue;
                            }
                            
                            const ecosystem = dep.category?.ecosystem || dep.ecosystem || 'unknown';
                            const repoUrl = repoStatus.url || `${repoStatus.owner}/${repoStatus.repo}`;
                            
                            allFindings.push({
                                category: 'source-repo',
                                type: 'REPO_NOT_FOUND',
                                typeName: 'Source Repository Not Found',
                                description: 'The source repository listed in the SBOM does not exist. This could indicate an abandoned package or potential supply chain risk if the repo can be re-registered.',
                                severity: 'medium',
                                package: `${dep.name}@${dep.version || 'unknown'}`,
                                ecosystem: ecosystem,
                                repository: repos.length > 0 ? repos[0] : null,
                                repositories: repos,
                                sourceRepoUrl: repoUrl,
                                sourceRepoOwner: repoStatus.owner,
                                sourceRepoName: repoStatus.repo,
                                message: `Source repository "${repoStatus.owner}/${repoStatus.repo}" not found (404). The package may be abandoned or the repository was deleted.`
                            });
                        }
                    }
                }
            }
        }
        
        if (allFindings.length === 0) {
            return `<div class="alert alert-success">
                <i class="fas fa-check-circle me-2"></i>
                <strong>No security findings!</strong> No malicious packages, GitHub Actions security issues, dependency confusion risks, EOX issues, or dead source repos were detected for the selected filters.
            </div>`;
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
        
        // Sort by severity (critical first, then high, etc.) then by count
        const sortedTypes = Array.from(findingsByType.entries()).sort((a, b) => {
            const severityOrder = { 'critical': 4, 'high': 3, 'error': 3, 'medium': 2, 'warning': 1, 'low': 0 };
            const aSev = severityOrder[a[1].severity] || 0;
            const bSev = severityOrder[b[1].severity] || 0;
            if (aSev !== bSev) return bSev - aSev;
            return b[1].instances.length - a[1].instances.length;
        });
        
        // Calculate statistics
        const stats = {
            total: allFindings.length,
            critical: allFindings.filter(f => f.severity === 'critical').length,
            high: allFindings.filter(f => f.severity === 'high' || f.severity === 'error').length,
            medium: allFindings.filter(f => f.severity === 'medium').length,
            warning: allFindings.filter(f => f.severity === 'warning').length,
            low: allFindings.filter(f => f.severity === 'low').length,
            uniqueTypes: sortedTypes.length,
            malware: allFindings.filter(f => f.category === 'malware').length,
            githubActions: allFindings.filter(f => f.category === 'github-actions').length,
            dependencyConfusion: allFindings.filter(f => f.category === 'dependency-confusion').length,
            eox: allFindings.filter(f => f.category === 'eox').length,
            sourceRepo: allFindings.filter(f => f.category === 'source-repo').length
        };
        
        let html = '<div class="card mb-4">';
        html += '<div class="card-header"><h5 class="mb-0"><i class="fas fa-shield-alt me-2"></i>Security Findings Summary</h5></div>';
        html += '<div class="card-body">';
        
        // Severity breakdown (5 equal-width tiles)
        html += '<div class="row row-cols-2 row-cols-sm-3 row-cols-md-5 g-2 mb-2">';
        html += `<div class="col">
            <div class="card h-100 bg-light">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0">${stats.total}</h3>
                    <small class="text-muted">Total Findings</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col">
            <div class="card h-100 ${stats.critical > 0 ? 'bg-danger text-white' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0">${stats.critical}</h3>
                    <small class="${stats.critical > 0 ? '' : 'text-muted'}">Critical</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col">
            <div class="card h-100 ${stats.high > 0 ? 'bg-danger text-white' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0">${stats.high}</h3>
                    <small class="${stats.high > 0 ? '' : 'text-muted'}">High</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col">
            <div class="card h-100 ${stats.medium > 0 ? 'bg-warning' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0">${stats.medium}</h3>
                    <small class="${stats.medium > 0 ? '' : 'text-muted'}">Medium</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col">
            <div class="card h-100 ${stats.warning > 0 ? 'bg-info' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0">${stats.warning}</h3>
                    <small class="${stats.warning > 0 ? '' : 'text-muted'}">Warning</small>
                </div>
            </div>
        </div>`;
        html += '</div>';

        // Category breakdown (5 equal-width tiles, aligned with row above)
        html += '<div class="row row-cols-2 row-cols-sm-3 row-cols-md-5 g-2">';
        html += `<div class="col">
            <div class="card h-100 ${stats.malware > 0 ? 'bg-danger text-white' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0"><i class="fas fa-biohazard me-1"></i>${stats.malware}</h3>
                    <small class="${stats.malware > 0 ? '' : 'text-muted'}">Malware</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col">
            <div class="card h-100 bg-light">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0"><i class="fab fa-github me-1"></i>${stats.githubActions}</h3>
                    <small class="text-muted">GitHub Actions</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col">
            <div class="card h-100 bg-light">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0"><i class="fas fa-box me-1"></i>${stats.dependencyConfusion}</h3>
                    <small class="text-muted">Dep. Confusion</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col">
            <div class="card h-100 ${stats.eox > 0 ? 'bg-secondary text-white' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0"><i class="fas fa-hourglass-end me-1"></i>${stats.eox}</h3>
                    <small class="${stats.eox > 0 ? '' : 'text-muted'}">EOX</small>
                </div>
            </div>
        </div>`;
        html += `<div class="col">
            <div class="card h-100 ${stats.sourceRepo > 0 ? 'bg-warning' : 'bg-light'}">
                <div class="card-body text-center py-2">
                    <h3 class="mb-0"><i class="fas fa-unlink me-1"></i>${stats.sourceRepo}</h3>
                    <small class="${stats.sourceRepo > 0 ? '' : 'text-muted'}">Dead Source Repos</small>
                </div>
            </div>
        </div>`;
        html += '</div>';
        
        html += '</div></div>';
        
        // Findings grouped by type
        sortedTypes.forEach(([key, typeData], index) => {
            const collapseId = `finding-type-${index}`;
            let categoryIcon, categoryLabel;
            if (typeData.category === 'malware') {
                categoryIcon = 'fas fa-biohazard';
                categoryLabel = 'Malware';
            } else if (typeData.category === 'github-actions') {
                categoryIcon = 'fab fa-github';
                categoryLabel = 'GitHub Actions';
            } else if (typeData.category === 'eox') {
                categoryIcon = 'fas fa-hourglass-end';
                categoryLabel = 'EOX (End-of-Life/Support)';
            } else if (typeData.category === 'source-repo') {
                categoryIcon = 'fas fa-unlink';
                categoryLabel = 'Dead Source Repo';
            } else {
                categoryIcon = 'fas fa-box';
                categoryLabel = 'Dependency Confusion';
            }
            
            html += `<div class="card mb-3">
                <div class="card-header cursor-pointer" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge ${getSeverityBadgeClass(typeData.severity)}">${typeData.severity.toUpperCase()}</span>
                            <span class="badge bg-secondary"><i class="${categoryIcon} me-1"></i>${categoryLabel}</span>
                            <strong>${escapeHtml(typeData.typeName)}</strong>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-primary">${typeData.instances.length} finding${typeData.instances.length !== 1 ? 's' : ''}</span>
                            <i class="fas fa-chevron-down"></i>
                        </div>
                    </div>
                </div>
                <div class="collapse" id="${collapseId}">
                    <div class="card-body">
                        <p class="text-muted mb-3">${escapeHtml(typeData.description)}</p>
                        <div class="table-responsive">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        ${typeData.category === 'malware' ?
                                            '<th>Package</th><th>Ecosystem</th><th>Advisor(ies)</th><th>Used In</th>' :
                                            typeData.category === 'github-actions' ?
                                            '<th>Action</th><th>Location</th><th>Message</th>' :
                                            typeData.category === 'eox' ?
                                            '<th>Package</th><th>Ecosystem</th><th>Repositories</th><th>Details</th>' :
                                            typeData.category === 'source-repo' ?
                                            '<th>Package</th><th>Source Repo</th><th>Used In</th><th>Message</th>' :
                                            '<th>Package</th><th>Ecosystem</th><th>Repositories</th><th>Message</th>'
                                        }
                                    </tr>
                                </thead>
                                <tbody>
                                    ${typeData.instances.map(instance => {
                                        if (typeData.category === 'malware') {
                                            const packageDisplay = escapeHtml(instance.package || '-');
                                            const repos = Array.isArray(instance.repositories) ? instance.repositories : [];
                                            const packageLink = instance.packageName ? `
                                                <a href="#" class="package-details-link text-decoration-none"
                                                   data-package-name="${escapeHtml(instance.packageName)}"
                                                   data-package-version="${escapeHtml(instance.packageVersion || 'unknown')}"
                                                   data-package-ecosystem="${escapeHtml(instance.ecosystem || '')}"
                                                   data-package-repos='${escapeJsString(JSON.stringify(repos))}'
                                                   data-dep-info='${escapeJsString(JSON.stringify(instance.depInfo || {}))}'>
                                                    <code class="small">${packageDisplay}</code>
                                                    <i class="fas fa-info-circle ms-1 text-primary small"></i>
                                                </a>
                                            ` : `<code class="small">${packageDisplay}</code>`;

                                            const advisoryIds = Array.isArray(instance.advisoryIds) ? instance.advisoryIds : [];
                                            const advisoryLinks = advisoryIds.length > 0
                                                ? advisoryIds.slice(0, 6).map(id => `<a href="https://osv.dev/vulnerability/${encodeURIComponent(id)}" target="_blank" rel="noreferrer noopener"><code class="small">${escapeHtml(id)}</code></a>`).join('<br>')
                                                : '<span class="text-muted">—</span>';
                                            const overflow = advisoryIds.length > 6
                                                ? `<br><small class="text-muted">+${advisoryIds.length - 6} more</small>`
                                                : '';
                                            const malwarePageLink = '<br><a href="malware.html" class="small">View on Malware page</a>';

                                            return `<tr class="table-danger">
                                                <td>${packageLink}<br><small class="text-muted">${escapeHtml(instance.message || '')}</small></td>
                                                <td><span class="badge bg-secondary">${escapeHtml(instance.ecosystem || '-')}</span></td>
                                                <td>${advisoryLinks}${overflow}${malwarePageLink}</td>
                                                <td>${repos.length > 0 ? generateRepoListHTML(repos) : '<span class="text-muted">-</span>'}</td>
                                            </tr>`;
                                        } else if (typeData.category === 'github-actions') {
                                            // Docker-related rules (DOCKER_* / DOCKERFILE_FLOATING_BASE_IMAGE)
                                            // are emitted *against the third-party Action's Dockerfile* (or its
                                            // `runs.image:`), not the user's workflow file. They must be rendered
                                            // with a chain that ends in the Action's Dockerfile so the row's link
                                            // actually points at the offending FROM line.
                                            const isDockerFinding = instance.type && (
                                                instance.type.startsWith('DOCKER_') ||
                                                instance.type === 'DOCKERFILE_FLOATING_BASE_IMAGE'
                                            );
                                            
                                            // Pin file links to the analysed commit so the line anchor matches
                                            // the file content the analyzer actually read. The analyzer stores
                                            // the resolved SHA in `instance.action` as the part after the last
                                            // '@'. Anything that isn't a 40-char hex falls back to HEAD.
                                            let actionSha = null;
                                            if (instance.action && typeof instance.action === 'string' && instance.action.includes('@')) {
                                                const refPart = instance.action.split('@').pop();
                                                if (refPart && /^[a-f0-9]{40}$/i.test(refPart)) {
                                                    actionSha = refPart;
                                                }
                                            }
                                            const fileRef = actionSha || 'HEAD';
                                            
                                            // Pull the affected docker image out of the finding so the row tells
                                            // the reader *what* the FROM is pinned to (e.g. `ubuntu:22.04`),
                                            // independent of the action's name.
                                            let affectedImage = null;
                                            if (isDockerFinding) {
                                                if ((instance.type === 'DOCKER_FLOATING_TAG' || instance.type === 'DOCKER_IMPLICIT_LATEST') &&
                                                    instance.action && !instance.action.includes('@')) {
                                                    affectedImage = instance.action;
                                                }
                                                if (!affectedImage && instance.message) {
                                                    const m = instance.message.match(/:\s+(\S[^\s]*)\s*$/);
                                                    if (m) affectedImage = m[1];
                                                }
                                            }
                                            
                                            let actionCell = '-';
                                            if (isDockerFinding) {
                                                const imageDisplay = affectedImage
                                                    ? `<div><i class="fab fa-docker me-1 text-info"></i><code class="small">${escapeHtml(affectedImage)}</code></div>`
                                                    : '';
                                                const actionLabel = instance.action && instance.action.includes('@')
                                                    ? instance.action
                                                    : (instance.actionRepository || '');
                                                let actionSubLine = '';
                                                if (actionLabel) {
                                                    const actionParts = actionLabel.split('@')[0].split('/');
                                                    if (actionParts.length >= 2) {
                                                        const actionOwner = actionParts[0];
                                                        const actionRepo = actionParts[1];
                                                        const actionUrl = `https://github.com/${actionOwner}/${actionRepo}`;
                                                        actionSubLine = `<small class="text-muted">in <a href="${actionUrl}" target="_blank" rel="noreferrer noopener" class="text-muted text-decoration-none"><i class="fab fa-github me-1"></i><code>${escapeHtml(actionLabel)}</code></a></small>`;
                                                    } else {
                                                        actionSubLine = `<small class="text-muted">in <code>${escapeHtml(actionLabel)}</code></small>`;
                                                    }
                                                }
                                                actionCell = (imageDisplay + actionSubLine) || '-';
                                            } else if (instance.action) {
                                                const actionParts = instance.action.split('@')[0].split('/');
                                                if (actionParts.length >= 2) {
                                                    const actionOwner = actionParts[0];
                                                    const actionRepo = actionParts[1];
                                                    const actionUrl = `https://github.com/${actionOwner}/${actionRepo}`;
                                                    actionCell = `<a href="${actionUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">
                                                        <i class="fab fa-github me-1"></i><code class="small">${escapeHtml(instance.action)}</code>
                                                    </a>`;
                                                } else {
                                                    actionCell = `<code class="small">${escapeHtml(instance.action)}</code>`;
                                                }
                                            } else if (instance.file) {
                                                actionCell = `<code class="small">${escapeHtml(instance.file)}</code>`;
                                            }
                                            
                                            let locationCell = '<small class="text-muted">—</small>';
                                            const workflowLocations = instance.workflowLocations || [];
                                            
                                            if (isDockerFinding) {
                                                // Build the chain  User repo → workflow file:line → Action repo → Dockerfile:line
                                                // The Dockerfile lives inside the third-party Action's repo, not
                                                // the user's repo, so we link to it at the resolved SHA the
                                                // analyzer used (or HEAD as a fallback).
                                                const actionRepository = instance.actionRepository ||
                                                    (instance.action && instance.action.includes('@')
                                                        ? instance.action.split('@')[0].split('/').slice(0, 2).join('/')
                                                        : null);
                                                const actionDockerfile = instance.actionDockerfile ||
                                                    (instance.file && /Dockerfile$/i.test(instance.file) ? instance.file : null) ||
                                                    'Dockerfile';
                                                const dockerfileLine = instance.line;
                                                const actionRepoParts = actionRepository ? actionRepository.split('/') : null;
                                                const hasActionRepoLink = actionRepoParts && actionRepoParts.length === 2;
                                                
                                                const buildChain = (loc) => {
                                                    const parts = [];
                                                    const workflowRepo = loc?.repository || instance.repository;
                                                    const workflowFile = loc?.workflow;
                                                    const workflowLine = loc?.line;
                                                    const workflowRepoParts = workflowRepo ? workflowRepo.split('/') : null;
                                                    
                                                    if (workflowRepoParts && workflowRepoParts.length === 2) {
                                                        const [wOwner, wRepo] = workflowRepoParts;
                                                        parts.push(`<a href="https://github.com/${wOwner}/${wRepo}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(workflowRepo)}</code></a>`);
                                                        if (workflowFile) {
                                                            const fileUrl = `https://github.com/${wOwner}/${wRepo}/blob/HEAD/${workflowFile}${workflowLine ? '#L' + workflowLine : ''}`;
                                                            const fileDisplay = workflowFile.split('/').pop();
                                                            const lineDisplay = workflowLine ? ':' + workflowLine : '';
                                                            parts.push(`<a href="${fileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code class="small">${escapeHtml(fileDisplay)}${lineDisplay}</code></a>`);
                                                        }
                                                    }
                                                    
                                                    if (hasActionRepoLink) {
                                                        const [actionOwner, actionRepoName] = actionRepoParts;
                                                        parts.push(`<a href="https://github.com/${actionOwner}/${actionRepoName}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(actionRepository)}</code></a>`);
                                                        const dockerfileUrl = `https://github.com/${actionOwner}/${actionRepoName}/blob/${fileRef}/${actionDockerfile}${dockerfileLine ? '#L' + dockerfileLine : ''}`;
                                                        const dockerfileName = actionDockerfile.split('/').pop();
                                                        const dfLineDisplay = dockerfileLine ? ':' + dockerfileLine : '';
                                                        parts.push(`<a href="${dockerfileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><i class="fab fa-docker me-1 text-info"></i><code class="small">${escapeHtml(dockerfileName)}${dfLineDisplay}</code></a>`);
                                                    }
                                                    return parts;
                                                };
                                                
                                                if (workflowLocations.length > 0 && hasActionRepoLink) {
                                                    const primary = workflowLocations[0];
                                                    const chainParts = buildChain(primary);
                                                    if (chainParts.length > 0) {
                                                        let chainLine = `<div class="d-flex flex-wrap align-items-center gap-1" style="font-size: 0.85em;">
                                                            ${chainParts.join(' <i class="fas fa-arrow-right text-muted" style="font-size: 0.7em;"></i> ')}
                                                        </div>`;
                                                        if (workflowLocations.length > 1) {
                                                            chainLine += `<small class="text-muted"><i class="fas fa-list me-1"></i>+ ${workflowLocations.length - 1} more workflow location${workflowLocations.length - 1 > 1 ? 's' : ''}</small>`;
                                                        }
                                                        locationCell = `<div class="d-flex flex-column gap-1">${chainLine}</div>`;
                                                    }
                                                } else if (hasActionRepoLink) {
                                                    const [actionOwner, actionRepoName] = actionRepoParts;
                                                    const dockerfileUrl = `https://github.com/${actionOwner}/${actionRepoName}/blob/${fileRef}/${actionDockerfile}${dockerfileLine ? '#L' + dockerfileLine : ''}`;
                                                    const dockerfileName = actionDockerfile.split('/').pop();
                                                    const dfLineDisplay = dockerfileLine ? ':' + dockerfileLine : '';
                                                    locationCell = `<a href="${dockerfileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none">
                                                        <i class="fab fa-docker me-1 text-info"></i><code class="small">${escapeHtml(actionRepository)}/${escapeHtml(dockerfileName)}${dfLineDisplay}</code>
                                                    </a>`;
                                                } else if (instance.repository) {
                                                    locationCell = formatRepoHTML(instance.repository);
                                                }
                                            } else if (workflowLocations.length > 0) {
                                                const locationParts = [];
                                                
                                                workflowLocations.forEach((loc) => {
                                                    const workflowRepo = loc.repository || instance.repository;
                                                    const workflowFile = loc.workflow;
                                                    const workflowLine = loc.line;
                                                    
                                                    if (workflowRepo && workflowFile) {
                                                        const repoParts = workflowRepo.split('/');
                                                        if (repoParts.length === 2) {
                                                            const [owner, repo] = repoParts;
                                                            
                                                            const fileUrl = `https://github.com/${owner}/${repo}/blob/HEAD/${workflowFile}${workflowLine ? '#L' + workflowLine : ''}`;
                                                            const fileDisplay = workflowFile.split('/').pop();
                                                            const lineDisplay = workflowLine ? ':' + workflowLine : '';
                                                            
                                                            locationParts.push(`<div class="d-flex flex-wrap align-items-center gap-1" style="font-size: 0.85em;">
                                                                <a href="https://github.com/${owner}/${repo}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(workflowRepo)}</code></a>
                                                                <i class="fas fa-arrow-right text-muted" style="font-size: 0.7em;"></i>
                                                                <a href="${fileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code class="small">${escapeHtml(fileDisplay)}${lineDisplay}</code></a>
                                                            </div>`);
                                                        }
                                                    }
                                                });
                                                
                                                if (locationParts.length === 1) {
                                                    locationCell = locationParts[0];
                                                } else if (locationParts.length > 1 && locationParts.length <= 3) {
                                                    locationCell = `<div class="d-flex flex-column gap-1">${locationParts.join('')}</div>`;
                                                } else if (locationParts.length > 3) {
                                                    locationCell = `<div class="d-flex flex-column gap-1">
                                                        ${locationParts[0]}
                                                        <small class="text-muted"><i class="fas fa-list me-1"></i>+ ${locationParts.length - 1} more location${locationParts.length - 1 > 1 ? 's' : ''}</small>
                                                    </div>`;
                                                }
                                            } else if (instance.repository && instance.file) {
                                                const repoParts = instance.repository.split('/');
                                                if (repoParts.length === 2) {
                                                    const [owner, repo] = repoParts;
                                                    const fileUrl = `https://github.com/${owner}/${repo}/blob/HEAD/${instance.file}${instance.line ? '#L' + instance.line : ''}`;
                                                    const fileDisplay = instance.file.split('/').pop();
                                                    const lineDisplay = instance.line ? ':' + instance.line : '';
                                                    
                                                    locationCell = `<div class="d-flex flex-wrap align-items-center gap-1" style="font-size: 0.85em;">
                                                        <a href="https://github.com/${owner}/${repo}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code>${escapeHtml(instance.repository)}</code></a>
                                                        <i class="fas fa-arrow-right text-muted" style="font-size: 0.7em;"></i>
                                                        <a href="${fileUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-none"><code class="small">${escapeHtml(fileDisplay)}${lineDisplay}</code></a>
                                                    </div>`;
                                                }
                                            } else if (instance.repository) {
                                                locationCell = formatRepoHTML(instance.repository);
                                            }
                                            
                                            return `<tr>
                                                <td>${actionCell}</td>
                                                <td>${locationCell}</td>
                                                <td class="small">${escapeHtml(instance.message || instance.details || '-')}</td>
                                            </tr>`;
                                        } else if (typeData.category === 'eox') {
                                            // EOX (End-of-Life/Support) findings
                                            const packageDisplay = escapeHtml(instance.package || '-');
                                            let detailsHtml = escapeHtml(instance.message || '-');
                                            
                                            // Add date info if available
                                            if (instance.eolDate) {
                                                detailsHtml += `<br><small class="text-muted">EOL Date: ${escapeHtml(instance.eolDate)}</small>`;
                                            }
                                            if (instance.eosDate) {
                                                detailsHtml += `<br><small class="text-muted">EOS Date: ${escapeHtml(instance.eosDate)}</small>`;
                                            }
                                            if (instance.lastReleaseDate) {
                                                const lastRelease = new Date(instance.lastReleaseDate).toLocaleDateString();
                                                detailsHtml += `<br><small class="text-muted">Last Release: ${escapeHtml(lastRelease)}</small>`;
                                            }
                                            if (instance.monthsSinceRelease) {
                                                const years = Math.floor(instance.monthsSinceRelease / 12);
                                                const months = instance.monthsSinceRelease % 12;
                                                const ageStr = years > 0 ? `${years}y ${months}m` : `${months}m`;
                                                detailsHtml += `<br><small class="text-muted">Age: ${ageStr} since last release</small>`;
                                            }
                                            // Cite the endoflife.date page that confirmed this EOL/EOS
                                            // (only set on confirmed EOL/EOS rows, not staleness-based ones).
                                            if (instance.sourceUrl) {
                                                const sourceLabel = escapeHtml(instance.sourceName || 'endoflife.date');
                                                const productSuffix = instance.productMatched
                                                    ? ` (${escapeHtml(instance.productMatched)})`
                                                    : '';
                                                detailsHtml += `<br><small><i class="fas fa-external-link-alt me-1"></i>Source: <a href="${escapeHtml(instance.sourceUrl)}" target="_blank" rel="noreferrer noopener">${sourceLabel}${productSuffix}</a></small>`;
                                            }
                                            
                                            // Create clickable package link that opens the package details modal
                                            const packageLink = instance.packageName ? `
                                                <a href="#" class="package-details-link text-decoration-none" 
                                                   data-package-name="${escapeHtml(instance.packageName)}"
                                                   data-package-version="${escapeHtml(instance.packageVersion || 'unknown')}"
                                                   data-package-ecosystem="${escapeHtml(instance.ecosystem || '')}"
                                                   data-package-repos='${escapeJsString(JSON.stringify(instance.repositories || []))}'
                                                   data-dep-info='${escapeJsString(JSON.stringify(instance.depInfo || {}))}'>
                                                    <code class="small">${packageDisplay}</code>
                                                    <i class="fas fa-info-circle ms-1 text-primary small"></i>
                                                </a>
                                            ` : `<code class="small">${packageDisplay}</code>`;
                                            
                                            return `<tr>
                                                <td>${packageLink}</td>
                                                <td><span class="badge bg-secondary">${escapeHtml(instance.ecosystem || '-')}</span></td>
                                                <td>${instance.repositories && instance.repositories.length > 0 ? generateRepoListHTML(instance.repositories) : '-'}</td>
                                                <td class="small">${detailsHtml}</td>
                                            </tr>`;
                                        } else if (typeData.category === 'source-repo') {
                                            // Dead source repository findings
                                            const packageDisplay = escapeHtml(instance.package || '-');
                                            const repoOwner = instance.sourceRepoOwner || '';
                                            const repoName = instance.sourceRepoName || '';
                                            const repoUrl = repoOwner && repoName ? 
                                                `https://github.com/${repoOwner}/${repoName}` : 
                                                instance.sourceRepoUrl || '';
                                            
                                            // Create a link to the (missing) repo with strikethrough to indicate it's dead
                                            let repoLink = '-';
                                            if (repoOwner && repoName) {
                                                repoLink = `<a href="${repoUrl}" target="_blank" rel="noreferrer noopener" class="text-decoration-line-through text-danger">
                                                    <i class="fab fa-github me-1"></i>${escapeHtml(repoOwner)}/${escapeHtml(repoName)}
                                                </a>
                                                <br><small class="text-muted"><i class="fas fa-exclamation-triangle me-1"></i>404 Not Found</small>`;
                                            }
                                            
                                            return `<tr>
                                                <td><code class="small">${packageDisplay}</code><br><small class="text-muted">${escapeHtml(instance.ecosystem || '-')}</small></td>
                                                <td>${repoLink}</td>
                                                <td>${instance.repositories && instance.repositories.length > 0 ? generateRepoListHTML(instance.repositories) : '-'}</td>
                                                <td class="small">${escapeHtml(instance.message || '-')}</td>
                                            </tr>`;
                                        } else {
                                            // Dependency confusion
                                            // Show PURL if available, and note if SBOM name differs
                                            const packageDisplay = escapeHtml(instance.package || '-');
                                            const purlDisplay = instance.purl ? `<br><small class="text-muted">PURL: ${escapeHtml(instance.purl)}</small>` : '';
                                            const sbomNote = (instance.sbomName && instance.sbomName !== instance.package?.split('@')[0]) 
                                                ? `<br><small class="text-muted">SBOM name: ${escapeHtml(instance.sbomName)}</small>` 
                                                : '';
                                            
                                            return `<tr>
                                                <td><code class="small">${packageDisplay}</code>${purlDisplay}${sbomNote}</td>
                                                <td><span class="badge bg-secondary">${escapeHtml(instance.ecosystem || '-')}</span></td>
                                                <td>${instance.repositories && instance.repositories.length > 0 ? generateRepoListHTML(instance.repositories) : '-'}</td>
                                                <td class="small">${escapeHtml(instance.message || '-')}</td>
                                            </tr>`;
                                        }
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        });
        
        return html;
    }
});
