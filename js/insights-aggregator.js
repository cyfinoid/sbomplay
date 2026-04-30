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
 *     stable tile id (`repos`, `deps`, `vulnsCH`, `vulnAge`, `eol`, `licenses`,
 *     `drift`, `techDebt`) so callers can wrap each tile in an anchor that
 *     drills into the matching detail page.
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

    const driftStats = computeDriftStats(allDeps);
    const ageStats = computeAgeStats(allDeps);
    const vulnAgeStats = computeVulnAgeStats(vulnAnalysis, allDeps);
    const eolStats = computeEolStats(allDeps);
    const licenseStats = computeLicenseStats(allDeps, licenseAnalysis);
    const repoHygiene = computeRepoHygiene(allRepos);
    const supplyChain = computeSupplyChainStats(allDeps, malwareAnalysis, ghActions);
    const depthStats = computeDepthStats(allDeps, allRepos);

    const perRepo = computePerRepoStats(allRepos, allDeps, vulnAnalysis, ghActions);
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
    // Renderers slice to the collapsed view themselves so the expand-toggle has the
    // full ordered list available — keeping `top` as the field name for backwards
    // compatibility with anything that may still read it externally.
    return { withDrift, major, minor, patch, current, top: lagging, majorPct: withDrift ? (major / withDrift) * 100 : 0 };
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
        probableEolTop: probableEolList,
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

    return { buckets, totalCves: total, medianAgeDays, timeBombs, perRepoCH };
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
        conflicts,
        directHighRisk,
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

        for (const depKey of flatDeps) {
            const level = levelByDep.has(depKey) ? levelByDep.get(depKey) : 1;
            bumpRepo(repoKey, level);
            bumpGlobal(level);
            if (!levelByDep.has(depKey)) {
                repoEntry.imputedDirect++;
                imputedDirectGlobal++;
            }
            if (level > 1) hasDepthData = true;
            if (observedMaxLevel === null || level > observedMaxLevel) {
                observedMaxLevel = level;
            }
        }
    }

    // Ensure every repo has an entry (even empty) and decorate with deepest/repoKey for renderer.
    for (const repo of allRepos) {
        const repoKey = `${repo.owner}/${repo.name}`;
        if (!perRepo.has(repoKey)) {
            perRepo.set(repoKey, { byLevel: new Map(), total: 0, imputedDirect: 0 });
        }
        const entry = perRepo.get(repoKey);
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
    const { driftStats, vulnAgeStats, ageStats, licenseStats,
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
 * Stable tile keys: `repos`, `deps`, `vulnsCH`, `vulnAge`, `eol`, `licenses`,
 *                   `drift`, `techDebt`.
 */
function renderKpiStrip(ins, opts = {}) {
    const linkMap = (opts && opts.linkMap) || {};
    const sbomCoveragePct = ins.totalRepos ? Math.round((ins.reposWithSbom / ins.totalRepos) * 100) : 0;
    const driftMajorPct = ins.driftStats.withDrift ? Math.round((ins.driftStats.major / ins.driftStats.withDrift) * 100) : 0;
    const td = ins.techDebt;
    const tiles = [
        { key: 'repos', icon: 'fa-code-branch', label: 'Repos analysed', value: ins.totalRepos, sub: `${ins.reposWithSbom} with SBOM (${sbomCoveragePct}%)` },
        { key: 'deps', icon: 'fa-cubes', label: 'Total dependencies', value: ins.totalDeps.toLocaleString(), sub: `${ins.directCount.toLocaleString()} direct / ${ins.transitiveCount.toLocaleString()} transitive` },
        { key: 'vulnsCH', icon: 'fa-shield-alt', label: 'Open Critical+High', value: countCritHigh(ins.vulnAgeStats), sub: 'across all CVEs' },
        { key: 'vulnAge', icon: 'fa-stopwatch', label: 'Median CVE age', value: ins.vulnAgeStats.medianAgeDays !== null ? `${ins.vulnAgeStats.medianAgeDays} d` : 'N/A', sub: 'time-to-fix proxy' },
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
