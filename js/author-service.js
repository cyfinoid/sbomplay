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
        
        // If not in cache, fetch from APIs (try multiple sources in parallel)
        console.log(`🔍 Fetching authors for ${packageKey} from APIs...`);
        let authors = [];
        let funding = null;
        let packageWarnings = null;
        let ecosystemsAuthors = []; // Keep track of ecosyste.ms authors for correlation
        
        // Try native registry and ecosyste.ms in parallel (race condition - use first successful response)
        const apiPromises = [];
        
        // Try native registry if available
        if (this.registryUrls[ecosystem]) {
            apiPromises.push(
                this.fetchFromNativeRegistry(ecosystem, packageName)
                    .then(result => ({ source: 'native', result }))
                    .catch(() => ({ source: 'native', result: null }))
            );
        }
        
        // Try ecosyste.ms in parallel
        apiPromises.push(
            this.fetchFromEcosystems(ecosystem, packageName)
                .then(result => ({ source: 'ecosystems', result: Array.isArray(result) ? { authors: result } : { authors: result } }))
                .catch(() => ({ source: 'ecosystems', result: null }))
        );
        
        // Wait for all API calls to complete
        const apiResults = await Promise.allSettled(apiPromises);
        
        // Collect results from both sources for correlation
        let nativeAuthors = [];
        for (const apiResult of apiResults) {
            if (apiResult.status === 'fulfilled' && apiResult.value.result) {
                const { source, result } = apiResult.value;
                
                if (source === 'native') {
                    // Handle both old format (array) and new format (object with authors/packageFunding/packageWarnings)
                    if (Array.isArray(result)) {
                        nativeAuthors = result;
                    } else {
                        nativeAuthors = result.authors || [];
                        funding = result.packageFunding || null;
                        packageWarnings = result.packageWarnings || null;
                    }
                } else if (source === 'ecosystems') {
                    ecosystemsAuthors = result.authors || [];
                }
            }
        }
        
        // Use native authors if available, otherwise use ecosyste.ms authors
        if (nativeAuthors.length > 0) {
            authors = nativeAuthors;
            console.log(`✅ Found ${authors.length} authors for ${packageKey} from native registry`);
            // NOTE: We do NOT correlate author names with maintainer logins - this causes false positives
            // Only check GitHub when there's an explicit pointer (e.g., GitHub URL in maintainer profile)
        } else if (ecosystemsAuthors.length > 0) {
            authors = ecosystemsAuthors;
            console.log(`✅ Found ${authors.length} authors for ${packageKey} from ecosyste.ms`);
        }
        
        // Try to fetch GitHub contributors if we have a GitHub repository URL
        // This provides tentative correlation (same GitHub user ID = same person)
        if (authors.length > 0) {
            const repoUrl = await this.getRepositoryUrl(ecosystem, packageName);
            if (repoUrl) {
                const githubMatch = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/]+)/i);
                if (githubMatch) {
                    const [, owner, repo] = githubMatch;
                    // Clean up repo name (remove .git suffix, etc.)
                    const cleanRepo = repo.replace(/\.git$/, '').replace(/\/$/, '');
                    try {
                        const contributors = await this.fetchContributorsFromGitHub(owner, cleanRepo);
                        if (contributors.length > 0) {
                            authors = this.correlateWithContributors(authors, contributors);
                        }
                    } catch (error) {
                        console.warn(`Failed to fetch GitHub contributors for ${owner}/${cleanRepo}:`, error.message);
                    }
                }
            }
        }
        
        // If still no authors, try to extract from repository URL (fallback)
        if (authors.length === 0) {
            // Special handling for GitHub Actions - extract owner/repo from package name
            if (ecosystem === 'githubactions' || ecosystem === 'GitHub Actions') {
                const gaAuthors = await this.fetchAuthorsFromGitHubAction(packageName);
                if (gaAuthors.length > 0) {
                    console.log(`✅ Found ${gaAuthors.length} repository owners for ${packageKey}`);
                    authors = gaAuthors;
                }
            } else {
                const repoAuthors = await this.fetchAuthorsFromRepository(ecosystem, packageName);
                if (repoAuthors.length > 0) {
                    console.log(`✅ Found ${repoAuthors.length} repository owners for ${packageKey}`);
                    authors = repoAuthors;
                }
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
        await this.saveAuthorsToCache(packageKey, ecosystem, authors, funding, packageWarnings);
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
     * @param {Object} packageWarnings - Package warnings (maintenance and deprecation) - stored in package cache
     */
    async saveAuthorsToCache(packageKey, ecosystem, authors, packageFunding = null, packageWarnings = null) {
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
        
        // Add or update package warnings if available
        if (packageWarnings) {
            packageData.warnings = packageWarnings;  // Package warnings (maintenance and deprecation)
        }
        
        // Save package to cache immediately (with or without funding, with or without authors)
        await window.cacheManager.savePackage(packageKey, packageData);
        console.log(`📦 Saved package to cache: ${packageKey}${packageFunding ? ' (with funding)' : ''}${packageWarnings ? ' (with warnings)' : ''}${authors.length === 0 ? ' (no authors)' : ''}`);

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

            // Map login from ecosyste.ms to ecosystem-specific username field
            if (authorMetadata?.login) {
                const login = authorMetadata.login;
                // Map login to ecosystem-specific username field
                if (ecosystem === 'gem' || ecosystem === 'rubygems') {
                    authorMetadata.rubygems_username = login;
                } else if (ecosystem === 'npm') {
                    authorMetadata.npm_username = login;
                } else if (ecosystem === 'pypi') {
                    authorMetadata.pypi_username = login;
                } else if (ecosystem === 'cargo') {
                    authorMetadata.cargo_username = login;
                }
                // Keep login field for reference, but ecosystem-specific field takes precedence
            }

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

            // CRITICAL: Check for existing author by email OR GitHub username (for correlation)
            // This allows us to merge authors if they share the same email OR GitHub username
            // Priority: Email (same ecosystem) > GitHub username (cross-ecosystem) > authorKey
            let authorEntity = null;
            let existingAuthorKey = authorKey;
            
            // Step 1: Check by email in same ecosystem (most reliable, same ecosystem)
            if (authorMetadata?.email && window.cacheManager) {
                const existingByEmail = await window.cacheManager.findAuthorByEmail(authorMetadata.email, ecosystem);
                if (existingByEmail) {
                    authorEntity = existingByEmail.entity;
                    existingAuthorKey = existingByEmail.authorKey;
                    console.log(`🔗 Found existing author by email: ${existingAuthorKey} (email: ${authorMetadata.email})`);
                }
            }
            
            // Step 2: Check by GitHub username (cross-ecosystem correlation)
            // Same GitHub username = same person across different package registries
            if (!authorEntity && authorMetadata?.github && window.cacheManager) {
                const existingByGitHub = await window.cacheManager.findAuthorByGitHub(authorMetadata.github);
                if (existingByGitHub) {
                    authorEntity = existingByGitHub.entity;
                    existingAuthorKey = existingByGitHub.authorKey;
                    console.log(`🔗 Found existing author by GitHub: ${existingAuthorKey} (GitHub: ${authorMetadata.github})`);
                }
            }
            
            // Step 3: Check by authorKey (exact match)
            if (!authorEntity) {
                authorEntity = await window.cacheManager.getAuthorEntity(authorKey);
            }
            
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
                // Merge with existing entity
                // Strategy: Use display name (prefer longer/more complete name), but keep username for profile links
                let updated = false;
                let mergedName = authorEntity.author;
                let mergedMetadata = authorEntity.metadata || {};
                
                // Prefer longer/more complete display name (e.g., "Kyle Robinson Young" over "shama")
                // But only if the new name looks like a display name (has spaces or is longer)
                const isNewNameDisplayName = authorName.includes(' ') || 
                    (authorName.length > mergedName.length && mergedName.length < 20);
                const isExistingNameDisplayName = mergedName.includes(' ') || 
                    (mergedName.length > authorName.length && authorName.length < 20);
                
                if (isNewNameDisplayName && (!isExistingNameDisplayName || authorName.length > mergedName.length)) {
                    mergedName = authorName;
                    updated = true;
                    console.log(`📝 Updating display name: ${mergedName} (was: ${authorEntity.author})`);
                }
                
                // Always merge metadata, preserving username for profile links
                if (authorMetadata) {
                    // Merge metadata, but preserve username fields (they're critical for profile links)
                    const newMetadata = { ...mergedMetadata, ...authorMetadata };
                    // Ensure username fields are preserved (prefer new if available, but don't lose existing)
                    if (authorMetadata.npm_username) {
                        newMetadata.npm_username = authorMetadata.npm_username;
                    }
                    if (authorMetadata.rubygems_username) {
                        newMetadata.rubygems_username = authorMetadata.rubygems_username;
                    }
                    if (authorMetadata.login) {
                        newMetadata.login = authorMetadata.login;
                    }
                    
                    if (JSON.stringify(newMetadata) !== JSON.stringify(mergedMetadata)) {
                        mergedMetadata = newMetadata;
                        updated = true;
                    }
                }
                
                // Update email if we have a new one
                if (authorMetadata?.email && !authorEntity.email) {
                    authorEntity.email = authorMetadata.email;
                    updated = true;
                }
                
                if (updated || mergedName !== authorEntity.author) {
                    authorEntity.author = mergedName;
                    authorEntity.metadata = Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null;
                    // If we found by email but authorKey is different, update the existing entity
                    await window.cacheManager.saveAuthorEntity(existingAuthorKey, authorEntity);
                    console.log(`👤 Updated author entity: ${existingAuthorKey} (display: ${mergedName}, username: ${mergedMetadata.npm_username || mergedMetadata.login || 'N/A'})`);
                }
            }

            // CRITICAL: Do NOT check GitHub based on name inference or maintainer login correlation
            // Only check GitHub when there's an explicit pointer (e.g., GitHub URL in maintainer profile)
            // Remove any potential_github that might have been set (shouldn't happen now, but clean up if present)
            if (authorEntity.metadata?.potential_github) {
                delete authorEntity.metadata.potential_github;
                await window.cacheManager.saveAuthorEntity(existingAuthorKey, authorEntity);
            }

            // Fetch author-level funding if we have GitHub username or email
            // This will be done asynchronously and updated separately
            // Reload entity to get updated GitHub username if it was just added
            authorEntity = await window.cacheManager.getAuthorEntity(existingAuthorKey);
            if (authorEntity?.metadata?.github || authorMetadata?.email) {
                this.fetchAuthorFunding(existingAuthorKey, authorEntity).catch(err => 
                    console.warn(`Failed to fetch author funding for ${existingAuthorKey}:`, err)
                );
            }

            // Fetch author location if we have GitHub username
            // CRITICAL: Only fetch if GitHub username exists AND we verify it's not an organization
            // Check IndexedDB first - only fetch if location data is missing
            if (authorEntity?.metadata?.github) {
                // Check if location data already exists in the entity
                const hasLocation = authorEntity.metadata.location || authorEntity.metadata.company;
                
                if (!hasLocation) {
                    // Location data missing - fetch it now during initial analysis
                    // fetchAuthorLocation will check if it's an organization and skip if so
                    try {
                        await this.fetchAuthorLocation(existingAuthorKey, authorEntity);
                        // Reload entity to get updated location data (may have removed org GitHub username)
                        authorEntity = await window.cacheManager.getAuthorEntity(existingAuthorKey);
                    } catch (err) {
                        console.warn(`Failed to fetch author location for ${existingAuthorKey}:`, err);
                    }
                } else {
                    console.log(`📍 Location data already cached for ${existingAuthorKey}`);
                }
            }

            // Save package-author relationship (junction table)
            // Use existingAuthorKey (which may be different from authorKey if we found by email)
            await window.cacheManager.savePackageAuthorRelationship(packageKey, existingAuthorKey, isMaintainer);
        }
    }

    /**
     * Fetch authors and funding from native package registries
     */
    async fetchFromNativeRegistry(ecosystem, packageName) {
        try {
            let url, data;
            let description = null;
            
            switch (ecosystem) {
                case 'npm':
                    // npm registry provides full package metadata including funding
                    url = `${this.registryUrls.npm}/${packageName}/latest`;
                    console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
                    console.log(`   Reason: Fetching npm package metadata for ${packageName} to extract authors and funding information`);
                    const npmResponse = await fetch(url);
                    if (!npmResponse.ok) {
                        console.log(`   ❌ Response: Status ${npmResponse.status} ${npmResponse.statusText}`);
                        return { authors: [], packageFunding: null };
                    }
                    data = await npmResponse.json();
                    description = data.description || null;
                    const npmAuthors = this.extractNpmAuthors(data);
                    const npmFunding = this.extractNpmFunding(data);
                    console.log(`   ✅ Response: Status ${npmResponse.status}, Extracted: ${npmAuthors.length} author(s), funding: ${npmFunding ? 'yes' : 'no'}, description: ${description ? 'yes' : 'no'}`);
                    return {
                        authors: npmAuthors,
                        packageFunding: npmFunding,  // Package-level funding (from package.json)
                        description: description,
                        packageWarnings: this.parsePackageWarnings(description)
                    };
                
                case 'pypi':
                    // PyPI JSON API with project URLs
                    url = `${this.registryUrls.pypi}/${packageName}/json`;
                    console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
                    console.log(`   Reason: Fetching PyPI package metadata for ${packageName} to extract authors and funding information`);
                    const pypiResponse = await fetch(url);
                    if (!pypiResponse.ok) {
                        console.log(`   ❌ Response: Status ${pypiResponse.status} ${pypiResponse.statusText}`);
                        return { authors: [], packageFunding: null };
                    }
                    data = await pypiResponse.json();
                    description = data.info?.summary || data.info?.description || null;
                    const pypiAuthors = this.extractPyPiAuthors(data);
                    const pypiFunding = this.extractPyPiFunding(data);
                    console.log(`   ✅ Response: Status ${pypiResponse.status}, Extracted: ${pypiAuthors.length} author(s), funding: ${pypiFunding ? 'yes' : 'no'}, description: ${description ? 'yes' : 'no'}`);
                    return {
                        authors: pypiAuthors,
                        packageFunding: pypiFunding,  // Package-level funding (from project_urls)
                        description: description,
                        packageWarnings: this.parsePackageWarnings(description)
                    };
                
                case 'cargo':
                    // crates.io API
                    url = `${this.registryUrls.cargo}/${packageName}`;
                    console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
                    console.log(`   Reason: Fetching crates.io package metadata for ${packageName} to extract authors and funding information`);
                    const cargoResponse = await fetch(url);
                    if (!cargoResponse.ok) {
                        console.log(`   ❌ Response: Status ${cargoResponse.status} ${cargoResponse.statusText}`);
                        return { authors: [], packageFunding: null };
                    }
                    data = await cargoResponse.json();
                    description = data.crate?.description || null;
                    const cargoAuthors = this.extractCargoAuthors(data);
                    console.log(`   ✅ Response: Status ${cargoResponse.status}, Extracted: ${cargoAuthors.length} author(s), description: ${description ? 'yes' : 'no'}`);
                    return {
                        authors: cargoAuthors,
                        packageFunding: null,  // Crates.io doesn't have funding field in API
                        description: description,
                        packageWarnings: this.parsePackageWarnings(description)
                    };
                
                case 'gem':
                    // RubyGems API
                    url = `${this.registryUrls.gem}/${packageName}.json`;
                    console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
                    console.log(`   Reason: Fetching RubyGems package metadata for ${packageName} to extract authors and funding information`);
                    const gemResponse = await fetch(url);
                    if (!gemResponse.ok) {
                        console.log(`   ❌ Response: Status ${gemResponse.status} ${gemResponse.statusText}`);
                        return { authors: [], packageFunding: null };
                    }
                    data = await gemResponse.json();
                    description = data.info || data.description || null;
                    const gemAuthors = this.extractGemAuthors(data);
                    const gemFunding = this.extractGemFunding(data);
                    console.log(`   ✅ Response: Status ${gemResponse.status}, Extracted: ${gemAuthors.length} author(s), funding: ${gemFunding ? 'yes' : 'no'}, description: ${description ? 'yes' : 'no'}`);
                    return {
                        authors: gemAuthors,
                        packageFunding: gemFunding,  // Package-level funding
                        description: description,
                        packageWarnings: this.parsePackageWarnings(description)
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
     * Parse package description for warnings (maintenance and deprecation)
     * @param {string} description - Package description text
     * @returns {Object} - {isUnmaintained: bool, warningType: string, isDeprecated: bool, replacement: string|null}
     */
    parsePackageWarnings(description) {
        if (!description || typeof description !== 'string') {
            return {
                isUnmaintained: false,
                warningType: null,
                isDeprecated: false,
                replacement: null,
                deprecationReason: null
            };
        }
        
        const descLower = description.toLowerCase();
        const warnings = {
            isUnmaintained: false,
            warningType: null,
            isDeprecated: false,
            replacement: null,
            deprecationReason: null
        };
        
        // Check for maintenance warnings
        const maintenancePatterns = [
            /out\s+of\s+support/i,
            /no\s+longer\s+supported/i,
            /end\s+of\s+life/i,
            /\beol\b/i,
            /end-of-life/i,
            /not\s+maintained/i,
            /unmaintained/i,
            /abandoned/i,
            /archived/i,
            /no\s+longer\s+maintained/i
        ];
        
        for (const pattern of maintenancePatterns) {
            if (pattern.test(description)) {
                warnings.isUnmaintained = true;
                if (pattern.source.includes('support') || pattern.source.includes('life') || pattern.source.includes('eol')) {
                    warnings.warningType = 'out-of-support';
                } else {
                    warnings.warningType = 'unmaintained';
                }
                break;
            }
        }
        
        // Check for deprecation warnings
        const deprecationPatterns = [
            /\bdeprecated\b/i,
            /\bdeprecation\b/i,
            /\bdeprecating\b/i
        ];
        
        for (const pattern of deprecationPatterns) {
            if (pattern.test(description)) {
                warnings.isDeprecated = true;
                break;
            }
        }
        
        // Extract replacement package if mentioned
        const replacementPatterns = [
            /superseded\s+by\s+([a-zA-Z0-9@\/\-_\.]+)/i,
            /replaced\s+by\s+([a-zA-Z0-9@\/\-_\.]+)/i,
            /use\s+([a-zA-Z0-9@\/\-_\.]+)\s+instead/i,
            /migrate\s+to\s+([a-zA-Z0-9@\/\-_\.]+)/i,
            /successor\s+is\s+([a-zA-Z0-9@\/\-_\.]+)/i,
            /consider\s+using\s+([a-zA-Z0-9@\/\-_\.]+)/i
        ];
        
        for (const pattern of replacementPatterns) {
            const match = description.match(pattern);
            if (match && match[1]) {
                warnings.replacement = match[1].trim();
                break;
            }
        }
        
        return warnings;
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
                if (type === 'github' || isUrlFromHostname(url, 'github.com', '/sponsors')) {
                    funding.github = true;
                    funding.githubUrl = url;
                }
                if (type === 'patreon' || isUrlFromHostname(url, 'patreon.com')) {
                    funding.patreon = true;
                    funding.patreonUrl = url;
                }
                if (type === 'opencollective' || isUrlFromHostname(url, 'opencollective.com')) {
                    funding.opencollective = true;
                    funding.opencollectiveUrl = url;
                }
                if (type === 'tidelift' || isUrlFromHostname(url, 'tidelift.com')) {
                    funding.tidelift = true;
                    funding.tideliftUrl = url;
                }
            });
        } else if (data.funding.url) {
            funding.url = data.funding.url;
            funding.type = data.funding.type;
            
            // Set platform flags based on URL (secure hostname validation)
            if (isUrlFromHostname(funding.url, 'github.com', '/sponsors')) {
                funding.github = true;
                funding.githubUrl = funding.url;
            }
            if (isUrlFromHostname(funding.url, 'patreon.com')) {
                funding.patreon = true;
                funding.patreonUrl = funding.url;
            }
            if (isUrlFromHostname(funding.url, 'opencollective.com')) {
                funding.opencollective = true;
                funding.opencollectiveUrl = funding.url;
            }
            if (isUrlFromHostname(funding.url, 'tidelift.com')) {
                funding.tidelift = true;
                funding.tideliftUrl = funding.url;
            }
        }
        
        // Fallback: Check for specific platforms in URLs if not already set (secure hostname validation)
        const urls = funding.urls || [funding.url];
        if (urls && urls.length > 0) {
            if (!funding.github) {
                funding.github = urls.some(u => u && isUrlFromHostname(u, 'github.com', '/sponsors'));
                if (funding.github && !funding.githubUrl) {
                    funding.githubUrl = urls.find(u => u && isUrlFromHostname(u, 'github.com', '/sponsors'));
                }
            }
            if (!funding.opencollective) {
                funding.opencollective = urls.some(u => u && isUrlFromHostname(u, 'opencollective.com'));
                if (funding.opencollective && !funding.opencollectiveUrl) {
                    funding.opencollectiveUrl = urls.find(u => u && isUrlFromHostname(u, 'opencollective.com'));
                }
            }
            if (!funding.patreon) {
                funding.patreon = urls.some(u => u && isUrlFromHostname(u, 'patreon.com'));
                if (funding.patreon && !funding.patreonUrl) {
                    funding.patreonUrl = urls.find(u => u && isUrlFromHostname(u, 'patreon.com'));
                }
            }
            if (!funding.tidelift) {
                funding.tidelift = urls.some(u => u && isUrlFromHostname(u, 'tidelift.com'));
                if (funding.tidelift && !funding.tideliftUrl) {
                    funding.tideliftUrl = urls.find(u => u && isUrlFromHostname(u, 'tidelift.com'));
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
                if (isUrlFromHostname(url, 'github.com', '/sponsors')) funding.github = true;
                if (isUrlFromHostname(url, 'opencollective.com')) funding.opencollective = true;
                if (isUrlFromHostname(url, 'patreon.com')) funding.patreon = true;
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
        if (isUrlFromHostname(fundingUrl, 'github.com', '/sponsors')) funding.github = true;
        if (isUrlFromHostname(fundingUrl, 'opencollective.com')) funding.opencollective = true;
        if (isUrlFromHostname(fundingUrl, 'patreon.com')) funding.patreon = true;
        
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
            console.log(`🌐 [DEBUG] Fetching URL: ${githubProfileJsonUrl} (HEAD)`);
            console.log(`   Reason: Checking if GitHub profile.json exists for user ${githubUsername} to extract funding information`);
            let response = await fetch(githubProfileJsonUrl, { 
                method: 'HEAD',  // Check if file exists without downloading
                cache: 'no-cache'
            });
            console.log(`   ✅ Response: Status ${response.status} ${response.statusText}`);

            if (response.ok) {
                // File exists, fetch it
                console.log(`🌐 [DEBUG] Fetching URL: ${githubProfileJsonUrl}`);
                console.log(`   Reason: Fetching GitHub profile.json for user ${githubUsername} to extract funding information`);
                response = await fetch(githubProfileJsonUrl, { cache: 'no-cache' });
                if (response.ok) {
                    const profile = await response.json();
                    const hasFunding = profile.sponsor && profile.sponsor.github;
                    console.log(`   ✅ Response: Status ${response.status}, Extracted: Profile data, funding: ${hasFunding ? 'yes' : 'no'}`);
                    if (hasFunding) {
                        const funding = {
                            url: `https://github.com/sponsors/${githubUsername}`,
                            github: true
                        };
                        // Update author entity with funding
                        authorEntity.funding = funding;
                        await window.cacheManager.saveAuthorEntity(authorKey, authorEntity);
                        return funding;
                    }
                } else {
                    console.log(`   ❌ Response: Status ${response.status} ${response.statusText}`);
                }
            }

            // Try alternative: .github/FUNDING.yml (GitHub Sponsors)
            const fundingYmlUrl = `https://raw.githubusercontent.com/${githubUsername}/.github/main/FUNDING.yml`;
            console.log(`🌐 [DEBUG] Fetching URL: ${fundingYmlUrl}`);
            console.log(`   Reason: Fetching GitHub FUNDING.yml for user ${githubUsername} to extract funding information`);
            response = await fetch(fundingYmlUrl, { cache: 'no-cache' });
            if (response.ok) {
                const yml = await response.text();
                // Simple parsing for FUNDING.yml
                const githubMatch = yml.match(/github:\s*(\S+)/i);
                const customMatch = yml.match(/custom:\s*(\S+)/i);
                
                const hasFunding = !!(githubMatch || customMatch);
                console.log(`   ✅ Response: Status ${response.status}, Extracted: FUNDING.yml content, funding: ${hasFunding ? 'yes' : 'no'}`);
                
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
                    if (isUrlFromHostname(url, 'opencollective.com')) funding.opencollective = true;
                    if (isUrlFromHostname(url, 'patreon.com')) funding.patreon = true;
                    
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
     * Fetch author location from GitHub API and other sources
     * @param {string} authorKey - Author identifier (e.g., "github:username" or "pypi:authorName")
     * @param {Object} authorEntity - Existing author entity
     * @returns {Promise<Object|null>} - Location data {location: string, company: string} or null
     */
    async fetchAuthorLocation(authorKey, authorEntity) {
        // Check IndexedDB first - reload entity to ensure we have latest data
        if (!authorEntity) {
            authorEntity = await window.cacheManager?.getAuthorEntity(authorKey);
        }
        
        // If author already has location data in DB, don't refetch
        if (authorEntity?.metadata?.location || authorEntity?.metadata?.company) {
            return {
                location: authorEntity.metadata.location || null,
                company: authorEntity.metadata.company || null
            };
        }

        const githubUsername = authorEntity?.metadata?.github;
        if (!githubUsername) {
            return null;  // Can't fetch without GitHub username
        }

        try {
            // Fetch from GitHub API if GitHubClient is available
            if (window.GitHubClient) {
                const githubClient = new window.GitHubClient();
                // Get GitHub token from sessionStorage if available
                const token = sessionStorage.getItem('github_token') || null;
                if (token) {
                    githubClient.setToken(token);
                }
                
                const userData = await githubClient.getUser(githubUsername);
                
                // CRITICAL: Do NOT associate GitHub organizations with individual authors
                // Organizations (type: "Organization") should not be used for author location/profile
                if (userData && userData.type === 'Organization') {
                    console.warn(`⚠️ Skipping GitHub organization "${githubUsername}" for author ${authorKey} - organizations should not be associated with individual authors`);
                    // Remove GitHub username from metadata if it's an organization
                    if (authorEntity.metadata?.github === githubUsername) {
                        const updatedMetadata = { ...authorEntity.metadata };
                        delete updatedMetadata.github;
                        authorEntity.metadata = Object.keys(updatedMetadata).length > 0 ? updatedMetadata : null;
                        await window.cacheManager.saveAuthorEntity(authorKey, authorEntity);
                    }
                    return null;
                }
                
                if (userData && (userData.location || userData.company)) {
                    // Geocode location to get country code if location is available
                    let countryCode = null;
                    let country = null;
                    if (userData.location && window.LocationService) {
                        try {
                            const locationService = new window.LocationService();
                            const geocoded = await locationService.geocode(userData.location);
                            if (geocoded && geocoded.countryCode) {
                                countryCode = geocoded.countryCode;
                                country = geocoded.country;
                            }
                        } catch (error) {
                            console.debug(`Could not geocode location "${userData.location}" for ${authorKey}:`, error.message);
                        }
                    }
                    
                    // Update author entity metadata with location data
                    // Preserve existing metadata fields by merging
                    const existingMetadata = authorEntity.metadata || {};
                    const updatedMetadata = {
                        ...existingMetadata,
                        ...(userData.location && { location: userData.location }),
                        ...(userData.company && { company: userData.company }),
                        ...(countryCode && { countryCode: countryCode }),
                        ...(country && { country: country })
                    };
                    
                    // Update author entity with merged metadata
                    authorEntity.metadata = updatedMetadata;
                    
                    // Save updated entity to cache (this will persist to IndexedDB)
                    await window.cacheManager.saveAuthorEntity(authorKey, authorEntity);
                    console.log(`📍 Fetched and saved location to IndexedDB for ${authorKey}: ${userData.location || 'N/A'}, company: ${userData.company || 'N/A'}, country: ${countryCode || 'N/A'}`);
                    
                    return {
                        location: userData.location || null,
                        company: userData.company || null,
                        countryCode: countryCode || null,
                        country: country || null
                    };
                }
            }
        } catch (error) {
            // Silently fail - author location is optional
            console.debug(`Could not fetch author location for ${authorKey}:`, error.message);
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
            // IMPORTANT: Use full package endpoint, NOT version-specific endpoint
            // Full package endpoint: "https://packages.ecosyste.ms/api/v1/registries/{registry.name}/packages/{package}"
            // This provides maintainers array at top level (NOT in issue_metadata)
            // Version endpoint would be: .../packages/{package}/versions/{version} - DO NOT USE for author extraction
            const url = `${registry.packages_url}/${encodeURIComponent(packageName)}`;
            
            console.log(`🔍 Fetching from ecosyste.ms (full package): ${ecosystem} → ${registry.name} (${url})`);
            console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
            console.log(`   Reason: Fetching ecosyste.ms package metadata for ${packageName} (${ecosystem}/${registry.name}) to extract maintainers/authors`);
            
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`ecosyste.ms returned ${response.status} for ${registry.name}/${packageName}`);
                console.log(`   ❌ Response: Status ${response.status} ${response.statusText}`);
                return [];
            }
            
            const data = await response.json();
            
            // Debug: Log extracted information
            const authors = this.extractEcosystemsAuthors(data);
            const hasMaintainers = !!(data.maintainers || data.owners || data.author);
            console.log(`   ✅ Response: Status ${response.status}, Extracted: ${authors.length} author(s), has maintainers/owners/author fields: ${hasMaintainers}`);
            
            // Verify we have the expected structure (top-level maintainers array)
            if (!data.maintainers && !data.owners && !data.author) {
                console.warn(`⚠️ ecosyste.ms response for ${packageName} has no maintainers/owners/author fields`);
            }
            
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
                    console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
                    console.log(`   Reason: Fetching npm package metadata for ${packageName} to extract repository URL`);
                    const npmResponse = await fetch(url);
                    if (!npmResponse.ok) {
                        console.log(`   ❌ Response: Status ${npmResponse.status} ${npmResponse.statusText}`);
                        return null;
                    }
                    data = await npmResponse.json();
                    const npmRepo = data.repository ? (typeof data.repository === 'string' ? data.repository : data.repository.url) : null;
                    console.log(`   ✅ Response: Status ${npmResponse.status}, Extracted: Repository URL: ${npmRepo || 'none'}`);
                    if (npmRepo) {
                        return npmRepo;
                    }
                    break;
                
                case 'pypi':
                    url = `${this.registryUrls.pypi}/${packageName}/json`;
                    console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
                    console.log(`   Reason: Fetching PyPI package metadata for ${packageName} to extract repository URL`);
                    const pypiResponse = await fetch(url);
                    if (!pypiResponse.ok) {
                        console.log(`   ❌ Response: Status ${pypiResponse.status} ${pypiResponse.statusText}`);
                        return null;
                    }
                    data = await pypiResponse.json();
                    const pypiRepo = data.info && data.info.project_urls ? 
                        (data.info.project_urls.Source || data.info.project_urls.Homepage || data.info.project_urls.Repository) : null;
                    console.log(`   ✅ Response: Status ${pypiResponse.status}, Extracted: Repository URL: ${pypiRepo || 'none'}`);
                    if (pypiRepo) {
                        return pypiRepo;
                    }
                    break;
                
                case 'cargo':
                    url = `${this.registryUrls.cargo}/${packageName}`;
                    console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
                    console.log(`   Reason: Fetching crates.io package metadata for ${packageName} to extract repository URL`);
                    const cargoResponse = await fetch(url);
                    if (!cargoResponse.ok) {
                        console.log(`   ❌ Response: Status ${cargoResponse.status} ${cargoResponse.statusText}`);
                        return null;
                    }
                    data = await cargoResponse.json();
                    const cargoRepo = data.crate && data.crate.repository ? data.crate.repository : null;
                    console.log(`   ✅ Response: Status ${cargoResponse.status}, Extracted: Repository URL: ${cargoRepo || 'none'}`);
                    if (cargoRepo) {
                        return cargoRepo;
                    }
                    break;
                
                case 'gem':
                    url = `${this.registryUrls.gem}/${packageName}.json`;
                    console.log(`🌐 [DEBUG] Fetching URL: ${url}`);
                    console.log(`   Reason: Fetching RubyGems package metadata for ${packageName} to extract repository URL`);
                    const gemResponse = await fetch(url);
                    if (!gemResponse.ok) {
                        console.log(`   ❌ Response: Status ${gemResponse.status} ${gemResponse.statusText}`);
                        return null;
                    }
                    data = await gemResponse.json();
                    const gemRepo = data.source_code_uri || data.homepage_uri || null;
                    console.log(`   ✅ Response: Status ${gemResponse.status}, Extracted: Repository URL: ${gemRepo || 'none'}`);
                    if (gemRepo) {
                        return gemRepo;
                    }
                    break;
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Fetch authors for GitHub Actions by extracting owner/repo from package name
     * Package name format: owner/repo@ref or owner/repo/path@ref
     */
    async fetchAuthorsFromGitHubAction(packageName) {
        try {
            // Parse GitHub Action name: owner/repo@ref or owner/repo/path@ref
            const match = packageName.match(/^([^/@]+)\/([^/@]+)(?:\/(.+))?@(.+)$/);
            if (!match) {
                // Try without @ref: owner/repo or owner/repo/path
                const simpleMatch = packageName.match(/^([^/@]+)\/([^/@]+)(?:\/(.+))?$/);
                if (simpleMatch) {
                    const [, owner, repo] = simpleMatch;
                    // Use GitHub API to get repository owner info
                    if (window.GitHubClient) {
                        try {
                            // Get GitHub token from sessionStorage if available
                            const token = sessionStorage.getItem('github_token') || null;
                            const githubClient = new window.GitHubClient();
                            if (token) {
                                githubClient.setToken(token);
                            }
                            const repoInfo = await githubClient.getRepository(owner, repo);
                            if (repoInfo && repoInfo.owner) {
                                return [{
                                    name: repoInfo.owner.login || repoInfo.owner.name || owner,
                                    email: null,
                                    metadata: {
                                        github: repoInfo.owner.login || owner,
                                        type: repoInfo.owner.type || 'User',
                                        url: repoInfo.owner.html_url || `https://github.com/${owner}`
                                    },
                                    isMaintainer: true
                                }];
                            }
                        } catch (error) {
                            console.warn(`Failed to fetch GitHub repo info for ${owner}/${repo}:`, error);
                        }
                    }
                    // Fallback: return owner as author
                    return [{
                        name: owner,
                        email: null,
                        metadata: {
                            github: owner,
                            url: `https://github.com/${owner}`
                        },
                        isMaintainer: true
                    }];
                }
                return [];
            }
            
            const [, owner, repo] = match;
            
            // Use GitHub API to get repository owner info
            if (window.GitHubClient) {
                try {
                    // Get GitHub token from sessionStorage if available
                    const token = sessionStorage.getItem('github_token') || null;
                    const githubClient = new window.GitHubClient();
                    if (token) {
                        githubClient.setToken(token);
                    }
                    const repoInfo = await githubClient.getRepository(owner, repo);
                    if (repoInfo && repoInfo.owner) {
                        return [{
                            name: repoInfo.owner.login || repoInfo.owner.name || owner,
                            email: null,
                            metadata: {
                                github: repoInfo.owner.login || owner,
                                type: repoInfo.owner.type || 'User',
                                url: repoInfo.owner.html_url || `https://github.com/${owner}`
                            },
                            isMaintainer: true
                        }];
                    }
                } catch (error) {
                    console.warn(`Failed to fetch GitHub repo info for ${owner}/${repo}:`, error);
                }
            }
            
            // Fallback: return owner as author
            return [{
                name: owner,
                email: null,
                metadata: {
                    github: owner,
                    url: `https://github.com/${owner}`
                },
                isMaintainer: true
            }];
        } catch (error) {
            console.warn(`Error extracting authors from GitHub Action ${packageName}:`, error);
            return [];
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
                const authorObj = { name: data.author, email: null, isMaintainer: false };
                if (githubUsername) {
                    authorObj.metadata = { github: githubUsername };
                }
                authorObjects.push(authorObj);
            } else {
                const authorObj = { 
                    name: data.author.name || null, 
                    email: data.author.email || null,
                    isMaintainer: false
                };
                if (githubUsername) {
                    authorObj.metadata = { github: githubUsername };
                }
                authorObjects.push(authorObj);
            }
        }
        // CONTEXT: If maintainers exist, also collect author for deduplication (may be same person)
        else if (hasMaintainers && data.author) {
            // Add author only for deduplication purposes (will be merged if same as maintainer)
            if (typeof data.author === 'string') {
                const authorObj = { name: data.author, email: null, isMaintainer: false };
                if (githubUsername) {
                    authorObj.metadata = { github: githubUsername };
                }
                authorObjects.push(authorObj);
            } else {
                const authorObj = { 
                    name: data.author.name || null, 
                    email: data.author.email || null,
                    isMaintainer: false
                };
                if (githubUsername) {
                    authorObj.metadata = { github: githubUsername };
                }
                authorObjects.push(authorObj);
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
     * Merge author metadata, preserving ALL profile information from both sources
     * This ensures that when authors are merged (same email/GitHub), all ecosystem-specific
     * profile information (npm_username, pypi_username, rubygems_username, etc.) is preserved
     * @param {Object} metadata1 - First author's metadata
     * @param {Object} metadata2 - Second author's metadata
     * @returns {Object} Merged metadata with all profile fields preserved
     */
    mergeAuthorMetadata(metadata1, metadata2) {
        if (!metadata1 && !metadata2) return null;
        if (!metadata1) return metadata2;
        if (!metadata2) return metadata1;
        
        // Merge both metadata objects, preserving all keys
        // Profile fields that should be preserved: npm_username, pypi_username, rubygems_username, github, location, company, etc.
        const merged = { ...metadata1, ...metadata2 };
        
        // For fields that might have different values, prefer non-null values
        // But for profile usernames, they should be different keys per ecosystem, so both will be preserved
        
        return merged;
    }

    /**
     * Deduplicate authors by email OR GitHub username (primary keys) and similar names (fallback)
     * Prefer full names over usernames, and names over emails
     * Consolidation signals: email OR GitHub username (same person if either matches)
     * IMPORTANT: When merging, ALL profile information is preserved (npm, PyPI, RubyGems, GitHub, etc.)
     */
    deduplicateAuthorsByEmail(authorObjects) {
        if (authorObjects.length === 0) return [];
        
        // Step 1: Group by email OR GitHub username (most reliable deduplication)
        // Use email as primary key, but also track GitHub username for cross-referencing
        const emailMap = new Map(); // email -> author
        const githubMap = new Map(); // github username -> author (for cross-reference)
        const noEmailNoGithubAuthors = [];
        
        authorObjects.forEach(author => {
            const email = author.email;
            const github = author.metadata?.github;
            
            // Check if author has email
            if (email) {
                const existing = emailMap.get(email);
                if (!existing) {
                    emailMap.set(email, author);
                    // Also track by GitHub if available
                    if (github) {
                        githubMap.set(github, author);
                    }
                } else {
                    // Same email - merge (prefer maintainer, longer name, more complete metadata)
                    // IMPORTANT: Preserve ALL profile information from both authors
                    const preferNew = author.isMaintainer || 
                        (!existing.isMaintainer && !author.isMaintainer && 
                         author.name && (!existing.name || author.name.length > existing.name.length));
                    
                    // Merge metadata: preserve ALL profile fields (npm_username, pypi_username, rubygems_username, github, etc.)
                    // Spread both metadata objects to ensure all profile information is preserved
                    const mergedMetadata = this.mergeAuthorMetadata(existing.metadata, author.metadata);
                    
                    if (preferNew) {
                        const merged = { 
                            name: author.name || existing.name, 
                            email: author.email,
                            isMaintainer: author.isMaintainer || existing.isMaintainer || false,
                            metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null
                        };
                        emailMap.set(email, merged);
                        if (github || merged.metadata?.github) {
                            githubMap.set(github || merged.metadata.github, merged);
                        }
                    } else {
                        // Merge metadata into existing
                        const merged = {
                            ...existing,
                            isMaintainer: author.isMaintainer || existing.isMaintainer || false,
                            metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : existing.metadata
                        };
                        emailMap.set(email, merged);
                        if (github || merged.metadata?.github) {
                            githubMap.set(github || merged.metadata.github, merged);
                        }
                    }
                }
            } 
            // Check if author has GitHub username (but no email)
            else if (github) {
                const existingByGithub = githubMap.get(github);
                if (!existingByGithub) {
                    // Check if there's an existing author with same GitHub in emailMap
                    let foundInEmailMap = false;
                    for (const [existingEmail, existingAuthor] of emailMap.entries()) {
                        if (existingAuthor.metadata?.github === github) {
                            // Found existing author with same GitHub - merge
                            // IMPORTANT: Preserve ALL profile information from both authors
                            const mergedMetadata = this.mergeAuthorMetadata(existingAuthor.metadata, author.metadata);
                            const merged = {
                                ...existingAuthor,
                                isMaintainer: author.isMaintainer || existingAuthor.isMaintainer || false,
                                metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : existingAuthor.metadata
                            };
                            emailMap.set(existingEmail, merged);
                            githubMap.set(github, merged);
                            foundInEmailMap = true;
                            break;
                        }
                    }
                    if (!foundInEmailMap) {
                        githubMap.set(github, author);
                    }
                } else {
                    // Same GitHub username - merge
                    // IMPORTANT: Preserve ALL profile information from both authors
                    const preferNew = author.isMaintainer || 
                        (!existingByGithub.isMaintainer && !author.isMaintainer && 
                         author.name && (!existingByGithub.name || author.name.length > existingByGithub.name.length));
                    
                    // Merge metadata: preserve ALL profile fields
                    const mergedMetadata = this.mergeAuthorMetadata(existingByGithub.metadata, author.metadata);
                    
                    if (preferNew) {
                        const merged = {
                            name: author.name || existingByGithub.name,
                            email: existingByGithub.email || null,
                            isMaintainer: author.isMaintainer || existingByGithub.isMaintainer || false,
                            metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null
                        };
                        githubMap.set(github, merged);
                        // Update emailMap if existing had email
                        if (existingByGithub.email) {
                            emailMap.set(existingByGithub.email, merged);
                        }
                    } else {
                        const merged = {
                            ...existingByGithub,
                            isMaintainer: author.isMaintainer || existingByGithub.isMaintainer || false,
                            metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : existingByGithub.metadata
                        };
                        githubMap.set(github, merged);
                        if (existingByGithub.email) {
                            emailMap.set(existingByGithub.email, merged);
                        }
                    }
                }
            }
            // No email, no GitHub - add to noEmailNoGithubAuthors for name-based deduplication
            else if (author.name) {
                noEmailNoGithubAuthors.push(author);
            }
        });
        
        // Step 2: Combine all authors from emailMap and githubMap (avoid duplicates)
        // Authors in emailMap are primary, githubMap may have additional authors without emails
        const allDeduplicatedAuthors = new Map(); // Use author key to avoid duplicates
        
        // Add all authors from emailMap (these have emails)
        Array.from(emailMap.values()).forEach(author => {
            const key = author.email || author.metadata?.github || author.name;
            if (key) {
                allDeduplicatedAuthors.set(key, author);
            }
        });
        
        // Add authors from githubMap that aren't already in emailMap
        Array.from(githubMap.values()).forEach(author => {
            const key = author.email || author.metadata?.github || author.name;
            if (key && !allDeduplicatedAuthors.has(key)) {
                allDeduplicatedAuthors.set(key, author);
            }
        });
        
        // Step 3: Deduplicate authors without emails/GitHub by similar names
        const mergedNoEmailNoGithub = this.deduplicateSimilarNames(noEmailNoGithubAuthors);
        
        // Step 4: Cross-check noEmailNoGithubAuthors against deduplicated authors for similar names
        // If a no-email/no-github author matches an existing author, merge them
        const finalAuthors = Array.from(allDeduplicatedAuthors.values());
        const usedNoEmailNoGithubIndices = new Set();
        
        finalAuthors.forEach((existingAuthor, idx) => {
            let bestName = existingAuthor.name;
            let bestEmail = existingAuthor.email;
            let bestMetadata = existingAuthor.metadata || {};
            let isMaintainer = existingAuthor.isMaintainer || false;
            
            // Check if any no-email/no-github author is similar
            mergedNoEmailNoGithub.forEach((noEmailNoGithubAuthor, noIdx) => {
                if (usedNoEmailNoGithubIndices.has(noIdx)) return;
                
                if (noEmailNoGithubAuthor.name && existingAuthor.name && 
                    this.areSimilarAuthors(noEmailNoGithubAuthor.name, existingAuthor.name)) {
                    // Prefer maintainer over author, then prefer longer/fuller name
                    if (noEmailNoGithubAuthor.isMaintainer && !isMaintainer) {
                        bestName = noEmailNoGithubAuthor.name;
                        isMaintainer = true;
                    } else if (!noEmailNoGithubAuthor.isMaintainer && !isMaintainer && noEmailNoGithubAuthor.name.length > bestName.length) {
                        // Only prefer longer name if neither is maintainer
                        bestName = noEmailNoGithubAuthor.name;
                    }
                    // Preserve metadata from either source (merge both)
                    // IMPORTANT: Preserve ALL profile information
                    if (noEmailNoGithubAuthor.metadata) {
                        bestMetadata = this.mergeAuthorMetadata(bestMetadata, noEmailNoGithubAuthor.metadata);
                    }
                    usedNoEmailNoGithubIndices.add(noIdx);
                }
            });
            
            // Update the author in finalAuthors array
            if (bestName !== existingAuthor.name || bestEmail !== existingAuthor.email || 
                JSON.stringify(bestMetadata) !== JSON.stringify(existingAuthor.metadata || {}) || 
                isMaintainer !== existingAuthor.isMaintainer) {
                finalAuthors[idx] = {
                    name: bestName,
                    email: bestEmail,
                    metadata: Object.keys(bestMetadata).length > 0 ? bestMetadata : null,
                    isMaintainer: isMaintainer
                };
            }
        });
        
        // Step 5: Add remaining no-email/no-github authors that weren't matched
        mergedNoEmailNoGithub.forEach((author, idx) => {
            if (!usedNoEmailNoGithubIndices.has(idx)) {
                finalAuthors.push(author);
            }
        });
        
        // Step 6: Return objects (preserve metadata), deduplicate by name/email/GitHub
        const seen = new Set();
        return finalAuthors.filter(a => {
            // Use email, GitHub username, or name as deduplication key
            const key = a.email || a.metadata?.github || a.name;
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
     * Fetch top contributors from GitHub repository
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {boolean} fetchProfiles - Whether to fetch full user profiles (default: true)
     * @returns {Promise<Array>} - Array of contributor objects
     */
    async fetchContributorsFromGitHub(owner, repo, fetchProfiles = true) {
        if (!window.GitHubClient) {
            return [];
        }

        try {
            const githubClient = new window.GitHubClient();
            const token = sessionStorage.getItem('github_token') || null;
            if (token) {
                githubClient.setToken(token);
            }
            
            // Fetch full profiles by default (can be set to false to save API calls if needed)
            const contributors = await githubClient.getContributors(owner, repo, 10, fetchProfiles);
            return contributors;
        } catch (error) {
            console.warn(`Failed to fetch GitHub contributors for ${owner}/${repo}:`, error);
            return [];
        }
    }

    /**
     * Correlate authors with GitHub contributors (tentative correlation)
     * If same GitHub user ID exists, consider them the same person
     * Mark as tentative correlation (not confirmed)
     * 
     * @param {Array} authors - Existing authors
     * @param {Array} contributors - GitHub contributors
     * @returns {Array} - Authors with tentative correlations added
     */
    correlateWithContributors(authors, contributors) {
        if (!contributors || contributors.length === 0) {
            return authors;
        }

        // Build map of existing GitHub usernames
        const existingGitHubUsers = new Set();
        authors.forEach(author => {
            const github = typeof author === 'string' ? null : (author.metadata?.github);
            if (github) {
                existingGitHubUsers.add(github.toLowerCase());
            }
        });

        // Add contributors that aren't already in authors list
        const newAuthors = [];
        contributors.forEach(contributor => {
            const contributorLogin = contributor.login?.toLowerCase();
            if (contributorLogin && !existingGitHubUsers.has(contributorLogin)) {
                // Check if this contributor matches any existing author by GitHub username
                let matched = false;
                for (const author of authors) {
                    const authorObj = typeof author === 'string' ? { name: author } : author;
                    const authorGithub = authorObj.metadata?.github?.toLowerCase();
                    
                    // If same GitHub user ID, mark as tentative correlation
                    if (authorGithub === contributorLogin) {
                        matched = true;
                        // Update author with contributor info (location, etc.)
                        if (!authorObj.metadata) {
                            authorObj.metadata = {};
                        }
                        authorObj.metadata.tentative_correlation = true;
                        authorObj.metadata.correlation_source = 'github_contributor';
                        if (contributor.location && !authorObj.metadata.location) {
                            authorObj.metadata.location = contributor.location;
                        }
                        if (contributor.company && !authorObj.metadata.company) {
                            authorObj.metadata.company = contributor.company;
                        }
                        break;
                    }
                }
                
                // If not matched, add as new author with tentative flag
                if (!matched) {
                    newAuthors.push({
                        name: contributor.name || contributor.login,
                        email: null,
                        metadata: {
                            github: contributor.login,
                            location: contributor.location || null,
                            company: contributor.company || null,
                            tentative_correlation: true,
                            correlation_source: 'github_contributor',
                            contributions: contributor.contributions
                        },
                        isMaintainer: false
                    });
                }
            }
        });

        return [...authors, ...newAuthors];
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
        
        // Extract GitHub username from repository URL if available
        let githubUsername = null;
        if (data.crate && data.crate.repository) {
            const githubMatch = data.crate.repository.match(/github\.com[\/:]([^\/]+)/i);
            if (githubMatch) {
                githubUsername = githubMatch[1];
            }
        }
        
        // Try to get from owners/maintainers if available
        if (data.users && Array.isArray(data.users)) {
            data.users.forEach(user => {
                if (user) {
                    const authorObj = {
                        name: user.name || user.login || null,
                        email: user.login || null  // Use login as pseudo-email for dedup
                    };
                    
                    // Add GitHub username if available
                    if (githubUsername) {
                        authorObj.metadata = { github: githubUsername, cargo_username: user.login };
                    } else if (user.login) {
                        authorObj.metadata = { cargo_username: user.login };
                    }
                    
                    authorObjects.push(authorObj);
                }
            });
        }
        
        // Fallback to authors array (usually formatted strings)
        if (data.crate && data.crate.authors && Array.isArray(data.crate.authors)) {
            data.crate.authors.forEach(author => {
                if (author) {
                    const authorObj = { name: author, email: null };
                    if (githubUsername) {
                        authorObj.metadata = { github: githubUsername };
                    }
                    authorObjects.push(authorObj);
                }
            });
        }
        
        if (data.versions && Array.isArray(data.versions) && data.versions[0]) {
            const latestVersion = data.versions[0];
            if (latestVersion.authors && Array.isArray(latestVersion.authors)) {
                latestVersion.authors.forEach(author => {
                    if (author) {
                        const authorObj = { name: author, email: null };
                        if (githubUsername) {
                            authorObj.metadata = { github: githubUsername };
                        }
                        authorObjects.push(authorObj);
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
        
        // Extract GitHub username from source_code_uri or homepage_uri if available
        // CRITICAL: Do NOT associate GitHub organizations with individual authors
        // The repository owner (e.g., "ruby" org) is NOT the same as the package author
        let githubUsername = null;
        const repoUrl = data.source_code_uri || data.homepage_uri;
        if (repoUrl) {
            const githubMatch = repoUrl.match(/github\.com[\/:]([^\/]+)/i);
            if (githubMatch) {
                githubUsername = githubMatch[1];
                // NOTE: We will check if this is an organization later when fetching GitHub profile
                // For now, we extract it but won't blindly associate it with authors
                // The GitHub profile lookup will verify if it's a User or Organization
            }
        }
        
        if (data.authors) {
            if (typeof data.authors === 'string') {
                // RubyGems may have comma-separated authors: "Author1, Author2, Author3"
                const authorNames = this.splitCommaSeparatedAuthors(data.authors);
                authorNames.forEach(authorName => {
                    if (authorName && authorName.trim()) {
                        const authorObj = { name: authorName.trim(), email: null };
                        // DO NOT associate repository owner (which might be an org) with individual authors
                        // GitHub username will be checked separately to verify it's a User, not Organization
                        // Only associate if we can verify it's a user (done in fetchAuthorLocation)
                        authorObjects.push(authorObj);
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
                                    const authorObj = { name: authorName.trim(), email: null };
                                    // DO NOT associate repository owner with individual authors
                                    authorObjects.push(authorObj);
                                }
                            });
                        } else {
                            const authorObj = { name: author, email: null };
                            // DO NOT associate repository owner with individual authors
                            authorObjects.push(authorObj);
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
     * IMPORTANT: Extract maintainers from top-level 'maintainers' array, NOT from 'issue_metadata.maintainers'
     * ecosyste.ms full package endpoint provides: maintainers array with {uuid, login, name, email, html_url, ...}
     * Structure: https://packages.ecosyste.ms/api/v1/registries/{registry}/packages/{package}
     */
    extractEcosystemsAuthors(data) {
        const authorObjects = [];
        
        // CRITICAL: Extract from top-level 'maintainers' array only
        // Do NOT use 'issue_metadata.maintainers' - that's for issue tracking, not package maintainers
        if (data.maintainers && Array.isArray(data.maintainers)) {
            data.maintainers.forEach(m => {
                if (m) {
                    // ecosyste.ms maintainer structure: {uuid, login, name, email, html_url, packages_count, ...}
                    // login is the username (e.g., "shama"), name might be null or display name
                    const authorLogin = m.login || null;  // Username (e.g., "shama" for npm)
                    const authorName = m.name || authorLogin || null;  // Display name if available, fallback to login
                    const authorEmail = m.email || null;
                    
                    // Build metadata object with login/username
                    const metadata = {};
                    if (authorLogin) {
                        // Store login as username in metadata (for RubyGems, npm, etc.)
                        // The ecosystem will determine which field to use (rubygems_username, npm_username, etc.)
                        metadata.login = authorLogin;
                    }
                    
                    // Store html_url if available (e.g., npm profile URL, RubyGems profile)
                    if (m.html_url) {
                        metadata.html_url = m.html_url;
                        // CRITICAL: Only extract GitHub username if html_url actually points to GitHub
                        // For RubyGems, html_url points to RubyGems profiles (rubygems.org/profiles/...)
                        // Do NOT assume maintainer login = GitHub username without correlation
                        const githubMatch = m.html_url.match(/github\.com\/([^\/]+)/i);
                        if (githubMatch) {
                            // Only add GitHub username if html_url is actually a GitHub URL
                            metadata.github = githubMatch[1];
                        }
                        // NOTE: For RubyGems, html_url is like "https://rubygems.org/profiles/hsbt"
                        // We should NOT assume "hsbt" is a GitHub username without verification
                        // GitHub username should only be added if there's explicit correlation
                    }
                    
                    authorObjects.push({
                        name: authorName,
                        email: authorEmail || null,  // Don't use login as email fallback - keep it null if no email
                        metadata: Object.keys(metadata).length > 0 ? metadata : null
                    });
                }
            });
        }
        
        // Also check owners field (some registries use this instead of maintainers)
        if (data.owners && Array.isArray(data.owners)) {
            data.owners.forEach(o => {
                if (o) {
                    const authorLogin = o.login || null;
                    const authorName = o.name || authorLogin || null;
                    const authorEmail = o.email || null;
                    
                    const metadata = {};
                    if (authorLogin) {
                        metadata.login = authorLogin;
                    }
                    if (o.html_url) {
                        metadata.html_url = o.html_url;
                        // CRITICAL: Only extract GitHub username if html_url actually points to GitHub
                        // Do NOT assume owner login = GitHub username without correlation
                        const githubMatch = o.html_url.match(/github\.com\/([^\/]+)/i);
                        if (githubMatch) {
                            // Only add GitHub username if html_url is actually a GitHub URL
                            metadata.github = githubMatch[1];
                        }
                    }
                    
                    authorObjects.push({
                        name: authorName,
                        email: authorEmail || null,
                        metadata: Object.keys(metadata).length > 0 ? metadata : null
                    });
                }
            });
        }
        
        // Single author field (less common in ecosyste.ms full package endpoint)
        if (data.author) {
            if (typeof data.author === 'string') {
                authorObjects.push({ name: data.author, email: null });
            } else {
                const authorLogin = data.author.login || null;
                const metadata = {};
                if (authorLogin) {
                    metadata.login = authorLogin;
                }
                if (data.author.html_url) {
                    metadata.html_url = data.author.html_url;
                    // CRITICAL: Only extract GitHub username if html_url actually points to GitHub
                    // Do NOT assume author login = GitHub username without correlation
                    const githubMatch = data.author.html_url.match(/github\.com\/([^\/]+)/i);
                    if (githubMatch) {
                        // Only add GitHub username if html_url is actually a GitHub URL
                        metadata.github = githubMatch[1];
                    }
                }
                
                authorObjects.push({
                    name: data.author.name || data.author.login || null,
                    email: data.author.email || null,
                    metadata: Object.keys(metadata).length > 0 ? metadata : null
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
     * Batch fetch authors for multiple packages with funding information (parallelized)
     */
    async fetchAuthorsForPackages(packages, onProgress) {
        const results = new Map();
        const CONCURRENCY_LIMIT = 12; // Process 12 packages concurrently
        let processed = 0;
        
        // Helper function to process a single package
        const processPackage = async (pkg) => {
            // fetchAuthors now returns {authors: [...], funding: {...}} or just [...]
            // NOTE: fetchAuthors() already saves package, authors, and relationships to cache immediately
            const authorData = await this.fetchAuthors(pkg.ecosystem, pkg.name);
            const authors = Array.isArray(authorData) ? authorData : (authorData.authors || []);
            const funding = Array.isArray(authorData) ? null : (authorData.funding || null);
            
            return { pkg, authors, funding };
        };
        
        // Process packages in batches with concurrency limit
        for (let i = 0; i < packages.length; i += CONCURRENCY_LIMIT) {
            const batch = packages.slice(i, i + CONCURRENCY_LIMIT);
            const batchPromises = batch.map(pkg => processPackage(pkg));
            
            // Wait for all packages in this batch to complete
            const batchResults = await Promise.allSettled(batchPromises);
            
            // Process results from this batch
            batchResults.forEach((result) => {
                if (result.status === 'fulfilled') {
                    const { pkg, authors, funding } = result.value;
                    
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
                }
                processed++;
            });
            
            // Update progress
            if (onProgress) {
                onProgress(processed, packages.length);
            }
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

