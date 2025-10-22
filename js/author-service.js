/**
 * Author Service - Fetches author data from multiple sources
 * Priority: 1) Native registries (npm, PyPI, etc.), 2) deps.dev, 3) ecosyste.ms
 */
class AuthorService {
    constructor() {
        this.ecosystemsBaseUrl = 'https://packages.ecosyste.ms/api/v1';
        this.depsDevBaseUrl = 'https://api.deps.dev/v3alpha';
        this.cache = new Map();
        
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
     * Fetch authors for a package
     * @param {string} ecosystem - e.g., 'npm', 'pypi', 'maven'
     * @param {string} packageName - package name
     * @returns {Promise<Array>} - array of author names
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
                this.cache.set(packageKey, cached.authors);
                return cached.authors;
            }
        }
        
        // Try different sources based on ecosystem
        let authors = [];
        
        // Try native registry first (fastest and most reliable)
        if (this.registryUrls[ecosystem]) {
            authors = await this.fetchFromNativeRegistry(ecosystem, packageName);
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
            return [];
        }
        
        // Cache in IndexedDB
        if (dbManager && dbManager.db) {
            await this.cacheAuthors({
                packageKey,
                ecosystem,
                packageName,
                authors,
                source: 'multi',
                timestamp: Date.now()
            });
        }
        
        this.cache.set(packageKey, authors);
        return authors;
    }

    /**
     * Fetch authors from native package registries
     */
    async fetchFromNativeRegistry(ecosystem, packageName) {
        try {
            let url, data;
            
            switch (ecosystem) {
                case 'npm':
                    // npm registry provides full package metadata
                    url = `${this.registryUrls.npm}/${packageName}/latest`;
                    const npmResponse = await fetch(url);
                    if (!npmResponse.ok) return [];
                    data = await npmResponse.json();
                    return this.extractNpmAuthors(data);
                
                case 'pypi':
                    // PyPI JSON API
                    url = `${this.registryUrls.pypi}/${packageName}/json`;
                    const pypiResponse = await fetch(url);
                    if (!pypiResponse.ok) return [];
                    data = await pypiResponse.json();
                    return this.extractPyPiAuthors(data);
                
                case 'cargo':
                    // crates.io API
                    url = `${this.registryUrls.cargo}/${packageName}`;
                    const cargoResponse = await fetch(url);
                    if (!cargoResponse.ok) return [];
                    data = await cargoResponse.json();
                    return this.extractCargoAuthors(data);
                
                case 'gem':
                    // RubyGems API
                    url = `${this.registryUrls.gem}/${packageName}.json`;
                    const gemResponse = await fetch(url);
                    if (!gemResponse.ok) return [];
                    data = await gemResponse.json();
                    return this.extractGemAuthors(data);
                
                default:
                    return [];
            }
        } catch (error) {
            console.warn(`Error fetching from native registry ${ecosystem}:`, error.message);
            return [];
        }
    }

    /**
     * Fetch authors from ecosyste.ms
     */
    async fetchFromEcosystems(ecosystem, packageName) {
        try {
            const ecosystemMap = {
                'golang': 'go',
                'pypi': 'pypi',
                'cargo': 'cargo',
                'maven': 'maven',
                'npm': 'npm',
                'nuget': 'nuget',
                'docker': 'docker',
                'gem': 'rubygems',
                'packagist': 'packagist'
            };
            
            const registryName = ecosystemMap[ecosystem] || ecosystem;
            const url = `${this.ecosystemsBaseUrl}/registries/${registryName}/packages/${encodeURIComponent(packageName)}`;
            
            const response = await fetch(url);
            if (!response.ok) return [];
            
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
        const authors = [];
        
        if (data.author) {
            const author = typeof data.author === 'string' ? data.author : data.author.name;
            if (author) authors.push(author);
        }
        
        if (data.maintainers && Array.isArray(data.maintainers)) {
            // Prefer name over email
            authors.push(...data.maintainers.map(m => m.name || m.email).filter(Boolean));
        }
        
        if (data.contributors && Array.isArray(data.contributors)) {
            // Prefer name over email, handle both object and string formats
            authors.push(...data.contributors.map(c => {
                if (typeof c === 'string') return c;
                return c.name || c.email;
            }).filter(Boolean));
        }
        
        // Deduplicate and filter out emails if we have the name
        return this.deduplicateAuthors(authors);
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
        const authors = [];
        
        if (data.info) {
            // Prefer name over email - only add email if no name is available
            const hasAuthorName = data.info.author && data.info.author.trim();
            const hasMaintainerName = data.info.maintainer && data.info.maintainer.trim();
            
            if (hasAuthorName) {
                authors.push(data.info.author);
            } else if (data.info.author_email) {
                // Only use email if no name is available
                authors.push(data.info.author_email);
            }
            
            if (hasMaintainerName) {
                authors.push(data.info.maintainer);
            } else if (data.info.maintainer_email) {
                // Only use email if no name is available
                authors.push(data.info.maintainer_email);
            }
        }
        
        return [...new Set(authors.filter(Boolean))];
    }

    /**
     * Extract authors from crates.io response
     */
    extractCargoAuthors(data) {
        const authors = [];
        
        if (data.crate && data.crate.authors && Array.isArray(data.crate.authors)) {
            authors.push(...data.crate.authors);
        }
        
        if (data.versions && Array.isArray(data.versions) && data.versions[0]) {
            const latestVersion = data.versions[0];
            if (latestVersion.authors && Array.isArray(latestVersion.authors)) {
                authors.push(...latestVersion.authors);
            }
        }
        
        return [...new Set(authors.filter(Boolean))];
    }

    /**
     * Extract authors from RubyGems response
     */
    extractGemAuthors(data) {
        const authors = [];
        
        if (data.authors) {
            if (typeof data.authors === 'string') {
                authors.push(data.authors);
            } else if (Array.isArray(data.authors)) {
                authors.push(...data.authors);
            }
        }
        
        return [...new Set(authors.filter(Boolean))];
    }

    /**
     * Extract authors from ecosyste.ms response
     */
    extractEcosystemsAuthors(data) {
        const authors = [];
        
        // Check various author fields
        if (data.maintainers && Array.isArray(data.maintainers)) {
            authors.push(...data.maintainers.map(m => m.name || m.email || m));
        }
        if (data.owners && Array.isArray(data.owners)) {
            authors.push(...data.owners.map(o => o.name || o.email || o));
        }
        if (data.author) {
            authors.push(typeof data.author === 'string' ? data.author : data.author.name);
        }
        
        // Deduplicate and clean
        return [...new Set(authors.filter(Boolean))];
    }

    /**
     * Check if cache is still valid (24 hours)
     */
    isCacheValid(timestamp) {
        const oneDay = 24 * 60 * 60 * 1000;
        return Date.now() - timestamp < oneDay;
    }

    /**
     * Batch fetch authors for multiple packages
     */
    async fetchAuthorsForPackages(packages, onProgress) {
        const results = new Map();
        let processed = 0;
        
        for (const pkg of packages) {
            const authors = await this.fetchAuthors(pkg.ecosystem, pkg.name);
            
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
                        packages: []
                    });
                }
                const entry = results.get(authorKey);
                entry.count++;
                entry.packages.push(pkg.name);
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

