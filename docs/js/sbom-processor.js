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
            totalDependencies: 0
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
                
                // Track global dependency usage
                if (!this.dependencies.has(depKey)) {
                    this.dependencies.set(depKey, {
                        name: pkg.name,
                        version: version,
                        repositories: new Set(),
                        count: 0
                    });
                }
                
                const dep = this.dependencies.get(depKey);
                dep.repositories.add(repoKey);
                dep.count++;
                
                // Log first few packages for debugging
                if (index < 3) {
                    console.log(`  📦 Package ${index + 1}: ${pkg.name}@${version}`);
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
     * Get top dependencies by usage count
     */
    getTopDependencies(limit = 20) {
        const sortedDeps = Array.from(this.dependencies.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
        
        return sortedDeps.map(dep => ({
            name: dep.name,
            version: dep.version,
            count: dep.count,
            repositories: Array.from(dep.repositories)
        }));
    }

    /**
     * Get repository statistics
     */
    getRepositoryStats() {
        const repos = Array.from(this.repositories.values());
        const totalDeps = repos.reduce((sum, repo) => sum + repo.totalDependencies, 0);
        
        return {
            totalRepositories: this.totalRepos,
            processedRepositories: this.processedRepos,
            successfulRepositories: this.successfulRepos,
            failedRepositories: this.failedRepos,
            repositoriesWithDependencies: repos.length,
            totalDependencies: totalDeps,
            averageDependenciesPerRepo: repos.length > 0 ? (totalDeps / repos.length).toFixed(2) : 0
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
                dependencies: Array.from(repo.dependencies)
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
        return {
            timestamp: new Date().toISOString(),
            statistics: this.getRepositoryStats(),
            topDependencies: this.getTopDependencies(50),
            topRepositories: this.getTopRepositories(50),
            dependencyDistribution: this.getDependencyDistribution(),
            allDependencies: Array.from(this.dependencies.values()).map(dep => ({
                name: dep.name,
                version: dep.version,
                count: dep.count,
                repositories: Array.from(dep.repositories)
            })),
            allRepositories: Array.from(this.repositories.values()).map(repo => ({
                name: repo.name,
                owner: repo.owner,
                totalDependencies: repo.totalDependencies,
                dependencies: Array.from(repo.dependencies)
            }))
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
     * Set total repositories count
     */
    setTotalRepositories(count) {
        this.totalRepos = count;
    }
}

// Export for use in other modules
window.SBOMProcessor = SBOMProcessor; 