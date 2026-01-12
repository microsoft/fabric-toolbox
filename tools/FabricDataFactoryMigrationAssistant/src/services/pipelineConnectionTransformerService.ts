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
   * @param connectionMappings The mappings from activities to Fabric connections (OLD format - backward compatibility)
   * @param pipelineReferenceMappings The reference-based mappings (NEW format - from ComponentMappingTableV2)
   * @param linkedServiceBridge Bridge mappings from Configure Connections page
   * @returns The transformed pipeline definition
   */
  static transformPipelineWithConnections(
    pipelineDefinition: any,
    pipelineName: string,
    connectionMappings: PipelineConnectionMappings,
    pipelineReferenceMappings?: Record<string, Record<string, string>>,
    linkedServiceBridge?: Record<string, any>
  ): any {
    if (!pipelineDefinition || !pipelineDefinition.properties) {
      console.warn(`Invalid pipeline definition for ${pipelineName}`);
      return pipelineDefinition;
    }

    const transformedDefinition = JSON.parse(JSON.stringify(pipelineDefinition));
    const activities = transformedDefinition.properties.activities || [];

    const pipelineMappings = connectionMappings[pipelineName] || {};
    const referenceMappings = pipelineReferenceMappings?.[pipelineName] || {};
    
    console.log(`Applying connection mappings for pipeline '${pipelineName}':`, {
      availableMappings: Object.keys(pipelineMappings),
      availableReferenceMappings: Object.keys(referenceMappings),
      activitiesCount: activities.length,
      mappingsCount: Object.keys(pipelineMappings).length,
      referenceMappingsCount: Object.keys(referenceMappings).length,
      hasLinkedServiceBridge: Boolean(linkedServiceBridge)
    });

    /**
     * Helper: Find connection ID for activity with 4-tier fallback system and logging
     * Priority 1: 🎯 NEW referenceMappings (referenceId-based from ComponentMappingTableV2)
     * Priority 2: 🔄 OLD pipelineConnectionMappings (backward compatibility)
     * Priority 3: 🌉 BRIDGE linkedServiceBridge (from Configure Connections page)
     * Priority 4: ❌ MISS - no mapping found
     */
    const findConnectionIdForActivity = (activityName: string, referenceId?: string, linkedServiceName?: string): string | undefined => {
      // Priority 1: Try NEW referenceMappings
      if (referenceId && referenceMappings[referenceId]) {
        console.log(`  🎯 NEW format hit: ${activityName} (${referenceId}) → ${referenceMappings[referenceId]}`);
        return referenceMappings[referenceId];
      }

      // Priority 2: Try OLD pipelineConnectionMappings (activity name based)
      const activityMapping = pipelineMappings[activityName];
      if (activityMapping?.selectedConnectionId) {
        console.log(`  🔄 OLD format hit: ${activityName} → ${activityMapping.selectedConnectionId}`);
        return activityMapping.selectedConnectionId;
      }

      // Priority 3: Try linkedServiceBridge (from Configure Connections)
      if (linkedServiceName && linkedServiceBridge?.[linkedServiceName]) {
        const bridgeConnectionId = linkedServiceBridge[linkedServiceName].connectionId;
        console.log(`  🌉 BRIDGE hit: ${activityName} (${linkedServiceName}) → ${bridgeConnectionId}`);
        return bridgeConnectionId;
      }

      // Priority 4: No mapping found
      console.log(`  ❌ MISS: ${activityName} (referenceId: ${referenceId || 'none'}, linkedService: ${linkedServiceName || 'none'})`);
      return undefined;
    };

    /**
     * Recursive function to process activity and ALL nested activities
     * Applies connection mappings at all nesting depths
     * @param activity Activity to process
     * @param depth Recursion depth (0 = top-level, 1+ = nested)
     */
    const processActivity = (activity: any, depth: number = 0): void => {
      if (!activity?.name) return;

      const indent = '  '.repeat(depth);
      console.log(`${indent}[Depth ${depth}] Processing activity '${activity.name}':`, {
        type: activity.type,
        hasDatasetSettings: Boolean(activity.typeProperties?.datasetSettings),
        hasLinkedServiceRefs: this.activityHasLinkedServiceReferences(activity)
      });

      // ============================================================================
      // VALIDATION HANDLER (from Phase 0)
      // ============================================================================
      if (activity.type === 'Validation') {
        console.warn(`${indent}[VALIDATION] Activity '${activity.name}' not supported in Fabric - marking as Inactive`);
        
        activity.state = 'Inactive';
        activity.onInactiveMarkAs = 'Succeeded';
        
        if (activity.typeProperties?.dataset) {
          const datasetRef = activity.typeProperties.dataset.referenceName || 'unknown';
          console.warn(`${indent}  → Removing dataset reference: ${datasetRef}`);
          delete activity.typeProperties.dataset;
        }
        
        console.log(`${indent}  ✅ Validation activity '${activity.name}' marked as Inactive`);
        return;
      }

      // ============================================================================
      // LOOKUP/GETMETADATA/DELETE HANDLER (existing + Delete added)
      // ============================================================================
      if ((activity.type === 'Lookup' || activity.type === 'GetMetadata' || activity.type === 'Delete') && 
          activity.typeProperties?.datasetSettings) {
        
        console.log(`${indent}Applying dataset-level connection for ${activity.type} activity '${activity.name}'`);
        
        const datasetReferenceId = `${pipelineName}_${activity.name}_dataset`;
        
        const connectionId = findConnectionIdForActivity(
          activity.name,
          datasetReferenceId,
          undefined
        );

        if (connectionId) {
          console.log(`${indent}  ✅ Found connection: ${datasetReferenceId} → ${connectionId}`);
          
          if (!activity.typeProperties.datasetSettings.externalReferences) {
            activity.typeProperties.datasetSettings.externalReferences = {};
          }
          activity.typeProperties.datasetSettings.externalReferences.connection = connectionId;

          console.log(`${indent}  ✅ Applied dataset connection to ${activity.name}`);
        } else {
          console.warn(`${indent}  ❌ No connection mapping found - marking as Inactive`);
          activity.state = 'Inactive';
          activity.onInactiveMarkAs = 'Succeeded';
        }
      } else {
        // ========================================================================
        // STANDARD ACTIVITY-LEVEL CONNECTION HANDLER (existing)
        // ========================================================================
        const activityLevelReferenceId = `${pipelineName}_${activity.name}_activity`;
        const linkedServiceName = activity.linkedServiceName?.referenceName;
        
        const connectionId = findConnectionIdForActivity(
          activity.name,
          activityLevelReferenceId,
          linkedServiceName
        );

        if (connectionId) {
          this.applyConnectionMappingToActivity(activity, connectionId, activityLevelReferenceId);
        } else {
          this.handleUnmappedLinkedServiceReferences(activity, pipelineName);
        }
      }

      // ============================================================================
      // STANDARD TRANSFORMATIONS (existing)
      // ============================================================================
      try {
        activityTransformer.transformLinkedServiceReferencesToFabric(activity, connectionMappings);
      } catch (error) {
        console.warn(`${indent}Failed to transform activity ${activity.name}:`, error);
      }

      // ============================================================================
      // RECURSION: Process nested activities based on container type
      // ============================================================================
      const nextDepth = depth + 1;

      // Container Type 1: ForEach
      if (activity.type === 'ForEach' && activity.typeProperties?.activities) {
        const nestedActivities = activity.typeProperties.activities;
        console.log(`${indent}  ↳ ForEach '${activity.name}': Processing ${nestedActivities.length} nested activities`);
        nestedActivities.forEach((nested: any) => processActivity(nested, nextDepth));
      }

      // Container Type 2: IfCondition
      if (activity.type === 'IfCondition') {
        if (activity.typeProperties?.ifTrueActivities?.length > 0) {
          const trueActivities = activity.typeProperties.ifTrueActivities;
          console.log(`${indent}  ↳ IfCondition '${activity.name}': Processing ${trueActivities.length} TRUE branch activities`);
          trueActivities.forEach((nested: any) => processActivity(nested, nextDepth));
        }

        if (activity.typeProperties?.ifFalseActivities?.length > 0) {
          const falseActivities = activity.typeProperties.ifFalseActivities;
          console.log(`${indent}  ↳ IfCondition '${activity.name}': Processing ${falseActivities.length} FALSE branch activities`);
          falseActivities.forEach((nested: any) => processActivity(nested, nextDepth));
        }
      }

      // Container Type 3: Switch
      if (activity.type === 'Switch') {
        if (activity.typeProperties?.cases?.length > 0) {
          const cases = activity.typeProperties.cases;
          console.log(`${indent}  ↳ Switch '${activity.name}': Processing ${cases.length} cases`);
          
          cases.forEach((caseItem: any, caseIndex: number) => {
            if (caseItem.activities?.length > 0) {
              console.log(`${indent}    ↳ Case ${caseIndex}: Processing ${caseItem.activities.length} activities`);
              caseItem.activities.forEach((nested: any) => processActivity(nested, nextDepth));
            }
          });
        }

        if (activity.typeProperties?.defaultActivities?.length > 0) {
          const defaultActivities = activity.typeProperties.defaultActivities;
          console.log(`${indent}  ↳ Switch '${activity.name}': Processing ${defaultActivities.length} default activities`);
          defaultActivities.forEach((nested: any) => processActivity(nested, nextDepth));
        }
      }

      // Container Type 4: Until
      if (activity.type === 'Until' && activity.typeProperties?.activities?.length > 0) {
        const nestedActivities = activity.typeProperties.activities;
        console.log(`${indent}  ↳ Until '${activity.name}': Processing ${nestedActivities.length} nested activities`);
        nestedActivities.forEach((nested: any) => processActivity(nested, nextDepth));
      }

      console.log(`${indent}✓ Completed '${activity.name}' (${activity.type}, depth ${depth})`);
    };

    // ============================================================================
    // ENTRY POINT: Process all top-level activities
    // ============================================================================
    console.log(`Starting recursive activity processing for pipeline '${pipelineName}'`);
    activities.forEach((activity: any) => processActivity(activity, 0));
    console.log(`Completed recursive activity processing for pipeline '${pipelineName}'`);

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