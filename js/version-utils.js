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
        .replace(/\s+-\s+[\d.]+.*$/, '')  // Remove range suffix with spaces (e.g., "1.0.0 - 2.0.0" -> "1.0.0")
        .replace(/\s*\|\|.*$/, '')  // Remove OR alternatives (e.g., "1.0.0 || 2.0.0" -> "1.0.0")
        .trim();
    
    // If the normalized version is empty or doesn't look like a version, return original
    if (!normalized || !/[\d.]/.test(normalized)) {
        return version;
    }
    
    return normalized;
}

/**
 * Parse version string into major, minor, patch components
 * @param {string} version - Version string (e.g., "1.2.3")
 * @returns {Object|null} - {major: number, minor: number, patch: number} or null if invalid
 */
function parseVersion(version) {
    if (!version) return null;
    
    const normalized = normalizeVersion(version);
    const parts = normalized.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!parts) {
        // Try to parse with fewer parts (e.g., "1.2" -> major=1, minor=2, patch=0)
        const parts2 = normalized.match(/^(\d+)\.(\d+)/);
        if (parts2) {
            return {
                major: parseInt(parts2[1], 10),
                minor: parseInt(parts2[2], 10),
                patch: 0
            };
        }
        return null;
    }
    
    return {
        major: parseInt(parts[1], 10),
        minor: parseInt(parts[2], 10),
        patch: parseInt(parts[3], 10)
    };
}

/**
 * Compare two version strings
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} - Negative if v1 < v2, positive if v1 > v2, 0 if equal
 */
function compareVersions(v1, v2) {
    const parsed1 = parseVersion(v1);
    const parsed2 = parseVersion(v2);
    
    if (!parsed1 || !parsed2) return 0;
    
    if (parsed1.major !== parsed2.major) {
        return parsed1.major - parsed2.major;
    }
    if (parsed1.minor !== parsed2.minor) {
        return parsed1.minor - parsed2.minor;
    }
    return parsed1.patch - parsed2.patch;
}

/**
 * Check if there's a major version update available
 * @param {string} currentVersion - Current version
 * @param {string} latestVersion - Latest available version
 * @returns {boolean} - True if major update available
 */
function hasMajorUpdate(currentVersion, latestVersion) {
    const current = parseVersion(currentVersion);
    const latest = parseVersion(latestVersion);
    
    if (!current || !latest) return false;
    
    return latest.major > current.major;
}

/**
 * Check if there's a minor version update available (same major version)
 * @param {string} currentVersion - Current version
 * @param {string} latestVersion - Latest available version
 * @returns {boolean} - True if minor update available
 */
function hasMinorUpdate(currentVersion, latestVersion) {
    const current = parseVersion(currentVersion);
    const latest = parseVersion(latestVersion);
    
    if (!current || !latest) return false;
    
    return latest.major === current.major && latest.minor > current.minor;
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.VersionUtils = {
        normalizeVersion: normalizeVersion,
        parseVersion: parseVersion,
        compareVersions: compareVersions,
        hasMajorUpdate: hasMajorUpdate,
        hasMinorUpdate: hasMinorUpdate
    };
    // Also expose as global function for convenience
    window.normalizeVersion = normalizeVersion;
}

// Node.js module export (for testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeVersion };
}

