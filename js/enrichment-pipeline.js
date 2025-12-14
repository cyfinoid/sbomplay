/**
 * Enrichment Pipeline - Shared module for enriching SBOM analysis data
 * Used by both app.js (GitHub flow) and upload-page.js (file upload flow)
 * 
 * This ensures both entry points use identical enrichment logic:
 * - License fetching (PyPI, Go, npm, maven, cargo, etc.)
 * - Version drift analysis
 * - Author/maintainer information
 * - Vulnerability analysis (via sbomProcessor)
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

        // Phase 1: Vulnerability analysis (60-70%)
        onProgress('vulnerability', 60, 'Analyzing vulnerabilities...');
        await this.analyzeVulnerabilities(identifier, (pct, msg) => {
            onProgress('vulnerability', 60 + pct * 0.1, msg);
        });
        await saveProgress('Enrichment Phase 1: Vulnerabilities');

        // Phase 2: License fetching (70-80%)
        onProgress('licenses', 70, 'Fetching license information...');
        await this.fetchAllLicenses(deps, identifier, (pct, msg) => {
            onProgress('licenses', 70 + pct * 0.1, msg);
        });
        await saveProgress('Enrichment Phase 2: Licenses');

        // Phase 3: Version drift (80-90%)
        onProgress('version-drift', 80, 'Checking version drift...');
        await this.fetchVersionDrift(deps, (pct, msg) => {
            onProgress('version-drift', 80 + pct * 0.1, msg);
        });
        await saveProgress('Enrichment Phase 3: Version Drift');

        // Phase 4: Author information (90-98%)
        onProgress('authors', 90, 'Fetching author information...');
        await this.fetchAuthors(deps, identifier, (pct, msg) => {
            onProgress('authors', 90 + pct * 0.08, msg);
        });
        await saveProgress('Enrichment Phase 4: Authors');

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
     * Fetch version drift data
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
}

// Export for use
if (typeof window !== 'undefined') {
    window.EnrichmentPipeline = EnrichmentPipeline;
}
