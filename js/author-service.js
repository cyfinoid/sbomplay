/**
 * Author Service - Fetches author data from multiple sources
 * Priority: 1) Native registries (npm, PyPI, etc.), 2) deps.dev, 3) ecosyste.ms
 */
class AuthorService {
    constructor() {
        this.depsDevBaseUrl = 'https://api.deps.dev/v3alpha';
        
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
        
        // Initialize registry list on startup (using shared RegistryManager)
        if (window.registryManager) {
            window.registryManager.initializeRegistries();
        }
    }

    /**
     * Securely check if a URL belongs to a specific hostname
     * Delegates to the shared utility function from utils.js
     * @param {string} url - The URL to check
     * @param {string} hostname - The expected hostname (e.g., "github.com", "tidelift.com")
     * @param {string} pathPrefix - Optional path prefix to check (e.g., "/sponsors")
     * @returns {boolean} - True if URL belongs to the hostname
     */
    isUrlFromHostname(url, hostname, pathPrefix = '') {
        return isUrlFromHostname(url, hostname, pathPrefix);
    }

    /**
     * Fetch registry mappings from ecosyste.ms (uses cached data)
     * This provides the authoritative list of registry names and their purl types
     */
    async fetchRegistryMappings() {
        if (!window.registryManager) {
            return this.getDefaultMappings();
        }
        return await window.registryManager.fetchRegistryMappings();
    }
    
    /**
     * Find registry object by purl type
     * Prefers registries with default: true when multiple exist for same purl_type
     */
    findRegistryByPurl(purlType) {
        if (!window.registryManager) {
            return null;
        }
        return window.registryManager.findRegistryByPurl(purlType);
    }

    /**
     * Get default mappings as fallback
     * Based on https://packages.ecosyste.ms/api/v1/registries
     */
    getDefaultMappings() {
        if (window.registryManager) {
            return window.registryManager.getDefaultMappings();
        }
        // Fallback if registryManager not available
        return {
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
        
        // Check unified cache first (NEW ARCHITECTURE)
        if (window.cacheManager) {
            const cachedAuthors = await window.cacheManager.getPackageAuthors(packageKey);
            if (cachedAuthors && cachedAuthors.length > 0) {
                console.log(`📦 Cache: Found ${cachedAuthors.length} cached authors for ${packageKey}`);
                
                // Convert to return format (array or object with funding)
                const authors = cachedAuthors.map(a => {
                    // Return in format compatible with old code
                    if (a.name || a.author) {
                        return {
                            name: a.name || a.author,
                            email: a.email || null,
                            metadata: a.metadata || null,
                            isMaintainer: a.isMaintainer || false
                        };
                    }
                    return a.author || a.name;
                });
                
                // Check for funding info (from any author)
                const funding = cachedAuthors.find(a => a.funding)?.funding || null;
                
                const result = funding ? { authors, funding } : authors;
                
                // cacheManager already handles in-memory caching
                return result;
            }
        }
        
        // Check IndexedDB cache (legacy format for backward compatibility)
        const dbManager = window.indexedDBManager;
        if (dbManager && dbManager.db) {
            const cached = await this.getCachedAuthors(packageKey);
            if (cached && this.isCacheValid(cached.timestamp)) {
                const result = cached.data || cached.authors;
                // cacheManager already handles caching
                return result;
            }
        }
        
        // If not in cache, fetch from APIs
        console.log(`🔍 Fetching authors for ${packageKey} from APIs...`);
        let authors = [];
        let funding = null;
        
        // Try native registry first (fastest and most reliable)
        if (this.registryUrls[ecosystem]) {
            const result = await this.fetchFromNativeRegistry(ecosystem, packageName);
            // Handle both old format (array) and new format (object with authors/packageFunding)
            if (Array.isArray(result)) {
                authors = result;
            } else {
                authors = result.authors || [];
                funding = result.packageFunding || null;  // Renamed from funding to packageFunding
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
        
        // Save to new cache architecture (packageFunding stored separately in package cache)
        // ALWAYS save package to cache, even if no authors found
        // This ensures incremental storage during analysis
        if (authors.length === 0) {
            console.warn(`⚠️ No authors found for ${packageKey} - saving package metadata only`);
        }
        
        // Save package and authors to cache immediately (incremental save)
        // This happens for EVERY package discovered, regardless of whether authors were found
        await this.saveAuthorsToCache(packageKey, ecosystem, authors, funding);
        console.log(`💾 Author: Saved package ${packageKey} to cache immediately (${authors.length} authors)`);
        
        // Also save to legacy cache for backward compatibility
        // Note: In legacy cache, we still use "funding" key for compatibility
        if (dbManager && dbManager.db) {
            const result = funding ? { authors, funding } : authors;
            await this.cacheAuthors({
                packageKey,
                ecosystem,
                packageName,
                data: result,
                authors: authors,
                source: 'multi',
                timestamp: Date.now()
            });
        }
        
        // Return format: {authors, funding} where funding is packageFunding (for backward compatibility)
        const result = funding ? { authors, funding } : authors;
        // cacheManager already handles caching via saveAuthorsToCache
        return result;
    }

    /**
     * Save authors to new cache architecture (authorEntities + packageAuthors)
     * @param {string} packageKey - Package identifier
     * @param {string} ecosystem - Ecosystem name
     * @param {Array} authors - Array of author objects or strings
     * @param {Object} packageFunding - Package-level funding (from package.json) - stored in package cache, NOT author entity
     */
    async saveAuthorsToCache(packageKey, ecosystem, authors, packageFunding = null) {
        if (!window.cacheManager) return;

        // ALWAYS save package metadata to package cache (even if no funding or no authors)
        // This ensures all packages are tracked in the normalized cache
        const existingPackage = await window.cacheManager.getPackage(packageKey);
        const packageData = existingPackage || {
            packageKey: packageKey,
            ecosystem: ecosystem,
            name: packageKey.split(':')[1] || packageKey
        };
        
        // Add or update funding if available
        if (packageFunding) {
            packageData.funding = packageFunding;  // Package-level funding
        }
        
        // Save package to cache immediately (with or without funding, with or without authors)
        await window.cacheManager.savePackage(packageKey, packageData);
        console.log(`📦 Saved package to cache: ${packageKey}${packageFunding ? ' (with funding)' : ''}${authors.length === 0 ? ' (no authors)' : ''}`);

        // Process each author (if any)
        if (!authors || authors.length === 0) {
            // Package saved but no authors to process
            return;
        }

        for (const author of authors) {
            // Extract author info
            let authorString, authorMetadata, isMaintainer;
            if (typeof author === 'string') {
                authorString = author;
                authorMetadata = null;
                isMaintainer = false;
            } else if (author && typeof author === 'object') {
                authorString = author.name || author.author || '';
                authorMetadata = author.metadata || null;
                isMaintainer = author.isMaintainer || false;
            } else {
                continue; // Skip invalid authors
            }

            if (!authorString) continue;

            // Determine authorKey
            let authorKey, authorName, authorSource;
            if (authorString.includes(':')) {
                authorKey = authorString;  // Already prefixed (e.g., "github:jackc")
                const parts = authorString.split(':');
                authorSource = parts[0];
                authorName = parts[1];
            } else {
                authorKey = `${ecosystem}:${authorString}`;
                authorSource = ecosystem;
                authorName = authorString;
            }

            // Check if author entity already exists
            let authorEntity = await window.cacheManager.getAuthorEntity(authorKey);
            
            if (!authorEntity) {
                // Create new author entity (NO package funding here - that's stored with package)
                authorEntity = {
                    author: authorName,
                    ecosystem: authorSource,
                    email: authorMetadata?.email || null,
                    metadata: authorMetadata || null,
                    funding: null  // Author-level funding will be fetched separately if needed
                };
                await window.cacheManager.saveAuthorEntity(authorKey, authorEntity);
                console.log(`👤 Saved new author entity: ${authorKey}`);
            } else {
                // Update existing entity if we have new information
                // Note: We don't store package funding in author entity
                let updated = false;
                if (authorMetadata && !authorEntity.metadata) {
                    authorEntity.metadata = authorMetadata;
                    updated = true;
                }
                if (updated) {
                    await window.cacheManager.saveAuthorEntity(authorKey, authorEntity);
                    console.log(`👤 Updated author entity: ${authorKey}`);
                }
            }

            // Fetch author-level funding if we have GitHub username or email
            // This will be done asynchronously and updated separately
            if (authorMetadata?.github || authorMetadata?.email) {
                this.fetchAuthorFunding(authorKey, authorEntity).catch(err => 
                    console.warn(`Failed to fetch author funding for ${authorKey}:`, err)
                );
            }

            // Save package-author relationship (junction table)
            await window.cacheManager.savePackageAuthorRelationship(packageKey, authorKey, isMaintainer);
        }
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
                    if (!npmResponse.ok) return { authors: [], packageFunding: null };
                    data = await npmResponse.json();
                    return {
                        authors: this.extractNpmAuthors(data),
                        packageFunding: this.extractNpmFunding(data)  // Package-level funding (from package.json)
                    };
                
                case 'pypi':
                    // PyPI JSON API with project URLs
                    url = `${this.registryUrls.pypi}/${packageName}/json`;
                    const pypiResponse = await fetch(url);
                    if (!pypiResponse.ok) return { authors: [], packageFunding: null };
                    data = await pypiResponse.json();
                    return {
                        authors: this.extractPyPiAuthors(data),
                        packageFunding: this.extractPyPiFunding(data)  // Package-level funding (from project_urls)
                    };
                
                case 'cargo':
                    // crates.io API
                    url = `${this.registryUrls.cargo}/${packageName}`;
                    const cargoResponse = await fetch(url);
                    if (!cargoResponse.ok) return { authors: [], packageFunding: null };
                    data = await cargoResponse.json();
                    return {
                        authors: this.extractCargoAuthors(data),
                        packageFunding: null  // Crates.io doesn't have funding field in API
                    };
                
                case 'gem':
                    // RubyGems API
                    url = `${this.registryUrls.gem}/${packageName}.json`;
                    const gemResponse = await fetch(url);
                    if (!gemResponse.ok) return { authors: [], packageFunding: null };
                    data = await gemResponse.json();
                    return {
                        authors: this.extractGemAuthors(data),
                        packageFunding: this.extractGemFunding(data)  // Package-level funding
                    };
                
                default:
                    return { authors: [], packageFunding: null };
            }
        } catch (error) {
            console.warn(`Error fetching from native registry ${ecosystem}:`, error.message);
            return { authors: [], packageFunding: null };
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
            // Handle array of funding objects
            funding.urls = data.funding.map(f => typeof f === 'string' ? f : f.url).filter(Boolean);
            funding.url = funding.urls[0]; // Use first URL as primary
            
            // Store URLs per platform type
            data.funding.forEach(f => {
                const url = typeof f === 'string' ? f : f.url;
                const type = typeof f === 'string' ? null : f.type;
                
                if (!url) return;
                
                // Check by type first, then by URL pattern (secure hostname validation)
                if (type === 'github' || this.isUrlFromHostname(url, 'github.com', '/sponsors')) {
                    funding.github = true;
                    funding.githubUrl = url;
                }
                if (type === 'patreon' || this.isUrlFromHostname(url, 'patreon.com')) {
                    funding.patreon = true;
                    funding.patreonUrl = url;
                }
                if (type === 'opencollective' || this.isUrlFromHostname(url, 'opencollective.com')) {
                    funding.opencollective = true;
                    funding.opencollectiveUrl = url;
                }
                if (type === 'tidelift' || this.isUrlFromHostname(url, 'tidelift.com')) {
                    funding.tidelift = true;
                    funding.tideliftUrl = url;
                }
            });
        } else if (data.funding.url) {
            funding.url = data.funding.url;
            funding.type = data.funding.type;
            
            // Set platform flags based on URL (secure hostname validation)
            if (this.isUrlFromHostname(funding.url, 'github.com', '/sponsors')) {
                funding.github = true;
                funding.githubUrl = funding.url;
            }
            if (this.isUrlFromHostname(funding.url, 'patreon.com')) {
                funding.patreon = true;
                funding.patreonUrl = funding.url;
            }
            if (this.isUrlFromHostname(funding.url, 'opencollective.com')) {
                funding.opencollective = true;
                funding.opencollectiveUrl = funding.url;
            }
            if (this.isUrlFromHostname(funding.url, 'tidelift.com')) {
                funding.tidelift = true;
                funding.tideliftUrl = funding.url;
            }
        }
        
        // Fallback: Check for specific platforms in URLs if not already set (secure hostname validation)
        const urls = funding.urls || [funding.url];
        if (urls && urls.length > 0) {
            if (!funding.github) {
                funding.github = urls.some(u => u && this.isUrlFromHostname(u, 'github.com', '/sponsors'));
                if (funding.github && !funding.githubUrl) {
                    funding.githubUrl = urls.find(u => u && this.isUrlFromHostname(u, 'github.com', '/sponsors'));
                }
            }
            if (!funding.opencollective) {
                funding.opencollective = urls.some(u => u && this.isUrlFromHostname(u, 'opencollective.com'));
                if (funding.opencollective && !funding.opencollectiveUrl) {
                    funding.opencollectiveUrl = urls.find(u => u && this.isUrlFromHostname(u, 'opencollective.com'));
                }
            }
            if (!funding.patreon) {
                funding.patreon = urls.some(u => u && this.isUrlFromHostname(u, 'patreon.com'));
                if (funding.patreon && !funding.patreonUrl) {
                    funding.patreonUrl = urls.find(u => u && this.isUrlFromHostname(u, 'patreon.com'));
                }
            }
            if (!funding.tidelift) {
                funding.tidelift = urls.some(u => u && this.isUrlFromHostname(u, 'tidelift.com'));
                if (funding.tidelift && !funding.tideliftUrl) {
                    funding.tideliftUrl = urls.find(u => u && this.isUrlFromHostname(u, 'tidelift.com'));
                }
            }
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
                
                // Detect specific platforms (secure hostname validation)
                if (this.isUrlFromHostname(url, 'github.com', '/sponsors')) funding.github = true;
                if (this.isUrlFromHostname(url, 'opencollective.com')) funding.opencollective = true;
                if (this.isUrlFromHostname(url, 'patreon.com')) funding.patreon = true;
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
        
        // Detect specific platforms (secure hostname validation)
        if (this.isUrlFromHostname(fundingUrl, 'github.com', '/sponsors')) funding.github = true;
        if (this.isUrlFromHostname(fundingUrl, 'opencollective.com')) funding.opencollective = true;
        if (this.isUrlFromHostname(fundingUrl, 'patreon.com')) funding.patreon = true;
        
        return funding;
    }

    /**
     * Fetch author-level funding from GitHub profiles, author.json files, etc.
     * This is separate from package-level funding (from package.json)
     * @param {string} authorKey - Author identifier (e.g., "github:username" or "pypi:authorName")
     * @param {Object} authorEntity - Existing author entity
     * @returns {Promise<Object|null>} - Author-level funding information
     */
    async fetchAuthorFunding(authorKey, authorEntity) {
        // If author already has funding, don't refetch
        if (authorEntity?.funding) {
            return authorEntity.funding;
        }

        const githubUsername = authorEntity?.metadata?.github;
        if (!githubUsername) {
            return null;  // Can't fetch without GitHub username
        }

        try {
            // Try fetching from GitHub profile JSON files
            // GitHub supports profile.json at root of user's .github repository
            const githubProfileJsonUrl = `https://raw.githubusercontent.com/${githubUsername}/.github/main/profile.json`;
            let response = await fetch(githubProfileJsonUrl, { 
                method: 'HEAD',  // Check if file exists without downloading
                cache: 'no-cache'
            });

            if (response.ok) {
                // File exists, fetch it
                response = await fetch(githubProfileJsonUrl, { cache: 'no-cache' });
                if (response.ok) {
                    const profile = await response.json();
                    if (profile.sponsor && profile.sponsor.github) {
                        const funding = {
                            url: `https://github.com/sponsors/${githubUsername}`,
                            github: true
                        };
                        // Update author entity with funding
                        authorEntity.funding = funding;
                        await window.cacheManager.saveAuthorEntity(authorKey, authorEntity);
                        return funding;
                    }
                }
            }

            // Try alternative: .github/FUNDING.yml (GitHub Sponsors)
            const fundingYmlUrl = `https://raw.githubusercontent.com/${githubUsername}/.github/main/FUNDING.yml`;
            response = await fetch(fundingYmlUrl, { cache: 'no-cache' });
            if (response.ok) {
                const yml = await response.text();
                // Simple parsing for FUNDING.yml
                const githubMatch = yml.match(/github:\s*(\S+)/i);
                const customMatch = yml.match(/custom:\s*(\S+)/i);
                
                if (githubMatch) {
                    const username = githubMatch[1].replace(/['"]/g, '');
                    const funding = {
                        url: `https://github.com/sponsors/${username}`,
                        github: true
                    };
                    authorEntity.funding = funding;
                    await window.cacheManager.saveAuthorEntity(authorKey, authorEntity);
                    return funding;
                }
                
                if (customMatch) {
                    const url = customMatch[1].replace(/['"]/g, '');
                    const funding = { url: url };
                    
                    // Detect platform (secure hostname validation)
                    if (this.isUrlFromHostname(url, 'opencollective.com')) funding.opencollective = true;
                    if (this.isUrlFromHostname(url, 'patreon.com')) funding.patreon = true;
                    
                    authorEntity.funding = funding;
                    await window.cacheManager.saveAuthorEntity(authorKey, authorEntity);
                    return funding;
                }
            }

            // Check if GitHub Sponsors profile exists (by checking if sponsors page exists)
            // Note: This is a lightweight check, actual sponsorship status requires API
            // We'll just note that GitHub Sponsors might be available
            // In practice, we'd need to use GitHub API to check if user has sponsorships enabled
            
        } catch (error) {
            // Silently fail - author funding is optional
            console.debug(`Could not fetch author funding for ${authorKey}:`, error.message);
        }

        return null;
    }

    /**
     * Fetch authors from ecosyste.ms
     */
    async fetchFromEcosystems(ecosystem, packageName) {
        try {
            // Ensure registries are loaded
            if (window.registryManager) {
                await window.registryManager.initializeRegistries();
            }
            
            // Find the registry object by purl type (ecosystem matches purl_type field)
            const registry = this.findRegistryByPurl(ecosystem);
            
            if (!registry) {
                console.warn(`⚠️ No registry found for purl type: ${ecosystem}`);
                return [];
            }
            
            // Construct package URL using registry's packages_url
            // packages_url format: "https://packages.ecosyste.ms/api/v1/registries/{registry.name}/packages"
            // Append package name to get specific package
            const url = `${registry.packages_url}/${encodeURIComponent(packageName)}`;
            
            console.log(`🔍 Fetching from ecosyste.ms: ${ecosystem} → ${registry.name} (${url})`);
            
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`ecosyste.ms returned ${response.status} for ${registry.name}/${packageName}`);
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
            // Use regex matching directly (more secure than substring matching)
            if (ecosystem === 'golang') {
                const githubMatch = packageName.match(/github\.com[\/:]([^\/]+)/i);
                if (githubMatch) {
                    return [`github:${githubMatch[1]}`];
                }
                
                const bitbucketMatch = packageName.match(/bitbucket\.org[\/:]([^\/]+)/i);
                if (bitbucketMatch) {
                    return [`bitbucket:${bitbucketMatch[1]}`];
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
     * Extract responsible parties from npm registry response
     * 
     * SECURITY & ACCOUNTABILITY FOCUS: We prioritize MAINTAINERS over authors because:
     * - Maintainers are CURRENTLY responsible for the code
     * - Maintainers respond to security vulnerabilities
     * - Maintainers have publish permissions and are liable for current state
     * - Authors are historical (may have transferred ownership, abandoned project)
     * 
     * Strategy:
     * 1. PRIMARY: Collect maintainers (current responsible parties)
     * 2. FALLBACK: If no maintainers, collect author (historical context)
     * 3. CONTEXT: Collect contributors as additional context
     * 4. DEDUPLICATE: Merge if author=maintainer (same person), keep separate if different
     * 
     * Examples:
     * - Express: Author TJ (transferred) vs Maintainers (current) → Return maintainers only
     * - Lodash: Author = Maintainer (same email) → Return one entry with full name
     * - Axios: Author = Maintainer (similar names) → Return one entry with full name
     * - React: No author, only maintainers → Return maintainers
     */
    extractNpmAuthors(data) {
        const authorObjects = [];
        const hasMaintainers = data.maintainers && Array.isArray(data.maintainers) && data.maintainers.length > 0;
        
        // PRIMARY: Collect maintainers (current responsible parties for security/accountability)
        // For npm, maintainers[].name is the username (e.g., "tmpvar", "josdejong")
        // This is what npm profiles use, not the display name from author.name
        if (hasMaintainers) {
            data.maintainers.forEach(m => {
                if (m && (m.name || m.email)) {
                    const authorObj = { 
                        name: m.name || null,  // Username for npm (e.g., "tmpvar")
                        email: m.email || null,
                        isMaintainer: true  // Mark as maintainer
                    };
                    
                    // Store npm username in metadata for profile URL construction
                    if (m.name) {
                        authorObj.metadata = { npm_username: m.name };
                    }
                    
                    authorObjects.push(authorObj);
                }
            });
        }
        
        // FALLBACK: If no maintainers, collect author (may be historical or current)
        if (!hasMaintainers && data.author) {
            if (typeof data.author === 'string') {
                authorObjects.push({ name: data.author, email: null, isMaintainer: false });
            } else {
                authorObjects.push({ 
                    name: data.author.name || null, 
                    email: data.author.email || null,
                    isMaintainer: false
                });
            }
        }
        // CONTEXT: If maintainers exist, also collect author for deduplication (may be same person)
        else if (hasMaintainers && data.author) {
            // Add author only for deduplication purposes (will be merged if same as maintainer)
            if (typeof data.author === 'string') {
                authorObjects.push({ name: data.author, email: null, isMaintainer: false });
            } else {
                authorObjects.push({ 
                    name: data.author.name || null, 
                    email: data.author.email || null,
                    isMaintainer: false
                });
            }
        }
        
        // CONTEXT: Collect contributors (optional, additional information)
        if (data.contributors && Array.isArray(data.contributors)) {
            data.contributors.forEach(c => {
                if (typeof c === 'string') {
                    authorObjects.push({ name: c, email: null, isMaintainer: false });
                } else if (c && (c.name || c.email)) {
                    authorObjects.push({ 
                        name: c.name || null, 
                        email: c.email || null,
                        isMaintainer: false
                    });
                }
            });
        }
        
        // Deduplicate by email first, then by similar names
        // Prefer maintainers over authors when merging (maintainer.isMaintainer = true)
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
     * Extract possible username patterns from a full name
     * e.g., "Kyle Micallef Bonnici" -> ["kylebonnici", "kbonnici", "kyle", "bonnici"]
     */
    extractUsernamePatterns(fullName) {
        if (!fullName) return [];
        const patterns = [];
        
        // Normalize and split by spaces, hyphens, underscores
        const parts = fullName.toLowerCase().split(/[\s\-_]+/).filter(p => p.length > 0);
        
        if (parts.length === 0) return [];
        if (parts.length === 1) {
            patterns.push(parts[0]);
            return patterns;
        }
        
        // Pattern 1: firstname + lastname (most common: "Kyle Micallef Bonnici" -> "kylebonnici")
        if (parts.length >= 2) {
            patterns.push(parts[0] + parts[parts.length - 1]);
        }
        
        // Pattern 2: first initial + lastname ("Kyle Micallef Bonnici" -> "kbonnici")
        if (parts.length >= 2) {
            patterns.push(parts[0][0] + parts[parts.length - 1]);
        }
        
        // Pattern 3: just lastname
        patterns.push(parts[parts.length - 1]);
        
        // Pattern 4: just firstname
        patterns.push(parts[0]);
        
        // Pattern 5: all initials + lastname ("Kyle Micallef Bonnici" -> "kmbbonnici")
        if (parts.length >= 3) {
            const initials = parts.slice(0, -1).map(p => p[0]).join('');
            patterns.push(initials + parts[parts.length - 1]);
        }
        
        // Pattern 6: firstname + all middle initials + lastname ("Kyle Micallef Bonnici" -> "kylembonnici")
        if (parts.length >= 3) {
            const middleInitials = parts.slice(1, -1).map(p => p[0]).join('');
            patterns.push(parts[0] + middleInitials + parts[parts.length - 1]);
        }
        
        // Pattern 7: full normalized name (without spaces)
        patterns.push(parts.join(''));
        
        return [...new Set(patterns)].filter(p => p.length >= 3); // Filter out very short patterns
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
        
        // Check if one name is a username pattern derived from the other
        // Try both directions: name1 could be username derived from name2, or vice versa
        const patterns1 = this.extractUsernamePatterns(name1);
        const patterns2 = this.extractUsernamePatterns(name2);
        
        // Check if norm2 matches any pattern from name1
        if (patterns1.some(pattern => this.normalizeAuthorName(pattern) === norm2)) {
            return true;
        }
        
        // Check if norm1 matches any pattern from name2
        if (patterns2.some(pattern => this.normalizeAuthorName(pattern) === norm1)) {
            return true;
        }
        
        // Check if normalized versions match any patterns
        if (patterns1.includes(norm2) || patterns2.includes(norm1)) {
            return true;
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
                    // Same email - prefer maintainer over author, then prefer longer name
                    const preferNew = author.isMaintainer || 
                        (!existing.isMaintainer && !author.isMaintainer && 
                         author.name && (!existing.name || author.name.length > existing.name.length));
                    
                    if (preferNew) {
                        // Keep maintainer flag if either is maintainer, prefer longer name
                        // But preserve npm_username from maintainer if available
                        const mergedMetadata = { ...existing.metadata, ...author.metadata };
                        emailMap.set(author.email, { 
                            name: author.name || existing.name, 
                            email: author.email,
                            isMaintainer: author.isMaintainer || existing.isMaintainer || false,
                            metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null
                        });
                    } else {
                        // Keep existing but preserve maintainer flag and npm username
                        if (author.isMaintainer && !existing.isMaintainer) {
                            const mergedMetadata = { ...existing.metadata, ...author.metadata };
                            emailMap.set(author.email, {
                                ...existing,
                                isMaintainer: true,
                                metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : existing.metadata
                            });
                        } else if (author.metadata?.npm_username && !existing.metadata?.npm_username) {
                            // Preserve npm username even if not preferring new author
                            const mergedMetadata = { ...existing.metadata, ...author.metadata };
                            emailMap.set(author.email, {
                                ...existing,
                                metadata: mergedMetadata
                            });
                        }
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
            let bestMetadata = emailAuthor.metadata || null;
            let isMaintainer = emailAuthor.isMaintainer || false;
            
            // Check if any no-email author is similar
            mergedNoEmail.forEach((noEmailAuthor, idx) => {
                if (usedNoEmailIndices.has(idx)) return;
                
                if (noEmailAuthor.name && emailAuthor.name && 
                    this.areSimilarAuthors(noEmailAuthor.name, emailAuthor.name)) {
                    // Prefer maintainer over author, then prefer longer/fuller name
                    if (noEmailAuthor.isMaintainer && !isMaintainer) {
                        bestName = noEmailAuthor.name;
                        isMaintainer = true;
                    } else if (!noEmailAuthor.isMaintainer && !isMaintainer && noEmailAuthor.name.length > bestName.length) {
                        // Only prefer longer name if neither is maintainer
                        bestName = noEmailAuthor.name;
                    }
                    // Preserve metadata from either source (merge both, prefer maintainer's npm_username)
                    if (noEmailAuthor.metadata) {
                        bestMetadata = { ...bestMetadata, ...noEmailAuthor.metadata };
                    }
                    // Preserve npm_username from maintainer even if we prefer display name
                    if (emailAuthor.metadata?.npm_username) {
                        bestMetadata = { ...bestMetadata, npm_username: emailAuthor.metadata.npm_username };
                    }
                    if (noEmailAuthor.metadata?.npm_username) {
                        bestMetadata = { ...bestMetadata, npm_username: noEmailAuthor.metadata.npm_username };
                    }
                    usedNoEmailIndices.add(idx);
                }
            });
            
            const authorObj = { name: bestName, email: bestEmail };
            if (bestMetadata) {
                authorObj.metadata = bestMetadata;
            }
            // Only set isMaintainer flag if true (keep it clean)
            if (isMaintainer) {
                authorObj.isMaintainer = true;
            }
            finalAuthors.push(authorObj);
        });
        
        // Step 4: Add remaining no-email authors that weren't matched
        mergedNoEmail.forEach((author, idx) => {
            if (!usedNoEmailIndices.has(idx)) {
                finalAuthors.push(author);
            }
        });
        
        // Step 5: Return objects (preserve metadata), deduplicate by name/email
        const seen = new Set();
        return finalAuthors.filter(a => {
            const key = a.name || a.email;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
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
                    // Prefer maintainer over author, then prefer longer name
                    const preferAuthor2 = author2.isMaintainer || 
                        (!author1.isMaintainer && !author2.isMaintainer && author2.name.length > bestMatch.name.length);
                    
                    if (preferAuthor2) {
                        bestMatch = {
                            ...author2,
                            isMaintainer: author1.isMaintainer || author2.isMaintainer || false
                        };
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
     * Parse PyPI author_email format: "Name <email@domain.com>" or just "email@domain.com"
     * Returns {name, email, username} where username is extracted from email for profile URLs
     */
    parsePyPiAuthorEmail(authorEmailString) {
        if (!authorEmailString) return { name: null, email: null, username: null };
        
        // Check if it's in format "Name <email@domain.com>"
        const match = authorEmailString.match(/^(.+?)\s*<([^>]+)>$/);
        if (match) {
            const name = match[1].trim();
            const email = match[2].trim();
            // Extract username from email (part before @)
            const username = email.split('@')[0];
            return { name, email, username };
        }
        
        // Check if it's just an email
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailPattern.test(authorEmailString.trim())) {
            const email = authorEmailString.trim();
            const username = email.split('@')[0];
            return { name: null, email, username };
        }
        
        // Otherwise, treat as name only
        return { name: authorEmailString.trim(), email: null, username: null };
    }

    /**
     * Split comma-separated author names into individual authors
     * Handles cases like "Ian Cordasco, Cory Benfield" -> ["Ian Cordasco", "Cory Benfield"]
     */
    splitCommaSeparatedAuthors(authorString) {
        if (!authorString) return [];
        
        // Split by comma, but be careful with email addresses and name formats
        // Pattern: split on comma followed by space, but not inside email addresses
        const parts = authorString.split(/,\s+/).filter(p => p.trim().length > 0);
        
        // If only one part after splitting, return as single author
        if (parts.length === 1) {
            return [parts[0].trim()];
        }
        
        // Multiple parts - return as separate authors
        return parts.map(p => p.trim()).filter(p => p.length > 0);
    }

    /**
     * Detect if a PyPI author/maintainer is likely an organization
     * PyPI JSON API doesn't provide explicit org/user flag, so we infer from patterns:
     * - Single word name (no spaces, no commas)
     * - Name appears in email domain (e.g., "Pallets" + "palletsprojects.com")
     * - Generic email prefixes (contact@, info@, etc.)
     */
    isPyPIOrganization(name, email) {
        if (!name) return false;
        
        const nameLower = name.toLowerCase().trim();
        
        // Must be single word (no spaces, no commas)
        if (nameLower.includes(' ') || nameLower.includes(',')) {
            return false;
        }
        
        // If we have email, check if organization name appears in domain
        if (email) {
            const domainMatch = email.match(/@([^.]+\.)?([^@.]+)\.[^@]+$/);
            if (domainMatch) {
                const domainName = domainMatch[2].toLowerCase(); // Get main domain name
                // Check if author name matches domain (e.g., "pallets" in "palletsprojects")
                // or if domain starts with author name (e.g., "pallets" -> "palletsprojects.com")
                if (domainName.includes(nameLower) || nameLower.includes(domainName) || 
                    domainName.startsWith(nameLower) || nameLower.startsWith(domainName)) {
                    return true;
                }
            }
            
            // Check for generic email prefixes that indicate organizations
            const emailPrefix = email.split('@')[0].toLowerCase();
            const genericPrefixes = ['contact', 'info', 'admin', 'support', 'team', 'noreply', 'no-reply'];
            if (genericPrefixes.includes(emailPrefix)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Extract authors from PyPI response
     * NOTE: PyPI JSON API doesn't provide explicit organization/user field
     * We infer organizations from name patterns and email domain analysis
     */
    extractPyPiAuthors(data) {
        const authorObjects = [];
        
        // Extract GitHub username from project_urls (if available)
        let githubUsername = null;
        if (data.info && data.info.project_urls) {
            const urls = data.info.project_urls;
            // Check Source, Homepage, or Repository URLs for GitHub
            const repoUrl = urls.Source || urls.Homepage || urls.Repository || urls['Source Code'] || urls['Code'];
            if (repoUrl) {
                const githubMatch = repoUrl.match(/github\.com[\/:]([^\/]+)/i);
                if (githubMatch) {
                    githubUsername = githubMatch[1];
                }
            }
        }
        
        if (data.info) {
            // Collect author with email
            if (data.info.author || data.info.author_email) {
                let name = data.info.author || null;
                let email = data.info.author_email || null;
                let username = null;
                
                // If we have author_email but no author, parse the author_email string
                if (!name && email) {
                    const parsed = this.parsePyPiAuthorEmail(email);
                    name = parsed.name;
                    email = parsed.email;
                    username = parsed.username;
                }
                
                // Detect if this is an organization
                const isOrg = this.isPyPIOrganization(name, email);
                
                // Handle comma-separated author names (e.g., "Ian Cordasco, Cory Benfield")
                if (name && name.includes(',')) {
                    const authorNames = this.splitCommaSeparatedAuthors(name);
                    // If multiple authors, share the email (if available) or split it if it's an email string
                    authorNames.forEach(authorName => {
                        // Parse email string if it contains email format
                        let authorEmail = email;
                        let authorUsername = username;
                        
                        // Check if authorName itself contains email format
                        const emailParsed = this.parsePyPiAuthorEmail(authorName);
                        if (emailParsed.email) {
                            authorEmail = emailParsed.email;
                            authorUsername = emailParsed.username;
                        }
                        
                        const authorObj = { 
                            name: authorName, 
                            email: authorEmail || null, 
                            username: authorUsername,
                            isOrganization: this.isPyPIOrganization(authorName, authorEmail)
                        };
                        
                        // Build metadata object
                        authorObj.metadata = {};
                        if (authorUsername && !authorObj.isOrganization) {
                            authorObj.metadata.pypi_username = authorUsername;
                        } else if (authorObj.isOrganization) {
                            authorObj.metadata.pypi_organization = authorName.toLowerCase();
                        }
                        // Add GitHub username if available
                        if (githubUsername) {
                            authorObj.metadata.github = githubUsername;
                        }
                        
                        authorObjects.push(authorObj);
                    });
                } else {
                    // Single author
                    const authorObj = { 
                        name, 
                        email, 
                        username,
                        isOrganization: isOrg
                    };
                    
                    // Build metadata object
                    authorObj.metadata = {};
                    if (isOrg) {
                        authorObj.metadata.pypi_organization = name.toLowerCase();
                    } else if (username) {
                        authorObj.metadata.pypi_username = username;
                    }
                    // Add GitHub username if available
                    if (githubUsername) {
                        authorObj.metadata.github = githubUsername;
                    }
                    
                    authorObjects.push(authorObj);
                }
            }
            
            // Collect maintainer with email
            if (data.info.maintainer || data.info.maintainer_email) {
                let name = data.info.maintainer || null;
                let email = data.info.maintainer_email || null;
                let username = null;
                
                // If we have maintainer_email but no maintainer, parse the maintainer_email string
                if (!name && email) {
                    const parsed = this.parsePyPiAuthorEmail(email);
                    name = parsed.name;
                    email = parsed.email;
                    username = parsed.username;
                }
                
                // Detect if this is an organization
                const isOrg = this.isPyPIOrganization(name, email);
                
                // Handle comma-separated maintainer names
                if (name && name.includes(',')) {
                    const maintainerNames = this.splitCommaSeparatedAuthors(name);
                    maintainerNames.forEach(maintainerName => {
                        let maintainerEmail = email;
                        let maintainerUsername = username;
                        
                        const emailParsed = this.parsePyPiAuthorEmail(maintainerName);
                        if (emailParsed.email) {
                            maintainerEmail = emailParsed.email;
                            maintainerUsername = emailParsed.username;
                        }
                        
                        const isMaintainerOrg = this.isPyPIOrganization(maintainerName, maintainerEmail);
                        const authorObj = { 
                            name: maintainerName, 
                            email: maintainerEmail || null, 
                            username: maintainerUsername, 
                            isMaintainer: true,
                            isOrganization: isMaintainerOrg
                        };
                        
                        // Build metadata object
                        authorObj.metadata = {};
                        if (isMaintainerOrg) {
                            authorObj.metadata.pypi_organization = maintainerName.toLowerCase();
                        } else if (maintainerUsername) {
                            authorObj.metadata.pypi_username = maintainerUsername;
                        }
                        // Add GitHub username if available
                        if (githubUsername) {
                            authorObj.metadata.github = githubUsername;
                        }
                        
                        authorObjects.push(authorObj);
                    });
                } else {
                    // Single maintainer
                    const authorObj = { 
                        name, 
                        email, 
                        username, 
                        isMaintainer: true,
                        isOrganization: isOrg
                    };
                    
                    // Build metadata object
                    authorObj.metadata = {};
                    if (isOrg) {
                        authorObj.metadata.pypi_organization = name.toLowerCase();
                    } else if (username) {
                        authorObj.metadata.pypi_username = username;
                    }
                    // Add GitHub username if available
                    if (githubUsername) {
                        authorObj.metadata.github = githubUsername;
                    }
                    
                    authorObjects.push(authorObj);
                }
            }
        }
        
        // Use email-based deduplication (preserves metadata)
        const deduplicated = this.deduplicateAuthorsByEmail(authorObjects);
        
        // Convert to final format: return name string, but preserve metadata in object structure
        // The calling code expects either strings or objects with name/metadata
        return deduplicated.map(authorObj => {
            // If we have metadata, return object with name and metadata
            if (authorObj.metadata && Object.keys(authorObj.metadata).length > 0) {
                return { name: authorObj.name || authorObj.email, metadata: authorObj.metadata };
            }
            // Otherwise return just the name string (for backwards compatibility)
            return authorObj.name || authorObj.email;
        });
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
     * RubyGems often lists multiple authors in a single comma-separated string
     */
    extractGemAuthors(data) {
        const authorObjects = [];
        
        if (data.authors) {
            if (typeof data.authors === 'string') {
                // RubyGems may have comma-separated authors: "Author1, Author2, Author3"
                const authorNames = this.splitCommaSeparatedAuthors(data.authors);
                authorNames.forEach(authorName => {
                    if (authorName && authorName.trim()) {
                        authorObjects.push({ name: authorName.trim(), email: null });
                    }
                });
            } else if (Array.isArray(data.authors)) {
                // Each array item might also be a comma-separated string
                data.authors.forEach(author => {
                    if (author) {
                        if (typeof author === 'string' && author.includes(',')) {
                            // Split if it's a comma-separated string
                            const authorNames = this.splitCommaSeparatedAuthors(author);
                            authorNames.forEach(authorName => {
                                if (authorName && authorName.trim()) {
                                    authorObjects.push({ name: authorName.trim(), email: null });
                                }
                            });
                        } else {
                            authorObjects.push({ name: author, email: null });
                        }
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
            // NOTE: fetchAuthors() already saves package, authors, and relationships to cache immediately
            const authorData = await this.fetchAuthors(pkg.ecosystem, pkg.name);
            const authors = Array.isArray(authorData) ? authorData : (authorData.authors || []);
            const funding = Array.isArray(authorData) ? null : (authorData.funding || null);
            
            // Verify: fetchAuthors() should have already saved package and authors to cache
            // This happens inside saveAuthorsToCache() which is called by fetchAuthors()
            
            // Store authors with appropriate prefix
            authors.forEach(author => {
                // Handle both string authors and object authors (with metadata)
                let authorString, authorMetadata;
                if (typeof author === 'string') {
                    authorString = author;
                    authorMetadata = null;
                } else if (author && typeof author === 'object') {
                    authorString = author.name || author.author || '';
                    authorMetadata = author.metadata || null;
                } else {
                    return; // Skip invalid authors
                }
                
                let authorKey, authorName, authorSource;
                
                // Check if author already has a prefix (github:, bitbucket:, gitlab:)
                if (authorString.includes(':')) {
                    authorKey = authorString;  // Already prefixed (e.g., "github:jackc")
                    const parts = authorString.split(':');
                    authorSource = parts[0];  // "github", "bitbucket", "gitlab"
                    authorName = parts[1];    // "jackc"
                } else {
                    // Regular author, use ecosystem prefix
                    authorKey = `${pkg.ecosystem}:${authorString}`;
                    authorSource = pkg.ecosystem;
                    authorName = authorString;
                }
                
                if (!results.has(authorKey)) {
                    results.set(authorKey, {
                        author: authorName,
                        ecosystem: authorSource,  // Will be "github", "bitbucket", "gitlab", or ecosystem name
                        count: 0,  // Total occurrences (including transitive, across all repos)
                        packages: [],  // Array of package names
                        packageRepositories: {},  // Map: packageName -> array of repositories using it
                        repositories: new Set(),  // Set of all repositories using any of this author's packages
                        repositoryCount: 0,  // Unique repository count (calculated at end)
                        funding: null,  // Author-level funding (from author profile, NOT package funding)
                        metadata: null  // Will be set if any package has metadata
                    });
                }
                const entry = results.get(authorKey);
                entry.count++;  // Increment total occurrences
                
                // Track package usage
                if (!entry.packages.includes(pkg.name)) {
                    entry.packages.push(pkg.name);
                    entry.packageRepositories[pkg.name] = [];
                }
                
                // Track repository usage for this package
                if (pkg.repositories && Array.isArray(pkg.repositories)) {
                    pkg.repositories.forEach(repo => {
                        entry.repositories.add(repo);
                        if (!entry.packageRepositories[pkg.name].includes(repo)) {
                            entry.packageRepositories[pkg.name].push(repo);
                        }
                    });
                }
                
                // IMPORTANT: Do NOT store package funding here - package funding is stored separately in package cache
                // Author funding should come from author entity (fetched from GitHub profile, author.json, etc.)
                // We'll fetch author funding from author entities at the end
                
                // If this package has metadata, merge it with existing metadata
                if (authorMetadata && !entry.metadata) {
                    entry.metadata = authorMetadata;
                } else if (authorMetadata && entry.metadata) {
                    // Merge metadata objects
                    entry.metadata = { ...entry.metadata, ...authorMetadata };
                }
            });
            
            processed++;
            if (onProgress) {
                onProgress(processed, packages.length);
            }
            
            // Rate limiting: wait 100ms between requests
            await this.sleep(100);
        }
        
        // Calculate repository count for each author (unique repos across all their packages)
        results.forEach(entry => {
            entry.repositoryCount = entry.repositories.size;
            // Convert Set to array for JSON serialization
            entry.repositories = Array.from(entry.repositories);
            // Sort package repositories for consistency
            Object.keys(entry.packageRepositories).forEach(pkgName => {
                entry.packageRepositories[pkgName].sort();
            });
        });
        
        // Fetch author-level funding from author entities (NOT package funding)
        if (window.cacheManager) {
            const authorKeyPromises = Array.from(results.keys()).map(async (authorKey) => {
                const authorEntity = await window.cacheManager.getAuthorEntity(authorKey);
                if (authorEntity?.funding) {
                    const entry = results.get(authorKey);
                    entry.funding = authorEntity.funding;  // Author-level funding from profile
                }
            });
            await Promise.all(authorKeyPromises);
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

