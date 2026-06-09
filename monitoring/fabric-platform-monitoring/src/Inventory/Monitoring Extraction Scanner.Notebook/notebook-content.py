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

from azure.kusto.data import KustoClient,KustoConnectionStringBuilder
from azure.kusto.data.data_format import DataFormat
from azure.kusto.ingest import (
    KustoStreamingIngestClient,
    IngestionProperties,
    IngestionStatus,
)

import sempy_labs as labs
from dateutil.parser import parse as dtparser
import pandas as pd
import time
import numpy as np
import json
import concurrent.futures

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
    cluster = connection_info['cluster_query']
    client_id = connection_info['client_id']
    client_secret = connection_info['client_secret']
    authority_id = connection_info['authority_id']

    ingestion_properties = IngestionProperties(
        database=f"{database_name}",
        table=f"{table_name}",
        data_format=DataFormat.CSV
        )

    kcsb = KustoConnectionStringBuilder.with_aad_application_key_authentication(cluster, client_id, client_secret, authority_id)

    client = KustoStreamingIngestClient(kcsb)    

    result = client.ingest_from_dataframe(df,ingestion_properties=ingestion_properties)

    assert result.status == IngestionStatus.SUCCESS

    print(result)


    time.sleep(WAIT_TIME)
    

def kusto_query(query,connection_info):
    database_name = connection_info['database_name']
    cluster = connection_info['cluster_query']
    client_id = connection_info['client_id']
    client_secret = connection_info['client_secret']
    authority_id = connection_info['authority_id']

    kcsb = KustoConnectionStringBuilder.with_aad_application_key_authentication(cluster, client_id, client_secret, authority_id)

    client_query = KustoClient(kcsb)

    response = client_query.execute(database_name,query)

    return response

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

def scanner_kql(connection_info):
    print("Kusto Queries Start")
    query_ws = f"""
        .update table Workspaces delete delete_table append append_table with(distributed=true) <|
            let delete_table = Workspaces
                | join (
                    WorkspacesHistory
                    | where scanTime > toscalar(
                            Workspaces
                            | project scanTime
                            | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
                        )
                    | project id
                    )
                    on id;
            let append_table = WorkspacesHistory
                | where scanTime > toscalar(
                        Workspaces
                        | project scanTime
                        | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
                    )
                | summarize arg_max(scanTime, name, description, type, state, isOnDedicatedCapacity, capacityId, defaultDatasetStorageFormat, domainId, dataRetrievalState, details) by id
                | project
                    id,
                    name,
                    description,
                    domainId,
                    state,
                    type,
                    defaultDatasetStorageFormat,
                    isOnDedicatedCapacity,
                    capacityId,
                    dataRetrievalState,
                    details,
                    scanTime;
    """

    query_ds = f"""
        .update table DatasourceInstance delete delete_table append append_table with(distributed=true)  <|
            let delete_table = DatasourceInstance
                | where datasourceId in (
                    DatasourceInstancesHistory
                    | where scanTime > toscalar(
                        DatasourceInstance
                        | project scanTime
                        | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime)))
                    | project datasourceId=toguid(DatasourceInstances.datasourceId));
            let append_table = DatasourceInstancesHistory
                | where scanTime > toscalar(
                    DatasourceInstance
                    | project scanTime
                    | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime)))
                | project
                    gatewayId=toguid(DatasourceInstances.gatewayId),
                    datasourceId=toguid(DatasourceInstances.datasourceId),
                    datasourceType= tostring(DatasourceInstances.datasourceType), 
                    scanTime, 
                    misconfigured= tobool(DatasourceInstances.misconfigured),
                    connectionDetails= todynamic(DatasourceInstances.connectionDetails)
                | summarize arg_max(scanTime, datasourceType, connectionDetails, misconfigured) by gatewayId, datasourceId;
    """

    query_ws_users = """    
        .update table WorkspacesUsers delete delete_table append append_table with(distributed=true) <|
            let delete_table = WorkspacesUsers
                | where workspaceId in (
                    WorkspacesUsersHistory
                    | where scanTime > toscalar(
                        WorkspacesUsers
                        | project scanTime
                        | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime)))
                    | project workspaceId);
            let append_table = WorkspacesUsersHistory
                | where scanTime > toscalar(
                    WorkspacesUsers
                    | project scanTime
                    | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
                    )
                | summarize arg_max(
                        scanTime,
                        workspaceName,
                        displayName,
                        emailAddress,
                        identifier,
                        principalType,
                        userType,
                        groupUserAccessRight,
                        details
                    )
                    by workspaceId, graphId
                | project
                    workspaceId,
                    workspaceName,
                    graphId,
                    displayName,
                    emailAddress,
                    identifier,
                    principalType,
                    userType,
                    groupUserAccessRight,
                    details,
                    scanTime;
    """

    query_items = """
        .update table Items delete delete_table append append_table  with(distributed=true) <|
            let delete_table = Items
                | where workspaceId in (
                    ItemsHistory
                    | where scanTime > toscalar(
                        Items
                        | project scanTime
                        | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime)))
                    | project workspaceId);
            let append_table = ItemsHistory
                | where scanTime > toscalar(
                    Items
                    | project scanTime
                    | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime)))
                | summarize arg_max(scanTime, workspaceName, itemType, itemName, details) by workspaceId, itemId
                | project workspaceId, workspaceName, itemType, itemId, itemName, details, scanTime;
    """

    query_items_users_delete = """
        .delete table  ItemsUsers records <| ItemsUsers
                | where workspaceId in (
                    ItemsUsersHistory
                    | where scanTime > toscalar(
                        ItemsUsers
                        | project scanTime
                        | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime)))
                    | project workspaceId)
    """

    query_items_users = """
        .set-or-append ItemsUsers <| ItemsUsersHistory
                | where scanTime > toscalar(
                    ItemsUsers
                    | project scanTime
                    | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
                    )
                | summarize arg_max(scanTime, *) by workspaceId, itemId, graphId
                | project
                    workspaceId,
                    workspaceName,
                    itemType,
                    itemId,
                    itemName,
                    graphId,
                    displayName,
                    emailAddress,
                    identifier,
                    principalType,
                    userType,
                    userAccessRight,
                    details,
                    scanTime
    """

    query_sm_details = """
        .update table SemanticModelDetails delete delete_table append append_table with(distributed=true) <|
            let delete_table = SemanticModelDetails
                | where workspaceId in (
                    SemanticModelDetailsHistory
                    | where scanTime > toscalar(
                        SemanticModelDetails
                        | project scanTime
                        | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime)))
                    | project workspaceId);
            let append_table = SemanticModelDetailsHistory
                | where scanTime > toscalar(
                    SemanticModelDetails
                    | project scanTime
                    | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime)))
                | project
                    workspaceId,
                    workspaceName,
                    itemType,
                    itemId,
                    itemName,
                    tables,
                    relationships,
                    expressions,
                    roles,
                    upstreamDataflows,
                    scanTime;
    """

    response_ds = kusto_query(query=query_ds,connection_info=connection_info)
    response_ws = kusto_query(query=query_ws,connection_info=connection_info)    
    response_ws_users = kusto_query(query=query_ws_users,connection_info=connection_info)
    response_items = kusto_query(query=query_items,connection_info=connection_info)
    response_sm_details = kusto_query(query=query_sm_details,connection_info=connection_info)
    response_items_users_delete = kusto_query(query=query_items_users_delete,connection_info=connection_info)
    response_items_users = kusto_query(query=query_items_users,connection_info=connection_info)

    print("Kusto Queries End")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

def cleanup_kql(connection_info):
    print("Kusto Queries Start")
    query_ws = f"""
        .delete table Workspaces records <| Workspaces
        | where id in (Workspaces | where scanTime < ago(7d) and state == "Deleted" | project id)
    """

    query_ws_users = """    
        .delete table WorkspacesUsers records <| WorkspacesUsers
        | where workspaceId in (Workspaces | where scanTime < ago(7d) and state == "Deleted" | project id)
    """

    query_items = """
        .delete table Items records <| Items
        | where workspaceId in (Workspaces | where scanTime < ago(7d) and state == "Deleted" | project id)
    """

    query_items_users = """
        .delete table ItemsUsers records <| ItemsUsers
        | where workspaceId in (Workspaces | where scanTime < ago(7d) and state == "Deleted" | project id)
    """

    query_sm_details = """
        .delete table SemanticModelDetails records <| SemanticModelDetails
        | where workspaceId in (Workspaces | where scanTime < ago(7d) and state == "Deleted" | project id)
    """

    response_ws_users = kusto_query(query=query_ws_users,connection_info=connection_info)
    response_items = kusto_query(query=query_items,connection_info=connection_info)
    response_sm_details = kusto_query(query=query_sm_details,connection_info=connection_info)
    response_items_users = kusto_query(query=query_items_users,connection_info=connection_info)
    response_ws = kusto_query(query=query_ws,connection_info=connection_info)

    print("Kusto Queries End")

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python",
# META   "frozen": false,
# META   "editable": true
# META }

# CELL ********************

def missing_workspaces(connection_info):
    query_workspaces = f"""
        Workspaces
        | project WorkspaceId= id
        | where not(isempty( WorkspaceId))
        | distinct WorkspaceId
        """

    query_deleted_workspaces = f"""
        WorkspacesHistory
        | where state == "Deleted"
        | project WorkspaceId= id
        | where not(isempty( WorkspaceId))
        | distinct WorkspaceId
        """

    response_workspaces = kusto_query(query=query_workspaces,connection_info=connection_info)
    response_deleted_workspaces = kusto_query(query=query_deleted_workspaces,connection_info=connection_info)

    existing_ws = []
    deleted_ws = []

    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        modified_workspaces = labs.admin.list_modified_workspaces()["Workspace Id"].tolist()
        deleted_workspaces = labs.admin.list_workspaces(workspace_state="Deleted")["Id"].tolist()

    for w in response_workspaces.primary_results[0]:
        existing_ws.append(w['WorkspaceId'])

    for w in response_deleted_workspaces.primary_results[0]:
        deleted_ws.append(w['WorkspaceId'])

    result = list(set(modified_workspaces) - set(existing_ws))
    deleted_workspaces = list(set(deleted_workspaces) - set(deleted_ws))
    result = list(set(result) | set(deleted_workspaces))

    return result

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

def scanner_workspace_result_to_df(scan_result,scan_time):
    ws_list = []
    ws_users_list = []
    items_list = []
    items_sm_details_list = []
    items_users_list = []
    ws_keys_to_extract = ['id', 'name', 'description', 'domainId', 'state', 'type', 'defaultDatasetStorageFormat', 'isOnDedicatedCapacity', 'capacityId','dataRetrievalState']
    ws_users_keys_to_extract = ['graphId','displayName','emailAddress','identifier','principalType','userType','groupUserAccessRight']
    items_keys_to_extract = ['id','objectId','name','displayName']
    items_sm_keys_to_extract = ['tables','relationships','expressions','roles','upstreamDataflows']
    items_users_keys_to_extract = ['graphId','displayName','emailAddress','identifier','principalType','userType']
    items_users_access_right_keys_to_extract = ['reportUserAccessRight','datasetUserAccessRight','datamartUserAccessRight','dataflowUserAccessRight','artifactUserAccessRight']

    for ws in scan_result['workspaces']:
        ws_details = {}
        detail_info = {}
        details_keys = []
        items_keys = []

        #Extract Workspace
        other_keys = list(set(ws.keys()) - set(ws_keys_to_extract) - set(['users']))

        for oks in other_keys:
            if type(ws[oks]) == list and len(ws[oks])>0 and (ws[oks][0].get('id') or ws[oks][0].get('objectId')):
                items_keys.append(oks)
            elif type(ws[oks]) != list and len(ws[oks])>0:
                details_keys.append(oks)

        for k in ws_keys_to_extract:
            if ws.get(k) is not None:
                ws_details[k] = ws[k]
            else:
                ws_details[k] = ""

        for rk in details_keys:
            detail_info[rk] = ws[ks]

        ws_details['details'] = detail_info

        ws_list.append(ws_details)

        #Extract Workspace Users
        if ws.get('users'):
            for ws_users in ws['users']:
                ws_user_details = {}
                detail_info = {}
                details_keys = []

                details_keys = list(set(ws_users.keys()) - set(ws_users_keys_to_extract))

                ws_user_details['workspaceId'] = ws['id']
                ws_user_details['workspaceName'] = ws['name']

                for k in ws_users_keys_to_extract:
                    if ws_users.get(k) is not None:
                        ws_user_details[k] = ws_users[k]
                    else:
                        ws_user_details[k] = ""

                for rk in details_keys:
                    detail_info[rk] = ws_users[rk]

                ws_user_details['details'] = detail_info

                ws_users_list.append(ws_user_details)

        #Extract Items
        for iks in items_keys:
            for it in ws[iks]:
                it_details = {}
                details = {}
                items_details_keys = []

                item_type = iks.capitalize() if iks != "datasets" else "SemanticModel"

                items_details_keys = list(set(it.keys()) - set(items_keys_to_extract + ['users']))

                if item_type == "SemanticModel":
                    items_details_keys = list(set(items_details_keys) - set(items_sm_keys_to_extract))                

                it_details['workspaceId'] = ws['id']
                it_details['workspaceName'] = ws['name']
                it_details['itemType'] = item_type
                
                for iks_to_extract in items_keys_to_extract:
                    if iks_to_extract in ['id','objectId']:
                        if it.get(iks_to_extract):
                            it_details['itemId'] = it[iks_to_extract]
                    elif iks_to_extract in ['name','displayName']:    
                        if item_type == "Dashboards":
                            if it.get('displayName'):
                                it_details['itemName'] = it['displayName']
                            else:
                                it_details['itemName'] = ""
                        else:
                            if it.get('name'):
                                it_details['itemName'] = it['name']
                            else:
                                it_details['itemName'] = ""
                    else:
                        if it.get(iks_to_extract):
                            it_details[iks_to_extract] = it[iks_to_extract]
                        else:
                            it_details[iks_to_extract] = ""
                
                for rest_keys in items_details_keys:
                    details[rest_keys] = it[rest_keys]

                it_details['details'] = details

                items_list.append(it_details)

                #Extract Semantic Model Details in Item
                if iks == 'datasets':
                    it_sm_details = {}

                    it_sm_details['workspaceId'] = ws['id']
                    it_sm_details['workspaceName'] = ws['name']
                    it_sm_details['itemType'] = item_type
                    it_sm_details['itemId'] = it_details['itemId']
                    it_sm_details['itemName'] = it_details['itemName']

                    for k in items_sm_keys_to_extract:
                        if it.get(k):
                            it_sm_details[k] = it[k]
                        else:
                            it_sm_details[k] = ""

                    items_sm_details_list.append(it_sm_details)


                #Extract Users in Item
                if it.get('users'):
                    for it_users in it['users']:
                        it_user_details = {}
                        other_info = {}
                        other_keys = []

                        other_keys = list(set(it_users.keys()) - set(items_users_keys_to_extract) - set(items_users_access_right_keys_to_extract))
                        
                        it_user_details['workspaceId'] = ws['id']
                        it_user_details['workspaceName'] = ws['name']
                        it_user_details['itemType'] = item_type
                        it_user_details['itemId'] = it_details['itemId']
                        it_user_details['itemName'] = it_details['itemName']

                        for k in items_users_keys_to_extract:
                            if it_users.get(k) is not None:
                                it_user_details[k] = it_users[k]
                            else:
                                it_user_details[k] = ""
                        
                        for k in items_users_access_right_keys_to_extract:
                            if it_users.get(k) is not None:
                                it_user_details['userAccessRight'] = it_users[k]

                        for rk in other_keys:
                            other_info[rk] = it_users[rk]

                        it_user_details['details'] = other_info

                        items_users_list.append(it_user_details)

    dfWS = pd.DataFrame(ws_list)
    dfWS["details"] = dfWS["details"].apply(json.dumps)
    dfWS['scanTime'] = pd.Timestamp(scan_time)

    dfWSU = pd.DataFrame(ws_users_list)
    if len(dfWSU.index) > 0:
        dfWSU["details"] = dfWSU["details"].apply(json.dumps)
        dfWSU['scanTime'] = pd.Timestamp(scan_time)

    dfIS = pd.DataFrame(items_list)
    if len(dfIS.index) > 0:
        dfIS["details"] = dfIS["details"].apply(json.dumps)
        dfIS['scanTime'] = pd.Timestamp(scan_time)

    dfISMD = pd.DataFrame(items_sm_details_list)
    if len(dfISMD.index) > 0:
        for k in items_sm_keys_to_extract:
            dfISMD[k] = dfISMD[k].apply(json.dumps)
        dfISMD['scanTime'] = pd.Timestamp(scan_time)

    dfISU = pd.DataFrame(items_users_list)
    if len(dfISU.index) > 0:
        dfISU["details"] = dfISU["details"].apply(json.dumps)
        dfISU['scanTime'] = pd.Timestamp(scan_time)

    return dfWS, dfWSU, dfIS, dfISMD, dfISU

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

def scanner_batch(
    data_source_details: bool,
    dataset_schema: bool,
    dataset_expressions: bool,
    lineage: bool,
    artifact_users: bool,
    workspace: list,
    connection_info: object,
    scan_time: object,
    process: int
    ):
    
    print(f"Start of process Nº {process}")

    try:
        with labs.service_principal_authentication(
            key_vault_uri=connection_info['key_vault_uri'], 
            key_vault_tenant_id=connection_info['key_vault_tenant_id'],
            key_vault_client_id=connection_info['key_vault_client_id'],
            key_vault_client_secret=connection_info['key_vault_client_secret']):
            scan_result = labs.admin.scan_workspaces(data_source_details=data_source_details,dataset_schema=dataset_schema,dataset_expressions=dataset_expressions,lineage=lineage,artifact_users=artifact_users,workspace=workspace)

        if scan_result.get('workspaces'):
            dfWS, dfWSU, dfIS, dfISMD, dfISU = scanner_workspace_result_to_df(scan_result,scan_time)

            if len(dfWS.index)>0:
                kusto_ingest_process(df=dfWS,table_name='WorkspacesHistory',connection_info=connection_info)

            if len(dfWSU.index)>0:
                kusto_ingest_process(df=dfWSU,table_name='WorkspacesUsersHistory',connection_info=connection_info)

            if len(dfIS.index)>0:
                kusto_ingest_process(df=dfIS,table_name='ItemsHistory',connection_info=connection_info)

            if len(dfISMD.index)>0:
                kusto_ingest_process(df=dfISMD,table_name='SemanticModelDetailsHistory',connection_info=connection_info)

            if len(dfISU.index)>0:
                kusto_ingest_process(df=dfISU,table_name='ItemsUsersHistory',connection_info=connection_info)

        if scan_result.get('datasourceInstances'):

            resultString = list(map(json.dumps,scan_result['datasourceInstances']))   
            dfDS = pd.DataFrame(columns=['datasourceInstances','scanTime','misconfigured'])
            dfDS['datasourceInstances'] = pd.Series(resultString)
            dfDS['scanTime'] = pd.Timestamp(scan_time)
            dfDS['misconfigured'] = False

            if len(dfDS.index)>0:
                kusto_ingest_process(df=dfDS,table_name='DatasourceInstancesHistory',connection_info=connection_info)

        if scan_result.get('misconfiguredDatasourceInstances'):

            resultString = list(map(json.dumps,scan_result['misconfiguredDatasourceInstances']))   
            dfMDS = pd.DataFrame(columns=['datasourceInstances','scanTime','misconfigured'])
            dfMDS['misconfiguredDatasourceInstances'] = pd.Series(resultString)
            dfMDS['scanTime'] = pd.Timestamp(scan_time)
            dfMDS['misconfigured'] = True         

            if len(dfMDS.index)>0:
                kusto_ingest_process(df=dfMDS,table_name='DatasourceInstancesHistory',connection_info=connection_info)

        print(f"End of process Nº {process}")

    except (ValueError, TypeError) as e:
        print(f"Error in process Nº {process}: {e}")

    time.sleep(WAIT_TIME)


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

def scanner_process(
        connection_info: object,
    ):


    query_scan_time = f"""
    Workspaces
        | project scanTime
        | summarize scanTime=max(scanTime)
    """

    response_last_scan_time = kusto_query(query=query_scan_time,connection_info=connection_info)

    scan_time = pd.Timestamp.now()

    last_scan_time = None

    if response_last_scan_time.primary_results[0][0]['scanTime'] is not None:
        last_scan_time = response_last_scan_time.primary_results[0][0]['scanTime'].strftime('%Y-%m-%d %H:%M:%S')

    with labs.service_principal_authentication(
            key_vault_uri=connection_info['key_vault_uri'], 
            key_vault_tenant_id=connection_info['key_vault_tenant_id'],
            key_vault_client_id=connection_info['key_vault_client_id'],
            key_vault_client_secret=connection_info['key_vault_client_secret']):
        workspace_ids = labs.admin.list_modified_workspaces(modified_since=last_scan_time)

    if len(workspace_ids) > 0:
        workspace_ids = list(set(workspace_ids["Workspace Id"].tolist()) | set(missing_workspaces(connection_info=connection_info)))
    else:
        workspace_ids = missing_workspaces(connection_info=connection_info)   
        
    number_workspaces = len(workspace_ids)

    print(f"{number_workspaces} Workspaces modified since {last_scan_time}")

    if number_workspaces > 0:
        chunk_size=100
        max_parallel=15
        dataset_expressions=True
        dataset_schema=True
        data_source_details=True
        lineage=True
        artifact_users=True

        """Run parallel scans"""
        chunks = [workspace_ids[i:i + chunk_size] for i in range(0, len(workspace_ids), chunk_size)]
        print(f"Processing {len(chunks)} chunks with max {max_parallel} parallel scans")

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_parallel) as executor:
            futures = {}
            
            for i, chunk in enumerate(chunks[:max_parallel]):
                future = executor.submit(scanner_batch,
                        data_source_details=data_source_details,
                        dataset_schema=dataset_schema,
                        dataset_expressions=dataset_expressions,
                        lineage=lineage,
                        artifact_users=artifact_users,
                        workspace=chunk,
                        connection_info=connection_info,
                        scan_time=scan_time,
                        process=i
                        )
                futures[future] = i
                
            completed = 0
            next_chunk = max_parallel
            while completed < len(chunks):
                done, _ = concurrent.futures.wait(futures.keys(), return_when=concurrent.futures.FIRST_COMPLETED)
                
                for future in done:
                    completed += 1
                    if next_chunk < len(chunks):
                        new_future = executor.submit(scanner_batch,
                                    data_source_details=data_source_details,
                                    dataset_schema=dataset_schema,
                                    dataset_expressions=dataset_expressions,
                                    lineage=lineage,
                                    artifact_users=artifact_users,
                                    workspace=chunks[next_chunk],
                                    connection_info=connection_info,
                                    scan_time=scan_time,
                                    process=next_chunk
                                )
                        futures[new_future] = next_chunk
                        next_chunk += 1
                    del futures[future]

        print(f"Throttle kusto queries -> sleeping {WAIT_TIME} sec")
        time.sleep(WAIT_TIME)



# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Scanner API

# CELL ********************

scanner_process(
    connection_info=connection_info
)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

scanner_kql(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

cleanup_kql(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

workspace = missing_workspaces(connection_info=connection_info)

len(workspace)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }
