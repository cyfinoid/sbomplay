import requests
import json
import os
from typing import List, Dict, Optional
import time

class GitHubClient:
    """GitHub API client for fetching repositories and SBOMs"""
    
    def __init__(self):
        self.base_url = "https://api.github.com"
        self.sbom_api_url = f"{self.base_url}/repos/{{owner}}/{{repo}}/dependency-graph/sbom"
        self.github_token = os.environ.get('GITHUB_TOKEN')
        self.headers = {}
        
        # Set up headers with authentication if token is available
        if self.github_token:
            self.headers = {
                'Authorization': f'token {self.github_token}',
                'Accept': 'application/vnd.github.v3+json'
            }
        else:
            self.headers = {
                'Accept': 'application/vnd.github.v3+json'
            }
            print("⚠️  No GitHub token provided. Using unauthenticated requests (rate limited to 60 requests/hour)")
    
    def _handle_rate_limit(self, response):
        """Handle GitHub API rate limiting with persistent retry"""
        if response.status_code == 403:
            # Check if it's a rate limit error
            rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
            rate_limit_reset = response.headers.get('X-RateLimit-Reset')
            
            if rate_limit_remaining == '0':
                if rate_limit_reset:
                    reset_time = int(rate_limit_reset)
                    wait_time = reset_time - int(time.time())
                    if wait_time > 0:
                        print(f"⏳ Rate limit exceeded. Waiting {wait_time} seconds for reset...")
                        time.sleep(wait_time + 2)  # Add 2 second buffer
                        print("✅ Rate limit reset. Continuing...")
                        return True  # Retry the request
                    else:
                        print("⚠️  Rate limit exceeded. Please wait before trying again.")
                        return False
                else:
                    print("⚠️  Rate limit exceeded. Please wait before trying again.")
                    return False
            else:
                if self.github_token:
                    print("⚠️  API access denied. Your token may not have sufficient permissions.")
                else:
                    print("⚠️  API access denied. This organization may require authentication.")
                return False
        
        return False
    
    def _check_rate_limit_remaining(self, response):
        """Check if we're running low on rate limit"""
        rate_limit_remaining = response.headers.get('X-RateLimit-Remaining')
        if rate_limit_remaining and int(rate_limit_remaining) <= 5:
            print(f"⚠️  Rate limit running low: {rate_limit_remaining} requests remaining")
            return True
        return False
    
    def _make_request(self, url: str, retry_count: int = 0) -> Optional[requests.Response]:
        """Make a request with rate limit handling"""
        if retry_count > 3:
            print("❌ Too many retries. Stopping request.")
            return None
            
        try:
            response = requests.get(url, headers=self.headers)
            
            # Handle rate limiting
            if self._handle_rate_limit(response):
                if retry_count < 3:
                    return self._make_request(url, retry_count + 1)
                else:
                    return None
            
            return response
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {e}")
            return None
    
    def get_repositories(self, org_name: str) -> List[Dict]:
        """Fetch all public repositories for a GitHub organization"""
        url = f"{self.base_url}/orgs/{org_name}/repos"
        response = self._make_request(url)
        
        if not response:
            if self.github_token:
                raise Exception("Failed to fetch repositories. Please check your GitHub token and try again.")
            else:
                raise Exception("Failed to fetch repositories. Consider setting a GitHub token for higher rate limits.")
        
        if response.status_code != 200:
            if response.status_code == 404:
                raise Exception(f"Organization '{org_name}' not found. Please check the organization name.")
            elif response.status_code == 403:
                if self.github_token:
                    raise Exception("Access denied. The organization might be private or your token may not have sufficient permissions.")
                else:
                    raise Exception("Access denied. This organization may require authentication. Please set a GitHub token.")
            else:
                raise Exception(f"Failed to fetch repositories: {response.status_code} {response.text}")
        
        return response.json()
    
    def fetch_sbom(self, owner: str, repo: str, output_dir: str = "sboms") -> Optional[str]:
        """Download SBOM for a specific repository"""
        url = self.sbom_api_url.format(owner=owner, repo=repo)
        response = self._make_request(url)

        if not response:
            print(f"⚠️  Could not fetch SBOM for {owner}/{repo} due to rate limiting or network issues")
            return None

        # Check if we're running low on rate limit
        if response.status_code == 200:
            self._check_rate_limit_remaining(response)
            sbom_data = response.json()
            
            # Ensure output directory exists
            if not os.path.exists(output_dir):
                os.makedirs(output_dir)
            
            # Save SBOM to file
            sbom_filename = os.path.join(output_dir, f"{owner}_{repo}_sbom.json")
            with open(sbom_filename, 'w') as f:
                json.dump(sbom_data, f, indent=2)
            
            return sbom_filename
        elif response.status_code == 404:
            print(f"ℹ️  SBOM not available for {owner}/{repo} (dependency graph not enabled)")
            return None
        elif response.status_code == 403:
            print(f"⚠️  Access denied for {owner}/{repo} (private repository or insufficient permissions)")
            return None
        elif response.status_code == 401:
            print(f"⚠️  Authentication required for {owner}/{repo} (private repository)")
            return None
        elif response.status_code == 422:
            print(f"ℹ️  SBOM not available for {owner}/{repo} (dependency graph not enabled)")
            return None
        else:
            print(f"⚠️  SBOM not available for {owner}/{repo}: {response.status_code} {response.text}")
            return None
    
    def get_public_repositories(self, org_name: str) -> List[Dict]:
        """Get only public repositories for an organization"""
        repos = self.get_repositories(org_name)
        return [repo for repo in repos if repo['visibility'] == 'public']
    
    def get_repository_count(self, org_name: str) -> int:
        """Get the count of public repositories for an organization"""
        return len(self.get_public_repositories(org_name))
    
    def get_rate_limit_info(self) -> Dict[str, str]:
        """Get current rate limit information"""
        url = f"{self.base_url}/rate_limit"
        response = self._make_request(url)
        
        if response and response.status_code == 200:
            data = response.json()
            core = data.get('resources', {}).get('core', {})
            return {
                'limit': str(core.get('limit', 'Unknown')),
                'remaining': str(core.get('remaining', 'Unknown')),
                'reset': str(core.get('reset', 'Unknown')),
                'authenticated': 'Yes' if self.github_token else 'No'
            }
        else:
            return {
                'limit': 'Unknown',
                'remaining': 'Unknown',
                'reset': 'Unknown',
                'authenticated': 'No'
            } 