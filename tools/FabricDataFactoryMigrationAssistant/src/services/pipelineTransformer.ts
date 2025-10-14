import { activityTransformer } from './activityTransformer';
import { copyActivityTransformer } from './copyActivityTransformer';
import { connectionService } from './connectionService';
import { fabricApiClient } from './fabricApiClient';
import { ADFComponent, DeploymentResult, PipelineConnectionMappings } from '../types';
import { PipelineConnectionTransformerService } from './pipelineConnectionTransformerService';

export class PipelineTransformer {
  transformPipelineDefinition(definition: any, connectionMappings?: PipelineConnectionMappings): any {
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

    const fabricPipelineDefinition = {
      properties: {
        activities: this.transformActivities(activities, connectionMappings),
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

    return fabricPipelineDefinition;
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
    return activities.map(activity => {
      if (!activity || typeof activity !== 'object') return activity;

      // Apply activity-level transformations using activityTransformer
      activityTransformer.transformLinkedServiceReferencesToFabric(activity);

      if (activityTransformer.activityReferencesFailedConnector(activity)) {
        activity.state = 'Inactive';
        activity.onInactiveMarkAs = 'Succeeded';
      }

      // Apply specialized transformation for Copy activities
      let transformedActivity = activity;
      if (activity.type === 'Copy') {
        // Pass connection mappings to Copy activity transformer
        transformedActivity = copyActivityTransformer.transformCopyActivity(activity, connectionMappings);
      } else if (activity.type === 'ExecutePipeline') {
        // Transform ExecutePipeline to InvokePipeline
        transformedActivity = this.transformExecutePipelineToInvokePipeline(activity, connectionMappings);
      }

      const finalActivity = {
        ...transformedActivity,
        name: transformedActivity.name || `activity_${Date.now()}`,
        type: transformedActivity.type || 'Unknown',
        typeProperties: this.transformActivityTypeProperties(transformedActivity.type, transformedActivity.typeProperties || {}, connectionMappings),
        dependsOn: this.transformActivityDependencies(transformedActivity.dependsOn || []),
        userProperties: transformedActivity.userProperties || [],
        policy: transformedActivity.policy || {}
      };

      // For non-Copy activities, still transform inputs/outputs using activityTransformer
      if (activity.type !== 'Copy') {
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
      case 'ExecutePipeline': return this.transformExecutePipelineProperties(typeProperties);
      case 'Lookup': return this.transformLookupActivityProperties(typeProperties);
      case 'ForEach': return this.transformForEachActivityProperties(typeProperties);
      case 'If': return this.transformIfActivityProperties(typeProperties);
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
   * Transform ExecutePipeline activity to InvokePipeline activity for Fabric
   */
  transformExecutePipelineToInvokePipeline(activity: any, connectionMappings?: PipelineConnectionMappings): any {
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
        // This will be populated with the FabricDataPipelines connection ID during deployment
        // DO NOT use default GUIDs - this must be resolved during deployment
        connection: '' // Will be populated during deployment with actual connection ID
      },
      // Store original reference for deployment logic
      _originalTargetPipeline: activity.typeProperties?.pipeline?.referenceName
    };

    console.log(`Transformed ExecutePipeline '${activity.name}' to InvokePipeline targeting pipeline '${activity.typeProperties?.pipeline?.referenceName}' - IDs will be resolved during deployment`);
    
    return transformedActivity;
  }
  
  transformLookupActivityProperties(properties: any): any { 
    const result: any = { ...properties };
    if (!result.source) result.source = {};
    if (!result.dataset) result.dataset = {};
    if (result.firstRowOnly === undefined) result.firstRowOnly = true;
    return result;
  }
  
  transformForEachActivityProperties(properties: any): any { 
    const result: any = { ...properties };
    if (!result.items) result.items = {};
    if (!result.activities) result.activities = [];
    else result.activities = this.transformActivities(result.activities);
    if (result.isSequential === undefined) result.isSequential = false;
    // Don't set batchCount default - let Fabric handle it
    return result;
  }
  
  transformIfActivityProperties(properties: any): any { 
    const result: any = { ...properties };
    if (!result.expression) result.expression = {};
    if (!result.ifTrueActivities) result.ifTrueActivities = [];
    else result.ifTrueActivities = this.transformActivities(result.ifTrueActivities);
    if (!result.ifFalseActivities) result.ifFalseActivities = [];
    else result.ifFalseActivities = this.transformActivities(result.ifFalseActivities);
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
      let pipelineDefinition = this.transformPipelineDefinition(component.definition, connectionMappings);
      
      // Apply connection mappings if provided (this ensures double application isn't happening)
      if (connectionMappings) {
        pipelineDefinition = PipelineConnectionTransformerService.transformPipelineWithConnections(
          pipelineDefinition, 
          component.name, 
          connectionMappings
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

      // Generate Base64 payload using the connection transformer service
      const base64Payload = PipelineConnectionTransformerService.generateFabricPipelinePayload(updatedDefinition);

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
}

export const pipelineTransformer = new PipelineTransformer();
