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
        
        // Initialize quality processor
        this.qualityProcessor = window.SBOMQualityProcessor ? new window.SBOMQualityProcessor() : null;
        
        // GitHub Actions analysis results
        this.githubActionsAnalysis = null;
        
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
                    
                    // Normalize ecosystem using shared EcosystemMapper
                    if (window.ecosystemMapper) {
                        ecosystem = window.ecosystemMapper.normalizeEcosystem(ecosystem);
                    } else {
                        // Fallback: handle common aliases
                        const ecosystemMap = {
                            'golang': 'go',
                            'go': 'go'
                        };
                        ecosystem = ecosystemMap[ecosystem] || ecosystem;
                    }
                    
                    // Get category info using shared EcosystemMapper if available
                    let typeInfo;
                    if (window.ecosystemMapper) {
                        typeInfo = window.ecosystemMapper.getCategoryInfo(ecosystem) || this.purlTypeMap[ecosystem];
                    } else {
                        typeInfo = this.purlTypeMap[ecosystem];
                    }
                    
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
        
        // Fallback: If no PURL found and still Unknown, try to detect from package name patterns
        if (category.ecosystem === 'Unknown' && pkg.name) {
            const name = pkg.name.toLowerCase();
            
            // GitHub Actions (e.g., "actions/checkout", "github/codeql-action/init")
            if (name.startsWith('actions/') || name.startsWith('github/') || name.includes('/action')) {
                const githubActionsTypeInfo = window.ecosystemMapper?.getCategoryInfo('githubactions') || this.purlTypeMap['githubactions'];
                if (githubActionsTypeInfo) {
                    category = {
                        ...githubActionsTypeInfo,
                        isWorkflow: true,
                        isInfrastructure: false,
                        isCode: false
                    };
                }
            }
            // Maven packages use groupId:artifactId format (e.g., "org.codehaus.plexus:plexus-utils")
            else if (pkg.name.includes(':') && !pkg.name.startsWith('@')) {
                const mavenTypeInfo = window.ecosystemMapper?.getCategoryInfo('maven') || this.purlTypeMap['maven'];
                if (mavenTypeInfo) {
                    category = {
                        ...mavenTypeInfo,
                        isWorkflow: false,
                        isInfrastructure: false,
                        isCode: true
                    };
                } else {
                    // Fallback if ecosystemMapper not available
                    category = {
                        type: 'code',
                        language: 'Java',
                        ecosystem: 'Maven',
                        isWorkflow: false,
                        isInfrastructure: false,
                        isCode: true
                    };
                }
            }
            // npm scoped packages start with @
            else if (pkg.name.startsWith('@')) {
                const npmTypeInfo = window.ecosystemMapper?.getCategoryInfo('npm') || this.purlTypeMap['npm'];
                if (npmTypeInfo) {
                    category = {
                        ...npmTypeInfo,
                        isWorkflow: false,
                        isInfrastructure: false,
                        isCode: true
                    };
                }
            }
            // Go modules (e.g., "github.com/user/repo", "golang.org/x/...")
            else if (name.includes('github.com/') || name.includes('golang.org/') || name.includes('go.') || 
                     (name.includes('/') && (name.endsWith('.go') || name.match(/^[a-z0-9.-]+\/[a-z0-9.-]+$/i)))) {
                const goTypeInfo = window.ecosystemMapper?.getCategoryInfo('go') || this.purlTypeMap['go'];
                if (goTypeInfo) {
                    category = {
                        ...goTypeInfo,
                        isWorkflow: false,
                        isInfrastructure: false,
                        isCode: true
                    };
                }
            }
            // Docker images (e.g., "alpine", "node", "python", or contain "/" and common docker patterns)
            else if (name.includes('docker') || name.includes('container') || 
                     (name.includes('/') && (name.includes('alpine') || name.includes('ubuntu') || 
                      name.includes('debian') || name.includes('centos') || name.includes('fedora')))) {
                const dockerTypeInfo = window.ecosystemMapper?.getCategoryInfo('docker') || this.purlTypeMap['docker'];
                if (dockerTypeInfo) {
                    category = {
                        ...dockerTypeInfo,
                        isWorkflow: false,
                        isInfrastructure: true,
                        isCode: false
                    };
                }
            }
            // PyPI packages (common Python package naming patterns)
            else if (name.match(/^[a-z0-9_-]+$/) && !name.includes('/') && !name.includes('@') && 
                     (name.includes('_') || name.includes('-') || name.length > 3)) {
                // Check if it looks like a Python package (common patterns)
                // This is a heuristic - PyPI packages are often lowercase with underscores/hyphens
                const pypiTypeInfo = window.ecosystemMapper?.getCategoryInfo('pypi') || this.purlTypeMap['pypi'];
                if (pypiTypeInfo) {
                    category = {
                        ...pypiTypeInfo,
                        isWorkflow: false,
                        isInfrastructure: false,
                        isCode: true
                    };
                }
            }
            // RubyGems (common gem naming patterns - lowercase, may have hyphens)
            else if (name.match(/^[a-z0-9_-]+$/) && !name.includes('/') && !name.includes('@') && 
                     (name.includes('-') || name.length > 3)) {
                // This is a heuristic - RubyGems often use lowercase with hyphens
                const gemTypeInfo = window.ecosystemMapper?.getCategoryInfo('gem') || window.ecosystemMapper?.getCategoryInfo('rubygems') || this.purlTypeMap['rubygems'];
                if (gemTypeInfo) {
                    category = {
                        ...gemTypeInfo,
                        isWorkflow: false,
                        isInfrastructure: false,
                        isCode: true
                    };
                }
            }
        }

        return category;
    }

    /**
     * Process SBOM data from a repository
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {Object} sbomData - SBOM data from GitHub
     * @param {string} repositoryLicense - Repository's own license (SPDX identifier, e.g., 'GPL-3.0', 'MIT')
     * @param {boolean} archived - Whether the repository is archived
     */
    async processSBOM(owner, repo, sbomData, repositoryLicense = null, archived = false) {
        if (!sbomData || !sbomData.sbom || !sbomData.sbom.packages) {
            console.log(`⚠️  Invalid SBOM data for ${owner}/${repo}`);
            return false;
        }

        console.log(`🔍 Processing SBOM for ${owner}/${repo}: ${sbomData.sbom.packages.length} packages found`);

        const repoKey = `${owner}/${repo}`;
        const repoData = {
            name: repo,
            owner: owner,
            license: repositoryLicense || null,  // Store repository's own license
            archived: archived || false,  // Store archived status
            dependencies: new Set(),
            directDependencies: new Set(),  // Track direct dependencies from relationships
            totalDependencies: 0,
            dependencyCategories: {
                code: new Set(),
                workflow: new Set(),
                infrastructure: new Set(),
                unknown: new Set()
            },
            languages: new Set(),
            relationships: [],  // Store relationship data for graph visualization
            spdxPackages: []  // Store SPDX package info for mapping SPDXID to package details
        };
        
        // Extract ALL dependency relationships (not just direct from main package)
        // This allows us to build the full dependency tree
        const mainPackageSPDXID = sbomData.sbom.packages.find(p => 
            p.name === `com.github.${owner}/${repo}` || p.name === `${owner}/${repo}`
        )?.SPDXID;
        
        if (sbomData.sbom.relationships && Array.isArray(sbomData.sbom.relationships)) {
            // Store all DEPENDS_ON relationships for graph visualization
            sbomData.sbom.relationships.forEach(rel => {
                if (rel.relationshipType === 'DEPENDS_ON') {
                    repoData.relationships.push({
                        from: rel.spdxElementId,
                        to: rel.relatedSpdxElement,
                        type: rel.relationshipType,
                        isDirectFromMain: rel.spdxElementId === mainPackageSPDXID
                    });
                }
            });
        }

        let processedPackages = 0;
        let skippedPackages = 0;

        // Process each package in the SBOM
        for (let index = 0; index < sbomData.sbom.packages.length; index++) {
            const pkg = sbomData.sbom.packages[index];
            // GitHub SBOM uses 'versionInfo' instead of 'version'
            let version = pkg.versionInfo || pkg.version;
            
            // Normalize version: remove comparison operators like ">=", "<=", "^", "~", etc.
            if (version) {
                version = this.normalizeVersion(version);
            }
            
            // Skip the main repository package (it's not a dependency)
            // GitHub SBOM includes the repository itself as a package (e.g., "com.github.owner/repo")
            // This is filtered out because it's not an external dependency
            // This explains why GitHub SBOM may show N packages but we display N-1 dependencies
            if (pkg.name === `com.github.${owner}/${repo}` || pkg.name === `${owner}/${repo}`) {
                console.log(`  ⏭️  Skipping main repository package: ${pkg.name} (not an external dependency)`);
                skippedPackages++;
                continue;
            }
            
            // Skip packages without names (cannot identify dependency)
            if (!pkg.name) {
                skippedPackages++;
                console.log(`⚠️  Package missing name in ${owner}/${repo}`);
                continue;
            }
            
            // Categorize the dependency first (needed for version fetching)
            const category = this.categorizeDependency(pkg);
            
            // When version is missing, try to fetch latest version from registry
            let displayVersion = version;
            let assumedVersion = null;
            if (!version) {
                console.log(`⚠️  Package missing version in ${owner}/${repo}: ${pkg.name} (attempting to fetch latest version)`);
                // Try to fetch latest version from registry
                const ecosystem = category?.ecosystem?.toLowerCase();
                if (ecosystem && window.DependencyTreeResolver) {
                    try {
                        const resolver = new window.DependencyTreeResolver();
                        const latestVersion = await resolver.fetchLatestVersion(pkg.name, ecosystem);
                        if (latestVersion) {
                            displayVersion = latestVersion;
                            assumedVersion = latestVersion;
                            console.log(`   ✅ Found latest version for ${pkg.name}: ${latestVersion} (assumed)`);
                        } else {
                            displayVersion = 'version unknown';
                            console.log(`   ⚠️  Could not fetch latest version for ${pkg.name}, using "version unknown"`);
                        }
                    } catch (error) {
                        displayVersion = 'version unknown';
                        console.log(`   ⚠️  Failed to fetch latest version for ${pkg.name}: ${error.message}`);
                    }
                } else {
                    displayVersion = 'version unknown';
                }
            }
            const depKey = `${pkg.name}@${displayVersion}`;
            repoData.dependencies.add(depKey);
            processedPackages++;
            
            // Check if this is a direct dependency (directly from main package)
            const isDirect = repoData.relationships.some(rel => 
                rel.to === pkg.SPDXID && rel.isDirectFromMain
            );
            if (isDirect) {
                repoData.directDependencies.add(depKey);
            }
            repoData.languages.add(category.language);
            
            // Add to appropriate category
            repoData.dependencyCategories[category.type].add(depKey);
            
            // Extract GitHub Actions owner/repo if this is a GitHub Action
            let githubActionInfo = null;
            if (category.ecosystem === 'GitHub Actions' || category.isWorkflow) {
                githubActionInfo = this.parseGitHubAction(pkg.name);
            }
            
            // Track global dependency usage
            if (!this.dependencies.has(depKey)) {
                this.dependencies.set(depKey, {
                    name: pkg.name,
                    version: version || null,  // Store original version (null if missing)
                    displayVersion: displayVersion,  // Display version (may be assumed)
                    assumedVersion: assumedVersion,  // Latest version if assumed
                    repositories: new Set(),
                    count: 0,
                    category: category,
                    languages: new Set([category.language]),
                    originalPackage: pkg,  // Store original package data for PURL extraction
                    directIn: new Set(),  // Track which repos use this as direct dependency
                    transitiveIn: new Set(),  // Track which repos use this as transitive dependency
                    githubActionInfo: githubActionInfo,  // Store parsed GitHub Action info
                    versionUnknown: !version && !assumedVersion  // Flag to indicate version was missing and not assumed
                });
            }
            
            const dep = this.dependencies.get(depKey);
            dep.repositories.add(repoKey);
            dep.count++;
            dep.languages.add(category.language);
            
            // Update GitHub Action info if not already set
            if (githubActionInfo && !dep.githubActionInfo) {
                dep.githubActionInfo = githubActionInfo;
            }
            
            // Track if it's direct or transitive in this repo
            if (isDirect) {
                dep.directIn.add(repoKey);
            } else {
                dep.transitiveIn.add(repoKey);
            }
            
            // Log first few packages for debugging
            if (index < 3) {
                console.log(`  📦 Package ${index + 1}: ${pkg.name}@${displayVersion} (${category.type}/${category.language})`);
            }
        }

        repoData.totalDependencies = repoData.dependencies.size;
        
        // Store SPDX package info for graph visualization
        repoData.spdxPackages = sbomData.sbom.packages.map(pkg => ({
            SPDXID: pkg.SPDXID,
            name: pkg.name,
            version: pkg.versionInfo || pkg.version
        }));
        
        // Assess SBOM quality if quality processor is available
        if (this.qualityProcessor) {
            try {
                const qualityAssessment = this.qualityProcessor.assessQuality(sbomData, owner, repo);
                repoData.qualityAssessment = qualityAssessment;
                console.log(`✅ SBOM Quality for ${repoKey}: ${qualityAssessment.overallScore}/100 (Grade ${qualityAssessment.grade})`);
            } catch (error) {
                console.error(`❌ Failed to assess SBOM quality for ${repoKey}:`, error);
                repoData.qualityAssessment = null;
            }
        } else {
            console.warn('⚠️  SBOM Quality Processor not available');
            repoData.qualityAssessment = null;
        }
        
        this.repositories.set(repoKey, repoData);
        
        console.log(`📦 Processed ${repoKey}: ${processedPackages} packages, ${skippedPackages} skipped, ${repoData.totalDependencies} unique dependencies`);
        
        return true;
    }

    /**
     * Parse GitHub Action name to extract owner and repo
     * Formats: "owner/action-name" or "owner/repo@version"
     * @param {string} actionName - GitHub Action name
     * @returns {Object|null} - {owner: string, actionName: string, repoName: string} or null
     */
    parseGitHubAction(actionName) {
        if (!actionName) return null;
        
        // GitHub Actions format: owner/action-name or owner/repo@version
        // Examples: "actions/checkout@v3", "docker/setup-buildx-action@v2"
        const parts = actionName.split('/');
        if (parts.length < 2) return null;
        
        const owner = parts[0];
        const rest = parts.slice(1).join('/'); // Handle cases with multiple slashes
        const actionParts = rest.split('@');
        const repoOrAction = actionParts[0];
        
        return {
            owner: owner,
            actionName: repoOrAction,
            repoName: repoOrAction, // For GitHub Actions, repo name is usually the action name
            fullName: `${owner}/${repoOrAction}`
        };
    }

    /**
     * Normalize version string by removing comparison operators
     * Uses shared VersionUtils for consistency
     */
    normalizeVersion(version) {
        if (window.normalizeVersion) {
            return window.normalizeVersion(version);
        }
        // Fallback if VersionUtils not available
        if (!version) return version;
        return version.trim()
            .replace(/^[><=^~]+\s*/, '')
            .replace(/\s+-\s+[\d.]+.*$/, '')  // Only remove ranges with spaces around dash
            .replace(/\s*\|\|.*$/, '')
            .trim();
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
            version: dep.displayVersion || dep.version,  // Use displayVersion (may be assumed)
            assumedVersion: dep.assumedVersion || null,  // Latest version if assumed
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
     * Resolve full dependency trees using registry APIs
     */
    async resolveFullDependencyTrees(onProgress = null) {
        console.log('🌲 Starting full dependency tree resolution...');
        
        if (!window.DependencyTreeResolver) {
            console.warn('⚠️ DependencyTreeResolver not available');
            return null;
        }
        
        const resolver = new window.DependencyTreeResolver();
        const resolvedTrees = new Map(); // ecosystem -> tree
        
        try {
            // Group direct dependencies by ecosystem
            const directDepsByEcosystem = new Map();
            
            for (const [depKey, dep] of this.dependencies) {
                const ecosystem = dep.category?.ecosystem?.toLowerCase();
                if (!ecosystem || dep.directIn.size === 0) continue;
                
                if (!directDepsByEcosystem.has(ecosystem)) {
                    directDepsByEcosystem.set(ecosystem, new Set());
                }
                directDepsByEcosystem.get(ecosystem).add(depKey);
            }
            
            console.log(`📊 Found ${directDepsByEcosystem.size} ecosystems with direct dependencies`);
            
            // Resolve trees for all ecosystems in parallel
            const ecosystemEntries = Array.from(directDepsByEcosystem.entries());
            
            // Helper function to resolve a single ecosystem
            const resolveEcosystem = async ([ecosystem, directDeps], index) => {
                console.log(`  🔍 Resolving ${ecosystem} dependencies (${directDeps.size} direct)...`);
                
                try {
                    // Create progress callback for this ecosystem
                    const ecosystemProgressCallback = (progress) => {
                        if (onProgress && progress.phase === 'resolving-package') {
                            // Map package-level progress to ecosystem-level progress
                            const ecosystemProgress = index + (progress.processed / progress.total);
                            onProgress({
                                phase: 'resolving-package',
                                ecosystem: ecosystem,
                                processed: progress.processed,
                                total: progress.total,
                                packageName: progress.packageName || progress.package || null,
                                remaining: progress.remaining || (progress.total - progress.processed),
                                packageProgress: progress,
                                ecosystemProgress: ecosystemProgress
                            });
                        }
                    };
                    
                    const tree = await resolver.resolveDependencyTree(
                        directDeps,
                        this.dependencies,
                        ecosystem,
                        ecosystemProgressCallback
                    );
                    
                    // Update dependencies with depth information
                    // Use depth to correctly classify dependencies as direct (depth=1) or transitive (depth>1)
                    // Track which repos have direct dependencies in this ecosystem to propagate transitive status
                    const reposWithDirectDeps = new Set();
                    directDeps.forEach(depKey => {
                        const directDep = this.dependencies.get(depKey);
                        if (directDep) {
                            directDep.directIn.forEach(repo => reposWithDirectDeps.add(repo));
                        }
                    });
                    
                    for (const [packageKey, treeNode] of tree) {
                        let dep = this.dependencies.get(packageKey);
                        
                        // If dependency doesn't exist yet (discovered during tree resolution), create it
                        if (!dep) {
                            // Parse package name and version from packageKey
                            const [name, ...versionParts] = packageKey.split('@');
                            const version = versionParts.join('@');
                            
                            // Try to infer ecosystem from the ecosystem being resolved
                            const category = this.categorizeDependency({ name });
                            
                            dep = {
                                name: name,
                                version: version || null,
                                displayVersion: version || 'version unknown',
                                assumedVersion: null,
                                repositories: new Set(),
                                count: 0,
                                category: category,
                                languages: new Set([category.language]),
                                originalPackage: null,
                                directIn: new Set(),
                                transitiveIn: new Set(),
                                githubActionInfo: null,
                                versionUnknown: !version
                            };
                            this.dependencies.set(packageKey, dep);
                            console.log(`    📦 Added newly discovered transitive dependency: ${packageKey} (depth ${treeNode.depth})`);
                        }
                        
                        dep.depth = treeNode.depth;
                        dep.parents = Array.from(treeNode.parents);
                        dep.children = Array.from(treeNode.children);
                        
                        // Update directIn/transitiveIn based on depth
                        // Depth 1 = direct, depth 2+ = transitive
                        // For transitive dependencies, add them to transitiveIn for all repos that have their parent as direct
                        if (treeNode.depth === 1) {
                            // Direct dependency - ensure repos are marked correctly
                            reposWithDirectDeps.forEach(repoKey => {
                                if (dep.repositories.has(repoKey)) {
                                    dep.directIn.add(repoKey);
                                    dep.transitiveIn.delete(repoKey);
                                }
                            });
                        } else if (treeNode.depth > 1) {
                            // Transitive dependency - mark as transitive in repos where parent is used
                            // Trace back through parents to find which repos use this transitively
                            const reposUsingTransitive = new Set();
                            treeNode.parents.forEach(parentKey => {
                                const parentDep = this.dependencies.get(parentKey);
                                if (parentDep) {
                                    // If parent is direct in a repo, then this transitive dep should be transitive in that repo
                                    parentDep.directIn.forEach(repo => {
                                        reposUsingTransitive.add(repo);
                                        dep.repositories.add(repo);
                                    });
                                    // Also check if parent itself is transitive in some repos
                                    parentDep.transitiveIn.forEach(repo => {
                                        reposUsingTransitive.add(repo);
                                        dep.repositories.add(repo);
                                    });
                                } else {
                                    // Parent might be a direct dependency - check reposWithDirectDeps
                                    reposWithDirectDeps.forEach(repo => reposUsingTransitive.add(repo));
                                }
                            });
                            
                            // Mark as transitive in all relevant repos
                            reposUsingTransitive.forEach(repoKey => {
                                dep.transitiveIn.add(repoKey);
                                dep.directIn.delete(repoKey); // Ensure it's not marked as direct
                                dep.repositories.add(repoKey);
                            });
                            
                            // Update count to reflect all repositories
                            dep.count = dep.repositories.size;
                        }
                    }
                    
                    const stats = resolver.getTreeStats(tree);
                    console.log(`    ✅ Resolved ${ecosystem}: ${stats.totalPackages} packages, max depth: ${stats.maxDepth}`);
                    
                    return { ecosystem, tree, success: true };
                } catch (error) {
                    console.error(`    ❌ Error resolving ${ecosystem}:`, error);
                    return { ecosystem, tree: null, success: false };
                }
            };
            
            // Resolve all ecosystems in parallel
            const resolutionPromises = ecosystemEntries.map((entry, index) => 
                resolveEcosystem(entry, index)
            );
            
            const resolutionResults = await Promise.allSettled(resolutionPromises);
            
            // Process results and update progress
            let processedEcosystems = 0;
            resolutionResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.success) {
                    const { ecosystem, tree } = result.value;
                    resolvedTrees.set(ecosystem, tree);
                    processedEcosystems++;
                    
                    if (onProgress) {
                        onProgress({
                            phase: 'resolving-tree',
                            ecosystem: ecosystem,
                            processed: processedEcosystems,
                            total: ecosystemEntries.length
                        });
                    }
                }
            });
            
            console.log('✅ Dependency tree resolution complete');
            this.dependencyTreesResolved = true;
            this.resolvedDependencyTrees = resolvedTrees;
            
            return resolvedTrees;
            
        } catch (error) {
            console.error('❌ Error during dependency tree resolution:', error);
            return null;
        }
    }

    /**
     * Export data as JSON
     */
    exportData() {
        const stats = this.getRepositoryStats();
        const topDeps = this.getTopDependencies(50);
        const topRepos = this.getTopRepositories(50);
        const allDeps = Array.from(this.dependencies.values()).map(dep => {
            // Extract PURL from originalPackage if available
            let purl = null;
            if (dep.originalPackage && dep.originalPackage.externalRefs) {
                const purlRef = dep.originalPackage.externalRefs.find(ref => ref.referenceType === 'purl');
                if (purlRef && purlRef.referenceLocator) {
                    purl = purlRef.referenceLocator;
                }
            }
            
            return {
                name: dep.name,
                version: dep.displayVersion || dep.version,  // Use displayVersion (may be assumed)
                assumedVersion: dep.assumedVersion || null,  // Latest version if assumed
                count: dep.count,
                repositories: Array.from(dep.repositories),
                directIn: Array.from(dep.directIn || []),  // Repos using as direct dependency
                transitiveIn: Array.from(dep.transitiveIn || []),  // Repos using as transitive dependency
                category: dep.category,
                languages: Array.from(dep.languages),
                purl: purl,  // Include extracted PURL for author analysis
                originalPackage: dep.originalPackage,  // Include original package data
                depth: dep.depth || null,  // Depth in dependency tree (1 = direct, 2+ = transitive)
                parents: dep.parents || [],  // Parent dependencies (what brings this in)
                children: dep.children || []  // Child dependencies (what this brings in)
            };
        });
        const allRepos = Array.from(this.repositories.values()).map(repo => ({
            name: repo.name,
            owner: repo.owner,
            license: repo.license || null,  // Include repository license
            archived: repo.archived || false,  // Include archived status
            totalDependencies: repo.totalDependencies,
            dependencies: Array.from(repo.dependencies),
            directDependencies: Array.from(repo.directDependencies || []),  // Direct dependencies
            categoryBreakdown: {
                code: repo.dependencyCategories.code.size,
                workflow: repo.dependencyCategories.workflow.size,
                infrastructure: repo.dependencyCategories.infrastructure.size,
                unknown: repo.dependencyCategories.unknown.size
            },
            languages: Array.from(repo.languages),
            relationships: repo.relationships || [],  // Include ALL relationships for graph visualization
            spdxPackages: repo.spdxPackages || [],  // Store SPDX package data for mapping
            qualityAssessment: repo.qualityAssessment || null  // Include SBOM quality assessment
        }));

        // Calculate aggregate quality analysis if quality processor is available
        let qualityAnalysis = null;
        if (this.qualityProcessor) {
            const qualityAssessments = allRepos
                .filter(repo => repo.qualityAssessment)
                .map(repo => repo.qualityAssessment);
            
            if (qualityAssessments.length > 0) {
                qualityAnalysis = this.qualityProcessor.calculateAggregateQuality(qualityAssessments);
            }
        }

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
            licenseAnalysis: this.licenseAnalysis || null,
            qualityAnalysis: qualityAnalysis,  // Add aggregate quality analysis
            githubActionsAnalysis: this.githubActionsAnalysis || null  // Add GitHub Actions analysis
        };
    }

    /**
     * Analyze GitHub Actions for all repositories
     * @param {GitHubClient} githubClient - GitHub client instance
     * @param {AuthorService} authorService - Author service instance
     * @param {Function} onProgress - Optional progress callback
     * @returns {Promise<Object>} GitHub Actions analysis results
     */
    async analyzeGitHubActions(githubClient, authorService, onProgress = null) {
        if (!window.GitHubActionsAnalyzer) {
            console.warn('⚠️ GitHub Actions Analyzer not available');
            return null;
        }

        try {
            console.log('🔍 SBOM Processor: Starting GitHub Actions analysis...');
            
            const analyzer = new window.GitHubActionsAnalyzer(githubClient, authorService);
            const allResults = {
                repositories: [],
                totalActions: 0,
                uniqueActions: 0,
                allFindings: [],
                findingsByType: new Map()
            };

            // Analyze each repository
            for (const [repoKey, repoData] of this.repositories) {
                const [owner, repo] = repoKey.split('/');
                
                if (onProgress) {
                    onProgress({ 
                        phase: 'github-actions-analysis',
                        message: `Analyzing GitHub Actions for ${repoKey}...`,
                        repository: repoKey
                    });
                }

                try {
                    const result = await analyzer.analyzeRepository(owner, repo, 'HEAD', onProgress);
                    
                    if (result && result.findings) {
                        allResults.repositories.push({
                            repository: repoKey,
                            ...result
                        });
                        allResults.totalActions += result.totalActions || 0;
                        allResults.uniqueActions += result.uniqueActions || 0;
                        allResults.allFindings.push(...result.findings);
                        
                        // Aggregate findings by type
                        if (result.findingsByType) {
                            Object.entries(result.findingsByType).forEach(([ruleId, count]) => {
                                const current = allResults.findingsByType.get(ruleId) || 0;
                                allResults.findingsByType.set(ruleId, current + count);
                            });
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to analyze GitHub Actions for ${repoKey}:`, error);
                }
            }

            // Convert Map to object for storage
            const findingsByTypeObj = Object.fromEntries(allResults.findingsByType);

            this.githubActionsAnalysis = {
                totalActions: allResults.totalActions,
                uniqueActions: allResults.uniqueActions,
                repositories: allResults.repositories,
                findings: allResults.allFindings,
                findingsByType: findingsByTypeObj,
                timestamp: new Date().toISOString()
            };

            console.log(`✅ SBOM Processor: GitHub Actions analysis complete: ${allResults.allFindings.length} findings`);
            return this.githubActionsAnalysis;
        } catch (error) {
            console.error('❌ SBOM Processor: GitHub Actions analysis failed:', error);
            return null;
        }
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
        this.githubActionsAnalysis = null;
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
            allDependencies = Array.from(this.dependencies.values()).map(dep => {
                // Extract PURL from originalPackage if available
                let purl = null;
                if (dep.originalPackage && dep.originalPackage.externalRefs) {
                    const purlRef = dep.originalPackage.externalRefs.find(ref => ref.referenceType === 'purl');
                    if (purlRef && purlRef.referenceLocator) {
                        purl = purlRef.referenceLocator;
                    }
                }
                
                return {
                    name: dep.name,
                    version: dep.displayVersion || dep.version,  // Use displayVersion (may be assumed)
                    assumedVersion: dep.assumedVersion || null,  // Latest version if assumed
                    count: dep.count,
                    repositories: Array.from(dep.repositories),
                    category: dep.category,
                    languages: Array.from(dep.languages),
                    purl: purl  // Include extracted PURL for author analysis
                };
            });
        }

        if (this.repositories.size <= 500) {
            // For smaller datasets, export everything
            allRepositories = Array.from(this.repositories.values()).map(repo => ({
                name: repo.name,
                owner: repo.owner,
                license: repo.license || null,  // Include repository license
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
        
        // Clear processed repository data that's already saved (keep only essential info)
        // This reduces memory usage for large organizations
        if (this.repositories.size > 50) {
            // For large datasets, clear detailed relationship data after processing
            this.repositories.forEach((repoData, repoKey) => {
                // Keep essential data but clear large arrays/objects
                if (repoData.relationships && repoData.relationships.length > 100) {
                    // Keep only direct relationships, clear transitive ones
                    repoData.relationships = repoData.relationships.filter(rel => rel.isDirectFromMain);
                }
                // Clear SPDX packages if we have too many (keep only essential mapping)
                if (repoData.spdxPackages && repoData.spdxPackages.length > 200) {
                    repoData.spdxPackages = repoData.spdxPackages.slice(0, 200);
                }
            });
        }
        
        // Clear intermediate dependency data structures if they're too large
        if (this.dependencies.size > 1000) {
            // For very large dependency sets, clear originalPackage data (already processed)
            let clearedCount = 0;
            this.dependencies.forEach((dep, depKey) => {
                if (dep.originalPackage && clearedCount < this.dependencies.size * 0.5) {
                    // Keep essential PURL info but clear full package object
                    if (dep.originalPackage.externalRefs) {
                        const purlRef = dep.originalPackage.externalRefs.find(ref => ref.referenceType === 'purl');
                        dep.purl = purlRef ? purlRef.referenceLocator : null;
                    }
                    delete dep.originalPackage;
                    clearedCount++;
                }
            });
        }
        
        console.log('🧹 Memory cleared after incremental save');
    }
}

// Export for use in other modules
window.SBOMProcessor = SBOMProcessor; 