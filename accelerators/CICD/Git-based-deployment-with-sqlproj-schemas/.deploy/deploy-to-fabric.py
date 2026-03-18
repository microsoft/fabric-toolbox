# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

"""
Example demonstrating:  
1. Access variable group values from Python. Note for sensitive variables ensure the variable group is linked to key vault. See https://learn.microsoft.com/en-us/azure/devops/pipelines/library/link-variable-groups-to-key-vaults?view=azure-devops
2. Use of Service Principal Name (SPN) with a Secret credential flow, leveraging the ClientSecretCredential class. 
3. Use the Fabric reset APIs to lookup the workspace ID based on workspace name
4. Using enable_shortcut_publish feature flag to deploy Lakehouse shortcuts
5. Using debug log level
"""
# START-EXAMPLE

# argparse is required to gracefully deal with the arguments
import os,argparse, requests, ast, json
from fabric_cicd import FabricWorkspace, publish_all_items, unpublish_all_orphan_items,change_log_level,append_feature_flag
from azure.identity import ClientSecretCredential

# function to return the workspace ID
def get_workspace_id(p_ws_name, p_token):
    url = "https://api.fabric.microsoft.com/v1/workspaces"
    headers = {
        "Authorization": f"Bearer {p_token.token}",
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

def find_warehouse_name(repo_root, repository_directory):
    env_name = os.environ.get("WAREHOUSE_NAME")
    if env_name:
        return env_name

    search_root = os.path.join(repo_root, repository_directory)
    for root, _, files in os.walk(search_root):
        if ".platform" not in files:
            continue
        platform_path = os.path.join(root, ".platform")
        try:
            with open(platform_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            metadata = payload.get("metadata", {})
            if metadata.get("type") == "Warehouse":
                display_name = metadata.get("displayName")
                if display_name:
                    return display_name
        except (OSError, ValueError, json.JSONDecodeError):
            continue

    return None

def list_warehouses(workspace_id, token):
    url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/warehouses"
    headers = {
        "Authorization": f"Bearer {token.token}",
        "Content-Type": "application/json"
    }

    warehouses = []
    continuation_token = None
    while True:
        params = {}
        if continuation_token:
            params["continuationToken"] = continuation_token
        response = requests.get(url, headers=headers, params=params)
        if response.status_code != 200:
            raise ValueError(f"Error: {response.status_code}, {response.text}")
        payload = response.json()
        warehouses.extend(payload.get("value", []))
        continuation_token = payload.get("continuationToken")
        if not continuation_token:
            break

    return warehouses

def get_warehouse_connection(workspace_id, token, warehouse_name):
    warehouses = list_warehouses(workspace_id, token)
    for warehouse in warehouses:
        if warehouse.get("displayName") == warehouse_name:
            properties = warehouse.get("properties", {})
            return properties.get("connectionString"), warehouse.get("id")
    return None, None

def list_sql_endpoints(workspace_id, token):
    url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/sqlEndpoints"
    headers = {
        "Authorization": f"Bearer {token.token}",
        "Content-Type": "application/json"
    }

    endpoints = []
    continuation_token = None
    while True:
        params = {}
        if continuation_token:
            params["continuationToken"] = continuation_token
        response = requests.get(url, headers=headers, params=params)
        if response.status_code != 200:
            raise ValueError(f"Error: {response.status_code}, {response.text}")
        payload = response.json()
        endpoints.extend(payload.get("value", []))
        continuation_token = payload.get("continuationToken")
        if not continuation_token:
            break

    return endpoints

def get_sql_endpoint_connection(workspace_id, token, sql_endpoint_id):
    url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/sqlEndpoints/{sql_endpoint_id}/connectionString"
    headers = {
        "Authorization": f"Bearer {token.token}",
        "Content-Type": "application/json"
    }

    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        raise ValueError(f"Error: {response.status_code}, {response.text}")
    payload = response.json()
    return payload.get("connectionString")

def get_branch_name(branch_ref):
    if not branch_ref:
        return None
    return branch_ref.replace("refs/heads/", "")


def find_lakehouse_items(repo_root, repository_directory):
    lakehouses = []
    search_root = os.path.join(repo_root, repository_directory)
    for root, _, files in os.walk(search_root):
        if ".platform" not in files:
            continue
        platform_path = os.path.join(root, ".platform")
        try:
            with open(platform_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            metadata = payload.get("metadata", {})
            if metadata.get("type") == "Lakehouse":
                display_name = metadata.get("displayName")
                if display_name:
                    lakehouses.append(display_name)
        except (OSError, ValueError, json.JSONDecodeError):
            continue
    
    return lakehouses

def build_sql_endpoints_payload(workspace_id, token, label):
    sql_endpoints = list_sql_endpoints(workspace_id, token)
    if not sql_endpoints:
        print(f"No SQL endpoints found for {label} workspace.")
        return []

    endpoints_with_conn = []
    for ep in sql_endpoints:
        ep_id = ep.get("id")
        ep_name = ep.get("displayName")
        try:
            conn_str = get_sql_endpoint_connection(workspace_id, token, ep_id)
            endpoints_with_conn.append({
                "displayName": ep_name,
                "id": ep_id,
                "connectionString": conn_str
            })
        except Exception as e:
            print(f"Warning: Could not get connection string for {ep_name} in {label} workspace: {str(e)}")

    if endpoints_with_conn:
        print(f"Found {len(endpoints_with_conn)} SQL endpoint(s) in {label} workspace: {', '.join([ep.get('displayName') for ep in endpoints_with_conn])}")
    else:
        print(f"No SQL endpoints with connection info found for {label} workspace.")

    return endpoints_with_conn

# --- Feature Flags and Logging ---
append_feature_flag("enable_shortcut_publish")
# set log level
change_log_level("DEBUG")

# parse arguments from yaml pipeline. These are typically secrets from a variable group linked to an Azure Key Vault
parser = argparse.ArgumentParser(description='Process Azure Pipeline arguments.')
parser.add_argument('--aztenantid',type=str, help= 'tenant ID')
parser.add_argument('--azclientid',type=str, help= 'SP client ID')
parser.add_argument('--azspsecret',type=str, help= 'SP secret')
parser.add_argument('--target_env',type=str, help= 'target environment')

parser.add_argument('--items_in_scope',type=str, help= 'Defines the item types to be deployed')
args = parser.parse_args()
item_types_in_scope = args.items_in_scope

#get the token#
print('Obtaining token...')
token_credential = ClientSecretCredential(client_id=args.azclientid, client_secret=args.azspsecret, tenant_id=args.aztenantid)

# get target environment name
tgtenv = args.target_env
print(f'Target environment set to {tgtenv}')

# determine the target workspace using the variable group which stores the target workspace name in a variable with the naming convention "[tgtenv]WorkspaceName"
ws_name = f'{tgtenv}WorkspaceName'
print(f'Variable group to determine workspace is set to {ws_name}')

# define workspace name to be deployed to based on value in variable group based on target environment name. This variable group is not linked to a Key Vault hence the values can be access through os.environ 
workspace_name = os.environ[ws_name.upper()]
print(f'Obtaining GUID for {workspace_name}')

# generating the token used to call the Fabric REST API
resource = 'https://api.fabric.microsoft.com/'
scope = f'{resource}.default'
print(f'scope set to {scope}')
token = token_credential.get_token(scope)

# call the workspace ID lookup function
lookup_response = get_workspace_id(workspace_name, token)
if lookup_response.startswith("Error"):
    errmsg=f"{lookup_response}. Perhaps workspace name is set incorrectly in the variable group of does not map to environment name + 'WorkspaceName'"
    raise ValueError(errmsg)
else:
    wks_id = lookup_response
    print(f"Workspace ID for {workspace_name} set to {wks_id}")

source_wks_id = None
feature_workspace_name = os.environ.get("FEATUREWORKSPACENAME")

print("Debug: Branch/workspace context")
print(f"- SYSTEM_PULLREQUEST_SOURCEBRANCH={os.environ.get('SYSTEM_PULLREQUEST_SOURCEBRANCH')}")
print(f"- BUILD_SOURCEBRANCH={os.environ.get('BUILD_SOURCEBRANCH')}")
print(f"- BUILD_SOURCEBRANCHNAME={os.environ.get('BUILD_SOURCEBRANCHNAME')}")
print(f"- BUILD_REASON={os.environ.get('BUILD_REASON')}")
print(f"- featureWorkspaceName={feature_workspace_name}")
print(f"- Target env (tgtenv)={tgtenv}")
print(f"- Target workspace name variable={ws_name.upper()}")
print(f"- Target workspace name value={workspace_name}")

# Determine source workspace based on target environment
# dev <- feature, test <- dev, prod <- test
source_env_map = {
    "dev": "feature",
    "test": "dev",
    "prod": "test"
}
source_env_for_target = source_env_map.get(tgtenv)

if source_env_for_target == "feature":
    source_workspace_name = feature_workspace_name
    if not source_workspace_name:
        print("Warning: Feature workspace name not provided. Skipping lakehouse schema extraction.")
else:
    # For test/prod, use the previous environment workspace
    source_ws_var = f"{source_env_for_target}WorkspaceName"
    source_workspace_name = os.environ.get(source_ws_var.upper())
    if not source_workspace_name:
        print(f"Warning: Source workspace name {source_ws_var} not found. Skipping lakehouse schema extraction.")

if source_workspace_name:
    print(f"Resolving source workspace ID for {source_workspace_name}...")
    source_lookup = get_workspace_id(source_workspace_name, token)
    if source_lookup.startswith("Error"):
        print(f"Warning: {source_lookup}. Skipping lakehouse schema extraction.")
    else:
        source_wks_id = source_lookup

# set repo folder based on the variable group value of gitDirectory
repository_directory = os.environ["GITDIRECTORY"]

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
warehouse_name = find_warehouse_name(repo_root, repository_directory)
if not warehouse_name:
    raise ValueError("Warehouse name could not be resolved from repository metadata.")

# convert the item types argument into a valid list
item_types = args.items_in_scope.strip("[]").split(",")

# Initialize the FabricWorkspace object with the required parameters
target_workspace = FabricWorkspace(
    workspace_id=wks_id,
    environment=tgtenv,
    repository_directory=repository_directory,
    item_type_in_scope=item_types,
    token_credential=token_credential,
)

# Publish items to the workspace
print(f'Publish branch to workspace...')
publish_all_items(target_workspace)

# Unpublish orphaned items from the workspace
unpublish_all_orphan_items(target_workspace)

print(f"Resolving connection string for warehouse {warehouse_name}...")
warehouse_conn, warehouse_id = get_warehouse_connection(wks_id, token, warehouse_name)
if not warehouse_conn:
    raise ValueError(f"Warehouse {warehouse_name} was not found in workspace {workspace_name}.")

print(f"##vso[task.setvariable variable=FABRIC_WAREHOUSE_SERVER]{warehouse_conn}")
print(f"##vso[task.setvariable variable=FABRIC_WAREHOUSE_NAME]{warehouse_name}")
if warehouse_id:
    print(f"##vso[task.setvariable variable=FABRIC_WAREHOUSE_ID]{warehouse_id}")

print(f"Discovering lakehouses in repository...")
lakehouses = find_lakehouse_items(repo_root, repository_directory)
if lakehouses:
    print(f"Found {len(lakehouses)} lakehouse(s): {', '.join(lakehouses)}")
else:
    print("No lakehouses found in repository.")

if source_wks_id:
    print("Discovering SQL endpoints for lakehouses in source workspace...")
    source_endpoints = build_sql_endpoints_payload(source_wks_id, token, "source")
    if source_endpoints:
        print(f"##vso[task.setvariable variable=FABRIC_SQL_ENDPOINTS_SOURCE]{json.dumps(source_endpoints)}")

print("Discovering SQL endpoints for lakehouses in target workspace...")
target_endpoints = build_sql_endpoints_payload(wks_id, token, "target")
if target_endpoints:
    print(f"##vso[task.setvariable variable=FABRIC_SQL_ENDPOINTS_TARGET]{json.dumps(target_endpoints)}")

