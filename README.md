# SBOM Play

A web-based tool for analyzing Software Bill of Materials (SBOM) data from GitHub repositories, organizations, and users.

## Features

- Analyze SBOM data from GitHub organizations and users
- Track dependency usage across repositories
- Generate dependency distribution reports
- Export analysis results as JSON
- Rate limit handling and recovery
- Persistent storage of analysis results
- Multi-organization storage: Keep data for all analyzed organizations until manually cleared
- Organization management: View, load, and remove individual organization data
- Bulk export: Export all stored analyses at once

## Quick Start

1. Open `index.html` in your web browser
2. Optionally enter a GitHub Personal Access Token for better rate limits
3. Enter an organization name or username to analyze
4. Click "Analyze Organization or User" to start the analysis
5. View results and export data as needed

## Development & Deployment

### Development Workflow
1. **Work in main folder** - Edit `index.html`, `js/`, `css/` files directly
2. **Test locally** - Open `index.html` in browser to test
3. **Deploy when ready**:
   ```bash
   ./deploy.sh                    # Automatic deployment with meaningful commit
   ```
   
   Or manually:
   ```bash
   ./update-prod.sh                    # Copy to docs folder
   git add docs/                       # Stage changes
   git commit -S -m "deploy: update SBOM Play production files"   # Commit with signing
   git push                            # Deploy to GitHub Pages
   ```

### GitHub Pages Setup
1. Go to repository Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` (or your default)
4. Folder: `/docs`
5. Your site will be at: `https://yourusername.github.io/sbomplay/`

## Recent Fixes

### SBOM Processing Issue (Fixed)
The tool now correctly processes GitHub's SBOM data format. The issue was that GitHub's SBOM API uses `versionInfo` instead of `version` for package versions. This has been fixed and the tool should now properly capture dependencies.

### Organization and User Support (Added)
The tool now supports analyzing both GitHub organizations and individual users. It automatically detects whether the input is an organization or user and uses the appropriate API endpoint.

### Multi-Organization Storage (Added)
The tool now maintains data for all analyzed organizations and users until manually cleared. Features include:
- **Persistent Storage**: All analysis data is saved and persists between sessions
- **Organization Overview**: View all stored analyses with statistics
- **Individual Management**: Load, view, or remove specific organization data
- **Bulk Operations**: Export all data or clear all stored analyses
- **Smart Updates**: Re-analyzing an organization updates existing data instead of creating duplicates

## Storage Management

### Local Storage Quota

SBOM Play uses browser localStorage to store analysis data. localStorage has a 5MB limit, which can be exceeded with large analyses. The tool includes several features to manage this:

#### Automatic Features
- **Data Compression**: Large data is automatically compressed to save space
- **Quota Monitoring**: Real-time storage usage tracking
- **Automatic Cleanup**: Old data is automatically removed when quota is exceeded
- **Smart Limits**: Maximum 10 organizations and 20 history entries stored

#### Manual Management
- **Storage Status**: Check current usage and available space
- **Export Data**: Export all data before clearing to preserve results
- **Clear Old Data**: Remove old analyses while keeping recent ones
- **Clear All Data**: Complete reset of stored data

#### Storage Warnings
The tool will show warnings when:
- Storage usage exceeds 70% (warning)
- Storage usage exceeds 90% (danger)
- Quota is exceeded during save (error)

### Storage Quota Exceeded Error

If you encounter a "QuotaExceededError", the tool will:
1. Attempt to compress the data
2. Clean up old history entries
3. Remove oldest organizations if needed
4. Show a user-friendly error message if cleanup fails

**To resolve:**
1. Export your current data using "Export All Data"
2. Clear old analyses using "Clear Old Data"
3. Try the analysis again

## Troubleshooting

### No Dependencies Found

If the analysis shows 0 dependencies, this is usually due to one of these reasons:

#### 1. Dependency Graph Not Enabled
GitHub's Dependency Graph feature must be enabled on repositories for SBOM data to be available.

**To enable Dependency Graph:**
- Go to the repository on GitHub
- Navigate to Settings → Security & analysis
- Enable "Dependency graph" under "Security & analysis"
- This requires admin access to the repository

#### 2. No Dependency Files
Repositories need to have dependency files for the Dependency Graph to work:

**Supported file types:**
- `package.json` (Node.js)
- `requirements.txt` (Python)
- `Gemfile` (Ruby)
- `pom.xml` (Java/Maven)
- `build.gradle` (Java/Gradle)
- `Cargo.toml` (Rust)
- `composer.json` (PHP)
- And many more...

#### 3. Authentication Required
- Private repositories require a GitHub Personal Access Token
- Some organizations may have restricted access
- Rate limits are higher with authentication

#### 4. Rate Limiting
- Without authentication: 60 requests/hour
- With authentication: 5,000 requests/hour
- The tool handles rate limiting automatically

### Common Error Messages

- **"Dependency graph not enabled"**: The repository doesn't have Dependency Graph enabled
- **"Access denied"**: Repository is private or requires authentication
- **"Rate limit exceeded"**: Too many requests, will retry automatically
- **"Organization not found"**: Check the organization name spelling

### Best Practices

1. **Use a GitHub Token**: Provides higher rate limits and access to private repositories
2. **Enable Dependency Graph**: Ensure repositories have this feature enabled
3. **Check Repository Settings**: Verify repositories have dependency files
4. **Monitor Console**: Check browser console for detailed error messages

## Technical Details

- Uses GitHub's Dependency Graph API
- Supports all GitHub-supported dependency file formats
- Handles rate limiting with automatic retry
- Stores results in browser localStorage
- No server-side processing required
- Correctly processes GitHub's SBOM format (`versionInfo` field)

## Rate Limits

- **Unauthenticated**: 60 requests/hour
- **Authenticated**: 5,000 requests/hour
- The tool automatically handles rate limiting and waits for reset

## Browser Compatibility

- Modern browsers with ES6+ support
- Requires localStorage support
- No external dependencies

## Project Structure

```
sbomplay/
├── index.html              # Main application
├── js/                     # JavaScript files
│   ├── app.js
│   ├── github-client.js
│   ├── sbom-processor.js
│   └── storage-manager.js
├── css/                    # CSS files
│   └── style.css
├── docs/                   # Production deployment (for GitHub Pages)
├── test-*.html            # Optional test files
└── legacy/                 # Old Python scripts (deprecated)
```

## License

MIT License - see LICENSE file for details.
