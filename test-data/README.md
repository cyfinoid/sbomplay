# Test Data for SBOM Play

This directory contains test data extracted from real GitHub API responses to help test and develop the SBOM Play application.

## Data Source

All test data was extracted from the HAR file `client-storage/cyfinoid.github.io.har`, which contains real API responses from GitHub's SBOM API. This ensures the test data accurately represents the actual data structure and content that the application will encounter in production.

## Available Test Files

### Repository Data
- **`cyfinoid-repos.json`** - Real repository data for the cyfinoid GitHub organization
  - Contains 4 repositories: Test_check, ovaa, Dependency-trackers, and sbomplay
  - Includes full repository metadata (name, description, language, license, etc.)
  - Used for testing organization-wide analysis

### SBOM Data
- **`cyfinoid-ovaa-sbom.json`** - SBOM data for the ovaa repository
  - Contains GitHub Actions dependencies (trufflehog, setup-java, checkout, etc.)
  - 13 total dependencies with real version information
  - Good for testing GitHub Actions dependency analysis

- **`cyfinoid-dependency-trackers-sbom.json`** - SBOM data for the Dependency-trackers repository
  - Contains Python package dependencies (ldapdomaindump, wsproto, flask, etc.)
  - 10 total dependencies with real license and copyright information
  - Good for testing Python package dependency analysis

- **`cyfinoid-sbomplay-sbom.json`** - SBOM data for the sbomplay repository
  - Contains basic GitHub Actions dependencies (checkout, setup-node, deploy-pages)
  - 3 total dependencies for simple testing scenarios
  - Good for testing basic dependency functionality

## Usage Examples

### Loading Repository Data
```javascript
fetch('test-data/cyfinoid-repos.json')
    .then(response => response.json())
    .then(repos => {
        console.log('Loaded repositories:', repos);
        // Process repositories...
    });
```

### Loading SBOM Data
```javascript
fetch('test-data/cyfinoid-ovaa-sbom.json')
    .then(response => response.json())
    .then(sbomData => {
        console.log('Loaded SBOM data:', sbomData);
        // Process SBOM data...
    });
```

### Testing Different Scenarios

1. **GitHub Actions Dependencies**: Use `cyfinoid-ovaa-sbom.json`
2. **Python Package Dependencies**: Use `cyfinoid-dependency-trackers-sbom.json`
3. **Basic Dependencies**: Use `cyfinoid-sbomplay-sbom.json`
4. **Organization Analysis**: Use `cyfinoid-repos.json`

## Data Structure

All SBOM files follow the standard GitHub SBOM API response format:

```json
{
  "sbom": {
    "spdxVersion": "SPDX-2.3",
    "dataLicense": "CC0-1.0",
    "SPDXID": "SPDXRef-DOCUMENT",
    "name": "com.github.cyfinoid/[repository-name]",
    "packages": [
      {
        "name": "package-name",
        "SPDXID": "unique-identifier",
        "versionInfo": "version",
        "downloadLocation": "location",
        "externalRefs": [...]
      }
    ],
    "relationships": [
      {
        "spdxElementId": "source-package",
        "relatedSpdxElement": "target-package",
        "relationshipType": "DEPENDS_ON"
      }
    ]
  }
}
```

## Testing Scenarios

- **Organization Analysis**: Test organization-wide dependency analysis
- **Dependency Visualization**: Test the detailed view system with real dependency relationships
- **Storage Management**: Test storing and retrieving real organization data
- **Export Functionality**: Test exporting real SBOM data in various formats
- **Search and Filter**: Test search functionality with real package names and versions

## Notes

- All data is real and extracted from actual GitHub API responses
- Package names, versions, and relationships are authentic
- License and copyright information is preserved from the original data
- The data structure matches GitHub's SBOM API exactly

## Test Page

See `../test-unified.html` for a comprehensive testing suite that uses these test files. 