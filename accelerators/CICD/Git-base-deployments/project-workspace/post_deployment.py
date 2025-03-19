import os
import requests
import time
import re
import argparse
import json 



# parser
parser = argparse.ArgumentParser()
parser.add_argument("-mappingConnectionsFilePath", type=str)
args = parser.parse_args()


# env variables
cicdWorkspaceId = os.environ['cicdWorkspaceId']
sourceWorkspaceId = os.environ['sourceWorkspaceId']
targetWorkspaceId = os.environ['targetWorkspaceId']
fabricToken = os.environ['fabricToken']
sqlToken = os.environ['sqlToken']
targetStage = os.environ['targetStage']
projectName = os.environ['projectName']
featureBranch = os.environ['featureBranch']
mappingConnectionsFilePath = args.mappingConnectionsFilePath 

###############################################################
# read the mapping connection json file and generate one line
###############################################################
with open(mappingConnectionsFilePath, "r") as file:
    vMappingConnections = json.load(file)
pMappingConnections = json.dumps(vMappingConnections, separators=(",", ":"))


#####################
# base url and header
#####################
vBaseUrl = 'https://api.fabric.microsoft.com/v1/' 
vHeader = {'Content-Type':'application/json','Authorization': f'Bearer {fabricToken}'}


#####################
# Define variables
#####################
vWorkspaceId = cicdWorkspaceId
vNotebookName = "nb_cicd_post_deployment"
pSourceWorkspaceId = sourceWorkspaceId
pTargetWorkspaceId = targetWorkspaceId
pTargetStage = targetStage
pTimeoutPerCellInSeconds = 300
pTimeoutInSeconds = 900
pProjectName = projectName
pFeatureBranch = featureBranch

#########################################
# define the function to run the notebook
#########################################
def run_notebook(url, headers, body, operation, workspace_id, item_name, item_type, sleep_in_seconds):

    vMessage = f"{operation} {item_type} <{item_name}> in workspace <{workspace_id}>"
    print(vMessage)

    try:
    
        # post the assignment
        if body is None:
            response = requests.post(url, headers=headers)
        else:
            response = requests.post(url, headers=headers, json=body)

        response.raise_for_status()

        if response.status_code not in (200, 201, 202):
            raise requests.exceptions.HTTPError(f"HTTP Error: {response.status_code} - {response.reason}")
        else:

            # check status
            # if response.status_code == 201: # if status is 201 then the create item succeeded

            #     vMessage = f"{operation} {item_type} <{item_name}> in workspace <{workspace_id}> succeeded"
            #     print(f"{vMessage}")

            if response.status_code == 202: # if status is 202 then the create item is in progress
                
                vMessage = f"{operation} {item_type} <{item_name}> in workspace <{workspace_id}> is in progress"
                print(vMessage)

                # get the operation url from the header location
                # doc https://learn.microsoft.com/en-us/rest/api/fabric/articles/long-running-operation
                operation_url = response.headers.get("Location")
                retry_after = int(response.headers.get("Retry-After"))

                vMessage = f"waiting {retry_after} seconds before getting the operation status from url: <{operation_url}>"
                print(f"{vMessage}")
                time.sleep(retry_after)

                # monitor the operation
                while True:

                    try:

                        # check the operation
                        operation_response = requests.get(operation_url, headers=headers) 
                        operation_response.raise_for_status() 
                        operation_data = operation_response.json()  

                        # Check if the API call is complete
                        status = operation_data.get("status")
                        if status in ["Cancelled", "Completed", "Failed", "Deduped"]:

                            vMessage = f"{operation} {item_type} <{item_name}> in workspace <{workspace_id}> finished with the status <{status}>."
                            print(f"{vMessage}")
                            break
                        else:
                            vMessage = f"{operation} {item_type} <{item_name}> in workspace <{workspace_id}> is still running with the status <{status}>."
                            print(f"{vMessage}")

                    except requests.exceptions.RequestException as e:
                        vMessage = f"calling operation url <operation_url> failed. exception: {e}"
                        print(f"{vMessage}")    

                    # sleep the specified time --> this wait time might need adjustment based on your understanding of how long the notebook might run
                    time.sleep(vSleepInSeconds)

            else: # any other status is a failure
                vMessage = f"{operation} {item_type} <{item_name}> in workspace <{workspace_id}> failed"
                print(f"{vMessage}")
        
    except Exception as e:
        print("failed to call the fabric api. exception:", str(e))
        return None



##########################
# Extract the notebook Id
##########################
vUrl = vBaseUrl + f"workspaces/{vWorkspaceId}/notebooks" 
response = requests.get( vUrl, headers=vHeader)
response.raise_for_status()
notebooks = response.json().get("value", [])
vNotebookId = next((nb["id"] for nb in notebooks if nb["displayName"] == vNotebookName), None)
print(f"notebook id {vNotebookId}")

##########################
# Run the notebook
##########################

# set the body
vJsonBody = {
    "executionData": {
        "parameters": {
            "pSourceWorkspaceId": {
                "value": f"{pSourceWorkspaceId}",
                "type": "string"
            },
            "pTargetWorkspaceId": {
                "value": f"{pTargetWorkspaceId}",
                "type": "string"
            },
            "pTargetStage": {
                "value": f"{pTargetStage}",
                "type": "string"
            },
            "pDebugMode": {
                "value": "no",
                "type": "string"
            },     
            "pTimeoutPerCellInSeconds": {
                "value": f"{pTimeoutPerCellInSeconds}",
                "type": "string"
            },
            "pTimeoutInSeconds": {
                "value": f"{pTimeoutInSeconds}",
                "type": "string"
            },    
            "pProjectName": {
                "value": f"{pProjectName}",
                "type": "string"
            },
            "pFeatureBranch": {
                "value": f"{pFeatureBranch}",
                "type": "string"
            },
            "pMappingConnections": {
                "value": f"{pMappingConnections}",
                "type": "string"
            }
        }
    }
}

vSleepInSeconds=30
vUrl = vBaseUrl + f"workspaces/{vWorkspaceId}/items/{vNotebookId}/jobs/instances?jobType=RunNotebook"
run_notebook(vUrl, vHeader, vJsonBody, "executing", vWorkspaceId, vNotebookName, "Notebook", vSleepInSeconds) 


