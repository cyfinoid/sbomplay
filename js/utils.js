/**
 * Common utility functions used across SBOM Play
 * These functions are shared to avoid code duplication
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} text - The text to escape
 * @returns {string} - The escaped HTML string
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Properly escape a string for use in JavaScript string literals
 * Escapes backslashes first, then quotes and other control characters
 * @param {string} text - The string to escape
 * @returns {string} - The escaped string safe for use in JavaScript string literals
 */
function escapeJsString(text) {
    if (!text || typeof text !== 'string') return '';
    // Must escape backslashes FIRST, then quotes
    return String(text)
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/'/g, "\\'")    // Then escape single quotes
        .replace(/"/g, '\\"')     // Escape double quotes
        .replace(/\n/g, '\\n')    // Escape newlines
        .replace(/\r/g, '\\r')    // Escape carriage returns
        .replace(/\t/g, '\\t')    // Escape tabs
        .replace(/\f/g, '\\f')    // Escape form feeds
        .replace(/\v/g, '\\v');   // Escape vertical tabs
}

/**
 * Securely check if a URL belongs to a specific hostname
 * This prevents security issues with substring matching (e.g., "evil.com/tidelift.com")
 * @param {string} url - The URL to check
 * @param {string} hostname - The expected hostname (e.g., "github.com", "tidelift.com")
 * @param {string} pathPrefix - Optional path prefix to check (e.g., "/sponsors")
 * @returns {boolean} - True if URL belongs to the hostname
 */
function isUrlFromHostname(url, hostname, pathPrefix = '') {
    if (!url || typeof url !== 'string') return false;
    
    try {
        // Ensure URL has a protocol
        let urlToParse = url.trim();
        if (!urlToParse.match(/^https?:\/\//i)) {
            urlToParse = 'https://' + urlToParse;
        }
        
        const parsedUrl = new URL(urlToParse);
        const urlHostname = parsedUrl.hostname.toLowerCase();
        const expectedHostname = hostname.toLowerCase();
        
        // Check exact hostname match or subdomain
        // Allow subdomains (e.g., "www.github.com" matches "github.com")
        const hostnameMatches = urlHostname === expectedHostname || 
                               urlHostname.endsWith('.' + expectedHostname);
        
        if (!hostnameMatches) return false;
        
        // If path prefix is specified, check it
        if (pathPrefix) {
            const urlPath = parsedUrl.pathname.toLowerCase();
            return urlPath.startsWith(pathPrefix.toLowerCase());
        }
        
        return true;
    } catch (e) {
        // Invalid URL
        return false;
    }
}

/**
 * Setup collapse icon rotation for Bootstrap collapse elements
 * @param {string} collapseId - The ID of the collapse element
 * @param {string} iconId - The ID of the icon element
 */
function setupCollapseIcon(collapseId, iconId) {
    const collapse = document.getElementById(collapseId);
    const icon = document.getElementById(iconId);
    if (collapse && icon) {
        collapse.addEventListener('show.bs.collapse', () => {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        });
        collapse.addEventListener('hide.bs.collapse', () => {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        });
    }
}

/**
 * Generate a statistics card HTML
 * @param {string} title - Card title
 * @param {string|number} value - Card value
 * @param {string} colorClass - Bootstrap color class (primary, danger, warning, info, etc.)
 * @param {string} iconClass - Font Awesome icon class (optional)
 * @returns {string} - HTML string for the card
 */
function generateStatsCard(title, value, colorClass = 'primary', iconClass = '') {
    const iconHtml = iconClass ? `<i class="${iconClass} me-2"></i>` : '';
    return `<div class="col-md-3">
        <div class="card text-center bg-light">
            <div class="card-body">
                <h3 class="text-${colorClass}">${escapeHtml(String(value))}</h3>
                <p class="text-muted mb-0">${iconHtml}${escapeHtml(title)}</p>
            </div>
        </div>
    </div>`;
}

/**
 * Generate an alert HTML
 * @param {string} message - Alert message
 * @param {string} type - Alert type (info, warning, danger, success)
 * @param {string} iconClass - Font Awesome icon class (optional)
 * @returns {string} - HTML string for the alert
 */
function generateAlert(message, type = 'info', iconClass = '') {
    const iconHtml = iconClass ? `<i class="${iconClass} me-2"></i>` : '';
    return `<div class="alert alert-${type}">
        ${iconHtml}${escapeHtml(message)}
    </div>`;
}

