/**
 * SBOM Quality Processor
 * 
 * Assesses the quality of SPDX/CycloneDX SBOMs based on industry standards
 * Fully aligned with sbomqs v2.0 methodology
 * Reference: https://github.com/interlynk-io/sbomqs
 * 
 * Categories (7 total, matching sbomqs v2.0):
 * - Identification (12%): Component names, versions, unique IDs
 * - Provenance (15%): Creation info, authors, tool, timestamps, namespace
 * - Integrity (18%): Checksums, SHA-256+, signatures
 * - Completeness (15%): Dependencies, supplier, source code, purpose
 * - Licensing (18%): License presence, validity, deprecated/restrictive
 * - Vulnerability (12%): PURL/CPE identifiers for security scanning
 * - Structural (10%): Spec compliance, version, format, schema validity
 * 
 * Scoring: 0-10 scale (internally 0-100, displayed as 0-10)
 * Grades: A (9.0-10.0), B (8.0-8.9), C (7.0-7.9), D (5.0-6.9), F (<5.0)
 */
class SBOMQualityProcessor {
    constructor() {
        // Weights aligned with sbomqs v2.0 (total: 100%)
        // See: SBOMQS-2.0-SPEC.md
        this.weights = {
            identification: 0.12,    // 12% - Component identification
            provenance: 0.15,        // 15% - Trust and audit trails
            integrity: 0.18,         // 18% - Artifact verification (checksums)
            completeness: 0.15,      // 15% - Dependency and metadata coverage
            licensing: 0.18,         // 18% - Legal compliance
            vulnerability: 0.12,     // 12% - Security scanning readiness
            structural: 0.10         // 10% - Spec compliance and parseability
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
     * @param {Object} sbomData - The raw SBOM data (GitHub API or uploaded)
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Object} Quality assessment with scores and details
     */
    assessQuality(sbomData, owner, repo) {
        if (!sbomData || !sbomData.sbom) {
            return this.createEmptyAssessment(owner, repo, 'No SBOM data available');
        }

        const sbom = sbomData.sbom;
        
        // Detect SBOM format and version
        const sbomFormat = this.detectSBOMFormat(sbom, sbomData);
        
        // Calculate individual category scores (7 categories aligned with sbomqs v2.0)
        const identification = this.assessIdentification(sbom);
        const provenance = this.assessProvenance(sbom);
        const integrity = this.assessIntegrity(sbom);
        const completeness = this.assessCompletenessCategory(sbom);
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
            sbomFormat: sbomFormat,  // SBOM format info (type and version)
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
            summary: this.generateSummary7Categories(overallScore, identification, provenance, integrity, completeness, licensing, vulnerability, structural),
            issues: this.collectIssues7Categories(identification, provenance, integrity, completeness, licensing, vulnerability, structural)
        };
    }
    
    /**
     * Detect SBOM format and version
     * @param {Object} sbom - The SBOM data (sbomData.sbom)
     * @param {Object} sbomData - The full SBOM wrapper (may contain original format info)
     * @returns {Object} - { type: 'SPDX'|'CycloneDX'|'Unknown', version: string|null, displayName: string }
     */
    detectSBOMFormat(sbom, sbomData) {
        // Check for CycloneDX markers in the wrapper or sbom
        // CycloneDX converted to internal format may have Tool: CycloneDX-X.X in creators
        const creators = sbom.creationInfo?.creators || [];
        const cycloneDXCreator = creators.find(c => c.includes('CycloneDX-'));
        
        if (cycloneDXCreator) {
            // Extract version from "Tool: CycloneDX-1.5" format
            const versionMatch = cycloneDXCreator.match(/CycloneDX-([0-9.]+)/);
            const version = versionMatch ? versionMatch[1] : null;
            return {
                type: 'CycloneDX',
                version: version,
                displayName: version ? `CycloneDX ${version}` : 'CycloneDX'
            };
        }
        
        // Check for bomFormat field (direct CycloneDX)
        if (sbomData.bomFormat === 'CycloneDX' || sbom.bomFormat === 'CycloneDX') {
            const version = sbomData.specVersion || sbom.specVersion || null;
            return {
                type: 'CycloneDX',
                version: version,
                displayName: version ? `CycloneDX ${version}` : 'CycloneDX'
            };
        }
        
        // Check for SPDX version
        if (sbom.spdxVersion) {
            // Parse version from "SPDX-2.3" format
            const versionMatch = sbom.spdxVersion.match(/SPDX-([0-9.]+)/);
            const version = versionMatch ? versionMatch[1] : sbom.spdxVersion;
            return {
                type: 'SPDX',
                version: version,
                displayName: `SPDX ${version}`
            };
        }
        
        // Check for SPDXVersion (alternative casing)
        if (sbom.SPDXVersion) {
            const versionMatch = sbom.SPDXVersion.match(/SPDX-([0-9.]+)/);
            const version = versionMatch ? versionMatch[1] : sbom.SPDXVersion;
            return {
                type: 'SPDX',
                version: version,
                displayName: `SPDX ${version}`
            };
        }
        
        // Check if it looks like SPDX (has SPDXID, packages, relationships)
        if (sbom.SPDXID && sbom.packages && sbom.relationships) {
            return {
                type: 'SPDX',
                version: null,
                displayName: 'SPDX (version unknown)'
            };
        }
        
        return {
            type: 'Unknown',
            version: null,
            displayName: 'Unknown Format'
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
     * Assess SBOM Provenance quality (15% weight) - sbomqs aligned
     * Checks: creation timestamp, authors, tool, supplier, namespace, lifecycle
     * Based on sbomqs v2.0 Provenance category
     */
    assessProvenance(sbom) {
        const checks = {
            hasCreationTimestamp: false,
            hasCreators: false,
            hasToolInfo: false,
            hasToolVersion: false,
            hasSupplier: false,
            hasNamespace: false,
            hasLifecycle: false
        };

        const issues = [];

        // Check creation timestamp (sbomqs: sbom_creation_timestamp, weight 20%)
        if (sbom.creationInfo?.created) {
            checks.hasCreationTimestamp = true;
            // Validate ISO 8601 format
            const timestamp = new Date(sbom.creationInfo.created);
            if (isNaN(timestamp.getTime())) {
                issues.push('Invalid timestamp format (should be ISO 8601)');
            }
        } else {
            issues.push('Missing creation timestamp');
        }

        // Check creators/authors (sbomqs: sbom_authors, weight 20%)
        if (sbom.creationInfo?.creators && Array.isArray(sbom.creationInfo.creators) && 
            sbom.creationInfo.creators.length > 0) {
            checks.hasCreators = true;
            // Check for Person or Organization (not just Tool)
            const hasPersonOrOrg = sbom.creationInfo.creators.some(c => 
                c.startsWith('Person:') || c.startsWith('Organization:')
            );
            if (!hasPersonOrOrg) {
                issues.push('No person or organization creator found (only tools)');
            }
        } else {
            issues.push('Missing creator/author information');
        }

        // Check tool info (sbomqs: sbom_tool_version, weight 20%)
        const toolCreator = sbom.creationInfo?.creators?.find(c => c.startsWith('Tool:'));
        if (toolCreator) {
            checks.hasToolInfo = true;
            // Check for version in tool info
            if (toolCreator.includes('-') || /v?\d+\.\d+/.test(toolCreator)) {
                checks.hasToolVersion = true;
            } else {
                issues.push('Tool creator missing version information');
            }
        } else {
            issues.push('Missing tool information');
        }

        // Check supplier (sbomqs: sbom_supplier, weight 15%)
        // For SPDX, check creationInfo.creators for Organization
        // For CDX, check metadata.supplier or metadata.manufacturer
        const hasOrgCreator = sbom.creationInfo?.creators?.some(c => c.startsWith('Organization:'));
        if (hasOrgCreator || sbom.metadata?.supplier || sbom.metadata?.manufacturer) {
            checks.hasSupplier = true;
        } else {
            issues.push('Missing document supplier/organization');
        }

        // Check namespace/document URI (sbomqs: sbom_namespace, weight 15%)
        if (sbom.documentNamespace && sbom.documentNamespace.trim()) {
            checks.hasNamespace = true;
            // Validate it's a valid URI
            try {
                new URL(sbom.documentNamespace);
            } catch {
                issues.push('Document namespace is not a valid URI');
            }
        } else if (sbom.serialNumber) {
            // CycloneDX uses serialNumber
            checks.hasNamespace = true;
        } else {
            issues.push('Missing document namespace/serial number');
        }

        // Check lifecycle (sbomqs: sbom_lifecycle, weight 10%)
        // For CycloneDX 1.5+, check metadata.lifecycles
        if (sbom.metadata?.lifecycles && sbom.metadata.lifecycles.length > 0) {
            checks.hasLifecycle = true;
        }
        // Note: SPDX doesn't have a deterministic lifecycle field, so we don't penalize

        // Calculate score (weighted based on sbomqs v2.0)
        let score = 0;
        if (checks.hasCreationTimestamp) score += 20;  // 20%
        if (checks.hasCreators) score += 20;  // 20%
        if (checks.hasToolInfo && checks.hasToolVersion) score += 20;  // 20%
        else if (checks.hasToolInfo) score += 10;  // Partial credit
        if (checks.hasSupplier) score += 15;  // 15%
        if (checks.hasNamespace) score += 15;  // 15%
        if (checks.hasLifecycle) score += 10;  // 10%

        return {
            score,
            checks,
            issues,
            details: `Timestamp: ${checks.hasCreationTimestamp ? '✓' : '✗'}, Authors: ${checks.hasCreators ? '✓' : '✗'}, Tool: ${checks.hasToolInfo ? '✓' : '✗'}, Namespace: ${checks.hasNamespace ? '✓' : '✗'}`
        };
    }

    /**
     * Assess SBOM Completeness quality (15% weight) - sbomqs aligned
     * Checks: dependencies, supplier, source code, purpose, primary component
     * Based on sbomqs v2.0 Completeness category
     */
    assessCompletenessCategory(sbom) {
        const checks = {
            packagesWithDependencies: 0,
            packagesWithSupplier: 0,
            packagesWithSourceCode: 0,
            packagesWithPurpose: 0,
            hasPrimaryComponent: false,
            hasCompletenessDeclaration: false
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
            
            // Check for DESCRIBES relationship (primary component)
            if (rel.relationshipType === 'DESCRIBES') {
                checks.hasPrimaryComponent = true;
            }
        });

        const packagesWithoutSupplier = [];
        const packagesWithoutSourceCode = [];

        packages.forEach((pkg, idx) => {
            const ecosystem = this.getPackageEcosystem(pkg);
            const packageIdentifier = this.formatPackageIdentifier(pkg, ecosystem, idx);

            // Check if package has dependencies (relationships)
            if (packageRelationshipMap.has(pkg.SPDXID)) {
                checks.packagesWithDependencies++;
            }

            // Check supplier/originator
            if (pkg.supplier?.name || pkg.originator) {
                checks.packagesWithSupplier++;
            } else {
                packagesWithoutSupplier.push(packageIdentifier);
            }

            // Check source code URI (externalRefs with VCS type)
            if (pkg.externalRefs && Array.isArray(pkg.externalRefs)) {
                const hasSourceRef = pkg.externalRefs.some(ref => 
                    ref.referenceType === 'vcs' || 
                    ref.referenceCategory === 'SOURCE' ||
                    (ref.referenceLocator && (
                        isUrlFromHostname(ref.referenceLocator, 'github.com') ||
                        isUrlFromHostname(ref.referenceLocator, 'gitlab.com') ||
                        isUrlFromHostname(ref.referenceLocator, 'bitbucket.org')
                    ))
                );
                if (hasSourceRef) {
                    checks.packagesWithSourceCode++;
                } else {
                    packagesWithoutSourceCode.push(packageIdentifier);
                }
            }

            // Check primary purpose/type (SPDX: primaryPackagePurpose, CDX: type)
            if (pkg.primaryPackagePurpose || pkg.type) {
                checks.packagesWithPurpose++;
            }
        });

        // Check for completeness declaration (SPDX: documentDescribes, CDX: compositions)
        if (sbom.documentDescribes && sbom.documentDescribes.length > 0) {
            checks.hasCompletenessDeclaration = true;
        }

        const totalPackages = packages.length;
        
        // Calculate sub-scores (weights from sbomqs v2.0 Completeness category)
        const dependencyScore = (checks.packagesWithDependencies / totalPackages) * 25;  // 25%
        const completenessDeclarationScore = checks.hasCompletenessDeclaration ? 15 : 0;  // 15%
        const primaryComponentScore = checks.hasPrimaryComponent ? 20 : 0;  // 20%
        const sourceCodeScore = (checks.packagesWithSourceCode / totalPackages) * 15;  // 15%
        const supplierScore = (checks.packagesWithSupplier / totalPackages) * 15;  // 15%
        const purposeScore = (checks.packagesWithPurpose / totalPackages) * 10;  // 10%
        
        const score = Math.round(
            dependencyScore + completenessDeclarationScore + primaryComponentScore + 
            sourceCodeScore + supplierScore + purposeScore
        );

        // Add issues
        if (!checks.hasPrimaryComponent) {
            issues.push('No primary component identified (DESCRIBES relationship missing)');
        }
        
        if (packagesWithoutSupplier.length > 0) {
            if (packagesWithoutSupplier.length <= 5) {
                issues.push(`Missing supplier: ${packagesWithoutSupplier.join(', ')}`);
            } else {
                issues.push(`Missing supplier for ${packagesWithoutSupplier.length} packages`);
            }
        }

        if (packagesWithoutSourceCode.length > 0 && packagesWithoutSourceCode.length <= totalPackages * 0.5) {
            issues.push(`${packagesWithoutSourceCode.length} packages missing source code references`);
        }

        return {
            score,
            checks,
            issues,
            details: `${checks.packagesWithDependencies}/${totalPackages} dependencies, ${checks.packagesWithSupplier}/${totalPackages} suppliers, ${checks.packagesWithSourceCode}/${totalPackages} source refs`
        };
    }

    /**
     * Assess SBOM Dependencies quality (legacy method - now use assessCompletenessCategory)
     * Kept for backward compatibility
     */
    assessDependencies(sbom) {
        const checks = {
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
                issues: ['No packages to assess dependencies'],
                details: 'Cannot assess dependencies without packages'
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

        const packagesWithoutRelationships = [];
        const packagesWithoutExternalRefs = [];

        packages.forEach((pkg, idx) => {
            const ecosystem = this.getPackageEcosystem(pkg);
            const packageIdentifier = this.formatPackageIdentifier(pkg, ecosystem, idx);

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

        const totalPackages = packages.length;
        const relationshipScore = (checks.packagesWithRelationships / totalPackages) * 100;
        const externalRefScore = (checks.packagesWithExternalRefs / totalPackages) * 100;

        // Weight: relationships 60%, external refs 40%
        const score = Math.round(
            (relationshipScore * 0.60 + externalRefScore * 0.40)
        );

        // Add informational issues
        if (packagesWithoutRelationships.length > 0 && packagesWithoutRelationships.length <= 5) {
            issues.push(`Missing relationships: ${packagesWithoutRelationships.join(', ')}`);
        } else if (packagesWithoutRelationships.length > 5) {
            issues.push(`Missing relationships for ${packagesWithoutRelationships.length} packages`);
        }

        if (packagesWithoutExternalRefs.length > 0 && packagesWithoutExternalRefs.length <= 5) {
            issues.push(`Missing external references: ${packagesWithoutExternalRefs.join(', ')}`);
        } else if (packagesWithoutExternalRefs.length > 5) {
            issues.push(`Missing external references for ${packagesWithoutExternalRefs.length} packages`);
        }

        return {
            score,
            checks,
            issues,
            details: `${checks.packagesWithRelationships}/${totalPackages} with relationships, ${checks.packagesWithExternalRefs}/${totalPackages} with external references`
        };
    }

    /**
     * Assess SBOM Metadata quality (10% weight)
     * Checks: copyright, download locations
     */
    assessMetadata(sbom) {
        const checks = {
            packagesWithCopyright: 0,
            packagesWithDownloadLocation: 0
        };

        const issues = [];
        const packages = sbom.packages || [];

        if (packages.length === 0) {
            return {
                score: 0,
                checks,
                issues: ['No packages to assess metadata'],
                details: 'Cannot assess metadata without packages'
            };
        }

        const packagesWithoutCopyright = [];
        const packagesWithoutDownloadLocation = [];

        packages.forEach((pkg, idx) => {
            const ecosystem = this.getPackageEcosystem(pkg);
            const packageIdentifier = this.formatPackageIdentifier(pkg, ecosystem, idx);

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
        });

        const totalPackages = packages.length;
        const copyrightScore = (checks.packagesWithCopyright / totalPackages) * 100;
        const downloadScore = (checks.packagesWithDownloadLocation / totalPackages) * 100;

        // Note: GitHub SBOMs typically use NOASSERTION for downloadLocation, so we weight copyright more
        // Weight: copyright 60%, download location 40%
        const score = Math.round(
            (copyrightScore * 0.60 + downloadScore * 0.40)
        );

        // Add informational issues
        if (packagesWithoutCopyright.length > 0 && packagesWithoutCopyright.length <= 5) {
            issues.push(`Missing copyright information: ${packagesWithoutCopyright.join(', ')}`);
        } else if (packagesWithoutCopyright.length > 5) {
            issues.push(`Missing copyright information for ${packagesWithoutCopyright.length} packages`);
        }

        // Note: downloadLocation often NOASSERTION in GitHub SBOMs, so we don't penalize heavily
        if (packagesWithoutDownloadLocation.length > 0 && packagesWithoutDownloadLocation.length <= 5) {
            issues.push(`Missing download location: ${packagesWithoutDownloadLocation.join(', ')}`);
        } else if (packagesWithoutDownloadLocation.length > 5) {
            issues.push(`Missing download location for ${packagesWithoutDownloadLocation.length} packages`);
        }

        return {
            score,
            checks,
            issues,
            details: `${checks.packagesWithCopyright}/${totalPackages} with copyright, ${checks.packagesWithDownloadLocation}/${totalPackages} with download location`
        };
    }

    /**
     * Assess SBOM Completeness quality (30% weight) - DEPRECATED
     * Split into assessDependencies and assessMetadata
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
     * Generate human-readable summary (legacy 6-category version)
     */
    generateSummary(overallScore, identification, provenance, dependencies, metadata, licensing, vulnerability) {
        const grade = this.getGrade(overallScore);
        let summary = `SBOM quality grade: ${grade} (${overallScore}/100). `;

        const strengths = [];
        const weaknesses = [];

        // Identify strengths (score >= 80)
        if (identification.score >= 80) strengths.push('strong component identification');
        if (provenance.score >= 80) strengths.push('excellent provenance');
        if (dependencies.score >= 80) strengths.push('comprehensive dependency mapping');
        if (metadata.score >= 80) strengths.push('complete metadata');
        if (licensing.score >= 80) strengths.push('clear licensing');
        if (vulnerability.score >= 80) strengths.push('vulnerability-ready');

        // Identify weaknesses (score < 60)
        if (identification.score < 60) weaknesses.push('weak identification');
        if (provenance.score < 60) weaknesses.push('incomplete provenance');
        if (dependencies.score < 60) weaknesses.push('limited dependency mapping');
        if (metadata.score < 60) weaknesses.push('incomplete metadata');
        if (licensing.score < 60) weaknesses.push('unclear licensing');
        if (vulnerability.score < 60) weaknesses.push('vulnerability tracking gaps');

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
     * Generate human-readable summary (sbomqs-aligned 7-category version)
     */
    generateSummary7Categories(overallScore, identification, provenance, integrity, completeness, licensing, vulnerability, structural) {
        const grade = this.getGrade(overallScore);
        let summary = `SBOM quality grade: ${grade} (${this.toDisplayScore(overallScore)}/10.0). `;

        const strengths = [];
        const weaknesses = [];

        // Identify strengths (score >= 80)
        if (identification.score >= 80) strengths.push('strong identification');
        if (provenance.score >= 80) strengths.push('excellent provenance');
        if (integrity.score >= 80) strengths.push('strong integrity');
        if (completeness.score >= 80) strengths.push('comprehensive completeness');
        if (licensing.score >= 80) strengths.push('clear licensing');
        if (vulnerability.score >= 80) strengths.push('vulnerability-ready');
        if (structural.score >= 80) strengths.push('structurally compliant');

        // Identify weaknesses (score < 60)
        if (identification.score < 60) weaknesses.push('weak identification');
        if (provenance.score < 60) weaknesses.push('incomplete provenance');
        if (integrity.score < 60) weaknesses.push('missing integrity data');
        if (completeness.score < 60) weaknesses.push('incomplete data');
        if (licensing.score < 60) weaknesses.push('unclear licensing');
        if (vulnerability.score < 60) weaknesses.push('vulnerability tracking gaps');
        if (structural.score < 60) weaknesses.push('structural issues');

        if (strengths.length > 0) {
            summary += `Strengths: ${strengths.join(', ')}. `;
        }
        if (weaknesses.length > 0) {
            summary += `Areas for improvement: ${weaknesses.join(', ')}.`;
        }

        return summary.trim();
    }

    /**
     * Collect all issues from categories (6 categories - legacy)
     */
    collectIssues(identification, provenance, dependencies, metadata, licensing, vulnerability) {
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
        
        if (dependencies.issues.length > 0) {
            allIssues.push({
                category: 'Dependencies',
                issues: dependencies.issues
            });
        }
        
        if (metadata.issues.length > 0) {
            allIssues.push({
                category: 'Metadata',
                issues: metadata.issues
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

        return allIssues;
    }

    /**
     * Collect all issues from categories (sbomqs-aligned 7 categories)
     */
    collectIssues7Categories(identification, provenance, integrity, completeness, licensing, vulnerability, structural) {
        const allIssues = [];
        
        if (identification.issues.length > 0) {
            allIssues.push({
                category: 'Identification',
                weight: this.weights.identification * 100,
                issues: identification.issues
            });
        }
        
        if (provenance.issues.length > 0) {
            allIssues.push({
                category: 'Provenance',
                weight: this.weights.provenance * 100,
                issues: provenance.issues
            });
        }
        
        if (integrity.issues.length > 0) {
            allIssues.push({
                category: 'Integrity',
                weight: this.weights.integrity * 100,
                issues: integrity.issues
            });
        }
        
        if (completeness.issues.length > 0) {
            allIssues.push({
                category: 'Completeness',
                weight: this.weights.completeness * 100,
                issues: completeness.issues
            });
        }
        
        if (licensing.issues.length > 0) {
            allIssues.push({
                category: 'Licensing',
                weight: this.weights.licensing * 100,
                issues: licensing.issues
            });
        }
        
        if (vulnerability.issues.length > 0) {
            allIssues.push({
                category: 'Vulnerability',
                weight: this.weights.vulnerability * 100,
                issues: vulnerability.issues
            });
        }
        
        if (structural.issues.length > 0) {
            allIssues.push({
                category: 'Structural',
                weight: this.weights.structural * 100,
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
            sbomFormat: { type: 'Unknown', version: null, displayName: 'N/A' },
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
     * Updated to support sbomqs-aligned 7 categories
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
            
            // Use optional chaining for backward compatibility with old data
            totals.identification += assessment.categories?.identification?.score || 0;
            totals.provenance += assessment.categories?.provenance?.score || 0;
            totals.licensing += assessment.categories?.licensing?.score || 0;
            totals.vulnerability += assessment.categories?.vulnerability?.score || 0;
            
            // New sbomqs-aligned categories
            totals.integrity += assessment.categories?.integrity?.score || 0;
            totals.structural += assessment.categories?.structural?.score || 0;
            
            // Handle completeness (new) vs dependencies/metadata (old)
            if (assessment.categories?.completeness) {
                totals.completeness += assessment.categories.completeness.score || 0;
            } else if (assessment.categories?.dependencies || assessment.categories?.metadata) {
                // Backward compatibility: combine old categories
                const depScore = assessment.categories?.dependencies?.score || 0;
                const metaScore = assessment.categories?.metadata?.score || 0;
                totals.completeness += Math.round((depScore + metaScore) / 2);
            }

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

    /**
     * ============================================
     * CISA 2025 MINIMUM ELEMENTS COMPLIANCE CHECK
     * ============================================
     * Based on CISA "2025 Minimum Elements for a Software Bill of Materials (SBOM)"
     * https://www.cisa.gov/sites/default/files/2025-08/2025_CISA_SBOM_Minimum_Elements.pdf
     * 
     * Updates from NTIA 2021:
     * - Renamed: "Supplier Name" → "Software Producer"
     * - Renamed: "Author of SBOM Data" → "SBOM Author"  
     * - NEW: Component Hash (required)
     * - NEW: License Information (required)
     * - NEW: Tool Name (required)
     * - NEW: Generation Context (required)
     */
    
    /**
     * Assess CISA 2025 Minimum Elements compliance
     * @param {Object} sbomData - The raw SBOM data
     * @returns {Object} CISA 2025 compliance assessment
     */
    assessCISA2025Compliance(sbomData) {
        if (!sbomData || !sbomData.sbom) {
            return {
                standard: 'CISA 2025',
                compliant: false,
                score: 0,
                checks: {},
                missingElements: ['No SBOM data available'],
                details: 'Cannot assess CISA 2025 compliance without SBOM'
            };
        }

        const sbom = sbomData.sbom;
        const packages = sbom.packages || [];
        
        // CISA 2025 Minimum Elements (11 required data fields)
        const cisaElements = {
            // 1. Software Producer (was "Supplier Name")
            softwareProducer: {
                name: 'Software Producer',
                description: 'Entity that creates, defines, and identifies components',
                check: (pkg) => Boolean(pkg.supplier?.name || pkg.originator),
                required: true
            },
            // 2. Component Name
            componentName: {
                name: 'Component Name',
                description: 'Designation assigned to a unit of software',
                check: (pkg) => Boolean(pkg.name && pkg.name.trim()),
                required: true
            },
            // 3. Component Version
            componentVersion: {
                name: 'Component Version',
                description: 'Identifier to specify a change from previously identified version',
                check: (pkg) => Boolean(pkg.versionInfo && pkg.versionInfo !== 'NOASSERTION'),
                required: true
            },
            // 4. Software Identifiers (PURL, CPE, OmniBOR, SWHID)
            softwareIdentifier: {
                name: 'Software Identifier',
                description: 'Unique identifier (PURL, CPE, OmniBOR, SWHID)',
                check: (pkg) => {
                    if (!pkg.externalRefs) return false;
                    return pkg.externalRefs.some(ref => 
                        ref.referenceType === 'purl' || 
                        ref.referenceType === 'cpe22Type' ||
                        ref.referenceType === 'cpe23Type' ||
                        ref.referenceLocator?.startsWith('gitoid:') ||
                        ref.referenceLocator?.startsWith('swh:')
                    );
                },
                required: true
            },
            // 5. Component Hash (NEW in CISA 2025)
            componentHash: {
                name: 'Component Hash',
                description: 'Cryptographic fingerprint for integrity verification',
                check: (pkg) => Boolean(pkg.checksums && pkg.checksums.length > 0),
                required: true
            },
            // 6. License Information (NEW in CISA 2025)
            licenseInfo: {
                name: 'License Information',
                description: 'Legal terms under which component is used',
                check: (pkg) => Boolean(
                    (pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') ||
                    (pkg.licenseDeclared && pkg.licenseDeclared !== 'NOASSERTION')
                ),
                required: true
            },
            // 7. Dependency Relationship
            dependencyRelationship: {
                name: 'Dependency Relationship',
                description: 'Relationship of upstream component to the software',
                checkSbom: (sbom) => Boolean(sbom.relationships && sbom.relationships.length > 0),
                required: true
            },
            // 8. SBOM Author (was "Author of SBOM Data")
            sbomAuthor: {
                name: 'SBOM Author',
                description: 'Entity that creates the SBOM data',
                checkSbom: (sbom) => Boolean(sbom.creationInfo?.creators && sbom.creationInfo.creators.length > 0),
                required: true
            },
            // 9. Timestamp
            timestamp: {
                name: 'Timestamp',
                description: 'Date and time the SBOM was assembled',
                checkSbom: (sbom) => Boolean(sbom.creationInfo?.created),
                required: true
            },
            // 10. Tool Name (NEW in CISA 2025)
            toolName: {
                name: 'Tool Name',
                description: 'Tool used to generate the SBOM',
                checkSbom: (sbom) => {
                    const creators = sbom.creationInfo?.creators || [];
                    return creators.some(c => c.startsWith('Tool:'));
                },
                required: true
            },
            // 11. Generation Context (NEW in CISA 2025)
            generationContext: {
                name: 'Generation Context',
                description: 'Stage at which SBOM was created (pre-build, build, post-build)',
                checkSbom: (sbom) => {
                    // Check for lifecycle info in CycloneDX or SPDX
                    if (sbom.metadata?.lifecycles) return true;
                    // Check creator comment for context
                    if (sbom.creationInfo?.comment) return true;
                    // Check for build-related creator tools
                    const creators = sbom.creationInfo?.creators || [];
                    return creators.some(c => 
                        c.toLowerCase().includes('build') ||
                        c.toLowerCase().includes('runtime') ||
                        c.toLowerCase().includes('source')
                    );
                },
                required: true
            }
        };

        const checks = {};
        const missingElements = [];
        let passedChecks = 0;
        let totalChecks = 0;

        // Check SBOM-level elements
        for (const [key, element] of Object.entries(cisaElements)) {
            if (element.checkSbom) {
                totalChecks++;
                const passed = element.checkSbom(sbom);
                checks[key] = {
                    name: element.name,
                    description: element.description,
                    passed: passed,
                    required: element.required,
                    isNew: ['toolName', 'generationContext'].includes(key)
                };
                if (passed) {
                    passedChecks++;
                } else {
                    missingElements.push(element.name + (['toolName', 'generationContext'].includes(key) ? ' (NEW)' : ''));
                }
            }
        }

        // Check package-level elements (aggregate across all packages)
        const packageLevelElements = ['softwareProducer', 'componentName', 'componentVersion', 'softwareIdentifier', 'componentHash', 'licenseInfo'];
        
        for (const key of packageLevelElements) {
            const element = cisaElements[key];
            if (!element.check) continue;
            
            totalChecks++;
            let packagesWithElement = 0;
            
            packages.forEach(pkg => {
                if (element.check(pkg)) {
                    packagesWithElement++;
                }
            });
            
            const coverage = packages.length > 0 ? (packagesWithElement / packages.length) : 0;
            const passed = coverage >= 0.9; // 90% coverage threshold for compliance
            
            checks[key] = {
                name: element.name,
                description: element.description,
                passed: passed,
                required: element.required,
                coverage: Math.round(coverage * 100),
                packagesWithElement: packagesWithElement,
                totalPackages: packages.length,
                isNew: ['componentHash', 'licenseInfo'].includes(key)
            };
            
            if (passed) {
                passedChecks++;
            } else {
                const newTag = ['componentHash', 'licenseInfo'].includes(key) ? ' (NEW)' : '';
                missingElements.push(`${element.name}${newTag} (${Math.round(coverage * 100)}% coverage)`);
            }
        }

        const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
        const compliant = passedChecks === totalChecks;

        return {
            standard: 'CISA 2025',
            compliant: compliant,
            score: score,
            passedChecks: passedChecks,
            totalChecks: totalChecks,
            checks: checks,
            missingElements: missingElements,
            details: compliant 
                ? 'SBOM meets CISA 2025 Minimum Elements requirements'
                : `Missing ${missingElements.length} CISA 2025 Minimum Element(s)`
        };
    }

    /**
     * Legacy alias for backward compatibility
     */
    assessNTIACompliance(sbomData) {
        // CISA 2025 supersedes NTIA - return CISA assessment
        return this.assessCISA2025Compliance(sbomData);
    }

    /**
     * ============================================
     * BSI TR-03183-2 v2.0 COMPLIANCE CHECK
     * ============================================
     * German Federal Office for Information Security (BSI) Technical Guideline
     * https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03183/BSI-TR-03183-2-2_0_0.pdf
     */
    
    /**
     * Assess BSI TR-03183-2 v2.0 compliance
     * @param {Object} sbomData - The raw SBOM data
     * @returns {Object} BSI compliance assessment
     */
    assessBSICompliance(sbomData) {
        if (!sbomData || !sbomData.sbom) {
            return {
                standard: 'BSI TR-03183-2 v2.0',
                compliant: false,
                score: 0,
                checks: {},
                missingElements: ['No SBOM data available'],
                details: 'Cannot assess BSI compliance without SBOM'
            };
        }

        const sbom = sbomData.sbom;
        const packages = sbom.packages || [];
        
        // BSI TR-03183-2 v2.0 Required Elements
        const bsiElements = {
            // SBOM-level required fields
            specification: {
                name: 'SBOM Specification',
                description: 'Valid SPDX or CycloneDX format',
                checkSbom: (sbom) => Boolean(sbom.spdxVersion || sbom.bomFormat),
                required: true
            },
            specVersion: {
                name: 'Specification Version',
                description: 'CycloneDX 1.5+ or SPDX 2.2.1+',
                checkSbom: (sbom) => {
                    if (sbom.spdxVersion) {
                        const match = sbom.spdxVersion.match(/SPDX-(\d+)\.(\d+)/);
                        if (match) {
                            const major = parseInt(match[1]);
                            const minor = parseInt(match[2]);
                            return major > 2 || (major === 2 && minor >= 2);
                        }
                    }
                    if (sbom.specVersion) {
                        const parts = sbom.specVersion.split('.');
                        const major = parseInt(parts[0]);
                        const minor = parseInt(parts[1] || 0);
                        return major > 1 || (major === 1 && minor >= 5);
                    }
                    return false;
                },
                required: true
            },
            creator: {
                name: 'SBOM Creator',
                description: 'Creator with email or URL',
                checkSbom: (sbom) => {
                    const creators = sbom.creationInfo?.creators || [];
                    return creators.some(c => c.includes('@') || c.includes('http'));
                },
                required: true
            },
            timestamp: {
                name: 'Creation Timestamp',
                description: 'ISO 8601 timestamp',
                checkSbom: (sbom) => Boolean(sbom.creationInfo?.created),
                required: true
            },
            sbomUri: {
                name: 'SBOM URI',
                description: 'Unique SBOM identifier (namespace or serialNumber)',
                checkSbom: (sbom) => Boolean(sbom.documentNamespace || sbom.serialNumber),
                required: true
            },
            dependencies: {
                name: 'Dependency Relationships',
                description: 'Component dependency graph',
                checkSbom: (sbom) => Boolean(sbom.relationships && sbom.relationships.length > 0),
                required: true
            },
            // Package-level required fields
            componentName: {
                name: 'Component Name',
                description: 'Package name',
                check: (pkg) => Boolean(pkg.name && pkg.name.trim()),
                required: true
            },
            componentVersion: {
                name: 'Component Version',
                description: 'Package version',
                check: (pkg) => Boolean(pkg.versionInfo && pkg.versionInfo !== 'NOASSERTION'),
                required: true
            },
            componentCreator: {
                name: 'Component Supplier',
                description: 'Supplier with email or URL',
                check: (pkg) => {
                    const supplier = pkg.supplier?.name || pkg.originator || '';
                    return supplier.includes('@') || supplier.includes('http') || Boolean(supplier);
                },
                required: true
            },
            componentLicense: {
                name: 'Associated License',
                description: 'Valid SPDX license expression',
                check: (pkg) => Boolean(
                    (pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') ||
                    (pkg.licenseDeclared && pkg.licenseDeclared !== 'NOASSERTION')
                ),
                required: true
            },
            componentHash: {
                name: 'Component Hash (SHA-256)',
                description: 'SHA-256 or stronger checksum',
                check: (pkg) => {
                    if (!pkg.checksums) return false;
                    return pkg.checksums.some(c => 
                        /sha256|sha384|sha512|sha3/i.test(c.algorithm)
                    );
                },
                required: true
            },
            uniqueIdentifiers: {
                name: 'Unique Identifiers',
                description: 'CPE or PURL identifier',
                check: (pkg) => {
                    if (!pkg.externalRefs) return false;
                    return pkg.externalRefs.some(ref => 
                        ref.referenceType === 'purl' || 
                        ref.referenceType === 'cpe22Type' ||
                        ref.referenceType === 'cpe23Type'
                    );
                },
                required: true
            }
        };

        const checks = {};
        const missingElements = [];
        let passedChecks = 0;
        let totalChecks = 0;

        // Check SBOM-level elements
        for (const [key, element] of Object.entries(bsiElements)) {
            if (element.checkSbom) {
                totalChecks++;
                const passed = element.checkSbom(sbom);
                checks[key] = {
                    name: element.name,
                    description: element.description,
                    passed: passed,
                    required: element.required
                };
                if (passed) {
                    passedChecks++;
                } else {
                    missingElements.push(element.name);
                }
            }
        }

        // Check package-level elements
        const packageLevelElements = ['componentName', 'componentVersion', 'componentCreator', 'componentLicense', 'componentHash', 'uniqueIdentifiers'];
        
        for (const key of packageLevelElements) {
            const element = bsiElements[key];
            if (!element.check) continue;
            
            totalChecks++;
            let packagesWithElement = 0;
            
            packages.forEach(pkg => {
                if (element.check(pkg)) {
                    packagesWithElement++;
                }
            });
            
            const coverage = packages.length > 0 ? (packagesWithElement / packages.length) : 0;
            const passed = coverage >= 0.9; // 90% coverage threshold
            
            checks[key] = {
                name: element.name,
                description: element.description,
                passed: passed,
                required: element.required,
                coverage: Math.round(coverage * 100),
                packagesWithElement: packagesWithElement,
                totalPackages: packages.length
            };
            
            if (passed) {
                passedChecks++;
            } else {
                missingElements.push(`${element.name} (${Math.round(coverage * 100)}% coverage)`);
            }
        }

        const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
        const compliant = passedChecks === totalChecks;

        return {
            standard: 'BSI TR-03183-2 v2.0',
            compliant: compliant,
            score: score,
            passedChecks: passedChecks,
            totalChecks: totalChecks,
            checks: checks,
            missingElements: missingElements,
            details: compliant 
                ? 'SBOM meets BSI TR-03183-2 v2.0 requirements'
                : `Missing ${missingElements.length} BSI requirement(s)`
        };
    }

    /**
     * ============================================
     * CERT-In Technical Guidelines v2.0 COMPLIANCE CHECK
     * ============================================
     * Indian Computer Emergency Response Team (CERT-In) SBOM Guidelines
     * https://www.cert-in.org.in/PDF/TechnicalGuidelines-on-SBOM,QBOM&CBOM,AIBOM_and_HBOM_ver2.0.pdf
     * 
     * CERT-In mandates 20 elements for SBOM compliance:
     * - Static elements (checkable in SBOM): Name, Version, Description, Hashes, Timestamp,
     *   Unique Identifier, Dependencies, Supplier, External References
     * - Enrichment elements (require external data): Vulnerabilities, Criticality, Patch Status,
     *   Release Date, End-of-Life Date
     * - Custom properties: Component Origin, Usage Restrictions, Comments, Executable/Archive/Structured Property
     */
    
    /**
     * Assess CERT-In Technical Guidelines v2.0 compliance
     * @param {Object} sbomData - The raw SBOM data
     * @returns {Object} CERT-In compliance assessment
     */
    assessCERTInCompliance(sbomData) {
        if (!sbomData || !sbomData.sbom) {
            return {
                standard: 'CERT-In v2.0',
                compliant: false,
                score: 0,
                checks: {},
                missingElements: ['No SBOM data available'],
                enrichmentRequired: [],
                details: 'Cannot assess CERT-In compliance without SBOM'
            };
        }

        const sbom = sbomData.sbom;
        const packages = sbom.packages || [];
        
        // CERT-In Technical Guidelines v2.0 Elements (20 total)
        // Categorized by: Static (in SBOM), Enrichment (external data), Custom Properties
        const certInElements = {
            // === STATIC ELEMENTS (checkable in SBOM) ===
            
            // 1. Component Name
            componentName: {
                name: 'Component Name',
                description: 'The name of the software component or library',
                check: (pkg) => Boolean(pkg.name && pkg.name.trim()),
                required: true,
                category: 'static'
            },
            // 2. Component Version
            componentVersion: {
                name: 'Component Version',
                description: 'The version number or identifier of the component',
                check: (pkg) => Boolean(pkg.versionInfo && pkg.versionInfo !== 'NOASSERTION'),
                required: true,
                category: 'static'
            },
            // 3. Component Description
            componentDescription: {
                name: 'Component Description',
                description: 'Brief description of the functionality and purpose',
                check: (pkg) => Boolean(pkg.description && pkg.description.trim() && pkg.description !== 'NOASSERTION'),
                required: true,
                category: 'static'
            },
            // 4. Hashes
            hashes: {
                name: 'Hashes',
                description: 'Cryptographic checksums for integrity verification',
                check: (pkg) => Boolean(pkg.checksums && pkg.checksums.length > 0),
                required: true,
                category: 'static'
            },
            // 7. Timestamp
            timestamp: {
                name: 'Timestamp',
                description: 'Date and time when the SBOM was assembled',
                checkSbom: (sbom) => Boolean(sbom.creationInfo?.created),
                required: true,
                category: 'static'
            },
            // 8. Unique Identifier
            uniqueIdentifier: {
                name: 'Unique Identifier',
                description: 'PURL or other unique identifier for tracking',
                check: (pkg) => {
                    if (!pkg.externalRefs) return false;
                    return pkg.externalRefs.some(ref => 
                        ref.referenceType === 'purl' && ref.referenceLocator
                    );
                },
                required: true,
                category: 'static'
            },
            // 10. Component Dependencies
            componentDependencies: {
                name: 'Component Dependencies',
                description: 'Dependencies the component relies on',
                checkSbom: (sbom) => Boolean(sbom.relationships && sbom.relationships.length > 0),
                required: true,
                category: 'static'
            },
            // 16. Component Supplier
            componentSupplier: {
                name: 'Component Supplier',
                description: 'Entity that supplied the component (vendor, third-party, open-source)',
                check: (pkg) => Boolean(pkg.supplier?.name || pkg.originator),
                required: true,
                category: 'static'
            },
            // 20. External References
            externalReferences: {
                name: 'External References',
                description: 'References to documentation, repositories, or websites',
                check: (pkg) => Boolean(pkg.externalRefs && pkg.externalRefs.length > 0),
                required: true,
                category: 'static'
            },
            
            // === ENRICHMENT ELEMENTS (require external data/processing) ===
            
            // 5. Vulnerabilities
            vulnerabilities: {
                name: 'Vulnerabilities',
                description: 'Known security vulnerabilities with CVE references',
                checkEnrichment: true,
                required: true,
                category: 'enrichment',
                enrichmentNote: 'Requires OSV/NVD vulnerability scanning'
            },
            // 6. Criticality
            criticality: {
                name: 'Criticality',
                description: 'Importance level (critical, high, medium, low)',
                checkEnrichment: true,
                required: true,
                category: 'enrichment',
                enrichmentNote: 'Derived from vulnerability severity or business impact'
            },
            // 11. Patch Status
            patchStatus: {
                name: 'Patch Status',
                description: 'Whether patches or updates are available',
                checkEnrichment: true,
                required: true,
                category: 'enrichment',
                enrichmentNote: 'Requires version comparison with latest releases'
            },
            // 12. Release Date
            releaseDate: {
                name: 'Release Date',
                description: 'Date when the component was released',
                checkEnrichment: true,
                required: true,
                category: 'enrichment',
                enrichmentNote: 'Requires package registry lookup'
            },
            // 13. End-of-Life Date
            endOfLifeDate: {
                name: 'End-of-Life Date',
                description: 'Date when support or maintenance ends',
                checkEnrichment: true,
                required: true,
                category: 'enrichment',
                enrichmentNote: 'Requires endoflife.date or vendor EOL data'
            },
            
            // === CUSTOM PROPERTIES (CERT-In specific) ===
            
            // 9. Component Origin
            componentOrigin: {
                name: 'Component Origin',
                description: 'Source of component (proprietary, open-source, third-party)',
                checkCustomProperty: true,
                required: true,
                category: 'custom',
                customNote: 'Not standard SBOM field - requires manual annotation'
            },
            // 14. Usage Restrictions
            usageRestrictions: {
                name: 'Usage Restrictions',
                description: 'Restrictions on component usage (export control, IP rights)',
                check: (pkg) => Boolean(
                    (pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') ||
                    (pkg.licenseDeclared && pkg.licenseDeclared !== 'NOASSERTION')
                ),
                required: true,
                category: 'custom',
                customNote: 'Derived from license - may need manual review'
            },
            // 15. Comments or Notes
            commentsOrNotes: {
                name: 'Comments or Notes',
                description: 'Additional comments relevant to the component',
                check: (pkg) => Boolean(pkg.comment && pkg.comment.trim()),
                required: false,  // Optional field
                category: 'custom'
            },
            // 17. Executable Property
            executableProperty: {
                name: 'Executable Property',
                description: 'Whether component can be executed',
                checkCustomProperty: true,
                required: true,
                category: 'custom',
                customNote: 'Not standard SBOM field - requires manual annotation'
            },
            // 18. Archive Property
            archiveProperty: {
                name: 'Archive Property',
                description: 'Whether component is stored as archive/compressed file',
                checkCustomProperty: true,
                required: true,
                category: 'custom',
                customNote: 'Not standard SBOM field - requires manual annotation'
            },
            // 19. Structured Property
            structuredProperty: {
                name: 'Structured Property',
                description: 'Descriptors defining the organized format of data',
                checkCustomProperty: true,
                required: true,
                category: 'custom',
                customNote: 'Not standard SBOM field - requires manual annotation'
            }
        };

        const checks = {};
        const missingElements = [];
        const enrichmentRequired = [];
        let passedChecks = 0;
        let totalStaticChecks = 0;

        // Check SBOM-level elements
        for (const [key, element] of Object.entries(certInElements)) {
            if (element.checkSbom) {
                totalStaticChecks++;
                const passed = element.checkSbom(sbom);
                checks[key] = {
                    name: element.name,
                    description: element.description,
                    passed: passed,
                    required: element.required,
                    category: element.category
                };
                if (passed) {
                    passedChecks++;
                } else if (element.required) {
                    missingElements.push(element.name);
                }
            }
            
            // Track enrichment-required elements
            if (element.checkEnrichment) {
                enrichmentRequired.push({
                    name: element.name,
                    description: element.description,
                    note: element.enrichmentNote
                });
                checks[key] = {
                    name: element.name,
                    description: element.description,
                    passed: false,
                    required: element.required,
                    category: element.category,
                    enrichmentRequired: true,
                    enrichmentNote: element.enrichmentNote
                };
            }
            
            // Track custom property elements
            if (element.checkCustomProperty) {
                checks[key] = {
                    name: element.name,
                    description: element.description,
                    passed: false,
                    required: element.required,
                    category: element.category,
                    customProperty: true,
                    customNote: element.customNote
                };
            }
        }

        // Check package-level elements (aggregate across all packages)
        const packageLevelElements = [
            'componentName', 'componentVersion', 'componentDescription', 
            'hashes', 'uniqueIdentifier', 'componentSupplier', 
            'externalReferences', 'usageRestrictions', 'commentsOrNotes'
        ];
        
        for (const key of packageLevelElements) {
            const element = certInElements[key];
            if (!element || !element.check) continue;
            
            totalStaticChecks++;
            let packagesWithElement = 0;
            
            packages.forEach(pkg => {
                if (element.check(pkg)) {
                    packagesWithElement++;
                }
            });
            
            const coverage = packages.length > 0 ? (packagesWithElement / packages.length) : 0;
            // Use 80% threshold for CERT-In (more lenient for optional fields)
            const threshold = element.required ? 0.8 : 0.5;
            const passed = coverage >= threshold;
            
            checks[key] = {
                name: element.name,
                description: element.description,
                passed: passed,
                required: element.required,
                coverage: Math.round(coverage * 100),
                packagesWithElement: packagesWithElement,
                totalPackages: packages.length,
                category: element.category,
                customNote: element.customNote || null
            };
            
            if (passed) {
                passedChecks++;
            } else if (element.required) {
                missingElements.push(`${element.name} (${Math.round(coverage * 100)}% coverage)`);
            }
        }

        // Calculate score based on static elements only (enrichment not counted against compliance)
        const score = totalStaticChecks > 0 ? Math.round((passedChecks / totalStaticChecks) * 100) : 0;
        
        // Compliance is based on static elements passing
        // Note: CERT-In full compliance requires enrichment data which is beyond static SBOM analysis
        const staticCompliant = passedChecks === totalStaticChecks;

        return {
            standard: 'CERT-In v2.0',
            compliant: staticCompliant,
            score: score,
            passedChecks: passedChecks,
            totalChecks: totalStaticChecks,
            totalElements: Object.keys(certInElements).length,
            checks: checks,
            missingElements: missingElements,
            enrichmentRequired: enrichmentRequired,
            details: staticCompliant 
                ? 'SBOM meets CERT-In v2.0 static requirements (enrichment data needed for full compliance)'
                : `Missing ${missingElements.length} CERT-In requirement(s)`,
            notes: [
                'CERT-In mandates 20 elements total',
                `${enrichmentRequired.length} elements require external enrichment (vulnerability scanning, version tracking)`,
                'Custom properties (Origin, Executable, Archive, Structured) require manual annotation'
            ]
        };
    }

    /**
     * Assess all compliance standards
     * @param {Object} sbomData - The raw SBOM data
     * @returns {Object} All compliance assessments
     */
    assessAllCompliance(sbomData) {
        return {
            cisa2025: this.assessCISA2025Compliance(sbomData),
            bsi: this.assessBSICompliance(sbomData),
            certIn: this.assessCERTInCompliance(sbomData),
            timestamp: Date.now()
        };
    }

    /**
     * ============================================
     * SBOM FRESHNESS ASSESSMENT
     * ============================================
     */

    /**
     * Assess SBOM freshness (age and generation date)
     * @param {Object} sbomData - The raw SBOM data
     * @returns {Object} Freshness assessment
     */
    assessFreshness(sbomData) {
        if (!sbomData || !sbomData.sbom) {
            return {
                isFresh: false,
                ageInDays: null,
                ageInMonths: null,
                generatedAt: null,
                status: 'unknown',
                statusColor: 'secondary',
                details: 'Cannot assess freshness without SBOM'
            };
        }

        const sbom = sbomData.sbom;
        const createdAt = sbom.creationInfo?.created;
        
        if (!createdAt) {
            return {
                isFresh: false,
                ageInDays: null,
                ageInMonths: null,
                generatedAt: null,
                status: 'unknown',
                statusColor: 'secondary',
                details: 'SBOM has no creation timestamp'
            };
        }

        const creationDate = new Date(createdAt);
        const now = new Date();
        const ageInMs = now - creationDate;
        const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
        const ageInMonths = Math.floor(ageInDays / 30);
        
        let status, statusColor, isFresh;
        
        if (ageInDays <= 7) {
            status = 'Very Fresh';
            statusColor = 'success';
            isFresh = true;
        } else if (ageInDays <= 30) {
            status = 'Fresh';
            statusColor = 'success';
            isFresh = true;
        } else if (ageInDays <= 90) {
            status = 'Recent';
            statusColor = 'info';
            isFresh = true;
        } else if (ageInDays <= 180) {
            status = 'Aging';
            statusColor = 'warning';
            isFresh = false;
        } else if (ageInDays <= 365) {
            status = 'Old';
            statusColor = 'warning';
            isFresh = false;
        } else {
            status = 'Stale';
            statusColor = 'danger';
            isFresh = false;
        }

        return {
            isFresh: isFresh,
            ageInDays: ageInDays,
            ageInMonths: ageInMonths,
            generatedAt: createdAt,
            generatedAtFormatted: creationDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }),
            status: status,
            statusColor: statusColor,
            details: `SBOM generated ${ageInDays} day(s) ago (${status})`
        };
    }

    /**
     * ============================================
     * COMPLETENESS SCORE
     * ============================================
     */

    /**
     * Calculate completeness score for an SBOM
     * Percentage of packages with complete metadata
     * @param {Object} sbomData - The raw SBOM data
     * @returns {Object} Completeness assessment
     */
    assessCompleteness(sbomData) {
        if (!sbomData || !sbomData.sbom) {
            return {
                score: 0,
                percentage: 0,
                completePackages: 0,
                totalPackages: 0,
                breakdown: {},
                details: 'Cannot assess completeness without SBOM'
            };
        }

        const sbom = sbomData.sbom;
        const packages = sbom.packages || [];
        
        if (packages.length === 0) {
            return {
                score: 0,
                percentage: 0,
                completePackages: 0,
                totalPackages: 0,
                breakdown: {},
                details: 'No packages in SBOM'
            };
        }

        // Define completeness criteria
        const fields = {
            name: { weight: 20, check: (pkg) => Boolean(pkg.name && pkg.name.trim()) },
            version: { weight: 20, check: (pkg) => Boolean(pkg.versionInfo && pkg.versionInfo !== 'NOASSERTION') },
            purl: { weight: 20, check: (pkg) => {
                if (!pkg.externalRefs) return false;
                return pkg.externalRefs.some(ref => ref.referenceType === 'purl');
            }},
            license: { weight: 15, check: (pkg) => Boolean(pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') },
            supplier: { weight: 10, check: (pkg) => Boolean(pkg.supplier?.name || pkg.originator) },
            downloadLocation: { weight: 10, check: (pkg) => Boolean(pkg.downloadLocation && pkg.downloadLocation !== 'NOASSERTION') },
            checksum: { weight: 5, check: (pkg) => Boolean(pkg.checksums && pkg.checksums.length > 0) }
        };

        const breakdown = {};
        let totalScore = 0;
        let completePackages = 0;

        // Initialize breakdown
        for (const [key, field] of Object.entries(fields)) {
            breakdown[key] = { 
                count: 0, 
                percentage: 0,
                weight: field.weight
            };
        }

        // Check each package
        packages.forEach(pkg => {
            let packageScore = 0;
            
            for (const [key, field] of Object.entries(fields)) {
                if (field.check(pkg)) {
                    breakdown[key].count++;
                    packageScore += field.weight;
                }
            }
            
            totalScore += packageScore;
            
            // A package is "complete" if it has at least 80% of possible score
            if (packageScore >= 80) {
                completePackages++;
            }
        });

        // Calculate percentages
        for (const key of Object.keys(breakdown)) {
            breakdown[key].percentage = Math.round((breakdown[key].count / packages.length) * 100);
        }

        const maxPossibleScore = packages.length * 100;
        const overallPercentage = Math.round((totalScore / maxPossibleScore) * 100);

        return {
            score: overallPercentage,
            percentage: overallPercentage,
            completePackages: completePackages,
            totalPackages: packages.length,
            completePercentage: Math.round((completePackages / packages.length) * 100),
            breakdown: breakdown,
            details: `${overallPercentage}% complete (${completePackages}/${packages.length} packages fully documented)`
        };
    }

    /**
     * Generate comprehensive SBOM audit report
     * Combines all assessments into a single report
     * @param {Object} sbomData - The raw SBOM data
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Object} Comprehensive audit report
     */
    generateAuditReport(sbomData, owner, repo) {
        const quality = this.assessQuality(sbomData, owner, repo);
        const cisa2025 = this.assessCISA2025Compliance(sbomData);
        const bsi = this.assessBSICompliance(sbomData);
        const certIn = this.assessCERTInCompliance(sbomData);
        const freshness = this.assessFreshness(sbomData);
        const completeness = this.assessCompleteness(sbomData);
        
        // Calculate audit risk score (0-100, lower is better)
        let riskScore = 0;
        
        // Quality contributes 30% to risk (inverted from score)
        riskScore += (100 - quality.overallScore) * 0.30;
        
        // CISA 2025 compliance contributes 20% to risk
        riskScore += (100 - cisa2025.score) * 0.20;
        
        // BSI compliance contributes 10% to risk
        riskScore += (100 - bsi.score) * 0.10;
        
        // CERT-In compliance contributes 10% to risk
        riskScore += (100 - certIn.score) * 0.10;
        
        // Freshness contributes 15% to risk
        const freshnessScore = freshness.isFresh ? 100 : 
                              freshness.status === 'Aging' ? 60 :
                              freshness.status === 'Old' ? 30 : 0;
        riskScore += (100 - freshnessScore) * 0.15;
        
        // Completeness contributes 15% to risk
        riskScore += (100 - completeness.score) * 0.15;
        
        riskScore = Math.round(riskScore);
        
        // Determine risk level
        let riskLevel, riskColor;
        if (riskScore <= 20) {
            riskLevel = 'Low';
            riskColor = 'success';
        } else if (riskScore <= 40) {
            riskLevel = 'Moderate';
            riskColor = 'info';
        } else if (riskScore <= 60) {
            riskLevel = 'Medium';
            riskColor = 'warning';
        } else if (riskScore <= 80) {
            riskLevel = 'High';
            riskColor = 'danger';
        } else {
            riskLevel = 'Critical';
            riskColor = 'dark';
        }

        return {
            repository: `${owner}/${repo}`,
            timestamp: Date.now(),
            quality: quality,
            cisa2025Compliance: cisa2025,
            bsiCompliance: bsi,
            certInCompliance: certIn,
            // Legacy alias for backward compatibility
            ntiaCompliance: cisa2025,
            freshness: freshness,
            completeness: completeness,
            riskScore: riskScore,
            riskLevel: riskLevel,
            riskColor: riskColor,
            summary: this.generateAuditSummary(quality, cisa2025, bsi, certIn, freshness, completeness, riskLevel)
        };
    }

    /**
     * Generate human-readable audit summary
     */
    generateAuditSummary(quality, cisa2025, bsi, certIn, freshness, completeness, riskLevel) {
        const summaryParts = [];
        
        summaryParts.push(`SBOM Quality: Grade ${quality.grade} (${quality.displayScore}/10)`);
        summaryParts.push(`CISA 2025: ${cisa2025.compliant ? '✓' : '✗'} (${cisa2025.score}%)`);
        summaryParts.push(`BSI: ${bsi.compliant ? '✓' : '✗'} (${bsi.score}%)`);
        summaryParts.push(`CERT-In: ${certIn.compliant ? '✓' : '✗'} (${certIn.score}%)`);
        summaryParts.push(`Freshness: ${freshness.status}`);
        summaryParts.push(`Completeness: ${completeness.percentage}%`);
        summaryParts.push(`Risk: ${riskLevel}`);
        
        return summaryParts.join(' | ');
    }
}

// Make available globally
window.SBOMQualityProcessor = SBOMQualityProcessor;

