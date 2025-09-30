/**
 * GitHub Actions Service - Check versions for GitHub Actions
 * Uses GitHub API with smart caching and rate limit management
 */
class GitHubActionsService {
    constructor(githubClient = null) {
        this.githubClient = githubClient; // Use existing GitHub client if available
        this.cache = new Map(); // Cache release data
        this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hour cache (aggressive to avoid rate limits)
        this.rateLimitRemaining = null;
        this.rateLimitReset = null;
    }

    /**
     * Check if a package is a GitHub Action
     * @param {Object} dependency - Dependency object
     * @returns {boolean} True if it's a GitHub Action
     */
    isGitHubAction(dependency) {
        // Check PURL first
        if (dependency.purl && dependency.purl.startsWith('pkg:githubactions/')) {
            return true;
        }
        
        // Check ecosystem field
        if (dependency.ecosystem === 'GitHub Actions') {
            return true;
        }
        
        // Check name pattern (owner/action or owner/repo/path)
        const name = dependency.name || '';
        const isActionPattern = name.match(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\/.*)?$/);
        
        return isActionPattern !== null;
    }

    /**
     * Extract owner and repo from GitHub Action name
     * @param {string} actionName - E.g., "actions/checkout", "google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml"
     * @returns {Object} {owner, repo, path}
     */
    parseActionName(actionName) {
        // Remove pkg: prefix if present
        let cleaned = actionName.replace(/^pkg:githubactions\//, '');
        
        // Split into parts
        const parts = cleaned.split('/');
        
        if (parts.length < 2) {
            return null;
        }
        
        return {
            owner: parts[0],
            repo: parts[1],
            path: parts.length > 2 ? parts.slice(2).join('/') : null
        };
    }

    /**
     * Get GitHub API token if available
     * @returns {string|null} GitHub token or null
     */
    getToken() {
        // Try to get token from githubClient
        if (this.githubClient && this.githubClient.token) {
            return this.githubClient.token;
        }
        
        // Try to get token from localStorage
        try {
            const token = localStorage.getItem('githubToken');
            return token || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Fetch commit SHA for a specific tag
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {string} tag - Tag name
     * @returns {Promise<string|null>} Commit SHA or null
     */
    async fetchTagCommitSHA(owner, repo, tag) {
        const cacheKey = `sha:${owner}/${repo}/${tag}`;
        
        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.sha;
        }
        
        try {
            const token = this.getToken();
            const url = `https://api.github.com/repos/${owner}/${repo}/git/ref/tags/${tag}`;
            
            const headers = {
                'Accept': 'application/vnd.github.v3+json'
            };
            
            if (token) {
                headers['Authorization'] = `token ${token}`;
            }
            
            const response = await fetch(url, { headers });
            
            // Update rate limit info
            this.rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining')) || null;
            this.rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset')) || null;
            
            if (!response.ok) {
                console.warn(`⚠️ Could not fetch commit SHA for tag ${tag} in ${owner}/${repo}: ${response.status}`);
                return null;
            }
            
            const data = await response.json();
            const sha = data.object?.sha || null;
            
            // Cache the result
            if (sha) {
                this.cache.set(cacheKey, {
                    sha: sha,
                    timestamp: Date.now()
                });
            }
            
            return sha;
            
        } catch (error) {
            console.warn(`⚠️ Error fetching commit SHA for tag ${tag}:`, error);
            return null;
        }
    }

    /**
     * Fetch releases from GitHub API
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Promise<Array>} Array of release objects
     */
    async fetchReleases(owner, repo) {
        const cacheKey = `${owner}/${repo}`;
        
        // Check cache first (24 hour cache to minimize API usage)
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            console.log(`📦 Using cached releases for ${owner}/${repo} (age: ${Math.round((Date.now() - cached.timestamp) / 60000)} minutes)`);
            return cached.releases;
        }
        
        // Check if we're rate limited
        if (this.rateLimitRemaining !== null && this.rateLimitRemaining === 0) {
            if (this.rateLimitReset && Date.now() < this.rateLimitReset * 1000) {
                const minutesUntilReset = Math.ceil((this.rateLimitReset * 1000 - Date.now()) / 60000);
                console.warn(`⏳ Rate limit exceeded. Resets in ${minutesUntilReset} minutes. Using cached data if available.`);
                return cached ? cached.releases : [];
            }
        }
        
        try {
            const token = this.getToken();
            const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`;
            
            console.log(`🔍 Fetching releases from GitHub API: ${owner}/${repo} ${token ? '(authenticated)' : '(unauthenticated)'}`);
            
            const headers = {
                'Accept': 'application/vnd.github.v3+json'
            };
            
            if (token) {
                headers['Authorization'] = `token ${token}`;
            }
            
            const response = await fetch(url, { headers });
            
            // Update rate limit info from response headers
            this.rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining')) || null;
            this.rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset')) || null;
            
            if (this.rateLimitRemaining !== null) {
                console.log(`📊 GitHub API rate limit: ${this.rateLimitRemaining} requests remaining`);
            }
            
            if (!response.ok) {
                if (response.status === 403) {
                    console.warn(`⚠️ Rate limit exceeded for ${owner}/${repo}`);
                } else if (response.status === 404) {
                    console.warn(`⚠️ Repository not found or no releases: ${owner}/${repo}`);
                } else {
                    console.warn(`⚠️ Failed to fetch releases for ${owner}/${repo}: ${response.status}`);
                }
                return cached ? cached.releases : [];
            }
            
            const releases = await response.json();
            
            // Transform to our format (don't fetch SHAs yet - do it lazily only for latest)
            const formattedReleases = releases.map(release => ({
                tag: release.tag_name,
                title: release.name || release.tag_name,
                link: release.html_url,
                updated: release.published_at ? new Date(release.published_at) : null,
                commit: null  // Will be fetched on-demand for latest release
            }));
            
            // Cache the results (even if empty, to avoid repeated failed requests)
            this.cache.set(cacheKey, {
                releases: formattedReleases,
                timestamp: Date.now()
            });
            
            console.log(`✅ Found ${formattedReleases.length} releases for ${owner}/${repo}`);
            return formattedReleases;
            
        } catch (error) {
            console.error(`❌ Error fetching releases for ${owner}/${repo}:`, error);
            // Return cached data if available, even if stale
            return cached ? cached.releases : [];
        }
    }

    /**
     * Get the latest release for a GitHub Action
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Promise<Object>} Latest release object or null
     */
    async getLatestRelease(owner, repo) {
        const releases = await this.fetchReleases(owner, repo);
        
        if (releases.length === 0) {
            return null;
        }
        
        // The first entry in releases.atom is typically the latest
        return releases[0];
    }

    /**
     * Check if a version string is a commit hash
     * @param {string} version - Version string
     * @returns {boolean} True if it's a commit hash
     */
    isCommitHash(version) {
        // Full SHA (40 chars) or short SHA (7-40 chars)
        return /^[a-f0-9]{7,40}$/.test(version);
    }

    /**
     * Normalize version/tag string for comparison
     * @param {string} version - Version string (may have 'v' prefix)
     * @returns {string} Normalized version
     */
    normalizeVersion(version) {
        // Remove 'v' prefix if present
        return version.replace(/^v/, '');
    }

    /**
     * Compare two versions
     * @param {string} current - Current version
     * @param {string} latest - Latest version
     * @returns {string} 'up-to-date', 'outdated', or 'unknown'
     */
    compareVersions(current, latest) {
        if (!current || !latest) {
            return 'unknown';
        }
        
        // If both are hashes, compare directly
        if (this.isCommitHash(current) && this.isCommitHash(latest)) {
            // Truncate to same length for comparison
            const minLength = Math.min(current.length, latest.length);
            return current.substring(0, minLength) === latest.substring(0, minLength) 
                ? 'up-to-date' 
                : 'outdated';
        }
        
        // If current is hash and latest is tag, assume outdated (should use tags)
        if (this.isCommitHash(current) && !this.isCommitHash(latest)) {
            return 'outdated'; // Should migrate to tagged version
        }
        
        // If both are tags, normalize and compare
        const normalizedCurrent = this.normalizeVersion(current);
        const normalizedLatest = this.normalizeVersion(latest);
        
        return normalizedCurrent === normalizedLatest ? 'up-to-date' : 'outdated';
    }

    /**
     * Get version status for a GitHub Action
     * @param {Object} dependency - Dependency object with name and version
     * @returns {Promise<Object>} Version status information
     */
    async checkVersion(dependency) {
        const parsed = this.parseActionName(dependency.name);
        
        if (!parsed) {
            return {
                name: dependency.name,
                currentVersion: dependency.version,
                status: 'unknown',
                ecosystem: 'githubactions',
                message: 'Could not parse action name'
            };
        }
        
        const { owner, repo } = parsed;
        
        try {
            const latestRelease = await this.getLatestRelease(owner, repo);
            
            if (!latestRelease) {
                return {
                    name: dependency.name,
                    currentVersion: dependency.version,
                    status: 'unknown',
                    ecosystem: 'githubactions',
                    message: 'No releases found',
                    repoUrl: `https://github.com/${owner}/${repo}`
                };
            }
            
            const currentVersion = dependency.version;
            const latestTag = latestRelease.tag;
            
            // Determine comparison result
            let status = 'unknown';
            let message = '';
            let details = '';
            let latestCommit = null;
            
            if (this.isCommitHash(currentVersion)) {
                // Current version is a commit hash - fetch the SHA for the latest tag
                console.log(`🔍 Current version is SHA (${currentVersion}), fetching commit for latest tag ${latestTag}...`);
                latestCommit = await this.fetchTagCommitSHA(owner, repo, latestTag);
                
                if (latestCommit) {
                    console.log(`📌 Latest tag ${latestTag} points to commit ${latestCommit.substring(0, 7)}...`);
                    
                    // Compare SHAs (handle both short and full hashes)
                    const minLength = Math.min(currentVersion.length, latestCommit.length);
                    const currentPrefix = currentVersion.substring(0, minLength);
                    const latestPrefix = latestCommit.substring(0, minLength);
                    
                    if (currentPrefix === latestPrefix) {
                        status = 'up-to-date';
                        message = `Using latest release (${latestTag})`;
                        details = `SHA: ${currentVersion}`;
                    } else {
                        status = 'outdated';
                        message = 'Update available';
                        details = `Latest: ${latestTag} (SHA: ${latestCommit.substring(0, 7)})`;
                    }
                } else {
                    // Couldn't fetch SHA - assume outdated
                    status = 'outdated';
                    message = 'Newer version available';
                    details = `Latest release: ${latestTag} (couldn't verify SHA)`;
                }
            } else {
                // Current version is a tag
                const comparisonResult = this.compareVersions(currentVersion, latestTag);
                status = comparisonResult;
                
                if (status === 'up-to-date') {
                    message = 'Up to date';
                } else if (status === 'outdated') {
                    message = 'Update available';
                    details = `Latest: ${latestTag}`;
                } else {
                    message = 'Unknown version status';
                }
            }
            
            return {
                name: dependency.name,
                currentVersion: currentVersion,
                latestVersion: latestTag,
                latestCommit: latestCommit,
                status: status,
                statusMessage: message,
                statusDetails: details,
                isOutdated: status === 'outdated',
                ecosystem: 'githubactions',
                releaseUrl: latestRelease.link,
                repoUrl: `https://github.com/${owner}/${repo}`,
                updated: latestRelease.updated
            };
            
        } catch (error) {
            console.error(`❌ Error checking version for ${dependency.name}:`, error);
            return {
                name: dependency.name,
                currentVersion: dependency.version,
                status: 'unknown',
                ecosystem: 'githubactions',
                error: error.message,
                repoUrl: `https://github.com/${owner}/${repo}`
            };
        }
    }

    /**
     * Check versions for multiple GitHub Actions
     * @param {Array} dependencies - Array of dependency objects
     * @param {Function} onProgress - Optional progress callback
     * @returns {Promise<Array>} Array of version check results
     */
    async checkVersions(dependencies, onProgress = null) {
        console.log(`🔍 Checking versions for ${dependencies.length} GitHub Actions...`);
        
        const results = [];
        
        for (let i = 0; i < dependencies.length; i++) {
            const dep = dependencies[i];
            
            if (onProgress) {
                const progress = ((i + 1) / dependencies.length) * 100;
                onProgress(progress, `Checking ${dep.name}...`);
            }
            
            const result = await this.checkVersion(dep);
            results.push(result);
            
            // Add small delay to be respectful
            if (i < dependencies.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        console.log(`✅ Completed version checks for ${dependencies.length} GitHub Actions`);
        return results;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GitHubActionsService;
}
