# Agent Instructions

## Code Quality Standards

### No Inline CSS/JavaScript
- **Never** add inline `style=""` attributes - use CSS classes in `css/style.css` or `css/themes.css`
- **Never** add inline `<script>` blocks - extract to `js/` files
- **Never** add inline `onclick=""` handlers - use `addEventListener` in JS files
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
- **Always** validate URLs: `isUrlFromHostname()` instead of `.includes()` checks
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
- Files: `index.html`, `licenses.html`, `vuln.html`, `deps.html`, `settings.html`, `authors.html`, `quality.html`, `repos.html`, `about.html`
- Update CSS/JS references: `<link href="css/style.css?v=X.Y.Z">` and `<script src="js/*.js?v=X.Y.Z">`

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

### Required Files (per workflow validation)
**HTML**: `index.html`, `licenses.html`, `vuln.html`, `deps.html`, `settings.html`, `authors.html`, `quality.html`, `repos.html`, `about.html`

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

## Common Mistakes to Avoid

1. **Hardcoded colors** → Use CSS variables (`var(--bg-primary)`)
2. **Unsafe HTML insertion** → Use `safeSetHTML()` or escape
3. **URL validation with `.includes()`** → Use `isUrlFromHostname()`
4. **Forgot to update workflows** → Check both workflow files
5. **Version strings not updated** → Update all HTML files on release
6. **Flowchart not updated** → Update `flowchart.md` when flows change
7. **Inline styles/scripts** → Extract to separate files
8. **Duplicate utility functions** → Consolidate in `utils.js`

