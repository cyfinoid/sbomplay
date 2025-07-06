# Deployment Checklist

## 🚀 Quick Deploy (Automatic)

```bash
# One command does everything:
./deploy.sh
```

This automatically:
- Updates production files
- Generates meaningful commit message
- Signs the commit
- Pushes to deploy

## 🚀 Manual Deploy

```bash
# 1. Update production files
./update-prod.sh

# 2. Commit and deploy (with signing and meaningful message)
git add docs/
git commit -S -m "deploy: update SBOM Play production files"
git push
```

## 📋 GitHub Pages Setup

1. Go to repository Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` (or your default)
4. Folder: `/docs`
5. Save

Your site: `https://yourusername.github.io/sbomplay/`

## ✅ Pre-deploy Checklist

- [ ] Test locally: `open index.html`
- [ ] Deploy: `./deploy.sh` (automatic) or manual steps below
- [ ] Test production: `open docs/index.html`

## 🎯 File Structure

```
sbomplay/
├── index.html              # Main app
├── js/                     # JavaScript
├── css/                    # Styles
├── docs/                   # Production (for GitHub Pages)
├── test-*.html            # Optional tests
├── deploy.sh              # Automatic deployment script
└── README.md              # Documentation
```

## 📝 Commit Message Examples

The `deploy.sh` script automatically generates messages like:
```bash
deploy: update main application UI - 2024-07-06
deploy: update JavaScript functionality - 2024-07-06
deploy: update styling and layout - 2024-07-06
deploy: update SBOM Play production files - 2024-07-06
``` 