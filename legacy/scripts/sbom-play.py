import os
import requests
import json
import sqlite3

# GitHub API base URL for fetching SBOMs
SBOM_API_URL = 'https://api.github.com/repos/{owner}/{repo}/dependency-graph/sbom'

# Function to get public repositories of an organization
def get_repositories(org_name,):
    url = f'https://api.github.com/orgs/{org_name}/repos'
    response = requests.get(url)
    
    if response.status_code != 200:
        raise Exception(f"Failed to fetch repositories: {response.status_code} {response.text}")
    
    return response.json()

# Function to download SBOM using GitHub's dependency graph API
def fetch_sbom(owner, repo, output_dir):
    url = SBOM_API_URL.format(owner=owner, repo=repo)
    response = requests.get(url)

    if response.status_code == 200:
        sbom_data = response.json()
        sbom_filename = os.path.join(output_dir, f"{owner}_{repo}_sbom.json")
        with open(sbom_filename, 'w') as f:
            json.dump(sbom_data, f, indent=2)
        print(f"Downloaded SBOM for {owner}/{repo}")
        return sbom_filename
    else:
        print(f"SBOM not available for {owner}/{repo}: {response.status_code} {response.text}")
        return None

# Function to create tables for storing SBOM data
def create_tables(cursor):
    cursor.execute('''CREATE TABLE IF NOT EXISTS sbom (
                        source_repo TEXT,
                        json_content TEXT
                    )''')

# Function to store JSON content in the database
def store_json_in_db(cursor, source_repo, json_content):
    cursor.execute('''INSERT INTO sbom (source_repo, json_content)
                      VALUES (?, ?)''', (source_repo, json.dumps(json_content)))

# Main function to fetch repositories, download SBOMs, and store them in the database
def main(org_name, output_dir='sboms'):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Create SQLite database
    conn = sqlite3.connect('sbom_data.db')
    cursor = conn.cursor()
    create_tables(cursor)
    
    # Fetch repositories
    repos = get_repositories(org_name)
    
    for repo in repos:
        if repo['visibility'] == 'public':
            owner = repo['owner']['login']
            repo_name = repo['name']
            sbom_file = fetch_sbom(owner, repo_name, output_dir)
            
            if sbom_file:
                with open(sbom_file, 'r') as f:
                    sbom_content = json.load(f)
                    store_json_in_db(cursor, f"{owner}/{repo_name}", sbom_content)
    
    # Commit and close connection
    conn.commit()
    conn.close()
    print("SBOMs have been stored in the database.")

if __name__ == "__main__":
    org_name = input("Enter the GitHub organization name: ")
    main(org_name)
