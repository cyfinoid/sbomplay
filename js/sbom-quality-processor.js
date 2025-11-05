/**
 * SBOM Quality Processor
 * 
 * Assesses the quality of GitHub-generated SBOMs based on:
 * - Identification (component names, versions, IDs, PURLs)
 * - Structure (SPDX compliance, format, schema)
 * - Metadata (creation info, timestamps, namespace)
 * - Completeness (licenses, relationships, copyright)
 * 
 * Based on quality-sbom.md criteria
 */
class SBOMQualityProcessor {
    constructor() {
        // Weights for overall score calculation
        this.weights = {
            identification: 0.30,  // 30% - Most critical for dependency tracking
            structure: 0.20,       // 20% - Format compliance
            metadata: 0.20,        // 20% - Provenance and traceability
            completeness: 0.30     // 30% - Information richness
        };
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
        
        // Calculate individual category scores
        const identification = this.assessIdentification(sbom);
        const structure = this.assessStructure(sbom);
        const metadata = this.assessMetadata(sbom);
        const completeness = this.assessCompleteness(sbom);

        // Calculate overall score (weighted average)
        const overallScore = Math.round(
            (identification.score * this.weights.identification) +
            (structure.score * this.weights.structure) +
            (metadata.score * this.weights.metadata) +
            (completeness.score * this.weights.completeness)
        );

        return {
            repository: `${owner}/${repo}`,
            timestamp: Date.now(),
            overallScore: overallScore,
            grade: this.getGrade(overallScore),
            categories: {
                identification,
                structure,
                metadata,
                completeness
            },
            summary: this.generateSummary(overallScore, identification, structure, metadata, completeness),
            issues: this.collectIssues(identification, structure, metadata, completeness)
        };
    }

    /**
     * Assess SBOM Identification quality (30% weight)
     * Checks: component names, versions, unique IDs, PURLs
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
            // Check component name
            if (pkg.name && pkg.name.trim()) {
                checks.componentNames++;
            } else {
                issues.push(`Package ${idx}: Missing component name`);
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
                issues.push(`Package ${pkg.name || idx}: Missing version information`);
            }

            // Check unique ID (SPDXID)
            if (pkg.SPDXID && pkg.SPDXID.trim()) {
                checks.uniqueIds++;
            } else {
                issues.push(`Package ${pkg.name || idx}: Missing SPDXID`);
            }

            // Check PURL
            if (pkg.externalRefs && Array.isArray(pkg.externalRefs)) {
                const purlRef = pkg.externalRefs.find(ref => 
                    ref.referenceType === 'purl' && ref.referenceLocator
                );
                if (purlRef && this.isValidPurl(purlRef.referenceLocator)) {
                    checks.validPurls++;
                } else {
                    issues.push(`Package ${pkg.name || idx}: Missing or invalid PURL`);
                }
            } else {
                issues.push(`Package ${pkg.name || idx}: No external references`);
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
     * Assess SBOM Structure quality (20% weight)
     * Checks: SPDX version, format compliance, data license, schema validity
     */
    assessStructure(sbom) {
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
     * Assess SBOM Metadata quality (20% weight)
     * Checks: creation info, timestamps, component counts, authorship
     */
    assessMetadata(sbom) {
        const checks = {
            hasCreationInfo: false,
            hasCreators: false,
            hasCreationTimestamp: false,
            hasDocumentName: false,
            hasNonZeroPackages: false,
            hasNonZeroRelationships: false,
            hasPrimaryComponent: false
        };

        const issues = [];

        // Check creation info
        if (sbom.creationInfo) {
            checks.hasCreationInfo = true;
            
            if (sbom.creationInfo.creators && Array.isArray(sbom.creationInfo.creators) && 
                sbom.creationInfo.creators.length > 0) {
                checks.hasCreators = true;
            } else {
                issues.push('Missing creator information');
            }

            if (sbom.creationInfo.created) {
                checks.hasCreationTimestamp = true;
            } else {
                issues.push('Missing creation timestamp');
            }
        } else {
            issues.push('Missing creation info section');
        }

        // Check document name
        if (sbom.name && sbom.name.trim()) {
            checks.hasDocumentName = true;
        } else {
            issues.push('Missing document name');
        }

        // Check component counts
        if (sbom.packages && sbom.packages.length > 0) {
            checks.hasNonZeroPackages = true;
        } else {
            issues.push('No packages in SBOM');
        }

        if (sbom.relationships && sbom.relationships.length > 0) {
            checks.hasNonZeroRelationships = true;
        } else {
            issues.push('No relationships defined');
        }

        // Check for primary component (root dependency)
        if (sbom.packages && sbom.packages.length > 0) {
            // GitHub SBOMs typically have a primary component
            const hasPrimary = sbom.packages.some(pkg => 
                pkg.SPDXID && pkg.SPDXID.includes('github-')
            );
            if (hasPrimary) {
                checks.hasPrimaryComponent = true;
            }
        }

        // Calculate score
        const totalChecks = Object.keys(checks).length;
        const passedChecks = Object.values(checks).filter(v => v === true).length;
        const score = Math.round((passedChecks / totalChecks) * 100);

        return {
            score,
            checks,
            issues,
            details: `${passedChecks}/${totalChecks} metadata checks passed, ${sbom.packages?.length || 0} packages, ${sbom.relationships?.length || 0} relationships`
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

        packages.forEach((pkg, idx) => {
            // Check license
            if (pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') {
                checks.packagesWithLicense++;
            }

            // Check copyright
            if (pkg.copyrightText && pkg.copyrightText !== 'NOASSERTION') {
                checks.packagesWithCopyright++;
            }

            // Check download location
            if (pkg.downloadLocation && pkg.downloadLocation !== 'NOASSERTION') {
                checks.packagesWithDownloadLocation++;
            }

            // Check if package has relationships
            if (packageRelationshipMap.has(pkg.SPDXID)) {
                checks.packagesWithRelationships++;
            }

            // Check external references
            if (pkg.externalRefs && pkg.externalRefs.length > 0) {
                checks.packagesWithExternalRefs++;
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

        // Add informational issues (not critical)
        if (checks.packagesWithLicense < totalPackages) {
            issues.push(`${totalPackages - checks.packagesWithLicense} packages missing license information`);
        }
        if (checks.packagesWithCopyright < totalPackages) {
            issues.push(`${totalPackages - checks.packagesWithCopyright} packages missing copyright information`);
        }

        return {
            score,
            checks,
            issues,
            details: `${checks.packagesWithLicense}/${totalPackages} with licenses, ${checks.packagesWithCopyright}/${totalPackages} with copyright, ${checks.packagesWithRelationships}/${totalPackages} with relationships`
        };
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
     * Get letter grade from score
     */
    getGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    /**
     * Generate human-readable summary
     */
    generateSummary(overallScore, identification, structure, metadata, completeness) {
        const grade = this.getGrade(overallScore);
        let summary = `SBOM quality grade: ${grade} (${overallScore}/100). `;

        const strengths = [];
        const weaknesses = [];

        // Identify strengths and weaknesses
        if (identification.score >= 80) strengths.push('strong component identification');
        else if (identification.score < 60) weaknesses.push('weak component identification');

        if (structure.score >= 80) strengths.push('compliant structure');
        else if (structure.score < 60) weaknesses.push('structural issues');

        if (metadata.score >= 80) strengths.push('comprehensive metadata');
        else if (metadata.score < 60) weaknesses.push('incomplete metadata');

        if (completeness.score >= 80) strengths.push('rich information');
        else if (completeness.score < 60) weaknesses.push('limited completeness');

        if (strengths.length > 0) {
            summary += `Strengths: ${strengths.join(', ')}. `;
        }
        if (weaknesses.length > 0) {
            summary += `Areas for improvement: ${weaknesses.join(', ')}.`;
        }

        return summary.trim();
    }

    /**
     * Collect all issues from categories
     */
    collectIssues(identification, structure, metadata, completeness) {
        const allIssues = [];
        
        if (identification.issues.length > 0) {
            allIssues.push({
                category: 'Identification',
                issues: identification.issues
            });
        }
        
        if (structure.issues.length > 0) {
            allIssues.push({
                category: 'Structure',
                issues: structure.issues
            });
        }
        
        if (metadata.issues.length > 0) {
            allIssues.push({
                category: 'Metadata',
                issues: metadata.issues
            });
        }
        
        if (completeness.issues.length > 0) {
            allIssues.push({
                category: 'Completeness',
                issues: completeness.issues
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
            grade: 'N/A',
            categories: {
                identification: { score: 0, checks: {}, issues: [reason], details: reason },
                structure: { score: 0, checks: {}, issues: [reason], details: reason },
                metadata: { score: 0, checks: {}, issues: [reason], details: reason },
                completeness: { score: 0, checks: {}, issues: [reason], details: reason }
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
                averageIdentification: 0,
                averageStructure: 0,
                averageMetadata: 0,
                averageCompleteness: 0,
                totalRepositories: 0,
                gradeDistribution: {},
                repositoriesNeedingAttention: []
            };
        }

        const totals = {
            overall: 0,
            identification: 0,
            structure: 0,
            metadata: 0,
            completeness: 0
        };

        const gradeDistribution = { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0, 'N/A': 0 };
        const repositoriesNeedingAttention = [];

        qualityAssessments.forEach(assessment => {
            totals.overall += assessment.overallScore;
            totals.identification += assessment.categories.identification.score;
            totals.structure += assessment.categories.structure.score;
            totals.metadata += assessment.categories.metadata.score;
            totals.completeness += assessment.categories.completeness.score;

            gradeDistribution[assessment.grade]++;

            // Flag repositories scoring below 70 (grade C or lower)
            if (assessment.overallScore > 0 && assessment.overallScore < 70) {
                repositoriesNeedingAttention.push({
                    repository: assessment.repository,
                    score: assessment.overallScore,
                    grade: assessment.grade,
                    topIssues: assessment.issues.slice(0, 3)
                });
            }
        });

        const count = qualityAssessments.length;

        return {
            averageOverallScore: Math.round(totals.overall / count),
            averageIdentification: Math.round(totals.identification / count),
            averageStructure: Math.round(totals.structure / count),
            averageMetadata: Math.round(totals.metadata / count),
            averageCompleteness: Math.round(totals.completeness / count),
            totalRepositories: count,
            gradeDistribution,
            repositoriesNeedingAttention: repositoriesNeedingAttention.sort((a, b) => a.score - b.score)
        };
    }
}

// Make available globally
window.SBOMQualityProcessor = SBOMQualityProcessor;

