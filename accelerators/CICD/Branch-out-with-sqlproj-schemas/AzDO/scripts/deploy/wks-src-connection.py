#!/usr/bin/env python
"""
Simple script to get Lakehouse connection string from a Microsoft Fabric workspace
"""
import os
import sys
import argparse
import requests

def get_lakehouse_connection_string(workspace_name):
    """
    Get Lakehouse connection string from a Microsoft Fabric workspace
    """
    # Get token from environment variable
    token = os.environ.get('FABRIC_TOKEN')
    if not token:
        raise Exception('FABRIC_TOKEN environment variable not set.')
    
    # API headers
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # First get the workspace ID
    try:
        # Get list of workspaces
        ws_url = "https://api.fabric.microsoft.com/v1/workspaces"
        ws_response = requests.get(ws_url, headers=headers)
        ws_response.raise_for_status()
        
        # Find matching workspace
        workspaces = ws_response.json().get("value", [])
        workspace_id = None
        
        for workspace in workspaces:
            if workspace.get("displayName") == workspace_name:
                workspace_id = workspace.get("id")
                break
                
        if not workspace_id:
            print(f"Error: Workspace '{workspace_name}' not found", file=sys.stderr)
            return None
            
        print(f"Found workspace ID: {workspace_id}")
        
        # Get all items in the workspace
        items_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items"
        items_response = requests.get(items_url, headers=headers)
        items_response.raise_for_status()
        
        # Find lakehouses
        items = items_response.json().get("value", [])
        lakehouses = [item for item in items if str(item.get("type")).lower() == "lakehouse"]
        
        if not lakehouses:
            print("No lakehouses found in the workspace", file=sys.stderr)
            return None
            
        # Get the first lakehouse details
        lakehouse = lakehouses[0]
        lh_id = lakehouse.get("id")
        lh_name = lakehouse.get("displayName")
        print(f"Found lakehouse: {lh_name} (id: {lh_id})")
        
        # Get lakehouse details including connection string
        lakehouse_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/lakehouses/{lh_id}"
        lakehouse_response = requests.get(lakehouse_url, headers=headers)
        lakehouse_response.raise_for_status()
        
        # Extract connection string
        lakehouse_data = lakehouse_response.json()
        connection_string = lakehouse_data.get("properties", {}).get("sqlEndpointProperties", {}).get("connectionString")
        
        if not connection_string:
            print("Lakehouse SQL connection string not found", file=sys.stderr)
            return None
            
        return connection_string
        
    except requests.RequestException as e:
        print(f"API request error: {str(e)}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        return None

if __name__ == "__main__":
    # Parse arguments
    parser = argparse.ArgumentParser(description="Get Lakehouse connection string from Microsoft Fabric workspace")
    parser.add_argument("source_workspace_name", help="Name of the source Microsoft Fabric workspace")
    args = parser.parse_args()
    
    # Get the connection string
    conn_string = get_lakehouse_connection_string(args.source_workspace_name)
    
    if conn_string:
        print(f"SRC_LAKEHOUSE_CONNECTION={conn_string}")
        print(f"##vso[task.setvariable variable=SRC_LAKEHOUSE_CONNECTION;issecret=false]{conn_string}")
        sys.exit(0)
    else:
        sys.exit(1)