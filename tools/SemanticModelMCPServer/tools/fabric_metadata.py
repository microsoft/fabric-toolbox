# Tool to list Power BI workspaces
import json
from core.auth import get_access_token

def list_workspaces() -> str:
    """Lists available Power BI workspaces for the current user. This tool retrieves the workspaces using the Power BI REST API.
    It returns a dictionary array of workspace names and IDs.
    It is useful for identifying which workspaces you can access and work with.
    It gets an access token using the Power BI REST API.
    """
    import requests
    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    url = "https://api.powerbi.com/v1.0/myorg/groups"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        return f"Error: {response.status_code} - {response.text}"
    groups = response.json().get("value", [])
    if not groups:
        return "No workspaces found."
    
    # Extract only name and id from each workspace
    filtered_workspaces = [{"name": group.get("name"), "id": group.get("id")} for group in groups]
    return json.dumps(filtered_workspaces, indent=2)

# Tool to list datasets in a Power BI workspace

def list_datasets(workspace_id: str) -> str:
    """Lists all datasets in a specified Power BI workspace using REST API."""
    import requests
    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    
    url = f"https://api.powerbi.com/v1.0/myorg/groups/{workspace_id}/datasets"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        return f"Error: {response.status_code} - {response.text}"
    
    datasets = response.json().get("value", [])
    if not datasets:
        return "No datasets found in this workspace."
    
    return json.dumps(datasets, indent=2)

# Tool to get workspace ID by name
def get_workspace_id(workspace_name: str) -> str:
    """Gets the workspace ID for a given workspace name.  This is useful for retrieving datasets."""
    import requests

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    
    url = "https://api.powerbi.com/v1.0/myorg/groups"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        return f"Error: {response.status_code} - {response.text}"
    
    groups = response.json().get("value", [])
    for group in groups:
        if group.get("name") == workspace_name:
            return group.get("id")
    
    return f"Workspace '{workspace_name}' not found"

# Tool to list notebooks in a Power BI workspace

def list_notebooks(workspace_id: str) -> str:
    """Lists all notebooks in a specified Power BI workspace using REST API.
    
    Args:
        workspace_id (str): The unique identifier of the Power BI workspace
        
    Returns:
        str: JSON string containing notebook information or error message
    """
    import requests
    
    # Input validation - ensure workspace_id is provided and not empty
    if not workspace_id or not workspace_id.strip():
        return "Error: Workspace ID is required and cannot be empty"
    
    try:
        # Get authentication token for Power BI API access
        access_token = get_access_token()
        if not access_token:
            return "Error: No valid access token available"
        
        # Construct API endpoint URL for listing notebooks
        # Strip whitespace from workspace_id to handle user input errors
        url = f"https://api.powerbi.com/v1.0/myorg/groups/{workspace_id.strip()}/notebooks"
        
        # Set up authorization header with Bearer token
        headers = {"Authorization": f"Bearer {access_token}"}
        
        # Make the API request with 30-second timeout to prevent hanging
        response = requests.get(url, headers=headers, timeout=30)
        
        # Handle different HTTP status codes with specific error messages
        if response.status_code == 200:
            # Success - parse the JSON response
            notebooks = response.json().get("value", [])
            if not notebooks:
                return "No notebooks found in this workspace."
            # Return formatted JSON with proper indentation
            return json.dumps(notebooks, indent=2)
        elif response.status_code == 401:
            # Authentication failed - token is invalid or expired
            return "Error: Unauthorized - Invalid or expired access token"
        elif response.status_code == 403:
            # Authorization failed - user doesn't have permission
            return "Error: Forbidden - You don't have permission to access this workspace"
        elif response.status_code == 404:
            # Workspace not found
            return f"Error: Workspace with ID '{workspace_id}' not found"
        elif response.status_code == 429:
            # Rate limiting - too many requests
            return "Error: Too many requests - Please try again later"
        else:
            # Other HTTP errors - return status code and response text
            return f"Error: HTTP {response.status_code} - {response.text}"
            
    # Handle specific request exceptions with informative error messages
    except requests.exceptions.Timeout:
        # Request took longer than 30 seconds
        return "Error: Request timed out - Please try again"
    except requests.exceptions.ConnectionError:
        # Network connectivity issues
        return "Error: Connection failed - Check your internet connection"
    except requests.exceptions.RequestException as e:
        # Other request-related errors
        return f"Error: Request failed - {str(e)}"
    except json.JSONDecodeError:
        # Invalid JSON response from API
        return "Error: Invalid JSON response from Power BI API"
    except Exception as e:
        # Catch-all for any unexpected errors
        return f"Error: Unexpected error occurred - {str(e)}"
