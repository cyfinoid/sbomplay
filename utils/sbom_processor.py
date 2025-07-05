import json
from typing import List, Dict, Tuple, Any
from utils.database import DatabaseManager

class SBOMProcessor:
    """Process and analyze SBOM data"""
    
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager
    
    def get_top_dependencies(self, limit: int = 50) -> List[Tuple[str, int]]:
        """Get the most common dependencies across all SBOMs"""
        query = """
        SELECT 
            json_extract(json_each.value, '$.SPDXID') AS package_name,
            COUNT(*) AS occurrence_count
        FROM 
            sbom,
            json_each(json(sbom.json_content), '$.sbom.packages')
        WHERE 
            package_name IS NOT NULL
            AND package_name NOT LIKE '%githubaction%'
        GROUP BY 
            package_name
        ORDER BY 
            occurrence_count DESC
        LIMIT ?;
        """
        
        results = self.db_manager.execute_query(query, (limit,))
        return results
    
    def get_dependency_stats(self) -> Dict[str, Any]:
        """Get comprehensive dependency statistics"""
        # Total unique dependencies
        unique_deps_query = """
        SELECT COUNT(DISTINCT json_extract(json_each.value, '$.SPDXID')) as unique_deps
        FROM sbom, json_each(json(sbom.json_content), '$.sbom.packages')
        WHERE json_extract(json_each.value, '$.SPDXID') IS NOT NULL
        """
        
        # Total dependency occurrences
        total_occurrences_query = """
        SELECT COUNT(*) as total_occurrences
        FROM sbom, json_each(json(sbom.json_content), '$.sbom.packages')
        WHERE json_extract(json_each.value, '$.SPDXID') IS NOT NULL
        """
        
        unique_deps = self.db_manager.execute_query(unique_deps_query)[0][0]
        total_occurrences = self.db_manager.execute_query(total_occurrences_query)[0][0]
        
        return {
            'unique_dependencies': unique_deps,
            'total_occurrences': total_occurrences,
            'sbom_count': self.db_manager.get_sbom_count()
        }
    
    def get_dependencies_by_repo(self, repo_name: str) -> List[Dict[str, Any]]:
        """Get all dependencies for a specific repository"""
        query = """
        SELECT 
            json_extract(json_each.value, '$.SPDXID') AS package_name,
            json_extract(json_each.value, '$.name') AS name,
            json_extract(json_each.value, '$.versionInfo') AS version,
            json_extract(json_each.value, '$.licenseConcluded') AS license
        FROM 
            sbom,
            json_each(json(sbom.json_content), '$.sbom.packages')
        WHERE 
            sbom.source_repo = ?
            AND json_extract(json_each.value, '$.SPDXID') IS NOT NULL
        """
        
        results = self.db_manager.execute_query(query, (repo_name,))
        
        dependencies = []
        for row in results:
            dependencies.append({
                'package_name': row[0],
                'name': row[1],
                'version': row[2],
                'license': row[3]
            })
        
        return dependencies
    
    def get_repositories_with_sbom(self) -> List[str]:
        """Get list of all repositories that have SBOM data"""
        query = "SELECT source_repo FROM sbom ORDER BY source_repo"
        results = self.db_manager.execute_query(query)
        return [row[0] for row in results]
    
    def generate_html_report(self, results: List[Tuple], columns: List[str], output_file: str = 'common_dependencies.html') -> str:
        """Generate HTML report from dependency analysis results"""
        html_content = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Common Dependencies Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                th { background-color: #f2f2f2; font-weight: bold; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                h2 { color: #333; }
                .stats { background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h2>Most Common Dependencies Across Projects</h2>
            <div class="stats">
                <strong>Analysis Summary:</strong><br>
                • Total SBOMs analyzed: {sbom_count}<br>
                • Unique dependencies found: {unique_deps}<br>
                • Total dependency occurrences: {total_occurrences}
            </div>
            <table>
                <tr>
        """
        
        # Add table headers
        for column in columns:
            html_content += f"<th>{column}</th>"
        html_content += "</tr>"

        # Add table rows
        for row in results:
            html_content += "<tr>"
            for cell in row:
                html_content += f"<td>{cell}</td>"
            html_content += "</tr>"

        html_content += """
                </table>
            </body>
        </html>
        """
        
        # Get stats for the report
        stats = self.get_dependency_stats()
        html_content = html_content.format(
            sbom_count=stats['sbom_count'],
            unique_deps=stats['unique_dependencies'],
            total_occurrences=stats['total_occurrences']
        )
        
        # Write to the output HTML file
        with open(output_file, 'w') as file:
            file.write(html_content)
        
        return output_file 