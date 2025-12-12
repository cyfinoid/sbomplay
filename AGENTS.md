# Agent Instructions

## Architecture Overview

### Data Input Sources (Two Entry Points, One Processing Pipeline)

The application supports two ways to get SBOM data:

1. **GitHub Dependency Graph** (`app.js`) - Fetches SBOMs via GitHub API
2. **Direct Upload** (`upload-page.js`) - User uploads SPDX/CycloneDX files

**CRITICAL**: Both entry points MUST use the same processing pipeline and shared services. Do NOT create duplicate implementations.

### Processing Pipeline (Shared)

After SBOM data is obtained (from either source), the processing flow is:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA INPUT LAYER                              │
├──────────────────────────┬──────────────────────────────────────────┤
│      index.html          │              upload.html                  │
│      (GitHub API)        │             (File Upload)                 │
│           ↓              │                  ↓                        │
│        app.js            │           upload-page.js                  │
└──────────┬───────────────┴──────────────────┬───────────────────────┘
           │                                  │
           ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SHARED PROCESSING LAYER                          │
├─────────────────────────────────────────────────────────────────────┤
│  SBOMParser (sbom-parser.js) - Parse SPDX/CycloneDX                 │
│  SBOMProcessor (sbom-processor.js) - Build dependency graph          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ENRICHMENT LAYER (SHARED)                        │
├─────────────────────────────────────────────────────────────────────┤
│  EnrichmentPipeline (enrichment-pipeline.js) - Orchestrates:        │
│    ├── OSVService - Vulnerability analysis                          │
│    ├── License fetching (deps.dev + GitHub fallback)                │
│    ├── VersionDriftAnalyzer - Version drift/staleness               │
│    └── AuthorService - Author/maintainer info                       │
│                                                                      │
│  app.js helper: runLicenseAndVersionDriftEnrichment()               │
│    └── Calls existing detailed methods (PyPI, Go, all ecosystems)   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       STORAGE LAYER (SHARED)                         │
├─────────────────────────────────────────────────────────────────────┤
│  StorageManager (storage-manager.js) - Save/load analysis            │
│  IndexedDBManager (indexeddb-manager.js) - Low-level DB ops          │
│  CacheManager (cache-manager.js) - API response caching              │
└─────────────────────────────────────────────────────────────────────┘
```

### Shared Services (Use These, Don't Duplicate)

| Service | File | Purpose |
|---------|------|---------|
| `EnrichmentPipeline` | `enrichment-pipeline.js` | **Orchestrates all enrichment** (vuln, license, drift, authors) |
| `SBOMParser` | `sbom-parser.js` | Parse SPDX/CycloneDX to internal format |
| `SBOMProcessor` | `sbom-processor.js` | Process SBOM, build dependency graph |
| `OSVService` | `osv-service.js` | Vulnerability lookups via OSV API |
| `VersionDriftAnalyzer` | `version-drift-analyzer.js` | Check for newer versions via deps.dev |
| `AuthorService` | `author-service.js` | Fetch author/maintainer info |
| `StorageManager` | `storage-manager.js` | Save/load analysis data |
| `IndexedDBManager` | `indexeddb-manager.js` | Low-level IndexedDB operations |
| `CacheManager` | `cache-manager.js` | Caching layer for API responses |

### EnrichmentPipeline Usage

The `EnrichmentPipeline` class provides a unified way to run all enrichment:

```javascript
// In upload-page.js (and can be used anywhere)
const pipeline = new EnrichmentPipeline(sbomProcessor, storageManager);
const enrichedResults = await pipeline.runFullEnrichment(results, identifier, onProgress);

// In app.js - uses helper method that calls existing detailed implementations
results = await this.runLicenseAndVersionDriftEnrichment(results, identifier, onProgress);
```

### Anti-Patterns to Avoid

1. **Duplicate utility functions** - If `app.js` has a method, don't recreate it in `upload-page.js`
2. **Parallel implementations** - Don't create `license-fetcher.js` if license fetching exists in `app.js`
3. **Missing enrichment** - If GitHub flow fetches authors, upload flow must too
4. **Different data shapes** - Both flows must produce identical output structure

### When Adding New Features

1. Check if feature exists in `app.js` first
2. If yes, extract to shared service if not already
3. Use shared service from both `app.js` and `upload-page.js`
4. Never implement the same logic twice

## Code Quality Standards

### No Inline CSS/JavaScript
- **Never** add inline `style=""` attributes - use CSS classes in `css/style.css` or `css/themes.css`
- **Never** add inline `<script>` blocks - extract to `js/` files
- **Never** add inline `onclick=""` handlers - use `addEventListener` in JS files
- **Note**: Dynamic style updates via JavaScript (e.g., `element.style.width = '50%'`) are acceptable for runtime values
- Check with: `grep -r "style=" *.html` and `grep -r "onclick=" *.html`

### CSS Organization
- Base styles → `css/style.css`
- Theme-specific → `css/themes.css`
- Use CSS variables (`var(--bg-primary)`) instead of hardcoded colors
- Theme-aware utilities: `.bg-light`, `.text-dark` use CSS variables

### JavaScript Organization
- Page-specific JS → `js/{page}-page.js` (e.g., `deps-page.js`, `vuln-page.js`)
- Shared utilities → `js/utils.js` (escapeHtml, escapeJsString, isUrlFromHostname)
- Load `utils.js` before other scripts in HTML

### Security
- **Always** use `safeSetHTML()` instead of `innerHTML` for user data
- **Always** escape HTML: `escapeHtml()` before DOM insertion
- **Always** escape JS strings: `escapeJsString()` for event handlers
- **Always** validate URLs: `isUrlFromHostname()` instead of `.includes()` checks for hostname validation
  - **Note**: Path checks (e.g., `url.includes('/dependency-graph/sbom')`) are acceptable for API endpoint detection
  - Use `isUrlFromHostname()` when checking if a URL belongs to a specific domain/hostname
- External links: `target="_blank" rel="noreferrer noopener"`

## Workflow Maintenance

### Update Workflow Files
When adding/modifying HTML/JS files, update:
1. **`.github/workflows/deploy-github-pages.yml`**:
   - Add new HTML files to copy step (lines 48-57)
   - Update file count in summary
2. **`.github/workflows/validate-deployment.yml`**:
   - Add HTML files to `REQUIRED_HTML` array (lines 29-39)
   - Add JS files to `REQUIRED_JS` array (lines 80-105)
   - Add CSS files to `REQUIRED_CSS` array (lines 125-128)

### Version String Updates
On release, update cache-busting version strings:
- Pattern: `?v=X.Y.Z` in all HTML files
- Files: `index.html`, `licenses.html`, `vuln.html`, `deps.html`, `settings.html`, `authors.html`, `repos.html`, `about.html`, `debug.html`, `audit.html`, `upload.html`
- Update CSS/JS references: `<link href="css/style.css?v=X.Y.Z">` and `<script src="js/*.js?v=X.Y.Z">`

### Cache Busting
**CRITICAL: NEVER use inline JavaScript for cache busting.**
- **DO NOT** add `<script>` blocks to dynamically modify src attributes
- **DO** directly modify the src attribute values in HTML files: `<script src="js/file.js?v=0.0.3&cb=1732345678901"></script>`
- Add `&cb=<timestamp>` directly to each script tag's src attribute
- This ensures browsers always load fresh JavaScript files without relying on JavaScript execution

## CHANGELOG Maintenance

### Format
- Follow [Keep a Changelog](https://keepachangelog.com/) format
- Sections: `Added`, `Changed`, `Fixed`, `Removed`, `Security`
- Use nested bullets for related changes
- Include version in header: `## [X.Y.Z] - YYYY-MM-DD`

### Common Patterns
- **Added**: New features, pages, functionality
- **Changed**: Modifications to existing features
- **Fixed**: Bug fixes (reference issues if applicable)
- **Removed**: Deprecated/removed features
- **Security**: XSS fixes, input validation, security enhancements

### Update Checklist
- [ ] Add entry under appropriate section
- [ ] Use consistent formatting
- [ ] Reference related fixes together
- [ ] Update version number
- [ ] Add date for new releases

## Flowchart Documentation Maintenance

### When to Update `flowchart.md`
Update when logical flow changes occur:
- New analysis phases added/removed
- Process order changes (e.g., analysis steps reordered)
- New decision points or conditional logic added
- Component initialization changes
- Storage operations modified
- Error handling flows changed
- New features that alter existing flows

### Update Process
1. Identify affected flow(s) in `flowchart.md` (see Table of Contents)
2. Review actual code flow in relevant JS files
3. Update Mermaid flowchart syntax to match implementation
4. Update "Key Steps" or "Key Features" sections if needed
5. Verify flowchart syntax renders correctly (Mermaid preview)

### Flowchart Structure
- Each flow has: Title, Description, Mermaid diagram, Key Steps/Features
- Use consistent node shapes: rectangles (processes), diamonds (decisions), rounded (start/end)
- Color coding: blue (start), green (success), red (error), yellow (warning), purple (important step)

### Common Flow Changes
- **Phase additions**: Add to phase list and update progress weights
- **New conditionals**: Add decision diamond with branches
- **Component changes**: Update initialization/component setup flows
- **Error handling**: Add error paths and recovery flows

## Unused Function Detection

### Detection Method
1. Search function definitions: `grep -r "function.*(" js/`
2. Search function calls: `grep -r "functionName(" js/`
3. Check HTML event handlers: `grep -r "functionName" *.html`
4. Verify exports: Check if function is exported/used in other modules

### Common Patterns
- Helper functions only used once → inline or remove
- Duplicate utility functions → consolidate in `utils.js`
- Page-specific functions → ensure they're called from page JS

## File Structure

### Markdown File Organization
- **All markdown documentation files** → `mdfiles/` folder
- **Exceptions** (keep in root): `README.md`, `CHANGELOG.md`, `flowchart.md`, `AGENTS.md`, `LICENSE`
- When creating new markdown files (documentation, reports, analysis), place them in `mdfiles/`
- Examples: `mdfiles/IMPLEMENTATION_SUMMARY.md`, `mdfiles/DEPENDENCY_RESOLUTION_STATUS.md`

### Required Files (per workflow validation)
**HTML**: `index.html`, `licenses.html`, `vuln.html`, `deps.html`, `settings.html`, `authors.html`, `repos.html`, `about.html`, `audit.html`, `debug.html`, `upload.html`

**JS**: All files in `js/` directory (see `validate-deployment.yml` lines 80-105)

**CSS**: `css/style.css`, `css/themes.css`

## Pre-Commit Checklist

- [ ] No inline CSS (`style=""`)
- [ ] No inline JavaScript (`<script>` blocks or `onclick=""`)
- [ ] All user data escaped (HTML/JS)
- [ ] Workflow files updated if files added/removed
- [ ] Version strings updated on release
- [ ] CHANGELOG.md updated
- [ ] flowchart.md updated if logical flows changed
- [ ] No unused functions (verify usage)
- [ ] CSS uses variables, not hardcoded colors
- [ ] External links have security attributes
- [ ] New markdown files placed in `mdfiles/` folder (except core files)

## API Integration Patterns

### GitHub GraphQL API
- **User vs Organization**: Query separately (`user(login:)` and `organization(login:)`), don't use fragments
- **Organization fields**: Organization type doesn't have `company` field (only User has it)
- **Error handling**: GraphQL errors fall back to REST API automatically

### External API Queries
- **Skip unknown versions**: Don't query deps.dev API for `version === 'unknown'` or `version === null` (causes 404s)
- **Built-in modules**: Skip PyPI queries for built-in Python modules (json, sys, os, etc.) - they're not PyPI packages
- **Version normalization**: Use `normalizeVersion()` for flexible version matching

## Data Consistency Patterns

### License Fetching
- **Update both sources**: When fetching licenses, update both `results.allDependencies` array AND `sbomProcessor.dependencies` Map
- **Re-export after fetching**: Call `exportData()` again after license fetching to include fetched licenses in results
- **Include in export**: `exportData()` must include `license` and `licenseFull` fields for persistence

### Version Matching
- **Flexible matching**: When matching vulnerabilities to dependencies, check `version`, `displayVersion`, `assumedVersion`, and normalized versions
- **Reason**: Vulnerability analysis uses `dep.version` but `exportData()` uses `displayVersion || dep.version`
- **Transitive dependencies**: Use ecosystem context when categorizing (don't infer from name only)

### Vulnerability-Repository Linking
- **Always has repo**: Vulnerabilities always come from repositories - if "Repository usage information not available", it's a data integrity issue
- **Matching logic**: Use flexible version matching (see above) to find dependency in `allDependencies`
- **Logging**: Add warnings when dependency/repository not found for debugging

## UI Patterns

### Badge Placement
- **Inline badges**: Version upgrade badges should be inline with package name (use flexbox: `d-flex align-items-center`)
- **Show both**: Display both major AND minor badges if both `hasMajorUpdate` and `hasMinorUpdate` are true (use separate `if` statements, not `else if`)

## Common Mistakes to Avoid

1. **Hardcoded colors** → Use CSS variables (`var(--bg-primary)`)
2. **Unsafe HTML insertion** → Use `safeSetHTML()` or escape
3. **URL validation with `.includes()`** → Use `isUrlFromHostname()`
4. **Forgot to update workflows** → Check both workflow files
5. **Version strings not updated** → Update all HTML files on release
6. **Flowchart not updated** → Update `flowchart.md` when flows change
7. **Inline styles/scripts** → Extract to separate files
8. **Duplicate utility functions** → Consolidate in `utils.js`
9. **Markdown files in wrong location** → Place documentation/reports in `mdfiles/` folder
10. **GraphQL fragments on unions** → Query User and Organization separately
11. **Version mismatch** → Use flexible version matching (version, displayVersion, normalized)
12. **License not persisting** → Update both results array and original dependency objects, then re-export
13. **Duplicate enrichment logic** → Use `EnrichmentPipeline` class, don't reimplement in page-specific JS
14. **Missing enrichment in upload flow** → Upload must use same enrichment as GitHub flow (AuthorService, etc.)

