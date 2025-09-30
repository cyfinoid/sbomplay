# GitHub API Rate Limit Strategy

## Issue: CORS on releases.atom

**Problem**: Browser-based applications cannot fetch `releases.atom` due to CORS restrictions.

**Solution**: Use GitHub API with aggressive caching and smart rate limit management.

---

## Rate Limits

### Without Authentication:
- **60 requests per hour** per IP address
- Shared across all unauthenticated requests

### With Authentication (Personal Access Token):
- **5,000 requests per hour** per token
- Recommended for regular use

---

## Implementation Strategy

### 1. Aggressive Caching
```javascript
this.cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours
```

**Why 24 hours?**
- GitHub Actions releases don't change frequently
- Most actions use semantic versioning
- Reduces API consumption dramatically
- User can manually refresh if needed

**Cache Benefits**:
- First analysis: ~9 API requests (for 9 GitHub Actions)
- Subsequent analyses (same day): 0 API requests
- Next day: ~9 API requests (cache expired)

### 2. Token Auto-Detection
```javascript
getToken() {
    // 1. Try githubClient (if user set token)
    if (this.githubClient && this.githubClient.token) {
        return this.githubClient.token;
    }
    
    // 2. Try localStorage (fallback)
    return localStorage.getItem('githubToken');
}
```

**Benefits**:
- Automatically uses token if available
- Falls back to unauthenticated if no token
- Seamless integration with existing token management

### 3. Rate Limit Monitoring
```javascript
// Extract from response headers
this.rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
this.rateLimitReset = response.headers.get('X-RateLimit-Reset');

// Log to console
console.log(`📊 GitHub API rate limit: ${this.rateLimitRemaining} requests remaining`);
```

**Benefits**:
- User sees rate limit status in console
- Service can detect when limit is reached
- Can provide helpful error messages

### 4. Graceful Degradation
```javascript
if (this.rateLimitRemaining === 0) {
    console.warn(`⏳ Rate limit exceeded. Resets in ${minutesUntilReset} minutes.`);
    return cached ? cached.releases : []; // Use stale cache
}
```

**Benefits**:
- Doesn't break the app when rate limited
- Uses stale cache data if available
- Provides clear user feedback

---

## Expected API Usage

### For cyfinoid/keychecker (9 GitHub Actions):

#### Unauthenticated (60/hour limit):
- **First analysis**: 9 requests
- **Subsequent analyses (same day)**: 0 requests (cached)
- **Daily usage**: ~9 requests/day
- **Can analyze**: ~6 repositories per hour (60 / 9 = 6.6)

#### Authenticated (5000/hour limit):
- **First analysis**: 9 requests
- **Subsequent analyses (same day)**: 0 requests (cached)
- **Daily usage**: ~9 requests/day
- **Can analyze**: ~555 repositories per hour (5000 / 9 = 555)

---

## Rate Limit Optimization Tips

### For Users:

1. **Set GitHub Token** (recommended):
   - Click "GitHub Authentication" section
   - Enter Personal Access Token
   - Increases limit from 60/hour to 5000/hour

2. **Use Cache Effectively**:
   - Don't clear browser cache unnecessarily
   - Re-analyzing same repository uses cache (no API calls)

3. **Batch Analyses**:
   - Analyze multiple files from same repository
   - GitHub Actions are shared, so cache helps

### For Developers:

1. **Increase Cache Duration**:
   ```javascript
   this.cacheTimeout = 7 * 24 * 60 * 60 * 1000; // 7 days
   ```

2. **Implement LocalStorage Cache**:
   - Cache across browser sessions
   - Survive page refreshes

3. **Lazy Loading**:
   - Only fetch when drift analysis is expanded
   - Skip if user doesn't care about GitHub Actions

---

## Console Output Examples

### Authenticated Request (Success):
```
🔍 Fetching releases from GitHub API: actions/checkout (authenticated)
📊 GitHub API rate limit: 4991 requests remaining
✅ Found 15 releases for actions/checkout
```

### Unauthenticated Request (Success):
```
🔍 Fetching releases from GitHub API: actions/checkout (unauthenticated)
📊 GitHub API rate limit: 51 requests remaining
✅ Found 15 releases for actions/checkout
```

### Using Cache:
```
📦 Using cached releases for actions/checkout (age: 15 minutes)
```

### Rate Limit Exceeded:
```
⏳ Rate limit exceeded. Resets in 23 minutes. Using cached data if available.
⚠️ Rate limit exceeded for actions/checkout
```

### No Releases Found:
```
⚠️ Repository not found or no releases: actions/checkout
```

---

## Migration from releases.atom

### What Changed:

**Before (releases.atom)**:
```javascript
const url = `https://github.com/${owner}/${repo}/releases.atom`;
const response = await fetch(url); // ❌ CORS error
const atomXml = await response.text();
const releases = this.parseAtomFeed(atomXml);
```

**After (GitHub API)**:
```javascript
const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`;
const headers = { 'Authorization': `token ${token}` }; // ✅ If available
const response = await fetch(url, { headers });
const releases = await response.json();
```

### Benefits of GitHub API:
- ✅ No CORS issues
- ✅ JSON response (easier to parse)
- ✅ More reliable
- ✅ Official API (better documented)
- ✅ Rate limit headers (can monitor usage)

### Drawbacks:
- ❌ Rate limited (but we mitigate with caching)
- ❌ Requires authentication for high volume (but we support tokens)

---

## Files Modified

### Updated:
- `js/services/github-actions-service.js`:
  - Changed from releases.atom to GitHub API
  - Added token detection
  - Added rate limit monitoring
  - Increased cache duration to 24 hours
  - Added graceful degradation

- `js/singlerepo-wrapper.js`:
  - Pass githubClient to GitHubActionsService constructor

### Documentation:
- `GITHUB-API-RATE-LIMIT-STRATEGY.md` (this file)

---

## Testing Instructions

### 1. Test Without Token (60/hour limit)
```
1. Open singlerepo.html (ensure no token set)
2. Analyze cyfinoid/keychecker
3. Watch console for rate limit messages
4. Should see: "📊 GitHub API rate limit: XX requests remaining"
```

### 2. Test With Token (5000/hour limit)
```
1. Click "GitHub Authentication" section
2. Enter Personal Access Token
3. Click "Set Token"
4. Analyze cyfinoid/keychecker
5. Should see: "(authenticated)" in console logs
6. Should see much higher rate limit number
```

### 3. Test Caching
```
1. Analyze repository
2. Immediately analyze same repository again
3. Should see: "📦 Using cached releases..."
4. Should NOT make additional API calls
```

### 4. Test Rate Limit Handling
```
1. Make ~60 requests (analyze many repositories)
2. Should see rate limit decrease in console
3. When limit reached, should show warning message
4. Should fall back to cached data
```

---

## Recommendations

### For Casual Users (1-2 repos/day):
- ✅ No token needed
- ✅ 60 requests/hour is sufficient
- ✅ Just use the tool normally

### For Power Users (>5 repos/day):
- ⚠️ Set up GitHub token
- ⚠️ Increases limit to 5000/hour
- ⚠️ Token creation guide: https://github.com/settings/tokens

### For Developers:
- ⚠️ Consider localStorage caching
- ⚠️ Consider lazy loading GitHub Actions checks
- ⚠️ Monitor rate limit usage in production

---

## Status

✅ **CORS Issue Fixed** - Now uses GitHub API  
✅ **Rate Limits Managed** - 24-hour caching + token support  
✅ **Graceful Degradation** - Falls back to cache when rate limited  
✅ **No Breaking Changes** - API stays the same  

---

**Date**: September 30, 2025  
**Migration**: releases.atom → GitHub API  
**Status**: Ready for testing
