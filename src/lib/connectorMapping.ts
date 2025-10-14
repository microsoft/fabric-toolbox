/**
 * Comprehensive mapping between ADF LinkedService types and Fabric Connector types
 */
export const ADF_TO_FABRIC_TYPE_MAP: Record<string, string> = {
  // SQL databases
  'SqlServer': 'SqlServer',
  'AzureSqlDatabase': 'SQL',
  'AzureSqlMI': 'SQL',
  'AzureSqlDW': 'SQL',
  'MySql': 'MySQL',
  'AzureMySql': 'MySQL',
  'PostgreSql': 'PostgreSQL',
  'AzurePostgreSql': 'PostgreSQL',
  'Oracle': 'SQL',
  'Db2': 'SQL',
  'Sybase': 'SQL',
  'Teradata': 'SQL',
  'Informix': 'SQL',
  'Odbc': 'ODBC',

  // Azure Storage
  'AzureBlobStorage': 'AzureBlobs',
  'AzureDataLakeStore': 'AzureDataLakeStorage',
  'AzureDataLakeStoreGen2': 'AzureDataLakeStorage',
  'AzureFileStorage': 'AzureFiles',
  'AzureTableStorage': 'AzureTables',

  // Web and REST
  'RestService': 'RestService',
  'WebTable': 'Web',
  'HttpServer': 'Web',
  'Http': 'Web',
  'Web': 'Web',
  'OData': 'OData',

  // SharePoint and Office 365
  'SharePointOnlineList': 'SharePointOnlineList',
  'Office365': 'Office365Outlook',

  // Azure Services
  'AzureFunction': 'AzureFunction',
  'AzureServiceBus': 'AzureServiceBus',
  'AzureSearch': 'AzureAISearch',
  'AzureDataExplorer': 'AzureDataExplorer',
  'AzureKeyVault': 'AzureKeyVault',
  'EventHub': 'EventHub',

  // Cloud platforms
  'AmazonS3': 'AmazonS3',
  'GoogleCloudStorage': 'GoogleCloudStorage',
  'Snowflake': 'Snowflake',
  'Databricks': 'Databricks',

  // CRM and ERP
  'Dynamics': 'DynamicsCrm',
  'DynamicsCrm': 'DynamicsCrm',
  'DynamicsAX': 'DynamicsAX',
  'Salesforce': 'Salesforce',
  'CommonDataServiceForApps': 'CommonDataServiceForApps',

  // Analytics and BI
  'GoogleAnalytics': 'GoogleAnalytics',
  'AzureDataLakeAnalytics': 'AzureDataLakeAnalytics',
  'AmazonRedshift': 'AmazonRedshift',

  // Development and collaboration
  'GitHub': 'GitHub',
  'Tfs': 'VSTS',

  // Generic fallback
  'CustomDataSource': 'Generic'
};

/**
 * Connection details field mapping for different connector types
 */
export const CONNECTION_DETAILS_FIELD_MAPPING: Record<string, Record<string, string[]>> = {
  // SQL-based connectors
  'SQL': {
    'server': ['server', 'serverName'],
    'database': ['database', 'databaseName']
  },
  'SqlServer': {
    'server': ['server', 'serverName'],
    'database': ['database', 'databaseName']
  },
  'MySQL': {
    'server': ['server', 'serverName'],
    'database': ['database', 'databaseName']
  },
  'PostgreSQL': {
    'server': ['server', 'serverName'],
    'database': ['database', 'databaseName']
  },

  // Web-based connectors
  'Web': {
    'url': ['url', 'baseUrl', 'serviceUri']
  },
  'RestService': {
    'url': ['url', 'baseUrl', 'serviceUri']
  },
  'OData': {
    'url': ['url', 'baseUrl', 'serviceUri']
  },

  // Azure Storage connectors
  'AzureBlobs': {
    'account': ['accountName', 'storageAccount']
  },
  'AzureDataLakeStorage': {
    'account': ['accountName', 'storageAccount']
  },
  'AzureFiles': {
    'account': ['accountName', 'storageAccount']
  },

  // SharePoint and Office 365
  'SharePointOnlineList': {
    'sharePointSiteUrl': ['siteUrl', 'url', 'baseUrl']
  },

  // Azure Data Explorer
  'AzureDataExplorer': {
    'cluster': ['endpoint', 'clusterUri'],
    'database': ['database', 'databaseName']
  },

  // Databricks
  'Databricks': {
    'httpPath': ['httpPath', 'path']
  }
};

/**
 * Map ADF LinkedService type to Fabric connector type
 */
export function mapADFToFabricConnectorType(adfLinkedServiceType: string): string {
  if (!adfLinkedServiceType || typeof adfLinkedServiceType !== 'string') {
    return 'Generic';
  }

  // Direct mapping lookup
  const fabricType = ADF_TO_FABRIC_TYPE_MAP[adfLinkedServiceType];
  if (fabricType) {
    return fabricType;
  }

  // Try case-insensitive lookup
  const adfTypeLower = adfLinkedServiceType.toLowerCase();
  for (const [adfType, fabricType] of Object.entries(ADF_TO_FABRIC_TYPE_MAP)) {
    if (adfType.toLowerCase() === adfTypeLower) {
      return fabricType;
    }
  }

  // Try partial matching for variations
  for (const [adfType, fabricType] of Object.entries(ADF_TO_FABRIC_TYPE_MAP)) {
    if (adfLinkedServiceType.includes(adfType) || adfType.includes(adfLinkedServiceType)) {
      return fabricType;
    }
  }

  return 'Generic';
}

/**
 * Check if a connector type is supported by checking against the mapping
 */
export function isConnectorTypeSupported(adfType: string): boolean {
  const fabricType = mapADFToFabricConnectorType(adfType);
  return fabricType !== 'Generic';
}

/**
 * Get connection details field mapping for a connector type
 */
export function getConnectionDetailsMapping(fabricConnectorType: string): Record<string, string[]> {
  return CONNECTION_DETAILS_FIELD_MAPPING[fabricConnectorType] || {};
}

/**
 * Build connection details for a specific connector type from ADF linked service properties
 */
export function buildConnectionDetailsFromADF(
  fabricConnectorType: string,
  adfLinkedService: any
): Record<string, any> {
  const connectionDetails: Record<string, any> = {};
  const typeProperties = adfLinkedService?.properties?.typeProperties || {};
  
  // Get field mapping for this connector type
  const fieldMapping = getConnectionDetailsMapping(fabricConnectorType);
  
  // Map fields from ADF to Fabric format
  for (const [fabricField, adfFields] of Object.entries(fieldMapping)) {
    const value = extractFieldValueFromADF(typeProperties, adfFields);
    if (value !== undefined) {
      connectionDetails[fabricField] = value;
    }
  }
  
  // If no specific mapping found, try common properties
  if (Object.keys(connectionDetails).length === 0) {
    const commonProps = ['url', 'server', 'database', 'connectionString', 'account'];
    for (const prop of commonProps) {
      if (typeProperties[prop] !== undefined) {
        connectionDetails[prop] = typeProperties[prop];
      }
    }
  }

  return connectionDetails;
}

/**
 * Extract field value from ADF linked service properties
 */
function extractFieldValueFromADF(
  typeProperties: any,
  fieldMappings: string[]
): any {
  for (const mappedField of fieldMappings) {
    if (typeProperties[mappedField] !== undefined) {
      return typeProperties[mappedField];
    }
    
    // Try variations of the field name
    const variations = [
      mappedField.toLowerCase(),
      mappedField.toUpperCase(),
      mappedField.charAt(0).toUpperCase() + mappedField.slice(1).toLowerCase()
    ];
    
    for (const variation of variations) {
      if (typeProperties[variation] !== undefined) {
        return typeProperties[variation];
      }
    }
  }
  
  return undefined;
}