# Deployment Guide

## 🚀 GitHub Release-Based Deployment (Recommended)

SBOM Play uses GitHub Actions for automated deployment. Deployment is triggered automatically when a GitHub release is created.

### Quick Deploy

1. **Create a GitHub Release**:
   - Go to your repository on GitHub
   - Click "Releases" → "Create a new release"
   - Create a new tag (e.g., `v0.0.2`)
   - Fill in release title and description
   - Click "Publish release"

2. **Automatic Deployment**:
   - The `deploy-github-pages.yml` workflow automatically triggers
   - Files are copied to `_site/` directory
   - Artifact is uploaded and deployed to GitHub Pages
   - Your site will be live at: `https://cyfinoid.github.io/sbomplay/`

### Manual Workflow Trigger

You can also manually trigger the deployment workflow:
- Go to Actions → "Deploy to GitHub Pages"
- Click "Run workflow"
- Select branch and click "Run workflow"

## 📋 GitHub Pages Setup

1. Go to repository Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` (or your default)
4. Folder: `/` (root, GitHub Actions handles deployment)
5. Save

**Note**: With GitHub Actions deployment, the source should be set to "GitHub Actions" instead of "Deploy from a branch".

## ✅ Pre-deploy Checklist

- [ ] Test locally: `open index.html`
- [ ] Verify all HTML files are present (index.html, licenses.html, vuln.html, deps.html, authors.html, settings.html, quality.html)
- [ ] Verify all JavaScript files are present in `js/` directory
- [ ] Verify all CSS files are present in `css/` directory
- [ ] Update version strings in HTML files (e.g., `?v=0.0.2`)
- [ ] Create GitHub release with appropriate tag
- [ ] Monitor GitHub Actions workflow for deployment status

## 🎯 File Structure

```
sbomplay/
├── index.html              # Main app
├── licenses.html # License compliance page
├── vuln.html              # Vulnerability analysis page
├── quality.html           # SBOM quality assessment page
├── deps.html              # Dependency view page
├── authors.html           # Author analysis page
├── settings.html          # Settings and storage management
├── js/                    # JavaScript modules
│   ├── app.js
│   ├── github-client.js
│   ├── indexeddb-manager.js
│   ├── license-processor.js
│   ├── osv-service.js
│   ├── sbom-processor.js
│   ├── storage-manager.js
│   ├── view-manager.js
│   └── ... (other modules)
├── css/                   # Stylesheets
│   ├── style.css
│   └── themes.css
├── .github/workflows/     # GitHub Actions workflows
│   ├── deploy-github-pages.yml
│   └── validate-deployment.yml
└── LICENSE                # GPL-3.0 license
```

## 📝 Deployment Workflow Details

The `deploy-github-pages.yml` workflow:

1. **Triggers**: On release creation or manual workflow dispatch
2. **Steps**:
   - Checks out repository code
   - Sets up GitHub Pages
   - Creates `_site/` directory
   - Copies all required HTML files
   - Copies `js/` and `css/` directories
   - Creates `.nojekyll` file
   - Uploads artifact
   - Deploys to GitHub Pages

## 🔍 Validation Workflow

The `validate-deployment.yml` workflow:

- Runs on pull requests and pushes to main branches
- Validates all required HTML files are present
- Validates all required JavaScript files are present
- Validates all required CSS files are present
- Checks HTML syntax
- Checks for sensitive data patterns

This helps catch deployment issues early before release.

## 🐛 Troubleshooting

### Deployment Fails

- Check GitHub Actions logs for specific errors
- Verify all required files exist in the repository
- Ensure GitHub Pages is configured correctly in Settings
- Check that the workflow has necessary permissions

### Files Not Deploying

- Verify files are in the root directory (not in subdirectories)
- Check that `.nojekyll` file is created
- Ensure file names match exactly (case-sensitive)

### Version Cache Issues

- Update version strings in HTML files (e.g., `?v=0.0.2`)
- Clear browser cache or use incognito mode
- Version strings ensure browsers fetch latest files
