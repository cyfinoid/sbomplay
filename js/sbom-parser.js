/**
 * SBOM Parser - Parses and converts SPDX and CycloneDX formats
 * Converts uploaded SBOMs to the internal format expected by SBOMProcessor
 */
console.log('📄 SBOM Parser loaded');

class SBOMParser {
    constructor() {
        this.supportedFormats = ['spdx', 'cyclonedx'];
    }

    /**
     * Detect the format of an SBOM
     * @param {Object} sbomData - Parsed JSON SBOM data
     * @returns {Object} - { format: 'spdx'|'cyclonedx'|'unknown', version: string|null }
     */
    detectFormat(sbomData) {
        if (!sbomData || typeof sbomData !== 'object') {
            return { format: 'unknown', version: null };
        }

        // Check for CycloneDX format
        if (sbomData.bomFormat === 'CycloneDX' || sbomData.$schema?.includes('cyclonedx')) {
            return {
                format: 'cyclonedx',
                version: sbomData.specVersion || sbomData.version || null
            };
        }

        // Check for SPDX format - can be wrapped in { sbom: {...} } or direct
        const spdxData = sbomData.sbom || sbomData;
        if (spdxData.spdxVersion || spdxData.SPDXID || spdxData.SPDXVersion) {
            return {
                format: 'spdx',
                version: spdxData.spdxVersion || spdxData.SPDXVersion || null
            };
        }

        // Check for packages array with SPDX-like structure
        if (spdxData.packages && Array.isArray(spdxData.packages)) {
            const hasSpxidPackage = spdxData.packages.some(pkg => pkg.SPDXID);
            if (hasSpxidPackage) {
                return { format: 'spdx', version: null };
            }
        }

        return { format: 'unknown', version: null };
    }

    /**
     * Parse an SBOM file and convert to internal format
     * @param {string} fileContent - Raw file content
     * @param {string} filename - Original filename (for fallback naming)
     * @returns {Object} - { success: boolean, data: Object|null, error: string|null, format: Object }
     */
    parse(fileContent, filename = 'unknown') {
        try {
            // Parse JSON
            let sbomData;
            try {
                sbomData = JSON.parse(fileContent);
            } catch (parseError) {
                return {
                    success: false,
                    data: null,
                    error: `Invalid JSON: ${parseError.message}`,
                    format: { format: 'unknown', version: null }
                };
            }

            // Detect format
            const format = this.detectFormat(sbomData);
            
            if (format.format === 'unknown') {
                return {
                    success: false,
                    data: null,
                    error: 'Unknown SBOM format. Supported formats: SPDX JSON, CycloneDX JSON',
                    format: format
                };
            }

            // Convert to internal format
            let convertedData;
            let projectInfo;

            if (format.format === 'spdx') {
                const result = this.convertSPDX(sbomData, filename);
                convertedData = result.data;
                projectInfo = result.projectInfo;
            } else if (format.format === 'cyclonedx') {
                const result = this.convertCycloneDX(sbomData, filename);
                convertedData = result.data;
                projectInfo = result.projectInfo;
            }

            return {
                success: true,
                data: convertedData,
                projectInfo: projectInfo,
                error: null,
                format: format
            };

        } catch (error) {
            console.error('SBOM Parser error:', error);
            return {
                success: false,
                data: null,
                error: `Parser error: ${error.message}`,
                format: { format: 'unknown', version: null }
            };
        }
    }

    /**
     * Convert SPDX format to internal format
     * SPDX is already close to our internal format, just needs wrapping
     * @param {Object} sbomData - SPDX SBOM data
     * @param {string} filename - Fallback filename
     * @returns {Object} - { data: Object, projectInfo: Object }
     */
    convertSPDX(sbomData, filename) {
        // Handle both wrapped { sbom: {...} } and direct SPDX format
        const spdxData = sbomData.sbom || sbomData;

        // Extract project info from SPDX name
        // Format is often "com.github.owner/repo" or just "project-name"
        const projectName = spdxData.name || filename.replace(/\.(json|spdx)$/i, '');
        const projectInfo = this.extractProjectInfo(projectName, filename);

        // Ensure packages array exists
        const packages = spdxData.packages || [];
        
        // Ensure relationships array exists
        const relationships = spdxData.relationships || [];

        // Build the internal format (matches GitHub API structure)
        const internalData = {
            sbom: {
                spdxVersion: spdxData.spdxVersion || 'SPDX-2.3',
                dataLicense: spdxData.dataLicense || 'CC0-1.0',
                SPDXID: spdxData.SPDXID || 'SPDXRef-DOCUMENT',
                name: spdxData.name || projectName,
                documentNamespace: spdxData.documentNamespace || `uploaded://${projectInfo.owner}/${projectInfo.repo}`,
                creationInfo: spdxData.creationInfo || {
                    creators: ['Tool: SBOM-Play-Upload'],
                    created: new Date().toISOString()
                },
                packages: packages.map(pkg => this.normalizeSPDXPackage(pkg)),
                relationships: relationships
            }
        };

        return { data: internalData, projectInfo: projectInfo };
    }

    /**
     * Normalize an SPDX package to ensure required fields
     * @param {Object} pkg - SPDX package
     * @returns {Object} - Normalized package
     */
    normalizeSPDXPackage(pkg) {
        return {
            name: pkg.name || 'unknown',
            SPDXID: pkg.SPDXID || this.generateSPDXID(pkg.name),
            versionInfo: pkg.versionInfo || pkg.version || null,
            downloadLocation: pkg.downloadLocation || 'NOASSERTION',
            filesAnalyzed: pkg.filesAnalyzed || false,
            licenseConcluded: pkg.licenseConcluded || null,
            licenseDeclared: pkg.licenseDeclared || null,
            copyrightText: pkg.copyrightText || null,
            externalRefs: pkg.externalRefs || []
        };
    }

    /**
     * Convert CycloneDX format to internal SPDX-like format
     * @param {Object} sbomData - CycloneDX SBOM data
     * @param {string} filename - Fallback filename
     * @returns {Object} - { data: Object, projectInfo: Object }
     */
    convertCycloneDX(sbomData, filename) {
        // Extract project info from CycloneDX metadata
        const metadata = sbomData.metadata || {};
        const rootComponent = metadata.component || {};
        const projectName = rootComponent.name || metadata.name || filename.replace(/\.(json|cdx)$/i, '');
        const projectInfo = this.extractProjectInfo(projectName, filename);

        // Convert components to SPDX-like packages
        const components = sbomData.components || [];
        const packages = components.map((comp, index) => this.convertCycloneDXComponent(comp, index));

        // Add root component as main package if present
        if (rootComponent.name) {
            const mainPackage = this.convertCycloneDXComponent(rootComponent, -1, true);
            packages.unshift(mainPackage);
        }

        // Convert dependencies to SPDX-like relationships
        const dependencies = sbomData.dependencies || [];
        const relationships = this.convertCycloneDXDependencies(dependencies, packages);

        // Build the internal format
        const internalData = {
            sbom: {
                spdxVersion: 'SPDX-2.3',
                dataLicense: 'CC0-1.0',
                SPDXID: 'SPDXRef-DOCUMENT',
                name: projectName,
                documentNamespace: `uploaded://${projectInfo.owner}/${projectInfo.repo}`,
                creationInfo: {
                    creators: [
                        'Tool: SBOM-Play-Upload',
                        `Tool: CycloneDX-${sbomData.specVersion || 'unknown'}`
                    ],
                    created: metadata.timestamp || new Date().toISOString()
                },
                packages: packages,
                relationships: relationships
            }
        };

        return { data: internalData, projectInfo: projectInfo };
    }

    /**
     * Convert a CycloneDX component to SPDX-like package
     * @param {Object} comp - CycloneDX component
     * @param {number} index - Component index
     * @param {boolean} isMain - Whether this is the main/root component
     * @returns {Object} - SPDX-like package
     */
    convertCycloneDXComponent(comp, index, isMain = false) {
        // Generate SPDXID from bom-ref or create one
        const spdxId = comp['bom-ref'] 
            ? this.bomRefToSPDXID(comp['bom-ref'])
            : this.generateSPDXID(comp.name, index);

        // Extract license from CycloneDX licenses array
        let license = null;
        if (comp.licenses && Array.isArray(comp.licenses)) {
            const licenseIds = comp.licenses.map(lic => {
                if (lic.license) {
                    return lic.license.id || lic.license.name || null;
                }
                if (lic.expression) {
                    return lic.expression;
                }
                return null;
            }).filter(Boolean);
            license = licenseIds.join(' AND ');
        }

        // Build external refs from purl
        const externalRefs = [];
        if (comp.purl) {
            externalRefs.push({
                referenceCategory: 'PACKAGE-MANAGER',
                referenceType: 'purl',
                referenceLocator: comp.purl
            });
        }

        // Add CPE if present
        if (comp.cpe) {
            externalRefs.push({
                referenceCategory: 'SECURITY',
                referenceType: 'cpe23Type',
                referenceLocator: comp.cpe
            });
        }

        return {
            name: comp.name || 'unknown',
            SPDXID: spdxId,
            versionInfo: comp.version || null,
            downloadLocation: comp.externalReferences?.find(r => r.type === 'distribution')?.url || 'NOASSERTION',
            filesAnalyzed: false,
            licenseConcluded: license,
            copyrightText: comp.copyright || null,
            externalRefs: externalRefs,
            // Preserve CycloneDX-specific fields for reference
            _cyclonedx: {
                type: comp.type,
                group: comp.group,
                publisher: comp.publisher,
                description: comp.description,
                bomRef: comp['bom-ref']
            }
        };
    }

    /**
     * Convert CycloneDX dependencies to SPDX-like relationships
     * @param {Array} dependencies - CycloneDX dependencies array
     * @param {Array} packages - Converted packages (for SPDXID lookup)
     * @returns {Array} - SPDX-like relationships
     */
    convertCycloneDXDependencies(dependencies, packages) {
        const relationships = [];
        
        // Build bom-ref to SPDXID mapping
        const bomRefToSpdxId = new Map();
        packages.forEach(pkg => {
            if (pkg._cyclonedx?.bomRef) {
                bomRefToSpdxId.set(pkg._cyclonedx.bomRef, pkg.SPDXID);
            }
        });

        dependencies.forEach(dep => {
            const fromRef = dep.ref;
            const fromSpdxId = bomRefToSpdxId.get(fromRef) || this.bomRefToSPDXID(fromRef);
            
            if (dep.dependsOn && Array.isArray(dep.dependsOn)) {
                dep.dependsOn.forEach(toRef => {
                    const toSpdxId = bomRefToSpdxId.get(toRef) || this.bomRefToSPDXID(toRef);
                    relationships.push({
                        spdxElementId: fromSpdxId,
                        relatedSpdxElement: toSpdxId,
                        relationshipType: 'DEPENDS_ON'
                    });
                });
            }
        });

        return relationships;
    }

    /**
     * Convert a bom-ref to SPDXID format
     * @param {string} bomRef - CycloneDX bom-ref
     * @returns {string} - SPDXID
     */
    bomRefToSPDXID(bomRef) {
        if (!bomRef) return 'SPDXRef-unknown';
        // SPDXID must only contain letters, numbers, dots, and hyphens
        const sanitized = bomRef
            .replace(/[^a-zA-Z0-9.-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return `SPDXRef-${sanitized}`;
    }

    /**
     * Generate a unique SPDXID for a package
     * @param {string} name - Package name
     * @param {number} index - Optional index for uniqueness
     * @returns {string} - SPDXID
     */
    generateSPDXID(name, index = null) {
        if (!name) return `SPDXRef-unknown-${Date.now()}`;
        const sanitized = name
            .replace(/[^a-zA-Z0-9.-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        const suffix = index !== null ? `-${index}` : '';
        return `SPDXRef-${sanitized}${suffix}`;
    }

    /**
     * Extract project info (owner/repo) from project name
     * @param {string} projectName - Project name from SBOM
     * @param {string} filename - Fallback filename
     * @returns {Object} - { owner: string, repo: string, fullName: string }
     */
    extractProjectInfo(projectName, filename) {
        // Default values
        let owner = 'uploaded';
        let repo = filename.replace(/\.(json|spdx|cdx)$/i, '') || 'unknown';

        if (projectName) {
            // Try to extract owner/repo from various formats
            // Format: "com.github.owner/repo"
            const githubMatch = projectName.match(/com\.github\.([^\/]+)\/([^\/]+)/);
            if (githubMatch) {
                owner = githubMatch[1];
                repo = githubMatch[2];
            }
            // Format: "owner/repo"
            else if (projectName.includes('/')) {
                const parts = projectName.split('/');
                if (parts.length >= 2) {
                    owner = parts[parts.length - 2] || 'uploaded';
                    repo = parts[parts.length - 1] || repo;
                }
            }
            // Format: just a name
            else {
                repo = projectName;
            }
        }

        // Clean up repo name
        repo = repo.replace(/[^a-zA-Z0-9._-]/g, '-');

        return {
            owner: owner,
            repo: repo,
            fullName: `${owner}/${repo}`
        };
    }

    /**
     * Get supported file extensions
     * @returns {Array} - Array of supported extensions
     */
    getSupportedExtensions() {
        return ['.json', '.spdx', '.spdx.json', '.cdx.json', '.bom.json'];
    }

    /**
     * Validate file extension
     * @param {string} filename - Filename to check
     * @returns {boolean} - Whether the extension is supported
     */
    isValidExtension(filename) {
        const lower = filename.toLowerCase();
        return this.getSupportedExtensions().some(ext => lower.endsWith(ext));
    }
}

// Export for use in other modules
window.SBOMParser = SBOMParser;
