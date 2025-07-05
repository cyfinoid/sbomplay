#!/bin/bash

# SBOM Play Development Startup Script
# This script activates the virtual environment and starts the Flask application

set -e  # Exit on any error

echo "🚀 Starting SBOM Play Development Server..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Please run 'python -m venv venv' first."
    exit 1
fi

# Check if requirements are installed
if [ ! -f "venv/bin/pip" ]; then
    echo "❌ Virtual environment appears to be corrupted. Please recreate it."
    exit 1
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source venv/bin/activate

# Check if required packages are installed
echo "🔍 Checking dependencies..."
if ! python -c "import flask" 2>/dev/null; then
    echo "⚠️  Flask not found. Installing dependencies..."
    pip install -r requirements.txt
fi

# Set development environment variables
export FLASK_ENV=development
export FLASK_DEBUG=1

# Check if database exists, if not create it
if [ ! -f "sbomplay.db" ]; then
    echo "🗄️  Initializing database..."
    python -c "
from utils.database import DatabaseManager
db = DatabaseManager()
print('✅ Database initialized')
"
fi

# Start the Flask application
echo "🌐 Starting Flask development server..."
echo "📍 Server will be available at: http://localhost:5000"
echo "🛑 Press Ctrl+C to stop the server"
echo ""

# Run the application
python app.py 