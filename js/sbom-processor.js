/**
 * SBOM Processor - Analyzes and processes SBOM data
 */
class SBOMProcessor {
    constructor() {
        this.dependencies = new Map();
        this.repositories = new Map();
        this.totalRepos = 0;
        this.processedRepos = 0;
        this.successfulRepos = 0;
        this.failedRepos = 0;
        
        // Initialize license processor
        this.licenseProcessor = new LicenseProcessor();
        
        // Categorization mappings
        this.purlTypeMap = {
            'pypi': { type: 'code', language: 'Python', ecosystem: 'PyPI' },
            'npm': { type: 'code', language: 'JavaScript', ecosystem: 'npm' },
            'maven': { type: 'code', language: 'Java', ecosystem: 'Maven' },
            'nuget': { type: 'code', language: 'C#', ecosystem: 'NuGet' },
            'cargo': { type: 'code', language: 'Rust', ecosystem: 'Cargo' },
            'composer': { type: 'code', language: 'PHP', ecosystem: 'Composer' },
            'go': { type: 'code', language: 'Go', ecosystem: 'Go' },
            'githubactions': { type: 'workflow', language: 'YAML', ecosystem: 'GitHub Actions' },
            'github': { type: 'infrastructure', language: 'Various', ecosystem: 'GitHub' },
            'docker': { type: 'infrastructure', language: 'Various', ecosystem: 'Docker' },
            'helm': { type: 'infrastructure', language: 'YAML', ecosystem: 'Helm' },
            'terraform': { type: 'infrastructure', language: 'HCL', ecosystem: 'Terraform' }
        };
    }

    /**
     * Categorize dependency based on PURL
     */
    categorizeDependency(pkg) {
        let category = {
            type: 'unknown',
            language: 'Unknown',
            ecosystem: 'Unknown',
            isWorkflow: false,
            isInfrastructure: false,
            isCode: false
        };

        // Extract PURL information
        if (pkg.externalRefs) {
            const purlRef = pkg.externalRefs.find(ref => ref.referenceType === 'purl');
            if (purlRef && purlRef.referenceLocator) {
                const purl = purlRef.referenceLocator;
                const purlParts = purl.split('/');
                
                if (purlParts.length >= 2) {
                    let ecosystem = purlParts[0].replace('pkg:', '');
                    
                    // Map ecosystem names to OSV-compatible names
                    const ecosystemMap = {
                        'golang': 'go',
                        'go': 'go'
                    };
                    
                    ecosystem = ecosystemMap[ecosystem] || ecosystem;
                    const typeInfo = this.purlTypeMap[ecosystem];
                    
                    if (typeInfo) {
                        category = {
                            ...typeInfo,
                            isWorkflow: typeInfo.type === 'workflow',
                            isInfrastructure: typeInfo.type === 'infrastructure',
                            isCode: typeInfo.type === 'code'
                        };
                    } else {
                        // Try to infer from package name patterns
                        if (pkg.name.includes('action') || pkg.name.includes('actions/')) {
                            category = {
                                type: 'workflow',
                                language: 'YAML',
                                ecosystem: 'GitHub Actions',
                                isWorkflow: true,
                                isInfrastructure: false,
                                isCode: false
                            };
                        } else if (pkg.name.includes('docker') || pkg.name.includes('container')) {
                            category = {
                                type: 'infrastructure',
                                language: 'Various',
                                ecosystem: 'Docker',
                                isWorkflow: false,
                                isInfrastructure: true,
                                isCode: false
                            };
                        }
                    }
                }
            }
        }

        return category;
    }

    /**
     * Process SBOM data from a repository
     */
    processSBOM(owner, repo, sbomData) {
        console.log(`🔍 SBOM validation for ${owner}/${repo}:`, {
            hasSbomData: !!sbomData,
            hasSbomProperty: !!(sbomData && sbomData.sbom),
            hasPackages: !!(sbomData && sbomData.sbom && sbomData.sbom.packages),
            packagesLength: sbomData?.sbom?.packages?.length || 0
        });
        
        if (!sbomData || !sbomData.sbom || !sbomData.sbom.packages) {
            console.log(`⚠️  Invalid SBOM data for ${owner}/${repo}`);
            return false;
        }

        console.log(`🔍 Processing SBOM for ${owner}/${repo}: ${sbomData.sbom.packages.length} packages found`);

        const repoKey = `${owner}/${repo}`;
        const repoData = {
            name: repo,
            owner: owner,
            dependencies: new Set(),
            totalDependencies: 0,
            dependencyCategories: {
                code: new Set(),
                workflow: new Set(),
                infrastructure: new Set(),
                unknown: new Set()
            },
            languages: new Set()
        };

        let processedPackages = 0;
        let skippedPackages = 0;

        // Process each package in the SBOM
        sbomData.sbom.packages.forEach((pkg, index) => {
            console.log(`  📦 Processing package ${index + 1}:`, {
                name: pkg.name,
                versionInfo: pkg.versionInfo,
                version: pkg.version,
                hasName: !!pkg.name,
                hasVersion: !!(pkg.versionInfo || pkg.version)
            });
            
            // GitHub SBOM uses 'versionInfo' instead of 'version'
            const version = pkg.versionInfo || pkg.version;
            
            // Skip the main repository package (it's not a dependency)
            if (pkg.name === `com.github.${owner}/${repo}` || pkg.name === `${owner}/${repo}`) {
                console.log(`  ⏭️  Skipping main repository package: ${pkg.name}`);
                return;
            }
            
            if (pkg.name && version) {
                const depKey = `${pkg.name}@${version}`;
                repoData.dependencies.add(depKey);
                processedPackages++;
                
                // Categorize the dependency
                const category = this.categorizeDependency(pkg);
                repoData.languages.add(category.language);
                
                // Add to appropriate category
                repoData.dependencyCategories[category.type].add(depKey);
                
                // Track global dependency usage
                if (!this.dependencies.has(depKey)) {
                    this.dependencies.set(depKey, {
                        name: pkg.name,
                        version: version,
                        repositories: new Set(),
                        count: 0,
                        category: category,
                        languages: new Set([category.language]),
                        originalPackage: pkg  // Store original package data for PURL extraction
                    });
                }
                
                const dep = this.dependencies.get(depKey);
                dep.repositories.add(repoKey);
                dep.count++;
                dep.languages.add(category.language);
                
                // Log first few packages for debugging
                if (index < 3) {
                    console.log(`  📦 Package ${index + 1}: ${pkg.name}@${version} (${category.type}/${category.language})`);
                }
            } else {
                skippedPackages++;
                if (!pkg.name) {
                    console.log(`⚠️  Package missing name in ${owner}/${repo}`);
                } else if (!version) {
                    console.log(`⚠️  Package missing version in ${owner}/${repo}: ${pkg.name}`);
                }
            }
        });

        // Debug: Log package processing summary
        console.log(`  📊 Package processing summary for ${owner}/${repo}:`);
        console.log(`    - Total packages in SBOM: ${sbomData.sbom.packages.length}`);
        console.log(`    - Processed packages: ${processedPackages}`);
        console.log(`    - Skipped packages: ${skippedPackages}`);
        console.log(`    - Unique dependencies: ${repoData.dependencies.size}`);

        repoData.totalDependencies = repoData.dependencies.size;
        this.repositories.set(repoKey, repoData);
        
        console.log(`📦 Processed ${repoKey}: ${processedPackages} packages, ${skippedPackages} skipped, ${repoData.totalDependencies} unique dependencies`);
        
        return true;
    }

    /**
     * Get top dependencies by usage count with categorization
     */
    getTopDependencies(limit = 20, category = null) {
        let deps = Array.from(this.dependencies.values());
        
        // Filter by category if specified
        if (category) {
            deps = deps.filter(dep => dep.category.type === category);
        }
        
        const sortedDeps = deps
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
        
        return sortedDeps.map(dep => ({
            name: dep.name,
            version: dep.version,
            count: dep.count,
            repositories: Array.from(dep.repositories),
            category: dep.category,
            languages: Array.from(dep.languages)
        }));
    }

    /**
     * Get dependency statistics by category
     */
    getDependencyCategoryStats() {
        const stats = {
            code: { count: 0, dependencies: new Set() },
            workflow: { count: 0, dependencies: new Set() },
            infrastructure: { count: 0, dependencies: new Set() },
            unknown: { count: 0, dependencies: new Set() }
        };

        this.dependencies.forEach(dep => {
            const category = dep.category.type;
            if (stats[category]) {
                stats[category].count += dep.count;
                stats[category].dependencies.add(dep.name);
            }
        });

        return {
            code: {
                count: stats.code.count,
                uniqueDependencies: stats.code.dependencies.size
            },
            workflow: {
                count: stats.workflow.count,
                uniqueDependencies: stats.workflow.dependencies.size
            },
            infrastructure: {
                count: stats.infrastructure.count,
                uniqueDependencies: stats.infrastructure.dependencies.size
            },
            unknown: {
                count: stats.unknown.count,
                uniqueDependencies: stats.unknown.dependencies.size
            }
        };
    }

    /**
     * Get language statistics
     */
    getLanguageStats() {
        const languageStats = {};
        
        this.dependencies.forEach(dep => {
            dep.languages.forEach(lang => {
                if (!languageStats[lang]) {
                    languageStats[lang] = { count: 0, dependencies: new Set() };
                }
                languageStats[lang].count += dep.count;
                languageStats[lang].dependencies.add(dep.name);
            });
        });

        return Object.entries(languageStats).map(([lang, stats]) => ({
            language: lang,
            count: stats.count,
            uniqueDependencies: stats.dependencies.size
        })).sort((a, b) => b.count - a.count);
    }

    /**
     * Get repository statistics
     */
    getRepositoryStats() {
        const repos = Array.from(this.repositories.values());
        const totalDeps = repos.reduce((sum, repo) => sum + repo.totalDependencies, 0);
        
        // Calculate category breakdown
        const categoryBreakdown = {
            code: 0,
            workflow: 0,
            infrastructure: 0,
            unknown: 0
        };
        
        repos.forEach(repo => {
            Object.keys(categoryBreakdown).forEach(category => {
                categoryBreakdown[category] += repo.dependencyCategories[category].size;
            });
        });
        
        return {
            totalRepositories: this.totalRepos,
            processedRepositories: this.processedRepos,
            successfulRepositories: this.successfulRepos,
            failedRepositories: this.failedRepos,
            repositoriesWithDependencies: repos.length,
            totalDependencies: totalDeps,
            averageDependenciesPerRepo: repos.length > 0 ? (totalDeps / repos.length).toFixed(2) : 0,
            categoryBreakdown: categoryBreakdown
        };
    }

    /**
     * Get repositories with most dependencies
     */
    getTopRepositories(limit = 10) {
        return Array.from(this.repositories.values())
            .sort((a, b) => b.totalDependencies - a.totalDependencies)
            .slice(0, limit)
            .map(repo => ({
                name: repo.name,
                owner: repo.owner,
                totalDependencies: repo.totalDependencies,
                dependencies: Array.from(repo.dependencies),
                categoryBreakdown: {
                    code: repo.dependencyCategories.code.size,
                    workflow: repo.dependencyCategories.workflow.size,
                    infrastructure: repo.dependencyCategories.infrastructure.size,
                    unknown: repo.dependencyCategories.unknown.size
                },
                languages: Array.from(repo.languages)
            }));
    }

    /**
     * Get dependency distribution data
     */
    getDependencyDistribution() {
        const distribution = {};
        this.repositories.forEach(repo => {
            const count = repo.totalDependencies;
            const range = this.getDependencyRange(count);
            distribution[range] = (distribution[range] || 0) + 1;
        });
        return distribution;
    }

    /**
     * Get dependency range for categorization
     */
    getDependencyRange(count) {
        if (count === 0) return '0';
        if (count <= 10) return '1-10';
        if (count <= 50) return '11-50';
        if (count <= 100) return '51-100';
        if (count <= 200) return '101-200';
        return '200+';
    }

    /**
     * Export data as JSON
     */
    exportData() {
        const stats = this.getRepositoryStats();
        const topDeps = this.getTopDependencies(50);
        const topRepos = this.getTopRepositories(50);
        const allDeps = Array.from(this.dependencies.values()).map(dep => ({
            name: dep.name,
            version: dep.version,
            count: dep.count,
            repositories: Array.from(dep.repositories),
            category: dep.category,
            languages: Array.from(dep.languages),
            // Store essential originalPackage data for license restoration
            originalPackage: dep.originalPackage ? {
                name: dep.originalPackage.name,
                versionInfo: dep.originalPackage.versionInfo,
                licenseConcluded: dep.originalPackage.licenseConcluded,
                licenseDeclared: dep.originalPackage.licenseDeclared,
                copyrightText: dep.originalPackage.copyrightText,
                externalRefs: dep.originalPackage.externalRefs
            } : null,
            // Also store flattened data for easy access
            ecosystem: dep.category?.ecosystem,
            license: dep.originalPackage?.licenseConcluded || dep.originalPackage?.licenseDeclared,
            purl: dep.originalPackage?.externalRefs?.find(ref => ref.referenceType === 'purl')?.referenceLocator
        }));
        const allRepos = Array.from(this.repositories.values()).map(repo => ({
            name: repo.name,
            owner: repo.owner,
            totalDependencies: repo.totalDependencies,
            dependencies: Array.from(repo.dependencies),
            categoryBreakdown: {
                code: repo.dependencyCategories.code.size,
                workflow: repo.dependencyCategories.workflow.size,
                infrastructure: repo.dependencyCategories.infrastructure.size,
                unknown: repo.dependencyCategories.unknown.size
            },
            languages: Array.from(repo.languages)
        }));

        return {
            timestamp: new Date().toISOString(),
            statistics: stats,
            topDependencies: topDeps,
            topRepositories: topRepos,
            dependencyDistribution: this.getDependencyDistribution(),
            allDependencies: allDeps,
            allRepositories: allRepos,
            categoryStats: this.getDependencyCategoryStats(),
            languageStats: this.getLanguageStats()
            // Removed vulnerabilityAnalysis and licenseAnalysis to avoid duplication
            // They are stored separately in the main analysisData object
        };
    }

    /**
     * Reset processor state
     */
    reset() {
        this.dependencies.clear();
        this.repositories.clear();
        this.totalRepos = 0;
        this.processedRepos = 0;
        this.successfulRepos = 0;
        this.failedRepos = 0;
    }

    /**
     * Update progress counters
     */
    updateProgress(success = true) {
        this.processedRepos++;
        if (success) {
            this.successfulRepos++;
        } else {
            this.failedRepos++;
        }
    }

    /**
     * Set total repository count
     */
    setTotalRepositories(count) {
        this.totalRepos = count;
    }

    /**
     * Analyze vulnerabilities for all dependencies (including transitive)
     */
    async analyzeVulnerabilities(onProgress = null) {
        if (!window.osvService) {
            console.warn('⚠️ OSV Service not available');
            return null;
        }

        try {
            console.log('🔍 SBOM Processor: Starting vulnerability analysis...');
            
            // Get all dependencies including transitive ones from deps.dev analysis
            let allDependencies = Array.from(this.dependencies.values()).map(dep => ({
                name: dep.name,
                version: dep.version,
                pkg: dep.originalPackage  // Pass original package data for PURL extraction
            }));

            // If we have deps.dev analysis, include transitive dependencies
            if (this.depsDevAnalysis && this.depsDevAnalysis.enrichedDependenciesArray) {
                const transitiveDeps = [];
                const directDepsCount = allDependencies.length;
                
                console.log(`🔍 SBOM Processor: Starting vulnerability analysis with ${directDepsCount} direct dependencies`);
                
                this.depsDevAnalysis.enrichedDependenciesArray.forEach(enrichedDep => {
                    if (enrichedDep.depsDevTree && enrichedDep.depsDevTree.nodes && enrichedDep.depsDevTree.nodes.length > 1) {
                        const transitiveCount = enrichedDep.depsDevTree.nodes.length - 1; // Exclude root node
                        console.log(`  📦 ${enrichedDep.name}@${enrichedDep.version}: ${transitiveCount} transitive dependencies`);
                        
                        // Process nodes (skip the first one as it's the root)
                        enrichedDep.depsDevTree.nodes.slice(1).forEach(node => {
                            // Only add if not already in our direct dependencies
                            const existingDep = allDependencies.find(d => 
                                d.name === node.versionKey.name && d.version === node.versionKey.version
                            );
                            if (!existingDep) {
                                transitiveDeps.push({
                                    name: node.versionKey.name,
                                    version: node.versionKey.version,
                                    pkg: null, // Transitive deps don't have original package data
                                    isTransitive: true,
                                    parentDependency: enrichedDep.name
                                });
                            } else {
                                console.log(`    ⏭️ Skipping ${node.versionKey.name}@${node.versionKey.version} (already in direct dependencies)`);
                            }
                        });
                    } else {
                        console.log(`  📦 ${enrichedDep.name}@${enrichedDep.version}: No transitive dependencies found`);
                    }
                });
                
                allDependencies = allDependencies.concat(transitiveDeps);
                const totalDepsCount = allDependencies.length;
                const newTransitiveCount = transitiveDeps.length;
                
                console.log(`🔍 SBOM Processor: Vulnerability Analysis Summary:`);
                console.log(`  - Direct dependencies: ${directDepsCount}`);
                console.log(`  - New transitive dependencies: ${newTransitiveCount}`);
                console.log(`  - Total dependencies for analysis: ${totalDepsCount}`);
                console.log(`  - Increase: ${((newTransitiveCount / directDepsCount) * 100).toFixed(1)}%`);
                
                // Store metrics for later use
                this.vulnerabilityAnalysisMetrics = {
                    directDependencies: directDepsCount,
                    transitiveDependencies: newTransitiveCount,
                    totalDependencies: totalDepsCount,
                    increasePercentage: ((newTransitiveCount / directDepsCount) * 100).toFixed(1)
                };
            } else {
                console.log(`🔍 SBOM Processor: No deps.dev analysis available, analyzing ${allDependencies.length} direct dependencies only`);
            }

            // Analyze vulnerabilities with all dependencies
            this.vulnerabilityAnalysis = await window.osvService.analyzeDependencies(allDependencies, onProgress);
            
            // Final progress update if callback provided
            if (onProgress) {
                onProgress(100, 'Vulnerability analysis complete');
            }
            
            console.log('✅ SBOM Processor: Vulnerability analysis complete');
            return this.vulnerabilityAnalysis;
        } catch (error) {
            console.error('❌ SBOM Processor: Vulnerability analysis failed:', error);
            return null;
        }
    }

    /**
     * Analyze vulnerabilities for all dependencies with incremental saving
     */
    async analyzeVulnerabilitiesWithIncrementalSaving(orgName, onProgress = null) {
        if (!window.osvService) {
            console.warn('⚠️ OSV Service not available');
            return null;
        }

        try {
            console.log('🔍 SBOM Processor: Starting incremental vulnerability analysis...');
            
            // Convert dependencies to the format expected by OSV service
            const dependencies = Array.from(this.dependencies.values()).map(dep => ({
                name: dep.name,
                version: dep.version,
                pkg: dep.originalPackage  // Pass original package data for PURL extraction
            }));

            // Analyze vulnerabilities with incremental saving
            this.vulnerabilityAnalysis = await window.osvService.analyzeDependenciesWithIncrementalSaving(
                dependencies, 
                orgName,
                onProgress
            );
            
            console.log('✅ SBOM Processor: Incremental vulnerability analysis complete');
            return this.vulnerabilityAnalysis;
        } catch (error) {
            console.error('❌ SBOM Processor: Incremental vulnerability analysis failed:', error);
            return null;
        }
    }

    /**
     * Analyze license compliance for all dependencies (including transitive)
     */
    analyzeLicenseCompliance(onProgress = null) {
        try {
            console.log('🔍 SBOM Processor: Starting license compliance analysis...');
            
            // Get all dependencies including transitive ones from deps.dev analysis
            let allDependencies = Array.from(this.dependencies.values()).map(dep => ({
                name: dep.name,
                version: dep.version,
                originalPackage: dep.originalPackage
            }));

            // If we have deps.dev analysis, include transitive dependencies
            if (this.depsDevAnalysis && this.depsDevAnalysis.enrichedDependenciesArray) {
                const transitiveDeps = [];
                const directDepsCount = allDependencies.length;
                
                console.log(`🔍 SBOM Processor: Starting license analysis with ${directDepsCount} direct dependencies`);
                
                this.depsDevAnalysis.enrichedDependenciesArray.forEach(enrichedDep => {
                    if (enrichedDep.depsDevTree && enrichedDep.depsDevTree.nodes && enrichedDep.depsDevTree.nodes.length > 1) {
                        const transitiveCount = enrichedDep.depsDevTree.nodes.length - 1; // Exclude root node
                        console.log(`  📦 ${enrichedDep.name}@${enrichedDep.version}: ${transitiveCount} transitive dependencies`);
                        
                        // Process nodes (skip the first one as it's the root)
                        enrichedDep.depsDevTree.nodes.slice(1).forEach(node => {
                            // Only add if not already in our direct dependencies
                            const existingDep = allDependencies.find(d => 
                                d.name === node.versionKey.name && d.version === node.versionKey.version
                            );
                            if (!existingDep) {
                                transitiveDeps.push({
                                    name: node.versionKey.name,
                                    version: node.versionKey.version,
                                    originalPackage: null, // Transitive deps don't have original package data
                                    isTransitive: true,
                                    parentDependency: enrichedDep.name
                                });
                            } else {
                                console.log(`    ⏭️ Skipping ${node.versionKey.name}@${node.versionKey.version} (already in direct dependencies)`);
                            }
                        });
                    } else {
                        console.log(`  📦 ${enrichedDep.name}@${enrichedDep.version}: No transitive dependencies found`);
                    }
                });
                
                allDependencies = allDependencies.concat(transitiveDeps);
                const totalDepsCount = allDependencies.length;
                const newTransitiveCount = transitiveDeps.length;
                
                console.log(`🔍 SBOM Processor: License Analysis Summary:`);
                console.log(`  - Direct dependencies: ${directDepsCount}`);
                console.log(`  - New transitive dependencies: ${newTransitiveCount}`);
                console.log(`  - Total dependencies for analysis: ${totalDepsCount}`);
                console.log(`  - Increase: ${((newTransitiveCount / directDepsCount) * 100).toFixed(1)}%`);
                
                // Store metrics for later use
                this.licenseAnalysisMetrics = {
                    directDependencies: directDepsCount,
                    transitiveDependencies: newTransitiveCount,
                    totalDependencies: totalDepsCount,
                    increasePercentage: ((newTransitiveCount / directDepsCount) * 100).toFixed(1)
                };
            } else {
                console.log(`🔍 SBOM Processor: No deps.dev analysis available, analyzing ${allDependencies.length} direct dependencies only`);
            }

            // Generate license compliance report with all dependencies
            this.licenseAnalysis = this.licenseProcessor.generateComplianceReport(allDependencies);
            
            // Call progress callback if provided
            if (onProgress) {
                onProgress(100, 'License compliance analysis complete');
            }
            
            console.log('✅ SBOM Processor: License compliance analysis complete');
            return this.licenseAnalysis;
        } catch (error) {
            console.error('❌ SBOM Processor: License compliance analysis failed:', error);
            return null;
        }
    }

    /**
     * Analyze dependencies with deps.dev enrichment
     */
    async analyzeDepsDevEnrichment(onProgress = null) {
        if (!window.DepsDevService) {
            console.warn('⚠️ DepsDev Service not available');
            return null;
        }

        try {
            console.log('🔍 SBOM Processor: Starting deps.dev enrichment analysis...');
            
            // Convert dependencies to the format expected by DepsDev service
            const dependencies = Array.from(this.dependencies.values()).map(dep => ({
                name: dep.name,
                version: dep.version,
                purl: dep.originalPackage ? this.extractPurlFromPackage(dep.originalPackage) : null
            }));

            // Create DepsDev service instance if not exists
            if (!this.depsDevService) {
                this.depsDevService = new DepsDevService();
            }

            // Analyze dependencies with deps.dev enrichment
            this.depsDevAnalysis = await this.depsDevService.analyzeDependencies(dependencies, onProgress);
            
            console.log('✅ SBOM Processor: DepsDev enrichment analysis complete');
            return this.depsDevAnalysis;
        } catch (error) {
            console.error('❌ SBOM Processor: DepsDev enrichment analysis failed:', error);
            return null;
        }
    }

    /**
     * Extract PURL from package data
     */
    extractPurlFromPackage(pkg) {
        if (pkg.externalRefs) {
            const purlRef = pkg.externalRefs.find(ref => ref.referenceType === 'purl');
            if (purlRef && purlRef.referenceLocator) {
                return purlRef.referenceLocator;
            }
        }
        return null;
    }

    /**
     * Get license statistics for visualization
     */
    getLicenseStats() {
        if (!this.licenseAnalysis) {
            return null;
        }
        return this.licenseProcessor.getLicenseStats(Array.from(this.dependencies.values()));
    }

    /**
     * Get license conflicts
     */
    getLicenseConflicts() {
        if (!this.licenseAnalysis) {
            return [];
        }
        return this.licenseAnalysis.conflicts;
    }

    /**
     * Get high-risk dependencies
     */
    getHighRiskDependencies() {
        if (!this.licenseAnalysis) {
            return [];
        }
        return this.licenseAnalysis.highRiskDependencies;
    }

    /**
     * Export partial data for incremental saving (memory optimized)
     */
    exportPartialData() {
        // Only export essential data to reduce memory usage
        const statistics = {
            totalRepositories: this.totalRepos,
            processedRepositories: this.processedRepos,
            successfulRepositories: this.successfulRepos,
            failedRepositories: this.failedRepos,
            totalDependencies: this.dependencies.size,
            totalUniqueDependencies: this.dependencies.size
        };

        // Export only top dependencies and repositories to save memory
        const topDependencies = this.getTopDependencies(20);
        const topRepositories = this.getTopRepositories(10);

        // Export category and language stats (these are lightweight)
        const categoryStats = this.getDependencyCategoryStats();
        const languageStats = this.getLanguageStats();
        const dependencyDistribution = this.getDependencyDistribution();

        // Only export all dependencies and repositories if we have a reasonable amount
        // This prevents memory issues with very large datasets
        let allDependencies = null;
        let allRepositories = null;

        if (this.dependencies.size <= 1000) {
            // For smaller datasets, export everything
            allDependencies = Array.from(this.dependencies.values()).map(dep => ({
                name: dep.name,
                version: dep.version,
                count: dep.count,
                repositories: Array.from(dep.repositories),
                category: dep.category,
                languages: Array.from(dep.languages)
            }));
        }

        if (this.repositories.size <= 500) {
            // For smaller datasets, export everything
            allRepositories = Array.from(this.repositories.values()).map(repo => ({
                name: repo.name,
                owner: repo.owner,
                totalDependencies: repo.totalDependencies,
                dependencies: Array.from(repo.dependencies),
                dependencyCategories: {
                    code: Array.from(repo.dependencyCategories.code),
                    workflow: Array.from(repo.dependencyCategories.workflow),
                    infrastructure: Array.from(repo.dependencyCategories.infrastructure),
                    unknown: Array.from(repo.dependencyCategories.unknown)
                },
                languages: Array.from(repo.languages)
            }));
        }

        return {
            statistics: statistics,
            topDependencies: topDependencies,
            topRepositories: topRepositories,
            allDependencies: allDependencies,
            allRepositories: allRepositories,
            categoryStats: categoryStats,
            languageStats: languageStats,
            dependencyDistribution: dependencyDistribution,
            depsDevAnalysis: this.depsDevAnalysis || null,
            vulnerabilityAnalysis: this.vulnerabilityAnalysis || null,
            licenseAnalysis: this.licenseAnalysis || null
        };
    }

    /**
     * Check if we should save incremental data (every 10 repositories)
     */
    shouldSaveIncremental() {
        return this.processedRepos > 0 && this.processedRepos % 10 === 0;
    }

    /**
     * Clear memory after incremental save to prevent DOM from holding unnecessary data
     */
    clearMemoryAfterSave() {
        // Force garbage collection hints
        if (window.gc) {
            window.gc();
        }
        
        // Clear any cached data that's no longer needed
        if (this.vulnerabilityAnalysis && this.vulnerabilityAnalysis.vulnerableDependencies) {
            // Keep only essential vulnerability data, clear detailed data
            this.vulnerabilityAnalysis.vulnerableDependencies.forEach(dep => {
                if (dep.vulnerabilities) {
                    dep.vulnerabilities.forEach(vuln => {
                        // Keep only essential fields, clear large objects
                        delete vuln.details;
                        delete vuln.references;
                        delete vuln.affected;
                        delete vuln.database_specific;
                    });
                }
            });
        }
        
        console.log('🧹 Memory cleared after incremental save');
    }
}

// Export for use in other modules
window.SBOMProcessor = SBOMProcessor; 