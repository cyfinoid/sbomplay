/**
 * JavaScript for insights.html page
 *
 * Surfaces actionable, exec-friendly stats for engineering managers / CTOs / M&A teams:
 *   - KPI strip (SBOM coverage, Critical+High, median CVE age, tech-debt grade, etc.)
 *   - Language & ecosystem stack
 *   - Package age (oldest per repo, age buckets, probable EOL leaderboard)
 *   - Version drift (per-repo stacked bars + top-20 lagging packages)
 *   - Vulnerability age (severity x age stacked bars, time-bomb table, C+H by repo)
 *   - Repository hygiene (SBOM grade donut, archived/no-graph counts, pushedAt activity)
 *   - Supply chain & M&A red flags (license risk, GPL/AGPL on direct, EOL runtimes,
 *     dep-confusion, malware, unpinned actions)
 *   - Tech-debt composite (weighted 0-100 with breakdown + per-repo CSV export)
 *
 * Renders entirely with CSS bars / inline SVG donuts (no chart library, keeping the
 * airgapped allowlist unchanged).
 */

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

    await loadAnalysesList('analysisSelector', storageManager, document.getElementById('noDataSection'));

    async function loadInsightsData() {
        showFilterLoading('insights-page-content');
        try {
            const analysisSelector = document.getElementById('analysisSelector');
            if (!analysisSelector) {
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
                    const container = document.getElementById('insights-page-content');
                    const html = generateInsightsHTML(data);
                    safeSetHTML(container, html);
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

/**
 * Build all per-page aggregates we need from the analysisData blob.
 * Pure function — easy to unit-test if we ever add a test harness.
 *
 * @param {Object} analysisData - The shape returned by storageManager.getCombinedData()
 *                                 / loadAnalysisDataForOrganization() under `.data`.
 */
function buildInsights(analysisData) {
    const allDeps = analysisData.allDependencies || [];
    const allRepos = analysisData.allRepositories || [];
    const vulnAnalysis = analysisData.vulnerabilityAnalysis || null;
    const malwareAnalysis = analysisData.malwareAnalysis || null;
    const licenseAnalysis = analysisData.licenseAnalysis || null;
    const qualityAnalysis = analysisData.qualityAnalysis || null;
    const ghActions = analysisData.githubActionsAnalysis || null;
    const languageStats = analysisData.languageStats || [];

    const totalDeps = allDeps.length;
    const directCount = allDeps.filter(d => Array.isArray(d.directIn) && d.directIn.length > 0).length;
    const transitiveCount = totalDeps - directCount;

    // `languageStats` ships in two shapes: a sorted array `[{language, count, uniqueDependencies}]`
    // for single-analysis loads (`SBOMProcessor.getLanguageStats`), and an aggregated map
    // `{language: count}` for the "All Analyses" combined view (`StorageManager.getCombinedData`).
    // Normalise to the array form so downstream renderers can rely on `.slice()` / `.sort()`.
    const normalizedLanguageStats = normalizeLanguageStats(languageStats);

    const reposWithSbom = allRepos.filter(r => r.hasDependencyGraph !== false && r.totalDependencies > 0).length;
    const reposWithoutSbom = allRepos.filter(r => r.hasDependencyGraph === false).length;
    const reposArchived = allRepos.filter(r => r.archived).length;
    const totalRepos = allRepos.length;

    const driftStats = computeDriftStats(allDeps);
    const ageStats = computeAgeStats(allDeps);
    const vulnAgeStats = computeVulnAgeStats(vulnAnalysis, allDeps);
    const eolStats = computeEolStats(allDeps);
    const licenseStats = computeLicenseStats(allDeps, licenseAnalysis);
    const repoHygiene = computeRepoHygiene(allRepos);
    const supplyChain = computeSupplyChainStats(allDeps, malwareAnalysis, ghActions);

    const perRepo = computePerRepoStats(allRepos, allDeps, vulnAnalysis, ghActions);
    const techDebt = computeTechDebt({
        driftStats, vulnAgeStats, ageStats, licenseStats, qualityAnalysis,
        eolStats, supplyChain, totalDeps
    });

    return {
        totalRepos, reposWithSbom, reposWithoutSbom, reposArchived,
        totalDeps, directCount, transitiveCount,
        driftStats, ageStats, vulnAgeStats, eolStats, licenseStats,
        repoHygiene, supplyChain, qualityAnalysis,
        languageStats: normalizedLanguageStats,
        perRepo, techDebt,
        analysisName: analysisData._analysisName || ''
    };
}

/**
 * Normalise `languageStats` to the canonical `[{language, count, uniqueDependencies?}]`
 * array shape, regardless of whether storage handed us the per-analysis array form or the
 * combined-view object form.
 */
function normalizeLanguageStats(languageStats) {
    if (Array.isArray(languageStats)) {
        return languageStats.filter(l => l && l.language);
    }
    if (languageStats && typeof languageStats === 'object') {
        return Object.entries(languageStats).map(([language, value]) => {
            let count = 0;
            if (typeof value === 'number') count = value;
            else if (value && typeof value === 'object' && typeof value.count === 'number') count = value.count;
            else count = parseInt(value, 10) || 0;
            return { language, count, uniqueDependencies: value?.uniqueDependencies || 0 };
        }).sort((a, b) => b.count - a.count);
    }
    return [];
}

function computeDriftStats(allDeps) {
    let withDrift = 0, major = 0, minor = 0, patch = 0, current = 0;
    const lagging = [];

    for (const dep of allDeps) {
        const drift = dep.versionDrift;
        if (!drift || !drift.latestVersion) continue;
        withDrift++;
        if (drift.hasMajorUpdate) {
            major++;
            const repoCount = (dep.repositories || []).length || 1;
            lagging.push({
                name: dep.name,
                version: dep.version,
                latestVersion: drift.latestVersion,
                repoCount,
                ecosystem: dep.category?.ecosystem || '',
                kind: 'major',
                score: repoCount * 3
            });
        } else if (drift.hasMinorUpdate) {
            minor++;
            const repoCount = (dep.repositories || []).length || 1;
            lagging.push({
                name: dep.name,
                version: dep.version,
                latestVersion: drift.latestVersion,
                repoCount,
                ecosystem: dep.category?.ecosystem || '',
                kind: 'minor',
                score: repoCount * 1
            });
        } else if (drift.latestVersion && (window.normalizeVersion ? window.normalizeVersion(drift.latestVersion) : drift.latestVersion) !==
            (window.normalizeVersion ? window.normalizeVersion(dep.version) : dep.version)) {
            patch++;
        } else {
            current++;
        }
    }

    lagging.sort((a, b) => b.score - a.score);
    return { withDrift, major, minor, patch, current, top: lagging.slice(0, 20), majorPct: withDrift ? (major / withDrift) * 100 : 0 };
}

function computeAgeStats(allDeps) {
    const buckets = { '<6m': 0, '6-12m': 0, '1-2y': 0, '2-3y': 0, '3-5y': 0, '>5y': 0 };
    let withAge = 0;
    let probableEol = 0;
    const probableEolList = [];
    const oldestPerRepo = new Map();

    for (const dep of allDeps) {
        const months = dep.staleness?.monthsSinceRelease;
        if (typeof months !== 'number' || isNaN(months)) continue;
        withAge++;
        if (months < 6) buckets['<6m']++;
        else if (months < 12) buckets['6-12m']++;
        else if (months < 24) buckets['1-2y']++;
        else if (months < 36) buckets['2-3y']++;
        else if (months < 60) buckets['3-5y']++;
        else buckets['>5y']++;

        if (dep.staleness?.isProbableEOL) {
            probableEol++;
            probableEolList.push({
                name: dep.name,
                version: dep.version,
                months,
                reason: dep.staleness.probableEOLReason || 'Unknown',
                ecosystem: dep.category?.ecosystem || '',
                repoCount: (dep.repositories || []).length || 1
            });
        }

        for (const repoKey of (dep.repositories || [])) {
            const cur = oldestPerRepo.get(repoKey);
            if (!cur || months > cur.months) {
                oldestPerRepo.set(repoKey, {
                    name: dep.name,
                    version: dep.version,
                    months,
                    ecosystem: dep.category?.ecosystem || ''
                });
            }
        }
    }

    probableEolList.sort((a, b) => b.months - a.months);

    return {
        buckets,
        withAge,
        coveragePct: allDeps.length ? (withAge / allDeps.length) * 100 : 0,
        probableEol,
        probableEolTop: probableEolList.slice(0, 25),
        oldestPerRepo
    };
}

function computeVulnAgeStats(vulnAnalysis, allDeps) {
    const buckets = {
        '<30d': { critical: 0, high: 0, medium: 0, low: 0 },
        '30-90d': { critical: 0, high: 0, medium: 0, low: 0 },
        '90d-1y': { critical: 0, high: 0, medium: 0, low: 0 },
        '1-2y': { critical: 0, high: 0, medium: 0, low: 0 },
        '>2y': { critical: 0, high: 0, medium: 0, low: 0 }
    };
    const ages = [];
    const timeBombs = [];
    const perRepoCH = new Map();
    let total = 0;

    if (!vulnAnalysis || !vulnAnalysis.vulnerableDependencies) {
        return { buckets, totalCves: 0, medianAgeDays: null, timeBombs: [], perRepoCH };
    }

    const driftMap = new Map();
    for (const dep of allDeps) {
        if (dep.versionDrift?.latestVersion) {
            driftMap.set(`${dep.name}@${dep.version}`, dep.versionDrift);
        }
    }

    const now = Date.now();
    for (const vDep of vulnAnalysis.vulnerableDependencies) {
        const key = `${vDep.name}@${vDep.version}`;
        const drift = vDep.versionDrift || driftMap.get(key) || null;
        for (const vuln of (vDep.vulnerabilities || [])) {
            if (vuln.kind === 'malware') continue;
            total++;
            const sev = String(vuln.severity || 'unknown').toLowerCase();
            const sevKey = sev === 'critical' || sev === 'high' || sev === 'medium' || sev === 'low' ? sev : 'low';
            const pubMs = vuln.published ? Date.parse(vuln.published) : NaN;
            const ageDays = isFinite(pubMs) ? Math.max(0, Math.floor((now - pubMs) / (24 * 3600 * 1000))) : null;
            if (ageDays !== null) {
                ages.push(ageDays);
                let bucket;
                if (ageDays < 30) bucket = '<30d';
                else if (ageDays < 90) bucket = '30-90d';
                else if (ageDays < 365) bucket = '90d-1y';
                else if (ageDays < 730) bucket = '1-2y';
                else bucket = '>2y';
                buckets[bucket][sevKey]++;
            }

            if (ageDays !== null && ageDays >= 90 && drift && drift.latestVersion && (sevKey === 'critical' || sevKey === 'high')) {
                timeBombs.push({
                    pkg: vDep.name,
                    version: vDep.version,
                    ecosystem: vDep.ecosystem || vDep.category?.ecosystem || '',
                    cveId: vuln.id,
                    severity: sevKey,
                    ageDays,
                    fixVersion: drift.latestVersion,
                    summary: vuln.summary || ''
                });
            }

            if (sevKey === 'critical' || sevKey === 'high') {
                for (const repoKey of (vDep.repositories || [])) {
                    if (!perRepoCH.has(repoKey)) perRepoCH.set(repoKey, { critical: 0, high: 0 });
                    perRepoCH.get(repoKey)[sevKey]++;
                }
            }
        }
    }

    ages.sort((a, b) => a - b);
    let medianAgeDays = null;
    if (ages.length) {
        const mid = Math.floor(ages.length / 2);
        medianAgeDays = ages.length % 2 ? ages[mid] : Math.round((ages[mid - 1] + ages[mid]) / 2);
    }

    timeBombs.sort((a, b) => {
        const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const aRank = sevOrder[a.severity] ?? 9;
        const bRank = sevOrder[b.severity] ?? 9;
        if (aRank !== bRank) return aRank - bRank;
        return b.ageDays - a.ageDays;
    });

    return { buckets, totalCves: total, medianAgeDays, timeBombs: timeBombs.slice(0, 50), perRepoCH };
}

function computeEolStats(allDeps) {
    const eolItems = [];
    const eosItems = [];
    for (const dep of allDeps) {
        const eox = dep.eoxStatus;
        if (!eox) continue;
        if (eox.isEOL) {
            eolItems.push({
                name: dep.name,
                version: dep.version,
                ecosystem: dep.category?.ecosystem || '',
                eolDate: eox.eolDate || null,
                product: eox.productMatched || null,
                successor: eox.successor || null,
                repoCount: (dep.repositories || []).length || 1
            });
        } else if (eox.isEOS) {
            eosItems.push({
                name: dep.name,
                version: dep.version,
                ecosystem: dep.category?.ecosystem || '',
                eosDate: eox.eosDate || null,
                product: eox.productMatched || null,
                repoCount: (dep.repositories || []).length || 1
            });
        }
    }
    return { eolCount: eolItems.length, eosCount: eosItems.length, eolItems, eosItems };
}

function computeLicenseStats(allDeps, licenseAnalysis) {
    const summary = licenseAnalysis?.summary || null;
    const conflicts = licenseAnalysis?.conflicts || [];
    const high = summary?.riskBreakdown?.high || 0;
    const medium = summary?.riskBreakdown?.medium || 0;
    const low = summary?.riskBreakdown?.low || 0;
    const totalLicensed = summary?.licensedDependencies || 0;

    const COPYLEFT_RX = /(GPL|AGPL|LGPL|MPL|EPL|CDDL|OSL|EUPL)/i;
    const directHighRisk = [];
    for (const dep of allDeps) {
        const licStr = dep.licenseFull || dep.license || '';
        const isDirect = Array.isArray(dep.directIn) && dep.directIn.length > 0;
        if (!isDirect) continue;
        if (licStr && COPYLEFT_RX.test(licStr)) {
            directHighRisk.push({
                name: dep.name,
                version: dep.version,
                license: licStr,
                ecosystem: dep.category?.ecosystem || '',
                repoCount: (dep.repositories || []).length || 1,
                directIn: dep.directIn || []
            });
        }
    }
    directHighRisk.sort((a, b) => b.repoCount - a.repoCount);

    return {
        high, medium, low, totalLicensed,
        conflicts: conflicts.slice(0, 25),
        directHighRisk: directHighRisk.slice(0, 25),
        highRiskShare: totalLicensed ? high / totalLicensed : 0
    };
}

function computeRepoHygiene(allRepos) {
    const grades = { A: 0, B: 0, C: 0, D: 0, F: 0, 'N/A': 0 };
    const noSbom = [];
    const noGraph = [];
    const archived = [];
    const activityBuckets = { '<30d': 0, '<90d': 0, '<1y': 0, '>1y': 0, archived: 0, unknown: 0 };

    const now = Date.now();

    for (const repo of allRepos) {
        const grade = repo.qualityAssessment?.grade || 'N/A';
        if (grades[grade] !== undefined) grades[grade]++;
        else grades['N/A']++;

        if (repo.hasDependencyGraph === false) {
            noGraph.push(`${repo.owner}/${repo.name}`);
            noSbom.push(`${repo.owner}/${repo.name}`);
        }
        if (repo.archived) archived.push(`${repo.owner}/${repo.name}`);

        if (repo.archived) {
            activityBuckets.archived++;
        } else if (repo.pushedAt) {
            const ms = Date.parse(repo.pushedAt);
            if (!isFinite(ms)) {
                activityBuckets.unknown++;
            } else {
                const days = (now - ms) / (24 * 3600 * 1000);
                if (days < 30) activityBuckets['<30d']++;
                else if (days < 90) activityBuckets['<90d']++;
                else if (days < 365) activityBuckets['<1y']++;
                else activityBuckets['>1y']++;
            }
        } else {
            activityBuckets.unknown++;
        }
    }
    return { grades, noSbom, noGraph, archived, activityBuckets };
}

function computeSupplyChainStats(allDeps, malwareAnalysis, ghActions) {
    const depConfusion = allDeps.filter(d => d.registryNotFound || d.namespaceNotFound).length;
    const malwareCount = malwareAnalysis?.maliciousPackages?.length
        || malwareAnalysis?.totalMaliciousPackages
        || (malwareAnalysis?.affectedPackages?.length || 0);
    const unpinnedActions = (() => {
        if (!ghActions || !ghActions.findings) return 0;
        return ghActions.findings.filter(f =>
            f.ruleId === 'UNPINNED_ACTION_REFERENCE' || f.ruleId === 'MUTABLE_TAG_REFERENCE'
        ).length;
    })();
    const totalActions = ghActions?.totalActions || 0;
    return { depConfusion, malwareCount, unpinnedActions, totalActions };
}

function computePerRepoStats(allRepos, allDeps, vulnAnalysis, ghActions) {
    const depsByRepo = new Map();
    for (const dep of allDeps) {
        for (const repoKey of (dep.repositories || [])) {
            if (!depsByRepo.has(repoKey)) depsByRepo.set(repoKey, []);
            depsByRepo.get(repoKey).push(dep);
        }
    }

    const result = [];
    const now = Date.now();
    for (const repo of allRepos) {
        const repoKey = `${repo.owner}/${repo.name}`;
        const deps = depsByRepo.get(repoKey) || [];
        const driftCounts = { major: 0, minor: 0, patch: 0, current: 0, withDrift: 0, total: deps.length };
        const ageBuckets = { '<6m': 0, '6-12m': 0, '1-2y': 0, '2-3y': 0, '3-5y': 0, '>5y': 0 };
        let oldest = null;

        for (const dep of deps) {
            const drift = dep.versionDrift;
            if (drift && drift.latestVersion) {
                driftCounts.withDrift++;
                if (drift.hasMajorUpdate) driftCounts.major++;
                else if (drift.hasMinorUpdate) driftCounts.minor++;
                else if ((window.normalizeVersion ? window.normalizeVersion(drift.latestVersion) : drift.latestVersion) !==
                    (window.normalizeVersion ? window.normalizeVersion(dep.version) : dep.version)) {
                    driftCounts.patch++;
                } else {
                    driftCounts.current++;
                }
            }

            const months = dep.staleness?.monthsSinceRelease;
            if (typeof months === 'number' && !isNaN(months)) {
                if (months < 6) ageBuckets['<6m']++;
                else if (months < 12) ageBuckets['6-12m']++;
                else if (months < 24) ageBuckets['1-2y']++;
                else if (months < 36) ageBuckets['2-3y']++;
                else if (months < 60) ageBuckets['3-5y']++;
                else ageBuckets['>5y']++;
                if (!oldest || months > oldest.months) {
                    oldest = { name: dep.name, version: dep.version, months, ecosystem: dep.category?.ecosystem || '' };
                }
            }
        }

        let crit = 0, high = 0, med = 0, low = 0;
        if (vulnAnalysis && Array.isArray(vulnAnalysis.vulnerableDependencies)) {
            for (const vDep of vulnAnalysis.vulnerableDependencies) {
                if (!Array.isArray(vDep.repositories) || !vDep.repositories.includes(repoKey)) continue;
                for (const v of (vDep.vulnerabilities || [])) {
                    if (v.kind === 'malware') continue;
                    const s = String(v.severity || '').toLowerCase();
                    if (s === 'critical') crit++;
                    else if (s === 'high') high++;
                    else if (s === 'medium' || s === 'moderate') med++;
                    else if (s === 'low') low++;
                }
            }
        }

        let activity = 'unknown';
        if (repo.archived) activity = 'archived';
        else if (repo.pushedAt) {
            const ms = Date.parse(repo.pushedAt);
            if (isFinite(ms)) {
                const days = (now - ms) / (24 * 3600 * 1000);
                if (days < 30) activity = '<30d';
                else if (days < 90) activity = '<90d';
                else if (days < 365) activity = '<1y';
                else activity = '>1y';
            }
        }

        const repoActions = (ghActions?.repositories || []).find(r => r.repository === repoKey);
        const unpinned = (repoActions?.findings || []).filter(f =>
            f.ruleId === 'UNPINNED_ACTION_REFERENCE' || f.ruleId === 'MUTABLE_TAG_REFERENCE'
        ).length;

        result.push({
            repoKey,
            owner: repo.owner,
            name: repo.name,
            archived: !!repo.archived,
            hasDependencyGraph: repo.hasDependencyGraph !== false,
            grade: repo.qualityAssessment?.grade || 'N/A',
            primaryLanguage: repo.primaryLanguage || repo.language || null,
            languages: repo.languages || [],
            depCount: deps.length,
            directDepCount: (repo.directDependencies || []).length,
            driftCounts,
            ageBuckets,
            oldest,
            critical: crit,
            high,
            medium: med,
            low,
            unpinnedActions: unpinned,
            pushedAt: repo.pushedAt || null,
            activity
        });
    }
    return result;
}

function computeTechDebt(parts) {
    const { driftStats, vulnAgeStats, ageStats, licenseStats, qualityAnalysis,
        eolStats, supplyChain, totalDeps } = parts;

    const driftMajor = driftStats.withDrift ? driftStats.major / driftStats.withDrift : 0;
    const driftMinor = driftStats.withDrift ? driftStats.minor / driftStats.withDrift : 0;
    const driftScore = clamp01(driftMajor * 0.75 + driftMinor * 0.25 / 3); // major dominates

    let vulnScore = 0;
    if (vulnAgeStats && totalDeps > 0) {
        let crit = 0, high = 0, med = 0;
        for (const bucket of Object.values(vulnAgeStats.buckets)) {
            crit += bucket.critical; high += bucket.high; med += bucket.medium;
        }
        const weighted = crit * 10 + high * 4 + med * 1;
        vulnScore = clamp01(weighted / Math.max(1, totalDeps) / 1.0);
    }

    const ageStaleShare = (() => {
        if (!ageStats.withAge) return 0;
        const stale = (ageStats.buckets['2-3y'] || 0) + (ageStats.buckets['3-5y'] || 0) + (ageStats.buckets['>5y'] || 0) + (eolStats.eolCount || 0);
        return clamp01(stale / ageStats.withAge);
    })();

    const licenseScore = clamp01(licenseStats.highRiskShare * 1.5 + (licenseStats.conflicts.length ? 0.2 : 0));
    const sbomScore = clamp01(qualityAnalysis ? 1 - (qualityAnalysis.averageScore || qualityAnalysis.overallScore || 0) / 100 : 0.5);
    const eolScore = totalDeps ? clamp01(((eolStats.eolCount + eolStats.eosCount * 0.5) / totalDeps) * 5) : 0;
    const hygiene = (() => {
        const a = supplyChain.totalActions || 0;
        const u = a ? supplyChain.unpinnedActions / a : 0;
        const dc = totalDeps ? supplyChain.depConfusion / totalDeps : 0;
        const mw = supplyChain.malwareCount ? 1 : 0;
        return clamp01(u * 0.5 + dc * 5 + mw * 0.5);
    })();

    const components = [
        { id: 'drift', label: 'Version drift', weight: 0.25, score: driftScore },
        { id: 'vulns', label: 'Vulnerability density', weight: 0.25, score: vulnScore },
        { id: 'age',   label: 'Stale / aged packages', weight: 0.15, score: ageStaleShare },
        { id: 'license', label: 'License risk', weight: 0.10, score: licenseScore },
        { id: 'sbom', label: 'SBOM quality (inverse)', weight: 0.10, score: sbomScore },
        { id: 'eol',  label: 'EOL runtime exposure', weight: 0.10, score: eolScore },
        { id: 'hygiene', label: 'Supply-chain hygiene', weight: 0.05, score: hygiene }
    ];

    const debtScore = components.reduce((acc, c) => acc + c.weight * c.score, 0);
    const score100 = Math.round((1 - debtScore) * 100);
    const grade = scoreToGrade(score100);
    return { components, score100, debt100: Math.round(debtScore * 100), grade };
}

function clamp01(v) {
    if (!isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

function scoreToGrade(score100) {
    if (score100 >= 90) return 'A';
    if (score100 >= 80) return 'B';
    if (score100 >= 70) return 'C';
    if (score100 >= 60) return 'D';
    return 'F';
}

// =============================================================================
// RENDERING
// =============================================================================

function generateInsightsHTML(orgData) {
    const data = orgData?.data || {};
    const ins = buildInsights(data);
    window.__insightsCache = ins;

    return [
        renderKpiStrip(ins),
        renderCoverageNotice(ins),
        renderLanguageSection(ins, data),
        renderAgeSection(ins),
        renderDriftSection(ins),
        renderVulnAgeSection(ins),
        renderHygieneSection(ins),
        renderRedFlagsSection(ins),
        renderTechDebtSection(ins)
    ].join('\n');
}

function renderKpiStrip(ins) {
    const sbomCoveragePct = ins.totalRepos ? Math.round((ins.reposWithSbom / ins.totalRepos) * 100) : 0;
    const driftMajorPct = ins.driftStats.withDrift ? Math.round((ins.driftStats.major / ins.driftStats.withDrift) * 100) : 0;
    const td = ins.techDebt;
    const tiles = [
        { icon: 'fa-code-branch', label: 'Repos analysed', value: ins.totalRepos, sub: `${ins.reposWithSbom} with SBOM (${sbomCoveragePct}%)` },
        { icon: 'fa-cubes', label: 'Total dependencies', value: ins.totalDeps.toLocaleString(), sub: `${ins.directCount.toLocaleString()} direct / ${ins.transitiveCount.toLocaleString()} transitive` },
        { icon: 'fa-shield-alt', label: 'Open Critical+High', value: countCritHigh(ins.vulnAgeStats), sub: 'across all CVEs' },
        { icon: 'fa-stopwatch', label: 'Median CVE age', value: ins.vulnAgeStats.medianAgeDays !== null ? `${ins.vulnAgeStats.medianAgeDays} d` : 'N/A', sub: 'time-to-fix proxy' },
        { icon: 'fa-skull-crossbones', label: 'EOL components', value: ins.eolStats.eolCount, sub: `${ins.eolStats.eosCount} EOS` },
        { icon: 'fa-balance-scale', label: 'High-risk licenses', value: ins.licenseStats.high, sub: `${ins.licenseStats.conflicts.length} conflicts` },
        { icon: 'fa-arrow-up-right-dots', label: 'Major drift', value: `${driftMajorPct}%`, sub: `${ins.driftStats.major}/${ins.driftStats.withDrift} deps` },
        // Single-orientation framing: the letter grade (A best → F worst) is the headline,
        // the parenthetical score reinforces it (higher = healthier). We deliberately do NOT
        // surface the inverse "debt index" here — pairing two numbers with opposite
        // orientations on the same tile was the main source of confusion in the v1 layout.
        { icon: 'fa-award', label: 'Tech-debt grade', value: `<span class="badge bg-${gradeColor(td.grade)} fs-3 px-3">${td.grade}</span>`, sub: `health score ${td.score100}/100 — higher is healthier` }
    ];

    const html = tiles.map(t => `
        <div class="col">
            <div class="card h-100">
                <div class="card-body text-center">
                    <i class="fas ${t.icon} fa-2x text-primary mb-2"></i>
                    <h3 class="mb-1">${t.value}</h3>
                    <p class="mb-1 fw-semibold">${escapeHtml(t.label)}</p>
                    <p class="mb-0 small text-muted">${escapeHtml(t.sub)}</p>
                </div>
            </div>
        </div>
    `).join('');

    return `
        <div class="card mb-4">
            <div class="card-body">
                <div class="row row-cols-2 row-cols-md-4 g-2">
                    ${html}
                </div>
            </div>
        </div>
    `;
}

function countCritHigh(vulnAgeStats) {
    let c = 0;
    for (const b of Object.values(vulnAgeStats.buckets)) {
        c += (b.critical || 0) + (b.high || 0);
    }
    return c;
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
    const totalLangCount = langStats.reduce((acc, l) => acc + (l.count || 0), 0) || 1;
    const langBars = langStats.slice(0, 12).map(l => {
        const pct = ((l.count || 0) / totalLangCount) * 100;
        const uniq = l.uniqueDependencies || 0;
        return `
            <div class="mb-2">
                <div class="d-flex justify-content-between small">
                    <span>${escapeHtml(l.language || 'Unknown')}</span>
                    <span class="text-muted" title="${(l.count || 0).toLocaleString()} dep×repo occurrences from ${uniq.toLocaleString()} unique packages">${(l.count || 0).toLocaleString()} occurrences (${pct.toFixed(1)}%)</span>
                </div>
                <div class="progress" style="height: 8px;">
                    <div class="progress-bar bg-info" role="progressbar" style="width: ${pct}%;" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
            </div>
        `;
    }).join('');

    const polyglot = ins.perRepo.filter(r => (r.languages || []).length >= 3);
    const polyglotRows = polyglot.slice(0, 25).map(r => `
        <tr>
            <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
            <td>${escapeHtml(r.primaryLanguage || '—')}</td>
            <td>${(r.languages || []).map(l => `<span class="badge bg-secondary me-1">${escapeHtml(l)}</span>`).join('') || '<span class="text-muted">—</span>'}</td>
            <td class="text-end">${r.depCount.toLocaleString()}</td>
        </tr>
    `).join('');

    const repoLangRows = ins.perRepo.slice(0, 50).map(r => `
        <tr>
            <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
            <td>${escapeHtml(r.primaryLanguage || '—')}</td>
            <td>${(r.languages || []).slice(0, 6).map(l => `<span class="badge bg-secondary me-1">${escapeHtml(l)}</span>`).join('') || '<span class="text-muted">—</span>'}</td>
            <td class="text-end">${r.depCount.toLocaleString()}</td>
        </tr>
    `).join('');

    return `
        <section class="card mb-4">
            <div class="card-header"><h5 class="mb-0"><i class="fas fa-language me-2"></i>Language &amp; ecosystem stack</h5></div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-1">Dependency mix by ecosystem</h6>
                        <p class="small text-muted mb-3">Each count is a package-manager dependency tagged to its ecosystem language, summed across every repository it appears in (a package used in 5 repos counts 5 times). YAML rows are GitHub Actions workflow steps. <strong>Not</strong> source-code line counts or file counts.</p>
                        ${langBars || '<p class="text-muted small mb-0">No language statistics available.</p>'}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Polyglot repositories <span class="text-muted small">(&ge; 3 ecosystems)</span></h6>
                        ${polyglot.length === 0 ? '<p class="text-muted small mb-0">No polyglot repositories detected.</p>' : `
                            <div class="table-responsive" style="max-height: 320px;">
                                <table class="table table-sm table-striped">
                                    <thead><tr><th>Repository</th><th>Primary</th><th>Ecosystems</th><th class="text-end">Deps</th></tr></thead>
                                    <tbody>${polyglotRows}</tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
                <hr>
                <div class="d-flex justify-content-between align-items-center mb-2 cursor-pointer" data-bs-toggle="collapse" data-bs-target="#perRepoLangStackCollapse" aria-expanded="false" aria-controls="perRepoLangStackCollapse" role="button">
                    <h6 class="text-muted text-uppercase small mb-0">Per-repository language stack <span class="text-muted small text-lowercase">(${ins.perRepo.length} ${ins.perRepo.length === 1 ? 'repository' : 'repositories'}${ins.perRepo.length > 50 ? ', top 50 shown' : ''})</span></h6>
                    <i class="fas fa-chevron-down small text-muted"></i>
                </div>
                <div class="collapse" id="perRepoLangStackCollapse">
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead><tr><th>Repository</th><th>Primary (GitHub)</th><th>Ecosystems (from PURLs)</th><th class="text-end">Deps</th></tr></thead>
                            <tbody>${repoLangRows || '<tr><td colspan="4" class="text-muted">No repositories.</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderAgeSection(ins) {
    const total = Object.values(ins.ageStats.buckets).reduce((a, b) => a + b, 0) || 1;
    const labels = ['<6m', '6-12m', '1-2y', '2-3y', '3-5y', '>5y'];
    const colors = ['success', 'info', 'primary', 'warning', 'orange', 'danger'];
    const buckets = labels.map((label, i) => ({
        label,
        count: ins.ageStats.buckets[label] || 0,
        pct: ((ins.ageStats.buckets[label] || 0) / total) * 100,
        color: colors[i]
    }));

    const segments = buckets.map(b => `
        <div class="progress-bar bg-${b.color === 'orange' ? 'warning' : b.color}" role="progressbar"
             style="width: ${b.pct}%;${b.color === 'orange' ? ' background-color: #fd7e14;' : ''}"
             title="${b.label}: ${b.count} (${b.pct.toFixed(1)}%)"
             aria-valuenow="${b.pct}" aria-valuemin="0" aria-valuemax="100">
        </div>
    `).join('');

    const legend = buckets.map(b => `
        <span class="me-3 small">
            <span class="d-inline-block me-1" style="width:10px; height:10px; vertical-align: middle; background-color: ${cssColorForBucket(b.color)};"></span>
            ${escapeHtml(b.label)}: <strong>${b.count}</strong>
        </span>
    `).join('');

    const oldestRows = ins.perRepo
        .filter(r => r.oldest)
        .sort((a, b) => (b.oldest?.months || 0) - (a.oldest?.months || 0))
        .slice(0, 30)
        .map(r => `
            <tr>
                <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
                <td>${escapeHtml(r.oldest.name)}@${escapeHtml(r.oldest.version)}</td>
                <td><span class="badge bg-secondary">${escapeHtml(r.oldest.ecosystem || '—')}</span></td>
                <td class="text-end">${r.oldest.months} mo</td>
                <td class="text-end">${formatYears(r.oldest.months)}</td>
            </tr>
        `).join('');

    const eolRows = ins.ageStats.probableEolTop.map(p => `
        <tr>
            <td>${escapeHtml(p.name)}@${escapeHtml(p.version)}</td>
            <td><span class="badge bg-secondary">${escapeHtml(p.ecosystem || '—')}</span></td>
            <td class="text-end">${p.months} mo</td>
            <td class="text-end">${p.repoCount}</td>
            <td class="small text-muted">${escapeHtml(p.reason)}</td>
        </tr>
    `).join('');

    return `
        <section class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0"><i class="fas fa-hourglass-half me-2"></i>Package age</h5>
                <span class="badge bg-secondary">Coverage: ${Math.round(ins.ageStats.coveragePct)}% of deps have publish-date data</span>
            </div>
            <div class="card-body">
                <h6 class="text-muted text-uppercase small mb-3">Portfolio age distribution</h6>
                <div class="progress mb-2" style="height: 24px;">${segments}</div>
                <div class="mb-4">${legend}</div>

                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Oldest dependency per repository</h6>
                        ${oldestRows ? `
                            <div class="table-responsive" style="max-height: 380px;">
                                <table class="table table-sm table-striped">
                                    <thead><tr><th>Repository</th><th>Package</th><th>Ecosystem</th><th class="text-end">Age</th><th class="text-end">~years</th></tr></thead>
                                    <tbody>${oldestRows}</tbody>
                                </table>
                            </div>` : '<p class="text-muted small mb-0">No publish-date data available for any repository.</p>'}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Probable EOL packages</h6>
                        ${ins.ageStats.probableEol === 0 ? '<p class="text-muted small mb-0">No probable-EOL packages detected.</p>' : `
                            <div class="table-responsive" style="max-height: 380px;">
                                <table class="table table-sm table-striped">
                                    <thead><tr><th>Package</th><th>Ecosystem</th><th class="text-end">Age</th><th class="text-end">Repos</th><th>Reason</th></tr></thead>
                                    <tbody>${eolRows}</tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        </section>
    `;
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
        .sort((a, b) => (b.driftCounts.major - a.driftCounts.major) || (b.driftCounts.minor - a.driftCounts.minor))
        .slice(0, 50);

    const rows = repos.map(r => {
        const dc = r.driftCounts;
        const total = dc.withDrift || 1;
        const pct = (n) => (n / total) * 100;
        return `
            <tr>
                <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
                <td style="min-width: 240px;">
                    <div class="progress" style="height: 16px;">
                        <div class="progress-bar bg-success" role="progressbar" style="width: ${pct(dc.current)}%;" title="Current: ${dc.current}"></div>
                        <div class="progress-bar bg-info" role="progressbar" style="width: ${pct(dc.patch)}%;" title="Patch behind: ${dc.patch}"></div>
                        <div class="progress-bar bg-warning text-dark" role="progressbar" style="width: ${pct(dc.minor)}%;" title="Minor behind: ${dc.minor}"></div>
                        <div class="progress-bar bg-danger" role="progressbar" style="width: ${pct(dc.major)}%;" title="Major behind: ${dc.major}"></div>
                    </div>
                </td>
                <td class="text-end small">${dc.current}/${dc.patch}/${dc.minor}/<strong class="text-danger">${dc.major}</strong></td>
                <td class="text-end small">${dc.withDrift}</td>
            </tr>
        `;
    }).join('');

    const topRows = ins.driftStats.top.map(p => `
        <tr>
            <td>${escapeHtml(p.name)}@${escapeHtml(p.version)} <span class="text-muted small">→ ${escapeHtml(p.latestVersion)}</span></td>
            <td><span class="badge bg-secondary">${escapeHtml(p.ecosystem || '—')}</span></td>
            <td><span class="badge bg-${p.kind === 'major' ? 'danger' : 'warning text-dark'}">${p.kind}</span></td>
            <td class="text-end">${p.repoCount}</td>
        </tr>
    `).join('');

    return `
        <section class="card mb-4">
            <div class="card-header"><h5 class="mb-0"><i class="fas fa-arrow-up-right-dots me-2"></i>Version drift</h5></div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Drift per repository</h6>
                        <p class="small text-muted mb-2">Stack order: <span class="badge bg-success">current</span> <span class="badge bg-info">patch</span> <span class="badge bg-warning text-dark">minor</span> <span class="badge bg-danger">major</span></p>
                        ${rows ? `
                            <div class="table-responsive" style="max-height: 450px;">
                                <table class="table table-sm table-striped align-middle">
                                    <thead><tr><th>Repository</th><th>Drift breakdown</th><th class="text-end">C/P/Mi/Ma</th><th class="text-end">Total</th></tr></thead>
                                    <tbody>${rows}</tbody>
                                </table>
                            </div>` : '<p class="text-muted small mb-0">No drift data available.</p>'}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Top 20 lagging packages <span class="text-muted small">(by repos × major)</span></h6>
                        ${topRows ? `
                            <div class="table-responsive" style="max-height: 450px;">
                                <table class="table table-sm table-striped">
                                    <thead><tr><th>Package</th><th>Ecosystem</th><th>Drift</th><th class="text-end">Repos</th></tr></thead>
                                    <tbody>${topRows}</tbody>
                                </table>
                            </div>` : '<p class="text-muted small mb-0">No drift data available.</p>'}
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderVulnAgeSection(ins) {
    const buckets = ['<30d', '30-90d', '90d-1y', '1-2y', '>2y'];
    let maxBucketTotal = 1;
    for (const b of buckets) {
        const v = ins.vulnAgeStats.buckets[b];
        const t = (v.critical || 0) + (v.high || 0) + (v.medium || 0) + (v.low || 0);
        if (t > maxBucketTotal) maxBucketTotal = t;
    }

    const rows = buckets.map(b => {
        const v = ins.vulnAgeStats.buckets[b];
        const total = (v.critical || 0) + (v.high || 0) + (v.medium || 0) + (v.low || 0);
        const widthPct = (total / maxBucketTotal) * 100;
        const segPct = (n) => total ? (n / total) * 100 : 0;
        return `
            <tr>
                <td class="small"><strong>${escapeHtml(b)}</strong></td>
                <td style="min-width: 280px;">
                    <div class="progress" style="height: 18px; width: ${widthPct}%; min-width: ${total ? '40px' : '0'};">
                        <div class="progress-bar bg-danger" style="width: ${segPct(v.critical)}%;" title="Critical: ${v.critical}"></div>
                        <div class="progress-bar bg-warning text-dark" style="width: ${segPct(v.high)}%;" title="High: ${v.high}"></div>
                        <div class="progress-bar bg-info" style="width: ${segPct(v.medium)}%;" title="Medium: ${v.medium}"></div>
                        <div class="progress-bar bg-secondary" style="width: ${segPct(v.low)}%;" title="Low: ${v.low}"></div>
                    </div>
                </td>
                <td class="text-end small text-danger fw-bold">${v.critical}</td>
                <td class="text-end small text-warning fw-bold">${v.high}</td>
                <td class="text-end small text-info">${v.medium}</td>
                <td class="text-end small text-muted">${v.low}</td>
                <td class="text-end small fw-semibold">${total}</td>
            </tr>
        `;
    }).join('');

    const tbRows = ins.vulnAgeStats.timeBombs.map(t => `
        <tr>
            <td>${escapeHtml(t.pkg)}@${escapeHtml(t.version)}</td>
            <td><span class="badge bg-secondary">${escapeHtml(t.ecosystem || '—')}</span></td>
            <td><a href="https://osv.dev/vulnerability/${encodeURIComponent(t.cveId)}" target="_blank" rel="noreferrer noopener">${escapeHtml(t.cveId)}</a></td>
            <td><span class="badge severity-${t.severity}">${escapeHtml(t.severity)}</span></td>
            <td class="text-end">${t.ageDays} d</td>
            <td><code class="small">${escapeHtml(t.fixVersion)}</code></td>
        </tr>
    `).join('');

    const repoCH = Array.from(ins.vulnAgeStats.perRepoCH.entries())
        .map(([repoKey, c]) => ({ repoKey, ...c, total: (c.critical || 0) + (c.high || 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 30);
    const repoCHMax = Math.max(1, ...repoCH.map(r => r.total));
    const repoCHRows = repoCH.map(r => `
        <tr>
            <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
            <td style="min-width: 200px;">
                <div class="progress" style="height: 14px; width: ${(r.total / repoCHMax) * 100}%;">
                    <div class="progress-bar bg-danger" style="width: ${(r.critical / r.total) * 100}%;" title="Critical: ${r.critical}"></div>
                    <div class="progress-bar bg-warning" style="width: ${(r.high / r.total) * 100}%;" title="High: ${r.high}"></div>
                </div>
            </td>
            <td class="text-end small text-danger fw-bold">${r.critical}</td>
            <td class="text-end small text-warning fw-bold">${r.high}</td>
        </tr>
    `).join('');

    return `
        <section class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0"><i class="fas fa-stopwatch me-2"></i>Vulnerability age</h5>
                <span class="badge bg-secondary">${ins.vulnAgeStats.totalCves} CVEs · median age ${ins.vulnAgeStats.medianAgeDays !== null ? ins.vulnAgeStats.medianAgeDays + ' d' : 'N/A'}</span>
            </div>
            <div class="card-body">
                <h6 class="text-muted text-uppercase small mb-3">CVE age × severity</h6>
                <div class="table-responsive mb-4">
                    <table class="table table-sm table-borderless align-middle">
                        <thead class="small text-muted">
                            <tr><th>Age</th><th>Distribution</th><th class="text-end">C</th><th class="text-end">H</th><th class="text-end">M</th><th class="text-end">L</th><th class="text-end">Total</th></tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="7" class="text-muted">No CVEs found.</td></tr>'}</tbody>
                    </table>
                </div>
                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Time-bomb CVEs <span class="text-muted small">(&ge; 90d old, fix available, C/H)</span></h6>
                        ${tbRows ? `
                            <div class="table-responsive" style="max-height: 380px;">
                                <table class="table table-sm table-striped">
                                    <thead><tr><th>Package</th><th>Ecosystem</th><th>CVE</th><th>Severity</th><th class="text-end">Age</th><th>Fix</th></tr></thead>
                                    <tbody>${tbRows}</tbody>
                                </table>
                            </div>` : '<p class="text-muted small mb-0">No time-bomb CVEs detected.</p>'}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Critical+High by repository</h6>
                        ${repoCHRows ? `
                            <div class="table-responsive" style="max-height: 380px;">
                                <table class="table table-sm table-striped">
                                    <thead><tr><th>Repository</th><th>Distribution</th><th class="text-end">C</th><th class="text-end">H</th></tr></thead>
                                    <tbody>${repoCHRows}</tbody>
                                </table>
                            </div>` : '<p class="text-muted small mb-0">No Critical/High CVEs by repository.</p>'}
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderHygieneSection(ins) {
    const grades = ins.repoHygiene.grades;
    const total = Object.values(grades).reduce((a, b) => a + b, 0) || 1;
    const slices = [
        { key: 'A', color: '#198754', count: grades.A },
        { key: 'B', color: '#20c997', count: grades.B },
        { key: 'C', color: '#0dcaf0', count: grades.C },
        { key: 'D', color: '#ffc107', count: grades.D },
        { key: 'F', color: '#dc3545', count: grades.F },
        { key: 'N/A', color: '#adb5bd', count: grades['N/A'] }
    ];
    const donut = renderConicDonut(slices);

    const activity = ins.repoHygiene.activityBuckets;
    const activityTotal = Object.values(activity).reduce((a, b) => a + b, 0) || 1;
    const activityBars = [
        { label: '<30d', count: activity['<30d'], color: 'success' },
        { label: '<90d', count: activity['<90d'], color: 'info' },
        { label: '<1y', count: activity['<1y'], color: 'primary' },
        { label: '>1y', count: activity['>1y'], color: 'warning' },
        { label: 'archived', count: activity.archived, color: 'secondary' },
        { label: 'unknown', count: activity.unknown, color: 'light' }
    ].map(a => `
        <div class="mb-2">
            <div class="d-flex justify-content-between small">
                <span>${escapeHtml(a.label)}</span><span class="text-muted">${a.count}</span>
            </div>
            <div class="progress" style="height: 8px;">
                <div class="progress-bar bg-${a.color}" style="width: ${(a.count / activityTotal) * 100}%;"></div>
            </div>
        </div>
    `).join('');

    return `
        <section class="card mb-4">
            <div class="card-header"><h5 class="mb-0"><i class="fas fa-heart-pulse me-2"></i>Repository hygiene</h5></div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-md-4 text-center">
                        <h6 class="text-muted text-uppercase small mb-3">SBOM grade distribution</h6>
                        ${donut}
                        <div class="d-flex flex-wrap justify-content-center mt-3 small">
                            ${slices.map(s => `<span class="me-3"><span class="d-inline-block me-1" style="width:10px; height:10px; vertical-align: middle; background-color: ${s.color};"></span>${escapeHtml(s.key)}: <strong>${s.count}</strong></span>`).join('')}
                        </div>
                    </div>
                    <div class="col-md-4">
                        <h6 class="text-muted text-uppercase small mb-3">Repo activity (push-time)</h6>
                        ${activityBars}
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

function renderConicDonut(slices, centerLabel = 'repos') {
    const total = slices.reduce((a, b) => a + b.count, 0);
    if (total <= 0) {
        return '<div class="text-muted small">No data</div>';
    }
    let acc = 0;
    const stops = [];
    for (const s of slices) {
        if (!s.count) continue;
        const start = (acc / total) * 360;
        acc += s.count;
        const end = (acc / total) * 360;
        stops.push(`${s.color} ${start}deg ${end}deg`);
    }
    const gradient = stops.join(', ');
    return `
        <div class="d-inline-block position-relative" style="width: 180px; height: 180px;">
            <div style="width: 100%; height: 100%; border-radius: 50%; background: conic-gradient(${gradient});"></div>
            <div class="position-absolute top-50 start-50 translate-middle bg-white text-dark rounded-circle d-flex align-items-center justify-content-center" style="width: 110px; height: 110px;">
                <div class="text-center">
                    <div class="fw-bold fs-4">${total}</div>
                    <div class="small text-muted">${escapeHtml(centerLabel)}</div>
                </div>
            </div>
        </div>
    `;
}

function renderRedFlagsSection(ins) {
    const ls = ins.licenseStats;
    const licTotal = ls.high + ls.medium + ls.low;
    const licSlices = [
        { key: 'High', color: '#dc3545', count: ls.high },
        { key: 'Medium', color: '#ffc107', count: ls.medium },
        { key: 'Low', color: '#198754', count: ls.low }
    ];
    const licDonut = renderConicDonut(licSlices, 'deps');

    const sc = ins.supplyChain;
    // Each slice = a discrete supply-chain red-flag bucket; sizing the donut by raw
    // counts gives the reader an immediate read on which class of issue dominates the
    // portfolio (e.g. "almost all our findings are unpinned Actions" vs "EOL is
    // driving most of our risk"). Keeping the colour scheme aligned with the original
    // bullet-list icons (skull = malware, dep-confusion = orange, pin = warning yellow,
    // EOL = purple/info) so users transitioning from the v1 layout don't have to relearn
    // semantics.
    const scSlices = [
        { key: 'Malware', color: '#dc3545', count: sc.malwareCount,
          tooltip: 'Malicious-package matches (OSV.dev MAL-* / OpenSSF malicious-packages)' },
        { key: 'Dep-confusion', color: '#fd7e14', count: sc.depConfusion,
          tooltip: 'Dependency-confusion candidates (registry / namespace not found)' },
        { key: 'Unpinned actions', color: '#ffc107', count: sc.unpinnedActions,
          tooltip: `Unpinned / mutable-tag GitHub Actions (${sc.unpinnedActions} of ${sc.totalActions} action references)` },
        { key: 'EOL', color: '#6f42c1', count: ins.eolStats.eolCount,
          tooltip: 'End-of-life components per endoflife.date' },
        { key: 'EOS', color: '#0dcaf0', count: ins.eolStats.eosCount,
          tooltip: 'End-of-support components per endoflife.date' }
    ];
    const scTotal = scSlices.reduce((a, b) => a + b.count, 0);
    const scDonut = renderConicDonut(scSlices, 'findings');
    const scSubtitle = sc.totalActions
        ? `${scTotal} red-flag findings · ${sc.totalActions} Actions scanned`
        : `${scTotal} red-flag findings`;

    const directRows = ls.directHighRisk.map(r => `
        <tr>
            <td>${escapeHtml(r.name)}@${escapeHtml(r.version)}</td>
            <td><span class="badge bg-secondary">${escapeHtml(r.ecosystem || '—')}</span></td>
            <td><code class="small">${escapeHtml(r.license)}</code></td>
            <td class="text-end">${r.repoCount}</td>
        </tr>
    `).join('');

    const eolRows = ins.eolStats.eolItems.slice(0, 25).map(e => `
        <tr>
            <td>${escapeHtml(e.name)}@${escapeHtml(e.version)}</td>
            <td><span class="badge bg-secondary">${escapeHtml(e.ecosystem || '—')}</span></td>
            <td>${e.product ? `<a href="https://endoflife.date/${encodeURIComponent(e.product)}" target="_blank" rel="noreferrer noopener">${escapeHtml(e.product)}</a>` : '—'}</td>
            <td class="small text-muted">${escapeHtml(e.eolDate || '')}</td>
            <td class="text-end">${e.repoCount}</td>
        </tr>
    `).join('');

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
                        <div class="d-flex flex-wrap justify-content-center mt-3 small">
                            ${licSlices.map(s => `<span class="me-3"><span class="d-inline-block me-1" style="width:10px; height:10px; vertical-align: middle; background-color: ${s.color};"></span>${escapeHtml(s.key)}: <strong>${s.count}</strong></span>`).join('')}
                        </div>
                        <div class="text-muted small mt-2">${licTotal} licensed deps</div>
                    </div>
                    <div class="col-md-4">
                        <h6 class="text-muted text-uppercase small mb-3">Conflicts</h6>
                        ${conflicts}
                    </div>
                    <div class="col-md-4 text-center">
                        <h6 class="text-muted text-uppercase small mb-3">Supply-chain hygiene</h6>
                        ${scDonut}
                        <div class="d-flex flex-wrap justify-content-center mt-3 small">
                            ${scSlices.map(s => `<span class="me-3" title="${escapeHtml(s.tooltip)}"><span class="d-inline-block me-1" style="width:10px; height:10px; vertical-align: middle; background-color: ${s.color};"></span>${escapeHtml(s.key)}: <strong>${s.count}</strong></span>`).join('')}
                        </div>
                        <div class="text-muted small mt-2">${scSubtitle}</div>
                    </div>
                </div>
                <hr>
                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">Copyleft licenses on direct dependencies <span class="text-muted small">(GPL/AGPL/LGPL/MPL/EPL/CDDL/OSL/EUPL)</span></h6>
                        ${directRows ? `
                            <div class="table-responsive" style="max-height: 360px;">
                                <table class="table table-sm table-striped">
                                    <thead><tr><th>Package</th><th>Ecosystem</th><th>License</th><th class="text-end">Repos</th></tr></thead>
                                    <tbody>${directRows}</tbody>
                                </table>
                            </div>` : '<p class="text-muted small mb-0">No copyleft licenses found on direct dependencies.</p>'}
                    </div>
                    <div class="col-12">
                        <h6 class="text-muted text-uppercase small mb-3">EOL components <span class="text-muted small">(top 25)</span></h6>
                        ${eolRows ? `
                            <div class="table-responsive" style="max-height: 360px;">
                                <table class="table table-sm table-striped">
                                    <thead><tr><th>Package</th><th>Ecosystem</th><th>Product</th><th>EOL date</th><th class="text-end">Repos</th></tr></thead>
                                    <tbody>${eolRows}</tbody>
                                </table>
                            </div>` : '<p class="text-muted small mb-0">No EOL components detected.</p>'}
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderTechDebtSection(ins) {
    const td = ins.techDebt;
    const compRows = td.components.map(c => {
        const widthPct = c.score * 100;
        const barColor = c.score < 0.2 ? 'success' : (c.score < 0.5 ? 'warning' : 'danger');
        return `
            <tr>
                <td>${escapeHtml(c.label)}</td>
                <td class="text-end small text-muted">${(c.weight * 100).toFixed(0)}%</td>
                <td style="min-width: 220px;">
                    <div class="progress" style="height: 14px;">
                        <div class="progress-bar bg-${barColor === 'warning' ? 'warning text-dark' : barColor}" role="progressbar" style="width: ${widthPct}%;" title="Debt contribution: ${(c.score * 100).toFixed(1)}%"></div>
                    </div>
                </td>
                <td class="text-end small">${(c.score * 100).toFixed(1)}</td>
                <td class="text-end small text-muted">${(c.weight * c.score * 100).toFixed(1)}</td>
            </tr>
        `;
    }).join('');

    const perRepoSorted = ins.perRepo.slice(0).map(r => ({
        ...r,
        repoTechDebt: computeRepoTechDebt(r)
    })).sort((a, b) => b.repoTechDebt.debt100 - a.repoTechDebt.debt100);

    const repoRows = perRepoSorted.slice(0, 50).map(r => {
        const dc = r.driftCounts;
        const grade = scoreToGrade(r.repoTechDebt.score100);
        return `
            <tr>
                <td><a href="repos.html?repo=${encodeURIComponent(r.repoKey)}">${escapeHtml(r.repoKey)}</a></td>
                <td><span class="badge bg-${gradeColor(grade)}">${grade}</span></td>
                <td class="text-end fw-bold">${r.repoTechDebt.score100}</td>
                <td class="text-end text-muted small">${r.depCount.toLocaleString()}</td>
                <td class="text-end small text-danger">${r.critical}</td>
                <td class="text-end small text-warning">${r.high}</td>
                <td class="text-end small text-danger">${dc.major}</td>
                <td class="text-end small text-warning">${dc.minor}</td>
                <td class="text-end small text-muted">${escapeHtml(r.activity)}</td>
            </tr>
        `;
    }).join('');

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
                        <p class="small text-muted mb-3">Each row shows what fraction of that component's worst-case debt the portfolio currently carries (0 = perfect, 100 = maximum debt). The "Contribution" column is that debt level multiplied by the component's weight — sum the column and you get the overall debt index above.</p>
                        <table class="table table-sm align-middle mb-0">
                            <thead class="small text-muted"><tr><th>Component</th><th class="text-end">Weight</th><th>Debt level (lower = healthier)</th><th class="text-end">Debt</th><th class="text-end">Contribution</th></tr></thead>
                            <tbody>${compRows}</tbody>
                        </table>
                    </div>
                </div>
                <h6 class="text-muted text-uppercase small mb-3">Per-repository tech-debt ranking</h6>
                ${repoRows ? `
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead><tr><th>Repository</th><th>Grade</th><th class="text-end">Score</th><th class="text-end">Deps</th><th class="text-end">Crit</th><th class="text-end">High</th><th class="text-end">Major drift</th><th class="text-end">Minor drift</th><th class="text-end">Activity</th></tr></thead>
                            <tbody>${repoRows}</tbody>
                        </table>
                    </div>` : '<p class="text-muted small mb-0">No per-repo data.</p>'}
            </div>
        </section>
    `;
}

function gradeColor(grade) {
    // Maps a letter grade to a Bootstrap 5.1 contextual color class name
    // (so callers can do `bg-${gradeColor(g)}` and `text-${gradeColor(g)}`).
    // 'orange' is intentionally avoided because Bootstrap 5.1 does not ship
    // a `bg-orange` utility class — using it would render unstyled.
    switch (grade) {
        case 'A': return 'success';
        case 'B': return 'info';
        case 'C': return 'primary';
        case 'D': return 'warning';
        case 'F': return 'danger';
        default: return 'secondary';
    }
}

/**
 * Per-repo composite — same weights, narrowed inputs.
 */
function computeRepoTechDebt(repo) {
    const dc = repo.driftCounts;
    const driftScore = dc.withDrift ? clamp01((dc.major * 3 + dc.minor) / (dc.withDrift * 3)) : 0;
    const totalCves = repo.critical + repo.high + repo.medium + repo.low;
    const vulnScore = repo.depCount ? clamp01((repo.critical * 10 + repo.high * 4 + repo.medium) / Math.max(1, repo.depCount)) : 0;
    const ageWithData = Object.values(repo.ageBuckets).reduce((a, b) => a + b, 0);
    const stale = (repo.ageBuckets['2-3y'] || 0) + (repo.ageBuckets['3-5y'] || 0) + (repo.ageBuckets['>5y'] || 0);
    const ageScore = ageWithData ? clamp01(stale / ageWithData) : 0;
    const sbomScoreInverse = (() => {
        switch (repo.grade) {
            case 'A': return 0.0;
            case 'B': return 0.2;
            case 'C': return 0.5;
            case 'D': return 0.7;
            case 'F': return 1.0;
            default: return 0.5;
        }
    })();
    const hygiene = (() => {
        let v = 0;
        if (repo.archived) v += 0.3;
        if (!repo.hasDependencyGraph) v += 0.5;
        return clamp01(v + (repo.unpinnedActions ? Math.min(0.2, repo.unpinnedActions / 10) : 0));
    })();

    const components = [
        { id: 'drift', weight: 0.25, score: driftScore },
        { id: 'vulns', weight: 0.25, score: vulnScore },
        { id: 'age', weight: 0.15, score: ageScore },
        { id: 'sbom', weight: 0.15, score: sbomScoreInverse },
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

    const rows = [['repo', 'grade', 'score', 'deps', 'critical', 'high', 'medium', 'low',
                   'major_drift', 'minor_drift', 'patch_drift', 'oldest_months', 'archived',
                   'has_dependency_graph', 'sbom_grade', 'unpinned_actions', 'pushed_at',
                   'primary_language']];

    for (const r of ins.perRepo) {
        const td = computeRepoTechDebt(r);
        const grade = scoreToGrade(td.score100);
        rows.push([
            r.repoKey,
            grade,
            td.score100,
            r.depCount,
            r.critical,
            r.high,
            r.medium,
            r.low,
            r.driftCounts.major,
            r.driftCounts.minor,
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
