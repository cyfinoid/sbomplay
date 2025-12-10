/**
 * GitHub Actions Analyzer - Analyzes GitHub Actions workflows and dependencies
 * Ports functionality from ghactions-auditor project
 */

class GitHubActionsAnalyzer {
    constructor(githubClient, authorService) {
        this.githubClient = githubClient;
        this.authorService = authorService;
        this.maxDepth = 3;
        this.analysisCache = new Map();
        this.actionMetadataCache = new Map();
    }

    /**
     * Analyze GitHub Actions for a repository
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {string} ref - Git reference (default: HEAD)
     * @param {Function} onProgress - Optional progress callback
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeRepository(owner, repo, ref = 'HEAD', onProgress = null) {
        const repoKey = `${owner}/${repo}`;
        console.log(`🔍 Starting GitHub Actions analysis for ${repoKey}...`);

        try {
            // Step 1: Scan workflow files
            if (onProgress) {
                onProgress({ phase: 'scanning-workflows', message: `Scanning workflow files for ${repoKey}...` });
            }
            const workflowScans = await this.scanWorkflows(owner, repo, ref);
            
            if (workflowScans.length === 0) {
                console.log(`ℹ️  No workflow files found for ${repoKey}`);
                return {
                    repository: repoKey,
                    ref,
                    totalActions: 0,
                    uniqueActions: 0,
                    actions: [],
                    findings: [],
                    findingsByType: new Map(),
                    workflows: []
                };
            }

            // Step 2: Extract unique actions
            const uniqueActions = this.extractUniqueActions(workflowScans);
            console.log(`📦 Found ${uniqueActions.length} unique actions in workflows`);

            if (onProgress) {
                onProgress({ phase: 'analyzing-actions', message: `Analyzing ${uniqueActions.length} action(s)...`, total: uniqueActions.length });
            }

            // Step 3: Analyze each action recursively
            const actionResults = [];
            const allFindings = [];
            const findingsByType = new Map();

            for (let i = 0; i < uniqueActions.length; i++) {
                const action = uniqueActions[i];
                if (onProgress) {
                    onProgress({ 
                        phase: 'analyzing-actions', 
                        message: `Analyzing ${action.owner}/${action.repo}@${action.ref} (${i + 1}/${uniqueActions.length})...`,
                        processed: i + 1,
                        total: uniqueActions.length
                    });
                }

                try {
                    const result = await this.analyzeAction(
                        action.owner,
                        action.repo,
                        action.ref,
                        action.path || '',
                        0,
                        null,
                        action.locations || [] // Pass workflow locations for context
                    );

                    // Extract license and authors
                    const enrichedResult = await this.enrichActionMetadata(result);
                    
                    // Enrich findings with workflow location information
                    if (enrichedResult.findings && action.locations && action.locations.length > 0) {
                        enrichedResult.findings.forEach(finding => {
                            // Add workflow context to findings
                            if (!finding.workflowLocations) {
                                finding.workflowLocations = action.locations.map(loc => ({
                                    workflow: loc.workflow,
                                    line: loc.line,
                                    repository: repoKey // The repository where the workflow is located
                                }));
                            }
                            // Store action repository info for Docker findings
                            if (!finding.actionRepository) {
                                finding.actionRepository = `${action.owner}/${action.repo}`;
                            }
                        });
                    }
                    
                    // Also enrich nested actions recursively (only if they have owner/repo)
                    if (enrichedResult.nested && enrichedResult.nested.length > 0) {
                        enrichedResult.nested = await Promise.all(
                            enrichedResult.nested.map(async (nested) => {
                                // Only enrich if it's an actual action with owner/repo
                                if (nested.owner && nested.repo) {
                                    return await this.enrichActionMetadata(nested);
                                }
                                return nested; // Return as-is for Docker images, etc.
                            })
                        );
                    }

                    actionResults.push(enrichedResult);
                    allFindings.push(...enrichedResult.findings);

                    // Count findings by type
                    enrichedResult.findings.forEach(finding => {
                        const count = findingsByType.get(finding.rule_id) || 0;
                        findingsByType.set(finding.rule_id, count + 1);
                    });
                } catch (error) {
                    console.warn(`Failed to analyze action ${action.owner}/${action.repo}@${action.ref}:`, error);
                }
            }

            // Step 4: Check workflow-level unpinned references
            const workflowFindings = [];
            for (const scan of workflowScans) {
                for (const use of scan.uses || []) {
                    if (use.type === 'remote' && !use.isPinned) {
                        const workflowFinding = this.checkWorkflowLevel(use.owner, use.repo, use.ref, use.path || '');
                        workflowFindings.push(...workflowFinding.map(f => ({
                            ...f,
                            file: use.workflow,
                            line: use.line
                        })));
                    }
                }
            }
            allFindings.push(...workflowFindings);

            // Count workflow findings
            workflowFindings.forEach(finding => {
                const count = findingsByType.get(finding.rule_id) || 0;
                findingsByType.set(finding.rule_id, count + 1);
            });

            const result = {
                repository: repoKey,
                ref,
                totalActions: uniqueActions.length,
                uniqueActions: uniqueActions.length,
                actions: actionResults,
                findings: allFindings,
                findingsByType: Object.fromEntries(findingsByType),
                workflows: workflowScans.map(scan => ({
                    path: scan.workflow,
                    uses: scan.uses || []
                })),
                // Summary stats for easy access
                summary: {
                    totalActions: uniqueActions.length,
                    totalFindings: allFindings.length,
                    findingsBySeverity: {
                        high: allFindings.filter(f => f.severity === 'high' || f.severity === 'error').length,
                        medium: allFindings.filter(f => f.severity === 'medium').length,
                        warning: allFindings.filter(f => f.severity === 'warning').length
                    },
                    actionsWithLicenses: actionResults.filter(a => a.license).length,
                    actionsWithAuthors: actionResults.filter(a => a.authors && a.authors.length > 0).length
                }
            };

            console.log(`✅ GitHub Actions analysis complete for ${repoKey}:`);
            console.log(`   - ${uniqueActions.length} unique actions analyzed`);
            console.log(`   - ${allFindings.length} findings detected`);
            console.log(`   - ${result.summary.actionsWithLicenses} actions with licenses`);
            console.log(`   - ${result.summary.actionsWithAuthors} actions with authors`);
            return result;

        } catch (error) {
            console.error(`❌ Failed to analyze GitHub Actions for ${repoKey}:`, error);
            return {
                repository: repoKey,
                ref,
                totalActions: 0,
                uniqueActions: 0,
                actions: [],
                findings: [],
                findingsByType: {},
                workflows: [],
                error: error.message
            };
        }
    }

    /**
     * Scan workflow files from repository
     */
    async scanWorkflows(owner, repo, ref = 'HEAD') {
        try {
            // Get workflow files from .github/workflows directory
            const workflowFiles = await this.getWorkflowFiles(owner, repo, ref);
            const results = [];

            for (const file of workflowFiles) {
                try {
                    const content = await this.githubClient.getFileContent(owner, repo, file.path, ref);
                    if (content) {
                        const scanned = await this.scanWorkflow(`${owner}/${repo}`, file.path, content);
                        results.push(scanned);
                    }
                } catch (error) {
                    console.warn(`Failed to scan workflow ${file.path}:`, error);
                }
            }

            return results;
        } catch (error) {
            if (error.status === 404) {
                // No workflows directory
                return [];
            }
            throw error;
        }
    }

    /**
     * Get workflow files from repository
     */
    async getWorkflowFiles(owner, repo, ref = 'HEAD') {
        try {
            // Use GitHub API to get contents of .github/workflows directory
            const url = `${this.githubClient.baseUrl}/repos/${owner}/${repo}/contents/.github/workflows?ref=${ref}`;
            const response = await this.githubClient.makeRequest(url);

            if (!response.ok) {
                if (response.status === 404) {
                    return [];
                }
                throw new Error(`Failed to fetch workflow files: ${response.status}`);
            }

            const files = await response.json();
            if (!Array.isArray(files)) {
                return [];
            }

            return files
                .filter(file => file.type === 'file' && (file.name.endsWith('.yml') || file.name.endsWith('.yaml')))
                .map(file => ({
                    name: file.name,
                    path: file.path,
                    sha: file.sha
                }));
        } catch (error) {
            console.warn(`Failed to get workflow files:`, error);
            return [];
        }
    }

    /**
     * Scan a single workflow file
     * Enhanced to capture reusable workflows and their dependencies
     */
    async scanWorkflow(repository, workflowPath, content) {
        try {
            const parsed = this.parseYAML(content);
            const uses = this.extractUsesReferences(parsed, workflowPath);

            const classified = uses.map(use => {
                const classified = this.classifyAction(use.uses);
                return {
                    ...use,
                    ...classified,
                    workflow: workflowPath,
                    repository,
                    // Preserve type (action vs reusable-workflow)
                    dependencyType: use.type || 'action'
                };
            });

            // Extract reusable workflows for dependency graph
            const reusableWorkflows = [];
            if (parsed.jobs && typeof parsed.jobs === 'object') {
                for (const [jobId, job] of Object.entries(parsed.jobs)) {
                    if (job.uses) {
                        const classified = this.classifyAction(job.uses);
                        reusableWorkflows.push({
                            jobId,
                            uses: job.uses,
                            ...classified,
                            workflow: workflowPath,
                            repository
                        });
                    }
                }
            }

            return {
                repository,
                workflow: workflowPath,
                parsed,
                uses: classified,
                reusableWorkflows: reusableWorkflows
            };
        } catch (error) {
            console.warn(`Failed to scan workflow ${workflowPath}:`, error);
            return {
                repository,
                workflow: workflowPath,
                parsed: null,
                uses: [],
                reusableWorkflows: [],
                error: error.message
            };
        }
    }

    /**
     * Extract unique actions from workflow scans
     * Enhanced to include reusable workflows in dependency graph
     */
    extractUniqueActions(workflowScans) {
        const uniqueActions = new Map();

        for (const scan of workflowScans) {
            // Extract regular actions
            for (const use of scan.uses || []) {
                if (use.type === 'remote') {
                    const key = `${use.owner}/${use.repo}${use.path ? '/' + use.path : ''}@${use.ref}`;
                    if (!uniqueActions.has(key)) {
                        uniqueActions.set(key, {
                            owner: use.owner,
                            repo: use.repo,
                            path: use.path || '',
                            ref: use.ref,
                            uses: use.uses,
                            locations: [],
                            dependencyType: use.dependencyType || 'action'
                        });
                    }
                    uniqueActions.get(key).locations.push({
                        workflow: use.workflow,
                        line: use.line,
                        type: use.dependencyType || 'action'
                    });
                }
            }
            
            // Extract reusable workflows
            for (const reusable of scan.reusableWorkflows || []) {
                if (reusable.type === 'remote') {
                    const key = `${reusable.owner}/${reusable.repo}${reusable.path ? '/' + reusable.path : ''}@${reusable.ref}`;
                    if (!uniqueActions.has(key)) {
                        uniqueActions.set(key, {
                            owner: reusable.owner,
                            repo: reusable.repo,
                            path: reusable.path || '',
                            ref: reusable.ref,
                            uses: reusable.uses,
                            locations: [],
                            dependencyType: 'reusable-workflow'
                        });
                    }
                    uniqueActions.get(key).locations.push({
                        workflow: reusable.workflow,
                        jobId: reusable.jobId,
                        type: 'reusable-workflow'
                    });
                }
            }
        }

        return Array.from(uniqueActions.values());
    }

    /**
     * Analyze a single action recursively
     */
    async analyzeAction(owner, repo, ref, path = '', depth = 0, parentAction = null, workflowLocations = []) {
        // Check depth limit
        if (depth > this.maxDepth) {
            return {
                action: `${owner}/${repo}${path ? '/' + path : ''}@${ref}`,
                owner,
                repo,
                ref,
                path,
                findings: [],
                nested: [],
                error: 'MAX_DEPTH_EXCEEDED'
            };
        }

        // Check cache
        const cacheKey = `${owner}/${repo}${path ? '/' + path : ''}@${ref}`;
        if (this.analysisCache.has(cacheKey)) {
            return this.analysisCache.get(cacheKey);
        }

        const findings = [];
        const nestedActions = [];

        try {
            // Resolve action metadata
            const metadata = await this.resolveActionMetadata(owner, repo, ref, path);

            if (!metadata || !metadata.available) {
                findings.push({
                    rule_id: 'ACTION_METADATA_UNAVAILABLE',
                    severity: 'warning',
                    message: `Could not fetch action metadata for ${cacheKey}`,
                    action: cacheKey,
                    details: metadata?.error || 'Action metadata not available'
                });
            } else {
                // Check workflow-level unpinned references
                const workflowFindings = this.checkWorkflowLevel(owner, repo, ref, path);
                findings.push(...workflowFindings);

                // Check based on action type
                const actionType = metadata.actionType || 'unknown';

                if (actionType === 'docker') {
                    const dockerFindings = await this.checkDockerAction(owner, repo, ref, path, metadata, workflowLocations);
                    findings.push(...dockerFindings);
                } else if (actionType === 'composite') {
                    const compositeFindings = await this.checkCompositeAction(owner, repo, ref, path, metadata);
                    findings.push(...compositeFindings);

                    // Extract nested actions for recursive analysis
                    const steps = this.getCompositeSteps(metadata);
                    for (const step of steps) {
                        if (step.uses) {
                            const classified = this.classifyAction(step.uses);
                            if (classified.type === 'remote') {
                                nestedActions.push({
                                    owner: classified.owner,
                                    repo: classified.repo,
                                    ref: classified.ref,
                                    path: classified.path || '',
                                    parent: cacheKey,
                                    type: 'action'
                                });
                            }
                        }
                    }
                } else if (actionType === 'javascript') {
                    const jsFindings = await this.checkJavaScriptAction(owner, repo, ref, path, metadata);
                    findings.push(...jsFindings);
                }

                // Apply general heuristics
                const heuristicFindings = this.applyHeuristics(metadata, owner, repo, ref, path);
                findings.push(...heuristicFindings);
            }

            // Recursively analyze nested actions
            const nestedResults = [];
            for (const nested of nestedActions) {
                try {
                    const nestedResult = await this.analyzeAction(
                        nested.owner,
                        nested.repo,
                        nested.ref,
                        nested.path,
                        depth + 1,
                        cacheKey,
                        [] // Nested actions don't have workflow locations
                    );
                    nestedResults.push(nestedResult);

                    // If nested action has unpinnable issues, mark parent as indirectly unpinnable
                    if (nestedResult.findings && nestedResult.findings.length > 0) {
                        findings.push({
                            rule_id: 'INDIRECT_UNPINNABLE_ACTION',
                            severity: 'high',
                            message: `Action uses nested action with unpinnable issues: ${nestedResult.action}`,
                            action: cacheKey,
                            nestedAction: nestedResult.action,
                            details: `Nested action '${nestedResult.action}' has ${nestedResult.findings.length} unpinnable finding(s).`
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to analyze nested action ${nested.owner}/${nested.repo}@${nested.ref}:`, error);
                }
            }

            // Build complete dependency graph information
            const dependencyGraph = {
                // Direct dependencies (actions used by this action)
                directDependencies: nestedActions.map(n => ({
                    action: `${n.owner}/${n.repo}${n.path ? '/' + n.path : ''}@${n.ref}`,
                    owner: n.owner,
                    repo: n.repo,
                    ref: n.ref,
                    path: n.path || '',
                    type: n.type || 'action'
                })),
                // Transitive dependencies (all nested actions recursively)
                transitiveDependencies: [],
                // Lineage (path from root to this action)
                lineage: parentAction ? this.buildLineage(parentAction) : [cacheKey],
                // All ancestors (all parent actions up to root)
                ancestors: parentAction ? this.buildAncestors(parentAction) : [],
                // All descendants (all nested actions recursively)
                descendants: []
            };
            
            // Build transitive dependencies and descendants from nested results
            nestedResults.forEach(nested => {
                dependencyGraph.transitiveDependencies.push({
                    action: nested.action,
                    owner: nested.owner,
                    repo: nested.repo,
                    ref: nested.ref,
                    path: nested.path || '',
                    depth: nested.depth || depth + 1
                });
                
                // Add nested's descendants to this action's descendants
                if (nested.dependencyGraph && nested.dependencyGraph.descendants) {
                    dependencyGraph.descendants.push(...nested.dependencyGraph.descendants);
                }
                dependencyGraph.descendants.push(nested.action);
            });

            const result = {
                action: cacheKey,
                owner,
                repo,
                ref,
                path,
                findings,
                nested: nestedResults,
                depth,
                parentAction,
                dependencyGraph: dependencyGraph
            };

            // Cache result
            this.analysisCache.set(cacheKey, result);
            return result;

        } catch (error) {
            console.error(`Failed to analyze action ${cacheKey}:`, error);
            return {
                action: cacheKey,
                owner,
                repo,
                ref,
                path,
                findings: [{
                    rule_id: 'ANALYSIS_ERROR',
                    severity: 'error',
                    message: `Failed to analyze action: ${error.message}`,
                    action: cacheKey
                }],
                nested: [],
                depth,
                parentAction,
                dependencyGraph: {
                    directDependencies: [],
                    transitiveDependencies: [],
                    lineage: parentAction ? this.buildLineage(parentAction) : [cacheKey],
                    ancestors: parentAction ? this.buildAncestors(parentAction) : [],
                    descendants: []
                },
                error: error.message
            };
        }
    }

    /**
     * Detect license from LICENSE file content
     * @param {string} content - LICENSE file content
     * @returns {string|null} - Detected license SPDX ID or null
     */
    detectLicenseFromContent(content) {
        if (!content) return null;
        
        const contentUpper = content.toUpperCase();
        
        // Common license patterns
        const licensePatterns = [
            { pattern: /MIT\s+LICENSE|THE\s+MIT\s+LICENSE/i, spdx: 'MIT' },
            { pattern: /APACHE\s+LICENSE|APACHE\s+2\.0/i, spdx: 'Apache-2.0' },
            { pattern: /GNU\s+GENERAL\s+PUBLIC\s+LICENSE\s+VERSION\s+3|GPL-3|GPL\s+3\.0/i, spdx: 'GPL-3.0' },
            { pattern: /GNU\s+GENERAL\s+PUBLIC\s+LICENSE\s+VERSION\s+2|GPL-2|GPL\s+2\.0/i, spdx: 'GPL-2.0' },
            { pattern: /BSD\s+3-CLAUSE|BSD-3/i, spdx: 'BSD-3-Clause' },
            { pattern: /BSD\s+2-CLAUSE|BSD-2/i, spdx: 'BSD-2-Clause' },
            { pattern: /ISC\s+LICENSE/i, spdx: 'ISC' },
            { pattern: /MOZILLA\s+PUBLIC\s+LICENSE|MPL/i, spdx: 'MPL-2.0' }
        ];
        
        for (const { pattern, spdx } of licensePatterns) {
            if (pattern.test(contentUpper)) {
                return spdx;
            }
        }
        
        return null;
    }

    /**
     * Build lineage path from root to current action
     * @param {string} parentAction - Parent action key
     * @returns {Array<string>} - Array of action keys from root to parent
     */
    buildLineage(parentAction) {
        const lineage = [];
        let current = parentAction;
        
        // Traverse up the parent chain
        while (current) {
            lineage.unshift(current);
            const cached = this.analysisCache.get(current);
            if (cached && cached.parentAction) {
                current = cached.parentAction;
            } else {
                break;
            }
        }
        
        return lineage;
    }
    
    /**
     * Build ancestors list (all parent actions up to root)
     * @param {string} parentAction - Parent action key
     * @returns {Array<string>} - Array of ancestor action keys
     */
    buildAncestors(parentAction) {
        const ancestors = [];
        let current = parentAction;
        
        while (current) {
            ancestors.push(current);
            const cached = this.analysisCache.get(current);
            if (cached && cached.parentAction) {
                current = cached.parentAction;
            } else {
                break;
            }
        }
        
        return ancestors;
    }

    /**
     * Enrich action metadata with license and authors
     */
    async enrichActionMetadata(actionResult) {
        const { owner, repo, ref } = actionResult;

        if (!owner || !repo) {
            return actionResult;
        }

        try {
            // Fetch repository info for license (default branch)
            let repoInfo = await this.githubClient.getRepository(owner, repo);
            let license = repoInfo?.license?.spdx_id || repoInfo?.license?.key || null;
            
            // Check if ref is a commit SHA (40 hex characters) or short SHA (7+ hex characters)
            const isCommitSha = ref && /^[a-f0-9]{7,40}$/i.test(ref);
            
            // If ref is a commit SHA, try to get LICENSE file directly at that commit
            if (isCommitSha && !license) {
                try {
                    const licenseContent = await this.githubClient.getFileContent(owner, repo, 'LICENSE', ref);
                    if (licenseContent) {
                        const detectedLicense = this.detectLicenseFromContent(licenseContent);
                        if (detectedLicense) {
                            license = detectedLicense;
                            console.log(`   ✅ Detected license from LICENSE file at commit ${ref.substring(0, 7)} for ${owner}/${repo}: ${license}`);
                        }
                    }
                } catch (error) {
                    // If LICENSE file not found at commit, continue to try other methods
                    console.debug(`Could not fetch LICENSE file at commit ${ref.substring(0, 7)} for ${owner}/${repo}: ${error.message}`);
                }
            }
            
            // Parse ref to extract tag version (e.g., v1.2.3, 1.2.3, v2, etc.)
            // Only do this if ref is not a commit SHA
            let tagRef = null;
            if (!isCommitSha && ref) {
                if (ref.startsWith('v') || /^\d+\./.test(ref)) {
                    // This looks like a version tag
                    tagRef = ref;
                } else if (ref !== 'main' && ref !== 'master' && ref !== 'HEAD') {
                    // Try to use ref as-is (might be a tag or branch)
                    tagRef = ref;
                }
            }
            
            // If we have a tag/version ref, try to get repository info at that specific tag
            // GitHub API allows fetching repository info at a specific ref using tags API
            if (tagRef && !license) {
                try {
                    // Try to get tag information first
                    const tagInfo = await this.githubClient.getTag(owner, repo, tagRef);
                    if (tagInfo && tagInfo.commit) {
                        // Fetch repository at specific commit SHA
                        const commitSha = tagInfo.commit.sha;
                        // Try to get LICENSE file at this commit
                        const licenseContent = await this.githubClient.getFileContent(owner, repo, 'LICENSE', commitSha);
                        if (licenseContent) {
                            // Try to detect license from LICENSE file content
                            const detectedLicense = this.detectLicenseFromContent(licenseContent);
                            if (detectedLicense) {
                                license = detectedLicense;
                                console.log(`   ✅ Detected license from LICENSE file at ${tagRef} for ${owner}/${repo}: ${license}`);
                            }
                        }
                    }
                } catch (error) {
                    // If tag doesn't exist or LICENSE file not found, fall back to default branch license
                    console.debug(`Could not fetch LICENSE file at ${tagRef} for ${owner}/${repo}: ${error.message}`);
                }
            }
            
            // If still no license, try fetching LICENSE file from default branch
            if (!license) {
                try {
                    const licenseContent = await this.githubClient.getFileContent(owner, repo, 'LICENSE');
                    if (licenseContent) {
                        const detectedLicense = this.detectLicenseFromContent(licenseContent);
                        if (detectedLicense) {
                            license = detectedLicense;
                            console.log(`   ✅ Detected license from LICENSE file for ${owner}/${repo}: ${license}`);
                        }
                    }
                } catch (error) {
                    console.debug(`Could not fetch LICENSE file for ${owner}/${repo}: ${error.message}`);
                }
            }

            // Fetch authors - for GitHub repos, extract from repo info
            let authors = [];
            try {
                // For GitHub Actions repositories, extract authors from repo info
                if (repoInfo) {
                    // Add owner as author
                    if (repoInfo.owner) {
                        authors.push({
                            name: repoInfo.owner.login || repoInfo.owner.name || owner,
                            email: null,
                            metadata: {
                                github: repoInfo.owner.login || owner,
                                type: repoInfo.owner.type || 'User',
                                url: repoInfo.owner.html_url || `https://github.com/${owner}`
                            },
                            isMaintainer: true
                        });
                    }
                    
                    // Try to get contributors if available (optional, might be rate-limited)
                    // For now, we'll just use the owner
                }
            } catch (error) {
                console.warn(`Failed to fetch authors for ${owner}/${repo}:`, error);
            }

            return {
                ...actionResult,
                license: license || null,
                authors: authors.length > 0 ? authors : []
            };
        } catch (error) {
            console.warn(`Failed to enrich metadata for ${owner}/${repo}:`, error);
            return {
                ...actionResult,
                license: null,
                authors: []
            };
        }
    }

    /**
     * Resolve action metadata (action.yml)
     */
    async resolveActionMetadata(owner, repo, ref, path = '') {
        // Check cache first
        const cacheKey = `${owner}/${repo}${path ? '/' + path : ''}@${ref}`;
        if (this.actionMetadataCache.has(cacheKey)) {
            return this.actionMetadataCache.get(cacheKey);
        }

        try {
            // Resolve ref to SHA if needed
            let sha = ref;
            if (!this.isPinned(ref)) {
                sha = await this.resolveRef(owner, repo, ref);
            }

            // Fetch action metadata
            let metadata = await this.getActionMetadata(owner, repo, sha, path);

            if (!metadata) {
                // Try to get Dockerfile for Docker actions
                const dockerfile = await this.githubClient.getFileContent(owner, repo, path ? `${path}/Dockerfile` : 'Dockerfile', sha);
                if (dockerfile) {
                    metadata = {
                        runs: {
                            using: 'docker',
                            image: dockerfile
                        },
                        _dockerfile: dockerfile
                    };
                } else {
                    const result = {
                        available: false,
                        error: 'ACTION_METADATA_UNAVAILABLE'
                    };
                    this.actionMetadataCache.set(cacheKey, result);
                    return result;
                }
            }

            // Parse and enrich metadata
            if (metadata) {
                const actionType = this.getActionType(metadata);

                // For Docker actions, try to fetch Dockerfile if not already present
                if (actionType === 'docker' && !metadata._dockerfile) {
                    try {
                        const dockerfile = await this.githubClient.getFileContent(owner, repo, path ? `${path}/Dockerfile` : 'Dockerfile', sha);
                        if (dockerfile) {
                            metadata._dockerfile = dockerfile;
                        }
                    } catch (error) {
                        // Dockerfile not found, continue without it
                    }
                }

                const enriched = {
                    ...metadata,
                    available: true,
                    actionType,
                    owner,
                    repo,
                    ref: sha,
                    path,
                    resolved: true
                };

                // Store in cache
                this.actionMetadataCache.set(cacheKey, enriched);
                return enriched;
            }

            const result = {
                available: false,
                error: 'ACTION_METADATA_UNAVAILABLE'
            };
            this.actionMetadataCache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.warn(`Failed to resolve action ${owner}/${repo}@${ref}:`, error);
            const result = {
                available: false,
                error: 'ACTION_METADATA_UNAVAILABLE',
                message: error.message
            };
            this.actionMetadataCache.set(cacheKey, result);
            return result;
        }
    }

    /**
     * Get action metadata (action.yml or action.yaml)
     */
    async getActionMetadata(owner, repo, ref, path = '') {
        const actionPath = path ? `${path}/action.yml` : 'action.yml';
        let content = await this.githubClient.getFileContent(owner, repo, actionPath, ref);
        let actualPath = actionPath;

        if (!content) {
            const altPath = path ? `${path}/action.yaml` : 'action.yaml';
            content = await this.githubClient.getFileContent(owner, repo, altPath, ref);
            if (content) {
                actualPath = altPath;
            }
        }

        if (!content) {
            return null;
        }

        try {
            const parsed = this.parseYAML(content);
            if (parsed && typeof parsed === 'object') {
                parsed._actionFilePath = actualPath;
            }
            return parsed;
        } catch (error) {
            console.warn('Failed to parse action.yml:', error);
            return null;
        }
    }

    /**
     * Resolve ref to commit SHA
     */
    async resolveRef(owner, repo, ref) {
        // If already a SHA (40 chars), return it
        if (/^[a-f0-9]{40}$/i.test(ref)) {
            return ref;
        }

        // Try branch first
        try {
            const url = `${this.githubClient.baseUrl}/repos/${owner}/${repo}/git/ref/heads/${ref}`;
            const response = await this.githubClient.makeRequest(url);
            if (response.ok) {
                const data = await response.json();
                return data.object.sha;
            }
        } catch (error) {
            // Branch doesn't exist or request failed, continue to try tag
        }

        // Try tag (most common for GitHub Actions like v2, v3, etc.)
            try {
                const tagUrl = `${this.githubClient.baseUrl}/repos/${owner}/${repo}/git/ref/tags/${ref}`;
                const tagResponse = await this.githubClient.makeRequest(tagUrl);
                if (tagResponse.ok) {
                    const tagData = await tagResponse.json();
                // Handle both direct commit refs and annotated tag refs
                if (tagData.object.type === 'commit') {
                    return tagData.object.sha;
                } else if (tagData.object.type === 'tag') {
                    // For annotated tags, need to fetch the tag object to get the commit SHA
                    const tagObjectUrl = `${this.githubClient.baseUrl}/repos/${owner}/${repo}/git/tags/${tagData.object.sha}`;
                    const tagObjectResponse = await this.githubClient.makeRequest(tagObjectUrl);
                    if (tagObjectResponse.ok) {
                        const tagObject = await tagObjectResponse.json();
                        return tagObject.object.sha;
                    }
                }
                }
            } catch (tagError) {
            // Tag doesn't exist or request failed, continue to try commit
        }

        // Try commit SHA directly (in case ref is a partial SHA or commit)
                try {
                    const commitUrl = `${this.githubClient.baseUrl}/repos/${owner}/${repo}/commits/${ref}`;
                    const commitResponse = await this.githubClient.makeRequest(commitUrl);
                    if (commitResponse.ok) {
                        const commitData = await commitResponse.json();
                        return commitData.sha;
                    }
                } catch (commitError) {
            // Commit doesn't exist or request failed
        }

        // If all methods failed, throw error with more context
        throw new Error(`Could not resolve ref: ${ref} for ${owner}/${repo} (tried branch, tag, and commit)`);
    }

    // ========== YAML Parsing Methods ==========

    /**
     * Parse YAML content
     */
    parseYAML(content) {
        if (!content || typeof content !== 'string') {
            throw new Error('Invalid content: must be a non-empty string');
        }

        // Check if js-yaml is available
        if (typeof jsyaml === 'undefined') {
            // Try to use global jsyaml or jsYaml
            const yamlLib = window.jsyaml || window.jsYaml;
            if (!yamlLib) {
                throw new Error('js-yaml library not loaded. Please include: <script src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js"></script>');
            }
            return yamlLib.load(content, { strict: false });
        }

        try {
            let cleaned = content;
            
            // Remove BOM if present
            if (cleaned.length > 0 && cleaned.charCodeAt(0) === 0xFEFF) {
                cleaned = cleaned.slice(1);
            }
            
            // Normalize line endings
            cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            
            return jsyaml.load(cleaned, { strict: false });
        } catch (error) {
            throw new Error(`Failed to parse YAML: ${error.message}`);
        }
    }

    /**
     * Extract all uses references from a workflow or action
     * Enhanced to capture reusable workflows and complete dependency graph
     */
    extractUsesReferences(parsed, path = '') {
        const uses = [];
        
        if (!parsed || typeof parsed !== 'object') {
            return uses;
        }

        // Extract reusable workflows (workflow_call)
        if (parsed.jobs && typeof parsed.jobs === 'object') {
            for (const [jobId, job] of Object.entries(parsed.jobs)) {
                // Check for reusable workflow calls
                if (job.uses) {
                    uses.push({
                        uses: job.uses,
                        location: `${path}.jobs.${jobId}`,
                        line: job._line || null,
                        type: 'reusable-workflow'
                    });
                }
                
                // Extract from job steps
                if (job.steps && Array.isArray(job.steps)) {
                    for (const step of job.steps) {
                        if (step.uses) {
                            uses.push({
                                uses: step.uses,
                                location: `${path}.jobs.${jobId}.steps`,
                                line: step._line || null,
                                type: 'action'
                            });
                        }
                    }
                }
            }
        }

        // Extract from steps (for composite actions)
        if (parsed.runs && parsed.runs.steps && Array.isArray(parsed.runs.steps)) {
            for (const step of parsed.runs.steps) {
                if (step.uses) {
                    uses.push({
                        uses: step.uses,
                        location: `${path}.runs.steps`,
                        line: step._line || null,
                        type: 'action'
                    });
                }
            }
        }

        return uses;
    }

    /**
     * Get action type from parsed action.yml
     */
    getActionType(parsed) {
        if (!parsed || !parsed.runs) {
            return null;
        }

        const using = parsed.runs.using;
        
        if (!using) {
            return null;
        }

        // Docker action
        if (using === 'docker' || using.startsWith('docker://')) {
            return 'docker';
        }

        // Composite action
        if (using === 'composite') {
            return 'composite';
        }

        // JavaScript action (node12, node16, node20, etc.)
        if (using.startsWith('node')) {
            return 'javascript';
        }

        return 'unknown';
    }

    /**
     * Get steps for composite action
     */
    getCompositeSteps(parsed) {
        if (!parsed || !parsed.runs || !parsed.runs.steps) {
            return [];
        }

        return parsed.runs.steps || [];
    }

    /**
     * Get Docker image from action
     */
    getDockerImage(parsed) {
        if (!parsed || !parsed.runs) {
            return null;
        }

        const using = parsed.runs.image || parsed.runs.using;
        
        if (typeof using === 'string' && using.startsWith('docker://')) {
            return using.replace('docker://', '');
        }

        return using || null;
    }

    // ========== Action Classification Methods ==========

    /**
     * Classify action reference
     */
    classifyAction(uses) {
        if (!uses || typeof uses !== 'string') {
            return {
                type: 'unknown',
                owner: null,
                repo: null,
                ref: null,
                path: null,
                isLocal: false,
                isDocker: false
            };
        }

        // Docker action
        if (uses.startsWith('docker://')) {
            const image = uses.replace('docker://', '');
            return {
                type: 'docker',
                uses,
                image,
                isDocker: true,
                isLocal: false
            };
        }

        // Local action
        if (uses.startsWith('./') || uses.startsWith('../')) {
            return {
                type: 'local',
                uses,
                path: uses,
                isLocal: true,
                isDocker: false
            };
        }

        // Remote action: owner/repo@ref or owner/repo/path@ref
        const match = uses.match(/^([^/@]+)\/([^/@]+)(?:\/(.+))?@(.+)$/);
        
        if (match) {
            const [, owner, repo, path, ref] = match;
            return {
                type: 'remote',
                uses,
                owner,
                repo,
                path: path || '',
                ref,
                isLocal: false,
                isDocker: false,
                isPinned: this.isPinned(ref)
            };
        }

        // Invalid format
        return {
            type: 'invalid',
            uses,
            isLocal: false,
            isDocker: false
        };
    }

    /**
     * Check if action reference is pinned (40-char SHA)
     */
    isPinned(ref) {
        if (!ref) return false;
        return /^[a-f0-9]{40}$/i.test(ref);
    }

    /**
     * Check if ref is a mutable tag
     */
    isMutableTag(ref) {
        if (!ref) return false;
        
        const mutableTags = ['latest', 'stable', 'edge', 'main', 'master', 'dev', 'develop'];
        if (mutableTags.includes(ref.toLowerCase())) {
            return true;
        }

        // Check for semver major only (v1, v2, etc.)
        if (/^v\d+$/.test(ref)) {
            return true;
        }

        return false;
    }

    // ========== Security Check Methods ==========

    /**
     * Check workflow-level unpinned references
     */
    checkWorkflowLevel(owner, repo, ref, path) {
        const findings = [];

        // Check if ref is unpinned
        if (!this.isPinned(ref)) {
            const mutableTagCheck = this.checkMutableTag(ref);
            if (mutableTagCheck) {
                findings.push({
                    rule_id: 'UNPINNED_ACTION_REFERENCE',
                    severity: 'high',
                    message: mutableTagCheck.message,
                    action: `${owner}/${repo}${path ? '/' + path : ''}@${ref}`,
                    details: `Action reference '${ref}' is not pinned to a commit SHA. Use a full 40-character commit SHA for immutability.`
                });
            } else {
                findings.push({
                    rule_id: 'UNPINNED_ACTION_REFERENCE',
                    severity: 'medium',
                    message: `Action reference is not a commit SHA: ${ref}`,
                    action: `${owner}/${repo}${path ? '/' + path : ''}@${ref}`,
                    details: `Action reference '${ref}' should be pinned to a commit SHA for immutability.`
                });
            }
        }

        return findings;
    }

    /**
     * Check mutable tag
     */
    checkMutableTag(ref) {
        if (!ref) return null;

        if (this.isMutableTag(ref)) {
            return {
                rule_id: 'MUTABLE_TAG_REFERENCE',
                severity: 'high',
                message: `Action uses mutable tag reference: ${ref}`
            };
        }

        return null;
    }

    /**
     * Apply general heuristics to action metadata
     */
    applyHeuristics(metadata, owner, repo, ref, path) {
        const findings = [];

        // Check for mutable tags in metadata
        if (ref && !this.isPinned(ref)) {
            const mutableCheck = this.checkMutableTag(ref);
            if (mutableCheck) {
                findings.push({
                    rule_id: 'MUTABLE_TAG_REFERENCE',
                    severity: mutableCheck.severity,
                    message: mutableCheck.message,
                    action: `${owner}/${repo}${path ? '/' + path : ''}@${ref}`
                });
            }
        }

        return findings;
    }

    /**
     * Check Docker action for unpinnable issues
     */
    async checkDockerAction(owner, repo, ref, path, metadata, workflowLocations = []) {
        const findings = [];

        if (!metadata || metadata.available === false) {
            return findings;
        }

        // Determine the Dockerfile path in the ACTION repository
        const dockerfilePath = path ? `${path}/Dockerfile` : 'Dockerfile';
        const actionRepository = `${owner}/${repo}`;

        // Check Docker image reference
        const image = this.getDockerImage(metadata);
        if (image) {
            const imageFindings = this.checkDockerImage(image);
            // Enrich findings with action repository, Dockerfile path, and workflow locations
            imageFindings.forEach(finding => {
                findings.push({
                    ...finding,
                    actionRepository: actionRepository, // The action repository (where Dockerfile is)
                    actionDockerfile: dockerfilePath,  // Path to Dockerfile in action repo
                    workflowLocations: workflowLocations, // Where this action is used
                    // Keep repository for backward compatibility (workflow repository)
                    repository: workflowLocations.length > 0 ? workflowLocations[0].repository : null
                });
            });
        }

        // Check Dockerfile if available
        let dockerfile = metadata._dockerfile;
        if (!dockerfile) {
            try {
                const refToUse = metadata.ref || ref;
                dockerfile = await this.githubClient.getFileContent(owner, repo, dockerfilePath, refToUse);
            } catch (error) {
                // Dockerfile not found, continue without it
            }
        }
        
        if (dockerfile) {
            const dockerfileFindings = this.checkDockerfile(dockerfile, owner, repo, ref, path, metadata);
            // Enrich Dockerfile findings with action repository and workflow locations
            dockerfileFindings.forEach(finding => {
                finding.actionRepository = actionRepository;
                finding.actionDockerfile = dockerfilePath;
                finding.workflowLocations = workflowLocations;
                // Keep repository for backward compatibility
                if (!finding.repository && workflowLocations.length > 0) {
                    finding.repository = workflowLocations[0].repository;
                }
            });
            findings.push(...dockerfileFindings);
        }

        return findings;
    }

    /**
     * Check Docker image reference
     */
    checkDockerImage(image) {
        const findings = [];

        if (!image || typeof image !== 'string') {
            return findings;
        }

        // Check for docker:// prefix
        if (image.startsWith('docker://')) {
            image = image.replace('docker://', '');
        }

        // Check if it has a digest
        const hasDigest = image.includes('@sha256:') || image.includes('@sha512:');

        // Check if it has a tag
        const tagMatch = image.match(/:([^@]+)/);
        const tag = tagMatch ? tagMatch[1] : null;

        // If no digest and no explicit tag, it's implicit latest
        if (!hasDigest && !tag) {
            findings.push({
                rule_id: 'DOCKER_IMPLICIT_LATEST',
                severity: 'high',
                message: `Docker image uses implicit 'latest' tag: ${image}`,
                action: image
            });
        }

        // If has tag but no digest, check if tag is mutable
        if (tag && !hasDigest) {
            const mutableCheck = this.checkMutableTag(tag);
            if (mutableCheck) {
                findings.push({
                    rule_id: 'DOCKER_FLOATING_TAG',
                    severity: 'high',
                    message: `Docker image uses floating tag without digest: ${image}`,
                    action: image
                });
            }
        }

        return findings;
    }

    /**
     * Check Dockerfile content
     */
    checkDockerfile(dockerfile, owner, repo, ref, path, metadata = null) {
        const findings = [];
        const lines = dockerfile.split('\n');
        const refToUse = (metadata && metadata.ref) ? metadata.ref : ref;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Check FROM statement
            if (line.trim().toUpperCase().startsWith('FROM')) {
                const fromFinding = this.checkFromStatement(line, lineNum);
                if (fromFinding) {
                    findings.push({
                        ...fromFinding,
                        file: path ? `${path}/Dockerfile` : 'Dockerfile',
                        line: lineNum,
                        action: `${owner}/${repo}${path ? '/' + path : ''}@${refToUse}`
                    });
                }
            }

            // Check for unpinned package installs and other heuristics
            const packageFindings = this.checkAllHeuristics(line);
            for (const finding of packageFindings) {
                if (finding.rule_id === 'UNPINNED_PACKAGE_INSTALL') {
                    findings.push({
                        rule_id: 'DOCKER_UNPINNED_DEPENDENCIES',
                        severity: finding.severity,
                        message: finding.message,
                        file: path ? `${path}/Dockerfile` : 'Dockerfile',
                        line: lineNum,
                        action: `${owner}/${repo}${path ? '/' + path : ''}@${refToUse}`
                    });
                } else if (finding.rule_id === 'REMOTE_CODE_NO_INTEGRITY') {
                    findings.push({
                        rule_id: 'DOCKER_REMOTE_CODE_NO_INTEGRITY',
                        severity: finding.severity,
                        message: finding.message,
                        file: path ? `${path}/Dockerfile` : 'Dockerfile',
                        line: lineNum,
                        action: `${owner}/${repo}${path ? '/' + path : ''}@${refToUse}`
                    });
                }
            }
        }

        return findings;
    }

    /**
     * Check FROM statement in Dockerfile
     */
    checkFromStatement(line, lineNum) {
        // Extract base image
        const fromMatch = line.match(/FROM\s+(.+?)(?:\s+AS|\s*$)/i);
        if (!fromMatch) {
            return null;
        }

        const baseImage = fromMatch[1].trim();

        // Skip build stage references
        const isBuildStage = !baseImage.includes('/') && 
                            !baseImage.includes(':') && 
                            !baseImage.includes('@') &&
                            /^[a-zA-Z0-9_-]+$/.test(baseImage);
        
        if (isBuildStage) {
            return null;
        }

        // Check if it has a digest
        const hasDigest = baseImage.includes('@sha256:') || baseImage.includes('@sha512:');

        // Extract tag
        const tagMatch = baseImage.match(/:([^@]+)/);
        const tag = tagMatch ? tagMatch[1] : null;

        // If no digest
        if (!hasDigest) {
            // Check if tag is mutable
            if (tag && this.checkMutableTag(tag)) {
                return {
                    rule_id: 'DOCKERFILE_FLOATING_BASE_IMAGE',
                    severity: 'high',
                    message: `Dockerfile FROM uses floating tag without digest: ${baseImage}`,
                    details: `Base image '${baseImage}' should use a digest (e.g., @sha256:...) for immutability.`
                };
            } else if (!tag) {
                return {
                    rule_id: 'DOCKERFILE_FLOATING_BASE_IMAGE',
                    severity: 'high',
                    message: `Dockerfile FROM uses implicit 'latest' tag: ${baseImage}`,
                    details: `Base image '${baseImage}' should specify a tag and digest for immutability.`
                };
            } else {
                return {
                    rule_id: 'DOCKERFILE_FLOATING_BASE_IMAGE',
                    severity: 'medium',
                    message: `Dockerfile FROM uses tag without digest: ${baseImage}`,
                    details: `Base image '${baseImage}' should use a digest (e.g., @sha256:...) for immutability.`
                };
            }
        }

        return null;
    }

    /**
     * Check composite action for unpinnable issues
     */
    async checkCompositeAction(owner, repo, ref, path, metadata) {
        const findings = [];

        if (!metadata || !metadata.available) {
            return findings;
        }

        if (metadata.actionType !== 'composite') {
            return findings;
        }

        let actionFilePath = metadata._actionFilePath || (path ? `${path}/action.yml` : 'action.yml');
        const steps = this.getCompositeSteps(metadata);
        
        for (const step of steps) {
            // Check for nested actions
            if (step.uses) {
                findings.push(...this.checkNestedAction(step.uses, step, owner, repo, ref, path, actionFilePath));
            }

            // Check run blocks
            if (step.run) {
                findings.push(...this.checkRunBlock(step.run, step, owner, repo, ref, path, actionFilePath));
            }
        }

        return findings;
    }

    /**
     * Check nested action reference
     */
    checkNestedAction(uses, step, owner, repo, ref, path, actionFilePath) {
        const findings = [];

        if (!uses || typeof uses !== 'string') {
            return findings;
        }

        // Classify the action
        const classified = this.classifyAction(uses);

        // Check if it's unpinned
        if (classified.type === 'remote') {
            if (!classified.isPinned) {
                findings.push({
                    rule_id: 'COMPOSITE_NESTED_UNPINNED_ACTION',
                    severity: 'high',
                    message: `Composite action uses unpinned nested action: ${uses}`,
                    action: `${owner}/${repo}${path ? '/' + path : ''}@${ref}`,
                    nestedAction: uses,
                    file: actionFilePath,
                    line: step._line || null,
                    details: `Nested action '${uses}' should be pinned to a commit SHA for immutability.`
                });
            }

            // Check for mutable tags
            if (classified.ref && this.checkMutableTag(classified.ref)) {
                findings.push({
                    rule_id: 'COMPOSITE_NESTED_UNPINNED_ACTION',
                    severity: 'high',
                    message: `Composite action uses nested action with mutable tag: ${uses}`,
                    action: `${owner}/${repo}${path ? '/' + path : ''}@${ref}`,
                    nestedAction: uses,
                    file: actionFilePath,
                    line: step._line || null,
                    details: `Nested action '${uses}' uses mutable tag '${classified.ref}'. Use a commit SHA instead.`
                });
            }
        }

        return findings;
    }

    /**
     * Check run block for unpinnable issues
     */
    checkRunBlock(run, step, owner, repo, ref, path, actionFilePath) {
        const findings = [];

        if (!run) {
            return findings;
        }

        // Handle both string and object (shell, etc.)
        const runContent = typeof run === 'string' ? run : (run.shell || '');

        if (!runContent) {
            return findings;
        }

        // Check for unpinned package installs and other heuristics
        const packageFindings = this.checkAllHeuristics(runContent);
        for (const finding of packageFindings) {
            if (finding.rule_id === 'UNPINNED_PACKAGE_INSTALL') {
                findings.push({
                    rule_id: 'COMPOSITE_UNPINNED_DEPENDENCIES',
                    severity: finding.severity,
                    message: finding.message,
                    action: `${owner}/${repo}${path ? '/' + path : ''}@${ref}`,
                    file: actionFilePath,
                    line: step._line || null,
                    details: `Package installation in composite action should pin versions for immutability.`
                });
            } else if (finding.rule_id === 'REMOTE_CODE_NO_INTEGRITY') {
                findings.push({
                    rule_id: 'COMPOSITE_REMOTE_CODE_NO_INTEGRITY',
                    severity: finding.severity,
                    message: finding.message,
                    action: `${owner}/${repo}${path ? '/' + path : ''}@${ref}`,
                    file: actionFilePath,
                    line: step._line || null,
                    details: `Remote code download should include checksum verification for security.`
                });
            }
        }

        return findings;
    }

    /**
     * Check JavaScript action for unpinnable issues
     */
    async checkJavaScriptAction(owner, repo, ref, path, metadata) {
        const findings = [];

        if (!metadata || !metadata.available) {
            return findings;
        }

        if (metadata.actionType !== 'javascript') {
            return findings;
        }

        // For now, we'll do basic checks
        // Full JavaScript file analysis would require fetching source files
        // This is a simplified version - can be enhanced later

        return findings;
    }

    // ========== Heuristic Methods ==========

    /**
     * Check for unversioned package installs
     */
    checkUnpinnedPackageInstall(command) {
        if (!command || typeof command !== 'string') {
            return null;
        }

        const patterns = [
            /\bapt-get\s+install\s+[^&\n|;]+(?!.*=.*)/,
            /\bpip\s+install\s+[^&\n|;]+(?!.*==.*)/,
            /\bnpm\s+install\s+[^&\n|;]+(?!.*@.*)/,
            /\byarn\s+add\s+[^&\n|;]+(?!.*@.*)/,
            /\bapk\s+add\s+[^&\n|;]+(?!.*=.*)/,
            /\byum\s+install\s+[^&\n|;]+(?!.*-.*)/,
            /\bdnf\s+install\s+[^&\n|;]+(?!.*-.*)/
        ];

        for (const pattern of patterns) {
            if (pattern.test(command)) {
                const match = command.match(pattern);
                if (match) {
                    const installCmd = match[0];
                    if (!this.hasVersionPinning(installCmd)) {
                        return {
                            rule_id: 'UNPINNED_PACKAGE_INSTALL',
                            severity: 'medium',
                            message: `Unpinned package installation detected: ${installCmd.substring(0, 100)}`
                        };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Check if command has version pinning
     */
    hasVersionPinning(command) {
        const versionPatterns = [/==/, /@/, /=/, /-/];
        const lockfilePatterns = [/package-lock\.json/, /yarn\.lock/, /requirements\.txt/, /Pipfile\.lock/];

        return versionPatterns.some(p => p.test(command)) ||
               lockfilePatterns.some(p => p.test(command));
    }

    /**
     * Check for remote code downloads without integrity
     */
    checkRemoteCodeNoIntegrity(command) {
        if (!command || typeof command !== 'string') {
            return null;
        }

        const downloadPatterns = [
            /\bcurl\s+[^|&\n]+?\s*\|\s*(sh|bash|zsh|fish)/,
            /\bwget\s+[^|&\n]+?\s*\|\s*(sh|bash|zsh|fish)/,
            /\bcurl\s+[^&\n]+-o\s+[^\s]+.*&&\s*(sh|bash|chmod\s+\+x)/,
            /\bwget\s+[^&\n]+-O\s+[^\s]+.*&&\s*(sh|bash|chmod\s+\+x)/
        ];

        for (const pattern of downloadPatterns) {
            if (pattern.test(command)) {
                const match = command.match(pattern);
                if (match) {
                    if (!this.hasIntegrityCheck(command)) {
                        return {
                            rule_id: 'REMOTE_CODE_NO_INTEGRITY',
                            severity: 'high',
                            message: `Remote code download without integrity check: ${match[0].substring(0, 100)}`
                        };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Check if command has integrity verification
     */
    hasIntegrityCheck(command) {
        const integrityPatterns = [/sha256/, /sha512/, /sha1/, /md5/, /gpg/, /--checksum/, /--verify/];
        return integrityPatterns.some(p => p.test(command.toLowerCase()));
    }

    /**
     * Apply all heuristics to a command/string
     */
    checkAllHeuristics(text) {
        const findings = [];

        if (!text || typeof text !== 'string') {
            return findings;
        }

        // Check for unpinned package installs
        const packageFinding = this.checkUnpinnedPackageInstall(text);
        if (packageFinding) findings.push(packageFinding);

        // Check for remote code without integrity
        const remoteFinding = this.checkRemoteCodeNoIntegrity(text);
        if (remoteFinding) findings.push(remoteFinding);

        return findings;
    }

    /**
     * Clear analysis cache
     */
    clearCache() {
        this.analysisCache.clear();
        this.actionMetadataCache.clear();
    }
}

// Export for use in other modules
window.GitHubActionsAnalyzer = GitHubActionsAnalyzer;

