# SBOM Audits - API vs Display Comparison

## Test Date: 2025-01-11

### Test Setup
- Repository: cyfinoid/keychecker
- Cache: Cleared before test

### API Response for ossf/scorecard-action

```json
{
  "full_name": "ossf/scorecard-action",
  "license": {
    "spdx_id": "Apache-2.0",
    "key": "apache-2.0",
    "name": "Apache License 2.0"
  },
  "owner": {
    "login": "ossf"
  }
}
```

**API Returns:**
- License SPDX ID: `Apache-2.0`
- License Key: `apache-2.0`
- Owner: `ossf`
- Repo: `scorecard-action`

### Display Issues Found

1. **License Display**: Some GitHub Actions show "Unknown" license even though API returns Apache-2.0
   - **Root Cause**: Overcomplicated matching logic trying to match exact refs (tag vs SHA)
   - **Fix Applied**: Simplified to match on owner/repo/path only (license doesn't change between refs)

2. **Version Parsing**: Some transitive dependencies show invalid versions like `@v4@v4`
   - **Root Cause**: Ref normalization not applied when creating nested action keys
   - **Fix Applied**: Normalize refs (remove leading @) before creating keys

3. **Authors Display**: Author lists not populating for some packages
   - **Root Cause**: Similar matching issue - need to match on owner/repo/path, not exact ref
   - **Fix Applied**: Simplified author lookup to match on owner/repo/path

### Simplification Applied

1. **License Lookup**: Match on `owner/repo/path` only, ignore ref differences
2. **Metadata Lookup**: Same simplification - match on base key, not exact ref
3. **Version Normalization**: Strip leading `@` from refs to prevent `@v4@v4` issues

### Testing Notes

- Cache was cleared, so fresh analysis needed to verify fixes
- API confirms `ossf/scorecard-action` has `Apache-2.0` license
- Code simplified to reduce complexity and improve reliability
