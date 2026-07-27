/**
 * Org Report Card (insights4-page.js) — school-report format.
 * Overall GPA + subject-level letter grades with plain-English comments.
 * Everyone understands a report card.
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
    const dateEl   = document.getElementById('reportDate');
    const scopeEl  = document.getElementById('reportScope');

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
            console.error('ReportCard: load failed', err);
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

        const scope = !name || name === '' ? 'All Analyses (combined)' : name;
        scopeEl.textContent = scope;
        dateEl.textContent = 'Generated ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        renderReportCard(Agg.buildInsights(data.data));
        loading.classList.add('d-none');
        content.classList.remove('d-none');
    }

    selector.addEventListener('change', loadAnalysis);
    document.getElementById('reportDate').textContent = 'Generated ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    await loadAnalysesList();

    /* ------------------------------------------------------------------ */
    /*  Subject grade logic                                                */
    /* ------------------------------------------------------------------ */
    function subjectGrade(score100) {
        if (score100 >= 90) return { grade: 'A', status: 'Excellent', statusClass: 'excellent' };
        if (score100 >= 75) return { grade: 'B', status: 'Good', statusClass: 'good' };
        if (score100 >= 55) return { grade: 'C', status: 'Fair', statusClass: 'fair' };
        if (score100 >= 35) return { grade: 'D', status: 'Poor', statusClass: 'poor' };
        return { grade: 'F', status: 'Needs Work', statusClass: 'poor' };
    }

    function computeSubjectGrades(ins) {
        const td    = ins.techDebt;
        const ch    = ins.critHigh;
        const drift = ins.driftStats;
        const eol   = ins.eolStats;
        const lic   = ins.licenseStats;
        const sc    = ins.supplyChain;

        /* Vulnerability Management */
        const vulnScore = Math.max(0, 100 - (ch.critical * 20 + ch.high * 8));
        const vg = subjectGrade(vulnScore);

        /* Version Freshness (drift) */
        const driftPct = drift.total > 0 ? (drift.covered / drift.total) : 1;
        const driftGrade = Math.max(0, 100 -
            (drift.buckets.major.total * 4) -
            (drift.buckets.minor.total) +
            Math.round(driftPct * 10));
        const dg = subjectGrade(Math.min(100, driftGrade));

        /* License Compliance */
        const licCoverage = lic.permissive.total + lic.copyleft.total + lic.unknown.total;
        const licScore = licCoverage > 0
            ? Math.max(0, 100 - (lic.highRisk / licCoverage) * 80)
            : 100;
        const lg = subjectGrade(licScore);

        /* Code Activity (hygiene) */
        const hyg = ins.repoHygiene;
        const activeRatio = ins.totalRepos > 0
            ? (hyg.activityBuckets['Last 30 days'] + hyg.activityBuckets['30-90 days'] + hyg.activityBuckets['90-180 days']) / ins.totalRepos
            : 0;
        const activityScore = Math.round(activeRatio * 100);
        const ag = subjectGrade(activityScore);

        /* Supply Chain Security */
        const scScore = Math.max(0, 100 -
            (sc.malwareCount * 30) -
            (sc.depConfusionCount * 10) -
            (eol.eolCount * 3) -
            (sc.unpinnedActions * 2));
        const sg = subjectGrade(scScore);

        /* Maintenance Hygiene (EOL + age + drift) */
        const oldDeps = ins.ageStats.buckets.filter(b => b.maxMonths >= 24).reduce((s, b) => s + b.total, 0);
        const maintScore = ins.totalDeps > 0
            ? Math.max(0, 100 - ((oldDeps / ins.totalDeps) * 50) - ((drift.buckets.major.total / (ins.totalDeps || 1)) * 30))
            : 100;
        const mg = subjectGrade(maintScore);

        return {
            vulnerability: { ...vg, icon: 'fas fa-shield-alt', label: 'Vulnerability Management', comment: vulnComment(ch, ins.vulnAgeStats.directDwellMedian) },
            freshness: { ...dg, icon: 'fas fa-sync-alt', label: 'Dependency Freshness', comment: driftComment(drift) },
            license: { ...lg, icon: 'fas fa-balance-scale', label: 'License Compliance', comment: licenseComment(lic) },
            activity: { ...ag, icon: 'fas fa-code-branch', label: 'Code Activity', comment: activityComment(hyg, ins.totalRepos) },
            supplyChain: { ...sg, icon: 'fas fa-shield-virus', label: 'Supply Chain Security', comment: supplyChainComment(sc, eol) },
            maintenance: { ...mg, icon: 'fas fa-tools', label: 'Maintenance Hygiene', comment: maintenanceComment(oldDeps, ins.totalDeps) }
        };
    }

    /* Comments */
    function vulnComment(ch, dwell) {
        if (ch.total === 0) return 'No critical or high vulnerabilities.';
        let c = `${ch.total} critical/high vulns`;
        if (dwell !== null) c += `, median dwell ${dwell} days`;
        return c + '.';
    }
    function driftComment(drift) {
        if (drift.total === 0) return 'No dependency data.';
        if (drift.buckets.major.total === 0) return 'All dependencies at current versions.';
        return `${drift.buckets.major.total} major updates behind — ${drift.coveragePct}% coverage.`;
    }
    function licenseComment(lic) {
        const total = lic.permissive.total + lic.copyleft.total + lic.unknown.total;
        if (total === 0) return 'No license data.';
        if (lic.highRisk === 0) return `All ${total} dependencies have permissive licenses.`;
        return `${lic.highRisk} high-risk license(s) among ${total} dependencies.`;
    }
    function activityComment(hyg, total) {
        const active = hyg.activityBuckets['Last 30 days'] + hyg.activityBuckets['30-90 days'] + hyg.activityBuckets['90-180 days'];
        const pct = total > 0 ? Math.round(active / total * 100) : 0;
        if (total === 0) return 'No repositories.';
        return `${pct}% of repos pushed within 6 months (${active}/${total}).`;
    }
    function supplyChainComment(sc, eol) {
        const issues = [];
        if (sc.malwareCount > 0) issues.push(`${sc.malwareCount} malware`);
        if (sc.depConfusionCount > 0) issues.push(`${sc.depConfusionCount} dep confusion`);
        if (eol.eolCount > 0) issues.push(`${eol.eolCount} EOL`);
        if (sc.unpinnedActions > 0) issues.push(`${sc.unpinnedActions} unpinned actions`);
        if (issues.length === 0) return 'No supply chain red flags.';
        return issues.join(', ') + '.';
    }
    function maintenanceComment(oldDeps, total) {
        if (total === 0) return 'No dependencies.';
        const pct = Math.round(oldDeps / total * 100);
        if (oldDeps === 0) return 'All dependencies are recent (< 2 years old).';
        return `${oldDeps} deps (${pct}%) are over 2 years old.`;
    }

    /* ------------------------------------------------------------------ */
    /*  Render                                                             */
    /* ------------------------------------------------------------------ */
    function renderReportCard(ins) {
        const td = ins.techDebt;
        const subjects = computeSubjectGrades(ins);

        /* GPA */
        const gpaMap = { A: 4, B: 3, C: 2, D: 1, F: 0 };
        const points = Object.values(subjects).map(s => gpaMap[s.grade] || 0);
        const gpa = (points.reduce((a, b) => a + b, 0) / points.length).toFixed(1);

        const gpaHtml = `
            <div class="rpt-gpa">
                <div class="letter grade-${td.grade.toLowerCase()}">${td.grade}</div>
                <div class="info">
                    <div class="score">${td.score100}/100</div>
                    <div class="label">Tech-Health Score &middot; GPA ${gpa}</div>
                </div>
            </div>`;

        /* Table */
        const rows = Object.values(subjects).map(s => `
            <tr>
                <td><span class="rpt-subject-icon"><i class="${s.icon}"></i></span>${esc(s.label)}</td>
                <td class="rpt-grade-cell grade-${s.grade.toLowerCase()}">${s.grade}</td>
                <td><span class="rpt-status-badge ${s.statusClass}">${esc(s.status)}</span></td>
                <td class="rpt-comment">${esc(s.comment)}</td>
            </tr>`).join('');

        const tableHtml = `
            <table class="rpt-table">
                <thead>
                    <tr>
                        <th>Subject</th>
                        <th style="width:3.5rem;text-align:center;">Grade</th>
                        <th style="width:7rem;">Status</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;

        /* Legend */
        const legendHtml = `
            <div class="rpt-footer-note">
                <span class="me-3"><span class="rpt-status-badge excellent me-1">Excellent</span> ≥90</span>
                <span class="me-3"><span class="rpt-status-badge good me-1">Good</span> ≥75</span>
                <span class="me-3"><span class="rpt-status-badge fair me-1">Fair</span> ≥55</span>
                <span class="me-3"><span class="rpt-status-badge poor me-1">Poor</span> &lt;55</span>
            </div>`;

        safe(content, gpaHtml + tableHtml + legendHtml);
    }

})();
