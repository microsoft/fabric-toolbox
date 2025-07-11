# import argparse
import json 
import requests
import time
import os

# env variables
token = os.environ['token']
targetWorspaceId = os.environ['targetWorspaceId']
organizationName = os.environ['organizationName']
projectName = os.environ['projectName']
repositoryName = os.environ['repositoryName']
brancheName = os.environ['brancheName']
initializationStrategy = os.environ['initializationStrategy']
conflictResolutionPolicy = os.environ['conflictResolutionPolicy']
requiredAction = "UpdateFromGit"
directoryName = "workspace"
disconnectGit = os.environ['disconnectGit']

#####################
# base url and header
#####################
vBaseUrl = 'https://api.fabric.microsoft.com/v1/' 
vHeader = {'Content-Type':'application/json','Authorization': f'Bearer {token}'}

##################################
# function to disconnect workspace
##################################
def git_disconnect(targetWorspaceId):

    vMessage = f"disconnecting workspace <{targetWorspaceId}>"
    print(vMessage) 

    # url
    vUrl = f"workspaces/{targetWorspaceId}/git/disconnect"

    try:
        # post the assignment
        response = requests.post(vBaseUrl + vUrl, headers=vHeader)

        # Raise an error for bad status codes
        response.raise_for_status()  

        # get the status code and reason
        status_code = response.status_code
        status = response.reason

        # check status
        if status_code == 200:

            vMessage = f"disconnecting workspace <{targetWorspaceId}> succeeded"
            print(f"{vMessage}")
            status = "succeeded"


    except requests.exceptions.HTTPError as err:

        errorCode = err.response.status_code
        errorMessage = err.response.reason

        vMessage = f"disconnecting workspace <{targetWorspaceId}> failed. error code <{errorCode}> and error message <{errorMessage}>"
        print(f"{vMessage}")
        status = "failed"  

    return status


###############################################
# function to connect the workspace to the repo
###############################################
def git_connect(targetWorspaceId, organizationName, projectName, repositoryName, brancheName):

    vMessage = f"connecting workspace <{targetWorspaceId}> to git"
    print(vMessage) 

    # url 
    vUrl = f"workspaces/{targetWorspaceId}/git/connect"

    # json body
    vJsonBody = {
        "gitProviderDetails": {
            "organizationName": f"{organizationName}",
            "projectName": f"{projectName}",
            "gitProviderType": "AzureDevOps",
            "repositoryName": f"{repositoryName}",
            "branchName": f"{brancheName}",
            "directoryName": f"{directoryName}"
        }
    }

    try:
        # post the assignment
        response = requests.post(vBaseUrl + vUrl, headers=vHeader, json=vJsonBody)

        # Raise an error for bad status codes
        response.raise_for_status()  

        # get the status code and reason
        status_code = response.status_code
        status = response.reason

        # check status
        if status_code == 200 or response.status_code == 204: # status is 204 as of 23.03.2024 is success, but not in API documentation

            vMessage = f"connecting workspace <{targetWorspaceId}> to git succeeded"
            print(f"{vMessage}")


    except requests.exceptions.HTTPError as err:

        errorCode = err.response.status_code
        errorMessage = err.response.reason

        vMessage = f"connecting workspace <{targetWorspaceId}> to git  failed. error code <{errorCode}> and error message <{errorMessage}>"
        print(f"{vMessage}")

#######################################
# function to initialise the connection
#######################################
def git_initialize(targetWorspaceId, initializationStrategy):
    
    vMessage = f"initializing git for workspace <{targetWorspaceId}>"
    print(vMessage) 

    # url
    vUrl = f"workspaces/{targetWorspaceId}/git/initializeConnection"

    # json body
    vJsonBody = {
        "initializationStrategy": f"{initializationStrategy}"
    }
    print(vJsonBody)

    try:
        # post the assignment
        response = requests.post(vBaseUrl + vUrl, headers=vHeader, json=vJsonBody)

        # Raise an error for bad status codes
        response.raise_for_status()  

        # get the status code and reason
        status_code = response.status_code
        status = response.reason

        # check status
        if status_code == 200:

            vMessage = f"initializing git for workspace <{targetWorspaceId}> succeeded"
            print(f"{vMessage}")
            remoteCommitHash = response.json().get('remoteCommitHash', '')
            status = "succeeded"

        if status_code == 202:

            vMessage = f"initializing git for workspace <{targetWorspaceId}> - status 202"
            print(vMessage)

            # get the operation url from the header Locaiton
            # doc https://learn.microsoft.com/en-us/rest/api/fabric/articles/long-running-operation
            operationUrl = response.headers.get("Location")

            vMessage = f"operation url: <{operationUrl}>"
            print(vMessage)

            waitTime = 30  # Example value

            # monitor the operation
            while True:

                # sleep the specified time --> this wait time might need adjustment
                time.sleep(waitTime)  
                print(f"sleeping {waitTime} seconds")

                # check the operation status --> sync of artifacts takes time
                operationResponse = requests.get(operationUrl, headers=vHeader) 
                jsonOperation = operationResponse.text
                operation = json.loads(jsonOperation)

                print(f"operation response <{operation}>")

                # check operation status and break if success or failure
                if operation['status'] == "Succeeded" or operation['status'] == "Failed":
                    status = "succeeded" if operation['status'] == "Succeeded" else "failed"
                    
                    if status == "succeeded": 
                        vMessage = f"initializing git for workspace <{targetWorspaceId}> succeeded"
                        print(f"{vMessage}")
                        remoteCommitHash = operationResponse.json().get('remoteCommitHash', '')
                    if status == "failed": 
                        vMessage = f"initializing git for workspace <{targetWorspaceId}> failed"
                        print(f"{vMessage}")
                        remoteCommitHash = ''

                    break

    except requests.exceptions.HTTPError as err:

        errorCode = err.response.status_code
        errorMessage = err.response.reason

        vMessage = f"initializing git for workspace <{targetWorspaceId}> failed. error code <{errorCode}> ; error message <{errorMessage}>"
        print(f"{vMessage}")

        remoteCommitHash = ''
        status = "failed"


    # return the status and the commit hash
    return status, remoteCommitHash

##########################################
# function to update workspace from remote
##########################################

def git_update(targetWorspaceId, remoteCommitHash, conflictResolutionPolicy):
    
    vMessage = f"updating workspace <{targetWorspaceId}> from remote"
    print(vMessage) 

    # url
    vUrl = f"workspaces/{targetWorspaceId}/git/updateFromGit"

    # json body
    vJsonBody = {
        "remoteCommitHash": f"{remoteCommitHash}",
        "conflictResolution": {
            "conflictResolutionType": "Workspace",
            "conflictResolutionPolicy": f"{conflictResolutionPolicy}",
        },
        "options": {
            "allowOverrideItems": True
        }
    }

    print(vJsonBody)
    
    try:
        # post the assignment
        response = requests.post(vBaseUrl + vUrl, headers=vHeader, json=vJsonBody)

        # Raise an error for bad status codes
        response.raise_for_status()  

        # get the status code and reason
        status_code = response.status_code
        status = response.reason

        # check status
        if status_code == 200:

            vMessage = f"updating workspace <{targetWorspaceId}> from remote succeeded"
            print(f"{vMessage}")
            remoteCommitHash = response.json().get('remoteCommitHash', '')
            status = "succeeded"

        if status_code == 202:

            vMessage = f"updating workspace <{targetWorspaceId}> from remote - status 202"
            print(vMessage)

            # get the operation url from the header Locaiton
            # doc https://learn.microsoft.com/en-us/rest/api/fabric/articles/long-running-operation
            operationUrl = response.headers.get("Location")

            vMessage = f"operation url: <{operationUrl}>"
            print(vMessage)

            waitTime = 30  # Example value

            # monitor the operation
            while True:

                # sleep the specified time --> this wait time might need adjustment
                time.sleep(waitTime)  
                print(f"sleeping {waitTime} seconds")

                # check the operation status --> sync of artifacts takes time
                operationResponse = requests.get(operationUrl, headers=vHeader) 
                jsonOperation = operationResponse.text
                operation = json.loads(jsonOperation)

                print(f"operation response <{operation}>")

                # check operation status and break if success or failure
                if operation['status'] == "Succeeded" or operation['status'] == "Failed":
                    status = "succeeded" if operation['status'] == "Succeeded" else "failed"
    
                    if status == "succeeded": 
                        vMessage = f"updating workspace <{targetWorspaceId}> from remote succeeded"
                        print(f"{vMessage}")

                    if status == "failed": 
                        vMessage = f"updating workspace <{targetWorspaceId}> from remote failed"
                        print(f"{vMessage}")

                    break


    except requests.exceptions.HTTPError as err:

        errorCode = err.response.status_code
        errorMessage = err.response.reason

        vMessage = f"updating workspace <{targetWorspaceId}> from remote failed. error code <{errorCode}> ; error message <{errorMessage}>"
        print(f"{vMessage}")

        remoteCommitHash = ''
        status = "failed"

    # return the status and the commit hash
    return status



#############
# git process
#############

try:
    # step 0 - Disconnect Git if already connected
    try:
        statusDisconnect = git_disconnect(targetWorspaceId)
    except Exception as e:
        vMessage = f"disconnecting workspace <{targetWorspaceId}> failed. exception: {str(e)}"
        print(f"{vMessage}")

    # step 1 - Git - Connect
    git_connect(targetWorspaceId, organizationName, projectName, repositoryName, brancheName)

    # step 2 - Git  - Initialize Connection
    statusInitialization, remoteCommitHash = git_initialize(targetWorspaceId, initializationStrategy)
    print(f"initialization status <{statusInitialization}>, remoteCommitHash <>{remoteCommitHash}")

    # if the initialisation is successful, proceed further
    if statusInitialization == "succeeded":
        
        # step 3 - Git - Update From Git
        statusUpdate = git_update(targetWorspaceId, remoteCommitHash, conflictResolutionPolicy)
        

        # if the update is successful , disconnect the workspace from git
        if statusUpdate == "succeeded":

            # step 5 - Git - Disconnect
            if disconnectGit == "yes":
                statusDisconnect = git_disconnect(targetWorspaceId)
                print(f"disconnect status <{statusUpdate}>")

except Exception as e:
    vMessage = f"git process for workspace <{targetWorspaceId}> failed. exception: {str(e)}"
    print(f"{vMessage}")  


