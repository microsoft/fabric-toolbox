import { PipelineActivityAnalysisService } from './pipelineActivityAnalysisService';
import { activityTransformer } from './activityTransformer';
import { PipelineConnectionMappings, ActivityConnectionMapping } from '../types';

/**
 * Service for applying connection mappings to pipeline definitions
 * This service applies the mappings configured in the Map Components stage to actual pipeline definitions
 */
export class PipelineConnectionTransformerService {
  /**
   * Transforms a pipeline definition by applying connection mappings
   * @param pipelineDefinition The original pipeline definition
   * @param pipelineName The name of the pipeline
   * @param connectionMappings The mappings from activities to Fabric connections
   * @returns The transformed pipeline definition
   */
  static transformPipelineWithConnections(
    pipelineDefinition: any,
    pipelineName: string,
    connectionMappings: PipelineConnectionMappings
  ): any {
    if (!pipelineDefinition || !pipelineDefinition.properties) {
      console.warn(`Invalid pipeline definition for ${pipelineName}`);
      return pipelineDefinition;
    }

    const transformedDefinition = JSON.parse(JSON.stringify(pipelineDefinition));
    const activities = transformedDefinition.properties.activities || [];

    const pipelineMappings = connectionMappings[pipelineName] || {};
    
    console.log(`Applying connection mappings for pipeline '${pipelineName}':`, {
      availableMappings: Object.keys(pipelineMappings),
      activitiesCount: activities.length,
      mappingsCount: Object.keys(pipelineMappings).length
    });

    // Transform each activity
    activities.forEach((activity: any) => {
      if (!activity?.name) return;

      // Find all mappings for this activity (since we now use unique IDs that include LinkedService name)
      const activityMappings = Object.entries(pipelineMappings).filter(([key, mapping]) => {
        // Check if this mapping key starts with the activity name
        return key.startsWith(`${activity.name}_`);
      });

      console.log(`Processing activity '${activity.name}':`, {
        type: activity.type,
        foundMappings: activityMappings.length,
        mappingKeys: activityMappings.map(([key]) => key),
        hasLinkedServiceRefs: this.activityHasLinkedServiceReferences(activity)
      });

      if (activityMappings.length > 0) {
        // Apply all connection mappings for this activity
        activityMappings.forEach(([mappingKey, activityMapping]) => {
          if (activityMapping?.selectedConnectionId) {
            console.log(`Applying connection mapping: ${mappingKey} -> ${activityMapping.selectedConnectionId}`);
            
            // Apply the connection mapping to this activity
            this.applyConnectionMappingToActivity(activity, activityMapping.selectedConnectionId, mappingKey);
          } else {
            console.warn(`Connection mapping '${mappingKey}' has no selectedConnectionId`);
          }
        });
      } else {
        // No specific mapping found, check if this activity has LinkedService references that need to be handled
        this.handleUnmappedLinkedServiceReferences(activity, pipelineName);
      }

      // Apply standard activity transformations (convert text to expressions, etc.)
      try {
        activityTransformer.transformLinkedServiceReferencesToFabric(activity, connectionMappings);
      } catch (error) {
        console.warn(`Failed to transform activity ${activity.name}:`, error);
      }
    });

    console.log(`Completed connection mapping application for pipeline '${pipelineName}'`);
    return transformedDefinition;
  }

  /**
   * Applies a specific Fabric connection ID to an activity
   * @param activity The activity to transform
   * @param connectionId The Fabric connection ID to use
   * @param mappingKey Optional mapping key for logging purposes
   */
  private static applyConnectionMappingToActivity(activity: any, connectionId: string, mappingKey?: string): void {
    console.log(`Applying connection mapping to activity '${activity.name}':`, {
      activityType: activity.type,
      connectionId,
      mappingKey,
      hasExistingExternalReferences: Boolean(activity.externalReferences),
      currentExternalReferences: activity.externalReferences
    });

    // Remove any existing LinkedService references
    this.removeLinkedServiceReferences(activity);

    // Add the Fabric connection reference
    if (!activity.externalReferences) {
      activity.externalReferences = {};
    }
    
    // Use the connection ID exactly as provided
    activity.externalReferences.connection = connectionId;

    console.log(`✅ Successfully applied connection mapping: Activity '${activity.name}' (${mappingKey || 'unknown'}) -> Connection '${connectionId}'`, {
      finalExternalReferences: activity.externalReferences,
      connectionIdType: typeof connectionId,
      connectionIdValue: connectionId
    });
  }

  /**
   * Removes LinkedService references from an activity
   * @param activity The activity to modify
   */
  private static removeLinkedServiceReferences(activity: any): void {
    // Remove direct linkedServiceName references
    if (activity.linkedServiceName) {
      delete activity.linkedServiceName;
    }

    // Remove linkedServiceName from typeProperties
    if (activity.typeProperties?.linkedServiceName) {
      delete activity.typeProperties.linkedServiceName;
    }

    // Remove linkedServices array from typeProperties
    if (activity.typeProperties?.linkedServices) {
      delete activity.typeProperties.linkedServices;
    }

    // Remove LinkedService references from datasets
    this.removeLinkedServiceReferencesFromDatasets(activity);
  }

  /**
   * Removes LinkedService references from dataset definitions within activities
   * @param activity The activity to process
   */
  private static removeLinkedServiceReferencesFromDatasets(activity: any): void {
    const typeProperties = activity.typeProperties;
    if (!typeProperties) return;

    // Handle source/sink datasets
    if (typeProperties.source?.dataset) {
      this.cleanDatasetReference(typeProperties.source.dataset);
    }
    if (typeProperties.sink?.dataset) {
      this.cleanDatasetReference(typeProperties.sink.dataset);
    }

    // Handle direct dataset references
    if (typeProperties.dataset) {
      this.cleanDatasetReference(typeProperties.dataset);
    }

    // Handle inputs/outputs arrays
    if (Array.isArray(activity.inputs)) {
      activity.inputs.forEach((input: any) => this.cleanDatasetReference(input));
    }
    if (Array.isArray(activity.outputs)) {
      activity.outputs.forEach((output: any) => this.cleanDatasetReference(output));
    }
  }

  /**
   * Cleans up dataset references by removing LinkedService references
   * @param datasetRef The dataset reference to clean
   */
  private static cleanDatasetReference(datasetRef: any): void {
    if (!datasetRef) return;

    // Remove linkedService references from dataset definitions
    if (datasetRef.linkedServiceName) {
      delete datasetRef.linkedServiceName;
    }
    if (datasetRef.properties?.linkedServiceName) {
      delete datasetRef.properties.linkedServiceName;
    }
  }

  /**
   * Handles activities that have LinkedService references but no explicit mapping
   * These activities will be marked as inactive to prevent deployment errors
   * @param activity The activity to handle
   * @param pipelineName The pipeline name for logging
   */
  private static handleUnmappedLinkedServiceReferences(activity: any, pipelineName: string): void {
    // Check if this activity has any LinkedService references
    const hasLinkedServiceRef = this.activityHasLinkedServiceReferences(activity);

    if (hasLinkedServiceRef) {
      console.warn(`Activity ${activity.name} in pipeline ${pipelineName} has LinkedService references but no connection mapping. Marking as inactive.`);
      
      // Mark the activity as inactive
      activity.state = 'Inactive';
      activity.onInactiveMarkAs = 'Succeeded';

      // Remove the LinkedService references to prevent deployment errors
      this.removeLinkedServiceReferences(activity);
    }
  }

  /**
   * Checks if an activity has LinkedService references
   * @param activity The activity to check
   * @returns True if the activity has LinkedService references
   */
  private static activityHasLinkedServiceReferences(activity: any): boolean {
    if (!activity) return false;

    // Check direct LinkedService references
    if (activity.linkedServiceName?.referenceName) return true;
    if (activity.typeProperties?.linkedServiceName?.referenceName) return true;
    if (activity.typeProperties?.linkedServices?.length > 0) return true;

    // Check dataset LinkedService references
    const typeProperties = activity.typeProperties;
    if (typeProperties?.source?.dataset?.properties?.linkedServiceName) return true;
    if (typeProperties?.sink?.dataset?.properties?.linkedServiceName) return true;
    if (typeProperties?.dataset?.properties?.linkedServiceName) return true;

    // Check inputs/outputs for dataset references with LinkedServices
    if (Array.isArray(activity.inputs)) {
      for (const input of activity.inputs) {
        if (input?.properties?.linkedServiceName || input?.linkedServiceName) return true;
      }
    }

    if (Array.isArray(activity.outputs)) {
      for (const output of activity.outputs) {
        if (output?.properties?.linkedServiceName || output?.linkedServiceName) return true;
      }
    }

    return false;
  }

  /**
   * Gets a summary of all connection mappings applied to a pipeline
   * @param pipelineName The pipeline name
   * @param connectionMappings The mappings configuration
   * @returns Summary of applied mappings
   */
  static getConnectionMappingSummary(
    pipelineName: string,
    connectionMappings: PipelineConnectionMappings
  ): { totalActivities: number; mappedActivities: number; unmappedActivities: string[] } {
    const pipelineMappings = connectionMappings[pipelineName] || {};
    const mappedActivities = Object.keys(pipelineMappings).filter(
      activityName => pipelineMappings[activityName]?.selectedConnectionId
    );

    const unmappedActivities = Object.keys(pipelineMappings).filter(
      activityName => !pipelineMappings[activityName]?.selectedConnectionId
    );

    return {
      totalActivities: Object.keys(pipelineMappings).length,
      mappedActivities: mappedActivities.length,
      unmappedActivities
    };
  }

  /**
   * Validates that all required connection mappings are in place
   * @param pipelineComponents Array of pipeline components
   * @param connectionMappings The mappings configuration
   * @returns Validation result with any missing mappings
   */
  static validateConnectionMappings(
    pipelineComponents: any[],
    connectionMappings: PipelineConnectionMappings
  ): { isValid: boolean; missingMappings: string[]; warnings: string[] } {
    const missingMappings: string[] = [];
    const warnings: string[] = [];

    pipelineComponents.forEach(component => {
      if (component.type !== 'pipeline') return;

      const activityReferences = PipelineActivityAnalysisService.analyzePipelineActivities(component);
      const pipelineMappings = connectionMappings[component.name] || {};

      activityReferences.forEach(ref => {
        const activityMapping = pipelineMappings[ref.activityName];
        const linkedServiceName = ref.linkedServiceName || ref.datasetLinkedServiceName;

        if (!activityMapping?.selectedConnectionId && linkedServiceName) {
          missingMappings.push(`${component.name}.${ref.activityName} -> ${linkedServiceName}`);
        }
      });
    });

    if (missingMappings.length > 0) {
      warnings.push(`${missingMappings.length} activities will be marked as inactive due to missing connection mappings`);
    }

    return {
      isValid: true, // We allow missing mappings but mark activities as inactive
      missingMappings,
      warnings
    };
  }

  /**
   * Generates the Base64 encoded payload for Fabric pipeline creation
   * @param pipelineDefinition The transformed pipeline definition
   * @returns Base64 encoded pipeline JSON for Fabric API
   */
  static generateFabricPipelinePayload(pipelineDefinition: any): string {
    // The Fabric API requires the pipeline definition to be Base64 encoded
    const pipelineJson = JSON.stringify(pipelineDefinition);
    return btoa(pipelineJson);
  }

  /**
   * Cleans pipeline definition by removing ADF-specific properties that Fabric doesn't support
   * @param pipelineDefinition The pipeline definition to clean
   * @returns Cleaned pipeline definition ready for Fabric deployment
   */
  static cleanPipelineForFabric(pipelineDefinition: any): any {
    if (!pipelineDefinition || typeof pipelineDefinition !== 'object') {
      return pipelineDefinition;
    }

    // Deep clone to avoid mutating the original
    const cleaned = JSON.parse(JSON.stringify(pipelineDefinition));

    // Clean activities array
    if (Array.isArray(cleaned.properties?.activities)) {
      cleaned.properties.activities = cleaned.properties.activities.map((activity: any) => {
        if (!activity || typeof activity !== 'object') return activity;

        // Remove IntegrationRuntimeReference from connectVia
        if (activity.connectVia?.type === 'IntegrationRuntimeReference') {
          activity.connectVia = {};
        }

        // Remove ADF-specific properties
        delete activity.linkedServiceName;
        delete activity.linkedService;

        return activity;
      });
    }

    return cleaned;
  }
}