# Changelog

All notable changes to SBOM Play will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### URL Parameter Support
- **Repository Filter Parameter**: Added `repo` URL parameter support across multiple pages
  - `deps.html` - Filters dependencies by repository
  - `vuln.html` - Filters vulnerabilities by repository
  - `quality.html` - Filters repositories by repository name
  - `licenses.html` - Filters licenses by repository
  - `authors.html` - Filters authors by repository
  - Enables deep linking and cross-page navigation from `repos.html`

#### New Major Features (Pages)
- **Repository View**: New repository-focused page (`repos.html`) for viewing repository statistics and analysis
  - Repository statistics table showing:
    - SBOM status and grade (combined column, links to quality.html when available)
    - Vulnerability counts (High/Medium/Low badges, links to vuln.html)
    - Dependency counts (links to deps.html)
    - Author counts (links to authors.html)
    - Repository license (links to licenses.html)
  - Clickable columns that navigate to respective pages with repository filter applied
  - Analysis selector supporting "All Projects (Combined)" and individual analyses
  - Search functionality for repository names
  - Sortable columns with proper sorting logic (including grade-based sorting)
  - Statistics summary (Total Repos, With SBOM, With Vulnerabilities, Showing)
  - CSV export functionality
  - URL parameter support (`org`, `search`)

### Changed

#### Theme & Visual Improvements
- **Enhanced Dark Mode Support**: Comprehensive theme fixes for better readability
  - Fixed table headers to use theme-aware backgrounds (`var(--bg-tertiary)`) instead of hardcoded light colors
  - Fixed footer backgrounds to adapt to both themes (all pages)
  - Fixed stat box colors to use CSS variables for theme adaptation
  - Fixed badge and link colors to use theme-aware CSS variables
  - Added theme support for Bootstrap utility classes (`bg-light`, `text-dark`)
  - Improved contrast and readability in both light and dark modes

#### Navigation & UI Improvements
- **Concise Navigation Menu**: Streamlined navigation menu across all pages
  - Changed "Vulnerabilities" → "Vulns" for brevity
  - Changed "Dependencies" → "Deps" for brevity
  - Changed "Analysis" → "Home" (icon/brand already links to index.html)
  - Added "Repos" link to all navigation menus
  - More compact and scannable navigation bar

#### Code Organization & Optimization
- **JavaScript Refactoring**: Comprehensive JavaScript code optimization and organization
  - Extracted all inline JavaScript from HTML files to separate JS files
  - Created shared utilities file (`js/utils.js`) for common functions (escapeHtml, escapeJsString, isUrlFromHostname)
  - Removed redundant code: eliminated duplicate utility functions across multiple files
  - Simplified overly complicated code patterns
  - Extracted repeated patterns into reusable utility functions
  - Updated all HTML files to load `utils.js` before other scripts
  - Optimized JavaScript code for better maintainability and performance

- **CSS Consolidation**: Comprehensive CSS optimization and organization
  - Extracted all inline styles from HTML files to CSS classes
  - Extracted all `<style>` blocks from HTML files to `style.css`
  - Consolidated redundant CSS rules between `style.css` and `themes.css`
  - Created utility classes for common inline styles:
    - Display utilities (`.d-none`, `.d-block`, `.d-flex`)
    - Cursor utilities (`.cursor-pointer`)
    - Text alignment utilities (`.text-center`, `.text-left`, `.text-right`)
    - Dimension utilities (`.w-140`, `.h-2rem`, `.h-8px`, `.h-20px`)
    - Max height utilities (`.max-h-200`, `.max-h-400`)
    - Overflow utilities (`.overflow-y-auto`)
    - Background/text color utilities (`.bg-secondary`, `.bg-tertiary`, `.text-primary`)
    - Position utilities (`.position-relative`, `.position-absolute`)
  - Removed duplicate progress bar definitions
  - Removed old dark mode support from `style.css` (now handled by `themes.css`)
  - Consolidated button styles
  - Optimized `themes.css` to remove redundancies
  - Updated JavaScript-generated HTML to use CSS classes instead of inline styles

#### File Structure Improvements
- **JavaScript Files**: Better organization of JavaScript code
  - Created `js/index-page.js` for index.html-specific functionality
  - Created `js/utils.js` for shared utility functions
  - All page-specific JavaScript now properly separated from HTML files

- **CSS Files**: Better organization of styles
  - All styles consolidated in `style.css` and `themes.css`
  - Clear separation between base styles and theme-specific styles
  - Removed all inline styles and style blocks from HTML files

#### Progress Bar & Status Improvements
- **Enhanced Progress Tracking**: Improved progress bar accuracy and status messages
  - Implemented phase-based progress tracking with weighted phases for more accurate progress representation
  - Enhanced status messages with detailed information (e.g., "Resolving github actions dependencies (3/4 packages)...")
  - Progress bar now reflects actual work progress based on analysis phases rather than simple percentage
  - Added smoother progress bar animations with cubic-bezier transitions and shimmer effects
  - Removed estimated remaining time display (not useful for variable-duration operations)

## [0.0.2] - 2025-11-08

### Added

#### New Major Features (Pages)
- **Author Analysis**: New author analysis page (`authors.html`) with funding detection (did not exist in v0.0.1)
  - Author deduplication across multiple repositories
  - Funding/sponsorship opportunity detection (GitHub Sponsors, Patreon, Open Collective, Tidelift)
  - Author profile pages with associated repositories and dependencies
  - Filter to show only authors with sponsorship opportunities
  - Cross-repository author identification

- **SBOM Quality Assessment**: New experimental SBOM quality analysis page (`quality.html`) (did not exist in v0.0.1)
  - Quality scoring based on 5 categories: Identification (25%), Provenance (20%), Dependencies (10%), Metadata (10%), Licensing (10%), Vulnerability (25%)
  - Repository-level quality grades (A-F scale)
  - Category breakdown with individual scores
  - Repositories needing attention (top 5)
  - Average category scores visualization
  - Experimental feature marking

#### Enhanced Features
- **Vulnerability Analysis**: Enhanced vulnerability analysis page (`vuln.html`) with OSV.dev integration
  - Vulnerability severity filtering (Critical, High, Medium, Low)
  - Pagination support (25 entries per page with "Load More" functionality)
  - Safe markdown rendering for vulnerability descriptions using `marked.js` and `DOMPurify`
  - Links in vulnerability descriptions open in new tabs with `rel="noreferrer noopener"` for security
  - Combined view showing vulnerabilities across all analyzed organizations
  - Individual vulnerability details with references and external links

- **License Compliance**: Enhanced license compliance page (`licenses.html`)
  - License categorization (proprietary, copyleft, LGPL, permissive, unknown)
  - Risk assessment (low, medium, high)
  - License conflict detection
  - High-risk dependency identification
  - License family grouping
  - Combined view across all organizations
  - Category filtering for license types

- **Dependency Management**: Enhanced dependency view (`deps.html`)
  - **Transitive Dependencies**: Added support for identifying and displaying transitive dependencies (experimental feature, may not cover all ecosystems)
  - Unified table view replacing multiple visualization options
  - Pagination (top 25 entries initially, with "Load More" option)
  - Package name and version merged into clickable `name@version` format
  - Detailed package modal showing:
    - Repository usage
    - Sponsorship opportunities
    - Author information
    - SBOM Quality scores (repository-level)
  - Vulnerability count display (High, Medium, Low) with color coding
  - License markers (5 characters with full name on hover)
  - Sponsorship column with platform-specific icons (GitHub, Patreon, Open Collective, Tidelift)
  - Multiple filters:
    - Organization/analysis selector
    - Search by package name
    - Direct dependencies only
    - Vulnerable dependencies only
    - Sponsorship opportunities only
  - Hash version truncation (first 5 characters with full hash on hover)
  - URL parameter support (`org`, `search`, `ecosystem`, `direct`, `funding`, `vulnerable`)
  - Performance optimizations with lazy loading for funding data and deferred license parsing

- **Statistics Dashboard**: Integrated statistics on main page (`index.html`)
  - Top 5 Ecosystems with dependency counts and icons (clickable links to dependency view)
  - Issues by Severity (Critical, High, Medium, Low) with color coding and links to vulnerability page
  - License Distribution pie chart with tooltips and category links
  - Top 5 Most Commonly Used Dependencies (by `name@version`)
  - Top 5 Dependencies with Version Sprawl (highlighting multi-version dependencies)
  - Collapsible sections for better organization
  - Author funding statistics with links to author page

#### Storage & Data Management
- **IndexedDB Migration**: Migrated from localStorage to IndexedDB for better storage capacity
  - Separate object stores for organizations, repositories, vulnerabilities, and authors
  - Efficient data retrieval and querying
  - Storage compression and optimization
  - Storage usage monitoring in Settings page

- **Data Import/Export**: Enhanced data management capabilities
  - Export all analysis data as JSON
  - Import all data from JSON file
  - Individual organization data export
  - Bulk operations for data management
  - **Granular Export/Import Options** (new):
    - Export/Import all data (analysis + cached databases)
    - Export/Import cached databases only (authors, packages, vulnerabilities)
    - Export/Import analysis data only (organization/repository analysis)
    - Export/Import individual caches (authors, packages, vulnerabilities separately)
    - **Checksum Validation**: All exports include SHA-256 checksums for integrity verification
    - Imports verify checksums before importing to prevent tampering
    - Checksum calculation excludes the checksum field itself for consistency

- **Combined Data View**: Ability to view aggregated data across all organizations
  - Combined vulnerability analysis
  - Combined license analysis
  - Combined author analysis
  - Combined dependency view

#### UI/UX Improvements
- **Theme Support**: Light and dark theme toggle
  - Theme persistence across sessions
  - Consistent theming across all pages
  - Theme toggle button in navigation bar

- **Consistent Layout**: Standardized page layouts and styling
  - Uniform container width (`max-width: 1200px`)
  - Consistent navigation menu across all pages
  - Standardized footer on all pages
  - Consistent spacing and margins (`mb-4` for sections)
  - Bootstrap card-based filter sections

- **Navigation Enhancements**
  - "Back to Analysis" button on detail pages
  - Clickable organization names linking to dependency view
  - Ecosystem cards linking to filtered dependency views
  - Severity cards linking to filtered vulnerability views
  - License category links to filtered license compliance views

- **Loading Indicators**: Improved user feedback
  - Loading spinners during data processing
  - Progress indicators for long-running operations
  - Loading states for pagination

#### Performance Optimizations
- **Lazy Loading**: Deferred data processing for better initial load times
  - Funding data loaded in batches for visible rows only
  - License parsing deferred until needed
  - SBOM quality calculations deferred for dependencies
  - Pagination reduces initial data processing

- **Caching**: Implemented caching mechanisms
  - Cache manager for external API calls
  - Registry data caching
  - Funding data caching

#### Security Enhancements
- **XSS Prevention**: Enhanced security measures
  - Safe markdown rendering with DOMPurify sanitization
  - Proper HTML escaping throughout the application
  - JavaScript string escaping for onclick handlers
  - Secure URL validation using URL constructor
  - Safe link handling with `rel="noreferrer noopener"`

- **Input Validation**: Improved input handling
  - GitHub URL parsing and validation
  - Secure hostname matching for funding URLs
  - Proper escaping of user-provided data

#### Infrastructure
- **GitHub Actions**: Automated deployment workflows
  - Deployment validation workflow
  - GitHub Pages deployment automation
  - File validation checks

- **Dependency Resolution**: Enhanced dependency tree resolution
  - Transitive dependency identification (experimental)
  - Multi-ecosystem support
  - Dependency deduplication across repositories

- **Ecosystem Support**: Improved ecosystem detection and handling
  - Ecosystem icons and display
  - Ecosystem-specific filtering
  - Registry mapping utilities

- **Version Utilities**: Enhanced version handling
  - Hash version detection and truncation
  - Version comparison utilities
  - Version normalization

#### License Compliance Enhancements
- **Expanded License Recognition**: Added support for 40+ additional licenses
  - Permissive licenses: MIT-0, MIT-CMU, 0BSD, Python-2.0, Python-2.0.1, PSF-2.0, CNRI-Python, CC-BY-4.0, OFL-1.1, BlueOak-1.0.0, AFL-2.1, CDDL-1.0, CDDL-1.1, Unicode-DFS-2016, and more
  - LGPL variants: LGPL-2.1-only, LGPL-2.1-or-later, LGPL-2.0-only, LGPL-2.0-or-later, LGPL-3.0-only, LGPL-3.0-or-later
  - Copyleft licenses: EPL-1.0, GPL-1.0-or-later, MPL-1.1, GPL-2.0-only WITH Classpath-exception-2.0
  - LicenseRef-scancode references: public-domain, other-permissive, jsr-107-jcache-spec-2013
- **License Re-processing**: License compliance now re-processes licenses from raw dependency data
  - Ensures latest license classifications are used even for older stored data
  - High-risk dependencies are re-evaluated using current license processor
  - License counts and displayed entries now use consistent, up-to-date classifications

#### Storage Management Improvements
- **Enhanced Storage Status Display**: Improved clarity of storage usage information
  - Changed "total" to "quota" for better clarity
  - Added precise percentage display (e.g., 0.004%)
  - Added informational note when storage includes entity caches after clearing analysis data
  - Better explanation of what storage includes (entity caches vs analysis data)

#### Deployment & Infrastructure
- **GitHub Release-Based Deployment**: Migrated to automated GitHub Actions deployment
  - Deployment now triggered automatically on GitHub release creation
  - Updated `deploy-github-pages.yml` workflow to deploy all required files
  - Fixed deployment workflow to include `quality.html` and remove non-existent `stats.html`
  - Enhanced `validate-deployment.yml` to check all JavaScript modules
  - Updated deployment documentation in `DEPLOY.md`
- **Cache Busting**: Updated all JavaScript and CSS references to use version `v=0.0.2`
  - All HTML files now reference assets with version string for cache invalidation
  - Ensures users always get latest files after deployment

- **License Filtering in Dependency View**: Added license filtering capability to `deps.html`
  - New `license` URL parameter support for filtering dependencies by specific license
  - License filtering logic integrated into `filterTable()` function
  - `getLicenseInfo()` helper function moved to global scope for accessibility
  - View button in License Types table now includes license parameter in URL to filter results

### Changed

- **Statistics Page**: Integrated statistics dashboard into main page
  - Removed: `stats.html` (functionality moved to `index.html`)
  - Statistics now display automatically when analysis results are available

- **SBOM Quality Categories**: Streamlined quality assessment categories
  - Updated weights: Identification (25%), Provenance (20%), Dependencies (10%), Metadata (10%), Licensing (10%), Vulnerability (25%)

- **Storage Architecture**: Migrated from localStorage to IndexedDB
  - Improved storage capacity (from ~5-10MB to gigabytes)
  - Better data organization with separate object stores
  - More efficient querying and retrieval

- **UI Consistency**: Standardized styling across all pages
  - Consistent container width
  - Uniform spacing and margins
  - Standardized filter sections using Bootstrap cards
  - Consistent footer content

- **CSS Loading Order**: Fixed CSS loading order to ensure consistent styling
  - Bootstrap CSS loaded first
  - Font Awesome loaded second
  - Custom `style.css` loaded third (contains max-width override)
  - `themes.css` loaded last

- **License Processing**: License compliance now processes licenses on-the-fly from raw dependency data
  - No longer relies solely on stored license analysis data
  - Ensures consistency between counts and displayed entries
  - Automatically applies latest license classifications to all data

- **License**: Migrated from MIT License to GNU General Public License v3 (GPLv3)
  - Changed to GPL-3.0 to align with project goals and community standards
  - See LICENSE file for full license text

- **License Types Table**: Enhanced View button functionality
  - View button now filters `deps.html` to show only packages with the specific license
  - URL includes `&license={licenseName}` parameter for precise filtering
  - Improved user experience when exploring packages by license type

### Fixed

#### Typography & Text Issues
- **Fixed Typos**: Corrected spelling errors throughout the application
  - Fixed "repositoryy" → "repositories" in vulnerability analysis page
  - Fixed "vulnerabilityies" → "vulnerabilities" in vulnerability count display
  - Improved pluralization logic for better text consistency

#### Display & Formatting Issues
- **License Abbreviation**: Fixed license display in dependencies table
  - Changed "Apach" → "Apache" for Apache licenses
  - Improved handling of compound licenses (e.g., "Apache-2.0 AND MIT")
  - License abbreviations now display correctly while maintaining readability

#### Theme & Color Issues
- **Table Headers in Dark Mode**: Fixed white background issue in dark mode
  - Table headers now use theme-aware `var(--bg-tertiary)` instead of hardcoded light color
  - Text color now uses `var(--text-primary)` for proper theme adaptation
  - Added explicit dark mode override in `themes.css` with `!important` for consistency

- **Footer Backgrounds**: Fixed footer backgrounds not adapting to themes
  - All footers now use theme-aware `var(--bg-secondary)` via CSS override
  - Consistent appearance across all pages in both light and dark modes

- **Stat Box Colors**: Fixed hardcoded colors in statistics boxes
  - Headings now use `var(--color-blue)` for theme adaptation
  - Paragraphs now use `var(--text-secondary)` for proper contrast

- **Badge and Link Colors**: Fixed hardcoded colors for better theme support
  - Badge colors (`.badge-direct`, `.badge-transitive`) now use CSS variables
  - Clickable cell links now use theme-aware colors
  - Vulnerability page links now adapt to themes properly

- **Bootstrap Utility Classes**: Added theme support for Bootstrap classes
  - `bg-light` now uses `var(--bg-secondary)` for theme adaptation
  - `text-dark` now uses `var(--text-primary)` with exception for warning badges that need dark text for contrast

- **Vulnerability Filter**: Fixed issue where vulnerable dependencies filter showed zero results when no organization was selected
  - Now automatically loads combined data when filter is active and no data is loaded

- **Combined Data Loading**: Fixed issues with combined data views
  - Vulnerability analysis now correctly aggregates across all organizations
  - License analysis now correctly combines conflicts, recommendations, and high-risk dependencies
  - Author analysis correctly deduplicates across organizations

- **URL Parameter Handling**: Fixed URL parameter parsing and filtering
  - `search` parameter now correctly filters dependencies
  - `ecosystem` parameter correctly filters by ecosystem
  - `direct` parameter correctly sets direct-only filter
  - `funding` parameter correctly sets sponsorship filter
  - `vulnerable` parameter correctly sets vulnerability filter
  - `severity` parameter correctly filters vulnerabilities

- **Funding Data**: Fixed issue where multiple funding platforms showed same URL
  - Now correctly stores and displays platform-specific URLs (GitHub, Patreon, Open Collective, Tidelift)
  - Each platform icon links to its respective URL

- **Author Funding Count**: Fixed discrepancy between author funding count on index page and authors page
  - Now uses consistent logic for detecting authors with funding opportunities

- **License Status Display**: Fixed issue where license data was not displayed until organization was selected
  - Now shows combined license data by default

- **Vulnerability Pagination**: Fixed issue where only top 10 vulnerabilities were shown
  - Now shows top 25 with "Load More" functionality
  - Fixed "Load More" button error when loading combined data

- **Markdown Rendering**: Fixed plain text rendering of markdown in vulnerability descriptions
  - Now safely renders markdown with proper sanitization
  - Links open in new tabs with security attributes

- **Storage Manager Access**: Fixed `loadMoreVulnerabilities` error where `storageManager` was not accessible
  - Made `storageManager` globally available as `window.storageManager`
  - Fixed inconsistent naming for combined data identifiers

- **CSS Width Issues**: Fixed inconsistent page widths across different pages
  - Standardized container width using consistent CSS loading order
  - All pages now follow uniform `max-width: 1200px` guideline

- **Filter Notice Positioning**: Fixed mispositioned funding filter notice
  - Now correctly displays after the main header row

- **Hash Version Display**: Fixed display of hash versions in dependency table
  - Now shows first 5 characters with full hash on hover and in modal

- **SBOM Quality Display**: Removed incorrect SBOM quality scores from dependency table
  - Quality is now only shown at repository level (as intended)
  - Removed quality column from dependency table and package modal

- **XSS Vulnerabilities**: Fixed multiple XSS vulnerabilities identified by CodeQL
  - Replaced unsafe `innerHTML` assignments with `safeSetHTML` method in `view-manager.js`
  - Fixed unsafe HTML insertion in dependency details, repository details, error messages, and alerts
  - Fixed unsafe modal creation using `insertAdjacentHTML` (now uses safer DOM manipulation)
  - Fixed unsafe pagination HTML concatenation (now uses proper node appending)
  - All user-controlled data now properly escaped before DOM insertion

- **URL Substring Sanitization**: Fixed incomplete URL substring sanitization vulnerabilities
  - Replaced insecure `.includes()` checks for hostname matching with secure `isUrlFromHostname()` method
  - Fixed Patreon, GitHub Sponsors, and Open Collective URL validation in `authors.html`
  - Fixed Go package name parsing in `author-service.js` to use regex matching instead of substring checks
  - Prevents malicious URL bypasses (e.g., `evil.com/patreon.com`)

- **Search Parameter Behavior**: Fixed search parameter behavior in dependency view
  - URL `search` parameter now performs exact match (as intended for hyperlinks)
  - In-page search input retains fuzzy matching behavior
  - Search behavior automatically switches based on input source

- **SBOM Quality Processor**: Fixed parameter mismatch in `generateSummary` method
  - Corrected function signature to match actual parameters (dependencies, metadata)
  - Resolved "ReferenceError: dependencies is not defined" error
  - SBOM quality assessment now works correctly for all repositories

- **License Classification**: Fixed issue where old stored license data showed incorrect classifications
  - Licenses are now re-parsed from `originalPackage` data using current processor
  - Previously unknown licenses (e.g., Python-2.0, CC-BY-4.0, LGPL-2.1-or-later) now correctly classified
  - High-risk dependency lists now reflect accurate license categories

- **Storage Status Display**: Fixed confusing storage usage message
  - Clarified that "total" refers to browser quota, not stored data
  - Added helpful note explaining entity caches persist after clearing analysis data

### Removed


- **Statistics Page**: Removed standalone statistics page
  - `stats.html` (functionality integrated into `index.html`)

- **SBOM Quality Categories**: Removed redundant categories
  - "Structural" category (always SPDX compatible)
  - "Integrity" category (always 0, not supported)

- **Quick Analysis Access Section**: Removed from index page
  - Replaced by integrated statistics dashboard

- **Old Statistics Cards**: Removed old statistics display
  - "Top Languages, Critical Issues, License Status" row
  - Replaced by new Statistics Dashboard section

### Security

- **XSS Prevention**: Enhanced protection against cross-site scripting
  - Implemented safe markdown rendering with DOMPurify
  - Proper HTML escaping throughout application
  - JavaScript string escaping for event handlers
  - Secure URL validation
  - **Comprehensive XSS Fixes**: Fixed all unsafe HTML insertion patterns
    - Replaced all direct `innerHTML` assignments with `safeSetHTML` method
    - Fixed unsafe `insertAdjacentHTML` usage (now uses safer DOM methods)
    - Fixed unsafe HTML concatenation patterns (`innerHTML +=`)
    - Fixed unsafe `outerHTML` assignments (now uses `replaceWith` and `cloneNode`)
    - All error messages and user-controlled data properly escaped
    - Enhanced `safeSetHTML` method to prefer DOMPurify when available, with DOMParser fallback

- **Link Security**: All external links now open securely
  - `target="_blank"` for new tabs
  - `rel="noreferrer noopener"` to prevent tabnabbing
  - Secure URL validation using URL constructor

- **Data Integrity**: Enhanced data export/import security
  - SHA-256 checksum validation for all exported data
  - Checksum verification on import prevents tampering
  - Consistent checksum calculation (sorted keys, excludes checksum field)
  - Import operations validate checksums before proceeding


## [0.0.1] - 2024-07-13

### Added
- Initial release of SBOM Play
- Basic SBOM analysis from GitHub organizations and users
- Dependency tracking across repositories
- Export analysis results as JSON
- Rate limit handling and recovery
- Persistent storage of analysis results
- Multi-organization storage
- Organization management (view, load, remove)
- Bulk export functionality

