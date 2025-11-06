/**
 * SBOM Quality Processor
 * 
 * Assesses the quality of GitHub-generated SPDX SBOMs based on industry standards
 * Aligned with sbomqs methodology but adapted for GitHub's SBOM characteristics
 * 
 * Categories (7 total):
 * - Identification (25%): Component names, versions, IDs, PURLs
 * - Provenance (20%): Creation info, authors, tool, timestamps
 * - Integrity (10%): Checksums, hash algorithms
 * - Completeness (20%): Dependencies, relationships, suppliers
 * - Licensing (10%): License presence and validity (GitHub often uses NOASSERTION)
 * - Vulnerability (10%): PURL/CPE identifiers for security scanning
 * - Structural (5%): SPDX compliance (always valid from GitHub)
 * 
 * Scoring: 0-10 scale (internally 0-100, displayed as 0-10)
 * Grades: A (9.0-10.0), B (8.0-8.9), C (7.0-7.9), D (5.0-6.9), F (<5.0)
 */
class SBOMQualityProcessor {
    constructor() {
        // Weights optimized for GitHub SPDX SBOMs (total: 100%)
        this.weights = {
            identification: 0.25,   // 25% - Core strength of GitHub SBOMs
            provenance: 0.20,       // 20% - GitHub provides good metadata
            integrity: 0.10,        // 10% - Variable by ecosystem, don't over-penalize
            completeness: 0.20,     // 20% - Relationships always present
            licensing: 0.10,        // 10% - Often NOASSERTION, lower weight
            vulnerability: 0.10,    // 10% - PURL always present, CPE rare
            structural: 0.05        // 5% - Always valid SPDX from GitHub
        };
        
        // Deprecated SPDX license identifiers (for informational warnings)
        this.deprecatedLicenses = [
            'GPL-1.0', 'GPL-2.0', 'GPL-3.0',
            'LGPL-2.0', 'LGPL-2.1', 'LGPL-3.0',
            'AGPL-1.0', 'AGPL-3.0',
            'GFDL-1.1', 'GFDL-1.2', 'GFDL-1.3'
        ];
        
        // Restrictive licenses (for informational tracking)
        this.restrictiveLicenses = [
            'GPL-1.0-only', 'GPL-1.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later',
            'GPL-3.0-only', 'GPL-3.0-or-later', 'LGPL-2.0-only', 'LGPL-2.0-or-later',
            'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
            'AGPL-1.0-only', 'AGPL-1.0-or-later', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
            'CC-BY-NC-1.0', 'CC-BY-NC-2.0', 'CC-BY-NC-3.0', 'CC-BY-NC-4.0',
            'CC-BY-ND-1.0', 'CC-BY-ND-2.0', 'CC-BY-ND-3.0', 'CC-BY-ND-4.0'
        ];
    }

    /**
     * Assess the quality of an SBOM
     * @param {Object} sbomData - The raw SBOM data from GitHub
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Object} Quality assessment with scores and details
     */
    assessQuality(sbomData, owner, repo) {
        if (!sbomData || !sbomData.sbom) {
            return this.createEmptyAssessment(owner, repo, 'No SBOM data available');
        }

        const sbom = sbomData.sbom;
        
        // Calculate individual category scores (all 7 categories)
        const identification = this.assessIdentification(sbom);
        const provenance = this.assessProvenance(sbom);
        const integrity = this.assessIntegrity(sbom);
        const completeness = this.assessCompleteness(sbom);
        const licensing = this.assessLicensing(sbom);
        const vulnerability = this.assessVulnerability(sbom);
        const structural = this.assessStructural(sbom);

        // Calculate overall score (weighted average, 0-100 internal scale)
        const overallScore = Math.round(
            (identification.score * this.weights.identification) +
            (provenance.score * this.weights.provenance) +
            (integrity.score * this.weights.integrity) +
            (completeness.score * this.weights.completeness) +
            (licensing.score * this.weights.licensing) +
            (vulnerability.score * this.weights.vulnerability) +
            (structural.score * this.weights.structural)
        );

        return {
            repository: `${owner}/${repo}`,
            timestamp: Date.now(),
            overallScore: overallScore,  // 0-100 scale
            displayScore: this.toDisplayScore(overallScore),  // 0-10 scale for display
            grade: this.getGrade(overallScore),
            gradeLabel: this.getGradeLabel(overallScore),
            categories: {
                identification,
                provenance,
                integrity,
                completeness,
                licensing,
                vulnerability,
                structural
            },
            summary: this.generateSummary(overallScore, identification, provenance, integrity, completeness, licensing, vulnerability, structural),
            issues: this.collectIssues(identification, provenance, integrity, completeness, licensing, vulnerability, structural)
        };
    }

    /**
     * Assess SBOM Identification quality (25% weight)
     * Checks: component names, versions, unique IDs, PURLs
     * GitHub SBOMs: Excellent coverage, PURLs always present
     */
    assessIdentification(sbom) {
        const checks = {
            componentNames: 0,
            exactVersions: 0,
            rangeVersions: 0,
            missingVersions: 0,
            uniqueIds: 0,
            validPurls: 0
        };

        const issues = [];
        const packages = sbom.packages || [];
        
        if (packages.length === 0) {
            return {
                score: 0,
                checks,
                issues: ['No packages found in SBOM'],
                details: 'SBOM contains no package information'
            };
        }

        packages.forEach((pkg, idx) => {
            // Extract ecosystem from PURL for better package identification
            const ecosystem = this.getPackageEcosystem(pkg);
            const packageIdentifier = this.formatPackageIdentifier(pkg, ecosystem, idx);
            
            // Check component name
            if (pkg.name && pkg.name.trim()) {
                checks.componentNames++;
            } else {
                issues.push(`Package #${idx + 1}: Missing component name`);
            }

            // Check version quality
            if (pkg.versionInfo) {
                if (this.isExactVersion(pkg.versionInfo)) {
                    checks.exactVersions++;
                } else if (this.isRangeVersion(pkg.versionInfo)) {
                    checks.rangeVersions++;
                    // Range versions are noted but not as critical issues
                } else {
                    checks.missingVersions++;
                }
            } else {
                checks.missingVersions++;
                issues.push(`${packageIdentifier} is missing version information`);
            }

            // Check unique ID (SPDXID)
            if (pkg.SPDXID && pkg.SPDXID.trim()) {
                checks.uniqueIds++;
            } else {
                issues.push(`${packageIdentifier} is missing SPDXID`);
            }

            // Check PURL
            if (pkg.externalRefs && Array.isArray(pkg.externalRefs)) {
                const purlRef = pkg.externalRefs.find(ref => 
                    ref.referenceType === 'purl' && ref.referenceLocator
                );
                if (purlRef && this.isValidPurl(purlRef.referenceLocator)) {
                    checks.validPurls++;
                } else {
                    issues.push(`${packageIdentifier} has missing or invalid PURL`);
                }
            } else {
                issues.push(`${packageIdentifier} has no external references`);
            }
        });

        // Calculate score
        const totalPackages = packages.length;
        const nameScore = (checks.componentNames / totalPackages) * 100;
        
        // Version score: exact versions = 100%, range versions = 50%, missing = 0%
        const versionScore = ((checks.exactVersions * 1.0 + checks.rangeVersions * 0.5) / totalPackages) * 100;
        
        const idScore = (checks.uniqueIds / totalPackages) * 100;
        const purlScore = (checks.validPurls / totalPackages) * 100;

        // Average of all identification checks
        const score = Math.round((nameScore + versionScore + idScore + purlScore) / 4);

        return {
            score,
            checks,
            issues: issues.slice(0, 10), // Limit to 10 issues for display
            details: `${checks.componentNames}/${totalPackages} named, ${checks.exactVersions} exact versions, ${checks.rangeVersions} range versions, ${checks.validPurls} valid PURLs`
        };
    }

    /**
     * Assess SBOM Structural quality (5% weight - reduced, GitHub always valid)
     * Checks: SPDX version, format compliance, data license, schema validity
     * GitHub SBOMs: Always valid SPDX, this should score near-perfect
     */
    assessStructural(sbom) {
        const checks = {
            hasSpdxVersion: false,
            validSpdxVersion: false,
            hasDataLicense: false,
            correctDataLicense: false,
            hasDocumentNamespace: false,
            hasPackagesArray: false,
            hasRelationshipsArray: false
        };

        const issues = [];

        // Check SPDX version
        if (sbom.spdxVersion) {
            checks.hasSpdxVersion = true;
            if (/^SPDX-\d+\.\d+/.test(sbom.spdxVersion)) {
                checks.validSpdxVersion = true;
            } else {
                issues.push(`Invalid SPDX version format: ${sbom.spdxVersion}`);
            }
        } else {
            issues.push('Missing SPDX version');
        }

        // Check data license
        if (sbom.dataLicense) {
            checks.hasDataLicense = true;
            if (sbom.dataLicense === 'CC0-1.0') {
                checks.correctDataLicense = true;
            } else {
                issues.push(`Non-standard data license: ${sbom.dataLicense} (expected CC0-1.0)`);
            }
        } else {
            issues.push('Missing data license');
        }

        // Check document namespace
        if (sbom.documentNamespace) {
            checks.hasDocumentNamespace = true;
        } else {
            issues.push('Missing document namespace');
        }

        // Check required arrays
        if (sbom.packages && Array.isArray(sbom.packages)) {
            checks.hasPackagesArray = true;
        } else {
            issues.push('Missing or invalid packages array');
        }

        if (sbom.relationships && Array.isArray(sbom.relationships)) {
            checks.hasRelationshipsArray = true;
        } else {
            issues.push('Missing or invalid relationships array');
        }

        // Calculate score (all checks weighted equally)
        const totalChecks = Object.keys(checks).length;
        const passedChecks = Object.values(checks).filter(v => v === true).length;
        const score = Math.round((passedChecks / totalChecks) * 100);

        return {
            score,
            checks,
            issues,
            details: `${passedChecks}/${totalChecks} structure checks passed`
        };
    }

    /**
     * Assess SBOM Provenance quality (20% weight)
     * Checks: creation info, authors, tool, timestamps, namespace
     * GitHub SBOMs: Excellent coverage, always includes creator and timestamp
     */
    assessProvenance(sbom) {
        const checks = {
            hasCreationTimestamp: false,
            hasCreators: false,
            hasToolInfo: false,
            hasNamespace: false,
            hasDocumentName: false
        };

        const issues = [];

        // Check creation timestamp (always present in GitHub SBOMs)
        if (sbom.creationInfo?.created) {
            checks.hasCreationTimestamp = true;
        } else {
            issues.push('Missing creation timestamp');
        }

        // Check creators/authors (always present in GitHub SBOMs)
        if (sbom.creationInfo?.creators && Array.isArray(sbom.creationInfo.creators) && 
            sbom.creationInfo.creators.length > 0) {
            checks.hasCreators = true;
        } else {
            issues.push('Missing creator/author information');
        }

        // Check tool info (always present in GitHub SBOMs)
        const hasToolCreator = sbom.creationInfo?.creators?.some(c => 
            c.startsWith('Tool:') && c.includes('github')
        );
        if (hasToolCreator) {
            checks.hasToolInfo = true;
        } else {
            issues.push('Missing or invalid tool information');
        }

        // Check namespace/document URI (should be present)
        if (sbom.documentNamespace && sbom.documentNamespace.trim()) {
            checks.hasNamespace = true;
        } else {
            issues.push('Missing document namespace');
        }

        // Check document name
        if (sbom.name && sbom.name.trim()) {
            checks.hasDocumentName = true;
        } else {
            issues.push('Missing document name');
        }

        // Calculate score
        const totalChecks = Object.keys(checks).length;
        const passedChecks = Object.values(checks).filter(v => v === true).length;
        const score = Math.round((passedChecks / totalChecks) * 100);

        return {
            score,
            checks,
            issues,
            details: `${passedChecks}/${totalChecks} provenance checks passed`
        };
    }

    /**
     * Assess SBOM Completeness quality (30% weight)
     * Checks: licenses, relationships, copyright, download locations
     */
    assessCompleteness(sbom) {
        const checks = {
            packagesWithLicense: 0,
            packagesWithCopyright: 0,
            packagesWithDownloadLocation: 0,
            packagesWithRelationships: 0,
            packagesWithExternalRefs: 0
        };

        const issues = [];
        const packages = sbom.packages || [];
        const relationships = sbom.relationships || [];

        if (packages.length === 0) {
            return {
                score: 0,
                checks,
                issues: ['No packages to assess completeness'],
                details: 'Cannot assess completeness without packages'
            };
        }

        // Build relationship map
        const packageRelationshipMap = new Map();
        relationships.forEach(rel => {
            if (!packageRelationshipMap.has(rel.relatedSpdxElement)) {
                packageRelationshipMap.set(rel.relatedSpdxElement, []);
            }
            packageRelationshipMap.get(rel.relatedSpdxElement).push(rel);
        });

        // Track packages with missing information
        const packagesWithoutLicense = [];
        const packagesWithoutCopyright = [];
        const packagesWithoutDownloadLocation = [];
        const packagesWithoutRelationships = [];
        const packagesWithoutExternalRefs = [];

        packages.forEach((pkg, idx) => {
            // Use ecosystem-aware package identifier for clarity
            const ecosystem = this.getPackageEcosystem(pkg);
            const packageIdentifier = this.formatPackageIdentifier(pkg, ecosystem, idx);
            
            // Check license
            if (pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') {
                checks.packagesWithLicense++;
            } else {
                packagesWithoutLicense.push(packageIdentifier);
            }

            // Check copyright
            if (pkg.copyrightText && pkg.copyrightText !== 'NOASSERTION') {
                checks.packagesWithCopyright++;
            } else {
                packagesWithoutCopyright.push(packageIdentifier);
            }

            // Check download location
            if (pkg.downloadLocation && pkg.downloadLocation !== 'NOASSERTION') {
                checks.packagesWithDownloadLocation++;
            } else {
                packagesWithoutDownloadLocation.push(packageIdentifier);
            }

            // Check if package has relationships
            if (packageRelationshipMap.has(pkg.SPDXID)) {
                checks.packagesWithRelationships++;
            } else {
                packagesWithoutRelationships.push(packageIdentifier);
            }

            // Check external references
            if (pkg.externalRefs && pkg.externalRefs.length > 0) {
                checks.packagesWithExternalRefs++;
            } else {
                packagesWithoutExternalRefs.push(packageIdentifier);
            }
        });

        // Calculate scores for each dimension
        const totalPackages = packages.length;
        const licenseScore = (checks.packagesWithLicense / totalPackages) * 100;
        const copyrightScore = (checks.packagesWithCopyright / totalPackages) * 100;
        const downloadScore = (checks.packagesWithDownloadLocation / totalPackages) * 100;
        const relationshipScore = (checks.packagesWithRelationships / totalPackages) * 100;
        const externalRefScore = (checks.packagesWithExternalRefs / totalPackages) * 100;

        // Note: GitHub SBOMs typically use NOASSERTION for downloadLocation, so we weight it less
        const score = Math.round(
            (licenseScore * 0.25 + 
             copyrightScore * 0.20 + 
             downloadScore * 0.10 + 
             relationshipScore * 0.25 + 
             externalRefScore * 0.20)
        );

        // Add detailed informational issues with package names
        if (packagesWithoutLicense.length > 0) {
            if (packagesWithoutLicense.length <= 5) {
                issues.push(`Missing license information: ${packagesWithoutLicense.join(', ')}`);
            } else {
                issues.push(`Missing license information for ${packagesWithoutLicense.length} packages: ${packagesWithoutLicense.slice(0, 5).join(', ')} and ${packagesWithoutLicense.length - 5} more`);
            }
        }
        
        if (packagesWithoutCopyright.length > 0) {
            if (packagesWithoutCopyright.length <= 5) {
                issues.push(`Missing copyright information: ${packagesWithoutCopyright.join(', ')}`);
            } else {
                issues.push(`Missing copyright information for ${packagesWithoutCopyright.length} packages: ${packagesWithoutCopyright.slice(0, 5).join(', ')} and ${packagesWithoutCopyright.length - 5} more`);
            }
        }

        return {
            score,
            checks,
            issues,
            details: `${checks.packagesWithLicense}/${totalPackages} with licenses, ${checks.packagesWithCopyright}/${totalPackages} with copyright, ${checks.packagesWithRelationships}/${totalPackages} with relationships`
        };
    }

    /**
     * Assess SBOM Integrity quality (10% weight)
     * Checks: Checksums presence, algorithm strength
     * GitHub SBOMs: Variable by ecosystem, don't over-penalize missing checksums
     */
    assessIntegrity(sbom) {
        const checks = {
            packagesWithChecksums: 0,
            packagesWithSHA256Plus: 0,  // SHA-256, SHA-384, SHA-512, SHA3
            packagesWithSHA1Only: 0,
            packagesWithoutChecksums: 0
        };

        const issues = [];
        const packages = sbom.packages || [];
        const packagesWithWeakHash = [];
        const packagesWithoutHash = [];

        if (packages.length === 0) {
            return {
                score: 0,
                checks,
                issues: ['No packages to assess integrity'],
                details: 'Cannot assess integrity without packages'
            };
        }

        packages.forEach((pkg, idx) => {
            const ecosystem = this.getPackageEcosystem(pkg);
            const packageIdentifier = this.formatPackageIdentifier(pkg, ecosystem, idx);

            if (pkg.checksums && Array.isArray(pkg.checksums) && pkg.checksums.length > 0) {
                checks.packagesWithChecksums++;
                
                // Check for strong hash algorithms
                const hasStrongHash = pkg.checksums.some(checksum => 
                    /sha256|sha384|sha512|sha3/i.test(checksum.algorithm)
                );
                
                if (hasStrongHash) {
                    checks.packagesWithSHA256Plus++;
                } else {
                    checks.packagesWithSHA1Only++;
                    packagesWithWeakHash.push(packageIdentifier);
                }
            } else {
                checks.packagesWithoutChecksums++;
                packagesWithoutHash.push(packageIdentifier);
            }
        });

        const totalPackages = packages.length;
        
        // Score calculation: checksum presence (70%) + strong algorithm (30%)
        const checksumScore = (checks.packagesWithChecksums / totalPackages) * 70;
        const strongHashScore = (checks.packagesWithSHA256Plus / totalPackages) * 30;
        const score = Math.round(checksumScore + strongHashScore);

        // Add informational issues (don't over-penalize, just inform)
        if (packagesWithoutHash.length > 0) {
            if (packagesWithoutHash.length <= 5) {
                issues.push(`Missing checksums: ${packagesWithoutHash.join(', ')}`);
            } else {
                issues.push(`Missing checksums for ${packagesWithoutHash.length} packages: ${packagesWithoutHash.slice(0, 3).join(', ')} and ${packagesWithoutHash.length - 3} more`);
            }
        }

        if (packagesWithWeakHash.length > 0 && packagesWithWeakHash.length <= 5) {
            issues.push(`Weak checksums (upgrade to SHA-256+): ${packagesWithWeakHash.join(', ')}`);
        }

        return {
            score,
            checks,
            issues,
            details: `${checks.packagesWithChecksums}/${totalPackages} with checksums, ${checks.packagesWithSHA256Plus} with SHA-256+`
        };
    }

    /**
     * Assess SBOM Licensing & Compliance quality (10% weight)
     * Checks: License presence, SPDX validity, deprecated/restrictive licenses
     * GitHub SBOMs: Often NOASSERTION, don't penalize heavily
     */
    assessLicensing(sbom) {
        const checks = {
            packagesWithLicense: 0,
            packagesWithValidSPDX: 0,
            packagesWithDeprecated: 0,
            packagesWithRestrictive: 0,
            hasDataLicense: false
        };

        const issues = [];
        const packages = sbom.packages || [];
        const packagesWithDeprecatedLicense = [];
        const packagesWithRestrictiveLicense = [];

        if (packages.length === 0) {
            return {
                score: 50,  // Neutral score, document-level can still score
                checks,
                issues: ['No packages to assess licensing'],
                details: 'No packages found'
            };
        }

        packages.forEach((pkg, idx) => {
            const ecosystem = this.getPackageEcosystem(pkg);
            const packageIdentifier = this.formatPackageIdentifier(pkg, ecosystem, idx);

            // Check for license (not NOASSERTION)
            const hasLicense = pkg.licenseConcluded && 
                               pkg.licenseConcluded !== 'NOASSERTION' && 
                               pkg.licenseConcluded.trim() !== '';

            if (hasLicense) {
                checks.packagesWithLicense++;
                
                // Check if it's a valid SPDX identifier (basic check)
                if (!pkg.licenseConcluded.includes('LicenseRef-') && 
                    pkg.licenseConcluded.match(/^[A-Z0-9\-\.+]+$/i)) {
                    checks.packagesWithValidSPDX++;
                }

                // Check for deprecated licenses
                if (this.deprecatedLicenses.includes(pkg.licenseConcluded)) {
                    checks.packagesWithDeprecated++;
                    packagesWithDeprecatedLicense.push(`${packageIdentifier} (${pkg.licenseConcluded})`);
                }

                // Check for restrictive licenses
                if (this.restrictiveLicenses.some(lic => pkg.licenseConcluded.includes(lic))) {
                    checks.packagesWithRestrictive++;
                    packagesWithRestrictiveLicense.push(`${packageIdentifier} (${pkg.licenseConcluded})`);
                }
            }
        });

        // Check document data license (should be CC0-1.0 for SPDX)
        if (sbom.dataLicense === 'CC0-1.0') {
            checks.hasDataLicense = true;
        }

        const totalPackages = packages.length;
        
        // Score: license presence (50%), valid SPDX (30%), data license (20%)
        // Don't penalize for deprecated/restrictive, just inform
        const presenceScore = (checks.packagesWithLicense / totalPackages) * 50;
        const validityScore = checks.packagesWithLicense > 0 
            ? (checks.packagesWithValidSPDX / checks.packagesWithLicense) * 30 
            : 0;
        const dataLicenseScore = checks.hasDataLicense ? 20 : 0;
        const score = Math.round(presenceScore + validityScore + dataLicenseScore);

        // Add informational issues
        const noLicenseCount = totalPackages - checks.packagesWithLicense;
        if (noLicenseCount > 0) {
            issues.push(`${noLicenseCount} packages with NOASSERTION or missing license (common in GitHub SBOMs)`);
        }

        if (packagesWithDeprecatedLicense.length > 0 && packagesWithDeprecatedLicense.length <= 3) {
            issues.push(`Deprecated licenses (informational): ${packagesWithDeprecatedLicense.join(', ')}`);
        }

        if (packagesWithRestrictiveLicense.length > 0 && packagesWithRestrictiveLicense.length <= 3) {
            issues.push(`Restrictive licenses (informational): ${packagesWithRestrictiveLicense.join(', ')}`);
        }

        if (!checks.hasDataLicense) {
            issues.push('Document data license should be CC0-1.0');
        }

        return {
            score,
            checks,
            issues,
            details: `${checks.packagesWithLicense}/${totalPackages} with licenses, ${checks.packagesWithValidSPDX} valid SPDX IDs`
        };
    }

    /**
     * Assess SBOM Vulnerability & Traceability quality (10% weight)
     * Checks: PURL and CPE identifiers for vulnerability scanning
     * GitHub SBOMs: PURLs always present, CPEs rare (don't over-penalize)
     */
    assessVulnerability(sbom) {
        const checks = {
            packagesWithPURL: 0,
            packagesWithCPE: 0,
            packagesWithBoth: 0
        };

        const issues = [];
        const packages = sbom.packages || [];
        const packagesWithoutPURL = [];
        const packagesWithoutCPE = [];

        if (packages.length === 0) {
            return {
                score: 0,
                checks,
                issues: ['No packages to assess vulnerability tracking'],
                details: 'Cannot assess without packages'
            };
        }

        packages.forEach((pkg, idx) => {
            const ecosystem = this.getPackageEcosystem(pkg);
            const packageIdentifier = this.formatPackageIdentifier(pkg, ecosystem, idx);
            
            let hasPURL = false;
            let hasCPE = false;

            if (pkg.externalRefs && Array.isArray(pkg.externalRefs)) {
                // Check for PURL
                const purlRef = pkg.externalRefs.find(ref => 
                    ref.referenceType === 'purl' && ref.referenceLocator
                );
                if (purlRef && this.isValidPurl(purlRef.referenceLocator)) {
                    hasPURL = true;
                    checks.packagesWithPURL++;
                }

                // Check for CPE (rare in GitHub SBOMs)
                const cpeRef = pkg.externalRefs.find(ref => 
                    ref.referenceType === 'cpe22Type' || 
                    ref.referenceType === 'cpe23Type' ||
                    (ref.referenceCategory === 'SECURITY' && ref.referenceLocator?.startsWith('cpe:'))
                );
                if (cpeRef) {
                    hasCPE = true;
                    checks.packagesWithCPE++;
                }

                if (hasPURL && hasCPE) {
                    checks.packagesWithBoth++;
                }
            }

            if (!hasPURL) {
                packagesWithoutPURL.push(packageIdentifier);
            }
            if (!hasCPE) {
                packagesWithoutCPE.push(packageIdentifier);
            }
        });

        const totalPackages = packages.length;
        
        // Score: PURL (80%) + CPE (20%) - PURL is critical, CPE is bonus for GitHub
        const purlScore = (checks.packagesWithPURL / totalPackages) * 80;
        const cpeScore = (checks.packagesWithCPE / totalPackages) * 20;
        const score = Math.round(purlScore + cpeScore);

        // Add issues
        if (packagesWithoutPURL.length > 0) {
            if (packagesWithoutPURL.length <= 5) {
                issues.push(`Missing PURL identifiers: ${packagesWithoutPURL.join(', ')}`);
            } else {
                issues.push(`Missing PURL identifiers for ${packagesWithoutPURL.length} packages`);
            }
        }

        // CPE missing is informational only (rare in GitHub)
        if (checks.packagesWithCPE === 0 && totalPackages > 0) {
            issues.push('No CPE identifiers found (rare in GitHub SBOMs, PURL is sufficient)');
        }

        return {
            score,
            checks,
            issues,
            details: `${checks.packagesWithPURL}/${totalPackages} with PURL, ${checks.packagesWithCPE}/${totalPackages} with CPE`
        };
    }

    /**
     * Extract package ecosystem from PURL or package type
     */
    getPackageEcosystem(pkg) {
        // Try to extract from PURL first
        if (pkg.externalRefs && Array.isArray(pkg.externalRefs)) {
            const purlRef = pkg.externalRefs.find(ref => 
                ref.referenceType === 'purl' && ref.referenceLocator
            );
            if (purlRef && purlRef.referenceLocator) {
                // Extract ecosystem from PURL: pkg:npm/package or pkg:pypi/package
                const match = purlRef.referenceLocator.match(/^pkg:([^/]+)\//);
                if (match) {
                    return match[1]; // npm, pypi, maven, cargo, etc.
                }
            }
        }
        
        // Fallback: try to guess from package name patterns
        if (pkg.name) {
            if (pkg.name.includes(':')) return 'maven';
            if (pkg.name.startsWith('@')) return 'npm';
        }
        
        return null; // Unknown ecosystem
    }

    /**
     * Format package identifier with ecosystem for clear reporting
     */
    formatPackageIdentifier(pkg, ecosystem, idx) {
        const packageName = pkg.name || `Package #${idx + 1}`;
        
        if (ecosystem) {
            return `${packageName}@${ecosystem}`;
        }
        
        return packageName;
    }

    /**
     * Check if version is exact (not a range)
     */
    isExactVersion(version) {
        if (!version) return false;
        // Exact versions don't contain comparison operators or wildcards
        return !/[<>=~^*]/.test(version);
    }

    /**
     * Check if version is a range
     */
    isRangeVersion(version) {
        if (!version) return false;
        // Range versions contain comparison operators
        return /[<>=~^]/.test(version);
    }

    /**
     * Validate PURL format
     */
    isValidPurl(purl) {
        if (!purl) return false;
        // Basic PURL validation: must start with pkg: and have type/name
        return /^pkg:[a-z0-9\-]+\/[^@?]+/.test(purl);
    }

    /**
     * Get letter grade from score (0-100 scale)
     * Aligned with sbomqs grading system
     */
    getGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 50) return 'D';  // Adjusted threshold
        return 'F';
    }

    /**
     * Get grade label with description
     */
    getGradeLabel(score) {
        if (score >= 90) return 'Excellent - Ready for production';
        if (score >= 80) return 'Good - Minor improvements needed';
        if (score >= 70) return 'Acceptable - Review and enhance';
        if (score >= 50) return 'Poor - Significant improvements required';
        return 'Bad - Not suitable for use';
    }

    /**
     * Convert internal score (0-100) to display score (0-10)
     */
    toDisplayScore(score) {
        return Math.round(score) / 10;  // e.g., 87 → 8.7
    }

    /**
     * Generate human-readable summary
     */
    generateSummary(overallScore, identification, provenance, integrity, completeness, licensing, vulnerability, structural) {
        const grade = this.getGrade(overallScore);
        let summary = `SBOM quality grade: ${grade} (${overallScore}/100). `;

        const strengths = [];
        const weaknesses = [];

        // Identify strengths (score >= 80)
        if (identification.score >= 80) strengths.push('strong component identification');
        if (provenance.score >= 80) strengths.push('excellent provenance');
        if (integrity.score >= 80) strengths.push('good integrity checks');
        if (completeness.score >= 80) strengths.push('comprehensive information');
        if (licensing.score >= 80) strengths.push('clear licensing');
        if (vulnerability.score >= 80) strengths.push('vulnerability-ready');
        if (structural.score >= 80) strengths.push('compliant structure');

        // Identify weaknesses (score < 60)
        if (identification.score < 60) weaknesses.push('weak identification');
        if (provenance.score < 60) weaknesses.push('incomplete provenance');
        if (integrity.score < 60) weaknesses.push('limited integrity checks');
        if (completeness.score < 60) weaknesses.push('limited completeness');
        if (licensing.score < 60) weaknesses.push('unclear licensing');
        if (vulnerability.score < 60) weaknesses.push('vulnerability tracking gaps');
        if (structural.score < 60) weaknesses.push('structural issues');

        if (strengths.length > 0) {
            summary += `Strengths: ${strengths.join(', ')}. `;
        }
        if (weaknesses.length > 0) {
            summary += `Areas for improvement: ${weaknesses.join(', ')}.`;
        }

        // Update to display 0-10 scale
        summary = summary.replace(`(${overallScore}/100)`, `(${this.toDisplayScore(overallScore)}/10.0)`);

        return summary.trim();
    }

    /**
     * Collect all issues from categories (all 7 categories)
     */
    collectIssues(identification, provenance, integrity, completeness, licensing, vulnerability, structural) {
        const allIssues = [];
        
        if (identification.issues.length > 0) {
            allIssues.push({
                category: 'Identification',
                issues: identification.issues
            });
        }
        
        if (provenance.issues.length > 0) {
            allIssues.push({
                category: 'Provenance',
                issues: provenance.issues
            });
        }
        
        if (integrity.issues.length > 0) {
            allIssues.push({
                category: 'Integrity',
                issues: integrity.issues
            });
        }
        
        if (completeness.issues.length > 0) {
            allIssues.push({
                category: 'Completeness',
                issues: completeness.issues
            });
        }
        
        if (licensing.issues.length > 0) {
            allIssues.push({
                category: 'Licensing',
                issues: licensing.issues
            });
        }
        
        if (vulnerability.issues.length > 0) {
            allIssues.push({
                category: 'Vulnerability',
                issues: vulnerability.issues
            });
        }
        
        if (structural.issues.length > 0) {
            allIssues.push({
                category: 'Structural',
                issues: structural.issues
            });
        }

        return allIssues;
    }

    /**
     * Create empty assessment for repositories without SBOM
     */
    createEmptyAssessment(owner, repo, reason) {
        return {
            repository: `${owner}/${repo}`,
            timestamp: Date.now(),
            overallScore: 0,
            displayScore: 0,
            grade: 'N/A',
            gradeLabel: 'No SBOM available',
            categories: {
                identification: { score: 0, checks: {}, issues: [reason], details: reason },
                provenance: { score: 0, checks: {}, issues: [reason], details: reason },
                integrity: { score: 0, checks: {}, issues: [reason], details: reason },
                completeness: { score: 0, checks: {}, issues: [reason], details: reason },
                licensing: { score: 0, checks: {}, issues: [reason], details: reason },
                vulnerability: { score: 0, checks: {}, issues: [reason], details: reason },
                structural: { score: 0, checks: {}, issues: [reason], details: reason }
            },
            summary: reason,
            issues: [{ category: 'General', issues: [reason] }]
        };
    }

    /**
     * Calculate aggregate quality statistics for an organization
     */
    calculateAggregateQuality(qualityAssessments) {
        if (!qualityAssessments || qualityAssessments.length === 0) {
            return {
                averageOverallScore: 0,
                averageDisplayScore: 0,
                averageIdentification: 0,
                averageProvenance: 0,
                averageIntegrity: 0,
                averageCompleteness: 0,
                averageLicensing: 0,
                averageVulnerability: 0,
                averageStructural: 0,
                totalRepositories: 0,
                gradeDistribution: {},
                repositoriesNeedingAttention: []
            };
        }

        const totals = {
            overall: 0,
            identification: 0,
            provenance: 0,
            integrity: 0,
            completeness: 0,
            licensing: 0,
            vulnerability: 0,
            structural: 0
        };

        const gradeDistribution = { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0, 'N/A': 0 };
        const repositoriesNeedingAttention = [];

        qualityAssessments.forEach(assessment => {
            totals.overall += assessment.overallScore || 0;
            
            // Use optional chaining for backward compatibility with old 4-category data
            totals.identification += assessment.categories?.identification?.score || 0;
            totals.provenance += assessment.categories?.provenance?.score || 0;
            totals.integrity += assessment.categories?.integrity?.score || 0;
            totals.completeness += assessment.categories?.completeness?.score || 0;
            totals.licensing += assessment.categories?.licensing?.score || 0;
            totals.vulnerability += assessment.categories?.vulnerability?.score || 0;
            
            // Handle both old 'structure' and new 'structural' naming
            totals.structural += assessment.categories?.structural?.score || 
                                 assessment.categories?.structure?.score || 0;

            gradeDistribution[assessment.grade]++;

            // Flag repositories scoring below 70 (grade C or lower)
            if (assessment.overallScore > 0 && assessment.overallScore < 70) {
                repositoriesNeedingAttention.push({
                    repository: assessment.repository,
                    score: assessment.overallScore,
                    displayScore: this.toDisplayScore(assessment.overallScore),
                    grade: assessment.grade,
                    topIssues: assessment.issues?.slice(0, 3) || []
                });
            }
        });

        const count = qualityAssessments.length;
        const avgOverallScore = Math.round(totals.overall / count);

        return {
            averageOverallScore: avgOverallScore,
            averageDisplayScore: this.toDisplayScore(avgOverallScore),
            averageIdentification: Math.round(totals.identification / count),
            averageProvenance: Math.round(totals.provenance / count),
            averageIntegrity: Math.round(totals.integrity / count),
            averageCompleteness: Math.round(totals.completeness / count),
            averageLicensing: Math.round(totals.licensing / count),
            averageVulnerability: Math.round(totals.vulnerability / count),
            averageStructural: Math.round(totals.structural / count),
            totalRepositories: count,
            gradeDistribution,
            repositoriesNeedingAttention: repositoriesNeedingAttention.sort((a, b) => a.score - b.score)
        };
    }
}

// Make available globally
window.SBOMQualityProcessor = SBOMQualityProcessor;

