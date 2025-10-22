# GitHub Actions Workflows

## Deploy to GitHub Pages (`deploy-github-pages.yml`)

### Overview
Automatically deploys the SBOM Play application to GitHub Pages when a new release is created.

### Security Features

#### 1. **Minimal Permissions**
```yaml
permissions:
  contents: read      # Only read access to repository
  pages: write        # Only write to GitHub Pages
  id-token: write     # OIDC token for deployment verification
```

#### 2. **Trigger Control**
- ✅ Triggers only on release creation (not every push)
- ✅ Manual trigger available via `workflow_dispatch`
- ✅ No secrets in workflow file
- ✅ Uses GITHUB_TOKEN (automatically scoped)

#### 3. **Action Security**
- ✅ All actions pinned to major versions (v3, v4)
- ✅ Uses official GitHub actions only
- ✅ Shallow clone (fetch-depth: 1) - faster and more secure
- ✅ Concurrency control to prevent deployment conflicts

#### 4. **Environment Protection**
- Uses `github-pages` environment
- Allows for manual approval if configured
- Deployment URL automatically added to release

### Usage

#### Creating a Release
1. Tag your code:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. Create a release on GitHub:
   - Go to Releases → Draft a new release
   - Choose your tag
   - Add release notes
   - Publish release

3. The workflow automatically deploys to GitHub Pages

#### Manual Deployment
1. Go to Actions tab
2. Select "Deploy to GitHub Pages"
3. Click "Run workflow"
4. Choose branch and run

### First-Time Setup

Before the workflow can run, enable GitHub Pages in your repository settings:

1. Go to **Settings** → **Pages**
2. Under **Source**, select "GitHub Actions"
3. Save

### Monitoring

- View deployment status in the Actions tab
- Deployment URL is shown in the workflow summary
- Release page will show the deployment status

### Security Best Practices Implemented

✅ **Principle of Least Privilege**: Only necessary permissions granted
✅ **No Hardcoded Secrets**: Uses automatic GITHUB_TOKEN
✅ **Version Pinning**: Actions pinned to prevent supply chain attacks
✅ **OIDC Authentication**: Verifiable deployment origin
✅ **Concurrency Control**: Prevents race conditions
✅ **Shallow Clones**: Reduces attack surface
✅ **Release-Based**: Only deploys verified releases, not every commit

### Troubleshooting

**Issue**: Workflow doesn't trigger
- Solution: Ensure "Actions" are enabled in Settings → Actions

**Issue**: Permission denied
- Solution: Check that GitHub Pages source is set to "GitHub Actions"

**Issue**: Deployment fails
- Solution: Verify all files are committed and pushed

### Advanced Configuration

#### Add Environment Protection Rules
1. Go to Settings → Environments → github-pages
2. Configure protection rules:
   - Required reviewers (for production safety)
   - Wait timer (cooldown period)
   - Deployment branches (restrict to main/master)

#### Customize Deployment Path
To deploy only specific files:
```yaml
- name: Upload artifact
  uses: actions/upload-pages-artifact@v3
  with:
    path: './dist'  # Deploy only dist folder
```

#### Add Build Step
If you need to build before deploying:
```yaml
- name: Build
  run: |
    npm install
    npm run build
```

### Security Checklist

Before deploying:
- [ ] Reviewed all committed files
- [ ] No secrets or API keys in code
- [ ] .gitignore properly configured
- [ ] Sensitive files excluded
- [ ] GitHub Pages source set to "Actions"
- [ ] Repository visibility matches intent (public/private)

### Related Documentation

- [GitHub Pages Documentation](https://docs.github.com/pages)
- [GitHub Actions Security](https://docs.github.com/actions/security-guides)
- [Deployment Environments](https://docs.github.com/actions/deployment/targeting-different-environments)

