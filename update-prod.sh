#!/bin/bash

# Update Production Folder for GitHub Pages Deployment

echo "🔄 Updating production files..."

# Clean and copy files
rm -rf prod/*
cp index.html prod/
cp -r js prod/
cp -r css prod/

echo "✅ Production files updated!"
echo ""
echo "📋 Next steps:"
echo "   git add prod/"
echo "   git commit -S -m \"deploy: $(date +%Y-%m-%d) - update SBOM Play\""
echo "   git push"
echo ""
echo "💡 Or use a more specific message:"
echo "   git commit -S -m \"deploy: add new feature / fix bug / update UI\""
echo ""
echo "📁 Files in prod/:"
ls -la prod/ 