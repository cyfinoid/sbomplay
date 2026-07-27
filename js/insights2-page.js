/**
 * Executive Pulse (insights2-page.js) — CISO / M&A one-glance dashboard.
 * Design: giant health grade + 6 vital-sign cards + risk bullets.
 * No charts, no tables — pure signal.
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

    /* ------------------------------------------------------------------ */
    /*  Bootstrap                                                         */
    /* ------------------------------------------------------------------ */
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
            console.error('Pulse: load failed', err);
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

        renderPulse(Agg.buildInsights(data.data));
        loading.classList.add('d-none');
        content.classList.remove('d-none');
    }

    selector.addEventListener('change', loadAnalysis);
    await loadAnalysesList();

    /* ------------------------------------------------------------------ */
    /*  Render                                                             */
    /* ------------------------------------------------------------------ */
    function renderPulse(ins) {
        const td     = ins.techDebt;
        const ch     = ins.critHigh;
        const drift  = ins.driftStats;
        const eol    = ins.eolStats;
        const lic    = ins.licenseStats;
        const sc     = ins.supplyChain;
        const dwell  = ins.vulnAgeStats.directDwellMedian;

        /* ---- hero grade ---- */
        const gradeClass   = 'grade-' + td.grade.toLowerCase();
        const gradeSummary = td.score100 >= 75 ? 'Healthy'
                           : td.score100 >= 55 ? 'Fair'
                           : td.score100 >= 35 ? 'Concerning'
                           : 'At Risk';

        const heroHtml = `
            <div class="epulse-hero">
                <div class="epulse-grade-circle ${gradeClass}">${td.grade}</div>
                <div class="epulse-grade-label">${gradeSummary}</div>
                <div class="epulse-grade-sub">Health Score ${td.score100}/100</div>
            </div>`;

        /* ---- vital signs ---- */
        const vulnColor  = ch.total === 0 ? 'epulse-status-good' : (ch.critical > 0 ? 'epulse-status-bad' : 'epulse-status-warn');
        const eolColor   = eol.eolCount === 0 ? 'epulse-status-good' : 'epulse-status-bad';
        const licenseColor = lic.highRisk === 0 ? 'epulse-status-good' : 'epulse-status-warn';
        const driftColor = drift.buckets.major.total === 0 ? 'epulse-status-good' : 'epulse-status-warn';
        const dwellColor = dwell === null ? 'epulse-status-muted' : (dwell > 90 ? 'epulse-status-bad' : (dwell > 30 ? 'epulse-status-warn' : 'epulse-status-good'));
        const reposColor = ins.reposWithoutSbom > ins.totalRepos / 2 ? 'epulse-status-warn' : 'epulse-status-good';

        function vital(icon, value, label, colorClass, sub) {
            return `<div class="col-md-4 col-lg-2"><div class="epulse-vital">
                <div class="icon ${colorClass}"><i class="${icon}"></i></div>
                <div class="value ${colorClass}">${value}</div>
                <div class="label">${label}</div>
                ${sub ? `<div class="label" style="font-size:0.75rem;">${sub}</div>` : ''}
            </div></div>`;
        }

        const vitalHtml = `
            <div class="row g-3 mb-5">
                ${vital('fas fa-shield-alt', ch.total, 'Crit + High Vulns', vulnColor, ch.critical > 0 ? `${ch.critical} crit, ${ch.high} high` : 'None')}
                ${vital('fas fa-boxes', ins.totalDeps, 'Dependencies', 'epulse-status-muted', `${ins.directCount} direct, ${ins.transitiveCount} transitive`)}
                ${vital('fas fa-hourglass-end', eol.eolCount, 'EOL Components', eolColor, `${eol.eosCount} end-of-support`)}
                ${vital('fas fa-balance-scale', lic.highRisk, 'High-Risk Licenses', licenseColor, `${lic.copyleft.total} copyleft`)}
                ${vital('fas fa-code-branch', drift.coveragePct + '%', 'Version Drift Coverage', driftColor, `${drift.buckets.major.total} major lagging`)}
                ${vital('fas fa-clock', dwell !== null ? dwell + 'd' : '--', 'CVE Dwell (median)', dwellColor, 'direct-dep vulns')}
            </div>
            <div class="row g-3 mb-5">
                ${vital('fas fa-database', ins.totalRepos, 'Repositories Analyzed', reposColor, `${ins.reposWithSbom} with SBOM`)}
                ${vital('fas fa-heartbeat', td.grade, 'Tech-Health Grade', `epulse-status-${td.score100 >= 55 ? 'good' : 'bad'}`, `score ${td.score100}/100`)}
            </div>`;

        /* ---- "Needs Attention" risks ---- */
        const risks = [];
        if (ch.total > 0) {
            risks.push({ icon: 'fas fa-bug text-danger', title: `${ch.total} critical/high vulnerabilities found`, detail: `${ch.critical} critical, ${ch.high} high — prioritize patching` });
        }
        if (eol.eolCount > 0) {
            risks.push({ icon: 'fas fa-hourglass-end text-warning', title: `${eol.eolCount} components past end-of-life`, detail: `${eol.eosCount} also end-of-support — upgrade or replace` });
        }
        if (lic.highRisk > 0) {
            risks.push({ icon: 'fas fa-gavel text-warning', title: `${lic.highRisk} high-risk license obligations`, detail: `${lic.copyleft.direct} direct, ${lic.copyleft.transitive} transitive — legal review recommended` });
        }
        if (sc.malwareCount > 0) {
            risks.push({ icon: 'fas fa-skull-crossbones text-danger', title: `${sc.malwareCount} malware alerts`, detail: 'Malicious packages detected — investigate immediately' });
        }
        if (sc.depConfusionCount > 0) {
            risks.push({ icon: 'fas fa-question-circle text-warning', title: `${sc.depConfusionCount} dependency confusion risks`, detail: 'Packages not found on registry — potential supply-chain attack vector' });
        }
        if (sc.unpinnedActions > 0) {
            risks.push({ icon: 'fas fa-code-branch text-warning', title: `${sc.unpinnedActions} unpinned GitHub Actions`, detail: 'Mutable refs in CI pipeline — pin to immutable commit SHAs' });
        }
        if (drift.buckets.major.total > 20) {
            risks.push({ icon: 'fas fa-arrow-up text-warning', title: `${drift.buckets.major.total} dependencies with major updates available`, detail: 'Version drift indicates stale dependencies — schedule update cycle' });
        }
        if (dwell !== null && dwell > 90) {
            risks.push({ icon: 'fas fa-clock text-danger', title: `CVE dwell time at ${dwell} days median`, detail: 'Critical/high vulns sit open too long — accelerate patch SLA' });
        }

        /* ---- "On Track" highlights ---- */
        const clears = [];
        if (ch.total === 0) clears.push('No critical or high vulnerabilities');
        if (eol.eolCount === 0) clears.push('No end-of-life components');
        if (lic.highRisk === 0) clears.push('No high-risk license obligations');
        if (sc.malwareCount === 0) clears.push('No malware advisories');
        if (sc.depConfusionCount === 0) clears.push('No dependency confusion risks');
        if (drift.buckets.major.total === 0 && drift.coveragePct >= 80) clears.push('Dependencies are up-to-date');
        if (dwell !== null && dwell <= 30) clears.push('Vulnerabilities patched promptly (≤30 days dwell)');
        if (ins.totalRepos > 0 && ins.reposWithoutSbom === 0) clears.push('All repositories have SBOMs');

        const riskHtml = risks.length > 0 ? `
            <h3 class="epulse-section-title"><i class="fas fa-exclamation-triangle text-warning me-2"></i>Needs Attention</h3>
            <div class="mb-5">
                ${risks.map(r => `
                    <div class="epulse-risk-item">
                        <div class="icon ${r.icon.split(' ').slice(-2).join(' ')}"><i class="${r.icon}"></i></div>
                        <div class="text"><strong>${esc(r.title)}</strong><span>${esc(r.detail)}</span></div>
                    </div>
                `).join('')}
            </div>` : '';

        const clearHtml = clears.length > 0 ? `
            <h3 class="epulse-section-title" style="margin-top:-0.5rem;"><i class="fas fa-check-circle text-success me-2"></i>On Track</h3>
            <div class="mb-4">
                ${clears.map(c => `<div class="epulse-clear-item"><i class="fas fa-check-circle"></i> ${esc(c)}</div>`).join('')}
            </div>` : '';

        safe(content, heroHtml + vitalHtml + riskHtml + clearHtml);
    }

})();
