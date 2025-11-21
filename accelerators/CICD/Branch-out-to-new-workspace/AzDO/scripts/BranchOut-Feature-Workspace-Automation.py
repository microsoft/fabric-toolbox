import requests
import json
import msal
import argparse
import logging
import base64
import time

# Constants
# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logging.info('starting...')

FABRIC_API_URL = "https://api.fabric.microsoft.com/v1"
ADO_API_URL = ""
CAPACITY_ID = ""
WORKSPACE_NAME = ""
DEVELOPER = ""
ADO_MAIN_BRANCH = ""
ADO_NEW_BRANCH = ""
ADO_GIT_FOLDER = ""
ADO_PROJECT_NAME = ""
ADO_REPO_NAME = ""
ADO_ORG_NAME = ""
CLIENT_ID = ""
CLIENT_SECRET = ""
TENANT_ID = ""
USERNAME = ""
PASSWORD = ""
FABRIC_TOKEN = ""
ADO_PAT_TOKEN= ""

logging.info('Starting branch out script....')

# Define a function to acquire token for ADO using using AAD username password
def acquire_ado_token_user_id_password(tenant_id, client_id,user_name,password,kvtoken):
    def encode_pat(pat):
        # Encode the PAT in base64
        encoded_pat = base64.b64encode(pat.encode('utf-8')).decode('utf-8')
        return encoded_pat
    
    if kvtoken != "":
           logging.info("Using PAT token for ADO authentication as token value has been set in Azure Key Vault")
           access_token =  encode_pat(':'+kvtoken)
 
    else:
        logging.info("No PAT token was set therefore generating ADO token using user account...")
        # Initialize the MSAL public client
        authority = f'https://login.microsoftonline.com/{tenant_id}'
        app = msal.PublicClientApplication(client_id, authority=authority)
        scopes = ['499b84ac-1321-427f-aa17-267ca6975798/.default']
        result = app.acquire_token_by_username_password(user_name, password, scopes)
        if 'access_token' in result:
            access_token = result['access_token']
            logging.info(" ADO token Generated")
        else:
            access_token = None

    return access_token


# Define a function to acquire token using AAD username password
def acquire_token_user_id_password(tenant_id, client_id,user_name,password):
   
   # Initialize the MSAL public client
   authority = f'https://login.microsoftonline.com/{tenant_id}'
   app = msal.PublicClientApplication(client_id, authority=authority)
   scopes = ['https://api.fabric.microsoft.com/.default']   
   result = app.acquire_token_by_username_password(user_name, password, scopes)  
   #logging.info('Token result: '+str(result)) 
   if 'access_token' in result:
       access_token = result['access_token']
   else:
       access_token = None
       logging.error('Error: Token could not be obtained: '+str(result))
   return access_token

# For Future Use: Define a function to acquire token using SPN
def acquire_token_spn(tenant_id,client_id,client_secret):
    app = msal.ConfidentialClientApplication(
        client_id,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
        client_credential=client_secret
    )
    result = app.acquire_token_for_client(scopes=SCOPES)
    if "access_token" in result:
        return result["access_token"]
    else:
        logging.info(f"Error acquiring token: {result.get('error_description')}")
        return None


# Function to create a Fabric workspace
def create_fabric_workspace(workspace_name,cpty_id, token):
    try:
        logging.info(f"Creating Fabric Workspace {WORKSPACE_NAME}...  ")
        headers = {"Authorization": f"Bearer {token}"}
        data = {
             "displayName": workspace_name,
            "capacityId": cpty_id
        }
        response = requests.post(f"{FABRIC_API_URL}/workspaces", headers=headers, json=data)
        # uncomment the line below if you need more debug information from the http request
        logging.info(str(response.status_code) + ' - ' + response.text)
        #response.raise_for_status()
        if response.status_code == 409:
            logging.error(f"Workspace '{workspace_name}' already exists.")
            raise ValueError("Fabric workspace already exists. Please specify a new workspace as target.")
        elif response.status_code == 201:
            logging.info(f"Fabric Workspace {WORKSPACE_NAME} created with ID: {response.json()['id']} successfully... ")
            return response.json()["id"]
        elif response.status_code != 201:
            logging.error(f"Could not create workspace. Error: {response.text}")
            return None
        else:
            logging.error("Unknown error occurred. Please review the logs.")
            return None
    except requests.exceptions.RequestException as e:
        logging.error(f"Error creating workspace: {e}")
        return None

# Function to add developers as workspace admins
def add_workspace_admins(workspace_id, developer, token):
    try:
        logging.info(f"Adding developer {developer} to workspace {WORKSPACE_NAME} in progress")
        headers = {"Authorization": f"Bearer {token}"}
        data = {
        "emailAddress": developer,
        "groupUserAccessRight": "Admin"
        }

        response = requests.post(f"https://api.powerbi.com/v1.0/myorg/admin/groups/{workspace_id}/users", headers=headers, json=data)

        response.raise_for_status()
        logging.info(f"Done")

    except requests.exceptions.RequestException as e:
        logging.info(f"Error adding workspace admin: {e}")
        #os._exit(1)        


# Function to create a new branch in Azure DevOps
def create_azure_devops_branch(project_name, repo_name, main_branch, new_branch):
    # aquiring azdo token
    token = acquire_ado_token_user_id_password(TENANT_ID, CLIENT_ID,USERNAME,PASSWORD, ADO_PAT_TOKEN)

    if token:

        try:
            if ADO_PAT_TOKEN != "":
                token_type = 'Basic'
            else:
                token_type = 'Bearer'

            logging.info(f"Using token type {token_type} in request header. This is determined whether the token value for AZDO PAT has been set.")
            headers = {"Authorization": f"{token_type} {token}", "Content-Type": "application/json"}
            data =  [
                    {
                    "name":f"refs/heads/{new_branch}",
                    "oldObjectId": "0000000000000000000000000000000000000000",
                    "newObjectId": get_branch_object_id(project_name, repo_name, main_branch, token, token_type)
                    }
                ]
            logging.info(f"Creating feature branch {new_branch} based on {main_branch}...")
            response = requests.post(f"{ADO_API_URL}/{ADO_ORG_NAME}/{project_name}/_apis/git/repositories/{repo_name}/refs?api-version=7.1", headers=headers, json=data)
            response.raise_for_status()
            logging.info(f"Feature branch {new_branch} created")
        except requests.exceptions.RequestException as e:
            logging.info(f"Error creating Azure DevOps branch: {e}")
            #os._exit(1)

    else:
        logging.error("Terminating branch out process as token could not be generated. Please either set an AZDO PAT token or specify a valid user account with sufficient permissions. ")
        raise ValueError("Could not generate AZDO token.")


# Helper function to get the object ID of a branch
def get_branch_object_id(project_name, repo_name, branch_name, token, token_type):
    try:
        logging.info(f"Retriving ID of main branch {branch_name} to be cloned ")
        headers = {"Authorization": f"{token_type} {token}"}
        response = requests.get(f"{ADO_API_URL}/{ADO_ORG_NAME}/{project_name}/_apis/git/repositories/{repo_name}/refs/heads/{branch_name}?api-version=7.1", headers=headers)
        response.raise_for_status()
        logging.info(f"BranchID: {response.text}")        
        return response.json()["value"][0]["objectId"]
    except requests.exceptions.RequestException as e:
        logging.info(f"Error getting branch object ID: {e}")
        return None

# Function to connect Azure DevOps branch to Fabric workspace
def connect_branch_to_workspace(workspace_id, project_name, org_name, repo_name, branch_name, git_folder, token):
    try:
        logging.info(f"Conecting workspace {workspace_id} to feature branch {branch_name} at folder {git_folder}..")
        headers = {"Authorization": f"Bearer {token}"}
        data = {
        "gitProviderDetails": {
                "organizationName": org_name,
                "projectName": project_name,
                "gitProviderType": "AzureDevOps",
                "repositoryName": repo_name,
                "branchName": branch_name,
                "directoryName": git_folder.rstrip("/")
         }
        } 
        response = requests.post(f"{FABRIC_API_URL}/workspaces/{workspace_id}/git/connect", headers=headers, json=data)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        logging.info(f"Error connecting branch to workspace: {e}")


def long_running_operation_polling(uri,retry_after,headers):
    keep_polling = True
    try:
        logging.info(f"Polling long running operation ID {uri} has been started with a retry-after time of {retry_after} seconds.")
        while keep_polling:
            response = requests.get(uri,headers=headers)
            operation_state = response.json()
            logging.info('operation state = '+str(operation_state))
            logging.info(f"Long running operation status: {operation_state['status']}")
            if operation_state['status'] in ["NotStarted", "Running"]:
                time.sleep(retry_after)
                keep_polling = True
            else:
                keep_polling = False
        if operation_state['status'] == "Failed":
            logging.info(f"The long running operation has been completed with failure. Error response: {json.dumps(operation_state['Error'])}")
        else:
            logging.info("The long running operation has been successfully completed.")
            #response = client.get(uri+'/result')
            return operation_state['status']
    except Exception as e:
        logging.error(f"The long running operation has been completed with failure. Error response: {e}")

def initialize_workspace_from_git(workspace_id,token):

    try:
        logging.info(f"Initializing {WORKSPACE_NAME} to feature branch {ADO_NEW_BRANCH} is in propress... ")
        headers = {"Authorization": f"Bearer {token}"}
        # Initialize the connection to the GIT repository
        gitinitializeurl = f"{FABRIC_API_URL}/workspaces/{workspace_id}/git/initializeConnection"
        response = requests.post(gitinitializeurl, headers=headers)
        
        #print(response.json())
        
        if response.status_code == 200:
            git_status = response.json()
            remote_commit_hash = git_status['remoteCommitHash']
            workspace_head = git_status['workspaceHead']
            
            # Define the update parameters with conflict resolution policy
            update_params = {
                'workspaceHead': workspace_head,
                'remoteCommitHash': remote_commit_hash,
                'options': {
                    'allowOverrideItems': True,
                    'conflictResolution': 'RemoteSync'  # Set conflict resolution to RemoteSync
                }
            }
            
            # Update the workspace
            updateworkspaceAllurl = f"{FABRIC_API_URL}/workspaces/{workspace_id}/git/updateFromGit"
            update_response = requests.post(updateworkspaceAllurl, headers=headers, json=update_params)
            
            if update_response.status_code == 200:
                git_status = update_response.json()
                logging.info(f"Feature workspace {WORKSPACE_NAME} is synchronizing with feature branch {ADO_NEW_BRANCH} ")
                #print(git_status)
            elif update_response.status_code == 202:
                logging.info('Request accepted, update workspace is in progress...')
                location_url = update_response.headers.get("Location")
                logging.info(f"Polling URL to track operation status is {location_url}")
                time.sleep(15)
                response = long_running_operation_polling(location_url, 15, headers)
            else:
                logging.error(f'Failed to update the workspace. Status Code: {update_response.status_code} - {update_response.text}')
        
        elif response.status_code == 202:
            logging.info('Request accepted, get initialize in progress. Retry after some time')
        
        else:
            logging.info(f'Failed to Git initialize. Status Code: {response.status_code}')
    
    except requests.exceptions.RequestException as e:
        logging.error(f"An error occurred: {e}")

def set_main_parameters():
    global TENANT_ID
    global USERNAME
    global PASSWORD
    global WORKSPACE_NAME
    global DEVELOPER
    global ADO_MAIN_BRANCH
    global ADO_NEW_BRANCH
    global ADO_GIT_FOLDER
    global ADO_PROJECT_NAME
    global ADO_REPO_NAME
    global ADO_ORG_NAME
    global ADO_API_URL
    global CLIENT_ID
    global CLIENT_SECRET
    global CAPACITY_ID
    global FABRIC_TOKEN
    global ADO_PAT_TOKEN

    try:
        parser = argparse.ArgumentParser()
        parser.add_argument('--ADO_ORG_NAME',type=str, help= 'ADO organization name')        
        parser.add_argument('--TENANT_ID',type=str, help= 'TenantID passed from Devops')
        parser.add_argument('--CLIENT_ID',type=str, help= 'ClientID passed from Devops')
        #parser.add_argument('--CLIENT_SECRET',type=str, help= 'CLIENTSECRET passed from Devops')
        parser.add_argument('--USER_NAME',type=str, help= 'User Name passed from Devops')
        parser.add_argument('--PASSWORD',type=str, help= 'User password passed from Devops')
        parser.add_argument('--WORKSPACE_NAME',type=str, help= 'Name of the feature workspace to be created')
        parser.add_argument('--DEVELOPER',type=str, help= 'Developr UPN to be added to workspace as admin')
        parser.add_argument('--ADO_MAIN_BRANCH',type=str, help= 'Main development branch')
        parser.add_argument('--ADO_GIT_FOLDER',type=str, help= 'Folder where Fabric content is stored')
        parser.add_argument('--ADO_NEW_BRANCH',type=str, help= 'New branch to be created')
        parser.add_argument('--ADO_PROJECT_NAME',type=str, help= 'ADO project name')
        parser.add_argument('--ADO_REPO_NAME',type=str, help= 'ADO repository name')
        parser.add_argument('--ADO_API_URL',type=str, help= 'ADO organization name')
        parser.add_argument('--CAPACITY_ID',type=str, help= 'Capacity ID to assign the workspace')    
        parser.add_argument('--FABRIC_TOKEN',type=str, help= 'Fabric user token') 
        parser.add_argument('--ADO_PAT_TOKEN',type=str, help= 'ADO PAT token')

        args = parser.parse_args()
    except Exception as e:
        logging.error(f'Error: {e}')
        raise ValueError("Could not extract parameters: {e}")
    
    logging.info('Binding parameters...')
    #Bind parameters to script variables
    TENANT_ID = args.TENANT_ID
    USERNAME = args.USER_NAME
    PASSWORD = args.PASSWORD
    WORKSPACE_NAME = args.WORKSPACE_NAME    
    DEVELOPER = args.DEVELOPER
    ADO_MAIN_BRANCH = args.ADO_MAIN_BRANCH
    ADO_NEW_BRANCH = args.ADO_NEW_BRANCH
    ADO_GIT_FOLDER = args.ADO_GIT_FOLDER
    ADO_PROJECT_NAME = args.ADO_PROJECT_NAME
    ADO_REPO_NAME = args.ADO_REPO_NAME
    ADO_ORG_NAME = args.ADO_ORG_NAME
    ADO_API_URL = args.ADO_API_URL
    CLIENT_ID = args.CLIENT_ID
    CAPACITY_ID = args.CAPACITY_ID
    FABRIC_TOKEN = args.FABRIC_TOKEN
    ADO_PAT_TOKEN = args.ADO_PAT_TOKEN

    # For future use when service principal is supported
    #CLIENT_SECRET = args.CLIENT_SECRET


def main():
    logging.info('In main....')

    set_main_parameters()
    token = ""
    if FABRIC_TOKEN != "":
        logging.info('Fabric token found, fetching token...')
        token = FABRIC_TOKEN
    else:
        logging.info('Service account found, generating token...')
        token = acquire_token_user_id_password(TENANT_ID, CLIENT_ID,USERNAME,PASSWORD)

    if token:
        logging.info('Invoking new workspace routine...')    
        workspace_id = create_fabric_workspace(WORKSPACE_NAME, CAPACITY_ID, token)
        if workspace_id:
           logging.info(f'Workspace {WORKSPACE_NAME} ({workspace_id}) successfully created and assigned to capacity {CAPACITY_ID}')
           logging.info(f'Adding workspace admins {DEVELOPER}...')
           add_workspace_admins(workspace_id, DEVELOPER, token)
           logging.info(f'Creating ado branch {ADO_NEW_BRANCH} from {ADO_MAIN_BRANCH}...')
           create_azure_devops_branch(ADO_PROJECT_NAME, ADO_REPO_NAME, ADO_MAIN_BRANCH, ADO_NEW_BRANCH)           
           logging.info(f'Connecting workspace to branch {ADO_NEW_BRANCH}...')
           connect_branch_to_workspace(workspace_id, ADO_PROJECT_NAME, ADO_ORG_NAME,ADO_REPO_NAME, ADO_NEW_BRANCH, ADO_GIT_FOLDER, token)
           logging.info('Initialize workspace...')
           initialize_workspace_from_git(workspace_id, token)
        else:
            logging.error("Terminating branch out process as target workspace could not be created. Please review the logs and ensure you have required permissions on the Fabric tenant. If using a Fabric token also ensure that a valid token has been generated within the last hour. ")
            raise ValueError("Could not create Fabric workspace.")
            
    else:
        logging.error("Terminating branch out process due to credential error. Please use either a valid user account where MFA is not required or generate a recent (within 1 hour) valid Fabric token and store in the referenced Key Vault. ")
        raise ValueError("Could not generate authentication token. Please review the debug logs.")

if __name__ == "__main__":
    main()
    
