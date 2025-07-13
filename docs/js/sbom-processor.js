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
            originalPackage: dep.originalPackage  // Include original package data
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
            languageStats: this.getLanguageStats(),
            vulnerabilityAnalysis: this.vulnerabilityAnalysis || null,
            licenseAnalysis: this.licenseAnalysis || null
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
     * Analyze vulnerabilities for all dependencies
     */
    async analyzeVulnerabilities() {
        if (!window.osvService) {
            console.warn('⚠️ OSV Service not available');
            return null;
        }

        try {
            console.log('🔍 SBOM Processor: Starting vulnerability analysis...');
            
            // Convert dependencies to the format expected by OSV service
            const dependencies = Array.from(this.dependencies.values()).map(dep => ({
                name: dep.name,
                version: dep.version,
                pkg: dep.originalPackage  // Pass original package data for PURL extraction
            }));

            // Analyze vulnerabilities (using the original method for backward compatibility)
            this.vulnerabilityAnalysis = await window.osvService.analyzeDependencies(dependencies);
            
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
     * Analyze license compliance for all dependencies
     */
    analyzeLicenseCompliance() {
        try {
            console.log('🔍 SBOM Processor: Starting license compliance analysis...');
            
            // Convert dependencies to the format expected by license processor
            const dependencies = Array.from(this.dependencies.values()).map(dep => ({
                name: dep.name,
                version: dep.version,
                originalPackage: dep.originalPackage
            }));

            // Generate license compliance report
            this.licenseAnalysis = this.licenseProcessor.generateComplianceReport(dependencies);
            
            console.log('✅ SBOM Processor: License compliance analysis complete');
            return this.licenseAnalysis;
        } catch (error) {
            console.error('❌ SBOM Processor: License compliance analysis failed:', error);
            return null;
        }
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
            dependencyDistribution: dependencyDistribution
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