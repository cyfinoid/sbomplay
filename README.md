# SBOM Play

A client-side web application for analyzing Software Bill of Materials (SBOM) from GitHub organizations. All processing happens in your browser - no server required!

## Features

- **Privacy-First**: All processing happens locally in your browser
- **No Server Required**: Works entirely client-side
- **Persistent Storage**: Results saved in browser storage
- **Rate Limit Aware**: Handles GitHub API limits intelligently
- **Modern UI**: Clean, responsive interface with Bootstrap 5
- **Export Capabilities**: Download analysis results as JSON

## Quick Start

1. Open `index.html` in your web browser
2. Optionally add a GitHub token for higher rate limits
3. Enter a GitHub organization name
4. Click "Start Analysis" and wait for processing
5. View results and export data as needed

## Rate Limits

- **Without token**: 60 requests/hour
- **With token**: 5,000 requests/hour
- The tool automatically waits for rate limit resets

## Data Storage

All data is stored in your browser's local storage and persists between sessions. You can clear data using the "Clear Data" button or browser settings.

## Development

Run the development script to start a local server:

```bash
./dev.sh
```

## Project Structure

```
sbomplay/
├── index.html              # Main application
├── css/
│   └── style.css          # Application styles
├── js/
│   ├── app.js             # Main application logic
│   ├── github-client.js   # GitHub API client
│   ├── sbom-processor.js  # SBOM analysis logic
│   └── storage-manager.js # Local storage management
├── legacy/
│   └── scripts/           # Legacy Python scripts
│       ├── sbom-play.py
│       └── generate_top_dependency_report.py
├── dev.sh                 # Development startup script
└── README.md              # This file
```

## License

MIT License - see LICENSE file for details.
