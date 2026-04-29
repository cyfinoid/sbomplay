/**
 * EOX Service - End-of-Life/End-of-Support Detection
 * 
 * Fetches EOL/EOS data from endoflife.date API and caches results in IndexedDB.
 * Distinguishes between:
 * - Stale: Old package with no updates, but not officially EOL
 * - EOL (End-of-Life): No longer receiving any updates
 * - EOS (End-of-Support): No longer receiving security updates
 * 
 * Data Sources:
 * - Primary: endoflife.date API (https://endoflife.date/docs/api)
 * - Future: OpenEOX standard (https://openeox.org/)
 */
class EOXService {
    constructor() {
        this.baseUrl = 'https://endoflife.date/api';
        this.cache = new Map(); // In-memory cache
        this.cacheExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days cache
        this.requestTimeout = 10000; // 10 seconds timeout
        
        // Product list cache
        this.productList = null;
        this.productListFetchedAt = null;
        
        // Mapping from ecosystem/package names to endoflife.date product identifiers.
        // Each entry is { product, ecosystems } where ecosystems is an array of allowed
        // ecosystem names (matched case-insensitively against SBOM ecosystem labels emitted
        // by sbom-processor.js: 'npm', 'PyPI', 'Maven', 'NuGet', 'Cargo', 'Composer', 'Go',
        // 'GitHub Actions', 'Docker', 'Helm', 'Terraform'). The sentinel '*' means "no
        // ecosystem / SBOM-level / unspecified" -- used for runtimes, OSes, servers, etc.
        // that are NOT distributed as a package in any of the above ecosystems.
        //
        // Rule of thumb:
        //   - Runtimes/OSes/servers/databases/CLIs/build tools => ['*'] only.
        //     They must NEVER match a code-package ecosystem, otherwise scoped npm/PyPI
        //     packages whose name happens to collide (e.g. @tailwindcss/node, @types/node)
        //     get falsely flagged with the runtime's EOL.
        //   - Frameworks distributed as packages => the ecosystem(s) where they actually
        //     ship (e.g. react -> ['npm'], django -> ['PyPI'], log4j -> ['Maven']).
        this.productMappings = {
            // Programming Languages/Runtimes (SBOM-level only)
            'python': { product: 'python', ecosystems: ['*'] },
            'nodejs': { product: 'nodejs', ecosystems: ['*'] },
            'ruby': { product: 'ruby', ecosystems: ['*'] },
            'php': { product: 'php', ecosystems: ['*'] },
            'go': { product: 'go', ecosystems: ['*'] },
            'golang': { product: 'go', ecosystems: ['*'] },
            'java': { product: 'java', ecosystems: ['*'] },
            'openjdk': { product: 'openjdk', ecosystems: ['*'] },
            'dotnet': { product: 'dotnet', ecosystems: ['*'] },
            '.net': { product: 'dotnet', ecosystems: ['*'] },
            'rust': { product: 'rust', ecosystems: ['*'] },
            'perl': { product: 'perl', ecosystems: ['*'] },
            'elixir': { product: 'elixir', ecosystems: ['*'] },
            'erlang': { product: 'erlang', ecosystems: ['*'] },
            
            // Frameworks (allowed in the ecosystem they ship in)
            'django': { product: 'django', ecosystems: ['PyPI'] },
            'rails': { product: 'rails', ecosystems: ['*'] }, // RubyGems not in parser's ecosystem set
            'ruby-on-rails': { product: 'rails', ecosystems: ['*'] },
            'laravel': { product: 'laravel', ecosystems: ['Composer'] },
            'symfony': { product: 'symfony', ecosystems: ['Composer'] },
            'spring-boot': { product: 'spring-boot', ecosystems: ['Maven'] },
            'spring-framework': { product: 'spring-framework', ecosystems: ['Maven'] },
            'spring': { product: 'spring-framework', ecosystems: ['Maven'] },
            'angular': { product: 'angular', ecosystems: ['npm'] },
            'angularjs': { product: 'angularjs', ecosystems: ['npm'] },
            'react': { product: 'react', ecosystems: ['npm'] },
            'vue': { product: 'vue', ecosystems: ['npm'] },
            'vuejs': { product: 'vue', ecosystems: ['npm'] },
            'nuxt': { product: 'nuxt', ecosystems: ['npm'] },
            'nextjs': { product: 'nextjs', ecosystems: ['npm'] },
            'next': { product: 'nextjs', ecosystems: ['npm'] },
            'express': { product: 'express', ecosystems: ['npm'] },
            'fastapi': { product: 'fastapi', ecosystems: ['PyPI'] },
            'flask': { product: 'flask', ecosystems: ['PyPI'] },
            'jquery': { product: 'jquery', ecosystems: ['npm'] },
            'bootstrap': { product: 'bootstrap', ecosystems: ['npm'] },
            
            // Databases (SBOM-level only)
            'mysql': { product: 'mysql', ecosystems: ['*'] },
            'postgresql': { product: 'postgresql', ecosystems: ['*'] },
            'postgres': { product: 'postgresql', ecosystems: ['*'] },
            'mongodb': { product: 'mongodb', ecosystems: ['*'] },
            'redis': { product: 'redis', ecosystems: ['*'] },
            'elasticsearch': { product: 'elasticsearch', ecosystems: ['*'] },
            'mariadb': { product: 'mariadb', ecosystems: ['*'] },
            'sqlite': { product: 'sqlite', ecosystems: ['*'] },
            'oracle-database': { product: 'oracle-database', ecosystems: ['*'] },
            'mssqlserver': { product: 'mssqlserver', ecosystems: ['*'] },
            'sql-server': { product: 'mssqlserver', ecosystems: ['*'] },
            
            // Web Servers/Proxies (SBOM-level only)
            'nginx': { product: 'nginx', ecosystems: ['*'] },
            'apache': { product: 'apache', ecosystems: ['*'] },
            'apache-http-server': { product: 'apache', ecosystems: ['*'] },
            'tomcat': { product: 'tomcat', ecosystems: ['*'] },
            'apache-tomcat': { product: 'tomcat', ecosystems: ['*'] },
            'haproxy': { product: 'haproxy', ecosystems: ['*'] },
            
            // Container/Cloud (SBOM-level only)
            'kubernetes': { product: 'kubernetes', ecosystems: ['*'] },
            'docker-engine': { product: 'docker-engine', ecosystems: ['*'] },
            'terraform': { product: 'terraform', ecosystems: ['*'] },
            'ansible': { product: 'ansible', ecosystems: ['*'] },
            'helm': { product: 'helm', ecosystems: ['*'] },
            
            // Operating Systems (SBOM-level only)
            'ubuntu': { product: 'ubuntu', ecosystems: ['*'] },
            'debian': { product: 'debian', ecosystems: ['*'] },
            'centos': { product: 'centos', ecosystems: ['*'] },
            'rhel': { product: 'rhel', ecosystems: ['*'] },
            'red-hat-enterprise-linux': { product: 'rhel', ecosystems: ['*'] },
            'alpine': { product: 'alpine', ecosystems: ['*'] },
            'amazon-linux': { product: 'amazon-linux', ecosystems: ['*'] },
            'windows-server': { product: 'windows-server', ecosystems: ['*'] },
            
            // Package Managers/Build Tools (the CLIs themselves; SBOM-level only)
            'npm': { product: 'npm', ecosystems: ['*'] },
            'yarn': { product: 'yarn', ecosystems: ['*'] },
            'pip': { product: 'pip', ecosystems: ['*'] },
            'composer': { product: 'composer', ecosystems: ['*'] },
            'gradle': { product: 'gradle', ecosystems: ['*'] },
            'maven': { product: 'maven', ecosystems: ['*'] },
            
            // Other Common (SBOM-level only)
            'openssl': { product: 'openssl', ecosystems: ['*'] },
            'openssh': { product: 'openssh', ecosystems: ['*'] },
            'git': { product: 'git', ecosystems: ['*'] },
            'linux': { product: 'linux', ecosystems: ['*'] },
            'linux-kernel': { product: 'linux', ecosystems: ['*'] },
            'log4j': { product: 'log4j', ecosystems: ['Maven'] }
        };
        
        // Reverse mapping: endoflife.date product -> common package names
        this.reverseProductMappings = this.buildReverseMappings();
    }
    
    /**
     * Build reverse mappings from product identifiers to package names
     */
    buildReverseMappings() {
        const reverse = {};
        for (const [packageName, mapping] of Object.entries(this.productMappings)) {
            const product = mapping && typeof mapping === 'object' ? mapping.product : mapping;
            if (!product) continue;
            if (!reverse[product]) {
                reverse[product] = [];
            }
            reverse[product].push(packageName);
        }
        return reverse;
    }
    
    /**
     * Get all available products from endoflife.date
     * @returns {Promise<Array<string>>} List of product identifiers
     */
    async getAllProducts() {
        // Check if we have a recent product list cached
        if (this.productList && this.productListFetchedAt && 
            (Date.now() - this.productListFetchedAt) < this.cacheExpiry) {
            return this.productList;
        }
        
        // Check IndexedDB cache
        if (window.cacheManager) {
            try {
                const cached = await window.cacheManager.getEOXProductList();
                if (cached && cached.fetchedAt && 
                    (Date.now() - cached.fetchedAt) < this.cacheExpiry) {
                    this.productList = cached.products;
                    this.productListFetchedAt = cached.fetchedAt;
                    return this.productList;
                }
            } catch (e) {
                console.debug('EOX product list cache miss:', e);
            }
        }
        
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/all.json`);
            if (!response.ok) {
                throw new Error(`Failed to fetch product list: ${response.status}`);
            }
            
            const products = await response.json();
            this.productList = products;
            this.productListFetchedAt = Date.now();
            
            // Save to IndexedDB
            if (window.cacheManager) {
                try {
                    await window.cacheManager.saveEOXProductList({
                        products: products,
                        fetchedAt: Date.now()
                    });
                } catch (e) {
                    console.debug('Failed to cache EOX product list:', e);
                }
            }
            
            console.log(`📦 EOX: Loaded ${products.length} products from endoflife.date`);
            return products;
        } catch (error) {
            console.warn('⚠️ EOX: Failed to fetch product list:', error);
            return [];
        }
    }
    
    /**
     * Get EOL/EOS data for a specific product
     * @param {string} product - Product identifier (e.g., 'python', 'nodejs')
     * @returns {Promise<Object|null>} Product lifecycle data or null
     */
    async getProductEOX(product) {
        if (!product) return null;
        
        const normalizedProduct = product.toLowerCase().trim();
        const cacheKey = `eox:${normalizedProduct}`;
        
        // Check in-memory cache
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.fetchedAt) < this.cacheExpiry) {
            return cached.data;
        }
        
        // Check IndexedDB cache
        if (window.cacheManager) {
            try {
                const cachedData = await window.cacheManager.getEOXProduct(normalizedProduct);
                if (cachedData && cachedData.fetchedAt && 
                    (Date.now() - cachedData.fetchedAt) < this.cacheExpiry) {
                    this.cache.set(cacheKey, cachedData);
                    return cachedData.data;
                }
            } catch (e) {
                console.debug(`EOX cache miss for ${normalizedProduct}:`, e);
            }
        }
        
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/${encodeURIComponent(normalizedProduct)}.json`);
            if (!response.ok) {
                if (response.status === 404) {
                    // Product not found - cache the negative result
                    const negativeResult = { data: null, fetchedAt: Date.now(), notFound: true };
                    this.cache.set(cacheKey, negativeResult);
                    return null;
                }
                throw new Error(`Failed to fetch EOX data: ${response.status}`);
            }
            
            const data = await response.json();
            const result = { data: data, fetchedAt: Date.now() };
            
            // Cache in memory
            this.cache.set(cacheKey, result);
            
            // Cache in IndexedDB
            if (window.cacheManager) {
                try {
                    await window.cacheManager.saveEOXProduct(normalizedProduct, result);
                } catch (e) {
                    console.debug(`Failed to cache EOX data for ${normalizedProduct}:`, e);
                }
            }
            
            return data;
        } catch (error) {
            console.warn(`⚠️ EOX: Failed to fetch data for ${normalizedProduct}:`, error);
            return null;
        }
    }
    
    /**
     * Check EOX status for a package
     * @param {string} packageName - Package name
     * @param {string} version - Package version
     * @param {string} ecosystem - Package ecosystem (npm, pypi, etc.)
     * @returns {Promise<Object>} EOX status
     */
    async checkEOX(packageName, version, ecosystem) {
        const result = {
            isEOL: false,
            isEOS: false,
            eolDate: null,
            eosDate: null,
            latestVersion: null,
            successor: null,
            support: null,
            lts: false,
            checkedAt: Date.now(),
            source: 'endoflife.date',
            productMatched: null,
            // Stamped onto every status so older cached/persisted results from previous
            // matcher logic (which had false positives like @tailwindcss/node -> Node.js)
            // can be detected and invalidated on load. Bump when the matcher changes
            // in a way that may have produced different (potentially wrong) results.
            logicVersion: EOXService.LOGIC_VERSION
        };
        
        if (!packageName) return result;
        
        // Try to find a matching product
        const product = this.findProduct(packageName, ecosystem);
        if (!product) {
            return result;
        }
        
        result.productMatched = product;
        
        // Get product EOX data
        const eoxData = await this.getProductEOX(product);
        if (!eoxData || !Array.isArray(eoxData)) {
            return result;
        }
        
        // Find the matching version cycle
        const versionCycle = this.findVersionCycle(eoxData, version);
        if (!versionCycle) {
            // Use the latest cycle for general product EOX info
            const latestCycle = eoxData[0];
            if (latestCycle) {
                result.latestVersion = latestCycle.latest || latestCycle.cycle;
            }
            return result;
        }
        
        // Parse EOX dates and status
        const now = new Date();
        
        // EOL (End of Life) - no more updates of any kind
        if (versionCycle.eol !== undefined) {
            if (versionCycle.eol === true) {
                result.isEOL = true;
            } else if (versionCycle.eol === false) {
                result.isEOL = false;
            } else if (typeof versionCycle.eol === 'string') {
                const eolDate = new Date(versionCycle.eol);
                result.eolDate = versionCycle.eol;
                result.isEOL = eolDate <= now;
            }
        }
        
        // EOS (End of Support) - no more security updates
        // endoflife.date uses 'support' for active support and 'eol' for security support end
        if (versionCycle.support !== undefined) {
            if (versionCycle.support === true) {
                result.isEOS = false;
            } else if (versionCycle.support === false) {
                result.isEOS = true;
            } else if (typeof versionCycle.support === 'string') {
                const eosDate = new Date(versionCycle.support);
                result.eosDate = versionCycle.support;
                result.isEOS = eosDate <= now;
            }
        }
        
        // Additional metadata
        result.latestVersion = versionCycle.latest || null;
        result.lts = versionCycle.lts === true;
        result.support = versionCycle.support;
        
        // Check for successor/replacement
        if (versionCycle.link) {
            result.successor = versionCycle.link;
        }
        
        return result;
    }
    
    /**
     * Find the matching product identifier for a package.
     * Mappings are gated by ecosystem -- a runtime mapping (e.g. 'nodejs') will not
     * match an npm/PyPI/etc. package, even if the package's name happens to collide
     * (e.g. @tailwindcss/node, @types/node would otherwise be misflagged as Node.js).
     * @param {string} packageName - Package name
     * @param {string} ecosystem - Package ecosystem (e.g. 'npm', 'PyPI', 'Maven')
     * @returns {string|null} Product identifier or null
     */
    findProduct(packageName, ecosystem) {
        if (!packageName) return null;
        
        const normalizedName = packageName.toLowerCase().trim();
        const normalizedEcosystem = ecosystem ? ecosystem.toLowerCase().trim() : '';
        const isNpmScoped = normalizedName.startsWith('@') && normalizedName.includes('/');
        
        // Build candidate name list. For npm scoped packages (@scope/name) the full
        // identifier is the package name; never strip the scope, otherwise
        // @tailwindcss/node collapses to 'node' and falsely matches the Node.js runtime.
        const candidates = [
            normalizedName,
            normalizedName.replace(/-/g, ''),
            normalizedName.replace(/_/g, '-'),
            normalizedName.replace(/\./g, '-'),
        ];
        if (normalizedEcosystem) {
            candidates.push(`${normalizedEcosystem}-${normalizedName}`);
        }
        // Only fall back to the post-slash segment for non-npm purl-shaped names like
        // 'golang.org/x/crypto'. Skip entirely for npm scoped packages.
        if (!isNpmScoped && normalizedName.includes('/')) {
            const tail = normalizedName.split('/').pop();
            if (tail) candidates.push(tail);
        }
        
        const seen = new Set();
        for (const candidate of candidates) {
            if (!candidate || seen.has(candidate)) continue;
            seen.add(candidate);
            const mapping = this.productMappings[candidate];
            if (!mapping) continue;
            if (!this.isMappingAllowed(mapping, normalizedEcosystem)) continue;
            return mapping.product;
        }
        
        return null;
    }
    
    /**
     * Check whether a product mapping is allowed for a given ecosystem.
     * The sentinel '*' means the mapping only applies to SBOM-level / unspecified
     * ecosystem entries (i.e. NOT a code package in npm/PyPI/etc.).
     * @param {Object} mapping - { product, ecosystems } entry from productMappings
     * @param {string} normalizedEcosystem - Lowercased ecosystem string (may be '')
     * @returns {boolean}
     */
    isMappingAllowed(mapping, normalizedEcosystem) {
        if (!mapping || !mapping.ecosystems) return false;
        const allowed = mapping.ecosystems.map(e => String(e).toLowerCase());
        if (!normalizedEcosystem) {
            // SBOM-level entry with no ecosystem; '*' permits this.
            return allowed.includes('*');
        }
        return allowed.includes(normalizedEcosystem);
    }
    
    /**
     * Find the version cycle that matches the given version
     *
     * Handles two distinct cases:
     *   1. Pinned version (e.g. "7.0.10", "v1.2.3"): match the cycle that
     *      contains it (here: cycle "7.0").
     *   2. Version RANGE (e.g. "7.0,< 8.0", "^7.0", ">=7.0 <8.0", "*"): find
     *      every cycle that satisfies the range and return the LATEST
     *      (highest) one. This avoids false-positive EOL flags when a range
     *      like composer's `^7.0` (serialised as `7.0,< 8.0`) covers cycles
     *      that include both EOL minors (7.0, 7.1, 7.2, 7.3) and a still-
     *      supported one (e.g. 7.4 LTS) — the user could be on the supported
     *      version, so we cannot definitively call the dependency EOL.
     *
     * @param {Array} cycles - Array of version cycles from endoflife.date
     * @param {string} version - Version (pinned or range) to match
     * @returns {Object|null} Matching cycle or null
     */
    findVersionCycle(cycles, version) {
        if (!cycles || !Array.isArray(cycles) || !version) return null;

        // Range handling first — pinned-version logic below assumes a single
        // concrete version and would otherwise lock onto the lower bound.
        if (this.isVersionRange(version)) {
            return this.findLatestCycleInRange(cycles, version);
        }

        // Normalize version
        const normalizedVersion = version.replace(/^v/, '').trim();
        
        // Try exact match first
        for (const cycle of cycles) {
            if (cycle.cycle === normalizedVersion || cycle.cycle === version) {
                return cycle;
            }
        }
        
        // Try major.minor match
        const versionParts = normalizedVersion.split('.');
        if (versionParts.length >= 2) {
            const majorMinor = `${versionParts[0]}.${versionParts[1]}`;
            for (const cycle of cycles) {
                if (cycle.cycle === majorMinor) {
                    return cycle;
                }
            }
        }
        
        // Try major version match
        if (versionParts.length >= 1) {
            const major = versionParts[0];
            for (const cycle of cycles) {
                if (cycle.cycle === major || cycle.cycle === `${major}.x` || cycle.cycle === `${major}.0`) {
                    return cycle;
                }
            }
        }
        
        // Try to find a cycle where our version falls within the range
        for (const cycle of cycles) {
            if (this.versionInCycle(normalizedVersion, cycle)) {
                return cycle;
            }
        }
        
        return null;
    }
    
    /**
     * Check if a version falls within a cycle's range
     * @param {string} version - Version to check
     * @param {Object} cycle - Version cycle
     * @returns {boolean}
     */
    versionInCycle(version, cycle) {
        if (!cycle.cycle || !version) return false;
        
        const cycleParts = String(cycle.cycle).split('.');
        const versionParts = version.split('.');
        
        // Check if version starts with cycle prefix
        for (let i = 0; i < cycleParts.length && i < versionParts.length; i++) {
            if (cycleParts[i] !== versionParts[i] && cycleParts[i] !== 'x') {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Detect whether a version string represents a range rather than a pinned
     * version. Recognises composer/maven/npm range syntaxes such as
     *   "7.0,< 8.0", ">=7.0 <8.0", "^7.0", "~7.0", "7.*", "*", "7 || 8"
     *
     * Pre-release / build metadata in pinned versions (e.g. "1.2.3-rc.1",
     * "1.2.3+build.5") is intentionally NOT treated as a range.
     *
     * @param {string} version
     * @returns {boolean}
     */
    isVersionRange(version) {
        if (!version || typeof version !== 'string') return false;
        const trimmed = version.trim();
        if (!trimmed) return false;

        // Wildcards
        if (trimmed === '*' || trimmed === 'x' || trimmed === 'X') return true;
        if (/[*xX]/.test(trimmed) && /\.[*xX]/.test(trimmed)) return true; // 7.*  /  7.x
        // Range operators / separators
        if (/[<>=^~]/.test(trimmed)) return true;
        if (/\|\|/.test(trimmed)) return true;
        // Comma-separated bounds (composer/maven SBOM serialisation)
        if (trimmed.includes(',')) return true;
        // Whitespace-separated multi-clause range (e.g. ">=7.0 <8.0")
        if (/\s/.test(trimmed) && /[<>=]/.test(trimmed)) return true;
        return false;
    }

    /**
     * Parse a version range into structured lower/upper bounds.
     *
     * Supported syntaxes (the union of what we have observed in real SBOMs):
     *   - Comma bounds:        "7.0,< 8.0", ">=1.0.108, <2.0.0"
     *   - Whitespace bounds:   ">=7.0 <8.0"
     *   - Caret:               "^7.0"   → [7.0, 8.0)
     *   - Tilde:               "~7.0"   → [7.0, 7.1)   (composer/npm "~"-style)
     *                          "~7"     → [7, 8)
     *   - Single comparator:   ">=7.0", "<8.0", ">7.0", "<=7.4", "=7.0"
     *   - Wildcard:            "*", "x", "7.*", "7.x"
     *
     * @param {string} version
     * @returns {{lower: string|null, upper: string|null,
     *            lowerInclusive: boolean, upperInclusive: boolean}|null}
     */
    parseVersionRange(version) {
        if (!version || typeof version !== 'string') return null;
        const raw = version.trim();
        if (!raw) return null;

        // Pure wildcard — match every cycle
        if (raw === '*' || raw === 'x' || raw === 'X') {
            return { lower: null, upper: null, lowerInclusive: true, upperInclusive: false };
        }

        // OR-ranges ("^6 || ^7"): take the union, which for our purposes is
        // the lowest lower-bound and the highest upper-bound across clauses.
        if (raw.includes('||')) {
            const clauses = raw.split('||').map(c => c.trim()).filter(Boolean);
            let lower = null, upper = null;
            let lowerInclusive = true, upperInclusive = false;
            let upperSet = false; // distinguishes "not yet seeded" from "unbounded"
            for (const clause of clauses) {
                const part = this.parseVersionRange(clause);
                if (!part) continue;
                if (part.lower !== null && (lower === null || this.compareVersionStrings(part.lower, lower) < 0)) {
                    lower = part.lower;
                    lowerInclusive = part.lowerInclusive;
                }
                if (!upperSet) {
                    upper = part.upper;
                    upperInclusive = part.upperInclusive;
                    upperSet = true;
                } else if (part.upper === null) {
                    upper = null; // any clause being unbounded above wins
                    upperInclusive = false;
                } else if (upper !== null && this.compareVersionStrings(part.upper, upper) > 0) {
                    upper = part.upper;
                    upperInclusive = part.upperInclusive;
                }
            }
            return { lower, upper, lowerInclusive, upperInclusive };
        }

        // Caret: "^7.0" → [7.0, 8.0). For 0.x.y it pins the minor (npm semver
        // semantics), but for our cycle granularity (major or major.minor)
        // pinning to next-major is good enough and never under-matches.
        if (raw.startsWith('^')) {
            const ver = raw.slice(1).trim();
            const major = parseInt(ver.split('.')[0], 10);
            if (!Number.isFinite(major)) return null;
            return {
                lower: ver,
                upper: `${major + 1}.0.0`,
                lowerInclusive: true,
                upperInclusive: false
            };
        }

        // Tilde: "~7.0" → [7.0, 7.1).  "~7" → [7, 8).
        if (raw.startsWith('~')) {
            const ver = raw.slice(1).trim();
            const parts = ver.split('.').map(p => parseInt(p, 10));
            if (!Number.isFinite(parts[0])) return null;
            let upper;
            if (parts.length >= 2 && Number.isFinite(parts[1])) {
                upper = `${parts[0]}.${parts[1] + 1}.0`;
            } else {
                upper = `${parts[0] + 1}.0.0`;
            }
            return { lower: ver, upper, lowerInclusive: true, upperInclusive: false };
        }

        // Wildcard with prefix: "7.*" / "7.x" / "7.0.*"
        const wildcardMatch = raw.match(/^(\d+(?:\.\d+)*)\.[*xX]$/);
        if (wildcardMatch) {
            const prefix = wildcardMatch[1];
            const partsArr = prefix.split('.').map(p => parseInt(p, 10));
            const last = partsArr[partsArr.length - 1];
            if (!Number.isFinite(last)) return null;
            const upperParts = [...partsArr];
            upperParts[upperParts.length - 1] = last + 1;
            return {
                lower: prefix,
                upper: upperParts.join('.'),
                lowerInclusive: true,
                upperInclusive: false
            };
        }

        // Multi-clause: split on comma OR whitespace between clauses.
        // We split on commas first, then split any non-operator-prefixed
        // remainder on whitespace so ">=7.0 <8.0" works the same as
        // ">=7.0,<8.0".
        const clauseTokens = raw
            .split(',')
            .flatMap(s => s.trim().split(/\s+(?=[<>=])/))
            .map(s => s.trim())
            .filter(Boolean);

        let lower = null, upper = null;
        let lowerInclusive = true, upperInclusive = false;

        for (const token of clauseTokens) {
            const m = token.match(/^(>=|<=|>|<|=|==)?\s*v?(\d+(?:\.\d+)*(?:[-+][a-zA-Z0-9.\-]+)?)/);
            if (!m) continue;
            const op = m[1] || '=';
            const ver = m[2];
            switch (op) {
                case '>=':
                    if (lower === null || this.compareVersionStrings(ver, lower) > 0) {
                        lower = ver; lowerInclusive = true;
                    }
                    break;
                case '>':
                    if (lower === null || this.compareVersionStrings(ver, lower) >= 0) {
                        lower = ver; lowerInclusive = false;
                    }
                    break;
                case '<=':
                    if (upper === null || this.compareVersionStrings(ver, upper) < 0) {
                        upper = ver; upperInclusive = true;
                    }
                    break;
                case '<':
                    if (upper === null || this.compareVersionStrings(ver, upper) <= 0) {
                        upper = ver; upperInclusive = false;
                    }
                    break;
                case '=':
                case '==':
                default:
                    // Bare version inside a multi-clause range (e.g. composer
                    // "7.0,< 8.0") means "≥ this version".
                    if (lower === null || this.compareVersionStrings(ver, lower) > 0) {
                        lower = ver; lowerInclusive = true;
                    }
                    break;
            }
        }

        if (lower === null && upper === null) return null;
        return { lower, upper, lowerInclusive, upperInclusive };
    }

    /**
     * Compare two version strings numerically segment-by-segment.
     * Pre-release / build metadata is stripped before comparison so cycle
     * labels like "7.0" and pinned versions like "7.0.0" sort consistently.
     *
     * @returns {number} negative if a<b, 0 if equal, positive if a>b
     */
    compareVersionStrings(a, b) {
        if (a == null && b == null) return 0;
        if (a == null) return -1;
        if (b == null) return 1;
        const norm = (v) => String(v).replace(/^v/, '').split(/[-+]/)[0].split('.');
        const aParts = norm(a);
        const bParts = norm(b);
        const len = Math.max(aParts.length, bParts.length);
        for (let i = 0; i < len; i++) {
            const aN = parseInt(aParts[i] || '0', 10);
            const bN = parseInt(bParts[i] || '0', 10);
            const aV = Number.isFinite(aN) ? aN : 0;
            const bV = Number.isFinite(bN) ? bN : 0;
            if (aV !== bV) return aV - bV;
        }
        return 0;
    }

    /**
     * Check whether an endoflife.date cycle satisfies the parsed range.
     * Cycle labels are typically major (e.g. "7") or major.minor ("7.4"); we
     * compare them against the parsed bounds using the same numeric segment
     * comparator.
     */
    cycleSatisfiesRange(cycle, range) {
        if (!cycle || !cycle.cycle || !range) return false;
        const cycleVer = String(cycle.cycle);

        if (range.lower != null) {
            const cmp = this.compareVersionStrings(cycleVer, range.lower);
            if (range.lowerInclusive ? cmp < 0 : cmp <= 0) return false;
        }
        if (range.upper != null) {
            const cmp = this.compareVersionStrings(cycleVer, range.upper);
            if (range.upperInclusive ? cmp > 0 : cmp >= 0) return false;
        }
        return true;
    }

    /**
     * Given a version range, return the LATEST endoflife.date cycle that
     * satisfies it. If none can be determined we fall back to whatever
     * pinned-version matching can find for the lower bound, so callers still
     * get *some* signal rather than silently dropping the dependency.
     *
     * @param {Array} cycles
     * @param {string} version - Range string
     * @returns {Object|null}
     */
    findLatestCycleInRange(cycles, version) {
        const range = this.parseVersionRange(version);
        if (!range) {
            // Couldn't parse — fall back to the lower bound as a best guess.
            const lowerCandidate = String(version).replace(/^[\^~>=<]+\s*/, '').split(/[,\s]/)[0];
            if (lowerCandidate && lowerCandidate !== version) {
                // Recurse with a likely-pinned candidate; isVersionRange()
                // returns false for plain "7.0" so we do not infinite-loop.
                return this.findVersionCycle(cycles, lowerCandidate);
            }
            return null;
        }

        const matching = cycles.filter(c => this.cycleSatisfiesRange(c, range));
        if (matching.length === 0) return null;

        // Pick the cycle with the highest version label.
        matching.sort((a, b) => this.compareVersionStrings(b.cycle, a.cycle));
        return matching[0];
    }
    
    /**
     * Batch check EOX status for multiple packages
     * @param {Array<{name: string, version: string, ecosystem: string}>} packages
     * @param {Function} onProgress - Progress callback (processed, total)
     * @returns {Promise<Map<string, Object>>} Map of package key to EOX status
     */
    async checkEOXBatch(packages, onProgress = null) {
        const results = new Map();
        const total = packages.length;
        let processed = 0;
        
        // Process in batches to avoid overwhelming the API
        const batchSize = 10;
        
        for (let i = 0; i < packages.length; i += batchSize) {
            const batch = packages.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (pkg) => {
                const key = `${pkg.ecosystem || 'unknown'}:${pkg.name}@${pkg.version}`;
                try {
                    const eoxStatus = await this.checkEOX(pkg.name, pkg.version, pkg.ecosystem);
                    results.set(key, eoxStatus);
                } catch (error) {
                    console.warn(`Failed to check EOX for ${key}:`, error);
                    results.set(key, {
                        isEOL: false,
                        isEOS: false,
                        error: error.message,
                        checkedAt: Date.now()
                    });
                }
                
                processed++;
                if (onProgress) {
                    onProgress(processed, total);
                }
            }));
            
            // Small delay between batches to be nice to the API
            if (i + batchSize < packages.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return results;
    }
    
    /**
     * Fetch with timeout
     */
    async fetchWithTimeout(url, options = {}) {
        const timeout = this.requestTimeout;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    
    /**
     * Add a custom product mapping
     * @param {string} packageName - Package name to map
     * @param {string} product - endoflife.date product identifier
     */
    addProductMapping(packageName, product) {
        this.productMappings[packageName.toLowerCase()] = product.toLowerCase();
        this.reverseProductMappings = this.buildReverseMappings();
    }
    
    /**
     * Get the severity level for an EOX status
     * @param {Object} eoxStatus - EOX status object
     * @returns {string} Severity: 'high', 'medium', 'low', or 'none'
     */
    getEOXSeverity(eoxStatus) {
        if (!eoxStatus) return 'none';
        
        if (eoxStatus.isEOL) {
            return 'high'; // End of Life is high severity
        }
        
        if (eoxStatus.isEOS) {
            return 'medium'; // End of Support (security) is medium severity
        }
        
        // Check if EOL/EOS is coming soon (within 6 months)
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
        
        if (eoxStatus.eolDate) {
            const eolDate = new Date(eoxStatus.eolDate);
            if (eolDate <= sixMonthsFromNow) {
                return 'low'; // EOL coming soon
            }
        }
        
        if (eoxStatus.eosDate) {
            const eosDate = new Date(eoxStatus.eosDate);
            if (eosDate <= sixMonthsFromNow) {
                return 'low'; // EOS coming soon
            }
        }
        
        return 'none';
    }
    
    /**
     * Format EOX status for display
     * @param {Object} eoxStatus - EOX status object
     * @returns {string} Human-readable status
     */
    formatEOXStatus(eoxStatus) {
        if (!eoxStatus) return 'Unknown';
        
        if (eoxStatus.isEOL) {
            return eoxStatus.eolDate 
                ? `End of Life (${eoxStatus.eolDate})`
                : 'End of Life';
        }
        
        if (eoxStatus.isEOS) {
            return eoxStatus.eosDate
                ? `End of Support (${eoxStatus.eosDate})`
                : 'End of Support';
        }
        
        if (eoxStatus.eolDate || eoxStatus.eosDate) {
            const dates = [];
            if (eoxStatus.eosDate) dates.push(`EOS: ${eoxStatus.eosDate}`);
            if (eoxStatus.eolDate) dates.push(`EOL: ${eoxStatus.eolDate}`);
            return `Active (${dates.join(', ')})`;
        }
        
        return 'Active';
    }
}

// Version of the EOX matching/checking logic. Bump when productMappings or matching
// rules change in a way that may have produced different (potentially wrong) results
// in earlier runs. Persisted analyses stamp this onto each dep.eoxStatus so loaders
// can drop stale entries (see js/storage-manager.js, js/findings-page.js).
EOXService.LOGIC_VERSION = 2;

// Create global instance
if (typeof window !== 'undefined') {
    window.EOXService = EOXService;
    window.eoxService = new EOXService();
}

