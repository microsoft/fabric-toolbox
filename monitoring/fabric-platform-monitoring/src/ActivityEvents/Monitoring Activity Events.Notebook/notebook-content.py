# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "jupyter",
# META     "jupyter_kernel_name": "python3.11"
# META   },
# META   "dependencies": {}
# META }

# MARKDOWN ********************

# # Monitoring Solution

# MARKDOWN ********************

# ## Install Modules

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
database_name = ''

key_vault_uri = f""
key_vault_tenant_id = f""
key_vault_client_id = f""
key_vault_client_secret = f""

DAILY = False
specific_date = None

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

# ## Activity Logs Functions

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

def audit_ingest(start_date,end_date,connection_info):
    start_dt = dtparser(start_date).strftime('%Y-%m-%dT%H:%M:%S')
    end_dt = dtparser(end_date).strftime('%Y-%m-%dT%H:%M:%S')

    print(f"Processing Activity Events from {start_dt} to {end_dt}")
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        activities = labs.admin.list_activity_events(start_time=start_dt,end_time=end_dt,return_dataframe=False)

    number_acitivites = len(activities['activityEventEntities'])

    print(f"Number of Activities: {number_acitivites}")

    if number_acitivites > 0:
        resultString=list(map(json.dumps,activities['activityEventEntities']))
        df = pd.DataFrame(columns=['ActivityEvents'])
        df['ActivityEvents'] = pd.Series(resultString)

        kusto_ingest_process(df=df,table_name='ActivityEventsRaw',connection_info=connection_info)


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

def audit_process(daily,connection_info,specific_date=None):
    dates = []

    if daily:
        if specific_date is None:
            start_date = (pd.Timestamp.now()-pd.Timedelta(days=1))
            date = {
                "start_date": start_date.strftime('%Y-%m-%dT00:00:00'),
                "end_date": start_date.strftime('%Y-%m-%dT23:59:59'),                
            }
            dates.append(date)
        else:
            date = {
                "start_date": pd.to_datetime(specific_date).strftime('%Y-%m-%dT00:00:00'),
                "end_date": pd.to_datetime(specific_date).strftime('%Y-%m-%dT23:59:59'),                
            }
            dates.append(date)
    else:
        if specific_date is None:
            start_date = pd.Timestamp.now()-pd.Timedelta(hours=1)
            end_date = pd.Timestamp.now()
            start_day = start_date.day
            end_day = end_date.day

            if start_day != end_day:
                date = {
                    "start_date": start_date.strftime('%Y-%m-%dT%H:%M:%S'),
                    "end_date": start_date.strftime('%Y-%m-%dT23:59:59'),            
                }
                dates.append(date)
                date = {
                    "start_date": end_date.strftime('%Y-%m-%dT00:00:00'),
                    "end_date": end_date.strftime('%Y-%m-%dT%H:%M:%S'),            
                }
                dates.append(date)
            else:
                date = {
                    "start_date": start_date.strftime('%Y-%m-%dT%H:%M:%S'),
                    "end_date": end_date.strftime('%Y-%m-%dT%H:%M:%S'),
                }
                dates.append(date)
        else:
            for hour in range(0,24):
                date = {
                    "start_date": pd.to_datetime(specific_date).strftime(f'%Y-%m-%dT{hour}:00:00'),
                    "end_date": pd.to_datetime(specific_date).strftime(f'%Y-%m-%dT{hour}:59:59'),                
                }
                dates.append(date)
        
    for date in dates:
        start_date = date['start_date']
        end_date = date['end_date']

        audit_ingest(
                start_date=start_date,
                end_date=end_date,
                connection_info=connection_info,
            )

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Execution of Process

# CELL ********************

audit_process(
    daily=DAILY,
    connection_info=connection_info,
    specific_date=specific_date
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

# for x in range(1,12):
#     date = f"2025-06-{x:02}T00:00:00"
#     audit_process(
#         daily=True,
#         connection_info=connection_info,
#         specific_date=date
#     )

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }
