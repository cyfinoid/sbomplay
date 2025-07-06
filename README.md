# SBOM Play

A web-based tool for analyzing Software Bill of Materials (SBOM) data from GitHub repositories, organizations, and users.

## Features

- Analyze SBOM data from GitHub organizations and users
- Track dependency usage across repositories
- Generate dependency distribution reports
- Export analysis results as JSON
- Rate limit handling and recovery
- Persistent storage of analysis results

## Usage

1. Open `index.html` in your web browser
2. Optionally enter a GitHub Personal Access Token for better rate limits
3. Enter an organization name or username to analyze
4. Click "Analyze Organization or User" to start the analysis
5. View results and export data as needed

## Recent Fixes

### SBOM Processing Issue (Fixed)
The tool now correctly processes GitHub's SBOM data format. The issue was that GitHub's SBOM API uses `versionInfo` instead of `version` for package versions. This has been fixed and the tool should now properly capture dependencies.

### Organization and User Support (Added)
The tool now supports analyzing both GitHub organizations and individual users. It automatically detects whether the input is an organization or user and uses the appropriate API endpoint.

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

## Testing

You can test the SBOM processing with the included test files:
- `test-github-api.html` - Test GitHub API access and SBOM availability
- `test-sbom-fix.html` - Test the SBOM processing logic with sample data

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
├── css/
│   └── style.css          # Application styles
├── js/
│   ├── app.js             # Main application logic
│   ├── github-client.js   # GitHub API client
│   ├── sbom-processor.js  # SBOM analysis logic
│   └── storage-manager.js # Local storage management
├── legacy/
│   └── scripts/           # Legacy Python scripts
│       ├── sbom-play.py
│       └── generate_top_dependency_report.py
├── dev.sh                 # Development startup script
└── README.md              # This file
```

## License

MIT License - see LICENSE file for details.
