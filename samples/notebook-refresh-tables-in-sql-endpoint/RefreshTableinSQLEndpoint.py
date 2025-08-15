## Example of calling the MD Sync REST API from a User Data Function.
## https://learn.microsoft.com/en-us/fabric/data-engineering/user-data-functions/user-data-functions-overview

import fabric.functions as fn
import logging
import msal
import requests
import json
import time

# Add the following Libraries
# MSAL , Requests, JSON

udf = fn.UserDataFunctions()

def get_sqlendpoint(workspaceId, header, lakehouse_name):
    """
    This lists the SQL endpoints for the given workspace.
    """
    getsqlendpoint = f'https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/sqlEndpoints'
    response = requests.get(url=getsqlendpoint, headers=header)
    get_sqlenpoints = response.json().get('value', [])
    for sqlendpoint in get_sqlenpoints:
        if sqlendpoint['displayName'].lower() == lakehouse_name.lower():
            sqlendpoint_id = sqlendpoint['id']
            return sqlendpoint_id


def refresh_sql_endpoint(sqlendpoint_id, header, workspaceId)-> str:
    """
    Calls the SQL Endpoint refresh API for the specified SQL Endpoint ID.
    Handles both synchronous and asynchronous responses.
    """
    #refresh_url = f'https://api.powerbi.com/v1/workspaces/{workspaceId}/sqlEndpoints/{sqlendpoint_id}/refreshMetadata?preview=true' #preview=true is not needed anymore
    refresh_url = f'https://api.powerbi.com/v1/workspaces/{workspaceId}/sqlEndpoints/{sqlendpoint_id}/refreshMetadata'
    logging.info(refresh_url)
    payload = {}
    response = requests.post(url=refresh_url, headers=header, json=payload)

    try:
        match response.status_code:
            case 200:
                data = json.loads(response.text)
                logging.info("200:")
                logging.info(data)
                logging.info(response.text)
                return response.text
            case 202:
                operation_id = response.headers.get("x-ms-operation-id")
                retry_delay = int(response.headers.get("retry-after", 5))
                lro_uri = f"https://api.powerbi.com/v1/operations/{operation_id}"
                lro_result_uri = f"{lro_uri}/result"
                logging.info("202:")
                while True:
                    lro_response = requests.get(lro_uri, headers=header)
                    lro_data = json.loads(lro_response.text)
                    logging.info(lro_uri)
                    logging.info(lro_response.text)
                    if lro_data.get("status") == "Succeeded":
                        lro_result_response = requests.get(lro_result_uri, headers=header)
                        lro_result_data = json.loads(lro_result_response.text)
                        logging.info("202:")
                        logging.info(lro_result_data)
                        logging.info(lro_result_response.text)
                        return lro_result_data;
                        break
                    if lro_data.get("status") == "Failed":
                        logging.info(f"Failed 202: {lro_data}")
                        break
                    print("waiting...")
                    time.sleep(retry_delay)
            case 500:
                logging.info("The sync is already running...")
                logging.info(response.text)
            case _:
                data = json.loads(response.text)
                logging.info("case else:")
                logging.info(data)
                logging.info(response.text)
    except Exception as e:
        print(e)

@udf.function()
def MDSync(lakehousename: str, workspaceId : str) -> str:
    #TODO: Replace the below to code to pull from information from Key Vault.
    #https://learn.microsoft.com/en-us/azure/key-vault/secrets/quick-create-python?tabs=azure-cli
    TENANT_ID = '__add the tenant id__'
    CLIENT_ID = '__add the client id__'
    CLIENT_SECRET = '__add the client secret__'

    RESOURCE = 'https://analysis.windows.net/powerbi/api'
    AUTHORITY_URL = f'https://login.microsoftonline.com/{TENANT_ID}'
    SCOPE = ['https://api.fabric.microsoft.com/.default']
    app = msal.ConfidentialClientApplication(
        client_id=CLIENT_ID,
        client_credential=CLIENT_SECRET,
        authority=AUTHORITY_URL
    )
    result = app.acquire_token_for_client(scopes=SCOPE)
    if 'access_token' in result:
        access_token = result['access_token']
    else:
        raise Exception(f"Failed to acquire token: {result.get('error_description')}")
    header = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {access_token}'
    }
    sqlendpoint_id = get_sqlendpoint(workspaceId, header, lakehousename)
    return refresh_sql_endpoint(sqlendpoint_id, header, workspaceId)
