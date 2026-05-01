/**
 * Shared insights aggregation + KPI strip renderer.
 *
 * Extracted from `js/insights-page.js` so pages other than insights.html (notably
 * the home dashboard on index.html) can reuse the high-level KPI tiles without
 * pulling in Chart.js, the section renderers, or the page bootstrap. This file
 * contains only DOM-light helpers:
 *
 *   - `buildInsights(analysisData)` and all `compute*` aggregators
 *   - `gradeColor`, `countCritHigh`, `clamp01`, `scoreToGrade`
 *   - `renderKpiStrip(ins, opts)` — accepts an optional `opts.linkMap` keyed by
 *     stable tile id (`repos`, `deps`, `vulnsCH`, `directDwell`, `eol`,
 *     `licenses`, `drift`, `techDebt`) so callers can wrap each tile in an
 *     anchor that drills into the matching detail page.
 *
 * Load this file BEFORE `insights-page.js` (and before `app.js` on index.html).
 */

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

    // `directMap`: repoKey → Set(`name@version`) for that repo's direct deps. Built once and
    // threaded into every compute* aggregator below so the (dep, repo) → direct/transitive
    // classification is consistent across charts/tables. The classification unit is the
    // (dep, repo) PAIR — a package can be direct in repo A and transitive in repo B.
    const directMap = buildDirectMap(allRepos);
    // `depthStats` is computed first so `computeVulnAgeStats` can join its per-repo BFS
    // depth into the new "Vulnerabilities × dependency depth" chart without repeating BFS.
    const depthStats = computeDepthStats(allDeps, allRepos);

    const driftStats = computeDriftStats(allDeps, directMap);
    const ageStats = computeAgeStats(allDeps, directMap);
    const vulnAgeStats = computeVulnAgeStats(vulnAnalysis, allDeps, directMap, depthStats);
    const eolStats = computeEolStats(allDeps, directMap);
    const licenseStats = computeLicenseStats(allDeps, licenseAnalysis, directMap);
    const repoHygiene = computeRepoHygiene(allRepos);
    const supplyChain = computeSupplyChainStats(allDeps, malwareAnalysis, ghActions);

    const perRepo = computePerRepoStats(allRepos, allDeps, vulnAnalysis, ghActions, directMap);
    // SBOM quality intentionally excluded from the tech-debt composite: when GitHub
    // generates the SBOM (the typical case for this tool) the user has no control
    // over its NTIA / completeness fields, so penalising the org/repo for it would
    // surface debt that no one can act on. The SBOM-grade donut on the Repository
    // Hygiene section and the `sbom_grade` column in the per-repo CSV export keep
    // the signal visible separately for users who want it.
    const techDebt = computeTechDebt({
        driftStats, vulnAgeStats, ageStats, licenseStats,
        eolStats, supplyChain, totalDeps
    });

    return {
        totalRepos, reposWithSbom, reposWithoutSbom, reposArchived,
        totalDeps, directCount, transitiveCount,
        driftStats, ageStats, vulnAgeStats, eolStats, licenseStats,
        repoHygiene, supplyChain, depthStats,
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

/**
 * Build the canonical (repoKey → Set(`name@version`)) lookup of every repo's
 * direct dependencies. Threaded into every compute* aggregator below so the
 * Direct/Transitive classification of each `(dep, repo)` occurrence is computed
 * once and shared across charts, tables, and the tech-debt composite.
 *
 * Why we don't just trust `dep.directIn`: `dep.directIn` is *eventually* correct
 * (storage-manager's `_recomputeDirectAndTransitive` heals it on every load),
 * but reading from `repo.directDependencies` directly is the SBOM ground truth
 * and avoids any gap between dep-level and repo-level views.
 */
function buildDirectMap(allRepos) {
    const directMap = new Map();
    for (const repo of allRepos) {
        const repoKey = `${repo.owner}/${repo.name}`;
        const set = new Set(Array.isArray(repo.directDependencies) ? repo.directDependencies : []);
        directMap.set(repoKey, set);
    }
    return directMap;
}

function isDirectIn(directMap, repoKey, depKey) {
    const set = directMap && directMap.get ? directMap.get(repoKey) : null;
    return !!(set && set.has(depKey));
}

/**
 * Helpers used by every aggregator below. `splitCounts` returns a fresh
 * `{ direct: 0, transitive: 0 }` object so each call site can mutate
 * independently; `bumpSplit` increments the right side based on the
 * `(directMap, repoKey, depKey)` classification of an occurrence.
 */
function splitCounts() {
    return { direct: 0, transitive: 0 };
}
function bumpSplit(splitObj, isDirect) {
    if (isDirect) splitObj.direct++;
    else splitObj.transitive++;
}

function computeDriftStats(allDeps, directMap) {
    let withDrift = 0, major = 0, minor = 0, patch = 0, current = 0;
    // Per-bucket direct/transitive splits. These count `(dep, repoKey)` PAIRS,
    // whereas `withDrift` / `major` / etc. count packages — both shapes are
    // surfaced because the existing render path reads the package-level totals
    // and the new direct/transitive pills read the pair-level totals.
    const splits = {
        withDrift: splitCounts(),
        major: splitCounts(),
        minor: splitCounts(),
        patch: splitCounts(),
        current: splitCounts()
    };
    const lagging = [];

    for (const dep of allDeps) {
        const drift = dep.versionDrift;
        if (!drift || !drift.latestVersion) continue;
        withDrift++;

        // Classify each repo this dep appears in as direct or transitive once,
        // then bump the matching bucket's split accordingly. We use
        // `dep.repositories` rather than `directIn ∪ transitiveIn` because the
        // first is the canonical "every repo this dep is in" set.
        const depKey = `${dep.name}@${dep.version}`;
        const repos = Array.isArray(dep.repositories) ? dep.repositories : [];
        const repoSplit = splitCounts();
        for (const repoKey of repos) {
            bumpSplit(repoSplit, isDirectIn(directMap, repoKey, depKey));
        }

        let bucket = null;
        if (drift.hasMajorUpdate) {
            major++; bucket = 'major';
            const repoCount = repos.length || 1;
            lagging.push({
                name: dep.name,
                version: dep.version,
                latestVersion: drift.latestVersion,
                repoCount,
                directRepoCount: repoSplit.direct,
                transitiveRepoCount: repoSplit.transitive,
                ecosystem: dep.category?.ecosystem || '',
                kind: 'major',
                score: repoCount * 3
            });
        } else if (drift.hasMinorUpdate) {
            minor++; bucket = 'minor';
            const repoCount = repos.length || 1;
            lagging.push({
                name: dep.name,
                version: dep.version,
                latestVersion: drift.latestVersion,
                repoCount,
                directRepoCount: repoSplit.direct,
                transitiveRepoCount: repoSplit.transitive,
                ecosystem: dep.category?.ecosystem || '',
                kind: 'minor',
                score: repoCount * 1
            });
        } else if (drift.latestVersion && (window.normalizeVersion ? window.normalizeVersion(drift.latestVersion) : drift.latestVersion) !==
            (window.normalizeVersion ? window.normalizeVersion(dep.version) : dep.version)) {
            patch++; bucket = 'patch';
        } else {
            current++; bucket = 'current';
        }

        if (bucket) {
            splits.withDrift.direct += repoSplit.direct;
            splits.withDrift.transitive += repoSplit.transitive;
            splits[bucket].direct += repoSplit.direct;
            splits[bucket].transitive += repoSplit.transitive;
        }
    }

    lagging.sort((a, b) => b.score - a.score);
    // Renderers slice to the collapsed view themselves so the expand-toggle has the
    // full ordered list available — keeping `top` as the field name for backwards
    // compatibility with anything that may still read it externally.
    return {
        withDrift, major, minor, patch, current,
        top: lagging,
        majorPct: withDrift ? (major / withDrift) * 100 : 0,
        splits
    };
}

function computeAgeStats(allDeps, directMap) {
    const buckets = { '<6m': 0, '6-12m': 0, '1-2y': 0, '2-3y': 0, '3-5y': 0, '>5y': 0 };
    // Parallel splits: each bucket key carries `{ direct, transitive }` totals
    // counted at the (dep, repo) granularity. The package-level `buckets` is
    // kept for the existing portfolio chart, the splits feed the new overlays.
    const bucketSplits = {
        '<6m': splitCounts(),
        '6-12m': splitCounts(),
        '1-2y': splitCounts(),
        '2-3y': splitCounts(),
        '3-5y': splitCounts(),
        '>5y': splitCounts()
    };
    let withAge = 0;
    let probableEol = 0;
    const probableEolList = [];
    const oldestPerRepo = new Map();

    for (const dep of allDeps) {
        const months = dep.staleness?.monthsSinceRelease;
        if (typeof months !== 'number' || isNaN(months)) continue;
        withAge++;
        let bucketKey;
        if (months < 6) bucketKey = '<6m';
        else if (months < 12) bucketKey = '6-12m';
        else if (months < 24) bucketKey = '1-2y';
        else if (months < 36) bucketKey = '2-3y';
        else if (months < 60) bucketKey = '3-5y';
        else bucketKey = '>5y';
        buckets[bucketKey]++;

        const depKey = `${dep.name}@${dep.version}`;
        const repos = Array.isArray(dep.repositories) ? dep.repositories : [];
        let directRepoCount = 0;
        let transitiveRepoCount = 0;
        for (const repoKey of repos) {
            if (isDirectIn(directMap, repoKey, depKey)) directRepoCount++;
            else transitiveRepoCount++;
        }
        bucketSplits[bucketKey].direct += directRepoCount;
        bucketSplits[bucketKey].transitive += transitiveRepoCount;

        if (dep.staleness?.isProbableEOL) {
            probableEol++;
            probableEolList.push({
                name: dep.name,
                version: dep.version,
                months,
                reason: dep.staleness.probableEOLReason || 'Unknown',
                ecosystem: dep.category?.ecosystem || '',
                repoCount: repos.length || 1,
                directRepoCount,
                transitiveRepoCount
            });
        }

        for (const repoKey of repos) {
            const cur = oldestPerRepo.get(repoKey);
            if (!cur || months > cur.months) {
                oldestPerRepo.set(repoKey, {
                    name: dep.name,
                    version: dep.version,
                    months,
                    ecosystem: dep.category?.ecosystem || '',
                    isDirect: isDirectIn(directMap, repoKey, depKey)
                });
            }
        }
    }

    probableEolList.sort((a, b) => b.months - a.months);

    return {
        buckets,
        bucketSplits,
        withAge,
        coveragePct: allDeps.length ? (withAge / allDeps.length) * 100 : 0,
        probableEol,
        probableEolTop: probableEolList,
        oldestPerRepo
    };
}

/**
 * Bucket every vulnerability finding by (severity × age) at the package level
 * (existing behaviour) PLUS:
 *   - direct/transitive split for every aggregate at the (vDep, repo, vuln) level
 *   - `byDepth`: distribution of CVEs across dependency depths (Level 1..N) by
 *     joining each (vDep, repoKey) pair against `depthStats.perRepo[repoKey].byLevel`
 *   - `directDwellMedian`: median ageDays of unfixed C+H CVEs on direct deps,
 *     surfaced on the new "Direct-dep CVE dwell" KPI tile. This is the headline
 *     "how long are owners ignoring fixable issues on stuff they directly chose"
 *     signal.
 *
 * The classification unit for the splits is the **(vDep, repoKey, vuln)**
 * triple. A package can be a direct dep in repo A and a transitive in repo B,
 * so when we count "high-severity CVEs on direct deps" we need to count once
 * per repo it appears in, classified per repo.
 */
function computeVulnAgeStats(vulnAnalysis, allDeps, directMap, depthStats) {
    const makeSevSplit = () => ({
        critical: splitCounts(),
        high: splitCounts(),
        medium: splitCounts(),
        low: splitCounts()
    });
    const buckets = {
        '<30d': { critical: 0, high: 0, medium: 0, low: 0 },
        '30-90d': { critical: 0, high: 0, medium: 0, low: 0 },
        '90d-1y': { critical: 0, high: 0, medium: 0, low: 0 },
        '1-2y': { critical: 0, high: 0, medium: 0, low: 0 },
        '>2y': { critical: 0, high: 0, medium: 0, low: 0 }
    };
    const bucketSplits = {
        '<30d': makeSevSplit(),
        '30-90d': makeSevSplit(),
        '90d-1y': makeSevSplit(),
        '1-2y': makeSevSplit(),
        '>2y': makeSevSplit()
    };
    const ages = [];
    const agesDirect = [];
    const agesTransitive = [];
    const directDwellAges = [];
    const timeBombs = [];
    // perRepoCH: each repo carries `{ critical: { direct, transitive }, high: { direct, transitive } }`
    // — the renderer collapses to a single 4-segment mini bar per row.
    const perRepoCH = new Map();
    // byDepth: Map(level -> { critical, high, medium, low, total }). Counts each
    // (vDep, repoKey, vuln) triple at the dep's depth in that repo's BFS tree.
    const byDepth = new Map();
    let total = 0;
    const totalsBySev = makeSevSplit();
    let directCves = 0;
    let transitiveCves = 0;

    if (!vulnAnalysis || !vulnAnalysis.vulnerableDependencies) {
        return {
            buckets, bucketSplits, byDepth,
            totalCves: 0, totalsBySev,
            directCves: 0, transitiveCves: 0,
            medianAgeDays: null, medianAgeDirectDays: null, medianAgeTransitiveDays: null,
            directDwellMedian: null, directDwellCount: 0,
            timeBombs: [], perRepoCH
        };
    }

    const driftMap = new Map();
    const allDepsByKey = new Map();
    for (const dep of allDeps) {
        const key = `${dep.name}@${dep.version}`;
        allDepsByKey.set(key, dep);
        if (dep.versionDrift?.latestVersion) {
            driftMap.set(key, dep.versionDrift);
        }
    }

    // Resolve a (vDep, repo) pair → depth in that repo using the BFS already
    // computed by `computeDepthStats`. `perRepo[repoKey].byLevel` is keyed by
    // level → count, so we can't go straight from depKey → level — instead we
    // re-derive per-(dep, repo) depth from the same edge data the BFS used.
    // Cheaper option: rebuild a (repoKey, depKey) → level map up-front.
    const depthByPair = buildDepthByPair(allDeps, depthStats);

    const now = Date.now();
    for (const vDep of vulnAnalysis.vulnerableDependencies) {
        const key = `${vDep.name}@${vDep.version}`;
        const drift = vDep.versionDrift || driftMap.get(key) || null;
        // Repo list may be missing on the vulnDep blob (older stored analyses);
        // fall back to the joined `allDependencies` row if so. If still empty we
        // count the finding once with no repo classification (treated as
        // transitive — the conservative default).
        let repos = Array.isArray(vDep.repositories) ? vDep.repositories : [];
        if (!repos.length) {
            const fullDep = allDepsByKey.get(key);
            repos = fullDep && Array.isArray(fullDep.repositories) ? fullDep.repositories : [];
        }
        // Compute the per-repo direct/transitive classification once per vDep.
        const repoDirect = [];
        const repoTransitive = [];
        for (const repoKey of repos) {
            if (isDirectIn(directMap, repoKey, key)) repoDirect.push(repoKey);
            else repoTransitive.push(repoKey);
        }
        const isDirectAnywhere = repoDirect.length > 0;

        for (const vuln of (vDep.vulnerabilities || [])) {
            if (vuln.kind === 'malware') continue;
            total++;
            const sev = String(vuln.severity || 'unknown').toLowerCase();
            const sevKey = sev === 'critical' || sev === 'high' || sev === 'medium' || sev === 'low' ? sev : 'low';
            const pubMs = vuln.published ? Date.parse(vuln.published) : NaN;
            const ageDays = isFinite(pubMs) ? Math.max(0, Math.floor((now - pubMs) / (24 * 3600 * 1000))) : null;

            // Each (vuln, repo) occurrence is counted once per repo. If the
            // vulnDep had no repos, count once as transitive (so the totals
            // don't silently drop legacy data).
            const occurrences = repos.length > 0
                ? repos.map(repoKey => ({ repoKey, isDirect: isDirectIn(directMap, repoKey, key) }))
                : [{ repoKey: null, isDirect: false }];

            for (const occ of occurrences) {
                bumpSplit(totalsBySev[sevKey], occ.isDirect);
                if (occ.isDirect) directCves++; else transitiveCves++;

                if (ageDays !== null) {
                    let bucket;
                    if (ageDays < 30) bucket = '<30d';
                    else if (ageDays < 90) bucket = '30-90d';
                    else if (ageDays < 365) bucket = '90d-1y';
                    else if (ageDays < 730) bucket = '1-2y';
                    else bucket = '>2y';
                    buckets[bucket][sevKey]++;
                    bumpSplit(bucketSplits[bucket][sevKey], occ.isDirect);
                    ages.push(ageDays);
                    if (occ.isDirect) agesDirect.push(ageDays);
                    else agesTransitive.push(ageDays);
                }

                if (occ.repoKey) {
                    const level = depthByPair.get(`${occ.repoKey}|${key}`) || 1;
                    if (!byDepth.has(level)) {
                        byDepth.set(level, { critical: 0, high: 0, medium: 0, low: 0, total: 0,
                                              criticalDirect: 0, highDirect: 0, mediumDirect: 0, lowDirect: 0 });
                    }
                    const slot = byDepth.get(level);
                    slot[sevKey]++;
                    slot.total++;
                    if (occ.isDirect) slot[sevKey + 'Direct']++;
                }

                if ((sevKey === 'critical' || sevKey === 'high') && occ.repoKey) {
                    if (!perRepoCH.has(occ.repoKey)) {
                        perRepoCH.set(occ.repoKey, {
                            critical: splitCounts(),
                            high: splitCounts()
                        });
                    }
                    bumpSplit(perRepoCH.get(occ.repoKey)[sevKey], occ.isDirect);
                }
            }

            // Direct-dep dwell time: how long has the C+H CVE been published on
            // a direct dep that has a fix available. This is the metric that
            // tells the user "this is a fixable issue you've been ignoring".
            if (ageDays !== null && (sevKey === 'critical' || sevKey === 'high') && drift && drift.latestVersion) {
                if (isDirectAnywhere) {
                    directDwellAges.push(ageDays);
                }
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
                    summary: vuln.summary || '',
                    isDirect: isDirectAnywhere,
                    directRepoCount: repoDirect.length,
                    transitiveRepoCount: repoTransitive.length,
                    sampleRepoKey: repoDirect[0] || repoTransitive[0] || null
                });
            }
        }
    }

    const median = (arr) => {
        if (!arr.length) return null;
        const sorted = arr.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    };

    const medianAgeDays = median(ages);
    const medianAgeDirectDays = median(agesDirect);
    const medianAgeTransitiveDays = median(agesTransitive);
    const directDwellMedian = median(directDwellAges);

    timeBombs.sort((a, b) => {
        const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const aRank = sevOrder[a.severity] ?? 9;
        const bRank = sevOrder[b.severity] ?? 9;
        if (aRank !== bRank) return aRank - bRank;
        // Within a severity, surface direct-dep findings first — they are the
        // ones the user can actually act on without a vendor cycle.
        if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
        return b.ageDays - a.ageDays;
    });

    // Canonical KPI values (alias-aware, unique advisory ids portfolio-wide,
    // malware/withdrawn excluded). Used by the KPI strip so the
    // "Open Critical+High" tile matches the home dashboard and `vuln.html`
    // cards. Falls back to bucket sums on older browsers / pages where
    // `osv-service.js` isn't loaded.
    let canonicalCritHigh = null;
    if (typeof window !== 'undefined' && window.osvService
        && typeof window.osvService.countUniqueAdvisories === 'function'
        && vulnAnalysis && Array.isArray(vulnAnalysis.vulnerableDependencies)) {
        const c = window.osvService.countUniqueAdvisories(vulnAnalysis.vulnerableDependencies);
        canonicalCritHigh = (c.critical || 0) + (c.high || 0);
    }

    return {
        buckets, bucketSplits, byDepth,
        totalCves: total, totalsBySev, canonicalCritHigh,
        directCves, transitiveCves,
        medianAgeDays, medianAgeDirectDays, medianAgeTransitiveDays,
        directDwellMedian, directDwellCount: directDwellAges.length,
        timeBombs, perRepoCH
    };
}

/**
 * Flatten `depthStats.perRepo[repoKey].levelByDep` into a single
 * `Map(`${repoKey}|${depKey}` → level)` for cheap lookups by aggregators that
 * want to bucket findings by dependency depth (e.g. the Vulns × Depth chart).
 *
 * `computeDepthStats` already stashes `levelByDep` on each per-repo entry, so
 * this is just a flatten — we don't re-run the BFS.
 */
function buildDepthByPair(allDeps, depthStats) {
    const result = new Map();
    if (!depthStats || !depthStats.perRepo) return result;
    for (const [repoKey, entry] of depthStats.perRepo.entries()) {
        if (!entry || !entry.levelByDep) continue;
        for (const [depKey, level] of entry.levelByDep.entries()) {
            result.set(`${repoKey}|${depKey}`, level);
        }
    }
    return result;
}

function computeEolStats(allDeps, directMap) {
    const eolItems = [];
    const eosItems = [];
    let eolDirectPairs = 0, eolTransitivePairs = 0;
    let eosDirectPairs = 0, eosTransitivePairs = 0;

    for (const dep of allDeps) {
        const eox = dep.eoxStatus;
        if (!eox) continue;
        const depKey = `${dep.name}@${dep.version}`;
        const repos = Array.isArray(dep.repositories) ? dep.repositories : [];
        let directRepoCount = 0;
        let transitiveRepoCount = 0;
        for (const repoKey of repos) {
            if (isDirectIn(directMap, repoKey, depKey)) directRepoCount++;
            else transitiveRepoCount++;
        }
        if (eox.isEOL) {
            eolItems.push({
                name: dep.name,
                version: dep.version,
                ecosystem: dep.category?.ecosystem || '',
                eolDate: eox.eolDate || null,
                product: eox.productMatched || null,
                successor: eox.successor || null,
                repoCount: repos.length || 1,
                directRepoCount,
                transitiveRepoCount
            });
            eolDirectPairs += directRepoCount;
            eolTransitivePairs += transitiveRepoCount;
        } else if (eox.isEOS) {
            eosItems.push({
                name: dep.name,
                version: dep.version,
                ecosystem: dep.category?.ecosystem || '',
                eosDate: eox.eosDate || null,
                product: eox.productMatched || null,
                repoCount: repos.length || 1,
                directRepoCount,
                transitiveRepoCount
            });
            eosDirectPairs += directRepoCount;
            eosTransitivePairs += transitiveRepoCount;
        }
    }
    return {
        eolCount: eolItems.length, eosCount: eosItems.length,
        eolItems, eosItems,
        eolPairs: { direct: eolDirectPairs, transitive: eolTransitivePairs },
        eosPairs: { direct: eosDirectPairs, transitive: eosTransitivePairs }
    };
}

/**
 * License risk aggregates with a direct/transitive split layered on top.
 *
 * The headline `high` / `medium` / `low` numbers still come from
 * `licenseAnalysis.summary.riskBreakdown` (per-package totals — the existing
 * shape consumed by the donut chart). On top of those we now also count
 * `(dep, repoKey)` PAIRS bucketed into `riskPairs.{high,medium,low}.{direct,transitive}`,
 * which feeds the new 4-slice donut + the per-card direct/transitive counts on
 * licenses.html.
 *
 * `directHighRisk` / `transitiveHighRisk` keep the per-row drilldown — the
 * "Copyleft on direct dependencies" table also gains an "Also transitive in"
 * column powered by the per-row `transitiveIn` array.
 */
function computeLicenseStats(allDeps, licenseAnalysis, directMap) {
    const summary = licenseAnalysis?.summary || null;
    const conflicts = licenseAnalysis?.conflicts || [];
    const high = summary?.riskBreakdown?.high || 0;
    const medium = summary?.riskBreakdown?.medium || 0;
    const low = summary?.riskBreakdown?.low || 0;
    const totalLicensed = summary?.licensedDependencies || 0;

    const COPYLEFT_RX = /(GPL|AGPL|LGPL|MPL|EPL|CDDL|OSL|EUPL)/i;
    const directHighRisk = [];
    const transitiveHighRisk = [];
    const riskPairs = {
        high: splitCounts(),
        medium: splitCounts(),
        low: splitCounts()
    };

    // We accept the per-package risk-tier classification from the license
    // analyser's output (the same source `summary.riskBreakdown` uses); join by
    // package key so every (dep, repoKey) pair gets its own classification.
    const tierByDepKey = new Map();
    if (Array.isArray(licenseAnalysis?.dependencies)) {
        for (const ld of licenseAnalysis.dependencies) {
            if (!ld || !ld.name) continue;
            const key = `${ld.name}@${ld.version}`;
            const tier = ld.riskTier || ld.risk || ld.riskLevel || null;
            if (tier && (tier === 'high' || tier === 'medium' || tier === 'low')) {
                tierByDepKey.set(key, tier);
            }
        }
    }

    for (const dep of allDeps) {
        const licStr = dep.licenseFull || dep.license || '';
        const depKey = `${dep.name}@${dep.version}`;
        const repos = Array.isArray(dep.repositories) ? dep.repositories : [];
        const directRepos = [];
        const transitiveRepos = [];
        for (const repoKey of repos) {
            if (isDirectIn(directMap, repoKey, depKey)) directRepos.push(repoKey);
            else transitiveRepos.push(repoKey);
        }

        // Bucket each (dep, repo) pair into the high/medium/low pair-split.
        // Falls back to "high if copyleft" / "low if non-empty license" when the
        // license analyser hasn't attached an explicit tier — covers older
        // analyses that pre-date the riskTier persistence.
        let tier = tierByDepKey.get(depKey);
        if (!tier) {
            if (licStr && COPYLEFT_RX.test(licStr)) tier = 'high';
            else if (licStr) tier = 'low';
        }
        if (tier === 'high' || tier === 'medium' || tier === 'low') {
            riskPairs[tier].direct += directRepos.length;
            riskPairs[tier].transitive += transitiveRepos.length;
        }

        if (licStr && COPYLEFT_RX.test(licStr)) {
            const row = {
                name: dep.name,
                version: dep.version,
                license: licStr,
                ecosystem: dep.category?.ecosystem || '',
                repoCount: repos.length || 1,
                directIn: dep.directIn || directRepos,
                transitiveIn: dep.transitiveIn || transitiveRepos,
                directRepoCount: directRepos.length,
                transitiveRepoCount: transitiveRepos.length
            };
            if (directRepos.length > 0) {
                directHighRisk.push(row);
            } else if (transitiveRepos.length > 0) {
                transitiveHighRisk.push(row);
            }
        }
    }
    directHighRisk.sort((a, b) => b.repoCount - a.repoCount);
    transitiveHighRisk.sort((a, b) => b.repoCount - a.repoCount);

    return {
        high, medium, low, totalLicensed,
        conflicts,
        directHighRisk,
        transitiveHighRisk,
        highRiskShare: totalLicensed ? high / totalLicensed : 0,
        riskPairs
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

/**
 * Build dependency-depth aggregates for the Insights "Dependency depth" section.
 *
 * Scope (what we count):
 *
 *   We count each `(depKey, repoKey)` pair where `depKey` appears in that repo's flat
 *   `repo.dependencies` SBOM list. That list is populated only at SBOM parse time
 *   (`SBOMProcessor.processSBOMData` line ~377), so it is the authoritative truth for
 *   "which deps does this repo actually have?" — independent of any registry-based
 *   resolver attribution. We deliberately do NOT use `dep.repositories` /
 *   `dep.directIn` / `dep.transitiveIn` as the scope because pre-SBOM-truth-fix
 *   versions of the resolver and storage self-heal could inflate those sets with
 *   transitives from unrelated repos in the same ecosystem (the result was the
 *   chart being dominated by a giant, misleading "Unknown" bucket).
 *
 * Why per-repo BFS instead of reading `dep.depth`:
 *
 *   The resolver writes ONE global tree per ecosystem and tags each tree entry with the
 *   depth at which it was first discovered from any direct dep. Two issues flow from that:
 *
 *     1. The resolver only writes children of a package into the tree (see
 *        `DependencyTreeResolver.resolvePackageDependencies`) — direct deps themselves are
 *        never added. So `dep.depth === 1` actually means "1st-level transitive" (a child of
 *        a direct dep), not "direct". Direct deps have `dep.depth === null` and are tracked
 *        only via SBOM parsing into `repo.directDependencies` and `dep.directIn`.
 *
 *     2. The global `dep.depth` is per-ecosystem-tree, not per-repo: a package reachable
 *        via different direct deps in different repos has only one global depth, which may
 *        not match any specific repo's actual depth from its own direct deps.
 *
 *   Both problems vanish if we recompute depth per repo here. We BFS from each repo's
 *   `directDependencies` (the SBOM ground truth) through a children-by-parent reverse index
 *   built from each dep's `parents` array. Each (dep, repo) pair then gets the dep's true
 *   depth in that repo's subtree.
 *
 * Residual handling ("no relationship known"):
 *
 *   Sometimes a dep is in `repo.dependencies` but the BFS can't reach it because no
 *   parent chain links back to one of the repo's direct deps. Common causes:
 *     • The dep came from a CycloneDX/SPDX SBOM that lists it without `dependsOn` /
 *       `DEPENDS_ON` edges (GitHub Dependency Graph SBOMs only emit edges from the main
 *       repo node to direct deps; transitive→transitive edges are absent).
 *     • Registry resolution at SBOM time used a slightly different version of the
 *       parent than the SBOM listed, so the parent key in `dep.parents` doesn't match
 *       any key in `repo.directDependencies`.
 *     • The dep's children weren't enumerated because `maxDepth` was hit during
 *       resolution.
 *   For these, per the product UX, we treat the dep as **direct** (Level 1) and tally it
 *   into a separate `imputedDirect` counter so the renderer can surface a "Includes N
 *   deps with no traceable parent path" inline note.
 *
 * UI labelling: Level 1 = direct (declared in repo.directDependencies OR imputed),
 *               Level N = (N-1)-th level transitive.
 */
function computeDepthStats(allDeps, allRepos) {
    let configuredMaxDepth = 10;
    try {
        const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem('maxDepth') : null;
        const parsed = saved ? parseInt(saved, 10) : NaN;
        if (Number.isFinite(parsed) && parsed > 0) configuredMaxDepth = parsed;
    } catch (_) {
        // localStorage may be unavailable in some embedded contexts; fall back to default.
    }

    // childrenByParent is the inverted edge set: for every dep D that lists P in its parents,
    // record D as a child of P. We invert from `dep.parents` (rather than reading
    // `dep.children`) because direct deps are never in the resolver tree and so have an empty
    // `dep.children` array — but every 1st-level transitive D lists its parent direct dep in
    // D.parents, so the inversion gives us children of direct deps for free.
    const childrenByParent = new Map();
    for (const dep of allDeps) {
        if (!dep || !dep.name) continue;
        const childKey = `${dep.name}@${dep.version}`;
        const parents = Array.isArray(dep.parents) ? dep.parents : [];
        for (const parentKey of parents) {
            if (!parentKey) continue;
            if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, new Set());
            childrenByParent.get(parentKey).add(childKey);
        }
    }

    const perRepo = new Map();
    const globalBuckets = new Map();
    let observedMaxLevel = null;
    let hasDepthData = false;
    let imputedDirectGlobal = 0;

    const bumpRepo = (repoKey, levelKey) => {
        if (!perRepo.has(repoKey)) {
            perRepo.set(repoKey, { byLevel: new Map(), total: 0, imputedDirect: 0 });
        }
        const entry = perRepo.get(repoKey);
        entry.byLevel.set(levelKey, (entry.byLevel.get(levelKey) || 0) + 1);
        entry.total++;
    };
    const bumpGlobal = (levelKey) => {
        globalBuckets.set(levelKey, (globalBuckets.get(levelKey) || 0) + 1);
    };

    for (const repo of allRepos) {
        const repoKey = `${repo.owner}/${repo.name}`;
        const directDeps = Array.isArray(repo.directDependencies) ? repo.directDependencies : [];
        const flatDeps = Array.isArray(repo.dependencies) ? repo.dependencies : [];

        // BFS from this repo's direct deps. For each visited dep, record the *minimum* level
        // at which it appears — a dep reached by two paths is counted at its shallowest.
        const levelByDep = new Map();
        const queue = [];
        for (const dk of directDeps) {
            if (!levelByDep.has(dk)) {
                levelByDep.set(dk, 1);
                queue.push(dk);
            }
        }

        while (queue.length > 0) {
            const cur = queue.shift();
            const curLevel = levelByDep.get(cur);
            const kids = childrenByParent.get(cur);
            if (!kids) continue;
            for (const childKey of kids) {
                const next = curLevel + 1;
                const existing = levelByDep.get(childKey);
                if (existing === undefined || next < existing) {
                    levelByDep.set(childKey, next);
                    queue.push(childKey);
                }
            }
        }

        // Walk the repo's flat SBOM dep list (the ground truth) and bucket each dep:
        //   • level from BFS if available,
        //   • else Level 1 (treated as direct, with imputedDirect counter incremented).
        // Deps reached by BFS but not in the flat list are intentionally NOT counted —
        // those would be cross-repo registry-tree spillover from unrelated repos in the
        // same ecosystem.
        if (!perRepo.has(repoKey)) {
            perRepo.set(repoKey, { byLevel: new Map(), total: 0, imputedDirect: 0 });
        }
        const repoEntry = perRepo.get(repoKey);
        // Stash the per-repo (depKey → level) BFS result so downstream aggregators
        // (notably `computeVulnAgeStats` for the Vulns × Depth chart) can join
        // findings to depth without re-running the BFS.
        const finalLevelByDep = new Map();

        for (const depKey of flatDeps) {
            const level = levelByDep.has(depKey) ? levelByDep.get(depKey) : 1;
            bumpRepo(repoKey, level);
            bumpGlobal(level);
            finalLevelByDep.set(depKey, level);
            if (!levelByDep.has(depKey)) {
                repoEntry.imputedDirect++;
                imputedDirectGlobal++;
            }
            if (level > 1) hasDepthData = true;
            if (observedMaxLevel === null || level > observedMaxLevel) {
                observedMaxLevel = level;
            }
        }
        repoEntry.levelByDep = finalLevelByDep;
    }

    // Ensure every repo has an entry (even empty) and decorate with deepest/repoKey for renderer.
    for (const repo of allRepos) {
        const repoKey = `${repo.owner}/${repo.name}`;
        if (!perRepo.has(repoKey)) {
            perRepo.set(repoKey, { byLevel: new Map(), total: 0, imputedDirect: 0, levelByDep: new Map() });
        }
        const entry = perRepo.get(repoKey);
        if (!entry.levelByDep) entry.levelByDep = new Map();
        let deepest = null;
        for (const k of entry.byLevel.keys()) {
            if (typeof k === 'number' && (deepest === null || k > deepest)) deepest = k;
        }
        entry.deepest = deepest;
        entry.deepestCount = deepest !== null ? entry.byLevel.get(deepest) : 0;
        entry.repoKey = repoKey;
        entry.owner = repo.owner;
        entry.name = repo.name;
    }

    const truncationCandidates = [];
    if (observedMaxLevel !== null) {
        for (const [repoKey, entry] of perRepo) {
            const cnt = entry.byLevel.get(observedMaxLevel) || 0;
            if (cnt === 0 || entry.total === 0) continue;
            const share = cnt / entry.total;
            if (cnt >= 25 || share >= 0.05) {
                truncationCandidates.push({ repoKey, count: cnt, total: entry.total, share });
            }
        }
        truncationCandidates.sort((a, b) => b.count - a.count);
    }

    return {
        globalBuckets,
        perRepo,
        observedMaxLevel,
        configuredMaxDepth,
        truncationCandidates,
        hasDepthData,
        imputedDirectGlobal
    };
}

function computePerRepoStats(allRepos, allDeps, vulnAnalysis, ghActions, directMap) {
    const depsByRepo = new Map();
    const allDepsByKey = new Map();
    for (const dep of allDeps) {
        const depKey = `${dep.name}@${dep.version}`;
        allDepsByKey.set(depKey, dep);
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
        // Drift counters keep their existing aggregate field names; each one
        // also carries `{direct, transitive}` sub-counts so the renderer can
        // overlay direct/transitive shading on the per-repo mini bars.
        const driftCounts = {
            major: 0, minor: 0, patch: 0, current: 0, withDrift: 0, total: deps.length,
            majorSplit: splitCounts(),
            minorSplit: splitCounts(),
            patchSplit: splitCounts(),
            currentSplit: splitCounts()
        };
        const ageBuckets = { '<6m': 0, '6-12m': 0, '1-2y': 0, '2-3y': 0, '3-5y': 0, '>5y': 0 };
        const ageBucketSplits = {
            '<6m': splitCounts(),
            '6-12m': splitCounts(),
            '1-2y': splitCounts(),
            '2-3y': splitCounts(),
            '3-5y': splitCounts(),
            '>5y': splitCounts()
        };
        let oldest = null;
        let directDepCountActual = 0;
        let transitiveDepCount = 0;

        for (const dep of deps) {
            const depKey = `${dep.name}@${dep.version}`;
            const isDirect = isDirectIn(directMap, repoKey, depKey);
            if (isDirect) directDepCountActual++; else transitiveDepCount++;

            const drift = dep.versionDrift;
            if (drift && drift.latestVersion) {
                driftCounts.withDrift++;
                let bucket = null;
                if (drift.hasMajorUpdate) { driftCounts.major++; bucket = 'major'; }
                else if (drift.hasMinorUpdate) { driftCounts.minor++; bucket = 'minor'; }
                else if ((window.normalizeVersion ? window.normalizeVersion(drift.latestVersion) : drift.latestVersion) !==
                    (window.normalizeVersion ? window.normalizeVersion(dep.version) : dep.version)) {
                    driftCounts.patch++; bucket = 'patch';
                } else {
                    driftCounts.current++; bucket = 'current';
                }
                if (bucket) bumpSplit(driftCounts[bucket + 'Split'], isDirect);
            }

            const months = dep.staleness?.monthsSinceRelease;
            if (typeof months === 'number' && !isNaN(months)) {
                let bucketKey;
                if (months < 6) bucketKey = '<6m';
                else if (months < 12) bucketKey = '6-12m';
                else if (months < 24) bucketKey = '1-2y';
                else if (months < 36) bucketKey = '2-3y';
                else if (months < 60) bucketKey = '3-5y';
                else bucketKey = '>5y';
                ageBuckets[bucketKey]++;
                bumpSplit(ageBucketSplits[bucketKey], isDirect);
                if (!oldest || months > oldest.months) {
                    oldest = { name: dep.name, version: dep.version, months, ecosystem: dep.category?.ecosystem || '', isDirect };
                }
            }
        }

        let crit = 0, high = 0, med = 0, low = 0;
        // Per-repo CVE counters split by direct/transitive — the tech-debt
        // composite uses these to weight direct findings 3x higher.
        const critSplit = splitCounts();
        const highSplit = splitCounts();
        const medSplit = splitCounts();
        const lowSplit = splitCounts();
        if (vulnAnalysis && Array.isArray(vulnAnalysis.vulnerableDependencies)) {
            for (const vDep of vulnAnalysis.vulnerableDependencies) {
                let repos = Array.isArray(vDep.repositories) ? vDep.repositories : [];
                if (!repos.length) {
                    const fullDep = allDepsByKey.get(`${vDep.name}@${vDep.version}`);
                    repos = fullDep && Array.isArray(fullDep.repositories) ? fullDep.repositories : [];
                }
                if (!repos.includes(repoKey)) continue;
                const isDirect = isDirectIn(directMap, repoKey, `${vDep.name}@${vDep.version}`);
                for (const v of (vDep.vulnerabilities || [])) {
                    if (v.kind === 'malware') continue;
                    const s = String(v.severity || '').toLowerCase();
                    if (s === 'critical') { crit++; bumpSplit(critSplit, isDirect); }
                    else if (s === 'high') { high++; bumpSplit(highSplit, isDirect); }
                    else if (s === 'medium' || s === 'moderate') { med++; bumpSplit(medSplit, isDirect); }
                    else if (s === 'low') { low++; bumpSplit(lowSplit, isDirect); }
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
            // Cross-checked count derived from the same directMap the rest of
            // the aggregator uses; useful when `repo.directDependencies` is a
            // larger superset than the deps actually present in `dep.repositories`
            // (e.g. legacy storage state).
            directDepCountObserved: directDepCountActual,
            transitiveDepCount,
            driftCounts,
            ageBuckets,
            ageBucketSplits,
            oldest,
            critical: crit,
            high,
            medium: med,
            low,
            criticalSplit: critSplit,
            highSplit: highSplit,
            mediumSplit: medSplit,
            lowSplit: lowSplit,
            unpinnedActions: unpinned,
            pushedAt: repo.pushedAt || null,
            activity
        });
    }
    return result;
}

/**
 * Tech-debt composite — direct-weighted edition.
 *
 * Findings on **direct** dependencies count 3x their transitive equivalents in
 * the drift / vulnerability scores below. Rationale:
 *   - A direct dep is one the team explicitly chose to pull in. They have
 *     immediate control over its version, license, and replacement.
 *   - A transitive dep is brought in by something else; an unfixed CVE on it
 *     may genuinely require the parent maintainer to ship first.
 * So an unfixed direct-dep issue is a much stronger "this team is sitting on
 * actionable risk" signal and the score should reflect that. The 3x multiplier
 * matches the per-repo composite below and is documented in CHANGELOG.
 *
 * Backwards compat: the legacy un-split aggregates (`driftStats.major`,
 * `vulnAgeStats.buckets[*].critical`, etc.) are still consumed when the new
 * splits are absent — keeps the function working on stale aggregator output
 * without forcing a coordinated update everywhere.
 */
function computeTechDebt(parts) {
    const { driftStats, vulnAgeStats, ageStats, licenseStats,
        eolStats, supplyChain, totalDeps } = parts;

    // Drift score uses (dep, repo) pair counts when split data is present so
    // a major-drift dep used as a direct dep in 5 repos correctly counts as 5
    // direct major-drift hits, not 1.
    const driftSplits = driftStats?.splits || null;
    const driftMajorWeighted = driftSplits
        ? (driftSplits.major.direct * 3 + driftSplits.major.transitive)
        : driftStats.major;
    const driftMinorWeighted = driftSplits
        ? (driftSplits.minor.direct * 3 + driftSplits.minor.transitive)
        : driftStats.minor;
    const driftPairsWithDrift = driftSplits
        ? (driftSplits.withDrift.direct + driftSplits.withDrift.transitive)
        : driftStats.withDrift;
    const driftMajorRatio = driftPairsWithDrift ? driftMajorWeighted / driftPairsWithDrift : 0;
    const driftMinorRatio = driftPairsWithDrift ? driftMinorWeighted / driftPairsWithDrift : 0;
    const driftScore = clamp01(driftMajorRatio * 0.75 + driftMinorRatio * 0.25 / 3);

    let vulnScore = 0;
    if (vulnAgeStats && totalDeps > 0) {
        let critDir = 0, critTrans = 0, highDir = 0, highTrans = 0, medDir = 0, medTrans = 0;
        const totalsBySev = vulnAgeStats.totalsBySev;
        if (totalsBySev) {
            critDir = totalsBySev.critical?.direct || 0;
            critTrans = totalsBySev.critical?.transitive || 0;
            highDir = totalsBySev.high?.direct || 0;
            highTrans = totalsBySev.high?.transitive || 0;
            medDir = totalsBySev.medium?.direct || 0;
            medTrans = totalsBySev.medium?.transitive || 0;
        } else {
            for (const bucket of Object.values(vulnAgeStats.buckets)) {
                critTrans += bucket.critical;
                highTrans += bucket.high;
                medTrans += bucket.medium;
            }
        }
        // Direct severities count 3x — matches the per-repo composite weighting.
        const weighted = (critDir * 30 + highDir * 12 + medDir * 3)
            + (critTrans * 10 + highTrans * 4 + medTrans * 1);
        vulnScore = clamp01(weighted / Math.max(1, totalDeps) / 1.0);
    }

    const ageStaleShare = (() => {
        if (!ageStats.withAge) return 0;
        const stale = (ageStats.buckets['2-3y'] || 0) + (ageStats.buckets['3-5y'] || 0) + (ageStats.buckets['>5y'] || 0) + (eolStats.eolCount || 0);
        return clamp01(stale / ageStats.withAge);
    })();

    const licenseScore = clamp01(licenseStats.highRiskShare * 1.5 + (licenseStats.conflicts.length ? 0.2 : 0));
    const eolScore = totalDeps ? clamp01(((eolStats.eolCount + eolStats.eosCount * 0.5) / totalDeps) * 5) : 0;
    const hygiene = (() => {
        const a = supplyChain.totalActions || 0;
        const u = a ? supplyChain.unpinnedActions / a : 0;
        const dc = totalDeps ? supplyChain.depConfusion / totalDeps : 0;
        const mw = supplyChain.malwareCount ? 1 : 0;
        return clamp01(u * 0.5 + dc * 5 + mw * 0.5);
    })();

    // SBOM quality (formerly weight 0.10) is intentionally excluded — when GitHub
    // generates the SBOM the user has no control over its NTIA / completeness
    // fields, so charging tech-debt for it surfaces signal nobody can act on.
    // The 0.10 weight is split evenly between drift and vulnerability density,
    // the two most user-actionable signals (now 0.30 each).
    const components = [
        { id: 'drift', label: 'Version drift', weight: 0.30, score: driftScore },
        { id: 'vulns', label: 'Vulnerability density', weight: 0.30, score: vulnScore },
        { id: 'age',   label: 'Stale / aged packages', weight: 0.15, score: ageStaleShare },
        { id: 'license', label: 'License risk', weight: 0.10, score: licenseScore },
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
// SHARED HELPERS
// =============================================================================

function countCritHigh(vulnAgeStats) {
    // Prefer the canonical (alias-aware, unique CVE id, malware/withdrawn
    // excluded) count populated by `computeVulnAgeStats` when osv-service
    // is loaded. Falls back to age-bucket sums for backward compatibility
    // on pages that don't ship osv-service (no insights loads without it,
    // but the function stays defensive).
    if (typeof vulnAgeStats.canonicalCritHigh === 'number') {
        return vulnAgeStats.canonicalCritHigh;
    }
    let c = 0;
    for (const b of Object.values(vulnAgeStats.buckets)) {
        c += (b.critical || 0) + (b.high || 0);
    }
    return c;
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

// =============================================================================
// KPI STRIP (shared between insights.html and the home dashboard)
// =============================================================================

/**
 * Render the 8-tile KPI strip used at the top of the Insights page and on the
 * home dashboard. Tiles carry a stable `key` so callers can pass an optional
 * `opts.linkMap` (`{ [key]: hrefString }`) to wrap individual tiles in an
 * anchor that drills into the matching detail page. Without a link map the
 * tiles render exactly as before.
 *
 * Stable tile keys: `repos`, `deps`, `vulnsCH`, `directDwell`, `eol`,
 *                   `licenses`, `drift`, `techDebt`.
 */
function renderKpiStrip(ins, opts = {}) {
    const linkMap = (opts && opts.linkMap) || {};
    const sbomCoveragePct = ins.totalRepos ? Math.round((ins.reposWithSbom / ins.totalRepos) * 100) : 0;
    const driftMajorPct = ins.driftStats.withDrift ? Math.round((ins.driftStats.major / ins.driftStats.withDrift) * 100) : 0;
    const td = ins.techDebt;

    // Direct/Transitive split for the Critical+High tile sub-line. Counts
    // (vDep, repo, vuln) triples — same unit as the new vuln-page badges.
    const totalsBySev = ins.vulnAgeStats.totalsBySev || null;
    const chDirect = totalsBySev
        ? (totalsBySev.critical?.direct || 0) + (totalsBySev.high?.direct || 0)
        : 0;
    const chTransitive = totalsBySev
        ? (totalsBySev.critical?.transitive || 0) + (totalsBySev.high?.transitive || 0)
        : 0;
    const chTotal = countCritHigh(ins.vulnAgeStats);

    // Direct-dep dwell: median age of unfixed C+H CVEs that have a fix
    // available AND are on a direct dep. The signal "this team is sitting on
    // an actionable issue" — separated from the population median so the
    // headline number isn't diluted by transitive findings the team can't
    // unilaterally fix.
    const dwell = ins.vulnAgeStats.directDwellMedian;
    const dwellCount = ins.vulnAgeStats.directDwellCount || 0;

    const tiles = [
        { key: 'repos', icon: 'fa-code-branch', label: 'Repos analysed', value: ins.totalRepos, sub: `${ins.reposWithSbom} with SBOM (${sbomCoveragePct}%)` },
        { key: 'deps', icon: 'fa-cubes', label: 'Total dependencies', value: ins.totalDeps.toLocaleString(), sub: `${ins.directCount.toLocaleString()} direct / ${ins.transitiveCount.toLocaleString()} transitive` },
        { key: 'vulnsCH', icon: 'fa-shield-alt', label: 'Open Critical+High', value: chTotal, sub: totalsBySev ? `${chDirect.toLocaleString()} on direct / ${chTransitive.toLocaleString()} on transitive` : 'across all CVEs' },
        { key: 'directDwell', icon: 'fa-bullseye', label: 'Direct-dep CVE dwell', value: dwell !== null ? `${dwell} d` : 'N/A', sub: dwellCount > 0 ? `${dwellCount.toLocaleString()} unfixed C/H on direct deps` : 'no fixable C/H on direct deps' },
        { key: 'eol', icon: 'fa-skull-crossbones', label: 'EOL components', value: ins.eolStats.eolCount, sub: `${ins.eolStats.eosCount} EOS` },
        { key: 'licenses', icon: 'fa-balance-scale', label: 'High-risk licenses', value: ins.licenseStats.high, sub: `${ins.licenseStats.conflicts.length} conflicts` },
        { key: 'drift', icon: 'fa-arrow-up-right-dots', label: 'Major drift', value: `${driftMajorPct}%`, sub: `${ins.driftStats.major}/${ins.driftStats.withDrift} deps` },
        // Single-orientation framing: the letter grade (A best → F worst) is the headline,
        // the parenthetical score reinforces it (higher = healthier). We deliberately do NOT
        // surface the inverse "debt index" here — pairing two numbers with opposite
        // orientations on the same tile was the main source of confusion in the v1 layout.
        { key: 'techDebt', icon: 'fa-award', label: 'Tech-debt grade', value: `<span class="badge bg-${gradeColor(td.grade)} fs-3 px-3">${td.grade}</span>`, sub: `health score ${td.score100}/100 — higher is healthier` }
    ];

    const html = tiles.map(t => {
        const inner = `
            <div class="card h-100">
                <div class="card-body text-center">
                    <i class="fas ${t.icon} fa-2x text-primary mb-2"></i>
                    <h3 class="mb-1">${t.value}</h3>
                    <p class="mb-1 fw-semibold">${escapeHtml(t.label)}</p>
                    <p class="mb-0 small text-muted">${escapeHtml(t.sub)}</p>
                </div>
            </div>`;
        const href = linkMap[t.key];
        const tile = href
            ? `<a href="${escapeHtml(href)}" class="text-decoration-none text-reset d-block h-100 kpi-tile-link">${inner}</a>`
            : inner;
        return `<div class="col">${tile}</div>`;
    }).join('');

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
