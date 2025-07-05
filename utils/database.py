import sqlite3
import json
from typing import List, Tuple, Dict, Any
import os

class DatabaseManager:
    """Database manager for SBOM data storage and retrieval"""
    
    def __init__(self, db_path: str = 'sbom_data.db'):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize database tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create SBOM table
        cursor.execute('''CREATE TABLE IF NOT EXISTS sbom (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            source_repo TEXT UNIQUE,
                            json_content TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )''')
        
        # Create analysis sessions table
        cursor.execute('''CREATE TABLE IF NOT EXISTS analysis_sessions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            org_name TEXT,
                            total_repos INTEGER,
                            processed_repos INTEGER,
                            status TEXT DEFAULT 'pending',
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            completed_at TIMESTAMP
                        )''')
        
        conn.commit()
        conn.close()
    
    def store_sbom(self, source_repo: str, json_content: Dict[str, Any]) -> bool:
        """Store SBOM data in the database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''INSERT OR REPLACE INTO sbom (source_repo, json_content)
                              VALUES (?, ?)''', (source_repo, json.dumps(json_content)))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error storing SBOM for {source_repo}: {e}")
            return False
    
    def get_all_sboms(self) -> List[Tuple]:
        """Get all SBOM records from database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT source_repo, json_content FROM sbom')
        results = cursor.fetchall()
        conn.close()
        return results
    
    def get_sbom_count(self) -> int:
        """Get total number of SBOMs in database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM sbom')
        count = cursor.fetchone()[0]
        conn.close()
        return count
    
    def create_analysis_session(self, org_name: str, total_repos: int) -> int:
        """Create a new analysis session"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''INSERT INTO analysis_sessions (org_name, total_repos, processed_repos)
                          VALUES (?, ?, 0)''', (org_name, total_repos))
        
        session_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return session_id
    
    def update_analysis_session(self, session_id: int, processed_repos: int, status: str = 'processing'):
        """Update analysis session progress"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if status == 'completed':
            cursor.execute('''UPDATE analysis_sessions 
                              SET processed_repos = ?, status = ?, completed_at = CURRENT_TIMESTAMP
                              WHERE id = ?''', (processed_repos, status, session_id))
        else:
            cursor.execute('''UPDATE analysis_sessions 
                              SET processed_repos = ?, status = ?
                              WHERE id = ?''', (processed_repos, status, session_id))
        
        conn.commit()
        conn.close()
    
    def get_analysis_sessions(self, limit: int = 10) -> List[Dict]:
        """Get recent analysis sessions"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''SELECT id, org_name, total_repos, processed_repos, status, created_at, completed_at
                          FROM analysis_sessions 
                          ORDER BY created_at DESC 
                          LIMIT ?''', (limit,))
        
        sessions = []
        for row in cursor.fetchall():
            sessions.append({
                'id': row[0],
                'org_name': row[1],
                'total_repos': row[2],
                'processed_repos': row[3],
                'status': row[4],
                'created_at': row[5],
                'completed_at': row[6]
            })
        
        conn.close()
        return sessions
    
    def execute_query(self, query: str, params: tuple = None) -> List[Tuple]:
        """Execute a custom SQL query"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
        results = cursor.fetchall()
        conn.close()
        return results 