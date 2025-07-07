/**
 * GitHub Client - Handles GitHub API requests with rate limiting
 */
class GitHubClient {
    constructor() {
        this.baseUrl = 'https://api.github.com';
        this.token = null; // Don't load from localStorage
        this.headers = {
            'Accept': 'application/vnd.github.v3+json'
        };
        
        // Custom event emitter for rate limit events
        this.eventTarget = new EventTarget();
    }

    /**
     * Add event listener for rate limit events
     */
    addEventListener(type, listener) {
        this.eventTarget.addEventListener(type, listener);
    }

    /**
     * Remove event listener
     */
    removeEventListener(type, listener) {
        this.eventTarget.removeEventListener(type, listener);
    }

    /**
     * Dispatch custom event
     */
    dispatchEvent(event) {
        this.eventTarget.dispatchEvent(event);
    }

    /**
     * Set GitHub token (not persisted)
     */
    setToken(token) {
        this.token = token;
        if (token) {
            this.headers['Authorization'] = `token ${token}`;
        } else {
            delete this.headers['Authorization'];
        }
        // Don't save to localStorage
    }

    /**
     * Get repositories for an organization or user
     */
    async getRepositories(ownerName) {
        // Try organization endpoint first
        let url = `${this.baseUrl}/orgs/${ownerName}/repos?per_page=100`;
        let response = await this.makeRequest(url);
        
        if (response.ok) {
            console.log(`✅ Found organization: ${ownerName}`);
            const repos = await this.getAllPages(url);
            return repos.filter(repo => repo.visibility === 'public');
        }
        
        // If organization fails, try user endpoint
        if (response.status === 404) {
            console.log(`ℹ️  Not found as organization, trying as user: ${ownerName}`);
            url = `${this.baseUrl}/users/${ownerName}/repos?per_page=100`;
            response = await this.makeRequest(url);
            
            if (response.ok) {
                console.log(`✅ Found user: ${ownerName}`);
                const repos = await this.getAllPages(url);
                return repos.filter(repo => repo.visibility === 'public');
            }
        }
        
        // If both fail, throw appropriate error
        if (response.status === 404) {
            throw new Error(`Organization or user '${ownerName}' not found`);
        } else if (response.status === 403) {
            throw new Error('Access denied. The organization/user might be private or require authentication.');
        } else {
            throw new Error(`Failed to fetch repositories: ${response.status} ${response.statusText}`);
        }
    }

    /**
     * Get all pages from a paginated API endpoint
     */
    async getAllPages(url) {
        const allRepos = [];
        let currentUrl = url;
        
        while (currentUrl) {
            console.log(`📄 Fetching page: ${currentUrl}`);
            const response = await this.makeRequest(currentUrl);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch repositories: ${response.status} ${response.statusText}`);
            }
            
            const repos = await response.json();
            allRepos.push(...repos);
            
            // Check for next page
            const linkHeader = response.headers.get('Link');
            if (linkHeader) {
                const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
                if (nextMatch) {
                    currentUrl = nextMatch[1];
                } else {
                    currentUrl = null; // No next page
                }
            } else {
                currentUrl = null; // No Link header, assume single page
            }
        }
        
        console.log(`📊 Total repositories fetched: ${allRepos.length}`);
        return allRepos;
    }

    /**
     * Fetch SBOM for a repository
     */
    async fetchSBOM(owner, repo) {
        const url = `${this.baseUrl}/repos/${owner}/${repo}/dependency-graph/sbom`;
        const response = await this.makeRequest(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`ℹ️  SBOM not available for ${owner}/${repo} (dependency graph not enabled or repository not found)`);
                return null;
            } else if (response.status === 403) {
                console.log(`⚠️  Access denied for ${owner}/${repo} (private repository or insufficient permissions)`);
                return null;
            } else if (response.status === 401) {
                console.log(`⚠️  Authentication required for ${owner}/${repo} (private repository)`);
                return null;
            } else if (response.status === 422) {
                console.log(`ℹ️  SBOM not available for ${owner}/${repo} (dependency graph not enabled)`);
                return null;
            } else if (response.status === 429) {
                console.log(`⏳ Rate limit exceeded for ${owner}/${repo}, will retry later`);
                return null;
            } else {
                console.log(`⚠️  SBOM not available for ${owner}/${repo}: ${response.status} ${response.statusText}`);
                return null;
            }
        }
        
        const sbomData = await response.json();
        
        // Validate SBOM data structure
        if (!sbomData || !sbomData.sbom || !sbomData.sbom.packages) {
            console.log(`ℹ️  SBOM data is empty for ${owner}/${repo}`);
            return null;
        }
        
        // Log success with dependency count
        const packageCount = sbomData.sbom.packages.length;
        console.log(`✅ SBOM fetched for ${owner}/${repo}: ${packageCount} packages found`);
        
        return sbomData;
    }

    /**
     * Get rate limit information
     */
    async getRateLimitInfo() {
        const url = `${this.baseUrl}/rate_limit`;
        const response = await this.makeRequest(url);
        
        if (response.ok) {
            const data = await response.json();
            const core = data.resources.core;
            return {
                limit: core.limit,
                remaining: core.remaining,
                reset: core.reset,
                authenticated: this.token ? 'Yes' : 'No'
            };
        } else {
            return {
                limit: 'Unknown',
                remaining: 'Unknown',
                reset: 'Unknown',
                authenticated: 'No'
            };
        }
    }

    /**
     * Save rate limit state to localStorage
     */
    saveRateLimitState(waitTime, resetTime) {
        const state = {
            waitTime,
            resetTime,
            timestamp: Date.now(),
            organization: localStorage.getItem('current_analysis_org') || 'unknown'
        };
        localStorage.setItem('rate_limit_state', JSON.stringify(state));
    }

    /**
     * Load rate limit state from localStorage
     */
    loadRateLimitState() {
        const state = localStorage.getItem('rate_limit_state');
        return state ? JSON.parse(state) : null;
    }

    /**
     * Clear rate limit state
     */
    clearRateLimitState() {
        localStorage.removeItem('rate_limit_state');
    }

    /**
     * Make a request with rate limit handling
     */
    async makeRequest(url, retryCount = 0) {
        if (retryCount > 3) {
            console.log('❌ Too many retries. Stopping request.');
            return new Response(null, { status: 429 });
        }
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this.headers
            });
            
            // Handle rate limiting
            if (response.status === 403) {
                const remaining = response.headers.get('X-RateLimit-Remaining');
                const reset = response.headers.get('X-RateLimit-Reset');
                
                if (remaining === '0' && reset) {
                    const resetTime = parseInt(reset);
                    const waitTime = resetTime - Math.floor(Date.now() / 1000);
                    
                    if (waitTime > 0) {
                        // Save rate limit state
                        this.saveRateLimitState(waitTime, resetTime);
                        
                        // Dispatch rate limit event
                        this.dispatchEvent(new CustomEvent('rateLimitExceeded', {
                            detail: {
                                waitTime,
                                resetTime,
                                resetDate: new Date(resetTime * 1000)
                            }
                        }));
                        
                        console.log(`⏳ Rate limit exceeded. Waiting ${waitTime} seconds for reset...`);
                        await this.sleep(waitTime + 2); // Add 2 second buffer
                        
                        // Clear rate limit state after waiting
                        this.clearRateLimitState();
                        
                        // Dispatch rate limit reset event
                        this.dispatchEvent(new CustomEvent('rateLimitReset'));
                        
                        console.log('✅ Rate limit reset. Continuing...');
                        return this.makeRequest(url, retryCount + 1);
                    }
                }
            }
            
            return response;
        } catch (error) {
            console.log(`❌ Request failed: ${error.message}`);
            return new Response(null, { status: 500 });
        }
    }

    /**
     * Sleep utility function
     */
    sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    /**
     * Check if rate limit is running low
     */
    async checkRateLimitRemaining(response) {
        const remaining = response.headers.get('X-RateLimit-Remaining');
        if (remaining && parseInt(remaining) <= 5) {
            console.log(`⚠️  Rate limit running low: ${remaining} requests remaining`);
            return true;
        }
        return false;
    }
}

// Export for use in other modules
window.GitHubClient = GitHubClient; 