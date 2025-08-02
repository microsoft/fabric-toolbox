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
