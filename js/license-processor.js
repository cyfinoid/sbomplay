/**
 * License Processor - Handles license compliance and legal insight analysis
 */
class LicenseProcessor {
    constructor() {
        // License categorization and risk assessment
        this.licenseCategories = {
            // Permissive licenses (low risk)
            permissive: {
                licenses: [
                    'MIT', 'MIT-0', 'MIT-CMU',
                    'Apache-2.0', 'Apache-1.1', 'Apache-1.0',
                    'BSD-2-Clause', 'BSD-3-Clause', 'BSD-2-Clause-Views', 'BSD-3-Clause-Modification', '0BSD',
                    'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Zlib', 'BSL-1.0', 'Ruby',
                    'Python-2.0', 'Python-2.0.1', 'PSF-2.0', 'CNRI-Python',
                    'CC-BY-4.0', 'OFL-1.1', 'BlueOak-1.0.0', 'AFL-2.1',
                    'CDDL-1.0', 'CDDL-1.1',
                    'Unicode-DFS-2016', 'bzip2-1.0.6', 'ImageMagick', 'curl',
                    // OSI-approved permissive licenses from PyPI classifiers
                    'AAL', 'Intel', 'OGTSL', 'RSCPL', 'NCSA', 'VSL-1.0', 'W3C-20150513', 'Xnet',
                    'LicenseRef-scancode-public-domain', 'LicenseRef-scancode-other-permissive', 'LicenseRef-scancode-jsr-107-jcache-spec-2013'
                ],
                risk: 'low',
                description: 'Permissive licenses that allow commercial use with minimal restrictions'
            },
            // Lesser GPL licenses (medium risk - more permissive than GPL but still copyleft)
            lgpl: {
                licenses: [
                    'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
                    'LGPL-2.0-only', 'LGPL-2.0-or-later',
                    'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later'
                ],
                risk: 'medium',
                description: 'Lesser GPL licenses that are more permissive than GPL but still have some copyleft requirements'
            },
            // Copyleft licenses (medium-high risk)
            copyleft: {
                licenses: [
                    'GPL-2.0', 'GPL-3.0',
                    'GPL-1.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later',
                    'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
                    'MPL-1.0', 'MPL-1.1', 'MPL-2.0',
                    'EPL-2.0', 'EPL-1.0',
                    'GPL-2.0-only WITH Classpath-exception-2.0',
                    // OSI-approved copyleft licenses from PyPI classifiers
                    'Nokia', 'CECILL-2.1', 'CPL-1.0', 'EUPL-1.0', 'EUPL-1.1',
                    'IPL-1.0', 'Motosoto', 'NGPL', 'Sleepycat', 'SPL-1.0'
                ],
                risk: 'high',
                description: 'Copyleft licenses that may require source code disclosure'
            },
            // Proprietary/Commercial licenses (medium risk)
            proprietary: {
                licenses: ['Commercial', 'Proprietary', 'Custom', 'Aladdin'],
                risk: 'medium',
                description: 'Commercial or proprietary licenses with usage restrictions'
            },
            // Unknown/Unspecified licenses (high risk)
            unknown: {
                licenses: [
                    'NOASSERTION', 'UNKNOWN', 'NONE', '',
                    'LicenseRef-scancode-unknown-license-reference', 'LicenseRef-scancode-unknown-spdx',
                    'LicenseRef-scancode-alliance-open-media-patent-1.0'
                ],
                risk: 'high',
                description: 'Unknown or unspecified licenses requiring investigation'
            }
        };

        // License compatibility matrix
        // Note: For complex licenses (AND/OR), compatibility is checked component-by-component
        this.compatibilityMatrix = {
            // Permissive licenses are generally compatible with each other
            'MIT': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD', 'CDDL-1.0', 'CDDL-1.1'],
            'MIT-0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'Apache-2.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD', 'CDDL-1.0', 'CDDL-1.1'],
            'BSD-2-Clause': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'BSD-3-Clause': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'ISC': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'Unlicense': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'CC0-1.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'WTFPL': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'Ruby': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'Python-2.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'PSF-2.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            '0BSD': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'Python-2.0', 'PSF-2.0', '0BSD'],
            'CDDL-1.0': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'CDDL-1.0', 'CDDL-1.1'],
            'CDDL-1.1': ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby', 'CDDL-1.0', 'CDDL-1.1'],
            
            // Copyleft licenses have more restrictions
            'GPL-2.0': ['GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-3.0': ['GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-1.0-or-later': ['GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-2.0-only': ['GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-2.0-or-later': ['GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-3.0-only': ['GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'GPL-3.0-or-later': ['GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later'],
            'AGPL-3.0': ['AGPL-3.0'],
            'LGPL-2.1': ['LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-2.1-only': ['LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-2.1-or-later': ['LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-2.0-only': ['LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-2.0-or-later': ['LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-3.0': ['LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-3.0-only': ['LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-3.0-or-later': ['LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'MPL-2.0': ['MPL-2.0', 'MPL-1.1', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0'],
            'MPL-1.1': ['MPL-2.0', 'MPL-1.1', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0'],
            'EPL-2.0': ['EPL-2.0', 'EPL-1.0', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'EPL-1.0': ['EPL-2.0', 'EPL-1.0', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby']
        };

        // License family groupings for bulk review
        this.licenseFamilies = {
            'MIT Family': ['MIT', 'MIT-0', 'MIT-CMU', 'ISC', 'Unlicense'],
            'BSD Family': ['BSD-2-Clause', 'BSD-3-Clause', 'BSD-4-Clause', 'BSD-2-Clause-Views', 'BSD-3-Clause-Modification', '0BSD', 'NCSA'],
            'Apache Family': ['Apache-1.0', 'Apache-1.1', 'Apache-2.0'],
            'GPL Family': ['GPL-1.0-or-later', 'GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later', 'AGPL-1.0', 'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later'],
            'LGPL Family': ['LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later'],
            'MPL Family': ['MPL-1.0', 'MPL-1.1', 'MPL-2.0'],
            'EPL Family': ['EPL-1.0', 'EPL-2.0', 'CPL-1.0', 'IPL-1.0'],
            'EUPL Family': ['EUPL-1.0', 'EUPL-1.1', 'EUPL-1.2'],
            'CeCILL Family': ['CECILL-2.1', 'CECILL-B', 'CECILL-C'],
            'Python Family': ['Python-2.0', 'Python-2.0.1', 'PSF-2.0', 'CNRI-Python'],
            'CDDL Family': ['CDDL-1.0', 'CDDL-1.1', 'SPL-1.0'],
            'Boost Family': ['BSL-1.0'],
            'W3C Family': ['W3C', 'W3C-20150513'],
            'Commercial': ['Commercial', 'Proprietary', 'Custom', 'Aladdin'],
            'Unknown': ['NOASSERTION', 'UNKNOWN', 'NONE', '', 'LicenseRef-scancode-unknown-license-reference', 'LicenseRef-scancode-unknown-spdx', 'LicenseRef-scancode-alliance-open-media-patent-1.0']
        };
    }

    /**
     * Normalize license name to canonical form
     * Handles variants like GPL-3, GPL-3-only, GPL-3.0, etc.
     * @param {string} license - License string to normalize
     * @returns {string} - Normalized license name
     */
    normalizeLicenseName(license) {
        if (!license || typeof license !== 'string') {
            return license || 'Unknown';
        }
        
        // Trim whitespace
        let normalized = license.trim();
        
        // Map common variants to canonical forms
        const variantMap = {
            // GPL variants
            'GPL-3': 'GPL-3.0',
            'GPL-3.0': 'GPL-3.0',
            'GPL-3-only': 'GPL-3.0-only',
            'GPL-3.0-only': 'GPL-3.0-only',
            'GPL-3-or-later': 'GPL-3.0-or-later',
            'GPL-3.0-or-later': 'GPL-3.0-or-later',
            'GPL-2': 'GPL-2.0',
            'GPL-2.0': 'GPL-2.0',
            'GPL-2-only': 'GPL-2.0-only',
            'GPL-2.0-only': 'GPL-2.0-only',
            'GPL-2-or-later': 'GPL-2.0-or-later',
            'GPL-2.0-or-later': 'GPL-2.0-or-later',
            
            // LGPL variants
            'LGPL-2.1': 'LGPL-2.1',
            'LGPL-2.1-only': 'LGPL-2.1-only',
            'LGPL-2.1-or-later': 'LGPL-2.1-or-later',
            'LGPL-3': 'LGPL-3.0',
            'LGPL-3.0': 'LGPL-3.0',
            'LGPL-3-only': 'LGPL-3.0-only',
            'LGPL-3.0-only': 'LGPL-3.0-only',
            'LGPL-3-or-later': 'LGPL-3.0-or-later',
            'LGPL-3.0-or-later': 'LGPL-3.0-or-later',
            
            // Apache variants
            'Apache': 'Apache-2.0',
            'Apache-2': 'Apache-2.0',
            'Apache-2.0': 'Apache-2.0',
            'Apache License 2.0': 'Apache-2.0',
            
            // BSD variants
            'BSD': 'BSD-3-Clause',  // Default to 3-clause if unspecified
            'BSD-2': 'BSD-2-Clause',
            'BSD-2-Clause': 'BSD-2-Clause',
            'BSD-3': 'BSD-3-Clause',
            'BSD-3-Clause': 'BSD-3-Clause',
            
            // MIT variants
            'MIT License': 'MIT',
            'MIT': 'MIT',
            
            // MPL variants
            'MPL-1': 'MPL-1.0',
            'MPL-1.0': 'MPL-1.0',
            'MPL-2': 'MPL-2.0',
            'MPL-2.0': 'MPL-2.0',
            'MPL-1.1': 'MPL-1.1',
            
            // EPL variants
            'EPL-2': 'EPL-2.0',
            'EPL-2.0': 'EPL-2.0',
            'EPL-1.0': 'EPL-1.0',
            
            // AGPL variants
            'AGPL-3': 'AGPL-3.0',
            'AGPL-3.0': 'AGPL-3.0',
            'AGPL-3-only': 'AGPL-3.0-only',
            'AGPL-3.0-only': 'AGPL-3.0-only',
            'AGPL-3-or-later': 'AGPL-3.0-or-later',
            'AGPL-3.0-or-later': 'AGPL-3.0-or-later',
            
            // Boost variants (BSL-1.0 is the official SPDX ID)
            'Boost-1.0': 'BSL-1.0',
            'BSL-1.0': 'BSL-1.0',
            'Boost Software License 1.0': 'BSL-1.0',
            
            // EUPL variants
            'EUPL-1.0': 'EUPL-1.0',
            'EUPL-1.1': 'EUPL-1.1',
            'EUPL 1.0': 'EUPL-1.0',
            'EUPL 1.1': 'EUPL-1.1'
        };
        
        // Check exact match first
        if (variantMap[normalized]) {
            return variantMap[normalized];
        }
        
        // Check case-insensitive match
        const normalizedLower = normalized.toLowerCase();
        for (const [variant, canonical] of Object.entries(variantMap)) {
            if (variant.toLowerCase() === normalizedLower) {
                return canonical;
            }
        }
        
        // If no mapping found, return as-is (might be a valid SPDX identifier)
        return normalized;
    }

    /**
     * Parse and categorize license information from SBOM package
     */
    parseLicense(pkg) {
        const licenseInfo = {
            license: null,
            category: 'unknown',
            risk: 'high',
            description: 'Unknown license requiring investigation',
            copyright: null,
            isCompatible: true,
            warnings: []
        };

        // Check if pkg is defined and has the required properties
        if (!pkg) {
            licenseInfo.warnings.push('No package information available');
            return licenseInfo;
        }

        // Extract license information (check licenseConcluded first, then licenseDeclared)
        let licenseValue = null;
        if (pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') {
            licenseValue = pkg.licenseConcluded;
        } else if (pkg.licenseDeclared && pkg.licenseDeclared !== 'NOASSERTION') {
            licenseValue = pkg.licenseDeclared;
        }
        
        // Detect dual licenses (e.g., "MIT AND Apache-2.0", "GPL-2.0 OR GPL-3.0")
        const isDualLicense = licenseValue && (licenseValue.includes(' AND ') || licenseValue.includes(' OR '));
        let dualLicenseInfo = null;
        if (isDualLicense) {
            const parts = licenseValue.split(/\s+(AND|OR)\s+/i);
            const licenses = [];
            const operators = [];
            for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 0) {
                    licenses.push(parts[i].trim());
                } else {
                    operators.push(parts[i].trim().toUpperCase());
                }
            }
            dualLicenseInfo = {
                licenses: licenses,
                operators: operators,
                fullText: licenseValue
            };
        }
        
        if (licenseValue) {
            licenseInfo.license = licenseValue;
            
            // Check for complex licenses (AND/OR combinations) first
            if (licenseInfo.license.includes(' AND ') || licenseInfo.license.includes(' OR ')) {
                licenseInfo.warnings.push('Complex license combination detected');
                
                // For complex licenses, try to categorize based on the most restrictive component
                const components = this.parseComplexLicense(licenseInfo.license);
                let hasCopyleft = false;
                let hasPermissive = false;
                let hasLgpl = false;
                let hasProprietary = false;
                
                for (const component of components) {
                    // Check each component against license categories
                    let componentFound = false;
                    for (const [category, info] of Object.entries(this.licenseCategories)) {
                        // Check exact match first
                        if (info.licenses.includes(component)) {
                            componentFound = true;
                            if (category === 'copyleft') {
                                hasCopyleft = true;
                            } else if (category === 'lgpl') {
                                hasLgpl = true;
                            } else if (category === 'permissive') {
                                hasPermissive = true;
                            } else if (category === 'proprietary') {
                                hasProprietary = true;
                            }
                            break;
                        }
                    }
                    
                    // If not found by exact match, try partial matching for known license patterns
                    if (!componentFound) {
                        const compLower = component.toLowerCase();
                        // Check for GPL variants
                        if (compLower.includes('gpl-') && !compLower.includes('lgpl')) {
                            hasCopyleft = true;
                        }
                        // Check for LGPL variants
                        else if (compLower.includes('lgpl-')) {
                            hasLgpl = true;
                        }
                        // Check for MPL variants
                        else if (compLower.includes('mpl-')) {
                            hasCopyleft = true;
                        }
                        // Check for EPL variants
                        else if (compLower.includes('epl-')) {
                            hasCopyleft = true;
                        }
                        // Check for AGPL variants
                        else if (compLower.includes('agpl-')) {
                            hasCopyleft = true;
                        }
                        // Check for common permissive patterns
                        else if (compLower.includes('mit') || compLower.includes('bsd') || 
                                 compLower.includes('apache') || compLower.includes('isc') ||
                                 compLower.includes('python-') || compLower.includes('psf-') ||
                                 compLower.includes('cc-by') || compLower.includes('ofl-') ||
                                 compLower.includes('0bsd') || compLower.includes('cddl-') ||
                                 compLower.includes('unlicense') || compLower.includes('wtfpl') ||
                                 compLower.includes('cc0-') || compLower.includes('ruby') ||
                                 compLower.includes('blueoak') || compLower.includes('afl-') ||
                                 compLower.includes('public-domain') || compLower.includes('other-permissive')) {
                            hasPermissive = true;
                        }
                    }
                }
                
                // For dual licenses, classify under least restrictive
                // AND licenses: must comply with both, so use most restrictive
                // OR licenses: can choose either, so use least restrictive
                const isAndLicense = licenseInfo.license.includes(' AND ');
                const isOrLicense = licenseInfo.license.includes(' OR ');
                
                // Store dual license info
                licenseInfo.isDualLicense = true;
                licenseInfo.dualLicenseInfo = dualLicenseInfo;
                
                // Set risk and category based on least restrictive (for OR) or most restrictive (for AND)
                if (isOrLicense) {
                    // OR license: use least restrictive (most permissive)
                    if (hasPermissive && !hasCopyleft && !hasLgpl) {
                        licenseInfo.category = 'permissive';
                        licenseInfo.risk = 'low';
                        licenseInfo.description = `Dual license (OR): ${dualLicenseInfo.licenses.join(' OR ')} - Choose least restrictive`;
                    } else if (hasLgpl && !hasCopyleft) {
                        licenseInfo.category = 'lgpl';
                        licenseInfo.risk = 'medium';
                        licenseInfo.description = `Dual license (OR): ${dualLicenseInfo.licenses.join(' OR ')} - Choose least restrictive`;
                    } else if (hasCopyleft) {
                        // Even with OR, if copyleft is an option, it's still risky
                        licenseInfo.category = 'copyleft';
                        licenseInfo.risk = 'high';
                        licenseInfo.description = `Dual license (OR): ${dualLicenseInfo.licenses.join(' OR ')} - Copyleft option available`;
                    }
                } else if (isAndLicense) {
                    // AND license: must comply with both, so use most restrictive
                    if (hasCopyleft) {
                        licenseInfo.category = 'copyleft';
                        licenseInfo.risk = 'high';
                        licenseInfo.description = `Dual license (AND): ${dualLicenseInfo.licenses.join(' AND ')} - Must comply with both`;
                    } else if (hasLgpl) {
                        licenseInfo.category = 'lgpl';
                        licenseInfo.risk = 'medium';
                        licenseInfo.description = `Dual license (AND): ${dualLicenseInfo.licenses.join(' AND ')} - Must comply with both`;
                    } else if (hasPermissive) {
                        licenseInfo.category = 'permissive';
                        licenseInfo.risk = 'low';
                        licenseInfo.description = `Dual license (AND): ${dualLicenseInfo.licenses.join(' AND ')} - Must comply with both`;
                    }
                } else {
                    // Fallback (shouldn't happen, but just in case)
                if (hasCopyleft) {
                    licenseInfo.category = 'copyleft';
                    licenseInfo.risk = 'high';
                    licenseInfo.description = 'Complex license with copyleft components';
                } else if (hasLgpl) {
                    licenseInfo.category = 'lgpl';
                    licenseInfo.risk = 'medium';
                    licenseInfo.description = 'Complex license with LGPL components';
                } else if (hasProprietary) {
                    licenseInfo.category = 'proprietary';
                    licenseInfo.risk = 'medium';
                    licenseInfo.description = 'Complex license with proprietary components';
                } else if (hasPermissive) {
                    licenseInfo.category = 'permissive';
                    licenseInfo.risk = 'low';
                    licenseInfo.description = 'Complex license with permissive components';
                } else {
                    licenseInfo.category = 'unknown';
                    licenseInfo.risk = 'high';
                    licenseInfo.description = 'Complex license combination requiring investigation';
                    }
                }
            } else {
                // Simple license - categorize normally
                for (const [category, info] of Object.entries(this.licenseCategories)) {
                    if (info.licenses.includes(licenseInfo.license)) {
                        licenseInfo.category = category;
                        licenseInfo.risk = info.risk;
                        licenseInfo.description = info.description;
                        break;
                    }
                }
            }
        } else {
            licenseInfo.warnings.push('No license information available');
        }

        // Extract copyright information
        if (pkg.copyrightText && pkg.copyrightText !== 'NOASSERTION') {
            licenseInfo.copyright = pkg.copyrightText;
        }

        return licenseInfo;
    }

    /**
     * Check for license conflicts in a repository
     */
    checkLicenseConflicts(dependencies) {
        const conflicts = [];
        const licenses = new Map();

        // Collect all licenses
        dependencies.forEach(dep => {
            const licenseInfo = this.parseLicense(dep.originalPackage);
            if (licenseInfo.license) {
                if (!licenses.has(licenseInfo.license)) {
                    licenses.set(licenseInfo.license, []);
                }
                licenses.get(licenseInfo.license).push(dep);
            }
        });

        // Check for incompatible license combinations
        const licenseList = Array.from(licenses.keys());
        for (let i = 0; i < licenseList.length; i++) {
            for (let j = i + 1; j < licenseList.length; j++) {
                const license1 = licenseList[i];
                const license2 = licenseList[j];
                
                // Debug specific case
                if ((license1 === 'MIT' && license2 === 'LGPL-2.1') || 
                    (license1 === 'LGPL-2.1' && license2 === 'MIT')) {
                    console.log('🔍 Debugging MIT vs LGPL-2.1 compatibility');
                    this.debugLicenseCompatibility(license1, license2);
                }
                
                if (!this.areLicensesCompatible(license1, license2)) {
                    conflicts.push({
                        type: 'incompatible_licenses',
                        licenses: [license1, license2],
                        dependencies: [
                            ...licenses.get(license1),
                            ...licenses.get(license2)
                        ],
                        severity: 'high',
                        description: `Incompatible licenses detected: ${license1} and ${license2}`
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Check if two licenses are compatible
     */
    areLicensesCompatible(license1, license2) {
        // Same license is always compatible
        if (license1 === license2) {
            return true;
        }

        // Handle complex license expressions
        if (license1.includes(' AND ') || license1.includes(' OR ') ||
            license2.includes(' AND ') || license2.includes(' OR ')) {
            return this.areComplexLicensesCompatible(license1, license2);
        }

        // Check compatibility matrix - check both directions
        if (this.compatibilityMatrix[license1] && this.compatibilityMatrix[license1].includes(license2)) {
            return true;
        }
        if (this.compatibilityMatrix[license2] && this.compatibilityMatrix[license2].includes(license1)) {
            return true;
        }

        // For licenses not in the matrix, use a more permissive approach
        // Only flag as incompatible if we know they conflict
        const knownIncompatiblePairs = [
            ['GPL-2.0', 'GPL-3.0'], // Different GPL versions
            ['GPL-2.0', 'AGPL-3.0'], // GPL vs AGPL
            ['GPL-3.0', 'AGPL-3.0'], // GPL vs AGPL
            ['LGPL-2.1', 'LGPL-3.0'], // Different LGPL versions
            ['MPL-1.0', 'MPL-2.0'], // Different MPL versions
            ['Apache-1.0', 'Apache-2.0'], // Different Apache versions
        ];

        // Check if this is a known incompatible pair
        for (const [lic1, lic2] of knownIncompatiblePairs) {
            if ((license1 === lic1 && license2 === lic2) || 
                (license1 === lic2 && license2 === lic1)) {
                return false;
            }
        }

        // For unknown combinations, assume compatible (more permissive)
        // This prevents false positives for common permissive licenses
        return true;
    }

    /**
     * Debug method to test license compatibility
     */
    debugLicenseCompatibility(license1, license2) {
        console.log(`🔍 Debugging license compatibility: ${license1} vs ${license2}`);
        
        // Check if licenses exist in matrix
        console.log(`License1 in matrix:`, this.compatibilityMatrix[license1] ? 'Yes' : 'No');
        console.log(`License2 in matrix:`, this.compatibilityMatrix[license2] ? 'Yes' : 'No');
        
        if (this.compatibilityMatrix[license1]) {
            console.log(`License1 compatible with:`, this.compatibilityMatrix[license1]);
        }
        if (this.compatibilityMatrix[license2]) {
            console.log(`License2 compatible with:`, this.compatibilityMatrix[license2]);
        }
        
        const result = this.areLicensesCompatible(license1, license2);
        console.log(`Compatibility result:`, result);
        return result;
    }

    /**
     * Check compatibility for complex license expressions
     */
    areComplexLicensesCompatible(license1, license2) {
        // Parse complex licenses into individual components
        const components1 = this.parseComplexLicense(license1);
        const components2 = this.parseComplexLicense(license2);

        // For AND combinations, all components must be compatible
        if (license1.includes(' AND ') && license2.includes(' AND ')) {
            // Both are AND combinations - check if all components are compatible
            for (const comp1 of components1) {
                for (const comp2 of components2) {
                    if (!this.areLicensesCompatible(comp1, comp2)) {
                        return false; // Any incompatibility makes the whole combination incompatible
                    }
                }
            }
            return true; // All components are compatible
        } else if (license1.includes(' AND ')) {
            // License1 is AND combination, license2 is simple
            // All components of license1 must be compatible with license2
            for (const comp1 of components1) {
                if (!this.areLicensesCompatible(comp1, license2)) {
                    return false;
                }
            }
            return true;
        } else if (license2.includes(' AND ')) {
            // License2 is AND combination, license1 is simple
            // All components of license2 must be compatible with license1
            for (const comp2 of components2) {
                if (!this.areLicensesCompatible(license1, comp2)) {
                    return false;
                }
            }
            return true;
        } else {
            // Both are OR combinations or simple licenses
            // Check if any component from license1 is compatible with any component from license2
            for (const comp1 of components1) {
                for (const comp2 of components2) {
                    if (this.areLicensesCompatible(comp1, comp2)) {
                        return true; // At least one combination is compatible
                    }
                }
            }
            return false; // No compatible combinations found
        }
    }

    /**
     * Parse complex license expression into individual licenses
     */
    parseComplexLicense(licenseExpression) {
        // Handle WITH clauses (e.g., "GPL-2.0-only WITH Classpath-exception-2.0")
        // Split by WITH first, then by AND/OR
        let mainExpression = licenseExpression;
        const withMatch = licenseExpression.match(/^(.+?)\s+WITH\s+(.+)$/i);
        if (withMatch) {
            mainExpression = withMatch[1].trim(); // Use the part before WITH
        }
        
        // Split by AND/OR and clean up
        const components = mainExpression
            .split(/\s+(?:AND|OR)\s+/i)
            .map(comp => comp.trim())
            .filter(comp => comp.length > 0);

        // Handle special cases and normalize
        return components.map(comp => {
            // Remove parentheses if present
            comp = comp.replace(/^\(|\)$/g, '').trim();
            
            // Handle version suffixes like "-only", "-or-later" - keep as-is
            if (comp.includes('-only') || comp.includes('-or-later')) {
                return comp;
            }
            
            // Handle language-specific licenses
            if (comp === 'Ruby') {
                return 'Ruby';
            }
            
            // Handle LicenseRef-scancode references
            if (comp.startsWith('LicenseRef-scancode-')) {
                // Check if it's a known permissive reference
                if (comp.includes('public-domain') || comp.includes('other-permissive') || comp.includes('jsr-')) {
                    return comp; // Will be recognized as permissive
                }
                // Unknown references will remain unknown
                return comp;
            }

            return comp;
        });
    }

    /**
     * Group dependencies by license families
     */
    groupByLicenseFamily(dependencies) {
        const families = new Map();

        dependencies.forEach(dep => {
            const licenseInfo = this.parseLicense(dep.originalPackage);
            let family = 'Unknown';

            // Find the family for this license
            for (const [familyName, licenses] of Object.entries(this.licenseFamilies)) {
                if (licenses.includes(licenseInfo.license)) {
                    family = familyName;
                    break;
                }
            }

            if (!families.has(family)) {
                families.set(family, []);
            }
            families.get(family).push({
                ...dep,
                licenseInfo
            });
        });

        return families;
    }

    /**
     * Generate license compliance report
     */
    generateComplianceReport(dependencies) {
        const report = {
            summary: {
                totalDependencies: dependencies.length,
                licensedDependencies: 0,
                unlicensedDependencies: 0,
                riskBreakdown: {
                    low: 0,
                    medium: 0,
                    high: 0
                },
                categoryBreakdown: {
                    permissive: 0,
                    copyleft: 0,
                    proprietary: 0,
                    unknown: 0
                }
            },
            conflicts: [],
            recommendations: [],
            licenseFamilies: new Map(),
            highRiskDependencies: []
        };

        // Process each dependency
        dependencies.forEach(dep => {
            const licenseInfo = this.parseLicense(dep.originalPackage);
            
            if (licenseInfo.license && licenseInfo.license !== 'NOASSERTION') {
                report.summary.licensedDependencies++;
                report.summary.riskBreakdown[licenseInfo.risk]++;
                report.summary.categoryBreakdown[licenseInfo.category]++;
                
                if (licenseInfo.risk === 'high') {
                    report.highRiskDependencies.push({
                        name: dep.name,
                        version: dep.version,
                        license: licenseInfo.license,
                        category: licenseInfo.category,
                        warnings: licenseInfo.warnings
                    });
                }
            } else {
                report.summary.unlicensedDependencies++;
            }
        });

        // Check for conflicts
        report.conflicts = this.checkLicenseConflicts(dependencies);

        // Group by license families
        report.licenseFamilies = this.groupByLicenseFamily(dependencies);

        // Generate recommendations
        if (report.summary.unlicensedDependencies > 0) {
            report.recommendations.push({
                type: 'warning',
                priority: 'high',
                message: `${report.summary.unlicensedDependencies} dependencies lack license information`
            });
        }

        if (report.highRiskDependencies.length > 0) {
            report.recommendations.push({
                type: 'warning',
                priority: 'medium',
                message: `${report.highRiskDependencies.length} high-risk licenses detected`
            });
        }

        if (report.conflicts.length > 0) {
            report.recommendations.push({
                type: 'error',
                priority: 'high',
                message: `${report.conflicts.length} license conflicts detected`
            });
        }

        return report;
    }

    /**
     * Get license statistics for visualization
     */
    getLicenseStats(dependencies) {
        const stats = {
            byCategory: {
                permissive: 0,
                copyleft: 0,
                proprietary: 0,
                unknown: 0
            },
            byRisk: {
                low: 0,
                medium: 0,
                high: 0
            },
            byLicense: new Map(),
            topLicenses: []
        };

        dependencies.forEach(dep => {
            const licenseInfo = this.parseLicense(dep.originalPackage);
            
            if (licenseInfo.license && licenseInfo.license !== 'NOASSERTION') {
                stats.byCategory[licenseInfo.category]++;
                stats.byRisk[licenseInfo.risk]++;
                
                if (!stats.byLicense.has(licenseInfo.license)) {
                    stats.byLicense.set(licenseInfo.license, 0);
                }
                stats.byLicense.set(licenseInfo.license, stats.byLicense.get(licenseInfo.license) + 1);
            } else {
                stats.byCategory.unknown++;
                stats.byRisk.high++;
            }
        });

        // Get top licenses
        stats.topLicenses = Array.from(stats.byLicense.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([license, count]) => ({ license, count }));

        return stats;
    }

    /**
     * Check if a dependency license is compatible with a repository license
     * Returns true if compatible, false if incompatible, null if unknown/indeterminate
     * @param {string} dependencyLicense - The dependency's license (SPDX identifier)
     * @param {string} repositoryLicense - The repository's license (SPDX identifier)
     * @returns {boolean|null} - true if compatible, false if incompatible, null if unknown
     */
    isDependencyCompatibleWithRepository(dependencyLicense, repositoryLicense) {
        // If repository license is not available, we can't determine compatibility
        if (!repositoryLicense) {
            return null;
        }

        // If dependency license is not available, it's a concern regardless
        if (!dependencyLicense || dependencyLicense === 'NOASSERTION') {
            return false;
        }

        // Same license is always compatible
        if (dependencyLicense === repositoryLicense) {
            return true;
        }

        // Check compatibility using the existing compatibility matrix
        // If repository is GPL and dependency is GPL, they're compatible
        if (this.areLicensesCompatible(dependencyLicense, repositoryLicense)) {
            return true;
        }

        // Special case: If repository is GPL-licensed, GPL dependencies are compatible
        const repoIsGPL = repositoryLicense.toLowerCase().includes('gpl') && 
                          !repositoryLicense.toLowerCase().includes('lgpl') &&
                          !repositoryLicense.toLowerCase().includes('agpl');
        const depIsGPL = dependencyLicense.toLowerCase().includes('gpl') && 
                         !dependencyLicense.toLowerCase().includes('lgpl') &&
                         !dependencyLicense.toLowerCase().includes('agpl');
        
        if (repoIsGPL && depIsGPL) {
            return true; // GPL dependencies are compatible with GPL repositories
        }

        // Special case: If repository is LGPL-licensed, LGPL and GPL dependencies are compatible
        const repoIsLGPL = repositoryLicense.toLowerCase().includes('lgpl');
        const depIsLGPL = dependencyLicense.toLowerCase().includes('lgpl');
        
        if (repoIsLGPL && (depIsLGPL || depIsGPL)) {
            return true; // LGPL/GPL dependencies are compatible with LGPL repositories
        }

        // If repository is permissive (MIT, Apache, BSD, etc.), all dependencies are generally compatible
        // But copyleft dependencies might still be flagged for awareness
        const repoIsPermissive = this.licenseCategories.permissive.licenses.includes(repositoryLicense);
        if (repoIsPermissive) {
            // Permissive licenses can use any dependency, but we still want to flag copyleft for awareness
            // Return true for compatibility, but the risk assessment will still flag copyleft
            return true;
        }

        // For other cases, use the compatibility matrix
        return this.areLicensesCompatible(dependencyLicense, repositoryLicense);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LicenseProcessor;
} else {
    window.LicenseProcessor = LicenseProcessor;
} 