"""Power BI REST API helpers for workspace discovery and management."""

import requests
from typing import Dict, Any
from .auth import get_access_token


POWERBI_API_BASE = "https://api.powerbi.com/v1.0/myorg"


def list_workspaces() -> Dict[str, Any]:
    """List all Power BI workspaces (groups) the user has access to.
    
    Uses the Power BI REST API to enumerate workspaces since this information
    is not available through XMLA/TOM endpoints.
    
    Returns:
        Dictionary with status and workspace list, or error details
    """
    try:
        # Get access token
        token = get_access_token()
        if not token:
            return {
                "status": "error",
                "error": "Authentication required - please sign in to Power BI"
            }
        
        # Call Power BI REST API
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(f"{POWERBI_API_BASE}/groups", headers=headers)
        
        if not response.ok:
            return {
                "status": "error",
                "error": f"Failed to list workspaces: HTTP {response.status_code}",
                "details": response.text[:200] if response.text else None
            }
        
        data = response.json()
        workspaces = data.get("value", [])
        
        if not workspaces:
            return {
                "status": "success",
                "workspaces": [],
                "message": "No workspaces found. You may need to create or get access to a Power BI workspace."
            }
        
        workspace_list = []
        for ws in workspaces:
            workspace_list.append({
                "name": ws.get("name"),
                "id": ws.get("id")
            })
        
        return {
            "status": "success",
            "workspaces": workspace_list,
            "message": f"Found {len(workspace_list)} workspace(s)"
        }
        
    except requests.exceptions.RequestException as e:
        return {
            "status": "error",
            "error": f"Network error while listing workspaces: {str(e)}"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": f"Unexpected error listing workspaces: {str(e)}"
        }
