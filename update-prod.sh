#!/bin/bash

# Update Production Folder for GitHub Pages Deployment

echo "🔄 Updating production files..."

# Clean and copy files
rm -rf docs/*

# Copy all HTML files
cp index.html docs/
cp license-compliance.html docs/
cp vuln.html docs/
cp deps.html docs/
cp settings.html docs/
cp authors.html docs/

# Copy JavaScript and CSS directories
cp -r js docs/
cp -r css docs/

# Ensure .nojekyll file exists (prevents Jekyll processing)
touch docs/.nojekyll

echo "✅ Production files updated!"
echo ""
echo "📋 Next steps:"
echo "   git add docs/"
echo "   git commit -S -m \"deploy: $(date +%Y-%m-%d) - update SBOM Play\""
echo "   git push"
echo ""
echo "💡 Or use a more specific message:"
echo "   git commit -S -m \"deploy: add new feature / fix bug / update UI\""
echo ""
echo "📁 Files in docs/:"
ls -la docs/ 