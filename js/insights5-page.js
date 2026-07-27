/**
 * Snapshot (insights5-page.js) — single-viewport executive summary.
 * One glance, everything fits on screen. 6 metric tiles + verdict + concerns.
 * The most minimal of the four variants.
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
            console.error('Snapshot: load failed', err);
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

        renderSnapshot(Agg.buildInsights(data.data));
        loading.classList.add('d-none');
        content.classList.remove('d-none');
    }

    selector.addEventListener('change', loadAnalysis);
    await loadAnalysesList();

    /* ------------------------------------------------------------------ */
    /*  Render                                                             */
    /* ------------------------------------------------------------------ */
    function renderSnapshot(ins) {
        const td    = ins.techDebt;
        const ch    = ins.critHigh;
        const drift = ins.driftStats;
        const eol   = ins.eolStats;
        const lic   = ins.licenseStats;
        const sc    = ins.supplyChain;
        const hyg   = ins.repoHygiene;
        const dwell = ins.vulnAgeStats.directDwellMedian;

        /* ---- Verdict line ---- */
        const verdictColor = td.score100 >= 75 ? 'success'
                           : td.score100 >= 55 ? 'warning'
                           : 'danger';
        const verdictText  = td.score100 >= 75 ? 'Org is in good shape'
                           : td.score100 >= 55 ? 'Moderate concerns'
                           : 'Needs attention';

        const verdictHtml = `
            <div class="snap-verdict">
                <div class="grade-big grade-${td.grade.toLowerCase()}">${td.grade}</div>
                <div class="score-text">Health Score ${td.score100}/100</div>
                <div class="summary-line text-${verdictColor}"><i class="fas fa-${td.score100 >= 75 ? 'check-circle' : td.score100 >= 55 ? 'exclamation-circle' : 'times-circle'} me-2"></i>${verdictText}</div>
            </div>`;

        /* ---- 6 metric tiles ---- */
        function metric(value, label, icon, status) {
            return `<div class="snap-metric ${status}">
                <div class="icon text-${status === 'good' ? 'success' : status === 'bad' ? 'danger' : status === 'warn' ? 'warning' : 'muted'}"><i class="${icon}"></i></div>
                <div class="value">${value}</div>
                <div class="label">${label}</div>
            </div>`;
        }

        const vulnStatus = ch.total === 0 ? 'good' : (ch.critical > 0 ? 'bad' : 'warn');
        const eolStatus  = eol.eolCount === 0 ? 'good' : (eol.eolCount > 10 ? 'bad' : 'warn');
        const licStatus  = lic.highRisk === 0 ? 'good' : 'warn';
        const driftStatus = drift.buckets.major.total === 0 ? 'good' : (drift.buckets.major.total > 20 ? 'bad' : 'warn');
        const hygStatus  = ins.reposWithoutSbom > ins.totalRepos / 2 ? 'warn' : 'good';
        const dwellStatus = dwell === null ? 'neutral' : (dwell > 90 ? 'bad' : (dwell > 30 ? 'warn' : 'good'));

        const metricsHtml = `
            <div class="snap-metrics">
                ${metric(ins.totalRepos, 'Repositories', 'fas fa-database', hygStatus)}
                ${metric(ch.total, 'C+H Vulns', 'fas fa-shield-alt', vulnStatus)}
                ${metric(eol.eolCount, 'EOL Components', 'fas fa-hourglass-end', eolStatus)}
                ${metric(lic.highRisk, 'High-Risk Licenses', 'fas fa-balance-scale', licStatus)}
                ${metric(drift.buckets.major.total, 'Major Drift', 'fas fa-code-branch', driftStatus)}
                ${metric(dwell !== null ? dwell + 'd' : '--', 'CVE Dwell (median)', 'fas fa-clock', dwellStatus)}
            </div>`;

        /* ---- Concerns line ---- */
        const concerns = [];
        if (ch.critical > 0) concerns.push(`${ch.critical} crit vulns`);
        if (sc.malwareCount > 0) concerns.push(`${sc.malwareCount} malware`);
        if (eol.eolCount > 5) concerns.push(`${eol.eolCount} EOL`);
        if (lic.highRisk > 3) concerns.push(`${lic.highRisk} high-risk licenses`);
        if (sc.depConfusionCount > 0) concerns.push(`${sc.depConfusionCount} dep confusion`);
        if (dwell !== null && dwell > 90) concerns.push(`CVE dwell ${dwell}d`);

        const concernsHtml = concerns.length > 0
            ? `<div class="snap-concerns">
                <div class="heading"><i class="fas fa-exclamation-triangle me-1"></i>Top Concerns</div>
                <div class="list">${concerns.map(c => `<span class="item">${esc(c)}</span>`).join('')}</div>
              </div>`
            : `<div class="snap-concerns">
                <div class="all-clear"><i class="fas fa-check-circle me-1"></i>No major concerns identified</div>
              </div>`;

        safe(content, verdictHtml + metricsHtml + concernsHtml);
    }

})();
