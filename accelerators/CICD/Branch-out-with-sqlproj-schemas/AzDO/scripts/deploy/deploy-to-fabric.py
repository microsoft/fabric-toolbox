# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

"""
Example demonstrating:  
1. Access variable group values from Python. Note for sensitive variables ensure the variable group is linked to key vault. See https://learn.microsoft.com/en-us/azure/devops/pipelines/library/link-variable-groups-to-key-vaults?view=azure-devops
2. Use of Service Principal Name (SPN) with a Secret credential flow, leveraging the ClientSecretCredential class. 
3. Use the Fabric reset APIs to lookup the workspace ID based on workspace name
4. Using debug log level
"""
# START-EXAMPLE

# argparse is required to gracefully deal with the arguments
import os, sys, argparse, requests, ast, gc
from fabric_cicd import FabricWorkspace, publish_all_items, unpublish_all_orphan_items, change_log_level, append_feature_flag
from azure.identity import ClientSecretCredential

# function to return the workspace ID
def get_workspace_id(p_ws_name, p_token):
    url = "https://api.fabric.microsoft.com/v1/workspaces"
    headers = {
        "Authorization": f"Bearer {p_token}",
        "Content-Type": "application/json"
    }

    response = requests.get(url, headers=headers)
    ws_id =''
    if response.status_code == 200:
        workspaces = response.json()["value"]
        for workspace in workspaces:
            if workspace["displayName"] == p_ws_name:
                ws_id = workspace["id"] 
                return workspace["id"]
        if ws_id == '':
            return f"Error: Workspace {p_ws_name} could not found."
    else:
        return f"Error: {response.status_code}, {response.text}"

# set log level
append_feature_flag("enable_shortcut_publish")
append_feature_flag("enable_environment_variable_replacement")
change_log_level("DEBUG")

# parse arguments from yaml pipeline. These are typically secrets from a variable group linked to an Azure Key Vault
parser = argparse.ArgumentParser(description='Process Azure Pipeline arguments.')
parser.add_argument('--target_env',type=str, help= 'target environment')
parser.add_argument('--items_in_scope',type=str, help= 'Defines the item types to be deployed')
args = parser.parse_args()
item_types_in_scope = args.items_in_scope

#get the token from environment variable#
print('Obtaining token from environment variable...')
token = os.environ.get('FABRIC_TOKEN')
if not token:
    raise Exception('FABRIC_TOKEN environment variable not set.')

# Secure TokenCredential wrapper for the raw token
class SimpleTokenCredential:
    def __init__(self, token):
        self._token = token
    def get_token(self, *scopes, **kwargs):
        class Token:
            def __init__(self, token):
                self.token = token
            def __str__(self):
                return self.token
        return Token(self._token)

# get target environment name
tgtenv = args.target_env
print(f'Target environment set to {tgtenv}')

# determine the target workspace using the variable group which stores the target workspace name in a variable with the naming convention "[tgtenv]WorkspaceName"
ws_name = f'{tgtenv}WorkspaceName'
print(f'Variable group to determine workspace is set to {ws_name}')

# define workspace name to be deployed to based on value in variable group based on target environment name. This variable group is not linked to a Key Vault hence the values can be access through os.environ 
workspace_name = os.environ[ws_name.upper()]
print(f'Obtaining GUID for {workspace_name}')

# call the workspace ID lookup function
lookup_response = get_workspace_id(workspace_name, token)
if lookup_response.startswith("Error"):
    errmsg=f"{lookup_response}. Perhaps workspace name is set incorrectly in the variable group of does not map to environment name + 'WorkspaceName'"
    raise ValueError(errmsg)
else:
    wks_id = lookup_response
    print(f"Workspace ID for {workspace_name} set to {wks_id}")

# set repo folder based on the variable group value of gitDirectory
repository_directory = os.environ["GITDIRECTORY"]

# convert the item types argument into a valid list
item_types = args.items_in_scope.strip("[]").split(",")

# Initialize the FabricWorkspace object with the required parameters
target_workspace = FabricWorkspace(
    workspace_id=wks_id,
    environment=tgtenv,
    repository_directory=repository_directory,
    item_type_in_scope=item_types,
    token_credential=SimpleTokenCredential(token),
)

# Publish items to the workspace
print(f'Publish branch to workspace...')
publish_all_items(target_workspace)

# Unpublish orphaned items from the workspace
unpublish_all_orphan_items(target_workspace)

# --- Get Warehouse and Lakehouse Info with Connection String ---
def get_all_warehouse_connection_strings(workspace_id, token):
    url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    response = requests.get(url, headers=headers)
    items_info = []
    connection_string = None
    
    if response.status_code == 200:
        items = response.json().get("value", [])
        warehouses = [item for item in items if str(item.get("type")).lower() == "warehouse"]
        lakehouses = [item for item in items if str(item.get("type")).lower() == "lakehouse"]
        
        if not warehouses and not lakehouses:
            print("No warehouses or lakehouses found in workspace.", file=sys.stderr)
            return []
        
        # Get connection string once from the first warehouse (if available)
        if warehouses:
            print("Warehouses found in workspace:")
            wh = warehouses[0]  # Use first warehouse to get connection string
            wh_name = wh.get("displayName")
            wh_id = wh.get("id")
            print(f"  {wh_name} (id: {wh_id})")
            warehouse_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/warehouses/{wh_id}"
            warehouse_resp = requests.get(warehouse_url, headers=headers)
            
            if warehouse_resp.status_code == 200:
                warehouse_json = warehouse_resp.json()
                connection_string = warehouse_json.get("properties", {}).get("connectionString")
                if not connection_string:
                    print(f"Connection string not found for warehouse '{wh_name}'.", file=sys.stderr)
            else:
                print(f"Error getting details for warehouse '{wh_name}': {warehouse_resp.text}", file=sys.stderr)
            
            # Add all warehouses to the info list
            for wh in warehouses:
                wh_name = wh.get("displayName")
                items_info.append({"type": "warehouse", "name": wh_name, "connection_string": connection_string})
        
        # Add all lakehouses to the info list
        if lakehouses:
            print("Lakehouses found in workspace:")
            for lh in lakehouses:
                lh_name = lh.get("displayName")
                lh_id = lh.get("id")
                print(f"  {lh_name} (id: {lh_id})")
                items_info.append({"type": "lakehouse", "name": lh_name, "connection_string": connection_string})
    else:
        print(f"Error listing items: {response.text}", file=sys.stderr)
        return []
    
    return items_info

# Call the function to get all warehouse and lakehouse info as an array
items_array = get_all_warehouse_connection_strings(wks_id, token)

# Filter warehouses and lakehouses
warehouse_items = [item for item in items_array if item['type'] == 'warehouse']
lakehouse_items = [item for item in items_array if item['type'] == 'lakehouse']

# Export the arrays as pipeline variables (semicolon-separated for YAML compatibility)
warehouse_names = ';'.join([item['name'] for item in warehouse_items if item['name']])
lakehouse_names = ';'.join([item['name'] for item in lakehouse_items if item['name']])
# We only need one connection string since it's the same for the workspace
connection_string = items_array[0]['connection_string'] if items_array and items_array[0]['connection_string'] else ''

print(f"##vso[task.setvariable variable=FABRIC_DWH_NAMES;issecret=false]{warehouse_names}")
print(f"##vso[task.setvariable variable=FABRIC_LAKEHOUSE_NAMES;issecret=false]{lakehouse_names}")
print(f"##vso[task.setvariable variable=WORKSPACE_SQL_ENDPOINT;issecret=false]{connection_string}")

# Optionally print the arrays for debug
print("ITEMS_ARRAY_START")
print("Warehouses:")
for item in warehouse_items:
    print(f"Name: {item['name']}")
print("Lakehouses:")
for item in lakehouse_items:
    print(f"Name: {item['name']}")
print(f"Connection String available: {'Yes' if connection_string else 'No'}")
print("ITEMS_ARRAY_END")

# Function to get all warehouse and lakehouse names and connection string
def get_workspace_items_and_connection_string(workspace_id, token):
    url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    response = requests.get(url, headers=headers)
    items_info = []
    connection_string = None
    lakehouse_conn_string = None
    warehouse_conn_string = None
    sqldb_conn_string = None
    sqldbname_conn_string = None
    sqldbs = []
    
    if response.status_code == 200:
        items = response.json().get("value", [])
        
        # Debug: Print raw items from API
        print("DEBUG: Raw items from API:", [{"id": item.get("id"), "name": item.get("displayName"), "type": item.get("type")} for item in items])
        
        warehouses = [item for item in items if str(item.get("type")).lower() == "warehouse"]
        lakehouses = [item for item in items if str(item.get("type")).lower() == "lakehouse"]
        sqldbs = [item for item in items if str(item.get("type")).lower() == "sqldatabase"]
        # Get Lakehouse connection string if available
        if lakehouses:
            lh = lakehouses[0]
            lh_id = lh.get("id")
            lakehouse_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/lakehouses/{lh_id}"
            lakehouse_resp = requests.get(lakehouse_url, headers=headers)
            if lakehouse_resp.status_code == 200:
                lakehouse_json = lakehouse_resp.json()
                lakehouse_conn_string = lakehouse_json.get("properties", {}).get("sqlEndpointProperties", {}).get("connectionString")
            else:
                print(f"Error getting lakehouse details: {lakehouse_resp.text}", file=sys.stderr)
        # Get Warehouse connection string if no Lakehouse
        if not lakehouse_conn_string and warehouses:
            wh = warehouses[0]
            wh_id = wh.get("id")
            warehouse_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/warehouses/{wh_id}"
            warehouse_resp = requests.get(warehouse_url, headers=headers)
            if warehouse_resp.status_code == 200:
                warehouse_json = warehouse_resp.json()
                warehouse_conn_string = warehouse_json.get("properties", {}).get("connectionString")
            else:
                print(f"Error getting warehouse details: {warehouse_resp.text}", file=sys.stderr)
        # Get SQLDatabase serverFqdn if no Lakehouse or Warehouse
        if sqldbs:
            sqldb = sqldbs[0]
            sqldb_id = sqldb.get("id")
            sqldb_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/sqldatabases/{sqldb_id}"
            sqldb_resp = requests.get(sqldb_url, headers=headers)
            if sqldb_resp.status_code == 200:
                sqldb_json = sqldb_resp.json()
                sqldb_conn_string = sqldb_json.get("properties", {}).get("serverFqdn")
                sqldbname_conn_string = sqldb_json.get("properties", {}).get("databaseName")
            else:
                print(f"Error getting SQLDatabase details: {sqldb_resp.text}", file=sys.stderr)
        # Add all warehouses, lakehouses, and sqldatabases to the info list
        for wh in warehouses:
            wh_name = wh.get("displayName")
            items_info.append({"type": "warehouse", "name": wh_name})
        for lh in lakehouses:
            lh_name = lh.get("displayName")
            items_info.append({"type": "lakehouse", "name": lh_name})
        for sqldb in sqldbs:
            sqldb_name = sqldb.get("displayName")
            items_info.append({"type": "sqldatabase", "name": sqldb_name})
    else:
        print(f"Error listing items: {response.text}", file=sys.stderr)
        return [], None
    # Prefer Lakehouse > Warehouse > SQLDatabase
    dwae_connection_string = lakehouse_conn_string or warehouse_conn_string or ''
    sql_connection_string = sqldb_conn_string or ''
    return items_info, dwae_connection_string, sql_connection_string, sqldbname_conn_string

# Get all warehouse and lakehouse names and the connection string
items_array, dwae_connection_string, sql_connection_string, sqldbname_conn_string = get_workspace_items_and_connection_string(wks_id, token)

# Debug: Print all the items returned from the API
print("DEBUG: All items from API:", items_array)

warehouse_items = [item for item in items_array if item['type'] == 'warehouse']
lakehouse_items = [item for item in items_array if item['type'] == 'lakehouse']
sqldb_items = [item for item in items_array if item['type'] == 'sqldatabase']
warehouse_names = ';'.join([item['name'] for item in warehouse_items if item['name']])
lakehouse_names = ';'.join([item['name'] for item in lakehouse_items if item['name']])
sqldb_names = ';'.join([item['name'] for item in sqldb_items if item['name']])
print(f"##vso[task.setvariable variable=FABRIC_DWH_NAMES;issecret=false]{warehouse_names}")
print(f"##vso[task.setvariable variable=FABRIC_LAKEHOUSE_NAMES;issecret=false]{lakehouse_names}")
print(f"##vso[task.setvariable variable=FABRIC_SQLDB_NAMES;issecret=false]{sqldb_names}")
print(f"##vso[task.setvariable variable=WORKSPACE_SQL_ENDPOINT;issecret=false]{dwae_connection_string}")
print(f"##vso[task.setvariable variable=SQLDB_ENDPOINT;issecret=false]{sql_connection_string}")
print(f"##vso[task.setvariable variable=SQLDB_NAME;issecret=false]{sqldbname_conn_string}")

# Clear sensitive variables from memory after use
try:
    del token
    del SimpleTokenCredential
    gc.collect()
except Exception:
    pass