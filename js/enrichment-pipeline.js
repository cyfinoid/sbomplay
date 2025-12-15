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

        // Phase 1: Vulnerability analysis (60-68%)
        onProgress('vulnerability', 60, 'Analyzing vulnerabilities...');
        await this.analyzeVulnerabilities(identifier, (pct, msg) => {
            onProgress('vulnerability', 60 + pct * 0.08, msg);
        });
        await saveProgress('Enrichment Phase 1: Vulnerabilities');

        // Phase 2: License fetching (68-76%)
        onProgress('licenses', 68, 'Fetching license information...');
        await this.fetchAllLicenses(deps, identifier, (pct, msg) => {
            onProgress('licenses', 68 + pct * 0.08, msg);
        });
        await saveProgress('Enrichment Phase 2: Licenses');

        // Phase 3: Version drift and staleness (76-84%)
        onProgress('version-drift', 76, 'Checking version drift and staleness...');
        await this.fetchVersionDrift(deps, (pct, msg) => {
            onProgress('version-drift', 76 + pct * 0.08, msg);
        });
        await saveProgress('Enrichment Phase 3: Version Drift');

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

        // Phase 6: Source repository validation (95-98%)
        onProgress('source-repos', 95, 'Validating source repositories...');
        await this.validateSourceRepos(deps, (pct, msg) => {
            onProgress('source-repos', 95 + pct * 0.03, msg);
        });
        await saveProgress('Enrichment Phase 6: Source Repos');

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

        console.log(`✅ Version drift complete: ${checked} checked`);
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

        const eoxCount = depsToCheck.filter(d => d.eoxStatus).length;
        console.log(`✅ EOX status complete: ${eoxCount} packages have EOX data`);
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
