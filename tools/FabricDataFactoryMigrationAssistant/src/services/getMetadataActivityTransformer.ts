import { adfParserService } from './adfParserService';

/**
 * Service for transforming ADF GetMetadata activities to Fabric format
 * Converts typeProperties.dataset to datasetSettings with externalReferences
 */
export class GetMetadataActivityTransformer {
  /**
   * Transforms an ADF GetMetadata activity to Fabric format
   * @param activity The ADF GetMetadata activity
   * @param pipelineConnectionMappings The OLD format connection mappings
   * @param pipelineReferenceMappings The NEW format reference mappings
   * @param pipelineName The current pipeline name
   * @returns The transformed Fabric GetMetadata activity
   */
  transformGetMetadataActivity(
    activity: any,
    pipelineConnectionMappings?: any,
    pipelineReferenceMappings?: Record<string, Record<string, string>>,
    pipelineName?: string
  ): any {
    if (!activity || activity.type !== 'GetMetadata') {
      return activity;
    }

    console.log(`Transforming GetMetadata activity: ${activity.name}`);

    // Extract dataset reference from typeProperties.dataset
    const datasetRef = activity.typeProperties?.dataset?.referenceName;
    if (!datasetRef) {
      console.warn(`GetMetadata activity '${activity.name}' has no dataset reference - returning unchanged`);
      return activity;
    }

    // Get dataset definition from parser
    const dataset = adfParserService.getDatasetByName(datasetRef);
    if (!dataset) {
      console.error(`Dataset '${datasetRef}' not found for GetMetadata activity '${activity.name}'`);
      return activity;
    }

    // Extract dataset parameters from the activity reference
    const datasetParameters = activity.typeProperties.dataset.parameters || {};

    // Get LinkedService name from dataset
    const linkedServiceName = dataset.definition?.properties?.linkedServiceName?.referenceName;
    const datasetType = dataset.definition?.properties?.type;

    console.log(`GetMetadata activity '${activity.name}' dataset info:`, {
      datasetName: datasetRef,
      datasetType,
      linkedServiceName,
      hasParameters: Object.keys(datasetParameters).length > 0
    });

    console.log(`Looking up connection for GetMetadata activity '${activity.name}':`, {
      linkedServiceName,
      pipelineName,
      activityName: activity.name,
      expectedReferenceId: pipelineName && activity.name ? `${pipelineName}_${activity.name}_dataset` : 'N/A',
      hasPipelineConnectionMappings: Boolean(pipelineConnectionMappings),
      hasPipelineReferenceMappings: Boolean(pipelineReferenceMappings),
      availableReferenceMappings: pipelineReferenceMappings && pipelineName ? 
        Object.keys(pipelineReferenceMappings[pipelineName] || {}) : [],
      availableOldMappings: pipelineConnectionMappings && pipelineName ?
        Object.keys(pipelineConnectionMappings[pipelineName] || {}) : []
    });

    // Get connection ID for the LinkedService
    const connectionId = this.getConnectionIdForLinkedService(
      linkedServiceName,
      pipelineConnectionMappings,
      pipelineReferenceMappings,
      pipelineName,
      activity.name
    );

    console.log(`Connection lookup result for '${activity.name}':`, {
      connectionId: connectionId || 'NOT FOUND',
      willHaveExternalReferences: Boolean(connectionId)
    });

    // Build datasetSettings from dataset definition
    const datasetSettings = this.createDatasetSettingsFromDefinition(
      dataset,
      datasetParameters,
      linkedServiceName,
      connectionId
    );

    // Build transformed typeProperties
    const transformedTypeProperties: any = {
      datasetSettings,  // Add Fabric datasetSettings
      fieldList: activity.typeProperties.fieldList || []
    };

    // Remove ADF dataset reference
    delete transformedTypeProperties.dataset;

    console.log(`✅ GetMetadata activity '${activity.name}' transformed successfully`, {
      hasDatasetSettings: Boolean(transformedTypeProperties.datasetSettings),
      hasExternalReferences: Boolean(transformedTypeProperties.datasetSettings?.externalReferences),
      connectionId,
      fieldListCount: transformedTypeProperties.fieldList.length
    });

    return {
      ...activity,
      typeProperties: transformedTypeProperties
    };
  }

  /**
   * Creates datasetSettings from ADF dataset definition
   */
  private createDatasetSettingsFromDefinition(
    datasetComponent: any,
    parameters: any,
    linkedServiceName?: string,
    connectionId?: string
  ): any {
    const properties = datasetComponent.definition?.properties || {};

    const datasetSettings = {
      annotations: properties.annotations || [],
      type: this.convertADFDatasetTypeToFabricType(properties.type || 'Unknown'),
      schema: properties.schema || [],
      typeProperties: this.buildDatasetTypeProperties(datasetComponent, parameters),
      externalReferences: connectionId ? { connection: connectionId } : undefined
    };

    // Remove undefined externalReferences
    if (!datasetSettings.externalReferences) {
      delete datasetSettings.externalReferences;
    }

    return datasetSettings;
  }

  /**
   * Gets connection ID for a LinkedService using 4-tier fallback
   */
  private getConnectionIdForLinkedService(
    linkedServiceName?: string,
    pipelineConnectionMappings?: any,
    pipelineReferenceMappings?: Record<string, Record<string, string>>,
    pipelineName?: string,
    activityName?: string
  ): string | undefined {
    if (!linkedServiceName) {
      console.warn('No LinkedService name provided for connection lookup');
      return undefined;
    }

    // Priority 1: Try NEW referenceMappings (referenceId-based)
    if (pipelineReferenceMappings && pipelineName && activityName) {
      const pipelineMappings = pipelineReferenceMappings[pipelineName];
      if (pipelineMappings) {
        const referenceId = `${pipelineName}_${activityName}_dataset`;
        const connectionId = pipelineMappings[referenceId];
        if (connectionId) {
          console.log(`🎯 Found connection via NEW referenceMappings: ${referenceId} -> ${connectionId}`);
          return connectionId;
        }
      }
    }

    // Priority 2: Try OLD pipelineConnectionMappings
    if (pipelineConnectionMappings && pipelineName) {
      const pipelineMappings = pipelineConnectionMappings[pipelineName];
      if (pipelineMappings && activityName) {
        const activityMapping = pipelineMappings[activityName];
        if (activityMapping?.selectedConnectionId) {
          console.log(`🔄 Found connection via OLD pipelineConnectionMappings: ${activityName} -> ${activityMapping.selectedConnectionId}`);
          return activityMapping.selectedConnectionId;
        }
      }
    }

    // Priority 3: Try direct LinkedService name mapping
    if (pipelineConnectionMappings && pipelineName) {
      const pipelineMappings = pipelineConnectionMappings[pipelineName];
      if (pipelineMappings) {
        for (const key in pipelineMappings) {
          const mapping = pipelineMappings[key];
          if (mapping?.linkedServiceReference?.name === linkedServiceName && mapping?.selectedConnectionId) {
            console.log(`🌉 Found connection via LinkedService mapping: ${linkedServiceName} -> ${mapping.selectedConnectionId}`);
            return mapping.selectedConnectionId;
          }
        }
      }
    }

    console.warn(`❌ No connection mapping found for LinkedService: ${linkedServiceName}`);
    return undefined;
  }

  /**
   * Converts ADF dataset types to Fabric dataset types
   * Comprehensive mapping for all supported dataset types
   */
  private convertADFDatasetTypeToFabricType(datasetType: string): string {
    const typeMapping: Record<string, string> = {
      // Relational Databases
      'AzureSqlTable': 'SqlServerTable',
      'SqlServerTable': 'SqlServerTable',
      'AzureSqlDWTable': 'AzureSqlDWTable',
      'DataWarehouseTable': 'DataWarehouseTable',
      'MySql': 'MySql',
      'PostgreSql': 'PostgreSql',
      'PostgreSqlV2': 'PostgreSqlV2',
      'Oracle': 'Oracle',
      'DB2': 'DB2',
      'Teradata': 'Teradata',
      'Sybase': 'Sybase',
      'Snowflake': 'Snowflake',
      'Impala': 'Impala',
      'Netezza': 'Netezza',
      'Greenplum': 'Greenplum',

      // File-based
      'AzureBlob': 'Binary',
      'AzureBlobStorage': 'Binary',
      'AzureBlobFSFile': 'DelimitedText',
      'AzureDataLakeStore': 'DelimitedText',
      'AzureDataLakeStorageGen2': 'DelimitedText',
      'FileSystem': 'FileShare',
      'DelimitedText': 'DelimitedText',
      'Parquet': 'Parquet',
      'Avro': 'Avro',
      'Orc': 'Orc',
      'Json': 'Json',
      'JsonFormat': 'Json',
      'Excel': 'Excel',
      'Xml': 'Xml',
      'Binary': 'Binary',

      // NoSQL & Analytics
      'CosmosDb': 'CosmosDb',
      'MongoDb': 'MongoDb',
      'Cassandra': 'Cassandra',
      'AzureTable': 'AzureTable',
      'Kusto': 'AzureDataExplorer',

      // Web & SaaS
      'HttpServer': 'Http',
      'RestService': 'Rest',
      'OData': 'OData',
      'Office365': 'Office365',
      'SharePointOnlineList': 'SharePointOnlineList',
      'DynamicsCRM': 'Dynamics',
      'Salesforce': 'Salesforce',
      'SalesforceV2': 'SalesforceV2',
      'ServiceNow': 'ServiceNow',
      'QuickBooks': 'QuickBooks',
      'Shopify': 'Shopify',
      'Marketo': 'Marketo',

      // SAP
      'SapTable': 'SapTable',
      'SapHana': 'SapHana',
      'SapBw': 'SapBw',
      'SapCloudForCustomer': 'SapCloudForCustomer',
      'SapEcc': 'SapEcc',

      // Fabric-Specific
      'LakehouseTable': 'LakehouseTable',
      'DataWarehouse': 'DataWarehouse',
    };

    return typeMapping[datasetType] || datasetType;
  }

  /**
   * Builds typeProperties for dataset
   */
  private buildDatasetTypeProperties(datasetComponent: any, parameters: any): any {
    const originalTypeProperties = datasetComponent.definition?.properties?.typeProperties || {};
    const datasetType = datasetComponent.definition?.properties?.type;

    // Apply parameter substitution
    const typePropertiesWithParams = this.applyParametersToTypeProperties(originalTypeProperties, parameters);

    // For SQL datasets, ensure we have the required properties
    if (datasetType === 'SqlServerTable' || datasetType === 'AzureSqlTable') {
      return {
        schema: typePropertiesWithParams.schema,
        table: typePropertiesWithParams.table,
        database: typePropertiesWithParams.database
      };
    }

    // For other types, return as-is
    return typePropertiesWithParams;
  }

  /**
   * Applies parameter values to dataset typeProperties
   */
  private applyParametersToTypeProperties(typeProperties: any, parameters: any): any {
    if (!parameters || Object.keys(parameters).length === 0) {
      return typeProperties;
    }

    // Simple parameter substitution (shallow merge)
    const result = { ...typeProperties };
    
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }
}

export const getMetadataActivityTransformer = new GetMetadataActivityTransformer();
