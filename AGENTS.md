# Agent Instructions

## Architecture Overview

Single entry point with unified pipeline:
- **Main App** (`index.html` → `app.js`) - Fetches SBOMs from GitHub or accepts file uploads

**CRITICAL**: All features MUST use shared services. Never duplicate implementations.

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
3. Add to `common.js` if reusable across pages

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
- Common utilities: `js/common.js` (load first on all pages)
- Page-specific: `js/{page}-page.js`

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
- HTML files: `index.html`, `licenses.html`, `vuln.html`, `deps.html`, `settings.html`, `authors.html`, `repos.html`, `about.html`, `debug.html`, `audit.html`, `findings.html`

### CHANGELOG (MANDATORY)
**EVERY change MUST be recorded in `CHANGELOG.md`. No exceptions.**

This includes:
- Features, bug fixes, refactors, performance improvements
- Dependency updates, build/workflow/CI changes
- Documentation changes that affect users or contributors
- Security fixes and removals/deprecations
- Even small or "trivial" updates — if it ships, it gets a changelog entry

Rules:
- Format: [Keep a Changelog](https://keepachangelog.com/)
- Sections: `Added`, `Changed`, `Fixed`, `Removed`, `Security`
- Header: `## [X.Y.Z] - YYYY-MM-DD`
- Add the entry in the **same change/PR** as the code change — never defer to "later"
- Place new entries at the top, under the current/next version header
- If no version header exists yet for the upcoming release, create one (or use `## [Unreleased]` and promote it on release)
- Write entries from the user's perspective: what changed and why it matters, not internal mechanics
- Keep entries concise but specific — reference affected pages/services/files when useful
- If a change spans multiple sections (e.g. `Added` + `Fixed`), list it under each relevant section

### Flowchart
Update `flowchart.md` when:
- Analysis phases added/removed/reordered
- New decision points or conditional logic
- Storage operations modified

### About page (MANDATORY when adding new logic)
**`about.html` is the user-facing methodology reference. Whenever new logic, scoring, detection,
or enrichment is added to the codebase, `about.html` MUST be updated in the same change/PR.**

This applies to (non-exhaustive):
- New detection rules or classifiers (vuln / malware / EOL / EOX / license / lifecycle / VEX / …)
- New scoring or grading formulas (Tech-Debt composite, severity weighting, …)
- New enrichment phases in `enrichment-pipeline.js`
- New external data sources (registries, advisory DBs, GraphQL fields, …)
- New aggregation methodologies (per-page or cross-page)
- Changes to existing methodologies that alter the user-visible result

Rules:
- Add or update a methodology card in `about.html` matching the depth and structure of existing
  cards (intro paragraph, sub-headers, comparison tables where useful, definition alerts,
  References list with external spec links).
- Bump cache-busters on `about.html`'s versioned `<link>` and `<script>` tags.
- Same-PR rule applies: never defer "I'll document it later". If the logic ships, the about-page
  card ships with it.
- If the logic is internal-only (no user-visible behaviour change, e.g. a refactor), an about-page
  update is not required — but the CHANGELOG entry still is.

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
| Forgot CHANGELOG entry | Add an entry for **every** change, in the same PR |
| New logic shipped without about-page card | Update `about.html` in the same PR (see "About page" above) |

## Pre-Commit Checklist

- [ ] **CHANGELOG.md updated for this change (REQUIRED — every update, no exceptions)**
- [ ] **about.html updated (REQUIRED if new detection / scoring / enrichment / methodology logic)**
- [ ] No inline CSS/JS
- [ ] User data escaped
- [ ] Workflows updated (if files added/removed)
- [ ] flowchart.md updated (if flows changed)
- [ ] CSS uses variables
- [ ] External links have security attrs
