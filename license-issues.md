# License Issues Identified

This document catalogs all types of license issues that are currently being identified and reported by the SBOM Play license compliance analysis.

## Overview

The license compliance analysis identifies several categories of license-related issues:
1. **High-Risk Dependencies** - Dependencies with licenses that pose compliance risks
2. **License Conflicts** - Incompatible license combinations within the dependency tree
3. **License Transitions** - Changes in license between different versions of the same package
4. **Same License Issues** - Packages with the same high-risk license across multiple versions

---

## 1. High-Risk Dependencies

High-risk dependencies are identified based on their license category and risk level. These are displayed in stat cards and can be filtered.

| Issue Type | Category | Risk Level | Description | Example Licenses |
|------------|----------|------------|-------------|------------------|
| **Copyleft** | `copyleft` | High | Licenses that require source code disclosure and may impose copyleft obligations | GPL-2.0, GPL-3.0, GPL-2.0-only, GPL-2.0-or-later, GPL-3.0-only, GPL-3.0-or-later, AGPL-3.0, MPL-2.0, EPL-2.0 |
| **Proprietary** | `proprietary` | Medium | Commercial or proprietary licenses with usage restrictions | Commercial, Proprietary, Custom |
| **Unknown** | `unknown` | High | Unknown or unspecified licenses requiring investigation | NOASSERTION, UNKNOWN, NONE, (empty string) |
| **Unlicensed** | `unlicensed` | High | Dependencies that lack any license information | Dependencies with no license field or license = "NOASSERTION" |

### Detection Logic

- Dependencies are parsed using `LicenseProcessor.parseLicense()`
- Licenses are categorized into: `permissive`, `lgpl`, `copyleft`, `proprietary`, `unknown`
- Risk levels are assigned: `low`, `medium`, `high`
- Only dependencies with `risk === 'high'` are flagged as high-risk

---

## 2. License Conflicts

License conflicts occur when incompatible licenses are detected within the same dependency tree.

| Conflict Type | Severity | Description | Detection Method |
|---------------|----------|-------------|------------------|
| **Incompatible Licenses** | High | Two or more licenses that cannot be legally combined | `checkLicenseConflicts()` compares all license pairs using `areLicensesCompatible()` |

### Known Incompatible License Pairs

| License 1 | License 2 | Reason |
|-----------|-----------|--------|
| GPL-2.0 | GPL-3.0 | Different GPL versions |
| GPL-2.0 | AGPL-3.0 | GPL vs AGPL incompatibility |
| GPL-3.0 | AGPL-3.0 | GPL vs AGPL incompatibility |
| LGPL-2.1 | LGPL-3.0 | Different LGPL versions |
| MPL-1.0 | MPL-2.0 | Different MPL versions |
| Apache-1.0 | Apache-2.0 | Different Apache versions |

### Compatibility Matrix

The system uses a compatibility matrix to determine if licenses can coexist:
- **Permissive licenses** (MIT, Apache-2.0, BSD, ISC, etc.) are generally compatible with each other
- **Copyleft licenses** (GPL, AGPL) have stricter compatibility rules
- **LGPL licenses** are compatible with permissive licenses and some copyleft licenses
- Complex license expressions (with AND/OR) are handled separately

---

## 3. License Transitions

License transitions are detected when the same package uses different licenses across different versions.

| Issue Type | Description | Fields | Example |
|------------|-------------|--------|---------|
| **License Transition** | A package changed its license between consecutive versions | `type: 'license-transition'`<br>`packageName`<br>`fromLicense`<br>`toLicense`<br>`fromVersion`<br>`toVersion`<br>`category`<br>`warnings` | Package "example-lib" changed from MIT (v1.0.0) to GPL-3.0 (v2.0.0) |

### Detection Logic

- High-risk dependencies are grouped by package name
- Versions are sorted chronologically
- Consecutive versions are compared for license changes
- Each transition is reported as a separate issue
- Displayed in the "🔄 License Changes" stat card

---

## 4. Same License Issues

When multiple versions of the same package share the same high-risk license, they are grouped into a single issue.

| Issue Type | Description | Fields | Example |
|------------|-------------|--------|---------|
| **Same License** | Multiple versions of a package share the same high-risk license | `type: 'same-license'`<br>`packageName`<br>`license`<br>`category`<br>`versions[]`<br>`warnings[]` | Package "example-lib" uses GPL-3.0 in versions 1.0.0, 1.1.0, 2.0.0 |

### Detection Logic

- High-risk dependencies are grouped by package name
- Versions are grouped by license
- If all versions share the same license, a single `same-license` issue is created
- If licenses differ, `license-transition` issues are created instead

---

## Issue Processing Flow

```
1. Analyze Dependencies
   ↓
2. Parse Licenses (LicenseProcessor.parseLicense)
   ↓
3. Categorize by Risk Level
   ↓
4. Identify High-Risk Dependencies (risk === 'high')
   ↓
5. Process High-Risk Dependencies (processHighRiskDependencies)
   ├─→ Group by Package Name
   ├─→ Sort Versions
   ├─→ Group by License
   └─→ Create Issues:
       ├─→ same-license (if all versions share license)
       └─→ license-transition (if licenses differ)
   ↓
6. Check License Conflicts (checkLicenseConflicts)
   └─→ Compare all license pairs
   └─→ Flag incompatible combinations
   ↓
7. Generate Compliance Report
   └─→ Summary statistics
   └─→ High-risk dependencies list
   └─→ Conflicts list
   └─→ Recommendations
```

---

## Display and Filtering

### Stat Cards

The following stat cards are displayed on the license compliance page:

| Card | Type | Count Source | Filter Behavior |
|------|------|--------------|----------------|
| **Total** | `total` | All high-risk issues | Shows all issues when clicked |
| **Copyleft** | `copyleft` | Issues with copyleft licenses | Filters to copyleft issues only |
| **Proprietary** | `proprietary` | Issues with proprietary licenses | Filters to proprietary issues only |
| **Unknown** | `unknown` | Issues with unknown licenses | Filters to unknown issues only |
| **Unlicensed** | `unlicensed` | Dependencies without licenses | Filters to unlicensed issues only |
| **License Changes** | `transitions` | License transition issues | Filters to transition issues only |

### Category Filter

A dropdown filter allows filtering by license category:
- **All Categories** - Shows all issues
- **Copyleft** - Shows only copyleft issues
- **Proprietary** - Shows only proprietary issues
- **Unknown** - Shows only unknown issues
- **Unlicensed** - Shows only unlicensed issues

The category filter is applied first, then stat card filters are applied on top of the category-filtered results.

---

## License Categories Reference

### Permissive (Low Risk)
- MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Unlicense, CC0-1.0, WTFPL, Zlib, Boost-1.0, Ruby

### LGPL (Medium Risk)
- LGPL-2.1, LGPL-3.0

### Copyleft (High Risk)
- GPL-2.0, GPL-3.0, GPL-2.0-only, GPL-2.0-or-later, GPL-3.0-only, GPL-3.0-or-later, AGPL-3.0, MPL-2.0, EPL-2.0

### Proprietary (Medium Risk)
- Commercial, Proprietary, Custom

### Unknown (High Risk)
- NOASSERTION, UNKNOWN, NONE, (empty string)

---

## Notes

- License analysis is performed only on dependencies found in the analyzed repositories' SBOMs
- Dependencies are extracted from SPDX SBOM format (`sbomData.sbom.packages`)
- The analysis does not scan all repositories in the database, only those analyzed in the current session
- License compatibility uses a permissive approach: unknown combinations are assumed compatible to avoid false positives
- Complex license expressions (with AND/OR operators) are handled with special logic

