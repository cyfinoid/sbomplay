/**
 * DepConfuse Service - Dependency Confusion Detection
 * Ported from DepConfuse (https://github.com/th3-j0k3r/DepConfuse)
 * 
 * Detects dependency confusion vulnerabilities by checking:
 * 1. If a package namespace/organization exists in public registries
 * 2. If a package exists in public registries
 * 
 * Uses ecosyste.ms API for registry lookups across 38 package registries.
 */

class DepConfuseService {
    constructor() {
        this.baseUrl = 'https://packages.ecosyste.ms/api/v1';
        this.requestTimeout = 10000; // 10 seconds
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        
        // Cache for API responses to minimize calls
        this.namespaceCache = new Map();
        this.packageCache = new Map();
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
        
        // Mapping from PURL types to ecosyste.ms registry names
        // Ported from DepConfuse: projects/DepConfuse/src/constants.go
        this.packageTypeToRegistry = {
            'npm': 'npmjs.org',
            'golang': 'proxy.golang.org',
            'go': 'proxy.golang.org',
            'docker': 'hub.docker.com',
            'nuget': 'nuget.org',
            'pypi': 'pypi.org',
            'maven': 'repo1.maven.org',
            'packagist': 'packagist.org',
            'composer': 'packagist.org',
            'rubygems': 'rubygems.org',
            'gem': 'rubygems.org',
            'cargo': 'crates.io',
            'cocoapods': 'cocoapods.org',
            'bower': 'bower.io',
            'pub': 'pub.dev',
            'cpan': 'metacpan.org',
            'alpine': 'alpine',
            'github': 'github%20actions',
            'githubactions': 'github%20actions',
            'cran': 'cran.r-project.org',
            'clojars': 'clojars.org',
            'conda': 'conda-forge.org',
            'anaconda': 'anaconda.org',
            'hackage': 'hackage.haskell.org',
            'hex': 'hex.pm',
            'julia': 'juliahub.com',
            'swift': 'swiftpackageindex.com',
            'spack': 'spack.io',
            'homebrew': 'formulae.brew.sh',
            'adelie': 'pkg.adelielinux.org',
            'puppet': 'forge.puppet.com',
            'deno': 'deno.land',
            'elm': 'package.elm-lang.org',
            'racket': 'pkgs.racket-lang.org',
            'vcpkg': 'vcpkg.io',
            'bioconductor': 'bioconductor.org',
            'carthage': 'carthage',
            'postmarketos': 'postmarketos',
            'elpa': 'elpa.gnu.org',
            'nongnu': 'elpa.nongnu.org'
        };
    }

    /**
     * Fetch with timeout helper
     */
    async fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Parse PURL string to extract components
     * @param {string} purl - Package URL (e.g., "pkg:npm/@scope/package@1.0.0")
     * @returns {Object} - { type, namespace, name, version }
     */
    parsePurl(purl) {
        if (!purl || !purl.startsWith('pkg:')) {
            return null;
        }
        
        try {
            // Remove "pkg:" prefix
            let remaining = purl.substring(4);
            
            // Extract type (everything before first /)
            const slashIndex = remaining.indexOf('/');
            if (slashIndex === -1) {
                return null;
            }
            
            const type = remaining.substring(0, slashIndex).toLowerCase();
            remaining = remaining.substring(slashIndex + 1);
            
            // Handle version (after @, but need to be careful with scoped packages)
            let version = null;
            let nameWithNamespace = remaining;
            
            // For scoped packages like @scope/name@version, the last @ is the version separator
            const lastAtIndex = remaining.lastIndexOf('@');
            if (lastAtIndex > 0) {
                // Check if this @ is part of a scoped package name or version
                const beforeAt = remaining.substring(0, lastAtIndex);
                // If there's a / after the first @, the first @ is for scope, last @ is for version
                if (beforeAt.includes('/') || !beforeAt.startsWith('@')) {
                    version = remaining.substring(lastAtIndex + 1);
                    nameWithNamespace = beforeAt;
                }
            }
            
            // Remove any query parameters from version
            if (version && version.includes('?')) {
                version = version.split('?')[0];
            }
            
            // Extract namespace and name
            let namespace = null;
            let name = nameWithNamespace;
            
            // URL decode the name/namespace
            nameWithNamespace = decodeURIComponent(nameWithNamespace);
            
            // Handle npm scoped packages (@scope/name)
            if (nameWithNamespace.startsWith('@')) {
                const scopeSlash = nameWithNamespace.indexOf('/');
                if (scopeSlash > 0) {
                    namespace = nameWithNamespace.substring(0, scopeSlash);
                    name = nameWithNamespace.substring(scopeSlash + 1);
                } else {
                    name = nameWithNamespace;
                }
            } else if (nameWithNamespace.includes('/')) {
                // Handle other namespaced packages (e.g., Maven groupId/artifactId)
                const parts = nameWithNamespace.split('/');
                if (parts.length >= 2) {
                    namespace = parts.slice(0, -1).join('/');
                    name = parts[parts.length - 1];
                }
            } else {
                name = nameWithNamespace;
            }
            
            return { type, namespace, name, version };
        } catch (error) {
            console.warn(`⚠️ DepConfuse: Failed to parse PURL: ${purl}`, error);
            return null;
        }
    }

    /**
     * Get registry name for a PURL type
     * @param {string} purlType - PURL type (e.g., "npm", "pypi")
     * @returns {string|null} - Registry name or null
     */
    getRegistryForType(purlType) {
        if (!purlType) return null;
        return this.packageTypeToRegistry[purlType.toLowerCase()] || null;
    }

    /**
     * Sanitize namespace (remove @ prefix and URL encoding)
     * @param {string} namespace - Namespace to sanitize
     * @returns {string} - Sanitized namespace
     */
    sanitizeNamespace(namespace) {
        if (!namespace) return namespace;
        let clean = namespace.replace(/@/g, '');
        clean = clean.replace(/%40/g, '');
        return clean;
    }

    /**
     * Build namespace check URL
     * @param {string} registry - Registry name
     * @param {string} namespace - Namespace to check
     * @returns {string} - API URL
     */
    buildNamespaceUrl(registry, namespace) {
        return `${this.baseUrl}/registries/${registry}/namespaces/${encodeURIComponent(namespace)}`;
    }

    /**
     * Build package check URL
     * @param {string} registry - Registry name
     * @param {string} namespace - Package namespace (optional)
     * @param {string} packageName - Package name
     * @returns {string} - API URL
     */
    buildPackageUrl(registry, namespace, packageName) {
        if (namespace && packageName) {
            // Handle npm scoped packages differently
            if (registry === 'npmjs.org') {
                return `${this.baseUrl}/registries/${registry}/packages/${encodeURIComponent(namespace)}/${encodeURIComponent(packageName)}`;
            }
            // For other registries, use colon separator
            return `${this.baseUrl}/registries/${registry}/packages/${encodeURIComponent(namespace)}:${encodeURIComponent(packageName)}`;
        }
        return `${this.baseUrl}/registries/${registry}/packages/${encodeURIComponent(packageName)}`;
    }

    /**
     * Check if a namespace exists in a registry
     * @param {string} registry - Registry name
     * @param {string} namespace - Namespace to check
     * @returns {Promise<{exists: boolean, packagesCount: number, error: string|null}>}
     */
    async checkNamespaceExists(registry, namespace) {
        const cleanNamespace = this.sanitizeNamespace(namespace);
        const cacheKey = `ns:${registry}:${cleanNamespace}`;
        
        // Check cache
        const cached = this.namespaceCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.result;
        }
        
        const url = this.buildNamespaceUrl(registry, cleanNamespace);
        
        console.log(`🔍 DepConfuse: Checking namespace existence: ${cleanNamespace} in ${registry}`);
        if (typeof debugLogUrl === 'function') {
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Checking if namespace "${cleanNamespace}" exists in ${registry} for dependency confusion detection`);
        }
        
        try {
            const response = await this.fetchWithTimeout(url);
            
            if (response.status === 404) {
                const result = { exists: false, packagesCount: 0, error: null };
                this.namespaceCache.set(cacheKey, { result, timestamp: Date.now() });
                console.log(`   ❌ Namespace "${cleanNamespace}" NOT FOUND in ${registry}`);
                return result;
            }
            
            if (!response.ok) {
                const result = { exists: false, packagesCount: 0, error: `HTTP ${response.status}` };
                console.log(`   ⚠️ Unexpected status ${response.status} for namespace check`);
                return result;
            }
            
            const data = await response.json();
            const result = {
                exists: data.packages_count > 0,
                packagesCount: data.packages_count || 0,
                error: null
            };
            
            this.namespaceCache.set(cacheKey, { result, timestamp: Date.now() });
            console.log(`   ✅ Namespace "${cleanNamespace}" exists with ${result.packagesCount} packages`);
            return result;
            
        } catch (error) {
            console.warn(`⚠️ DepConfuse: Error checking namespace ${cleanNamespace}:`, error.message);
            return { exists: false, packagesCount: 0, error: error.message };
        }
    }

    /**
     * Check if a package exists in a registry
     * @param {string} registry - Registry name
     * @param {string} namespace - Package namespace (optional)
     * @param {string} packageName - Package name
     * @returns {Promise<{exists: boolean, error: string|null}>}
     */
    async checkPackageExists(registry, namespace, packageName) {
        const cacheKey = `pkg:${registry}:${namespace || ''}:${packageName}`;
        
        // Check cache
        const cached = this.packageCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.result;
        }
        
        const url = this.buildPackageUrl(registry, namespace, packageName);
        
        console.log(`🔍 DepConfuse: Checking package existence: ${namespace ? namespace + '/' : ''}${packageName} in ${registry}`);
        if (typeof debugLogUrl === 'function') {
            debugLogUrl(`🌐 [DEBUG] Fetching URL: ${url}`);
            debugLogUrl(`   Reason: Checking if package "${packageName}" exists in ${registry} for dependency confusion detection`);
        }
        
        try {
            for (let attempt = 0; attempt < this.maxRetries; attempt++) {
                const response = await this.fetchWithTimeout(url);
                
                // Retry on server errors
                if (response.status >= 500 && response.status < 600) {
                    console.log(`   ⚠️ Server error (attempt ${attempt + 1}/${this.maxRetries}), retrying...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    continue;
                }
                
                if (response.status === 404) {
                    const result = { exists: false, error: null };
                    this.packageCache.set(cacheKey, { result, timestamp: Date.now() });
                    console.log(`   ❌ Package "${packageName}" NOT FOUND in ${registry}`);
                    return result;
                }
                
                if (response.ok) {
                    const result = { exists: true, error: null };
                    this.packageCache.set(cacheKey, { result, timestamp: Date.now() });
                    console.log(`   ✅ Package "${packageName}" exists in ${registry}`);
                    return result;
                }
                
                // Unexpected status
                console.log(`   ⚠️ Unexpected status ${response.status} for package check`);
                return { exists: false, error: `HTTP ${response.status}` };
            }
            
            return { exists: false, error: 'Max retries exceeded' };
            
        } catch (error) {
            console.warn(`⚠️ DepConfuse: Error checking package ${packageName}:`, error.message);
            return { exists: false, error: error.message };
        }
    }

    /**
     * Main entry point: Check a package for dependency confusion vulnerability
     * @param {string} purl - Package URL string
     * @returns {Promise<Object>} - Vulnerability result
     */
    async checkPackageForConfusion(purl) {
        const result = {
            vulnerable: false,
            type: null, // 'namespace_not_found' or 'package_not_found'
            purl: purl,
            namespace: null,
            packageName: null,
            registry: null,
            evidenceUrl: null,
            message: null
        };
        
        // Parse PURL
        const parsed = this.parsePurl(purl);
        if (!parsed) {
            result.message = 'Invalid PURL format';
            return result;
        }
        
        // Get registry for this package type
        const registry = this.getRegistryForType(parsed.type);
        if (!registry) {
            result.message = `Unsupported package type: ${parsed.type}`;
            return result;
        }
        
        result.namespace = parsed.namespace;
        result.packageName = parsed.name;
        result.registry = registry;
        
        // If package has a namespace, check namespace first (more important)
        if (parsed.namespace) {
            const nsCheck = await this.checkNamespaceExists(registry, parsed.namespace);
            
            if (nsCheck.error) {
                result.message = `Error checking namespace: ${nsCheck.error}`;
                return result;
            }
            
            if (!nsCheck.exists) {
                result.vulnerable = true;
                result.type = 'namespace_not_found';
                result.evidenceUrl = this.buildNamespaceUrl(registry, this.sanitizeNamespace(parsed.namespace));
                result.message = `Namespace "${parsed.namespace}" not found in ${registry}. HIGH-CONFIDENCE dependency confusion risk.`;
                return result;
            }
        }
        
        // Check if package exists
        const pkgCheck = await this.checkPackageExists(registry, parsed.namespace, parsed.name);
        
        if (pkgCheck.error) {
            result.message = `Error checking package: ${pkgCheck.error}`;
            return result;
        }
        
        if (!pkgCheck.exists) {
            result.vulnerable = true;
            result.type = 'package_not_found';
            result.evidenceUrl = this.buildPackageUrl(registry, parsed.namespace, parsed.name);
            result.message = `Package "${parsed.name}" not found in ${registry}. Potential dependency confusion risk.`;
            return result;
        }
        
        result.message = 'Package exists in public registry';
        return result;
    }

    /**
     * Batch check multiple packages for dependency confusion
     * @param {Array<string>} purls - Array of PURL strings
     * @param {Function} onProgress - Progress callback (index, total, result)
     * @returns {Promise<Array<Object>>} - Array of vulnerability results
     */
    async checkPackagesForConfusion(purls, onProgress = null) {
        const results = [];
        
        for (let i = 0; i < purls.length; i++) {
            const purl = purls[i];
            const result = await this.checkPackageForConfusion(purl);
            results.push(result);
            
            if (onProgress) {
                onProgress(i + 1, purls.length, result);
            }
            
            // Small delay to avoid rate limiting
            if (i < purls.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    }

    /**
     * Check a dependency object for confusion (convenience method)
     * @param {Object} dep - Dependency object with purl or name/ecosystem
     * @returns {Promise<Object>} - Vulnerability result
     */
    async checkDependencyForConfusion(dep) {
        // Try to get PURL from dependency
        let purl = null;
        
        if (dep.purl) {
            purl = dep.purl;
        } else if (dep.externalRefs) {
            const purlRef = dep.externalRefs.find(ref => ref.referenceType === 'purl');
            if (purlRef) {
                purl = purlRef.referenceLocator;
            }
        }
        
        // If no PURL, try to construct one from name and ecosystem
        if (!purl && dep.name && dep.category?.ecosystem) {
            const ecosystem = dep.category.ecosystem.toLowerCase();
            const purlType = this.ecosystemToPurlType(ecosystem);
            if (purlType) {
                const version = dep.version || dep.displayVersion || 'unknown';
                purl = `pkg:${purlType}/${encodeURIComponent(dep.name)}@${version}`;
            }
        }
        
        if (!purl) {
            return {
                vulnerable: false,
                type: null,
                message: 'Could not determine package PURL'
            };
        }
        
        return this.checkPackageForConfusion(purl);
    }

    /**
     * Convert ecosystem name to PURL type
     * @param {string} ecosystem - Ecosystem name
     * @returns {string|null} - PURL type
     */
    ecosystemToPurlType(ecosystem) {
        const mapping = {
            'npm': 'npm',
            'pypi': 'pypi',
            'maven': 'maven',
            'nuget': 'nuget',
            'cargo': 'cargo',
            'rubygems': 'gem',
            'gem': 'gem',
            'go': 'golang',
            'golang': 'golang',
            'composer': 'composer',
            'packagist': 'composer',
            'docker': 'docker',
            'cocoapods': 'cocoapods',
            'hex': 'hex',
            'pub': 'pub',
            'conda': 'conda',
            'github actions': 'githubactions'
        };
        
        return mapping[ecosystem.toLowerCase()] || null;
    }

    /**
     * Get all supported registries
     * @returns {Object} - Registry mappings
     */
    getSupportedRegistries() {
        return { ...this.packageTypeToRegistry };
    }

    /**
     * Clear caches
     */
    clearCache() {
        this.namespaceCache.clear();
        this.packageCache.clear();
        console.log('🗑️ DepConfuse: Cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache stats
     */
    getCacheStats() {
        return {
            namespaceEntries: this.namespaceCache.size,
            packageEntries: this.packageCache.size
        };
    }
}

// Export for use in other modules
window.DepConfuseService = DepConfuseService;

// Create global instance
window.depConfuseService = new DepConfuseService();

console.log('🔒 DepConfuse Service loaded - Dependency confusion detection with 38 registry support');

