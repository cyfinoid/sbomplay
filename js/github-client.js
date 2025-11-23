/**
 * GitHub Client - Handles GitHub API requests with rate limiting
 */
class GitHubClient {
    constructor() {
        this.baseUrl = 'https://api.github.com';
        this.graphqlUrl = 'https://api.github.com/graphql';
        this.token = null; // Don't load from localStorage
        this.headers = {
            'Accept': 'application/vnd.github.v3+json'
        };
        this.graphqlHeaders = {
            'Accept': 'application/vnd.github.v4+json',
            'Content-Type': 'application/json'
        };
        
        // Enable GraphQL by default if token is available
        this.useGraphQL = true;
        
        // Custom event emitter for rate limit events
        this.eventTarget = new EventTarget();
        
        // Cache for user profiles to avoid duplicate API calls
        this.userCache = new Map();
        // Cache for SBOM fetch results (including failures) to avoid retrying
        this.sbomCache = new Map();
        // Cache for repository data
        this.repoCache = new Map();
        
        // Request throttling to prevent secondary rate limits
        // GitHub allows ~30-60 requests/minute, so we'll use 1 request per 1.5 seconds (40/min)
        this.lastRequestTime = 0;
        this.minRequestInterval = 1500; // 1.5 seconds between requests (40 requests/minute)
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
        const hadToken = !!this.token;
        this.token = token;
        if (token) {
            this.headers['Authorization'] = `token ${token}`;
            this.graphqlHeaders['Authorization'] = `bearer ${token}`;
            // Log token set (mask token for security)
            const maskedToken = token.length > 8 ? `${token.substring(0, 4)}...${token.substring(token.length - 4)}` : '****';
            if (!hadToken) {
                console.log(`🔑 GitHub token set: ${maskedToken}`);
                // Verify token by checking rate limits (async, don't await)
                this.verifyToken().catch(() => {
                    // Silently fail - token verification is optional
                });
            }
        } else {
            delete this.headers['Authorization'];
            delete this.graphqlHeaders['Authorization'];
            if (hadToken) {
                console.log('🔑 GitHub token cleared');
            }
        }
        // Don't save to localStorage
    }

    /**
     * Verify token by checking rate limit info
     */
    async verifyToken() {
        try {
            const rateLimitInfo = await this.getRateLimitInfo();
            if (rateLimitInfo.limit === 5000) {
                console.log(`✅ Token verified: Rate limit is ${rateLimitInfo.limit}/hour (authenticated)`);
            } else if (rateLimitInfo.limit === 60) {
                console.warn(`⚠️  Token may be invalid or missing scopes: Rate limit is ${rateLimitInfo.limit}/hour (unauthenticated)`);
            } else {
                console.log(`ℹ️  Token status: Rate limit is ${rateLimitInfo.limit}/hour, ${rateLimitInfo.remaining} remaining`);
            }
        } catch (error) {
            // Silently fail - verification is optional
        }
    }

    /**
     * Make a GraphQL request
     * @param {string} query - GraphQL query string
     * @param {Object} variables - Query variables
     * @returns {Promise<Object>} - GraphQL response data
     */
    async makeGraphQLRequest(query, variables = {}) {
        if (!this.token) {
            throw new Error('GitHub token required for GraphQL requests');
        }
        
        try {
            console.log(`🔷 [GraphQL] Executing query`);
            const response = await fetchWithTimeout(this.graphqlUrl, {
                method: 'POST',
                headers: this.graphqlHeaders,
                body: JSON.stringify({ query, variables })
            });
            
            const result = await response.json();
            
            if (result.errors) {
                // Log GraphQL errors but don't throw - let caller handle
                console.log(`⚠️  GraphQL errors:`, result.errors);
                throw new Error(`GraphQL errors: ${JSON.stringify(result.errors.map(e => e.message))}`);
            }
            
            console.log(`   ✅ GraphQL Response: Success`);
            return result.data;
        } catch (error) {
            console.log(`   ❌ GraphQL Request failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get user profile information using GraphQL
     * @param {string} username - GitHub username
     * @returns {Promise<Object|null>} - User profile data, or null if not found
     */
    async getUserGraphQL(username) {
        // Use a union query to handle both User and Organization types correctly
        const query = `
            query($username: String!) {
                user: user(login: $username) {
                    __typename
                    ... on User {
                        login
                        name
                        location
                        company
                        bio
                        avatarUrl
                        url
                    }
                    ... on Organization {
                        login
                        name
                        location
                        company
                        description
                        avatarUrl
                        url
                    }
                }
            }
        `;
        
        try {
            const data = await this.makeGraphQLRequest(query, { username });
            if (!data || !data.user) {
                return null;
            }
            
            const user = data.user;
            // __typename will be 'User' or 'Organization'
            const isUser = user.__typename === 'User';
            
            return {
                login: user.login,
                name: user.name || null,
                location: user.location || null,
                company: user.company || null,
                email: null, // GraphQL requires user:email scope
                bio: isUser ? (user.bio || null) : (user.description || null),
                avatar_url: user.avatarUrl || null,
                html_url: user.url || null,
                type: isUser ? 'User' : 'Organization'
            };
        } catch (error) {
            // If GraphQL fails, return null to trigger REST fallback
            console.log(`⚠️  GraphQL user fetch failed, will use REST: ${error.message}`);
            return null;
        }
    }

    /**
     * Get user profile information
     * @param {string} username - GitHub username
     * @returns {Promise<Object|null>} - User profile data with location and company, or null if not found
     */
    async getUser(username, forceRefresh = false) {
        // Check cache first (unless force refresh is requested)
        const cacheKey = username.toLowerCase();
        if (!forceRefresh && this.userCache.has(cacheKey)) {
            const cached = this.userCache.get(cacheKey);
            if (cached === null) {
                console.log(`📦 Cache: User ${username} not found (cached failure)`);
            } else {
                // Verify cached type is valid (should be 'User' or 'Organization')
                if (cached.type && cached.type !== 'User' && cached.type !== 'Organization') {
                    console.warn(`⚠️  Cached user ${username} has invalid type "${cached.type}", refreshing...`);
                    // Clear cache and fetch fresh
                    this.userCache.delete(cacheKey);
                } else {
                    console.log(`📦 Cache: Using cached ${cached.type || 'user'} profile for ${username}`);
                    return cached;
                }
            }
        }
        
        // Try GraphQL first if enabled and token is available
        if (this.useGraphQL && this.token) {
            try {
                const userProfile = await this.getUserGraphQL(username);
                if (userProfile) {
                    console.log(`✅ Found user (GraphQL): ${username}`);
                    this.userCache.set(cacheKey, userProfile);
                    return userProfile;
                }
            } catch (error) {
                // Fall through to REST API
                console.log(`ℹ️  GraphQL failed for user ${username}, falling back to REST`);
            }
        }
        
        // Fallback to REST API
        const url = `${this.baseUrl}/users/${encodeURIComponent(username)}`;
        const response = await this.makeRequest(url);
        
        if (!response.ok) {
            let result = null;
            if (response.status === 404) {
                console.log(`ℹ️  User ${username} not found`);
            } else if (response.status === 403) {
                console.log(`⚠️  Access denied for user ${username}`);
            } else if (response.status === 429) {
                console.log(`⏳ Rate limit exceeded for user ${username}, will retry later`);
                // Don't cache 429 errors - we want to retry these
                return null;
            } else {
                console.log(`⚠️  Failed to fetch user ${username}: ${response.status}`);
            }
            // Cache failures (except 429) to avoid retrying
            if (response.status !== 429) {
                this.userCache.set(cacheKey, null);
            }
            return result;
        }
        
        const userData = await response.json();
        
        // GitHub REST API returns 'type' field: 'User' or 'Organization'
        // Ensure we use the exact value from the API, defaulting to 'User' if missing
        const userType = userData.type === 'Organization' ? 'Organization' : 'User';
        
        console.log(`✅ Found ${userType.toLowerCase()} (REST): ${username}`);
        const userProfile = {
            login: userData.login,
            name: userData.name,
            location: userData.location || null,
            company: userData.company || null,
            email: userData.email || null,
            bio: userData.bio || null,
            avatar_url: userData.avatar_url || null,
            html_url: userData.html_url || null,
            type: userType // Explicitly set type to distinguish User vs Organization
        };
        
        // Cache the result (always cache, even if type is missing - will be set to 'User' by default)
        this.userCache.set(cacheKey, userProfile);
        console.log(`💾 Cached ${userProfile.type} profile for ${username}`);
        return userProfile;
    }

    /**
     * Get top contributors for a repository
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} limit - Maximum number of contributors to fetch (default: 10)
     * @param {boolean} fetchProfiles - Whether to fetch full user profiles (default: true)
     * @returns {Promise<Array>} - Array of contributor objects with login, name, contributions, etc.
     */
    async getContributors(owner, repo, limit = 10, fetchProfiles = true) {
        const url = `${this.baseUrl}/repos/${owner}/${repo}/contributors?per_page=${limit}&anon=false`;
        const response = await this.makeRequest(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`ℹ️  Contributors not available for ${owner}/${repo}`);
                return [];
            } else if (response.status === 403) {
                console.log(`⚠️  Access denied for contributors of ${owner}/${repo}`);
                return [];
            } else if (response.status === 429) {
                console.log(`⏳ Rate limit exceeded for contributors of ${owner}/${repo}`);
                return [];
            } else {
                console.log(`⚠️  Failed to fetch contributors for ${owner}/${repo}: ${response.status}`);
                return [];
            }
        }
        
        const contributors = await response.json();
        console.log(`✅ Found ${contributors.length} contributors for ${owner}/${repo}`);
        
        // If fetchProfiles is false, return basic contributor data without fetching profiles
        // This saves significant API calls when we only need contributor usernames
        if (!fetchProfiles) {
            return contributors.slice(0, limit).map(contributor => ({
                login: contributor.login,
                name: contributor.login, // Use login as name fallback
                contributions: contributor.contributions,
                avatar_url: contributor.avatar_url,
                html_url: contributor.html_url,
                location: null,
                company: null
            }));
        }
        
        // Fetch full user profiles for each contributor to get names and verify they're not organizations
        // Use cached profiles when available to minimize API calls
        const contributorsWithProfiles = [];
        for (const contributor of contributors.slice(0, limit)) {
            // Skip anonymous contributors (they don't have login)
            if (!contributor.login) {
                continue;
            }
            
            try {
                // getUser() now uses cache, so duplicate calls are avoided
                const userProfile = await this.getUser(contributor.login);
                // Only include individual users, not organizations
                if (userProfile && userProfile.type !== 'Organization') {
                    contributorsWithProfiles.push({
                        login: contributor.login,
                        name: userProfile.name || contributor.login,
                        contributions: contributor.contributions,
                        avatar_url: contributor.avatar_url,
                        html_url: contributor.html_url,
                        location: userProfile.location || null,
                        company: userProfile.company || null
                    });
                }
                // Reduced delay since we're using cache - only delay if cache miss
                if (!this.userCache.has(contributor.login.toLowerCase())) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                console.warn(`Failed to fetch profile for contributor ${contributor.login}:`, error);
                // Skip contributors we can't verify (might be organizations or deleted accounts)
            }
        }
        
        return contributorsWithProfiles;
    }

    /**
     * Get a single repository
     */
    async getRepository(owner, repo) {
        const url = `${this.baseUrl}/repos/${owner}/${repo}`;
        const response = await this.makeRequest(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`ℹ️  Repository ${owner}/${repo} not found`);
                return null;
            } else if (response.status === 403) {
                console.log(`⚠️  Access denied for ${owner}/${repo}`);
                return null;
            } else {
                console.log(`⚠️  Failed to fetch repository ${owner}/${repo}: ${response.status}`);
                return null;
            }
        }
        
        const repoData = await response.json();
        console.log(`✅ Found repository: ${owner}/${repo}`);
        return repoData;
    }

    /**
     * Get user repositories using GraphQL
     * @param {string} username - GitHub username
     * @param {number} first - Number of repositories to fetch per page
     * @param {string} after - Cursor for pagination
     * @returns {Promise<Object>} - Object with repos array, hasNextPage, endCursor, totalCount
     */
    async getUserRepositoriesGraphQL(username, first = 100, after = null) {
        const query = `
            query($login: String!, $first: Int!, $after: String) {
                user(login: $login) {
                    login
                    repositories(
                        first: $first
                        after: $after
                        orderBy: {field: UPDATED_AT, direction: DESC}
                    ) {
                        totalCount
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                        nodes {
                            name
                            nameWithOwner
                            description
                            url
                            isArchived
                            licenseInfo {
                                spdxId
                                name
                            }
                            owner {
                                __typename
                                login
                            }
                        }
                    }
                }
            }
        `;
        
        try {
            const data = await this.makeGraphQLRequest(query, { 
                login: username, 
                first, 
                after 
            });
            
            if (!data || !data.user) {
                return null;
            }
            
            // Convert GraphQL format to REST API format for compatibility
            const repos = data.user.repositories.nodes.map(repo => ({
                name: repo.name,
                full_name: repo.nameWithOwner,
                description: repo.description,
                html_url: repo.url,
                archived: repo.isArchived,
                license: repo.licenseInfo ? {
                    spdx_id: repo.licenseInfo.spdxId,
                    key: repo.licenseInfo.spdxId,
                    name: repo.licenseInfo.name
                } : null,
                owner: {
                    login: repo.owner.login,
                    type: repo.owner.__typename === 'User' ? 'User' : 'Organization'
                },
                visibility: 'public' // GraphQL query only returns public repos by default
            }));
            
            return {
                repos,
                hasNextPage: data.user.repositories.pageInfo.hasNextPage,
                endCursor: data.user.repositories.pageInfo.endCursor,
                totalCount: data.user.repositories.totalCount
            };
        } catch (error) {
            console.log(`⚠️  GraphQL repositories fetch failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all user repositories using GraphQL with pagination
     * @param {string} username - GitHub username
     * @returns {Promise<Array>} - Array of repository objects
     */
    async getAllUserRepositoriesGraphQL(username) {
        const allRepos = [];
        let after = null;
        let hasNextPage = true;
        
        while (hasNextPage) {
            const result = await this.getUserRepositoriesGraphQL(username, 100, after);
            if (!result) {
                break;
            }
            
            allRepos.push(...result.repos);
            hasNextPage = result.hasNextPage;
            after = result.endCursor;
            
            if (hasNextPage) {
                console.log(`📄 GraphQL: Fetched ${allRepos.length}/${result.totalCount} repositories`);
            }
        }
        
        console.log(`📊 GraphQL: Total repositories fetched: ${allRepos.length}`);
        return allRepos;
    }

    /**
     * Get repositories for an organization or user
     * Only returns repositories owned by the specified owner (not repositories they have access to)
     */
    async getRepositories(ownerName) {
        // Normalize owner name for comparison (case-insensitive)
        const normalizedOwnerName = ownerName.toLowerCase();
        
        // First, determine if this is a user or organization by checking the type
        // This prevents incorrectly classifying users as organizations
        const userProfile = await this.getUser(ownerName);
        const isOrganization = userProfile && userProfile.type === 'Organization';
        
        if (isOrganization) {
            // Fetch repositories using organization endpoint
            console.log(`✅ Found organization: ${ownerName}`);
            const url = `${this.baseUrl}/orgs/${ownerName}/repos?per_page=100`;
            const response = await this.makeRequest(url);
            
            if (response.ok) {
                const repos = await this.getAllPages(url, response);
                // Filter: Only include public repos AND repos owned by this organization
                const filteredRepos = repos.filter(repo => {
                    const isPublic = repo.visibility === 'public';
                    const ownerMatch = repo.owner && 
                        (repo.owner.login?.toLowerCase() === normalizedOwnerName || 
                         repo.full_name?.toLowerCase().startsWith(`${normalizedOwnerName}/`));
                    return isPublic && ownerMatch;
                });
                
                if (filteredRepos.length < repos.length) {
                    console.log(`⚠️  Filtered out ${repos.length - filteredRepos.length} repositories not owned by ${ownerName}`);
                }
                
                return filteredRepos;
            } else if (response.status === 404) {
                throw new Error(`Organization '${ownerName}' not found`);
            } else if (response.status === 403) {
                throw new Error('Access denied. The organization might be private or require authentication.');
            } else {
                throw new Error(`Failed to fetch organization repositories: ${response.status} ${response.statusText}`);
            }
        } else {
            // Fetch repositories using user endpoint
            console.log(`✅ Found user: ${ownerName}`);
            
            // Try GraphQL first for users if enabled and token is available
            if (this.useGraphQL && this.token) {
                try {
                    console.log(`🔷 Attempting GraphQL fetch for user repositories: ${ownerName}`);
                    const repos = await this.getAllUserRepositoriesGraphQL(ownerName);
                    if (repos && repos.length > 0) {
                        // Filter: Only include repos owned by this user
                        const filteredRepos = repos.filter(repo => {
                            const ownerMatch = repo.owner && 
                                (repo.owner.login?.toLowerCase() === normalizedOwnerName || 
                                 repo.full_name?.toLowerCase().startsWith(`${normalizedOwnerName}/`));
                            return ownerMatch;
                        });
                        
                        if (filteredRepos.length < repos.length) {
                            console.log(`⚠️  Filtered out ${repos.length - filteredRepos.length} repositories not owned by ${ownerName}`);
                        }
                        
                        console.log(`✅ Found user (GraphQL): ${ownerName} - ${filteredRepos.length} repositories`);
                        return filteredRepos;
                    }
                } catch (error) {
                    // Fall through to REST API
                    console.log(`ℹ️  GraphQL failed for user ${ownerName}, falling back to REST: ${error.message}`);
                }
            }
            
            // Fallback to REST API
            const url = `${this.baseUrl}/users/${ownerName}/repos?per_page=100`;
            const response = await this.makeRequest(url);
            
            if (response.ok) {
                console.log(`✅ Found user (REST): ${ownerName}`);
                const repos = await this.getAllPages(url, response);
                // Filter: Only include public repos AND repos owned by this user
                const filteredRepos = repos.filter(repo => {
                    const isPublic = repo.visibility === 'public';
                    const ownerMatch = repo.owner && 
                        (repo.owner.login?.toLowerCase() === normalizedOwnerName || 
                         repo.full_name?.toLowerCase().startsWith(`${normalizedOwnerName}/`));
                    return isPublic && ownerMatch;
                });
                
                if (filteredRepos.length < repos.length) {
                    console.log(`⚠️  Filtered out ${repos.length - filteredRepos.length} repositories not owned by ${ownerName}`);
                }
                
                return filteredRepos;
            } else if (response.status === 404) {
                throw new Error(`User '${ownerName}' not found`);
            } else if (response.status === 403) {
                throw new Error('Access denied. The user might be private or require authentication.');
            } else {
                throw new Error(`Failed to fetch user repositories: ${response.status} ${response.statusText}`);
            }
        }
    }

    /**
     * Get all pages from a paginated API endpoint
     * @param {string} url - The URL to fetch
     * @param {Response} firstResponse - Optional: first response already fetched to avoid duplicate request
     */
    async getAllPages(url, firstResponse = null) {
        const allRepos = [];
        let currentUrl = url;
        let response = firstResponse;
        let isFirstPage = !!firstResponse;
        
        while (currentUrl) {
            if (!isFirstPage) {
                console.log(`📄 Fetching page: ${currentUrl}`);
                response = await this.makeRequest(currentUrl);
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch repositories: ${response.status} ${response.statusText}`);
                }
            } else {
                console.log(`📄 Using first page data (avoiding duplicate fetch)`);
                isFirstPage = false; // Reset flag after first use
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
        // Check cache first (including failed requests to avoid retrying)
        const cacheKey = `${owner}/${repo}`;
        if (this.sbomCache.has(cacheKey)) {
            const cached = this.sbomCache.get(cacheKey);
            if (cached === null) {
                console.log(`📦 Cache: SBOM not available for ${cacheKey} (cached failure)`);
                return null;
            }
            console.log(`📦 Cache: Using cached SBOM for ${cacheKey}`);
            return cached;
        }
        
        const url = `${this.baseUrl}/repos/${owner}/${repo}/dependency-graph/sbom`;
        const response = await this.makeRequest(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`ℹ️  SBOM not available for ${owner}/${repo} (dependency graph not enabled or repository not found)`);
                // Cache 404 failures to avoid retrying
                this.sbomCache.set(cacheKey, null);
                return null;
            } else if (response.status === 403) {
                console.log(`⚠️  Access denied for ${owner}/${repo} (private repository or insufficient permissions)`);
                // Cache 403 failures to avoid retrying
                this.sbomCache.set(cacheKey, null);
                return null;
            } else if (response.status === 401) {
                console.log(`⚠️  Authentication required for ${owner}/${repo} (private repository)`);
                // Cache 401 failures to avoid retrying
                this.sbomCache.set(cacheKey, null);
                return null;
            } else if (response.status === 422) {
                console.log(`ℹ️  SBOM not available for ${owner}/${repo} (dependency graph not enabled)`);
                // Cache 422 failures to avoid retrying
                this.sbomCache.set(cacheKey, null);
                return null;
            } else if (response.status === 429) {
                console.log(`⏳ Rate limit exceeded for ${owner}/${repo}, will retry later`);
                // Don't cache 429 errors - we want to retry these
                return null;
            } else {
                console.log(`⚠️  SBOM not available for ${owner}/${repo}: ${response.status} ${response.statusText}`);
                // Cache other failures to avoid retrying
                this.sbomCache.set(cacheKey, null);
                return null;
            }
        }
        
        const sbomData = await response.json();
        
        // Validate SBOM data structure
        if (!sbomData || !sbomData.sbom || !sbomData.sbom.packages) {
            console.log(`ℹ️  SBOM data is empty for ${owner}/${repo}`);
            // Cache the failure to avoid retrying
            this.sbomCache.set(cacheKey, null);
            return null;
        }
        
        // Log success with dependency count
        const packageCount = sbomData.sbom.packages.length;
        console.log(`✅ SBOM fetched for ${owner}/${repo}: ${packageCount} packages found`);
        
        // Cache successful result
        this.sbomCache.set(cacheKey, sbomData);
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
            // Throttle requests to prevent secondary rate limits
            // Only throttle for dependency-graph API calls (most rate-limited)
            if (url.includes('/dependency-graph/sbom')) {
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                if (timeSinceLastRequest < this.minRequestInterval) {
                    const waitTime = this.minRequestInterval - timeSinceLastRequest;
                    await this.sleep(waitTime / 1000); // sleep expects seconds
                }
                this.lastRequestTime = Date.now();
            }
            
            // Debug: Log URL call with context
            const caller = new Error().stack.split('\n')[2]?.trim() || 'unknown';
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: GitHub API call (called from: ${caller})`);
            debugLogUrl(`   Authorization: ${this.headers['Authorization'] ? 'Yes (token set)' : 'No (unauthenticated)'}`);
            
            const response = await fetchWithTimeout(url, {
                method: 'GET',
                headers: this.headers
            });
            
            // Debug: Log response status and extract information
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                let extractedInfo = `Status: ${response.status}, Content-Type: ${contentType}`;
                
                // Try to determine what was extracted based on URL pattern
                if (url.includes('/users/')) {
                    extractedInfo += ', Extracted: User profile data (login, name, location, company, etc.)';
                } else if (url.includes('/repos/') && url.includes('/contributors')) {
                    extractedInfo += ', Extracted: Repository contributors list';
                } else if (url.includes('/repos/') && url.includes('/dependency-graph/sbom')) {
                    extractedInfo += ', Extracted: SBOM data (packages and dependencies)';
                } else if (url.includes('/repos/') && url.includes('/contents/')) {
                    extractedInfo += ', Extracted: File content from repository';
                } else if (url.includes('/repos/')) {
                    extractedInfo += ', Extracted: Repository metadata';
                } else if (url.includes('/rate_limit')) {
                    extractedInfo += ', Extracted: Rate limit information';
                } else if (url.includes('/orgs/') || url.includes('/users/')) {
                    extractedInfo += ', Extracted: Organization/User repositories list';
                }
                
                console.log(`   ✅ Response: ${extractedInfo}`);
            } else {
                console.log(`   ❌ Response: Status ${response.status} ${response.statusText}`);
            }
            
            // Handle rate limiting (403 Forbidden with rate limit headers)
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
            
            // Handle 429 Too Many Requests (explicit rate limit response)
            if (response.status === 429) {
                // Check for Retry-After header (seconds to wait)
                const retryAfter = response.headers.get('Retry-After');
                // Also check X-RateLimit-Reset header
                const reset = response.headers.get('X-RateLimit-Reset');
                
                let waitTime = 0;
                
                if (retryAfter) {
                    waitTime = parseInt(retryAfter, 10);
                } else if (reset) {
                    const resetTime = parseInt(reset, 10);
                    waitTime = resetTime - Math.floor(Date.now() / 1000);
                } else {
                    // Default wait time if no header provided (exponential backoff)
                    waitTime = Math.min(60 * (retryCount + 1), 3600); // Max 1 hour
                }
                
                if (waitTime > 0) {
                    // Warn if no token is set
                    if (!this.token) {
                        console.warn(`⚠️  Rate limit exceeded (429). No GitHub token detected. Unauthenticated requests are limited to 60/hour.`);
                        console.warn(`   Consider adding a GitHub token in Settings for 5000 requests/hour.`);
                    }
                    
                    // Save rate limit state
                    const resetTime = reset ? parseInt(reset, 10) : Math.floor(Date.now() / 1000) + waitTime;
                    this.saveRateLimitState(waitTime, resetTime);
                    
                    // Dispatch rate limit event
                    this.dispatchEvent(new CustomEvent('rateLimitExceeded', {
                        detail: {
                            waitTime,
                            resetTime,
                            resetDate: new Date(resetTime * 1000)
                        }
                    }));
                    
                    console.log(`⏳ Rate limit exceeded (429). Waiting ${waitTime} seconds before retry...`);
                    await this.sleep(waitTime + 2); // Add 2 second buffer
                    
                    // Clear rate limit state after waiting
                    this.clearRateLimitState();
                    
                    // Dispatch rate limit reset event
                    this.dispatchEvent(new CustomEvent('rateLimitReset'));
                    
                    console.log('✅ Rate limit wait complete. Retrying request...');
                    return this.makeRequest(url, retryCount + 1);
                }
            }
            
            return response;
        } catch (error) {
            console.log(`❌ Request failed: ${error.message}`);
            return new Response(null, { status: 500 });
        }
    }

    /**
     * Get tag information
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {string} tag - Tag name (e.g., 'v1.2.3' or '1.2.3')
     * @returns {Promise<Object|null>} - Tag information or null if not found
     */
    async getTag(owner, repo, tag) {
        try {
            // Try with 'v' prefix if not present
            let tagName = tag;
            if (!tag.startsWith('v') && /^\d+/.test(tag)) {
                tagName = `v${tag}`;
            }
            
            // Try both with and without 'v' prefix
            const tagsToTry = [tag, tagName];
            if (tag.startsWith('v')) {
                tagsToTry.push(tag.substring(1));
            }
            
            for (const tryTag of tagsToTry) {
                try {
                    const url = `${this.baseUrl}/repos/${owner}/${repo}/git/refs/tags/${encodeURIComponent(tryTag)}`;
                    const response = await this.makeRequest(url);
                    
                    if (response.ok) {
                        const data = await response.json();
                        // If it's a tag ref, get the actual tag object
                        if (data.object && data.object.type === 'tag') {
                            const tagUrl = `${this.baseUrl}/repos/${owner}/${repo}/git/tags/${data.object.sha}`;
                            const tagResponse = await this.makeRequest(tagUrl);
                            if (tagResponse.ok) {
                                return await tagResponse.json();
                            }
                        } else if (data.object && data.object.type === 'commit') {
                            // Direct commit reference
                            return {
                                commit: { sha: data.object.sha },
                                tag: tryTag
                            };
                        }
                    }
                } catch (error) {
                    // Try next tag variant
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            console.debug(`Failed to get tag ${tag} for ${owner}/${repo}: ${error.message}`);
            return null;
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

    /**
     * Get file content from repository
     */
    async getFileContent(owner, repo, path, ref = 'HEAD') {
        try {
            const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
            const response = await this.makeRequest(url);
            
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`Failed to fetch file: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.encoding === 'base64' && data.content) {
                // Decode base64 and handle UTF-8 properly
                const base64Content = data.content.replace(/\s/g, '');
                try {
                    // Use TextDecoder for proper UTF-8 handling
                    const binaryString = atob(base64Content);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const decoder = new TextDecoder('utf-8', { fatal: false });
                    return decoder.decode(bytes);
                } catch (decodeError) {
                    // Fallback to simple atob if TextDecoder fails
                    return atob(base64Content);
                }
            }
            
            return data.content || '';
        } catch (error) {
            if (error.message && error.message.includes('404')) {
                return null;
            }
            throw error;
        }
    }
}

// Export for use in other modules
window.GitHubClient = GitHubClient; 