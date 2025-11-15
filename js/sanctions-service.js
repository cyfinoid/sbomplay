/**
 * Sanctions Service - Manages sanctioned country lists and checks
 * Supports USA (OFAC), UN, and organization-specific sanctions
 */
class SanctionsService {
    constructor() {
        // USA sanctioned countries (OFAC - Office of Foreign Assets Control)
        // Note: This is a simplified list. For production, consider fetching from OFAC API or maintaining a comprehensive list
        this.usaSanctions = new Set([
            'CU', // Cuba
            'IR', // Iran
            'KP', // North Korea (Democratic People's Republic of Korea)
            'SY', // Syria
            // Note: Russia sanctions are typically entity/region-specific, not country-wide
            // Add more as needed based on current OFAC sanctions
        ]);

        // UN sanctioned countries (UN Security Council Consolidated List)
        // Note: This is a simplified list. For production, consider fetching from UN API or maintaining a comprehensive list
        this.unSanctions = new Set([
            'AF', // Afghanistan
            'CF', // Central African Republic
            'CD', // Democratic Republic of the Congo
            'IR', // Iran
            'LY', // Libya
            'KP', // North Korea (Democratic People's Republic of Korea)
            'SO', // Somalia
            'SS', // South Sudan
            'SD', // Sudan
            'YE', // Yemen
        ]);

        // Organization-specific sanctions (loaded from localStorage)
        this.orgSanctions = new Set();
        this.loadOrgSanctions();
    }

    /**
     * Load organization-specific sanctions from localStorage
     */
    loadOrgSanctions() {
        try {
            const stored = localStorage.getItem('sbomplay_org_sanctions');
            if (stored) {
                const countries = JSON.parse(stored);
                if (Array.isArray(countries)) {
                    this.orgSanctions = new Set(countries.map(c => c.toUpperCase()));
                }
            }
        } catch (error) {
            console.warn('Failed to load org sanctions:', error);
            this.orgSanctions = new Set();
        }
    }

    /**
     * Save organization-specific sanctions to localStorage
     * @param {string[]} countries - Array of ISO 3166-1 alpha-2 country codes
     * @returns {boolean} - Success status
     */
    saveOrgSanctions(countries) {
        try {
            // Normalize country codes (uppercase, remove duplicates)
            const normalized = [...new Set(countries.map(c => c.trim().toUpperCase()).filter(c => c.length === 2))];
            localStorage.setItem('sbomplay_org_sanctions', JSON.stringify(normalized));
            this.orgSanctions = new Set(normalized);
            console.log(`✅ Saved ${normalized.length} organization-sanctioned countries`);
            return true;
        } catch (error) {
            console.error('Failed to save org sanctions:', error);
            return false;
        }
    }

    /**
     * Check if a country code is sanctioned
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @returns {Object} - {isSanctioned: boolean, sources: string[]}
     */
    checkSanctioned(countryCode) {
        if (!countryCode || typeof countryCode !== 'string') {
            return { isSanctioned: false, sources: [] };
        }

        const code = countryCode.toUpperCase();
        const sources = [];

        if (this.usaSanctions.has(code)) {
            sources.push('USA');
        }
        if (this.unSanctions.has(code)) {
            sources.push('UN');
        }
        if (this.orgSanctions.has(code)) {
            sources.push('ORG');
        }

        return {
            isSanctioned: sources.length > 0,
            sources: sources
        };
    }

    /**
     * Get all sanctioned countries by source
     * @returns {Object} - {usa: string[], un: string[], org: string[]}
     */
    getAllSanctions() {
        return {
            usa: Array.from(this.usaSanctions).sort(),
            un: Array.from(this.unSanctions).sort(),
            org: Array.from(this.orgSanctions).sort()
        };
    }

    /**
     * Get human-readable country names for display
     * @param {string[]} countryCodes - Array of ISO 3166-1 alpha-2 codes
     * @returns {string} - Comma-separated country names
     */
    getCountryNames(countryCodes) {
        // Basic mapping - could be expanded with a full country name mapping
        const countryNames = {
            'AF': 'Afghanistan', 'CF': 'Central African Republic', 'CD': 'DR Congo',
            'CU': 'Cuba', 'IR': 'Iran', 'KP': 'North Korea', 'LY': 'Libya',
            'SO': 'Somalia', 'SS': 'South Sudan', 'SD': 'Sudan', 'SY': 'Syria',
            'YE': 'Yemen'
        };

        return countryCodes.map(code => countryNames[code] || code).join(', ');
    }
}

// Export for use in other modules
window.SanctionsService = SanctionsService;

