"""Dataset connection helpers for the XMLA-backed optimization workflow."""

import json
from typing import Dict, Any, Optional
from ..infrastructure.xmla import execute_dax_query_direct, determine_xmla_endpoint, is_desktop_connection
from ..infrastructure.auth import get_access_token


def _determine_location(
    location: Optional[str],
    desktop_port: Optional[int],
    workspace_name: Optional[str],
    xmla_endpoint: Optional[str],
    dataset_name: Optional[str]
) -> str:
    """Determine effective location: desktop or service."""
    if location:
        return location
    
    # Auto-detect based on parameters
    if desktop_port:
        return "desktop"
    
    if workspace_name:
        return "service"
    
    if xmla_endpoint and "powerbi://" in xmla_endpoint:
        return "service"
    
    # Default: desktop (includes dataset_name-only and no-params cases)
    return "desktop"


def _test_xmla_connection(xmla_endpoint: str, dataset_name: str) -> bool:
    """Test XMLA connection by executing a simple query."""
    try:
        test_result = execute_dax_query_direct(xmla_endpoint, dataset_name, "EVALUATE { 1 }")
        
        if test_result.startswith("Error:"):
            return False
        
        test_data = json.loads(test_result)
        return bool(test_data.get("rows"))
            
    except Exception:
        return False


def connect_to_dataset_core(
    dataset_name: Optional[str] = None,
    workspace_name: Optional[str] = None, 
    xmla_endpoint: Optional[str] = None,
    desktop_port: Optional[int] = None,
    location: Optional[str] = None
) -> Dict[str, Any]:
    """Smart connect - tries to connect if enough info, otherwise discovers and guides user.
    
    Args:
        dataset_name: Name or ID of the dataset to connect to
        workspace_name: Power BI Service workspace name (service only)
        xmla_endpoint: Direct XMLA endpoint URL (service only)
        desktop_port: Port number of desktop instance (desktop only)
        location: Explicit location hint - "desktop" or "service" (optional, auto-detects if not provided)
    
    Returns:
        Dictionary with connection status, discovered resources, or error details
    """
    try:
        if location and location not in ("desktop", "service"):
            return {"status": "error", "error": f"Invalid location '{location}'. Must be 'desktop' or 'service'."}
        
        effective_location = _determine_location(location, desktop_port, workspace_name, xmla_endpoint, dataset_name)
        
        # Route to appropriate handler
        if effective_location == "desktop":
            return _handle_desktop_connection(dataset_name, desktop_port)
        else:  # service
            return _handle_service_connection(dataset_name, workspace_name, xmla_endpoint)
        
    except Exception as e:
        return {"status": "error", "error": f"Unexpected error: {str(e)}"}


def _handle_desktop_connection(
    dataset_name: Optional[str],
    desktop_port: Optional[int]
) -> Dict[str, Any]:
    """Handle desktop connection: connect, discover datasets, or search instances."""
    from ..infrastructure.discovery import discover_datasets
    
    endpoint = f"localhost:{desktop_port}" if desktop_port else None
    
    if endpoint and dataset_name:
        return _attempt_connection(dataset_name, workspace_name=None, xmla_endpoint=endpoint)
    
    if endpoint:
        discovery = discover_datasets(xmla_endpoint=endpoint)
        
        if discovery.get("status") == "error":
            return discovery
        
        datasets = []
        instances = discovery.get("instances", [])
        if instances:
            datasets = instances[0].get("datasets", [])
        
        return {
            "status": "discovery",
            "action": "needs_dataset_name",
            "available_datasets": datasets,
            "location": endpoint,
            "message": f"Found {len(datasets)} dataset(s) on desktop instance (port {desktop_port}). Specify dataset_name to connect."
        }
    
    if dataset_name:
        return _search_and_connect_desktop(dataset_name)
    
    discovery = discover_datasets()
    
    if discovery.get("status") == "error":
        return discovery
    
    instances = discovery.get("instances", [])
    
    return {
        "status": "discovery",
        "action": "needs_connection_info",
        "desktop_instances": instances,
        "message": f"Found {len(instances)} desktop instance(s). Specify desktop_port + dataset_name, or just dataset_name to search."
    }


def _handle_service_connection(
    dataset_name: Optional[str],
    workspace_name: Optional[str],
    xmla_endpoint: Optional[str]
) -> Dict[str, Any]:
    """Handle Power BI Service connection: connect, discover datasets, or list workspaces."""
    from ..infrastructure.discovery import discover_datasets
    from ..infrastructure.powerbi_api import list_workspaces
    
    if (workspace_name or xmla_endpoint) and dataset_name:
        return _attempt_connection(dataset_name, workspace_name, xmla_endpoint)
    
    if workspace_name or xmla_endpoint:
        discovery = discover_datasets(workspace_name=workspace_name, xmla_endpoint=xmla_endpoint)
        
        if discovery.get("status") == "error":
            return discovery
        
        datasets = discovery.get("datasets", [])
        
        # If workspace was specified but no datasets found, check if workspace exists
        if workspace_name and len(datasets) == 0:
            workspace_result = list_workspaces()
            if workspace_result.get("status") == "error":
                return workspace_result
            
            workspaces = workspace_result.get("workspaces", [])
            return {
                "status": "discovery",
                "action": "workspace_not_found",
                "searched_for": workspace_name,
                "workspaces": workspaces,
                "message": f"Workspace '{workspace_name}' not found. Found {len(workspaces)} available workspace(s)."
            }
        
        return {
            "status": "discovery",
            "action": "needs_dataset_name",
            "available_datasets": datasets,
            "location": workspace_name or xmla_endpoint,
            "message": f"Found {len(datasets)} dataset(s) in workspace. Specify dataset_name to connect."
        }
    
    if dataset_name:
        return {
            "status": "error",
            "error": "Cannot search for datasets in Power BI Service without specifying workspace_name. "
                     "Either provide workspace_name, or use location='desktop' to search local instances."
        }
    
    workspace_result = list_workspaces()
    
    if workspace_result.get("status") == "error":
        return workspace_result
    
    workspaces = workspace_result.get("workspaces", [])
    
    return {
        "status": "discovery",
        "action": "needs_connection_info",
        "workspaces": workspaces,
        "message": f"Found {len(workspaces)} workspace(s). Specify workspace_name + dataset_name to connect."
    }


def _attempt_connection(
    dataset_name: str,
    workspace_name: Optional[str],
    xmla_endpoint: Optional[str]
) -> Dict[str, Any]:
    """Attempt to connect with provided credentials."""
    try:
        resolved_endpoint, resolved_workspace = determine_xmla_endpoint(workspace_name, xmla_endpoint)
        
        is_desktop = is_desktop_connection(resolved_endpoint)
        
        if not is_desktop:
            access_token = get_access_token()
            if not access_token:
                return {
                    "status": "error",
                    "error": "Authentication required - please sign in to Power BI"
                }
        
        if not _test_xmla_connection(resolved_endpoint, dataset_name):
            return {
                "status": "error",
                "error": f"Failed to connect to dataset '{dataset_name}' at {resolved_endpoint}"
            }
        
        try:
            from .session import session_manager
            session_manager.create_session(resolved_workspace, dataset_name, resolved_endpoint)
        except Exception as exc:
            return {
                "status": "error",
                "error": f"Session initialization failed: {exc}"
            }
        
        return {
            "status": "success",
            "action": "connected",
            "workspace_name": resolved_workspace,
            "dataset_name": dataset_name,
            "xmla_endpoint": resolved_endpoint,
            "is_desktop": is_desktop,
            "message": f"✅ Connected to '{dataset_name}' at {resolved_workspace}"
        }
        
    except Exception as e:
        return {"status": "error", "error": f"Connection failed: {str(e)}"}


def _search_and_connect_desktop(dataset_name: str) -> Dict[str, Any]:
    """Search desktop instances for dataset and auto-connect if single match."""
    try:
        from ..infrastructure.discovery import discover_datasets
        
        discovery = discover_datasets()
        
        if discovery.get("status") == "error":
            return discovery
        
        instances = discovery.get("instances", [])
        
        if not instances:
            return {
                "status": "error",
                "error": "No desktop instances found. Please open Power BI Desktop with a model loaded."
            }
        
        # Search for dataset matches across all instances
        matches = []
        for instance in instances:
            for dataset in instance.get("datasets", []):
                # Case-insensitive partial match on name or id
                if (dataset_name.lower() in dataset.get("name", "").lower() or
                    dataset_name.lower() in dataset.get("id", "").lower()):
                    matches.append({
                        "port": instance["port"],
                        "window_title": instance.get("window_title"),
                        "dataset": dataset
                    })
        
        # No matches
        if not matches:
            return {
                "status": "discovery",
                "action": "no_matches",
                "desktop_instances": instances,
                "searched_for": dataset_name,
                "message": f"No datasets matching '{dataset_name}' found on desktop instances."
            }
        
        # Single match → AUTO-CONNECT
        if len(matches) == 1:
            match = matches[0]
            return _attempt_connection(
                dataset_name=match["dataset"]["name"],
                workspace_name=None,
                xmla_endpoint=f"localhost:{match['port']}"
            )
        
        # Multiple matches → SHOW OPTIONS
        return {
            "status": "discovery",
            "action": "multiple_matches",
            "matches": matches,
            "searched_for": dataset_name,
            "message": f"Found {len(matches)} datasets matching '{dataset_name}'. Specify desktop_port or exact dataset_name."
        }
        
    except Exception as e:
        return {"status": "error", "error": f"Desktop search failed: {str(e)}"}

