import requests
import json
import argparse
import os
import logging
import time

# Constants
# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logging.info('starting...')
logging.info('Starting. Parsing arguments...')

FABRIC_TOKEN = ""
WS_ID = ""
NOTEBOOK_ID = ""
TENANT_ID = ""
CLIENT_ID = ""
USERNAME = ""
PASSWORD = ""
CONNECTIONS_FROM_TO = ""
WH_VIEWS_ON_LH =""


parser = argparse.ArgumentParser() 
parser.add_argument('--FABRIC_TOKEN',type=str, help= 'Fabric user token') 
parser.add_argument('--SOURCE_WORKSPACE',type=str, help= 'Source workspace') 
parser.add_argument('--COPY_LAKEHOUSE',type=str, help= 'Copy lakehoues data from source to target') 
parser.add_argument('--CREATE_SHORTCUTS',type=str, help= 'Create shortcuts back to source lakehouse in target lakehouse') 
parser.add_argument('--COPY_WAREHOUSE',type=str, help= 'Copy warehoues data') 
parser.add_argument('--TARGET_WORKSPACE',type=str, help= 'Target workspace') 
parser.add_argument('--NOTEBOOK_WORKSPACE_ID',type=str, help= 'Workspace GUID where the post activity notebook is saved') 
parser.add_argument('--NOTEBOOK_ID',type=str, help= 'GUID of the post activity notebook') 
parser.add_argument('--TENANT_ID',type=str, help= 'Tenant ID of the service principal/user ')
parser.add_argument('--CLIENT_ID',type=str, help= 'ClientID of the service principal/user')
parser.add_argument('--USER_NAME',type=str, help= 'User Name passed from Devops')
parser.add_argument('--PASSWORD',type=str, help= 'User password passed from Devops')
parser.add_argument('--CONNECTIONS_FROM_TO',type=str, help= 'Connections change from a UUID or name to UUID or name')
parser.add_argument('--WH_VIEWS_ON_LH',type=str, help= 'Are there warehouse views on lakehouse?')


args = parser.parse_args()
FABRIC_TOKEN = args.FABRIC_TOKEN
SOURCE_WS = args.SOURCE_WORKSPACE
TARGET_WS = args.TARGET_WORKSPACE
COPY_LH = args.COPY_LAKEHOUSE
COPY_WH = args.COPY_WAREHOUSE
CREATE_SC = args.CREATE_SHORTCUTS
WS_ID = args.NOTEBOOK_WORKSPACE_ID
NOTEBOOK_ID = args.NOTEBOOK_ID
TENANT_ID = args.TENANT_ID
CLIENT_ID = args.CLIENT_ID
USERNAME = args.USER_NAME
PASSWORD = args.PASSWORD
CONNECTIONS_FROM_TO = args.CONNECTIONS_FROM_TO
WH_VIEWS_ON_LH = args.WH_VIEWS_ON_LH


def acquire_token_user_id_password(tenant_id, client_id,user_name,password):
   
   # Initialize the MSAL public client
   logging.info("Generating Token for Microsoft Fabric in progress...")
   authority = f'https://login.microsoftonline.com/{tenant_id}'
   app = msal.PublicClientApplication(client_id, authority=authority)
   scopes = ['https://api.fabric.microsoft.com/.default']   
   result = app.acquire_token_by_username_password(user_name, password, scopes)  
   #logging.info('Token result: '+str(result)) 
   if 'access_token' in result:
       access_token = result['access_token']
       logging.info("Generating Token for Microsoft Fabric generated")

   else:
     access_token = None
     logging.error('Error: Token could not be obtained: '+str(result))
   return access_token

def main():
    logging.info('Checking for supplied credentials...')
    if FABRIC_TOKEN!="":
        logging.info('Fabric token found...')
        token = FABRIC_TOKEN
    else:
        logging.info('User creds found, generating token...')
        token = acquire_token_user_id_password(TENANT_ID,CLIENT_ID,user_name,password)
        
    if token:
        if NOTEBOOK_ID == '':
            raise ValueError('Error: Could not execute notebook as no Notebook ID has been specified.')


        plurl = 'https://api.fabric.microsoft.com/v1/workspaces/'+WS_ID +'/items/'+NOTEBOOK_ID+'/jobs/instances?jobType=RunNotebook'

        headers = {
        "Authorization": f"Bearer {token}", 
        "Content-Type": "application/json"  # Set the content type based on your request
        }
        logging.info('Setting notebook parameters...')
        payload_data = '{' \
            '"executionData": {' \
                '"parameters": {' \
                    '"_inlineInstallationEnabled": {"value": "True", "type": "bool"},' \
                    '"source_ws": {"value": "' + SOURCE_WS + '", "type": "string"},' \
                    '"copy_lakehouse_data": {"value": "' + COPY_LH + '", "type": "bool"},' \
                    '"create_lakehouse_shortcuts": {"value": "' + CREATE_SC + '", "type": "bool"},' \
                    '"copy_warehouse_data": {"value": "' + COPY_WH + '", "type": "bool"},' \
                    '"target_ws": {"value": "' + TARGET_WS + '", "type": "string"},' \
                    '"connections_from_to": {"value": "' + CONNECTIONS_FROM_TO + '", "type": "string"},' \
                    '"has_wh_views_on_lh": {"value": "' + WH_VIEWS_ON_LH + '", "type": "bool"},' \
                    '"_runStandalone": {"value": "False", "type": "bool"}' \
                    '}}}'
        logging.info('Invoking Fabric notebook job...')
        plresponse = requests.post(plurl, json=json.loads(payload_data), headers=headers)
        #logging.info(str(plresponse.status_code) + ' - ' + plresponse.text)    
        if plresponse.status_code==202:
            logging.info('Job has been invoked. The result will now be polled frequently or check the Fabric monitoring hub.')
            location_url = plresponse.headers.get("Location")
            retry_after = int(plresponse.headers.get("Retry-After", 5))  # Default to 5 seconds if not provided

            logging.info(f"Job with the location: '{location_url}' has been triggered  with a status check of '{retry_after}' seconds.")

            # Polling for operation status
            while True:
                time.sleep(10) # there is a delay between having the status updated after calling the job instance api so adding a 10 seconds wait
                operation_status_response = requests.get(f"{location_url}", headers=headers)
                operation_state = operation_status_response.json()
                #logging.info(operation_state)

                status = operation_state.get("status")
                logging.info(f"Operation status: {status}")

                if status in ["NotStarted", "Running"]:
                    logging.info(f"The job is still running or is not started")
                    time.sleep(retry_after)
                else:
                    break

            # Final check on operation status
            if status == "Failed":
                error_response = operation_state.get('failureReason', {}).get('message', '')
                logging.error(f"The notebook job failed. Error response: {error_response}")
                raise ValueError(f"The post activity notebook failed. Please review the monitoring snapshot in Fabric for more detail. Error response: {error_response}")

            else:
                logging.info("The job has complete successfully")  

        else:
            logging.error('An error occurred when trying to invoke job: ' + str(plresponse.status_code) + ' - ' + plresponse.text)
            raise ValueError("Error invoking Fabric notebook. Please review the debug logs.")

    else:
        logging.error("Could not aquire token")
        raise ValueError("Could not generate authentication token. Please review the debug logs.")
    


if __name__ == "__main__":
    logging.info('Starting Run_post_activity script...')
    main()
    
