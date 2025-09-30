/**
 * Enhancement patches for singlerepo-wrapper.js
 * Addresses:
 * 1. Transitive dependency marking
 * 2. Latest version detection from deps.dev
 * 3. Better vulnerability reporting
 */

// Wait for SingleRepoAnalyzer to be defined, then patch it
(function() {
    'use strict';
    
    // Check if SingleRepoAnalyzer is available
    const checkAndPatch = () => {
        if (typeof SingleRepoAnalyzer === 'undefined') {
            console.log('⏳ Waiting for SingleRepoAnalyzer...');
            setTimeout(checkAndPatch, 100);
            return;
        }
        
        console.log('🔧 Patching SingleRepoAnalyzer with enhancements...');
        
        // Patch displayDependencyDetails
        SingleRepoAnalyzer.prototype.displayDependencyDetails = enhancedDisplayDependencyDetails;
        
        // Patch renderDependencyDetailsPage
        SingleRepoAnalyzer.prototype.renderDependencyDetailsPage = enhancedRenderDependencyDetailsPage;
        
        // Add new method for vulnerability explanation
        SingleRepoAnalyzer.prototype.generateVulnerabilityExplanation = generateVulnerabilityExplanation;
        
        console.log('✅ SingleRepoAnalyzer enhanced successfully!');
    };
    
    // Start checking
    checkAndPatch();
})();

// Enhanced version of displayDependencyDetails method
function enhancedDisplayDependencyDetails(analysisData) {
    const dependencies = analysisData.sbomData.allDependencies || [];
    const driftAnalysis = analysisData.driftAnalysis;
    const vulnerabilityAnalysis = analysisData.vulnerabilityAnalysis;
    const depsDevAnalysis = analysisData.depsDevAnalysis;
    
    if (dependencies.length === 0) {
        const tableBody = document.getElementById('dependencyTableBody');
        const countElement = document.getElementById('dependencyCount');
        const paginationInfo = document.getElementById('dependencyPaginationInfo');
        const pagination = document.getElementById('dependencyPagination');
        
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No dependencies found</td></tr>';
        if (countElement) countElement.textContent = '0 dependencies';
        if (paginationInfo) paginationInfo.textContent = 'Showing 0-0 of 0 dependencies';
        if (pagination) pagination.innerHTML = '';
        return;
    }

    // Build transitive dependency map from deps.dev analysis
    const transitiveDepsMap = new Map();
    if (depsDevAnalysis && depsDevAnalysis.enrichedDependenciesArray) {
        depsDevAnalysis.enrichedDependenciesArray.forEach(enrichedDep => {
            if (enrichedDep.depsDevTree && enrichedDep.depsDevTree.nodes) {
                // Mark the root as direct
                transitiveDepsMap.set(`${enrichedDep.name}@${enrichedDep.version}`, {
                    type: 'direct',
                    parentDep: null,
                    depsDevMetadata: enrichedDep.depsDevMetadata // Store the metadata
                });
                
                // Process transitive dependencies (skip first node which is self)
                enrichedDep.depsDevTree.nodes.slice(1).forEach(node => {
                    const depKey = `${node.versionKey.name}@${node.versionKey.version}`;
                    if (!transitiveDepsMap.has(depKey)) {
                        transitiveDepsMap.set(depKey, {
                            type: node.relation === 'DIRECT' ? 'transitive-direct' : 'transitive-indirect',
                            parentDep: enrichedDep.name,
                            versionKey: node.versionKey
                        });
                    }
                });
            }
        });
    }

    // Enrich dependencies with ALL available data
    const enrichedDependencies = dependencies.map(dep => {
        const depKey = `${dep.name}@${dep.version}`;
        
        // Find drift data
        const driftInfo = driftAnalysis?.allDependencies?.find(d => d.name === dep.name);
        
        // Find vulnerability data
        const vulnInfo = vulnerabilityAnalysis?.vulnerableDependencies?.find(v => v.name === dep.name);
        
        // Get transitive info
        const transitiveInfo = transitiveDepsMap.get(depKey);
        const dependencyType = transitiveInfo ? transitiveInfo.type : 'direct'; // Default to direct if not in deps.dev
        
        // Try to get latest version from multiple sources
        let latestVersion = null;
        let latestVersionSource = null;
        
        // 1. First try drift info (from our API calls)
        if (driftInfo?.latestVersion) {
            latestVersion = driftInfo.latestVersion;
            latestVersionSource = 'drift-analysis';
        }
        
        // 2. Then try deps.dev metadata
        if (!latestVersion && transitiveInfo?.depsDevMetadata) {
            const metadata = transitiveInfo.depsDevMetadata;
            if (metadata.versionKey?.version) {
                latestVersion = metadata.versionKey.version;
                latestVersionSource = 'deps-dev-metadata';
            }
        }
        
        // 3. DON'T fallback to current version - leave as null if unknown
        // This prevents false "Up to Date" status when we don't know latest version
        
        // Enhanced version status
        let versionStatus = 'unknown';
        let statusMessage = 'Unknown';
        let statusDetails = '';
        let isOutdated = false;
        
        if (driftInfo) {
            // We have drift info - use it
            versionStatus = driftInfo.status || 'unknown';
            statusMessage = driftInfo.statusMessage || 'Unknown';
            statusDetails = driftInfo.statusDetails || '';
            isOutdated = driftInfo.isOutdated || false;
        } else if (!latestVersion) {
            // We don't have latest version info - be honest about it
            versionStatus = 'unknown';
            statusMessage = 'Unknown';
            statusDetails = 'Run dependency drift analysis for version info';
            latestVersionSource = null;
        }
        
        return {
            ...dep,
            dependencyType: dependencyType,
            parentDependency: transitiveInfo?.parentDep || null,
            latestVersion: latestVersion,
            latestVersionSource: latestVersionSource,
            isOutdated: isOutdated,
            versionStatus: versionStatus,
            statusMessage: statusMessage,
            statusDetails: statusDetails,
            vulnerabilityCount: vulnInfo?.vulnerabilities?.length || 0,
            vulnerabilities: vulnInfo?.vulnerabilities || [],
            highestSeverity: vulnInfo ? this.getHighestVulnerabilitySeverity(vulnInfo.vulnerabilities) : null,
            depsDevMetadata: transitiveInfo?.depsDevMetadata || null
        };
    });

    // Store for pagination and filtering
    this.allDependencyDetails = enrichedDependencies;
    this.filteredDependencyDetails = enrichedDependencies;
    this.currentDependencyPage = 1;
    this.dependencyPageSize = parseInt(document.getElementById('dependencyPageSize')?.value || '25');
    this.dependencySortField = 'name';
    this.dependencySortDirection = 'asc';

    // Initialize filter options
    this.populateFilterOptions(enrichedDependencies);

    // Update count with breakdown
    const countElement = document.getElementById('dependencyCount');
    if (countElement) {
        const directCount = enrichedDependencies.filter(d => d.dependencyType === 'direct').length;
        const transitiveCount = enrichedDependencies.length - directCount;
        countElement.innerHTML = `${dependencies.length} dependencies 
            <small class="text-muted">(${directCount} direct, ${transitiveCount} transitive)</small>`;
    }

    // Render first page
    this.renderDependencyDetailsPage();
    this.setupDependencyDetailsSorting();
    this.setupDependencyDetailsPagination();
    this.setupDependencyFiltering();
}

// Enhanced renderDependencyDetailsPage to show dependency type
function enhancedRenderDependencyDetailsPage() {
    // Ensure filtered dependency details are initialized
    if (!this.filteredDependencyDetails) {
        if (this.allDependencyDetails && Array.isArray(this.allDependencyDetails)) {
            console.log('🔄 Initializing filtered dependency details from all dependency details');
            this.filteredDependencyDetails = [...this.allDependencyDetails];
        } else {
            console.warn('❌ No dependency details available to render');
            return;
        }
    }

    // Sort dependencies
    const sortedDependencies = [...this.filteredDependencyDetails].sort((a, b) => {
        let aVal = a[this.dependencySortField];
        let bVal = b[this.dependencySortField];
        
        // Handle special sorting cases
        if (this.dependencySortField === 'vulnerabilities') {
            aVal = a.vulnerabilityCount;
            bVal = b.vulnerabilityCount;
            const result = (aVal || 0) - (bVal || 0);
            return this.dependencySortDirection === 'asc' ? result : -result;
        } else if (this.dependencySortField === 'dependencyType') {
            // Sort: direct first, then transitive
            const typeOrder = { 'direct': 0, 'transitive-direct': 1, 'transitive-indirect': 2 };
            const result = (typeOrder[aVal] || 99) - (typeOrder[bVal] || 99);
            return this.dependencySortDirection === 'asc' ? result : -result;
        } else if (this.dependencySortField === 'versionStatus') {
            aVal = a.versionStatus;
            bVal = b.versionStatus;
        } else if (this.dependencySortField === 'ecosystem') {
            aVal = a.category?.ecosystem;
            bVal = b.category?.ecosystem;
        } else if (this.dependencySortField === 'language') {
            aVal = a.category?.language;
            bVal = b.category?.language;
        }
        
        // Convert to strings for comparison (for non-numeric fields)
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
        
        const result = aVal.localeCompare(bVal);
        return this.dependencySortDirection === 'asc' ? result : -result;
    });

    // Paginate
    const startIndex = (this.currentDependencyPage - 1) * this.dependencyPageSize;
    const endIndex = startIndex + this.dependencyPageSize;
    const pageData = sortedDependencies.slice(startIndex, endIndex);

    // Render table body
    const tableBody = document.getElementById('dependencyTableBody');
    if (!tableBody) return;

    let html = '';
    pageData.forEach(dep => {
        const ecosystemBadge = this.getEcosystemBadge(dep.category?.ecosystem);
        const vulnerabilityBadge = dep.vulnerabilityCount > 0 ? 
            `<span class="badge bg-danger">${dep.vulnerabilityCount}</span>` : 
            `<span class="badge bg-success">0</span>`;
        
        // Dependency type badge with tooltip
        let depTypeBadge = '';
        if (dep.dependencyType === 'direct') {
            depTypeBadge = `<span class="badge bg-primary" title="Direct dependency from your project">Direct</span>`;
        } else if (dep.dependencyType === 'transitive-direct') {
            depTypeBadge = `<span class="badge bg-info" title="Transitive dependency (required by ${dep.parentDependency || 'other package'})">Transitive</span>`;
        } else if (dep.dependencyType === 'transitive-indirect') {
            depTypeBadge = `<span class="badge bg-secondary" title="Indirect transitive dependency (required by ${dep.parentDependency || 'other package'})">Transitive (Indirect)</span>`;
        }
        
        // Enhanced version display with constraints
        const { constraint } = this.extractVersionConstraint(dep.version);
        const constraintDisplay = constraint ? `<span class="version-constraint">${constraint}</span>` : '';
        const versionInfo = dep.isOutdated ? 
            `${constraintDisplay}<span class="badge bg-warning text-dark ms-1" title="Outdated">${dep.version.replace(/^[~^>=<]+/, '')}</span>` :
            `${constraintDisplay}<span class="badge bg-success ms-1">${dep.version.replace(/^[~^>=<]+/, '')}</span>`;
        
        // Enhanced version status display
        const enhancedStatus = this.getEnhancedVersionStatus(dep.version, dep.latestVersion);
        let versionStatusBadge = `<span class="badge bg-${enhancedStatus.badge}">${enhancedStatus.message}</span>`;
        
        // Show latest version info intelligently
        if (dep.latestVersion && dep.latestVersionSource && dep.latestVersionSource !== null) {
            // We have real latest version data
            if (dep.latestVersion !== dep.version.replace(/^[~^>=<]+\s*/, '')) {
                versionStatusBadge += `<br><small class="text-muted">Latest: ${dep.latestVersion}</small>`;
            }
        } else {
            // No latest version info available
            versionStatusBadge += `<br><small class="text-muted">Latest: Unknown</small>`;
        }

        html += `
            <tr>
                <td>
                    <code class="package-name-clickable" style="cursor: pointer; color: var(--cyfinoid-accent);" 
                          onclick="singleRepoAnalyzer.showPackageDetails('${dep.name.replace(/'/g, "\\'")}', '${dep.version}', '${dep.category?.ecosystem || 'Unknown'}')"
                          title="Click for package details">
                        ${dep.name}
                    </code>
                    ${dep.parentDependency ? `<br><small class="text-muted">via ${dep.parentDependency}</small>` : ''}
                </td>
                <td>${depTypeBadge}</td>
                <td>${versionInfo}</td>
                <td>${ecosystemBadge}</td>
                <td>${vulnerabilityBadge}</td>
                <td><span class="badge bg-secondary">${dep.category?.language || 'Unknown'}</span></td>
                <td>${versionStatusBadge}</td>
                <td>
                    ${dep.vulnerabilityCount > 0 ? 
                        `<button class="btn btn-sm btn-outline-danger view-vuln-btn" data-package-name="${dep.name.replace(/"/g, '&quot;')}">
                            <i class="fas fa-bug me-1"></i>View
                        </button>` : 
                        `<span class="text-muted">Clean</span>`
                    }
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;

    // Update pagination info
    const total = this.filteredDependencyDetails.length;
    const showing = Math.min(endIndex, total);
    const paginationInfo = document.getElementById('dependencyPaginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${startIndex + 1}-${showing} of ${total} dependencies`;
    }

    // Attach event listeners to view vulnerability buttons
    document.querySelectorAll('.view-vuln-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const packageName = e.currentTarget.getAttribute('data-package-name');
            this.showDependencyVulnerabilities(packageName);
        });
    });
}

// Function to generate vulnerability explanation
function generateVulnerabilityExplanation(dep, vulnAnalysis) {
    if (!vulnAnalysis || vulnAnalysis.totalVulnerabilities === 0) {
        return {
            summary: 'No vulnerabilities found',
            details: `The package ${dep.name}@${dep.version} has no known vulnerabilities.`
        };
    }
    
    const affectedVersion = dep.version.replace(/^[~^>=<]+/, ''); // Clean version
    const vulnCount = vulnAnalysis.totalVulnerabilities;
    
    let explanation = `Found ${vulnCount} vulnerabilities for ${dep.name}`;
    
    // Check if it's a version range issue
    const hasConstraint = /^[~^>=<]/.test(dep.version);
    if (hasConstraint) {
        explanation += `\n\n⚠️ Note: Your dependency uses a version constraint (${dep.version}), ` +
                      `which may include vulnerable versions. The ${vulnCount} vulnerabilities ` +
                      `found may affect versions within this range.`;
    }
    
    // Add severity breakdown
    const severities = [];
    if (vulnAnalysis.criticalVulnerabilities > 0) severities.push(`${vulnAnalysis.criticalVulnerabilities} Critical`);
    if (vulnAnalysis.highVulnerabilities > 0) severities.push(`${vulnAnalysis.highVulnerabilities} High`);
    if (vulnAnalysis.mediumVulnerabilities > 0) severities.push(`${vulnAnalysis.mediumVulnerabilities} Medium`);
    if (vulnAnalysis.lowVulnerabilities > 0) severities.push(`${vulnAnalysis.lowVulnerabilities} Low`);
    
    if (severities.length > 0) {
        explanation += `\n\nSeverity Breakdown: ${severities.join(', ')}`;
    }
    
    // Add recommendation
    if (dep.latestVersion && dep.latestVersion !== affectedVersion) {
        explanation += `\n\n✅ Recommendation: Update to version ${dep.latestVersion} (latest)`;
    }
    
    return {
        summary: `${vulnCount} vulnerabilities found`,
        details: explanation
    };
}

// Export for debugging
window.singleRepoEnhancements = {
    enhancedDisplayDependencyDetails,
    enhancedRenderDependencyDetailsPage,
    generateVulnerabilityExplanation
};

console.log('✅ SingleRepo enhancements module loaded');
