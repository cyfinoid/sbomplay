# Changelog

All notable changes to SBOM Play will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Comprehensive License Fix Script**: Created one-time migration script to fix existing data with unknown versions and unlicensed dependencies
  - **Purpose**: Addresses the gap where old scans had `version: 'unknown'` before automatic version resolution was implemented
  - **Three-Phase Process**:
    - **Phase 1**: Resolves unknown versions to latest version using DependencyTreeResolver
    - **Phase 2**: Fetches licenses from deps.dev API for resolved versions
    - **Phase 3**: Applies repository license fallback for dependencies still missing licenses
  - **Results**: For anantshri-clones org (3,158 dependencies):
    - Found 134 dependencies with unknown versions
    - Resolved 127 versions (95% success rate)
    - Fetched 125 licenses from deps.dev API
    - Applied 200 repository license fallbacks
    - **Reduced unlicensed count from 290+ to just 2 (99.3% reduction!)**
  - **Usage**: Run once in browser console: Load `dependency-tree-resolver.js`, then load and execute `comprehensive-license-fix.js`
  - **Future Scans**: Not needed - new scans automatically handle version resolution and license fetching
  - **Location**: `js/comprehensive-license-fix.js` (new file), documented in `test-results/repository-license-fallback-fix.md`
- Maven version drift support via ecosyste.ms API
  - Added `fetchMavenLatestVersion()` to dependency-tree-resolver.js
  - Added `fetchMavenLatestVersion()` to version-drift-analyzer.js
  - Enables version checking for Maven packages without CORS issues
- **Debug Tools Page**: Created new `debug.html` page for advanced debugging and data management tools
  - **Moved from Settings**: License Management, Author Detection Settings, and Debug URL Logging
  - **Purpose**: Separates advanced/debug features from everyday settings for better UX
  - **Access**: Available at `/debug.html` (not linked in main navigation to avoid clutter)
  - **Location**: `debug.html` (new file)
  - **Workflow Updates**: Updated both deployment and validation workflows to include debug.html
- **Enhanced Logging**: Added console logging in vuln-page.js to help debug vulnerability data loading issues
  - Shows which analysis is being loaded (specific org or aggregated)
  - Displays count of vulnerable packages when rendering
  - Helps identify if data exists but isn't rendering correctly
  - **Location**: `js/vuln-page.js` lines 7-22
- **Manual License Re-fetch Button**: Added UI button in Settings page to manually re-fetch missing licenses for existing analysis data
  - Displays count of unknown licenses by ecosystem before re-fetching
  - Shows real-time progress during license fetching
  - Queries deps.dev API, PyPI API (with PEP 639 support), and other registries
  - Updates IndexedDB with newly fetched licenses without requiring full re-scan
  - Useful for updating old scans or fixing license detection issues
  - **Impact**: Allows users to fix ~1500+ "unknown" licenses (npm, PyPI, Go) without 10+ minute rescan
  - **Location**: `settings.html` lines 59-93, `js/license-refetch.js` (new file)
- **Total Packages Processed Counter**: Added real-time counter showing cumulative packages processed during dependency resolution
  - Displays below elapsed time during dependency tree resolution
  - Shows total count of all packages processed (direct + transitive)
  - Increments for each package resolved from any ecosystem
  - Uses comma-separated formatting for readability (e.g., "1,234")
  - **Impact**: Better visibility into scan progress and total dependency tree size
  - **Location**: `index.html` lines 165-167, `js/app.js` lines 1324-1332, `js/dependency-tree-resolver.js` lines 20, 157, 226

### Changed
- **Staleness Checking Moved to Analysis Phase**: Staleness data now fetched during initial analysis instead of lazily in UI
  - **Previous Behavior**: Staleness checked on-demand when opening deps.html, causing 50+ console messages
  - **New Behavior**: Staleness checked during initial analysis alongside version drift data
  - **Benefits**: Faster UI loading, complete data upfront, eliminates console spam
  - **Performance**: Staleness data cached in IndexedDB during analysis, not when viewing pages
  - **Console**: Changed "Saved staleness for" from `console.log` to `console.debug` (only shows in verbose mode)
  - **Files Changed**: `js/app.js` (fetchVersionDriftData function), `js/version-drift-analyzer.js` (logging)
- **Cache Busting Updated**: Updated all JavaScript cache busting timestamps from `cb=1732345678901` to `cb=1732460000000` across all HTML files
  - Ensures browsers load the latest versions of modified JavaScript files
  - Applies to all pages: index, deps, licenses, vuln, audit, repos, authors, settings, about
  - Updated 100+ script tag references across 9 HTML files
  - **Location**: All HTML files
- **License Changes Section Dependency Display**: Dependencies now show ecosystem prefix (e.g., `npm:express`, `pypi:requests`)
  - Changed from displaying just package name (e.g., `express`) to ecosystem:package format
  - Makes it easier to identify which ecosystem each dependency belongs to
  - Helps distinguish packages with same name across different ecosystems
  - **Impact**: Clearer dependency identification in license change detection
  - **Location**: `js/view-manager.js` lines 3575-3593, 3621-3635, 4281-4292

### Fixed
- **Repositories Without Dependency Graph Now Listed**: Fixed issue where repositories without SBOMs were silently skipped
  - **Problem**: Only repositories with SBOM/Dependency Graph enabled were stored and displayed (e.g., 5 out of 42 repos shown for anantshri-clones org)
  - **Root Cause**: `app.js` processRepository function returned `null` for repos without SBOMs, causing them to be discarded
  - **Solution**: Now stores ALL repositories with `hasDependencyGraph: false` flag for repos without SBOMs
  - **UI Marker**: Repos without dependency graph show `<i class="fas fa-ban"></i> No Dependency Graph` badge in SBOM Grade column  
  - **Dropdown Filtering**: Repositories without SBOMs (0 dependencies) are filtered from dropdown selectors on deps.html, vuln.html, licenses.html, etc. They ONLY appear in repos.html
  - **Data Structure**: Repos without SBOMs stored with minimal data: 0 dependencies, N/A quality, but preserve repository metadata (license, archived status, description, language)
  - **Benefits**: Complete visibility of all public repositories in repos.html, identifies which repos need dependency graph enabled in GitHub settings
  - **Files Changed**: `js/app.js` (processRepository), `js/repos-page.js` (processData, renderTable), `js/page-common.js` (loadAnalysesList), `deps.html` (inline loadAnalysesList)
- **Repository License Fallback for Unlicensed Dependencies**: Fixed issue where dependencies showed as "unlicensed" even though their repository had a clear license
  - **Problem**: 290+ dependencies from repositories like `dgraph-io/badger` (Apache-2.0) showed as unlicensed in BOTH licenses.html AND deps.html
  - **Root Cause**: THREE separate issues:
    - `getDependencyLicenseInfo()` in view-manager.js (used by licenses.html) - didn't check repository license
    - `getLicenseInfo()` inline in deps.html - didn't check dep.licenseFull, dep.license, OR repository license
    - **`exportData()` in sbom-processor.js - dependencies were exported WITHOUT `repositoryLicense` field**
  - **Impact**: Many SBOMs don't include license info for individual packages, but the repository itself has a license file; Go modules (e.g., `github.com/modern-go/concurrent`) had no license fallback
  - **Solution**: 
    - Updated `getDependencyLicenseInfo()` in view-manager.js to add repository license fallback
    - Updated `getLicenseInfo()` in deps.html to match the same comprehensive checking logic
    - **Modified `exportData()` in sbom-processor.js to include `repositoryLicense` field for each dependency (uses first repository's license)**
    - **Created comprehensive-license-fix.js migration script to backfill existing data**
  - **Inference Chain**: Both functions now check: dep.licenseFull → dep.license → dep.raw.licenseFull → dep.raw.license → GitHub Actions metadata → SBOM originalPackage → **repository license (NEW)**
  - **Files Modified**: js/view-manager.js (line ~2890), deps.html (line ~1147), **js/sbom-processor.js (lines 904-930)**, **js/comprehensive-license-fix.js (new migration script)**
  - **Source Tracking**: License source marked as 'repositoryLicense' to indicate it was inferred from repository, not declared in package metadata
  - **Results**: Unlicensed count reduced from 290+ to just 2 dependencies (99.3% reduction for existing data)
  - **Files Changed**: `js/view-manager.js` (getDependencyLicenseInfo function, lines 2746-2775), **`js/sbom-processor.js` (exportData function)**, **`js/comprehensive-license-fix.js` (new file)**
- **Maven Version Drift CORS Errors**: Fixed "Failed to fetch" errors for Maven packages by switching to ecosyste.ms API
  - **Problem**: Maven Central Search API (`search.maven.org`) blocks cross-origin requests from browsers (CORS policy)
  - **Impact**: 50+ Maven packages (spring-boot, hibernate, jakarta, etc.) showed "Failed to fetch" in console logs
  - **Solution**: Replaced Maven Central Search API with ecosyste.ms Maven registry API (`packages.ecosyste.ms/api/v1/registries/repo1.maven.org`)
  - **Result**: Maven packages now support version drift analysis and latest version checks without CORS errors
  - **Files Changed**: `js/dependency-tree-resolver.js`, `js/version-drift-analyzer.js`
- **Vuln Page Shows 0 Stats Instead of Message**: Changed vuln.html to display vulnerability stats with 0 counts when no analysis exists
  - **Previous Behavior**: Showed "No Vulnerability Analysis Yet" message with explanation
  - **New Behavior**: Shows stats cards (Critical: 0, High: 0, Medium: 0, Low: 0, Packages: 0)
  - **Rationale**: Consistency with dropdown selection behavior - always show stats, even when zero
  - **Impact**: Users see consistent UI whether selecting specific org or viewing aggregated data
  - **Fix**: Modified `generateVulnerabilityAnalysisHTML` else block to render empty stats instead of info message
  - **Location**: `js/view-manager.js` lines 5402-5424
- **Vuln Page Not Showing Content**: Fixed critical bug where vuln.html showed blank page even when data was available
  - **Root Cause**: `loadVulnerabilityData()` didn't pass `noDataSection` parameter to `loadOrganizationData()`
  - **Impact**: When no vulnerability analysis exists, the "No Data Available" section wasn't shown; users saw blank page
  - **Fix**: Added `noDataSection: document.getElementById('noDataSection')` to options in vuln-page.js line 55
  - **Result**: vuln.html now correctly shows either vulnerability data OR "No Data Available" message
  - **Location**: `js/vuln-page.js` line 55
- **Audit Page Not Loading By Default**: Fixed critical bug where audit.html would not load data on initial page load
  - **Root Cause**: Line 185 checked `if (analysisSelector && analysisSelector.value)` before loading data
  - **Impact**: When value is empty string `''` (for aggregated view), the condition was falsy and data never loaded
  - **Fix**: Changed to `if (analysisSelector)` to load data even when value is empty string
  - **Result**: audit.html now correctly loads aggregated audit findings by default
  - **Location**: `js/audit-page.js` lines 185-187
- **Page Loading Issues**: Fixed multiple issues preventing pages from loading aggregated data by default:
  - **audit.html Not Loading**: Removed early return that prevented audit page from loading with aggregated data (empty selector value)
  - **view-manager.js Early Return**: Fixed `updateLicenseCardCounts` to allow empty string for aggregated view
  - **Zero Repos in deps.html**: Added defensive code in storage-manager.js to ensure repositories array is always properly initialized during data merging
  - **License Display Logic**: Enhanced `getDependencyLicenseInfo` to check `dep.raw.license` and `dep.raw.licenseFull` fields for stored license data
    - Now checks 6 license sources: dep.licenseFull, dep.license, dep.raw.licenseFull, dep.raw.license, GitHub Actions metadata, and SBOM originalPackage
    - Should significantly reduce false "unlicensed" counts by properly retrieving stored license data
  - **Vulnerability Loading**: Added logging to vuln-page.js to help identify why vulnerability data may not be showing
  - All pages (audit, vuln, licenses, deps, repos) now properly load and display aggregated data when no specific analysis is selected
- **License Re-fetch Zero Licenses Fetched**: Fixed critical issue where manual license re-fetch was fetching 0 licenses despite 227 unknown licenses
  - **Root Cause**: Dependencies stored in IndexedDB had `version: 'unknown'`, causing deps.dev API to return 404 errors for all requests
  - **Impact**: Manual re-fetch was completely non-functional - all 211 processed dependencies resulted in 0 licenses fetched
  - **Solution**: Added version resolution step BEFORE fetching licenses (same as initial scan)
    - Uses `DependencyTreeResolver.fetchLatestVersion()` to resolve unknown versions
    - Updates `version`, `displayVersion`, and `assumedVersion` fields before API calls
    - Only resolves versions for ecosystems with valid registries (skips GitHub Actions)
    - Added `dependency-tree-resolver.js` to `settings.html` (was missing, causing "not a constructor" error)
  - **Result**: Now properly resolves ~150 PyPI "unknown" versions, enabling successful license fetching
  - **Superseded By**: `js/comprehensive-license-fix.js` (more comprehensive solution combining version resolution, license fetching, and repository fallback)
  - **Location**: `js/license-refetch.js` lines 140-164, `settings.html` line 645
- **License Re-fetch Constructor Error**: Fixed "window.App is not a constructor" error when clicking re-fetch button
  - **Root Cause**: Class is named `SBOMPlayApp` but was not exposed on window object
  - **Fix**: Exposed `SBOMPlayApp` on window and updated license-refetch.js to use `new window.SBOMPlayApp()`
  - **Location**: `js/app.js` line 4430, `js/license-refetch.js` line 131
- **License Re-fetch Data Structure Issue**: Fixed "No analysis data found" error in manual license re-fetch
  - **Root Cause**: `getCombinedData()` returns nested structure `{ data: { allDependencies } }` but code expected flat `{ allDependencies }`
  - **Fix**: Updated license-refetch.js to correctly access `combinedData.data.allDependencies`
  - **Also Fixed**: License updates now properly saved back to IndexedDB using license map to update original entries
  - **Location**: `js/license-refetch.js` lines 32-34, 89-91, 178-213
- **PyPI License Detection Enhanced with PEP 639 Support**: Fixed ~220 PyPI packages incorrectly showing as "unlicensed" when they have valid licenses
  - **Root Cause**: Modern PyPI packages use PEP 639 format with `license_expression` field instead of `license` field, which we weren't checking
  - **Impact**: Before fix, ~220 dependencies (~9.7%) were incorrectly marked as unlicensed, affecting license compliance statistics
  - **Solution Implemented**:
    - **Phase 1 - Enhanced deps.dev parsing**: Filter out unhelpful values like "non-standard", "NOASSERTION", "UNKNOWN"
    - **Phase 2 - PyPI JSON API fallback**: When deps.dev returns no valid license, query PyPI directly and check:
      - `license_expression` field (PEP 639 modern format) - e.g., typing-extensions, urllib3
      - `license` field (older format) - extract SPDX identifiers from full text (e.g., BSD-3-Clause from numpy's license text)
      - License classifiers - convert to SPDX format (e.g., "License :: OSI Approved :: MIT License" → "MIT")
  - **Result**: Expected reduction from 220 unlicensed to ~50-80, improving accuracy from 90.3% to ~96-97% correctly licensed
  - **Verified Examples**:
    - numpy: ✅ BSD-3-Clause (extracted from full license text)
    - typing-extensions: ✅ PSF-2.0 (from `license_expression`)
    - urllib3: ✅ MIT (from `license_expression`)
    - packaging: ✅ Apache-2.0 OR BSD (from classifiers)
    - certifi: ✅ MPL-2.0 (from `license` field)
    - wcwidth: ✅ MIT (from `license` field)
  - **Location**: `js/app.js` lines 3340-3540
  - **Documentation**: `mdfiles/LICENSE_DETECTION_ISSUE.md` - detailed analysis with curl verification examples
- **Dependency Resolution Progress Counter Wrong**: Fixed progress showing incorrect counts like "283/35 direct"  when resolving dependencies
  - **Root Cause**: All ecosystems (npm, PyPI, RubyGems, etc.) were sharing a single `DependencyTreeResolver` instance and resolving in parallel
  - **Impact**: Counter was being incremented by multiple ecosystems simultaneously, showing cumulative count instead of per-ecosystem count
  - **Solution**: Create a new resolver instance for each ecosystem so counters don't interfere
  - **Result**: Progress now correctly shows "1/35 direct", "2/35 direct", etc. for each ecosystem independently
  - **Also Fixed**: Added `depChain` to progress callback so dependency chains display properly
  - **Location**: `js/sbom-processor.js` lines 665-692
- **Unknown Version Dependencies Not Resolved**: Fixed dependencies with missing versions not being properly resolved to latest version
  - **Root Cause**: When latest version was successfully fetched from registry, it was only stored in `displayVersion` and `assumedVersion` fields, but the actual `version` field remained `null`
  - **Impact**: Dependencies with missing versions in SBOM now properly use the resolved latest version for:
    - License fetching (deps.dev API requires version)
    - Vulnerability scanning (OSV API requires version)
    - Version drift analysis (requires version to compare)
    - Dependency keys and display (no more "version unknown" in most cases)
  - **Solution**: When latest version is successfully fetched, update the `version` field to use it (not just `displayVersion`)
  - **Result**: Significantly reduces "version unknown" entries in dependency listings and enables proper license/vulnerability analysis
  - **For New Scans**: Automatic version resolution in `js/sbom-processor.js` lines 316-342
  - **For Existing Data**: Use `js/comprehensive-license-fix.js` migration script to backfill resolved versions
- **License Rendering Inconsistency Between Pages**: Fixed `licenses.html` showing GitHub Actions (e.g., `actions/checkout`) as "unlicensed" when `deps.html` correctly shows MIT license
  - **Root Causes**: 
    - `generateUnlicensedTableData()` and `calculateLicenseCounts()` weren't using unified license info method
    - `getEnrichedGitHubActionLicense()` had incorrect data structure navigation bugs:
      - Looked for `action.metadata.license` instead of `action.license`
      - Looked for `repoData.owner/repo` instead of parsing `repoData.repository`
      - Looked for `repoData.nestedActions` instead of recursively checking `action.nested`
  - **Solution**: 
    - Updated `generateUnlicensedTableData()` and `calculateLicenseCounts()` to use `getDependencyLicenseInfo()`
    - Fixed `getEnrichedGitHubActionLicense()` to correctly navigate GitHub Actions analysis structure
    - Fixed property access: `action.license` (not `action.metadata.license`)
    - Fixed repository matching: parse `repoData.repository` string (`"owner/repo"` format)
    - Fixed nested action search: recursively traverse `action.nested` arrays
  - **Impact**: All pages now show consistent license information for GitHub Actions dependencies
    - Stats cards at top of `licenses.html` now reflect correct counts
    - License Types table shows correct categorization  
    - Unlicensed table no longer falsely includes GitHub Actions with valid licenses
  - **Affected Pages**: `licenses.html` (Stats cards, License Types table, Unlicensed table)
  - **Location**: `js/view-manager.js` lines 2766-2810 (getEnrichedGitHubActionLicense), 3132-3360 (calculateLicenseCounts), 3499-3510 (generateUnlicensedTableData)
- **Vulnerability Page Load More Button**: Changed "Load More" to show all remaining entries at once
  - Button now says "Show All Remaining (X)" instead of "Load More (X remaining)"
  - Clicking button loads all remaining vulnerabilities in one batch instead of 25 at a time
  - **Rationale**: Similar to deps page improvement - users either want quick overview (first 25) or complete list
  - **Impact**: Faster access to full vulnerability list without multiple clicks
  - **Location**: `js/view-manager.js` lines 5360-5370, 5654, 5713
- **Dependencies Page Navigation**: Replaced pagination with simpler "Show Top 25 / Show All" dropdown
  - Removed Previous/Next buttons and page size selector (10/25/50/100/250/500 options)
  - Added simple dropdown: "Show Top 25" (default) or "Show All" dependencies
  - **Rationale**: Pagination with incremental loading (25 at a time) is tedious; users either want quick overview (top 25) or complete list
  - **Impact**: Cleaner, more intuitive UI; faster access to full dependency list
  - **Location**: `deps.html`
- **Dependency Resolution Progress Display**: Improved clarity and removed duplicate UI elements
  - Progress now shows which direct dependency is being processed (e.g., "1/6 direct", "2/6 direct")
  - Added full dependency chain from direct dependency to current package (e.g., "express → body-parser → raw-body → bytes")
  - Shows transitive depth visually: "Resolving npm dependencies (1/6 direct) → A → B → C → ansi-styles"
  - Removed duplicate secondary progress bar (`dependencyProgressSection`)
  - Progress updates show complete dependency path with visual chain representation
  - **Impact**: Clearer progress tracking, shows exact resolution depth and path, better understanding of transitive dependencies
- **Simplified Analysis Selection**: Removed confusing "__ALL__" identifier from UI
  - All pages now show aggregated data by default (labeled as "All Analyses")
  - Dropdown allows filtering to specific organization/repository
  - Removed "All Projects (Combined)" option from dropdowns
  - Empty dropdown value = show aggregated data from all analyses
  - Cleaner, simpler UX with no special internal identifiers exposed to users
  - **Impact**: Simplified interface, clearer data presentation, better user experience

### Fixed
- **Licenses Page Issues**: Fixed __ALL__ appearing in dropdown and aggregated view not loading
  - **Problem 1**: `__ALL__` legacy identifier was showing in analysis selector dropdown
  - **Problem 2**: "All Analyses" option didn't load data - showed "Please select an analysis" message
  - **Root Cause 1**: `page-common.js` wasn't filtering out `__ALL__` entries when populating dropdowns
  - **Root Cause 2**: `licenses-page.js` had `if (!analysisName) return;` check preventing empty string (aggregated view) from loading
  - **Solution**: Added filter to exclude `__ALL__` in `page-common.js`; removed early return check in `licenses-page.js`
  - **Impact**: Licenses page now shows cumulative data by default without `__ALL__` clutter
  - **Location**: `js/page-common.js` lines 31-33, `js/licenses-page.js` lines 32-36
- **Version Upgrade Badges Not Showing in Vulnerability Page**: Fixed missing version drift badges and archived tags in vulnerability analysis
  - **Problem**: Version upgrade badges (major/minor) and archived repository tags were not appearing for vulnerable dependencies
  - **Root Cause**: Vulnerable dependencies created in `osv-service.js` only included name, version, and vulnerabilities - missing version drift and other metadata
  - **Solution**: Added full metadata (versionDrift, ecosystem, category) when creating vulnerable dependencies; updated view-manager to use this data directly
  - **Impact**: Vulnerable dependencies now show version upgrade badges and archived tags correctly
  - **Location**: `js/osv-service.js` lines 345-361 (2 occurrences), `js/view-manager.js` lines 5238-5267
- **Function Call Parameter Mismatch**: Fixed incorrect function calls to `loadAnalysesList()` across multiple pages
  - **Problem**: Pages were calling `loadAnalysesList()` with extra boolean parameter that doesn't exist in function signature
  - **Root Cause**: Function signature is `loadAnalysesList(selectorId, storageManager, noDataSection)` but calls had 4 parameters including a boolean
  - **Solution**: Removed extra parameter from function calls in `licenses-page.js`, `audit-page.js`, and `vuln-page.js`
  - **Impact**: Fixes "Cannot set properties of undefined (setting 'display')" error on page load
  - **Location**: `js/licenses-page.js` line 17, `js/audit-page.js` line 49, `js/vuln-page.js` line 40
- **Vulnerability Page Not Showing Aggregated Data**: Fixed vuln.html requiring organization selection instead of showing cumulative data by default
  - **Problem**: Similar to deps.html issue - `if (!analysisName) return;` check prevented loading when empty string is selected for aggregated view
  - **Root Cause**: Empty string is falsy in JavaScript, causing early return
  - **Solution**: Removed early return check since empty string is valid for aggregated view
  - **Impact**: Vulnerability page now shows cumulative data from all analyses by default
  - **Location**: `js/vuln-page.js` lines 46-49
- **Dependency Resolution Progress Display Issues**: Fixed wrong ecosystem and counter display during transitive dependency resolution
  - **Problem 1**: Progress showed wrong ecosystem (e.g., "Resolving npm dependencies" when scanning Go packages)
  - **Problem 2**: Counter showed nonsensical values (e.g., "339/133 direct" where processed > total)
  - **Root Cause**: `updateProgress()` method didn't pass `ecosystem` parameter, causing app.js to reuse cached ecosystem from previous packages
  - **Solution**: Added `currentEcosystem` and `currentDirectDep` tracking, ensured ecosystem is always passed in progress updates
  - **Impact**: Progress now correctly shows current ecosystem and accurate direct dependency counter (e.g., "Resolving go dependencies (12/133 direct)")
  - **Location**: `js/dependency-tree-resolver.js` lines 21-22, 132-144, 167-187, 228
- **Legacy __ALL__ Entries in Dropdowns**: Filtered out `__ALL__` entries from analysis selector dropdowns
  - **Problem**: After removing `__ALL__` identifier, old database entries still contained `__ALL__` as an organization name
  - **Solution**: Added filter to exclude `__ALL__` entries when populating analysis selector dropdowns
  - **Impact**: Cleaner dropdowns without legacy internal identifiers
  - **Location**: `deps.html` lines 475-490, `js/repos-page.js` lines 99-120
- **Critical: Pages Not Loading Tables**: Fixed `deps.html` and `repos.html` not displaying tables when aggregated view is selected
  - **Problem**: After removing `__ALL__` and using empty string `''` for aggregated view, pages had `if (!analysisName) return;` check that prevented data loading
  - **Root Cause**: Empty string is falsy in JavaScript, so the condition returned early without loading any data
  - **Solution**: Removed the early return check since empty string is a valid value for aggregated view
  - **Impact**: Fixes complete failure to display any data on deps and repos pages
  - **Location**: `deps.html` line 646, `js/repos-page.js` line 221
- **Transitive Dependency Parent Display**: Fixed missing parent information for transitive dependencies in `deps.html`
  - **Problem**: Transitive dependencies showed "Unknown" for parents even though parent data was correctly stored in IndexedDB
  - **Root Cause**: `processData()` function created a new `parents` Set but only populated it from SBOM relationships and GitHub Actions analysis, never using the `dep.parents` array from dependency tree resolution
  - **Solution**: Added code to merge `dep.parents` from stored data into the parents Set
  - **Impact**: All transitive dependencies now correctly display their parent packages (e.g., "1 parent", "3 parents")
  - **Location**: `deps.html` lines 1048-1055
- **Scoped Package Name Parsing (CRITICAL)**: Fixed transitive dependencies with scoped names having empty name field
  - **Problem**: Scoped npm packages (e.g., `@jest/core@29.7.0`, `@babel/parser@7.23.6`) discovered during dependency tree resolution had empty names
  - **Root Cause**: `packageKey.split('@')` on `@jest/core@29.7.0` produced `['', 'jest/core', '29.7.0']`, setting `name = ''` and `version = 'jest/core@29.7.0'`
  - **Solution**: Now uses `lastIndexOf('@')` to find version separator for scoped packages
  - **Impact**: Fixes ~324 transitive dependencies per typical npm project, resolves "Version Sprawl" empty package name display issue
  - **Location**: `js/sbom-processor.js` lines 732-750
- **Geocoding Performance**: Integrated geocoding with GitHub profile fetching instead of bulk processing
  - Geocoding now happens inline when fetching GitHub profiles for authors (with visible logging)
  - Previously: bulk geocoded 181 locations as separate phase at 95% progress
  - Now: geocodes during GitHub data extraction phase (faster, better progress tracking)
  - Also geocodes authors who have location from package registries but need country code
  - Batch geocoding at end remains as failsafe for locations from non-GitHub sources
  - **Impact**: Eliminates large bulk geocoding phase, improves performance and UX
  - **Added**: Console logging to show when geocoding happens during GitHub fetch (e.g., `📍 Geocoded location during GitHub fetch for author: "San Francisco" → US`)
- **License Data Persistence (CRITICAL)**: Fixed key format mismatch preventing license data from being saved to database
  - License fetching was successful (1200+ licenses fetched from APIs) but updates failed due to key mismatch
  - Updated `fetchLicensesForAllEcosystems()`, `fetchPyPILicenses()`, and `fetchGoLicenses()` to use correct dependency key format (`name@version` instead of `ecosystem:name@version`)
  - Licenses now properly persist to IndexedDB and display correctly on all pages
  - **Impact**: Resolves 100% license data loss issue
- **Statistics Count Accuracy**: Fixed mismatch between reported and actual dependency counts
  - `statistics.totalDependencies` now uses actual global dependency count (includes transitive dependencies)
  - Previously showed only direct SBOM dependencies (e.g., 126) instead of full count including deep resolution (e.g., 1888)
  - Updated `getRepositoryStats()` to use `this.dependencies.size` instead of stale per-repository counts
  - **Impact**: Resolves 93% undercounting of dependencies in reports and logs
- **Audit Page UI Improvements**: Enhanced "more items" display with interactive modals
  - Multiple locations (2-3): Now shows all locations inline instead of "+ X more location(s)" text
  - Many locations (4+): Displays clickable link that opens modal with complete list
  - Repository lists: Shows all repos (≤3) or modal with all repos (>3)
  - Version drift: Button to view all packages when more than 100 results
  - **Impact**: Eliminates non-interactive "+ X more" text, improves UX with proper modals
- **Authors Page Profile URLs**: Fixed 404 errors on npm, RubyGems, Cargo, and PyPI profile links
  - Profile URLs now only generated when verified username is available in metadata
  - Previously fell back to display names (e.g., "Sindre Sorhus") which caused 404s
  - Now requires `npm_username`, `rubygems_username`, `cargo_username`, or `pypi_username` from metadata
  - Ecosyste.ms links also require verified usernames
  - **Impact**: Eliminates broken profile links, shows only valid URLs that work

### Fixed
- **PyPI Username Extraction (CRITICAL)**: Fixed incorrect PyPI profile URLs (404 errors)
  - **Problem**: PyPI usernames were incorrectly extracted from email addresses (e.g., "marcelo" from "marcelo@trylesinski.com")
  - **Example**: Marcelo Trylesinski's profile generated as `/user/marcelo/` instead of correct `/user/Kludex/`
  - **Root Cause**: PyPI JSON API doesn't provide usernames, code was inferring from email prefix (unreliable)
  - **Solution**: Removed email-based username extraction, only use verified usernames from ecosyste.ms API
  - PyPI profile links now only appear when ecosyste.ms has provided the actual PyPI username
  - **Impact**: Eliminates all PyPI profile 404 errors, ensures only working links are shown
- **Authors Page Function Call Error**: Fixed `authorService.isUrlFromHostname is not a function` error
  - Changed `authorService.isUrlFromHostname()` to `isUrlFromHostname()` (utility function from utils.js)
  - Affects funding URL validation in author details modal and table cells
  - **Impact**: Funding platform detection now works correctly without console errors

### Changed
- **Authors Page Display**: Replaced pagination with simple "Show Top 25 / Show All" toggle
  - Removed complex pagination controls (page size selector, prev/next buttons)
  - Default shows top 25 authors (by repository usage and package count)
  - Toggle buttons in filter section with clear icons and labels
  - Quick-access "Show All X Authors" button appears directly in results when limited
  - Clicking quick-access button switches to "All Authors" view and scrolls to top
  - Preference saved to localStorage
  - **Impact**: Simpler, cleaner UI with faster access to all authors

### Added
- **Analysis Timing and Statistics Tracking**: Comprehensive metadata now saved with every analysis
  - **Timing Data**: startTime, endTime, durationMs, durationFormatted (human-readable)
  - **Ecosystem Statistics**: Dependency count per ecosystem (npm, PyPI, Maven, Go, etc.)
    - Total count, direct count, transitive count, unique packages per ecosystem
  - **Repository Statistics**: Count and dependency totals grouped by language
  - **License Statistics**: Total licenses, licensed vs unlicensed counts, top licenses by frequency
  - **Phase Timing**: Duration breakdown by analysis phase (SBOM processing, dep resolution, vulnerability analysis, etc.)
  - All metadata accessible via IndexedDB for historical analysis
  - Console logs display: `⏱️ Total Time: Xm Ys` and `⏱️ Duration (ms): XXXXms`
  - **Impact**: Full visibility into analysis performance and dependency composition
- **Enhanced Dependency Resolution Progress**: Secondary progress bar now displays detailed package-level progress during dependency tree resolution
  - Shows current package name being processed (extracted from package key)
  - Displays countdown with "X/Y processed" badge and "(Z remaining)" count
  - Progress bar fills incrementally as each package completes
  - Shows ecosystem name (e.g., npm, PyPI, RubyGems) being processed
  - Real-time feedback during dependency resolution phase
- **Latest Version Fallback**: When package version is missing from SBOM, automatically fetch and use latest version from registry
  - Stores both `version` (null) and `assumedVersion` (latest) in dependency objects
  - Displays "latest (assumed)" instead of "version unknown" for better data completeness
  - Ensures depth information is captured during dependency tree resolution
- **Version Drift Analysis During Scan**: Version drift data is now fetched and stored during initial analysis phase
  - Version drift information available immediately after analysis completes
  - No longer requires visiting deps.html page to trigger version drift calculation
- **RubyGems ecosyste.ms Integration**: Added ecosyste.ms API support for RubyGems dependencies and author data
  - Uses `https://packages.ecosyste.ms/api/v1/registries/rubygems.org/packages` as primary source
  - Bypasses RubyGems API CORS limitations (verified via HEAD requests) by using ecosyste.ms proxy
  - Improved RubyGems dependency resolution and author information
- **GitHub Actions License Extraction**: Enhanced license detection for GitHub Actions
  - Fetches license from GitHub repository API (similar to Go modules)
  - Attempts to extract license from LICENSE file at specific tag/ref when available
  - Falls back to default branch if tag doesn't exist
  - Improved license coverage for GitHub Actions dependencies
- **Bot Account Detection**: Separate handling and display of bot accounts in author analysis
  - Detects bot accounts based on name patterns (e.g., `[bot]` suffix) and metadata
  - New "Active Bots in the Environments" table in authors.html
  - Bot accounts excluded from regular author statistics
  - Bot-specific metadata and purpose tracking
- **Dual License Support**: Enhanced license processing to detect and classify dual licenses
  - Detects dual licenses containing "OR", "|", or "/" separators
  - Classifies under least restrictive license from the set
  - Marks dependencies with `isDualLicense: true` flag
  - Displays both licenses in UI with "Dual" badge and full license text in tooltips
- **Independent Entity Detection**: Identifies and marks dependencies with no dependencies of their own
  - Independent entities marked with special flag and "Independent" badge
  - Stale independent entities styled with blue color (instead of red/yellow) to indicate different risk profile
  - Independent entities can remain stale longer without concern
- **GitHub Actions Dependency Graph**: Enhanced workflow parsing to capture complete dependency graph
  - Tracks action lineages (which actions use which other actions)
  - Captures reusable workflows in addition to action steps
  - Stores complete dependency graph with direct dependencies, transitive dependencies, lineage, ancestors, and descendants
  - Improved nested action detection and tracking
- **License Normalization**: Fixed false positives in license change detection
  - Added `normalizeLicenseName()` function to handle license variants (e.g., "GPL-3" vs "GPL-3-only" vs "GPL-3.0")
  - Maps license variants to canonical forms before comparison
  - Prevents false positives when comparing similar license versions

### Changed
- **Default API Timeout**: Increased default API request timeout from 5 seconds to 10 seconds
  - Updated in `js/utils.js`, `settings.html`, and `js/settings.js`
  - Reduces timeout errors during dependency resolution
  - Still configurable via Settings page

### Fixed
- **deps.html Load More Button**: Fixed null reference error when loadMoreBtn element doesn't exist
  - Added defensive null check before attaching event listener
  - Prevents JavaScript errors when button is not present in DOM

## [0.0.3] - 2025-11-17

### Added
- **Repository View Page**: New `repos.html` page for repository-focused statistics and analysis
  - Repository statistics table with SBOM status, vulnerability counts, dependency counts, author counts, and license info
  - Clickable columns navigate to respective pages with repository filter applied
  - Search, sorting, CSV export, and URL parameter support (`org`, `search`)
- **Unified Audit Findings**: Consolidated GitHub Actions and SBOM Deficiencies into single audit findings section
  - Collapsible accordion sections with finding type descriptions shown once per type
  - Direct links to GitHub files with line numbers for audit findings
  - Repository links in SBOM findings navigate to dependency view with filters applied
- **Repository Filter Parameter**: Added `repo` URL parameter support across `deps.html`, `vuln.html`, `licenses.html`, and `authors.html` for deep linking and cross-page navigation

### Changed
- **Code Organization**: Extracted all inline JavaScript and CSS from HTML files to separate files
  - Created `js/utils.js` for shared utility functions
  - Created `js/index-page.js` for index.html-specific functionality
  - Consolidated CSS into utility classes and removed redundant rules
- **Navigation Menu**: Streamlined menu labels ("Vulnerabilities" → "Vulns", "Dependencies" → "Deps", "Analysis" → "Home") and added "Repos" link
- **Theme Support**: Enhanced dark mode with theme-aware CSS variables for table headers, footers, stat boxes, badges, and Bootstrap utility classes
- **Progress Tracking**: Implemented phase-based progress tracking with weighted phases and enhanced status messages
- **Audit Findings Display**: Streamlined display by removing redundant columns and consolidating finding descriptions

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

