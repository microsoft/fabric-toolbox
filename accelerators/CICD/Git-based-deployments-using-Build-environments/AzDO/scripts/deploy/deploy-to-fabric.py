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
import os,argparse, requests, ast
from fabric_cicd import FabricWorkspace, publish_all_items, unpublish_all_orphan_items,change_log_level
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

# set log level
change_log_level("DEBUG")

# parse arguments from yaml pipeline. These are typically secrets from a variable group linked to an Azure Key Vault
parser = argparse.ArgumentParser(description='Process Azure Pipeline arguments.')
parser.add_argument('--aztenantid',type=str, help= 'tenant ID')
parser.add_argument('--azclientid',type=str, help= 'SP client ID')
parser.add_argument('--azspsecret',type=str, help= 'SP secret')
parser.add_argument('--workspacename',type=str, help= 'workspace name')
parser.add_argument('--items_in_scope',type=str, help= 'Defines the item types to be deployed')
args = parser.parse_args()
item_types_in_scope = args.items_in_scope

#get the token#
print('Obtaining token...')
token_credential = ClientSecretCredential(client_id=args.azclientid, client_secret=args.azspsecret, tenant_id=args.aztenantid)

# get branch name from build
branch = os.getenv("BUILD_SOURCEBRANCH").replace("refs/heads/","")
print(f'Branch set to {branch}')

# determine the variable group which stores the workspace name with the naming convention "[branch]WorkspaceName"
ws_name = f'{branch}WorkspaceName'
print(f'Variable group to determine workspace is set to {ws_name}')

# define workspace name to be deployed to based on value in variable group based on branch name. This variable group is not linked to a Key Vault hence the values can be access through os.environ 
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
    errmsg=f"{lookup_response}. Perhaps workspace name is set incorrectly in the variable group of does not map to branch name + 'WorkspaceName'"
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
    environment=branch,
    repository_directory=repository_directory,
    item_type_in_scope=item_types,
    token_credential=token_credential,
)

# Publish items to the workspace
print(f'Publish branch to workspace...')
publish_all_items(target_workspace)

# Unpublish orphaned items from the workspace
unpublish_all_orphan_items(target_workspace)
