from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
import json
import os
import time
from utils.github_client import GitHubClient
from utils.database import DatabaseManager
from utils.sbom_processor import SBOMProcessor
import threading

app = Flask(__name__)
app.secret_key = 'sbomplay-secret-key-2024'

# Initialize components
db_manager = DatabaseManager()
github_client = GitHubClient()
sbom_processor = SBOMProcessor(db_manager)

# Global variable to track analysis progress
analysis_progress = {}

@app.route('/')
def index():
    """Main dashboard page"""
    # Get database statistics
    sbom_count = db_manager.get_sbom_count()
    recent_sessions = db_manager.get_analysis_sessions(5)
    
    # Get dependency statistics if we have data
    dependency_stats = None
    if sbom_count > 0:
        dependency_stats = sbom_processor.get_dependency_stats()
    
    # Get GitHub API rate limit information
    try:
        rate_limit_info = github_client.get_rate_limit_info()
    except Exception as e:
        print(f"Warning: Could not fetch rate limit info: {e}")
        rate_limit_info = {
            'limit': 'Unknown',
            'remaining': 'Unknown',
            'reset': 'Unknown',
            'authenticated': 'No'
        }
    
    # Test GitHub API connectivity
    try:
        # Try to fetch a well-known public repository to test connectivity
        test_repos = github_client.get_repositories('microsoft')
        api_status = "Connected"
    except Exception as e:
        api_status = f"Error: {str(e)}"
        print(f"GitHub API connectivity test failed: {e}")
    
    return render_template('index.html', 
                         sbom_count=sbom_count,
                         recent_sessions=recent_sessions,
                         dependency_stats=dependency_stats,
                         rate_limit_info=rate_limit_info,
                         api_status=api_status)

@app.route('/health')
def health_check():
    """Health check endpoint for Railway"""
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'sbom_count': db_manager.get_sbom_count()
    })

@app.route('/analyze', methods=['GET', 'POST'])
def analyze():
    """Handle organization analysis"""
    if request.method == 'POST':
        org_name = request.form.get('org_name', '').strip()
        
        if not org_name:
            flash('Please enter a GitHub organization name', 'error')
            return redirect(url_for('index'))
        
        try:
            # Get repository count
            repos = github_client.get_public_repositories(org_name)
            repo_count = len(repos)
            
            if repo_count == 0:
                flash(f'No public repositories found for organization: {org_name}', 'error')
                return redirect(url_for('index'))
            
            # Create analysis session
            session_id = db_manager.create_analysis_session(org_name, repo_count)
            
            # Start background analysis
            thread = threading.Thread(target=analyze_organization, args=(org_name, repos, session_id))
            thread.daemon = True
            thread.start()
            
            flash(f'Analysis started for {org_name} with {repo_count} repositories', 'success')
            return redirect(url_for('show_analysis_progress', session_id=session_id))
            
        except Exception as e:
            flash(f'Error analyzing organization: {str(e)}', 'error')
            return redirect(url_for('index'))
    
    return redirect(url_for('index'))

def analyze_organization(org_name, repos, session_id):
    """Background function to analyze an organization"""
    global analysis_progress
    
    analysis_progress[session_id] = {
        'status': 'processing',
        'processed': 0,
        'total': len(repos),
        'current_repo': '',
        'errors': []
    }
    
    processed_count = 0
    
    for repo in repos:
        try:
            owner = repo['owner']['login']
            repo_name = repo['name']
            
            # Update progress - show current repository being processed
            analysis_progress[session_id]['current_repo'] = f"{owner}/{repo_name}"
            
            # Fetch SBOM
            sbom_file = github_client.fetch_sbom(owner, repo_name)
            
            if sbom_file:
                # Read and store SBOM data
                with open(sbom_file, 'r') as f:
                    sbom_content = json.load(f)
                    db_manager.store_sbom(f"{owner}/{repo_name}", sbom_content)
                
                processed_count += 1
                analysis_progress[session_id]['processed'] = processed_count
                
                # Update database session
                db_manager.update_analysis_session(session_id, processed_count)
            else:
                # Even if SBOM fetch failed, we still processed this repository
                processed_count += 1
                analysis_progress[session_id]['processed'] = processed_count
                
                # Update database session
                db_manager.update_analysis_session(session_id, processed_count)
            
            # Check rate limit status for monitoring (but don't stop)
            if processed_count % 20 == 0:  # Check every 20 repositories
                try:
                    rate_limit_info = github_client.get_rate_limit_info()
                    remaining = int(rate_limit_info.get('remaining', 0))
                    if remaining <= 10:
                        print(f"⚠️  Rate limit running low: {remaining} requests remaining. Will wait for reset if needed.")
                except Exception as e:
                    print(f"⚠️  Could not check rate limit: {e}")
            
            # Adaptive delay based on rate limit status
            if processed_count % 5 == 0:  # Every 5 repositories
                try:
                    rate_limit_info = github_client.get_rate_limit_info()
                    remaining = int(rate_limit_info.get('remaining', 0))
                    if remaining <= 20:
                        delay = 2.0  # Longer delay when rate limit is low
                        print(f"⏳ Rate limit low ({remaining} remaining). Adding {delay}s delay...")
                        time.sleep(delay)
                    else:
                        time.sleep(0.5)  # Normal delay
                except Exception as e:
                    time.sleep(0.5)  # Default delay if can't check rate limit
            else:
                time.sleep(0.1)  # Minimal delay between requests
            
        except Exception as e:
            error_msg = f"Error processing {owner}/{repo_name}: {str(e)}"
            analysis_progress[session_id]['errors'].append(error_msg)
            print(error_msg)
            
            # Even if there was an exception, we still processed this repository
            processed_count += 1
            analysis_progress[session_id]['processed'] = processed_count
            db_manager.update_analysis_session(session_id, processed_count)
    
    # Mark as completed
    analysis_progress[session_id]['status'] = 'completed'
    db_manager.update_analysis_session(session_id, processed_count, 'completed')

@app.route('/progress/<int:session_id>')
def show_analysis_progress(session_id):
    """Show analysis progress"""
    session = db_manager.execute_query(
        "SELECT org_name, total_repos, processed_repos, status FROM analysis_sessions WHERE id = ?",
        (session_id,)
    )
    
    if not session:
        flash('Analysis session not found', 'error')
        return redirect(url_for('index'))
    
    session_data = session[0]
    progress_data = analysis_progress.get(session_id, {})
    
    # Get rate limit info for display
    try:
        rate_limit_info = github_client.get_rate_limit_info()
    except Exception as e:
        rate_limit_info = {
            'limit': 'Unknown',
            'remaining': 'Unknown',
            'reset': 'Unknown',
            'authenticated': 'No'
        }
    
    return render_template('progress.html',
                         session_id=session_id,
                         org_name=session_data[0],
                         total_repos=session_data[1],
                         processed_repos=session_data[2],
                         status=session_data[3],
                         progress_data=progress_data,
                         rate_limit_info=rate_limit_info)

@app.route('/api/progress/<int:session_id>')
def api_progress(session_id):
    """API endpoint for progress updates"""
    session = db_manager.execute_query(
        "SELECT org_name, total_repos, processed_repos, status FROM analysis_sessions WHERE id = ?",
        (session_id,)
    )
    
    if not session:
        return jsonify({'error': 'Session not found'}), 404
    
    session_data = session[0]
    progress_data = analysis_progress.get(session_id, {})
    
    return jsonify({
        'org_name': session_data[0],
        'total_repos': session_data[1],
        'processed_repos': session_data[2],
        'status': session_data[3],
        'current_repo': progress_data.get('current_repo', ''),
        'errors': progress_data.get('errors', [])
    })

@app.route('/results')
def results():
    """Show dependency analysis results"""
    try:
        # Get top dependencies
        top_deps = sbom_processor.get_top_dependencies(100)
        
        # Get statistics
        stats = sbom_processor.get_dependency_stats()
        
        # Get repositories with SBOM data
        repositories = sbom_processor.get_repositories_with_sbom()
        
        return render_template('results.html',
                             dependencies=top_deps,
                             stats=stats,
                             repositories=repositories)
    except Exception as e:
        flash(f'Error loading results: {str(e)}', 'error')
        return redirect(url_for('index'))

@app.route('/repo/<path:repo_name>')
def repo_details(repo_name):
    """Show details for a specific repository"""
    try:
        dependencies = sbom_processor.get_dependencies_by_repo(repo_name)
        return render_template('repo_details.html',
                             repo_name=repo_name,
                             dependencies=dependencies)
    except Exception as e:
        flash(f'Error loading repository details: {str(e)}', 'error')
        return redirect(url_for('results'))

@app.route('/export/csv')
def export_csv():
    """Export dependency data as CSV"""
    try:
        top_deps = sbom_processor.get_top_dependencies(1000)
        
        csv_content = "Dependency Name,Occurrence Count\n"
        for dep_name, count in top_deps:
            csv_content += f'"{dep_name}",{count}\n'
        
        from flask import Response
        return Response(
            csv_content,
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=dependencies.csv'}
        )
    except Exception as e:
        flash(f'Error exporting data: {str(e)}', 'error')
        return redirect(url_for('results'))

@app.route('/export/html')
def export_html():
    """Export dependency data as HTML report"""
    try:
        top_deps = sbom_processor.get_top_dependencies(100)
        columns = ['Dependency Name', 'Occurrence Count']
        
        output_file = sbom_processor.generate_html_report(top_deps, columns)
        
        flash(f'HTML report generated: {output_file}', 'success')
        return redirect(url_for('results'))
    except Exception as e:
        flash(f'Error generating HTML report: {str(e)}', 'error')
        return redirect(url_for('results'))

if __name__ == '__main__':
    # Get port from environment variable (Railway sets PORT)
    port = int(os.environ.get('PORT', 5000))
    # Use 0.0.0.0 to bind to all available network interfaces
    app.run(debug=False, host='0.0.0.0', port=port) 