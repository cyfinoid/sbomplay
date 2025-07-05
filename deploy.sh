#!/bin/bash

# Railway Deployment Script for SBOM Play
# This script helps prepare and deploy the application to Railway

echo "🚀 Preparing SBOM Play for Railway deployment..."

# Check if we're in the right directory
if [ ! -f "app.py" ]; then
    echo "❌ Error: app.py not found. Make sure you're in the project root directory."
    exit 1
fi

# Check if required files exist
echo "📋 Checking required files..."

required_files=("app.py" "requirements.txt" "Procfile" "runtime.txt" "railway.json")
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file found"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

# Check if directories exist
required_dirs=("templates" "static" "utils")
for dir in "${required_dirs[@]}"; do
    if [ -d "$dir" ]; then
        echo "✅ $dir directory found"
    else
        echo "❌ $dir directory missing"
        exit 1
    fi
done

echo ""
echo "🎯 All required files are present!"
echo ""
echo "📝 Next steps:"
echo "1. Push your code to GitHub:"
echo "   git add ."
echo "   git commit -m 'Prepare for Railway deployment'"
echo "   git push origin main"
echo ""
echo "2. Deploy to Railway:"
echo "   - Go to https://railway.app"
echo "   - Create new project"
echo "   - Connect your GitHub repository"
echo "   - Railway will automatically deploy"
echo ""
echo "3. Monitor deployment:"
echo "   - Check build logs in Railway dashboard"
echo "   - Monitor application logs"
echo "   - Test the health endpoint: /health"
echo ""
echo "📚 For detailed instructions, see RAILWAY_DEPLOYMENT.md"
echo ""
echo "✨ Your SBOM Play application is ready for Railway deployment!" 