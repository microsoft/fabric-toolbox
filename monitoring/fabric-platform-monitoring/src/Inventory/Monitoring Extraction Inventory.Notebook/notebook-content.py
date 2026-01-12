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
import time
import numpy as np
import json
import concurrent.futures

from azure.kusto.data import KustoClient,KustoConnectionStringBuilder
from azure.kusto.data.data_format import DataFormat
from azure.kusto.ingest import (
    KustoStreamingIngestClient,
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

def kusto_ingest_process(df:pd.DataFrame,table_name:str,connection_info:dict):
    
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
    

def kusto_query(query:str,connection_info:dict):
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

def capacities_process(connection_info):
    query_capacities = """
    .set-or-replace Capacities <|
        CapacitiesHistory
        | where scanTime > toscalar(
                Capacities
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(scanTime, CapacityName, Sku, Region, State, Users, Admins) by CapacityId
        | project-reorder CapacityId, CapacityName, Sku, Region, State, Admins, Users, scanTime
    """

    scan_time = pd.Timestamp.now()
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        df = labs.admin.list_capacities()

    df["Admins"]=df["Admins"].apply(json.dumps)
    df['scanTime'] = pd.Timestamp(scan_time)

    df = df[['Capacity Id', 'Capacity Name', 'Sku', 'Region', 'State', 'Admins', 'Users', 'scanTime']]

    if len(df.index) > 0:
        kusto_ingest_process(df=df,table_name='CapacitiesHistory',connection_info=connection_info)
        response_cp = kusto_query(query=query_capacities,connection_info=connection_info)

def apps_process(connection_info):
    query = """
    .set-or-replace Apps <|
        AppsHistory
        | where scanTime > toscalar(
                Apps
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(scanTime, *) by AppId
        | project-reorder
            AppName,
            AppId,
            Description,
            PublishedBy,
            LastUpdate,
            scanTime
    """
    columns = [
        "App Name",
        "App Id",
        "Description",
        "Published By",
        "Last Update",
    ]

    df = pd.DataFrame(columns=columns)
    next = True
    skip = 0
    i = 1

    scan_time = pd.Timestamp.now()
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        while next:
            df_temp = labs.admin.list_apps(top=5000, skip=skip)
            if len(df_temp.index) > 0:
                dfs = [df, df_temp]
                non_empty_dfs = [df for df in dfs if not df.empty]
                df = pd.concat(non_empty_dfs, ignore_index=True)
                skip = i * 5000
                i = i + 1
            else:
                next = False
   
    if df is not None and len(df.index)  > 0:
        df['scanTime'] = pd.Timestamp(scan_time)
        kusto_ingest_process(df=df,table_name='AppsHistory',connection_info=connection_info)

        response = kusto_query(query=query,connection_info=connection_info)

def domain_process(connection_info):
    query_domains = """
    .set-or-replace Domains <|
        DomainsHistory
        | where scanTime > toscalar(
                Domains
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(scanTime, DomainName, Description, ParentDomainID, ContributorsScope) by DomainID
        | project-reorder DomainID, DomainName, Description, ParentDomainID, ContributorsScope, scanTime
    """

    scan_time = pd.Timestamp.now()
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        df = labs.admin.list_domains()
    df['scanTime'] = pd.Timestamp(scan_time)

    if len(df.index) > 0:
        kusto_ingest_process(df=df,table_name='DomainsHistory',connection_info=connection_info)

        response_domains = kusto_query(query=query_domains,connection_info=connection_info)

def tenant_settings_process(connection_info):
    query_tenant_settings = """
    .set-or-replace TenantSettings <|
        TenantSettingsHistory
        | where scanTime > toscalar(
                TenantSettings
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(scanTime, Enabled, CanSpecifySecurityGroups, TenantSettingGroup, EnabledSecurityGroups) by SettingName, Title
        | project-reorder
            SettingName,
            Title,
            Enabled,
            CanSpecifySecurityGroups,
            TenantSettingGroup,
            EnabledSecurityGroups,
            scanTime
    """

    scan_time = pd.Timestamp.now()
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        df = labs.admin.list_tenant_settings()
    df["Enabled Security Groups"]=df["Enabled Security Groups"].apply(json.dumps)
    df['scanTime'] = pd.Timestamp(scan_time)

    if len(df.index) > 0:
        kusto_ingest_process(df=df,table_name='TenantSettingsHistory',connection_info=connection_info)

        response_ts = kusto_query(query=query_tenant_settings,connection_info=connection_info)

def capacity_delegated_settings_process(connection_info):
    query_capacity_delegated_settings = """
    .set-or-replace CapacityDelegatedSettings <|
        CapacityDelegatedSettingsHistory
        | where scanTime > toscalar(
                CapacityDelegatedSettings
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(scanTime, SettingEnabled, CanSpecifySecurityGroups, EnabledSecurityGroups, TenantSettingGroup, TenantSettingProperties, DelegateToWorkspace, DelegatedFrom) by CapacityId, SettingName, SettingTitle
        | project-reorder
            CapacityId,
            SettingName,
            SettingTitle,
            SettingEnabled,
            CanSpecifySecurityGroups,
            EnabledSecurityGroups,
            TenantSettingGroup,
            TenantSettingProperties,
            DelegateToWorkspace,
            DelegatedFrom,
            scanTime
    """
    scan_time = pd.Timestamp.now()
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        df = labs.admin.list_capacity_tenant_settings_overrides()
    
    if df is not None and len(df.index) > 0:
        df["Enabled Security Groups"]=df["Enabled Security Groups"].apply(json.dumps)
        df["Tenant Setting Properties"]=df["Tenant Setting Properties"].apply(json.dumps)
        df['scanTime'] = pd.Timestamp(scan_time)

        kusto_ingest_process(df=df,table_name='CapacityDelegatedSettingsHistory',connection_info=connection_info)

        response_cds = kusto_query(query=query_capacity_delegated_settings,connection_info=connection_info)

def domain_delegated_settings_process(connection_info):
    query = """
    .set-or-replace DomainDelegatedSettings <|
        DomainDelegatedSettingsHistory
        | where scanTime > toscalar(
                DomainDelegatedSettings
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(scanTime, *) by DomainId, SettingName
        | project-reorder
            DomainId,
            SettingName,
            Title,
            Enabled,
            CanSpecifySecurityGroups,
            EnabledSecurityGroups,
            TenantSettingGroup,
            DelegatedToWorkspace,
            DelegatedFrom,
            scanTime
    """
    scan_time = pd.Timestamp.now()
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        df = labs.admin.list_domain_tenant_settings_overrides()
    
    if df is not None and len(df.index)  > 0:
        df["Enabled Security Groups"]=df["Enabled Security Groups"].apply(json.dumps)
        df['scanTime'] = pd.Timestamp(scan_time)
        
        kusto_ingest_process(df=df,table_name='DomainDelegatedSettingsHistory',connection_info=connection_info)

        response = kusto_query(query=query,connection_info=connection_info)

def workshop_delegated_settings_process(connection_info):
    query = """
    .set-or-replace WorkspaceDelegatedSettings <|
        WorkspaceDelegatedSettingsHistory
        | where scanTime > toscalar(
                WorkspaceDelegatedSettings
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(scanTime, *) by WorkspaceId, SettingName
        | project-reorder
            WorkspaceId,
            SettingName,
            Title,
            Enabled,
            CanSpecifySecurityGroups,
            EnabledSecurityGroups,
            TenantSettingGroup,
            DelegatedFrom,
            scanTime
    """
    scan_time = pd.Timestamp.now()
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        df = labs.admin.list_workspaces_tenant_settings_overrides()
    
    if df is not None and len(df.index)  > 0:
        df["Enabled Security Groups"]=df["Enabled Security Groups"].apply(json.dumps)
        df['scanTime'] = pd.Timestamp(scan_time)
        kusto_ingest_process(df=df,table_name='WorkspaceDelegatedSettingsHistory',connection_info=connection_info)

        response = kusto_query(query=query,connection_info=connection_info)

def gateway_process(connection_info):
    query_gateways = """
    .set-or-replace Gateways <|
        GatewaysHistory
        | where scanTime > toscalar(
                Gateways
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(scanTime, gatewayName,type,publicKeyExponent,publicKeyModulus,version,numberOfMemebers,loadBalancingSetting,allowCloudConnectionRefresh,allowCustomConnectors) by gatewayId
        | project-reorder gatewayName,gatewayId,type,publicKeyExponent,publicKeyModulus,version,numberOfMemebers,loadBalancingSetting,allowCloudConnectionRefresh,allowCustomConnectors,scanTime
    """

    query_gateway_memebers = """
    .set-or-replace GatewayMembers <|
        GatewayMembersHistory
        | where scanTime > toscalar(
                GatewayMembers
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(scanTime, memberName, publicKeyExponent, publicKeyModulus, version, memberEnabled) by gatewayId, memberId
        | project-reorder gatewayId, memberId, memberName, publicKeyExponent, publicKeyModulus, version, memberEnabled, scanTime
    """

    scan_time = pd.Timestamp.now()
    columns = ['Gateway Id','Member Id', 'Member Name', 'Public Key Exponent', 'Public Key Modulus','Version', 'Enabled']
    dfGWM = pd.DataFrame(columns=columns)
    
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        dfGW = labs.list_gateways()

        for gId in dfGW['Gateway Id']:
            dfGWM_temp = labs.list_gateway_members(gId)
            dfGWM_temp['Gateway Id'] = gId
            dfGWM = pd.concat([dfGWM,dfGWM_temp[columns]],ignore_index=True)

    if len(dfGW.index) > 0:
        dfGW['scanTime'] = scan_time
        kusto_ingest_process(df=dfGW,table_name='GatewaysHistory',connection_info=connection_info)

        response_cp = kusto_query(query=query_gateways,connection_info=connection_info)

        if len(dfGWM.index) > 0:
            dfGWM['dfGW'] = scan_time
            kusto_ingest_process(df=dfGWM,table_name='GatewayMembersHistory',connection_info=connection_info)

            response_cp = kusto_query(query=query_gateway_memebers,connection_info=connection_info)

def connections_process(connection_info):
    query_connections = """
    .set-or-replace Connections <|
        ConnectionsHistory
        | where scanTime > toscalar(
                Connections
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(
                    scanTime,
                    connectionName,
                    gatewayId,
                    connectivityType,
                    connectionPath,
                    connectionType,
                    privacyLevel,
                    credentialType,
                    singleSignOnType,
                    connectionEncryption,
                    skipTestConnection
                )
            by connectionId
        | project-reorder
            connectionId,
            connectionName,
            gatewayId,
            connectivityType,
            connectionPath,
            connectionType,
            privacyLevel,
            credentialType,
            singleSignOnType,
            connectionEncryption,
            skipTestConnection,
            scanTime
    """

    scan_time = pd.Timestamp.now()
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        df = labs.list_connections()
    df['scanTime'] = pd.Timestamp(scan_time)

    if len(df.index) > 0:
        kusto_ingest_process(df=df,table_name='ConnectionsHistory',connection_info=connection_info)

        response_cp = kusto_query(query=query_connections,connection_info=connection_info)

def git_connections_process(connection_info):
    query_connections = """
    .set-or-replace GitConnections <|
        GitConnectionsHistory
        | where scanTime > toscalar(
                GitConnections
                | project scanTime
                | summarize scantime=iff(isempty(max(scanTime)), datetime('2020-01-01'), max(scanTime))
            )
        | summarize arg_max(
                    scanTime,
                    *
                )
            by ['Workspace Id']
        | project-reorder
            ['Workspace Id'],
            ['Workspace Name'],
            ['Organization Name'],
            ['Owner Name'],
            ['Project Name'],
            ['Git Provider Type'],
            ['Repository Name'],
            ['Branch Name'],
            ['Directory Name'],
            scanTime
    """

    scan_time = pd.Timestamp.now()
    with labs.service_principal_authentication(
        key_vault_uri=connection_info['key_vault_uri'], 
        key_vault_tenant_id=connection_info['key_vault_tenant_id'],
        key_vault_client_id=connection_info['key_vault_client_id'],
        key_vault_client_secret=connection_info['key_vault_client_secret']):
        df = labs.admin.list_git_connections()
    df['scanTime'] = pd.Timestamp(scan_time)

    if len(df.index) > 0:
        kusto_ingest_process(df=df,table_name='GitConnectionsHistory',connection_info=connection_info)

        response = kusto_query(query=query_connections,connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Capacities

# CELL ********************

capacities_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Apps

# CELL ********************

apps_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Domains

# CELL ********************

domain_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Tenant Settings

# CELL ********************

tenant_settings_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Workspace Settings

# CELL ********************

workshop_delegated_settings_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Capacity Delegated Settings

# CELL ********************

capacity_delegated_settings_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Domain Delegated Settings

# CELL ********************

domain_delegated_settings_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Gateways Inventory

# CELL ********************

gateway_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Connections

# CELL ********************

connections_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# MARKDOWN ********************

# ## Git Connections

# CELL ********************

git_connections_process(connection_info=connection_info)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }
