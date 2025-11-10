/**
 * JavaScript for deps.html page
 * Handles CSV export and event delegation for dynamically generated elements
 */

// Handle event.stopPropagation() for links in accordion headers using event delegation
document.addEventListener('DOMContentLoaded', function() {
    // Use event delegation for links that need to stop propagation
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a[data-stop-propagation]');
        if (link) {
            e.stopPropagation();
        }
    });
});

// Export CSV function - will be called from deps.html script block
// This function needs access to variables from the main script, so it's kept global
window.exportDepsCSV = function(allDependencies, searchFromURL, searchPackageName, searchPackageVersion) {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const typeFilter = document.getElementById('typeFilter').value;
    const ecosystemFilter = document.getElementById('ecosystemFilter').value;
    const repoFilter = document.getElementById('repoFilter').value;
    
    let filtered = allDependencies.filter(dep => {
        if (search) {
            if (searchFromURL && searchPackageName && searchPackageVersion) {
                // Exact match for both name and version from URL parameter
                if (dep.name.toLowerCase() !== searchPackageName.toLowerCase()) return false;
                if (dep.version.toLowerCase() !== searchPackageVersion.toLowerCase()) return false;
            } else if (searchFromURL && searchPackageName) {
                // Exact match for name only (no version in search)
                if (dep.name.toLowerCase() !== searchPackageName.toLowerCase()) return false;
            } else if (searchFromURL) {
                // Exact match: package name must exactly equal the search term (case-insensitive)
                if (dep.name.toLowerCase() !== search) return false;
            } else {
                // Fuzzy match: package name contains the search term
                if (!dep.name.toLowerCase().includes(search)) return false;
            }
        }
        if (typeFilter !== 'all' && dep.type !== typeFilter) return false;
        if (ecosystemFilter !== 'all' && dep.ecosystem !== ecosystemFilter) return false;
        if (repoFilter !== 'all' && !dep.repositories.includes(repoFilter)) return false;
        return true;
    });
    
    // Helper function for CSV export
    function getLicenseInfoForCSV(dep) {
        if (dep._licenseCached) {
            return dep.licenseFull;
        }
        if (dep.raw && dep.raw.originalPackage && dep._licenseProcessor) {
            const licenseInfo = dep._licenseProcessor.parseLicense(dep.raw.originalPackage);
            if (licenseInfo.license && licenseInfo.license !== 'NOASSERTION') {
                return licenseInfo.license;
            }
        }
        return 'Unknown';
    }
    
    const csv = [
        ['Package', 'Type', 'Ecosystem', 'Repositories', 'Vulnerabilities (H/M/L)', 'License', 'Brought In By'].join(','),
        ...filtered.map(dep => [
            `"${dep.name}@${dep.version}"`,
            dep.type,
            dep.ecosystem,
            `"${dep.repositories.join(', ')}"`,
            `"H:${dep.vulnHigh} M:${dep.vulnMedium} L:${dep.vulnLow}"`,
            `"${getLicenseInfoForCSV(dep)}"`,
            dep.type === 'direct' ? 'N/A' : `"${dep.parents.join(', ')}"`
        ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dependencies-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

