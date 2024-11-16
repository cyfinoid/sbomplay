import sqlite3

# Function to execute a query and get results
def execute_query(db_path, query):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(query)
    results = cursor.fetchall()
    conn.close()
    return results

# Function to generate an HTML page from query results
def generate_html(results, columns, output_file='common_dependencies.html'):
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Common Dependencies Report</title>
        <style>
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                border: 1px solid black;
                padding: 8px;
                text-align: left;
            }
            th {
                background-color: #f2f2f2;
            }
        </style>
    </head>
    <body>
        <h2>Most Common Dependencies Across Projects</h2>
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

    # Write to the output HTML file
    with open(output_file, 'w') as file:
        file.write(html_content)

    print(f"HTML report generated: {output_file}")

# Main function
if __name__ == "__main__":
    db_path = 'sbom_data.db'  # Path to your SQLite database
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
        occurrence_count DESC;
    """
    columns = ['Dependency Name', 'Occurrence Count']
    
    results = execute_query(db_path, query)
    generate_html(results, columns)
