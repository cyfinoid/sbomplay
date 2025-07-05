# Development Setup

## Quick Start

### 1. Create Virtual Environment
```bash
python -m venv venv
```

### 2. Run Development Server
```bash
./dev.sh
```

That's it! The application will be available at http://localhost:5000

## What the dev.sh script does

The `dev.sh` script automatically:

1. ✅ **Checks virtual environment** - Ensures venv exists
2. ✅ **Activates venv** - Sources the virtual environment
3. ✅ **Checks dependencies** - Verifies Flask is installed
4. ✅ **Installs missing packages** - Runs `pip install -r requirements.txt` if needed
5. ✅ **Sets development environment** - Configures Flask for development
6. ✅ **Initializes database** - Creates SQLite database if it doesn't exist
7. ✅ **Starts the server** - Runs the Flask application

## Manual Setup (Alternative)

If you prefer to run commands manually:

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the application
python app.py
```

## Development Features

- **Auto-reload**: Flask will reload when you change code
- **Debug mode**: Detailed error messages
- **Database auto-init**: SQLite database created automatically
- **Dependency checking**: Missing packages installed automatically

## Stopping the Server

Press `Ctrl+C` in the terminal to stop the development server.

## Troubleshooting

### Virtual Environment Issues
```bash
# If venv is corrupted, recreate it
rm -rf venv
python -m venv venv
./dev.sh
```

### Permission Issues
```bash
# Make script executable
chmod +x dev.sh
```

### Port Already in Use
The application runs on port 5000 by default. If it's already in use:
```bash
# Kill existing process
pkill -f "python app.py"
# Then run
./dev.sh
```

## Environment Variables

The script sets these development variables:
- `FLASK_ENV=development`
- `FLASK_DEBUG=1`

You can override these by setting them before running the script:
```bash
export FLASK_DEBUG=0
./dev.sh
``` 