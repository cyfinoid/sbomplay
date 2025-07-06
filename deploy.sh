#!/bin/bash

# SBOM Play Deployment Script

echo "🚀 Deploying SBOM Play..."

# Update production files
./update-prod.sh

# Stage production files
git add docs/

# Generate commit message based on changes
if git diff --cached --name-only | grep -q "docs/"; then
    # Get list of changed files in main directory
    CHANGED_FILES=$(git diff --name-only HEAD~1 2>/dev/null || echo "initial")
    
    # Generate meaningful message based on what changed
    if echo "$CHANGED_FILES" | grep -q "index.html"; then
        COMMIT_MSG="deploy: update main application UI"
    elif echo "$CHANGED_FILES" | grep -q "js/"; then
        COMMIT_MSG="deploy: update JavaScript functionality"
    elif echo "$CHANGED_FILES" | grep -q "css/"; then
        COMMIT_MSG="deploy: update styling and layout"
    else
        COMMIT_MSG="deploy: update SBOM Play production files"
    fi
    
    # Add timestamp
    COMMIT_MSG="$COMMIT_MSG - $(date +%Y-%m-%d)"
else
    COMMIT_MSG="deploy: update SBOM Play production files - $(date +%Y-%m-%d)"
fi

# Commit with signing
git commit -S -m "$COMMIT_MSG"

# Push to deploy
git push

echo "✅ Deployed successfully!"
echo "📝 Commit message: $COMMIT_MSG" 