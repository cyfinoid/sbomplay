# GitHub URL Parsing Feature

## Summary
Added support for accepting full GitHub URLs in addition to the existing username, organization, and owner/repo formats.

## Changes Made

### 1. JavaScript (`js/app.js`)
Added a new `parseGitHubInput()` method to the `SBOMPlayApp` class that handles:
- Organization/username: `microsoft`, `torvalds`
- Owner/repo format: `microsoft/vscode`, `cyfinoid/sbomplay`
- Full HTTPS URLs: `https://github.com/cyfinoid/sbomplay`
- HTTP URLs: `http://github.com/cyfinoid/sbomplay`
- URLs without protocol: `github.com/cyfinoid/sbomplay`
- URLs with www: `www.github.com/cyfinoid/sbomplay`
- URLs with trailing slashes: `https://github.com/cyfinoid/`
- Organization URLs: `https://github.com/cyfinoid/` (analyzes all repos)
- Repository URLs: `https://github.com/cyfinoid/sbomplay` (analyzes single repo)

The function automatically:
- Strips trailing slashes
- Detects URL patterns
- Extracts owner and repository information
- Determines if it's a single repo or organization analysis

### 2. HTML (`index.html`)
Updated three sections:

**Input Label & Placeholder:**
- Changed label from "Enter a GitHub organization, username, or repository" to include "or URL"
- Updated placeholder to show URL example: `https://github.com/cyfinoid/sbomplay`

**Main Description:**
- Updated to mention support for direct GitHub URLs

**Help Section:**
- Added two new input format examples:
  - **Repository URL:** `https://github.com/cyfinoid/sbomplay`
  - **Organization URL:** `https://github.com/cyfinoid/`

### 3. Test File (`test-url-parsing.html`)
Created a comprehensive test file with:
- Interactive testing interface
- 15+ automated test cases
- Visual pass/fail indicators
- Coverage of all URL formats

## How to Test

### Option 1: Interactive Test
1. Open `test-url-parsing.html` in a browser
2. Enter various formats in the input field
3. Click "Parse Input" to see results

### Option 2: Automated Tests
1. Open `test-url-parsing.html` in a browser
2. Tests run automatically on page load
3. Or click "Run All Tests" button

### Option 3: Live Testing
1. Open `index.html` in a browser
2. Try entering any of these formats:
   - `https://github.com/cyfinoid/sbomplay`
   - `https://github.com/microsoft/`
   - `github.com/torvalds/linux`
   - `microsoft`
   - `facebook/react`

## Supported URL Formats

| Format | Example | Result |
|--------|---------|--------|
| Username | `torvalds` | Analyzes all repos for user |
| Organization | `microsoft` | Analyzes all repos in org |
| Owner/Repo | `microsoft/vscode` | Analyzes single repository |
| HTTPS URL (repo) | `https://github.com/cyfinoid/sbomplay` | Analyzes single repository |
| HTTPS URL (org) | `https://github.com/cyfinoid/` | Analyzes all repos in org |
| HTTP URL | `http://github.com/cyfinoid/sbomplay` | Analyzes single repository |
| No Protocol | `github.com/cyfinoid/sbomplay` | Analyzes single repository |
| With WWW | `www.github.com/cyfinoid/` | Analyzes all repos in org |
| Trailing Slash | `https://github.com/cyfinoid/sbomplay/` | Analyzes single repository |

## Implementation Details

The parsing logic follows this priority:
1. **Check for URL pattern** - Uses regex to detect GitHub URLs
2. **Extract components** - Pulls out owner and optional repo name
3. **Fallback to simple format** - If not a URL, checks for owner/repo format
4. **Default to username** - Treats as organization/username if no slashes

## Benefits

1. **User Convenience** - Users can paste URLs directly from their browser
2. **Reduced Errors** - No need to manually extract owner/repo from URLs
3. **Flexibility** - Supports multiple URL variations
4. **Backward Compatible** - All existing input formats still work

## Deployment

Files updated in both development and production:
- `/index.html` → `/docs/index.html`
- `/js/app.js` → `/docs/js/app.js`

The changes are ready to be deployed to GitHub Pages.

