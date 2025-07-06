#!/bin/bash

# Update Production Folder for GitHub Pages Deployment

echo "🔄 Updating production files..."

# Clean and copy files
rm -rf docs/*
cp index.html docs/
cp view.html docs/
cp -r js docs/
cp -r css docs/

# Ensure .nojekyll file exists
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