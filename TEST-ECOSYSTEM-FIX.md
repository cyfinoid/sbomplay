# Quick Test Guide: Ecosystem Detection Fix

## How to Test the Fix

### Step 1: Open Developer Console
1. Open `singlerepo.html` in your browser
2. Press `F12` or `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (Mac)
3. Go to the **Console** tab

### Step 2: Analyze cyfinoid/keychecker
1. In the repository input field, enter: `cyfinoid/keychecker`
2. Click **"Analyze Repository"**
3. Watch the console output

### Step 3: Look for These Console Messages

#### ✅ GOOD - What You SHOULD See:
```
✅ Extracted ecosystem from PURL for uv: pypi
✅ Extracted ecosystem from PURL for tqdm: pypi
✅ Extracted ecosystem from PURL for black: pypi
✅ Extracted ecosystem from PURL for asyncssh: pypi
✅ Extracted ecosystem from PURL for pytest: pypi
✅ Extracted ecosystem from PURL for pytest-asyncio: pypi
✅ Extracted ecosystem from PURL for flake8: pypi
✅ Extracted ecosystem from PURL for aiohttp: pypi
✅ Extracted ecosystem from PURL for cryptography: pypi
✅ Extracted ecosystem from PURL for mypy: pypi
```

#### ❌ BAD - What You Should NOT See:
```
⚠️ Fallback to name-based ecosystem detection for uv
⚠️ Fallback to name-based ecosystem detection for tqdm
```
*(These packages have PURLs, so fallback shouldn't be needed)*

### Step 4: Check the Dependency Table

#### For the `uv` package, verify:
- **Package Name**: `uv`
- **Current Version**: `0.8.12`
- **Ecosystem Badge**: Should show **"PyPI"** (blue badge), NOT "npm" (red badge)
- **Version Status**: Should show an update available (0.8.22 or higher)
- **Latest Version**: Should be `0.8.22` or higher, NOT `1.4.0`

#### Screenshots to Compare:

**Before Fix (WRONG):**
```
Package: uv
Current: 0.8.12
Ecosystem: npm ❌
Latest: 1.4.0 ❌
Status: Major Update Available ❌
```

**After Fix (CORRECT):**
```
Package: uv
Current: 0.8.12
Ecosystem: PyPI ✅
Latest: 0.8.22 ✅
Status: Patch Update Available ✅
```

### Step 5: Verify Other Python Packages

Check a few more Python packages from the list:

| Package | Expected Ecosystem | What to Check |
|---------|-------------------|---------------|
| `tqdm` | PyPI | Badge should be blue "PyPI" |
| `black` | PyPI | Badge should be blue "PyPI" |
| `pytest` | PyPI | Badge should be blue "PyPI" |
| `aiohttp` | PyPI | Badge should be blue "PyPI" |
| `cryptography` | PyPI | Badge should be blue "PyPI" |

### Step 6: Check GitHub Actions (Should Be Skipped)

GitHub Actions should NOT appear in drift analysis:
- `actions/checkout`
- `actions/upload-artifact`
- `astral-sh/setup-uv`

These should be marked as "Unknown" in version status because they're not in supported registries.

## Troubleshooting

### If You Still See Wrong Ecosystems:

1. **Clear Browser Cache**:
   - `Ctrl+Shift+Delete` (Windows/Linux)
   - `Cmd+Shift+Delete` (Mac)
   - Select "Cached images and files"
   - Click "Clear data"

2. **Hard Reload**:
   - `Ctrl+F5` (Windows/Linux)
   - `Cmd+Shift+R` (Mac)

3. **Clear LocalStorage**:
   ```javascript
   // In browser console:
   localStorage.clear();
   location.reload();
   ```

4. **Re-analyze**:
   - Click the "Clear Results" button
   - Re-enter the repository URL
   - Click "Analyze Repository" again

### If Console Shows Errors:

Check for these specific errors:

```javascript
// If you see this, the PURL is missing:
⚠️ Fallback to name-based ecosystem detection for uv

// Solution: The SBOM data might be cached. Clear results and re-analyze.
```

```javascript
// If you see this, there's a fetch error:
Error fetching PyPI version for uv: ...

// Solution: Check internet connection and PyPI status
```

## Expected Test Results Summary

### Console Output:
- ✅ Should see "Extracted ecosystem from PURL" for all Python packages
- ✅ Should NOT see fallback warnings for packages with PURLs

### UI Display:
- ✅ All Python packages show "PyPI" badge (blue)
- ✅ No Python packages show "npm" badge (red)
- ✅ Version numbers match PyPI registry (verify at https://pypi.org/project/PACKAGE_NAME/)

### Drift Analysis:
- ✅ `uv` shows latest version around 0.8.22 (not 1.4.0)
- ✅ Accurate update recommendations for all packages
- ✅ Correct ecosystem for each package in exported JSON

## Manual Verification Links

To double-check versions manually:

1. **uv** (PyPI): https://pypi.org/project/uv/
   - Expected: 0.8.22 or higher
   
2. **tqdm** (PyPI): https://pypi.org/project/tqdm/
   - Expected: 4.67.1 or higher

3. **black** (PyPI): https://pypi.org/project/black/
   - Expected: 25.1.0 or higher

## Export and Verify

1. After analysis completes, click **"Export Analysis"**
2. Open the exported JSON file
3. Search for `"name": "uv"`
4. Verify the entry looks like:

```json
{
  "name": "uv",
  "currentVersion": "0.8.12",
  "latestVersion": "0.8.22",
  "ecosystem": "pypi",
  "status": "patch-update",
  "isOutdated": true
}
```

## Success Criteria

✅ **PASS**: All criteria below are met  
❌ **FAIL**: Any criterion below fails

- [ ] Console shows "Extracted ecosystem from PURL" for Python packages
- [ ] `uv` package shows "PyPI" ecosystem (not "npm")
- [ ] `uv` latest version is 0.8.22+ (not 1.4.0)
- [ ] All Python packages show correct "PyPI" badge
- [ ] No unexpected "fallback to name-based detection" warnings
- [ ] Exported JSON has correct ecosystem fields
- [ ] Version drift analysis shows accurate update recommendations

---

## Quick Console Test

Run this in browser console after analysis:

```javascript
// Get the analysis data
const analysisData = singleRepoAnalyzer?.currentAnalysisData;

// Check uv package
const uvPackage = analysisData?.driftAnalysis?.allDependencies?.find(d => d.name === 'uv');

console.log('=== UV Package Check ===');
console.log('Ecosystem:', uvPackage?.ecosystem); // Should be "pypi"
console.log('Current Version:', uvPackage?.currentVersion); // Should be "0.8.12"
console.log('Latest Version:', uvPackage?.latestVersion); // Should be "0.8.22" or higher
console.log('Status:', uvPackage?.status);

if (uvPackage?.ecosystem === 'pypi') {
    console.log('✅ TEST PASSED: Ecosystem correctly detected as PyPI');
} else {
    console.log('❌ TEST FAILED: Ecosystem is', uvPackage?.ecosystem, 'instead of pypi');
}
```

Expected output:
```
=== UV Package Check ===
Ecosystem: pypi
Current Version: 0.8.12
Latest Version: 0.8.22
Status: patch-update
✅ TEST PASSED: Ecosystem correctly detected as PyPI
```

---

**Test Status**: Ready for testing  
**Estimated Test Time**: 2-3 minutes  
**Difficulty**: Easy
