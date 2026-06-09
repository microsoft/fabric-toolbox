# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "jupyter",
# META     "jupyter_kernel_name": "python3.11"
# META   },
# META   "dependencies": {}
# META }

# CELL ********************

%pip install semantic-link-labs --quiet
%pip install azure-kusto-data==4.6.3 --quiet
%pip install azure-kusto-ingest==4.6.3 --quiet

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Variables

# PARAMETERS CELL ********************

cluster_ingest = ""
cluster_query = ""
database_name = ""

key_vault_uri = f""
key_vault_tenant_id = f""
key_vault_client_id = f""
key_vault_client_secret = f""

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Load Libraries

# CELL ********************

import sempy_labs as labs
from dateutil.parser import parse as dtparser
import pandas as pd
import json
from sempy_labs import admin

from azure.kusto.data import KustoConnectionStringBuilder
from azure.kusto.data.data_format import DataFormat
from azure.kusto.ingest import (
    QueuedIngestClient,
    ReportLevel,
    IngestionProperties,
    IngestionStatus,
)

WAIT_TIME = 2

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

client_id = notebookutils.credentials.getSecret(key_vault_uri, key_vault_client_id)
client_secret = notebookutils.credentials.getSecret(key_vault_uri, key_vault_client_secret)
authority_id = notebookutils.credentials.getSecret(key_vault_uri, key_vault_tenant_id)

connection_info = {
    'client_id': client_id,
    'client_secret': client_secret,
    'authority_id': authority_id,
    'key_vault_uri': key_vault_uri,
    'key_vault_tenant_id': key_vault_tenant_id,
    'key_vault_client_id': key_vault_client_id,
    'key_vault_client_secret': key_vault_client_secret,
    'cluster_ingest': cluster_ingest,
    'cluster_query': cluster_query,
    'database_name': database_name,
}

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Functions

# CELL ********************

def kusto_ingest_process(df,table_name,connection_info):
    
    database_name = connection_info['database_name']
    cluster = connection_info['cluster_ingest']
    client_id = connection_info['client_id']
    client_secret = connection_info['client_secret']
    authority_id = connection_info['authority_id']

    ingestion_properties = IngestionProperties(
        database=f"{database_name}",
        table=f"{table_name}",
        data_format=DataFormat.CSV,
        report_level=ReportLevel.FailuresAndSuccesses,
        )

    kcsb = KustoConnectionStringBuilder.with_aad_application_key_authentication(cluster, client_id, client_secret, authority_id)

    client = QueuedIngestClient(kcsb)    

    result = client.ingest_from_dataframe(df,ingestion_properties=ingestion_properties)


    print(result)


    time.sleep(WAIT_TIME)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

def refreshables_process(connection_info:dict,all:bool=False):

    filter = None

    if not all:
        date_from =  pd.Timestamp.now()-pd.Timedelta(minutes=20)
        date_from = date_from.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        filter = f"lastRefresh/startTime gt {date_from}"

    with labs.service_principal_authentication(
            key_vault_uri=connection_info['key_vault_uri'], 
            key_vault_tenant_id=connection_info['key_vault_tenant_id'],
            key_vault_client_id=connection_info['key_vault_client_id'],
            key_vault_client_secret=connection_info['key_vault_client_secret']):
            df = admin.get_refreshables(
                expand="capacity,group",
                filter=filter,
                )

    if len(df.index) > 0:
        df["Configured By"]=df["Configured By"].apply(json.dumps)
        df["Refresh Schedule Days"]=df["Refresh Schedule Days"].apply(json.dumps)
        df["Refresh Schedule Times"]=df["Refresh Schedule Times"].apply(json.dumps)
        kusto_ingest_process(df=df,table_name="RefreshablesRaw",connection_info=connection_info)
    
    return df


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

refreshables = refreshables_process(connection_info=connection_info,all=True)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

refreshables

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }
