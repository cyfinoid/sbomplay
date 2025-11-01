/**
 * Version Utilities - Shared version normalization and parsing functions
 * Consolidates duplicate version normalization code from multiple services
 */

/**
 * Normalize version string by removing comparison operators
 * Converts ">= 25.1.0" to "25.1.0", "^1.2.3" to "1.2.3", etc.
 * 
 * @param {string} version - Version string to normalize
 * @returns {string} - Normalized version string
 */
function normalizeVersion(version) {
    if (!version) return version;
    
    // Remove common version comparison operators and ranges
    // Handles: >=, <=, >, <, ^, ~, =, etc.
    let normalized = version.trim()
        .replace(/^[><=^~]+\s*/, '')  // Remove prefix operators with optional space
        .replace(/\s*-\s*[\d.]+.*$/, '')  // Remove range suffix (e.g., "1.0.0 - 2.0.0" -> "1.0.0")
        .replace(/\s*\|\|.*$/, '')  // Remove OR alternatives (e.g., "1.0.0 || 2.0.0" -> "1.0.0")
        .trim();
    
    // If the normalized version is empty or doesn't look like a version, return original
    if (!normalized || !/[\d.]/.test(normalized)) {
        return version;
    }
    
    return normalized;
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.VersionUtils = {
        normalizeVersion: normalizeVersion
    };
    // Also expose as global function for convenience
    window.normalizeVersion = normalizeVersion;
}

// Node.js module export (for testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeVersion };
}

