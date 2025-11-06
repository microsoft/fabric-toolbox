import { connectionService } from './connectionService';
import { copyActivityTransformer } from './copyActivityTransformer';
import { customActivityTransformer } from './customActivityTransformer';

export class ActivityTransformer {
  // Transform LinkedService references to Fabric format - comprehensive implementation
  transformLinkedServiceReferencesToFabric(activity: any, pipelineConnectionMappings?: any): void {
    if (!activity || typeof activity !== 'object') return;

    // Skip Copy activities - they are handled by specialized copyActivityTransformer
    if (activity.type === 'Copy') {
      return; // Do not process Copy activities here
    }

    // Skip Custom activities - they are handled by specialized customActivityTransformer
    if (activity.type === 'Custom') {
      return; // Do not process Custom activities here
    }

    // 1. Remove ADF-specific linkedServiceName references and replace with Fabric externalReferences
    this.removeLinkedServiceReferencesAndSetExternalReferences(activity);

    // 2. Convert static text properties to Expression objects for Fabric compatibility
    this.convertStaticTextToExpressions(activity);

    // 3. Add required properties for different activity types
    this.addRequiredPropertiesForActivityType(activity);

    // 4. Handle dataset references that contain LinkedService references
    this.transformDatasetReferences(activity);
  }

  removeLinkedServiceReferencesAndSetExternalReferences(activity: any): void {
    if (!activity) return;

    let connectionId: string | undefined;
    let linkedServiceName: string | undefined;

    const typeProperties = activity.typeProperties || {};

    if (typeProperties.linkedServices && Array.isArray(typeProperties.linkedServices)) {
      const firstLinkedService = typeProperties.linkedServices[0];
      if (firstLinkedService?.referenceName) {
        linkedServiceName = firstLinkedService.referenceName;
        connectionId = connectionService.mapLinkedServiceToConnection(linkedServiceName);
        delete typeProperties.linkedServices;
      }
    }

    if (typeProperties.linkedServiceName?.referenceName) {
      linkedServiceName = typeProperties.linkedServiceName.referenceName;
      connectionId = connectionService.mapLinkedServiceToConnection(linkedServiceName);
      delete typeProperties.linkedServiceName;
    }

    if (activity.linkedServiceName?.referenceName) {
      linkedServiceName = activity.linkedServiceName.referenceName;
      connectionId = connectionService.mapLinkedServiceToConnection(linkedServiceName);
      delete activity.linkedServiceName;
    }

    if (connectionId) {
      if (!activity.externalReferences) activity.externalReferences = {};
      activity.externalReferences.connection = connectionId;
    } else if (linkedServiceName) {
      console.warn(`No connection mapping found for LinkedService: ${linkedServiceName} in activity ${activity.name}`);
    }
  }

  convertStaticTextToExpressions(activity: any): void {
    if (!activity?.typeProperties || typeof activity.typeProperties !== 'object') return;

    const typeProperties = activity.typeProperties;

    switch (activity.type) {
      case 'Script': this.convertScriptActivityExpressions(typeProperties); break;
      case 'StoredProcedure': this.convertStoredProcedureActivityExpressions(typeProperties); break;
      case 'WebActivity': this.convertWebActivityExpressions(typeProperties); break;
      case 'Lookup': this.convertLookupActivityExpressions(typeProperties); break;
      default: this.convertCommonStringPropertiesToExpressions(typeProperties); break;
    }
  }

  convertScriptActivityExpressions(typeProperties: any): void {
    if (typeProperties.scripts && Array.isArray(typeProperties.scripts)) {
      typeProperties.scripts = typeProperties.scripts.map((script: any) => {
        if (script.text && typeof script.text === 'string') {
          return { ...script, text: { value: script.text, type: 'Expression' } };
        }
        return script;
      });
    }
  }

  convertStoredProcedureActivityExpressions(typeProperties: any): void {
    if (typeProperties.storedProcedureName && typeof typeProperties.storedProcedureName === 'string') {
      typeProperties.storedProcedureName = { value: typeProperties.storedProcedureName, type: 'Expression' };
    }

    if (typeProperties.storedProcedureParameters && typeof typeProperties.storedProcedureParameters === 'object') {
      for (const [paramName, paramValue] of Object.entries(typeProperties.storedProcedureParameters)) {
        if (typeof paramValue === 'string') {
          typeProperties.storedProcedureParameters[paramName] = { value: paramValue, type: 'Expression' };
        }
      }
    }
  }

  convertWebActivityExpressions(typeProperties: any): void {
    if (typeProperties.url && typeof typeProperties.url === 'string') {
      typeProperties.url = { value: typeProperties.url, type: 'Expression' };
    }
    if (typeProperties.body && typeof typeProperties.body === 'string') {
      typeProperties.body = { value: typeProperties.body, type: 'Expression' };
    }
  }

  convertLookupActivityExpressions(typeProperties: any): void {
    if (typeProperties.source?.query && typeof typeProperties.source.query === 'string') {
      typeProperties.source.query = { value: typeProperties.source.query, type: 'Expression' };
    }
  }

  convertCommonStringPropertiesToExpressions(typeProperties: any): void {
    const commonStringProperties = ['query', 'command', 'script', 'sql', 'statement'];
    for (const prop of commonStringProperties) {
      if (typeProperties[prop] && typeof typeProperties[prop] === 'string') {
        typeProperties[prop] = { value: typeProperties[prop], type: 'Expression' };
      }
    }
  }

  addRequiredPropertiesForActivityType(activity: any): void {
    if (!activity?.typeProperties || typeof activity.typeProperties !== 'object') return;

    switch (activity.type) {
      case 'Script': this.addScriptActivityRequiredProperties(activity); break;
      case 'StoredProcedure': this.addStoredProcedureActivityRequiredProperties(activity); break;
      case 'WebActivity': this.addWebActivityRequiredProperties(activity); break;
      default: this.addCommonRequiredProperties(activity); break;
    }
  }

  addScriptActivityRequiredProperties(activity: any): void {
    const typeProperties = activity.typeProperties;
    
    // Only add scriptBlockExecutionTimeout if not present
    if (!typeProperties.scriptBlockExecutionTimeout) {
      typeProperties.scriptBlockExecutionTimeout = '02:00:00';
    }

    // DO NOT add default database - extract from original LinkedService/Dataset if needed
    // but never add placeholder values
    if (!typeProperties.database) {
      // Try to extract database from the original activity's linked service or dataset
      const databaseName = this.extractDatabaseFromActivityReferences(activity);
      if (databaseName) {
        typeProperties.database = databaseName;
        console.log(`Extracted database name '${databaseName}' for Script activity '${activity.name}'`);
      }
      // If no database is found, DON'T add a default - let Fabric handle it
    }
  }

  addStoredProcedureActivityRequiredProperties(activity: any): void {
    const typeProperties = activity.typeProperties;
    
    // DO NOT add default database - extract from original LinkedService/Dataset if needed
    // but never add placeholder values
    if (!typeProperties.database) {
      // Try to extract database from the original activity's linked service or dataset
      const databaseName = this.extractDatabaseFromActivityReferences(activity);
      if (databaseName) {
        typeProperties.database = databaseName;
        console.log(`Extracted database name '${databaseName}' for StoredProcedure activity '${activity.name}'`);
      }
      // If no database is found, DON'T add a default - let Fabric handle it
    }
  }

  /**
   * Extracts database name from activity's LinkedService or Dataset references
   * @param activity The activity to extract database from
   * @returns The database name if found, undefined otherwise
   */
  extractDatabaseFromActivityReferences(activity: any): string | undefined {
    try {
      // Import the adfParserService to access parsed components
      const { adfParserService } = require('./adfParserService');
      
      // For now, we'll implement a basic version that doesn't add defaults
      // This method can be enhanced to extract from actual LinkedService definitions
      // stored in the ADF parser service
      
      // Check if there's a database property in the activity's typeProperties already
      if (activity.typeProperties?.database) {
        return activity.typeProperties.database;
      }
      
      // Try to get from dataset if this is a Copy activity with dataset settings
      if (activity.typeProperties?.source?.datasetSettings?.typeProperties?.database) {
        return activity.typeProperties.source.datasetSettings.typeProperties.database;
      }
      
      if (activity.typeProperties?.sink?.datasetSettings?.typeProperties?.database) {
        return activity.typeProperties.sink.datasetSettings.typeProperties.database;
      }
      
      // For activities with direct LinkedService references, try to extract database
      const linkedServiceRef = this.getLinkedServiceReference(activity);
      if (linkedServiceRef && adfParserService) {
        const linkedService = adfParserService.getLinkedServiceByName(linkedServiceRef);
        if (linkedService?.definition?.properties?.typeProperties) {
          const linkedServiceProps = linkedService.definition.properties.typeProperties;
          
          // Different linked service types may store database info in different properties
          if (linkedServiceProps.database) {
            return linkedServiceProps.database;
          }
          
          // For SQL Server linked services, check connectionString
          if (linkedServiceProps.connectionString || linkedServiceProps.server) {
            // Extract database from connection string if present
            const database = this.extractDatabaseFromConnectionString(linkedServiceProps.connectionString);
            if (database) {
              return database;
            }
          }
        }
      }
      
      // For other activities, try to extract from dataset references
      if (activity.inputs && Array.isArray(activity.inputs) && activity.inputs.length > 0) {
        const firstInput = activity.inputs[0];
        if (firstInput?.referenceName && adfParserService) {
          const dataset = adfParserService.getDatasetByName(firstInput.referenceName);
          if (dataset?.definition?.properties?.typeProperties) {
            const datasetProps = dataset.definition.properties.typeProperties;
            if (datasetProps.database) {
              return datasetProps.database;
            }
            // For SQL datasets, try other common property names
            if (datasetProps.schema && datasetProps.table) {
              // In some cases, database might be implied by the connection context
              // For now, return undefined to avoid adding defaults
            }
          }
        }
      }
      
      // For now, return undefined to avoid adding default values
      return undefined;
    } catch (error) {
      console.warn('Error extracting database from activity references:', error);
      return undefined;
    }
  }

  /**
   * Extracts the LinkedService reference name from an activity
   * @param activity The activity to extract from
   * @returns The LinkedService reference name if found
   */
  private getLinkedServiceReference(activity: any): string | undefined {
    const typeProperties = activity.typeProperties || {};
    
    // Check various possible locations for LinkedService references
    if (typeProperties.linkedServiceName?.referenceName) {
      return typeProperties.linkedServiceName.referenceName;
    }
    
    if (typeProperties.linkedServices && Array.isArray(typeProperties.linkedServices) && typeProperties.linkedServices.length > 0) {
      return typeProperties.linkedServices[0]?.referenceName;
    }
    
    if (activity.linkedServiceName?.referenceName) {
      return activity.linkedServiceName.referenceName;
    }
    
    return undefined;
  }

  /**
   * Extracts database name from a connection string
   * @param connectionString The connection string to parse
   * @returns The database name if found
   */
  private extractDatabaseFromConnectionString(connectionString: string | any): string | undefined {
    if (!connectionString) return undefined;
    
    // Handle connection string that might be an object with value property
    let connStr: string;
    if (typeof connectionString === 'object' && connectionString.value) {
      connStr = connectionString.value;
    } else if (typeof connectionString === 'string') {
      connStr = connectionString;
    } else {
      return undefined;
    }
    
    // Common patterns for database in connection strings
    const patterns = [
      /database=([^;]+)/i,
      /initial catalog=([^;]+)/i,
      /catalog=([^;]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = connStr.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return undefined;
  }

  addWebActivityRequiredProperties(activity: any): void {
    const typeProperties = activity.typeProperties;
    if (!typeProperties.method) typeProperties.method = 'GET';
    if (!typeProperties.headers) typeProperties.headers = {};
  }

  addCommonRequiredProperties(activity: any): void {
    if (!activity.policy) activity.policy = {};
    if (!activity.policy.timeout) activity.policy.timeout = '0.12:00:00';
  }

  transformDatasetReferences(activity: any): void {
    if (activity.inputs && Array.isArray(activity.inputs)) activity.inputs = this.transformActivityInputs(activity.inputs);
    if (activity.outputs && Array.isArray(activity.outputs)) activity.outputs = this.transformActivityOutputs(activity.outputs);
    if (activity.type === 'Copy' && activity.typeProperties) this.transformCopyActivityDatasetReferences(activity.typeProperties);
  }

  transformCopyActivityDatasetReferences(typeProperties: any): void {
    if (typeProperties.source) typeProperties.source = this.transformDatasetToDatasetSettings(typeProperties.source, 'source');
    if (typeProperties.sink) typeProperties.sink = this.transformDatasetToDatasetSettings(typeProperties.sink, 'sink');
  }

  transformDatasetToDatasetSettings(datasetConfig: any, role: 'source' | 'sink'): any {
    if (!datasetConfig || typeof datasetConfig !== 'object') return datasetConfig;
    if (datasetConfig.dataset?.referenceName) {
      const datasetName = datasetConfig.dataset.referenceName;
      const connectionId = this.getConnectionIdForDataset(datasetName);
      return { ...datasetConfig, datasetSettings: { ...datasetConfig, externalReferences: connectionId ? { connection: connectionId } : undefined } };
    }
    return datasetConfig;
  }

  // Normalize and transform activity inputs (datasets) into Fabric-friendly datasetSettings
  transformActivityInputs(inputs: any[]): any[] {
    if (!Array.isArray(inputs)) return inputs;

    return inputs.map(input => {
      if (!input) return input;

      // A common ADF format: { "referenceName": "name", "type": "DatasetReference" }
      if (input.type === 'DatasetReference' && (input.referenceName || input.dataset?.referenceName)) {
        const name = input.referenceName || input.dataset?.referenceName;
        const datasetConfig = input.dataset ? input : { dataset: { referenceName: name } };
        const transformed = this.transformDatasetToDatasetSettings(datasetConfig, 'source');
        return { ...transformed, type: 'DatasetReference', referenceName: name };
      }

      // Some inputs already have a dataset sub-object
      if (input.dataset?.referenceName) {
        return this.transformDatasetToDatasetSettings(input, 'source');
      }

      return input;
    });
  }

  // Normalize and transform activity outputs (datasets) into Fabric-friendly datasetSettings
  transformActivityOutputs(outputs: any[]): any[] {
    if (!Array.isArray(outputs)) return outputs;

    return outputs.map(output => {
      if (!output) return output;

      if (output.type === 'DatasetReference' && (output.referenceName || output.dataset?.referenceName)) {
        const name = output.referenceName || output.dataset?.referenceName;
        const datasetConfig = output.dataset ? output : { dataset: { referenceName: name } };
        const transformed = this.transformDatasetToDatasetSettings(datasetConfig, 'sink');
        return { ...transformed, type: 'DatasetReference', referenceName: name };
      }

      if (output.dataset?.referenceName) {
        return this.transformDatasetToDatasetSettings(output, 'sink');
      }

      return output;
    });
  }

  getDatabaseNameFromConnection(connectionId: string): string | undefined {
    console.log(`Getting database name for connection: ${connectionId}`);
    return undefined;
  }

  getConnectionIdForDataset(datasetName: string): string | undefined {
    console.log(`Getting connection ID for dataset: ${datasetName}`);
    return undefined;
  }

  setExternalReferences(activity: any): void {
    if (!activity) return;
    if (!activity.externalReferences) activity.externalReferences = {};
    let connectionId: string | undefined;

    if (activity.typeProperties) {
      if (activity.typeProperties.linkedServices && Array.isArray(activity.typeProperties.linkedServices)) {
        const firstLinkedService = activity.typeProperties.linkedServices[0];
        if (firstLinkedService?.referenceName) {
          connectionId = connectionService.mapLinkedServiceToConnection(firstLinkedService.referenceName);
          delete activity.typeProperties.linkedServices;
        }
      }

      if (activity.typeProperties.linkedServiceName?.referenceName) {
        connectionId = connectionService.mapLinkedServiceToConnection(activity.typeProperties.linkedServiceName.referenceName);
        delete activity.typeProperties.linkedServiceName;
      }

      if (activity.typeProperties.source?.linkedServiceName?.referenceName) {
        connectionId = connectionService.mapLinkedServiceToConnection(activity.typeProperties.source.linkedServiceName.referenceName);
      }

      if (activity.typeProperties.sink?.linkedServiceName?.referenceName) {
        connectionId = connectionService.mapLinkedServiceToConnection(activity.typeProperties.sink.linkedServiceName.referenceName);
      }
    }

    if (connectionId) {
      activity.externalReferences.connection = connectionId;
      console.log(`Set externalReferences.connection to ${connectionId} for activity ${activity.name}`);
    } else {
      console.warn(`No connection mapping found for activity ${activity.name}`);
    }
  }

  updateTypePropertiesLinkedServiceReferences(typeProperties: any): void {
    if (!typeProperties || typeof typeProperties !== 'object') return;

    if (typeProperties.source?.linkedServiceName?.referenceName) {
      const fabricConnectionId = connectionService.mapLinkedServiceToConnection(typeProperties.source.linkedServiceName.referenceName);
      if (fabricConnectionId) typeProperties.source.fabricConnectionId = fabricConnectionId;
    }

    if (typeProperties.sink?.linkedServiceName?.referenceName) {
      const fabricConnectionId = connectionService.mapLinkedServiceToConnection(typeProperties.sink.linkedServiceName.referenceName);
      if (fabricConnectionId) typeProperties.sink.fabricConnectionId = fabricConnectionId;
    }

    if (typeProperties.linkedServiceName?.referenceName) {
      const fabricConnectionId = connectionService.mapLinkedServiceToConnection(typeProperties.linkedServiceName.referenceName);
      if (fabricConnectionId) typeProperties.fabricConnectionId = fabricConnectionId;
    }

    if (typeProperties.dataset?.linkedServiceName?.referenceName) {
      const fabricConnectionId = connectionService.mapLinkedServiceToConnection(typeProperties.dataset.linkedServiceName.referenceName);
      if (fabricConnectionId) typeProperties.dataset.fabricConnectionId = fabricConnectionId;
    }
  }

  activityReferencesFailedConnector(activity: any): boolean {
    if (!activity || typeof activity !== 'object') return false;

    // Special handling for Custom activities
    if (activity.type === 'Custom') {
      return customActivityTransformer.activityReferencesFailedConnector(activity);
    }

    const typeProperties = activity.typeProperties || {};
    const datasets = [typeProperties.dataset, typeProperties.source?.dataset, typeProperties.sink?.dataset, ...(typeProperties.datasets || [])].filter(Boolean);
    for (const dataset of datasets) {
      if (dataset?.linkedServiceName?.referenceName) {
        const linkedServiceName = dataset.linkedServiceName.referenceName;
        if (connectionService.getFailedConnectors().has(linkedServiceName)) return true;
      }
    }

    const linkedServices = [typeProperties.linkedServiceName, typeProperties.linkedService, ...(typeProperties.linkedServices || [])].filter(Boolean);
    for (const linkedService of linkedServices) {
      const referenceName = linkedService.referenceName || linkedService;
      if (typeof referenceName === 'string' && connectionService.getFailedConnectors().has(referenceName)) return true;
    }

    if (typeProperties.source?.linkedServiceName?.referenceName) {
      if (connectionService.getFailedConnectors().has(typeProperties.source.linkedServiceName.referenceName)) return true;
    }
    if (typeProperties.sink?.linkedServiceName?.referenceName) {
      if (connectionService.getFailedConnectors().has(typeProperties.sink.linkedServiceName.referenceName)) return true;
    }

    return false;
  }

  countInactiveActivities(activities: any[]): number {
    return activities.filter(activity => activity.state === 'Inactive').length;
  }

  hasLinkedServiceReferences(activity: any): boolean {
    if (!activity || typeof activity !== 'object') return false;
    const hasInputDatasets = Array.isArray(activity.inputs) && activity.inputs.some((input: any) => input?.type === 'DatasetReference');
    const hasOutputDatasets = Array.isArray(activity.outputs) && activity.outputs.some((output: any) => output?.type === 'DatasetReference');
    const typeProperties = activity.typeProperties || {};
    const hasDirectLinkedServiceRefs = this.hasDirectLinkedServiceReferences(typeProperties);
    return hasInputDatasets || hasOutputDatasets || hasDirectLinkedServiceRefs;
  }

  hasDirectLinkedServiceReferences(typeProperties: any): boolean {
    if (!typeProperties || typeof typeProperties !== 'object') return false;
    const checks = [
      typeProperties.linkedServiceName,
      typeProperties.linkedService,
      typeProperties.source?.linkedServiceName,
      typeProperties.sink?.linkedServiceName,
      typeProperties.dataset?.linkedServiceName,
      ...(typeProperties.linkedServices || [])
    ];
    return checks.some(ref => ref && (ref.referenceName || typeof ref === 'string'));
  }
}

export const activityTransformer = new ActivityTransformer();
