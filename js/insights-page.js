/**
 * JavaScript for insights.html page
 *
 * Surfaces actionable, exec-friendly stats for engineering managers / CTOs / M&A teams:
 *   - KPI strip (SBOM coverage, Critical+High, median CVE age, tech-debt grade, etc.)
 *   - Language & ecosystem stack
 *   - Package age (oldest per repo, age buckets, probable EOL leaderboard)
 *   - Version drift (per-repo stacked bars + top-N lagging packages)
 *   - Vulnerability age (severity x age stacked bars, time-bomb table, C+H by repo)
 *   - Repository hygiene (SBOM grade donut, archived/no-graph counts, pushedAt activity)
 *   - Supply chain & M&A red flags (license risk, GPL/AGPL on direct, EOL runtimes,
 *     dep-confusion, malware, unpinned actions)
 *   - Tech-debt composite (weighted 0-100 with breakdown + per-repo CSV export)
 *
 * Visualisations are rendered with Chart.js (loaded from cdn.jsdelivr.net, which is
 * already on the airgapped allowlist for Bootstrap / DOMPurify / marked.js / js-yaml).
 * Tables that would otherwise truncate to a top-N slice now ship two `<tbody>` blocks
 * (collapsed top-N and full) and an `Expand to show all (N of M)` toggle button.
 */

// =============================================================================
// CHART LIFECYCLE
// =============================================================================
//
// HTML for Insights is generated as a single string and then injected into the
// container via `safeSetHTML`. Chart.js needs a real DOM canvas to bind to, so
// the renderers emit `<canvas id="...">` placeholders and queue their config
// builders into `pendingCharts`; once the HTML is in the DOM we walk the queue
// and instantiate the Chart instances. Re-renders (e.g. switching the analysis
// selector) destroy all live instances first so we never leak.
const insightsCharts = [];
const pendingCharts = [];
let __insightsCanvasCounter = 0;
let __insightsExpandCounter = 0;
let __insightsThemeObserverAttached = false;
let __insightsExpandHandlerAttached = false;

function nextInsightsCanvasId(prefix = 'ins-chart') {
    __insightsCanvasCounter++;
    return `${prefix}-${__insightsCanvasCounter}`;
}

function nextInsightsExpandId() {
    __insightsExpandCounter++;
    return `ins-expand-${__insightsExpandCounter}`;
}

function destroyAllInsightsCharts() {
    while (insightsCharts.length) {
        const c = insightsCharts.pop();
        try { c.destroy(); } catch (_) { /* already gone */ }
    }
    pendingCharts.length = 0;
}

function queueChart(canvasId, factory) {
    pendingCharts.push({ canvasId, factory });
}

function flushPendingCharts() {
    if (typeof Chart === 'undefined') {
        if (pendingCharts.length) {
            console.warn('Chart.js not loaded; skipping', pendingCharts.length, 'queued chart(s).');
        }
        pendingCharts.length = 0;
        return;
    }
    while (pendingCharts.length) {
        const { canvasId, factory } = pendingCharts.shift();
        const canvas = document.getElementById(canvasId);
        if (!canvas) continue;
        try {
            const config = factory();
            const chart = new Chart(canvas, config);
            insightsCharts.push(chart);
        } catch (err) {
            console.warn('Insights chart init failed for', canvasId, err);
        }
    }
}

function getInsightsThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallback) => (styles.getPropertyValue(name) || fallback || '').trim() || fallback;
    return {
        text: read('--text-primary', '#212529'),
        textMuted: read('--text-secondary', '#6c757d'),
        border: read('--border-color', 'rgba(108, 117, 125, 0.25)'),
        bgPrimary: read('--bg-primary', '#ffffff'),
        bgSecondary: read('--bg-secondary', '#f8f9fa')
    };
}

function applyChartGlobalDefaults() {
    if (typeof Chart === 'undefined') return;
    const colors = getInsightsThemeColors();
    Chart.defaults.color = colors.textMuted;
    Chart.defaults.borderColor = colors.border;
    try {
        Chart.defaults.font.family = (getComputedStyle(document.body).fontFamily || 'inherit');
    } catch (_) { /* very early calls during init may not have body styles yet */ }
    Chart.defaults.plugins = Chart.defaults.plugins || {};
    Chart.defaults.plugins.tooltip = Chart.defaults.plugins.tooltip || {};
    Chart.defaults.plugins.tooltip.padding = 8;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
}

function attachInsightsThemeObserver() {
    if (__insightsThemeObserverAttached) return;
    __insightsThemeObserverAttached = true;
    const observer = new MutationObserver(() => {
        applyChartGlobalDefaults();
        const colors = getInsightsThemeColors();
        for (const chart of insightsCharts) {
            try {
                if (chart.options?.plugins?.legend?.labels) {
                    chart.options.plugins.legend.labels.color = colors.text;
                }
                if (chart.options?.scales) {
                    for (const scaleId of Object.keys(chart.options.scales)) {
                        const scale = chart.options.scales[scaleId];
                        if (!scale) continue;
                        if (scale.ticks) scale.ticks.color = colors.textMuted;
                        if (scale.grid) scale.grid.color = colors.border;
                        if (scale.title) scale.title.color = colors.text;
                    }
                }
                chart.update('none');
            } catch (_) { /* skip charts that have already been torn down */ }
        }
    });
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
}

// Delegated handler for every `.insights-expand-btn`. Toggles the visibility of the
// collapsed (`top-N`) and full `<tbody>` blocks for the matching `data-target` and
// flips the button label/icon. Bound once for the lifetime of the page.
function attachInsightsExpandHandler() {
    if (__insightsExpandHandlerAttached) return;
    __insightsExpandHandlerAttached = true;
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.insights-expand-btn');
        if (!btn) return;
        const id = btn.dataset.target;
        if (!id) return;
        const collapsed = document.querySelector(`[data-expand-target="${id}"][data-expand-role="collapsed"]`);
        const full = document.querySelector(`[data-expand-target="${id}"][data-expand-role="full"]`);
        if (!collapsed || !full) return;
        const isCurrentlyCollapsed = !collapsed.classList.contains('d-none');
        collapsed.classList.toggle('d-none', isCurrentlyCollapsed);
        full.classList.toggle('d-none', !isCurrentlyCollapsed);
        const icon = btn.querySelector('i');
        const label = btn.querySelector('.insights-expand-label');
        if (isCurrentlyCollapsed) {
            if (icon) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            }
            if (label) label.textContent = btn.dataset.expandedLabel || 'Show fewer';
        } else {
            if (icon) {
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
            if (label) label.textContent = btn.dataset.collapsedLabel || 'Expand to show all';
        }
    });
}

document.addEventListener('DOMContentLoaded', async function () {
    if (typeof StorageManager === 'undefined') {
        console.error('StorageManager is not defined. Please ensure storage-manager.js is loaded.');
        return;
    }

    const storageManager = window.storageManager;
    if (!storageManager) {
        console.error('StorageManager is not available. Please ensure storage-manager.js is loaded.');
        return;
    }
    await storageManager.init();

    if (typeof CacheManager !== 'undefined' && !window.cacheManager) {
        window.cacheManager = new CacheManager();
    }

    applyChartGlobalDefaults();
    attachInsightsThemeObserver();
    attachInsightsExpandHandler();

    await loadAnalysesList('analysisSelector', storageManager, document.getElementById('noDataSection'));

    async function loadInsightsData() {
        showFilterLoading('insights-page-content');
        try {
            const analysisSelector = document.getElementById('analysisSelector');
            if (!analysisSelector) {
                destroyAllInsightsCharts();
                const container = document.getElementById('insights-page-content');
                if (container) {
                    safeSetHTML(container, '<div class="alert alert-info">Please select an analysis to view insights.</div>');
                }
                return;
            }

            await loadOrganizationData(analysisSelector.value, storageManager, {
                containerId: 'insights-page-content',
                noDataSection: document.getElementById('noDataSection'),
                renderFunction: async (data) => {
                    destroyAllInsightsCharts();
                    const container = document.getElementById('insights-page-content');
                    const html = generateInsightsHTML(data);
                    safeSetHTML(container, html);
                    flushPendingCharts();
                    attachInsightsHandlers(data);
                }
            });
        } finally {
            hideFilterLoading('insights-page-content');
        }
    }

    const analysisSelector = document.getElementById('analysisSelector');
    if (analysisSelector) {
        await loadInsightsData();
        analysisSelector.addEventListener('change', loadInsightsData);
    }
});

// =============================================================================
// AGGREGATION
// =============================================================================
//
// `buildInsights`, `normalizeLanguageStats`, and all `compute*Stats` helpers
// (drift, age, vulnAge, eol, license, repoHygiene, supplyChain, depth, perRepo)
// plus `computeTechDebt`, `clamp01`, `scoreToGrade`, `countCritHigh`,
// `gradeColor`, and `renderKpiStrip` live in `js/insights-aggregator.js` so
// they can be reused by other pages (notably the home dashboard) without
// pulling in Chart.js or the heavy section renderers below. Make sure
// `insights-aggregator.js` is loaded before this file.

// =============================================================================
// RENDERING
// =============================================================================

// Analysis identifier captured from the most recent generateInsightsHTML call.
// Used by `insightsDepsLink` to forward `&org=<name>` so a link from a
// per-analysis insights view lands on the same analysis in deps.html.
let __insightsCurrentOrg = '';

/**
 * Build a deps.html URL for a package/version row in the Insights tables.
 * Mirrors the global `buildDepsLink` helper but defaults `org` to the
 * insights page's currently-selected analysis so the link narrows to the
 * same dataset the user is looking at.
 */
function insightsDepsLink({ name, version, ecosystem }) {
    if (typeof window.buildDepsLink !== 'function' || !name) return null;
    return window.buildDepsLink({
        name,
        version,
        ecosystem,
        org: __insightsCurrentOrg
    });
}

/**
 * Render `name@version` as a deps.html link when possible. Falls back to
 * plain escaped text if `buildDepsLink` is unavailable or `name` is missing,
 * so the cell never disappears entirely. Always escapes user-controlled text.
 */
function renderInsightsPkgLink(name, version, ecosystem) {
    const url = insightsDepsLink({ name, version, ecosystem });
    const text = `${escapeHtml(name || '')}@${escapeHtml(version || '')}`;
    return url ? `<a href="${url}">${text}</a>` : text;
}

function generateInsightsHTML(orgData) {
    const data = orgData?.data || {};
    // "All analyses" combined view has no organization name; leave blank so
    // links omit `org=` and deps.html falls back to its aggregated view.
    __insightsCurrentOrg = (orgData && (orgData.organization || orgData.name)) || '';
    if (__insightsCurrentOrg === '__ALL__') __insightsCurrentOrg = '';
    const ins = buildInsights(data);
    window.__insightsCache = ins;
    // Reset queues — `destroyAllInsightsCharts` is called from the loader before
    // every render but make doubly sure no stale entries leak into the next run.
    pendingCharts.length = 0;

    return [
        renderKpiStrip(ins),
        renderCoverageNotice(ins),
        renderLanguageSection(ins, data),
        renderAgeSection(ins),
        renderDriftSection(ins),
        renderDepthSection(ins),
        renderVulnAgeSection(ins),
        renderHygieneSection(ins),
        renderRedFlagsSection(ins),
        renderTechDebtSection(ins)
    ].join('\n');
}

// =============================================================================
// CHART + EXPAND HELPERS
// =============================================================================

// Stable palette aligned with the Bootstrap utility classes used elsewhere on the
// page (so the legend swatches match what users already associate with each
// severity / drift bucket). `cssColorForBucket` is still exposed for callers
// that compose mixed CSS+chart UI; both helpers MUST agree.
const INSIGHTS_PALETTE = {
    success: '#198754',
    info: '#0dcaf0',
    primary: '#0d6efd',
    warning: '#ffc107',
    orange: '#fd7e14',
    danger: '#dc3545',
    secondary: '#6c757d',
    light: '#adb5bd',
    purple: '#6f42c1',
    teal: '#20c997'
};

function paletteHex(name) {
    return INSIGHTS_PALETTE[name] || INSIGHTS_PALETTE.secondary;
}

// Render a `<canvas>` placeholder of fixed pixel size and queue a Chart factory
// to be flushed once the surrounding HTML is in the DOM.
function renderChartCanvas({ id, factory, height = 220, width = null, wrapperClass = 'insights-chart-wrap', wrapperStyle = '' }) {
    const canvasId = id || nextInsightsCanvasId();
    queueChart(canvasId, factory);
    const heightAttr = `height="${height}"`;
    const widthAttr = width ? `width="${width}"` : '';
    const wrapperStyleAttr = wrapperStyle ? `style="${wrapperStyle}"` : '';
    return `<div class="${wrapperClass}" ${wrapperStyleAttr}>
        <canvas id="${canvasId}" ${widthAttr} ${heightAttr}></canvas>
    </div>`;
}

// Mini canvas placed inside a table row. Chart.js is configured with no
// animation, no legend, no axes — only a one-line tooltip on hover — so the
// 14px tall stacked bar reads like a sparkline and ~130 of them render in a
// single page without thrash.
function renderInlineMiniBarCanvas({ datasets, labels = [''], width = 220, height = 14, tooltipLabelFormatter = null, totalForDataset = null }) {
    const canvasId = nextInsightsCanvasId('ins-mini');
    queueChart(canvasId, () => buildInlineMiniBarConfig({
        datasets, labels, tooltipLabelFormatter, totalForDataset
    }));
    return `<canvas id="${canvasId}" class="insights-mini-canvas" width="${width}" height="${height}" style="width: ${width}px; height: ${height}px; display: block;"></canvas>`;
}

// Shared singleton DOM node used as the floating tooltip for every inline
// mini-bar canvas. Chart.js draws its built-in tooltip inside the canvas, which
// gets clipped to the 14-16px row height, so we render an absolutely-positioned
// element body-rooted instead. Created lazily on first hover.
let __insightsMiniTooltipEl = null;
function getInsightsMiniTooltipEl() {
    if (__insightsMiniTooltipEl && document.body.contains(__insightsMiniTooltipEl)) {
        return __insightsMiniTooltipEl;
    }
    const el = document.createElement('div');
    el.className = 'insights-mini-tooltip';
    el.setAttribute('role', 'tooltip');
    document.body.appendChild(el);
    __insightsMiniTooltipEl = el;
    return el;
}

function inlineMiniBarExternalTooltipHandler(context) {
    const { chart, tooltip } = context;
    const el = getInsightsMiniTooltipEl();

    if (!tooltip || tooltip.opacity === 0) {
        el.classList.remove('is-visible');
        return;
    }

    if (tooltip.body && tooltip.body.length > 0) {
        const lines = tooltip.body.flatMap(b => b.lines || []);
        const colors = tooltip.labelColors || [];
        const rowsHtml = lines.map((line, i) => {
            const swatch = colors[i] && colors[i].backgroundColor
                ? `<span class="insights-mini-tooltip-swatch" style="background:${escapeHtml(colors[i].backgroundColor)}"></span>`
                : '';
            return `<div class="insights-mini-tooltip-row">${swatch}<span>${escapeHtml(line)}</span></div>`;
        }).join('');
        safeSetHTML(el, rowsHtml);
    }

    const canvasRect = chart.canvas.getBoundingClientRect();
    el.classList.add('is-visible');
    const tipWidth = el.offsetWidth;
    const tipHeight = el.offsetHeight;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const desiredLeft = canvasRect.left + scrollX + tooltip.caretX - tipWidth / 2;
    const minLeft = scrollX + 4;
    const maxLeft = scrollX + document.documentElement.clientWidth - tipWidth - 4;
    const left = Math.max(minLeft, Math.min(desiredLeft, maxLeft));
    const top = canvasRect.top + scrollY - tipHeight - 6;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function buildInlineMiniBarConfig({ datasets, labels, tooltipLabelFormatter, totalForDataset }) {
    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            indexAxis: 'y',
            responsive: false,
            maintainAspectRatio: false,
            animation: false,
            layout: { padding: 0 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: inlineMiniBarExternalTooltipHandler,
                    displayColors: true,
                    callbacks: {
                        title: () => '',
                        label: (ctx) => {
                            if (typeof tooltipLabelFormatter === 'function') {
                                return tooltipLabelFormatter(ctx);
                            }
                            const total = typeof totalForDataset === 'number' && totalForDataset > 0 ? totalForDataset : null;
                            const v = ctx.parsed.x ?? ctx.parsed.y ?? 0;
                            const lbl = ctx.dataset.label || '';
                            const pct = total ? ` (${((v / total) * 100).toFixed(1)}%)` : '';
                            return `${lbl}: ${v}${pct}`;
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true, display: false, beginAtZero: true },
                y: { stacked: true, display: false }
            },
            elements: {
                bar: { borderWidth: 0 }
            }
        }
    };
}

// Build a doughnut chart factory from a slices array (`{key, color, count}`).
// Center-label rendering is done with a tiny inline plugin so we don't depend on
// chartjs-plugin-doughnutlabel (would expand the airgapped allowlist).
function buildDoughnutConfig(slices, centerLabel) {
    const filtered = slices.filter(s => s.count > 0);
    const total = filtered.reduce((a, s) => a + s.count, 0);
    return {
        type: 'doughnut',
        data: {
            labels: filtered.map(s => s.key),
            datasets: [{
                data: filtered.map(s => s.count),
                backgroundColor: filtered.map(s => s.color),
                borderColor: getInsightsThemeColors().bgSecondary,
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed || 0;
                            const pct = total ? ` (${((v / total) * 100).toFixed(1)}%)` : '';
                            return `${ctx.label}: ${v}${pct}`;
                        }
                    }
                }
            }
        },
        plugins: [{
            id: 'insightsCenterLabel',
            afterDraw: (chart) => {
                const { ctx, chartArea } = chart;
                if (!chartArea) return;
                const colors = getInsightsThemeColors();
                const cx = (chartArea.left + chartArea.right) / 2;
                const cy = (chartArea.top + chartArea.bottom) / 2;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = colors.text;
                ctx.font = '700 22px ' + (Chart.defaults.font.family || 'sans-serif');
                ctx.fillText(String(total), cx, cy - 8);
                ctx.fillStyle = colors.textMuted;
                ctx.font = '400 12px ' + (Chart.defaults.font.family || 'sans-serif');
                ctx.fillText(centerLabel || '', cx, cy + 12);
                ctx.restore();
            }
        }]
    };
}

// Inline a Chart.js doughnut + a flexbox legend that exactly mirrors the slice
// colours. Returns the HTML the caller should drop into its grid column.
function renderDoughnutBlock(slices, centerLabel, opts = {}) {
    const filtered = slices.filter(s => s.count > 0);
    if (!filtered.length) {
        return '<div class="text-muted small">No data</div>';
    }
    const canvasId = nextInsightsCanvasId('ins-doughnut');
    queueChart(canvasId, () => buildDoughnutConfig(slices, centerLabel));
    const legend = filtered.map(s => `
        <span class="me-3"><span class="d-inline-block me-1" style="width:10px; height:10px; vertical-align: middle; background-color: ${s.color};"></span>${escapeHtml(s.key)}: <strong>${s.count.toLocaleString()}</strong></span>
    `).join('');
    const size = opts.size || 200;
    return `
        <div class="insights-doughnut-wrap" style="height: ${size}px;">
            <canvas id="${canvasId}"></canvas>
        </div>
        <div class="d-flex flex-wrap justify-content-center mt-3 small">
            ${legend}
        </div>
    `;
}

// Wrap a `<table>` in collapsed/full `<tbody>` blocks plus an expand button so
// the user can see beyond the top-N slice. If the data already fits within the
// cap (or there is no data at all) we render a single tbody and skip the button.
function renderExpandableTable({
    rows,            // full ordered array of row models (size N)
    capCount,        // top-N rows to show in collapsed view
    rowFormatter,    // (rowModel, indexInFullList) => '<tr>...</tr>'
    headerHtml,      // '<thead>...</thead>' or ''
    tableClass = 'table table-sm table-striped',
    wrapperClass = 'table-responsive',
    wrapperStyle = 'max-height: 480px;',
    emptyHtml = '<p class="text-muted small mb-0">No data.</p>',
    rowsLabel = 'rows'
}) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return emptyHtml;
    }
    // Defense-in-depth: the project-wide `.table-responsive` rule in
    // css/style.css sets `overflow: hidden`, which clips any wrapper that
    // also carries a `max-height` — i.e. every Insights expandable table.
    // Force `overflow: auto` here so vertical scroll works for both the
    // collapsed top-N and the expanded full view, without touching the
    // global rule (which still gives every other page the rounded-corner
    // + box-shadow treatment they rely on). Inline style wins on specificity.
    const effectiveWrapperStyle = /\boverflow\s*:/.test(wrapperStyle)
        ? wrapperStyle
        : `${wrapperStyle.replace(/;\s*$/, '')}; overflow: auto;`;
    const total = rows.length;
    const displayCap = Math.max(1, Math.min(capCount || total, total));
    const collapsedHtml = rows.slice(0, displayCap).map((r, i) => rowFormatter(r, i)).join('');

    if (total <= displayCap) {
        return `<div class="${wrapperClass}" style="${effectiveWrapperStyle}">
            <table class="${tableClass} mb-0">
                ${headerHtml || ''}
                <tbody>${collapsedHtml}</tbody>
            </table>
        </div>`;
    }

    const fullHtml = rows.map((r, i) => rowFormatter(r, i)).join('');
    const id = nextInsightsExpandId();
    return `
        <div class="${wrapperClass}" style="${effectiveWrapperStyle}">
            <table class="${tableClass} mb-0">
                ${headerHtml || ''}
                <tbody class="insights-rows-collapsed" data-expand-target="${id}" data-expand-role="collapsed">${collapsedHtml}</tbody>
                <tbody class="insights-rows-full d-none" data-expand-target="${id}" data-expand-role="full">${fullHtml}</tbody>
            </table>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary mt-2 insights-expand-btn"
                data-target="${id}"
                data-collapsed-label="Expand to show all (${displayCap} of ${total} ${rowsLabel})"
                data-expanded-label="Show top ${displayCap} ${rowsLabel}">
            <i class="fas fa-chevron-down me-1"></i><span class="insights-expand-label">Expand to show all (${displayCap} of ${total} ${rowsLabel})</span>
        </button>
    `;
}

function renderCoverageNotice(ins) {
    const ageCov = Math.round(ins.ageStats.coveragePct);
    const driftDeps = ins.driftStats.withDrift;
    const totalDeps = ins.totalDeps || 1;
    const driftCov = Math.round((driftDeps / totalDeps) * 100);
    const partial = ageCov < 50 || driftCov < 50;
    if (!partial) return '';

    return `
        <div class="alert alert-warning d-flex align-items-start" role="alert">
            <i class="fas fa-info-circle me-2 mt-1"></i>
            <div>
                <strong>Partial enrichment coverage.</strong>
                Package age data is available for ${ageCov}% of dependencies, drift data for ${driftCov}%.
                Re-run the analysis to populate the remaining metrics.
                ${ins.ageStats.coveragePct === 0 ? 'No staleness data is available — your stored analysis predates the broader ecosystem coverage.' : ''}
            </div>
        </div>
    `;
}

function renderLanguageSection(ins, data) {
    // `ins.languageStats` is already normalised to the array shape by `buildInsights`,
    // so we no longer touch `data.languageStats` directly here (which can be an object
    // when the combined "All Analyses" view is loaded).
    const langStats = (ins.languageStats || []).slice(0).sort((a, b) => (b.count || 0) - (a.count || 0));
    const totalLangCount = langStats.reduce((acc, l) => acc + (l.count || 0), 0) || 0;
    const topLangs = langStats.slice(0, 12);

    const langChartHtml = topLangs.length === 0
        ? '<p class="text-muted small mb-0">No language statistics available.</p>'
        : renderChartCanvas({
            height: Math.max(220, 28 * topLangs.length + 40),
            factory: () => buildLanguageBarConfig(topLangs, totalLangCount)
        });

    const polyglot = ins.perRepo.filter(r => (r.languages || []).length >= 3);
    const polyglotRowFormatter = (r) => `
        <tr>
            <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
            <td>${escapeHtml(r.primaryLanguage || '—')}</td>
            <td>${(r.languages || []).map(l => `<span class="badge bg-secondary me-1">${escapeHtml(l)}</span>`).join('') || '<span class="text-muted">—</span>'}</td>
            <td class="text-end">${r.depCount.toLocaleString()}</td>
        </tr>
    `;
    const polyglotTable = polyglot.length === 0
        ? '<p class="text-muted small mb-0">No polyglot repositories detected.</p>'
        : renderExpandableTable({
            rows: polyglot,
            capCount: 25,
            rowFormatter: polyglotRowFormatter,
            headerHtml: '<thead><tr><th>Repository</th><th>Primary</th><th>Ecosystems</th><th class="text-end">Deps</th></tr></thead>',
            wrapperStyle: 'max-height: 380px;',
            rowsLabel: 'repos'
        });

    const repoLangRowFormatter = (r) => `
        <tr>
            <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
            <td>${escapeHtml(r.primaryLanguage || '—')}</td>
            <td>${(r.languages || []).slice(0, 6).map(l => `<span class="badge bg-secondary me-1">${escapeHtml(l)}</span>`).join('') || '<span class="text-muted">—</span>'}</td>
            <td class="text-end">${r.depCount.toLocaleString()}</td>
        </tr>
    `;
    const repoLangTable = ins.perRepo.length === 0
        ? '<p class="text-muted small mb-0">No repositories.</p>'
        : renderExpandableTable({
            rows: ins.perRepo,
            capCount: 50,
            rowFormatter: repoLangRowFormatter,
            headerHtml: '<thead><tr><th>Repository</th><th>Primary (GitHub)</th><th>Ecosystems (from PURLs)</th><th class="text-end">Deps</th></tr></thead>',
            wrapperStyle: 'max-height: 480px;',
            rowsLabel: 'repos'
        });

    return `
        <section class="card mb-4">
            <div class="card-header"><h5 class="mb-0"><i class="fas fa-language me-2"></i>Language &amp; ecosystem stack</h5></div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-1">Dependency mix by ecosystem</h6>
                        <p class="small text-muted mb-3">Each count is a package-manager dependency tagged to its ecosystem language, summed across every repository it appears in (a package used in 5 repos counts 5 times). YAML rows are GitHub Actions workflow steps. <strong>Not</strong> source-code line counts or file counts.</p>
                        ${langChartHtml}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Polyglot repositories <span class="text-muted small">(&ge; 3 ecosystems)</span></h6>
                        ${polyglotTable}
                    </div>
                </div>
                <hr>
                <div class="d-flex justify-content-between align-items-center mb-2 cursor-pointer" data-bs-toggle="collapse" data-bs-target="#perRepoLangStackCollapse" aria-expanded="false" aria-controls="perRepoLangStackCollapse" role="button">
                    <h6 class="text-muted text-uppercase small mb-0">Per-repository language stack <span class="text-muted small text-lowercase">(${ins.perRepo.length} ${ins.perRepo.length === 1 ? 'repository' : 'repositories'})</span></h6>
                    <i class="fas fa-chevron-down small text-muted"></i>
                </div>
                <div class="collapse" id="perRepoLangStackCollapse">
                    ${repoLangTable}
                </div>
            </div>
        </section>
    `;
}

function buildLanguageBarConfig(topLangs, totalLangCount) {
    const colors = getInsightsThemeColors();
    return {
        type: 'bar',
        data: {
            labels: topLangs.map(l => l.language || 'Unknown'),
            datasets: [{
                label: 'Occurrences',
                data: topLangs.map(l => l.count || 0),
                backgroundColor: paletteHex('info'),
                borderColor: paletteHex('info'),
                borderWidth: 0
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const lang = topLangs[ctx.dataIndex] || {};
                            const v = ctx.parsed.x || 0;
                            const pct = totalLangCount ? ` (${((v / totalLangCount) * 100).toFixed(1)}%)` : '';
                            const uniq = lang.uniqueDependencies || 0;
                            return [
                                `${v.toLocaleString()} occurrences${pct}`,
                                `${uniq.toLocaleString()} unique packages`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: colors.textMuted },
                    grid: { color: colors.border }
                },
                y: {
                    ticks: { color: colors.text },
                    grid: { display: false }
                }
            }
        }
    };
}

function renderAgeSection(ins) {
    const total = Object.values(ins.ageStats.buckets).reduce((a, b) => a + b, 0);
    const labels = ['<6m', '6-12m', '1-2y', '2-3y', '3-5y', '>5y'];
    const bucketColors = ['success', 'info', 'primary', 'warning', 'orange', 'danger'];
    const buckets = labels.map((label, i) => ({
        label,
        count: ins.ageStats.buckets[label] || 0,
        color: bucketColors[i]
    }));

    const ageChartHtml = total === 0
        ? '<p class="text-muted small mb-0">No publish-date data available.</p>'
        : renderChartCanvas({
            height: 110,
            factory: () => buildAgeStackedBarConfig(buckets, total)
        });

    const legend = buckets.map(b => `
        <span class="me-3 small">
            <span class="d-inline-block me-1" style="width:10px; height:10px; vertical-align: middle; background-color: ${cssColorForBucket(b.color)};"></span>
            ${escapeHtml(b.label)}: <strong>${b.count.toLocaleString()}</strong>
        </span>
    `).join('');

    const oldestList = ins.perRepo
        .filter(r => r.oldest)
        .sort((a, b) => (b.oldest?.months || 0) - (a.oldest?.months || 0));
    const oldestRowFormatter = (r) => {
        const reachBadge = r.oldest.isDirect
            ? '<span class="badge bg-danger" title="Used as a direct dependency in this repo">Direct</span>'
            : '<span class="badge bg-secondary" title="Used as a transitive dependency in this repo">Transitive</span>';
        return `
            <tr>
                <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
                <td>${renderInsightsPkgLink(r.oldest.name, r.oldest.version, r.oldest.ecosystem)}</td>
                <td>${reachBadge}</td>
                <td><span class="badge bg-secondary">${escapeHtml(r.oldest.ecosystem || '—')}</span></td>
                <td class="text-end">${r.oldest.months} mo</td>
                <td class="text-end">${formatYears(r.oldest.months)}</td>
            </tr>
        `;
    };
    const oldestTable = renderExpandableTable({
        rows: oldestList,
        capCount: 30,
        rowFormatter: oldestRowFormatter,
        headerHtml: '<thead><tr><th>Repository</th><th>Package</th><th>Reach</th><th>Ecosystem</th><th class="text-end">Age</th><th class="text-end">~years</th></tr></thead>',
        wrapperStyle: 'max-height: 480px;',
        emptyHtml: '<p class="text-muted small mb-0">No publish-date data available for any repository.</p>',
        rowsLabel: 'repos'
    });

    const eolRowFormatter = (p) => {
        const direct = p.directRepoCount ?? 0;
        const trans = p.transitiveRepoCount ?? 0;
        const reachCell = direct > 0
            ? `<span class="badge bg-danger" title="Direct in ${direct} repo${direct === 1 ? '' : 's'}">${direct}D / ${trans}T</span>`
            : `<span class="badge bg-secondary" title="Transitive in ${trans} repo${trans === 1 ? '' : 's'}">${direct}D / ${trans}T</span>`;
        return `
            <tr>
                <td>${renderInsightsPkgLink(p.name, p.version, p.ecosystem)}</td>
                <td><span class="badge bg-secondary">${escapeHtml(p.ecosystem || '—')}</span></td>
                <td class="text-end">${p.months} mo</td>
                <td class="text-end">${p.repoCount}</td>
                <td class="text-end">${reachCell}</td>
                <td class="small text-muted">${escapeHtml(p.reason)}</td>
            </tr>
        `;
    };
    const eolTable = renderExpandableTable({
        rows: ins.ageStats.probableEolTop || [],
        capCount: 25,
        rowFormatter: eolRowFormatter,
        headerHtml: '<thead><tr><th>Package</th><th>Ecosystem</th><th class="text-end">Age</th><th class="text-end">Repos</th><th class="text-end">Direct/Transitive</th><th>Reason</th></tr></thead>',
        wrapperStyle: 'max-height: 480px;',
        emptyHtml: '<p class="text-muted small mb-0">No probable-EOL packages detected.</p>',
        rowsLabel: 'packages'
    });

    return `
        <section class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0"><i class="fas fa-hourglass-half me-2"></i>Package age</h5>
                <span class="badge bg-secondary">Coverage: ${Math.round(ins.ageStats.coveragePct)}% of deps have publish-date data</span>
            </div>
            <div class="card-body">
                <h6 class="text-muted text-uppercase small mb-3">Portfolio age distribution</h6>
                ${ageChartHtml}
                <div class="mb-4 mt-2">${legend}</div>

                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Oldest dependency per repository</h6>
                        ${oldestTable}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Probable EOL packages</h6>
                        ${eolTable}
                    </div>
                </div>
            </div>
        </section>
    `;
}

function buildAgeStackedBarConfig(buckets, total) {
    const colors = getInsightsThemeColors();
    return {
        type: 'bar',
        data: {
            labels: ['Portfolio'],
            datasets: buckets.map(b => ({
                label: b.label,
                data: [b.count],
                backgroundColor: cssColorForBucket(b.color),
                borderWidth: 0,
                stack: 'age'
            }))
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed.x || 0;
                            const pct = total ? ` (${((v / total) * 100).toFixed(1)}%)` : '';
                            return `${ctx.dataset.label}: ${v.toLocaleString()}${pct}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { color: colors.textMuted },
                    grid: { color: colors.border }
                },
                y: {
                    stacked: true,
                    display: false
                }
            }
        }
    };
}

function cssColorForBucket(color) {
    switch (color) {
        case 'success': return '#198754';
        case 'info': return '#0dcaf0';
        case 'primary': return '#0d6efd';
        case 'warning': return '#ffc107';
        case 'orange': return '#fd7e14';
        case 'danger': return '#dc3545';
        default: return '#6c757d';
    }
}

function formatYears(months) {
    if (typeof months !== 'number') return '—';
    const y = months / 12;
    return y >= 1 ? `${y.toFixed(1)}y` : `${months}mo`;
}

function renderDriftSection(ins) {
    const repos = ins.perRepo
        .filter(r => r.driftCounts.withDrift > 0)
        .sort((a, b) => (b.driftCounts.major - a.driftCounts.major) || (b.driftCounts.minor - a.driftCounts.minor));

    const driftRowFormatter = (r) => {
        const dc = r.driftCounts;
        // 8-segment stack: each drift bucket split into direct (solid) and
        // transitive (50% alpha). The renderer skips zero segments so empty
        // splits don't bloat the legend.
        const sCurrent = dc.currentSplit || { direct: dc.current, transitive: 0 };
        const sPatch = dc.patchSplit || { direct: dc.patch, transitive: 0 };
        const sMinor = dc.minorSplit || { direct: dc.minor, transitive: 0 };
        const sMajor = dc.majorSplit || { direct: dc.major, transitive: 0 };
        const datasets = [
            { label: 'Current (direct)', data: [sCurrent.direct], backgroundColor: cssColorForBucket('success'), borderWidth: 0, stack: 'drift' },
            { label: 'Current (transitive)', data: [sCurrent.transitive], backgroundColor: alphaColor(cssColorForBucket('success'), 0.5), borderWidth: 0, stack: 'drift' },
            { label: 'Patch (direct)', data: [sPatch.direct], backgroundColor: cssColorForBucket('info'), borderWidth: 0, stack: 'drift' },
            { label: 'Patch (transitive)', data: [sPatch.transitive], backgroundColor: alphaColor(cssColorForBucket('info'), 0.5), borderWidth: 0, stack: 'drift' },
            { label: 'Minor (direct)', data: [sMinor.direct], backgroundColor: cssColorForBucket('warning'), borderWidth: 0, stack: 'drift' },
            { label: 'Minor (transitive)', data: [sMinor.transitive], backgroundColor: alphaColor(cssColorForBucket('warning'), 0.5), borderWidth: 0, stack: 'drift' },
            { label: 'Major (direct)', data: [sMajor.direct], backgroundColor: cssColorForBucket('danger'), borderWidth: 0, stack: 'drift' },
            { label: 'Major (transitive)', data: [sMajor.transitive], backgroundColor: alphaColor(cssColorForBucket('danger'), 0.5), borderWidth: 0, stack: 'drift' }
        ];
        const totalPairs = sCurrent.direct + sCurrent.transitive
            + sPatch.direct + sPatch.transitive
            + sMinor.direct + sMinor.transitive
            + sMajor.direct + sMajor.transitive;
        const miniCanvas = renderInlineMiniBarCanvas({
            datasets,
            width: 240,
            height: 16,
            totalForDataset: totalPairs || dc.withDrift
        });
        const majorDirectChip = sMajor.direct > 0
            ? `<span class="badge bg-danger ms-1" title="Major drift on a direct dep">${sMajor.direct}</span>`
            : '';
        return `
            <tr>
                <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
                <td style="min-width: 250px;">${miniCanvas}</td>
                <td class="text-end small">${dc.current}/${dc.patch}/${dc.minor}/<strong class="text-danger">${dc.major}</strong>${majorDirectChip}</td>
                <td class="text-end small">${dc.withDrift}</td>
            </tr>
        `;
    };

    const driftTable = renderExpandableTable({
        rows: repos,
        capCount: 50,
        rowFormatter: driftRowFormatter,
        headerHtml: '<thead><tr><th>Repository</th><th>Drift breakdown</th><th class="text-end">C/P/Mi/Ma</th><th class="text-end">Total</th></tr></thead>',
        tableClass: 'table table-sm table-striped align-middle',
        wrapperStyle: 'max-height: 520px;',
        emptyHtml: '<p class="text-muted small mb-0">No drift data available.</p>',
        rowsLabel: 'repos'
    });

    const topRowFormatter = (p) => {
        const direct = p.directRepoCount ?? 0;
        const trans = p.transitiveRepoCount ?? 0;
        const reachCell = direct > 0
            ? `<span class="badge bg-danger" title="Direct in ${direct} repo${direct === 1 ? '' : 's'}, transitive in ${trans}">${direct}D / ${trans}T</span>`
            : `<span class="badge bg-secondary" title="Transitive in ${trans} repo${trans === 1 ? '' : 's'}">${direct}D / ${trans}T</span>`;
        return `
            <tr>
                <td>${renderInsightsPkgLink(p.name, p.version, p.ecosystem)} <span class="text-muted small">→ ${escapeHtml(p.latestVersion)}</span></td>
                <td><span class="badge bg-secondary">${escapeHtml(p.ecosystem || '—')}</span></td>
                <td><span class="badge bg-${p.kind === 'major' ? 'danger' : 'warning text-dark'}">${p.kind}</span></td>
                <td class="text-end">${p.repoCount}</td>
                <td class="text-end">${reachCell}</td>
            </tr>
        `;
    };
    const topTable = renderExpandableTable({
        rows: ins.driftStats.top || [],
        capCount: 20,
        rowFormatter: topRowFormatter,
        headerHtml: '<thead><tr><th>Package</th><th>Ecosystem</th><th>Drift</th><th class="text-end">Repos</th><th class="text-end">Direct/Transitive</th></tr></thead>',
        wrapperStyle: 'max-height: 520px;',
        emptyHtml: '<p class="text-muted small mb-0">No drift data available.</p>',
        rowsLabel: 'packages'
    });

    return `
        <section class="card mb-4">
            <div class="card-header"><h5 class="mb-0"><i class="fas fa-arrow-up-right-dots me-2"></i>Version drift</h5></div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Drift per repository</h6>
                        <p class="small text-muted mb-2">Stack order: <span class="badge bg-success">current</span> <span class="badge bg-info">patch</span> <span class="badge bg-warning text-dark">minor</span> <span class="badge bg-danger">major</span> · solid = direct dep, faded = transitive. The trailing red chip on each row counts major-drift hits on direct deps.</p>
                        ${driftTable}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Top lagging packages <span class="text-muted small">(by repos × major)</span></h6>
                        ${topTable}
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderDepthSection(ins) {
    const ds = ins.depthStats;
    if (!ds) return '';

    const observedMax = ds.observedMaxLevel || 0;
    const levels = [];
    for (let l = 1; l <= observedMax; l++) levels.push(l);

    const portfolioTotal = levels.reduce((acc, l) => acc + (ds.globalBuckets.get(l) || 0), 0);
    const imputedDirect = ds.imputedDirectGlobal || 0;

    // Sequential palette: green for direct (Level 1), warming up to red as depth grows.
    // Reuses Bootstrap utility colors so it matches the rest of the page; the 'orange'
    // sentinel is mapped via inline style because Bootstrap 5.1 has no `bg-orange`.
    const colorForLevel = (level) => {
        if (level === 1) return 'success';
        if (level === 2) return 'info';
        if (level === 3) return 'primary';
        if (level === 4) return 'warning';
        if (level === 5) return 'orange';
        return 'danger';
    };

    const portfolioBuckets = levels.map(l => ({
        label: `Level ${l}`,
        count: ds.globalBuckets.get(l) || 0,
        color: cssColorForBucket(colorForLevel(l))
    }));

    const portfolioChartHtml = portfolioTotal === 0
        ? '<p class="text-muted small mb-0">No depth data available.</p>'
        : renderChartCanvas({
            height: 110,
            factory: () => buildDepthStackedBarConfig(portfolioBuckets, portfolioTotal)
        });

    const legend = portfolioBuckets.map(b => `
        <span class="me-3 small">
            <span class="d-inline-block me-1" style="width:10px; height:10px; vertical-align: middle; background-color: ${b.color};"></span>
            ${escapeHtml(b.label)}: <strong>${b.count.toLocaleString()}</strong>
        </span>
    `).join('');

    // Surface the imputed-direct count so users know how much of Level 1 came from
    // residuals (deps without a traceable parent path) vs explicit direct declarations.
    const imputedNote = imputedDirect > 0
        ? `<p class="text-muted small mt-1 mb-0"><i class="fas fa-info-circle me-1"></i>Includes <strong>${imputedDirect.toLocaleString()}</strong> dependency occurrences with no traceable parent path; treated as direct.</p>`
        : '';

    // Depth-cap warning: with our labelling scheme, Level (configuredMaxDepth + 1) is the
    // deepest the resolver can reach. Hitting it means we stopped resolving children of
    // those packages, so there *might* be more transitives the user isn't seeing.
    const truncationAlert = (() => {
        if (!ds.hasDepthData || ds.observedMaxLevel === null) return '';
        const capLevel = ds.configuredMaxDepth + 1;
        if (ds.observedMaxLevel < capLevel) return '';
        const deepestCount = ds.globalBuckets.get(ds.observedMaxLevel) || 0;
        if (deepestCount === 0) return '';
        return `
            <div class="alert alert-warning d-flex align-items-start" role="alert">
                <i class="fas fa-exclamation-triangle me-2 mt-1"></i>
                <div>
                    <strong>Depth limit hit.</strong>
                    ${deepestCount.toLocaleString()} dependency occurrences sit at Level ${ds.observedMaxLevel}, which equals the current <code>maxDepth</code> setting (${ds.configuredMaxDepth}). Their transitive children were not resolved.
                    Raise <code>maxDepth</code> in <a href="settings.html">Settings</a> and re-run the analysis to surface deeper transitives.
                </div>
            </div>
        `;
    })();

    const repos = Array.from(ds.perRepo.values())
        .filter(r => r.total > 0)
        .sort((a, b) => b.total - a.total);

    const colHeader = levels.map(l => `<th class="text-end small">L${l}</th>`).join('');

    const depthRowFormatter = (r) => {
        const datasets = levels.map(l => ({
            label: `Level ${l}`,
            data: [r.byLevel.get(l) || 0],
            backgroundColor: cssColorForBucket(colorForLevel(l)),
            borderWidth: 0,
            stack: 'depth'
        }));
        const miniCanvas = renderInlineMiniBarCanvas({
            datasets,
            width: 220,
            height: 16,
            totalForDataset: r.total
        });
        const levelCells = levels.map(l => {
            const c = r.byLevel.get(l) || 0;
            return `<td class="text-end small">${c ? c.toLocaleString() : '<span class="text-muted">—</span>'}</td>`;
        }).join('');
        const deepestCnt = r.deepestCount || 0;
        const deepestShare = r.total ? deepestCnt / r.total : 0;
        const deepestStrong = (deepestCnt > 0 && deepestShare >= 0.25);
        const deepestLabel = r.deepest === null
            ? '<span class="text-muted">—</span>'
            : `${deepestCnt.toLocaleString()} <span class="text-muted small">@ L${r.deepest}</span>`;
        return `
            <tr>
                <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
                <td style="min-width: 230px;">${miniCanvas}</td>
                ${levelCells}
                <td class="text-end small fw-semibold">${r.total.toLocaleString()}</td>
                <td class="text-end small ${deepestStrong ? 'text-danger fw-bold' : ''}">${deepestLabel}</td>
            </tr>
        `;
    };

    const depthTable = renderExpandableTable({
        rows: repos,
        capCount: 50,
        rowFormatter: depthRowFormatter,
        headerHtml: `<thead><tr><th>Repository</th><th>Distribution</th>${colHeader}<th class="text-end small">Total</th><th class="text-end small">Deepest</th></tr></thead>`,
        tableClass: 'table table-sm table-striped align-middle',
        wrapperStyle: 'max-height: 520px;',
        emptyHtml: '<p class="text-muted small mb-0">No dependency data available.</p>',
        rowsLabel: 'repos'
    });

    const headerBadge = ds.observedMaxLevel !== null
        ? `<span class="badge bg-secondary">Observed max: Level ${ds.observedMaxLevel} · Configured maxDepth: ${ds.configuredMaxDepth}</span>`
        : `<span class="badge bg-secondary">Configured maxDepth: ${ds.configuredMaxDepth}</span>`;

    return `
        <section class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0"><i class="fas fa-layer-group me-2"></i>Dependency depth</h5>
                ${headerBadge}
            </div>
            <div class="card-body">
                ${truncationAlert}
                <h6 class="text-muted text-uppercase small mb-2">Portfolio-wide depth distribution</h6>
                <p class="small text-muted mb-2">Each (dependency × repository) occurrence is bucketed by how deep it sits below the repo's direct deps. Level 1 = direct, Level 2 = first-level transitive, …, Level N+1 = N-th level transitive.</p>
                ${portfolioChartHtml}
                <div class="mt-2">${legend || '<span class="text-muted small">No depth data available.</span>'}</div>
                ${imputedNote}
                <div class="mb-4"></div>
                <h6 class="text-muted text-uppercase small mb-3">Per-repository depth breakdown <span class="text-muted small">(${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'})</span></h6>
                ${depthTable}
                <p class="small text-muted mt-2 mb-0"><i class="fas fa-info-circle me-1"></i>Depth is the global per-ecosystem resolver depth — a package reached via different direct dependencies in different repos can therefore show the same level across repos.</p>
            </div>
        </section>
    `;
}

function buildDepthStackedBarConfig(buckets, total) {
    const colors = getInsightsThemeColors();
    return {
        type: 'bar',
        data: {
            labels: ['Portfolio'],
            datasets: buckets.map(b => ({
                label: b.label,
                data: [b.count],
                backgroundColor: b.color,
                borderWidth: 0,
                stack: 'depth'
            }))
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed.x || 0;
                            const pct = total ? ` (${((v / total) * 100).toFixed(1)}%)` : '';
                            return `${ctx.dataset.label}: ${v.toLocaleString()}${pct}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { color: colors.textMuted },
                    grid: { color: colors.border }
                },
                y: {
                    stacked: true,
                    display: false
                }
            }
        }
    };
}

function renderVulnAgeSection(ins) {
    const ageBuckets = ['<30d', '30-90d', '90d-1y', '1-2y', '>2y'];
    const totalCves = ins.vulnAgeStats.totalCves || 0;

    const ageChartHtml = totalCves === 0
        ? '<p class="text-muted small mb-0">No CVEs found.</p>'
        : renderChartCanvas({
            height: 280,
            factory: () => buildVulnAgeStackedBarConfig(ins.vulnAgeStats, ageBuckets)
        });

    // New: Vulnerabilities × dependency depth chart. One stack per Level 1..N
    // with the four severity colours layered on top. The user's headline
    // request — surface that an unfixed CVE on a Level-1 dep is a much more
    // pressing issue than the same CVE at depth 5.
    const byDepth = ins.vulnAgeStats.byDepth;
    const hasDepthData = byDepth && byDepth.size > 0;
    const depthChartHtml = hasDepthData
        ? renderChartCanvas({
            height: 260,
            factory: () => buildVulnDepthStackedBarConfig(byDepth)
        })
        : '<p class="text-muted small mb-0">No depth-level data available for findings.</p>';
    const depthCaption = hasDepthData
        ? '<p class="small text-muted mt-1 mb-2">Each bar is a depth level (Level 1 = direct, Level 2 = first-level transitive, …); stacks show severity. Unfixed findings on Level 1 are the strongest "actionable on this team alone" signal.</p>'
        : '';

    const tbRowFormatter = (t) => {
        const reachBadge = t.isDirect
            ? '<span class="badge bg-danger" title="At least one repo uses this dep as a direct dependency">Direct</span>'
            : '<span class="badge bg-secondary" title="Used as a transitive dependency">Transitive</span>';
        return `
            <tr>
                <td>${renderInsightsPkgLink(t.pkg, t.version, t.ecosystem)}</td>
                <td>${reachBadge}</td>
                <td><span class="badge bg-secondary">${escapeHtml(t.ecosystem || '—')}</span></td>
                <td><a href="https://osv.dev/vulnerability/${encodeURIComponent(t.cveId)}" target="_blank" rel="noreferrer noopener">${escapeHtml(t.cveId)}</a></td>
                <td><span class="badge severity-${t.severity}">${escapeHtml(t.severity)}</span></td>
                <td class="text-end">${t.ageDays} d</td>
                <td><code class="small">${escapeHtml(t.fixVersion)}</code></td>
            </tr>
        `;
    };
    const tbTable = renderExpandableTable({
        rows: ins.vulnAgeStats.timeBombs || [],
        capCount: 50,
        rowFormatter: tbRowFormatter,
        headerHtml: '<thead><tr><th>Package</th><th>Reach</th><th>Ecosystem</th><th>CVE</th><th>Severity</th><th class="text-end">Age</th><th>Fix</th></tr></thead>',
        wrapperStyle: 'max-height: 480px;',
        emptyHtml: '<p class="text-muted small mb-0">No time-bomb CVEs detected.</p>',
        rowsLabel: 'CVEs'
    });

    // perRepoCH entries now carry `{ critical: { direct, transitive }, high: { ... } }`
    // — flatten to a row model that the renderer can use.
    const repoCH = Array.from(ins.vulnAgeStats.perRepoCH.entries())
        .map(([repoKey, c]) => {
            const critDirect = c.critical?.direct || 0;
            const critTrans = c.critical?.transitive || 0;
            const highDirect = c.high?.direct || 0;
            const highTrans = c.high?.transitive || 0;
            return {
                repoKey,
                critDirect, critTrans, highDirect, highTrans,
                criticalTotal: critDirect + critTrans,
                highTotal: highDirect + highTrans,
                directTotal: critDirect + highDirect,
                total: critDirect + critTrans + highDirect + highTrans
            };
        })
        // Sort by `directTotal` first (the most actionable bucket), then by overall total.
        .sort((a, b) => (b.directTotal - a.directTotal) || (b.total - a.total));

    const repoCHRowFormatter = (r) => {
        // 4-segment stack: direct C, direct H, transitive C, transitive H.
        // Direct stacks shaded fully, transitive stacks at 50% alpha so the
        // visual hierarchy reads "direct = louder".
        const datasets = [
            { label: 'Critical (direct)', data: [r.critDirect], backgroundColor: cssColorForBucket('danger'), borderWidth: 0, stack: 'ch' },
            { label: 'High (direct)', data: [r.highDirect], backgroundColor: cssColorForBucket('warning'), borderWidth: 0, stack: 'ch' },
            { label: 'Critical (transitive)', data: [r.critTrans], backgroundColor: alphaColor(cssColorForBucket('danger'), 0.5), borderWidth: 0, stack: 'ch' },
            { label: 'High (transitive)', data: [r.highTrans], backgroundColor: alphaColor(cssColorForBucket('warning'), 0.5), borderWidth: 0, stack: 'ch' }
        ];
        const miniCanvas = renderInlineMiniBarCanvas({
            datasets,
            width: 220,
            height: 14,
            totalForDataset: r.total
        });
        const dirBadge = r.directTotal > 0
            ? `<span class="badge bg-danger" title="${r.critDirect} critical + ${r.highDirect} high on direct deps">${r.directTotal}</span>`
            : '<span class="text-muted small">0</span>';
        return `
            <tr>
                <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
                <td style="min-width: 230px;">${miniCanvas}</td>
                <td class="text-end small text-danger fw-bold">${r.criticalTotal}</td>
                <td class="text-end small text-warning fw-bold">${r.highTotal}</td>
                <td class="text-end small fw-bold">${dirBadge}</td>
            </tr>
        `;
    };
    const repoCHTable = renderExpandableTable({
        rows: repoCH,
        capCount: 30,
        rowFormatter: repoCHRowFormatter,
        headerHtml: '<thead><tr><th>Repository</th><th>Distribution <span class="text-muted small">(direct=solid, transitive=faded)</span></th><th class="text-end">C</th><th class="text-end">H</th><th class="text-end">On direct</th></tr></thead>',
        wrapperStyle: 'max-height: 480px;',
        emptyHtml: '<p class="text-muted small mb-0">No Critical/High CVEs by repository.</p>',
        rowsLabel: 'repos'
    });

    const splitBadge = (() => {
        const td = ins.vulnAgeStats.totalsBySev;
        if (!td) return '';
        const direct = ins.vulnAgeStats.directCves || 0;
        const trans = ins.vulnAgeStats.transitiveCves || 0;
        return `<span class="badge bg-secondary ms-2">${direct.toLocaleString()} on direct / ${trans.toLocaleString()} on transitive</span>`;
    })();

    return `
        <section class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0"><i class="fas fa-stopwatch me-2"></i>Vulnerability age</h5>
                <span class="badge bg-secondary">${ins.vulnAgeStats.totalCves} CVEs · median age ${ins.vulnAgeStats.medianAgeDays !== null ? ins.vulnAgeStats.medianAgeDays + ' d' : 'N/A'}${splitBadge ? ' ' + splitBadge : ''}</span>
            </div>
            <div class="card-body">
                <h6 class="text-muted text-uppercase small mb-3">CVE age × severity</h6>
                ${ageChartHtml}
                <hr>
                <h6 class="text-muted text-uppercase small mb-2">Vulnerabilities × dependency depth</h6>
                ${depthCaption}
                ${depthChartHtml}
                <div class="row g-4 mt-1">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Time-bomb CVEs <span class="text-muted small">(&ge; 90d old, fix available, C/H — direct first)</span></h6>
                        ${tbTable}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Critical+High by repository</h6>
                        ${repoCHTable}
                    </div>
                </div>
            </div>
        </section>
    `;
}

/**
 * Convert a hex/rgb color string to an rgba string with the given alpha.
 * Used to fade transitive segments in the per-repo Critical+High mini bars
 * so direct-dep findings stand out visually.
 */
function alphaColor(color, alpha) {
    if (!color) return `rgba(108, 117, 125, ${alpha})`;
    if (color.startsWith('rgba(')) {
        return color.replace(/rgba\(([^)]+)\)/, (_, body) => {
            const parts = body.split(',').map(s => s.trim());
            parts[3] = String(alpha);
            return `rgba(${parts.join(', ')})`;
        });
    }
    if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }
    if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
}

function buildVulnDepthStackedBarConfig(byDepth) {
    const colors = getInsightsThemeColors();
    const levels = Array.from(byDepth.keys()).sort((a, b) => a - b);
    const series = [
        { key: 'critical', label: 'Critical', color: cssColorForBucket('danger') },
        { key: 'high', label: 'High', color: cssColorForBucket('warning') },
        { key: 'medium', label: 'Medium', color: cssColorForBucket('info') },
        { key: 'low', label: 'Low', color: cssColorForBucket('secondary') }
    ];
    return {
        type: 'bar',
        data: {
            labels: levels.map(l => `Level ${l}`),
            datasets: series.map(s => ({
                label: s.label,
                data: levels.map(l => byDepth.get(l)?.[s.key] || 0),
                backgroundColor: s.color,
                borderWidth: 0,
                stack: 'sev'
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: colors.text, boxWidth: 12, boxHeight: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed.y || 0;
                            return `${ctx.dataset.label}: ${v.toLocaleString()}`;
                        },
                        afterBody: (ctxs) => {
                            if (!ctxs.length) return '';
                            const idx = ctxs[0].dataIndex;
                            const level = levels[idx];
                            const slot = byDepth.get(level);
                            if (!slot) return '';
                            const total = slot.total || 0;
                            const directOnly = (slot.criticalDirect || 0) + (slot.highDirect || 0)
                                + (slot.mediumDirect || 0) + (slot.lowDirect || 0);
                            return `Total: ${total.toLocaleString()} · ${directOnly.toLocaleString()} on direct deps`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Dependency depth (Level 1 = direct)', color: colors.text },
                    ticks: { color: colors.textMuted },
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: 'Vulnerability count', color: colors.text },
                    ticks: { color: colors.textMuted, precision: 0 },
                    grid: { color: colors.border }
                }
            }
        }
    };
}

function buildVulnAgeStackedBarConfig(vulnAgeStats, ageBuckets) {
    const colors = getInsightsThemeColors();
    const series = [
        { key: 'critical', label: 'Critical', color: cssColorForBucket('danger') },
        { key: 'high', label: 'High', color: cssColorForBucket('warning') },
        { key: 'medium', label: 'Medium', color: cssColorForBucket('info') },
        { key: 'low', label: 'Low', color: cssColorForBucket('secondary') }
    ];
    return {
        type: 'bar',
        data: {
            labels: ageBuckets,
            datasets: series.map(s => ({
                label: s.label,
                data: ageBuckets.map(b => vulnAgeStats.buckets[b]?.[s.key] || 0),
                backgroundColor: s.color,
                borderWidth: 0,
                stack: 'sev'
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: colors.text, boxWidth: 12, boxHeight: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.parsed.y || 0;
                            return `${ctx.dataset.label}: ${v.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'CVE age', color: colors.text },
                    ticks: { color: colors.textMuted },
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: 'CVE count', color: colors.text },
                    ticks: { color: colors.textMuted, precision: 0 },
                    grid: { color: colors.border }
                }
            }
        }
    };
}

function renderHygieneSection(ins) {
    const grades = ins.repoHygiene.grades;
    const slices = [
        { key: 'A', color: paletteHex('success'), count: grades.A },
        { key: 'B', color: paletteHex('teal'), count: grades.B },
        { key: 'C', color: paletteHex('info'), count: grades.C },
        { key: 'D', color: paletteHex('warning'), count: grades.D },
        { key: 'F', color: paletteHex('danger'), count: grades.F },
        { key: 'N/A', color: paletteHex('light'), count: grades['N/A'] }
    ];
    const gradeDonut = renderDoughnutBlock(slices, 'repos', { size: 200 });

    const activity = ins.repoHygiene.activityBuckets;
    const activityBuckets = [
        { label: '<30d', count: activity['<30d'], color: cssColorForBucket('success') },
        { label: '<90d', count: activity['<90d'], color: cssColorForBucket('info') },
        { label: '<1y', count: activity['<1y'], color: cssColorForBucket('primary') },
        { label: '>1y', count: activity['>1y'], color: cssColorForBucket('warning') },
        { label: 'archived', count: activity.archived, color: cssColorForBucket('secondary') },
        { label: 'unknown', count: activity.unknown, color: '#ced4da' }
    ];
    const activityChartHtml = renderChartCanvas({
        height: 220,
        factory: () => buildRepoActivityBarConfig(activityBuckets)
    });

    return `
        <section class="card mb-4">
            <div class="card-header"><h5 class="mb-0"><i class="fas fa-heart-pulse me-2"></i>Repository hygiene</h5></div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-md-4 text-center">
                        <h6 class="text-muted text-uppercase small mb-3">SBOM grade distribution</h6>
                        ${gradeDonut}
                    </div>
                    <div class="col-md-4">
                        <h6 class="text-muted text-uppercase small mb-3">Repo activity (push-time)</h6>
                        ${activityChartHtml}
                    </div>
                    <div class="col-md-4">
                        <h6 class="text-muted text-uppercase small mb-3">Visibility debt</h6>
                        <ul class="list-unstyled mb-0 small">
                            <li><i class="fas fa-circle text-danger me-2"></i><strong>${ins.repoHygiene.noGraph.length}</strong> repos without dependency graph</li>
                            <li><i class="fas fa-circle text-warning me-2"></i><strong>${ins.repoHygiene.archived.length}</strong> archived repos still in scope</li>
                            <li><i class="fas fa-circle text-info me-2"></i><strong>${grades['N/A']}</strong> repos with no SBOM grade</li>
                            <li><i class="fas fa-circle text-success me-2"></i><strong>${grades.A + grades.B}</strong> repos at grade A or B</li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function buildRepoActivityBarConfig(buckets) {
    const colors = getInsightsThemeColors();
    return {
        type: 'bar',
        data: {
            labels: buckets.map(b => b.label),
            datasets: [{
                label: 'Repos',
                data: buckets.map(b => b.count),
                backgroundColor: buckets.map(b => b.color),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${ctx.parsed.y.toLocaleString()} repos`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: colors.textMuted },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: colors.textMuted, precision: 0 },
                    grid: { color: colors.border }
                }
            }
        }
    };
}

function renderRedFlagsSection(ins) {
    const ls = ins.licenseStats;
    // Prefer the (dep, repo) pair-level split if available — that's the unit
    // the user actually sees on a per-row basis ("this license is direct in
    // 3 repos and transitive in 7"). Falls back to per-package totals when
    // the analyser hasn't tagged riskTier on each dep.
    const pairs = ls.riskPairs || null;
    const hasPairSplit = !!pairs && (pairs.high.direct + pairs.high.transitive
        + pairs.medium.direct + pairs.medium.transitive
        + pairs.low.direct + pairs.low.transitive) > 0;
    const licTotal = hasPairSplit
        ? (pairs.high.direct + pairs.high.transitive + pairs.medium.direct + pairs.medium.transitive + pairs.low.direct + pairs.low.transitive)
        : (ls.high + ls.medium + ls.low);
    // 4-slice donut: High (direct/transitive) and Medium (direct/transitive),
    // plus Low (direct+transitive collapsed) so the donut keeps a manageable
    // legend while still highlighting "direct" as visually distinct.
    const licSlices = hasPairSplit ? [
        { key: 'High (direct)', color: paletteHex('danger'), count: pairs.high.direct },
        { key: 'High (transitive)', color: alphaColor(paletteHex('danger'), 0.5), count: pairs.high.transitive },
        { key: 'Medium (direct)', color: paletteHex('warning'), count: pairs.medium.direct },
        { key: 'Medium (transitive)', color: alphaColor(paletteHex('warning'), 0.5), count: pairs.medium.transitive },
        { key: 'Low', color: paletteHex('success'), count: pairs.low.direct + pairs.low.transitive }
    ] : [
        { key: 'High', color: paletteHex('danger'), count: ls.high },
        { key: 'Medium', color: paletteHex('warning'), count: ls.medium },
        { key: 'Low', color: paletteHex('success'), count: ls.low }
    ];
    const licDonut = licTotal > 0
        ? renderDoughnutBlock(licSlices, hasPairSplit ? 'occurrences' : 'deps', { size: 200 })
        : '<div class="text-muted small">No license data</div>';

    const sc = ins.supplyChain;
    // Each slice = a discrete supply-chain red-flag bucket; sizing the donut by raw
    // counts gives the reader an immediate read on which class of issue dominates the
    // portfolio (e.g. "almost all our findings are unpinned Actions" vs "EOL is
    // driving most of our risk"). Keeping the colour scheme aligned with the original
    // bullet-list icons (skull = malware, dep-confusion = orange, pin = warning yellow,
    // EOL = purple/info) so users transitioning from the v1 layout don't have to relearn
    // semantics.
    const scSlices = [
        { key: 'Malware', color: paletteHex('danger'), count: sc.malwareCount },
        { key: 'Dep-confusion', color: paletteHex('orange'), count: sc.depConfusion },
        { key: 'Unpinned actions', color: paletteHex('warning'), count: sc.unpinnedActions },
        { key: 'EOL', color: paletteHex('purple'), count: ins.eolStats.eolCount },
        { key: 'EOS', color: paletteHex('info'), count: ins.eolStats.eosCount }
    ];
    const scTotal = scSlices.reduce((a, b) => a + b.count, 0);
    const scDonut = scTotal > 0
        ? renderDoughnutBlock(scSlices, 'findings', { size: 200 })
        : '<div class="text-muted small">No supply-chain findings</div>';
    const scSubtitle = sc.totalActions
        ? `${scTotal} red-flag findings · ${sc.totalActions} Actions scanned`
        : `${scTotal} red-flag findings`;

    const directRowFormatter = (r) => {
        const directIn = r.directRepoCount ?? (Array.isArray(r.directIn) ? r.directIn.length : 0);
        const transitiveIn = r.transitiveRepoCount ?? (Array.isArray(r.transitiveIn) ? r.transitiveIn.length : 0);
        const transitiveCell = transitiveIn > 0
            ? `<span class="badge bg-secondary" title="Same package, transitive in ${transitiveIn} other repo${transitiveIn === 1 ? '' : 's'}">${transitiveIn}</span>`
            : '<span class="text-muted small">—</span>';
        return `
            <tr>
                <td>${renderInsightsPkgLink(r.name, r.version, r.ecosystem)}</td>
                <td><span class="badge bg-secondary">${escapeHtml(r.ecosystem || '—')}</span></td>
                <td><code class="small">${escapeHtml(r.license)}</code></td>
                <td class="text-end">${directIn}</td>
                <td class="text-end">${transitiveCell}</td>
            </tr>
        `;
    };
    const directTable = renderExpandableTable({
        rows: ls.directHighRisk || [],
        capCount: 25,
        rowFormatter: directRowFormatter,
        headerHtml: '<thead><tr><th>Package</th><th>Ecosystem</th><th>License</th><th class="text-end">Direct in</th><th class="text-end">Also transitive in</th></tr></thead>',
        wrapperStyle: 'max-height: 480px;',
        emptyHtml: '<p class="text-muted small mb-0">No copyleft licenses found on direct dependencies.</p>',
        rowsLabel: 'packages'
    });

    const eolRowFormatter = (e) => `
        <tr>
            <td>${renderInsightsPkgLink(e.name, e.version, e.ecosystem)}</td>
            <td><span class="badge bg-secondary">${escapeHtml(e.ecosystem || '—')}</span></td>
            <td>${e.product ? `<a href="https://endoflife.date/${encodeURIComponent(e.product)}" target="_blank" rel="noreferrer noopener">${escapeHtml(e.product)}</a>` : '—'}</td>
            <td class="small text-muted">${escapeHtml(e.eolDate || '')}</td>
            <td class="text-end">${e.repoCount}</td>
        </tr>
    `;
    const eolTable = renderExpandableTable({
        rows: ins.eolStats.eolItems || [],
        capCount: 25,
        rowFormatter: eolRowFormatter,
        headerHtml: '<thead><tr><th>Package</th><th>Ecosystem</th><th>Product</th><th>EOL date</th><th class="text-end">Repos</th></tr></thead>',
        wrapperStyle: 'max-height: 480px;',
        emptyHtml: '<p class="text-muted small mb-0">No EOL components detected.</p>',
        rowsLabel: 'packages'
    });

    const conflicts = ls.conflicts.length ? `
        <div class="alert alert-danger small mb-0">
            <strong><i class="fas fa-exclamation-triangle me-2"></i>${ls.conflicts.length} license conflicts detected</strong>
            <ul class="mb-0 mt-2">
                ${ls.conflicts.slice(0, 8).map(c => `<li>${escapeHtml(c.description || c.message || JSON.stringify(c))}</li>`).join('')}
            </ul>
        </div>
    ` : '<p class="text-muted small mb-0">No license conflicts detected.</p>';

    return `
        <section class="card mb-4">
            <div class="card-header"><h5 class="mb-0"><i class="fas fa-flag me-2"></i>Supply-chain &amp; M&amp;A red flags</h5></div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-md-4 text-center">
                        <h6 class="text-muted text-uppercase small mb-3">License risk</h6>
                        ${licDonut}
                        <div class="text-muted small mt-2">${licTotal} licensed deps</div>
                    </div>
                    <div class="col-md-4">
                        <h6 class="text-muted text-uppercase small mb-3">Conflicts</h6>
                        ${conflicts}
                    </div>
                    <div class="col-md-4 text-center">
                        <h6 class="text-muted text-uppercase small mb-3">Supply-chain hygiene</h6>
                        ${scDonut}
                        <div class="text-muted small mt-2">${scSubtitle}</div>
                    </div>
                </div>
                <hr>
                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Copyleft licenses on direct dependencies <span class="text-muted small">(GPL/AGPL/LGPL/MPL/EPL/CDDL/OSL/EUPL)</span></h6>
                        ${directTable}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">EOL components</h6>
                        ${eolTable}
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderTechDebtSection(ins) {
    const td = ins.techDebt;

    const componentChartHtml = renderChartCanvas({
        height: Math.max(220, 28 * td.components.length + 40),
        factory: () => buildTechDebtComponentBarConfig(td.components)
    });

    const compTableRows = td.components.map(c => `
        <tr>
            <td>${escapeHtml(c.label)}</td>
            <td class="text-end small text-muted">${(c.weight * 100).toFixed(0)}%</td>
            <td class="text-end small">${(c.score * 100).toFixed(1)}</td>
            <td class="text-end small text-muted">${(c.weight * c.score * 100).toFixed(1)}</td>
        </tr>
    `).join('');

    const perRepoSorted = ins.perRepo.slice(0).map(r => ({
        ...r,
        repoTechDebt: computeRepoTechDebt(r)
    })).sort((a, b) => b.repoTechDebt.debt100 - a.repoTechDebt.debt100);

    const directChip = (split, total, color, title) => {
        const direct = split?.direct || 0;
        if (!total) return `<span class="text-muted small">0</span>`;
        if (direct === 0) return `<span class="small text-${color}">${total}</span>`;
        return `<span class="small text-${color}">${total}</span> <span class="badge bg-danger ms-1" title="${title}">${direct}D</span>`;
    };

    const repoRowFormatter = (r) => {
        const dc = r.driftCounts;
        const grade = scoreToGrade(r.repoTechDebt.score100);
        return `
            <tr>
                <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
                <td><span class="badge bg-${gradeColor(grade)}">${grade}</span></td>
                <td class="text-end fw-bold">${r.repoTechDebt.score100}</td>
                <td class="text-end text-muted small">${r.depCount.toLocaleString()}</td>
                <td class="text-end">${directChip(r.criticalSplit, r.critical, 'danger', `${r.criticalSplit?.direct || 0} on direct deps`)}</td>
                <td class="text-end">${directChip(r.highSplit, r.high, 'warning', `${r.highSplit?.direct || 0} on direct deps`)}</td>
                <td class="text-end">${directChip(dc.majorSplit, dc.major, 'danger', `${dc.majorSplit?.direct || 0} on direct deps`)}</td>
                <td class="text-end">${directChip(dc.minorSplit, dc.minor, 'warning', `${dc.minorSplit?.direct || 0} on direct deps`)}</td>
                <td class="text-end small text-muted">${escapeHtml(r.activity)}</td>
            </tr>
        `;
    };
    const repoTable = renderExpandableTable({
        rows: perRepoSorted,
        capCount: 50,
        rowFormatter: repoRowFormatter,
        headerHtml: '<thead><tr><th>Repository</th><th>Grade</th><th class="text-end">Score</th><th class="text-end">Deps</th><th class="text-end">Crit</th><th class="text-end">High</th><th class="text-end">Major drift</th><th class="text-end">Minor drift</th><th class="text-end">Activity</th></tr></thead>',
        wrapperStyle: 'max-height: 520px;',
        emptyHtml: '<p class="text-muted small mb-0">No per-repo data. <span class="text-muted">Red "ND" badges count direct-dep findings — those weigh 3× in the score.</span></p>',
        rowsLabel: 'repos'
    });

    return `
        <section class="card mb-4" id="tech-debt-section">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0"><i class="fas fa-award me-2"></i>Tech-Debt composite</h5>
                <button class="btn btn-sm btn-outline-success" id="exportTechDebtCsvBtn">
                    <i class="fas fa-download me-1"></i>Export CSV
                </button>
            </div>
            <div class="card-body">
                <div class="row align-items-center mb-4">
                    <div class="col-md-3 text-center">
                        <div class="display-3 fw-bold text-${gradeColor(td.grade)}">${td.grade}</div>
                        <div class="fs-5">${td.score100} / 100</div>
                        <div class="text-muted small">Health score — higher is healthier</div>
                        <div class="text-muted small mt-1" title="Inverse view used by the per-component contribution column below.">(debt index ${td.debt100}/100)</div>
                    </div>
                    <div class="col-md-9">
                        <h6 class="text-muted text-uppercase small mb-2">Component breakdown</h6>
                        <p class="small text-muted mb-3">Each bar shows what fraction of that component's worst-case debt the portfolio currently carries (0 = perfect, 100 = maximum debt). Bars are tinted from green (healthy) → yellow → red as the debt level rises. The contribution column below each bar's tooltip multiplies the level by the component's weight; summing them yields the overall debt index above. <strong>Note:</strong> findings on direct dependencies (Level 1) count 3× their transitive equivalents inside the drift and vulnerability components — an unfixed direct-dep issue is the strongest "actionable on this team alone" signal.</p>
                        ${componentChartHtml}
                        <div class="table-responsive mt-3">
                            <table class="table table-sm align-middle mb-0">
                                <thead class="small text-muted"><tr><th>Component</th><th class="text-end">Weight</th><th class="text-end">Debt</th><th class="text-end">Contribution</th></tr></thead>
                                <tbody>${compTableRows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <h6 class="text-muted text-uppercase small mb-3">Per-repository tech-debt ranking</h6>
                ${repoTable}
            </div>
        </section>
    `;
}

function buildTechDebtComponentBarConfig(components) {
    const colors = getInsightsThemeColors();
    const colorFor = (score) => score < 0.2
        ? cssColorForBucket('success')
        : (score < 0.5 ? cssColorForBucket('warning') : cssColorForBucket('danger'));
    return {
        type: 'bar',
        data: {
            labels: components.map(c => c.label),
            datasets: [{
                label: 'Debt level',
                data: components.map(c => +(c.score * 100).toFixed(1)),
                backgroundColor: components.map(c => colorFor(c.score)),
                borderWidth: 0
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const c = components[ctx.dataIndex];
                            const debt = (c.score * 100).toFixed(1);
                            const contribution = (c.weight * c.score * 100).toFixed(1);
                            return [
                                `Debt: ${debt}/100`,
                                `Weight: ${(c.weight * 100).toFixed(0)}%`,
                                `Contribution: ${contribution}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Debt level (lower = healthier)', color: colors.text },
                    ticks: { color: colors.textMuted },
                    grid: { color: colors.border }
                },
                y: {
                    ticks: { color: colors.text },
                    grid: { display: false }
                }
            }
        }
    };
}

/**
 * Per-repo composite — direct-weighted edition.
 *
 * Same weights as before, but findings on **direct** dependencies count 3x
 * their transitive equivalents in the drift + vulnerability subcomponents.
 * Same rationale as the org-level `computeTechDebt`:
 *   - direct deps are under the team's immediate control (version pin, swap,
 *     remove). An unfixed direct issue is a stronger "actionable risk" signal.
 *   - transitive deps may legitimately need the parent maintainer to ship
 *     first, so they shouldn't dominate the composite.
 *
 * Falls back to legacy un-split aggregates if the new `*Split` fields are
 * missing — keeps stored analyses with older aggregator output rendering.
 *
 * SBOM quality (formerly weight 0.15, derived from `repo.grade`) is intentionally
 * excluded — the SBOM is usually generated by GitHub and the user has no lever
 * to fix its NTIA / completeness fields. The 0.15 weight is split across drift /
 * vulns / age (the user-actionable signals); `repo.grade` is still surfaced via
 * the Repository Hygiene SBOM-grade donut and the per-repo CSV export.
 */
function computeRepoTechDebt(repo) {
    const dc = repo.driftCounts;
    const majorDirect = dc.majorSplit?.direct || 0;
    const majorTransitive = dc.majorSplit?.transitive || 0;
    const minorDirect = dc.minorSplit?.direct || 0;
    const minorTransitive = dc.minorSplit?.transitive || 0;
    // Weighted (dep, repo) pair counts: each direct hit counts 3x.
    const driftMajorWeighted = (majorDirect * 3) + majorTransitive;
    const driftMinorWeighted = (minorDirect * 3) + minorTransitive;
    const driftPairsTotal = (dc.majorSplit ? (dc.majorSplit.direct + dc.majorSplit.transitive
        + dc.minorSplit.direct + dc.minorSplit.transitive
        + (dc.patchSplit?.direct || 0) + (dc.patchSplit?.transitive || 0)
        + (dc.currentSplit?.direct || 0) + (dc.currentSplit?.transitive || 0)) : dc.withDrift) || 0;
    const driftScore = driftPairsTotal
        ? clamp01((driftMajorWeighted * 3 + driftMinorWeighted) / (driftPairsTotal * 3))
        : 0;

    const critDirect = repo.criticalSplit?.direct || 0;
    const critTransitive = repo.criticalSplit?.transitive || (repo.critical - critDirect);
    const highDirect = repo.highSplit?.direct || 0;
    const highTransitive = repo.highSplit?.transitive || (repo.high - highDirect);
    const medDirect = repo.mediumSplit?.direct || 0;
    const medTransitive = repo.mediumSplit?.transitive || (repo.medium - medDirect);
    const vulnWeighted = (critDirect * 30 + highDirect * 12 + medDirect * 3)
        + (critTransitive * 10 + highTransitive * 4 + medTransitive * 1);
    const vulnScore = repo.depCount ? clamp01(vulnWeighted / Math.max(1, repo.depCount)) : 0;

    const ageWithData = Object.values(repo.ageBuckets).reduce((a, b) => a + b, 0);
    const stale = (repo.ageBuckets['2-3y'] || 0) + (repo.ageBuckets['3-5y'] || 0) + (repo.ageBuckets['>5y'] || 0);
    const ageScore = ageWithData ? clamp01(stale / ageWithData) : 0;
    const hygiene = (() => {
        let v = 0;
        if (repo.archived) v += 0.3;
        if (!repo.hasDependencyGraph) v += 0.5;
        return clamp01(v + (repo.unpinnedActions ? Math.min(0.2, repo.unpinnedActions / 10) : 0));
    })();

    const components = [
        { id: 'drift', weight: 0.30, score: driftScore },
        { id: 'vulns', weight: 0.30, score: vulnScore },
        { id: 'age', weight: 0.20, score: ageScore },
        { id: 'hygiene', weight: 0.20, score: hygiene }
    ];
    const debt = components.reduce((a, c) => a + c.weight * c.score, 0);
    const score100 = Math.round((1 - debt) * 100);
    return { score100, debt100: Math.round(debt * 100), components };
}

// =============================================================================
// HANDLERS / EXPORT
// =============================================================================

function attachInsightsHandlers(orgData) {
    const exportBtn = document.getElementById('exportTechDebtCsvBtn');
    if (exportBtn && !exportBtn.hasAttribute('data-handler-attached')) {
        exportBtn.setAttribute('data-handler-attached', 'true');
        exportBtn.addEventListener('click', () => exportTechDebtCsv(orgData));
    }
}

function exportTechDebtCsv(orgData) {
    const ins = window.__insightsCache;
    if (!ins) return;

    const rows = [['repo', 'grade', 'score', 'deps', 'direct_deps', 'transitive_deps',
                   'critical', 'critical_direct', 'critical_transitive',
                   'high', 'high_direct', 'high_transitive',
                   'medium', 'medium_direct', 'medium_transitive',
                   'low', 'low_direct', 'low_transitive',
                   'major_drift', 'major_drift_direct', 'major_drift_transitive',
                   'minor_drift', 'minor_drift_direct', 'minor_drift_transitive',
                   'patch_drift', 'oldest_months', 'archived',
                   'has_dependency_graph', 'sbom_grade', 'unpinned_actions', 'pushed_at',
                   'primary_language']];

    const sp = (v) => (v && typeof v === 'object') ? v : { direct: 0, transitive: 0 };

    for (const r of ins.perRepo) {
        const td = computeRepoTechDebt(r);
        const grade = scoreToGrade(td.score100);
        const cs = sp(r.criticalSplit);
        const hs = sp(r.highSplit);
        const ms = sp(r.mediumSplit);
        const lws = sp(r.lowSplit);
        const majS = sp(r.driftCounts?.majorSplit);
        const minS = sp(r.driftCounts?.minorSplit);
        rows.push([
            r.repoKey,
            grade,
            td.score100,
            r.depCount,
            r.directDepCountObserved ?? '',
            r.transitiveDepCount ?? '',
            r.critical, cs.direct, cs.transitive,
            r.high, hs.direct, hs.transitive,
            r.medium, ms.direct, ms.transitive,
            r.low, lws.direct, lws.transitive,
            r.driftCounts.major, majS.direct, majS.transitive,
            r.driftCounts.minor, minS.direct, minS.transitive,
            r.driftCounts.patch,
            r.oldest?.months ?? '',
            r.archived ? 'true' : 'false',
            r.hasDependencyGraph ? 'true' : 'false',
            r.grade,
            r.unpinnedActions,
            r.pushedAt || '',
            r.primaryLanguage || ''
        ]);
    }

    const csv = rows.map(r => r.map(cell => {
        const s = String(cell);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');

    const analysisName = orgData?.organization || orgData?.name || 'all-analyses';
    const filename = `sbom-play-tech-debt-${analysisName}-${new Date().toISOString().slice(0, 10)}.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
