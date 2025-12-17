import { activityTransformer } from './activityTransformer';
import { copyActivityTransformer } from './copyActivityTransformer';
import { customActivityTransformer } from './customActivityTransformer';
import { hdinsightActivityTransformer } from './hdinsightActivityTransformer';
import { lookupActivityTransformer } from './lookupActivityTransformer';
import { getMetadataActivityTransformer } from './getMetadataActivityTransformer';
import { connectionService } from './connectionService';
import { fabricApiClient } from './fabricApiClient';
import { ADFComponent, DeploymentResult, PipelineConnectionMappings, LinkedServiceConnectionBridge } from '../types';
import { PipelineConnectionTransformerService } from './pipelineConnectionTransformerService';

export class PipelineTransformer {
  // Store current pipeline name for activity transformation context
  private currentPipelineName: string = '';
  
  // Store reference mappings and bridge for Custom activity transformation
  private referenceMappings?: Record<string, Record<string, string>>;
  private linkedServiceBridge?: LinkedServiceConnectionBridge;

  /**
   * Set reference mappings (NEW referenceId-based mappings from ComponentMappingTableV2)
   */
  setReferenceMappings(mappings: Record<string, Record<string, string>>) {
    this.referenceMappings = mappings;
    customActivityTransformer.setReferenceMappings(mappings);
    hdinsightActivityTransformer.setReferenceMappings(mappings);
  }

  /**
   * Get reference mappings (for passing to transformer services)
   */
  getReferenceMappings(): Record<string, Record<string, string>> | undefined {
    return this.referenceMappings;
  }

  /**
   * Set LinkedService bridge (from Configure Connections page)
   */
  setLinkedServiceBridge(bridge: LinkedServiceConnectionBridge) {
    this.linkedServiceBridge = bridge;
    customActivityTransformer.setLinkedServiceBridge(bridge);
    hdinsightActivityTransformer.setLinkedServiceBridge(bridge);
  }

  /**
   * Get LinkedService bridge (for passing to transformer services)
   */
  getLinkedServiceBridge(): LinkedServiceConnectionBridge | undefined {
    return this.linkedServiceBridge;
  }

  /**
   * Finds all LinkedService references in activities (including nested)
   * Used for validation and debugging
   */
  private findLinkedServiceReferences(activities: any[]): string[] {
    const linkedServices = new Set<string>();
    
    const scanActivity = (activity: any) => {
      // Check direct linkedServiceName reference
      if (activity.linkedServiceName) {
        linkedServices.add(activity.linkedServiceName);
      }
      
      // Check typeProperties for linkedService references
      if (activity.typeProperties?.linkedServiceName) {
        linkedServices.add(activity.typeProperties.linkedServiceName);
      }
      
      // Scan nested activities in container types
      if (activity.type === 'ForEach' && activity.typeProperties?.activities) {
        activity.typeProperties.activities.forEach(scanActivity);
      }
      
      if (activity.type === 'IfCondition') {
        if (activity.typeProperties?.ifTrueActivities) {
          activity.typeProperties.ifTrueActivities.forEach(scanActivity);
        }
        if (activity.typeProperties?.ifFalseActivities) {
          activity.typeProperties.ifFalseActivities.forEach(scanActivity);
        }
      }
      
      if (activity.type === 'Switch') {
        if (activity.typeProperties?.cases) {
          activity.typeProperties.cases.forEach((c: any) => {
            if (c.activities) {
              c.activities.forEach(scanActivity);
            }
          });
        }
        if (activity.typeProperties?.defaultActivities) {
          activity.typeProperties.defaultActivities.forEach(scanActivity);
        }
      }
      
      if (activity.type === 'Until' && activity.typeProperties?.activities) {
        activity.typeProperties.activities.forEach(scanActivity);
      }
    };
    
    activities.forEach(scanActivity);
    return Array.from(linkedServices);
  }

  /**
   * Validates that nested Copy activities don't have inputs/outputs arrays
   * Recursively checks all container activity types
   */
  private validateNestedActivities(activity: any, depth: number = 0): string[] {
    const errors: string[] = [];
    const indent = '  '.repeat(depth);
    
    // Check if this is a Copy activity with inputs/outputs (SHOULD NOT EXIST after transformation)
    if (activity.type === 'Copy') {
      if (activity.inputs && Array.isArray(activity.inputs)) {
        errors.push(`${indent}Copy activity '${activity.name}' has inputs array (depth ${depth})`);
      }
      if (activity.outputs && Array.isArray(activity.outputs)) {
        errors.push(`${indent}Copy activity '${activity.name}' has outputs array (depth ${depth})`);
      }
    }
    
    // Recursively validate nested activities in containers
    const typeProps = activity.typeProperties;
    if (!typeProps) return errors;
    
    // ForEach container (ENHANCED - existing method now supports recursion)
    if (activity.type === 'ForEach' && typeProps.activities) {
      typeProps.activities.forEach((nested: any) => {
        errors.push(...this.validateNestedActivities(nested, depth + 1));
      });
    }
    
    // IfCondition container (ENHANCED - existing method now supports recursion)
    if (activity.type === 'If') {
      if (typeProps.ifTrueActivities) {
        typeProps.ifTrueActivities.forEach((nested: any) => {
          errors.push(...this.validateNestedActivities(nested, depth + 1));
        });
      }
      if (typeProps.ifFalseActivities) {
        typeProps.ifFalseActivities.forEach((nested: any) => {
          errors.push(...this.validateNestedActivities(nested, depth + 1));
        });
      }
    }
    
    // Switch container (NEW - method created in Step 1.1)
    if (activity.type === 'Switch') {
      if (typeProps.cases) {
        typeProps.cases.forEach((switchCase: any) => {
          if (switchCase.activities) {
            switchCase.activities.forEach((nested: any) => {
              errors.push(...this.validateNestedActivities(nested, depth + 1));
            });
          }
        });
      }
      if (typeProps.defaultActivities) {
        typeProps.defaultActivities.forEach((nested: any) => {
          errors.push(...this.validateNestedActivities(nested, depth + 1));
        });
      }
    }
    
    // Until container (NEW - method created in Step 1.2)
    if (activity.type === 'Until' && typeProps.activities) {
      typeProps.activities.forEach((nested: any) => {
        errors.push(...this.validateNestedActivities(nested, depth + 1));
      });
    }
    
    return errors;
  }

  transformPipelineDefinition(definition: any, connectionMappings?: PipelineConnectionMappings, pipelineName?: string): any {
    // Store pipeline name for activity transformation
    this.currentPipelineName = pipelineName || 'unknown';

    if (!definition) {
      console.warn('No pipeline definition provided');
      return { properties: {} };
    }

    let pipelineProperties: any = {};
    if (definition.properties && typeof definition.properties === 'object') {
      pipelineProperties = definition.properties;
    } else if (definition.activities || definition.parameters || definition.variables) {
      pipelineProperties = definition;
    } else {
      pipelineProperties = {};
    }

    const activities = this.extractActivitiesFromDefinition(pipelineProperties);
    const parameters = this.extractParametersFromDefinition(pipelineProperties);
    const variables = this.extractVariablesFromDefinition(pipelineProperties);

    // NEW: Validate connection mappings availability
    if (connectionMappings && pipelineName) {
      const linkedServiceRefs = this.findLinkedServiceReferences(activities);
      
      if (linkedServiceRefs.length > 0) {
        console.log(`Pipeline '${pipelineName}' references ${linkedServiceRefs.length} LinkedServices:`, linkedServiceRefs);
        
        const unmappedServices: string[] = [];
        linkedServiceRefs.forEach(lsName => {
          const mappedId = connectionMappings[lsName];
          if (mappedId) {
            console.log(`  ✓ ${lsName} → ${mappedId}`);
          } else {
            console.error(`  ✗ ${lsName} → NOT MAPPED`);
            unmappedServices.push(lsName);
          }
        });
        
        if (unmappedServices.length > 0) {
          console.error(
            `⚠️ Pipeline '${pipelineName}' has ${unmappedServices.length} unmapped LinkedServices. ` +
            `Deployment will likely fail with "invalid reference" errors.`
          );
        }
      }
    }

    const transformedActivities = this.transformActivities(activities, connectionMappings);
    
    // NEW: Validate nested activities
    if (pipelineName) {
      const validationErrors: string[] = [];
      transformedActivities.forEach(activity => {
        validationErrors.push(...this.validateNestedActivities(activity));
      });
      
      if (validationErrors.length > 0) {
        console.error(`Pipeline '${pipelineName}' has ${validationErrors.length} nested activity validation errors:`);
        validationErrors.forEach(err => console.error(`  ${err}`));
      } else {
        console.log(`✓ Pipeline '${pipelineName}' passed nested activity validation`);
      }
    }

    const fabricPipelineDefinition = {
      properties: {
        activities: transformedActivities,
        parameters,
        variables,
        annotations: pipelineProperties.annotations || [],
        concurrency: this.extractConcurrencyFromDefinition(pipelineProperties),
        policy: this.extractPolicyFromDefinition(pipelineProperties),
        folder: pipelineProperties.folder || undefined,
        description: pipelineProperties.description || undefined,
        ...this.extractOtherPropertiesFromDefinition(pipelineProperties)
      }
    };

    const inputActivitiesCount = activities.length;
    const outputActivitiesCount = fabricPipelineDefinition.properties.activities.length;

    if (inputActivitiesCount > 0 && outputActivitiesCount === 0) {
      console.error('CRITICAL: Activities were lost during transformation!', {
        originalDefinition: definition,
        extractedProperties: pipelineProperties,
        extractedActivities: activities
      });
    }

    // Validate transformed activities
    if (pipelineName) {
      console.log(`\n🔍 Validating transformed pipeline: ${pipelineName}`);
      const validationErrors: string[] = [];
      fabricPipelineDefinition.properties.activities.forEach((activity: any) => {
        validationErrors.push(...this.validateActivity(activity, 0));
      });

      if (validationErrors.length > 0) {
        console.error(`\n❌ Pipeline '${pipelineName}' has ${validationErrors.length} validation errors:`);
        validationErrors.forEach(error => console.error(error));
        
        // Don't throw - log errors but allow deployment (some may be warnings)
        console.warn(`⚠️ Pipeline '${pipelineName}' has validation issues but transformation will continue`);
      } else {
        console.log(`✅ Pipeline '${pipelineName}' validated successfully (${outputActivitiesCount} activities)`);
      }
    }

    return fabricPipelineDefinition;
  }

  /**
   * Recursively validates transformed activities for common issues
   * @param activity The activity to validate
   * @param depth Nesting depth for logging
   * @returns Array of validation error messages
   */
  private validateActivity(activity: any, depth: number = 0): string[] {
    const errors: string[] = [];
    const indent = '  '.repeat(depth);
    
    if (!activity || !activity.name || !activity.type) {
      errors.push(`${indent}❌ Activity missing required name or type`);
      return errors;
    }
    
    // 1. Validate Copy activities
    if (activity.type === 'Copy') {
      if (activity.inputs || activity.outputs) {
        errors.push(`${indent}❌ Copy '${activity.name}' still has inputs/outputs arrays (should use datasetSettings)`);
      }
      if (!activity.typeProperties?.source?.datasetSettings) {
        errors.push(`${indent}❌ Copy '${activity.name}' missing source.datasetSettings`);
      }
      if (!activity.typeProperties?.sink?.datasetSettings) {
        errors.push(`${indent}❌ Copy '${activity.name}' missing sink.datasetSettings`);
      }
      if (activity.typeProperties?.source?.datasetSettings && 
          !activity.typeProperties.source.datasetSettings.externalReferences?.connection) {
        errors.push(`${indent}❌ Copy '${activity.name}' missing source connection reference`);
      }
      if (activity.typeProperties?.sink?.datasetSettings && 
          !activity.typeProperties.sink.datasetSettings.externalReferences?.connection) {
        errors.push(`${indent}❌ Copy '${activity.name}' missing sink connection reference`);
      }
    }
    
    // 2. Validate ExecutePipeline was converted
    if (activity.type === 'ExecutePipeline') {
      errors.push(`${indent}❌ ExecutePipeline '${activity.name}' not converted to InvokePipeline`);
    }
    
    // 3. Validate InvokePipeline has required properties
    if (activity.type === 'InvokePipeline') {
      if (!activity.externalReferences?.connection) {
        errors.push(`${indent}⚠️ InvokePipeline '${activity.name}' missing externalReferences.connection (may fail deployment)`);
      }
      if (!activity.typeProperties?.operationType) {
        errors.push(`${indent}❌ InvokePipeline '${activity.name}' missing typeProperties.operationType`);
      }
      if (activity.typeProperties?.operationType && activity.typeProperties.operationType !== 'InvokeFabricPipeline') {
        errors.push(`${indent}❌ InvokePipeline '${activity.name}' has wrong operationType: ${activity.typeProperties.operationType}`);
      }
    }
    
    // 4. Validate Lookup has datasetSettings
    if (activity.type === 'Lookup') {
      if (activity.typeProperties?.dataset) {
        errors.push(`${indent}❌ Lookup '${activity.name}' still has dataset reference (should be datasetSettings)`);
      }
      if (!activity.typeProperties?.datasetSettings) {
        errors.push(`${indent}❌ Lookup '${activity.name}' missing datasetSettings`);
      }
      if (activity.typeProperties?.datasetSettings && 
          !activity.typeProperties.datasetSettings.externalReferences?.connection) {
        errors.push(`${indent}❌ Lookup '${activity.name}' missing connection reference`);
      }
    }
    
    // 5. Validate GetMetadata has datasetSettings
    if (activity.type === 'GetMetadata') {
      if (activity.typeProperties?.dataset) {
        errors.push(`${indent}❌ GetMetadata '${activity.name}' still has dataset reference (should be datasetSettings)`);
      }
      if (!activity.typeProperties?.datasetSettings) {
        errors.push(`${indent}❌ GetMetadata '${activity.name}' missing datasetSettings`);
      }
      if (activity.typeProperties?.datasetSettings && 
          !activity.typeProperties.datasetSettings.externalReferences?.connection) {
        errors.push(`${indent}❌ GetMetadata '${activity.name}' missing connection reference`);
      }
      
      // Check for duplicate Container/Directory parameters
      const typeProps = activity.typeProperties?.datasetSettings?.typeProperties;
      if (typeProps) {
        if (typeProps.Container && typeProps.location?.container) {
          errors.push(`${indent}⚠️ GetMetadata '${activity.name}' has duplicate Container parameter`);
        }
        if (typeProps.Directory && typeProps.location?.folderPath) {
          errors.push(`${indent}⚠️ GetMetadata '${activity.name}' has duplicate Directory parameter`);
        }
      }
    }
    
    // 6. Validate StoredProcedure
    if (activity.type === 'SqlServerStoredProcedure') {
      const spName = activity.typeProperties?.storedProcedureName;
      if (spName && typeof spName === 'object' && spName.type === 'Expression') {
        // Only warn if it's a static string wrapped as Expression
        if (!spName.value.includes('@')) {
          errors.push(`${indent}⚠️ StoredProcedure '${activity.name}' has static name wrapped as Expression: ${spName.value}`);
        }
      }
      if (!activity.externalReferences?.connection) {
        errors.push(`${indent}❌ StoredProcedure '${activity.name}' missing externalReferences.connection`);
      }
    }
    
    // 7. Recursively validate nested activities
    const typeProps = activity.typeProperties;
    if (typeProps) {
      // ForEach container
      if (activity.type === 'ForEach' && typeProps.activities && Array.isArray(typeProps.activities)) {
        console.log(`${indent}  Validating ForEach with ${typeProps.activities.length} nested activities...`);
        typeProps.activities.forEach((nested: any) => {
          errors.push(...this.validateActivity(nested, depth + 1));
        });
      }
      
      // IfCondition container
      if (activity.type === 'IfCondition' || activity.type === 'If') {
        if (typeProps.ifTrueActivities && Array.isArray(typeProps.ifTrueActivities)) {
          console.log(`${indent}  Validating IfCondition.ifTrueActivities (${typeProps.ifTrueActivities.length} activities)...`);
          typeProps.ifTrueActivities.forEach((nested: any) => {
            errors.push(...this.validateActivity(nested, depth + 1));
          });
        }
        if (typeProps.ifFalseActivities && Array.isArray(typeProps.ifFalseActivities)) {
          console.log(`${indent}  Validating IfCondition.ifFalseActivities (${typeProps.ifFalseActivities.length} activities)...`);
          typeProps.ifFalseActivities.forEach((nested: any) => {
            errors.push(...this.validateActivity(nested, depth + 1));
          });
        }
      }
      
      // Switch container
      if (activity.type === 'Switch' && typeProps.cases) {
        typeProps.cases.forEach((caseItem: any, index: number) => {
          if (caseItem.activities && Array.isArray(caseItem.activities)) {
            console.log(`${indent}  Validating Switch.case[${index}] (${caseItem.activities.length} activities)...`);
            caseItem.activities.forEach((nested: any) => {
              errors.push(...this.validateActivity(nested, depth + 1));
            });
          }
        });
        if (typeProps.defaultActivities && Array.isArray(typeProps.defaultActivities)) {
          console.log(`${indent}  Validating Switch.defaultActivities (${typeProps.defaultActivities.length} activities)...`);
          typeProps.defaultActivities.forEach((nested: any) => {
            errors.push(...this.validateActivity(nested, depth + 1));
          });
        }
      }
      
      // Until container
      if (activity.type === 'Until' && typeProps.activities && Array.isArray(typeProps.activities)) {
        console.log(`${indent}  Validating Until with ${typeProps.activities.length} nested activities...`);
        typeProps.activities.forEach((nested: any) => {
          errors.push(...this.validateActivity(nested, depth + 1));
        });
      }
    }
    
    return errors;
  }

  extractActivitiesFromDefinition(properties: any): any[] {
    if (!properties || typeof properties !== 'object') return [];
    const possibleActivitySources = [
      properties.activities,
      properties.Activities,
      properties.pipelineActivities,
      properties.definition?.activities,
      properties.properties?.activities
    ];

    for (const source of possibleActivitySources) {
      if (Array.isArray(source) && source.length > 0) return source;
    }

    return [];
  }

  extractParametersFromDefinition(properties: any): Record<string, any> {
    if (!properties || typeof properties !== 'object') return {};
    return properties.parameters || properties.Parameters || {};
  }

  extractVariablesFromDefinition(properties: any): Record<string, any> {
    if (!properties || typeof properties !== 'object') return {};
    return properties.variables || properties.Variables || {};
  }

  extractConcurrencyFromDefinition(properties: any): number {
    if (!properties || typeof properties !== 'object') return 1;
    const concurrency = properties.concurrency || properties.Concurrency;
    return typeof concurrency === 'number' && concurrency > 0 ? concurrency : 1;
  }

  extractPolicyFromDefinition(properties: any): any {
    if (!properties || typeof properties !== 'object') return {};
    return properties.policy || properties.Policy || {};
  }

  extractOtherPropertiesFromDefinition(properties: any): Record<string, any> {
    if (!properties || typeof properties !== 'object') return {};
    const knownKeys = [
      'activities', 'Activities', 'parameters', 'Parameters', 
      'variables', 'Variables', 'annotations', 'concurrency', 
      'Concurrency', 'policy', 'Policy', 'folder', 'description'
    ];
    const otherProperties: Record<string, any> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!knownKeys.includes(key) && value !== undefined) otherProperties[key] = value;
    }
    return otherProperties;
  }

  transformActivities(activities: any[], connectionMappings?: PipelineConnectionMappings): any[] {
    if (!Array.isArray(activities)) return [];
    
    // Get pipeline name from context
    const pipelineName = this.currentPipelineName || 'unknown';
    
    return activities.map(activity => {
      if (!activity || typeof activity !== 'object') return activity;

      // Apply activity-level transformations (skip Copy, Custom, and HDInsight - they have specialized transformers)
      if (activity.type !== 'Copy' && activity.type !== 'Custom' && !this.isHDInsightActivity(activity.type)) {
        activityTransformer.transformLinkedServiceReferencesToFabric(activity);
      }

      if (activityTransformer.activityReferencesFailedConnector(activity)) {
        activity.state = 'Inactive';
        activity.onInactiveMarkAs = 'Succeeded';
      }

      // Apply specialized transformation based on activity type
      let transformedActivity = activity;
      if (activity.type === 'Copy') {
        // Pass connection mappings to Copy activity transformer
        transformedActivity = copyActivityTransformer.transformCopyActivity(activity, connectionMappings);
      } else if (activity.type === 'Lookup') {
        console.log(`Transforming Lookup activity '${activity.name}' with mappings:`, {
          pipelineName: this.currentPipelineName,
          hasConnectionMappings: Boolean(connectionMappings),
          hasReferenceMappings: Boolean(this.referenceMappings),
          referenceMappingsForPipeline: this.referenceMappings && this.currentPipelineName ? 
            Object.keys(this.referenceMappings[this.currentPipelineName] || {}) : []
        });
        
        // Transform Lookup activities with dataset to datasetSettings
        transformedActivity = lookupActivityTransformer.transformLookupActivity(
          activity,
          connectionMappings,
          this.referenceMappings,
          this.currentPipelineName
        );
      } else if (activity.type === 'GetMetadata') {
        console.log(`Transforming GetMetadata activity '${activity.name}' with mappings:`, {
          pipelineName: this.currentPipelineName,
          hasConnectionMappings: Boolean(connectionMappings),
          hasReferenceMappings: Boolean(this.referenceMappings),
          referenceMappingsForPipeline: this.referenceMappings && this.currentPipelineName ? 
            Object.keys(this.referenceMappings[this.currentPipelineName] || {}) : []
        });
        
        // Transform GetMetadata activities with dataset to datasetSettings
        transformedActivity = getMetadataActivityTransformer.transformGetMetadataActivity(
          activity,
          connectionMappings,
          this.referenceMappings,
          this.currentPipelineName
        );
      } else if (activity.type === 'Custom') {
        // Transform Custom activities with connection mappings
        transformedActivity = customActivityTransformer.transformCustomActivity(
          activity,
          pipelineName,
          connectionMappings
        );
      } else if (this.isHDInsightActivity(activity.type)) {
        // NEW: Transform HDInsight activities with connection mappings
        transformedActivity = hdinsightActivityTransformer.transformHDInsightActivity(
          activity,
          pipelineName,
          connectionMappings
        );
      } else if (activity.type === 'ExecutePipeline') {
        // Transform ExecutePipeline to InvokePipeline
        transformedActivity = this.transformExecutePipelineToInvokePipeline(
          activity, 
          connectionMappings,
          this.referenceMappings,
          this.currentPipelineName
        );
      }

      const finalActivity = {
        ...transformedActivity,
        name: transformedActivity.name || `activity_${Date.now()}`,
        type: transformedActivity.type || 'Unknown',
        typeProperties: this.transformActivityTypeProperties(transformedActivity.type, transformedActivity.typeProperties || {}, connectionMappings),
        dependsOn: this.transformActivityDependencies(transformedActivity.dependsOn || []),
        userProperties: transformedActivity.userProperties || [],
        policy: transformedActivity.policy || {},
        // Override connectVia to empty object for Fabric (no IntegrationRuntimeReference support)
        connectVia: {}
      };

      // Remove ADF-specific properties that Fabric doesn't support
      delete (finalActivity as any).linkedServiceName;
      delete (finalActivity as any).linkedService;

      // For Copy and Custom activities, explicitly delete inputs/outputs after transformation
      // This guards against the spread operator reintroducing these properties
      if (activity.type === 'Copy' || activity.type === 'Custom') {
        console.log(`✅ Removed inputs/outputs from ${activity.type} activity: ${activity.name}`);
        delete (finalActivity as any).inputs;
        delete (finalActivity as any).outputs;
      } else {
        // Transform inputs/outputs for non-Copy and non-Custom activities
        finalActivity.inputs = activityTransformer.transformActivityInputs(activity.inputs || []);
        finalActivity.outputs = activityTransformer.transformActivityOutputs(activity.outputs || []);
      }

      return finalActivity;
    });
  }

  transformActivityTypeProperties(activityType: string, typeProperties: any, connectionMappings?: PipelineConnectionMappings): any {
    if (!typeProperties || typeof typeProperties !== 'object') return typeProperties;
    switch (activityType) {
      case 'Copy': 
        // Copy activities are already fully transformed by copyActivityTransformer
        // Return as-is to avoid overriding the detailed transformation
        return typeProperties;
      case 'Custom':
        // Custom activities are already fully transformed by customActivityTransformer
        // Return as-is to avoid overriding the detailed transformation
        return typeProperties;
      case 'AzureHDInsight':
        // HDInsight activities are already fully transformed by hdinsightActivityTransformer
        // Return as-is to avoid overriding the detailed transformation
        return typeProperties;
      case 'InvokePipeline':
        // InvokePipeline activities are already fully transformed by transformExecutePipelineToInvokePipeline
        // Return as-is to avoid overriding the detailed transformation (especially _originalTargetPipeline)
        return typeProperties;
      case 'ExecutePipeline': return this.transformExecutePipelineProperties(typeProperties);
      case 'ForEach': return this.transformForEachActivityProperties(typeProperties, connectionMappings);
      case 'IfCondition': return this.transformIfActivityProperties(typeProperties, connectionMappings);
      case 'Switch': return this.transformSwitchActivityProperties(typeProperties, connectionMappings);
      case 'Until': return this.transformUntilActivityProperties(typeProperties, connectionMappings);
      case 'Wait': return this.transformWaitActivityProperties(typeProperties);
      case 'WebActivity': return this.transformWebActivityProperties(typeProperties);
      default: return typeProperties;
    }
  }

  transformExecutePipelineProperties(properties: any): any { 
    const result: any = { ...properties };
    if (!result.pipeline) result.pipeline = {};
    if (!result.parameters) result.parameters = {};
    if (result.waitOnCompletion === undefined) result.waitOnCompletion = true;
    return result;
  }

  /**
   * Get the mapped FabricDataPipelines connection ID for an ExecutePipeline activity
   * Looks up in referenceMappings[pipelineName][pipelineName_activityName_invoke]
   * Prioritizes method parameters over class properties for flexibility
   */
  private getConnectionIdForExecutePipeline(
    activityName: string,
    pipelineReferenceMappings?: Record<string, Record<string, string>>,
    pipelineName?: string
  ): string | undefined {
    // Prioritize passed parameters over class properties
    const mappings = pipelineReferenceMappings || this.referenceMappings;
    const currentPipeline = pipelineName || this.currentPipelineName;

    if (!mappings || !currentPipeline) {
      console.warn(`Cannot lookup ExecutePipeline connection: mappings=${Boolean(mappings)}, pipeline=${currentPipeline}`);
      return undefined;
    }

    const pipelineMappings = mappings[currentPipeline];
    if (!pipelineMappings) {
      console.warn(`No reference mappings found for pipeline: ${currentPipeline}`);
      return undefined;
    }

    // Build referenceId: pipelineName_activityName_invoke
    const referenceId = `${currentPipeline}_${activityName}_invoke`;
    const connectionId = pipelineMappings[referenceId];
    
    if (connectionId) {
      console.log(`🎯 Found FabricDataPipelines connection: ${referenceId} -> ${connectionId}`);
    } else {
      console.warn(`❌ No FabricDataPipelines connection found for ExecutePipeline: ${referenceId}`);
    }
    
    return connectionId;
  }

  /**
   * Transform ExecutePipeline activity to InvokePipeline activity for Fabric
   */
  transformExecutePipelineToInvokePipeline(
    activity: any, 
    connectionMappings?: PipelineConnectionMappings,
    pipelineReferenceMappings?: Record<string, Record<string, string>>,
    pipelineName?: string
  ): any {
    if (!activity || activity.type !== 'ExecutePipeline') {
      return activity;
    }

    // Create the InvokePipeline activity structure
    const transformedActivity = {
      name: activity.name,
      type: 'InvokePipeline',
      dependsOn: activity.dependsOn || [],
      policy: {
        timeout: activity.policy?.timeout || '0.12:00:00',
        retry: activity.policy?.retry || 0,
        retryIntervalInSeconds: activity.policy?.retryIntervalInSeconds || 30,
        secureOutput: activity.policy?.secureOutput || false,
        secureInput: activity.policy?.secureInput || false
      },
      userProperties: activity.userProperties || [],
      typeProperties: {
        waitOnCompletion: activity.typeProperties?.waitOnCompletion !== false, // Default to true
        operationType: 'InvokeFabricPipeline',
        // These will be populated during deployment when target pipeline IDs are known
        // DO NOT use default GUIDs - these must be resolved during deployment
        pipelineId: '', // Will be populated during deployment with actual target pipeline ID
        workspaceId: '', // Will be populated during deployment with actual workspace ID
        parameters: activity.typeProperties?.parameters || {}
      },
      externalReferences: {
        // Look up the mapped FabricDataPipelines connection from pipelineReferenceMappings
        // Format: pipelineReferenceMappings[pipelineName][pipelineName_activityName_invoke]
        connection: this.getConnectionIdForExecutePipeline(activity.name, pipelineReferenceMappings, pipelineName) || ''
      },
      // Store original reference for deployment logic
      _originalTargetPipeline: activity.typeProperties?.pipeline?.referenceName
    };

    console.log(`Transformed ExecutePipeline '${activity.name}' to InvokePipeline targeting pipeline '${activity.typeProperties?.pipeline?.referenceName}' - IDs will be resolved during deployment`);
    
    return transformedActivity;
  }
  
  transformForEachActivityProperties(properties: any, connectionMappings?: PipelineConnectionMappings): any { 
    const result: any = { ...properties };
    if (!result.items) result.items = {};
    if (!result.activities) result.activities = [];
    else {
      console.log(`Transforming ForEach activity with ${result.activities.length} nested activities`);
      result.activities = this.transformActivities(result.activities, connectionMappings);
    }
    if (result.isSequential === undefined) result.isSequential = false;
    // Don't set batchCount default - let Fabric handle it
    return result;
  }
  
  transformIfActivityProperties(properties: any, connectionMappings?: PipelineConnectionMappings): any { 
    const result: any = { ...properties };
    if (!result.expression) result.expression = {};
    if (!result.ifTrueActivities) result.ifTrueActivities = [];
    else {
      console.log(`Transforming If activity: ${result.ifTrueActivities.length} true activities`);
      result.ifTrueActivities = this.transformActivities(result.ifTrueActivities, connectionMappings);
    }
    if (!result.ifFalseActivities) result.ifFalseActivities = [];
    else {
      console.log(`Transforming If activity: ${result.ifFalseActivities.length} false activities`);
      result.ifFalseActivities = this.transformActivities(result.ifFalseActivities, connectionMappings);
    }
    return result;
  }
  
  /**
   * Transform Switch activity properties - RECURSIVELY transforms nested activities in all cases
   * NEW METHOD - Switch containers were not previously supported
   */
  private transformSwitchActivityProperties(
    properties: any,
    connectionMappings?: PipelineConnectionMappings
  ): any {
    const result = { ...properties };
    
    // Transform activities in each case
    if (result.cases && Array.isArray(result.cases)) {
      console.log(`Transforming Switch activity with ${result.cases.length} cases`);
      result.cases = result.cases.map((switchCase: any) => {
        if (switchCase.activities && Array.isArray(switchCase.activities)) {
          console.log(`  Transforming ${switchCase.activities.length} activities in case '${switchCase.value}'`);
          return {
            ...switchCase,
            activities: this.transformActivities(switchCase.activities, connectionMappings)
          };
        }
        return switchCase;
      });
    }
    
    // Transform default activities
    if (result.defaultActivities && Array.isArray(result.defaultActivities)) {
      console.log(`  Transforming ${result.defaultActivities.length} default activities`);
      result.defaultActivities = this.transformActivities(result.defaultActivities, connectionMappings);
    }
    
    return result;
  }

  /**
   * Transform Until activity properties - RECURSIVELY transforms nested activities
   * NEW METHOD - Until containers were not previously supported
   */
  private transformUntilActivityProperties(
    properties: any,
    connectionMappings?: PipelineConnectionMappings
  ): any {
    const result = { ...properties };
    
    if (result.activities && Array.isArray(result.activities)) {
      console.log(`Transforming Until activity with ${result.activities.length} nested activities`);
      result.activities = this.transformActivities(result.activities, connectionMappings);
    }
    
    return result;
  }
  
  transformWaitActivityProperties(properties: any): any { 
    const result: any = { ...properties };
    // Only set waitTimeInSeconds if not provided - this is required for Wait activities
    if (result.waitTimeInSeconds === undefined) result.waitTimeInSeconds = 0;
    return result;
  }
  
  transformWebActivityProperties(properties: any): any { 
    const result: any = { ...properties };
    // Only add properties that are truly required by Fabric or were in original ADF
    if (!result.method) result.method = 'GET'; // Method is required
    if (!result.headers) result.headers = {};
    // Don't add defaults for optional properties like url, body, authentication
    // They should come from the original ADF definition
    if (!result.datasets) result.datasets = [];
    if (!result.linkedServices) result.linkedServices = [];
    return result;
  }

  transformActivityDependencies(dependencies: any[]): any[] {
    if (!Array.isArray(dependencies)) return [];
    return dependencies.map(dep => {
      if (!dep || typeof dep !== 'object') return dep;
      return { activity: dep.activity || '', dependencyConditions: Array.isArray(dep.dependencyConditions) ? dep.dependencyConditions : ['Succeeded'], ...dep };
    });
  }

  transformSchedule(definition: any): any { if (!definition?.recurrence) return {}; return { frequency: definition.recurrence.frequency, interval: definition.recurrence.interval, startTime: definition.recurrence.startTime, endTime: definition.recurrence.endTime, timeZone: definition.recurrence.timeZone }; }

  private getConnectionIdForDataset(datasetName: string): string | undefined { console.log(`Getting connection ID for dataset: ${datasetName}`); return undefined; }

    /**
   * Injects library variable references into pipeline definition
   * Creates the libraryVariables section that maps library variables to the pipeline
   * 
   * @param pipelineDefinition Transformed pipeline definition
   * @param libraryName Display name of the Variable Library (e.g., "DataFactory_GlobalParameters")
   * @param variableNamesWithTypes Array of variable names with their Fabric types
   * @returns Modified pipeline definition with libraryVariables section
   */
  injectLibraryVariables(
    pipelineDefinition: any,
    libraryName: string,
    variableNamesWithTypes: Array<{ name: string; fabricType: string }>
  ): any {
    console.log(`[PipelineTransformer] Injecting ${variableNamesWithTypes.length} library variables from "${libraryName}"`);

    if (!pipelineDefinition?.properties) {
      console.warn('[PipelineTransformer] No properties found in pipeline definition');
      return pipelineDefinition;
    }

    // Create libraryVariables section as an object with keys
    const libraryVariables: Record<string, any> = {};
    
    variableNamesWithTypes.forEach(({ name, fabricType }) => {
      const key = `${libraryName}_VariableLibrary_${name}`;
      libraryVariables[key] = {
        type: fabricType, // Use actual type from Variable Library config
        variableName: `VariableLibrary_${name}`,
        libraryName: libraryName,
      };
    });

    // Inject into pipeline properties
    pipelineDefinition.properties.libraryVariables = libraryVariables;

    console.log(`[PipelineTransformer] Successfully injected libraryVariables section with keys:`, Object.keys(libraryVariables));
    return pipelineDefinition;
  }

  /**
   * Transforms global parameter expressions to library variable expressions
   * Replaces: @pipeline().globalParameters.X
   * With: @pipeline().libraryVariables.LibraryName_VariableLibrary_X
   * 
   * @param pipelineDefinition Transformed pipeline definition
   * @param parameterNames Array of original global parameter names (e.g., ["gp_MigrationTest"])
   * @param libraryName Display name of the Variable Library (e.g., "DataFactory_GlobalParameters")
   * @returns Modified pipeline definition with transformed expressions
   */
  transformGlobalParameterExpressions(
    pipelineDefinition: any,
    parameterNames: string[],
    libraryName: string
  ): any {
    console.log(`[PipelineTransformer] Transforming global parameter expressions for ${parameterNames.length} parameters`);

    if (!pipelineDefinition?.properties) {
      console.warn('[PipelineTransformer] No properties found in pipeline definition');
      return pipelineDefinition;
    }

    // Convert pipeline to JSON string for regex replacement
    let pipelineJson = JSON.stringify(pipelineDefinition);

    // Replace each global parameter reference
    parameterNames.forEach(paramName => {
      const libraryVarKey = `${libraryName}_VariableLibrary_${paramName}`;
      
      // Pattern 1: @pipeline().globalParameters.X (with negative lookahead to prevent partial matches)
      const pattern1 = new RegExp(
        `@pipeline\\(\\)\\.globalParameters\\.${paramName}(?![\\w])`,
        'g'
      );
      const replacement1 = `@pipeline().libraryVariables.${libraryVarKey}`;
      
      // Pattern 2: @{pipeline().globalParameters.X}
      const pattern2 = new RegExp(
        `@\\{pipeline\\(\\)\\.globalParameters\\.${paramName}\\}`,
        'g'
      );
      const replacement2 = `@{pipeline().libraryVariables.${libraryVarKey}}`;
      
      // Pattern 3: pipeline().globalParameters.X (catches function-wrapped like @string(pipeline()...))
      // Negative lookbehind to avoid matching @pipeline() which is already handled by pattern1
      const pattern3 = new RegExp(
        `(?<!@)pipeline\\(\\)\\.globalParameters\\.${paramName}(?![\\w])`,
        'g'
      );
      const replacement3 = `pipeline().libraryVariables.${libraryVarKey}`;

      const before1 = (pipelineJson.match(pattern1) || []).length;
      const before2 = (pipelineJson.match(pattern2) || []).length;
      const before3 = (pipelineJson.match(pattern3) || []).length;

      pipelineJson = pipelineJson.replace(pattern1, replacement1);
      pipelineJson = pipelineJson.replace(pattern2, replacement2);
      pipelineJson = pipelineJson.replace(pattern3, replacement3);
      
      if (before1 > 0 || before2 > 0 || before3 > 0) {
        console.log(`[PipelineTransformer] Transformed "${paramName}": ${before1 + before2 + before3} occurrences → ${libraryVarKey}`);
      }
    });

    // Parse back to object
    const transformedDefinition = JSON.parse(pipelineJson);
    
    // Unwrap Expression objects that now contain library variable references
    // This prevents Fabric API from receiving { value: "...", type: "Expression" } objects
    // which would serialize to "[object Object]"
    this.unwrapLibraryVariableExpressions(transformedDefinition);
    
    console.log(`[PipelineTransformer] Expression transformation complete (with unwrapping)`);

    return transformedDefinition;
  }

  /**
   * Recursively unwraps Expression objects that contain library variable references
   * Converts { value: "@pipeline().libraryVariables.X", type: "Expression" } → "@pipeline().libraryVariables.X"
   * 
   * This is necessary because:
   * 1. Activity transformers (Copy, Lookup, etc.) preserve Expression objects when substituting dataset parameters
   * 2. Global parameter transformation does regex replacement on JSON.stringify'd pipeline
   * 3. Expression objects get transformed but remain as objects after JSON.parse
   * 4. Fabric API would serialize these to "[object Object]"
   * 
   * @param obj The object to recursively process (typically pipeline definition)
   * @param visited WeakSet to track visited objects and prevent infinite loops on circular references
   */
  private unwrapLibraryVariableExpressions(obj: any, visited = new WeakSet()): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Prevent infinite loops on circular references
    if (visited.has(obj)) {
      return;
    }
    visited.add(obj);

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach(item => this.unwrapLibraryVariableExpressions(item, visited));
      return;
    }

    // Process each property
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        // Check if this is an Expression object with a library variable reference
        if (
          (value as any).type === 'Expression' &&
          typeof (value as any).value === 'string' &&
          (value as any).value.includes('@pipeline().libraryVariables.')
        ) {
          // Unwrap to plain string
          const unwrappedValue = (value as any).value;
          obj[key] = unwrappedValue;
          console.log(`[PipelineTransformer] Unwrapped Expression object at "${key}": ${unwrappedValue.substring(0, 80)}...`);
        } else if (
          (value as any).type === 'Expression' &&
          typeof (value as any).value === 'string' &&
          (value as any).value.includes('pipeline().libraryVariables.')
        ) {
          // Also handle cases without @ prefix (e.g., inside concat/string functions)
          const unwrappedValue = (value as any).value;
          obj[key] = unwrappedValue;
          console.log(`[PipelineTransformer] Unwrapped Expression object (no @ prefix) at "${key}": ${unwrappedValue.substring(0, 80)}...`);
        } else {
          // Recurse into nested objects/arrays
          this.unwrapLibraryVariableExpressions(value, visited);
        }
      }
    }
  }

  // Create pipeline in Fabric using the api client with connection mappings support
  async createPipeline(
    component: ADFComponent, 
    accessToken: string, 
    workspaceId: string,
    connectionMappings?: PipelineConnectionMappings,
    folderMappings?: Record<string, string>
  ): Promise<DeploymentResult> {
    const endpoint = `${fabricApiClient.baseUrl}/workspaces/${workspaceId}/dataPipelines`;
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    try {
      // First, transform the basic pipeline definition with connection mappings
      // Pass pipeline name for Custom activity context
      let pipelineDefinition = this.transformPipelineDefinition(
        component.definition,
        connectionMappings,
        component.name
      );
      
      // Apply connection mappings if provided (this ensures double application isn't happening)
      if (connectionMappings) {
        pipelineDefinition = PipelineConnectionTransformerService.transformPipelineWithConnections(
          pipelineDefinition, 
          component.name, 
          connectionMappings,
          this.referenceMappings, // Pass NEW format mappings
          this.linkedServiceBridge // Pass bridge from Configure Connections
        );
      }
      
      // Update activities for failed connectors (legacy logic)
      const updatedDefinition = this.updatePipelineActivitiesForFailedConnectors(pipelineDefinition);

      if (!updatedDefinition.properties) throw new Error('Pipeline definition is missing properties structure after transformation');

      const activitiesCount = updatedDefinition.properties.activities?.length || 0;
      const inactiveActivitiesCount = activityTransformer.countInactiveActivities(updatedDefinition.properties.activities || []);
      const parametersCount = Object.keys(updatedDefinition.properties.parameters || {}).length;
      const variablesCount = Object.keys(updatedDefinition.properties.variables || {}).length;

      if (activitiesCount === 0) {
        const originalActivities = component.definition?.properties?.activities || component.definition?.activities || [];
        if (Array.isArray(originalActivities) && originalActivities.length > 0) {
          throw new Error(`Pipeline transformation failed: ${originalActivities.length} activities were lost during processing`);
        }
      }

      // Clean pipeline definition by removing ADF-specific properties before deployment
      const cleanedDefinition = PipelineConnectionTransformerService.cleanPipelineForFabric(updatedDefinition);

      // Generate Base64 payload using the connection transformer service
      const base64Payload = PipelineConnectionTransformerService.generateFabricPipelinePayload(cleanedDefinition);

      // Get folder ID if component has folder information
      let folderId: string | undefined;
      if (component.folder?.path && folderMappings) {
        folderId = folderMappings[component.folder.path];
        if (folderId) {
          console.log(`Pipeline ${component.name} will be assigned to folder: ${component.folder.path} (ID: ${folderId})`);
        } else {
          console.warn(`Folder mapping not found for pipeline ${component.name}, folder path: ${component.folder.path}`);
        }
      }

      const pipelinePayload: any = {
        displayName: component.fabricTarget?.name || component.name,
        description: `Migrated from ADF pipeline: ${component.name} (${activitiesCount} activities${inactiveActivitiesCount > 0 ? `, ${inactiveActivitiesCount} inactive due to failed connectors` : ''})`,
        definition: { parts: [{ path: 'pipeline-content.json', payload: base64Payload, payloadType: 'InlineBase64' }] }
      };

      // Add folderId if available
      if (folderId) {
        pipelinePayload.folderId = folderId;
      }

      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(pipelinePayload) });
      if (!response.ok) return await fabricApiClient.handleAPIError(response, 'POST', endpoint, pipelinePayload, headers, component.name, component.type);
      const result = await response.json();
      
      // Generate connection mapping summary if available
      let note = `Pipeline created successfully with ${activitiesCount} activities, ${parametersCount} parameters, and ${variablesCount} variables`;
      if (inactiveActivitiesCount > 0) {
        note += `. ${inactiveActivitiesCount} activities marked as inactive due to failed connectors.`;
      }
      if (connectionMappings) {
        const mappingSummary = PipelineConnectionTransformerService.getConnectionMappingSummary(component.name, connectionMappings);
        if (mappingSummary.mappedActivities > 0) {
          note += ` ${mappingSummary.mappedActivities}/${mappingSummary.totalActivities} activities mapped to Fabric connections.`;
        }
      }
      
      return { componentName: component.name, componentType: component.type, status: 'success', fabricResourceId: result.id, note };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating pipeline';
      console.error(`Error creating pipeline ${component.name}:`, { error, errorMessage, componentDefinition: component.definition });
      return { componentName: component.name, componentType: component.type, status: 'failed', error: errorMessage, errorMessage };
    }
  }

  updatePipelineActivitiesForFailedConnectors(pipelineDefinition: any): any {
    if (!pipelineDefinition?.properties?.activities) return pipelineDefinition;
    const updatedDefinition = JSON.parse(JSON.stringify(pipelineDefinition));
    const activities = updatedDefinition.properties.activities;
    for (const activity of activities) {
      activityTransformer.transformLinkedServiceReferencesToFabric(activity);
      if (activityTransformer.activityReferencesFailedConnector(activity)) {
        activity.state = 'Inactive';
        activity.onInactiveMarkAs = 'Succeeded';
      }
    }
    return updatedDefinition;
  }

  /**
   * Helper method to check if an activity is an HDInsight activity type
   */
  private isHDInsightActivity(activityType: string): boolean {
    const hdinsightTypes = [
      'HDInsightHive',
      'HDInsightPig',
      'HDInsightMapReduce',
      'HDInsightSpark',
      'HDInsightStreaming'
    ];
    return hdinsightTypes.includes(activityType);
  }
}

export const pipelineTransformer = new PipelineTransformer();
