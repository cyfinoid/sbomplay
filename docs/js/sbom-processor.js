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
        
        // Categorization mappings
        this.purlTypeMap = {
            'pypi': { type: 'code', language: 'Python', ecosystem: 'PyPI' },
            'npm': { type: 'code', language: 'JavaScript', ecosystem: 'npm' },
            'maven': { type: 'code', language: 'Java', ecosystem: 'Maven' },
            'nuget': { type: 'code', language: 'C#', ecosystem: 'NuGet' },
            'cargo': { type: 'code', language: 'Rust', ecosystem: 'Cargo' },
            'composer': { type: 'code', language: 'PHP', ecosystem: 'Composer' },
            'go': { type: 'code', language: 'Go', ecosystem: 'Go Modules' },
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
                    const ecosystem = purlParts[0].replace('pkg:', '');
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
                        languages: new Set([category.language])
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
            languages: Array.from(dep.languages)
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
}

// Export for use in other modules
window.SBOMProcessor = SBOMProcessor; 