/**
 * Storage Manager - Handles IndexedDB storage operations
 */
class StorageManager {
    constructor() {
        this.indexedDB = new IndexedDBManager();
        this.initialized = false;
    }

    /**
     * Initialize the storage manager
     */
    async init() {
        if (!this.initialized) {
            await this.indexedDB.initDB();
            // Expose indexedDBManager globally for cache access
            window.indexedDBManager = this.indexedDB;
            this.initialized = true;
        }
        return this.initialized;
    }

    /**
     * Save analysis data (auto-detects org vs repo)
     */
    async saveAnalysisData(name, data) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            
            const isRepo = name.includes('/') && name.split('/').length === 2;
            const timestamp = new Date().toISOString();
            
            console.log(`💾 Saving analysis data for: ${name} (${isRepo ? 'repository' : 'organization'})`);
            console.log(`   - Dependencies: ${data?.statistics?.totalDependencies || 0}`);
            if (isRepo) {
                console.log(`   - Repositories: 1`);
            } else {
                console.log(`   - Repositories: ${data?.statistics?.totalRepositories || 0}`);
            }
            
            const analysisData = {
                timestamp: timestamp,
                data: data
            };

            let saveResult;
            if (isRepo) {
                saveResult = await this.indexedDB.saveRepository(name, {
                    fullName: name,
                    timestamp: timestamp,
                    data: data,
                    type: 'repository'
                });
            } else {
                saveResult = await this.indexedDB.saveOrganization(name, {
                    organization: name,
                    timestamp: timestamp,
                    data: data,
                    type: 'organization'
                });
            }
            
            if (saveResult) {
                console.log(`✅ Successfully saved analysis data for: ${name}`);
                // Verify the data was saved by immediately checking storage info
                const verifyInfo = await this.getStorageInfo();
                const found = isRepo 
                    ? verifyInfo.repositories.some(r => r.name === name)
                    : verifyInfo.organizations.some(o => o.name === name);
                if (found) {
                    console.log(`✅ Verified: ${name} is now in storage`);
                } else {
                    console.warn(`⚠️ Warning: ${name} not found in storage immediately after save`);
                }
            } else {
                console.error(`❌ Failed to save analysis data for: ${name}`);
            }
            
            return saveResult;
        } catch (error) {
            console.error('❌ Failed to save analysis data:', error);
            console.error('   Error details:', error.stack);
            return false;
        }
    }

    /**
     * Load analysis data (most recent entry)
     */
    async loadAnalysisData() {
        try {
            const entries = await this.indexedDB.getAllEntries();
            if (entries.length > 0) {
                // Return the most recent entry
                const entry = entries[0];
                this._invalidateStaleEOXStatus(entry);
                this._recomputeDirectAndTransitive(entry);
                await this._hydrateDriftAndStaleness(entry);
                return entry;
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to load analysis data:', error);
            return null;
        }
    }

    /**
     * Load analysis data for a specific organization or repository
     */
    async loadAnalysisDataForOrganization(name) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            
            // Use same logic as saveAnalysisData: repo has exactly 2 parts (owner/repo)
            // Names with 3+ parts (e.g., github.com/owner/repo) are treated as organizations
            const isRepo = name.includes('/') && name.split('/').length === 2;
            
            const entry = isRepo
                ? await this.indexedDB.getRepository(name)
                : await this.indexedDB.getOrganization(name);
            this._invalidateStaleEOXStatus(entry);
            this._recomputeDirectAndTransitive(entry);
            this._migrateLegacyRepositoryLicense(entry);
            await this._hydrateDriftAndStaleness(entry);
            return entry;
        } catch (error) {
            console.error('❌ Failed to load data for:', name, error);
            return null;
        }
    }

    /**
     * Drop dep.eoxStatus entries from a loaded analysis whose logicVersion is missing
     * or older than the current EOXService.LOGIC_VERSION. The previous matcher logic
     * produced false positives (e.g. @tailwindcss/node misclassified as Node.js EOL),
     * so any persisted result from before the matcher was bumped is unsafe to reuse.
     * Re-running enrichment will repopulate eoxStatus with the current logic.
     * @param {Object|null} entry - Loaded analysis entry (may be null)
     */
    _invalidateStaleEOXStatus(entry) {
        if (!entry || !entry.data) return;
        const currentVersion = (typeof window !== 'undefined' && window.EOXService && window.EOXService.LOGIC_VERSION) || 0;
        if (!currentVersion) return;
        
        const collections = [];
        if (Array.isArray(entry.data.allDependencies)) collections.push(entry.data.allDependencies);
        if (Array.isArray(entry.data.topDependencies)) collections.push(entry.data.topDependencies);
        if (Array.isArray(entry.data.vulnerableDependencies)) collections.push(entry.data.vulnerableDependencies);
        if (Array.isArray(entry.data.highRiskDependencies)) collections.push(entry.data.highRiskDependencies);
        
        let dropped = 0;
        for (const list of collections) {
            for (const dep of list) {
                if (dep && dep.eoxStatus) {
                    const ver = Number(dep.eoxStatus.logicVersion) || 0;
                    if (ver < currentVersion) {
                        delete dep.eoxStatus;
                        dropped++;
                    }
                }
            }
        }
        if (dropped > 0) {
            console.log(`🧹 EOX: dropped ${dropped} stale eoxStatus entr${dropped === 1 ? 'y' : 'ies'} (older matcher logic)`);
        }
    }

    /**
     * Phase 1.7 backward-compat shim. Pre-fix exports (schema 1.0) named the
     * "first consuming repo's license" field `dep.repositoryLicense`. The same
     * field was misread by view-manager and deps-page as a "dep license fallback",
     * silently attributing host-project licenses to license-less third-party deps.
     *
     * The new code:
     *   - writes the field as `consumerRepoLicense` (clearer intent)
     *   - never reads it as a dep license fallback (only as compat-checker input)
     *
     * Legacy stored data still has `repositoryLicense`. We copy it over to the
     * new name so the (correct, post-fix) compatibility checker can still consult
     * it. We DO NOT delete the legacy field this release — Phase 1.8 export
     * schema bumps to 1.1; deletion is scheduled for 1.2.
     *
     * Read-time only; persisted IndexedDB rows are untouched. Same posture as
     * `_invalidateStaleEOXStatus` and `_recomputeDirectAndTransitive`.
     *
     * @param {Object|null} entry
     */
    _migrateLegacyRepositoryLicense(entry) {
        if (!entry || !entry.data || entry._legacyRepositoryLicenseMigrated) return;
        const collections = [];
        if (Array.isArray(entry.data.allDependencies)) collections.push(entry.data.allDependencies);
        if (Array.isArray(entry.data.topDependencies)) collections.push(entry.data.topDependencies);
        if (Array.isArray(entry.data.vulnerableDependencies)) collections.push(entry.data.vulnerableDependencies);
        if (Array.isArray(entry.data.highRiskDependencies)) collections.push(entry.data.highRiskDependencies);
        let migrated = 0;
        for (const list of collections) {
            for (const dep of list) {
                if (!dep) continue;
                if (dep.consumerRepoLicense) continue;
                if (dep.repositoryLicense) {
                    dep.consumerRepoLicense = dep.repositoryLicense;
                    migrated++;
                }
            }
        }
        entry._legacyRepositoryLicenseMigrated = true;
        if (migrated > 0) {
            console.log(`🔁 License mapping: copied ${migrated} legacy dep.repositoryLicense → consumerRepoLicense (schema <1.1)`);
        }
    }

    /**
     * Recompute `dep.directIn` / `dep.transitiveIn` / `dep.repositories` / `dep.count` on
     * every dep in a loaded analysis from the SBOM ground truth.
     *
     * Source of truth:
     *   - `repo.dependencies`         — every dep declared in the repo's SBOM (flat list).
     *   - `repo.directDependencies`   — subset that the SBOM marked as direct from the
     *                                   main repo node (via SPDX `DEPENDS_ON` with
     *                                   `isDirectFromMain` or CycloneDX direct flag).
     * Both are populated only at SBOM parse time (`SBOMProcessor.processSBOMData` line
     * ~377 and ~385) and are not mutated by any later pipeline stage, so they faithfully
     * reflect what the SBOM said about each repo.
     *
     * Why this exists: pre-fix `SBOMProcessor.computeDependencyTrees` had two over-broad
     * fallbacks when wiring resolved transitives back to repos — falling back to "every
     * repo with any direct dep in this ecosystem" when a parent wasn't yet processed,
     * and inheriting the first parent's full repo set when the dep ended up with zero
     * repos. Both bled cross-repo: in real exports ~87% of cross-repo (dep, repo) pairs
     * were spurious. The earlier `BFS over dep.parents` self-heal that lived here only
     * fixed the direct/transitive *labels* but unioned the recomputed sets with the
     * pre-existing (bloated) `dep.repositories`, so the bloat persisted across loads
     * and showed up downstream as a giant "Unknown" bucket on the Insights depth chart
     * and inflated per-repo counts on the Deps / Vuln / Authors / Licenses pages.
     *
     * Algorithm (read-time only; persisted IndexedDB data is untouched, same posture as
     * `_invalidateStaleEOXStatus` and `_hydrateDriftAndStaleness`):
     *   1. Build `depByKey` once for O(1) lookup.
     *   2. Reset `directIn` / `transitiveIn` / `repositories` on every dep — we are
     *      replacing them, not merging, so the existing bloat is dropped.
     *   3. For each repo, walk `repo.dependencies`. For each `depKey`:
     *      - add `repoKey` to `dep.repositories`,
     *      - add to `dep.directIn` if `repo.directDependencies` includes `depKey`,
     *        otherwise to `dep.transitiveIn`.
     *   4. Set `dep.count = dep.repositories.length` so existing UI counters stay
     *      in sync with the new (smaller) repo sets.
     *   5. Stamp `entry._directTransitiveHealed = true` so reload of the same in-memory
     *      entry within a session is a no-op.
     *
     * Note: resolver-discovered transitives that no SBOM listed (rare; populated only by
     * the registry-based dep tree resolver for vuln/license enrichment) will end up with
     * empty `repositories` after this pass. They stay in `allDependencies` so enrichment
     * data on them isn't lost, but they correctly stop appearing in any per-repo view.
     *
     * @param {Object|null} entry - Loaded analysis entry (may be null).
     */
    _recomputeDirectAndTransitive(entry) {
        if (!entry || !entry.data || entry._directTransitiveHealed) return;
        const allDeps = Array.isArray(entry.data.allDependencies) ? entry.data.allDependencies : null;
        const allRepos = Array.isArray(entry.data.allRepositories) ? entry.data.allRepositories : null;
        if (!allDeps || !allRepos || allDeps.length === 0 || allRepos.length === 0) {
            entry._directTransitiveHealed = true;
            return;
        }

        const depByKey = new Map();
        for (const dep of allDeps) {
            if (!dep || !dep.name) continue;
            depByKey.set(`${dep.name}@${dep.version}`, dep);
        }

        // Snapshot before-state so we can log how much actually changed. We only track
        // direct/transitive label changes (the most user-visible signal); changes purely
        // to dep.repositories cardinality are a side effect of the same computation.
        const beforeByDep = new Map();
        for (const dep of allDeps) {
            if (!dep || !dep.name) continue;
            beforeByDep.set(`${dep.name}@${dep.version}`, {
                direct: (dep.directIn || []).slice().sort().join('|'),
                transitive: (dep.transitiveIn || []).slice().sort().join('|')
            });
        }

        // Replace, don't merge.
        for (const dep of allDeps) {
            if (!dep || !dep.name) continue;
            dep.directIn = [];
            dep.transitiveIn = [];
            dep.repositories = [];
        }

        const directInByDep = new Map();
        const transitiveInByDep = new Map();
        const reposByDep = new Map();
        const addTo = (map, depKey, repoKey) => {
            if (!map.has(depKey)) map.set(depKey, new Set());
            map.get(depKey).add(repoKey);
        };

        let reposVisited = 0;
        for (const repo of allRepos) {
            const repoKey = `${repo.owner}/${repo.name}`;
            const flatDeps = Array.isArray(repo.dependencies) ? repo.dependencies : [];
            if (flatDeps.length === 0) continue;
            const directSet = new Set(Array.isArray(repo.directDependencies) ? repo.directDependencies : []);
            for (const depKey of flatDeps) {
                if (!depByKey.has(depKey)) continue; // dep listed on repo but missing from allDependencies — skip
                addTo(reposByDep, depKey, repoKey);
                if (directSet.has(depKey)) {
                    addTo(directInByDep, depKey, repoKey);
                } else {
                    addTo(transitiveInByDep, depKey, repoKey);
                }
            }
            reposVisited++;
        }

        let depsChanged = 0;
        for (const [depKey, dep] of depByKey) {
            const newDirect = directInByDep.get(depKey);
            const newTransitive = transitiveInByDep.get(depKey);
            const newRepos = reposByDep.get(depKey);

            const directArr = newDirect ? Array.from(newDirect) : [];
            const transitiveArr = newTransitive ? Array.from(newTransitive) : [];
            const reposArr = newRepos ? Array.from(newRepos) : [];

            dep.directIn = directArr;
            dep.transitiveIn = transitiveArr;
            dep.repositories = reposArr;
            dep.count = reposArr.length;

            const before = beforeByDep.get(depKey);
            if (before) {
                const afterDirect = directArr.slice().sort().join('|');
                const afterTransitive = transitiveArr.slice().sort().join('|');
                if (before.direct !== afterDirect || before.transitive !== afterTransitive) {
                    depsChanged++;
                }
            }
        }

        entry._directTransitiveHealed = true;

        if (depsChanged > 0) {
            console.log(`🧹 Direct/transitive recomputed from SBOM truth: ${depsChanged} dep${depsChanged === 1 ? '' : 's'} relabeled across ${reposVisited} repo${reposVisited === 1 ? '' : 's'}`);
        }
    }

    /**
     * Build a Map<packageKey, packageRecord> from the IndexedDB packages store.
     * Used by `_hydrateDriftAndStaleness` to recover per-dep version-drift / staleness
     * data on already-stored analyses that were saved before the array-vs-Map sync
     * fix landed (i.e. their `allDependencies[].versionDrift` is `null` even though
     * the underlying drift records are perfectly intact in the IndexedDB packages
     * store, where `version-drift-analyzer.js` writes them via
     * `saveVersionDriftToCache`).
     *
     * One IndexedDB `getAll` call is far cheaper than per-dep `getPackage` lookups
     * (an N=6500 analysis would do 6500 transactions otherwise). Returns `null` when
     * the IndexedDB layer isn't ready so the caller can skip cache-based hydration
     * gracefully.
     *
     * @returns {Promise<Map<string, Object>|null>}
     */
    async _ensurePackageMap() {
        const dbm = window.indexedDBManager;
        if (!dbm || typeof dbm.getAllPackages !== 'function') return null;
        try {
            const pkgs = await dbm.getAllPackages();
            const map = new Map();
            for (const pkg of (pkgs || [])) {
                if (pkg && pkg.packageKey) map.set(pkg.packageKey, pkg);
            }
            return map;
        } catch (e) {
            console.warn('⚠️ Failed to read packages cache for drift/staleness hydration:', e);
            return null;
        }
    }

    /**
     * Self-healing hydration for `versionDrift` / `staleness` / `eoxStatus` on
     * `allDependencies`.
     *
     * Analyses saved before the GitHub-fetched `runLicenseAndVersionDriftEnrichment`
     * Map-sync fix landed have `versionDrift: null`, `staleness: null`, and
     * `eoxStatus: null` on every entry of `data.allDependencies` — even though
     * the underlying enrichment fetched the data correctly (the *export* nulled it
     * out by rebuilding `allDependencies` from a Map that the legacy code never
     * synced into). Re-running the scan repopulates everything correctly, but to
     * spare users that round-trip we recover what we can on every load:
     *
     *   1. From `vulnerabilityAnalysis.vulnerableDependencies[]` (sync, in-memory).
     *      That subset shares its references with the live processor object so its
     *      `versionDrift` survived export. Cheap, ~5% coverage on typical analyses.
     *   2. From the IndexedDB `packages` store (one bulk `getAll`). Covers every
     *      dep that was ever drift-checked in any session — typically 100% on a
     *      stored analysis, since the packages store outlives `allDependencies`
     *      writes.
     *   3. Promote any `dep.versionDrift.staleness` to `dep.staleness` so the
     *      Insights / Findings pages — which read the canonical top-level
     *      `dep.staleness?.monthsSinceRelease` path — see the data even when only
     *      the nested form survived (the secondary bug from the same fix).
     *   4. Re-derive `eoxStatus` via `EOXService.checkEOX`. Unlike drift/staleness,
     *      endoflife.date data is cached by *product* (not by package@version), so
     *      we have to re-run the matcher per dep. We keep this cheap by using
     *      `eoxService.findProduct` (a sync hash-table lookup) as a pre-filter,
     *      so only the handful of deps that map to a known runtime/framework/OS
     *      ever pay the async `checkEOX` cost. The per-product `getProductEOX`
     *      fetch is itself memoised in the cache manager. Skipped silently when
     *      `eoxService` isn't loaded on the current page (it ships on the pages
     *      that render EOX rows: insights.html, deps.html, findings.html, and
     *      index.html).
     *
     * Mutates `entry.data.allDependencies` in place. Same self-correcting pattern
     * as `_invalidateStaleEOXStatus` and `MalwareService.hydrateAffectedFromCache`.
     *
     * @param {Object|null} entry - Loaded analysis entry (may be null).
     * @param {Map<string, Object>|null} [pkgMap] - Optional pre-built package map
     *   (caller already paid the `getAllPackages` cost — used by `getCombinedData`
     *   to share one read across multiple entries).
     */
    async _hydrateDriftAndStaleness(entry, pkgMap = null) {
        if (!entry || !entry.data || !Array.isArray(entry.data.allDependencies)) return;
        const deps = entry.data.allDependencies;
        if (deps.length === 0) return;

        // Quick exit: nothing to hydrate (every dep already has drift+staleness AND
        // eoxStatus, OR `eoxService` isn't loaded on this page so we can't recover
        // EOX anyway). Each downstream pass also has its own guards, but this short-
        // circuits the common case where the analysis was already produced by post-
        // fix code so we skip even the cheap loops.
        const eoxAvailable = !!(window.eoxService && typeof window.eoxService.checkEOX === 'function');
        const everythingPopulated = deps.every(d => !d || (d.versionDrift && d.staleness && (d.eoxStatus || !eoxAvailable)));
        if (everythingPopulated) return;

        const stats = { fromVuln: 0, fromCache: 0, promotedStaleness: 0, eoxRecovered: 0 };

        // Pass 1: in-memory hydration from vulnerableDependencies. The
        // vulnerableDependencies array shares references with the live
        // sbomProcessor.vulnerabilityAnalysis object, so its versionDrift survived
        // the broken `exportData()` rebuild (only `allDependencies` is rebuilt).
        const vulnDeps = entry.data?.vulnerabilityAnalysis?.vulnerableDependencies;
        if (Array.isArray(vulnDeps) && vulnDeps.length > 0) {
            const vulnByKey = new Map();
            for (const v of vulnDeps) {
                if (v && v.name) vulnByKey.set(`${v.name}@${v.version}`, v);
            }
            for (const dep of deps) {
                if (!dep || !dep.name) continue;
                if (dep.versionDrift) continue;
                const vuln = vulnByKey.get(`${dep.name}@${dep.version}`);
                if (vuln && vuln.versionDrift) {
                    dep.versionDrift = vuln.versionDrift;
                    stats.fromVuln++;
                }
            }
        }

        // Pass 2: bulk hydration from IndexedDB packages cache. Skip if everything
        // is already covered by Pass 1, otherwise pay the one `getAllPackages`
        // call (or reuse the caller-provided map for `getCombinedData`).
        const stillMissing = deps.some(d => d && (!d.versionDrift || !d.staleness));
        let mapToUse = pkgMap;
        if (stillMissing && !mapToUse) {
            mapToUse = await this._ensurePackageMap();
        }
        if (mapToUse && stillMissing) {
            for (const dep of deps) {
                if (!dep || !dep.name || !dep.version) continue;
                if (dep.versionDrift && dep.staleness) continue;

                const ecosystemRaw = (dep.category?.ecosystem || dep.ecosystem || '').toLowerCase();
                if (!ecosystemRaw) continue;
                // Mirror the ecosystem normalisation used by version-drift-analyzer's
                // `checkVersionDrift` so the packageKey we look up matches the one
                // it wrote.
                let ecosystem = ecosystemRaw;
                if (ecosystem === 'rubygems' || ecosystem === 'gem') ecosystem = 'gem';
                else if (ecosystem === 'go' || ecosystem === 'golang') ecosystem = 'golang';
                else if (ecosystem === 'packagist' || ecosystem === 'composer') ecosystem = 'composer';

                const pkg = mapToUse.get(`${ecosystem}:${dep.name}`);
                if (!pkg || !pkg.versionDrift) continue;
                const driftRecord = pkg.versionDrift[dep.version];
                if (!driftRecord) continue;

                if (!dep.versionDrift) {
                    dep.versionDrift = driftRecord;
                    stats.fromCache++;
                }
            }
        }

        // Pass 3: promote nested staleness to the canonical top-level path. Runs
        // unconditionally so it also fixes deps that had drift attached the whole
        // time (e.g. the vulnerable subset) but never got staleness promoted.
        for (const dep of deps) {
            if (!dep) continue;
            if (!dep.staleness && dep.versionDrift?.staleness) {
                dep.staleness = dep.versionDrift.staleness;
                stats.promotedStaleness++;
            }
        }

        // Pass 4: recover `eoxStatus` for already-stored analyses by re-running
        // `EOXService.checkEOX` against the in-memory product mapping table.
        // Unlike drift/staleness, endoflife.date data is cached by *product*
        // (e.g. `nodejs`, `python`, `symfony`) rather than per package@version,
        // so there's no per-dep verdict to read straight out of the packages
        // store — we have to re-derive it. Two key cost optimisations make this
        // cheap enough to run on every load:
        //   (a) `eoxService.findProduct(name, ecosystem)` is a SYNC hash-table
        //       lookup, so we filter the 6500+ deps down to the 0-200 that
        //       actually map to a known endoflife.date product before paying
        //       any async cost.
        //   (b) `checkEOX -> getProductEOX -> cacheManager.getEOXProduct` is
        //       backed by an in-memory cache (and an IndexedDB fallback that
        //       was already populated when the analysis was first scanned), so
        //       all per-product lookups after the first are O(1).
        //
        // Skipped silently if `eoxService` isn't loaded on the current page —
        // it's only loaded on `insights.html`, `deps.html`, `index.html`, and
        // `findings.html`, which is sufficient because those are the pages that
        // actually render EOL/EOS data.
        if (window.eoxService && typeof window.eoxService.checkEOX === 'function' && typeof window.eoxService.findProduct === 'function') {
            for (const dep of deps) {
                if (!dep || !dep.name) continue;
                if (dep.eoxStatus) continue;
                const ecosystem = dep.category?.ecosystem || dep.ecosystem || '';
                if (!window.eoxService.findProduct(dep.name, ecosystem)) continue;
                try {
                    const eoxStatus = await window.eoxService.checkEOX(dep.name, dep.version, ecosystem);
                    if (eoxStatus && (eoxStatus.isEOL || eoxStatus.isEOS || eoxStatus.eolDate || eoxStatus.eosDate)) {
                        dep.eoxStatus = eoxStatus;
                        stats.eoxRecovered++;
                    }
                } catch (e) {
                    // Best-effort hydration; per-dep errors should not break the load.
                }
            }
        }

        if (stats.fromVuln || stats.fromCache || stats.promotedStaleness || stats.eoxRecovered) {
            console.log(`💧 Drift hydration on "${entry.organization || entry.name || 'entry'}": ${stats.fromVuln} from vulns, ${stats.fromCache} from packages cache, ${stats.promotedStaleness} staleness records promoted, ${stats.eoxRecovered} EOX records recovered`);
        }
    }

    /**
     * Get all stored organizations
     */
    async getOrganizations() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.getAllOrganizations();
        } catch (error) {
            console.error('❌ Failed to get organizations:', error);
            return [];
        }
    }

    /**
     * Get all stored repositories
     */
    async getRepositories() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.getAllRepositories();
        } catch (error) {
            console.error('❌ Failed to get repositories:', error);
            return [];
        }
    }

    /**
     * Get all entries (organizations and repositories)
     */
    async getAllEntries() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.getAllEntries();
        } catch (error) {
            console.error('❌ Failed to get all entries:', error);
            return [];
        }
    }

    /**
     * Get full data for an organization or repository
     */
    async getFullOrganizationData(name) {
        return await this.loadAnalysisDataForOrganization(name);
    }

    /**
     * Remove analysis data for a specific organization or repository
     */
    async removeOrganizationData(name) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.deleteEntry(name);
        } catch (error) {
            console.error('❌ Failed to remove data:', error);
            return false;
        }
    }

    /**
     * Clear all stored data
     */
    async clearAllData() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.clearAll();
        } catch (error) {
            console.error('❌ Failed to clear all data:', error);
            return false;
        }
    }

    /**
     * Export data as JSON file
     */
    exportData(data, filename = 'sbom-analysis.json') {
        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('✅ Data exported successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to export data:', error);
            return false;
        }
    }

    /**
     * Generate SHA-256 checksum for data (excluding checksum field)
     * This ensures consistent checksum calculation
     */
    async generateChecksum(data) {
        try {
            // Create a copy without checksum field to ensure consistent hashing
            const dataForChecksum = { ...data };
            delete dataForChecksum.checksum;
            
            // Sort keys for consistent JSON stringification (optional but helps with consistency)
            const sortedData = {};
            Object.keys(dataForChecksum).sort().forEach(key => {
                sortedData[key] = dataForChecksum[key];
            });
            
            const jsonString = JSON.stringify(sortedData);
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(jsonString);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        } catch (error) {
            console.error('❌ Failed to generate checksum:', error);
            throw error;
        }
    }

    /**
     * Generic export function for different data types
     * @param {string} type - Export type: 'all', 'cached', 'authors', 'packages', 'vulnerabilities', 'analysis'
     * @param {string} filename - Output filename
     * @returns {Promise<boolean>} - Success status
     */
    async _exportDataByType(type, filename) {
        try {
            // Phase 1.8: schema bumped 1.0 → 1.1 to include `locations`, `eoxData`,
            // and `legacyAuthors`. These were previously persisted on every analysis
            // run but never made it into any export, so a "round-trip" via Export
            // All / Import All silently dropped them. localStorage user preferences
            // are intentionally NOT exported (treated as machine-local, per the
            // Phase 1.8 plan decision).
            const dataGetters = {
                'all': async () => ({
                    entries: await this.indexedDB.getAllEntries(),
                    vulnerabilities: await this.indexedDB.getAllVulnerabilities(),
                    authorEntities: await this.indexedDB.getAllAuthorEntities(),
                    packageAuthors: await this.indexedDB.getAllPackageAuthors(),
                    packages: await this.indexedDB.getAllPackages(),
                    locations: await this.indexedDB.getAllLocations(),
                    eoxData: await this.indexedDB.getAllEoxData(),
                    legacyAuthors: await this.indexedDB.getAllLegacyAuthors()
                }),
                'cached': async () => ({
                    authorEntities: await this.indexedDB.getAllAuthorEntities(),
                    packageAuthors: await this.indexedDB.getAllPackageAuthors(),
                    packages: await this.indexedDB.getAllPackages(),
                    vulnerabilities: await this.indexedDB.getAllVulnerabilities(),
                    locations: await this.indexedDB.getAllLocations(),
                    eoxData: await this.indexedDB.getAllEoxData(),
                    legacyAuthors: await this.indexedDB.getAllLegacyAuthors()
                }),
                'authors': async () => ({
                    authorEntities: await this.indexedDB.getAllAuthorEntities(),
                    packageAuthors: await this.indexedDB.getAllPackageAuthors()
                }),
                'packages': async () => ({
                    packages: await this.indexedDB.getAllPackages()
                }),
                'vulnerabilities': async () => ({
                    vulnerabilities: await this.indexedDB.getAllVulnerabilities()
                }),
                'analysis': async () => ({
                    entries: await this.indexedDB.getAllEntries()
                }),
                'locations': async () => ({
                    locations: await this.indexedDB.getAllLocations()
                }),
                'eox': async () => ({
                    eoxData: await this.indexedDB.getAllEoxData()
                }),
                'legacy-authors': async () => ({
                    legacyAuthors: await this.indexedDB.getAllLegacyAuthors()
                })
            };
            
            const getData = dataGetters[type];
            if (!getData) {
                throw new Error(`Unknown export type: ${type}`);
            }
            
            const data = await getData();
            const exportData = {
                version: '1.1',
                type: type,
                ...data,
                exportTimestamp: new Date().toISOString()
            };
            
            // Generate checksum (before adding checksum field)
            const checksum = await this.generateChecksum(exportData);
            exportData.checksum = checksum;
            
            return this.exportData(exportData, filename);
        } catch (error) {
            console.error(`❌ Failed to export ${type} data:`, error);
            return false;
        }
    }

    /**
     * Export all data
     */
    async exportAllData(filename = 'sbom-all-analyses.json') {
        return this._exportDataByType('all', filename);
    }

    /**
     * Export cached databases (authors, packages, vulnerabilities)
     */
    async exportCachedDatabases(filename = 'sbom-cached-databases.json') {
        return this._exportDataByType('cached', filename);
    }

    /**
     * Export authors cache
     */
    async exportAuthorsCache(filename = 'sbom-authors-cache.json') {
        return this._exportDataByType('authors', filename);
    }

    /**
     * Export packages cache
     */
    async exportPackagesCache(filename = 'sbom-packages-cache.json') {
        return this._exportDataByType('packages', filename);
    }

    /**
     * Export vulnerabilities cache
     */
    async exportVulnerabilitiesCache(filename = 'sbom-vulnerabilities-cache.json') {
        return this._exportDataByType('vulnerabilities', filename);
    }

    /**
     * Export analysis data only (organizations and repositories)
     */
    async exportAnalysisData(filename = 'sbom-analysis-data.json') {
        return this._exportDataByType('analysis', filename);
    }

    /**
     * Verify checksum of imported data
     */
    async verifyChecksum(jsonData) {
        try {
            if (!jsonData.checksum) {
                return { valid: false, error: 'No checksum found in imported data' };
            }

            // Extract checksum
            const providedChecksum = jsonData.checksum;

            // Recalculate checksum (generateChecksum already excludes checksum field)
            const calculatedChecksum = await this.generateChecksum(jsonData);

            if (providedChecksum !== calculatedChecksum) {
                return { 
                    valid: false, 
                    error: `Checksum mismatch! File may be corrupted or tampered with. Expected: ${calculatedChecksum.substring(0, 16)}..., Got: ${providedChecksum.substring(0, 16)}...` 
                };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Checksum verification failed: ${error.message}` };
        }
    }

    /**
     * Import all data from JSON file.
     *
     * @param {Object} jsonData - Parsed import payload.
     * @param {Object} [opts]
     * @param {('merge'|'replace')} [opts.mode='merge'] - Conflict strategy.
     *   `merge` (default) overwrites by key; existing rows not in the file stay.
     *   `replace` clears the affected stores in one transaction first, then puts.
     */
    async importAllData(jsonData, opts = {}) {
        try {
            // Validate data structure
            if (!jsonData || typeof jsonData !== 'object') {
                throw new Error('Invalid data format: Expected JSON object');
            }

            // Verify checksum if present
            if (jsonData.checksum) {
                const checksumResult = await this.verifyChecksum(jsonData);
                if (!checksumResult.valid) {
                    throw new Error(checksumResult.error);
                }
            }

            // Handle different import types
            if (jsonData.type === 'all') {
                return await this._importAllData(jsonData, opts);
            } else if (jsonData.type === 'cached') {
                return await this._importCachedDatabases(jsonData, opts);
            } else if (jsonData.type === 'authors') {
                return await this._importAuthorsCache(jsonData, opts);
            } else if (jsonData.type === 'packages') {
                return await this._importPackagesCache(jsonData, opts);
            } else if (jsonData.type === 'vulnerabilities') {
                return await this._importVulnerabilitiesCache(jsonData, opts);
            } else if (jsonData.type === 'analysis') {
                return await this._importAnalysisData(jsonData, opts);
            } else if (jsonData.type === 'locations') {
                return await this._importDataByType('locations', jsonData, opts);
            } else if (jsonData.type === 'eox') {
                return await this._importDataByType('eox', jsonData, opts);
            } else if (jsonData.type === 'legacy-authors') {
                return await this._importDataByType('legacy-authors', jsonData, opts);
            } else {
                // Legacy format - try to import as all data
                return await this._importAllData(jsonData, opts);
            }
        } catch (error) {
            console.error('❌ Failed to import data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generic import handler for different data types.
     *
     * Phase 1.8 additions:
     *   - `mode`: 'merge' (default — overwrite by key only) or 'replace'
     *     (clear the affected stores in one atomic transaction first, then put).
     *   - `locations`, `eoxData`, `legacyAuthors` handlers.
     *   - `packageAuthors` now passes `isMaintainer` through to savePackageAuthor
     *     so the maintainer flag isn't silently dropped on import.
     *   - Schema migration shim (`_migrateImportPayload`) so 1.0 files keep
     *     working as the schema bumps to 1.1+.
     *
     * @param {string} type - Import type
     * @param {Object} jsonData - Data to import
     * @param {Object} [opts]
     * @param {('merge'|'replace')} [opts.mode='merge'] - Conflict strategy.
     * @returns {Promise<Object>} - Import result
     */
    async _importDataByType(type, jsonData, opts = {}) {
        // Verify checksum if present
        if (jsonData.checksum) {
            const checksumResult = await this.verifyChecksum(jsonData);
            if (!checksumResult.valid) {
                throw new Error(checksumResult.error);
            }
        }

        // Schema migration runs in-place. 1.0 → 1.1 just back-fills missing
        // arrays so downstream handlers can treat them uniformly.
        this._migrateImportPayload(jsonData);

        const mode = opts.mode === 'replace' ? 'replace' : 'merge';
        // In replace mode, atomically clear all stores this `type` writes to
        // so a smaller snapshot doesn't leave orphaned rows behind. We do this
        // BEFORE any handlers run so the operation is one transaction.
        if (mode === 'replace') {
            const stores = this._storesForType(type);
            if (stores.length > 0 && typeof this.indexedDB.clearStores === 'function') {
                await this.indexedDB.clearStores(stores);
            }
        }

        const result = {
            success: true,
            mode,
            errors: []
        };

        // Import handlers for different data types
        const importHandlers = {
            entries: async (entries) => {
                if (!Array.isArray(entries)) {
                    throw new Error('Invalid data format: Missing or invalid entries array');
                }
                let importedEntries = 0;
                let skippedEntries = 0;
                for (const entry of entries) {
                    try {
                        if (!entry.name && !entry.fullName) {
                            skippedEntries++;
                            continue;
                        }
                        if (entry.type === 'organization' || entry.organization) {
                            const success = await this.indexedDB.saveOrganization(entry.name || entry.organization, entry);
                            if (success) importedEntries++;
                            else result.errors.push(`Failed to import organization: ${entry.name || entry.organization}`);
                        } else if (entry.type === 'repository' || entry.fullName) {
                            const success = await this.indexedDB.saveRepository(entry.fullName, entry);
                            if (success) importedEntries++;
                            else result.errors.push(`Failed to import repository: ${entry.fullName}`);
                        } else {
                            skippedEntries++;
                        }
                    } catch (error) {
                        result.errors.push(`Error importing entry ${entry.name || entry.fullName}: ${error.message}`);
                    }
                }
                result.importedEntries = importedEntries;
                result.skippedEntries = skippedEntries;
            },
            vulnerabilities: async (vulnerabilities) => {
                if (!Array.isArray(vulnerabilities)) return;
                let count = 0;
                for (const vuln of vulnerabilities) {
                    try {
                        if (!vuln.packageKey) continue;
                        const success = await this.indexedDB.saveVulnerability(vuln.packageKey, vuln.data || vuln);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing vulnerability ${vuln.packageKey}: ${error.message}`);
                    }
                }
                result.importedVulnerabilities = count;
            },
            authorEntities: async (authors) => {
                if (!Array.isArray(authors)) return;
                let count = 0;
                for (const author of authors) {
                    try {
                        if (!author.authorKey) continue;
                        const success = await this.indexedDB.saveAuthorEntity(author.authorKey, author);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing author ${author.authorKey}: ${error.message}`);
                    }
                }
                result.importedAuthors = count;
            },
            packageAuthors: async (relationships) => {
                if (!Array.isArray(relationships)) return;
                let count = 0;
                for (const rel of relationships) {
                    try {
                        if (!rel.packageAuthorKey) continue;
                        // Phase 1.8 fix — pass isMaintainer through; legacy
                        // import code dropped this flag, silently flattening
                        // every author into a non-maintainer.
                        const success = await this.indexedDB.savePackageAuthor(
                            rel.packageKey,
                            rel.authorKey,
                            rel.isMaintainer === true
                        );
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing package-author relationship: ${error.message}`);
                    }
                }
                if (type === 'authors') {
                    result.importedRelationships = count;
                } else {
                    result.importedPackages = (result.importedPackages || 0) + count;
                }
            },
            packages: async (packages) => {
                if (!Array.isArray(packages)) return;
                let count = 0;
                for (const pkg of packages) {
                    try {
                        if (!pkg.packageKey) continue;
                        const success = await this.indexedDB.savePackage(pkg.packageKey, pkg);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing package ${pkg.packageKey}: ${error.message}`);
                    }
                }
                result.importedPackages = (result.importedPackages || 0) + count;
            },
            locations: async (locations) => {
                if (!Array.isArray(locations) || typeof this.indexedDB.saveLocation !== 'function') return;
                let count = 0;
                for (const loc of locations) {
                    try {
                        if (!loc || !loc.locationString) continue;
                        const success = await this.indexedDB.saveLocation(loc.locationString, loc);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing location ${loc.locationString}: ${error.message}`);
                    }
                }
                result.importedLocations = count;
            },
            eoxData: async (rows) => {
                if (!Array.isArray(rows) || typeof this.indexedDB.saveEoxData !== 'function') return;
                let count = 0;
                for (const row of rows) {
                    try {
                        if (!row || !row.key) continue;
                        const success = await this.indexedDB.saveEoxData(row.key, row);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing EOX row ${row.key}: ${error.message}`);
                    }
                }
                result.importedEoxData = count;
            },
            legacyAuthors: async (rows) => {
                if (!Array.isArray(rows) || typeof this.indexedDB.saveLegacyAuthor !== 'function') return;
                let count = 0;
                for (const row of rows) {
                    try {
                        if (!row || !row.packageKey) continue;
                        const success = await this.indexedDB.saveLegacyAuthor(row.packageKey, row);
                        if (success) count++;
                    } catch (error) {
                        result.errors.push(`Error importing legacy author ${row.packageKey}: ${error.message}`);
                    }
                }
                result.importedLegacyAuthors = count;
            }
        };

        // Import based on type
        if (type === 'all') {
            await importHandlers.entries(jsonData.entries);
            await importHandlers.vulnerabilities(jsonData.vulnerabilities);
            await importHandlers.authorEntities(jsonData.authorEntities);
            await importHandlers.packageAuthors(jsonData.packageAuthors);
            await importHandlers.packages(jsonData.packages);
            await importHandlers.locations(jsonData.locations);
            await importHandlers.eoxData(jsonData.eoxData);
            await importHandlers.legacyAuthors(jsonData.legacyAuthors);
        } else if (type === 'cached') {
            await importHandlers.authorEntities(jsonData.authorEntities);
            await importHandlers.packageAuthors(jsonData.packageAuthors);
            await importHandlers.packages(jsonData.packages);
            await importHandlers.vulnerabilities(jsonData.vulnerabilities);
            await importHandlers.locations(jsonData.locations);
            await importHandlers.eoxData(jsonData.eoxData);
            await importHandlers.legacyAuthors(jsonData.legacyAuthors);
        } else if (type === 'authors') {
            await importHandlers.authorEntities(jsonData.authorEntities);
            await importHandlers.packageAuthors(jsonData.packageAuthors);
        } else if (type === 'packages') {
            await importHandlers.packages(jsonData.packages);
        } else if (type === 'vulnerabilities') {
            await importHandlers.vulnerabilities(jsonData.vulnerabilities);
        } else if (type === 'analysis') {
            await importHandlers.entries(jsonData.entries);
        } else if (type === 'locations') {
            await importHandlers.locations(jsonData.locations);
        } else if (type === 'eox') {
            await importHandlers.eoxData(jsonData.eoxData);
        } else if (type === 'legacy-authors') {
            await importHandlers.legacyAuthors(jsonData.legacyAuthors);
        }

        result.errors = result.errors.length > 0 ? result.errors : null;
        return result;
    }

    /**
     * Phase 1.8 — return the IndexedDB stores written to by an import of
     * `type`. Used by Replace mode so we know which stores to clear before
     * re-inserting. Keep in sync with the per-type branches above.
     *
     * @param {string} type
     * @returns {string[]}
     */
    _storesForType(type) {
        switch (type) {
            case 'all':
                return ['organizations', 'repositories', 'vulnerabilities', 'authorEntities',
                        'packageAuthors', 'packages', 'locations', 'eoxData', 'authors'];
            case 'cached':
                return ['vulnerabilities', 'authorEntities', 'packageAuthors', 'packages',
                        'locations', 'eoxData', 'authors'];
            case 'authors':       return ['authorEntities', 'packageAuthors'];
            case 'packages':      return ['packages'];
            case 'vulnerabilities': return ['vulnerabilities'];
            case 'analysis':      return ['organizations', 'repositories'];
            case 'locations':     return ['locations'];
            case 'eox':           return ['eoxData'];
            case 'legacy-authors': return ['authors'];
            default: return [];
        }
    }

    /**
     * Phase 1.8 — schema migration shim. Called from the top of
     * `_importDataByType`; mutates `jsonData` in place to bring it up to the
     * current schema. Each step is a no-op when the data is already current,
     * so it's safe to run on every import.
     *
     * Versioning:
     *   1.0 — pre-Phase-1.8 exports. Missing locations/eoxData/legacyAuthors.
     *   1.1 — Phase 1.8: covers all IndexedDB stores. (Future) 1.2 will add
     *         `vexDocuments` for Phase 3.
     */
    _migrateImportPayload(jsonData) {
        if (!jsonData) return;
        const v = String(jsonData.version || '1.0');
        // 1.0 → 1.1: back-fill new arrays so downstream handlers see []
        // instead of `undefined`. No data is lost; the user's snapshot just
        // didn't have these stores.
        if (v.startsWith('1.0') || v === '1') {
            if (!('locations' in jsonData)) jsonData.locations = [];
            if (!('eoxData' in jsonData)) jsonData.eoxData = [];
            if (!('legacyAuthors' in jsonData)) jsonData.legacyAuthors = [];
            jsonData.version = '1.1';
        }
        // Future: 1.1 → 1.2 will populate vexDocuments=[] when Phase 3 lands.
    }

    /**
     * Import all data (legacy and new format)
     */
    async _importAllData(jsonData, opts = {}) {
        return this._importDataByType('all', jsonData, opts);
    }

    /**
     * Import cached databases (authors, packages, vulnerabilities)
     */
    async _importCachedDatabases(jsonData, opts = {}) {
        return this._importDataByType('cached', jsonData, opts);
    }

    /**
     * Import authors cache
     */
    async _importAuthorsCache(jsonData, opts = {}) {
        return this._importDataByType('authors', jsonData, opts);
    }

    /**
     * Import packages cache
     */
    async _importPackagesCache(jsonData, opts = {}) {
        return this._importDataByType('packages', jsonData, opts);
    }

    /**
     * Import vulnerabilities cache
     */
    async _importVulnerabilitiesCache(jsonData, opts = {}) {
        return this._importDataByType('vulnerabilities', jsonData, opts);
    }

    /**
     * Import analysis data only
     */
    async _importAnalysisData(jsonData, opts = {}) {
        return this._importDataByType('analysis', jsonData, opts);
    }

    /**
     * Get storage usage information
     */
    async getStorageInfo() {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            
            console.log('📊 Getting storage info...');
            const orgs = await this.indexedDB.getAllOrganizations();
            const repos = await this.indexedDB.getAllRepositories();
            const estimate = await this.indexedDB.getStorageEstimate();
            
            const totalEntries = orgs.length + repos.length;
            
            console.log(`📊 Storage info summary: ${orgs.length} orgs, ${repos.length} repos, ${totalEntries} total entries`);
            
            const storageInfo = {
                totalSize: estimate ? estimate.usage : 0,
                maxStorageSize: estimate ? estimate.quota : 0,
                availableSpace: estimate ? (estimate.quota - estimate.usage) : 0,
                hasData: totalEntries > 0,
                organizationsCount: orgs.length,
                repositoriesCount: repos.length,
                totalEntries: totalEntries,
                organizations: orgs.map(org => {
                    const name = org.organization || org.name;
                    // Calculate from actual data arrays for accuracy (matches Statistics Dashboard)
                    const actualRepos = org.data?.allRepositories?.length || org.data?.statistics?.totalRepositories || 0;
                    const actualDeps = org.data?.allDependencies?.length || org.data?.statistics?.totalDependencies || 0;
                    console.log(`   📋 Org: ${name} - ${actualRepos} repos, ${actualDeps} deps (from ${org.data?.allRepositories ? 'allRepositories' : 'statistics'})`);
                    return {
                        name: name,
                        timestamp: org.timestamp,
                        repositories: actualRepos,
                        dependencies: actualDeps,
                        type: 'organization'
                    };
                }),
                repositories: repos.map(repo => {
                    // Calculate from actual data arrays for accuracy (matches Statistics Dashboard)
                    const actualDeps = repo.data?.allDependencies?.length || repo.data?.statistics?.totalDependencies || 0;
                    console.log(`   📋 Repo: ${repo.fullName} - ${actualDeps} deps (from ${repo.data?.allDependencies ? 'allDependencies' : 'statistics'})`);
                    return {
                        name: repo.fullName,
                        timestamp: repo.timestamp,
                        repositories: 1,
                        dependencies: actualDeps,
                        type: 'repository'
                    };
                }),
                usagePercent: estimate ? parseFloat(estimate.usagePercent) : 0
            };
            
            console.log(`✅ Storage info retrieved: ${storageInfo.organizations.length} orgs, ${storageInfo.repositories.length} repos`);
            return storageInfo;
        } catch (error) {
            console.error('❌ Failed to get storage info:', error);
            console.error('   Error details:', error.stack);
            return {
                totalSize: 0,
                maxStorageSize: 0,
                availableSpace: 0,
                hasData: false,
                organizationsCount: 0,
                repositoriesCount: 0,
                totalEntries: 0,
                organizations: [],
                repositories: [],
                usagePercent: 0
            };
        }
    }

    /**
     * Check if storage is available
     */
    isStorageAvailable() {
        return 'indexedDB' in window;
    }

    /**
     * Show storage status
     */
    async showStorageStatus() {
        try {
            const storageInfo = await this.getStorageInfo();
            const usagePercent = storageInfo.usagePercent;
            
            console.log(`📊 Storage Status:`);
            console.log(`   Total Usage: ${(storageInfo.totalSize / 1024 / 1024).toFixed(2)}MB / ${(storageInfo.maxStorageSize / 1024 / 1024).toFixed(2)}MB (${usagePercent.toFixed(1)}%)`);
            console.log(`   Available: ${(storageInfo.availableSpace / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   Organizations: ${storageInfo.organizationsCount}`);
            console.log(`   Repositories: ${storageInfo.repositoriesCount}`);
            
            if (usagePercent > 80) {
                console.warn('⚠️ Storage usage is high. Consider exporting data.');
            }
            
            return storageInfo;
        } catch (error) {
            console.error('❌ Failed to show storage status:', error);
            return null;
        }
    }

    /**
     * Save vulnerability data
     */
    async saveVulnerabilityData(packageKey, vulnerabilityData) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.saveVulnerability(packageKey, vulnerabilityData);
        } catch (error) {
            console.error('❌ Failed to save vulnerability data:', error);
            return false;
        }
    }

    /**
     * Get vulnerability data
     */
    async getVulnerabilityData() {
        try {
            const vulnerabilities = await this.indexedDB.getAllVulnerabilities();
            const result = {};
            for (const vuln of vulnerabilities) {
                result[vuln.packageKey] = vuln.data;
            }
            return result;
        } catch (error) {
            console.error('❌ Failed to get vulnerability data:', error);
            return {};
        }
    }

    /**
     * Get vulnerability data for a specific package
     */
    async getVulnerabilityDataForPackage(packageKey) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            return await this.indexedDB.getVulnerability(packageKey);
        } catch (error) {
            console.error('❌ Failed to get vulnerability for package:', error);
            return null;
        }
    }

    /**
     * Check if vulnerability data exists for a package
     */
    async hasVulnerabilityData(packageKey) {
        try {
            // Ensure DB is initialized
            if (!this.initialized) {
                await this.init();
            }
            const data = await this.indexedDB.getVulnerability(packageKey);
            return data !== null;
        } catch (error) {
            console.error('❌ Failed to check vulnerability data:', error);
            return false;
        }
    }

    /**
     * Clear all vulnerability data
     */
    async clearVulnerabilityData() {
        try {
            return await this.indexedDB.clearVulnerabilities();
        } catch (error) {
            console.error('❌ Failed to clear vulnerability data:', error);
            return false;
        }
    }

    /**
     * Get combined data from all organizations
     */
    async getCombinedData() {
        try {
            const entries = await this.indexedDB.getAllEntries();
            if (entries.length === 0) {
                return null;
            }

            // Collect all data from entries
            const allData = entries.filter(entry => entry.data);

            if (allData.length === 0) {
                return null;
            }

            // Self-heal each entry's `allDependencies` BEFORE merging — the combiner
            // spreads `...dep` so any drift / staleness we hydrate here carries
            // through into `combined.allDependencies` automatically. We share one
            // packages-store read across all entries via `_ensurePackageMap()` so
            // a 3-org / 6500-dep portfolio still pays a single bulk IndexedDB
            // transaction rather than one per entry.
            const pkgMap = await this._ensurePackageMap();
            for (const entry of allData) {
                this._invalidateStaleEOXStatus(entry);
                this._recomputeDirectAndTransitive(entry);
                this._migrateLegacyRepositoryLicense(entry);
                await this._hydrateDriftAndStaleness(entry, pkgMap);
            }

            // Combine the data
            const combinedData = this.combineOrganizationData(allData);
            return {
                organization: 'All Entries Combined',
                timestamp: new Date().toISOString(),
                data: combinedData
            };
        } catch (error) {
            console.error('❌ Failed to get combined data:', error);
            return null;
        }
    }

    /**
     * Combine data from multiple organizations/repositories
     */
    combineOrganizationData(entriesData) {
        const combined = {
            statistics: {
                totalRepositories: 0,
                processedRepositories: 0,
                successfulRepositories: 0,
                failedRepositories: 0,
                repositoriesWithDependencies: 0,
                totalDependencies: 0,
                averageDependenciesPerRepo: 0
            },
            topDependencies: [],
            topRepositories: [],
            allDependencies: [],
            allRepositories: [],
            categoryStats: {},
            languageStats: {},
            vulnerabilities: [],
            licenses: [],
            vulnerabilityAnalysis: null,
            malwareAnalysis: null,
            licenseAnalysis: null,
            qualityAnalysis: null,
            githubActionsAnalysis: null,
            authorAnalysis: null
        };

        // Aggregate statistics
        for (const entry of entriesData) {
            const stats = entry.data.statistics;
            if (stats) {
                combined.statistics.totalRepositories += stats.totalRepositories || 0;
                combined.statistics.processedRepositories += stats.processedRepositories || 0;
                combined.statistics.successfulRepositories += stats.successfulRepositories || 0;
                combined.statistics.failedRepositories += stats.failedRepositories || 0;
                combined.statistics.repositoriesWithDependencies += stats.repositoriesWithDependencies || 0;
                combined.statistics.totalDependencies += stats.totalDependencies || 0;
            }
        }

        // Calculate average dependencies per repo
        if (combined.statistics.repositoriesWithDependencies > 0) {
            combined.statistics.averageDependenciesPerRepo = 
                Math.round(combined.statistics.totalDependencies / combined.statistics.repositoriesWithDependencies);
        }

        // Combine dependencies across all entries
        const dependencyMap = new Map();
        const repoMap = new Map();

        for (const entry of entriesData) {
            // Process all dependencies
            if (entry.data.allDependencies) {
                for (const dep of entry.data.allDependencies) {
                    const key = `${dep.name}@${dep.version}`;
                    // Ensure repositories is always an array, never undefined
                    const depRepositories = Array.isArray(dep.repositories) ? dep.repositories : [];
                    
                    if (dependencyMap.has(key)) {
                        const existing = dependencyMap.get(key);
                        existing.count += dep.count;
                        // Merge repositories, ensuring we don't add duplicates
                        existing.repositories = [...new Set([...existing.repositories, ...depRepositories])];
                    } else {
                        dependencyMap.set(key, {
                            ...dep,
                            repositories: [...depRepositories]
                        });
                    }
                }
            }

            // Process all repositories
            if (entry.data.allRepositories) {
                for (const repo of entry.data.allRepositories) {
                    const repoKey = `${repo.owner}/${repo.name}`;
                    if (!repoMap.has(repoKey)) {
                        repoMap.set(repoKey, repo);
                    }
                }
            }

            // Combine category stats
            if (entry.data.categoryStats) {
                for (const [category, value] of Object.entries(entry.data.categoryStats)) {
                    let count = 0;
                    if (typeof value === 'object' && value !== null && value.count !== undefined) {
                        count = value.count;
                    } else {
                        count = parseInt(value) || 0;
                    }
                    combined.categoryStats[category] = (combined.categoryStats[category] || 0) + count;
                }
            }

            // Combine language stats
            if (entry.data.languageStats) {
                if (Array.isArray(entry.data.languageStats)) {
                    for (const langStat of entry.data.languageStats) {
                        const language = langStat.language;
                        const count = langStat.count;
                        combined.languageStats[language] = (combined.languageStats[language] || 0) + count;
                    }
                } else {
                    for (const [language, value] of Object.entries(entry.data.languageStats)) {
                        let count = 0;
                        if (typeof value === 'object' && value !== null && value.count !== undefined) {
                            count = value.count;
                        } else {
                            count = parseInt(value) || 0;
                        }
                        combined.languageStats[language] = (combined.languageStats[language] || 0) + count;
                    }
                }
            }
        }

        // Convert maps to arrays and sort
        combined.allDependencies = Array.from(dependencyMap.values())
            .sort((a, b) => b.count - a.count);

        combined.topDependencies = combined.allDependencies.slice(0, 50);

        combined.allRepositories = Array.from(repoMap.values())
            .sort((a, b) => (b.totalDependencies || 0) - (a.totalDependencies || 0));

        combined.topRepositories = combined.allRepositories.slice(0, 50);

        // Aggregate quality analysis from all repositories
        if (window.SBOMQualityProcessor) {
            const qualityProcessor = new window.SBOMQualityProcessor();
            const allQualityAssessments = combined.allRepositories
                .filter(repo => repo.qualityAssessment)
                .map(repo => repo.qualityAssessment);
            
            if (allQualityAssessments.length > 0) {
                combined.qualityAnalysis = qualityProcessor.calculateAggregateQuality(allQualityAssessments);
            }
        }

        // Combine vulnerability analysis from all organizations
        const vulnerabilityMap = new Map(); // key: name@version
        let totalCriticalVulnerabilities = 0;
        let totalHighVulnerabilities = 0;
        let totalMediumVulnerabilities = 0;
        let totalLowVulnerabilities = 0;

        for (const entry of entriesData) {
            if (entry.data.vulnerabilityAnalysis) {
                const vulnAnalysis = entry.data.vulnerabilityAnalysis;
                
                // Aggregate vulnerability counts (these are counts of vulnerabilities, not packages)
                totalCriticalVulnerabilities += vulnAnalysis.criticalVulnerabilities || 0;
                totalHighVulnerabilities += vulnAnalysis.highVulnerabilities || 0;
                totalMediumVulnerabilities += vulnAnalysis.mediumVulnerabilities || 0;
                totalLowVulnerabilities += vulnAnalysis.lowVulnerabilities || 0;

                // Combine vulnerable dependencies (deduplicate by name@version)
                if (vulnAnalysis.vulnerableDependencies) {
                    for (const vulnDep of vulnAnalysis.vulnerableDependencies) {
                        const key = `${vulnDep.name}@${vulnDep.version}`;
                        if (vulnerabilityMap.has(key)) {
                            // Merge vulnerabilities if same package exists in multiple orgs
                            const existing = vulnerabilityMap.get(key);
                            // Combine vulnerabilities, deduplicate by ID
                            const vulnIdMap = new Map();
                            existing.vulnerabilities.forEach(v => vulnIdMap.set(v.id, v));
                            vulnDep.vulnerabilities.forEach(v => {
                                if (!vulnIdMap.has(v.id)) {
                                    vulnIdMap.set(v.id, v);
                                }
                            });
                            existing.vulnerabilities = Array.from(vulnIdMap.values());
                        } else {
                            vulnerabilityMap.set(key, {
                                name: vulnDep.name,
                                version: vulnDep.version,
                                vulnerabilities: [...(vulnDep.vulnerabilities || [])]
                            });
                        }
                    }
                }
            }
        }

        // Create combined vulnerability analysis
        if (vulnerabilityMap.size > 0) {
            combined.vulnerabilityAnalysis = {
                vulnerablePackages: vulnerabilityMap.size,
                vulnerableDependencies: Array.from(vulnerabilityMap.values()),
                criticalVulnerabilities: totalCriticalVulnerabilities,
                highVulnerabilities: totalHighVulnerabilities,
                mediumVulnerabilities: totalMediumVulnerabilities,
                lowVulnerabilities: totalLowVulnerabilities
            };
        }

        // Combine malware analysis from all entries (deduplicate by ecosystem|name|version)
        const malwareMap = new Map();
        let malwareTotalAdvisories = 0;
        let malwareTotalPackages = 0;
        for (const entry of entriesData) {
            const ma = entry.data.malwareAnalysis;
            if (!ma || !Array.isArray(ma.maliciousDependencies)) continue;
            malwareTotalPackages += ma.totalPackages || 0;
            for (const md of ma.maliciousDependencies) {
                const key = `${(md.ecosystem || '').toLowerCase()}|${md.name}|${md.version || ''}`;
                const advisories = Array.isArray(md.advisories) ? md.advisories : [];
                if (malwareMap.has(key)) {
                    const existing = malwareMap.get(key);
                    const seen = new Set(existing.advisories.map(a => a.id));
                    for (const adv of advisories) {
                        if (!seen.has(adv.id)) {
                            existing.advisories.push(adv);
                            malwareTotalAdvisories++;
                        }
                    }
                    const repos = new Set([...(existing.repositories || []), ...(md.repositories || [])]);
                    existing.repositories = Array.from(repos);
                } else {
                    malwareMap.set(key, {
                        name: md.name,
                        version: md.version,
                        ecosystem: md.ecosystem || null,
                        category: md.category || null,
                        repositories: Array.isArray(md.repositories) ? Array.from(md.repositories) : [],
                        advisories: advisories.map(a => ({ ...a }))
                    });
                    malwareTotalAdvisories += advisories.length;
                }
            }
        }
        if (malwareMap.size > 0) {
            combined.malwareAnalysis = {
                timestamp: new Date().toISOString(),
                totalPackages: malwareTotalPackages,
                maliciousPackages: malwareMap.size,
                totalAdvisories: malwareTotalAdvisories,
                sources: { osv: true, openssf: true },
                maliciousDependencies: Array.from(malwareMap.values())
            };
        }

        // Combine license analysis from all organizations
        let totalLicensedDeps = 0;
        let totalUnlicensedDeps = 0;
        let totalDeps = 0;
        const categoryBreakdown = {
            permissive: 0,
            copyleft: 0,
            lgpl: 0,
            proprietary: 0,
            custom: 0,
            unknown: 0
        };
        const riskBreakdown = {
            low: 0,
            medium: 0,
            high: 0
        };
        const allConflicts = [];
        const allRecommendations = [];
        const allHighRiskDependencies = [];
        const licenseFamiliesMap = new Map();

        for (const entry of entriesData) {
            if (entry.data.licenseAnalysis) {
                const licenseAnalysis = entry.data.licenseAnalysis;
                
                // Combine summary
                if (licenseAnalysis.summary) {
                    const summary = licenseAnalysis.summary;
                    totalDeps += summary.totalDependencies || 0;
                    totalLicensedDeps += summary.licensedDependencies || 0;
                    totalUnlicensedDeps += summary.unlicensedDependencies || 0;
                    
                    // Combine category breakdown — used as a fallback if we cannot
                    // recompute from deduped allDependencies below.
                    if (summary.categoryBreakdown) {
                        for (const k of Object.keys(categoryBreakdown)) {
                            categoryBreakdown[k] += summary.categoryBreakdown[k] || 0;
                        }
                    }
                    
                    // Combine risk breakdown
                    if (summary.riskBreakdown) {
                        riskBreakdown.low += summary.riskBreakdown.low || 0;
                        riskBreakdown.medium += summary.riskBreakdown.medium || 0;
                        riskBreakdown.high += summary.riskBreakdown.high || 0;
                    }
                }
                
                // Combine conflicts
                if (licenseAnalysis.conflicts && Array.isArray(licenseAnalysis.conflicts)) {
                    allConflicts.push(...licenseAnalysis.conflicts);
                }
                
                // Combine recommendations
                if (licenseAnalysis.recommendations && Array.isArray(licenseAnalysis.recommendations)) {
                    allRecommendations.push(...licenseAnalysis.recommendations);
                }
                
                // Combine high-risk dependencies (deduplicate by name@version)
                if (licenseAnalysis.highRiskDependencies && Array.isArray(licenseAnalysis.highRiskDependencies)) {
                    for (const dep of licenseAnalysis.highRiskDependencies) {
                        const key = `${dep.name}@${dep.version}`;
                        if (!allHighRiskDependencies.find(d => `${d.name}@${d.version}` === key)) {
                            allHighRiskDependencies.push(dep);
                        }
                    }
                }
                
                // Combine license families
                if (licenseAnalysis.licenseFamilies && licenseAnalysis.licenseFamilies instanceof Map) {
                    for (const [family, deps] of licenseAnalysis.licenseFamilies.entries()) {
                        if (!licenseFamiliesMap.has(family)) {
                            licenseFamiliesMap.set(family, []);
                        }
                        const existingDeps = licenseFamiliesMap.get(family);
                        if (Array.isArray(deps)) {
                            existingDeps.push(...deps);
                        }
                    }
                }
            }
        }

        // Combine GitHub Actions analysis from all organizations
        const allGARepositories = [];
        const allGAFindings = [];
        const allGAFindingsByType = {};
        let totalGAActions = 0;
        let uniqueGAActions = 0;
        const uniqueActionsSet = new Set();

        for (const entry of entriesData) {
            if (entry.data.githubActionsAnalysis) {
                const gaAnalysis = entry.data.githubActionsAnalysis;
                
                // Aggregate repositories
                if (gaAnalysis.repositories && Array.isArray(gaAnalysis.repositories)) {
                    allGARepositories.push(...gaAnalysis.repositories);
                }
                
                // Aggregate findings
                if (gaAnalysis.findings && Array.isArray(gaAnalysis.findings)) {
                    allGAFindings.push(...gaAnalysis.findings);
                }
                
                // Aggregate findings by type
                if (gaAnalysis.findingsByType) {
                    for (const [type, count] of Object.entries(gaAnalysis.findingsByType)) {
                        allGAFindingsByType[type] = (allGAFindingsByType[type] || 0) + count;
                    }
                }
                
                // Aggregate action counts
                totalGAActions += gaAnalysis.totalActions || 0;
                
                // Count unique actions across all repositories
                if (gaAnalysis.repositories && Array.isArray(gaAnalysis.repositories)) {
                    for (const repoData of gaAnalysis.repositories) {
                        if (repoData.actions && Array.isArray(repoData.actions)) {
                            for (const action of repoData.actions) {
                                const actionKey = `${action.owner}/${action.repo}${action.path ? '/' + action.path : ''}@${action.ref}`;
                                uniqueActionsSet.add(actionKey);
                                
                                // Also count nested actions
                                if (action.nested && Array.isArray(action.nested)) {
                                    const checkNested = (nestedAction) => {
                                        if (nestedAction.owner && nestedAction.repo) {
                                            const nestedKey = `${nestedAction.owner}/${nestedAction.repo}${nestedAction.path ? '/' + nestedAction.path : ''}@${nestedAction.ref}`;
                                            uniqueActionsSet.add(nestedKey);
                                            if (nestedAction.nested && Array.isArray(nestedAction.nested)) {
                                                nestedAction.nested.forEach(checkNested);
                                            }
                                        }
                                    };
                                    action.nested.forEach(checkNested);
                                }
                            }
                        }
                    }
                }
            }
        }

        uniqueGAActions = uniqueActionsSet.size;

        if (allGARepositories.length > 0 || allGAFindings.length > 0) {
            combined.githubActionsAnalysis = {
                repositories: allGARepositories,
                totalActions: totalGAActions,
                uniqueActions: uniqueGAActions,
                findings: allGAFindings,
                findingsByType: allGAFindingsByType
            };
        }

        // Recompute the canonical breakdown from the deduped allDependencies so the
        // pie-chart center matches the dependency table. Summing per-analysis numbers
        // double-counts the same dep across analyses; this pass classifies each unique
        // (name@version) once. Falls back to the summed numbers when LicenseProcessor
        // is unavailable (e.g. older HTML pages that don't load it).
        let canonicalSummary = {
            totalDependencies: totalDeps,
            licensedDependencies: totalLicensedDeps,
            unlicensedDependencies: totalUnlicensedDeps,
            categoryBreakdown: categoryBreakdown,
            riskBreakdown: riskBreakdown
        };
        if (typeof window !== 'undefined' && window.LicenseProcessor && Array.isArray(combined.allDependencies) && combined.allDependencies.length > 0) {
            try {
                const lp = new window.LicenseProcessor();
                const reBreakdown = { permissive: 0, copyleft: 0, lgpl: 0, proprietary: 0, custom: 0, unknown: 0 };
                const reRisk = { low: 0, medium: 0, high: 0 };
                let reLicensed = 0;
                let reUnlicensed = 0;
                for (const dep of combined.allDependencies) {
                    // Prefer enriched license fields (deps.dev / registry) over the raw SBOM.
                    const enriched = dep.licenseFull || dep.license;
                    const synth = (enriched && enriched !== 'NOASSERTION' && String(enriched).trim() !== '')
                        ? { licenseConcluded: enriched, licenseDeclared: enriched }
                        : (dep.originalPackage || {});
                    const info = lp.parseLicense(synth);
                    if (info && info.license && info.license !== 'NOASSERTION') {
                        reLicensed++;
                        reRisk[info.risk] = (reRisk[info.risk] || 0) + 1;
                        reBreakdown[info.category] = (reBreakdown[info.category] || 0) + 1;
                    } else {
                        reUnlicensed++;
                    }
                }
                canonicalSummary = {
                    totalDependencies: combined.allDependencies.length,
                    licensedDependencies: reLicensed,
                    unlicensedDependencies: reUnlicensed,
                    categoryBreakdown: reBreakdown,
                    riskBreakdown: reRisk
                };
            } catch (e) {
                console.warn('Combined license recompute failed; falling back to summed breakdown:', e);
            }
        }

        // Create combined license analysis
        if (canonicalSummary.totalDependencies > 0) {
            combined.licenseAnalysis = {
                summary: canonicalSummary,
                conflicts: allConflicts,
                recommendations: allRecommendations,
                licenseFamilies: licenseFamiliesMap,
                highRiskDependencies: allHighRiskDependencies
            };
        }

        // Combine author analysis from all organizations
        const authorMap = new Map(); // key: authorKey
        let totalAuthors = 0;
        let totalAuthorPackages = 0;

        for (const entry of entriesData) {
            if (entry.data.authorAnalysis && entry.data.authorAnalysis.authors) {
                const authorAnalysis = entry.data.authorAnalysis;
                totalAuthorPackages += authorAnalysis.totalPackages || 0;
                
                for (const authorRef of authorAnalysis.authors) {
                    const authorKey = authorRef.authorKey || `${authorRef.ecosystem}:${authorRef.author}`;
                    
                    if (authorMap.has(authorKey)) {
                        const existing = authorMap.get(authorKey);
                        // Merge packages
                        const allPackages = [...new Set([...existing.packages, ...(authorRef.packages || [])])];
                        existing.packages = allPackages;
                        existing.count = (existing.count || 0) + (authorRef.count || 0);
                        
                        // Merge repositories
                        const allRepos = [...new Set([...existing.repositories, ...(authorRef.repositories || [])])];
                        existing.repositories = allRepos;
                        existing.repositoryCount = allRepos.length;
                        
                        // Merge packageRepositories
                        if (authorRef.packageRepositories) {
                            if (!existing.packageRepositories) {
                                existing.packageRepositories = {};
                            }
                            for (const [pkg, repos] of Object.entries(authorRef.packageRepositories)) {
                                if (!existing.packageRepositories[pkg]) {
                                    existing.packageRepositories[pkg] = [];
                                }
                                existing.packageRepositories[pkg] = [...new Set([...existing.packageRepositories[pkg], ...repos])];
                            }
                        }
                    } else {
                        authorMap.set(authorKey, {
                            authorKey: authorKey,
                            ecosystem: authorRef.ecosystem,
                            packages: [...(authorRef.packages || [])],
                            packageRepositories: authorRef.packageRepositories ? {...authorRef.packageRepositories} : {},
                            repositories: [...(authorRef.repositories || [])],
                            repositoryCount: authorRef.repositoryCount || (authorRef.repositories?.length || 0),
                            count: authorRef.count || 0
                        });
                    }
                }
            }
        }

        // Create combined author analysis
        if (authorMap.size > 0) {
            const authorsList = Array.from(authorMap.values())
                .sort((a, b) => (b.repositoryCount || 0) - (a.repositoryCount || 0));
            
            combined.authorAnalysis = {
                timestamp: Date.now(),
                totalAuthors: authorsList.length,
                totalPackages: totalAuthorPackages,
                authors: authorsList,
                _cacheVersion: 3  // Mark as using new cache architecture
            };
        }

        return combined;
    }

    /**
     * Save incremental analysis data
     */
    async saveIncrementalAnalysisData(name, partialData, isComplete = false) {
        try {
            return await this.saveAnalysisData(name, partialData);
        } catch (error) {
            console.error('❌ Failed to save incremental data:', error);
            return false;
        }
    }

    /**
     * Update analysis with vulnerabilities
     */
    async updateAnalysisWithVulnerabilities(name, vulnerabilityData) {
        try {
            const existingData = await this.loadAnalysisDataForOrganization(name);
            if (!existingData) {
                console.warn('⚠️ No existing data found for:', name);
                return false;
            }

            existingData.data.vulnerabilityAnalysis = vulnerabilityData;
            existingData.timestamp = new Date().toISOString();

            return await this.saveAnalysisData(name, existingData.data);
        } catch (error) {
            console.error('❌ Failed to update analysis with vulnerabilities:', error);
            return false;
        }
    }

    /**
     * Update analysis with malware classification results.
     * The malware analysis is derived from the OSV vulnerability data and
     * stored alongside it on the analysis record (not in a separate
     * IndexedDB store - the per-package OSV cache already holds the raw
     * advisories).
     */
    async updateAnalysisWithMalware(name, malwareData) {
        try {
            if (!name) return false;
            const existingData = await this.loadAnalysisDataForOrganization(name);
            if (!existingData) {
                console.warn('⚠️ No existing data found for:', name);
                return false;
            }

            existingData.data.malwareAnalysis = malwareData;
            existingData.timestamp = new Date().toISOString();

            return await this.saveAnalysisData(name, existingData.data);
        } catch (error) {
            console.error('❌ Failed to update analysis with malware:', error);
            return false;
        }
    }

    /**
     * Check data size and warn
     */
    async checkDataSizeAndWarn(name) {
        try {
            const estimate = await this.indexedDB.getStorageEstimate();
            if (estimate && estimate.usagePercent > 80) {
                return {
                    isLarge: true,
                    usagePercent: estimate.usagePercent,
                    message: `Storage usage is ${estimate.usagePercent}%. Consider exporting and clearing old data.`
                };
            }
            return { isLarge: false };
        } catch (error) {
            console.error('❌ Failed to check data size:', error);
            return { isLarge: false };
        }
    }
}

// Export for use in other modules
window.StorageManager = StorageManager;

// Create global instance
const storageManager = new StorageManager();
window.storageManager = storageManager;
