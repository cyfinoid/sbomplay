/**
 * Enrichment Pipeline - Shared module for enriching SBOM analysis data
 * Used by both app.js (GitHub flow) and upload-page.js (file upload flow)
 * 
 * This ensures both entry points use identical enrichment logic:
 * - License fetching (PyPI, Go, npm, maven, cargo, etc.)
 * - Version drift analysis (with staleness detection)
 * - Author/maintainer information
 * - Vulnerability analysis (via sbomProcessor)
 * - EOX (End-of-Life/Support) status checking
 * - Source repository validation
 */
console.log('🔧 EnrichmentPipeline loaded');

class EnrichmentPipeline {
    constructor(sbomProcessor, storageManager) {
        this.sbomProcessor = sbomProcessor;
        this.storageManager = storageManager;
        
        // deps.dev ecosystem mapping
        this.ecosystemMap = {
            'npm': 'npm',
            'pypi': 'pypi',
            'go': 'go',
            'golang': 'go',
            'maven': 'maven',
            'cargo': 'cargo',
            'nuget': 'nuget',
            'rubygems': 'rubygems',
            'composer': 'npm'  // Packagist uses similar API
        };
    }

    /**
     * Run full enrichment pipeline on analysis results
     * @param {Object} results - Analysis results from sbomProcessor.exportData()
     * @param {string} identifier - Project/org identifier for storage
     * @param {Function} onProgress - Progress callback (phase, percent, message)
     * @returns {Promise<Object>} - Enriched results
     */
    async runFullEnrichment(results, identifier, onProgress = () => {}) {
        if (!results || !results.allDependencies || results.allDependencies.length === 0) {
            console.log('ℹ️ No dependencies to enrich');
            return results;
        }

        const deps = results.allDependencies;
        const uploadInfo = results.uploadInfo; // Preserve upload metadata
        console.log(`🔧 Starting enrichment pipeline for ${deps.length} dependencies`);

        // Helper to save current state after each phase
        const saveProgress = async (phaseName) => {
            const currentResults = this.sbomProcessor.exportData();
            if (uploadInfo) {
                currentResults.uploadInfo = uploadInfo;
            }
            await this.storageManager.saveAnalysisData(identifier, currentResults);
            console.log(`💾 Saved after ${phaseName}`);
            return currentResults;
        };

        // Phase 1: Vulnerability analysis (60-66%)
        onProgress('vulnerability', 60, 'Analyzing vulnerabilities...');
        await this.analyzeVulnerabilities(identifier, (pct, msg) => {
            onProgress('vulnerability', 60 + pct * 0.06, msg);
        });
        await saveProgress('Enrichment Phase 1: Vulnerabilities');

        // Phase 1.5: Malware classification (66-68%)
        // Reuses the OSV results gathered in Phase 1, no new external calls.
        onProgress('malware', 66, 'Checking known-malicious packages...');
        await this.analyzeMalware(identifier, (pct, msg) => {
            onProgress('malware', 66 + pct * 0.02, msg);
        });
        await saveProgress('Enrichment Phase 1.5: Malware');

        // Phase 1.7: VEX/VDR statement application (no network — pure
        // annotation pass over the OSV findings). Slotted between Malware
        // (1.5) and Licenses (2) per the plan so suppression badges land
        // before any license-driven UI runs. The phase is a no-op when no
        // VEX documents have been uploaded for this analysis.
        onProgress('vex', 67.5, 'Applying VEX/VDR statements...');
        await this.applyVexStatements(identifier);
        await saveProgress('Enrichment Phase 1.7: VEX Statements');

        // Phase 2: License fetching (68-75%)
        onProgress('licenses', 68, 'Fetching license information...');
        await this.fetchAllLicenses(deps, identifier, (pct, msg) => {
            onProgress('licenses', 68 + pct * 0.07, msg);
        });
        await saveProgress('Enrichment Phase 2: Licenses');

        // Phase 2.5: Source-repo license fallback (75-76%)
        // Phase 1.7 removed the host-repo license misattribution. The honest
        // replacement: for any dep still without a license but with a
        // dep.sourceRepoUrl pointing at GitHub (captured during Phase 2 from
        // deps.dev SOURCE_REPO links, or earlier from native registries via
        // author-service), ask the GitHub API for the repo's actual license.
        onProgress('source-repo-license', 75, 'Fetching source repository licenses...');
        await this.fetchSourceRepoLicenses(deps, (pct, msg) => {
            onProgress('source-repo-license', 75 + pct * 0.01, msg);
        });
        await saveProgress('Enrichment Phase 2.5: Source-repo licenses');

        // Phase 3: Version drift and staleness (76-83%)
        onProgress('version-drift', 76, 'Checking version drift and staleness...');
        await this.fetchVersionDrift(deps, (pct, msg) => {
            onProgress('version-drift', 76 + pct * 0.07, msg);
        });
        await saveProgress('Enrichment Phase 3: Version Drift');

        // Phase 3.5: Latest-version license lookup (83-84%)
        // Phase 1.4 — for each dep where the registry's latest version differs
        // from the installed version, fetch the latest version's license so
        // licenses.html can surface upstream license drift even when no
        // in-environment transition exists yet.
        onProgress('latest-license', 83, 'Fetching latest-version licenses...');
        await this.fetchLatestVersionLicenses(deps, (pct, msg) => {
            onProgress('latest-license', 83 + pct * 0.01, msg);
        });
        await saveProgress('Enrichment Phase 3.5: Latest-version Licenses');

        // Phase 4: Author information (84-90%)
        onProgress('authors', 84, 'Fetching author information...');
        await this.fetchAuthors(deps, identifier, (pct, msg) => {
            onProgress('authors', 84 + pct * 0.06, msg);
        });
        await saveProgress('Enrichment Phase 4: Authors');

        // Phase 5: EOX (End-of-Life/Support) status (90-95%)
        onProgress('eox', 90, 'Checking EOX status...');
        await this.fetchEOXStatus(deps, (pct, msg) => {
            onProgress('eox', 90 + pct * 0.05, msg);
        });
        await saveProgress('Enrichment Phase 5: EOX Status');

        // Phase 6: Source repository validation (95-97%)
        onProgress('source-repos', 95, 'Validating source repositories...');
        await this.validateSourceRepos(deps, (pct, msg) => {
            onProgress('source-repos', 95 + pct * 0.02, msg);
        });
        await saveProgress('Enrichment Phase 6: Source Repos');

        // Phase 7: Official package lifecycle status (97-99%)
        // Per Phase 4 of the lifecycle plan: ask each ecosystem's native
        // registry (and GitHub for the source repo) for authoritative
        // deprecation / archival / yank signals. Result lands on
        // `dep.lifecycle = { status, reason, replacement, source }`.
        // Heuristic signals (Phase 5) live separately and never overwrite
        // this field.
        onProgress('lifecycle', 97, 'Checking package lifecycle status...');
        await this.fetchPackageLifecycle(deps, (pct, msg) => {
            onProgress('lifecycle', 97 + pct * 0.015, msg);
        });
        await saveProgress('Enrichment Phase 7: Lifecycle');

        // Phase 7.5: Maintainer signal composite (99-100%)
        // Combines the official lifecycle + repo metadata (Phase 5.2) +
        // textual heuristic signals (Phase 5.1) into a single 4-level
        // status. This is a pure synchronous pass — no network — so the
        // progress wedge stays small.
        onProgress('maintainer-signal', 98.5, 'Computing maintainer signals...');
        await this.computeMaintainerSignals(deps);
        await saveProgress('Enrichment Phase 7.5: Maintainer Signal');

        // Re-export to include enriched data
        const enrichedResults = this.sbomProcessor.exportData();
        
        // Merge upload metadata if present
        if (uploadInfo) {
            enrichedResults.uploadInfo = uploadInfo;
        }

        console.log('✅ Enrichment pipeline complete');
        return enrichedResults;
    }

    /**
     * Analyze vulnerabilities using OSV service
     */
    async analyzeVulnerabilities(identifier, onProgress = () => {}) {
        if (!window.osvService) {
            console.warn('⚠️ OSV service not available');
            return;
        }

        try {
            if (this.sbomProcessor.analyzeVulnerabilitiesWithIncrementalSaving) {
                await this.sbomProcessor.analyzeVulnerabilitiesWithIncrementalSaving(identifier, onProgress);
            } else {
                await this.sbomProcessor.analyzeVulnerabilities();
            }
        } catch (e) {
            console.warn(`⚠️ Vulnerability analysis failed: ${e.message}`);
        }
    }

    /**
     * Re-classify OSV results into a dedicated malware analysis bucket.
     * No new network calls - this consumes the data already fetched by
     * `analyzeVulnerabilities` and persists the result alongside the
     * existing analysis record.
     */
    async analyzeMalware(identifier, onProgress = () => {}) {
        if (!window.malwareService) {
            console.warn('⚠️ Malware service not available');
            return;
        }
        try {
            const malwareAnalysis = await window.malwareService.analyzeFromProcessor(
                this.sbomProcessor,
                onProgress
            );
            if (malwareAnalysis && this.storageManager?.updateAnalysisWithMalware) {
                await this.storageManager.updateAnalysisWithMalware(identifier, malwareAnalysis);
            }
        } catch (e) {
            console.warn(`⚠️ Malware analysis failed: ${e.message}`);
        }
    }

    /**
     * Apply VEX/VDR statements to the OSV vulnerability findings on the
     * current sbomProcessor. This is purely additive — we never delete
     * findings, only attach `vex: { status, justification, source, vexId,
     * matchedBy }` so the UI can decide what to render and the user can
     * always inspect the underlying CVE.
     *
     * Statements come from `IndexedDBManager.getAllVexDocuments()` and are
     * filtered to those whose `analysisIdentifier` matches the current
     * analysis OR whose `analysisIdentifier == null` (treat null as
     * "applies portfolio-wide" so a single VEX document can cover multiple
     * analyses without re-upload).
     *
     * Unmatched statements are recorded on the analysis blob so the
     * findings page can flag broken PURLs.
     */
    async applyVexStatements(identifier) {
        if (!window.vexService) {
            // Service is loaded by every page that exposes vulnerabilities;
            // a missing service is a code-loading bug, not a user error.
            console.warn('⚠️ VEX service not available — skipping VEX phase');
            return;
        }
        const idb = this.storageManager && this.storageManager.indexedDB;
        if (!idb || !idb.getAllVexDocuments) {
            console.log('ℹ️ VEX storage not initialized — skipping VEX phase');
            return;
        }

        const docs = await idb.getAllVexDocuments();
        if (!docs || docs.length === 0) {
            return; // No VEX uploads, nothing to do
        }
        const applicableDocs = docs.filter(d =>
            !d.analysisIdentifier || d.analysisIdentifier === identifier
        );
        if (applicableDocs.length === 0) return;

        const allStatements = [];
        for (const d of applicableDocs) {
            if (!Array.isArray(d.statements)) continue;
            for (const s of d.statements) {
                allStatements.push({ ...s, vexId: d.vexId, filename: d.filename || null });
            }
        }
        if (allStatements.length === 0) return;

        // Build a quick index by vulnId so we don't iterate the full
        // statement list per finding.
        const byVulnId = new Map();
        for (const s of allStatements) {
            if (!s.vulnId) continue;
            if (!byVulnId.has(s.vulnId)) byVulnId.set(s.vulnId, []);
            byVulnId.get(s.vulnId).push(s);
        }

        const va = this.sbomProcessor && this.sbomProcessor.vulnerabilityAnalysis;
        const vulnerableDeps = va && Array.isArray(va.vulnerableDependencies)
            ? va.vulnerableDependencies
            : [];

        const matchedStatementIds = new Set();
        let annotated = 0;

        for (const vd of vulnerableDeps) {
            const dep = vd.dependency;
            if (!dep || !Array.isArray(vd.vulnerabilities)) continue;
            for (const vuln of vd.vulnerabilities) {
                // OSV vulnerability ids are stored on `id` and aliases under
                // `aliases[]`. CSAF/OpenVEX usually reference the CVE id, so
                // we check both before giving up.
                const candidateIds = new Set();
                if (vuln.id) candidateIds.add(vuln.id);
                if (Array.isArray(vuln.aliases)) {
                    vuln.aliases.forEach(a => candidateIds.add(a));
                }
                for (const cid of candidateIds) {
                    const stmts = byVulnId.get(cid);
                    if (!stmts) continue;
                    for (const stmt of stmts) {
                        const matchedBy = window.vexService.matchStatementToDep(stmt, dep);
                        if (!matchedBy) continue;
                        // Last-write-wins on conflicting statements is fine;
                        // the UI surfaces all of them via vex.history.
                        if (!vuln.vex) vuln.vex = { history: [] };
                        vuln.vex.status = stmt.status;
                        vuln.vex.justification = stmt.justification;
                        vuln.vex.actionStatement = stmt.actionStatement;
                        vuln.vex.source = stmt.source;
                        vuln.vex.vexId = stmt.vexId;
                        vuln.vex.matchedBy = matchedBy;
                        vuln.vex.filename = stmt.filename;
                        vuln.vex.history.push({
                            status: stmt.status,
                            vexId: stmt.vexId,
                            matchedBy,
                            filename: stmt.filename
                        });
                        matchedStatementIds.add(`${stmt.vexId}::${stmt.vulnId}::${matchedBy}`);
                        annotated++;
                    }
                }
            }
        }

        // Record unmatched statements so the findings/settings UI can warn
        // the user about broken PURLs without re-parsing the documents.
        const unmatched = allStatements.filter(s =>
            !matchedStatementIds.has(`${s.vexId}::${s.vulnId}::bom-ref`)
            && !matchedStatementIds.has(`${s.vexId}::${s.vulnId}::purl`)
            && !matchedStatementIds.has(`${s.vexId}::${s.vulnId}::hash`)
        );

        if (va) {
            va.vexSummary = {
                documentCount: applicableDocs.length,
                statementCount: allStatements.length,
                annotatedFindings: annotated,
                unmatchedStatements: unmatched.map(u => ({
                    vexId: u.vexId,
                    vulnId: u.vulnId,
                    status: u.status,
                    identifiers: u.identifiers,
                    source: u.source,
                    filename: u.filename
                }))
            };
        }

        // Persist by reusing the same storage path as OSV results so the
        // annotations survive a page reload without a separate write path.
        if (this.storageManager && this.storageManager.updateAnalysisWithVulnerabilities) {
            try {
                await this.storageManager.updateAnalysisWithVulnerabilities(identifier, va);
            } catch (e) {
                console.warn('⚠️ Failed to persist VEX annotations:', e.message);
            }
        }

        console.log(`🛡️ VEX: annotated ${annotated} finding(s); ${unmatched.length} statement(s) unmatched.`);
    }

    /**
     * Fetch licenses for all ecosystems
     */
    async fetchAllLicenses(dependencies, identifier, onProgress = () => {}) {
        const depsNeedingLicenses = dependencies.filter(dep => {
            const hasLicense = dep.license && 
                dep.license !== 'Unknown' && 
                dep.license !== 'NOASSERTION' &&
                String(dep.license).trim() !== '';
            return !hasLicense && dep.name && dep.version && dep.version !== 'unknown';
        });

        if (depsNeedingLicenses.length === 0) {
            console.log('ℹ️ All dependencies already have licenses');
            return;
        }

        console.log(`📄 Fetching licenses for ${depsNeedingLicenses.length} packages...`);

        // Group by ecosystem
        const byEcosystem = new Map();
        for (const dep of depsNeedingLicenses) {
            const ecosystem = (dep.category?.ecosystem || '').toLowerCase();
            if (!byEcosystem.has(ecosystem)) {
                byEcosystem.set(ecosystem, []);
            }
            byEcosystem.get(ecosystem).push(dep);
        }

        let processed = 0;
        const total = depsNeedingLicenses.length;

        for (const [ecosystem, deps] of byEcosystem) {
            const system = this.ecosystemMap[ecosystem];
            if (!system) continue;

            // Process in batches
            const batchSize = 10;
            for (let i = 0; i < deps.length; i += batchSize) {
                const batch = deps.slice(i, i + batchSize);
                
                await Promise.all(batch.map(dep => this.fetchLicenseForPackage(dep, system)));
                
                processed += batch.length;
                onProgress((processed / total) * 100, `Fetched ${processed}/${total} licenses`);

                // Rate limiting
                if (i + batchSize < deps.length) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }

        // Sync to processor
        this.syncLicensesToProcessor(depsNeedingLicenses);
        
        console.log(`✅ License fetching complete: ${processed} processed`);
    }

    /**
     * Fetch license for a single package from deps.dev
     */
    async fetchLicenseForPackage(dep, system) {
        try {
            const url = `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodeURIComponent(dep.name)}/versions/${encodeURIComponent(dep.version)}`;
            const response = await fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                // Always capture SOURCE_REPO from links[] — even when the
                // deps.dev record has no license, the link is gold for
                // feeds.html and the source-repo license fallback (Phase 1.6).
                this._captureSourceRepoFromLinks(dep, data && data.links);
                if (data.licenses && data.licenses.length > 0) {
                    const licenseStr = data.licenses.map(l => l.license || l).filter(Boolean).join(' AND ');
                    dep.license = licenseStr;
                    dep.licenseFull = licenseStr;
                    dep.licenseAugmented = true;
                    dep.licenseSource = 'deps.dev';
                    return true;
                }
            }

            // Fallback for Go packages on GitHub
            if (system === 'go' && dep.name.startsWith('github.com/')) {
                return await this.fetchLicenseFromGitHub(dep);
            }

            return false;
        } catch (e) {
            return false;
        }
    }

    /**
     * Walk a deps.dev `links[]` array looking for a usable source-repo URL.
     * Mirrors LicenseFetcher._captureSourceRepoFromLinks; kept here to avoid
     * cross-class coupling for a tiny utility. Don't overwrite a value already
     * captured by a higher-precedence source (SBOM externalRef, etc.).
     */
    _captureSourceRepoFromLinks(dep, links) {
        if (!dep || dep.sourceRepoUrl || !Array.isArray(links) || links.length === 0) return;
        const priorities = ['SOURCE_REPO', 'ORIGIN', 'HOMEPAGE'];
        for (const label of priorities) {
            const hit = links.find(l => l && l.label === label && l.url);
            if (hit) {
                dep.sourceRepoUrl = hit.url;
                return;
            }
        }
    }

    /**
     * Fetch license from GitHub API (fallback for Go packages)
     */
    async fetchLicenseFromGitHub(dep) {
        try {
            const parts = dep.name.replace('github.com/', '').split('/');
            if (parts.length < 2) return false;
            
            const url = `https://api.github.com/repos/${parts[0]}/${parts[1]}`;
            const response = await fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                if (data.license?.spdx_id) {
                    dep.license = data.license.spdx_id;
                    dep.licenseFull = data.license.spdx_id;
                    dep.licenseAugmented = true;
                    dep.licenseSource = 'github';
                    return true;
                }
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    /**
     * Phase 2.5 — for each dep that ended Phase 2 without a license but with
     * a `dep.sourceRepoUrl` pointing at GitHub, fetch the source repository's
     * own license via the GitHub API. Replaces (with correct semantics) the
     * removed "host repo license" fallback.
     *
     * Caps at GitHub-only repos to avoid heuristic guessing on arbitrary VCS
     * hosts. Dedupes by `owner/repo` so a monorepo's many sub-packages cost
     * one GitHub call, not N. Persists `licenseSource = 'source-repo'` so the
     * UI can render a "Inferred from source repo" badge when relevant.
     */
    async fetchSourceRepoLicenses(dependencies, onProgress = () => {}) {
        const candidates = dependencies.filter(dep => {
            const has = dep.licenseFull && dep.licenseFull !== 'Unknown' && dep.licenseFull !== 'NOASSERTION' && String(dep.licenseFull).trim() !== '';
            return !has && dep.sourceRepoUrl;
        });
        if (candidates.length === 0) return;

        // Group deps by owner/repo so one GitHub call serves all.
        const repoMap = new Map(); // "owner/repo" -> { owner, repo, deps: [] }
        for (const dep of candidates) {
            const parsed = this._parseGitHubRepoFromUrl(dep.sourceRepoUrl);
            if (!parsed) continue;
            const key = `${parsed.owner}/${parsed.repo}`;
            if (!repoMap.has(key)) repoMap.set(key, { owner: parsed.owner, repo: parsed.repo, deps: [] });
            repoMap.get(key).deps.push(dep);
        }
        if (repoMap.size === 0) return;

        console.log(`📄 Source-repo license fallback: ${repoMap.size} unique repos for ${candidates.length} deps`);

        const repos = Array.from(repoMap.values());
        let resolved = 0;
        const concurrency = 4;
        let cursor = 0;
        const worker = async () => {
            while (cursor < repos.length) {
                const idx = cursor++;
                const { owner, repo, deps: targetDeps } = repos[idx];
                try {
                    const url = `https://api.github.com/repos/${owner}/${repo}`;
                    const response = await fetch(url);
                    if (response.ok) {
                        const data = await response.json();
                        const spdx = data && data.license && (data.license.spdx_id || (data.license.key ? data.license.key.toUpperCase() : null));
                        if (spdx && spdx !== 'NOASSERTION') {
                            for (const dep of targetDeps) {
                                dep.license = spdx;
                                dep.licenseFull = spdx;
                                dep.licenseAugmented = true;
                                dep.licenseSource = 'source-repo';
                                resolved++;
                            }
                        }
                    }
                } catch (e) {
                    // Best-effort — swallow per-repo failures.
                }
                onProgress(((idx + 1) / repos.length) * 100, `Source-repo licenses: ${idx + 1}/${repos.length}`);
            }
        };
        await Promise.all(Array.from({ length: concurrency }, worker));

        if (resolved > 0) {
            this.syncLicensesToProcessor(dependencies);
            console.log(`✅ Source-repo license fallback resolved ${resolved} deps from ${repoMap.size} repos`);
        }
    }

    /**
     * Parse "https://github.com/owner/repo[.git]" into {owner, repo}. Tolerates
     * git+ prefixes, .git suffix, and GitHub Enterprise subdomains. Returns
     * null for non-GitHub or malformed URLs so callers can fall through.
     */
    _parseGitHubRepoFromUrl(url) {
        if (!url || typeof url !== 'string') return null;
        let cleaned = url.trim().replace(/^git\+/, '').replace(/^ssh:\/\/git@/, 'https://');
        const scpMatch = cleaned.match(/^git@([^:]+):(.+)$/);
        if (scpMatch) cleaned = `https://${scpMatch[1]}/${scpMatch[2]}`;
        if (!/^https?:\/\//i.test(cleaned)) cleaned = 'https://' + cleaned;
        try {
            const u = new URL(cleaned);
            const host = u.hostname.toLowerCase();
            if (host !== 'github.com' && !host.endsWith('.github.com')) return null;
            const segments = u.pathname.split('/').filter(Boolean);
            if (segments.length < 2) return null;
            return { owner: segments[0], repo: segments[1].replace(/\.git$/, '') };
        } catch (_) {
            return null;
        }
    }

    /**
     * Sync fetched licenses back to sbomProcessor
     */
    syncLicensesToProcessor(dependencies) {
        if (!this.sbomProcessor?.dependencies) return;

        let synced = 0;
        for (const dep of dependencies) {
            if (dep.licenseAugmented && dep.license) {
                const key = `${dep.name}@${dep.version}`;
                const procDep = this.sbomProcessor.dependencies.get(key);
                if (procDep) {
                    procDep.license = dep.license;
                    procDep.licenseFull = dep.licenseFull;
                    procDep._licenseAugmented = true;
                    procDep._licenseSource = dep.licenseSource;
                    synced++;
                }
            }
        }
        if (synced > 0) {
            console.log(`📄 Synced ${synced} licenses to processor`);
        }
    }

    /**
     * Phase 1.4 — for every dep where the registry's latest version differs
     * from the installed version, look up the latest version's license via
     * the same deps.dev endpoint already used by `fetchLicenseForPackage`.
     * Result is stored on `dep.versionDrift.latestLicense{,Full}` so
     * licenses.html can render a third row type "current → latest".
     *
     * Skipped silently when:
     *   - LicenseFetcher isn't loaded (older pages without enrichment).
     *   - The dep has no versionDrift (Phase 3 didn't run or returned null).
     *   - latestVersion === current version (no upstream drift to investigate).
     */
    async fetchLatestVersionLicenses(dependencies, onProgress = () => {}) {
        const fetcher = window.licenseFetcher || (window.LicenseFetcher ? new window.LicenseFetcher() : null);
        if (!fetcher) return;

        const candidates = dependencies.filter(dep =>
            dep.versionDrift &&
            dep.versionDrift.latestVersion &&
            dep.versionDrift.latestVersion !== dep.version &&
            !dep.versionDrift.latestLicense
        );
        if (candidates.length === 0) return;

        console.log(`📄 Fetching latest-version licenses for ${candidates.length} packages...`);

        const batchSize = 8;
        let processed = 0;
        for (let i = 0; i < candidates.length; i += batchSize) {
            const batch = candidates.slice(i, i + batchSize);
            await Promise.all(batch.map(async (dep) => {
                // fetchLicenseForPackage mutates the dep argument; pass a
                // throwaway object so we don't overwrite the *current* version's
                // license fields with the latest version's license.
                const probe = {
                    name: dep.name,
                    version: dep.versionDrift.latestVersion,
                    category: dep.category,
                    ecosystem: dep.category?.ecosystem || dep.ecosystem || ''
                };
                const ok = await fetcher.fetchLicenseForPackage(probe);
                if (ok && probe.licenseFull) {
                    dep.versionDrift.latestLicense = probe.license || probe.licenseFull;
                    dep.versionDrift.latestLicenseFull = probe.licenseFull || probe.license;
                }
            }));
            processed += batch.length;
            onProgress((processed / candidates.length) * 100, `Latest licenses: ${processed}/${candidates.length}`);
            if (i + batchSize < candidates.length) {
                await new Promise(r => setTimeout(r, 80));
            }
        }

        // Mirror onto sbomProcessor so the next exportData carries the field.
        if (this.sbomProcessor && this.sbomProcessor.dependencies) {
            for (const dep of candidates) {
                if (!dep.versionDrift?.latestLicense) continue;
                const procDep = this.sbomProcessor.dependencies.get(`${dep.name}@${dep.version}`);
                if (procDep && procDep.versionDrift) {
                    procDep.versionDrift.latestLicense = dep.versionDrift.latestLicense;
                    procDep.versionDrift.latestLicenseFull = dep.versionDrift.latestLicenseFull;
                }
            }
        }
    }

    /**
     * Fetch version drift data and staleness information
     */
    async fetchVersionDrift(dependencies, onProgress = () => {}) {
        if (!window.VersionDriftAnalyzer && !window.versionDriftAnalyzer) {
            console.warn('⚠️ VersionDriftAnalyzer not available');
            return;
        }

        const analyzer = window.versionDriftAnalyzer || new window.VersionDriftAnalyzer();
        
        const depsToCheck = dependencies.filter(dep => 
            dep.name && dep.version && dep.version !== 'unknown'
        );

        if (depsToCheck.length === 0) return;

        console.log(`📊 Checking version drift for ${depsToCheck.length} packages...`);

        const batchSize = 5;
        let checked = 0;

        for (let i = 0; i < depsToCheck.length; i += batchSize) {
            const batch = depsToCheck.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (dep) => {
                try {
                    const ecosystem = dep.category?.ecosystem || '';
                    const drift = await analyzer.checkVersionDrift(dep.name, dep.version, ecosystem);
                    if (drift) {
                        dep.versionDrift = drift;
                        
                        // Also attach staleness data directly to the dependency
                        // This makes it available for findings page without re-computation
                        if (drift.staleness) {
                            dep.staleness = drift.staleness;
                        }
                    }
                    
                    // If no staleness from drift, try to check separately
                    if (!dep.staleness && analyzer.checkStaleness) {
                        try {
                            const staleness = await analyzer.checkStaleness(dep.name, dep.version, ecosystem);
                            if (staleness) {
                                dep.staleness = staleness;
                            }
                        } catch (e) {
                            // Ignore staleness check errors
                        }
                    }
                    
                    checked++;
                } catch (e) {
                    // Skip failed checks
                }
            }));

            onProgress((checked / depsToCheck.length) * 100, `Checked ${checked}/${depsToCheck.length}`);

            if (i + batchSize < depsToCheck.length) {
                await new Promise(r => setTimeout(r, 50));
            }
        }

        // Mirror drift/staleness back onto the processor's dependency Map. exportData()
        // rebuilds `allDependencies` fresh from the Map, so without this sync the per-dep
        // versionDrift/staleness fields would only survive on the array we mutated above
        // (and would be wiped out the next time exportData() runs in saveProgress).
        this.syncDriftToProcessor(depsToCheck);

        console.log(`✅ Version drift complete: ${checked} checked`);
    }

    /**
     * Mirror enriched drift/staleness onto the processor's `this.dependencies` Map so the
     * Insights page (and any future per-dep dashboard) can read them via the standard
     * `allDependencies` export shape.
     */
    syncDriftToProcessor(dependencies) {
        if (!this.sbomProcessor?.dependencies) return;
        let synced = 0;
        for (const dep of dependencies) {
            if (!dep || (!dep.versionDrift && !dep.staleness)) continue;
            const key = `${dep.name}@${dep.version}`;
            const procDep = this.sbomProcessor.dependencies.get(key);
            if (procDep) {
                if (dep.versionDrift) procDep.versionDrift = dep.versionDrift;
                if (dep.staleness) procDep.staleness = dep.staleness;
                synced++;
            }
        }
        if (synced > 0) {
            console.log(`📊 Synced ${synced} drift/staleness records to processor`);
        }
    }

    /**
     * Mirror enriched EOX status onto the processor's `this.dependencies` Map so the
     * standard exportData() shape carries `eoxStatus` on every dep.
     */
    syncEOXToProcessor(dependencies) {
        if (!this.sbomProcessor?.dependencies) return;
        let synced = 0;
        for (const dep of dependencies) {
            if (!dep || !dep.eoxStatus) continue;
            const key = `${dep.name}@${dep.version}`;
            const procDep = this.sbomProcessor.dependencies.get(key);
            if (procDep) {
                procDep.eoxStatus = dep.eoxStatus;
                synced++;
            }
        }
        if (synced > 0) {
            console.log(`⏳ Synced ${synced} EOX records to processor`);
        }
    }

    /**
     * Mirror source-repo validation results onto the processor's dependency Map.
     */
    syncSourceRepoStatusToProcessor(dependencies) {
        if (!this.sbomProcessor?.dependencies) return;
        let synced = 0;
        for (const dep of dependencies) {
            if (!dep || !dep.sourceRepoStatus) continue;
            const key = `${dep.name}@${dep.version}`;
            const procDep = this.sbomProcessor.dependencies.get(key);
            if (procDep) {
                procDep.sourceRepoStatus = dep.sourceRepoStatus;
                synced++;
            }
        }
        if (synced > 0) {
            console.log(`🔗 Synced ${synced} source-repo status records to processor`);
        }
    }

    /**
     * Fetch author information
     */
    async fetchAuthors(dependencies, identifier, onProgress = () => {}) {
        if (!window.AuthorService) {
            console.warn('⚠️ AuthorService not available');
            return;
        }

        const packages = dependencies
            .filter(dep => dep.name && dep.category?.ecosystem)
            .map(dep => ({
                name: dep.name,
                version: dep.version || 'unknown',
                ecosystem: dep.category.ecosystem.toLowerCase(),
                purl: dep.purl || null
            }));

        if (packages.length === 0) return;

        console.log(`👤 Fetching author data for ${packages.length} packages...`);

        try {
            const authorService = new window.AuthorService();
            await authorService.fetchAuthorsForPackages(packages, (processed, total) => {
                onProgress((processed / total) * 100, `Authors: ${processed}/${total}`);
            });
            console.log('✅ Author fetching complete');
        } catch (e) {
            console.warn(`⚠️ Author fetch failed: ${e.message}`);
        }
    }

    /**
     * Fetch EOX (End-of-Life/Support) status for dependencies
     * Uses endoflife.date API via eoxService
     */
    async fetchEOXStatus(dependencies, onProgress = () => {}) {
        if (!window.eoxService && !window.EOXService) {
            console.warn('⚠️ EOXService not available');
            return;
        }

        const eoxService = window.eoxService || (window.EOXService ? new window.EOXService() : null);
        if (!eoxService) {
            console.warn('⚠️ EOXService not available');
            return;
        }

        // Filter to dependencies that could have EOX data
        const depsToCheck = dependencies.filter(dep => 
            dep.name && dep.category?.ecosystem
        );

        if (depsToCheck.length === 0) return;

        console.log(`⏳ Checking EOX status for ${depsToCheck.length} packages...`);

        const batchSize = 10;
        let checked = 0;

        for (let i = 0; i < depsToCheck.length; i += batchSize) {
            const batch = depsToCheck.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (dep) => {
                try {
                    const ecosystem = dep.category?.ecosystem || '';
                    const eoxStatus = await eoxService.checkEOX(
                        dep.name,
                        dep.version,
                        ecosystem
                    );
                    
                    if (eoxStatus && (eoxStatus.isEOL || eoxStatus.isEOS || eoxStatus.eolDate || eoxStatus.eosDate)) {
                        dep.eoxStatus = eoxStatus;
                    }
                } catch (e) {
                    // Skip failed checks - EOX data is optional
                }
            }));

            checked += batch.length;
            onProgress((checked / depsToCheck.length) * 100, `EOX: ${checked}/${depsToCheck.length}`);

            // Rate limiting
            if (i + batchSize < depsToCheck.length) {
                await new Promise(r => setTimeout(r, 50));
            }
        }

        // Mirror to processor so eoxStatus survives the next exportData() rebuild.
        this.syncEOXToProcessor(depsToCheck);

        const eoxCount = depsToCheck.filter(d => d.eoxStatus).length;
        console.log(`✅ EOX status complete: ${eoxCount} packages have EOX data`);
    }

    /**
     * Phase 7 — fetch official lifecycle status (deprecated/yanked/archived/
     * quarantined) per dep using `package-lifecycle-service`. Heuristics
     * (Phase 5) are computed in a separate pass and never overwrite this
     * field. Cache hits short-circuit so repeat enrichments are cheap.
     */
    async fetchPackageLifecycle(dependencies, onProgress = () => {}) {
        if (!window.packageLifecycleService) {
            console.warn('⚠️ PackageLifecycleService not loaded — skipping Phase 7');
            return;
        }
        // Only ecosystems with an official deprecation channel today; other
        // ecosystems still get a GitHub-archived check via sourceRepoUrl.
        const supportedEcosystems = new Set(['npm', 'pypi', 'nuget', 'cargo']);
        const candidates = dependencies.filter(dep => {
            const eco = (dep.category && dep.category.ecosystem || dep.ecosystem || '').toLowerCase();
            return supportedEcosystems.has(eco) || !!dep.sourceRepoUrl;
        });
        if (candidates.length === 0) {
            console.log('ℹ️ No lifecycle candidates to check');
            return;
        }

        const total = candidates.length;
        let processed = 0;
        const batchSize = 10;
        for (let i = 0; i < candidates.length; i += batchSize) {
            const batch = candidates.slice(i, i + batchSize);
            await Promise.all(batch.map(async (dep) => {
                try {
                    const lifecycle = await window.packageLifecycleService.fetchLifecycle(dep);
                    if (lifecycle && lifecycle.status && lifecycle.status !== 'unknown') {
                        dep.lifecycle = lifecycle;
                        // Mirror onto the in-memory dependency map so
                        // downstream UI (which reads from `sbomProcessor`)
                        // sees the new field without a re-export round-trip.
                        const key = `${dep.name}@${dep.version}`;
                        if (this.sbomProcessor && this.sbomProcessor.dependencies && this.sbomProcessor.dependencies.has(key)) {
                            const stored = this.sbomProcessor.dependencies.get(key);
                            stored.lifecycle = lifecycle;
                        }
                    } else if (lifecycle) {
                        // Even an "unknown" result is informative — record
                        // when we last looked so the UI can label "Checked
                        // 2 days ago, no signal" rather than "Unknown".
                        dep.lifecycle = lifecycle;
                    }
                } catch (err) {
                    console.warn(`⚠️ Lifecycle fetch failed for ${dep.name}@${dep.version}:`, err.message);
                }
            }));
            processed += batch.length;
            const pct = Math.min(100, (processed / total) * 100);
            onProgress(pct, `Lifecycle: ${processed}/${total}`);
        }
    }

    /**
     * Phase 7.5 — fold the lifecycle status, repo metadata, and textual
     * heuristic signals into a single `dep.maintainerSignal` so the UI can
     * surface one unambiguous level (`healthy|watch|risk|critical`) per
     * package without re-running the rule logic in every renderer.
     *
     * Repo metadata is sourced from `sbomProcessor.repositories[firstRepo]`
     * (set in app.js Phase 5.2) and falls back to {} when none of the
     * dep's repos carry it. We do NOT make new GitHub calls here — the
     * lifecycle phase already touched github.com/repos for archived
     * checks.
     */
    async computeMaintainerSignals(dependencies) {
        if (!window.packageLifecycleService || !window.packageLifecycleService.computeMaintainerSignal) {
            return;
        }
        const repoMetaCache = new Map();
        const findRepoMeta = (dep) => {
            const repos = Array.isArray(dep.repositories) ? dep.repositories : [];
            for (const key of repos) {
                if (repoMetaCache.has(key)) return repoMetaCache.get(key);
                const repoData = this.sbomProcessor && this.sbomProcessor.repositories && this.sbomProcessor.repositories.get
                    ? this.sbomProcessor.repositories.get(key)
                    : null;
                const meta = repoData && repoData.repoMeta ? repoData.repoMeta : null;
                repoMetaCache.set(key, meta);
                if (meta) return meta;
            }
            return null;
        };

        for (const dep of dependencies) {
            try {
                const repoMeta = findRepoMeta(dep) || {};
                const heuristicSignals = (dep.warnings && Array.isArray(dep.warnings.heuristicSignals))
                    ? dep.warnings.heuristicSignals
                    : [];
                const signal = window.packageLifecycleService.computeMaintainerSignal(dep, repoMeta, heuristicSignals);
                if (signal) dep.maintainerSignal = signal;
            } catch (err) {
                console.warn(`⚠️ computeMaintainerSignal failed for ${dep.name}:`, err.message);
            }
        }
    }

    /**
     * Validate source repository URLs from SBOM externalRefs
     * Checks if GitHub repos listed as SOURCE-CONTROL actually exist
     */
    async validateSourceRepos(dependencies, onProgress = () => {}) {
        // Collect unique GitHub repo URLs to validate
        const repoMap = new Map(); // url -> { deps: [], owner, repo }
        
        for (const dep of dependencies) {
            const externalRefs = dep.originalPackage?.externalRefs || [];
            for (const ref of externalRefs) {
                if (ref.referenceCategory === 'SOURCE-CONTROL' || ref.referenceType === 'vcs') {
                    const url = ref.referenceLocator || '';
                    const parsed = this.parseGitHubUrl(url);
                    if (parsed) {
                        const key = `${parsed.owner}/${parsed.repo}`;
                        if (!repoMap.has(key)) {
                            repoMap.set(key, { 
                                deps: [], 
                                owner: parsed.owner, 
                                repo: parsed.repo,
                                originalUrl: url
                            });
                        }
                        repoMap.get(key).deps.push(dep);
                    }
                }
            }
        }

        if (repoMap.size === 0) {
            console.log('ℹ️ No source repos to validate');
            return;
        }

        console.log(`🔗 Validating ${repoMap.size} unique source repositories...`);

        const repos = Array.from(repoMap.values());
        let checked = 0;
        let notFoundCount = 0;

        // Check repos in batches to avoid rate limiting
        const batchSize = 5;
        for (let i = 0; i < repos.length; i += batchSize) {
            const batch = repos.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (repoInfo) => {
                try {
                    const exists = await this.checkGitHubRepoExists(repoInfo.owner, repoInfo.repo);
                    
                    if (!exists) {
                        notFoundCount++;
                        // Mark all dependencies that reference this repo
                        for (const dep of repoInfo.deps) {
                            if (!dep.sourceRepoStatus) {
                                dep.sourceRepoStatus = [];
                            }
                            dep.sourceRepoStatus.push({
                                valid: false,
                                url: repoInfo.originalUrl,
                                owner: repoInfo.owner,
                                repo: repoInfo.repo,
                                error: 'Repository not found (404)'
                            });
                        }
                    } else {
                        // Mark as valid
                        for (const dep of repoInfo.deps) {
                            if (!dep.sourceRepoStatus) {
                                dep.sourceRepoStatus = [];
                            }
                            dep.sourceRepoStatus.push({
                                valid: true,
                                url: repoInfo.originalUrl,
                                owner: repoInfo.owner,
                                repo: repoInfo.repo
                            });
                        }
                    }
                } catch (e) {
                    // Mark as unknown on error
                    for (const dep of repoInfo.deps) {
                        if (!dep.sourceRepoStatus) {
                            dep.sourceRepoStatus = [];
                        }
                        dep.sourceRepoStatus.push({
                            valid: null, // unknown
                            url: repoInfo.originalUrl,
                            owner: repoInfo.owner,
                            repo: repoInfo.repo,
                            error: e.message
                        });
                    }
                }
            }));

            checked += batch.length;
            onProgress((checked / repos.length) * 100, `Repos: ${checked}/${repos.length}`);

            // Rate limiting for GitHub API
            if (i + batchSize < repos.length) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        // Mirror sourceRepoStatus onto the processor's Map for export persistence.
        this.syncSourceRepoStatusToProcessor(dependencies);

        console.log(`✅ Source repo validation complete: ${notFoundCount} repos not found`);
    }

    /**
     * Parse a GitHub URL from various formats
     * Handles: git+ssh://, git+https://, git://, https://, plain github.com URLs
     */
    parseGitHubUrl(url) {
        if (!url || typeof url !== 'string') return null;
        
        // Patterns for GitHub URLs
        const patterns = [
            // git+ssh://git@github.com/owner/repo.git
            /git\+ssh:\/\/git@github\.com[\/:]([^\/]+)\/([^\/\s]+?)(?:\.git)?$/i,
            // git+https://github.com/owner/repo.git
            /git\+https?:\/\/github\.com\/([^\/]+)\/([^\/\s]+?)(?:\.git)?$/i,
            // git://github.com/owner/repo.git
            /git:\/\/github\.com\/([^\/]+)\/([^\/\s]+?)(?:\.git)?$/i,
            // https://github.com/owner/repo.git or https://github.com/owner/repo
            /https?:\/\/github\.com\/([^\/]+)\/([^\/\s]+?)(?:\.git)?$/i,
            // github.com/owner/repo
            /^github\.com\/([^\/]+)\/([^\/\s]+?)(?:\.git)?$/i,
            // ssh://git@github.com/owner/repo.git
            /ssh:\/\/git@github\.com[\/:]([^\/]+)\/([^\/\s]+?)(?:\.git)?$/i
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return {
                    owner: match[1],
                    repo: match[2].replace(/\.git$/, '')
                };
            }
        }

        return null;
    }

    /**
     * Check if a GitHub repository exists
     */
    async checkGitHubRepoExists(owner, repo) {
        try {
            // Try to use authenticated client if available
            if (window.githubClient) {
                const url = `https://api.github.com/repos/${owner}/${repo}`;
                const response = await window.githubClient.makeRequest(url);
                return response.ok;
            }
            
            // Fallback to unauthenticated fetch
            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                method: 'HEAD'
            });
            return response.ok;
        } catch (e) {
            // Network error - assume exists to avoid false positives
            return true;
        }
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.EnrichmentPipeline = EnrichmentPipeline;
}
