/**
 * License Processor - Handles license compliance and legal insight analysis
 */
class LicenseProcessor {
    constructor() {
        // License categorization and risk assessment
        this.licenseCategories = {
            // Permissive licenses (low risk)
            permissive: {
                licenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Zlib', 'Boost-1.0', 'Ruby'],
                risk: 'low',
                description: 'Permissive licenses that allow commercial use with minimal restrictions'
            },
            // Lesser GPL licenses (medium risk - more permissive than GPL but still copyleft)
            lgpl: {
                licenses: ['LGPL-2.1', 'LGPL-3.0'],
                risk: 'medium',
                description: 'Lesser GPL licenses that are more permissive than GPL but still have some copyleft requirements'
            },
            // Copyleft licenses (medium-high risk)
            copyleft: {
                licenses: ['GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later', 'AGPL-3.0', 'MPL-2.0', 'EPL-2.0'],
                risk: 'high',
                description: 'Copyleft licenses that may require source code disclosure'
            },
            // Proprietary/Commercial licenses (medium risk)
            proprietary: {
                licenses: ['Commercial', 'Proprietary', 'Custom'],
                risk: 'medium',
                description: 'Commercial or proprietary licenses with usage restrictions'
            },
            // Unknown/Unspecified licenses (high risk)
            unknown: {
                licenses: ['NOASSERTION', 'UNKNOWN', 'NONE', ''],
                risk: 'high',
                description: 'Unknown or unspecified licenses requiring investigation'
            }
        };

        // License compatibility matrix
        this.compatibilityMatrix = {
            // Permissive licenses are generally compatible with each other
            'MIT': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL'],
            'Apache-2.0': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL'],
            'BSD-2-Clause': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL'],
            'BSD-3-Clause': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL'],
            'ISC': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'Unlicense': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'CC0-1.0': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'WTFPL': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'Ruby': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            
            // Copyleft licenses have more restrictions
            'GPL-2.0': ['GPL-2.0', 'GPL-3.0'],
            'GPL-3.0': ['GPL-3.0'],
            'GPL-2.0-only': ['GPL-2.0', 'GPL-3.0'],
            'GPL-2.0-or-later': ['GPL-2.0', 'GPL-3.0'],
            'GPL-3.0-only': ['GPL-3.0'],
            'GPL-3.0-or-later': ['GPL-3.0'],
            'AGPL-3.0': ['AGPL-3.0'],
            'LGPL-2.1': ['LGPL-2.1', 'LGPL-3.0', 'GPL-2.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'LGPL-3.0': ['LGPL-3.0', 'GPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby'],
            'MPL-2.0': ['MPL-2.0', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0'],
            'EPL-2.0': ['EPL-2.0', 'GPL-2.0', 'GPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'WTFPL', 'Ruby']
        };

        // License family groupings for bulk review
        this.licenseFamilies = {
            'MIT Family': ['MIT', 'ISC', 'Unlicense'],
            'BSD Family': ['BSD-2-Clause', 'BSD-3-Clause', 'BSD-4-Clause'],
            'Apache Family': ['Apache-1.0', 'Apache-1.1', 'Apache-2.0'],
            'GPL Family': ['GPL-1.0', 'GPL-2.0', 'GPL-3.0', 'AGPL-1.0', 'AGPL-3.0'],
            'LGPL Family': ['LGPL-2.0', 'LGPL-2.1', 'LGPL-3.0'],
            'MPL Family': ['MPL-1.0', 'MPL-1.1', 'MPL-2.0'],
            'EPL Family': ['EPL-1.0', 'EPL-2.0'],
            'Commercial': ['Commercial', 'Proprietary', 'Custom'],
            'Unknown': ['NOASSERTION', 'UNKNOWN', 'NONE', '']
        };
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

        // Extract license information
        if (pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') {
            licenseInfo.license = pkg.licenseConcluded;
            
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
                    for (const [category, info] of Object.entries(this.licenseCategories)) {
                        if (info.licenses.includes(component)) {
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
                }
                
                // Set risk and category based on the most restrictive component
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
        // Split by AND/OR and clean up
        const components = licenseExpression
            .split(/\s+(?:AND|OR)\s+/i)
            .map(comp => comp.trim())
            .filter(comp => comp.length > 0);

        // Handle special cases and normalize
        return components.map(comp => {
            // Handle version suffixes like "-only", "-or-later"
            if (comp.includes('-only') || comp.includes('-or-later')) {
                return comp; // Keep as-is for now
            }
            
            // Handle language-specific licenses like "Ruby"
            if (comp === 'Ruby') {
                return 'Ruby'; // Ruby license is generally permissive
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LicenseProcessor;
} else {
    window.LicenseProcessor = LicenseProcessor;
} 