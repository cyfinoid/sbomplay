/**
 * Ecosystem Utilities - Shared ecosystem mapping and normalization functions
 * Consolidates duplicate ecosystem mapping code from multiple services
 * BUILD: 1764049072342 (fixed OSV ecosystem mapping)
 */
console.log('🌐 Ecosystem Mapper loaded - BUILD: 1764049072342 (fixed OSV ecosystems)');

class EcosystemMapper {
    constructor() {
        // Comprehensive mapping from various ecosystem formats to OSV-compatible names
        // Based on OSV API documentation: https://ossf.github.io/osv-schema/#affectedpackage-field
        // ONLY includes ecosystems actually supported by OSV API for vulnerability queries
        this.osvEcosystemMap = {
            'golang': 'Go',
            'go': 'Go',
            'pypi': 'PyPI',
            'npm': 'npm',
            'maven': 'Maven',
            'nuget': 'NuGet',
            'cargo': 'crates.io',
            'crates.io': 'crates.io',
            'composer': 'Packagist',
            'packagist': 'Packagist',
            'rubygems': 'RubyGems',
            'gem': 'RubyGems',
            'hex': 'Hex',
            'pub': 'Pub',
            'cocoapods': 'CocoaPods',
            'cran': 'CRAN',
            'debian': 'Debian',
            'alpine': 'Alpine'
            // NOTE: 'githubactions', 'github', 'docker', 'helm', 'terraform' are NOT
            // supported by OSV API for vulnerability queries - they will return null
        };

        // Mapping for PURL type to internal ecosystem names (for categorization)
        // Extended with all 38 ecosystems from DepConfuse
        this.purlTypeMap = {
            // Primary code ecosystems
            'pypi': { type: 'code', language: 'Python', ecosystem: 'PyPI' },
            'npm': { type: 'code', language: 'JavaScript', ecosystem: 'npm' },
            'maven': { type: 'code', language: 'Java', ecosystem: 'Maven' },
            'nuget': { type: 'code', language: 'C#', ecosystem: 'NuGet' },
            'cargo': { type: 'code', language: 'Rust', ecosystem: 'Cargo' },
            'composer': { type: 'code', language: 'PHP', ecosystem: 'Composer' },
            'packagist': { type: 'code', language: 'PHP', ecosystem: 'Composer' },
            'go': { type: 'code', language: 'Go', ecosystem: 'Go' },
            'golang': { type: 'code', language: 'Go', ecosystem: 'Go' },
            'rubygems': { type: 'code', language: 'Ruby', ecosystem: 'RubyGems' },
            'gem': { type: 'code', language: 'Ruby', ecosystem: 'RubyGems' },
            
            // Additional code ecosystems (from DepConfuse)
            'cocoapods': { type: 'code', language: 'Swift/Objective-C', ecosystem: 'CocoaPods' },
            'bower': { type: 'code', language: 'JavaScript', ecosystem: 'Bower' },
            'pub': { type: 'code', language: 'Dart', ecosystem: 'Pub' },
            'cpan': { type: 'code', language: 'Perl', ecosystem: 'CPAN' },
            'cran': { type: 'code', language: 'R', ecosystem: 'CRAN' },
            'clojars': { type: 'code', language: 'Clojure', ecosystem: 'Clojars' },
            'hackage': { type: 'code', language: 'Haskell', ecosystem: 'Hackage' },
            'hex': { type: 'code', language: 'Elixir/Erlang', ecosystem: 'Hex' },
            'julia': { type: 'code', language: 'Julia', ecosystem: 'Julia' },
            'swift': { type: 'code', language: 'Swift', ecosystem: 'Swift Package Index' },
            'deno': { type: 'code', language: 'TypeScript/JavaScript', ecosystem: 'Deno' },
            'elm': { type: 'code', language: 'Elm', ecosystem: 'Elm' },
            'racket': { type: 'code', language: 'Racket', ecosystem: 'Racket' },
            'bioconductor': { type: 'code', language: 'R', ecosystem: 'Bioconductor' },
            'carthage': { type: 'code', language: 'Swift/Objective-C', ecosystem: 'Carthage' },
            'elpa': { type: 'code', language: 'Emacs Lisp', ecosystem: 'ELPA' },
            'nongnu': { type: 'code', language: 'Emacs Lisp', ecosystem: 'NonGNU ELPA' },
            
            // Infrastructure/DevOps ecosystems
            'githubactions': { type: 'workflow', language: 'YAML', ecosystem: 'GitHub Actions' },
            'github': { type: 'infrastructure', language: 'Various', ecosystem: 'GitHub' },
            'docker': { type: 'infrastructure', language: 'Various', ecosystem: 'Docker' },
            'helm': { type: 'infrastructure', language: 'YAML', ecosystem: 'Helm' },
            'terraform': { type: 'infrastructure', language: 'HCL', ecosystem: 'Terraform' },
            'conda': { type: 'infrastructure', language: 'Python', ecosystem: 'Conda' },
            'anaconda': { type: 'infrastructure', language: 'Python', ecosystem: 'Anaconda' },
            'spack': { type: 'infrastructure', language: 'Various', ecosystem: 'Spack' },
            'homebrew': { type: 'infrastructure', language: 'Various', ecosystem: 'Homebrew' },
            'puppet': { type: 'infrastructure', language: 'Puppet', ecosystem: 'Puppet Forge' },
            'vcpkg': { type: 'infrastructure', language: 'C/C++', ecosystem: 'vcpkg' },
            
            // OS package managers
            'alpine': { type: 'infrastructure', language: 'Various', ecosystem: 'Alpine' },
            'adelie': { type: 'infrastructure', language: 'Various', ecosystem: 'Adelie' },
            'postmarketos': { type: 'infrastructure', language: 'Various', ecosystem: 'postmarketOS' }
        };
    }

    /**
     * Map ecosystem name to OSV-compatible format
     * @param {string} ecosystem - Ecosystem name (case insensitive)
     * @returns {string|null} - OSV-compatible ecosystem name or null
     */
    mapToOSV(ecosystem) {
        if (!ecosystem) return null;
        // Return mapped ecosystem or null - never return invalid ecosystem names
        // This prevents OSV API errors for unsupported ecosystems
        return this.osvEcosystemMap[ecosystem.toLowerCase()] || null;
    }

    /**
     * Extract and map ecosystem from PURL
     * @param {string} purl - PURL string (e.g., "pkg:pypi/flask@1.1.2")
     * @returns {string|null} - OSV-compatible ecosystem name or null
     */
    mapFromPurl(purl) {
        if (!purl) return null;
        
        const purlParts = purl.split('/');
        if (purlParts.length >= 2) {
            const ecosystem = purlParts[0].replace('pkg:', '').toLowerCase();
            return this.mapToOSV(ecosystem);
        }
        
        return null;
    }

    /**
     * Extract ecosystem from package object with PURL
     * @param {Object} pkg - Package object with externalRefs
     * @returns {string|null} - OSV-compatible ecosystem name or null
     */
    extractEcosystemFromPurl(pkg) {
        if (!pkg) return null;
        
        // Try to extract from PURL first (most reliable)
        if (pkg.externalRefs) {
            const purlRef = pkg.externalRefs.find(ref => ref.referenceType === 'purl');
            if (purlRef && purlRef.referenceLocator) {
                const mapped = this.mapFromPurl(purlRef.referenceLocator);
                if (mapped) {
                    return mapped;
                }
            }
        }
        
        // Try to extract ecosystem from SPDXID as fallback
        if (pkg.SPDXID) {
            const spdxMatch = pkg.SPDXID.match(/SPDXRef-([^-]+)-/);
            if (spdxMatch) {
                return this.mapToOSV(spdxMatch[1]);
            }
        }
        
        return null;
    }

    /**
     * Normalize ecosystem name (handles aliases like go/golang)
     * @param {string} ecosystem - Ecosystem name
     * @returns {string} - Normalized ecosystem name
     */
    normalizeEcosystem(ecosystem) {
        if (!ecosystem) return ecosystem;
        const normalized = ecosystem.toLowerCase();
        
        // Handle common aliases
        if (normalized === 'go') {
            return 'golang';
        }
        if (normalized === 'packagist') {
            return 'composer';
        }
        if (normalized === 'gem') {
            return 'rubygems';
        }
        
        return normalized;
    }

    /**
     * Get category information for an ecosystem (for SBOM processor)
     * @param {string} ecosystem - Ecosystem name
     * @returns {Object|null} - Category info or null
     */
    getCategoryInfo(ecosystem) {
        if (!ecosystem) return null;
        const normalized = this.normalizeEcosystem(ecosystem);
        return this.purlTypeMap[normalized] || null;
    }

    /**
     * Detect ecosystem based on package name (fallback method)
     * Uses common package name patterns to infer ecosystem
     * @param {string} packageName - Package name
     * @returns {string|null} - Detected ecosystem or null
     */
    detectFromName(packageName) {
        if (!packageName) return null;
        
        const name = packageName.toLowerCase();
        
        // NPM packages with @ prefix
        if (name.startsWith('@')) {
            return 'npm';
        }
        
        // Maven packages with group:artifact format
        if (name.includes(':')) {
            return 'Maven';
        }
        
        // Go modules with clear domain patterns
        if (name.startsWith('github.com/') || name.startsWith('golang.org/')) {
            return 'Go';
        }
        
        // GitHub Actions packages
        if (name.startsWith('actions/') || name.startsWith('github/')) {
            return 'GitHub Actions';
        }
        
        // Common NPM packages (without @ prefix)
        const npmPackages = [
            'lodash', 'react', 'axios', 'moment', 'jquery', 'express', 'vue', 'angular',
            'bootstrap', 'webpack', 'babel', 'eslint', 'prettier', 'jest', 'mocha',
            'chai', 'sinon', 'cypress', 'typescript', 'node', 'npm', 'yarn', 'socket.io',
            'underscore', 'grunt', 'node-sass'
        ];
        if (npmPackages.includes(name)) {
            return 'npm';
        }
        
        // Common Python packages
        const pypiPackages = [
            'requests', 'flask', 'django', 'numpy', 'pandas', 'matplotlib', 'scipy',
            'pillow', 'sqlalchemy', 'jinja2', 'werkzeug', 'click', 'pyyaml',
            'beautifulsoup4', 'lxml', 'pytest', 'pytest-cov', 'black', 'flake8',
            'gitpython', 'gitdb', 'smmap', 'pynacl', 'itsdangerous'
        ];
        if (pypiPackages.includes(name)) {
            return 'PyPI';
        }
        
        // Common Ruby gems
        const rubyGems = [
            'rails', 'sinatra', 'rack', 'bundler', 'rake', 'rspec', 'capybara',
            'jekyll', 'octokit', 'nokogiri', 'faraday', 'addressable', 'ffi',
            'activesupport', 'typhoeus', 'yell', 'coffee-script', 'fast-stemmer'
        ];
        if (rubyGems.includes(name)) {
            return 'RubyGems';
        }
        
        // For everything else, return null to avoid false positives
        return null;
    }
}

// Create global instance
window.EcosystemMapper = EcosystemMapper;
window.ecosystemMapper = new EcosystemMapper();

