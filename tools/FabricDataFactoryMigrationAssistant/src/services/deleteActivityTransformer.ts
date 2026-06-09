/**
 * Delete Activity Transformer
 * 
 * Transforms ADF Delete activities to Fabric format by:
 * 1. Extracting dataset reference from typeProperties.dataset.referenceName
 * 2. Looking up dataset definition to find linkedServiceName
 * 3. Resolving connection using 4-tier lookup (referenceId → activity → bridge → direct)
 * 4. Building inline datasetSettings with proper type mappings
 * 5. Removing original dataset reference to prevent 400 errors
 * 
 * This transformer fixes the error:
 * "400 Bad Request: invalid reference 'Parquet1'" during deployment
 */

import { adfParserService } from './adfParserService';
import { PipelineConnectionMappings } from '../types';
import { DatasetParameterSubstitution } from './utils/datasetParameterSubstitution';

interface DeleteActivity {
  name: string;
  type: 'Delete';
  typeProperties: {
    dataset?: {
      referenceName: string;
      type?: string;
      parameters?: Record<string, any>;
    };
    datasetSettings?: any;
    [key: string]: any;
  };
  [key: string]: any;
}

interface DatasetDefinition {
  name: string;
  definition: {
    properties: {
      type: string;
      linkedServiceName: {
        referenceName: string;
        type: string;
      };
      typeProperties?: {
        location?: any;
        [key: string]: any;
      };
      parameters?: Record<string, any>;
      annotations?: any[];
      schema?: any[];
    };
  };
}

export class DeleteActivityTransformer {
  /**
   * Transform a Delete activity from ADF to Fabric format
   * 
   * @param activity - The Delete activity to transform
   * @param pipelineConnectionMappings - Activity-level connection mappings (OLD format)
   * @param pipelineReferenceMappings - Reference ID to connection mappings (NEW format)
   * @param pipelineName - Name of the parent pipeline
   * @returns Transformed activity with inline datasetSettings
   */
  public transformDeleteActivity(
    activity: DeleteActivity,
    pipelineConnectionMappings?: PipelineConnectionMappings,
    pipelineReferenceMappings?: Record<string, Record<string, string>>,
    pipelineName?: string
  ): DeleteActivity {
    if (!activity || activity.type !== 'Delete') {
      return activity;
    }

    console.log(`[DeleteActivityTransformer] Transforming Delete activity: ${activity.name}`);

    // Validate activity structure
    if (!activity.typeProperties) {
      console.error(`[DeleteActivityTransformer] Activity ${activity.name} missing typeProperties`);
      return activity;
    }

    // Extract dataset reference
    const datasetReference = activity.typeProperties.dataset?.referenceName;
    if (!datasetReference) {
      console.log(`[DeleteActivityTransformer] Activity ${activity.name} has no dataset reference - skipping transformation`);
      return activity;
    }

    console.log(`[DeleteActivityTransformer] Processing dataset reference: ${datasetReference}`);

    // Lookup dataset definition
    const dataset = this.findDataset(datasetReference);
    if (!dataset) {
      console.error(`[DeleteActivityTransformer] Dataset ${datasetReference} not found in parsed components`);
      return activity;
    }

    // Extract linkedServiceName from dataset
    const linkedServiceName = dataset.definition?.properties?.linkedServiceName?.referenceName;
    if (!linkedServiceName) {
      console.error(`[DeleteActivityTransformer] Dataset ${datasetReference} missing linkedServiceName`);
      return activity;
    }

    console.log(`[DeleteActivityTransformer] Dataset ${datasetReference} uses linkedService: ${linkedServiceName}`);

    // Apply 4-tier connection lookup
    const connectionId = this.findConnectionId(
      linkedServiceName,
      pipelineConnectionMappings,
      pipelineReferenceMappings,
      pipelineName,
      activity.name
    );

    if (!connectionId) {
      console.warn(`[DeleteActivityTransformer] No connection found for Delete activity ${activity.name}, dataset ${datasetReference}`);
      // Continue transformation but mark as needing connection
    }

    // Extract dataset parameters from activity reference
    const datasetParameters = activity.typeProperties.dataset?.parameters || {};

    // Build inline datasetSettings
    const datasetSettings = this.buildDatasetSettings(
      dataset,
      connectionId,
      datasetParameters
    );

    // Apply datasetSettings to activity
    activity.typeProperties.datasetSettings = datasetSettings;

    // CRITICAL: Remove original dataset reference to prevent 400 error
    delete activity.typeProperties.dataset;

    // Transform logStorageSettings if present
    if (activity.typeProperties.logStorageSettings) {
      activity.typeProperties.logStorageSettings = this.transformLogStorageSettings(
        activity.typeProperties.logStorageSettings,
        connectionId,
        datasetParameters
      );
    }

    console.log(`[DeleteActivityTransformer] Successfully transformed Delete activity ${activity.name}`, {
      datasetReference,
      linkedServiceName,
      connectionId: connectionId || 'NOT FOUND - manual mapping required',
      hasDatasetSettings: Boolean(activity.typeProperties.datasetSettings),
      hasLogStorageSettings: Boolean(activity.typeProperties.logStorageSettings)
    });

    return activity;
  }

  /**
   * Find dataset definition from parsed ADF components
   */
  private findDataset(datasetName: string): DatasetDefinition | undefined {
    const dataset = adfParserService.getDatasetByName(datasetName);
    return dataset as DatasetDefinition | undefined;
  }

  /**
   * Apply 4-tier connection lookup strategy
   * 
   * Tier 1: Reference ID mapping (${pipelineName}_${activityName}_dataset)
   * Tier 2: Activity name mapping
   * Tier 3: LinkedService bridge mapping
   * Tier 4: Direct connection name match
   */
  private findConnectionId(
    linkedServiceName: string,
    pipelineConnectionMappings?: PipelineConnectionMappings,
    pipelineReferenceMappings?: Record<string, Record<string, string>>,
    pipelineName?: string,
    activityName?: string
  ): string | undefined {
    console.log(`[DeleteActivityTransformer] Starting 4-tier connection lookup`, {
      pipelineName,
      activityName,
      linkedServiceName,
      hasPipelineConnectionMappings: Boolean(pipelineConnectionMappings),
      hasPipelineReferenceMappings: Boolean(pipelineReferenceMappings)
    });

    // Tier 1: Reference ID mapping (most specific)
    if (pipelineName && activityName && pipelineReferenceMappings) {
      const referenceId = `${pipelineName}_${activityName}_dataset`;
      const pipelineMappings = pipelineReferenceMappings[pipelineName];
      if (pipelineMappings?.[referenceId]) {
        console.log(`[DeleteActivityTransformer] ✓ Tier 1 - Found via referenceId: ${referenceId} → ${pipelineMappings[referenceId]}`);
        return pipelineMappings[referenceId];
      }
      console.log(`[DeleteActivityTransformer] ✗ Tier 1 - referenceId not found: ${referenceId}`);
    }

    // Tier 2: Activity name mapping (OLD format)
    if (pipelineName && activityName && pipelineConnectionMappings) {
      const pipelineMappings = pipelineConnectionMappings[pipelineName];
      const activityMapping = pipelineMappings?.[activityName];
      if (activityMapping && typeof activityMapping === 'object' && 'selectedConnectionId' in activityMapping) {
        const connectionId = (activityMapping as any).selectedConnectionId;
        if (typeof connectionId === 'string') {
          console.log(`[DeleteActivityTransformer] ✓ Tier 2 - Found via activityName: ${activityName} → ${connectionId}`);
          return connectionId;
        }
      }
      console.log(`[DeleteActivityTransformer] ✗ Tier 2 - activityName not found: ${activityName}`);
    }

    // Tier 3: LinkedService bridge mapping (direct linkedService match)
    if (pipelineName && pipelineConnectionMappings) {
      const pipelineMappings = pipelineConnectionMappings[pipelineName];
      if (pipelineMappings) {
        for (const key in pipelineMappings) {
          const mapping = pipelineMappings[key];
          if (mapping?.linkedServiceReference?.name === linkedServiceName && mapping?.selectedConnectionId) {
            console.log(`[DeleteActivityTransformer] ✓ Tier 3 - Found via linkedService mapping: ${linkedServiceName} → ${mapping.selectedConnectionId}`);
            return mapping.selectedConnectionId;
          }
        }
      }
      console.log(`[DeleteActivityTransformer] ✗ Tier 3 - linkedServiceName not found: ${linkedServiceName}`);
    }

    console.warn(`[DeleteActivityTransformer] ✗ All tiers failed - No connection found for linkedService: ${linkedServiceName}`);
    return undefined;
  }

  /**
   * Build inline datasetSettings object for Fabric format
   * 
   * Maps ADF dataset types to Fabric types and includes connection references
   * Structure matches GetMetadata/Lookup transformers
   */
  private buildDatasetSettings(
    dataset: DatasetDefinition,
    connectionId?: string,
    datasetParameters?: Record<string, any>
  ): any {
    const properties = dataset.definition?.properties || {};
    const datasetType = properties.type;
    const originalTypeProperties = properties.typeProperties || {};

    console.log(`[DeleteActivityTransformer] Building datasetSettings for type: ${datasetType}`, {
      hasConnectionId: Boolean(connectionId),
      hasParameters: Object.keys(datasetParameters || {}).length > 0
    });

    // Map ADF dataset type to Fabric type
    const fabricType = this.mapDatasetTypeToFabric(datasetType);

    // Build typeProperties with parameter substitution
    let typeProperties = this.buildDatasetTypeProperties(
      originalTypeProperties,
      datasetType,
      datasetParameters
    );

    // Apply deep parameter substitution to replace ALL @dataset() references
    typeProperties = DatasetParameterSubstitution.applyParametersToTypeProperties(
      typeProperties,
      datasetParameters
    );

    // Build datasetSettings matching GetMetadata/Lookup structure
    const datasetSettings: any = {
      annotations: properties.annotations || [],
      type: fabricType,  // Type at root level, NOT nested in typeProperties
      typeProperties: typeProperties
    };

    // Add schema if present
    if (properties.schema && properties.schema.length > 0) {
      datasetSettings.schema = properties.schema;
    }

    // Add connection reference if available
    if (connectionId) {
      datasetSettings.externalReferences = {
        connection: connectionId
      };
      console.log(`[DeleteActivityTransformer] Added connection reference: ${connectionId}`);
    } else {
      console.warn(`[DeleteActivityTransformer] No connection ID - datasetSettings will need manual mapping`);
    }

    return datasetSettings;
  }

  /**
   * Map ADF dataset types to Fabric equivalents
   */
  private mapDatasetTypeToFabric(adfType: string): string {
    const typeMapping: Record<string, string> = {
      'AzureBlobFSFile': 'Binary',
      'DelimitedText': 'DelimitedText',
      'Parquet': 'Binary',  // Changed from 'Parquet' to 'Binary' per expected output
      'Json': 'Json',
      'Avro': 'Avro',
      'Orc': 'Orc',
      'Binary': 'Binary',
      'AzureSqlTable': 'AzureSqlTable',
      'AzureTable': 'AzureTable',
      'AzureBlob': 'Binary',
      'AzureBlobStorage': 'Binary',
      'Excel': 'Excel',
      'Xml': 'Xml'
    };

    const mappedType = typeMapping[adfType] || 'Binary';
    
    if (!typeMapping[adfType]) {
      console.warn(`[DeleteActivityTransformer] Unknown dataset type ${adfType}, defaulting to Binary`);
    }

    return mappedType;
  }

  /**
   * Build typeProperties for dataset with proper structure
   * Matches the structure from GetMetadata/Lookup transformers
   */
  private buildDatasetTypeProperties(
    originalTypeProperties: Record<string, any>,
    datasetType: string,
    datasetParameters?: Record<string, any>
  ): any {
    // For file-based datasets (Blob, ADLS, etc.), ensure location structure
    if (datasetType === 'Parquet' || 
        datasetType === 'Binary' || 
        datasetType === 'AzureBlobFSFile' ||
        datasetType === 'AzureBlobStorage' ||
        datasetType === 'DelimitedText') {
      
      const location = originalTypeProperties.location || {};
      
      return {
        location: {
          type: location.type || 'AzureBlobFSLocation',
          ...(location.fileName && { fileName: location.fileName }),
          ...(location.folderPath && { folderPath: location.folderPath }),
          ...(location.fileSystem && { fileSystem: location.fileSystem }),
          ...(location.container && { container: location.container })
        }
      };
    }

    // For SQL datasets
    if (datasetType === 'AzureSqlTable' || datasetType === 'SqlServerTable') {
      return {
        ...(originalTypeProperties.schema && { schema: originalTypeProperties.schema }),
        ...(originalTypeProperties.table && { table: originalTypeProperties.table }),
        ...(originalTypeProperties.database && { database: originalTypeProperties.database })
      };
    }

    // For other types, return as-is
    return { ...originalTypeProperties };
  }

  /**
   * Transform logStorageSettings from ADF to Fabric format
   * Converts linkedServiceName reference to externalReferences.connection
   * Applies parameter substitution to path expressions
   */
  private transformLogStorageSettings(
    logStorageSettings: any,
    connectionId?: string,
    datasetParameters?: Record<string, any>
  ): any {
    const transformed: any = {};

    // Transform path - keep as Expression if it contains pipeline references
    if (logStorageSettings.path) {
      const pathValue = logStorageSettings.path.value || logStorageSettings.path;
      
      // Apply parameter substitution
      const substitutedPath = DatasetParameterSubstitution.applyParametersToTypeProperties(
        { path: pathValue },
        datasetParameters
      ).path;

      // Keep as Expression wrapper if it contains pipeline/activity references
      if (typeof substitutedPath === 'string' && 
          (substitutedPath.includes('@pipeline') || substitutedPath.includes('@activity'))) {
        transformed.path = {
          value: substitutedPath,
          type: 'Expression'
        };
      } else {
        transformed.path = substitutedPath;
      }
    }

    // Add connection reference instead of linkedServiceName
    if (connectionId) {
      transformed.externalReferences = {
        connection: connectionId
      };
    }

    // Remove original linkedServiceName reference
    // DO NOT include linkedServiceName in Fabric format

    console.log(`[DeleteActivityTransformer] Transformed logStorageSettings`, {
      hadLinkedServiceName: Boolean(logStorageSettings.linkedServiceName),
      hasPath: Boolean(transformed.path),
      hasConnection: Boolean(connectionId)
    });

    return transformed;
  }
}

// Export singleton instance
export const deleteActivityTransformer = new DeleteActivityTransformer();
