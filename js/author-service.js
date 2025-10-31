/**
 * Author Service - Fetches author data from multiple sources
 * Priority: 1) Native registries (npm, PyPI, etc.), 2) deps.dev, 3) ecosyste.ms
 */
class AuthorService {
    constructor() {
        this.ecosystemsBaseUrl = 'https://packages.ecosyste.ms/api/v1';
        this.depsDevBaseUrl = 'https://api.deps.dev/v3alpha';
        this.cache = new Map();
        this.registryCache = null;  // Cache for registry mappings
        this.registryPromise = null;  // Promise for fetching registries
        
        // Registry URLs for direct access
        this.registryUrls = {
            'npm': 'https://registry.npmjs.org',
            'pypi': 'https://pypi.org/pypi',
            'cargo': 'https://crates.io/api/v1/crates',
            'maven': null,  // Maven doesn't have a single registry API
            'golang': null, // Go uses module proxy, doesn't provide author info directly
            'nuget': 'https://api.nuget.org/v3-flatcontainer',
            'gem': 'https://rubygems.org/api/v1/gems'
        };
    }

    /**
     * Fetch registry mappings from ecosyste.ms
     * This provides the authoritative list of registry names and their purl types
     */
    async fetchRegistryMappings() {
        // Return cached data if available
        if (this.registryCache) {
            return this.registryCache;
        }

        // If already fetching, wait for that request
        if (this.registryPromise) {
            return this.registryPromise;
        }

        // Start fetching
        this.registryPromise = (async () => {
            try {
                const response = await fetch(`${this.ecosystemsBaseUrl}/registries/`);
                if (!response.ok) {
                    console.warn('Failed to fetch registry mappings from ecosyste.ms');
                    return this.getDefaultMappings();
                }

                const registries = await response.json();
                
                // Build mapping from purl_type to registry name
                const mapping = {};
                registries.forEach(registry => {
                    if (registry.purl && registry.name) {
                        // Some registries have multiple purl types, handle both string and array
                        const purlTypes = Array.isArray(registry.purl) ? registry.purl : [registry.purl];
                        purlTypes.forEach(purlType => {
                            if (purlType) {
                                mapping[purlType.toLowerCase()] = registry.name;
                            }
                        });
                    }
                });

                console.log('✅ Loaded registry mappings from ecosyste.ms:', Object.keys(mapping).length, 'types');
                this.registryCache = mapping;
                return mapping;
            } catch (error) {
                console.warn('Error fetching registry mappings:', error.message);
                return this.getDefaultMappings();
            } finally {
                this.registryPromise = null;
            }
        })();

        return this.registryPromise;
    }

    /**
     * Get default mappings as fallback
     * Based on https://packages.ecosyste.ms/api/v1/registries
     */
    getDefaultMappings() {
        return {
            // Map purl types to ecosyste.ms registry names
            'npm': 'npmjs.org',
            'pypi': 'pypi.org',
            'cargo': 'crates.io',
            'maven': 'repo1.maven.org',
            'golang': 'proxy.golang.org',
            'go': 'proxy.golang.org',
            'gem': 'rubygems.org',
            'nuget': 'nuget.org',
            'composer': 'packagist.org',
            'packagist': 'packagist.org',
            'docker': 'hub.docker.com'
        };
    }

    /**
     * Fetch authors for a package with funding information
     * @param {string} ecosystem - e.g., 'npm', 'pypi', 'maven'
     * @param {string} packageName - package name
     * @returns {Promise<Object|Array>} - {authors: Array, funding: Object} or just Array for backwards compat
     */
    async fetchAuthors(ecosystem, packageName) {
        const packageKey = `${ecosystem}:${packageName}`;
        
        // Check memory cache first
        if (this.cache.has(packageKey)) {
            return this.cache.get(packageKey);
        }
        
        // Check IndexedDB cache
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            const cached = await this.getCachedAuthors(packageKey);
            if (cached && this.isCacheValid(cached.timestamp)) {
                const result = cached.data || cached.authors;  // Support both new and old format
                this.cache.set(packageKey, result);
                return result;
            }
        }
        
        // Try different sources based on ecosystem
        let authors = [];
        let funding = null;
        
        // Try native registry first (fastest and most reliable)
        if (this.registryUrls[ecosystem]) {
            const result = await this.fetchFromNativeRegistry(ecosystem, packageName);
            // Handle both old format (array) and new format (object with authors/funding)
            if (Array.isArray(result)) {
                authors = result;
            } else {
                authors = result.authors || [];
                funding = result.funding || null;
            }
            
            if (authors.length > 0) {
                console.log(`✅ Found ${authors.length} authors for ${packageKey} from native registry`);
            }
        }
        
        // Fallback to ecosyste.ms if no authors found
        if (authors.length === 0) {
            authors = await this.fetchFromEcosystems(ecosystem, packageName);
            if (authors.length > 0) {
                console.log(`✅ Found ${authors.length} authors for ${packageKey} from ecosyste.ms`);
            }
        }
        
        // If still no authors, try to extract from repository URL
        if (authors.length === 0) {
            const repoAuthors = await this.fetchAuthorsFromRepository(ecosystem, packageName);
            if (repoAuthors.length > 0) {
                console.log(`✅ Found ${repoAuthors.length} repository owners for ${packageKey}`);
                authors = repoAuthors;
            }
        }
        
        // If still no authors, log warning
        if (authors.length === 0) {
            console.warn(`⚠️ No authors found for ${packageKey}`);
            return { authors: [], funding: null };
        }
        
        const result = funding ? { authors, funding } : authors;  // Return object if we have funding, otherwise just array
        
        // Cache in IndexedDB
        if (dbManager && dbManager.db) {
            await this.cacheAuthors({
                packageKey,
                ecosystem,
                packageName,
                data: result,  // Store the full result (either array or object)
                authors: Array.isArray(result) ? result : result.authors,  // For backwards compat with cached.authors
                source: 'multi',
                timestamp: Date.now()
            });
        }
        
        this.cache.set(packageKey, result);
        return result;
    }

    /**
     * Fetch authors and funding from native package registries
     */
    async fetchFromNativeRegistry(ecosystem, packageName) {
        try {
            let url, data;
            
            switch (ecosystem) {
                case 'npm':
                    // npm registry provides full package metadata including funding
                    url = `${this.registryUrls.npm}/${packageName}/latest`;
                    const npmResponse = await fetch(url);
                    if (!npmResponse.ok) return { authors: [], funding: null };
                    data = await npmResponse.json();
                    return {
                        authors: this.extractNpmAuthors(data),
                        funding: this.extractNpmFunding(data)
                    };
                
                case 'pypi':
                    // PyPI JSON API with project URLs
                    url = `${this.registryUrls.pypi}/${packageName}/json`;
                    const pypiResponse = await fetch(url);
                    if (!pypiResponse.ok) return { authors: [], funding: null };
                    data = await pypiResponse.json();
                    return {
                        authors: this.extractPyPiAuthors(data),
                        funding: this.extractPyPiFunding(data)
                    };
                
                case 'cargo':
                    // crates.io API
                    url = `${this.registryUrls.cargo}/${packageName}`;
                    const cargoResponse = await fetch(url);
                    if (!cargoResponse.ok) return { authors: [], funding: null };
                    data = await cargoResponse.json();
                    return {
                        authors: this.extractCargoAuthors(data),
                        funding: null  // Crates.io doesn't have funding field in API
                    };
                
                case 'gem':
                    // RubyGems API
                    url = `${this.registryUrls.gem}/${packageName}.json`;
                    const gemResponse = await fetch(url);
                    if (!gemResponse.ok) return { authors: [], funding: null };
                    data = await gemResponse.json();
                    return {
                        authors: this.extractGemAuthors(data),
                        funding: this.extractGemFunding(data)
                    };
                
                default:
                    return { authors: [], funding: null };
            }
        } catch (error) {
            console.warn(`Error fetching from native registry ${ecosystem}:`, error.message);
            return { authors: [], funding: null };
        }
    }
    
    /**
     * Extract funding information from npm package data
     */
    extractNpmFunding(data) {
        if (!data.funding) return null;
        
        const funding = {};
        
        // funding can be string, object, or array
        if (typeof data.funding === 'string') {
            funding.url = data.funding;
        } else if (Array.isArray(data.funding)) {
            funding.urls = data.funding.map(f => typeof f === 'string' ? f : f.url).filter(Boolean);
            funding.url = funding.urls[0]; // Use first URL as primary
        } else if (data.funding.url) {
            funding.url = data.funding.url;
            funding.type = data.funding.type;
        }
        
        // Check for specific platforms in URLs
        const urls = funding.urls || [funding.url];
        if (urls && urls.length > 0) {
            funding.github = urls.some(u => u && u.includes('github.com/sponsors'));
            funding.opencollective = urls.some(u => u && u.includes('opencollective.com'));
            funding.patreon = urls.some(u => u && u.includes('patreon.com'));
            funding.tidelift = urls.some(u => u && u.includes('tidelift.com'));
        }
        
        return Object.keys(funding).length > 0 ? funding : null;
    }
    
    /**
     * Extract funding information from PyPI package data
     */
    extractPyPiFunding(data) {
        if (!data.info || !data.info.project_urls) return null;
        
        const urls = data.info.project_urls;
        const funding = {};
        
        // Check common funding keywords in project URLs
        for (const [key, url] of Object.entries(urls)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('funding') || lowerKey.includes('sponsor') || 
                lowerKey.includes('donate') || lowerKey.includes('support')) {
                if (!funding.urls) funding.urls = [];
                funding.urls.push(url);
                funding.url = funding.url || url;  // Set first as primary
                
                // Detect specific platforms
                if (url.includes('github.com/sponsors')) funding.github = true;
                if (url.includes('opencollective.com')) funding.opencollective = true;
                if (url.includes('patreon.com')) funding.patreon = true;
            }
        }
        
        return Object.keys(funding).length > 0 ? funding : null;
    }
    
    /**
     * Extract funding information from RubyGems package data
     */
    extractGemFunding(data) {
        const fundingUrl = data.funding_uri || data.metadata?.funding_uri;
        if (!fundingUrl) return null;
        
        const funding = { url: fundingUrl };
        
        // Detect specific platforms
        if (fundingUrl.includes('github.com/sponsors')) funding.github = true;
        if (fundingUrl.includes('opencollective.com')) funding.opencollective = true;
        if (fundingUrl.includes('patreon.com')) funding.patreon = true;
        
        return funding;
    }

    /**
     * Fetch authors from ecosyste.ms
     */
    async fetchFromEcosystems(ecosystem, packageName) {
        try {
            // Get the correct registry name from ecosyste.ms API
            const registryMappings = await this.fetchRegistryMappings();
            const registryName = registryMappings[ecosystem.toLowerCase()] || ecosystem;
            
            const url = `${this.ecosystemsBaseUrl}/registries/${registryName}/packages/${encodeURIComponent(packageName)}`;
            
            console.log(`🔍 Fetching from ecosyste.ms: ${ecosystem} → ${registryName} (${url})`);
            
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`ecosyste.ms returned ${response.status} for ${registryName}/${packageName}`);
                return [];
            }
            
            const data = await response.json();
            return this.extractEcosystemsAuthors(data);
        } catch (error) {
            console.warn(`Error fetching from ecosyste.ms:`, error.message);
            return [];
        }
    }

    /**
     * Extract repository owner/org from URLs as fallback authors
     */
    async fetchAuthorsFromRepository(ecosystem, packageName) {
        try {
            let repositoryUrl = null;
            
            // For Go packages, the package name often IS the repository path
            if (ecosystem === 'golang' && packageName.includes('github.com/')) {
                const match = packageName.match(/github\.com\/([^\/]+)/);
                if (match) {
                    return [`github:${match[1]}`];
                }
            }
            
            if (ecosystem === 'golang' && packageName.includes('bitbucket.org/')) {
                const match = packageName.match(/bitbucket\.org\/([^\/]+)/);
                if (match) {
                    return [`bitbucket:${match[1]}`];
                }
            }
            
            // Try to get repository URL from package metadata
            repositoryUrl = await this.getRepositoryUrl(ecosystem, packageName);
            
            if (!repositoryUrl) {
                return [];
            }
            
            // Extract owner from repository URL
            const repoOwners = this.extractRepoOwnerFromUrl(repositoryUrl);
            return repoOwners;
            
        } catch (error) {
            console.warn(`Error extracting repository authors:`, error.message);
            return [];
        }
    }

    /**
     * Get repository URL from package metadata
     */
    async getRepositoryUrl(ecosystem, packageName) {
        try {
            let data, url;
            
            switch (ecosystem) {
                case 'npm':
                    url = `${this.registryUrls.npm}/${packageName}/latest`;
                    const npmResponse = await fetch(url);
                    if (!npmResponse.ok) return null;
                    data = await npmResponse.json();
                    if (data.repository) {
                        return typeof data.repository === 'string' ? data.repository : data.repository.url;
                    }
                    break;
                
                case 'pypi':
                    url = `${this.registryUrls.pypi}/${packageName}/json`;
                    const pypiResponse = await fetch(url);
                    if (!pypiResponse.ok) return null;
                    data = await pypiResponse.json();
                    if (data.info && data.info.project_urls) {
                        return data.info.project_urls.Source || 
                               data.info.project_urls.Homepage || 
                               data.info.project_urls.Repository;
                    }
                    break;
                
                case 'cargo':
                    url = `${this.registryUrls.cargo}/${packageName}`;
                    const cargoResponse = await fetch(url);
                    if (!cargoResponse.ok) return null;
                    data = await cargoResponse.json();
                    if (data.crate && data.crate.repository) {
                        return data.crate.repository;
                    }
                    break;
                
                case 'gem':
                    url = `${this.registryUrls.gem}/${packageName}.json`;
                    const gemResponse = await fetch(url);
                    if (!gemResponse.ok) return null;
                    data = await gemResponse.json();
                    if (data.source_code_uri || data.homepage_uri) {
                        return data.source_code_uri || data.homepage_uri;
                    }
                    break;
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Extract repository owner/org from URL
     * Returns array with prefix like ["github:username", "github:orgname"]
     */
    extractRepoOwnerFromUrl(url) {
        if (!url) return [];
        
        const owners = [];
        
        // Clean up git+https:// and .git suffixes
        const cleanUrl = url.replace(/^git\+/, '').replace(/\.git$/, '');
        
        // GitHub
        const githubMatch = cleanUrl.match(/github\.com[\/:]([^\/]+)/i);
        if (githubMatch) {
            owners.push(`github:${githubMatch[1]}`);
        }
        
        // Bitbucket
        const bitbucketMatch = cleanUrl.match(/bitbucket\.org[\/:]([^\/]+)/i);
        if (bitbucketMatch) {
            owners.push(`bitbucket:${bitbucketMatch[1]}`);
        }
        
        // GitLab
        const gitlabMatch = cleanUrl.match(/gitlab\.com[\/:]([^\/]+)/i);
        if (gitlabMatch) {
            owners.push(`gitlab:${gitlabMatch[1]}`);
        }
        
        return owners;
    }

    /**
     * Extract authors from npm registry response
     */
    extractNpmAuthors(data) {
        const authorObjects = [];
        
        // Collect author objects with both name and email
        if (data.author) {
            if (typeof data.author === 'string') {
                authorObjects.push({ name: data.author, email: null });
            } else {
                authorObjects.push({ 
                    name: data.author.name || null, 
                    email: data.author.email || null 
                });
            }
        }
        
        if (data.maintainers && Array.isArray(data.maintainers)) {
            data.maintainers.forEach(m => {
                if (m && (m.name || m.email)) {
                    authorObjects.push({ 
                        name: m.name || null, 
                        email: m.email || null 
                    });
                }
            });
        }
        
        if (data.contributors && Array.isArray(data.contributors)) {
            data.contributors.forEach(c => {
                if (typeof c === 'string') {
                    authorObjects.push({ name: c, email: null });
                } else if (c && (c.name || c.email)) {
                    authorObjects.push({ 
                        name: c.name || null, 
                        email: c.email || null 
                    });
                }
            });
        }
        
        // Deduplicate by email first, then by similar names
        return this.deduplicateAuthorsByEmail(authorObjects);
    }
    
    /**
     * Normalize author name for comparison
     */
    normalizeAuthorName(name) {
        if (!name) return '';
        return name.toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9]/g, '');
    }
    
    /**
     * Check if two author names are similar (username vs full name)
     */
    areSimilarAuthors(name1, name2) {
        const norm1 = this.normalizeAuthorName(name1);
        const norm2 = this.normalizeAuthorName(name2);
        
        // Exact match after normalization
        if (norm1 === norm2) return true;
        
        // Check if one is contained in the other (e.g., "cowboy" in "cowboybenalman", "sindresorhus" in "sindresorhus")
        if (norm1.includes(norm2) || norm2.includes(norm1)) {
            // Only if they're reasonably close in length (lowered threshold to catch username vs full name)
            const lenRatio = Math.min(norm1.length, norm2.length) / Math.max(norm1.length, norm2.length);
            if (lenRatio > 0.3) return true;  // Changed from 0.5 to 0.3 to catch cases like "cowboy" vs "cowboybenalman" (0.4 ratio)
        }
        
        return false;
    }
    
    /**
     * Deduplicate authors by email (primary key) and similar names (fallback)
     * Prefer full names over usernames, and names over emails
     */
    deduplicateAuthorsByEmail(authorObjects) {
        if (authorObjects.length === 0) return [];
        
        // Step 1: Group by email (most reliable deduplication)
        const emailMap = new Map();
        const noEmailAuthors = [];
        
        authorObjects.forEach(author => {
            if (author.email) {
                const existing = emailMap.get(author.email);
                if (!existing) {
                    emailMap.set(author.email, author);
                } else {
                    // Same email - keep the better name (prefer longer, non-null names)
                    if (author.name && (!existing.name || author.name.length > existing.name.length)) {
                        emailMap.set(author.email, { name: author.name, email: author.email });
                    }
                }
            } else if (author.name) {
                noEmailAuthors.push(author);
            }
        });
        
        // Step 2: Deduplicate authors without emails by similar names
        const mergedNoEmail = this.deduplicateSimilarNames(noEmailAuthors);
        
        // Step 3: Cross-check noEmailAuthors against emailAuthors for similar names
        // If a no-email author matches an email author, upgrade the email author's name if better
        const emailAuthors = Array.from(emailMap.values());
        const finalAuthors = [];
        const usedNoEmailIndices = new Set();
        
        emailAuthors.forEach(emailAuthor => {
            let bestName = emailAuthor.name;
            let bestEmail = emailAuthor.email;
            
            // Check if any no-email author is similar
            mergedNoEmail.forEach((noEmailAuthor, idx) => {
                if (usedNoEmailIndices.has(idx)) return;
                
                if (noEmailAuthor.name && emailAuthor.name && 
                    this.areSimilarAuthors(noEmailAuthor.name, emailAuthor.name)) {
                    // Prefer the longer/fuller name
                    if (noEmailAuthor.name.length > bestName.length) {
                        bestName = noEmailAuthor.name;
                    }
                    usedNoEmailIndices.add(idx);
                }
            });
            
            finalAuthors.push({ name: bestName, email: bestEmail });
        });
        
        // Step 4: Add remaining no-email authors that weren't matched
        mergedNoEmail.forEach((author, idx) => {
            if (!usedNoEmailIndices.has(idx)) {
                finalAuthors.push(author);
            }
        });
        
        // Step 5: Extract names (prefer name over email) and remove duplicates
        const finalNames = finalAuthors.map(a => a.name || a.email).filter(Boolean);
        return [...new Set(finalNames)];
    }
    
    /**
     * Deduplicate similar names when email is not available
     */
    deduplicateSimilarNames(authorObjects) {
        if (authorObjects.length === 0) return [];
        
        const merged = [];
        const used = new Set();
        
        for (let i = 0; i < authorObjects.length; i++) {
            if (used.has(i)) continue;
            
            const author1 = authorObjects[i];
            let bestMatch = author1;
            used.add(i);
            
            // Find all similar authors
            for (let j = i + 1; j < authorObjects.length; j++) {
                if (used.has(j)) continue;
                
                const author2 = authorObjects[j];
                if (author1.name && author2.name && this.areSimilarAuthors(author1.name, author2.name)) {
                    // Keep the longer name (usually the full name vs username)
                    if (author2.name.length > bestMatch.name.length) {
                        bestMatch = author2;
                    }
                    used.add(j);
                }
            }
            
            merged.push(bestMatch);
        }
        
        return merged;
    }
    
    /**
     * Deduplicate authors - prefer names over emails
     */
    deduplicateAuthors(authors) {
        const uniqueAuthors = new Set();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        // First pass: add all non-email entries
        authors.forEach(author => {
            if (author && !emailPattern.test(author.trim())) {
                uniqueAuthors.add(author);
            }
        });
        
        // Second pass: add emails only if no name was found
        if (uniqueAuthors.size === 0) {
            authors.forEach(author => {
                if (author && emailPattern.test(author.trim())) {
                    uniqueAuthors.add(author);
                }
            });
        }
        
        return [...uniqueAuthors];
    }

    /**
     * Extract authors from PyPI response
     */
    extractPyPiAuthors(data) {
        const authorObjects = [];
        
        if (data.info) {
            // Collect author with email
            if (data.info.author || data.info.author_email) {
                authorObjects.push({
                    name: data.info.author || null,
                    email: data.info.author_email || null
                });
            }
            
            // Collect maintainer with email
            if (data.info.maintainer || data.info.maintainer_email) {
                authorObjects.push({
                    name: data.info.maintainer || null,
                    email: data.info.maintainer_email || null
                });
            }
        }
        
        // Use email-based deduplication
        return this.deduplicateAuthorsByEmail(authorObjects);
    }

    /**
     * Extract authors from crates.io response
     * Note: crates.io doesn't provide emails, only usernames and names
     */
    extractCargoAuthors(data) {
        const authorObjects = [];
        
        // Try to get from owners/maintainers if available
        if (data.users && Array.isArray(data.users)) {
            data.users.forEach(user => {
                if (user) {
                    authorObjects.push({
                        name: user.name || user.login || null,
                        email: user.login || null  // Use login as pseudo-email for dedup
                    });
                }
            });
        }
        
        // Fallback to authors array (usually formatted strings)
        if (data.crate && data.crate.authors && Array.isArray(data.crate.authors)) {
            data.crate.authors.forEach(author => {
                if (author) {
                    authorObjects.push({ name: author, email: null });
                }
            });
        }
        
        if (data.versions && Array.isArray(data.versions) && data.versions[0]) {
            const latestVersion = data.versions[0];
            if (latestVersion.authors && Array.isArray(latestVersion.authors)) {
                latestVersion.authors.forEach(author => {
                    if (author) {
                        authorObjects.push({ name: author, email: null });
                    }
                });
            }
        }
        
        // Use email-based deduplication (will fallback to name similarity for no-email authors)
        return this.deduplicateAuthorsByEmail(authorObjects);
    }

    /**
     * Extract authors from RubyGems response
     * Note: RubyGems doesn't provide emails in the API
     */
    extractGemAuthors(data) {
        const authorObjects = [];
        
        if (data.authors) {
            if (typeof data.authors === 'string') {
                authorObjects.push({ name: data.authors, email: null });
            } else if (Array.isArray(data.authors)) {
                data.authors.forEach(author => {
                    if (author) {
                        authorObjects.push({ name: author, email: null });
                    }
                });
            }
        }
        
        // Use name-based deduplication (no emails available)
        return this.deduplicateAuthorsByEmail(authorObjects);
    }

    /**
     * Extract authors from ecosyste.ms response
     * ecosyste.ms provides: {login, name, email} for maintainers
     */
    extractEcosystemsAuthors(data) {
        const authorObjects = [];
        
        // ecosyste.ms provides maintainers with login, name, and email
        if (data.maintainers && Array.isArray(data.maintainers)) {
            data.maintainers.forEach(m => {
                if (m) {
                    authorObjects.push({
                        name: m.name || m.login || null,  // Prefer name, fallback to login
                        email: m.email || m.login || null  // Use login as pseudo-email if no real email
                    });
                }
            });
        }
        
        // Also check owners field (some registries use this)
        if (data.owners && Array.isArray(data.owners)) {
            data.owners.forEach(o => {
                if (o) {
                    authorObjects.push({
                        name: o.name || o.login || null,
                        email: o.email || o.login || null
                    });
                }
            });
        }
        
        // Single author field (less common in ecosyste.ms)
        if (data.author) {
            if (typeof data.author === 'string') {
                authorObjects.push({ name: data.author, email: null });
            } else {
                authorObjects.push({
                    name: data.author.name || data.author.login || null,
                    email: data.author.email || null
                });
            }
        }
        
        // Use email/login-based deduplication
        return this.deduplicateAuthorsByEmail(authorObjects);
    }

    /**
     * Check if cache is still valid (24 hours)
     */
    isCacheValid(timestamp) {
        const oneDay = 24 * 60 * 60 * 1000;
        return Date.now() - timestamp < oneDay;
    }

    /**
     * Batch fetch authors for multiple packages with funding information
     */
    async fetchAuthorsForPackages(packages, onProgress) {
        const results = new Map();
        let processed = 0;
        
        for (const pkg of packages) {
            // fetchAuthors now returns {authors: [...], funding: {...}} or just [...]
            const authorData = await this.fetchAuthors(pkg.ecosystem, pkg.name);
            const authors = Array.isArray(authorData) ? authorData : (authorData.authors || []);
            const funding = Array.isArray(authorData) ? null : (authorData.funding || null);
            
            // Store authors with appropriate prefix
            authors.forEach(author => {
                let authorKey, authorName, authorSource;
                
                // Check if author already has a prefix (github:, bitbucket:, gitlab:)
                if (author.includes(':')) {
                    authorKey = author;  // Already prefixed (e.g., "github:jackc")
                    const parts = author.split(':');
                    authorSource = parts[0];  // "github", "bitbucket", "gitlab"
                    authorName = parts[1];    // "jackc"
                } else {
                    // Regular author, use ecosystem prefix
                    authorKey = `${pkg.ecosystem}:${author}`;
                    authorSource = pkg.ecosystem;
                    authorName = author;
                }
                
                if (!results.has(authorKey)) {
                    results.set(authorKey, {
                        author: authorName,
                        ecosystem: authorSource,  // Will be "github", "bitbucket", "gitlab", or ecosystem name
                        count: 0,
                        packages: [],
                        funding: null  // Will be set if any package has funding
                    });
                }
                const entry = results.get(authorKey);
                entry.count++;
                entry.packages.push(pkg.name);
                
                // If this package has funding info, store it for the author
                // We only need one funding entry per author even if they have multiple packages
                if (funding && !entry.funding) {
                    entry.funding = funding;
                }
            });
            
            processed++;
            if (onProgress) {
                onProgress(processed, packages.length);
            }
            
            // Rate limiting: wait 100ms between requests
            await this.sleep(100);
        }
        
        return results;
    }

    /**
     * Get cached authors from IndexedDB
     */
    async getCachedAuthors(packageKey) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = window.indexedDBManager.db.transaction(['authors'], 'readonly');
                const store = transaction.objectStore('authors');
                const request = store.get(packageKey);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                resolve(null);
            }
        });
    }

    /**
     * Cache authors in IndexedDB
     */
    async cacheAuthors(data) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = window.indexedDBManager.db.transaction(['authors'], 'readwrite');
                const store = transaction.objectStore('authors');
                const request = store.put(data);
                
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            } catch (error) {
                console.warn('Failed to cache authors:', error);
                resolve(false);
            }
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

window.AuthorService = AuthorService;

