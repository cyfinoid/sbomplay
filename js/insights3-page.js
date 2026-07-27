/**
 * Risk Portfolio (insights3-page.js) — domain-segmented risk view.
 * Three columns: Security, Operational, Compliance.
 * Each has a score bar, key stats, and traffic-light badge.
 */
(async function () {
    'use strict';

    const storageManager = window.storageManager || new StorageManager();
    if (!storageManager.initialized) await storageManager.init();

    const esc  = window.escapeHtml || (s => String(s));
    const safe = window.safeSetHTML || ((el, h) => { el.innerHTML = h; });
    const Agg  = window.InsightsAggregator;

    const selector = document.getElementById('analysisSelector');
    const content  = document.getElementById('content');
    const loading  = document.getElementById('loading');
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
            console.error('Portfolio: load failed', err);
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

        renderPortfolio(Agg.buildInsights(data.data));
        loading.classList.add('d-none');
        content.classList.remove('d-none');
    }

    selector.addEventListener('change', loadAnalysis);
    await loadAnalysesList();

    /* ------------------------------------------------------------------ */
    /*  Helpers                                                            */
    /* ------------------------------------------------------------------ */
    function badge(val, good, warn) {
        if (val <= good) return '<span class="rpf-badge good"><i class="fas fa-check-circle me-1"></i>Good</span>';
        if (val <= warn) return '<span class="rpf-badge warn"><i class="fas fa-exclamation-circle me-1"></i>Moderate</span>';
        return '<span class="rpf-badge bad"><i class="fas fa-times-circle me-1"></i>Needs Attention</span>';
    }

    function scoreBar(pct, color) {
        return `<div class="rpf-scorebar-wrap">
            <div class="rpf-scorebar"><div class="fill" style="width:${Math.min(pct,100)}%;background:${color};"></div></div>
            <div class="rpf-scorebar-label"><span>0</span><span>${pct}/100</span></div>
        </div>`;
    }

    function statRow(label, value, colorClass) {
        return `<div class="rpf-stat"><span class="label">${esc(label)}</span><span class="value ${colorClass || ''}">${value}</span></div>`;
    }

    /* ------------------------------------------------------------------ */
    /*  Render                                                             */
    /* ------------------------------------------------------------------ */
    function renderPortfolio(ins) {
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

        let secHtml = `
            <div class="rpf-domain">
                <h3><i class="fas fa-shield-alt" style="color:var(--color-red);"></i>Security Posture</h3>
                ${scoreBar(secScore, secColor)}
                ${statRow('Crit + High Vulns', ch.total, ch.total > 0 ? 'text-danger fw-bold' : '')}
                ${statRow('CVE Dwell (median)', dwell !== null ? dwell + ' days' : '--')}
                ${statRow('Malware Advisories', sc.malwareCount, sc.malwareCount > 0 ? 'text-danger fw-bold' : '')}
                ${statRow('Dep Confusion Risks', sc.depConfusionCount, sc.depConfusionCount > 0 ? 'text-warning' : '')}
                <div class="mt-3 text-end">${badge(100 - secScore, 30, 55)}</div>
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

        let opHtml = `
            <div class="rpf-domain">
                <h3><i class="fas fa-tools" style="color:var(--color-blue);"></i>Operational Health</h3>
                ${scoreBar(opScoreClamped, opColor)}
                ${statRow('Repositories Analyzed', ins.totalRepos)}
                ${statRow('With SBOM', ins.reposWithSbom)}
                ${statRow('EOL Components', eol.eolCount, eol.eolCount > 0 ? 'text-danger fw-bold' : '')}
                ${statRow('Major Drift', drift.buckets.major.total, drift.buckets.major.total > 0 ? 'text-warning' : '')}
                ${statRow('Repos Inactive >1yr', staleRepos, staleRepos > 0 ? 'text-warning' : '')}
                <div class="mt-3 text-end">${badge(100 - opScoreClamped, 30, 55)}</div>
            </div>`;

        /* ---- Compliance domain ---- */
        const compScore = Math.max(0, 100 - (lic.highRisk * 8) - (sc.unpinnedActions * 2));
        const compColor = compScore >= 70 ? 'var(--color-green)' : compScore >= 45 ? 'var(--color-yellow)' : 'var(--color-red)';

        let compHtml = `
            <div class="rpf-domain">
                <h3><i class="fas fa-gavel" style="color:var(--color-yellow);"></i>License &amp; Compliance</h3>
                ${scoreBar(compScore, compColor)}
                ${statRow('High-Risk Licenses', lic.highRisk, lic.highRisk > 0 ? 'text-warning fw-bold' : '')}
                ${statRow('Copyleft (direct)', lic.copyleft.direct, lic.copyleft.direct > 0 ? 'text-warning' : '')}
                ${statRow('Copyleft (transitive)', lic.copyleft.transitive)}
                ${statRow('Unknown Licenses', lic.unknown.total, lic.unknown.total > 0 ? 'text-muted' : '')}
                ${statRow('Unpinned GH Actions', sc.unpinnedActions, sc.unpinnedActions > 0 ? 'text-warning' : '')}
                <div class="mt-3 text-end">${badge(100 - compScore, 30, 55)}</div>
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

        safe(content, `
            <div class="rpf-header">
                <div class="rpf-overall">
                    <div class="grade" style="color:var(--color-${td.gradeColorClass});">${td.grade}</div>
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
        `);
    }

})();
