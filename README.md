# SBOM Play

## About

A client-side web application for analyzing Software Bill of Materials (SBOM) data from GitHub repositories, organizations, and users. Built for security professionals to identify dependency vulnerabilities, assess license compliance, and understand software supply chain risks in real-time.

The tool features comprehensive SBOM analysis including dependency tracking, vulnerability detection via OSV.dev integration, license compliance checking, author analysis with funding detection, and SBOM quality assessment. All analysis happens directly in your browser - no data ever leaves your machine.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-SBOM%20Play-blue?style=for-the-badge&logo=github)](https://cyfinoid.github.io/sbomplay/)

## Features

- **SBOM Analysis**: Analyze SBOM data from GitHub organizations, users, and repositories
- **Dependency Tracking**: Track dependency usage across multiple repositories
- **Vulnerability Detection**: OSV.dev integration for vulnerability scanning
- **License Compliance**: Comprehensive license categorization and risk assessment
- **Author Analysis**: Author deduplication and funding opportunity detection
- **SBOM Quality Assessment**: Quality scoring based on multiple categories
- **Multi-Organization Storage**: Persistent storage using IndexedDB
- **Export/Import**: Export and import analysis data with checksum validation
- **Rate Limit Handling**: Automatic rate limit handling and recovery
- **Privacy-First**: All processing happens client-side in your browser

## Quick Start

1. Open `index.html` in your web browser or visit [https://cyfinoid.github.io/sbomplay/](https://cyfinoid.github.io/sbomplay/)
2. Optionally enter a GitHub Personal Access Token for better rate limits (Settings page)
3. Enter an organization name, username, or GitHub repository URL to analyze
4. Click "Analyze Organization or User" to start the analysis
5. View results across multiple pages:
   - **Analysis**: Overview with statistics dashboard
   - **License**: License compliance and risk assessment
   - **Vulnerabilities**: OSV.dev vulnerability scanning results
   - **Quality**: SBOM quality assessment scores
   - **Dependencies**: Detailed dependency view with filtering
   - **Authors**: Author analysis with funding opportunities
   - **Settings**: Storage management and configuration

## 🤖 AI-Assisted Development

This project was developed with the assistance of AI tools, most notably **Cursor IDE** and **Claude Code**. These tools helped accelerate development and improve velocity. All AI-generated code has been carefully reviewed and validated through human inspection to ensure it aligns with the project's intended functionality and quality standards.

## Storage Management

### IndexedDB Storage

SBOM Play uses browser IndexedDB to store analysis data. IndexedDB provides generous storage limits (typically 50% of available disk space), making it ideal for large-scale SBOM analyses.

#### Storage Features
- **Generous Limits**: IndexedDB typically allows storing gigabytes of data
- **Persistent Storage**: Data persists between browser sessions
- **Efficient Queries**: Fast retrieval of specific organizations or repositories
- **Separate Stores**: Organizations, repositories, vulnerabilities, and authors stored in separate object stores

#### Manual Management
- **Storage Status**: Check current usage and available space in Settings
- **Export Data**: Export all data to JSON for backup or sharing (with checksum validation)
- **Clear Old Data**: Remove old analyses while keeping recent ones
- **Clear All Data**: Complete reset of stored data

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
- Stores results in browser IndexedDB (not localStorage)
- No server-side processing required
- Correctly processes GitHub's SBOM format (`versionInfo` field)
- Client-side vulnerability scanning via OSV.dev API
- License compliance analysis with 100+ recognized licenses

## Rate Limits

- **Unauthenticated**: 60 requests/hour
- **Authenticated**: 5,000 requests/hour
- The tool automatically handles rate limiting and waits for reset

## Browser Compatibility

- Modern browsers with ES6+ support
- Requires IndexedDB support
- No external dependencies (uses CDN for Bootstrap and Font Awesome)

## Development & Deployment

### Development Workflow
1. **Work in main folder** - Edit `index.html`, `js/`, `css/` files directly
2. **Test locally** - Open `index.html` in browser to test
3. **Deploy via GitHub Release** - Create a release tag to trigger automatic deployment

### GitHub Pages Deployment

Deployment is automated via GitHub Actions when a release is created:

1. Create a new release on GitHub (with tag like `v0.0.2`)
2. The `deploy-github-pages.yml` workflow automatically:
   - Copies all required files to `_site/` directory
   - Uploads artifact
   - Deploys to GitHub Pages
3. Your site will be available at: `https://cyfinoid.github.io/sbomplay/`

See [DEPLOY.md](DEPLOY.md) for detailed deployment instructions.

## Project Structure

```
sbomplay/
├── index.html              # Main application
├── licenses.html # License compliance page
├── vuln.html              # Vulnerability analysis page
├── quality.html           # SBOM quality assessment page
├── deps.html              # Dependency view page
├── authors.html           # Author analysis page
├── settings.html          # Settings and storage management
├── js/                    # JavaScript files
│   ├── app.js
│   ├── github-client.js
│   ├── sbom-processor.js
│   ├── license-processor.js
│   ├── osv-service.js
│   ├── storage-manager.js
│   ├── view-manager.js
│   └── ... (other modules)
├── css/                   # CSS files
│   ├── style.css
│   └── themes.css
├── .github/workflows/     # GitHub Actions workflows
│   ├── deploy-github-pages.yml
│   └── validate-deployment.yml
└── LICENSE                # GPL-3.0 license
```

## 💬 Community & Discussion

Join our Discord server for discussions, questions, and collaboration:

**[Join our Discord Server](https://discord.gg/7trkcUFrgR)**

Connect with other security researchers, share your findings, and get help with usage and development.

## 📄 License

This project is licensed under the GNU General Public License v3 (GPLv3) - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is designed for security auditing and analysis of systems you own or have explicit permission to analyze. Always ensure you have proper authorization before using this tool against any systems or repositories you don't own. The authors are not responsible for any misuse of this software.

## 🔬 Cyfinoid Research

**Cutting-Edge Software Supply Chain Security Research**

Pioneering advanced software supply chain security research and developing innovative security tools for the community. This tool is part of our free research toolkit - helping security researchers and organizations identify software supply chain vulnerabilities and assess license compliance.

### 🌐 Software Supply Chain Focus

Specializing in software supply chain attacks, CI/CD pipeline security, and offensive security research. Our research tools help organizations understand their software supply chain vulnerabilities and develop effective defense strategies.

### 🎓 Learn & Explore

Explore our professional training programs, latest research insights, and free open source tools developed from our cutting-edge cybersecurity research.

**[Upcoming Trainings](https://cyfinoid.com/trainings/#upcoming-trainings)** | **[Read Our Blog](https://cyfinoid.com/blog/)** | **[Open Source by Cyfinoid](https://cyfinoid.com/opensource-by-cyfinoid/)**

Hands-on training in software supply chain security, CI/CD pipeline attacks, and offensive security techniques

© 2025 Cyfinoid Research.
