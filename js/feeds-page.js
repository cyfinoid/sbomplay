/**
 * Feeds Page - Resolves an RSS/Atom feed for every dependency in the
 * selected analysis and lets the user download an OPML bundle for their
 * feed reader.
 *
 * Reuses:
 *  - StorageManager (org/repo data)
 *  - FeedUrlBuilder (per-package feed URL resolution)
 *  - OPMLBuilder    (OPML 2.0 serialization)
 */
console.log('📡 feeds-page.js loaded');

(async function initFeedsPage() {
    const storageManager = new StorageManager();
    await storageManager.init();

    const feedUrlBuilder = window.feedUrlBuilder || new FeedUrlBuilder();
    const opmlBuilder = window.opmlBuilder || new OPMLBuilder();

    const dom = {
        analysisSelector: document.getElementById('analysisSelector'),
        searchInput: document.getElementById('searchInput'),
        typeFilter: document.getElementById('typeFilter'),
        ecosystemFilter: document.getElementById('ecosystemFilter'),
        coverageFilter: document.getElementById('coverageFilter'),
        statsRow: document.getElementById('statsRow'),
        statTotal: document.getElementById('statTotal'),
        statCovered: document.getElementById('statCovered'),
        statUncovered: document.getElementById('statUncovered'),
        statShowing: document.getElementById('statShowing'),
        tableCard: document.getElementById('tableCard'),
        tableBody: document.getElementById('tableBody'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        noDataMessage: document.getElementById('noDataMessage'),
        displayInfo: document.getElementById('displayInfo'),
        displayLimitSelect: document.getElementById('displayLimitSelect'),
        exportOpmlBtn: document.getElementById('exportOpmlBtn'),
        copyAllUrlsBtn: document.getElementById('copyAllUrlsBtn'),
        resolveSourceReposBtn: document.getElementById('resolveSourceReposBtn')
    };

    // Ecosystems where deps.dev exposes a SOURCE_REPO link AND we can sensibly
    // build a GitHub-Releases fallback feed once the URL is known. Maven/Pypi
    // omitted because they have native feeds; GitHub Actions / Go already
    // resolve their owner/repo from the package name.
    const SOURCE_REPO_ECOSYSTEMS = new Set([
        'npm', 'cargo', 'nuget', 'hex', 'pub', 'cocoapods', 'composer', 'rubygems'
    ]);
    const RESOLVE_BACKFILL_CAP = 200;

    // Page state
    let allEntries = [];        // Array<{ dep, feed }>
    let allStats = null;        // FeedUrlBuilder.resolveAll(...).stats
    let filteredEntries = [];
    let displayLimit = 50;
    let currentAnalysisName = '';

    // ------------------------------------------------------------------
    // Boot
    // ------------------------------------------------------------------
    await loadAnalysesList();
    wireEvents();

    // ------------------------------------------------------------------
    // Loading and rendering
    // ------------------------------------------------------------------

    async function loadAnalysesList() {
        try {
            const storageInfo = await storageManager.getStorageInfo();
            const allEntriesRaw = [...storageInfo.organizations, ...storageInfo.repositories];
            const filtered = allEntriesRaw.filter(e => e.name !== '__ALL__' && (e.dependencies || 0) > 0);

            dom.analysisSelector.innerHTML = '';

            if (filtered.length === 0) {
                showNoData();
                dom.analysisSelector.disabled = true;
                return;
            }

            const allOption = document.createElement('option');
            allOption.value = '';
            const totalDeps = filtered.reduce((sum, e) => sum + (e.dependencies || 0), 0);
            allOption.textContent = `All Analyses (${totalDeps} deps)`;
            dom.analysisSelector.appendChild(allOption);

            for (const entry of filtered) {
                const option = document.createElement('option');
                option.value = entry.name;
                option.textContent = `${entry.name} (${entry.dependencies || 0} deps)`;
                dom.analysisSelector.appendChild(option);
            }

            dom.analysisSelector.value = '';
            dom.analysisSelector.disabled = false;

            await loadAnalysis();
        } catch (error) {
            console.error('❌ Error loading analyses list:', error);
            showNoData();
        }
    }

    function showNoData() {
        dom.tableCard.classList.add('d-none');
        dom.statsRow.classList.add('d-none');
        dom.noDataMessage.classList.remove('d-none');
    }

    function hideNoData() {
        dom.noDataMessage.classList.add('d-none');
    }

    async function loadAnalysis() {
        currentAnalysisName = dom.analysisSelector.value || '';

        dom.tableCard.classList.remove('d-none');
        dom.statsRow.classList.remove('d-none');
        dom.loadingOverlay.classList.remove('d-none');
        hideNoData();

        let data;
        if (!currentAnalysisName) {
            data = await storageManager.getCombinedData();
        } else {
            data = await storageManager.loadAnalysisDataForOrganization(currentAnalysisName);
        }

        if (!data || !data.data) {
            dom.loadingOverlay.classList.add('d-none');
            showNoData();
            return;
        }

        const allDeps = (data.data.allDependencies || []).map(toCanonicalDep);

        // Pull every persisted package row into memory so FeedUrlBuilder's sync
        // lookup of `cacheManager.getPackageSync(...)` can see registry-derived
        // repository URLs (the discovery added in Phase 1.6). Without this the
        // sync getter returns null and minimal SBOMs (no externalRefs) stay
        // "Uncovered" even when the package's GitHub URL is already cached.
        if (window.cacheManager && typeof window.cacheManager.primePackagesCache === 'function') {
            try {
                const primed = await window.cacheManager.primePackagesCache();
                if (primed > 0) console.log(`📡 Feeds: primed ${primed} packages from cache`);
            } catch (e) {
                console.warn('📡 Feeds: failed to prime packages cache:', e.message);
            }
        }

        const resolved = feedUrlBuilder.resolveAll(allDeps);
        allEntries = resolved.entries;
        allStats = resolved.stats;

        // Prepend a global Malware advisories feed when the analysis has
        // at least one malicious-package match. Subscribing to that feed
        // gives the user ongoing notifications for new advisories beyond
        // a single SBOM scan.
        if ((await hasMalwareHits(data)) && typeof feedUrlBuilder.buildMalwareAdvisoryEntry === 'function') {
            const malwareEntry = feedUrlBuilder.buildMalwareAdvisoryEntry();
            allEntries = [malwareEntry, ...allEntries];
            allStats.total++;
            allStats.native++;
            allStats.covered++;
            allStats.direct++;
            allStats.directCovered++;
        }

        populateEcosystemFilter(allEntries);
        applyFilters();
        updateResolveButtonVisibility();

        dom.loadingOverlay.classList.add('d-none');
    }

    /**
     * Show the "Resolve missing source repos" button when there's at least
     * one uncovered dep in an ecosystem the deps.dev backfill can help with.
     * Hidden otherwise so it doesn't add noise on covered/empty analyses.
     */
    function updateResolveButtonVisibility() {
        if (!dom.resolveSourceReposBtn) return;
        const candidates = collectBackfillCandidates();
        if (candidates.length === 0) {
            dom.resolveSourceReposBtn.classList.add('d-none');
            return;
        }
        dom.resolveSourceReposBtn.classList.remove('d-none');
        const shown = Math.min(candidates.length, RESOLVE_BACKFILL_CAP);
        dom.resolveSourceReposBtn.title = `Look up GitHub source repository URLs from deps.dev for ${shown}${candidates.length > shown ? ' of ' + candidates.length : ''} uncovered package${candidates.length === 1 ? '' : 's'}`;
    }

    function collectBackfillCandidates() {
        if (!Array.isArray(allEntries)) return [];
        const seen = new Set();
        const out = [];
        for (const entry of allEntries) {
            const dep = entry && entry.dep;
            const feed = entry && entry.feed;
            if (!dep || !feed) continue;
            if (feed.status !== 'uncovered') continue;
            const eco = (dep.ecosystem || '').toLowerCase();
            if (!SOURCE_REPO_ECOSYSTEMS.has(eco)) continue;
            if (!dep.name || !dep.version || dep.version === 'unknown') continue;
            const key = `${eco}:${dep.name}@${dep.version}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ key, dep });
        }
        return out;
    }

    /**
     * Opt-in backfill: ask deps.dev for `links[]` on each uncovered package and
     * persist any SOURCE_REPO URL via LicenseFetcher (which already mutates the
     * dep AND writes through to the packages cache via savePackage). Once done
     * we re-run resolveAll so previously-uncovered rows pick up the new URL.
     */
    async function resolveMissingSourceRepos() {
        if (!window.LicenseFetcher && !window.licenseFetcher) {
            alert('License fetcher not loaded; cannot backfill source repos.');
            return;
        }
        const fetcher = window.licenseFetcher || new window.LicenseFetcher();

        const candidates = collectBackfillCandidates().slice(0, RESOLVE_BACKFILL_CAP);
        if (candidates.length === 0) {
            updateResolveButtonVisibility();
            return;
        }

        const btn = dom.resolveSourceReposBtn;
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        let resolved = 0;

        // Small parallelism cap — deps.dev tolerates concurrency but we don't want
        // to hammer it from a single browser tab. 5-wide is in line with the rest
        // of the enrichment pipeline's batch sizes.
        const concurrency = 5;
        let cursor = 0;
        async function worker() {
            while (cursor < candidates.length) {
                const idx = cursor++;
                const { dep } = candidates[idx];
                try {
                    // Pass the canonical dep object directly so fetchLicenseForPackage
                    // (which mutates its argument) writes `sourceRepoUrl` onto the
                    // same record FeedUrlBuilder will re-inspect below. Mirror
                    // onto dep.raw and persist into cacheManager so the URL
                    // survives a page reload.
                    await fetcher.fetchLicenseForPackage(dep);
                    if (dep.sourceRepoUrl) {
                        if (dep.raw && !dep.raw.sourceRepoUrl) {
                            dep.raw.sourceRepoUrl = dep.sourceRepoUrl;
                        }
                        if (window.cacheManager && typeof window.cacheManager.savePackage === 'function') {
                            const eco = (dep.ecosystem || '').toLowerCase();
                            if (eco) {
                                const packageKey = `${eco}:${dep.name}`;
                                const existing = (typeof window.cacheManager.getPackageSync === 'function')
                                    ? window.cacheManager.getPackageSync(packageKey)
                                    : null;
                                const merged = Object.assign({
                                    packageKey,
                                    ecosystem: eco,
                                    name: dep.name
                                }, existing || {}, { repositoryUrl: dep.sourceRepoUrl });
                                // Fire-and-forget — UI already advances on the
                                // next loop iteration; persistence error doesn't
                                // block the in-memory update.
                                window.cacheManager.savePackage(packageKey, merged).catch(() => {});
                            }
                        }
                        resolved++;
                    }
                } catch (e) {
                    console.debug('Source-repo backfill failed for', dep.name, e.message);
                }
                btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Resolving... (${idx + 1}/${candidates.length})`;
            }
        }
        await Promise.all(Array.from({ length: concurrency }, worker));

        // Re-resolve in place — pick up newly-populated dep.sourceRepoUrl.
        const allDeps = allEntries.map(e => e.dep);
        const re = feedUrlBuilder.resolveAll(allDeps);
        allEntries = re.entries;
        allStats = re.stats;
        applyFilters();
        updateResolveButtonVisibility();

        btn.disabled = false;
        btn.innerHTML = originalHtml;
        console.log(`📡 Source-repo backfill: resolved ${resolved}/${candidates.length} packages`);
    }

    /**
     * Returns true when the loaded analysis has at least one detected
     * malicious-package match (either persisted on `malwareAnalysis` or
     * reachable by filtering `vulnerabilityAnalysis` for `MAL-` IDs).
     */
    async function hasMalwareHits(data) {
        // Always re-derive when possible so the OSV-spec strict version
        // filter applies. This keeps the global malware feed entry from
        // being injected for legacy analyses whose only "malware" hit is
        // a stale false positive (e.g. an advisory that targets a
        // different version than the one installed). We hydrate
        // `affected[]` from the per-package OSV cache first so legacy
        // stored records (which don't carry `affected[]` on each vuln)
        // also benefit from strict matching.
        if (window.malwareService && data?.data?.vulnerabilityAnalysis) {
            await window.malwareService.hydrateAffectedFromCache(data.data.vulnerabilityAnalysis);
            const derived = window.malwareService.classifyFromVulnerabilityAnalysis(
                data.data.vulnerabilityAnalysis,
                data.data.allDependencies || []
            );
            if (derived && Array.isArray(derived.maliciousDependencies) && derived.maliciousDependencies.length > 0) {
                return true;
            }
            return false;
        }
        const malware = data?.data?.malwareAnalysis;
        if (malware && Array.isArray(malware.maliciousDependencies) && malware.maliciousDependencies.length > 0) {
            return true;
        }
        return false;
    }

    /**
     * Map a stored SBOM-processor dependency object onto the shape that
     * FeedUrlBuilder expects (mirrors processData() in deps-page.js but
     * keeps only the fields we need for feed resolution).
     */
    function toCanonicalDep(rawDep) {
        const ecosystem = rawDep.category?.ecosystem || rawDep.ecosystem || 'unknown';
        const isDirect = Array.isArray(rawDep.directIn) && rawDep.directIn.length > 0;
        const isTransitive = Array.isArray(rawDep.transitiveIn) && rawDep.transitiveIn.length > 0;
        let type = 'transitive';
        if (isDirect) type = 'direct';
        else if (!isTransitive) type = rawDep.type || 'transitive';

        return {
            name: rawDep.name,
            version: rawDep.version,
            ecosystem,
            type,
            directIn: rawDep.directIn || [],
            transitiveIn: rawDep.transitiveIn || [],
            repositories: rawDep.repositories || [],
            // Forward enrichment-derived source repo URL (Phase 1.6) so
            // FeedUrlBuilder can resolve "minimal" SBOM dependencies whose
            // SBOM entry lacks externalRefs but whose registry/deps.dev
            // record exposes a GitHub URL.
            sourceRepoUrl: rawDep.sourceRepoUrl || rawDep.raw?.sourceRepoUrl || null,
            raw: rawDep
        };
    }

    function populateEcosystemFilter(entries) {
        const ecosystems = new Set();
        for (const e of entries) {
            if (e.dep && e.dep.ecosystem) ecosystems.add(e.dep.ecosystem);
        }
        const sorted = Array.from(ecosystems).sort((a, b) => a.localeCompare(b));
        dom.ecosystemFilter.innerHTML = '<option value="all">All</option>';
        for (const eco of sorted) {
            const opt = document.createElement('option');
            opt.value = eco;
            opt.textContent = eco;
            dom.ecosystemFilter.appendChild(opt);
        }
    }

    function applyFilters() {
        showFilterLoading('tableCard');
        try {
            const search = (dom.searchInput.value || '').trim().toLowerCase();
            const typeFilter = dom.typeFilter.value;
            const ecosystemFilter = dom.ecosystemFilter.value;
            const coverageFilter = dom.coverageFilter.value;

            filteredEntries = allEntries.filter(({ dep, feed }) => {
                if (search && !(dep.name || '').toLowerCase().includes(search)) return false;
                if (typeFilter !== 'all' && dep.type !== typeFilter) return false;
                if (ecosystemFilter !== 'all' && dep.ecosystem !== ecosystemFilter) return false;
                if (coverageFilter === 'covered' && feed.status === 'uncovered') return false;
                if (coverageFilter === 'uncovered' && feed.status !== 'uncovered') return false;
                if (coverageFilter === 'native' && feed.status !== 'native') return false;
                if (coverageFilter === 'github' && feed.status !== 'github-releases' && feed.status !== 'github-tags') return false;
                return true;
            });

            renderStats();
            renderTable();
        } finally {
            hideFilterLoading('tableCard');
        }
    }

    function renderStats() {
        if (!allStats) return;
        dom.statTotal.textContent = String(allStats.total);
        dom.statCovered.textContent = String(allStats.covered);
        dom.statUncovered.textContent = String(allStats.uncovered);
        dom.statShowing.textContent = String(filteredEntries.length);

        // Mirror the deps/repos pages: communicate that the table is
        // paginated so users don't read "Matches filter: 1500" as
        // "1500 rows currently rendered below".
        const showingDetail = document.getElementById('statShowingDetail');
        if (showingDetail) {
            const limit = displayLimit === 'all' ? filteredEntries.length : displayLimit;
            const rendered = Math.min(limit, filteredEntries.length);
            if (filteredEntries.length === 0) {
                showingDetail.textContent = '';
            } else if (displayLimit === 'all' || rendered >= filteredEntries.length) {
                showingDetail.textContent = `${rendered} shown in table`;
            } else {
                showingDetail.textContent = `${rendered} shown in table (page size ${displayLimit})`;
            }
        }
    }

    function renderTable() {
        const limit = displayLimit === 'all' ? filteredEntries.length : displayLimit;
        const visible = filteredEntries.slice(0, limit);

        const rows = visible.map(({ dep, feed }) => {
            const typeBadge = dep.type === 'direct'
                ? '<span class="badge bg-primary">Direct</span>'
                : '<span class="badge bg-secondary">Transitive</span>';
            const sourceBadge = feedSourceBadge(feed);
            const versionPart = dep.version && dep.version !== 'unknown'
                ? ` <code class="small">${escapeHtml(dep.version)}</code>`
                : '';
            const urlCell = feed.url
                ? `<a href="${escapeHtml(feed.url)}" target="_blank" rel="noreferrer noopener"><code class="small">${escapeHtml(feed.url)}</code></a>`
                : `<span class="text-muted small">${escapeHtml(feed.reason || 'No feed available')}</span>`;
            const ecoCell = escapeHtml(feed.ecosystem || dep.ecosystem || '');
            const nameCell = `<strong>${escapeHtml(dep.name)}</strong>${versionPart}`;

            return `
                <tr>
                    <td>${nameCell}</td>
                    <td>${ecoCell}</td>
                    <td>${typeBadge}</td>
                    <td>${sourceBadge}</td>
                    <td>${urlCell}</td>
                </tr>
            `;
        }).join('');

        safeSetHTML(dom.tableBody, rows || '<tr><td colspan="5" class="text-center text-muted py-4">No dependencies match the current filters.</td></tr>');
        dom.displayInfo.textContent = `Showing ${visible.length} of ${filteredEntries.length}${filteredEntries.length !== allEntries.length ? ` (filtered from ${allEntries.length})` : ''}`;
    }

    function feedSourceBadge(feed) {
        switch (feed.status) {
            case 'native':
                return '<span class="badge bg-success" title="Feed served by the package registry">Native</span>';
            case 'github-releases':
                return '<span class="badge bg-info text-dark" title="GitHub Releases atom feed for the source repository">GitHub</span>';
            case 'github-tags':
                return '<span class="badge bg-info text-dark" title="GitHub Tags atom feed (repo has no Releases)">GitHub Tags</span>';
            default:
                return `<span class="badge bg-secondary" title="${escapeHtml(feed.reason || 'No feed available')}">Uncovered</span>`;
        }
    }

    function exportOpml() {
        const exportEntries = filteredEntries.length > 0 ? filteredEntries : allEntries;
        const titleParts = ['SBOM Play'];
        if (currentAnalysisName) titleParts.push(currentAnalysisName); else titleParts.push('All analyses');
        titleParts.push('dependency feeds');
        const title = titleParts.join(' – ');
        const filename = currentAnalysisName
            ? `sbomplay-${slugify(currentAnalysisName)}-feeds.opml`
            : 'sbomplay-feeds.opml';

        const result = opmlBuilder.download(exportEntries, { title, filename });

        const message = `OPML downloaded as ${result.filename}\nIncluded: ${result.included} feeds\nSkipped (uncovered): ${result.skipped}`;
        console.log(message);
        if (result.included === 0) {
            alert('No feeds available for the current selection. Try widening filters or selecting a different analysis.');
        }
    }

    async function copyAllUrls() {
        const urls = (filteredEntries.length > 0 ? filteredEntries : allEntries)
            .map(({ feed }) => feed.url)
            .filter(Boolean);
        if (urls.length === 0) {
            alert('No feed URLs to copy in the current selection.');
            return;
        }
        const text = urls.join('\n');
        try {
            await navigator.clipboard.writeText(text);
            const original = dom.copyAllUrlsBtn.innerHTML;
            dom.copyAllUrlsBtn.innerHTML = '<i class="fas fa-check me-1"></i>Copied';
            setTimeout(() => { dom.copyAllUrlsBtn.innerHTML = original; }, 1500);
        } catch (e) {
            console.error('Clipboard write failed', e);
            alert(`Could not copy to clipboard. URLs:\n${text}`);
        }
    }

    function slugify(value) {
        return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'analysis';
    }

    function wireEvents() {
        dom.analysisSelector.addEventListener('change', () => loadAnalysis());
        dom.searchInput.addEventListener('input', () => applyFilters());
        dom.typeFilter.addEventListener('change', () => applyFilters());
        dom.ecosystemFilter.addEventListener('change', () => applyFilters());
        dom.coverageFilter.addEventListener('change', () => applyFilters());
        dom.displayLimitSelect.addEventListener('change', (e) => {
            const value = e.target.value;
            displayLimit = value === 'all' ? 'all' : parseInt(value, 10);
            showFilterLoading('tableCard');
            try {
                renderTable();
            } finally {
                hideFilterLoading('tableCard');
            }
        });
        dom.exportOpmlBtn.addEventListener('click', exportOpml);
        dom.copyAllUrlsBtn.addEventListener('click', copyAllUrls);
        if (dom.resolveSourceReposBtn) {
            dom.resolveSourceReposBtn.addEventListener('click', resolveMissingSourceRepos);
        }
    }
})();
