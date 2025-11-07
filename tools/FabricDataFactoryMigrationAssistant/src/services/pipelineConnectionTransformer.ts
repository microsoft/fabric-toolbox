/**
 * Service for transforming ADF pipeline definitions to use Fabric connection references
 * Handles mapping of LinkedService references to Fabric connection IDs
 */

export interface PipelineActivityConnectionMapping {
  pipelineName: string;
  activityName: string;
  activityType: string;
  linkedServiceName?: string;
  linkedServiceType?: string;
  datasetName?: string;
  fabricConnectionId?: string;
  status: 'pending' | 'mapped' | 'skipped';
}

export interface FabricPipelineTransformResult {
  fabricPipelineDefinition: any;
  warnings: string[];
  errors: string[];
}

export class PipelineConnectionTransformer {
  /**
   * Transform an ADF pipeline definition to use Fabric connection references
   */
  static transformPipeline(
    adfPipelineDefinition: any,
    pipelineName: string,
    activityMappings: Record<string, PipelineActivityConnectionMapping[]>
  ): FabricPipelineTransformResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // Deep clone the pipeline definition to avoid mutating the original
    const fabricPipeline = JSON.parse(JSON.stringify(adfPipelineDefinition));
    
    // Get mappings for this specific pipeline
    const pipelineMappings = activityMappings[pipelineName] || [];
    
    // Create a lookup map for quick access
    const mappingLookup = new Map<string, PipelineActivityConnectionMapping>();
    pipelineMappings.forEach(mapping => {
      mappingLookup.set(mapping.activityName, mapping);
    });
    
    // Transform activities
    if (fabricPipeline.properties?.activities) {
      fabricPipeline.properties.activities = fabricPipeline.properties.activities.map((activity: any) => {
        return this.transformActivity(activity, mappingLookup, warnings, errors);
      });
    }
    
    return {
      fabricPipelineDefinition: fabricPipeline,
      warnings,
      errors
    };
  }
  
  /**
   * Transform an individual activity to use Fabric connection references
   */
  private static transformActivity(
    activity: any,
    mappingLookup: Map<string, PipelineActivityConnectionMapping>,
    warnings: string[],
    errors: string[]
  ): any {
    const transformedActivity = { ...activity };
    const mapping = mappingLookup.get(activity.name);
    
    // Remove ADF-specific linkedServiceName references
    this.removeADFLinkedServiceReferences(transformedActivity);
    
    // Add Fabric external references if we have a mapping
    if (mapping && mapping.fabricConnectionId && mapping.status === 'mapped') {
      this.addFabricExternalReferences(transformedActivity, mapping.fabricConnectionId);
    } else if (mapping && mapping.linkedServiceName && mapping.status !== 'mapped') {
      // Mark activity as inactive if it has an unmapped linked service reference
      transformedActivity.state = 'Inactive';
      transformedActivity.onInactiveMarkAs = 'Succeeded';
      warnings.push(`Activity '${activity.name}' marked as inactive due to unmapped LinkedService '${mapping.linkedServiceName}'`);
    }
    
    // Transform typeProperties to use Fabric expression format
    if (transformedActivity.typeProperties) {
      transformedActivity.typeProperties = this.transformTypeProperties(transformedActivity.typeProperties);
    }
    
    return transformedActivity;
  }
  
  /**
   * Remove ADF-specific LinkedService references from activity
   */
  private static removeADFLinkedServiceReferences(activity: any): void {
    // Remove direct linkedServiceName references
    if (activity.linkedServiceName) {
      delete activity.linkedServiceName;
    }
    
    // Remove linkedServiceName from typeProperties
    if (activity.typeProperties?.linkedServiceName) {
      delete activity.typeProperties.linkedServiceName;
    }
    
    // Remove linkedServices array from typeProperties (e.g., WebActivity)
    if (activity.typeProperties?.linkedServices) {
      delete activity.typeProperties.linkedServices;
    }
    
    // Remove linkedServiceName from source/sink in typeProperties
    if (activity.typeProperties?.source?.linkedServiceName) {
      delete activity.typeProperties.source.linkedServiceName;
    }
    
    if (activity.typeProperties?.sink?.linkedServiceName) {
      delete activity.typeProperties.sink.linkedServiceName;
    }
  }
  
  /**
   * Add Fabric external references to activity
   */
  private static addFabricExternalReferences(activity: any, connectionId: string): void {
    // Add externalReferences at activity level for activities that directly reference connections
    if (this.isDirectConnectionActivity(activity.type)) {
      activity.externalReferences = {
        connection: connectionId
      };
    }
    
    // For Copy activities and others with datasets, add connection references to datasetSettings
    if (this.isDatasetActivity(activity.type)) {
      this.addDatasetConnectionReferences(activity, connectionId);
    }
  }
  
  /**
   * Check if activity type directly references connections
   */
  private static isDirectConnectionActivity(activityType: string): boolean {
    const directConnectionTypes = [
      'Script',
      'StoredProcedure',
      'WebActivity',
      'AzureFunctionActivity',
      'DatabricksNotebook',
      'DatabricksSparkJar',
      'DatabricksSparkPython',
      'ExecuteSSISPackage'
    ];
    return directConnectionTypes.includes(activityType);
  }
  
  /**
   * Check if activity type uses datasets
   */
  private static isDatasetActivity(activityType: string): boolean {
    const datasetActivityTypes = [
      'Copy',
      'Lookup',
      'GetMetadata',
      'Delete'
    ];
    return datasetActivityTypes.includes(activityType);
  }
  
  /**
   * Add connection references to dataset settings
   */
  private static addDatasetConnectionReferences(activity: any, connectionId: string): void {
    // For Copy activities
    if (activity.type === 'Copy') {
      if (activity.typeProperties?.source) {
        activity.typeProperties.source.datasetSettings = {
          ...activity.typeProperties.source.datasetSettings,
          externalReferences: {
            connection: connectionId
          }
        };
      }
      
      if (activity.typeProperties?.sink) {
        activity.typeProperties.sink.datasetSettings = {
          ...activity.typeProperties.sink.datasetSettings,
          externalReferences: {
            connection: connectionId
          }
        };
      }
    }
    
    // For other dataset activities
    if (activity.typeProperties?.dataset) {
      activity.typeProperties.datasetSettings = {
        externalReferences: {
          connection: connectionId
        }
      };
    }
  }
  
  /**
   * Transform typeProperties to use Fabric expression format
   */
  private static transformTypeProperties(typeProperties: any): any {
    const transformed = { ...typeProperties };
    
    // Transform string values to expression objects for certain fields
    if (transformed.scripts && Array.isArray(transformed.scripts)) {
      transformed.scripts = transformed.scripts.map((script: any) => ({
        ...script,
        text: this.toExpressionObject(script.text)
      }));
    }
    
    // Add required Fabric-specific properties
    if (transformed.scripts) {
      transformed.scriptBlockExecutionTimeout = transformed.scriptBlockExecutionTimeout || '02:00:00';
    }
    
    return transformed;
  }
  
  /**
   * Convert string value to Fabric expression object format
   */
  private static toExpressionObject(value: any): any {
    if (typeof value === 'string') {
      return {
        value: value,
        type: 'Expression'
      };
    }
    return value;
  }
  
  /**
   * Validate that all required mappings are present
   */
  static validatePipelineMappings(
    pipelineName: string,
    activityMappings: PipelineActivityConnectionMapping[]
  ): { isValid: boolean; missingMappings: string[] } {
    const missingMappings: string[] = [];
    
    activityMappings.forEach(mapping => {
      if (mapping.linkedServiceName && mapping.status !== 'mapped') {
        missingMappings.push(`${mapping.activityName} -> ${mapping.linkedServiceName}`);
      }
    });
    
    return {
      isValid: missingMappings.length === 0,
      missingMappings
    };
  }
  
  /**
   * Get summary of pipeline transformation
   */
  static getPipelineTransformationSummary(
    pipelineName: string,
    activityMappings: PipelineActivityConnectionMapping[]
  ): {
    totalActivities: number;
    activitiesWithConnections: number;
    mappedActivities: number;
    unmappedActivities: number;
    skippedActivities: number;
  } {
    const activitiesWithConnections = activityMappings.filter(m => m.linkedServiceName);
    const mappedActivities = activitiesWithConnections.filter(m => m.status === 'mapped');
    const unmappedActivities = activitiesWithConnections.filter(m => m.status === 'pending');
    const skippedActivities = activitiesWithConnections.filter(m => m.status === 'skipped');
    
    return {
      totalActivities: activityMappings.length,
      activitiesWithConnections: activitiesWithConnections.length,
      mappedActivities: mappedActivities.length,
      unmappedActivities: unmappedActivities.length,
      skippedActivities: skippedActivities.length
    };
  }
}