# Changelog

All notable changes to SBOM Play will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

- **License Compliance**: Enhanced license compliance page (`license-compliance.html`)
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

### Fixed

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

### Removed

- **Dependency Visualization Views**: Removed multiple dependency visualization options
  - `deps-dagre.html` (Dagre layout)
  - `deps-force.html` (Force-directed graph)
  - `deps-grid.html` (Grid layout)
  - `deps-list.html` (List view)
  - `deps-radial.html` (Radial tree)
  - `deps-sunburst.html` (Sunburst chart)
  - `deps-tree.html` (Tree view)
  - `deps-visual.html` (Visual view)

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

- **Link Security**: All external links now open securely
  - `target="_blank"` for new tabs
  - `rel="noreferrer noopener"` to prevent tabnabbing
  - Secure URL validation using URL constructor

### Documentation

- **Markdown Files**: Added comprehensive documentation
  - Multiple implementation and enhancement markdown files in `mdfiles/` directory
  - Deployment documentation (`DEPLOY.md`)
  - Brand guidelines (`brandguidelines.md`)

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

