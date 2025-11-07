import { adfParserService } from './adfParserService';

/**
 * Enhanced service for transforming ADF Copy activities to Fabric format
 * Properly handles dataset parameters, connection mappings, and Fabric structure
 */
export class CopyActivityTransformer {
  /**
   * Transforms an ADF Copy activity to Fabric format
   * @param activity The ADF Copy activity
   * @param connectionMappings The connection mappings from the UI
   * @returns The transformed Fabric Copy activity
   */
  transformCopyActivity(activity: any, connectionMappings?: any): any {
    if (!activity || activity.type !== 'Copy') {
      return activity;
    }

    console.log(`Transforming Copy activity: ${activity.name}`);

    // Get dataset mappings for this copy activity
    const datasetMappings = adfParserService.getCopyActivityDatasetMappings(activity);
    
    console.log(`Dataset mappings for ${activity.name}:`, {
      hasSourceDataset: Boolean(datasetMappings.sourceDataset),
      hasSinkDataset: Boolean(datasetMappings.sinkDataset),
      sourceDatasetName: datasetMappings.sourceDataset?.name,
      sinkDatasetName: datasetMappings.sinkDataset?.name
    });

    const transformedActivity = {
      ...activity,
      typeProperties: this.transformCopyTypeProperties(activity, datasetMappings, connectionMappings)
    };

    // Remove ADF-specific properties that are not used in Fabric pipelines
    delete transformedActivity.inputs;
    delete transformedActivity.outputs;
    delete transformedActivity._originalInputs;
    delete transformedActivity._originalOutputs;

    return transformedActivity;
  }

  /**
   * Extracts the source dataset reference from Copy activity inputs
   * @param activity The Copy activity
   * @returns The source dataset reference
   */
  private extractSourceDatasetReference(activity: any): any {
    const inputs = activity.inputs || [];
    if (inputs.length > 0 && inputs[0].type === 'DatasetReference') {
      return inputs[0];
    }
    return null;
  }

  /**
   * Extracts the sink dataset reference from Copy activity outputs  
   * @param activity The Copy activity
   * @returns The sink dataset reference
   */
  private extractSinkDatasetReference(activity: any): any {
    const outputs = activity.outputs || [];
    if (outputs.length > 0 && outputs[0].type === 'DatasetReference') {
      return outputs[0];
    }
    return null;
  }

  /**
   * Transforms the typeProperties of a Copy activity
   * @param activity The full Copy activity (including inputs/outputs)
   * @param datasetMappings The dataset mappings from parser
   * @param pipelineConnectionMappings The connection mappings
   * @returns The transformed typeProperties for Fabric
   */
  private transformCopyTypeProperties(activity: any, datasetMappings: any, pipelineConnectionMappings?: any): any {
    const typeProperties = activity.typeProperties || {};
    
    const transformed: any = {
      source: this.transformCopySource(typeProperties.source || {}, datasetMappings, pipelineConnectionMappings),
      sink: this.transformCopySink(typeProperties.sink || {}, datasetMappings, pipelineConnectionMappings),
      enableStaging: typeProperties.enableStaging || false,
      stagingSettings: this.transformStagingSettings(typeProperties.stagingSettings, pipelineConnectionMappings),
      parallelCopies: typeProperties.parallelCopies || undefined,
      dataIntegrationUnits: typeProperties.dataIntegrationUnits || undefined,
      translator: typeProperties.translator || undefined,
      enableSkipIncompatibleRow: typeProperties.enableSkipIncompatibleRow || false
    };

    // Remove undefined properties
    Object.keys(transformed).forEach(key => {
      if (transformed[key] === undefined) {
        delete transformed[key];
      }
    });

    return transformed;
  }

  /**
   * Transforms the source configuration for a Copy activity
   * @param source The ADF source configuration
   * @param datasetMappings The dataset mappings
   * @param pipelineConnectionMappings The connection mappings
   * @returns The transformed source with datasetSettings
   */
  private transformCopySource(source: any, datasetMappings: any, pipelineConnectionMappings?: any): any {
    const sourceDataset = datasetMappings.sourceDataset;
    const sourceParameters = datasetMappings.sourceParameters || {};

    if (!sourceDataset) {
      console.error('CRITICAL: No source dataset found for Copy activity - this will create an invalid pipeline');
      throw new Error('Source dataset is required for Copy activity but was not found. Check that the dataset reference is valid and the dataset was parsed correctly.');
    }

    // Get dataset type and LinkedService
    const datasetType = sourceDataset.definition?.properties?.type;
    const linkedServiceName = sourceDataset.definition?.properties?.linkedServiceName?.referenceName;
    
    if (!datasetType) {
      console.error('CRITICAL: Source dataset has no type defined - this will create an invalid pipeline');
      throw new Error(`Source dataset '${sourceDataset.name}' has no type defined. Cannot determine Fabric source type.`);
    }
    
    console.log(`Source dataset info:`, {
      datasetName: sourceDataset.name,
      datasetType,
      linkedServiceName,
      hasParameters: Object.keys(sourceParameters).length > 0
    });

    // Determine the correct source type based on the dataset type
    const sourceType = this.convertDatasetTypeToSourceType(datasetType);
    
    if (sourceType.includes('Unknown')) {
      console.error(`CRITICAL: Cannot map dataset type '${datasetType}' to a valid Fabric source type`);
      throw new Error(`Unsupported dataset type '${datasetType}' for source. This would create an invalid Fabric pipeline.`);
    }

    // Create datasetSettings from the dataset definition
    const datasetSettings = this.createDatasetSettingsFromDefinition(
      sourceDataset,
      sourceParameters,
      'source',
      linkedServiceName,
      pipelineConnectionMappings
    );

    return {
      ...source,
      type: sourceType,
      datasetSettings
    };
  }

  /**
   * Transforms the sink configuration for a Copy activity
   * @param sink The ADF sink configuration
   * @param datasetMappings The dataset mappings
   * @param pipelineConnectionMappings The connection mappings
   * @returns The transformed sink with datasetSettings
   */
  private transformCopySink(sink: any, datasetMappings: any, pipelineConnectionMappings?: any): any {
    const sinkDataset = datasetMappings.sinkDataset;
    const sinkParameters = datasetMappings.sinkParameters || {};

    if (!sinkDataset) {
      console.error('CRITICAL: No sink dataset found for Copy activity - this will create an invalid pipeline');
      throw new Error('Sink dataset is required for Copy activity but was not found. Check that the dataset reference is valid and the dataset was parsed correctly.');
    }

    // Get dataset type and LinkedService
    const datasetType = sinkDataset.definition?.properties?.type;
    const linkedServiceName = sinkDataset.definition?.properties?.linkedServiceName?.referenceName;
    
    if (!datasetType) {
      console.error('CRITICAL: Sink dataset has no type defined - this will create an invalid pipeline');
      throw new Error(`Sink dataset '${sinkDataset.name}' has no type defined. Cannot determine Fabric sink type.`);
    }
    
    console.log(`Sink dataset info:`, {
      datasetName: sinkDataset.name,
      datasetType,
      linkedServiceName,
      hasParameters: Object.keys(sinkParameters).length > 0
    });

    // Determine the correct sink type based on the dataset type
    const sinkType = this.convertDatasetTypeToSinkType(datasetType);
    
    if (sinkType.includes('Unknown')) {
      console.error(`CRITICAL: Cannot map dataset type '${datasetType}' to a valid Fabric sink type`);
      throw new Error(`Unsupported dataset type '${datasetType}' for sink. This would create an invalid Fabric pipeline.`);
    }

    // Create datasetSettings from the dataset definition
    const datasetSettings = this.createDatasetSettingsFromDefinition(
      sinkDataset,
      sinkParameters,
      'sink',
      linkedServiceName,
      pipelineConnectionMappings
    );

    return {
      ...sink,
      type: sinkType,
      datasetSettings
    };
  }

  /**
   * Creates datasetSettings from a dataset definition with parameters
   * @param datasetComponent The dataset component from parser
   * @param parameters The parameter values from the activity
   * @param role Whether this is for source or sink
   * @param linkedServiceName The LinkedService name for connection mapping
   * @param pipelineConnectionMappings The connection mappings
   * @returns The datasetSettings object for Fabric
   */
  private createDatasetSettingsFromDefinition(
    datasetComponent: any, 
    parameters: any, 
    role: 'source' | 'sink',
    linkedServiceName?: string,
    pipelineConnectionMappings?: any
  ): any {
    const properties = datasetComponent.definition?.properties || {};
    
    // Get connection ID for the dataset's LinkedService
    const connectionId = this.getConnectionIdForLinkedService(linkedServiceName, pipelineConnectionMappings);

    // Build proper datasetSettings with all required properties from ADF dataset
    const datasetType = properties?.type || 'Unknown';
    const fabricDatasetType = this.convertADFDatasetTypeToFabricType(datasetType);
    
    console.log(`Creating dataset settings for ${datasetComponent.name}:`, {
      originalType: datasetType,
      fabricType: fabricDatasetType,
      hasProperties: Boolean(properties),
      hasTypeProperties: Boolean(properties?.typeProperties),
      linkedServiceName,
      connectionId,
      parametersCount: Object.keys(parameters).length
    });
    
    const datasetSettings = {
      annotations: properties.annotations || [],
      type: this.convertADFDatasetTypeToFabricType(properties.type || 'Unknown'),
      schema: properties.schema || [],
      typeProperties: this.buildDatasetTypeProperties(datasetComponent, parameters, role),
      externalReferences: connectionId ? { connection: connectionId } : undefined
    };

    // Remove undefined externalReferences
    if (!datasetSettings.externalReferences) {
      delete datasetSettings.externalReferences;
    }

    return datasetSettings;
  }

  /**
   * Gets the connection ID for a LinkedService from the pipeline connection mappings
   * @param linkedServiceName The LinkedService name
   * @param pipelineConnectionMappings The connection mappings
   * @returns The Fabric connection ID or undefined
   */
  private getConnectionIdForLinkedService(linkedServiceName?: string, pipelineConnectionMappings?: any): string | undefined {
    if (!linkedServiceName || !pipelineConnectionMappings) {
      console.warn(`Missing parameters for connection lookup: linkedServiceName=${linkedServiceName}, hasMappings=${Boolean(pipelineConnectionMappings)}`);
      return undefined;
    }

    console.log(`Looking for connection mapping for LinkedService: ${linkedServiceName}`);
    console.log(`Available pipeline mappings:`, Object.keys(pipelineConnectionMappings));

    // Look through all pipeline mappings to find the connection ID for this LinkedService
    for (const pipelineName in pipelineConnectionMappings) {
      const pipelineMappings = pipelineConnectionMappings[pipelineName];
      console.log(`Checking pipeline '${pipelineName}' with ${Object.keys(pipelineMappings).length} mappings`);
      
      for (const activityKey in pipelineMappings) {
        const mapping = pipelineMappings[activityKey];
        
        console.log(`Checking mapping for key '${activityKey}':`, {
          hasLinkedServiceRef: Boolean(mapping?.linkedServiceReference),
          linkedServiceRefName: mapping?.linkedServiceReference?.name,
          hasSelectedConnectionId: Boolean(mapping?.selectedConnectionId),
          selectedConnectionId: mapping?.selectedConnectionId,
          activityName: mapping?.activityName,
          activityType: mapping?.activityType
        });
        
        // Check by LinkedService reference name
        if (mapping?.linkedServiceReference?.name === linkedServiceName && mapping?.selectedConnectionId) {
          console.log(`✅ Found connection mapping by LinkedService reference: ${linkedServiceName} -> ${mapping.selectedConnectionId} (via ${pipelineName}.${activityKey})`);
          return mapping.selectedConnectionId;
        }
        
        // Check if the activity key contains the LinkedService name (for unique ID mappings like activityName_linkedServiceName_index)
        if (activityKey.includes(linkedServiceName) && mapping?.selectedConnectionId) {
          console.log(`✅ Found connection mapping by activity key pattern: ${linkedServiceName} -> ${mapping.selectedConnectionId} (via ${pipelineName}.${activityKey})`);
          return mapping.selectedConnectionId;
        }

        // Additional check: look for LinkedService name in the mapping structure itself
        if (mapping?.selectedConnectionId) {
          // Check if this mapping is for the LinkedService we're looking for
          const mappingLinkedServiceName = mapping?.linkedServiceReference?.name || 
                                          (activityKey.split('_').find(part => part === linkedServiceName));
          
          if (mappingLinkedServiceName === linkedServiceName) {
            console.log(`✅ Found connection mapping by deep search: ${linkedServiceName} -> ${mapping.selectedConnectionId} (via ${pipelineName}.${activityKey})`);
            return mapping.selectedConnectionId;
          }
        }
      }
    }

    console.warn(`❌ No connection mapping found for LinkedService: ${linkedServiceName}`);
    console.log(`Available mappings for debugging:`, JSON.stringify(pipelineConnectionMappings, null, 2));
    return undefined;
  }

  /**
   * Converts ADF dataset types to Fabric source types
   * @param adfDatasetType The ADF dataset type
   * @returns The equivalent Fabric source type
   */
  private convertDatasetTypeToSourceType(adfDatasetType: string): string {
    if (!adfDatasetType) {
      throw new Error('Dataset type is required but was not provided');
    }

    // Dynamic mapping: append "Source" to dataset type with special cases
    const specialMappings: Record<string, string> = {
      'AzureSqlTable': 'SqlServerSource',
      'SqlServerTable': 'SqlServerSource',
      'AzureBlob': 'BlobSource',
      'AzureBlobFSFile': 'DelimitedTextSource',
      'DelimitedText': 'DelimitedTextSource',
      'Parquet': 'ParquetSource',
      'Json': 'JsonSource',
      'JsonFormat': 'JsonSource',
      'AzureBlobStorage': 'BlobSource',
      'AzureDataLakeStore': 'DelimitedTextSource',
      'FileSystem': 'FileSystemSource',
      'HttpServer': 'HttpSource',
      'RestService': 'RestSource',
      'OData': 'ODataSource',
      'Cassandra': 'CassandraSource',
      'MongoDb': 'MongoDbSource',
      'CosmosDb': 'CosmosDbSource',
      'MySql': 'MySqlSource',
      'PostgreSql': 'PostgreSqlSource',
      'Oracle': 'OracleSource',
      'DB2': 'Db2Source',
      'Teradata': 'TeradataSource',
      'Sybase': 'SybaseSource'
    };

    const mappedType = specialMappings[adfDatasetType];
    if (mappedType) {
      return mappedType;
    }

    // For unknown dataset types, try to create a reasonable mapping by appending "Source"
    // This ensures we never return "Unknown" 
    const generatedType = `${adfDatasetType}Source`;
    console.warn(`Using generated source type '${generatedType}' for ADF dataset type '${adfDatasetType}'. This may need manual verification.`);
    return generatedType;
  }

  /**
   * Converts ADF dataset types to Fabric sink types
   * @param adfDatasetType The ADF dataset type
   * @returns The equivalent Fabric sink type
   */
  private convertDatasetTypeToSinkType(adfDatasetType: string): string {
    if (!adfDatasetType) {
      throw new Error('Dataset type is required but was not provided');
    }

    // Dynamic mapping: append "Sink" to dataset type with special cases
    const specialMappings: Record<string, string> = {
      'AzureSqlTable': 'SqlServerSink',
      'SqlServerTable': 'SqlServerSink',
      'AzureBlob': 'BlobSink',
      'AzureBlobFSFile': 'DelimitedTextSink',
      'DelimitedText': 'DelimitedTextSink',
      'Parquet': 'ParquetSink',
      'Json': 'JsonSink',
      'JsonFormat': 'JsonSink',
      'AzureBlobStorage': 'BlobSink',
      'AzureDataLakeStore': 'DelimitedTextSink',
      'FileSystem': 'FileSystemSink',
      'HttpServer': 'HttpSink',
      'RestService': 'RestSink',
      'OData': 'ODataSink',
      'Cassandra': 'CassandraSink',
      'MongoDb': 'MongoDbSink',
      'CosmosDb': 'CosmosDbSink',
      'MySql': 'MySqlSink',
      'PostgreSql': 'PostgreSqlSink',
      'Oracle': 'OracleSink',
      'DB2': 'Db2Sink',
      'Teradata': 'TeradataSink',
      'Sybase': 'SybaseSink'
    };

    const mappedType = specialMappings[adfDatasetType];
    if (mappedType) {
      return mappedType;
    }

    // For unknown dataset types, try to create a reasonable mapping by appending "Sink"
    // This ensures we never return "Unknown" 
    const generatedType = `${adfDatasetType}Sink`;
    console.warn(`Using generated sink type '${generatedType}' for ADF dataset type '${adfDatasetType}'. This may need manual verification.`);
    return generatedType;
  }

  /**
   * Converts ADF dataset types to Fabric dataset types
   * @param adfDatasetType The ADF dataset type
   * @returns The equivalent Fabric dataset type
   */
  private convertADFDatasetTypeToFabricType(adfDatasetType: string): string {
    if (!adfDatasetType) {
      throw new Error('Dataset type is required but was not provided');
    }

    const typeMapping: Record<string, string> = {
      'AzureSqlTable': 'SqlServerTable',
      'SqlServerTable': 'SqlServerTable',
      'DelimitedText': 'DelimitedText',
      'Parquet': 'Parquet',
      'Json': 'Json',
      'JsonFormat': 'Json',
      'AzureBlob': 'AzureBlob',
      'AzureBlobFSFile': 'DelimitedText',
      'AzureBlobStorage': 'AzureBlob',
      'AzureDataLakeStore': 'DelimitedText',
      'FileSystem': 'FileSystem',
      'HttpServer': 'Http',
      'RestService': 'Rest',
      'OData': 'OData',
      'Cassandra': 'Cassandra',
      'MongoDb': 'MongoDb',
      'CosmosDb': 'CosmosDb',
      'MySql': 'MySql',
      'PostgreSql': 'PostgreSql',
      'Oracle': 'Oracle',
      'DB2': 'DB2',
      'Teradata': 'Teradata',
      'Sybase': 'Sybase'
    };

    const mappedType = typeMapping[adfDatasetType];
    if (mappedType) {
      return mappedType;
    }

    // For unknown dataset types, return the original type
    // This ensures we never return "Unknown" 
    console.warn(`Using original dataset type '${adfDatasetType}' for Fabric. This may need manual verification.`);
    return adfDatasetType;
  }

  /**
   * Builds the typeProperties for a dataset in Fabric format
   * @param datasetComponent The ADF dataset component
   * @param parameters The parameters passed from the activity
   * @param role Whether this is for source or sink
   * @returns The typeProperties for the dataset
   */
  private buildDatasetTypeProperties(datasetComponent: any, parameters: any, role: 'source' | 'sink'): any {
    const originalTypeProperties = datasetComponent.definition?.properties?.typeProperties || {};
    const datasetType = datasetComponent.definition?.properties?.type;

    // Apply parameter substitution
    const typePropertiesWithParams = this.applyParametersToTypeProperties(originalTypeProperties, parameters);

    // Convert based on dataset type
    switch (datasetType) {
      case 'AzureSqlTable':
      case 'SqlServerTable':
        return this.buildSqlServerDatasetProperties(typePropertiesWithParams);
      
      case 'DelimitedText':
        return this.buildDelimitedTextDatasetProperties(typePropertiesWithParams, role);
      
      case 'Parquet':
        return this.buildParquetDatasetProperties(typePropertiesWithParams, role);
      
      case 'Json':
        return this.buildJsonDatasetProperties(typePropertiesWithParams, role);
      
      case 'Parquet':
        return this.buildParquetDatasetProperties(typePropertiesWithParams, role);
      
      case 'Json':
        return this.buildJsonDatasetProperties(typePropertiesWithParams, role);
      
      case 'AzureBlob':
      case 'AzureBlobFSFile':
        return this.buildBlobDatasetProperties(typePropertiesWithParams, role);
      
      default:
        console.warn(`Unknown dataset type: ${datasetType}, using original properties`);
        return typePropertiesWithParams;
    }
  }

  /**
   * Applies parameter values to dataset typeProperties
   * @param typeProperties The original typeProperties
   * @param parameters The parameter values from the activity
   * @returns The typeProperties with parameter values applied
   */
  private applyParametersToTypeProperties(typeProperties: any, parameters: any): any {
    if (!parameters || Object.keys(parameters).length === 0) {
      return typeProperties;
    }

    // Clone the typeProperties to avoid mutation
    const result = JSON.parse(JSON.stringify(typeProperties));

    // Replace parameter references with actual values
    this.substituteParameterValues(result, parameters);

    return result;
  }

  /**
   * Recursively substitutes parameter values in an object
   * @param obj The object to process
   * @param parameters The parameter values
   */
  private substituteParameterValues(obj: any, parameters: any): void {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Replace parameter references like @{dataset().p_Directory}
        const replacedValue = this.replaceParameterReferences(value, parameters);
        if (replacedValue !== value) {
          console.log(`Replaced parameter in ${key}: "${value}" -> "${replacedValue}"`);
        }
        obj[key] = replacedValue;
      } else if (typeof value === 'object' && value !== null) {
        // Handle expression objects { value: string, type: 'Expression' }
        if ((value as any).type === 'Expression' && typeof (value as any).value === 'string') {
          const originalValue = (value as any).value;
          const replacedValue = this.replaceParameterReferences(originalValue, parameters);
          if (replacedValue !== originalValue) {
            console.log(`Replaced parameter in Expression ${key}: "${originalValue}" -> "${replacedValue}"`);
            // For Expression objects, if we successfully replaced parameters, convert to simple string
            if (!replacedValue.includes('@dataset') && !replacedValue.includes('@{')) {
              obj[key] = replacedValue;
            } else {
              (value as any).value = replacedValue;
            }
          } else {
            (value as any).value = replacedValue;
          }
        } else {
          this.substituteParameterValues(value, parameters);
        }
      }
    }
  }

  /**
   * Replaces parameter references in a string with actual values
   * @param value The string value that may contain parameter references
   * @param parameters The parameter values
   * @returns The string with parameter references replaced
   */
  private replaceParameterReferences(value: string, parameters: any): string {
    if (!value || typeof value !== 'string') {
      return value;
    }

    let result = value;

    // Handle @{dataset().parameterName} format
    result = result.replace(/@\{dataset\(\)\.(\w+)\}/g, (match, paramName) => {
      if (parameters && parameters.hasOwnProperty(paramName)) {
        console.log(`Replacing parameter ${paramName} with value: ${parameters[paramName]}`);
        return parameters[paramName];
      }
      return match;
    });

    // Handle @dataset().parameterName format (without curly braces)
    result = result.replace(/@dataset\(\)\.(\w+)/g, (match, paramName) => {
      if (parameters && parameters.hasOwnProperty(paramName)) {
        console.log(`Replacing parameter ${paramName} with value: ${parameters[paramName]}`);
        return parameters[paramName];
      }
      return match;
    });

    return result;
  }

  /**
   * Builds typeProperties for SQL Server datasets
   * @param typeProperties The processed typeProperties
   * @returns The SQL Server dataset properties for Fabric
   */
  private buildSqlServerDatasetProperties(typeProperties: any): any {
    const result: any = {};
    
    // Only include properties that exist in the original dataset
    if (typeProperties.schema) {
      result.schema = typeProperties.schema;
    }
    
    if (typeProperties.table || typeProperties.tableName) {
      result.table = typeProperties.tableName || typeProperties.table;
    }
    
    if (typeProperties.database) {
      result.database = typeProperties.database;
    }
    
    return result;
  }

  /**
   * Builds typeProperties for DelimitedText datasets
   * @param typeProperties The processed typeProperties
   * @param role Whether this is for source or sink
   * @returns The DelimitedText dataset properties for Fabric
   */
  private buildDelimitedTextDatasetProperties(typeProperties: any, role: 'source' | 'sink'): any {
    const location = typeProperties.location || {};
    const result: any = {};
    
    // Build location object with only existing properties
    const locationResult: any = {};
    
    if (location.type) {
      locationResult.type = this.convertLocationTypeToFabric(location.type);
    }
    
    if (location.fileName) {
      locationResult.fileName = location.fileName;
    }
    
    if (location.folderPath || location.directory) {
      locationResult.folderPath = location.folderPath || location.directory;
    }
    
    if (location.fileSystem || location.container) {
      locationResult.fileSystem = location.fileSystem || location.container;
    }
    
    // Only add location if it has properties
    if (Object.keys(locationResult).length > 0) {
      result.location = locationResult;
    }
    
    // Add other properties only if they exist
    if (typeProperties.columnDelimiter !== undefined) {
      result.columnDelimiter = typeProperties.columnDelimiter;
    }
    
    if (typeProperties.escapeChar !== undefined) {
      result.escapeChar = typeProperties.escapeChar;
    }
    
    if (typeProperties.firstRowAsHeader !== undefined) {
      result.firstRowAsHeader = typeProperties.firstRowAsHeader;
    }
    
    if (typeProperties.quoteChar !== undefined) {
      result.quoteChar = typeProperties.quoteChar;
    }
    
    return result;
  }

  /**
   * Builds typeProperties for Parquet datasets
   * @param typeProperties The processed typeProperties
   * @param role Whether this is for source or sink
   * @returns The Parquet dataset properties for Fabric
   */
  private buildParquetDatasetProperties(typeProperties: any, role: 'source' | 'sink'): any {
    const location = typeProperties.location || {};
    const result: any = {};
    
    // Build location object with only existing properties
    const locationResult: any = {};
    
    if (location.type) {
      locationResult.type = this.convertLocationTypeToFabric(location.type);
    }
    
    if (location.fileName) {
      locationResult.fileName = location.fileName;
    }
    
    if (location.folderPath || location.directory) {
      locationResult.folderPath = location.folderPath || location.directory;
    }
    
    if (location.fileSystem || location.container) {
      locationResult.fileSystem = location.fileSystem || location.container;
    }
    
    // Only add location if it has properties
    if (Object.keys(locationResult).length > 0) {
      result.location = locationResult;
    }
    
    // Add compression codec only if it exists
    if (typeProperties.compressionCodec !== undefined) {
      result.compressionCodec = typeProperties.compressionCodec;
    }
    
    return result;
  }

  /**
   * Builds typeProperties for JSON datasets
   * @param typeProperties The processed typeProperties
   * @param role Whether this is for source or sink
   * @returns The JSON dataset properties for Fabric
   */
  private buildJsonDatasetProperties(typeProperties: any, role: 'source' | 'sink'): any {
    const location = typeProperties.location || {};
    const result: any = {};
    
    // Build location object with only existing properties
    const locationResult: any = {};
    
    if (location.type) {
      locationResult.type = this.convertLocationTypeToFabric(location.type);
    }
    
    if (location.fileName) {
      locationResult.fileName = location.fileName;
    }
    
    if (location.folderPath || location.directory) {
      locationResult.folderPath = location.folderPath || location.directory;
    }
    
    if (location.fileSystem || location.container) {
      locationResult.fileSystem = location.fileSystem || location.container;
    }
    
    // Only add location if it has properties
    if (Object.keys(locationResult).length > 0) {
      result.location = locationResult;
    }
    
    // Add encoding name only if it exists
    if (typeProperties.encodingName !== undefined) {
      result.encodingName = typeProperties.encodingName;
    }
    
    return result;
  }

  /**
   * Builds typeProperties for Blob datasets
   * @param typeProperties The processed typeProperties
   * @param role Whether this is for source or sink
   * @returns The Blob dataset properties for Fabric
   */
  private buildBlobDatasetProperties(typeProperties: any, role: 'source' | 'sink'): any {
    const location = typeProperties.location || {};
    const result: any = {};
    
    // Build location object with only existing properties
    const locationResult: any = {};
    
    if (location.type) {
      locationResult.type = 'AzureBlobStorageLocation';
    }
    
    if (location.fileName) {
      locationResult.fileName = location.fileName;
    }
    
    if (location.folderPath || location.directory) {
      locationResult.folderPath = location.folderPath || location.directory;
    }
    
    if (location.container || location.fileSystem) {
      locationResult.container = location.container || location.fileSystem;
    }
    
    // Only add location if it has properties
    if (Object.keys(locationResult).length > 0) {
      result.location = locationResult;
    }
    
    return result;
  }

  /**
   * Transforms staging settings for Copy activities
   * @param stagingSettings The ADF staging settings
   * @param pipelineConnectionMappings The connection mappings
   * @returns The transformed staging settings for Fabric
   */
  private transformStagingSettings(stagingSettings: any, pipelineConnectionMappings?: any): any {
    if (!stagingSettings) return undefined;

    const linkedServiceName = stagingSettings.linkedServiceName?.referenceName;
    const connectionId = this.getConnectionIdForLinkedService(linkedServiceName, pipelineConnectionMappings);

    const result: any = {};
    
    // Only include path if it exists
    if (stagingSettings.path !== undefined) {
      result.path = stagingSettings.path;
    }
    
    // Only include external references if we have a connection ID
    if (connectionId) {
      result.externalReferences = { connection: connectionId };
    }
    
    // Return undefined if no properties were added
    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Converts ADF location types to Fabric types
   * @param adfType The ADF location type
   * @returns The equivalent Fabric location type
   */
  private convertLocationTypeToFabric(adfType: string): string {
    const typeMapping: Record<string, string> = {
      'AzureBlobStorageLocation': 'AzureBlobStorageLocation',
      'AzureBlobFSLocation': 'AzureBlobFSLocation',
      'FileServerLocation': 'FileServerLocation'
    };

    return typeMapping[adfType] || 'AzureBlobFSLocation';
  }


}

export const copyActivityTransformer = new CopyActivityTransformer();