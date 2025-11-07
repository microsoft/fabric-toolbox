import { ADFComponent, DeploymentResult, WorkspaceInfo, ComponentMapping, ApiError, SupportedConnectionType, PipelineConnectionMappings, LinkedServiceConnectionBridge } from '../types';
import { gatewayService } from './gatewayService';
import { connectionService } from './connectionService';
import { pipelineTransformer } from './pipelineTransformer';
import { activityTransformer } from './activityTransformer';
import { fabricApiClient } from './fabricApiClient';
import { scheduleService } from './scheduleService';
import { workspaceIdentityService } from './workspaceIdentityService';

interface FabricWorkspace {
  id: string;
  displayName: string;
  description?: string;
  type: string;
}

interface FabricGateway {
  id: string;
  displayName: string;
  type: string;
}

interface FabricConnector {
  id: string;
  displayName: string;
  connectorType: string;
  connectionDetails: Record<string, any>;
}

interface ConnectionCreateRequest {
  displayName: string;
  description?: string;
  connectorType: string;
  connectionDetails: Record<string, any>;
  privacyLevel: 'Public' | 'Organizational' | 'Private';
  gatewayId?: string;
  virtualNetworkGatewayId?: string;
}

interface FabricVariable {
  id: string;
  displayName: string;
  type: string;
  defaultValue: any;
}

interface FabricPipeline {
  id: string;
  displayName: string;
  description?: string;
  definition: Record<string, any>;
}

interface GatewayMapping {
  adfName: string;
  fabricId: string;
  gatewayType: 'VirtualNetwork' | 'OnPremises';
}

export class FabricService {
  private baseUrl = 'https://api.fabric.microsoft.com/v1';
  // State is delegated to gatewayService and connectionService
  private lastFolderDeploymentResults: import('../types').FolderDeploymentResult[] = [];

  /**
   * Get the folder deployment results from the last deployComponents call
   */
  getLastFolderDeploymentResults(): import('../types').FolderDeploymentResult[] {
    return this.lastFolderDeploymentResults;
  }

  /**
   * Clear the folder deployment results
   */
  clearFolderDeploymentResults(): void {
    this.lastFolderDeploymentResults = [];
  }

  // Get all workspaces accessible to the user
  async getWorkspaces(accessToken: string): Promise<WorkspaceInfo[]> {
    const response = await fetch(`${this.baseUrl}/workspaces`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch workspaces: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const fabricWorkspaces: FabricWorkspace[] = data.value || [];
    
    // Map FabricWorkspace to WorkspaceInfo format
    return fabricWorkspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.displayName,
      description: workspace.description,
      type: workspace.type,
      hasContributorAccess: true // We'll validate this separately
    }));
  }

  // Validate workspace permissions
  async validateWorkspacePermissions(workspaceId: string, accessToken: string): Promise<boolean> {
    try {
      // Try to access workspace details - if successful, user has access
      const response = await fetch(`${this.baseUrl}/workspaces/${workspaceId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }

  // Get supported connection types from Fabric API
  async getSupportedConnectionTypes(accessToken: string): Promise<SupportedConnectionType[]> {
    return await connectionService.loadSupportedConnectionTypes(accessToken);
  }

  // Validate connection details against schema
  private validateConnectionDetails(connectorType: string, connectionDetails: Record<string, any>) {
    // Proxy to connectionService's private validation helper
    // The connectionService will log warnings and return structured validation results when used in createConnector
    return { isValid: true, errors: [] };
  }

  // Build connection details dynamically based on schema
  private buildConnectionDetails(
    adfLinkedService: any,
    connectorType: string
  ): Record<string, any> {
    return connectionService.getConnectionDetails(adfLinkedService, connectorType);
  }

  /**
   * Extract pipeline name from ADF trigger pipeline reference
   * Handles multiple formats:
   * - { referenceName: 'PipelineName' }
   * - { pipelineName: 'PipelineName' }
   * - { name: 'PipelineName' }
   */
  private extractPipelineNameFromTriggerRef(pipelineRef: any): string | null {
    if (!pipelineRef || typeof pipelineRef !== 'object') {
      return null;
    }
    return pipelineRef.referenceName || pipelineRef.pipelineName || pipelineRef.name || null;
  }

  /**
   * Map ADF recurrence frequency to Fabric schedule frequency type
   * ADF: 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month'
   * Fabric: 'Minute' | 'Hour' | 'Daily' | 'Weekly' | 'Monthly'
   */
  private mapFrequencyType(adfFrequency: string): string {
    const frequencyMap: Record<string, string> = {
      'Minute': 'Minute',
      'Hour': 'Hour',
      'Day': 'Daily',
      'Week': 'Weekly',
      'Month': 'Monthly'
    };
    return frequencyMap[adfFrequency] || adfFrequency;
  }

  // Generate deployment plan for download
  generateDeploymentPlan(
    mappedComponents: ComponentMapping[], 
    workspaceId: string, 
    accessToken: string,
    pipelineConnectionMappings?: PipelineConnectionMappings
  ): string {
    const plan = {
      workspaceId,
      timestamp: new Date().toISOString(),
      deploymentOrder: 'Gateways -> Connectors -> Variables -> Pipelines -> Schedules',
      note: 'Managed identities are handled separately before deployment in the Managed Identity page',
      components: {
        gateways: [] as any[],
        connectors: [] as any[],
        variables: [] as any[],
        pipelines: [] as any[],
        schedules: [] as any[]
      }
    };

    // Group components by type for proper deployment order (excluding managedIdentity)
    const gateways = mappedComponents.filter(m => m.component.type === 'integrationRuntime');
    const connectors = mappedComponents.filter(m => m.component.type === 'linkedService');
    const variables = mappedComponents.filter(m => m.component.type === 'globalParameter');
    const pipelines = mappedComponents.filter(m => m.component.type === 'pipeline');
    const schedules = mappedComponents.filter(m => m.component.type === 'trigger');
    
    // 1. Gateways (first in deployment order)
    gateways.forEach(mapping => {
      const component = mapping.component;
      const gatewayType = component.fabricTarget?.gatewayType || 'OnPremises';
      const payload = gatewayService.getGatewayPayload(component, gatewayType);

      plan.components.gateways.push({
        method: 'POST',
        endpoint: `${this.baseUrl}/gateways`,
        payload: this.maskSensitiveData(payload),
        originalName: component.name,
        targetName: mapping.fabricTarget?.name || component.name,
        gatewayType: gatewayType
      });
    });

    // 2. Connectors (must be created after gateways)
    connectors.forEach(mapping => {
      const component = mapping.component;
      
      if (!mapping.useExisting) {
        const connectVia = component.fabricTarget?.connectVia;
        const connectionType = connectionService.determineConnectionTypePublic(component, connectVia);

        const payload = connectionService.getConnectionPayload(component, connectionType, connectVia);

        plan.components.connectors.push({
          method: 'POST',
          endpoint: `${this.baseUrl}/connections`,
          payload: this.maskSensitiveData(payload),
          originalName: component.name,
          targetName: mapping.fabricTarget?.name || component.name,
          connectionType: connectionType,
          usesGateway: connectVia ? `References Integration Runtime: ${connectVia}` : 'Cloud connection'
        });
      }
    });

    // 3. Variables
    variables.forEach(mapping => {
      const component = mapping.component;
      const payload = {
        displayName: mapping.fabricTarget?.name || component.name,
        description: `Migrated from ADF global parameter: ${component.name}`,
        type: component.definition?.type || 'String',
        defaultValue: component.definition?.defaultValue || ''
      };

      plan.components.variables.push({
        method: 'POST',
        endpoint: `${this.baseUrl}/workspaces/${workspaceId}/variables`,
        payload,
        originalName: component.name,
        targetName: mapping.fabricTarget?.name || component.name
      });
    });

    // 4. Pipelines
    pipelines.forEach(mapping => {
      const component = mapping.component;
      const pipelineDefinition = pipelineTransformer.transformPipelineDefinition(component.definition, pipelineConnectionMappings);
      const base64Payload = btoa(JSON.stringify(pipelineDefinition));

      const payload = {
        displayName: mapping.fabricTarget?.name || component.name,
        description: `Migrated from ADF pipeline: ${component.name}`,
        definition: {
          parts: [
            {
              path: "pipeline-content.json",
              payload: base64Payload,
              payloadType: "InlineBase64"
            }
          ]
        }
      };

      const activitiesCount = pipelineDefinition?.properties?.activities?.length || 0;
      plan.components.pipelines.push({
        method: 'POST',
        endpoint: `${this.baseUrl}/workspaces/${workspaceId}/dataPipelines`,
        payload,
        originalName: component.name,
        targetName: mapping.fabricTarget?.name || component.name,
        notes: `Pipeline contains ${activitiesCount} activities`
      });
    });

    // 5. Schedules (one or more per trigger depending on pipeline count)
    schedules.forEach(mapping => {
      const component = mapping.component;
      if (component.definition?.type === 'ScheduleTrigger') {
        // Extract pipeline references from trigger
        const pipelines = component.definition?.properties?.typeProperties?.pipelines || [];
        
        if (pipelines.length === 0) {
          // No pipelines referenced
          plan.components.schedules.push({
            method: 'SKIP',
            reason: 'No pipelines referenced',
            originalName: component.name,
            targetName: mapping.fabricTarget?.name || component.name
          });
        } else if (pipelines.length === 1) {
          // Single pipeline - one schedule
          const pipelineName = this.extractPipelineNameFromTriggerRef(pipelines[0]) || 'Unknown';
          const recurrence = component.definition?.properties?.typeProperties?.recurrence;
          
          plan.components.schedules.push({
            method: 'POST',
            endpoint: `${this.baseUrl}/workspaces/${workspaceId}/items/{pipelineId}/jobs/Pipeline/schedules`,
            payload: {
              displayName: `${pipelineName}_Schedule`,
              description: `Migrated from ADF trigger: ${component.name}`,
              enabled: true,
              configuration: {
                frequency: this.mapFrequencyType(recurrence?.frequency || 'Daily'),
                interval: recurrence?.interval || 1,
                startTime: recurrence?.startTime,
                endTime: recurrence?.endTime,
                timeZone: recurrence?.timeZone || 'UTC'
              }
            },
            originalName: component.name,
            targetPipeline: pipelineName,
            note: 'pipelineId will be resolved at deployment time'
          });
        } else {
          // Multiple pipelines - create one schedule entry per pipeline
          pipelines.forEach((pipelineRef: any) => {
            const pipelineName = this.extractPipelineNameFromTriggerRef(pipelineRef) || 'Unknown';
            const recurrence = component.definition?.properties?.typeProperties?.recurrence;
            
            plan.components.schedules.push({
              method: 'POST',
              endpoint: `${this.baseUrl}/workspaces/${workspaceId}/items/{pipelineId}/jobs/Pipeline/schedules`,
              payload: {
                displayName: `${pipelineName}_Schedule`,
                description: `Migrated from ADF trigger: ${component.name} (multi-pipeline)`,
                enabled: true,
                configuration: {
                  frequency: this.mapFrequencyType(recurrence?.frequency || 'Daily'),
                  interval: recurrence?.interval || 1,
                  startTime: recurrence?.startTime,
                  endTime: recurrence?.endTime,
                  timeZone: recurrence?.timeZone || 'UTC'
                }
              },
              originalName: component.name,
              targetPipeline: pipelineName,
              note: `Part of multi-pipeline trigger (${pipelines.length} pipelines total). pipelineId will be resolved at deployment time`
            });
          });
        }
      }
    });

    return JSON.stringify(plan, null, 2);
  }

  // Set connection mapping from deployment results
  setConnectionMapping(connectionResults: import('../types').ConnectionDeploymentResult[]): void {
    connectionService.setConnectionMapping(connectionResults as any);
  }

  // Deploy components to Fabric with proper ordering including pipeline dependencies
  async deployComponents(
    mappedComponents: ComponentMapping[],
    accessToken: string,
    workspaceId: string,
    onProgress?: (progress: { current: number; total: number; status: string }) => void,
    connectionResults?: import('../types').ConnectionDeploymentResult[],
    pipelineConnectionMappings?: PipelineConnectionMappings,
    pipelineReferenceMappings?: Record<string, Record<string, string>>,
    linkedServiceBridge?: LinkedServiceConnectionBridge,
    variableLibraryConfig?: import('../types').VariableLibraryConfig
  ): Promise<DeploymentResult[]> {
    console.log('FabricService.deployComponents starting with:', {
      componentsCount: mappedComponents.length,
      workspaceId,
      hasAccessToken: Boolean(accessToken),
      hasConnectionResults: Boolean(connectionResults),
      hasPipelineConnectionMappings: Boolean(pipelineConnectionMappings),
      hasPipelineReferenceMappings: Boolean(pipelineReferenceMappings),
      hasLinkedServiceBridge: Boolean(linkedServiceBridge)
    });

    // Set reference mappings and bridge for Custom activity transformation
    if (pipelineReferenceMappings) {
      pipelineTransformer.setReferenceMappings(pipelineReferenceMappings);
      console.log('✓ Set pipelineReferenceMappings for Custom activity transformation');
    }
    if (linkedServiceBridge) {
      pipelineTransformer.setLinkedServiceBridge(linkedServiceBridge);
      console.log('✓ Set linkedServiceBridge for Custom activity transformation');
    }

    try {
      const results: DeploymentResult[] = [];
      let current = 0;
      const total = mappedComponents.length;

      // Initialize progress reporting
      onProgress?.({
        current: 0,
        total,
        status: 'Initializing deployment...'
      });

      // Reset state for new deployment
      gatewayService.clear();
      connectionService.clear();

      // Set connection mapping if provided
      if (connectionResults) {
        connectionService.setConnectionMapping(connectionResults as any);
      }

      // Initialize supported connection types
      onProgress?.({
        current: 0,
        total,
        status: 'Fetching supported connection types...'
      });
      
      try {
        const supportedTypes = await connectionService.loadSupportedConnectionTypes(accessToken);
        console.log(`Loaded ${supportedTypes.length} supported connection types`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error loading connection types';
        console.warn('Failed to load supported connection types, proceeding with defaults:', { 
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        });
      }

      // Group components by type for proper deployment order
      // Note: managedIdentity components are handled separately in ManagedIdentityPage
      const gateways = mappedComponents.filter(m => m.component.type === 'integrationRuntime');
      const connectors = mappedComponents.filter(m => m.component.type === 'linkedService');
      const variables = mappedComponents.filter(m => m.component.type === 'globalParameter');
      const pipelines = mappedComponents.filter(m => m.component.type === 'pipeline');
      const schedules = mappedComponents.filter(m => m.component.type === 'trigger');
      const others = mappedComponents.filter(m => 
        !['integrationRuntime', 'linkedService', 'globalParameter', 'pipeline', 'trigger'].includes(m.component.type)
      );

      console.log('Components grouped by type:', {
        gateways: gateways.length,
        connectors: connectors.length,
        variables: variables.length,
        pipelines: pipelines.length,
        schedules: schedules.length,
        others: others.length
      });

      // Deploy folders before pipelines (if pipelines have folders)
      let folderMappings: Record<string, string> = {};
      const pipelinesWithFolders = pipelines.filter(p => p.component.folder);
      
      // Clear previous folder results
      this.clearFolderDeploymentResults();
      
      if (pipelinesWithFolders.length > 0) {
        onProgress?.({
          current: 0,
          total,
          status: 'Deploying folder structure...'
        });

        try {
          const { deployFolders, buildFolderMappings } = await import('./folderDeploymentService');
          const { extractAllFolders, applyFolderFlattening } = await import('./folderAnalysisService');
          
          // Extract and prepare folders
          const allFolders = extractAllFolders(pipelines.map(p => p.component));
          const flattenedFolders = applyFolderFlattening(allFolders);
          
          console.log(`Deploying ${flattenedFolders.length} folders`, {
            originalFoldersCount: allFolders.length,
            flattenedFoldersCount: flattenedFolders.length,
            requiresFlattening: flattenedFolders.some(f => f.isFlattened)
          });

          // Deploy folders
          const folderResults = await deployFolders(
            flattenedFolders,
            workspaceId,
            accessToken,
            (current, total, folderPath) => {
              onProgress?.({
                current: 0,
                total,
                status: `Creating folder: ${folderPath}`
              });
            }
          );

          // Build folder mappings
          folderMappings = buildFolderMappings(folderResults);
          
          // Store folder results for retrieval by DeploymentPage
          this.lastFolderDeploymentResults = folderResults;
          
          console.log('Folder deployment completed:', {
            totalFolders: folderResults.length,
            successful: folderResults.filter(r => r.status === 'success').length,
            failed: folderResults.filter(r => r.status === 'failed').length,
            mappingsCount: Object.keys(folderMappings).length
          });
        } catch (folderError) {
          const errorMessage = folderError instanceof Error ? folderError.message : 'Unknown folder deployment error';
          console.error('Folder deployment failed:', {
            error: errorMessage,
            stack: folderError instanceof Error ? folderError.stack : undefined
          });
          // Continue with pipeline deployment even if folder deployment fails
        }
      }

      // Import and initialize invoke pipeline service for dependency analysis
      onProgress?.({
        current: 0,
        total,
        status: 'Analyzing pipeline dependencies...'
      });

      let orderedPipelines: ComponentMapping[];
      try {
        const { invokePipelineService } = await import('./invokePipelineService');
        invokePipelineService.parseExecutePipelineActivities(pipelines.map(p => p.component));
        orderedPipelines = await this.orderPipelinesByDependencies(pipelines);
        console.log(`Successfully ordered ${orderedPipelines.length} pipelines by dependencies`);
      } catch (dependencyError) {
        const errorMessage = dependencyError instanceof Error ? dependencyError.message : 'Unknown dependency analysis error';
        console.warn('Pipeline dependency analysis failed, using original order:', {
          error: errorMessage,
          stack: dependencyError instanceof Error ? dependencyError.stack : undefined,
          pipelinesCount: pipelines.length
        });
        orderedPipelines = pipelines;
      }

      // Track deployed pipeline IDs for InvokePipeline activities
      const deployedPipelineIds = new Map<string, string>();

      // Deploy in order: Gateways -> Connectors -> Variables -> Pipelines (ordered by dependencies) -> Schedules -> Others
      // Note: Managed identities are handled separately in ManagedIdentityPage before deployment
      const deploymentOrder = [
        { components: gateways, type: 'Gateways' },
        { components: connectors, type: 'Connectors' },
        { components: variables, type: 'Variables' },
        { components: orderedPipelines, type: 'Pipelines' },
        { components: schedules, type: 'Schedules' },
        { components: others, type: 'Other Components' }
      ];

      for (const { components, type } of deploymentOrder) {
        for (const mapping of components) {
          current++;
          const component = mapping.component;

          onProgress?.({
            current,
            total,
            status: `Deploying ${type}: ${component.name}`
          });

          try {
            let result: DeploymentResult;

            switch (component.type) {
              case 'integrationRuntime':
                try {
                  result = await gatewayService.createGateway(component, accessToken);
                  if (result.status === 'failed') {
                    gatewayService.markFailed(component.name);
                  }
                } catch (gatewayError) {
                  const errorMessage = gatewayError instanceof Error ? gatewayError.message : 'Unknown gateway creation error';
                  console.error(`Gateway creation failed for ${component.name}:`, {
                    error: errorMessage,
                    stack: gatewayError instanceof Error ? gatewayError.stack : undefined,
                    component: component.name,
                    componentType: component.type
                  });
                  throw gatewayError;
                }
                break;

              case 'linkedService':
                if (mapping.useExisting) {
                  result = {
                    componentName: component.name,
                    componentType: component.type,
                    status: 'skipped',
                    fabricResourceId: mapping.existingResourceId,
                    note: 'Using existing connector',
                    skipReason: 'Using existing connector'
                  };
                } else {
                  try {
                    // Check if the gateway this connector depends on failed
                    const connectVia = component.fabricTarget?.connectVia;
                    if (connectVia && gatewayService.hasFailedGateway(connectVia)) {
                      const skipReason = `Skipped because gateway ${connectVia} failed to be created`;
                      result = {
                        componentName: component.name,
                        componentType: component.type,
                        status: 'skipped',
                        note: skipReason,
                        skipReason: skipReason
                      };
                      connectionService.getFailedConnectors().add(component.name);
                    } else {
                      result = await connectionService.createConnector(component, accessToken, workspaceId);
                      if (result.status === 'failed') {
                        connectionService.getFailedConnectors().add(component.name);
                      }
                    }
                  } catch (connectorError) {
                    const errorMessage = connectorError instanceof Error ? connectorError.message : 'Unknown connector creation error';
                    console.error(`Connector creation failed for ${component.name}:`, {
                      error: errorMessage,
                      stack: connectorError instanceof Error ? connectorError.stack : undefined,
                      component: component.name,
                      componentType: component.type,
                      connectVia: component.fabricTarget?.connectVia
                    });
                    throw connectorError;
                  }
                }
                break;

              case 'globalParameter':
                try {
                  result = await this.createVariable(component, accessToken, workspaceId);
                } catch (variableError) {
                  const errorMessage = variableError instanceof Error ? variableError.message : 'Unknown variable creation error';
                  console.error(`Variable creation failed for ${component.name}:`, {
                    error: errorMessage,
                    stack: variableError instanceof Error ? variableError.stack : undefined,
                    component: component.name,
                    componentType: component.type,
                    definition: component.definition
                  });
                  throw variableError;
                }
                break;

              case 'pipeline':
                try {
                  result = await this.createPipelineWithDependencyResolution(
                    component, 
                    accessToken, 
                    workspaceId, 
                    pipelineConnectionMappings,
                    deployedPipelineIds,
                    connectionResults,
                    folderMappings,
                    variableLibraryConfig
                  );
                  
                  // Track successful pipeline deployment for dependency resolution
                  if (result.status === 'success' && result.fabricResourceId) {
                    deployedPipelineIds.set(component.name, result.fabricResourceId);
                  }
                } catch (pipelineError) {
                  const errorMessage = pipelineError instanceof Error ? pipelineError.message : 'Unknown pipeline creation error';
                  console.error(`Pipeline creation failed for ${component.name}:`, {
                    error: errorMessage,
                    stack: pipelineError instanceof Error ? pipelineError.stack : undefined,
                    component: component.name,
                    componentType: component.type,
                    hasActivities: Boolean(component.definition?.properties?.activities?.length || component.definition?.activities?.length),
                    activitiesCount: component.definition?.properties?.activities?.length || component.definition?.activities?.length || 0,
                    hasConnectionMappings: Boolean(pipelineConnectionMappings),
                    deployedPipelineIdsCount: deployedPipelineIds.size
                  });
                  throw pipelineError;
                }
                break;

              case 'trigger':
                try {
                  if (component.definition?.type === 'ScheduleTrigger') {
                    // FIX: Use triggerMetadata instead of re-parsing from definition
                    // triggerMetadata.referencedPipelines was already extracted by parser
                    const pipelines = component.triggerMetadata?.referencedPipelines || [];
                    
                    console.log(`🔍 Deploying trigger "${component.name}":`, {
                      hasTriggerMetadata: Boolean(component.triggerMetadata),
                      referencedPipelines: pipelines,
                      pipelineCount: pipelines.length
                    });
                    
                    if (pipelines.length === 0) {
                      // No pipelines referenced - skip
                      const skipReason = 'No pipelines referenced by trigger';
                      console.warn(`⚠️ Skipping trigger "${component.name}": ${skipReason}`);
                      result = {
                        componentName: component.name,
                        componentType: component.type,
                        status: 'skipped',
                        note: skipReason,
                        skipReason: skipReason
                      };
                    } else if (pipelines.length === 1) {
                      // Single pipeline - create one schedule
                      // Pipeline names are already extracted strings in triggerMetadata.referencedPipelines
                      const pipelineName = pipelines[0];
                      if (!pipelineName) {
                        result = {
                          componentName: component.name,
                          componentType: component.type,
                          status: 'failed',
                          error: 'Could not extract pipeline name from trigger reference'
                        };
                      } else {
                        const pipelineId = deployedPipelineIds.get(pipelineName);
                        if (!pipelineId) {
                          result = {
                            componentName: component.name,
                            componentType: component.type,
                            status: 'failed',
                            error: `Pipeline '${pipelineName}' not found in deployed pipelines. Ensure pipeline is deployed before trigger.`
                          };
                        } else {
                          result = await scheduleService.createSchedule(
                            component, 
                            accessToken, 
                            workspaceId,
                            pipelineId,
                            pipelineName
                          );
                        }
                      }
                    } else {
                      // Multiple pipelines - create schedule for each
                      const scheduleResults: { pipeline: string; success: boolean; error?: string }[] = [];
                      let successCount = 0;
                      let failCount = 0;

                      // Pipeline names are already extracted strings in triggerMetadata.referencedPipelines
                      for (const pipelineName of pipelines) {
                        if (!pipelineName) {
                          scheduleResults.push({ 
                            pipeline: 'Unknown', 
                            success: false, 
                            error: 'Could not extract pipeline name' 
                          });
                          failCount++;
                          continue;
                        }

                        const pipelineId = deployedPipelineIds.get(pipelineName);
                        if (!pipelineId) {
                          scheduleResults.push({ 
                            pipeline: pipelineName, 
                            success: false, 
                            error: 'Pipeline not deployed' 
                          });
                          failCount++;
                          continue;
                        }

                        const scheduleResult = await scheduleService.createSchedule(
                          component,
                          accessToken,
                          workspaceId,
                          pipelineId,
                          pipelineName
                        );

                        if (scheduleResult.status === 'success') {
                          scheduleResults.push({ pipeline: pipelineName, success: true });
                          successCount++;
                        } else {
                          scheduleResults.push({ 
                            pipeline: pipelineName, 
                            success: false, 
                            error: scheduleResult.error || scheduleResult.errorMessage 
                          });
                          failCount++;
                        }
                      }

                      // Determine overall status
                      if (successCount === pipelines.length) {
                        result = {
                          componentName: component.name,
                          componentType: component.type,
                          status: 'success',
                          note: `Created ${successCount} schedules for ${pipelines.length} pipelines`,
                          details: scheduleResults.map(r => `${r.pipeline}: ${r.success ? 'Success' : 'Failed - ' + r.error}`).join('; ')
                        };
                      } else if (successCount > 0) {
                        result = {
                          componentName: component.name,
                          componentType: component.type,
                          status: 'partial',
                          note: `Created ${successCount}/${pipelines.length} schedules`,
                          details: scheduleResults.map(r => `${r.pipeline}: ${r.success ? 'Success' : 'Failed - ' + r.error}`).join('; '),
                          error: `${failCount} schedule(s) failed to create`
                        };
                      } else {
                        result = {
                          componentName: component.name,
                          componentType: component.type,
                          status: 'failed',
                          error: `All ${pipelines.length} schedules failed to create`,
                          details: scheduleResults.map(r => `${r.pipeline}: Failed - ${r.error}`).join('; ')
                        };
                      }
                    }
                  } else {
                    const skipReason = 'Only schedule triggers are supported';
                    result = {
                      componentName: component.name,
                      componentType: component.type,
                      status: 'skipped',
                      note: skipReason,
                      skipReason: skipReason
                    };
                  }
                } catch (scheduleError) {
                  const errorMessage = scheduleError instanceof Error ? scheduleError.message : 'Unknown schedule creation error';
                  console.error(`Schedule creation failed for ${component.name}:`, {
                    error: errorMessage,
                    stack: scheduleError instanceof Error ? scheduleError.stack : undefined,
                    component: component.name,
                    componentType: component.type,
                    triggerType: component.definition?.type
                  });
                  throw scheduleError;
                }
                break;

              default:
                const skipReason = 'Component type not supported for migration';
                result = {
                  componentName: component.name,
                  componentType: component.type,
                  status: 'skipped',
                  note: skipReason,
                  skipReason: skipReason
                };
                break;
            }

            results.push(result);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            const errorName = error instanceof Error ? error.name : 'UnknownError';
            
            // Enhanced error logging with context
            console.error(`Deployment failed for component ${component.name}:`, {
              componentName: component.name,
              componentType: component.type,
              error: {
                name: errorName,
                message: errorMessage,
                stack: errorStack
              },
              context: {
                current,
                total,
                workspaceId,
                hasAccessToken: Boolean(accessToken),
                mapping: {
                  useExisting: mapping.useExisting,
                  fabricTarget: mapping.fabricTarget,
                  existingResourceId: mapping.existingResourceId
                }
              }
            });

            const result: DeploymentResult = {
              componentName: component.name,
              componentType: component.type,
              status: 'failed',
              error: errorMessage,
              errorMessage: `${errorName}: ${errorMessage}`,
              note: `Deployment failed at step ${current}/${total}. Context: ${type} - ${component.name}. Stack trace available in console.`
            };
            
            // Track failed components
            if (component.type === 'integrationRuntime') {
              gatewayService.markFailed(component.name);
            } else if (component.type === 'linkedService') {
              connectionService.getFailedConnectors().add(component.name);
            }
            
            results.push(result);
          }
        }
      }

      console.log('FabricService.deployComponents completed successfully:', {
        totalResults: results.length,
        successCount: results.filter(r => r.status === 'success').length,
        failedCount: results.filter(r => r.status === 'failed').length,
        skippedCount: results.filter(r => r.status === 'skipped').length
      });

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown deployment error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      // Enhanced top-level error logging
      console.error('FabricService.deployComponents failed with top-level error:', {
        error: {
          name: errorName,
          message: errorMessage,
          stack: errorStack
        },
        context: {
          componentsCount: mappedComponents.length,
          workspaceId,
          hasAccessToken: Boolean(accessToken),
          hasConnectionResults: Boolean(connectionResults),
          hasPipelineConnectionMappings: Boolean(pipelineConnectionMappings)
        }
      });

      // If this is the "require is not defined" error, provide specific guidance
      if (errorMessage.includes('require is not defined')) {
        throw new Error(`Module loading error: The application attempted to use Node.js-style 'require()' statements in browser code. This indicates a build configuration issue or incorrect import/export statements. Original error: ${errorMessage}`);
      }

      // Return a failed result for all components if top-level error occurs
      const failedResults: DeploymentResult[] = mappedComponents.map(mapping => ({
        componentName: mapping.component.name,
        componentType: mapping.component.type,
        status: 'failed',
        error: errorMessage,
        errorMessage: `Deployment failed: ${errorName}: ${errorMessage}`,
        note: `Top-level deployment error occurred. See console for stack trace.`
      }));

      return failedResults;
    }
  }

  // Create a gateway in Fabric
  private async createGateway(component: ADFComponent, accessToken: string): Promise<DeploymentResult> {
    return await gatewayService.createGateway(component, accessToken);
  }

  // Create a connector in Fabric with enhanced validation and error handling
  private async createConnector(component: ADFComponent, accessToken: string, workspaceId: string): Promise<DeploymentResult> {
    return await connectionService.createConnector(component, accessToken, workspaceId);
  }

  // Create a variable in Fabric
  private async createVariable(
    component: ADFComponent,
    accessToken: string,
    workspaceId: string
  ): Promise<DeploymentResult> {
    const endpoint = `${this.baseUrl}/workspaces/${workspaceId}/variables`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    try {
      const variablePayload = {
        displayName: component.fabricTarget?.name || component.name,
        description: `Migrated from ADF global parameter: ${component.name}`,
        type: component.definition?.type || 'String',
        defaultValue: component.definition?.defaultValue || '',
        ...component.fabricTarget?.configuration
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(variablePayload)
      });

      if (!response.ok) {
        return await fabricApiClient.handleAPIError(response, 'POST', endpoint, variablePayload, headers, component.name, component.type);
      }

      const result = await response.json();
      
      return {
        componentName: component.name,
        componentType: component.type,
        status: 'success',
        fabricResourceId: result.id
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating variable';
      return {
        componentName: component.name,
        componentType: component.type,
        status: 'failed',
        error: errorMessage
      };
    }
  }

  // Create a pipeline in Fabric with enhanced error handling and inactive activity support
  private async createPipeline(
    component: ADFComponent, 
    accessToken: string, 
    workspaceId: string,
    pipelineConnectionMappings?: PipelineConnectionMappings,
    folderMappings?: Record<string, string>
  ): Promise<DeploymentResult> {
    return await pipelineTransformer.createPipeline(component, accessToken, workspaceId, pipelineConnectionMappings, folderMappings);
  }

  // Update pipeline activities to mark as inactive if they reference failed connectors
  // Also preserve activities with LinkedService references by updating their connections
  private updatePipelineActivitiesForFailedConnectors(pipelineDefinition: any): any {
    return pipelineTransformer.updatePipelineActivitiesForFailedConnectors(pipelineDefinition);
  }

  // Transform LinkedService references to Fabric format - comprehensive implementation
  private transformLinkedServiceReferencesToFabric(activity: any): void {
    return activityTransformer.transformLinkedServiceReferencesToFabric(activity);
  }

  // Remove LinkedService references and set externalReferences for Fabric
  private removeLinkedServiceReferencesAndSetExternalReferences(activity: any): void {
    return activityTransformer.removeLinkedServiceReferencesAndSetExternalReferences ? activityTransformer.removeLinkedServiceReferencesAndSetExternalReferences(activity) : activityTransformer.setExternalReferences(activity);
  }

  // Convert static text properties to Expression objects for Fabric
  private convertStaticTextToExpressions(activity: any): void {
    return activityTransformer.convertStaticTextToExpressions ? activityTransformer.convertStaticTextToExpressions(activity) : activityTransformer.convertStaticTextToExpressions(activity);
  }

  // Convert Script activity text to Expression format
  private convertScriptActivityExpressions(typeProperties: any): void { return activityTransformer.convertScriptActivityExpressions ? activityTransformer.convertScriptActivityExpressions(typeProperties) : undefined; }

  // Convert StoredProcedure activity properties to Expression format
  private convertStoredProcedureActivityExpressions(typeProperties: any): void { return activityTransformer.convertStoredProcedureActivityExpressions ? activityTransformer.convertStoredProcedureActivityExpressions(typeProperties) : undefined; }
  
  // Convert Web activity properties to Expression format
  private convertWebActivityExpressions(typeProperties: any): void { return activityTransformer.convertWebActivityExpressions ? activityTransformer.convertWebActivityExpressions(typeProperties) : undefined; }
  private convertCommonStringPropertiesToExpressions(typeProperties: any): void { return activityTransformer.convertCommonStringPropertiesToExpressions ? activityTransformer.convertCommonStringPropertiesToExpressions(typeProperties) : undefined; }

  // Transform ADF connection details to Fabric format
  private transformConnectionDetails(definition: any): Record<string, any> {
    if (!definition) return {};

    const connectionDetails: Record<string, any> = {};
    const typeProps = definition.properties?.typeProperties || {};

    // Handle different connection types
    if (typeProps.connectionString) {
      connectionDetails.connectionString = typeProps.connectionString;
    }
    if (typeProps.serviceUri) {
      connectionDetails.serviceUri = typeProps.serviceUri;
    }
    if (typeProps.url) {
      connectionDetails.serverName = typeProps.url;
    }
    if (typeProps.databaseName) {
      connectionDetails.databaseName = typeProps.databaseName;
    }
    
    return connectionDetails;
  }

  // Transform ADF pipeline definition to Fabric format with enhanced structure handling
  private transformPipelineDefinition(definition: any): any {
    if (!definition) {
      console.warn('No pipeline definition provided');
      return { properties: {} };
    }

    console.log('Transforming pipeline definition:', {
      inputStructure: {
        hasProperties: Boolean(definition.properties),
        hasDirectActivities: Boolean(definition.activities),
        hasType: Boolean(definition.type),
        topLevelKeys: Object.keys(definition)
      }
    });

    // Handle different definition structures from enhanced ARM parser
    let pipelineProperties: any = {};

    // Case 1: Enhanced structure from new parser (definition.properties.activities)
    if (definition.properties && typeof definition.properties === 'object') {
      pipelineProperties = definition.properties;
      console.log('Using definition.properties structure');
    }
    // Case 2: Direct properties structure (definition.activities)
    else if (definition.activities || definition.parameters || definition.variables) {
      pipelineProperties = definition;
      console.log('Using direct properties structure');
    }
    // Case 3: Fallback to empty structure
    else {
      console.warn('Unknown pipeline definition structure, using empty fallback');
      pipelineProperties = {};
    }

    // Ensure we extract activities correctly from various possible structures
    const activities = this.extractActivitiesFromDefinition(pipelineProperties);
    const parameters = this.extractParametersFromDefinition(pipelineProperties);
    const variables = this.extractVariablesFromDefinition(pipelineProperties);

    // Build comprehensive Fabric-compatible pipeline definition
    const fabricPipelineDefinition = {
      properties: {
        // Core pipeline components
        activities: this.transformActivities(activities),
        parameters: parameters,
        variables: variables,
        
        // Optional pipeline settings
        annotations: pipelineProperties.annotations || [],
        concurrency: this.extractConcurrencyFromDefinition(pipelineProperties),
        policy: this.extractPolicyFromDefinition(pipelineProperties),
        
        // Additional properties that might be present
        folder: pipelineProperties.folder || undefined,
        description: pipelineProperties.description || undefined,
        
        // Preserve any other custom properties
        ...this.extractOtherPropertiesFromDefinition(pipelineProperties)
      }
    };

    // Enhanced logging for validation
    const inputActivitiesCount = activities.length;
    const outputActivitiesCount = fabricPipelineDefinition.properties.activities.length;
    
    console.log('Pipeline transformation completed:', {
      input: {
        hasActivities: inputActivitiesCount > 0,
        activitiesCount: inputActivitiesCount,
        hasParameters: Object.keys(parameters).length > 0,
        hasVariables: Object.keys(variables).length > 0
      },
      output: {
        hasActivities: outputActivitiesCount > 0,
        activitiesCount: outputActivitiesCount,
        hasParameters: Object.keys(fabricPipelineDefinition.properties.parameters).length > 0,
        hasVariables: Object.keys(fabricPipelineDefinition.properties.variables).length > 0
      },
      success: inputActivitiesCount === outputActivitiesCount
    });

    // Validation check
    if (inputActivitiesCount > 0 && outputActivitiesCount === 0) {
      console.error('CRITICAL: Activities were lost during transformation!', {
        originalDefinition: definition,
        extractedProperties: pipelineProperties,
        extractedActivities: activities
      });
    }

    return fabricPipelineDefinition;
  }

  /**
   * Extract activities from pipeline definition with multiple fallback strategies
   */
  private extractActivitiesFromDefinition(properties: any): any[] {
    if (!properties || typeof properties !== 'object') {
      return [];
    }

    // Try multiple possible locations for activities
    const possibleActivitySources = [
      properties.activities,
      properties.Activities,
      properties.pipelineActivities,
      properties.definition?.activities,
      properties.properties?.activities
    ];

    for (const source of possibleActivitySources) {
      if (Array.isArray(source) && source.length > 0) {
        console.log(`Found activities in source with ${source.length} items`);
        return source;
      }
    }

    console.log('No activities found in any expected locations');
    return [];
  }

  /**
   * Extract parameters from pipeline definition
   */
  private extractParametersFromDefinition(properties: any): Record<string, any> {
    if (!properties || typeof properties !== 'object') {
      return {};
    }

    return properties.parameters || properties.Parameters || {};
  }

  /**
   * Extract variables from pipeline definition
   */
  private extractVariablesFromDefinition(properties: any): Record<string, any> {
    if (!properties || typeof properties !== 'object') {
      return {};
    }

    return properties.variables || properties.Variables || {};
  }

  /**
   * Extract concurrency settings
   */
  private extractConcurrencyFromDefinition(properties: any): number {
    if (!properties || typeof properties !== 'object') {
      return 1;
    }

    const concurrency = properties.concurrency || properties.Concurrency;
    return typeof concurrency === 'number' && concurrency > 0 ? concurrency : 1;
  }

  /**
   * Extract policy settings
   */
  private extractPolicyFromDefinition(properties: any): any {
    if (!properties || typeof properties !== 'object') {
      return {};
    }

    return properties.policy || properties.Policy || {};
  }

  /**
   * Extract other properties that should be preserved
   */
  private extractOtherPropertiesFromDefinition(properties: any): Record<string, any> {
    if (!properties || typeof properties !== 'object') {
      return {};
    }

    const knownKeys = [
      'activities', 'Activities', 'parameters', 'Parameters', 
      'variables', 'Variables', 'annotations', 'concurrency', 
      'Concurrency', 'policy', 'Policy', 'folder', 'description'
    ];

    const otherProperties: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      if (!knownKeys.includes(key) && value !== undefined) {
        otherProperties[key] = value;
      }
    }

    return otherProperties;
  }

  // Transform ADF activities to Fabric-compatible format
  private transformActivities(activities: any[]): any[] {
    if (!Array.isArray(activities)) {
      return [];
    }

    return activities.map(activity => {
      if (!activity || typeof activity !== 'object') {
        return activity;
      }

      // Transform activity based on type with LinkedService reference handling
      const transformedActivity = {
        ...activity,
        // Ensure activity has required properties
        name: activity.name || `activity_${Date.now()}`,
        type: activity.type || 'Unknown',
        // Transform type-specific properties with LinkedService resolution
        typeProperties: this.transformActivityTypeProperties(activity.type, activity.typeProperties || {}),
        // Transform depends on relationships
        dependsOn: this.transformActivityDependencies(activity.dependsOn || []),
        // Transform user properties
        userProperties: activity.userProperties || [],
        // Transform policy settings
        policy: activity.policy || {},
        // Transform inputs (datasets) with LinkedService references
        inputs: this.transformActivityInputs(activity.inputs || []),
        // Transform outputs (datasets) with LinkedService references  
        outputs: this.transformActivityOutputs(activity.outputs || [])
      };

      // Log activity transformation for debugging with LinkedService info
      console.log(`Transformed activity ${activity.name}:`, {
        type: activity.type,
        hasTypeProperties: Boolean(activity.typeProperties),
        hasDependencies: Boolean(activity.dependsOn?.length),
        hasInputs: Boolean(activity.inputs?.length),
        hasOutputs: Boolean(activity.outputs?.length),
        hasLinkedServiceRefs: this.hasLinkedServiceReferences(activity),
        transformedType: transformedActivity.type
      });

      return transformedActivity;
    });
  }

  // Transform activity type-specific properties
  private transformActivityTypeProperties(activityType: string, typeProperties: any): any {
    if (!typeProperties || typeof typeProperties !== 'object') {
      return typeProperties;
    }

    // Handle different activity types that might need special transformation
    switch (activityType) {
      case 'Copy':
        return this.transformCopyActivityProperties(typeProperties);
      case 'ExecutePipeline':
        return this.transformExecutePipelineProperties(typeProperties);
      case 'Lookup':
        return this.transformLookupActivityProperties(typeProperties);
      case 'ForEach':
        return this.transformForEachActivityProperties(typeProperties);
      case 'If':
        return this.transformIfActivityProperties(typeProperties);
      case 'Wait':
        return this.transformWaitActivityProperties(typeProperties);
      case 'WebActivity':
        return this.transformWebActivityProperties(typeProperties);
      default:
        // For unknown or unsupported activity types, pass through as-is
        return typeProperties;
    }
  }

  // Transform Copy activity properties with LinkedService reference handling
  private transformCopyActivityProperties(properties: any): any {
    const transformedProperties = {
      ...properties,
      // Ensure source and sink are properly structured
      source: this.transformCopySource(properties.source || {}),
      sink: this.transformCopySink(properties.sink || {}),
      // Transform dataset references if needed
      translator: properties.translator || undefined,
      enableStaging: properties.enableStaging || false,
      stagingSettings: properties.stagingSettings || undefined,
      parallelCopies: properties.parallelCopies || undefined,
      dataIntegrationUnits: properties.dataIntegrationUnits || undefined,
      enableSkipIncompatibleRow: properties.enableSkipIncompatibleRow || false,
      redirectIncompatibleRowSettings: properties.redirectIncompatibleRowSettings || undefined
    };

    // Log transformation for debugging
    console.log('Transformed Copy activity properties:', {
      hasSource: Boolean(transformedProperties.source),
      hasSink: Boolean(transformedProperties.sink),
      sourceType: transformedProperties.source?.type,
      sinkType: transformedProperties.sink?.type,
      hasLinkedServiceRefs: this.hasLinkedServiceReferencesInCopyActivity(properties)
    });

    return transformedProperties;
  }

  // Transform Copy activity source with LinkedService resolution
  private transformCopySource(source: any): any {
    if (!source || typeof source !== 'object') {
      return source;
    }

    const transformedSource = {
      ...source,
      // If source has a LinkedService reference, preserve it for now
      // TODO: Map to Fabric connection reference when available
      linkedServiceName: source.linkedServiceName || undefined,
      fabricConnectionId: source.linkedServiceName?.referenceName 
        ? this.mapLinkedServiceToConnection(source.linkedServiceName.referenceName)
        : undefined
    };

    return transformedSource;
  }

  // Transform Copy activity sink with LinkedService resolution
  private transformCopySink(sink: any): any {
    if (!sink || typeof sink !== 'object') {
      return sink;
    }

    const transformedSink = {
      ...sink,
      // If sink has a LinkedService reference, preserve it for now
      // TODO: Map to Fabric connection reference when available
      linkedServiceName: sink.linkedServiceName || undefined,
      fabricConnectionId: sink.linkedServiceName?.referenceName 
        ? this.mapLinkedServiceToConnection(sink.linkedServiceName.referenceName)
        : undefined
    };

    return transformedSink;
  }

  // Check if Copy activity has LinkedService references
  private hasLinkedServiceReferencesInCopyActivity(properties: any): boolean {
    if (!properties || typeof properties !== 'object') {
      return false;
    }

    const sourceHasLinkedService = properties.source?.linkedServiceName?.referenceName;
    const sinkHasLinkedService = properties.sink?.linkedServiceName?.referenceName;
    
    return Boolean(sourceHasLinkedService || sinkHasLinkedService);
  }

  // Transform ExecutePipeline activity properties
  private transformExecutePipelineProperties(properties: any): any {
    return {
      ...properties,
      pipeline: properties.pipeline || {},
      parameters: properties.parameters || {},
      waitOnCompletion: properties.waitOnCompletion !== false // Default to true
    };
  }

  // Transform Lookup activity properties
  private transformLookupActivityProperties(properties: any): any {
    return {
      ...properties,
      source: properties.source || {},
      dataset: properties.dataset || {},
      firstRowOnly: properties.firstRowOnly !== false // Default to true
    };
  }

  // Transform ForEach activity properties
  private transformForEachActivityProperties(properties: any): any {
    return {
      ...properties,
      items: properties.items || {},
      activities: this.transformActivities(properties.activities || []),
      isSequential: properties.isSequential === true, // Default to false
      batchCount: properties.batchCount || undefined
    };
  }

  // Transform If activity properties
  private transformIfActivityProperties(properties: any): any {
    return {
      ...properties,
      expression: properties.expression || {},
      ifTrueActivities: this.transformActivities(properties.ifTrueActivities || []),
      ifFalseActivities: this.transformActivities(properties.ifFalseActivities || [])
    };
  }

  // Transform Wait activity properties
  private transformWaitActivityProperties(properties: any): any {
    return {
      ...properties,
      waitTimeInSeconds: properties.waitTimeInSeconds || 0
    };
  }

  // Transform Web activity properties
  private transformWebActivityProperties(properties: any): any {
    return {
      ...properties,
      url: properties.url || '',
      method: properties.method || 'GET',
      headers: properties.headers || {},
      body: properties.body || undefined,
      authentication: properties.authentication || undefined,
      datasets: properties.datasets || [],
      linkedServices: properties.linkedServices || []
    };
  }

  // Transform activity inputs (datasets) with LinkedService reference resolution
  private transformActivityInputs(inputs: any[]): any[] {
    if (!Array.isArray(inputs)) {
      return [];
    }

    return inputs.map(input => {
      if (!input || typeof input !== 'object') {
        return input;
      }

      // Transform dataset references
      if (input.type === 'DatasetReference') {
        return {
          ...input,
          // Preserve original reference name for now
          // TODO: Map to Fabric dataset equivalent if needed
          referenceName: input.referenceName,
          type: input.type,
          // Add any LinkedService mapping information
          fabricConnectionId: this.mapLinkedServiceToConnection(input.referenceName)
        };
      }

      return input;
    });
  }

  // Transform activity outputs (datasets) with LinkedService reference resolution
  private transformActivityOutputs(outputs: any[]): any[] {
    if (!Array.isArray(outputs)) {
      return [];
    }

    return outputs.map(output => {
      if (!output || typeof output !== 'object') {
        return output;
      }

      // Transform dataset references
      if (output.type === 'DatasetReference') {
        return {
          ...output,
          // Preserve original reference name for now
          // TODO: Map to Fabric dataset equivalent if needed
          referenceName: output.referenceName,
          type: output.type,
          // Add any LinkedService mapping information
          fabricConnectionId: this.mapLinkedServiceToConnection(output.referenceName)
        };
      }

      return output;
    });
  }

  // Check if an activity has LinkedService references
  private hasLinkedServiceReferences(activity: any): boolean {
    if (!activity || typeof activity !== 'object') {
      return false;
    }

    // Check for dataset references in inputs/outputs
    const hasInputDatasets = Array.isArray(activity.inputs) && 
                             activity.inputs.some((input: any) => input?.type === 'DatasetReference');
    const hasOutputDatasets = Array.isArray(activity.outputs) && 
                              activity.outputs.some((output: any) => output?.type === 'DatasetReference');

    // Check for LinkedService references in typeProperties
    const typeProperties = activity.typeProperties || {};
    const hasDirectLinkedServiceRefs = this.hasDirectLinkedServiceReferences(typeProperties);

    return hasInputDatasets || hasOutputDatasets || hasDirectLinkedServiceRefs;
  }

  // Check for direct LinkedService references in activity type properties
  private hasDirectLinkedServiceReferences(typeProperties: any): boolean {
    if (!typeProperties || typeof typeProperties !== 'object') {
      return false;
    }

    // Check common places where LinkedService references might appear
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

  // Map LinkedService reference to Fabric connection using the stored mapping
  private mapLinkedServiceToConnection(linkedServiceName: string | undefined): string | undefined {
    return connectionService.mapLinkedServiceToConnection(linkedServiceName);
   }

  // Transform activity dependencies
  private transformActivityDependencies(dependencies: any[]): any[] {
    if (!Array.isArray(dependencies)) {
      return [];
    }

    return dependencies.map(dep => {
      if (!dep || typeof dep !== 'object') {
        return dep;
      }

      return {
        activity: dep.activity || '',
        dependencyConditions: Array.isArray(dep.dependencyConditions) 
          ? dep.dependencyConditions 
          : ['Succeeded'], // Default dependency condition
        ...dep
      };
    });
  }

  // Transform ADF schedule to Fabric format
  private transformSchedule(definition: any): any {
    if (!definition?.recurrence) return {};

    return {
      frequency: definition.recurrence.frequency,
      interval: definition.recurrence.interval,
      startTime: definition.recurrence.startTime,
      endTime: definition.recurrence.endTime,
      timeZone: definition.recurrence.timeZone
    };
  }

  // Get deployment summary including inactive activities
  getDeploymentSummary(results: DeploymentResult[]): {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    pipelinesWithInactiveActivities: { name: string; inactiveCount: number }[];
  } {
    const pipelinesWithInactiveActivities: { name: string; inactiveCount: number }[] = [];
    
    // Parse pipeline results for inactive activity information
    const pipelineResults = results.filter(r => r.componentType === 'pipeline' && r.status === 'success');
    
    for (const result of pipelineResults) {
      if (result.note && result.note.includes('inactive')) {
        const match = result.note.match(/(\d+)\s+activities\s+marked\s+as\s+inactive/);
        if (match) {
          const inactiveCount = parseInt(match[1], 10);
          pipelinesWithInactiveActivities.push({
            name: result.componentName,
            inactiveCount
          });
        }
      }
    }

    return {
      total: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      pipelinesWithInactiveActivities
    };
  }
  private maskSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const masked = { ...data };
    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'connectionString',
      'Authorization', 'accessToken', 'clientSecret'
    ];

    const maskValue = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(maskValue);
      }
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive.toLowerCase()))) {
            result[key] = typeof value === 'string' ? '***MASKED***' : '***';
          } else {
            result[key] = maskValue(value);
          }
        }
        return result;
      }
      return obj;
    };

    return maskValue(masked);
  }

  // Deploy LinkedService connections to Fabric
  async deployConnections(
    linkedServices: import('../types').LinkedServiceConnection[],
    supportedConnectionTypes: import('../types').SupportedConnectionType[],
    accessToken: string,
    onProgress?: (progress: { current: number; total: number; status: string }) => void
  ): Promise<import('../types').ConnectionDeploymentResult[]> {
    const results: import('../types').ConnectionDeploymentResult[] = [];
    const configuredConnections = linkedServices.filter(ls => ls.status === 'configured');
    
    let current = 0;
    const total = configuredConnections.length;

    for (const linkedService of configuredConnections) {
      current++;
      onProgress?.({
        current,
        total,
        status: `Creating connection: ${linkedService.linkedServiceName}`
      });

      try {
        // Import the service here to avoid circular dependency
        const { linkedServiceConnectionService } = await import('./linkedServiceConnectionService');
        const result = await linkedServiceConnectionService.createConnection(linkedService, supportedConnectionTypes, accessToken);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          linkedServiceName: linkedService.linkedServiceName,
          status: 'failed',
          errorMessage
        });
      }
    }

    return results;
  }

  // Get connection deployment summary
  getConnectionDeploymentSummary(results: import('../types').ConnectionDeploymentResult[]): {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  } {
    return {
      total: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length
    };
  }

  // Order pipelines by dependencies for proper deployment sequence
  private async orderPipelinesByDependencies(pipelines: ComponentMapping[]): Promise<ComponentMapping[]> {
    try {
      // Import invoke pipeline service for dependency analysis using dynamic import
      const { invokePipelineService } = await import('./invokePipelineService');
      
      // Parse components to find dependencies
      const pipelineComponents = pipelines.map(p => p.component);
      invokePipelineService.parseExecutePipelineActivities(pipelineComponents);
      
      // Validate pipeline references first
      const validation = invokePipelineService.validatePipelineReferences();
      if (!validation.isValid) {
        console.warn('Pipeline dependency validation failed:', {
          missingPipelines: validation.missingPipelines,
          totalPipelines: pipelineComponents.length,
          availablePipelines: pipelineComponents.map(p => p.name)
        });
        
        // Log a detailed warning but continue with original order
        console.warn(`Missing target pipelines for ExecutePipeline activities: ${validation.missingPipelines.join(', ')}. These pipelines may fail during deployment.`);
      }
      
      // Get deployment order
      const deploymentOrder = invokePipelineService.calculateDeploymentOrder();
      
      console.log('Pipeline deployment order calculated:', {
        totalPipelines: deploymentOrder.length,
        orderDetails: deploymentOrder.map(order => ({
          name: order.pipelineName,
          level: order.level,
          dependsOn: order.dependsOnPipelines,
          isReferencedByOthers: order.isReferencedByOthers
        }))
      });
      
      // Sort pipelines according to deployment order
      const orderedPipelines: ComponentMapping[] = [];
      const pipelineMap = new Map<string, ComponentMapping>();
      
      // Create a map for quick lookup
      pipelines.forEach(pipeline => {
        pipelineMap.set(pipeline.component.name, pipeline);
      });
      
      // Add pipelines in dependency order (level 0 first, then level 1, etc.)
      for (const orderInfo of deploymentOrder) {
        const pipeline = pipelineMap.get(orderInfo.pipelineName);
        if (pipeline) {
          orderedPipelines.push(pipeline);
          console.log(`Added pipeline '${orderInfo.pipelineName}' at level ${orderInfo.level} (depends on: ${orderInfo.dependsOnPipelines.join(', ') || 'none'})`);
        } else {
          console.warn(`Pipeline '${orderInfo.pipelineName}' found in deployment order but not in input mappings`);
        }
      }
      
      // Add any pipelines that weren't in the deployment order (shouldn't happen but safety net)
      for (const pipeline of pipelines) {
        if (!orderedPipelines.find(op => op.component.name === pipeline.component.name)) {
          orderedPipelines.push(pipeline);
          console.warn(`Pipeline '${pipeline.component.name}' not found in deployment order, adding to end`);
        }
      }
      
      console.log(`Successfully ordered ${orderedPipelines.length} pipelines by dependencies:`, {
        originalOrder: pipelines.map(p => p.component.name),
        newOrder: orderedPipelines.map(p => p.component.name),
        reordered: JSON.stringify(pipelines.map(p => p.component.name)) !== JSON.stringify(orderedPipelines.map(p => p.component.name))
      });
      
      return orderedPipelines;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error ordering pipelines';
      console.warn('Failed to order pipelines by dependencies, using original order:', { 
        error: errorMessage, 
        stackTrace: error instanceof Error ? error.stack : undefined,
        pipelinesCount: pipelines.length,
        pipelineNames: pipelines.map(p => p.component.name)
      });
      return pipelines;
    }
  }

  // Create pipeline with dependency resolution for InvokePipeline activities
  private async createPipelineWithDependencyResolution(
    component: ADFComponent,
    accessToken: string,
    workspaceId: string,
    pipelineConnectionMappings?: PipelineConnectionMappings,
    deployedPipelineIds?: Map<string, string>,
    connectionResults?: import('../types').ConnectionDeploymentResult[],
    folderMappings?: Record<string, string>,
    variableLibraryConfig?: import('../types').VariableLibraryConfig
  ): Promise<DeploymentResult> {
    try {
      console.log(`Starting pipeline creation for '${component.name}' with dependency resolution`, {
        hasPipelineConnectionMappings: Boolean(pipelineConnectionMappings),
        deployedPipelineIdsCount: deployedPipelineIds?.size || 0,
        deployedPipelineIds: deployedPipelineIds ? Array.from(deployedPipelineIds.entries()) : [],
        hasConnectionResults: Boolean(connectionResults),
        connectionResultsCount: connectionResults?.length || 0
      });

      // Transform the pipeline definition and resolve dependencies
      let pipelineDefinition = pipelineTransformer.transformPipelineDefinition(component.definition, pipelineConnectionMappings);
      
      // Apply connection mappings if provided
      if (pipelineConnectionMappings) {
        const { PipelineConnectionTransformerService } = await import('./pipelineConnectionTransformerService');
        pipelineDefinition = PipelineConnectionTransformerService.transformPipelineWithConnections(
          pipelineDefinition, 
          component.name, 
          pipelineConnectionMappings
        );
      }

      // NEW: Apply global parameter transformations if Variable Library is configured
      if (variableLibraryConfig && variableLibraryConfig.deploymentStatus === 'success') {
        console.log(`[FabricService] Applying global parameter transformations for pipeline '${component.name}'`);
        
        // Step 1: Transform expressions from @pipeline().globalParameters.X to @pipeline().libraryVariables.LibName_VariableLibrary_X
        const parameterNames = variableLibraryConfig.variables.map(v => v.name);
        pipelineDefinition = pipelineTransformer.transformGlobalParameterExpressions(
          pipelineDefinition,
          parameterNames,
          variableLibraryConfig.displayName // Pass library name for proper key formatting
        );
        
        // Step 2: Inject libraryVariables section into pipeline
        // Build variableNamesWithTypes array with proper type mapping
        const variableNamesWithTypes = variableLibraryConfig.variables.map(v => ({
          name: v.name,
          fabricType: v.fabricDataType === 'Boolean' ? 'Bool' : 
                      v.fabricDataType === 'Integer' ? 'Int' :
                      v.fabricDataType === 'Number' ? 'Float' : 'String'
        }));
        
        pipelineDefinition = pipelineTransformer.injectLibraryVariables(
          pipelineDefinition,
          variableLibraryConfig.displayName,
          variableNamesWithTypes
        );
        
        console.log(`[FabricService] Global parameter transformations applied for pipeline '${component.name}': ${variableNamesWithTypes.length} variables`);
      }

      // Resolve InvokePipeline activity dependencies
      if (pipelineDefinition.properties?.activities) {
        console.log(`Processing ${pipelineDefinition.properties.activities.length} activities for pipeline '${component.name}'`);
        
        for (const activity of pipelineDefinition.properties.activities) {
          if (activity.type === 'InvokePipeline') {
            console.log(`Found InvokePipeline activity '${activity.name}'`, {
              hasOriginalTargetPipeline: Boolean(activity._originalTargetPipeline),
              originalTargetPipeline: activity._originalTargetPipeline,
              currentPipelineId: activity.typeProperties?.pipelineId,
              currentWorkspaceId: activity.typeProperties?.workspaceId,
              currentConnectionId: activity.externalReferences?.connection
            });

            if (activity._originalTargetPipeline) {
              // Get the deployed pipeline ID for the target pipeline
              let targetPipelineId = deployedPipelineIds?.get(activity._originalTargetPipeline);
              
              console.log(`Looking up target pipeline '${activity._originalTargetPipeline}' in deployed pipeline IDs`, {
                found: Boolean(targetPipelineId),
                targetPipelineId,
                availablePipelineIds: deployedPipelineIds ? Array.from(deployedPipelineIds.keys()) : []
              });

              // If not found in deployed pipeline IDs, try fallback lookup using Fabric API
              if (!targetPipelineId) {
                console.log(`Target pipeline '${activity._originalTargetPipeline}' not found in deployed pipeline IDs, attempting fallback lookup`);
                
                try {
                  const { pipelineFallbackService } = await import('./pipelineFallbackService');
                  const fallbackResult = await pipelineFallbackService.resolvePipelineReference(
                    activity._originalTargetPipeline,
                    workspaceId,
                    accessToken
                  );
                  
                  if (fallbackResult) {
                    targetPipelineId = fallbackResult;
                    console.log(`Successfully resolved target pipeline '${activity._originalTargetPipeline}' using fallback lookup: ${targetPipelineId}`);
                    
                    // Add to deployed pipeline IDs for future reference
                    deployedPipelineIds?.set(activity._originalTargetPipeline, targetPipelineId);
                  } else {
                    console.warn(`Fallback lookup failed for target pipeline '${activity._originalTargetPipeline}'`);
                  }
                } catch (fallbackError) {
                  const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error';
                  console.warn(`Fallback pipeline lookup failed for '${activity._originalTargetPipeline}':`, {
                    error: fallbackErrorMessage,
                    workspaceId,
                    targetPipeline: activity._originalTargetPipeline
                  });
                }
              }

              if (targetPipelineId) {
                // Set pipeline-specific properties
                activity.typeProperties.pipelineId = targetPipelineId;
                activity.typeProperties.workspaceId = workspaceId;
                
                // Get the FabricDataPipelines connection ID from pipeline connection mappings
                // The mapping keys are generated with the pattern: `${activityName}_${linkedServiceName}_${refIndex}`
                // where linkedServiceName is "FabricDataPipelines" for InvokePipeline activities
                const pipelineMappings = pipelineConnectionMappings?.[component.name] || {};
                
                // Find the mapping key that starts with the activity name and contains FabricDataPipelines
                const possibleMappingKeys = Object.keys(pipelineMappings).filter(key => 
                  key.startsWith(`${activity.name}_FabricDataPipelines`)
                );
                
                console.log(`Looking for FabricDataPipelines connection mapping for activity '${activity.name}'`, {
                  activityName: activity.name,
                  possibleMappingKeys,
                  totalMappings: Object.keys(pipelineMappings).length,
                  availableMappings: Object.keys(pipelineMappings)
                });
                
                let activityConnectionMapping: any = null;
                let usedMappingKey = '';
                
                // Try to find the correct mapping key
                for (const key of possibleMappingKeys) {
                  if (pipelineMappings[key]?.selectedConnectionId) {
                    activityConnectionMapping = pipelineMappings[key];
                    usedMappingKey = key;
                    break;
                  }
                }
                
                if (activityConnectionMapping?.selectedConnectionId) {
                  activity.externalReferences.connection = activityConnectionMapping.selectedConnectionId;
                  console.log(`Successfully applied FabricDataPipelines connection '${activityConnectionMapping.selectedConnectionId}' to InvokePipeline activity '${activity.name}' using mapping key '${usedMappingKey}'`);
                } else {
                  const detailedErrorInfo = {
                    activityName: activity.name,
                    parentPipeline: component.name,
                    possibleMappingKeys,
                    availableMappings: Object.keys(pipelineMappings),
                    hasAnyMappings: Object.keys(pipelineMappings).length > 0,
                    targetPipeline: activity._originalTargetPipeline,
                    pipelineConnectionMappings: pipelineConnectionMappings ? Object.keys(pipelineConnectionMappings) : [],
                    mappingValues: Object.fromEntries(
                      Object.entries(pipelineMappings).map(([key, value]) => [key, { hasConnectionId: Boolean(value?.selectedConnectionId), connectionId: value?.selectedConnectionId }])
                    )
                  };
                  
                  console.error(`No FabricDataPipelines connection mapping found for InvokePipeline activity`, detailedErrorInfo);
                  
                  const errorMessage = `Missing FabricDataPipelines connection mapping for InvokePipeline activity '${activity.name}' in pipeline '${component.name}'. Expected mapping key pattern: '${activity.name}_FabricDataPipelines_*'. Found possible keys: [${possibleMappingKeys.join(', ')}]. Available mappings: [${Object.keys(pipelineMappings).join(', ')}]. Please ensure this activity is mapped to a FabricDataPipelines connection in the Map Components stage.`;
                  
                  throw new Error(errorMessage);
                }
                
                // Remove the temporary property
                delete activity._originalTargetPipeline;
                
                console.log(`Successfully resolved InvokePipeline '${activity.name}' dependencies:`, {
                  pipelineId: targetPipelineId,
                  workspaceId,
                  connectionId: activity.externalReferences.connection,
                  resolvedViaFallback: !deployedPipelineIds?.has(activity._originalTargetPipeline)
                });
              } else {
                console.error(`Target pipeline '${activity._originalTargetPipeline}' not found in deployed pipeline IDs or via fallback lookup`, {
                  targetPipeline: activity._originalTargetPipeline,
                  activityName: activity.name,
                  parentPipeline: component.name,
                  availablePipelineIds: deployedPipelineIds ? Array.from(deployedPipelineIds.keys()) : [],
                  deployedPipelineIdsSize: deployedPipelineIds?.size || 0
                });
                
                throw new Error(`Target pipeline '${activity._originalTargetPipeline}' not found. It must be deployed before pipeline '${component.name}' with InvokePipeline activity '${activity.name}', or it should already exist in the workspace. Check deployment ordering or verify the target pipeline exists in Fabric.`);
              }
            } else {
              console.warn(`InvokePipeline activity '${activity.name}' missing _originalTargetPipeline property - this indicates a transformation issue`);
            }
          }
        }
      }

      // Update activities for failed connectors
      const updatedDefinition = this.updatePipelineActivitiesForFailedConnectors(pipelineDefinition);

      if (!updatedDefinition.properties) {
        throw new Error('Pipeline definition is missing properties structure after transformation');
      }

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

      // Generate Base64 payload
      const { PipelineConnectionTransformerService } = await import('./pipelineConnectionTransformerService');
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
        definition: { 
          parts: [{ 
            path: 'pipeline-content.json', 
            payload: base64Payload, 
            payloadType: 'InlineBase64' 
          }] 
        }
      };

      // Add folderId if available
      if (folderId) {
        pipelinePayload.folderId = folderId;
      }

      const endpoint = `${this.baseUrl}/workspaces/${workspaceId}/dataPipelines`;
      const headers = { 
        'Authorization': `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      };

      const response = await fetch(endpoint, { 
        method: 'POST', 
        headers, 
        body: JSON.stringify(pipelinePayload) 
      });

      if (!response.ok) {
        return await fabricApiClient.handleAPIError(response, 'POST', endpoint, pipelinePayload, headers, component.name, component.type);
      }

      const result = await response.json();
      
      // Generate connection mapping summary if available
      let note = `Pipeline created successfully with ${activitiesCount} activities, ${parametersCount} parameters, and ${variablesCount} variables`;
      if (inactiveActivitiesCount > 0) {
        note += `. ${inactiveActivitiesCount} activities marked as inactive due to failed connectors.`;
      }
      if (pipelineConnectionMappings) {
        const { PipelineConnectionTransformerService } = await import('./pipelineConnectionTransformerService');
        const mappingSummary = PipelineConnectionTransformerService.getConnectionMappingSummary(component.name, pipelineConnectionMappings);
        if (mappingSummary.mappedActivities > 0) {
          note += ` ${mappingSummary.mappedActivities}/${mappingSummary.totalActivities} activities mapped to Fabric connections.`;
        }
      }
      
      return { 
        componentName: component.name, 
        componentType: component.type, 
        status: 'success', 
        fabricResourceId: result.id, 
        note 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating pipeline';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Enhanced error context for debugging
      const errorContext = {
        error: errorMessage,
        errorStack,
        componentName: component.name,
        componentType: component.type,
        componentDefinition: component.definition,
        hasPipelineConnectionMappings: Boolean(pipelineConnectionMappings),
        deployedPipelineIdsCount: deployedPipelineIds?.size || 0,
        deployedPipelineIds: deployedPipelineIds ? Array.from(deployedPipelineIds.entries()) : [],
        hasConnectionResults: Boolean(connectionResults),
        connectionResultsCount: connectionResults?.length || 0,
        workspaceId
      };
      
      console.error(`Error creating pipeline ${component.name}:`, errorContext);
      
      // Check if this is a connection mapping error for InvokePipeline
      const isConnectionMappingError = errorMessage.includes('FabricDataPipelines connection mapping') || 
                                     errorMessage.includes('connection mapping');
      
      let enhancedErrorMessage = errorMessage;
      if (isConnectionMappingError) {
        enhancedErrorMessage += `\n\nTroubleshooting:\n`;
        enhancedErrorMessage += `- Ensure the pipeline '${component.name}' has InvokePipeline activities mapped to FabricDataPipelines connections in the Map Components stage\n`;
        enhancedErrorMessage += `- Check that all target pipelines referenced by InvokePipeline activities are deployed first\n`;
        enhancedErrorMessage += `- Verify the connection mapping keys match the expected format: '<ActivityName>_FabricDataPipelines_<index>'\n`;
        if (pipelineConnectionMappings) {
          const pipelineMappings = pipelineConnectionMappings[component.name] || {};
          enhancedErrorMessage += `- Available mappings for this pipeline: [${Object.keys(pipelineMappings).join(', ')}]`;
        }
      }
      
      return { 
        componentName: component.name, 
        componentType: component.type, 
        status: 'failed', 
        error: enhancedErrorMessage, 
        errorMessage: enhancedErrorMessage,
        apiRequestDetails: {
          method: 'Pipeline Transformation',
          endpoint: 'Internal Pipeline Processing',
          payload: {
            componentName: component.name,
            hasPipelineConnectionMappings: Boolean(pipelineConnectionMappings),
            deployedPipelineIdsCount: deployedPipelineIds?.size || 0,
            hasConnectionResults: Boolean(connectionResults),
            workspaceId
          },
          headers: {}
        }
      };
    }
  }
}

export const fabricService = new FabricService();