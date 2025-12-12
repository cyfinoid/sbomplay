# Agent Instructions

## Architecture Overview

Two entry points, one shared pipeline:
- **GitHub API** (`index.html` → `app.js`) - Fetches SBOMs from GitHub
- **File Upload** (`upload.html` → `upload-page.js`) - User uploads SPDX/CycloneDX

**CRITICAL**: Both MUST use the same shared services. Never duplicate implementations.

```
Input → SBOMParser → SBOMProcessor → EnrichmentPipeline → StorageManager → IndexedDB
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     │ OSVService, VersionDriftAnalyzer,         │
                     │ AuthorService, License fetching (deps.dev)│
                     └───────────────────────────────────────────┘
```

### Shared Services

| Service | File | Purpose |
|---------|------|---------|
| `EnrichmentPipeline` | `enrichment-pipeline.js` | Orchestrates vuln/license/drift/author enrichment |
| `SBOMParser` | `sbom-parser.js` | Parse SPDX/CycloneDX to internal format |
| `SBOMProcessor` | `sbom-processor.js` | Build dependency graph |
| `OSVService` | `osv-service.js` | Vulnerability lookups (OSV API) |
| `VersionDriftAnalyzer` | `version-drift-analyzer.js` | Check for newer versions |
| `AuthorService` | `author-service.js` | Author/maintainer info |
| `StorageManager` | `storage-manager.js` | Save/load analysis |

### Adding New Features
1. Check if feature exists in `app.js` first
2. Extract to shared service if not already shared
3. Use from both `app.js` and `upload-page.js`

## Code Standards

### No Inline Code
- No `style=""` → use CSS classes
- No `<script>` blocks → use `js/` files  
- No `onclick=""` → use `addEventListener`
- Dynamic JS styles (e.g., `element.style.width`) are OK

### CSS
- Base: `css/style.css` | Themes: `css/themes.css`
- Use `var(--bg-primary)` not hardcoded colors

### JavaScript
- Page-specific: `js/{page}-page.js`
- Shared utilities: `js/utils.js`

### Security
- Use `safeSetHTML()` not `innerHTML` for user data
- Use `escapeHtml()` / `escapeJsString()` for escaping
- Use `isUrlFromHostname()` not `.includes()` for URL validation
- External links: `target="_blank" rel="noreferrer noopener"`

## Workflow & Release

### When Adding/Removing Files
Update both workflow files:
- `.github/workflows/deploy-github-pages.yml` - copy step
- `.github/workflows/validate-deployment.yml` - REQUIRED_* arrays

### Cache Busting
- Pattern: `?v=X.Y.Z&cb=<timestamp>` on all script/CSS tags
- **Never** use inline JS for cache busting - edit src attributes directly
- HTML files: `index.html`, `upload.html`, `licenses.html`, `vuln.html`, `deps.html`, `settings.html`, `authors.html`, `repos.html`, `about.html`, `debug.html`, `audit.html`

### CHANGELOG
- Format: [Keep a Changelog](https://keepachangelog.com/)
- Sections: `Added`, `Changed`, `Fixed`, `Removed`, `Security`
- Header: `## [X.Y.Z] - YYYY-MM-DD`

### Flowchart
Update `flowchart.md` when:
- Analysis phases added/removed/reordered
- New decision points or conditional logic
- Storage operations modified

## File Organization

- Markdown docs → `mdfiles/` folder
- Root exceptions: `README.md`, `CHANGELOG.md`, `flowchart.md`, `AGENTS.md`, `LICENSE`

## API Patterns

### External APIs
- Skip deps.dev queries for `version === 'unknown'` or `null`
- Skip PyPI for built-in modules (json, sys, os, etc.)
- Go versions need "v" prefix for deps.dev
- Clean version ranges before API calls (`1.0.108,< 2.0.0` → `1.0.108`)

### Data Consistency
- Update both `results.allDependencies` AND `sbomProcessor.dependencies` Map
- Call `exportData()` after fetching licenses to persist them
- Use flexible version matching: `version`, `displayVersion`, `assumedVersion`

### GitHub GraphQL
- Query User and Organization separately (no fragments on unions)
- Organization type lacks `company` field (User only)

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Hardcoded colors | Use CSS variables |
| `innerHTML` with user data | Use `safeSetHTML()` |
| `.includes()` for URL validation | Use `isUrlFromHostname()` |
| Duplicate enrichment logic | Use `EnrichmentPipeline` |
| Forgot workflow updates | Check both workflow files |
| Version mismatch | Use flexible matching |
| License not persisting | Update both sources, re-export |
| Inline styles/scripts | Extract to CSS/JS files |

## Pre-Commit Checklist

- [ ] No inline CSS/JS
- [ ] User data escaped
- [ ] Workflows updated (if files added/removed)
- [ ] CHANGELOG.md updated
- [ ] flowchart.md updated (if flows changed)
- [ ] CSS uses variables
- [ ] External links have security attrs
