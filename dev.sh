#!/bin/bash

# SBOM Play - Development Startup Script
# Client-Side Application

echo "🚀 Starting SBOM Play Development Server"
echo "========================================"

# Check if Python is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python is not installed. Please install Python 3.7+ to run the development server."
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "❌ index.html not found. Please run this script from the project root directory."
    exit 1
fi

# Check if required files exist
if [ ! -f "js/app.js" ] || [ ! -f "css/style.css" ]; then
    echo "❌ Required client-side files not found. Please ensure all files are present."
    exit 1
fi

echo "✅ Client-side files found"
echo "✅ Starting HTTP server..."

# Get the current directory
CURRENT_DIR=$(pwd)

echo ""
echo "📁 Serving files from: $CURRENT_DIR"
echo "🌐 Server will be available at: http://localhost:8000"
echo ""
echo "💡 Tips:"
echo "   - Open http://localhost:8000 in your browser"
echo "   - All processing happens client-side"
echo "   - No backend server required"
echo "   - Press Ctrl+C to stop the server"
echo ""

# Start Python HTTP server
echo "🚀 Starting development server..."
$PYTHON_CMD -m http.server 8000

echo ""
echo "👋 Development server stopped." 