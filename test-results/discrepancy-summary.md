# IndexedDB Discrepancy Summary

## Quick Reference

### Critical Issues: 0
### Major Issues: 3
### Minor Issues: 5

## Major Issues

1. **Nested `data.data` Pattern** - Storage creates inconsistent nesting
   - Location: `js/storage-manager.js:26-60`, `js/indexeddb-manager.js:100-154`
   - Fix: Standardize data structure, always use `orgData.data.*`

2. **Missing Null Checks** - Several places access nested properties without checks
   - Locations: `js/view-manager.js:702`, `js/view-manager.js:831`
   - Fix: Add null checks before array operations

3. **Statistics Duplication** - Stored at both `entry.statistics` and `entry.data.statistics`
   - Location: `js/indexeddb-manager.js:115`
   - Fix: Store only at `entry.data.statistics`

## Minor Issues

1. Field name inconsistency (`name` vs `organization` vs `fullName`)
2. GitHub Actions analysis access pattern uncertainty
3. Repository key format inconsistency
4. Quality analysis access pattern differences
5. Combined data aggregation edge cases

## Data Structure Reference

### Organization Entry
```javascript
{
    name: string,              // Key field
    organization: string,      // Duplicate of name
    timestamp: string,
    data: {
        statistics: {...},
        allDependencies: [...],
        allRepositories: [...],
        vulnerabilityAnalysis: {...},
        licenseAnalysis: {...},
        githubActionsAnalysis: {...},
        qualityAnalysis: {...}
    },
    type: 'organization',
    statistics: {...}          // Duplicate of data.statistics
}
```

### Repository Entry
```javascript
{
    fullName: string,          // Key field (e.g., "cyfinoid/keychecker")
    timestamp: string,
    data: {
        statistics: {...},
        allDependencies: [...],
        allRepositories: [...],
        // ... same as organization
    },
    type: 'repository',
    statistics: {...}          // Duplicate of data.statistics
}
```

## Recommended Access Patterns

### ✅ Correct
```javascript
// Access analysis data
const stats = orgData.data.statistics;
const deps = orgData.data.allDependencies || [];
const repos = orgData.data.allRepositories || [];

// Access nested analysis
const vulnAnalysis = orgData.data.vulnerabilityAnalysis;
const licenseAnalysis = orgData.data.licenseAnalysis;

// Get organization name
const orgName = orgData.organization || orgData.name;
```

### ❌ Avoid
```javascript
// Don't access without null checks
const deps = orgData.data.allDependencies;  // Could be null
deps.filter(...);  // Will crash if deps is null

// Don't use uncertain fallback patterns
const ga = orgData?.data?.githubActionsAnalysis || orgData?.githubActionsAnalysis;
// Should always be orgData.data.githubActionsAnalysis
```

