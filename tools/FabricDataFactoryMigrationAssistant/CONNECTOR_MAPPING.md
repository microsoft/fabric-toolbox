# Connector Mapping Guide

This document provides comprehensive information about mapping Azure Data Factory (ADF) Linked Services to Microsoft Fabric Connections.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Supported Connectors](#supported-connectors)
- [Gateway Requirements](#gateway-requirements)
- [Authentication Methods](#authentication-methods)
- [Mapping Details](#mapping-details)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Pipeline to Fabric Upgrader automatically maps ADF Linked Services to their equivalent Fabric Connection types. This document provides detailed information about supported connectors, authentication methods, and special considerations.

### Mapping Process

1. **Auto-Detection**: Application analyzes Linked Service `type` field
2. **Type Mapping**: Maps to equivalent Fabric connector type
3. **Property Transformation**: Converts connection properties to Fabric format
4. **Authentication Conversion**: Maps authentication methods (e.g., Managed Identity → Workspace Identity)
5. **Gateway Selection**: Determines if on-premises gateway is required

---

## Supported Connectors

### Cloud Databases

| ADF Linked Service Type | Fabric Connection Type | Auth Methods | Gateway | Notes |
|-------------------------|------------------------|--------------|---------|-------|
| `AzureSqlDatabase` | `AzureSqlDatabase` | SQL Auth, Managed Identity, Service Principal | No | Direct mapping |
| `AzureSqlDW` | `AzureSynapseAnalytics` | SQL Auth, Managed Identity, Service Principal | No | Synapse SQL Pool |
| `AzureSqlMI` | `AzureSqlManagedInstance` | SQL Auth, Managed Identity | No | Azure SQL Managed Instance |
| `AzurePostgreSql` | `PostgreSql` | Basic Auth, Managed Identity | No | Azure Database for PostgreSQL |
| `AzureMySql` | `MySql` | Basic Auth, Managed Identity | No | Azure Database for MySQL |
| `CosmosDb` | `CosmosDb` | Key, Managed Identity | No | All API types supported |
| `AzureTableStorage` | `AzureTableStorage` | Key, Managed Identity | No | Azure Table Storage |
| `AzureDataExplorer` | `AzureDataExplorer` | Service Principal, Managed Identity | No | Azure Data Explorer (Kusto) |

### Cloud Storage

| ADF Linked Service Type | Fabric Connection Type | Auth Methods | Gateway | Notes |
|-------------------------|------------------------|--------------|---------|-------|
| `AzureBlobStorage` | `AzureBlobStorage` | Key, SAS, Managed Identity | No | Azure Blob Storage |
| `AzureBlobFS` | `AzureDataLakeStorageGen2` | Key, Managed Identity, Service Principal | No | ADLS Gen2 |
| `AzureDataLakeStore` | `AzureDataLakeStorageGen1` | Service Principal, Managed Identity | No | ADLS Gen1 (legacy) |
| `AzureFileStorage` | `AzureFileStorage` | Key, SAS | No | Azure Files |
| `AmazonS3` | `AmazonS3` | Access Key | No | Amazon S3 |
| `GoogleCloudStorage` | `GoogleCloudStorage` | Service Account Key | No | Google Cloud Storage |

### On-Premises Databases

| ADF Linked Service Type | Fabric Connection Type | Auth Methods | Gateway | Notes |
|-------------------------|------------------------|--------------|---------|-------|
| `SqlServer` | `SqlServer` | SQL Auth, Windows Auth | **Yes** | For on-premises SQL Server |
| `Oracle` | `Oracle` | Basic Auth | **Yes** | Oracle Database |
| `MySql` | `MySql` | Basic Auth | **Yes** | On-premises MySQL |
| `PostgreSql` | `PostgreSql` | Basic Auth | **Yes** | On-premises PostgreSQL |
| `Db2` | `Db2` | Basic Auth | **Yes** | IBM Db2 |
| `Teradata` | `Teradata` | Basic Auth | **Yes** | Teradata |
| `Sybase` | `Sybase` | Basic Auth | **Yes** | SAP Sybase |
| `Informix` | `Informix` | Basic Auth | **Yes** | IBM Informix |
| `Odbc` | `Odbc` | Basic Auth, Windows Auth | **Yes** | Generic ODBC |
| `OleDb` | `OleDb` | Basic Auth, Windows Auth | **Yes** | Generic OLE DB |

### Data Warehouses

| ADF Linked Service Type | Fabric Connection Type | Auth Methods | Gateway | Notes |
|-------------------------|------------------------|--------------|---------|-------|
| `AzureDatabricks` | `Databricks` | Access Token, Managed Identity | No | Azure Databricks |
| `Snowflake` | `Snowflake` | Basic Auth, Key Pair Auth, OAuth | No | Snowflake Data Warehouse |
| `AmazonRedshift` | `AmazonRedshift` | Basic Auth | No | Amazon Redshift |
| `GoogleBigQuery` | `GoogleBigQuery` | Service Account, OAuth | No | Google BigQuery |

### SaaS Applications

| ADF Linked Service Type | Fabric Connection Type | Auth Methods | Gateway | Notes |
|-------------------------|------------------------|--------------|---------|-------|
| `Dynamics` | `Dynamics365` | Office365, Service Principal | No | Dynamics 365 |
| `DynamicsAX` | `Dynamics365` | Service Principal | No | Dynamics AX |
| `DynamicsCrm` | `Dynamics365` | Office365, OAuth | No | Dynamics CRM |
| `Salesforce` | `Salesforce` | Basic Auth, OAuth 2.0 | No | Salesforce |
| `ServiceNow` | `ServiceNow` | Basic Auth, OAuth 2.0 | No | ServiceNow |
| `SapTable` | `SapTable` | Basic Auth | **Maybe** | SAP ECC via Table |
| `SapHana` | `SapHana` | Basic Auth | **Maybe** | SAP HANA Database |
| `SapOpenHub` | `SapOpenHub` | Basic Auth | **Maybe** | SAP BW Open Hub |
| `SapBW` | `SapBW` | Basic Auth | **Maybe** | SAP Business Warehouse |
| `SapCloudForCustomer` | `SapCloudForCustomer` | Basic Auth | No | SAP C4C |
| `SapEcc` | `SapEcc` | Basic Auth | **Maybe** | SAP ECC |
| `SharePointOnlineList` | `SharePointOnlineList` | OAuth 2.0 | No | SharePoint Online Lists |
| `Office365` | `Office365` | OAuth 2.0 | No | Office 365 Outlook |

### File Systems

| ADF Linked Service Type | Fabric Connection Type | Auth Methods | Gateway | Notes |
|-------------------------|------------------------|--------------|---------|-------|
| `FileServer` | `FileSystem` | Windows Auth, Anonymous | **Yes** | Windows/Linux file share |
| `FtpServer` | `Ftp` | Basic Auth, Anonymous | **Maybe** | FTP server |
| `Sftp` | `Sftp` | Basic Auth, SSH Key | **Maybe** | SSH File Transfer Protocol |
| `Hdfs` | `Hdfs` | Basic Auth, Windows Auth | **Maybe** | Hadoop Distributed File System |

### Other Services

| ADF Linked Service Type | Fabric Connection Type | Auth Methods | Gateway | Notes |
|-------------------------|------------------------|--------------|---------|-------|
| `RestService` | `RestApi` | Anonymous, Basic, OAuth 2.0, API Key | No | Generic REST API |
| `HttpServer` | `Web` | Anonymous, Basic, OAuth 2.0 | No | HTTP/HTTPS endpoints |
| `OData` | `OData` | Anonymous, Basic, OAuth 2.0 | No | OData services |
| `WebTable` | `Web` | Anonymous, Basic | No | Web page tables |
| `AzureKeyVault` | `AzureKeyVault` | Service Principal, Managed Identity | No | Azure Key Vault |
| `AzureSearch` | `AzureSearch` | Key | No | Azure Cognitive Search |

---

## Gateway Requirements

### Virtual Network Gateway

**When Required**:
- Resources in Azure Virtual Network (VNet)
- Private endpoints
- VNet-integrated services

**Configuration**:
- Created automatically in Fabric workspace
- Uses Azure AD authentication
- No manual installation required

### On-Premises Data Gateway

**When Required**:
- On-premises data sources
- Resources not accessible via public internet
- Corporate network data sources

**Configuration**:
- Must be installed on on-premises machine
- Registered in Fabric workspace
- Selected during connection deployment

### Gateway Decision Logic

```
Is data source in Azure cloud?
├─ Yes
│  └─ Is it in a VNet?
│     ├─ Yes → Virtual Network Gateway required
│     └─ No → No gateway required
└─ No (on-premises)
   └─ On-Premises Data Gateway required
```

---

## Authentication Methods

### Azure AD Authentication

#### Managed Identity (ADF) → Workspace Identity (Fabric)

**ADF Configuration**:
```json
{
  "type": "AzureSqlDatabase",
  "typeProperties": {
    "connectionString": "Server=myserver.database.windows.net;Database=mydb;",
    "authenticationType": "ManagedIdentity"
  }
}
```

**Fabric Configuration** (after transformation):
```json
{
  "connectorType": "AzureSqlDatabase",
  "connectionDetails": {
    "server": "myserver.database.windows.net",
    "database": "mydb",
    "authenticationType": "WorkspaceIdentity"
  }
}
```

**Post-Migration Steps**:
1. Grant Fabric Workspace Identity same permissions as ADF Managed Identity
2. Update firewall rules to allow Workspace Identity
3. Test connection in Fabric

#### Service Principal

**ADF Configuration**:
```json
{
  "type": "AzureDataLakeStore",
  "typeProperties": {
    "dataLakeStoreUri": "https://mydatalake.azuredatalakestore.net",
    "servicePrincipalId": "app-id-here",
    "servicePrincipalKey": {
      "type": "SecureString",
      "value": "secret-here"
    },
    "tenant": "tenant-id-here"
  }
}
```

**Fabric Configuration**:
```json
{
  "connectorType": "AzureDataLakeStorageGen1",
  "connectionDetails": {
    "url": "https://mydatalake.azuredatalakestore.net",
    "authenticationType": "ServicePrincipal",
    "servicePrincipalId": "app-id-here",
    "servicePrincipalKey": "secret-here",
    "tenantId": "tenant-id-here"
  }
}
```

### SQL Authentication

**ADF Configuration**:
```json
{
  "type": "SqlServer",
  "typeProperties": {
    "connectionString": "Server=myserver;Database=mydb;User ID=myuser;Password=****;",
    "authenticationType": "SqlAuthentication"
  }
}
```

**Fabric Configuration**:
```json
{
  "connectorType": "SqlServer",
  "connectionDetails": {
    "server": "myserver",
    "database": "mydb",
    "authenticationType": "Basic",
    "username": "myuser",
    "password": "****"
  },
  "gatewayId": "gateway-id-here"
}
```

### Key-Based Authentication

**ADF Configuration**:
```json
{
  "type": "AzureBlobStorage",
  "typeProperties": {
    "connectionString": "DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=****;",
    "authenticationType": "AccountKey"
  }
}
```

**Fabric Configuration**:
```json
{
  "connectorType": "AzureBlobStorage",
  "connectionDetails": {
    "accountName": "myaccount",
    "authenticationType": "Key",
    "accountKey": "****"
  }
}
```

---

## Mapping Details

### Connection Property Transformation

#### Azure SQL Database Example

**ADF Linked Service**:
```json
{
  "name": "AzureSqlDatabase1",
  "type": "Microsoft.DataFactory/factories/linkedservices",
  "properties": {
    "type": "AzureSqlDatabase",
    "typeProperties": {
      "connectionString": "Integrated Security=False;Encrypt=True;Connection Timeout=30;Data Source=myserver.database.windows.net;Initial Catalog=mydb;",
      "authenticationType": "ManagedIdentity"
    }
  }
}
```

**Fabric Connection** (transformed):
```json
{
  "displayName": "AzureSqlDatabase1",
  "connectorType": "AzureSqlDatabase",
  "connectionDetails": {
    "server": "myserver.database.windows.net",
    "database": "mydb",
    "authenticationType": "WorkspaceIdentity",
    "encrypt": true,
    "connectionTimeout": 30
  },
  "privacyLevel": "Organizational"
}
```

#### Azure Data Lake Storage Gen2 Example

**ADF Linked Service**:
```json
{
  "name": "AzureDataLakeStorageGen2",
  "type": "Microsoft.DataFactory/factories/linkedservices",
  "properties": {
    "type": "AzureBlobFS",
    "typeProperties": {
      "url": "https://mystorage.dfs.core.windows.net",
      "authenticationType": "ManagedIdentity"
    }
  }
}
```

**Fabric Connection** (transformed):
```json
{
  "displayName": "AzureDataLakeStorageGen2",
  "connectorType": "AzureDataLakeStorageGen2",
  "connectionDetails": {
    "accountName": "mystorage",
    "authenticationType": "WorkspaceIdentity"
  },
  "privacyLevel": "Organizational"
}
```

### Privacy Levels

| Privacy Level | Description | Use Case |
|---------------|-------------|----------|
| **Public** | Data source is publicly accessible | Public APIs, open datasets |
| **Organizational** | Data within your organization | Corporate databases, internal APIs |
| **Private** | Highly sensitive data | Personal data, confidential information |

**Default**: `Organizational` (for most enterprise scenarios)

---

## Troubleshooting

### Common Issues

#### Issue: "Connector type not supported"

**Cause**: ADF Linked Service type doesn't have a Fabric equivalent

**Solution**:
1. Check if connector is in supported list above
2. For unsupported connectors:
   - Use "Skip" option during mapping
   - Create connection manually in Fabric
   - Update pipeline activities to reference manual connection

#### Issue: "Authentication failed"

**Cause**: Credentials not configured correctly

**Solution**:
1. **For Managed Identity**:
   - Grant Workspace Identity same permissions as ADF Managed Identity
   - Update SQL Server / resource firewall rules
   - Add Workspace Identity to Azure AD groups (if applicable)

2. **For Service Principal**:
   - Verify Client ID and Secret are correct
   - Check secret hasn't expired
   - Ensure Service Principal has required permissions

3. **For SQL Auth**:
   - Verify username and password
   - Check if SQL Server allows SQL authentication
   - Test connection from Fabric UI

#### Issue: "Gateway required but not found"

**Cause**: On-premises gateway not configured

**Solution**:
1. Install On-Premises Data Gateway on a machine in your network
2. Register gateway in Fabric workspace
3. Select gateway during connection deployment
4. Test gateway connectivity

#### Issue: "Connection string parsing failed"

**Cause**: Invalid or unsupported connection string format

**Solution**:
1. Verify connection string syntax
2. Check for special characters (escape if needed)
3. Remove unsupported parameters
4. Use structured format (server, database, etc.) instead of connection string

### Best Practices

#### Security

1. **Use Managed Identity** (Workspace Identity in Fabric) whenever possible
2. **Rotate secrets** regularly for Service Principal authentication
3. **Use Key Vault** for storing secrets (reference in ADF/Fabric)
4. **Minimize permissions** - grant only what's needed
5. **Enable encryption** - use SSL/TLS for database connections

#### Performance

1. **Select appropriate gateway location** - close to data source
2. **Use direct connectivity** when possible (avoid gateway overhead)
3. **Test connections** before migration
4. **Monitor gateway performance** after migration

#### Organization

1. **Use consistent naming** for connections
2. **Document authentication methods** for each connection
3. **Group related connections** using folders
4. **Tag connections** with environment (dev/test/prod)

---

## Connector Mapping Reference

### Quick Lookup Table

| ADF Type Prefix | Fabric Type |
|-----------------|-------------|
| `Azure*` | Usually maps to equivalent `Azure*` type |
| `Amazon*` | Maps to `Amazon*` type |
| `Google*` | Maps to `Google*` type |
| `Sap*` | Maps to `Sap*` type |
| `*Server` | Usually maps to same name |
| `Rest*` | Maps to `RestApi` or `RestService` |
| `Http*` | Maps to `Web` or `HttpSource` |

### Unsupported Connectors

The following ADF connectors are not currently supported in Fabric:

- **Data Flow** (use Fabric Dataflow Gen2 instead)
- **SSIS** (use alternative transformation approach)
- **HDInsight** (limited support, use Fabric Spark)

For unsupported connectors:
1. Skip during migration
2. Manually create equivalent in Fabric
3. Update activities to use manual connection

---

## Additional Resources

- [Microsoft Fabric Documentation](https://learn.microsoft.com/fabric/)
- [Fabric REST API Reference](https://learn.microsoft.com/rest/api/fabric/)
- [Azure Data Factory Documentation](https://learn.microsoft.com/azure/data-factory/)

---

*Last Updated: October 13, 2025*
