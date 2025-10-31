# Ecosyste.ms vs Direct Registry APIs - Comparison & Strategy

## Overview

Compared data quality between direct registry APIs and [ecosyste.ms](https://packages.ecosyste.ms/api/v1/registries) to determine the best source for author/maintainer data.

## Registry Names from Ecosyste.ms

**Important:** Ecosyste.ms uses specific registry names, NOT the purl types:

| Purl Type | Ecosyste.ms Registry Name | URL |
|-----------|---------------------------|-----|
| `npm` | `npmjs.org` | https://packages.ecosyste.ms/api/v1/registries/npmjs.org |
| `pypi` | `pypi.org` | https://packages.ecosyste.ms/api/v1/registries/pypi.org |
| `cargo` | `crates.io` | https://packages.ecosyste.ms/api/v1/registries/crates.io |
| `gem` | `rubygems.org` | https://packages.ecosyste.ms/api/v1/registries/rubygems.org |
| `maven` | `repo1.maven.org` | https://packages.ecosyste.ms/api/v1/registries/repo1.maven.org |
| `golang`/`go` | `proxy.golang.org` | https://packages.ecosyste.ms/api/v1/registries/proxy.golang.org |
| `composer`/`packagist` | `packagist.org` | https://packages.ecosyste.ms/api/v1/registries/packagist.org |
| `nuget` | `nuget.org` | https://packages.ecosyste.ms/api/v1/registries/nuget.org |
| `docker` | `hub.docker.com` | https://packages.ecosyste.ms/api/v1/registries/hub.docker.com |

## Detailed Comparison

### 1. npm (Node.js)

**Direct API:** `https://registry.npmjs.org/{package}/latest`
```json
{
  "author": {
    "name": "TJ Holowaychuk",
    "email": "tj@vision-media.ca"
  },
  "maintainers": [
    {"name": "wesleytodd", "email": "wes@wesleytodd.com"}
  ]
}
```

**Ecosyste.ms:** `https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages/{package}`
```json
{
  "maintainers": [
    {
      "login": "wesleytodd",
      "name": null,           // ← Names are null!
      "email": "wes@wesleytodd.com"
    }
  ]
}
```

**Comparison:**
| Field | Direct API | Ecosyste.ms | Winner |
|-------|------------|-------------|--------|
| Author name | ✅ Full name | ❌ Null | Direct API |
| Maintainer name | ✅ Username | ❌ Null | Direct API |
| Email | ✅ Available | ✅ Available | Tie |
| Login/Username | ❌ Not provided | ✅ Provided | Ecosyste.ms |

**Decision:** ✅ **Use Direct API** (better name data)

---

### 2. PyPI (Python)

**Direct API:** `https://pypi.org/pypi/{package}/json`
```json
{
  "info": {
    "author": "Kenneth Reitz",
    "author_email": "me@kennethreitz.org",
    "maintainer": null,
    "maintainer_email": null
  }
}
```

**Ecosyste.ms:** `https://packages.ecosyste.ms/api/v1/registries/pypi.org/packages/{package}`
```json
{
  "maintainers": [
    {
      "login": "nateprewitt",  // ← Multiple maintainers with logins!
      "name": null,
      "email": null
    },
    {
      "login": "graffatcolmingov",
      "name": null,
      "email": null
    }
  ]
}
```

**Comparison:**
| Field | Direct API | Ecosyste.ms | Winner |
|-------|------------|-------------|--------|
| Author name | ✅ Available | ❌ Not provided | Direct API |
| Author email | ✅ Available | ❌ Not provided | Direct API |
| Maintainers | ❌ Single/Limited | ✅ Multiple with logins | Ecosyste.ms |
| Login/Username | ❌ Not provided | ✅ Provided | Ecosyste.ms |

**Decision:** ⚠️ **Use Both** 
- Direct API for author name + email
- Ecosyste.ms for maintainer logins (future enhancement)

---

### 3. Crates.io (Rust)

**Direct API:** `https://crates.io/api/v1/crates/{package}/owners`
```json
{
  "users": [
    {
      "login": "carllerche",
      "name": "Carl Lerche",
      "email": null
    }
  ]
}
```

**Ecosyste.ms:** `https://packages.ecosyste.ms/api/v1/registries/crates.io/packages/{package}`
```json
{
  "maintainers": [
    {
      "login": "carllerche",
      "name": "Carl Lerche",
      "email": null
    }
  ]
}
```

**Comparison:**
| Field | Direct API | Ecosyste.ms | Winner |
|-------|------------|-------------|--------|
| Login | ✅ Available | ✅ Available | Tie |
| Name | ✅ Available | ✅ Available | Tie |
| Email | ❌ Never provided | ❌ Never provided | N/A |
| Data structure | ✅ users[] | ✅ maintainers[] | Tie |

**Decision:** ✅ **Use Either** (ecosyste.ms for consistency)

---

### 4. RubyGems (Ruby)

**Direct API:** `https://rubygems.org/api/v1/gems/{package}.json`
```json
{
  "authors": "David Heinemeier Hansson",  // ← Just a string!
  "author": null,
  "maintainers": null
}
```

**Ecosyste.ms:** `https://packages.ecosyste.ms/api/v1/registries/rubygems.org/packages/{package}`
```json
{
  "maintainers": [
    {
      "login": "jhawthorn",    // ← Multiple maintainers with logins!
      "name": null,
      "email": null
    },
    {
      "login": "tenderlove",
      "name": null,
      "email": null
    }
  ]
}
```

**Comparison:**
| Field | Direct API | Ecosyste.ms | Winner |
|-------|------------|-------------|--------|
| Author info | ⚠️ String only | ❌ Not provided | Direct API (limited) |
| Maintainers | ❌ Not provided | ✅ Multiple with logins! | Ecosyste.ms |
| Login/Username | ❌ Not provided | ✅ Provided | Ecosyste.ms |
| Structured data | ❌ String only | ✅ Objects | Ecosyste.ms |

**Decision:** ✅ **Use Ecosyste.ms** (MUCH better data!)

---

### 5. Maven (Java)

**Direct API:** No single API - requires complex Maven Central queries

**Ecosyste.ms:** `https://packages.ecosyste.ms/api/v1/registries/repo1.maven.org/packages/{group}:{artifact}`
```json
{
  "maintainers": []  // ← Empty for most packages
}
```

**Decision:** ⚠️ **Limited Options**
- Maven doesn't expose maintainer data well
- Ecosyste.ms doesn't have it either
- Best effort with POM file parsing (if available)

---

### 6. Go Modules

**Direct API:** No maintainer API

**Ecosyste.ms:** `https://packages.ecosyste.ms/api/v1/registries/proxy.golang.org/packages/{module}`
```json
{
  "maintainers": []  // ← Empty
}
```

**Decision:** ⚠️ **Limited Options**
- Extract from module path (github.com/user/repo)
- Query GitHub API for repository owners

---

## Data Quality Summary

### Email Availability

| Registry | Direct API | Ecosyste.ms | Best Source |
|----------|------------|-------------|-------------|
| **npm** | ✅ Consistent | ✅ Consistent | Direct API (has names) |
| **PyPI** | ✅ Available | ❌ Not provided | Direct API |
| **Crates.io** | ❌ Never | ❌ Never | N/A |
| **RubyGems** | ❌ Never | ❌ Never | N/A |
| **Maven** | ❌ Never | ❌ Never | N/A |
| **Go** | ❌ Never | ❌ Never | N/A |

### Login/Username Availability

| Registry | Direct API | Ecosyste.ms | Best Source |
|----------|------------|-------------|-------------|
| **npm** | ⚠️ As name field | ✅ Explicit login field | Ecosyste.ms |
| **PyPI** | ❌ Not provided | ✅ Provided | Ecosyste.ms |
| **Crates.io** | ✅ Provided | ✅ Provided | Either |
| **RubyGems** | ❌ Not provided | ✅ Provided | Ecosyste.ms |
| **Maven** | ❌ Not provided | ❌ Not provided | N/A |
| **Go** | ❌ Not provided | ❌ Not provided | N/A |

### Maintainer Count

| Registry | Direct API | Ecosyste.ms | Best Source |
|----------|------------|-------------|-------------|
| **npm** | ✅ Multiple | ✅ Multiple | Either |
| **PyPI** | ⚠️ Single author | ✅ Multiple maintainers | Ecosyste.ms |
| **Crates.io** | ✅ Multiple | ✅ Multiple | Either |
| **RubyGems** | ❌ String only | ✅ Multiple maintainers | Ecosyste.ms |
| **Maven** | ❌ None | ❌ None | N/A |
| **Go** | ❌ None | ❌ None | N/A |

## Implementation Strategy

### Current Priority (Implemented)

1. **npm**: ✅ Use direct API (better names + emails)
2. **PyPI**: ✅ Use direct API (author name + email)
3. **Crates.io**: ✅ Use direct API (login + name)
4. **RubyGems**: ✅ Use direct API (author string)

### Recommended Enhancement

Consider using ecosyste.ms as **supplementary source** for:

1. **RubyGems**: Switch to ecosyste.ms (better maintainer data)
2. **PyPI**: Add ecosyste.ms for additional maintainers
3. **All registries**: Use ecosyste.ms login field for better deduplication

### Code Updates Made

✅ Updated registry name mappings to use correct ecosyste.ms names:
- `npm` → `npmjs.org`
- `pypi` → `pypi.org`
- `cargo` → `crates.io`
- `gem` → `rubygems.org`
- `maven` → `repo1.maven.org`
- `go` → `proxy.golang.org`
- `composer` → `packagist.org`
- `nuget` → `nuget.org`
- `docker` → `hub.docker.com`

✅ Updated `extractEcosystemsAuthors()` to handle ecosyste.ms data structure:
- Uses `login` field as pseudo-email for deduplication
- Prefers `name` over `login` for display
- Handles `maintainers` and `owners` arrays

## Deduplication Strategy

### Using Login as Unique Identifier

For registries without email, use `login` field as unique identifier:

```javascript
{
  name: m.name || m.login,      // Display: prefer name
  email: m.email || m.login      // Dedup: use login as pseudo-email
}
```

This works because:
- `login` is unique per user per registry
- Can be used as deduplication key like email
- Prevents duplicate entries for same user

### Example

**PyPI maintainers from ecosyste.ms:**
```json
[
  {"login": "nateprewitt", "name": null, "email": null},
  {"login": "nateprewitt", "name": null, "email": null}
]
```

**After deduplication:**
- Groups by login ("nateprewitt")
- Results in single author entry
- Displays as "nateprewitt"

## Performance Considerations

### API Call Strategy

**Current:** 
1. Try native registry first (faster, cached by CDN)
2. Fallback to ecosyste.ms if needed
3. Cache results in IndexedDB

**Consideration for Future:**
- Ecosyste.ms provides unified interface
- Could reduce code complexity
- Single API for all registries
- But: loses name data for npm
- Trade-off: simplicity vs data quality

## Recommendations

### Immediate (Current Implementation)

✅ Use correct registry names for ecosyste.ms  
✅ Keep direct API calls for better npm data  
✅ Use login field for deduplication where email isn't available  

### Future Enhancements

1. **Hybrid Approach for PyPI:**
   - Direct API for author (name + email)
   - Ecosyste.ms for maintainers (logins)
   - Merge both sources

2. **Switch RubyGems to Ecosyste.ms:**
   - Much better data (multiple maintainers)
   - Has login field for each
   - Current direct API only has string

3. **Add Login Display:**
   - Show both name and login in author details
   - Example: "Carl Lerche (@carllerche)"
   - Helps users identify exact contributors

4. **GitHub API Integration:**
   - For Go modules: extract owner from path
   - Query GitHub API for user details
   - Get name, email, avatar

## Conclusion

**Ecosyste.ms provides valuable data** especially for:
- **RubyGems**: Only source with structured maintainer data
- **PyPI**: Additional maintainers beyond author
- **Login fields**: Better deduplication across all registries

**Direct APIs are better for:**
- **npm**: Full names + emails (ecosyste.ms has null names)
- **PyPI author**: Name + email for primary author
- **Performance**: Registry-specific CDNs, better caching

**Best strategy:** Use direct APIs where they provide better data, supplement with ecosyste.ms for additional information like logins and extra maintainers.

