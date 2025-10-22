#!/bin/bash
#
# Script to update cache busting version for all JavaScript files
# Usage: ./UPDATE_VERSION.sh <new_version>
# Example: ./UPDATE_VERSION.sh 3
#

if [ -z "$1" ]; then
    echo "Usage: $0 <new_version>"
    echo "Example: $0 3"
    exit 1
fi

NEW_VERSION=$1
CURRENT_VERSION=$(grep -o 'js?v=[0-9]*' index.html | head -1 | cut -d= -f2)

echo "Updating cache busting version for JavaScript and CSS files..."
echo "Current version: v=$CURRENT_VERSION"
echo "New version: v=$NEW_VERSION"
echo ""

# Update all main HTML files
for file in index.html stats.html settings.html license-compliance.html vuln.html deps.html authors.html; do
    if [ -f "$file" ]; then
        echo "Updating $file..."
        # Update JavaScript files
        sed -i.bak "s|\.js?v=[0-9]*|.js?v=$NEW_VERSION|g" "$file"
        # Update CSS files
        sed -i.bak "s|\.css?v=[0-9]*|.css?v=$NEW_VERSION|g" "$file"
        rm -f "${file}.bak"
    fi
done

echo ""
echo "✅ Cache busting version updated to v=$NEW_VERSION"
echo ""
echo "Updated files:"
echo "  - index.html (JS + CSS)"
echo "  - stats.html (JS + CSS)"
echo "  - settings.html (JS + CSS)"
echo "  - license-compliance.html (JS + CSS)"
echo "  - vuln.html (JS + CSS)"
echo "  - deps.html (JS + CSS)"
echo "  - authors.html (JS + CSS)"
echo ""
echo "Assets with cache busting:"
echo "  - All JavaScript files: ?v=$NEW_VERSION"
echo "  - All CSS files: ?v=$NEW_VERSION"
echo ""
echo "Remember to:"
echo "  1. Test the changes locally"
echo "  2. Commit the changes"
echo "  3. Deploy to production (./deploy.sh or ./update-prod.sh)"

