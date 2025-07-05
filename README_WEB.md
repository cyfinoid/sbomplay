# SBOM Play Web GUI

A modern web-based interface for analyzing Software Bill of Materials (SBOM) across GitHub organizations.

## Features

### 🎯 Core Functionality
- **GitHub Organization Analysis**: Input any GitHub organization name to analyze all public repositories
- **SBOM Extraction**: Automatically fetches SPDX-compliant SBOMs from GitHub's dependency graph API
- **Dependency Analysis**: Identifies and ranks the most common dependencies across repositories
- **Real-time Progress**: Live progress tracking during analysis with detailed status updates
- **Interactive Results**: Beautiful charts and tables showing dependency statistics

### 📊 Analytics & Reporting
- **Top Dependencies**: View the most commonly used dependencies across all repositories
- **Repository Details**: Drill down into individual repository dependencies
- **Statistics Dashboard**: Comprehensive overview of analysis results
- **Export Options**: Download results as CSV or generate HTML reports

### 🎨 User Experience
- **Modern UI**: Clean, responsive design built with Bootstrap 5
- **Real-time Updates**: Auto-refreshing progress indicators
- **Interactive Charts**: Visual dependency analysis using Chart.js
- **Mobile Friendly**: Responsive design that works on all devices

## Installation

### Prerequisites
- Python 3.7 or higher
- pip (Python package manager)
- GitHub Personal Access Token (optional, but recommended for large organizations)

### Setup
1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd sbomplay
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**:
   ```bash
   python app.py
   ```

4. **Access the web interface**:
   Open your browser and navigate to `http://localhost:5000`

### Optional: GitHub Token Setup
For better performance with large organizations, add a GitHub token:
1. Create a GitHub Personal Access Token with `public_repo` scope
2. Set environment variable: `export GITHUB_TOKEN=your_token`
3. Restart the application
4. Check the GitHub API Status on the dashboard

## Usage

### Getting Started
1. **Open the Dashboard**: Navigate to the main page
2. **Enter Organization**: Type a GitHub organization name (e.g., "microsoft", "google")
3. **Start Analysis**: Click "Start Analysis" to begin processing
4. **Monitor Progress**: Watch real-time progress updates
5. **View Results**: Explore dependency analysis results and charts

### Analysis Process
1. **Repository Discovery**: The system finds all public repositories in the organization
2. **SBOM Fetching**: Downloads SPDX-compliant SBOMs from GitHub's API
3. **Data Storage**: Stores all SBOM data in a local SQLite database
4. **Dependency Analysis**: Extracts and analyzes common dependencies
5. **Results Generation**: Creates interactive charts and reports

### Export Options
- **CSV Export**: Download dependency data as a CSV file
- **HTML Report**: Generate a standalone HTML report
- **Repository Details**: View detailed dependency information for each repository

## Architecture

### Project Structure
```
sbomplay/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── templates/            # HTML templates
│   ├── base.html        # Base template with navigation
│   ├── index.html       # Main dashboard
│   ├── progress.html    # Analysis progress page
│   ├── results.html     # Results and charts
│   └── repo_details.html # Repository details
├── static/              # Static assets
│   ├── css/
│   │   └── style.css   # Custom styles
│   └── js/
│       └── app.js      # Application JavaScript
├── utils/               # Utility modules
│   ├── github_client.py # GitHub API wrapper
│   ├── database.py      # Database operations
│   └── sbom_processor.py # SBOM analysis
└── existing files...    # Original command-line tools
```

### Key Components

#### Flask Application (`app.py`)
- Main web server and routing
- Background task processing
- API endpoints for progress updates
- Export functionality

#### GitHub Client (`utils/github_client.py`)
- GitHub API integration
- Repository discovery
- SBOM fetching
- Error handling and rate limiting

#### Database Manager (`utils/database.py`)
- SQLite database operations
- Session tracking
- Data storage and retrieval
- Analysis session management

#### SBOM Processor (`utils/sbom_processor.py`)
- SBOM data analysis
- Dependency extraction
- Statistics generation
- Report generation

## API Endpoints

### Web Routes
- `GET /` - Main dashboard
- `POST /analyze` - Start organization analysis
- `GET /progress/<session_id>` - View analysis progress
- `GET /results` - View analysis results
- `GET /repo/<repo_name>` - Repository details
- `GET /export/csv` - Export CSV data
- `GET /export/html` - Generate HTML report

### API Endpoints
- `GET /api/progress/<session_id>` - Progress updates (JSON)

## Configuration

### Environment Variables
- `FLASK_ENV`: Set to `development` for debug mode
- `FLASK_DEBUG`: Enable/disable debug mode

### Database
- Default database: `sbom_data.db` (SQLite)
- Automatically created on first run
- Stores SBOM data and analysis sessions

## Development

### Running in Development Mode
```bash
export FLASK_ENV=development
export FLASK_DEBUG=1
python app.py
```

### Adding New Features
1. **Backend**: Add routes to `app.py` and utility functions
2. **Frontend**: Create templates in `templates/` directory
3. **Styling**: Add CSS to `static/css/style.css`
4. **JavaScript**: Add functionality to `static/js/app.js`

### Testing
- Test with small organizations first
- Monitor API rate limits
- Check database integrity
- Verify export functionality

## Troubleshooting

### Common Issues

#### "No public repositories found"
- Verify the organization name is correct
- Check if the organization has public repositories
- Ensure the organization is accessible

#### "SBOM not available"
- Not all repositories have SBOM data
- Some repositories may be private or restricted
- GitHub API rate limits may apply

#### Database Errors
- Check file permissions for `sbom_data.db`
- Ensure SQLite is properly installed
- Verify database schema integrity

#### Performance Issues
- Large organizations may take time to process
- Consider processing in smaller batches
- Monitor memory usage during analysis

## Contributing

### Code Style
- Follow PEP 8 for Python code
- Use meaningful variable and function names
- Add comments for complex logic
- Include docstrings for functions

### Testing
- Test with various organization sizes
- Verify error handling
- Check responsive design
- Test export functionality

## License

This project is part of the SBOM Play toolset. See the main LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the existing command-line tools
3. Examine the database schema
4. Test with known working organizations

---

**SBOM Play Web GUI** - Making Software Bill of Materials analysis accessible and beautiful. 