/**
 * Insights Aggregator — DOM-light, pure-function module that computes every
 * stat the Insights page and the index.html KPI strip need from a stored
 * analysis blob (the shape returned by SBOMProcessor.exportData() or
 * StorageManager.getCombinedData()).
 *
 * Design rules:
 *   - No Chart.js, no document.*, no window.* reads (except window.escapeHtml
 *     inside renderKpiStrip which returns an HTML string).
 *   - Every compute* aggregator takes a shared `directMap` so the (dep, repo)
 *     pair classification is computed once.
 *   - Tech-Debt composite deliberately excludes SBOM quality (user cannot
 *     control GitHub-generated SBOM NTIA fields).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function scoreToGrade(score100) {
    if (score100 >= 90) return 'A';
    if (score100 >= 75) return 'B';
    if (score100 >= 55) return 'C';
    if (score100 >= 35) return 'D';
    return 'F';
}

function gradeColor(grade) {
    switch (grade) {
        case 'A': return 'success';
        case 'B': return 'info';
        case 'C': return 'warning';
        case 'D': return 'warning';
        default:  return 'danger';
    }
}

/**
 * Build the directMap: Map<depKey, Set<repoKey>> where each entry tells us
 * which repos use that dep as a direct dependency. Built from
 * allRepositories[].directDependencies so it mirrors SBOM truth.
 */
function buildDirectMap(allRepos) {
    const map = new Map();
    for (const repo of allRepos) {
        if (!repo || !Array.isArray(repo.directDependencies)) continue;
        const repoKey = `${repo.owner}/${repo.name}`;
        for (const depKey of repo.directDependencies) {
            if (!map.has(depKey)) map.set(depKey, new Set());
            map.get(depKey).add(repoKey);
        }
    }
    return map;
}

function isDirectIn(dep, repoKey, directMap) {
    const key = `${dep.name}@${dep.version}`;
    const set = directMap.get(key);
    return set ? set.has(repoKey) : false;
}

function isDirectAnywhere(dep, directMap) {
    const key = `${dep.name}@${dep.version}`;
    const set = directMap.get(key);
    return set ? set.size > 0 : false;
}

function splitCounts() { return { direct: 0, transitive: 0 }; }
function bumpSplit(split, isDirect) { isDirect ? split.direct++ : split.transitive++; }

/**
 * Normalise languageStats to the canonical array form.
 * - Single analysis: already `[{language, count, uniqueDependencies}]`
 * - Combined (getCombinedData): `{language: count}` object
 */
function normalizeLanguageStats(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return Object.entries(raw)
        .map(([language, value]) => ({
            language,
            count: typeof value === 'object' && value !== null ? (value.count || 0) : (parseInt(value) || 0),
            uniqueDependencies: typeof value === 'object' && value !== null ? (value.uniqueDependencies || 0) : 0
        }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Thin helper for counting critical+high vulns. When Group G lands
 * (OSVService.countUniqueAdvisories), swap the body of this function
 * to call that instead — one-line change.
 */
function countCritHigh(vulnAnalysis) {
    if (!vulnAnalysis) return { critical: 0, high: 0, total: 0 };
    const critical = vulnAnalysis.criticalVulnerabilities || 0;
    const high = vulnAnalysis.highVulnerabilities || 0;
    return { critical, high, total: critical + high };
}

// ---------------------------------------------------------------------------
// compute* aggregators
// ---------------------------------------------------------------------------

function computeDriftStats(allDeps, directMap) {
    const buckets = {
        major:   { total: 0, split: splitCounts() },
        minor:   { total: 0, split: splitCounts() },
        patch:   { total: 0, split: splitCounts() },
        current: { total: 0, split: splitCounts() }
    };
    const lagging = [];
    let covered = 0;

    for (const dep of allDeps) {
        const drift = dep.versionDrift;
        if (!drift) continue;
        covered++;
        const isDirect = isDirectAnywhere(dep, directMap);
        if (drift.hasMajorUpdate) {
            buckets.major.total++;
            bumpSplit(buckets.major.split, isDirect);
            lagging.push({ name: dep.name, version: dep.version, latest: drift.latestVersion, type: 'major', isDirect });
        } else if (drift.hasMinorUpdate) {
            buckets.minor.total++;
            bumpSplit(buckets.minor.split, isDirect);
            lagging.push({ name: dep.name, version: dep.version, latest: drift.latestVersion, type: 'minor', isDirect });
        } else {
            buckets.current.total++;
            bumpSplit(buckets.current.split, isDirect);
        }
    }

    lagging.sort((a, b) => {
        const order = { major: 0, minor: 1, patch: 2 };
        return (order[a.type] || 3) - (order[b.type] || 3);
    });

    const total = allDeps.length;
    const coveragePct = total > 0 ? Math.round((covered / total) * 100) : 0;

    return { buckets, lagging, covered, total, coveragePct };
}

function computeAgeStats(allDeps, directMap) {
    const bucketDefs = [
        { label: '< 6 months', maxMonths: 6 },
        { label: '6-12 months', maxMonths: 12 },
        { label: '1-2 years', maxMonths: 24 },
        { label: '2-3 years', maxMonths: 36 },
        { label: '3-5 years', maxMonths: 60 },
        { label: '> 5 years', maxMonths: Infinity }
    ];
    const buckets = bucketDefs.map(b => ({ label: b.label, maxMonths: b.maxMonths, total: 0, split: splitCounts() }));
    const probableEolList = [];
    let covered = 0;

    for (const dep of allDeps) {
        const s = dep.staleness;
        if (!s || s.monthsSinceRelease === undefined || s.monthsSinceRelease === null) continue;
        covered++;
        const months = s.monthsSinceRelease;
        const isDirect = isDirectAnywhere(dep, directMap);
        for (const bucket of buckets) {
            if (months < bucket.maxMonths || bucket.maxMonths === Infinity) {
                bucket.total++;
                bumpSplit(bucket.split, isDirect);
                break;
            }
        }
        if (s.isProbableEOL) {
            probableEolList.push({
                name: dep.name,
                version: dep.version,
                months: Math.round(months),
                reason: s.probableEOLReason || 'Stale',
                isDirect
            });
        }
    }

    probableEolList.sort((a, b) => b.months - a.months);

    const total = allDeps.length;
    const coveragePct = total > 0 ? Math.round((covered / total) * 100) : 0;

    return { buckets, probableEolList, covered, total, coveragePct };
}

function computeDepthStats(allDeps, allRepos) {
    const depthCounts = {};
    let maxDepth = 0;
    let imputedDirectGlobal = 0;

    const repoDepSets = new Map();
    for (const repo of allRepos) {
        const repoKey = `${repo.owner}/${repo.name}`;
        repoDepSets.set(repoKey, new Set(repo.dependencies || []));
    }

    for (const dep of allDeps) {
        const depKey = `${dep.name}@${dep.version}`;
        let depth = dep.depth;
        if (!depth || depth < 1) {
            let inAnySbom = false;
            for (const [, depSet] of repoDepSets) {
                if (depSet.has(depKey)) { inAnySbom = true; break; }
            }
            if (inAnySbom) {
                depth = 1;
                imputedDirectGlobal++;
            } else {
                continue;
            }
        }
        if (depth > maxDepth) maxDepth = depth;
        depthCounts[depth] = (depthCounts[depth] || 0) + 1;
    }

    const distribution = [];
    for (let d = 1; d <= maxDepth; d++) {
        distribution.push({ depth: d, count: depthCounts[d] || 0 });
    }

    return { distribution, maxDepth, imputedDirectGlobal };
}

function computeVulnAgeStats(vulnAnalysis, allDeps, directMap) {
    const now = Date.now();
    const ageBuckets = [
        { label: '< 30 days', maxDays: 30 },
        { label: '30-90 days', maxDays: 90 },
        { label: '90-180 days', maxDays: 180 },
        { label: '180-365 days', maxDays: 365 },
        { label: '> 1 year', maxDays: Infinity }
    ];
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const crosstab = {};
    for (const sev of severities) {
        crosstab[sev] = ageBuckets.map(b => ({ label: b.label, total: 0, split: splitCounts() }));
    }

    const timeBombs = [];
    const directDwellDays = [];

    const vulnDeps = vulnAnalysis?.vulnerableDependencies || [];
    for (const vDep of vulnDeps) {
        const depKey = `${vDep.name}@${vDep.version}`;
        const isDirect = directMap.has(depKey) && directMap.get(depKey).size > 0;
        for (const vuln of (vDep.vulnerabilities || [])) {
            if (vuln.kind === 'malware') continue;
            const sev = (vuln.severity || 'UNKNOWN').toUpperCase();
            if (sev === 'UNKNOWN' || sev === 'INFORMATIONAL') continue;
            const published = vuln.published ? new Date(vuln.published).getTime() : null;
            const ageDays = published ? Math.floor((now - published) / 86400000) : null;

            if (ageDays !== null && crosstab[sev]) {
                for (let i = 0; i < ageBuckets.length; i++) {
                    if (ageDays < ageBuckets[i].maxDays || ageBuckets[i].maxDays === Infinity) {
                        crosstab[sev][i].total++;
                        bumpSplit(crosstab[sev][i].split, isDirect);
                        break;
                    }
                }
            }

            if (isDirect && ageDays !== null) directDwellDays.push(ageDays);

            if ((sev === 'CRITICAL' || sev === 'HIGH') && ageDays !== null && ageDays > 30) {
                timeBombs.push({
                    name: vDep.name,
                    version: vDep.version,
                    vulnId: vuln.id,
                    severity: sev,
                    ageDays,
                    isDirect,
                    reach: isDirect ? 'direct' : 'transitive'
                });
            }
        }
    }

    timeBombs.sort((a, b) => b.ageDays - a.ageDays);

    directDwellDays.sort((a, b) => a - b);
    const directDwellMedian = directDwellDays.length > 0
        ? directDwellDays[Math.floor(directDwellDays.length / 2)]
        : null;

    return { ageBuckets: ageBuckets.map(b => b.label), crosstab, timeBombs, directDwellMedian, directDwellCount: directDwellDays.length };
}

function computeEolStats(allDeps, directMap) {
    let eolCount = 0, eosCount = 0;
    const eolDirect = { eol: 0, eos: 0 };
    const eolTransitive = { eol: 0, eos: 0 };
    const eolList = [];

    for (const dep of allDeps) {
        const isDirect = isDirectAnywhere(dep, directMap);
        const eox = dep.eoxStatus;
        const staleness = dep.staleness;
        let isEol = false, isEos = false, source = null;

        if (eox && (eox.isEOL || eox.isEOS)) {
            if (eox.isEOL) { isEol = true; source = 'endoflife.date'; }
            if (eox.isEOS) { isEos = true; source = 'endoflife.date'; }
        }
        if (!isEol && staleness && staleness.isProbableEOL) {
            isEol = true;
            source = staleness.probableEOLReason || 'staleness heuristic';
        }

        if (isEol) {
            eolCount++;
            isDirect ? eolDirect.eol++ : eolTransitive.eol++;
        }
        if (isEos) {
            eosCount++;
            isDirect ? eolDirect.eos++ : eolTransitive.eos++;
        }
        if (isEol || isEos) {
            eolList.push({ name: dep.name, version: dep.version, isEol, isEos, source, isDirect });
        }
    }

    return { eolCount, eosCount, eolDirect, eolTransitive, eolList };
}

function computeLicenseStats(allDeps, licenseAnalysis, directMap) {
    let copyleftDirect = 0, copyleftTransitive = 0;
    let permissiveDirect = 0, permissiveTransitive = 0;
    let unknownDirect = 0, unknownTransitive = 0;
    let highRisk = 0;
    const conflicts = [];

    const copyleftSet = new Set([
        'GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later',
        'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later',
        'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
        'LGPL-2.0', 'LGPL-2.0-only', 'LGPL-2.0-or-later',
        'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
        'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
        'MPL-2.0', 'EUPL-1.1', 'EUPL-1.2',
        'CDDL-1.0', 'CDDL-1.1', 'EPL-1.0', 'EPL-2.0',
        'CECILL-2.1', 'OSL-3.0', 'RPL-1.1', 'RPL-1.5'
    ]);

    for (const dep of allDeps) {
        const isDirect = isDirectAnywhere(dep, directMap);
        const lic = dep.licenseFull || dep.license || null;
        if (!lic || lic === 'NOASSERTION' || lic === 'Unknown' || lic.trim() === '') {
            isDirect ? unknownDirect++ : unknownTransitive++;
            continue;
        }
        const isCopyleft = copyleftSet.has(lic) || /GPL|AGPL|LGPL|MPL|EUPL|CDDL|EPL|CECILL|OSL|RPL/i.test(lic);
        if (isCopyleft) {
            isDirect ? copyleftDirect++ : copyleftTransitive++;
            highRisk++;
        } else {
            isDirect ? permissiveDirect++ : permissiveTransitive++;
        }
    }

    if (licenseAnalysis && Array.isArray(licenseAnalysis.conflicts)) {
        for (const c of licenseAnalysis.conflicts) {
            conflicts.push(c);
        }
    }

    return {
        copyleft: { direct: copyleftDirect, transitive: copyleftTransitive, total: copyleftDirect + copyleftTransitive },
        permissive: { direct: permissiveDirect, transitive: permissiveTransitive, total: permissiveDirect + permissiveTransitive },
        unknown: { direct: unknownDirect, transitive: unknownTransitive, total: unknownDirect + unknownTransitive },
        highRisk,
        conflicts
    };
}

function computeRepoHygiene(allRepos) {
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let noSbom = 0, archived = 0, noGraph = 0;
    const activityBuckets = {
        'Last 30 days': 0,
        '30-90 days': 0,
        '90-180 days': 0,
        '180-365 days': 0,
        '> 1 year': 0,
        'Unknown': 0
    };

    const now = Date.now();
    for (const repo of allRepos) {
        if (repo.archived) archived++;
        const qa = repo.qualityAssessment;
        if (qa && qa.grade) {
            const g = qa.grade.toUpperCase();
            if (gradeDistribution[g] !== undefined) gradeDistribution[g]++;
        } else {
            noSbom++;
        }
        if (repo.totalDependencies === 0 && !qa) noGraph++;

        const pushed = repo.pushedAt;
        if (pushed) {
            const daysSincePush = Math.floor((now - new Date(pushed).getTime()) / 86400000);
            if (daysSincePush <= 30) activityBuckets['Last 30 days']++;
            else if (daysSincePush <= 90) activityBuckets['30-90 days']++;
            else if (daysSincePush <= 180) activityBuckets['90-180 days']++;
            else if (daysSincePush <= 365) activityBuckets['180-365 days']++;
            else activityBuckets['> 1 year']++;
        } else {
            activityBuckets['Unknown']++;
        }
    }

    return { gradeDistribution, noSbom, archived, noGraph, activityBuckets };
}

function computeSupplyChainStats(allDeps, malwareAnalysis, ghActionsAnalysis) {
    let malwareCount = 0, depConfusionCount = 0, unpinnedActions = 0, totalActions = 0;

    if (malwareAnalysis) {
        malwareCount = malwareAnalysis.maliciousPackages || 0;
    }

    for (const dep of allDeps) {
        if (dep.registryNotFound || dep.namespaceNotFound) depConfusionCount++;
    }

    if (ghActionsAnalysis) {
        totalActions = ghActionsAnalysis.totalActions || 0;
        const findings = ghActionsAnalysis.findings || [];
        unpinnedActions = findings.filter(f =>
            f.rule_id === 'unpinned-action' || f.rule_id === 'mutable-ref'
        ).length;
    }

    const deadRepos = allDeps.filter(d =>
        Array.isArray(d.sourceRepoStatus) && d.sourceRepoStatus.some(s => s.valid === false)
    ).length;

    return { malwareCount, depConfusionCount, unpinnedActions, totalActions, deadRepos };
}

function computePerRepoStats(allRepos, allDeps, vulnAnalysis, directMap) {
    const depsByRepo = new Map();
    for (const dep of allDeps) {
        const repos = dep.repositories || [];
        for (const repoKey of repos) {
            if (!depsByRepo.has(repoKey)) depsByRepo.set(repoKey, []);
            depsByRepo.get(repoKey).push(dep);
        }
    }

    const vulnByDep = new Map();
    if (vulnAnalysis?.vulnerableDependencies) {
        for (const vd of vulnAnalysis.vulnerableDependencies) {
            vulnByDep.set(`${vd.name}@${vd.version}`, vd);
        }
    }

    const rows = [];
    for (const repo of allRepos) {
        const repoKey = `${repo.owner}/${repo.name}`;
        const deps = depsByRepo.get(repoKey) || [];
        let directCount = 0, transitiveCount = 0;
        let critDirect = 0, highDirect = 0, critTransitive = 0, highTransitive = 0;
        let majorDriftDirect = 0, majorDriftTransitive = 0;

        for (const dep of deps) {
            const isDirect = isDirectIn(dep, repoKey, directMap);
            isDirect ? directCount++ : transitiveCount++;

            const vd = vulnByDep.get(`${dep.name}@${dep.version}`);
            if (vd) {
                for (const v of (vd.vulnerabilities || [])) {
                    if (v.kind === 'malware') continue;
                    const sev = (v.severity || '').toUpperCase();
                    if (sev === 'CRITICAL') { isDirect ? critDirect++ : critTransitive++; }
                    else if (sev === 'HIGH') { isDirect ? highDirect++ : highTransitive++; }
                }
            }

            if (dep.versionDrift?.hasMajorUpdate) {
                isDirect ? majorDriftDirect++ : majorDriftTransitive++;
            }
        }

        rows.push({
            repoKey,
            name: repo.name,
            owner: repo.owner,
            totalDeps: deps.length,
            directCount,
            transitiveCount,
            critDirect, highDirect, critTransitive, highTransitive,
            majorDriftDirect, majorDriftTransitive,
            grade: repo.qualityAssessment?.grade || null,
            archived: repo.archived || false
        });
    }

    rows.sort((a, b) => (b.critDirect + b.highDirect + b.critTransitive + b.highTransitive) - (a.critDirect + a.highDirect + a.critTransitive + a.highTransitive));

    return rows;
}

function computeTechDebt(driftStats, vulnAnalysis, ageStats, licenseStats, eolStats, hygieneStats, allDeps, directMap) {
    const weights = { drift: 0.30, vulns: 0.30, age: 0.15, license: 0.10, eol: 0.10, hygiene: 0.05 };
    const total = allDeps.length || 1;

    // Drift component (3x weight for direct)
    const majorDir = driftStats.buckets.major.split.direct;
    const majorTrans = driftStats.buckets.major.split.transitive;
    const minorDir = driftStats.buckets.minor.split.direct;
    const minorTrans = driftStats.buckets.minor.split.transitive;
    const weightedDrift = (majorDir * 3 + majorTrans) + (minorDir * 3 + minorTrans) / 3;
    const driftDebt = clamp01(weightedDrift / total);

    // Vuln component (3x weight for direct)
    const ch = countCritHigh(vulnAnalysis);
    const vulnDeps = vulnAnalysis?.vulnerableDependencies || [];
    let critDir = 0, highDir = 0, medDir = 0, critTrans = 0, highTrans = 0, medTrans = 0;
    for (const vd of vulnDeps) {
        const isDirect = isDirectAnywhere(vd, directMap);
        for (const v of (vd.vulnerabilities || [])) {
            if (v.kind === 'malware') continue;
            const sev = (v.severity || '').toUpperCase();
            if (sev === 'CRITICAL') { isDirect ? critDir++ : critTrans++; }
            else if (sev === 'HIGH') { isDirect ? highDir++ : highTrans++; }
            else if (sev === 'MEDIUM' || sev === 'MODERATE') { isDirect ? medDir++ : medTrans++; }
        }
    }
    const weightedVuln = critDir * 30 + highDir * 12 + medDir * 3 + critTrans * 10 + highTrans * 4 + medTrans;
    const vulnDebt = clamp01(weightedVuln / (total * 5));

    // Age component
    const oldDeps = ageStats.buckets.filter(b => b.maxMonths >= 24).reduce((s, b) => s + b.total, 0);
    const ageDebt = clamp01(oldDeps / total);

    // License component
    const licenseDebt = clamp01(licenseStats.highRisk / total);

    // EOL component
    const eolDebt = clamp01(eolStats.eolCount / total);

    // Hygiene component
    const totalRepos = Object.values(hygieneStats.gradeDistribution).reduce((s, v) => s + v, 0) + hygieneStats.noSbom;
    const poorRepos = (hygieneStats.gradeDistribution.D || 0) + (hygieneStats.gradeDistribution.F || 0) + hygieneStats.noSbom;
    const hygieneDebt = totalRepos > 0 ? clamp01(poorRepos / totalRepos) : 0;

    const debtScore = clamp01(
        weights.drift * driftDebt +
        weights.vulns * vulnDebt +
        weights.age * ageDebt +
        weights.license * licenseDebt +
        weights.eol * eolDebt +
        weights.hygiene * hygieneDebt
    );

    const score100 = Math.round((1 - debtScore) * 100);
    const grade = scoreToGrade(score100);

    return {
        score100,
        grade,
        gradeColorClass: gradeColor(grade),
        debtScore: Math.round(debtScore * 100),
        components: {
            drift:   { debt: Math.round(driftDebt * 100),   weight: weights.drift,   contribution: Math.round(weights.drift * driftDebt * 100) },
            vulns:   { debt: Math.round(vulnDebt * 100),    weight: weights.vulns,   contribution: Math.round(weights.vulns * vulnDebt * 100) },
            age:     { debt: Math.round(ageDebt * 100),     weight: weights.age,     contribution: Math.round(weights.age * ageDebt * 100) },
            license: { debt: Math.round(licenseDebt * 100), weight: weights.license, contribution: Math.round(weights.license * licenseDebt * 100) },
            eol:     { debt: Math.round(eolDebt * 100),     weight: weights.eol,     contribution: Math.round(weights.eol * eolDebt * 100) },
            hygiene: { debt: Math.round(hygieneDebt * 100), weight: weights.hygiene, contribution: Math.round(weights.hygiene * hygieneDebt * 100) }
        }
    };
}

// ---------------------------------------------------------------------------
// buildInsights — orchestrator
// ---------------------------------------------------------------------------

function buildInsights(data) {
    const allDeps = data.allDependencies || [];
    const allRepos = data.allRepositories || [];
    const vulnAnalysis = data.vulnerabilityAnalysis || null;
    const malwareAnalysis = data.malwareAnalysis || null;
    const licenseAnalysis = data.licenseAnalysis || null;
    const ghActionsAnalysis = data.githubActionsAnalysis || null;

    const directMap = buildDirectMap(allRepos);

    const totalRepos = allRepos.length;
    const reposWithSbom = allRepos.filter(r => r.qualityAssessment).length;
    const totalDeps = allDeps.length;
    let directCount = 0, transitiveCount = 0;
    for (const dep of allDeps) {
        if (isDirectAnywhere(dep, directMap)) directCount++;
        else transitiveCount++;
    }

    const driftStats = computeDriftStats(allDeps, directMap);
    const ageStats = computeAgeStats(allDeps, directMap);
    const depthStats = computeDepthStats(allDeps, allRepos);
    const vulnAgeStats = computeVulnAgeStats(vulnAnalysis, allDeps, directMap);
    const eolStats = computeEolStats(allDeps, directMap);
    const licenseStats = computeLicenseStats(allDeps, licenseAnalysis, directMap);
    const repoHygiene = computeRepoHygiene(allRepos);
    const supplyChain = computeSupplyChainStats(allDeps, malwareAnalysis, ghActionsAnalysis);
    const perRepo = computePerRepoStats(allRepos, allDeps, vulnAnalysis, directMap);
    const techDebt = computeTechDebt(driftStats, vulnAnalysis, ageStats, licenseStats, eolStats, repoHygiene, allDeps, directMap);
    const languageStats = normalizeLanguageStats(data.languageStats);

    const critHigh = countCritHigh(vulnAnalysis);

    return {
        totalRepos,
        reposWithSbom,
        reposWithoutSbom: totalRepos - reposWithSbom,
        totalDeps,
        directCount,
        transitiveCount,
        driftStats,
        ageStats,
        depthStats,
        vulnAgeStats,
        eolStats,
        licenseStats,
        repoHygiene,
        supplyChain,
        perRepo,
        techDebt,
        languageStats,
        critHigh,
        directMap
    };
}

// ---------------------------------------------------------------------------
// renderKpiStrip — returns HTML string
// ---------------------------------------------------------------------------

function renderKpiStrip(ins, opts = {}) {
    const linkMap = opts.linkMap || {};
    const esc = typeof window !== 'undefined' && window.escapeHtml ? window.escapeHtml : (s => s);

    function tile(id, label, value, sub, colorClass) {
        const href = linkMap[id];
        const tag = href ? 'a' : 'div';
        const hrefAttr = href ? ` href="${esc(href)}"` : '';
        const clickClass = href ? ' text-decoration-none' : '';
        return `<div class="col">
            <${tag}${hrefAttr} class="card h-100 border-0 shadow-sm${clickClass}" id="kpi-tile-${id}">
                <div class="card-body text-center p-3">
                    <div class="fs-2 fw-bold text-${colorClass}">${value}</div>
                    <div class="small text-muted fw-semibold">${label}</div>
                    <div class="small text-muted mt-1">${sub}</div>
                </div>
            </${tag}>
        </div>`;
    }

    const ch = ins.critHigh;
    const chColor = ch.total > 0 ? 'danger' : 'success';
    const chSub = ch.total > 0
        ? `${ch.critical} critical, ${ch.high} high`
        : 'No critical or high vulns';

    const dwell = ins.vulnAgeStats.directDwellMedian;
    const dwellValue = dwell !== null ? `${dwell}d` : '--';
    const dwellColor = dwell === null ? 'muted' : (dwell > 90 ? 'danger' : (dwell > 30 ? 'warning' : 'success'));
    const dwellSub = dwell !== null
        ? `median age, ${ins.vulnAgeStats.directDwellCount} direct vulns`
        : 'no direct vulns with dates';

    const driftMajor = ins.driftStats.buckets.major.total;
    const driftColor = driftMajor > 0 ? 'warning' : 'success';
    const driftSub = driftMajor > 0
        ? `${driftMajor} major update${driftMajor !== 1 ? 's' : ''} available`
        : 'all deps current or minor';

    const eolColor = ins.eolStats.eolCount > 0 ? 'danger' : 'success';

    const td = ins.techDebt;

    const tiles = [
        tile('repos', 'Repositories', ins.totalRepos, `${ins.reposWithSbom} with SBOM`, 'primary'),
        tile('deps', 'Dependencies', ins.totalDeps, `${ins.directCount} direct, ${ins.transitiveCount} transitive`, 'primary'),
        tile('vulnsCH', 'Critical + High Vulns', ch.total, chSub, chColor),
        tile('directDwell', 'Direct-dep CVE Dwell', dwellValue, dwellSub, dwellColor),
        tile('eol', 'EOL Components', ins.eolStats.eolCount, `${ins.eolStats.eosCount} end-of-support`, eolColor),
        tile('licenses', 'Copyleft / High-risk', ins.licenseStats.highRisk, `${ins.licenseStats.copyleft.direct} direct, ${ins.licenseStats.copyleft.transitive} transitive`, ins.licenseStats.highRisk > 0 ? 'warning' : 'success'),
        tile('drift', 'Version Drift', `${ins.driftStats.coveragePct}%`, driftSub, driftColor),
        tile('techDebt', 'Tech-debt Grade', `<span class="badge bg-${td.gradeColorClass} fs-4">${td.grade}</span>`, `health score ${td.score100}/100`, td.gradeColorClass)
    ];

    return `<div class="row row-cols-2 row-cols-md-4 g-3 mb-4">${tiles.join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

window.InsightsAggregator = {
    buildInsights,
    renderKpiStrip,
    normalizeLanguageStats,
    buildDirectMap,
    isDirectIn,
    isDirectAnywhere,
    splitCounts,
    bumpSplit,
    clamp01,
    scoreToGrade,
    gradeColor,
    countCritHigh,
    computeDriftStats,
    computeAgeStats,
    computeDepthStats,
    computeVulnAgeStats,
    computeEolStats,
    computeLicenseStats,
    computeRepoHygiene,
    computeSupplyChainStats,
    computePerRepoStats,
    computeTechDebt
};
