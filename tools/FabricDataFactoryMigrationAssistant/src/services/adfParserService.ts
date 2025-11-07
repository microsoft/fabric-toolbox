import { ADFComponent, ValidationRule, ComponentSummary, FabricTarget, GlobalParameterReference } from '../types';
import { 
  safeJsonParse, 
  isValidARMTemplate, 
  isValidARMResource,
  extractString,
  extractComponentName,
  isValidComponentType 
} from '../lib/validation';
import { extractFolderFromPipeline } from './folderAnalysisService';
import { globalParameterDetectionService } from './globalParameterDetectionService';
import { parameterizedLinkedServiceDetectionService } from './parameterizedLinkedServiceDetectionService';
import {
  ADFProfile,
  ProfileMetrics,
  ArtifactBreakdown,
  DependencyGraph,
  ProfileInsight,
  PipelineArtifact,
  DatasetArtifact,
  LinkedServiceArtifact,
  GlobalParameterArtifact,
  TriggerArtifact,
  DataflowArtifact,
  ActivitySummary,
  GraphNode,
  GraphEdge
} from '../types/profiling';

// First, let me add interface definitions for ARM template structure
interface ARMResource {
  type: string;
  name: string;
  properties?: any;
  resources?: ARMResource[];
  dependsOn?: string[];  // NEW: ARM template dependency array
}

interface ARMTemplate {
  resources: ARMResource[];
  [key: string]: any;
}

class ADFParserService {
  private parsedComponents: ADFComponent[] = [];
  private datasetMappings: Map<string, any> = new Map(); // Dataset name -> dataset definition
  private linkedServiceMappings: Map<string, any> = new Map(); // LinkedService name -> linkedService definition
  
  private validationRules: ValidationRule[] = [
    {
      componentType: 'pipeline',
      isSupported: true,
      warnings: []
    },
    {
      componentType: 'dataset',
      isSupported: true,
      warnings: ['Datasets will be embedded within pipeline activities in Fabric']
    },
    {
      componentType: 'linkedService',
      isSupported: true,
      warnings: []
    },
    {
      componentType: 'trigger',
      isSupported: true,
      warnings: ['Schedule triggers supported, other trigger types may need manual configuration']
    },
    {
      componentType: 'globalParameter',
      isSupported: true,
      warnings: ['Will be migrated to Fabric Variable Library']
    },
    {
      componentType: 'integrationRuntime',
      isSupported: true,
      warnings: ['Integration Runtimes will be migrated to Fabric Gateways'],
      suggestions: ['Managed IR -> Virtual Network Gateway', 'Self-hosted IR -> On-Premises Gateway']
    },
    {
      componentType: 'mappingDataFlow',
      isSupported: false,
      warnings: ['Mapping Data Flows not supported in Fabric Data Factory'],
      suggestions: ['Consider using Fabric Dataflow Gen2 for similar functionality']
    },
    {
      componentType: 'customActivity',
      isSupported: true,
      warnings: ['May require Fabric Notebook or external compute configuration']
    },
    {
      componentType: 'managedIdentity',
      isSupported: true,
      warnings: ['Managed Identity credentials will be migrated to Fabric Workspace Identity'],
      suggestions: ['Workspace Identity provides similar functionality for authentication']
    }
  ];

  async parseARMTemplate(fileContent: string): Promise<ADFComponent[]> {
    const parseResult = safeJsonParse<ARMTemplate>(fileContent);
    
    if (!parseResult.success) {
      throw new Error(`Invalid JSON format: ${parseResult.error}`);
    }
    
    const armTemplate = parseResult.data;
    
    if (!isValidARMTemplate(armTemplate)) {
      throw new Error('Invalid ARM template: missing or invalid resources array');
    }

    const components: ADFComponent[] = [];
    
    // Extract components from ARM template resources
    for (const resource of armTemplate.resources) {
      if (!isValidARMResource(resource)) {
        continue; // Skip invalid resources
      }
      
      if (resource.type === 'Microsoft.DataFactory/factories') {
        // Process nested resources within the data factory
        if (resource.resources && Array.isArray(resource.resources)) {
          for (const nestedResource of resource.resources) {
            if (isValidARMResource(nestedResource)) {
              const component = this.parseDataFactoryResource(nestedResource);
              if (component) {
                components.push(component);
              }
            }
          }
        }
      } else if (resource.type?.startsWith('Microsoft.DataFactory/factories/')) {
        // Process standalone data factory resources
        const component = this.parseDataFactoryResource(resource);
        if (component) {
          components.push(component);
        }
      } else if (resource.type?.startsWith('Microsoft.Synapse/workspaces/')) {
        // Process Synapse workspace resources
        const component = this.parseSynapseResource(resource);
        if (component) {
          components.push(component);
        }
      }
    }

    // Apply validation rules to each component
    const validatedComponents = components.map(component => this.validateComponent(component));
    
    // Detect global parameters from pipelines (NEW)
    console.log('[ADFParserService] Detecting global parameters...');
    const globalParameterReferences = globalParameterDetectionService.detectWithFallback(
      validatedComponents,
      armTemplate
    );
    
    if (globalParameterReferences.length > 0) {
      console.log(`[ADFParserService] Detected ${globalParameterReferences.length} global parameters`);
      // Store in each component for reference (optional - mainly for state dispatch)
      validatedComponents.forEach(component => {
        if (component.type === 'pipeline') {
          component.globalParameterReferences = globalParameterReferences;
        }
      });
    }
    
    // Detect parameterized LinkedServices (NEW)
    console.log('[ADFParserService] Detecting parameterized LinkedServices...');
    const parameterizedLinkedServices = parameterizedLinkedServiceDetectionService.detectParameterizedLinkedServices(validatedComponents);
    
    if (parameterizedLinkedServices.length > 0) {
      console.log(`[ADFParserService] Detected ${parameterizedLinkedServices.length} parameterized LinkedServices`);
      
      // Add warnings to each component
      validatedComponents.forEach(component => {
        parameterizedLinkedServices.forEach(plsInfo => {
          // Add warning to the LinkedService itself
          if (component.type === 'linkedService' && component.name === plsInfo.linkedServiceName) {
            component.warnings = component.warnings || [];
            component.warnings.push(plsInfo.warningMessage);
            component.parameterizedLinkedServiceInfo = plsInfo;
          }
          
          // Add warning to affected pipelines
          if (component.type === 'pipeline' && plsInfo.affectedPipelines.includes(component.name)) {
            component.warnings = component.warnings || [];
            const linkedServiceWarning = `Uses parameterized LinkedService '${plsInfo.linkedServiceName}' (${plsInfo.parameters.length} parameters) - requires manual reconfiguration in Fabric`;
            if (!component.warnings.includes(linkedServiceWarning)) {
              component.warnings.push(linkedServiceWarning);
            }
          }
        });
      });
    }
    
    // Store the parsed components for later retrieval
    this.parsedComponents = validatedComponents;
    
    return validatedComponents;
  }

  /**
   * Gets a dataset definition by name from the parsed components
   * @param datasetName The name of the dataset to find
   * @returns The dataset definition or undefined if not found
   */
  getDatasetByName(datasetName: string): ADFComponent | undefined {
    // First try from the parsed components (new method)
    const component = this.parsedComponents.find(
      component => component.type === 'dataset' && component.name === datasetName
    );
    
    if (component) {
      return component;
    }
    
    // Fallback to the mapping cache
    const datasetDef = this.datasetMappings.get(datasetName);
    if (datasetDef) {
      return {
        name: datasetName,
        type: 'dataset',
        definition: datasetDef,
        isSelected: true,
        compatibilityStatus: 'supported',
        warnings: []
      };
    }
    
    return undefined;
  }

  /**
   * Gets a LinkedService definition by name from the parsed components
   * @param linkedServiceName The name of the LinkedService to find
   * @returns The LinkedService definition or undefined if not found
   */
  getLinkedServiceByName(linkedServiceName: string): ADFComponent | undefined {
    // First try from the parsed components
    const component = this.parsedComponents.find(
      component => component.type === 'linkedService' && component.name === linkedServiceName
    );
    
    if (component) {
      return component;
    }
    
    // Fallback to the mapping cache
    const linkedServiceDef = this.linkedServiceMappings.get(linkedServiceName);
    if (linkedServiceDef) {
      return {
        name: linkedServiceName,
        type: 'linkedService',
        definition: linkedServiceDef,
        isSelected: true,
        compatibilityStatus: 'supported',
        warnings: []
      };
    }
    
    return undefined;
  }

  /**
   * Creates a mapping from Copy activity inputs/outputs to dataset definitions
   * @param copyActivity The Copy activity definition
   * @returns Object with source and sink dataset mappings
   */
  /**
   * Gets Copy activity dataset mappings and ensures datasets are properly resolved
   * @param copyActivity The Copy activity to analyze
   * @returns Object with source and sink dataset mappings
   */
  getCopyActivityDatasetMappings(copyActivity: any): {
    sourceDataset?: any;
    sinkDataset?: any;
    sourceParameters?: any;
    sinkParameters?: any;
  } {
    const mappings: any = {};
    
    // Process inputs (source)
    if (copyActivity.inputs && Array.isArray(copyActivity.inputs) && copyActivity.inputs.length > 0) {
      const input = copyActivity.inputs[0];
      if (input?.referenceName) {
        const sourceDataset = this.getDatasetByName(input.referenceName);
        if (sourceDataset) {
          mappings.sourceDataset = sourceDataset;
          mappings.sourceParameters = input.parameters || {};
          console.log(`✅ Found source dataset '${input.referenceName}' for Copy activity '${copyActivity.name}'`);
        } else {
          console.error(`❌ Source dataset '${input.referenceName}' not found for Copy activity '${copyActivity.name}'`);
          console.log('Available datasets:', this.parsedComponents.filter(c => c.type === 'dataset').map(c => c.name));
          // This is a critical error - the dataset MUST exist for Copy activities to work
          throw new Error(`Required source dataset '${input.referenceName}' not found in ARM template. Copy activity '${copyActivity.name}' cannot be migrated without this dataset.`);
        }
      } else {
        console.error(`❌ Copy activity '${copyActivity.name}' has inputs but no referenceName for source dataset`);
        throw new Error(`Copy activity '${copyActivity.name}' has malformed inputs - missing referenceName for source dataset.`);
      }
    } else {
      console.error(`❌ Copy activity '${copyActivity.name}' has no inputs defined`);
      throw new Error(`Copy activity '${copyActivity.name}' has no inputs defined. Copy activities must have at least one input dataset.`);
    }
    
    // Process outputs (sink)
    if (copyActivity.outputs && Array.isArray(copyActivity.outputs) && copyActivity.outputs.length > 0) {
      const output = copyActivity.outputs[0];
      if (output?.referenceName) {
        const sinkDataset = this.getDatasetByName(output.referenceName);
        if (sinkDataset) {
          mappings.sinkDataset = sinkDataset;
          mappings.sinkParameters = output.parameters || {};
          console.log(`✅ Found sink dataset '${output.referenceName}' for Copy activity '${copyActivity.name}'`);
        } else {
          console.error(`❌ Sink dataset '${output.referenceName}' not found for Copy activity '${copyActivity.name}'`);
          console.log('Available datasets:', this.parsedComponents.filter(c => c.type === 'dataset').map(c => c.name));
          // This is a critical error - the dataset MUST exist for Copy activities to work
          throw new Error(`Required sink dataset '${output.referenceName}' not found in ARM template. Copy activity '${copyActivity.name}' cannot be migrated without this dataset.`);
        }
      } else {
        console.error(`❌ Copy activity '${copyActivity.name}' has outputs but no referenceName for sink dataset`);
        throw new Error(`Copy activity '${copyActivity.name}' has malformed outputs - missing referenceName for sink dataset.`);
      }
    } else {
      console.error(`❌ Copy activity '${copyActivity.name}' has no outputs defined`);
      throw new Error(`Copy activity '${copyActivity.name}' has no outputs defined. Copy activities must have at least one output dataset.`);
    }
    
    return mappings;
  }

  /**
   * Gets all parsed components
   * @returns Array of all parsed components
   */
  getParsedComponents(): ADFComponent[] {
    return this.parsedComponents;
  }

  /**
   * Gets components by type
   * @param type The component type to filter by
   * @returns Array of components of the specified type
   */
  getComponentsByType(type: ADFComponent['type']): ADFComponent[] {
    return this.parsedComponents.filter(component => component.type === type);
  }

  private parseSynapseResource(resource: ARMResource): ADFComponent | null {
    if (!resource.type || !resource.name) {
      return null;
    }

    // Extract the resource type from the full Synapse resource type path
    const resourceTypeParts = resource.type.split('/');
    if (resourceTypeParts.length < 3 || resourceTypeParts[0] !== 'Microsoft.Synapse' || resourceTypeParts[1] !== 'workspaces') {
      return null;
    }

    const resourceType = resourceTypeParts[2]; // e.g., 'pipelines', 'linkedServices', etc.
    if (!resourceType) {
      return null;
    }

    let componentType: ADFComponent['type'] | null = null;

    // Map Synapse resource types to our component types
    switch (resourceType) {
      case 'pipelines':
        componentType = 'pipeline';
        break;
      case 'datasets':
        componentType = 'dataset';
        break;
      case 'linkedServices':
        componentType = 'linkedService';
        break;
      case 'triggers':
        componentType = 'trigger';
        break;
      case 'integrationRuntimes':
        componentType = 'integrationRuntime';
        break;
      case 'dataflows':
        componentType = 'mappingDataFlow'; // Synapse dataflows are mapping data flows
        break;
      default:
        // Handle other Synapse-specific resource types
        if (resourceType === 'credentials') {
          // Check if this is a ManagedIdentity credential
          if (resource.properties?.type === 'ManagedIdentity') {
            componentType = 'managedIdentity'; // Map ManagedIdentity credentials to managedIdentity
          } else {
            // Other credential types are similar to global parameters
            componentType = 'globalParameter';
          }
        } else if (resourceType === 'sqlscripts' || resourceType === 'bigDataPools' || resourceType === 'sqlPools') {
          // These are Synapse-specific and will be marked as custom activities for migration purposes
          componentType = 'customActivity';
        } else {
          console.log(`Unknown Synapse resource type: ${resourceType}`);
          return null; // Unknown component type
        }
    }

    // Double-check that we have a valid component type
    if (!isValidComponentType(componentType)) {
      return null;
    }

    // Extract and properly structure the component definition
    let definition: any = {};
    
    if (componentType === 'pipeline') {
      // For Synapse pipelines, the structure is the same as ADF pipelines
      const pipelineProperties = resource.properties || {};
      
      definition = {
        type: 'pipeline',
        properties: {
          activities: this.extractActivitiesFromProperties(pipelineProperties),
          parameters: this.extractParametersFromProperties(pipelineProperties),
          variables: this.extractVariablesFromProperties(pipelineProperties),
          annotations: pipelineProperties.annotations || [],
          policy: pipelineProperties.policy || {},
          concurrency: pipelineProperties.concurrency || 1,
          folder: pipelineProperties.folder,
          ...this.extractOtherPipelineProperties(pipelineProperties)
        },
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name,
          synapseWorkspace: true // Flag to indicate this came from Synapse
        }
      };

      const activitiesCount = definition.properties.activities?.length || 0;
      const parametersCount = Object.keys(definition.properties.parameters || {}).length;
      const variablesCount = Object.keys(definition.properties.variables || {}).length;
      
      console.log(`Parsing Synapse pipeline ${extractComponentName(resource.name)}:`, {
        activitiesCount,
        parametersCount,
        variablesCount,
        hasActivities: activitiesCount > 0
      });
    } else if (componentType === 'integrationRuntime') {
      // For Synapse Integration Runtimes, structure is the same as ADF
      const irProperties = resource.properties || {};
      definition = {
        type: 'integrationRuntime',
        properties: {
          type: irProperties.type, // "Managed" or "SelfHosted"
          typeProperties: irProperties.typeProperties || {},
          description: irProperties.description || '',
          ...irProperties
        },
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name,
          synapseWorkspace: true
        }
      };

      console.log(`Parsing Synapse Integration Runtime ${extractComponentName(resource.name)}:`, {
        type: irProperties.type,
        hasTypeProperties: Boolean(irProperties.typeProperties)
      });
    } else if (componentType === 'linkedService') {
      // For Synapse Linked Services, structure is the same as ADF
      const lsProperties = resource.properties || {};
      definition = {
        type: 'linkedService',
        properties: {
          type: lsProperties.type,
          typeProperties: lsProperties.typeProperties || {},
          connectVia: lsProperties.connectVia || undefined,
          description: lsProperties.description || '',
          annotations: lsProperties.annotations || [],
          ...lsProperties
        },
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name,
          synapseWorkspace: true
        }
      };

      // Store in mappings for quick access
      const linkedServiceName = extractComponentName(resource.name);
      this.linkedServiceMappings.set(linkedServiceName, definition);

      console.log(`Parsing Synapse Linked Service ${linkedServiceName}:`, {
        originalName: resource.name,
        extractedName: linkedServiceName,
        type: lsProperties.type,
        hasConnectVia: Boolean(lsProperties.connectVia),
        connectViaRef: lsProperties.connectVia?.referenceName || 'none'
      });
    } else if (componentType === 'dataset') {
      // For Synapse Datasets, structure is the same as ADF
      const dsProperties = resource.properties || {};
      definition = {
        type: 'dataset',
        properties: {
          type: dsProperties.type,
          typeProperties: dsProperties.typeProperties || {},
          linkedServiceName: dsProperties.linkedServiceName || undefined,
          parameters: dsProperties.parameters || {},
          annotations: dsProperties.annotations || [],
          schema: dsProperties.schema || [],
          ...dsProperties
        },
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name,
          synapseWorkspace: true
        }
      };

      // Store in mappings for quick access
      const datasetName = extractComponentName(resource.name);
      this.datasetMappings.set(datasetName, definition);

      console.log(`Parsing Synapse Dataset ${datasetName}:`, {
        type: dsProperties.type,
        hasLinkedService: Boolean(dsProperties.linkedServiceName),
        linkedServiceRef: dsProperties.linkedServiceName?.referenceName || 'none'
      });
    } else if (componentType === 'mappingDataFlow') {
      // For Synapse Dataflows (Mapping Data Flows)
      const dfProperties = resource.properties || {};
      definition = {
        type: 'mappingDataFlow',
        properties: {
          type: dfProperties.type || 'MappingDataFlow',
          typeProperties: dfProperties.typeProperties || {},
          description: dfProperties.description || '',
          annotations: dfProperties.annotations || [],
          ...dfProperties
        },
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name,
          synapseWorkspace: true
        }
      };

      console.log(`Parsing Synapse Dataflow ${extractComponentName(resource.name)}:`, {
        type: dfProperties.type,
        hasTypeProperties: Boolean(dfProperties.typeProperties)
      });
    } else if (componentType === 'trigger') {
      // For Synapse Triggers, structure is the same as ADF
      const triggerProperties = resource.properties || {};
      definition = {
        type: 'trigger',
        properties: {
          type: triggerProperties.type,
          typeProperties: triggerProperties.typeProperties || {},
          pipelines: triggerProperties.pipelines || [],
          runtimeState: triggerProperties.runtimeState || 'Stopped',
          annotations: triggerProperties.annotations || [],
          ...triggerProperties
        },
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name,
          synapseWorkspace: true
        }
      };

      console.log(`Parsing Synapse Trigger ${extractComponentName(resource.name)}:`, {
        type: triggerProperties.type,
        runtimeState: triggerProperties.runtimeState,
        pipelineCount: triggerProperties.pipelines?.length || 0
      });
    } else {
      // For other components (credentials, sqlscripts, etc.)
      definition = {
        type: componentType,
        properties: resource.properties || {},
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name,
          synapseWorkspace: true
        }
      };
    }

    // NEW: Extract resource-level dependsOn
    const rawDependsOn = resource.dependsOn || [];
    const parsedDependencies = this.parseResourceDependencies(rawDependsOn);

    const component: ADFComponent = {
      name: extractComponentName(resource.name),
      type: componentType,
      definition: definition,
      isSelected: true, // Default to selected
      compatibilityStatus: 'supported', // Will be updated by validation
      warnings: [],
      fabricTarget: this.generateDefaultFabricTarget(componentType, extractComponentName(resource.name), definition),
      dependsOn: rawDependsOn,
      resourceDependencies: parsedDependencies
    };

    // NEW: Extract trigger metadata for Synapse triggers
    if (componentType === 'trigger') {
      const triggerProps = resource.properties || {};
      const typeProps = triggerProps.typeProperties || {};
      const recurrence = typeProps.recurrence;
      // FIX: pipelines array is at properties.pipelines, NOT typeProperties.pipelines
      const pipelines = triggerProps.pipelines || [];
      
      // Extract pipeline references WITH parameters
      const pipelineParameters: Array<{ pipelineName: string; parameters: Record<string, any> }> = [];
      const referencedPipelines = pipelines
        .map((p: any) => {
          const pipelineName = this.extractPipelineNameFromTriggerRef(p);
          if (pipelineName) {
            // Extract parameters if they exist (for documentation purposes)
            pipelineParameters.push({
              pipelineName,
              parameters: p.parameters || {}
            });
          }
          return pipelineName;
        })
        .filter(Boolean);

      component.triggerMetadata = {
        runtimeState: (triggerProps.runtimeState as 'Started' | 'Stopped') || 'Unknown',
        type: triggerProps.type || 'Unknown',
        recurrence: recurrence ? {
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          startTime: recurrence.startTime,
          endTime: recurrence.endTime,
          timeZone: recurrence.timeZone || 'UTC'
        } : undefined,
        referencedPipelines,
        pipelineParameters  // NEW: Include parameters for documentation
      };

      console.log(`Extracted trigger metadata for Synapse trigger ${component.name}:`, {
        runtimeState: component.triggerMetadata.runtimeState,
        type: component.triggerMetadata.type,
        hasRecurrence: Boolean(component.triggerMetadata.recurrence),
        pipelineCount: referencedPipelines.length,
        pipelines: referencedPipelines,
        hasParameters: pipelineParameters.some(p => Object.keys(p.parameters).length > 0)
      });
    }

    return component;
  }

  /**
   * Parse ARM template resource-level dependsOn array and categorize by resource type
   * Handles formats like:
   * - "[concat(variables('factoryId'), '/linkedServices/MyLS')]"
   * - "[concat(parameters('factoryName'), '/pipelines/MyPipeline')]"
   */
  private parseResourceDependencies(dependsOn: string[]): {
    linkedServices: string[];
    pipelines: string[];
    datasets: string[];
    triggers: string[];
    dataflows: string[];
    other: string[];
  } {
    const dependencies = {
      linkedServices: [] as string[],
      pipelines: [] as string[],
      datasets: [] as string[],
      triggers: [] as string[],
      dataflows: [] as string[],
      other: [] as string[]
    };

    if (!dependsOn || !Array.isArray(dependsOn)) {
      return dependencies;
    }

    dependsOn.forEach(dep => {
      if (typeof dep !== 'string') {
        return;
      }

      // Parse ARM template dependency strings
      // Format: "[concat(variables('factoryId'), '/resourceType/resourceName')]"
      // Also handle: "[resourceId('Microsoft.DataFactory/factories/pipelines', parameters('factoryName'), 'pipelineName')]"
      
      // Try to extract resource type and name using regex
      const concatMatch = dep.match(/\/(linkedServices|pipelines|datasets|triggers|dataflows)\/([^'"\]]+)/i);
      
      if (concatMatch) {
        const [, resourceType, resourceName] = concatMatch;
        
        // Clean up the resource name (remove quotes, brackets, trailing characters)
        const cleanName = resourceName.replace(/['"\]\),]+$/, '').trim();
        
        switch (resourceType.toLowerCase()) {
          case 'linkedservices':
            if (!dependencies.linkedServices.includes(cleanName)) {
              dependencies.linkedServices.push(cleanName);
            }
            break;
          case 'pipelines':
            if (!dependencies.pipelines.includes(cleanName)) {
              dependencies.pipelines.push(cleanName);
            }
            break;
          case 'datasets':
            if (!dependencies.datasets.includes(cleanName)) {
              dependencies.datasets.push(cleanName);
            }
            break;
          case 'triggers':
            if (!dependencies.triggers.includes(cleanName)) {
              dependencies.triggers.push(cleanName);
            }
            break;
          case 'dataflows':
            // Track dataflows separately from pipelines
            if (!dependencies.dataflows.includes(cleanName)) {
              dependencies.dataflows.push(cleanName);
            }
            break;
        }
      } else {
        // Store unparseable dependencies for debugging
        dependencies.other.push(dep);
      }
    });

    return dependencies;
  }

  private parseDataFactoryResource(resource: ARMResource): ADFComponent | null {
    if (!resource.type || !resource.name) {
      return null;
    }

    const resourceType = resource.type.split('/').pop();
    if (!resourceType) {
      return null;
    }

    let componentType: ADFComponent['type'] | null = null;

    switch (resourceType) {
      case 'pipelines':
        componentType = 'pipeline';
        break;
      case 'datasets':
        componentType = 'dataset';
        break;
      case 'linkedServices':
        componentType = 'linkedService';
        break;
      case 'triggers':
        componentType = 'trigger';
        break;
      case 'globalParameters':
        componentType = 'globalParameter';
        break;
      case 'integrationRuntimes':
        componentType = 'integrationRuntime';
        break;
      case 'dataflows':
        componentType = 'mappingDataFlow';
        break;
      case 'credentials':
        // Handle ADF credentials - check if it's ManagedIdentity
        if (resource.properties?.type === 'ManagedIdentity') {
          componentType = 'managedIdentity'; // Map ManagedIdentity credentials to managedIdentity
        } else {
          componentType = 'globalParameter';
        }
        break;
      default:
        // Check if it's a custom activity or other type
        if (resource.properties?.type === 'Custom') {
          componentType = 'customActivity';
        } else {
          return null; // Unknown component type
        }
    }

    // Double-check that we have a valid component type
    if (!isValidComponentType(componentType)) {
      return null;
    }

    // Extract and properly structure the component definition
    let definition: any = {};
    
    if (componentType === 'pipeline') {
      // For pipelines, we need to carefully extract the full pipeline definition
      // Including all activities, parameters, variables, and other properties
      
      // The properties object should contain the complete pipeline definition
      const pipelineProperties = resource.properties || {};
      
      // Create a comprehensive pipeline definition that includes all components
      definition = {
        // Preserve the original ARM template structure
        type: 'pipeline',
        // Ensure we have the complete properties structure
        properties: {
          // Activities are the core of a pipeline - ensure they're preserved
          activities: this.extractActivitiesFromProperties(pipelineProperties),
          // Pipeline parameters that can be passed at runtime
          parameters: this.extractParametersFromProperties(pipelineProperties),
          // Variables used within the pipeline
          variables: this.extractVariablesFromProperties(pipelineProperties),
          // Annotations for metadata
          annotations: pipelineProperties.annotations || [],
          // Policy settings for execution
          policy: pipelineProperties.policy || {},
          // Concurrency settings
          concurrency: pipelineProperties.concurrency || 1,
          // Folder information if present
          folder: pipelineProperties.folder,
          // Any other properties that might be present
          ...this.extractOtherPipelineProperties(pipelineProperties)
        },
        // Preserve any additional metadata from the ARM resource
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name
        }
      };

      // Enhanced logging for pipeline parsing validation
      const activitiesCount = definition.properties.activities?.length || 0;
      const parametersCount = Object.keys(definition.properties.parameters || {}).length;
      const variablesCount = Object.keys(definition.properties.variables || {}).length;
      
      console.log(`Enhanced parsing for pipeline ${extractComponentName(resource.name)}:`, {
        activitiesCount,
        parametersCount,
        variablesCount,
        hasActivities: activitiesCount > 0,
        activitiesDetail: definition.properties.activities?.map((a: any) => ({
          name: a?.name,
          type: a?.type,
          hasTypeProperties: Boolean(a?.typeProperties)
        })),
        originalResourceStructure: {
          hasProperties: Boolean(resource.properties),
          propertiesKeys: resource.properties ? Object.keys(resource.properties) : [],
          activitiesFromProperties: Boolean(pipelineProperties.activities),
          activitiesLength: pipelineProperties.activities?.length || 0
        }
      });
    } else if (componentType === 'integrationRuntime') {
      // For Integration Runtimes, extract type and configuration
      const irProperties = resource.properties || {};
      definition = {
        type: 'integrationRuntime',
        properties: {
          type: irProperties.type, // "Managed" or "SelfHosted"
          typeProperties: irProperties.typeProperties || {},
          description: irProperties.description || '',
          ...irProperties
        },
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name
        }
      };

      console.log(`Parsing Integration Runtime ${extractComponentName(resource.name)}:`, {
        type: irProperties.type,
        hasTypeProperties: Boolean(irProperties.typeProperties),
        typePropertiesKeys: irProperties.typeProperties ? Object.keys(irProperties.typeProperties) : []
      });
    } else if (componentType === 'linkedService') {
      // For Linked Services, extract connectVia reference if present
      const lsProperties = resource.properties || {};
      definition = {
        type: 'linkedService',
        properties: {
          type: lsProperties.type,
          typeProperties: lsProperties.typeProperties || {},
          connectVia: lsProperties.connectVia || undefined, // Integration Runtime reference
          description: lsProperties.description || '',
          annotations: lsProperties.annotations || [],
          ...lsProperties
        },
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name
        }
      };

      // Store in mappings for quick access
      const linkedServiceName = extractComponentName(resource.name);
      this.linkedServiceMappings.set(linkedServiceName, definition);

      console.log(`Parsing Linked Service ${linkedServiceName}:`, {
        type: lsProperties.type,
        hasConnectVia: Boolean(lsProperties.connectVia),
        connectViaRef: lsProperties.connectVia?.referenceName || 'none',
        connectViaType: lsProperties.connectVia?.type || 'none'
      });
    } else if (componentType === 'dataset') {
      // For Datasets, extract LinkedService reference and typeProperties
      const dsProperties = resource.properties || {};
      definition = {
        type: 'dataset',
        properties: {
          type: dsProperties.type,
          typeProperties: dsProperties.typeProperties || {},
          linkedServiceName: dsProperties.linkedServiceName || undefined, // LinkedService reference
          parameters: dsProperties.parameters || {},
          annotations: dsProperties.annotations || [],
          schema: dsProperties.schema || [],
          ...dsProperties
        },
        resourceMetadata: {
          armResourceType: resource.type,
          armResourceName: resource.name
        }
      };

      // Store in mappings for quick access
      const datasetName = extractComponentName(resource.name);
      this.datasetMappings.set(datasetName, definition);

      console.log(`Parsing Dataset ${datasetName}:`, {
        type: dsProperties.type,
        hasLinkedService: Boolean(dsProperties.linkedServiceName),
        linkedServiceRef: dsProperties.linkedServiceName?.referenceName || 'none',
        hasParameters: Boolean(dsProperties.parameters),
        parameterCount: Object.keys(dsProperties.parameters || {}).length
      });
    } else {
      // For non-pipeline components, use the existing logic
      definition = resource.properties || resource;
    }

    // NEW: Extract resource-level dependsOn
    const rawDependsOn = resource.dependsOn || [];
    const parsedDependencies = this.parseResourceDependencies(rawDependsOn);

    // Create the base component
    const component: ADFComponent = {
      name: extractComponentName(resource.name),
      type: componentType,
      definition: definition,
      isSelected: true, // Default to selected
      compatibilityStatus: 'supported', // Will be updated by validation
      warnings: [],
      fabricTarget: this.generateDefaultFabricTarget(componentType, extractComponentName(resource.name), definition),
      // NEW: Add resource-level dependencies
      dependsOn: rawDependsOn,
      resourceDependencies: parsedDependencies
    };

    // Log dependencies if present for debugging
    if (rawDependsOn.length > 0) {
      console.log(`Extracted dependencies for ${componentType} ${component.name}:`, {
        raw: rawDependsOn,
        parsed: parsedDependencies
      });
    }

    // Extract folder information for pipelines
    if (componentType === 'pipeline') {
      const folderInfo = extractFolderFromPipeline(component);
      if (folderInfo) {
        component.folder = folderInfo;
        console.log(`Extracted folder for pipeline ${component.name}:`, {
          path: folderInfo.path,
          depth: folderInfo.depth,
          segments: folderInfo.segments
        });
      }
    }

    // NEW: Extract trigger metadata for triggers
    if (componentType === 'trigger') {
      const triggerProps = resource.properties || {};
      const typeProps = triggerProps.typeProperties || {};
      const recurrence = typeProps.recurrence;
      // FIX: pipelines array is at properties.pipelines, NOT typeProperties.pipelines
      const pipelines = triggerProps.pipelines || [];
      
      // Extract pipeline references WITH parameters
      const pipelineParameters: Array<{ pipelineName: string; parameters: Record<string, any> }> = [];
      const referencedPipelines = pipelines
        .map((p: any) => {
          const pipelineName = this.extractPipelineNameFromTriggerRef(p);
          if (pipelineName) {
            // Extract parameters if they exist (for documentation purposes)
            pipelineParameters.push({
              pipelineName,
              parameters: p.parameters || {}
            });
          }
          return pipelineName;
        })
        .filter(Boolean);

      component.triggerMetadata = {
        runtimeState: (triggerProps.runtimeState as 'Started' | 'Stopped') || 'Unknown',
        type: triggerProps.type || 'Unknown',
        recurrence: recurrence ? {
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          startTime: recurrence.startTime,
          endTime: recurrence.endTime,
          timeZone: recurrence.timeZone || 'UTC'
        } : undefined,
        referencedPipelines,
        pipelineParameters  // NEW: Include parameters for documentation
      };

      console.log(`Extracted trigger metadata for ${component.name}:`, {
        runtimeState: component.triggerMetadata.runtimeState,
        type: component.triggerMetadata.type,
        hasRecurrence: Boolean(component.triggerMetadata.recurrence),
        pipelineCount: referencedPipelines.length,
        pipelines: referencedPipelines,
        hasParameters: pipelineParameters.some(p => Object.keys(p.parameters).length > 0)
      });
    }

    return component;
  }

  /**
   * Extract activities from pipeline properties with comprehensive validation
   */
  private extractActivitiesFromProperties(properties: any): any[] {
    if (!properties) {
      return [];
    }

    // Check multiple possible locations for activities
    const activities = properties.activities || properties.Activities || [];
    
    if (!Array.isArray(activities)) {
      console.warn('Activities property is not an array:', activities);
      return [];
    }

    // Validate and transform each activity
    return activities.map((activity, index) => {
      if (!activity || typeof activity !== 'object') {
        console.warn(`Invalid activity at index ${index}:`, activity);
        return activity;
      }

      // Ensure the activity has required properties
      const validatedActivity = {
        // Required properties
        name: activity.name || `activity_${index}`,
        type: activity.type || 'Unknown',
        
        // Common properties that should be preserved
        dependsOn: activity.dependsOn || [],
        policy: activity.policy || {},
        userProperties: activity.userProperties || [],
        
        // Type-specific properties
        typeProperties: activity.typeProperties || {},
        
        // Any other properties that might be specific to certain activity types
        ...this.extractOtherActivityProperties(activity)
      };

      // Handle ExecutePipeline activities specifically
      if (activity.type === 'ExecutePipeline') {
        // Ensure typeProperties has all required fields for ExecutePipeline
        validatedActivity.typeProperties = {
          pipeline: activity.typeProperties?.pipeline || {},
          waitOnCompletion: activity.typeProperties?.waitOnCompletion !== false, // Default to true
          parameters: activity.typeProperties?.parameters || {}
        };
        
        console.log(`Found ExecutePipeline activity '${activity.name}' targeting pipeline '${activity.typeProperties?.pipeline?.referenceName}'`);
      }

      return validatedActivity;
    });
  }

  /**
   * Extract parameters from pipeline properties
   */
  private extractParametersFromProperties(properties: any): Record<string, any> {
    if (!properties) {
      return {};
    }

    const parameters = properties.parameters || properties.Parameters || {};
    
    if (typeof parameters !== 'object' || parameters === null) {
      return {};
    }

    return parameters;
  }

  /**
   * Extract variables from pipeline properties
   */
  private extractVariablesFromProperties(properties: any): Record<string, any> {
    if (!properties) {
      return {};
    }

    const variables = properties.variables || properties.Variables || {};
    
    if (typeof variables !== 'object' || variables === null) {
      return {};
    }

    return variables;
  }

  /**
   * Extract other pipeline properties that might be present
   */
  private extractOtherPipelineProperties(properties: any): Record<string, any> {
    if (!properties || typeof properties !== 'object') {
      return {};
    }

    const excludedKeys = ['activities', 'Activities', 'parameters', 'Parameters', 
                         'variables', 'Variables', 'annotations', 'policy', 'concurrency', 'folder'];
    
    const otherProperties: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      if (!excludedKeys.includes(key)) {
        otherProperties[key] = value;
      }
    }

    return otherProperties;
  }

  /**
   * Extract other activity properties that might be present
   */
  private extractOtherActivityProperties(activity: any): Record<string, any> {
    if (!activity || typeof activity !== 'object') {
      return {};
    }

    const excludedKeys = ['name', 'type', 'dependsOn', 'policy', 'userProperties', 'typeProperties'];
    
    const otherProperties: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(activity)) {
      if (!excludedKeys.includes(key)) {
        otherProperties[key] = value;
      }
    }

    return otherProperties;
  }

  private validateComponent(component: ADFComponent): ADFComponent {
    const rule = this.validationRules.find(r => r.componentType === component.type);
    
    if (!rule) {
      return {
        ...component,
        compatibilityStatus: 'supported',
        warnings: []
      };
    }

    const status = rule.isSupported ? 'supported' : 'unsupported';
    const warnings = [...rule.warnings];

    // Add specific warnings based on component content
    if (component.type === 'linkedService') {
      const serviceType = component.definition?.type;
      if (serviceType === 'SelfHosted') {
        warnings.push('Self-hosted linked service requires On-Premises Data Gateway configuration');
      }
    }

    if (component.type === 'pipeline') {
      const activities = component.definition?.activities || [];
      if (Array.isArray(activities)) {
        const unsupportedActivities = activities.filter((activity: any) => 
          activity?.type && ['ExecuteDataFlow', 'DataLakeAnalyticsU-SQL'].includes(activity.type)
        );
        
        if (unsupportedActivities.length > 0) {
          warnings.push(`Contains ${unsupportedActivities.length} unsupported activity type(s)`);
        }
      }
    }

    return {
      ...component,
      compatibilityStatus: status,
      warnings,
      isSelected: status === 'supported' // Unselect unsupported components by default
    };
  }

  private generateDefaultFabricTarget(componentType: ADFComponent['type'], name: string, definition?: any): FabricTarget | undefined {
    switch (componentType) {
      case 'pipeline':
        return {
          type: 'dataPipeline' as const,
          name: name
        };
      case 'linkedService':
        const connectVia = definition?.properties?.connectVia?.referenceName;
        return {
          type: 'connector' as const,
          name: name,
          connectVia: connectVia
        };
      case 'globalParameter':
        return {
          type: 'variable' as const,
          name: name
        };
      case 'managedIdentity':
        return {
          type: 'workspaceIdentity' as const,
          name: name
        };
      case 'trigger':
        return {
          type: 'schedule' as const,
          name: name
        };
      case 'customActivity':
        return {
          type: 'notebook' as const,
          name: name
        };
      case 'integrationRuntime':
        const irType = definition?.properties?.type;
        const gatewayType = irType === 'Managed' ? 'VirtualNetwork' : 'OnPremises';
        return {
          type: 'gateway' as const,
          name: name,
          gatewayType: gatewayType
        };
      default:
        return undefined;
    }
  }

  getComponentSummary(components: ADFComponent[]): ComponentSummary {
    const safeComponents = components || [];
    const summary: ComponentSummary = {
      total: safeComponents.length,
      supported: 0,
      partiallySupported: 0,
      unsupported: 0,
      byType: {},
      parameterizedLinkedServicesCount: 0,
      parameterizedLinkedServicesPipelineCount: 0,
      parameterizedLinkedServicesNames: []
    };

    // Collect parameterized LinkedServices
    const parameterizedLinkedServicesSet = new Set<string>();
    const affectedPipelinesSet = new Set<string>();

    safeComponents.forEach(component => {
      if (!component) {
        return;
      }
      
      switch (component.compatibilityStatus) {
        case 'supported':
          summary.supported++;
          break;
        case 'partiallySupported':
          summary.partiallySupported++;
          break;
        case 'unsupported':
          summary.unsupported++;
          break;
      }

      if (component.type) {
        summary.byType[component.type] = (summary.byType[component.type] || 0) + 1;
      }
      
      // Track parameterized LinkedServices
      if (component.type === 'linkedService' && component.parameterizedLinkedServiceInfo) {
        parameterizedLinkedServicesSet.add(component.name);
        component.parameterizedLinkedServiceInfo.affectedPipelines.forEach(pName => {
          affectedPipelinesSet.add(pName);
        });
      }
    });
    
    // Update summary with parameterized LinkedService info
    summary.parameterizedLinkedServicesCount = parameterizedLinkedServicesSet.size;
    summary.parameterizedLinkedServicesPipelineCount = affectedPipelinesSet.size;
    summary.parameterizedLinkedServicesNames = Array.from(parameterizedLinkedServicesSet);

    return summary;
  }

  /**
   * Store parsed components for later retrieval
   * @param components The components to store
   */
  setParsedComponents(components: ADFComponent[]): void {
    this.parsedComponents = components;
  }

  /**
   * Generate comprehensive profile from ARM template
   * @param components Parsed ADF components
   * @param fileName Name of the uploaded file
   * @param fileSize Size of the file in bytes
   * @returns Complete ADF profile with metrics, artifacts, dependencies, and insights
   */
  generateProfile(components: ADFComponent[], fileName: string, fileSize: number): ADFProfile {
    const metrics = this.calculateMetrics(components);
    const artifacts = this.buildArtifactBreakdown(components);
    const dependencies = this.buildDependencyGraph(components, artifacts);
    const insights = this.generateInsights(metrics, artifacts);

    return {
      metadata: {
        fileName,
        fileSize,
        parsedAt: new Date(),
        templateVersion: this.extractTemplateVersion(components),
        factoryName: this.extractFactoryName(components)
      },
      metrics,
      artifacts,
      dependencies,
      insights
    };
  }

  /**
   * Calculate comprehensive metrics from components
   */
  private calculateMetrics(components: ADFComponent[]): ProfileMetrics {
    const pipelines = components.filter(c => c.type === 'pipeline');
    const datasets = components.filter(c => c.type === 'dataset');
    const linkedServices = components.filter(c => c.type === 'linkedService');
    const triggers = components.filter(c => c.type === 'trigger');
    const dataflows = components.filter(c => c.type === 'mappingDataFlow');
    const integrationRuntimes = components.filter(c => c.type === 'integrationRuntime');
    const globalParameters = components.filter(c => c.type === 'globalParameter');
    
    // Calculate activity statistics
    const activityStats = this.calculateActivityStats(pipelines);
    
    // Calculate dependencies
    const dependencies = this.calculateDependencies(components);
    
    // Calculate usage statistics
    const usageStats = this.calculateUsageStatistics(components);
    
    // Calculate parameterized LinkedService statistics
    const parameterizedLinkedServices = linkedServices.filter(ls => ls.parameterizedLinkedServiceInfo);
    const totalParameterizedLinkedServiceParameters = parameterizedLinkedServices.reduce(
      (sum, ls) => sum + (ls.parameterizedLinkedServiceInfo?.parameters.length || 0),
      0
    );

    return {
      totalPipelines: pipelines.length,
      totalDatasets: datasets.length,
      totalLinkedServices: linkedServices.length,
      totalTriggers: triggers.length,
      totalDataflows: dataflows.length,
      totalIntegrationRuntimes: integrationRuntimes.length,
      totalGlobalParameters: globalParameters.length,
      parameterizedLinkedServicesCount: parameterizedLinkedServices.length,
      totalParameterizedLinkedServiceParameters,
      ...activityStats,
      ...dependencies,
      ...usageStats
    };
  }

  /**
   * Calculate activity-related statistics
   */
  private calculateActivityStats(pipelines: ADFComponent[]): {
    totalActivities: number;
    activitiesByType: Record<string, number>;
    avgActivitiesPerPipeline: number;
    maxActivitiesPerPipeline: number;
    maxActivitiesPipelineName: string;
    customActivitiesCount: number;
    totalCustomActivityReferences: number;
    customActivitiesWithMultipleReferences: number;
  } {
    let totalActivities = 0;
    const activitiesByType: Record<string, number> = {};
    let maxActivities = 0;
    let maxPipelineName = '';
    let customActivitiesCount = 0;
    let totalCustomActivityReferences = 0;
    let customActivitiesWithMultipleReferences = 0;

    pipelines.forEach(pipeline => {
      const activities = pipeline.definition?.properties?.activities || [];
      const count = activities.length;
      totalActivities += count;

      if (count > maxActivities) {
        maxActivities = count;
        maxPipelineName = pipeline.name;
      }

      // Count by activity type
      activities.forEach((activity: any) => {
        const type = activity.type || 'Unknown';
        activitiesByType[type] = (activitiesByType[type] || 0) + 1;
        
        // Track Custom activity statistics
        if (type === 'Custom') {
          customActivitiesCount++;
          
          // Count LinkedService references in all 3 locations
          let referenceCount = 0;
          
          // Location 1: linkedServiceName (activity-level, required)
          if (activity.linkedServiceName?.referenceName) {
            referenceCount++;
          }
          
          // Location 2: typeProperties.resourceLinkedService (optional)
          if (activity.typeProperties?.resourceLinkedService?.referenceName) {
            referenceCount++;
          }
          
          // Location 3: typeProperties.referenceObjects.linkedServices[] (optional)
          if (activity.typeProperties?.referenceObjects?.linkedServices) {
            const linkedServices = activity.typeProperties.referenceObjects.linkedServices;
            if (Array.isArray(linkedServices)) {
              referenceCount += linkedServices.length;
            }
          }
          
          totalCustomActivityReferences += referenceCount;
          
          if (referenceCount >= 2) {
            customActivitiesWithMultipleReferences++;
          }
        }
      });
    });

    return {
      totalActivities,
      activitiesByType,
      avgActivitiesPerPipeline: pipelines.length > 0 ? totalActivities / pipelines.length : 0,
      maxActivitiesPerPipeline: maxActivities,
      maxActivitiesPipelineName: maxPipelineName,
      customActivitiesCount,
      totalCustomActivityReferences,
      customActivitiesWithMultipleReferences
    };
  }

  /**
   * Calculate pipeline dependencies (Execute Pipeline activities)
   */
  private calculateDependencies(components: ADFComponent[]): {
    pipelineDependencies: number;
    triggerPipelineMappings: number;
  } {
    const pipelines = components.filter(c => c.type === 'pipeline');
    const triggers = components.filter(c => c.type === 'trigger');
    
    let pipelineDependencies = 0;
    
    // Count Execute Pipeline activities
    pipelines.forEach(pipeline => {
      const activities = pipeline.definition?.properties?.activities || [];
      activities.forEach((activity: any) => {
        if (activity.type === 'ExecutePipeline') {
          pipelineDependencies++;
        }
      });
    });

    // Count trigger-pipeline mappings
    let triggerPipelineMappings = 0;
    triggers.forEach(trigger => {
      const triggerPipelines = trigger.definition?.properties?.pipelines || [];
      triggerPipelineMappings += triggerPipelines.length;
    });

    return {
      pipelineDependencies,
      triggerPipelineMappings
    };
  }

  /**
   * Extract pipeline name from various trigger pipeline reference formats
   * Handles multiple ARM template variations to ensure robust parsing
   * 
   * Supported formats:
   * 1. Standard ADF: { pipelineReference: { referenceName: "Pipeline1", type: "PipelineReference" } }
   * 2. Direct reference: { referenceName: "Pipeline1", type: "PipelineReference" }
   * 3. Simple string: "Pipeline1" or "[concat(variables('factoryId'), '/pipelines/Pipeline1')]"
   * 4. Alternative format: { type: "PipelineReference", name: "Pipeline1" }
   */
  private extractPipelineNameFromTriggerRef(pipelineRef: any): string | null {
    if (!pipelineRef) {
      return null;
    }
    
    // Format 1: Standard ADF - nested pipelineReference object
    if (pipelineRef.pipelineReference?.referenceName) {
      return pipelineRef.pipelineReference.referenceName;
    }
    
    // Format 2: Direct referenceName (some Synapse variations or simplified formats)
    if (pipelineRef.referenceName) {
      return pipelineRef.referenceName;
    }
    
    // Format 3: Simple string (direct name or ARM expression)
    if (typeof pipelineRef === 'string') {
      // If it's an ARM concat expression, extract the pipeline name
      const match = pipelineRef.match(/\/pipelines\/([^'"\]]+)/i);
      if (match) {
        // Clean up the extracted name (remove quotes, brackets, trailing characters)
        return match[1].replace(/['"\]\),]+$/, '').trim();
      }
      // Otherwise assume it's a direct pipeline name
      return pipelineRef;
    }
    
    // Format 4: Alternative reference object format
    if (pipelineRef.type === 'PipelineReference' && pipelineRef.name) {
      return pipelineRef.name;
    }
    
    // Log unrecognized format for debugging
    console.warn('[PIPELINE EXTRACTOR] Unknown pipeline reference format:', {
      pipelineRef,
      type: typeof pipelineRef,
      keys: typeof pipelineRef === 'object' ? Object.keys(pipelineRef) : 'N/A'
    });
    
    return null;
  }

  /**
   * Calculate usage statistics for datasets and linked services
   */
  private calculateUsageStatistics(components: ADFComponent[]): {
    datasetsPerLinkedService: Record<string, number>;
    pipelinesPerDataset: Record<string, number>;
    pipelinesPerTrigger: Record<string, string[]>;
    triggersPerPipeline: Record<string, string[]>;
  } {
    const pipelines = components.filter(c => c.type === 'pipeline');
    const datasets = components.filter(c => c.type === 'dataset');
    const triggers = components.filter(c => c.type === 'trigger');
    
    const datasetsPerLinkedService: Record<string, number> = {};
    const pipelinesPerDataset: Record<string, number> = {};
    const pipelinesPerTrigger: Record<string, string[]> = {};
    const triggersPerPipeline: Record<string, string[]> = {};

    // Count datasets per linked service
    datasets.forEach(dataset => {
      const linkedServiceName = dataset.definition?.properties?.linkedServiceName?.referenceName;
      if (linkedServiceName) {
        datasetsPerLinkedService[linkedServiceName] = (datasetsPerLinkedService[linkedServiceName] || 0) + 1;
      }
    });

    // Count pipelines per dataset
    pipelines.forEach(pipeline => {
      const activities = pipeline.definition?.properties?.activities || [];
      activities.forEach((activity: any) => {
        // Check inputs
        if (activity.inputs && Array.isArray(activity.inputs)) {
          activity.inputs.forEach((input: any) => {
            if (input.referenceName) {
              pipelinesPerDataset[input.referenceName] = (pipelinesPerDataset[input.referenceName] || 0) + 1;
            }
          });
        }
        // Check outputs
        if (activity.outputs && Array.isArray(activity.outputs)) {
          activity.outputs.forEach((output: any) => {
            if (output.referenceName) {
              pipelinesPerDataset[output.referenceName] = (pipelinesPerDataset[output.referenceName] || 0) + 1;
            }
          });
        }
      });
    });

    // Map triggers to pipelines
    triggers.forEach(trigger => {
      const triggerPipelines = trigger.definition?.properties?.pipelines || [];
      
      // DIAGNOSTIC: Log trigger structure
      console.log(`[TRIGGER DEBUG] ${trigger.name}:`, {
        hasDefinition: Boolean(trigger.definition),
        hasProperties: Boolean(trigger.definition?.properties),
        hasPipelines: Boolean(triggerPipelines),
        pipelinesLength: triggerPipelines.length,
        pipelinesRaw: triggerPipelines,
        triggerType: trigger.definition?.properties?.type
      });
      
      if (triggerPipelines.length === 0) {
        console.warn(`[TRIGGER WARNING] Trigger ${trigger.name} has no pipelines array or it is empty`);
        console.warn(`[TRIGGER WARNING] Full properties:`, trigger.definition?.properties);
      }
      
      triggerPipelines.forEach((pipelineRef: any) => {
        // DIAGNOSTIC: Log each pipeline reference structure
        console.log(`[TRIGGER PIPELINE REF] ${trigger.name} references:`, {
          pipelineRef,
          hasReference: Boolean(pipelineRef.pipelineReference),
          referenceName: pipelineRef.pipelineReference?.referenceName,
          directReferenceName: pipelineRef.referenceName
        });
        
        // Use robust extractor to handle multiple formats
        const pipelineName = this.extractPipelineNameFromTriggerRef(pipelineRef);
        
        if (pipelineName) {
          if (!pipelinesPerTrigger[trigger.name]) {
            pipelinesPerTrigger[trigger.name] = [];
          }
          pipelinesPerTrigger[trigger.name].push(pipelineName);

          if (!triggersPerPipeline[pipelineName]) {
            triggersPerPipeline[pipelineName] = [];
          }
          triggersPerPipeline[pipelineName].push(trigger.name);
          
          console.log(`[TRIGGER MAPPING] ${trigger.name} → ${pipelineName}`);
        } else {
          console.error(`[TRIGGER ERROR] Could not extract pipeline name from:`, pipelineRef);
        }
      });
    });

    // DIAGNOSTIC: Log final mappings
    console.log('[TRIGGER MAPPINGS] Final pipelinesPerTrigger:', pipelinesPerTrigger);
    console.log('[TRIGGER MAPPINGS] Final triggersPerPipeline:', triggersPerPipeline);

    return {
      datasetsPerLinkedService,
      pipelinesPerDataset,
      pipelinesPerTrigger,
      triggersPerPipeline
    };
  }

  /**
   * Build detailed artifact breakdown
   */
  private buildArtifactBreakdown(components: ADFComponent[]): ArtifactBreakdown {
    const pipelines = components.filter(c => c.type === 'pipeline');
    const datasets = components.filter(c => c.type === 'dataset');
    const linkedServices = components.filter(c => c.type === 'linkedService');
    const triggers = components.filter(c => c.type === 'trigger');
    const dataflows = components.filter(c => c.type === 'mappingDataFlow');

    const usageStats = this.calculateUsageStatistics(components);
    
    // Build parameterized LinkedService summaries
    const parameterizedLinkedServices = linkedServices
      .filter(ls => ls.parameterizedLinkedServiceInfo)
      .map(ls => {
        const info = ls.parameterizedLinkedServiceInfo!;
        return {
          name: info.linkedServiceName,
          type: info.linkedServiceType,
          parameterCount: info.parameters.length,
          parameters: info.parameters.map(p => p.name),
          affectedPipelines: info.affectedPipelines,
          affectedPipelinesCount: info.affectedPipelines.length
        };
      });

    // Build global parameter artifacts from pipeline references
    const globalParameterArtifacts = this.buildGlobalParameterArtifacts(components);

    return {
      pipelines: this.buildPipelineArtifacts(pipelines, usageStats.triggersPerPipeline),
      datasets: this.buildDatasetArtifacts(datasets, usageStats.pipelinesPerDataset),
      linkedServices: this.buildLinkedServiceArtifacts(linkedServices, usageStats.datasetsPerLinkedService),
      triggers: this.buildTriggerArtifacts(triggers, usageStats.pipelinesPerTrigger),
      dataflows: this.buildDataflowArtifacts(dataflows),
      parameterizedLinkedServices,
      globalParameters: globalParameterArtifacts
    };
  }

  /**
   * Extract direct linked service reference from any activity type
   * Handles multiple locations where linked services can be referenced:
   * - Activity-level linkedServiceName (Web, Azure Function, etc.)
   * - typeProperties linkedServiceName (some activities)
   * - Copy activity source/sink linkedServiceName (direct, no dataset)
   * - Lookup, GetMetadata, Delete activities
   */
  private extractLinkedServiceFromActivity(activity: any): string | null {
    if (!activity) {
      return null;
    }

    // Check for linkedServiceName at activity level (Web, Azure Function, REST, etc.)
    if (activity.linkedServiceName?.referenceName) {
      return activity.linkedServiceName.referenceName;
    }

    // Check in typeProperties (some activities store it there)
    if (activity.typeProperties?.linkedServiceName?.referenceName) {
      return activity.typeProperties.linkedServiceName.referenceName;
    }

    // Check for source/sink linked services in Copy activity (direct connection, no dataset)
    if (activity.type === 'Copy' && activity.typeProperties) {
      // Source linked service (direct, no dataset)
      if (activity.typeProperties.source?.linkedServiceName?.referenceName) {
        return activity.typeProperties.source.linkedServiceName.referenceName;
      }
      // Sink linked service (direct, no dataset)
      if (activity.typeProperties.sink?.linkedServiceName?.referenceName) {
        return activity.typeProperties.sink.linkedServiceName.referenceName;
      }
    }

    // Check for Lookup, GetMetadata, Delete activities
    if (['Lookup', 'GetMetadata', 'Delete'].includes(activity.type)) {
      if (activity.typeProperties?.dataset?.linkedServiceName?.referenceName) {
        return activity.typeProperties.dataset.linkedServiceName.referenceName;
      }
    }

    // Check for Stored Procedure activity
    if (activity.type === 'SqlServerStoredProcedure') {
      if (activity.linkedServiceName?.referenceName) {
        return activity.linkedServiceName.referenceName;
      }
    }

    return null;
  }

  /**
   * Build pipeline artifacts with detailed information
   */
  private buildPipelineArtifacts(
    pipelines: ADFComponent[], 
    triggersPerPipeline: Record<string, string[]>
  ): PipelineArtifact[] {
    return pipelines.map(pipeline => {
      const activities = pipeline.definition?.properties?.activities || [];
      const parameters = pipeline.definition?.properties?.parameters || {};
      
      // Extract folder information
      const folderInfo = extractFolderFromPipeline(pipeline);
      const folder = folderInfo ? folderInfo.path : null;

      const activitySummaries: ActivitySummary[] = activities.map((activity: any) => {
        const summary: ActivitySummary = {
          name: activity.name || 'Unnamed',
          type: activity.type || 'Unknown',
          description: activity.description
        };
        
        // Add Custom activity metadata
        if (activity.type === 'Custom') {
          summary.isCustomActivity = true;
          summary.customActivityReferences = {};
          
          // Track activity-level LinkedService reference
          if (activity.linkedServiceName?.referenceName) {
            summary.customActivityReferences.activityLevel = activity.linkedServiceName.referenceName;
          }
          
          // Track resource LinkedService reference
          if (activity.typeProperties?.resourceLinkedService?.referenceName) {
            summary.customActivityReferences.resource = activity.typeProperties.resourceLinkedService.referenceName;
          }
          
          // Track reference objects LinkedService references
          if (activity.typeProperties?.referenceObjects?.linkedServices) {
            const linkedServices = activity.typeProperties.referenceObjects.linkedServices;
            if (Array.isArray(linkedServices)) {
              summary.customActivityReferences.referenceObjects = linkedServices.map((ls: any) => 
                ls.referenceName || 'Unknown'
              );
            }
          }
        }
        
        return summary;
      });

      const usesDatasets: string[] = [];
      const executesPipelines: string[] = [];
      const usesLinkedServices: string[] = [];  // NEW: Direct linked service references

      activities.forEach((activity: any) => {
        // Collect dataset references
        if (activity.inputs) {
          activity.inputs.forEach((input: any) => {
            if (input.referenceName && !usesDatasets.includes(input.referenceName)) {
              usesDatasets.push(input.referenceName);
            }
          });
        }
        if (activity.outputs) {
          activity.outputs.forEach((output: any) => {
            if (output.referenceName && !usesDatasets.includes(output.referenceName)) {
              usesDatasets.push(output.referenceName);
            }
          });
        }

        // Collect Execute Pipeline references
        if (activity.type === 'ExecutePipeline') {
          const pipelineRef = activity.typeProperties?.pipeline?.referenceName;
          if (pipelineRef && !executesPipelines.includes(pipelineRef)) {
            executesPipelines.push(pipelineRef);
          }
        }

        // NEW: Collect direct linked service references
        const linkedServiceRef = this.extractLinkedServiceFromActivity(activity);
        if (linkedServiceRef && !usesLinkedServices.includes(linkedServiceRef)) {
          usesLinkedServices.push(linkedServiceRef);
        }
      });

      // NEW: Extract resource-level dependencies from component
      const dependsOnPipelines = pipeline.resourceDependencies?.pipelines || [];
      const dependsOnLinkedServices = pipeline.resourceDependencies?.linkedServices || [];
      const dependsOnDataflows = pipeline.resourceDependencies?.dataflows || [];

      return {
        name: pipeline.name,
        activityCount: activities.length,
        activities: activitySummaries,
        parameterCount: Object.keys(parameters).length,
        triggeredBy: triggersPerPipeline[pipeline.name] || [],
        usesDatasets,
        executesPipelines,
        usesLinkedServices,  // NEW
        dependsOnPipelines,  // NEW
        dependsOnLinkedServices,  // NEW
        dependsOnDataflows,  // NEW
        folder,
        fabricMapping: {
          targetType: 'dataPipeline',
          compatibilityStatus: pipeline.compatibilityStatus || 'supported',
          migrationNotes: pipeline.warnings || []
        }
      };
    });
  }

  /**
   * Build dataset artifacts with usage information
   */
  private buildDatasetArtifacts(
    datasets: ADFComponent[],
    pipelinesPerDataset: Record<string, number>
  ): DatasetArtifact[] {
    return datasets.map(dataset => {
      const linkedServiceName = dataset.definition?.properties?.linkedServiceName?.referenceName || 'Unknown';
      const datasetType = dataset.definition?.properties?.type || 'Unknown';

      // Find which pipelines use this dataset
      const usedByPipelines: string[] = [];
      this.parsedComponents
        .filter(c => c.type === 'pipeline')
        .forEach(pipeline => {
          const activities = pipeline.definition?.properties?.activities || [];
          activities.forEach((activity: any) => {
            const inputNames = (activity.inputs || []).map((i: any) => i.referenceName);
            const outputNames = (activity.outputs || []).map((o: any) => o.referenceName);
            if (inputNames.includes(dataset.name) || outputNames.includes(dataset.name)) {
              if (!usedByPipelines.includes(pipeline.name)) {
                usedByPipelines.push(pipeline.name);
              }
            }
          });
        });

      return {
        name: dataset.name,
        type: datasetType,
        linkedService: linkedServiceName,
        usedByPipelines,
        usageCount: pipelinesPerDataset[dataset.name] || 0,
        fabricMapping: {
          embeddedInActivity: true,
          requiresConnection: true
        }
      };
    });
  }

  /**
   * Build linked service artifacts with usage scoring
   */
  private buildLinkedServiceArtifacts(
    linkedServices: ADFComponent[],
    datasetsPerLinkedService: Record<string, number>
  ): LinkedServiceArtifact[] {
    return linkedServices.map(ls => {
      const lsType = ls.definition?.properties?.type || 'Unknown';
      
      // Find datasets that use this linked service
      const usedByDatasets = this.parsedComponents
        .filter(c => c.type === 'dataset')
        .filter(dataset => {
          const dsLsName = dataset.definition?.properties?.linkedServiceName?.referenceName;
          return dsLsName === ls.name;
        })
        .map(d => d.name);

      // Find pipelines that indirectly use this linked service
      const usedByPipelines: string[] = [];
      usedByDatasets.forEach(datasetName => {
        this.parsedComponents
          .filter(c => c.type === 'pipeline')
          .forEach(pipeline => {
            const activities = pipeline.definition?.properties?.activities || [];
            activities.forEach((activity: any) => {
              const inputNames = (activity.inputs || []).map((i: any) => i.referenceName);
              const outputNames = (activity.outputs || []).map((o: any) => o.referenceName);
              if (inputNames.includes(datasetName) || outputNames.includes(datasetName)) {
                if (!usedByPipelines.includes(pipeline.name)) {
                  usedByPipelines.push(pipeline.name);
                }
              }
            });
          });
      });

      // Calculate usage score (criticality)
      const usageScore = usedByDatasets.length * 2 + usedByPipelines.length;

      return {
        name: ls.name,
        type: lsType,
        usedByDatasets,
        usedByPipelines,
        usageScore,
        fabricMapping: {
          targetType: this.mapLinkedServiceToFabric(lsType),
          connectorType: lsType,
          requiresGateway: this.requiresGateway(lsType)
        }
      };
    });
  }

  /**
   * Build trigger artifacts with schedule information
   */
  private buildTriggerArtifacts(
    triggers: ADFComponent[],
    pipelinesPerTrigger: Record<string, string[]>
  ): TriggerArtifact[] {
    return triggers.map(trigger => {
      const triggerType = trigger.definition?.properties?.type || 'Unknown';
      const runtimeState = trigger.definition?.properties?.runtimeState || 'Unknown';
      const recurrence = trigger.definition?.properties?.typeProperties?.recurrence;

      let schedule: string | undefined;
      if (recurrence) {
        schedule = `${recurrence.frequency} (interval: ${recurrence.interval})`;
      }

      // NEW: Extract resource-level dependencies
      const dependsOnPipelines = trigger.resourceDependencies?.pipelines || [];

      return {
        name: trigger.name,
        type: triggerType,
        status: runtimeState === 'Started' ? 'Started' : 'Stopped',
        pipelines: pipelinesPerTrigger[trigger.name] || [],
        dependsOnPipelines,  // NEW
        schedule,
        recurrence,
        fabricMapping: {
          targetType: triggerType === 'ScheduleTrigger' || triggerType === 'TumblingWindowTrigger' ? 'schedule' : 'manual',
          supportLevel: triggerType === 'ScheduleTrigger' ? 'full' : 'partial'
        }
      };
    });
  }

  /**
   * Build dataflow artifacts
   */
  private buildDataflowArtifacts(dataflows: ADFComponent[]): DataflowArtifact[] {
    return dataflows.map(dataflow => {
      const sources = dataflow.definition?.properties?.typeProperties?.sources || [];
      const sinks = dataflow.definition?.properties?.typeProperties?.sinks || [];
      const transformations = dataflow.definition?.properties?.typeProperties?.transformations || [];

      return {
        name: dataflow.name,
        sourceCount: sources.length,
        sinkCount: sinks.length,
        transformationCount: transformations.length,
        fabricMapping: {
          targetType: 'dataflowGen2',
          requiresManualMigration: true
        }
      };
    });
  }

  /**
   * Build global parameter artifacts from components
   * Extracts global parameter references detected in pipelines
   */
  private buildGlobalParameterArtifacts(components: ADFComponent[]): GlobalParameterArtifact[] {
    // Extract global parameter references from pipeline components
    const allReferences: GlobalParameterReference[] = [];
    
    components.forEach(component => {
      if (component.type === 'pipeline' && component.globalParameterReferences) {
        component.globalParameterReferences.forEach(ref => {
          // Check if we already have this parameter
          const existing = allReferences.find(r => r.name === ref.name);
          if (!existing) {
            allReferences.push(ref);
          } else {
            // Merge pipeline references
            ref.referencedByPipelines.forEach(pipeline => {
              if (!existing.referencedByPipelines.includes(pipeline)) {
                existing.referencedByPipelines.push(pipeline);
              }
            });
          }
        });
      }
    });

    // Convert to GlobalParameterArtifact format
    return allReferences.map(ref => {
      const factoryName = this.extractFactoryName(components) || 'VariableLibrary';
      const libraryName = `${factoryName}_GlobalParameters_VariableLibrary`;
      
      return {
        name: ref.name,
        dataType: ref.fabricDataType,
        defaultValue: ref.defaultValue,
        usedByPipelines: ref.referencedByPipelines,
        referenceCount: ref.referencedByPipelines.length,
        fabricMapping: {
          variableLibraryName: libraryName,
          transformedExpression: `@pipeline().libraryVariables.${libraryName}_${ref.name}`
        }
      };
    });
  }

  /**
   * Build dependency graph for visualization
   */
  private buildDependencyGraph(components: ADFComponent[], artifacts: ArtifactBreakdown): DependencyGraph {
    console.log('[GRAPH] Building dependency graph from', components.length, 'components');
    
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Create nodes for each artifact type
    artifacts.pipelines.forEach(pipeline => {
      nodes.push({
        id: `pipeline_${pipeline.name}`,
        type: 'pipeline',
        label: pipeline.name,
        metadata: {
          activityCount: pipeline.activityCount,
          folder: pipeline.folder || undefined
        },
        fabricTarget: 'Data Pipeline',
        criticality: pipeline.triggeredBy.length > 2 ? 'high' : pipeline.triggeredBy.length > 0 ? 'medium' : 'low'
      });
    });

    artifacts.datasets.forEach(dataset => {
      nodes.push({
        id: `dataset_${dataset.name}`,
        type: 'dataset',
        label: dataset.name,
        metadata: {
          usageCount: dataset.usageCount
        },
        fabricTarget: 'Embedded in Activity',
        criticality: dataset.usageCount > 5 ? 'high' : dataset.usageCount > 2 ? 'medium' : 'low'
      });
    });

    artifacts.linkedServices.forEach(ls => {
      nodes.push({
        id: `linkedService_${ls.name}`,
        type: 'linkedService',
        label: ls.name,
        metadata: {
          usageCount: ls.usageScore
        },
        fabricTarget: 'Connection',
        criticality: ls.usageScore > 10 ? 'high' : ls.usageScore > 5 ? 'medium' : 'low'
      });
    });

    artifacts.triggers.forEach(trigger => {
      nodes.push({
        id: `trigger_${trigger.name}`,
        type: 'trigger',
        label: trigger.name,
        metadata: {
          status: trigger.status
        },
        fabricTarget: 'Pipeline Schedule',
        criticality: trigger.pipelines.length > 2 ? 'high' : 'medium'
      });
    });

    artifacts.dataflows.forEach(dataflow => {
      nodes.push({
        id: `dataflow_${dataflow.name}`,
        type: 'dataflow',
        label: dataflow.name,
        metadata: {},
        fabricTarget: 'Dataflow Gen2',
        criticality: 'medium'
      });
    });

    // Create edges for trigger -> pipeline
    console.log('[GRAPH DEBUG] Creating trigger edges. Triggers:', artifacts.triggers.map(t => ({
      name: t.name,
      pipelinesCount: t.pipelines.length,
      pipelines: t.pipelines
    })));
    
    artifacts.triggers.forEach(trigger => {
      console.log(`[GRAPH DEBUG] Processing trigger ${trigger.name} with ${trigger.pipelines.length} pipelines:`, trigger.pipelines);
      
      trigger.pipelines.forEach(pipelineName => {
        // DIAGNOSTIC: Validate target pipeline exists
        const pipelineExists = artifacts.pipelines.some(p => p.name === pipelineName);
        const pipelineNodeId = `pipeline_${pipelineName}`;
        const pipelineNodeExists = nodes.some(n => n.id === pipelineNodeId);
        
        if (!pipelineExists) {
          console.error(`[GRAPH ERROR] Trigger ${trigger.name} references non-existent pipeline: ${pipelineName}`);
          console.log('[GRAPH DEBUG] Available pipelines:', artifacts.pipelines.map(p => p.name));
        }
        
        if (!pipelineNodeExists) {
          console.warn(`[GRAPH WARNING] Pipeline node ${pipelineNodeId} does not exist, creating placeholder`);
          console.log('[GRAPH DEBUG] Available pipeline nodes:', nodes.filter(n => n.type === 'pipeline').map(n => n.id));
          
          // Create placeholder node for missing pipeline
          nodes.push({
            id: pipelineNodeId,
            type: 'pipeline',
            label: `${pipelineName} (referenced)`,
            metadata: {
              activityCount: 0
            },
            fabricTarget: 'Data Pipeline',
            criticality: 'low'
          });
        }
        
        edges.push({
          source: `trigger_${trigger.name}`,
          target: `pipeline_${pipelineName}`,
          type: 'triggers',
          label: 'triggers'
        });
        
        console.log(`[GRAPH EDGE] Created: trigger_${trigger.name} → pipeline_${pipelineName}`);
      });
    });

    // DIAGNOSTIC: Log all trigger edges
    const triggerEdges = edges.filter(e => e.type === 'triggers');
    console.log(`[GRAPH DEBUG] Total trigger edges created: ${triggerEdges.length}`, triggerEdges);

    // Create edges for pipeline -> dataset
    artifacts.pipelines.forEach(pipeline => {
      pipeline.usesDatasets.forEach(datasetName => {
        edges.push({
          source: `pipeline_${pipeline.name}`,
          target: `dataset_${datasetName}`,
          type: 'uses',
          label: 'uses'
        });
      });
    });

    // Create edges for dataset -> linkedService
    artifacts.datasets.forEach(dataset => {
      // Skip if linkedService is 'Unknown' (no reference found)
      if (dataset.linkedService === 'Unknown') {
        console.warn(`[GRAPH] Skipping edge for dataset "${dataset.name}" - no linked service reference`);
        return;
      }
      
      // Check if the linked service node actually exists
      const linkedServiceNodeExists = nodes.some(n => n.id === `linkedService_${dataset.linkedService}`);
      if (!linkedServiceNodeExists) {
        console.warn(`[GRAPH] Skipping edge for dataset "${dataset.name}" - linked service "${dataset.linkedService}" node not found in graph`);
        return;
      }
      
      edges.push({
        source: `dataset_${dataset.name}`,
        target: `linkedService_${dataset.linkedService}`,
        type: 'references',
        label: 'references'
      });
    });

    // Create edges for pipeline -> pipeline (Execute Pipeline)
    artifacts.pipelines.forEach(pipeline => {
      pipeline.executesPipelines.forEach(targetPipeline => {
        edges.push({
          source: `pipeline_${pipeline.name}`,
          target: `pipeline_${targetPipeline}`,
          type: 'executes',
          label: 'executes'
        });
      });
    });

    // NEW: Create edges for pipeline -> linkedService (direct activity reference)
    artifacts.pipelines.forEach(pipeline => {
      pipeline.usesLinkedServices?.forEach(linkedServiceName => {
        // Avoid duplicates (might already have edge through dataset)
        const edgeExists = edges.some(e => 
          e.source === `pipeline_${pipeline.name}` && 
          e.target === `linkedService_${linkedServiceName}`
        );
        
        if (!edgeExists) {
          edges.push({
            source: `pipeline_${pipeline.name}`,
            target: `linkedService_${linkedServiceName}`,
            type: 'uses',
            label: 'uses (direct)'
          });
        }
      });
    });

    // NEW: Create edges for resource-level dependsOn (pipeline -> pipeline)
    artifacts.pipelines.forEach(pipeline => {
      pipeline.dependsOnPipelines?.forEach(targetPipeline => {
        // Avoid duplicates with ExecutePipeline edges
        const edgeExists = edges.some(e => 
          e.source === `pipeline_${pipeline.name}` && 
          e.target === `pipeline_${targetPipeline}` &&
          (e.type === 'executes' || e.type === 'dependsOn')
        );
        
        if (!edgeExists) {
          edges.push({
            source: `pipeline_${pipeline.name}`,
            target: `pipeline_${targetPipeline}`,
            type: 'dependsOn',
            label: 'depends on'
          });
        }
      });
    });

    // NEW: Create edges for resource-level dependsOn (pipeline -> linkedService)
    artifacts.pipelines.forEach(pipeline => {
      pipeline.dependsOnLinkedServices?.forEach(linkedServiceName => {
        // Avoid duplicates with direct activity references and dataset references
        const edgeExists = edges.some(e => 
          e.source === `pipeline_${pipeline.name}` && 
          e.target === `linkedService_${linkedServiceName}`
        );
        
        if (!edgeExists) {
          edges.push({
            source: `pipeline_${pipeline.name}`,
            target: `linkedService_${linkedServiceName}`,
            type: 'dependsOn',
            label: 'depends on'
          });
        }
      });
    });

    // NEW: Create edges for resource-level dependsOn (pipeline -> dataflow)
    artifacts.pipelines.forEach(pipeline => {
      pipeline.dependsOnDataflows?.forEach(dataflowName => {
        edges.push({
          source: `pipeline_${pipeline.name}`,
          target: `dataflow_${dataflowName}`,
          type: 'dependsOn',
          label: 'depends on'
        });
      });
    });

    // NEW: Create edges for trigger resource-level dependsOn (trigger -> pipeline)
    artifacts.triggers.forEach(trigger => {
      trigger.dependsOnPipelines?.forEach(pipelineName => {
        // Avoid duplicates with trigger.pipelines edges
        const edgeExists = edges.some(e => 
          e.source === `trigger_${trigger.name}` && 
          e.target === `pipeline_${pipelineName}` &&
          e.type === 'triggers'
        );
        
        if (!edgeExists) {
          console.log(`[GRAPH EDGE] Creating dependsOn edge: trigger_${trigger.name} → pipeline_${pipelineName}`);
          
          edges.push({
            source: `trigger_${trigger.name}`,
            target: `pipeline_${pipelineName}`,
            type: 'dependsOn',
            label: 'depends on'
          });
        }
      });
    });

    // NEW: Create edges for Custom activity LinkedService references
    // Custom activities have 3 potential LinkedService reference locations, represented with color-coded edges
    artifacts.pipelines.forEach(pipeline => {
      pipeline.activities.forEach(activity => {
        if (activity.isCustomActivity && activity.customActivityReferences) {
          const customRefs = activity.customActivityReferences;
          
          // Location 1: Activity-level LinkedService (required) - Blue edge
          if (customRefs.activityLevel) {
            edges.push({
              source: `pipeline_${pipeline.name}`,
              target: `linkedService_${customRefs.activityLevel}`,
              type: 'uses',
              label: `Custom: ${activity.name} (activity-level)`
            });
          }
          
          // Location 2: Resource LinkedService (optional) - Orange edge
          if (customRefs.resource) {
            // Check if this edge already exists from location 1
            const edgeExists = edges.some(e => 
              e.source === `pipeline_${pipeline.name}` && 
              e.target === `linkedService_${customRefs.resource}` &&
              e.label?.includes(activity.name)
            );
            
            if (!edgeExists) {
              edges.push({
                source: `pipeline_${pipeline.name}`,
                target: `linkedService_${customRefs.resource}`,
                type: 'references',
                label: `Custom: ${activity.name} (resource)`
              });
            }
          }
          
          // Location 3: Reference Objects LinkedServices (optional array) - Purple edges
          if (customRefs.referenceObjects) {
            customRefs.referenceObjects.forEach((linkedServiceName, index) => {
              // Check if this edge already exists from previous locations
              const edgeExists = edges.some(e => 
                e.source === `pipeline_${pipeline.name}` && 
                e.target === `linkedService_${linkedServiceName}` &&
                e.label?.includes(activity.name)
              );
              
              if (!edgeExists) {
                edges.push({
                  source: `pipeline_${pipeline.name}`,
                  target: `linkedService_${linkedServiceName}`,
                  type: 'references',
                  label: `Custom: ${activity.name} (ref-obj[${index}])`
                });
              }
            });
          }
        }
      });
    });

    console.log('[GRAPH] Created', nodes.length, 'nodes and', edges.length, 'edges');
    return { nodes, edges };
  }

  /**
   * Generate insights based on metrics and artifacts
   */
  private generateInsights(metrics: ProfileMetrics, artifacts: ArtifactBreakdown): ProfileInsight[] {
    const insights: ProfileInsight[] = [];

    // Insight 1: Factory scale
    insights.push({
      id: 'factory_scale',
      icon: '📊',
      title: 'Factory Scale Overview',
      description: `This data factory contains ${metrics.totalPipelines} pipelines with a total of ${metrics.totalActivities} activities. The average pipeline complexity is ${metrics.avgActivitiesPerPipeline.toFixed(1)} activities.`,
      severity: 'info',
      metric: metrics.totalPipelines
    });

    // Insight 2: Most complex pipeline
    if (metrics.maxActivitiesPerPipeline > 10) {
      insights.push({
        id: 'complex_pipeline',
        icon: '⚠️',
        title: 'High Complexity Pipeline Detected',
        description: `Pipeline "${metrics.maxActivitiesPipelineName}" contains ${metrics.maxActivitiesPerPipeline} activities, which may require extra attention during migration.`,
        severity: 'warning',
        metric: metrics.maxActivitiesPerPipeline,
        recommendation: 'Consider breaking down complex pipelines into smaller, more manageable units in Fabric.'
      });
    }

    // Insight 3: Dataset usage
    const highUsageDatasets = artifacts.datasets.filter(d => d.usageCount > 5);
    if (highUsageDatasets.length > 0) {
      insights.push({
        id: 'high_usage_datasets',
        icon: '🔗',
        title: 'Critical Dataset Dependencies',
        description: `${highUsageDatasets.length} datasets are used by more than 5 pipelines. These are critical components that should be migrated carefully.`,
        severity: 'warning',
        metric: highUsageDatasets.length,
        recommendation: 'Ensure these high-usage datasets are migrated and tested thoroughly before dependent pipelines.'
      });
    }

    // Insight 4: Trigger configuration
    if (metrics.totalTriggers > 0) {
      insights.push({
        id: 'trigger_migration',
        icon: '⏰',
        title: 'Trigger Migration Required',
        description: `Found ${metrics.totalTriggers} triggers that will need to be recreated as pipeline schedules in Fabric.`,
        severity: 'info',
        metric: metrics.totalTriggers,
        recommendation: 'Review trigger schedules and ensure they align with Fabric scheduling capabilities.'
      });
    }

    // Insight 5: Activity type distribution
    const topActivityType = Object.entries(metrics.activitiesByType)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (topActivityType) {
      insights.push({
        id: 'activity_distribution',
        icon: '🔧',
        title: `${topActivityType[0]} Activities Dominant`,
        description: `${topActivityType[0]} activities make up ${((topActivityType[1] / metrics.totalActivities) * 100).toFixed(1)}% of all activities (${topActivityType[1]} of ${metrics.totalActivities}).`,
        severity: 'info',
        metric: topActivityType[1]
      });
    }

    // Insight 6: Linked service dependencies
    const criticalLinkedServices = artifacts.linkedServices.filter(ls => ls.usageScore > 10);
    if (criticalLinkedServices.length > 0) {
      insights.push({
        id: 'critical_connections',
        icon: '🔌',
        title: 'Critical Connection Dependencies',
        description: `${criticalLinkedServices.length} linked services have high usage scores, indicating they are central to your data factory operations.`,
        severity: 'critical',
        metric: criticalLinkedServices.length,
        recommendation: 'Prioritize testing these connections in Fabric before migrating dependent components.'
      });
    }

    // Insight 7: Unsupported components
    const unsupportedDataflows = artifacts.dataflows.length;
    if (unsupportedDataflows > 0) {
      insights.push({
        id: 'unsupported_dataflows',
        icon: '❌',
        title: 'Mapping Dataflows Require Manual Migration',
        description: `Found ${unsupportedDataflows} mapping dataflows that are not directly supported in Fabric Data Pipelines.`,
        severity: 'critical',
        metric: unsupportedDataflows,
        recommendation: 'Plan to recreate dataflow logic using Fabric Dataflow Gen2 or Notebooks.'
      });
    }

    return insights;
  }

  /**
   * Extract template version from components (if available)
   */
  private extractTemplateVersion(components: ADFComponent[]): string | undefined {
    // This would typically come from the ARM template's schema version
    return '1.0.0';
  }

  /**
   * Extract factory name from components
   */
  private extractFactoryName(components: ADFComponent[]): string | undefined {
    // Try to extract from the first component's definition
    if (components.length > 0) {
      const firstComponent = components[0];
      // Factory name might be in the resource path
      return 'Azure Data Factory';
    }
    return undefined;
  }

  /**
   * Map linked service type to Fabric target type
   */
  private mapLinkedServiceToFabric(lsType: string): 'connector' | 'gateway' | 'workspaceIdentity' {
    const gatewayTypes = ['OnPremisesSql', 'OnPremisesOracle', 'OnPremisesFileSystem'];
    if (gatewayTypes.some(type => lsType.includes(type))) {
      return 'gateway';
    }
    return 'connector';
  }

  /**
   * Determine if a linked service requires a gateway
   */
  private requiresGateway(lsType: string): boolean {
    const gatewayRequired = ['OnPremises', 'SelfHosted', 'FileServer', 'Hdfs'];
    return gatewayRequired.some(keyword => lsType.includes(keyword));
  }
}

export const adfParserService = new ADFParserService();