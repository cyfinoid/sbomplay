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
        copyAllUrlsBtn: document.getElementById('copyAllUrlsBtn')
    };

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

        const resolved = feedUrlBuilder.resolveAll(allDeps);
        allEntries = resolved.entries;
        allStats = resolved.stats;

        populateEcosystemFilter(allEntries);
        applyFilters();

        dom.loadingOverlay.classList.add('d-none');
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
    }

    function renderStats() {
        if (!allStats) return;
        dom.statTotal.textContent = String(allStats.total);
        dom.statCovered.textContent = String(allStats.covered);
        dom.statUncovered.textContent = String(allStats.uncovered);
        dom.statShowing.textContent = String(filteredEntries.length);
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
            renderTable();
        });
        dom.exportOpmlBtn.addEventListener('click', exportOpml);
        dom.copyAllUrlsBtn.addEventListener('click', copyAllUrls);
    }
})();
