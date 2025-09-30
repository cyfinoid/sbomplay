# GitHub Actions Version Checking

## Feature Overview

This feature enables version checking for GitHub Actions dependencies without using the GitHub API, avoiding rate limits by using publicly accessible `releases.atom` feeds.

## How It Works

### 1. Detection
The system automatically detects GitHub Actions dependencies by:
- Checking PURL format: `pkg:githubactions/owner/repo@version`
- Checking ecosystem field: `"ecosystem": "GitHub Actions"`
- Pattern matching: `owner/action-name` format

### 2. Version Fetching
Instead of using GitHub API (limited to 60 requests/hour), we fetch:
```
https://github.com/{owner}/{repo}/releases.atom
```

This is a publicly accessible Atom XML feed that lists all releases and **does not count against API rate limits**.

### 3. Version Comparison

#### For Tag-Based Versions (Recommended)
```yaml
# Example in workflow file
uses: actions/checkout@v4
```
- **Current**: `v4` or `4`
- **Latest**: Extracted from releases.atom (e.g., `v4.2.1`)
- **Comparison**: Normalized tag comparison

#### For Commit Hash Versions
```yaml
# Example in workflow file
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
```
- **Current**: `11bd71901bbe5b1630ceea73d27597364c9af683` (full SHA)
- **Latest**: Extracted from latest release in atom feed
- **Comparison**: Hash prefix matching

## Implementation Details

### New Service: `GitHubActionsService`

**Location**: `js/services/github-actions-service.js`

#### Key Methods:

1. **`isGitHubAction(dependency)`**
   - Detects if a dependency is a GitHub Action
   - Returns: `boolean`

2. **`fetchReleases(owner, repo)`**
   - Fetches releases.atom feed
   - Parses XML to extract release information
   - Caches results for 1 hour
   - Returns: Array of release objects

3. **`parseAtomFeed(atomXml)`**
   - Parses Atom XML using DOMParser
   - Extracts: tag, title, link, updated date, commit hash
   - Returns: Array of parsed releases

4. **`checkVersion(dependency)`**
   - Main method for version checking
   - Returns version status object with:
     ```javascript
     {
       name: "actions/checkout",
       currentVersion: "v4",
       latestVersion: "v4.2.1",
       latestCommit: "abc123...",
       status: "outdated", // or "up-to-date", "unknown"
       statusMessage: "Update available",
       statusDetails: "Latest: v4.2.1",
       isOutdated: true,
       ecosystem: "githubactions",
       releaseUrl: "https://github.com/actions/checkout/releases/tag/v4.2.1",
       repoUrl: "https://github.com/actions/checkout",
       updated: Date object
     }
     ```

### Integration Points

#### 1. `singlerepo-wrapper.js` - Constructor
```javascript
constructor() {
    // ... other services
    this.githubActionsService = new GitHubActionsService();
}
```

#### 2. `singlerepo-wrapper.js` - checkLatestVersion()
```javascript
async checkLatestVersion(dependency) {
    // Check if this is a GitHub Action first
    if (this.githubActionsService.isGitHubAction(dependency)) {
        return await this.githubActionsService.checkVersion(dependency);
    }
    
    // ... continue with other ecosystems
}
```

#### 3. `singlerepo.html` - Script Include
```html
<script src="js/services/github-actions-service.js"></script>
```

## Example: cyfinoid/keychecker Analysis

### GitHub Actions in SBOM:

1. **actions/checkout**
   - Current: `11bd71901bbe5b1630ceea73d27597364c9af683` (commit hash)
   - Latest: Will check https://github.com/actions/checkout/releases.atom
   - Expected: Show if commit matches latest release

2. **actions/upload-artifact**
   - Current: `4cec3d8aa04e39d1a68397de0c4cd6fb9dce8ec1` (commit hash)
   - Latest: Will check https://github.com/actions/upload-artifact/releases.atom

3. **astral-sh/setup-uv**
   - Current: `d9e0f98d3fc6adb07d1e3d37f3043649ddad06a1` (commit hash)
   - Latest: Will check https://github.com/astral-sh/setup-uv/releases.atom

4. **PyCQA/bandit-action**
   - Current: `67a458d90fa11fb1463e91e7f4c8f068b5863c7f` (commit hash)
   - Latest: Will check https://github.com/PyCQA/bandit-action/releases.atom

5. **ossf/scorecard-action**
   - Current: `f49aabe0b5af0936a0987cfb85d86b75731b0186` (commit hash)
   - Latest: Will check https://github.com/ossf/scorecard-action/releases.atom

## Benefits

### ✅ No API Rate Limits
- Atom feeds are publicly accessible
- No authentication required
- No rate limiting

### ✅ Accurate Version Detection
- Supports both tag-based versions (`v4.2.1`)
- Supports commit hash versions (SHA)
- Compares against actual releases

### ✅ Rich Metadata
- Release dates
- Release URLs
- Commit hashes
- Repository links

### ✅ Caching
- 1-hour cache for each repository's releases
- Reduces redundant network requests
- Improves performance

## Console Output Examples

### For Tag-Based Version:
```
🎬 Checking GitHub Action version for actions/checkout
🔍 Fetching releases from: https://github.com/actions/checkout/releases.atom
✅ Found 15 releases for actions/checkout
```

### For Commit Hash:
```
🎬 Checking GitHub Action version for astral-sh/setup-uv
📦 Using cached releases for astral-sh/setup-uv
```

### Status Messages:
```javascript
// Up to date with tag
status: "up-to-date"
statusMessage: "Up to date"

// Up to date with hash
status: "up-to-date"
statusMessage: "Using latest commit hash"

// Outdated
status: "outdated"
statusMessage: "Update available"
statusDetails: "Latest: v4.2.1"

// Unknown (no releases found)
status: "unknown"
statusMessage: "No releases found"
```

## UI Display

### Dependency Table:
| Package Name | Current Version | Ecosystem | Version Status |
|--------------|----------------|-----------|----------------|
| actions/checkout | 11bd719... | GitHub Actions | ⚠️ Update Available |
| actions/upload-artifact | 4cec3d8... | GitHub Actions | ✅ Up to Date |

### Version Status Badge Colors:
- **Green**: Up to date
- **Yellow**: Update available
- **Gray**: Unknown

## Edge Cases Handled

### 1. No Releases Found
If a repository has no releases.atom or it's empty:
```javascript
{
  status: "unknown",
  message: "No releases found",
  repoUrl: "https://github.com/owner/repo"
}
```

### 2. XML Parsing Errors
If Atom XML is malformed:
```javascript
{
  status: "unknown",
  error: "XML parsing error"
}
```

### 3. Network Failures
If fetch fails (network issues, 404, etc.):
```javascript
{
  status: "unknown",
  error: "Failed to fetch releases"
}
```

### 4. Mixed Version Formats
If current is hash but should use tag:
```javascript
{
  status: "outdated",
  message: "Update available",
  details: "Latest: v4.2.1",
  // Recommends migrating from hash to tag
}
```

## Testing Instructions

### 1. Analyze cyfinoid/keychecker
```bash
# Open singlerepo.html
# Enter: cyfinoid/keychecker
# Click: Analyze Repository
```

### 2. Check Console Output
Look for:
```
🎬 Checking GitHub Action version for actions/checkout
🔍 Fetching releases from: https://github.com/actions/checkout/releases.atom
✅ Found X releases for actions/checkout
```

### 3. Verify Dependency Table
GitHub Actions should show:
- ✅ Ecosystem badge: "GitHub Actions"
- ✅ Version status (not "Unknown")
- ✅ Latest version information
- ✅ Release URLs in details

### 4. Manual Verification
Compare with actual releases:
- **actions/checkout**: https://github.com/actions/checkout/releases
- **astral-sh/setup-uv**: https://github.com/astral-sh/setup-uv/releases

## Performance Considerations

### Caching Strategy:
- **Cache Duration**: 1 hour per repository
- **Cache Key**: `owner/repo`
- **Cache Storage**: In-memory Map

### Network Efficiency:
- **Parallel Processing**: Batched with 200ms delay
- **Feed Size**: Atom feeds are typically <100KB
- **Parse Speed**: DOMParser is fast and native

### Rate Limiting:
- **No API limits**: Uses public Atom feeds
- **Self-imposed delay**: 200ms between requests (politeness)
- **Concurrent requests**: Max 10 at a time

## Future Enhancements

### Potential Additions:
1. **Semver Parsing**: Better major/minor/patch detection for tags
2. **Security Advisories**: Cross-reference with GitHub Security Advisories
3. **Dependabot Integration**: Check if Dependabot has open PRs
4. **Release Notes**: Display changelog/release notes
5. **Action Marketplace**: Link to GitHub Marketplace entries

## Security Considerations

### Safe Practices:
- ✅ No authentication required (public feeds)
- ✅ No sensitive data transmitted
- ✅ XML parsing with DOMParser (safe, built-in)
- ✅ No eval() or unsafe operations
- ✅ HTTPS-only connections

### Potential Risks:
- ⚠️ XML parsing vulnerabilities (mitigated by using native DOMParser)
- ⚠️ Large XML files (unlikely, feeds are paginated)
- ⚠️ Malformed data (handled with try-catch)

## Files Modified/Created

### Created:
- `js/services/github-actions-service.js` (394 lines)
- `GITHUB-ACTIONS-VERSION-CHECKING.md` (this file)

### Modified:
- `js/singlerepo-wrapper.js`:
  - Added GitHub Actions service initialization
  - Integrated into checkLatestVersion() method
- `singlerepo.html`:
  - Added script tag for GitHub Actions service

## Success Criteria

✅ **Implemented**:
- [x] GitHub Action detection
- [x] Atom feed fetching and parsing
- [x] Version comparison (tags and hashes)
- [x] Caching mechanism
- [x] Error handling
- [x] Integration with drift analysis
- [x] Console logging

✅ **Ready for Testing**:
- [ ] Test with cyfinoid/keychecker
- [ ] Verify all 9 GitHub Actions are checked
- [ ] Compare results with manual GitHub checks
- [ ] Test caching behavior
- [ ] Test error scenarios

---

**Status**: ✅ **IMPLEMENTED AND READY FOR TESTING**  
**Date**: September 30, 2025  
**Feature**: GitHub Actions Version Checking via releases.atom
