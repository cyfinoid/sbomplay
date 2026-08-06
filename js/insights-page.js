/**
 * Insights Page — bootstrap + 10 section renderers.
 * Depends on: InsightsAggregator (insights-aggregator.js), StorageManager,
 *             Chart.js (loaded from CDN), common.js (escapeHtml, safeSetHTML)
 */

(async function () {
    'use strict';

    const storageManager = window.storageManager || new StorageManager();

    if (!storageManager.initialized) await storageManager.init();

    const esc = window.escapeHtml || (s => String(s));
    const safe = window.safeSetHTML || ((el, html) => { el.innerHTML = html; });

    // -----------------------------------------------------------------------
    // Shared tooltip
    // -----------------------------------------------------------------------
    let tooltip = document.querySelector('.insights-mini-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'insights-mini-tooltip';
        document.body.appendChild(tooltip);
    }

    function showTip(e, html) {
        safe(tooltip, html);
        tooltip.classList.add('show');
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY - 28) + 'px';
    }
    function hideTip() { tooltip.classList.remove('show'); }

    // -----------------------------------------------------------------------
    // Chart.js theme helper
    // -----------------------------------------------------------------------
    function chartColors() {
        const cs = getComputedStyle(document.documentElement);
        return {
            text: cs.getPropertyValue('--chart-text-color').trim() || '#c9d1d9',
            grid: cs.getPropertyValue('--chart-grid-color').trim() || 'rgba(255,255,255,0.08)'
        };
    }

    function commonScaleOpts(tc) {
        return {
            ticks: { color: tc.text, font: { size: 11 } },
            grid: { color: tc.grid }
        };
    }

    const chartInstances = [];
    function destroyCharts() {
        while (chartInstances.length) chartInstances.pop().destroy();
    }

    // -----------------------------------------------------------------------
    // Analysis selector (same pattern as deps-page.js)
    // -----------------------------------------------------------------------
    const selector = document.getElementById('analysisSelector');
    const content  = document.getElementById('insights-page-content');
    const loading  = document.getElementById('loadingOverlay');
    const noData   = document.getElementById('noDataMessage');

    async function loadAnalysesList() {
        try {
            const info = await storageManager.getStorageInfo();
            const all = [...info.organizations, ...info.repositories]
                .filter(e => e.name !== '__ALL__' && e.dependencies > 0);

            selector.innerHTML = '';
            if (all.length === 0) {
                noData.classList.remove('d-none');
                selector.disabled = true;
                return;
            }

            const opt = document.createElement('option');
            opt.value = '';
            const totalDeps = all.reduce((s, e) => s + (e.dependencies || 0), 0);
            opt.textContent = `All Analyses (${totalDeps} deps)`;
            selector.appendChild(opt);

            for (const e of all) {
                const o = document.createElement('option');
                o.value = e.name;
                o.textContent = `${e.name} (${e.dependencies || 0} deps)`;
                selector.appendChild(o);
            }

            selector.disabled = false;
            await loadAnalysis();
        } catch (err) {
            console.error('Insights: failed to load analyses list', err);
            selector.disabled = true;
            noData.classList.remove('d-none');
        }
    }

    async function loadAnalysis() {
        loading.classList.remove('d-none');
        content.classList.add('d-none');
        noData.classList.add('d-none');

        const name = selector.value;
        let data;
        if (!name || name === '') {
            data = await storageManager.getCombinedData();
        } else {
            data = await storageManager.loadAnalysisDataForOrganization(name);
        }

        if (!data || !data.data) {
            loading.classList.add('d-none');
            noData.classList.remove('d-none');
            return;
        }

        destroyCharts();
        renderInsights(data.data);
        loading.classList.add('d-none');
        content.classList.remove('d-none');
    }

    selector.addEventListener('change', () => loadAnalysis());
    await loadAnalysesList();

    // -----------------------------------------------------------------------
    // Master render
    // -----------------------------------------------------------------------
    function renderInsights(raw) {
        const ins = window.InsightsAggregator.buildInsights(raw);

        const linkMap = {
            repos: 'repos.html',
            deps: 'deps.html',
            vulnsCH: 'vuln.html',
            directDwell: '#section-vulnAge',
            eol: '#section-eol',
            licenses: 'licenses.html',
            drift: '#section-drift',
            techDebt: '#section-techDebt'
        };

        const sections = [
            renderCoverageBanner(ins, raw),
            renderRiskPortfolio(ins),
            window.InsightsAggregator.renderKpiStrip(ins, { linkMap }),
            renderLanguageStack(ins),
            renderAgeSection(ins),
            renderDriftSection(ins),
            renderDepthSection(ins),
            renderVulnAgeSection(ins),
            renderRepoHygiene(ins),
            renderSupplyChain(ins),
            renderTechDebt(ins)
        ];

        safe(content, sections.join(''));
        mountCharts(ins);
        wireExpandToggles();
    }

    // -----------------------------------------------------------------------
    // 0. Risk Portfolio — overall Tech-Health score + risk-domain cards
    //    (Security / Operational / Compliance). Shown at the top.
    // -----------------------------------------------------------------------
    function rpfBadge(val, good, warn) {
        if (val <= good) return '<span class="rpf-badge good"><i class="fas fa-check-circle me-1"></i>Good</span>';
        if (val <= warn) return '<span class="rpf-badge warn"><i class="fas fa-exclamation-circle me-1"></i>Moderate</span>';
        return '<span class="rpf-badge bad"><i class="fas fa-times-circle me-1"></i>Needs Attention</span>';
    }

    function rpfScoreBar(pct, color) {
        return `<div class="rpf-scorebar-wrap">
            <div class="rpf-scorebar"><div class="fill" style="width:${Math.min(pct, 100)}%;background:${color};"></div></div>
            <div class="rpf-scorebar-label"><span>0</span><span>${pct}/100</span></div>
        </div>`;
    }

    function rpfStatRow(label, value, colorClass) {
        return `<div class="rpf-stat"><span class="label">${esc(label)}</span><span class="value ${colorClass || ''}">${value}</span></div>`;
    }

    function renderRiskPortfolio(ins) {
        const td    = ins.techDebt;
        const ch    = ins.critHigh;
        const drift = ins.driftStats;
        const eol   = ins.eolStats;
        const lic   = ins.licenseStats;
        const sc    = ins.supplyChain;
        const dwell = ins.vulnAgeStats.directDwellMedian;
        const hyg   = ins.repoHygiene;

        /* ---- Security domain ---- */
        const secScore = Math.max(0, 100 -
            (ch.critical * 20 + ch.high * 8 +
             (sc.malwareCount * 25) +
             (dwell !== null && dwell > 90 ? 15 : dwell !== null && dwell > 30 ? 8 : 0)));
        const secColor = secScore >= 70 ? 'var(--color-green)' : secScore >= 45 ? 'var(--color-yellow)' : 'var(--color-red)';

        const secHtml = `
            <div class="rpf-domain">
                <h3><i class="fas fa-shield-alt" style="color:var(--color-red);"></i>Security Posture</h3>
                ${rpfScoreBar(secScore, secColor)}
                ${rpfStatRow('Crit + High Vulns', ch.total, ch.total > 0 ? 'text-danger fw-bold' : '')}
                ${rpfStatRow('CVE Dwell (median)', dwell !== null ? dwell + ' days' : '--')}
                ${rpfStatRow('Malware Advisories', sc.malwareCount, sc.malwareCount > 0 ? 'text-danger fw-bold' : '')}
                ${rpfStatRow('Dep Confusion Risks', sc.depConfusionCount, sc.depConfusionCount > 0 ? 'text-warning' : '')}
                <div class="mt-3 text-end">${rpfBadge(100 - secScore, 30, 55)}</div>
            </div>`;

        /* ---- Operational domain ---- */
        const staleRepos = hyg.activityBuckets['> 1 year'] || 0;
        const opScore = Math.max(0, 100 -
            (eol.eolCount * 3) +
            (drift.buckets.major.total * 2) +
            (staleRepos * 5) +
            (hyg.noSbom * 3));
        const opScoreClamped = Math.max(0, Math.min(100, opScore));
        const opColor = opScoreClamped >= 70 ? 'var(--color-green)' : opScoreClamped >= 45 ? 'var(--color-yellow)' : 'var(--color-red)';

        const opHtml = `
            <div class="rpf-domain">
                <h3><i class="fas fa-tools" style="color:var(--color-blue);"></i>Operational Health</h3>
                ${rpfScoreBar(opScoreClamped, opColor)}
                ${rpfStatRow('Repositories Analyzed', ins.totalRepos)}
                ${rpfStatRow('With SBOM', ins.reposWithSbom)}
                ${rpfStatRow('EOL Components', eol.eolCount, eol.eolCount > 0 ? 'text-danger fw-bold' : '')}
                ${rpfStatRow('Major Drift', drift.buckets.major.total, drift.buckets.major.total > 0 ? 'text-warning' : '')}
                ${rpfStatRow('Repos Inactive >1yr', staleRepos, staleRepos > 0 ? 'text-warning' : '')}
                <div class="mt-3 text-end">${rpfBadge(100 - opScoreClamped, 30, 55)}</div>
            </div>`;

        /* ---- Compliance domain ---- */
        const compScore = Math.max(0, 100 - (lic.highRisk * 8) - (sc.unpinnedActions * 2));
        const compColor = compScore >= 70 ? 'var(--color-green)' : compScore >= 45 ? 'var(--color-yellow)' : 'var(--color-red)';

        const compHtml = `
            <div class="rpf-domain">
                <h3><i class="fas fa-gavel" style="color:var(--color-yellow);"></i>License &amp; Compliance</h3>
                ${rpfScoreBar(compScore, compColor)}
                ${rpfStatRow('High-Risk Licenses', lic.highRisk, lic.highRisk > 0 ? 'text-warning fw-bold' : '')}
                ${rpfStatRow('Copyleft (direct)', lic.copyleft.direct, lic.copyleft.direct > 0 ? 'text-warning' : '')}
                ${rpfStatRow('Copyleft (transitive)', lic.copyleft.transitive)}
                ${rpfStatRow('Unknown Licenses', lic.unknown.total, lic.unknown.total > 0 ? 'text-muted' : '')}
                ${rpfStatRow('Unpinned GH Actions', sc.unpinnedActions, sc.unpinnedActions > 0 ? 'text-warning' : '')}
                <div class="mt-3 text-end">${rpfBadge(100 - compScore, 30, 55)}</div>
            </div>`;

        /* ---- Overall verdict ---- */
        const overallScore = td.score100;
        const verdictClass = overallScore >= 75 ? 'text-success' : overallScore >= 55 ? 'text-warning' : 'text-danger';
        const verdictText  = overallScore >= 75 ? 'Low risk profile — standard monitoring advised.'
                           : overallScore >= 55 ? 'Moderate risk — review flagged items and set remediation plan.'
                           : 'Elevated risk — active remediation recommended before proceeding.';

        const legendHtml = `<div class="rpf-legend">
            <span><i class="fas fa-circle text-success"></i> Good</span>
            <span><i class="fas fa-circle text-warning"></i> Moderate</span>
            <span><i class="fas fa-circle text-danger"></i> Needs Attention</span>
        </div>`;

        const verdictHtml = `<div class="rpf-verdict">
            <div class="text ${verdictClass}"><i class="fas fa-${overallScore >= 75 ? 'check-circle' : overallScore >= 55 ? 'exclamation-circle' : 'times-circle'} me-2"></i>${esc(verdictText)}</div>
            <div class="sub">Tech-Health Score ${overallScore}/100 (Grade ${td.grade})</div>
        </div>`;

        return `<div class="mb-4">
            <div class="rpf-header">
                <div class="rpf-overall">
                    <div class="grade text-${td.gradeColorClass}">${td.grade}</div>
                    <div class="score">Tech-Health<strong>${td.score100}/100</strong></div>
                </div>
            </div>
            ${legendHtml}
            <div class="row g-4">
                <div class="col-md-4">${secHtml}</div>
                <div class="col-md-4">${opHtml}</div>
                <div class="col-md-4">${compHtml}</div>
            </div>
            ${verdictHtml}
        </div>`;
    }

    // -----------------------------------------------------------------------
    // 1. Coverage banner
    // -----------------------------------------------------------------------
    function renderCoverageBanner(ins, raw) {
        const ageCov = ins.ageStats.coveragePct;
        const driftCov = ins.driftStats.coveragePct;
        const showBanner = ageCov < 50 || driftCov < 50;
        if (!showBanner) return '';
        return `<div class="alert alert-warning mb-3">
            <i class="fas fa-exclamation-triangle me-2"></i>
            <strong>Partial enrichment:</strong> Age coverage ${ageCov}%, drift coverage ${driftCov}%.
            Metrics may be incomplete. Re-run analysis to improve coverage.
        </div>`;
    }

    // -----------------------------------------------------------------------
    // 3. Language & ecosystem stack
    // -----------------------------------------------------------------------
    function renderLanguageStack(ins) {
        const langs = ins.languageStats.slice(0, 15);
        if (langs.length === 0) return '';
        const rows = langs.map(l =>
            `<tr><td>${esc(l.language)}</td><td class="text-end">${l.count}</td><td class="text-end">${l.uniqueDependencies || '--'}</td></tr>`
        ).join('');
        return sectionCard('language-stack', 'Language & Ecosystem Stack', 'fas fa-code', `
            <div class="insights-chart-wrap"><canvas id="chart-language"></canvas></div>
            <div class="insights-scroll-container mt-3">
                <table class="table table-sm table-striped mb-0">
                    <thead><tr><th>Language</th><th class="text-end">Refs</th><th class="text-end">Unique Deps</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`);
    }

    // -----------------------------------------------------------------------
    // 4. Package age
    // -----------------------------------------------------------------------
    function renderAgeSection(ins) {
        const a = ins.ageStats;
        const eolRows = a.probableEolList.slice(0, 25).map(e =>
            `<tr>
                <td>${esc(e.name)}</td>
                <td>${esc(e.version)}</td>
                <td class="text-end">${e.months} mo</td>
                <td>${esc(e.reason)}</td>
                <td><span class="badge bg-${e.isDirect ? 'primary' : 'secondary'}">${e.isDirect ? 'Direct' : 'Transitive'}</span></td>
            </tr>`
        ).join('');
        const eolTable = eolRows ? `
            <h6 class="mt-4">Probable EOL Packages (${a.probableEolList.length})</h6>
            <div class="insights-scroll-container">
                <table class="table table-sm table-striped mb-0">
                    <thead><tr><th>Package</th><th>Version</th><th class="text-end">Age</th><th>Reason</th><th>Reach</th></tr></thead>
                    <tbody>${eolRows}</tbody>
                </table>
            </div>
            ${expandToggle(a.probableEolList.length, 25)}` : '';

        return sectionCard('age', 'Package Age Distribution', 'fas fa-clock', `
            <p class="text-muted small">Coverage: ${a.coveragePct}% of ${a.total} dependencies</p>
            <div class="insights-chart-wrap"><canvas id="chart-age"></canvas></div>
            ${eolTable}`);
    }

    // -----------------------------------------------------------------------
    // 5. Version drift
    // -----------------------------------------------------------------------
    function renderDriftSection(ins) {
        const d = ins.driftStats;
        const rows = d.lagging.slice(0, 30).map(l =>
            `<tr>
                <td>${esc(l.name)}</td>
                <td>${esc(l.version)}</td>
                <td>${esc(l.latest)}</td>
                <td><span class="badge bg-${l.type === 'major' ? 'danger' : 'warning'}">${l.type}</span></td>
                <td><span class="badge bg-${l.isDirect ? 'primary' : 'secondary'}">${l.isDirect ? 'Direct' : 'Transitive'}</span></td>
            </tr>`
        ).join('');
        return sectionCard('drift', 'Version Drift', 'fas fa-code-branch', `
            <p class="text-muted small">Coverage: ${d.coveragePct}% of ${d.total} dependencies</p>
            <div class="insights-chart-wrap"><canvas id="chart-drift"></canvas></div>
            ${rows ? `
            <h6 class="mt-4">Lagging Dependencies (${d.lagging.length})</h6>
            <div class="insights-scroll-container">
                <table class="table table-sm table-striped mb-0">
                    <thead><tr><th>Package</th><th>Current</th><th>Latest</th><th>Type</th><th>Reach</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${expandToggle(d.lagging.length, 30)}` : ''}`);
    }

    // -----------------------------------------------------------------------
    // 6. Dependency depth
    // -----------------------------------------------------------------------
    function renderDepthSection(ins) {
        const dd = ins.depthStats;
        if (dd.distribution.length === 0) return '';
        return sectionCard('depth', 'Dependency Depth Distribution', 'fas fa-layer-group', `
            <p class="text-muted small">Max depth: ${dd.maxDepth} | Direct/transitive split: ${ins.directCount} / ${ins.transitiveCount}</p>
            <div class="insights-chart-wrap"><canvas id="chart-depth"></canvas></div>`);
    }

    // -----------------------------------------------------------------------
    // 7. Vulnerability age
    // -----------------------------------------------------------------------
    function renderVulnAgeSection(ins) {
        const v = ins.vulnAgeStats;
        const bombs = v.timeBombs.slice(0, 25);
        const bombRows = bombs.map(b =>
            `<tr class="${b.severity === 'CRITICAL' ? 'table-danger' : ''}">
                <td>${esc(b.name)}</td>
                <td>${esc(b.version)}</td>
                <td>${esc(b.vulnId)}</td>
                <td><span class="badge bg-${b.severity === 'CRITICAL' ? 'danger' : 'warning'}">${b.severity}</span></td>
                <td class="text-end">${b.ageDays}d</td>
                <td><span class="badge bg-${b.isDirect ? 'primary' : 'secondary'}">${b.reach}</span></td>
            </tr>`
        ).join('');
        const dwellHtml = v.directDwellMedian !== null
            ? `<div class="alert alert-info small py-2 mt-3"><i class="fas fa-bullseye me-2"></i>Direct-dep CVE dwell time (median): <strong>${v.directDwellMedian} days</strong> across ${v.directDwellCount} direct vulnerabilities</div>`
            : '';
        return sectionCard('vulnAge', 'Vulnerability Age Analysis', 'fas fa-shield-alt', `
            <div class="insights-chart-wrap"><canvas id="chart-vulnAge"></canvas></div>
            ${dwellHtml}
            ${bombRows ? `
            <h6 class="mt-4">Time Bombs — C/H vulns open &gt; 30 days (${v.timeBombs.length})</h6>
            <div class="insights-scroll-container">
                <table class="table table-sm table-striped mb-0">
                    <thead><tr><th>Package</th><th>Version</th><th>Vuln ID</th><th>Severity</th><th class="text-end">Age</th><th>Reach</th></tr></thead>
                    <tbody>${bombRows}</tbody>
                </table>
            </div>
            ${expandToggle(v.timeBombs.length, 25)}` : '<p class="text-muted small mt-3">No critical or high vulnerabilities older than 30 days.</p>'}`);
    }

    // -----------------------------------------------------------------------
    // 8. Repository hygiene
    // -----------------------------------------------------------------------
    function renderRepoHygiene(ins) {
        const h = ins.repoHygiene;
        const actRows = Object.entries(h.activityBuckets)
            .filter(([, v]) => v > 0)
            .map(([label, count]) => `<tr><td>${esc(label)}</td><td class="text-end">${count}</td></tr>`)
            .join('');
        return sectionCard('hygiene', 'Repository Hygiene', 'fas fa-heartbeat', `
            <div class="row">
                <div class="col-md-6">
                    <h6>SBOM Quality Grade</h6>
                    <div class="insights-chart-wrap"><canvas id="chart-sbomGrade"></canvas></div>
                    <p class="text-muted small mt-2">
                        No SBOM: ${h.noSbom} | Archived: ${h.archived}
                    </p>
                </div>
                <div class="col-md-6">
                    <h6>Push Activity (pushedAt)</h6>
                    ${actRows ? `<table class="table table-sm table-striped mb-0">
                        <thead><tr><th>Period</th><th class="text-end">Repos</th></tr></thead>
                        <tbody>${actRows}</tbody>
                    </table>` : '<p class="text-muted small">No pushedAt data available.</p>'}
                </div>
            </div>`);
    }

    // -----------------------------------------------------------------------
    // 9. Supply-chain & M&A red flags
    // -----------------------------------------------------------------------
    function renderSupplyChain(ins) {
        const sc = ins.supplyChain;
        const eol = ins.eolStats;
        const items = [
            flagItem('Malware advisories', sc.malwareCount, 'danger'),
            flagItem('Dependency confusion risks', sc.depConfusionCount, 'danger'),
            flagItem('Unpinned GitHub Actions', sc.unpinnedActions, 'warning'),
            flagItem('EOL components', eol.eolCount, 'danger'),
            flagItem('Dead source repos', sc.deadRepos, 'warning')
        ];
        return sectionCard('supplyChain', 'Supply-Chain & M&A Red Flags', 'fas fa-exclamation-circle', `
            <div class="row row-cols-1 row-cols-md-3 g-3">${items.join('')}</div>`);
    }

    function flagItem(label, count, severity) {
        const color = count > 0 ? severity : 'success';
        const icon = count > 0 ? 'fas fa-times-circle' : 'fas fa-check-circle';
        return `<div class="col">
            <div class="card border-${color} h-100">
                <div class="card-body text-center py-3">
                    <div class="fs-3 text-${color}"><i class="${icon}"></i></div>
                    <div class="fs-4 fw-bold">${count}</div>
                    <div class="small text-muted">${label}</div>
                </div>
            </div>
        </div>`;
    }

    // -----------------------------------------------------------------------
    // 10. Tech-Debt composite
    // -----------------------------------------------------------------------
    function renderTechDebt(ins) {
        const td = ins.techDebt;
        const componentBars = Object.entries(td.components).map(([key, c]) => {
            const label = { drift: 'Version Drift', vulns: 'Vulnerabilities', age: 'Package Age', license: 'Licenses', eol: 'EOL Risk', hygiene: 'Repo Hygiene' }[key] || key;
            const barColor = c.debt > 60 ? 'bg-danger' : c.debt > 30 ? 'bg-warning' : 'bg-success';
            return `<div class="mb-2">
                <div class="d-flex justify-content-between small">
                    <span>${label} <span class="text-muted">(${Math.round(c.weight * 100)}%)</span></span>
                    <span>debt ${c.debt}%</span>
                </div>
                <div class="progress" style="height: 18px;">
                    <div class="progress-bar ${barColor} insights-component-bar" role="progressbar" style="width: ${c.debt}%"></div>
                </div>
            </div>`;
        }).join('');

        const repoRows = ins.perRepo.slice(0, 30).map(r => {
            const totalVuln = r.critDirect + r.highDirect + r.critTransitive + r.highTransitive;
            return `<tr>
                <td>${esc(r.repoKey)}${r.archived ? ' <span class="badge bg-secondary">archived</span>' : ''}</td>
                <td class="text-end">${r.directCount}</td>
                <td class="text-end">${r.transitiveCount}</td>
                <td class="text-end">${totalVuln > 0 ? `<span class="text-danger fw-bold">${totalVuln}</span>` : '0'}</td>
                <td class="text-end">${r.majorDriftDirect + r.majorDriftTransitive}</td>
                <td>${r.grade ? `<span class="badge bg-${window.InsightsAggregator.gradeColor(r.grade)}">${r.grade}</span>` : '--'}</td>
            </tr>`;
        }).join('');

        const exportBtn = `<button class="btn btn-outline-secondary btn-sm mt-2" id="btn-export-perrepo">
            <i class="fas fa-download me-1"></i>Export CSV
        </button>`;

        return sectionCard('techDebt', 'Tech-Debt Composite', 'fas fa-balance-scale', `
            <div class="row mb-4">
                <div class="col-md-4 text-center">
                    <div class="display-1 fw-bold text-${td.gradeColorClass}">${td.grade}</div>
                    <div class="text-muted">health score ${td.score100}/100 &mdash; higher is healthier</div>
                </div>
                <div class="col-md-8">
                    <h6>Component Breakdown</h6>
                    ${componentBars}
                </div>
            </div>
            <h6>Per-Repository Breakdown (${ins.perRepo.length})</h6>
            <div class="insights-scroll-container">
                <table class="table table-sm table-striped mb-0" id="table-perrepo">
                    <thead><tr>
                        <th>Repository</th><th class="text-end">Direct</th><th class="text-end">Transitive</th>
                        <th class="text-end">C+H Vulns</th><th class="text-end">Major Drift</th><th>SBOM Grade</th>
                    </tr></thead>
                    <tbody>${repoRows}</tbody>
                </table>
            </div>
            ${expandToggle(ins.perRepo.length, 30)}
            ${exportBtn}`);
    }

    // -----------------------------------------------------------------------
    // Helpers: card wrapper, expand toggle
    // -----------------------------------------------------------------------
    function sectionCard(id, title, icon, body) {
        return `<div class="card mb-4" id="section-${id}">
            <div class="card-header"><h5 class="mb-0"><i class="${icon} me-2"></i>${title}</h5></div>
            <div class="card-body">${body}</div>
        </div>`;
    }

    function expandToggle(total, shown) {
        if (total <= shown) return '';
        return `<button class="btn btn-link btn-sm insights-expand-toggle p-0 mt-1" data-expanded="false">
            Show all ${total} rows <i class="fas fa-chevron-down ms-1"></i>
        </button>`;
    }

    function wireExpandToggles() {
        content.querySelectorAll('.insights-expand-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const container = btn.previousElementSibling;
                if (!container) return;
                const scrollWrap = container.classList.contains('insights-scroll-container')
                    ? container
                    : container.querySelector('.insights-scroll-container');
                if (!scrollWrap) return;
                const expanded = btn.dataset.expanded === 'true';
                scrollWrap.classList.toggle('expanded', !expanded);
                btn.dataset.expanded = String(!expanded);
                btn.innerHTML = expanded
                    ? `Show all rows <i class="fas fa-chevron-down ms-1"></i>`
                    : `Collapse <i class="fas fa-chevron-up ms-1"></i>`;
            });
        });

        const exportBtn = document.getElementById('btn-export-perrepo');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportPerRepoCSV);
        }
    }

    // -----------------------------------------------------------------------
    // Mount Chart.js charts
    // -----------------------------------------------------------------------
    function mountCharts(ins) {
        const tc = chartColors();
        mountLanguageChart(ins, tc);
        mountAgeChart(ins, tc);
        mountDriftChart(ins, tc);
        mountDepthChart(ins, tc);
        mountVulnAgeChart(ins, tc);
        mountSbomGradeChart(ins, tc);
    }

    function mountLanguageChart(ins, tc) {
        const el = document.getElementById('chart-language');
        if (!el || ins.languageStats.length === 0) return;
        const top = ins.languageStats.slice(0, 10);
        const ch = new Chart(el, {
            type: 'bar',
            data: {
                labels: top.map(l => l.language),
                datasets: [{ label: 'References', data: top.map(l => l.count), backgroundColor: 'rgba(70,111,224,0.7)' }]
            },
            options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: commonScaleOpts(tc), y: commonScaleOpts(tc) } }
        });
        chartInstances.push(ch);
    }

    function mountAgeChart(ins, tc) {
        const el = document.getElementById('chart-age');
        if (!el) return;
        const a = ins.ageStats;
        const ch = new Chart(el, {
            type: 'bar',
            data: {
                labels: a.buckets.map(b => b.label),
                datasets: [
                    { label: 'Direct', data: a.buckets.map(b => b.split.direct), backgroundColor: 'rgba(70,111,224,0.8)' },
                    { label: 'Transitive', data: a.buckets.map(b => b.split.transitive), backgroundColor: 'rgba(70,111,224,0.3)' }
                ]
            },
            options: { responsive: true, plugins: { legend: { labels: { color: tc.text } } }, scales: { x: commonScaleOpts(tc), y: { ...commonScaleOpts(tc), stacked: true } }, datasets: { bar: { barPercentage: 0.8 } } }
        });
        chartInstances.push(ch);
    }

    function mountDriftChart(ins, tc) {
        const el = document.getElementById('chart-drift');
        if (!el) return;
        const d = ins.driftStats;
        const labels = ['Major', 'Minor', 'Current'];
        const ch = new Chart(el, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Direct', data: [d.buckets.major.split.direct, d.buckets.minor.split.direct, d.buckets.current.split.direct], backgroundColor: ['rgba(214,60,83,0.8)', 'rgba(253,203,82,0.8)', 'rgba(80,200,120,0.8)'] },
                    { label: 'Transitive', data: [d.buckets.major.split.transitive, d.buckets.minor.split.transitive, d.buckets.current.split.transitive], backgroundColor: ['rgba(214,60,83,0.3)', 'rgba(253,203,82,0.3)', 'rgba(80,200,120,0.3)'] }
                ]
            },
            options: { responsive: true, plugins: { legend: { labels: { color: tc.text } } }, scales: { x: commonScaleOpts(tc), y: commonScaleOpts(tc) } }
        });
        chartInstances.push(ch);
    }

    function mountDepthChart(ins, tc) {
        const el = document.getElementById('chart-depth');
        if (!el || ins.depthStats.distribution.length === 0) return;
        const dd = ins.depthStats;
        const ch = new Chart(el, {
            type: 'bar',
            data: {
                labels: dd.distribution.map(d => `Level ${d.depth}`),
                datasets: [{ label: 'Dependencies', data: dd.distribution.map(d => d.count), backgroundColor: 'rgba(70,111,224,0.7)' }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: commonScaleOpts(tc), y: commonScaleOpts(tc) } }
        });
        chartInstances.push(ch);
    }

    function mountVulnAgeChart(ins, tc) {
        const el = document.getElementById('chart-vulnAge');
        if (!el) return;
        const v = ins.vulnAgeStats;
        const sevColors = { CRITICAL: 'rgba(214,60,83,0.85)', HIGH: 'rgba(253,140,0,0.85)', MEDIUM: 'rgba(253,203,82,0.85)', LOW: 'rgba(70,111,224,0.5)' };
        const datasets = Object.entries(v.crosstab).map(([sev, buckets]) => ({
            label: sev,
            data: buckets.map(b => b.total),
            backgroundColor: sevColors[sev] || 'rgba(128,128,128,0.5)'
        }));
        const ch = new Chart(el, {
            type: 'bar',
            data: { labels: v.ageBuckets, datasets },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: tc.text } } },
                scales: { x: { ...commonScaleOpts(tc), stacked: true }, y: { ...commonScaleOpts(tc), stacked: true } }
            }
        });
        chartInstances.push(ch);
    }

    function mountSbomGradeChart(ins, tc) {
        const el = document.getElementById('chart-sbomGrade');
        if (!el) return;
        const gd = ins.repoHygiene.gradeDistribution;
        const labels = ['A', 'B', 'C', 'D', 'F'];
        const colors = ['#198754', '#0dcaf0', '#ffc107', '#fd7e14', '#dc3545'];
        const data = labels.map(g => gd[g] || 0);
        if (data.every(d => d === 0)) return;
        const ch = new Chart(el, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors }] },
            options: { responsive: true, plugins: { legend: { labels: { color: tc.text }, position: 'right' } } }
        });
        chartInstances.push(ch);
    }

    // -----------------------------------------------------------------------
    // CSV export for per-repo table
    // -----------------------------------------------------------------------
    function exportPerRepoCSV() {
        const table = document.getElementById('table-perrepo');
        if (!table) return;
        const rows = [];
        const headers = ['repository', 'direct_deps', 'transitive_deps', 'critical_high_vulns', 'major_drift', 'sbom_grade'];
        rows.push(headers.join(','));
        table.querySelectorAll('tbody tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td')).map(td => `"${td.textContent.trim().replace(/"/g, '""')}"`);
            rows.push(cells.join(','));
        });
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sbomplay-insights-repos-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

})();
