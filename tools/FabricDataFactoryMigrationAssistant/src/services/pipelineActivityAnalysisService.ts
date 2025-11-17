import { ADFComponent } from '../types';

// A small shape describing a linked service reference found within a pipeline activity
export interface ActivityLinkedServiceReference {
  activityName: string;
  activityType: string;
  linkedServiceName?: string;
  linkedServiceType?: string;
  datasetName?: string;
  datasetLinkedServiceName?: string;
  datasetLinkedServiceType?: string;
  datasetParameters?: Record<string, any>;
  referenceLocation?: 'direct' | 'dataset' | 'typeProperties' | 'invokePipeline';
  // For InvokePipeline/ExecutePipeline activities
  targetPipelineName?: string;
  pipelineParameters?: Record<string, any>;
}

// Shape used by the UI to display mapping work items
export interface PipelineActivityMapping {
  activityName: string;
  activityType: string;
  linkedServiceReference?: { name: string; type?: string };
  datasetReference?: { name: string; linkedServiceName?: string; linkedServiceType?: string };
  status: 'pending' | 'mapped' | 'skipped';
}

/**
 * Utility to inspect pipeline components and extract LinkedService references
 * used by the mapping / UI flows.
 */
export class PipelineActivityAnalysisService {
  /**
   * Analyzes a pipeline component to extract all LinkedService references from its activities
   * Enhanced to properly resolve dataset LinkedService references and detect ALL LinkedService references
   */
  static analyzePipelineActivities(pipelineComponent: ADFComponent, allDatasets?: ADFComponent[]): ActivityLinkedServiceReference[] {
    const references: ActivityLinkedServiceReference[] = [];

    if (pipelineComponent.type !== 'pipeline' || !pipelineComponent.definition?.properties?.activities) {
      return references;
    }

    const activities = pipelineComponent.definition.properties.activities;

    for (const activity of activities) {
      if (!activity || !activity.name || !activity.type) continue;

      // COMPREHENSIVE LinkedService detection - check all possible locations

      // 1. Direct LinkedService references (activity-level)
      const direct = this.extractDirectLinkedServiceReference(activity);
      if (direct) {
        references.push({
          activityName: activity.name,
          activityType: activity.type,
          linkedServiceName: direct.name,
          linkedServiceType: direct.type,
          referenceLocation: 'direct'
        });
      }

      // 2. TypeProperties LinkedService references (staging, webactivity etc.)
      const tpRef = this.extractTypePropertiesLinkedServiceReference(activity);
      if (tpRef) {
        references.push({
          activityName: activity.name,
          activityType: activity.type,
          linkedServiceName: tpRef.name,
          linkedServiceType: tpRef.type,
          referenceLocation: 'typeProperties'
        });
      }

      // 3. ALL Dataset references that imply linked service mappings
      const allDatasetRefs = this.extractAllDatasetLinkedServiceReferences(activity, allDatasets);
      references.push(...allDatasetRefs);
    }

    return references;
  }

  /**
   * Extract a direct linked service reference from activity (activity-level linkedServiceName or linkedServices)
   */
  private static extractDirectLinkedServiceReference(activity: any): { name: string; type?: string } | null {
    if (!activity) return null;

    // Activity-level linkedServiceName shorthand
    if (activity.linkedServiceName?.referenceName) {
      return { name: activity.linkedServiceName.referenceName, type: activity.linkedServiceName.type || 'LinkedServiceReference' };
    }

    // Some activities (Script, StoredProcedure) may have a linkedServiceName inside typeProperties
    if (activity.typeProperties?.linkedServiceName?.referenceName) {
      const ls = activity.typeProperties.linkedServiceName;
      return { name: ls.referenceName, type: ls.type || 'LinkedServiceReference' };
    }

    // linkedServices array (e.g., WebActivity) - take the first
    if (activity.typeProperties?.linkedServices && Array.isArray(activity.typeProperties.linkedServices)) {
      const first = activity.typeProperties.linkedServices[0];
      if (first?.referenceName) return { name: first.referenceName, type: first.type || 'LinkedServiceReference' };
    }

    return null;
  }

  /**
   * Enhanced method to extract ALL LinkedService references from ALL Dataset references in an activity
   * Finds all datasets referenced by an activity and returns separate references for each
   */
  private static extractAllDatasetLinkedServiceReferences(activity: any, allDatasets?: ADFComponent[]): ActivityLinkedServiceReference[] {
    const references: ActivityLinkedServiceReference[] = [];
    if (!activity) return references;

    // Helper function to extract dataset reference and resolve LinkedService
    const extractAndResolveDatasetRef = (datasetRef: any): ActivityLinkedServiceReference | null => {
      if (!datasetRef?.referenceName) return null;

      const datasetName = datasetRef.referenceName;
      const datasetParameters = datasetRef.parameters || {};

      // Look up the actual dataset definition
      if (allDatasets) {
        const datasetComponent = allDatasets.find(d => d.type === 'dataset' && d.name === datasetName);
        if (datasetComponent?.definition?.properties?.linkedServiceName?.referenceName) {
          return {
            activityName: activity.name,
            activityType: activity.type,
            datasetName,
            datasetLinkedServiceName: datasetComponent.definition.properties.linkedServiceName.referenceName,
            datasetLinkedServiceType: datasetComponent.definition.properties.linkedServiceName.type || 'LinkedServiceReference',
            datasetParameters,
            referenceLocation: 'dataset'
          };
        }
      }

      // Fallback: assume LinkedService name follows pattern (for backward compatibility)
      console.warn(`Dataset ${datasetName} not found in definitions, using fallback naming pattern`);
      return {
        activityName: activity.name,
        activityType: activity.type,
        datasetName,
        datasetLinkedServiceName: `${datasetName}_LinkedService`,
        datasetLinkedServiceType: 'LinkedServiceReference',
        datasetParameters,
        referenceLocation: 'dataset'
      };
    };

    // Check ALL possible locations where dataset references can be found

    // 1. Source dataset in typeProperties
    if (activity.typeProperties?.source?.dataset) {
      const result = extractAndResolveDatasetRef(activity.typeProperties.source.dataset);
      if (result) references.push(result);
    }

    // 2. Sink dataset in typeProperties
    if (activity.typeProperties?.sink?.dataset) {
      const result = extractAndResolveDatasetRef(activity.typeProperties.sink.dataset);
      if (result) references.push(result);
    }

    // 3. Direct dataset reference in typeProperties
    if (activity.typeProperties?.dataset) {
      const result = extractAndResolveDatasetRef(activity.typeProperties.dataset);
      if (result) references.push(result);
    }

    // 4. Inputs array - check ALL entries for DatasetReference type
    if (Array.isArray(activity.inputs)) {
      for (const inp of activity.inputs) {
        if (inp?.type === 'DatasetReference') {
          const result = extractAndResolveDatasetRef(inp);
          if (result) references.push(result);
        }
      }
    }

    // 5. Outputs array - check ALL entries for DatasetReference type
    if (Array.isArray(activity.outputs)) {
      for (const out of activity.outputs) {
        if (out?.type === 'DatasetReference') {
          const result = extractAndResolveDatasetRef(out);
          if (result) references.push(result);
        }
      }
    }

    // 6. Recursively search for DatasetReference objects in typeProperties
    if (activity.typeProperties) {
      const allDatasetRefs = this.findAllDatasetReferencesRecursively(activity.typeProperties);
      for (const datasetRef of allDatasetRefs) {
        const result = extractAndResolveDatasetRef(datasetRef);
        if (result) references.push(result);
      }
    }

    // 7. Check for InvokePipeline/ExecutePipeline activities that need FabricDataPipelines connection
    if (activity.type === 'ExecutePipeline' || activity.type === 'InvokePipeline') {
      const targetPipelineName = activity.typeProperties?.pipeline?.referenceName;
      if (targetPipelineName) {
        references.push({
          activityName: activity.name,
          activityType: activity.type,
          linkedServiceName: 'FabricDataPipelines', // Special connection type
          linkedServiceType: 'FabricDataPipelines',
          targetPipelineName,
          pipelineParameters: activity.typeProperties?.parameters || {},
          referenceLocation: 'invokePipeline'
        });
      }
    }

    return references;
  }

  /**
   * Recursively finds all DatasetReference objects in nested structures
   */
  private static findAllDatasetReferencesRecursively(obj: any): Array<{ referenceName: string; parameters?: Record<string, any> }> {
    const references: Array<{ referenceName: string; parameters?: Record<string, any> }> = [];
    
    if (!obj || typeof obj !== 'object') return references;

    // Check if this object is a DatasetReference
    if (obj.type === 'DatasetReference' && obj.referenceName) {
      references.push({
        referenceName: obj.referenceName,
        parameters: obj.parameters || {}
      });
    }

    // Recursively search in arrays and objects
    if (Array.isArray(obj)) {
      for (const item of obj) {
        references.push(...this.findAllDatasetReferencesRecursively(item));
      }
    } else {
      for (const [key, value] of Object.entries(obj)) {
        if (key !== 'referenceName' && key !== 'type') { // Avoid infinite recursion
          references.push(...this.findAllDatasetReferencesRecursively(value));
        }
      }
    }

    return references;
  }

  /**
   * Recursively search for DatasetReference objects in nested structures
   */
  private static findDatasetReferencesInObject(obj: any, allDatasets?: ADFComponent[]): {
    datasetName: string;
    linkedServiceName: string;
    linkedServiceType: string;
    datasetParameters?: Record<string, any>;
  } | null {
    if (!obj || typeof obj !== 'object') return null;

    // Check if this object is a DatasetReference
    if (obj.type === 'DatasetReference' && obj.referenceName) {
      const datasetName = obj.referenceName;
      const datasetParameters = obj.parameters || {};

      // Look up the actual dataset definition
      if (allDatasets) {
        const datasetComponent = allDatasets.find(d => d.type === 'dataset' && d.name === datasetName);
        if (datasetComponent?.definition?.properties?.linkedServiceName?.referenceName) {
          return {
            datasetName,
            linkedServiceName: datasetComponent.definition.properties.linkedServiceName.referenceName,
            linkedServiceType: datasetComponent.definition.properties.linkedServiceName.type || 'LinkedServiceReference',
            datasetParameters
          };
        }
      }

      // Fallback
      return {
        datasetName,
        linkedServiceName: `${datasetName}_LinkedService`,
        linkedServiceType: 'LinkedServiceReference',
        datasetParameters
      };
    }

    // Recursively search in arrays and objects
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const result = this.findDatasetReferencesInObject(item, allDatasets);
        if (result) return result;
      }
    } else {
      for (const [key, value] of Object.entries(obj)) {
        if (key !== 'referenceName' && key !== 'type') { // Avoid infinite recursion
          const result = this.findDatasetReferencesInObject(value, allDatasets);
          if (result) return result;
        }
      }
    }

    return null;
  }

  /**
   * Extracts LinkedService reference from typeProperties (e.g., WebActivity linkedServices or linkedServiceName)
   */
  private static extractTypePropertiesLinkedServiceReference(activity: any): { name: string; type: string } | null {
    const typeProperties = activity?.typeProperties;
    if (!typeProperties) return null;

    // WebActivity and other activities with linkedServices array
    if (typeProperties.linkedServices && Array.isArray(typeProperties.linkedServices)) {
      const first = typeProperties.linkedServices[0];
      if (first?.referenceName) return { name: first.referenceName, type: first.type || 'LinkedServiceReference' };
    }

    // Direct linkedServiceName in typeProperties
    if (typeProperties.linkedServiceName?.referenceName) {
      return { name: typeProperties.linkedServiceName.referenceName, type: typeProperties.linkedServiceName.type || 'LinkedServiceReference' };
    }

    // Source linkedServiceName
    if (typeProperties.source?.linkedServiceName?.referenceName) {
      return { name: typeProperties.source.linkedServiceName.referenceName, type: typeProperties.source.linkedServiceName.type || 'LinkedServiceReference' };
    }

    // Sink linkedServiceName
    if (typeProperties.sink?.linkedServiceName?.referenceName) {
      return { name: typeProperties.sink.linkedServiceName.referenceName, type: typeProperties.sink.linkedServiceName.type || 'LinkedServiceReference' };
    }

    // Staging settings linkedServiceName (Copy activity)
    if (typeProperties.stagingSettings?.linkedServiceName?.referenceName) {
      return { name: typeProperties.stagingSettings.linkedServiceName.referenceName, type: typeProperties.stagingSettings.linkedServiceName.type || 'LinkedServiceReference' };
    }

    return null;
  }

  /**
   * Converts activity references to PipelineActivityMapping format for UI display
   */
  static convertToPipelineActivityMappings(pipelineName: string, references: ActivityLinkedServiceReference[]): PipelineActivityMapping[] {
    return references.map(ref => ({
      activityName: ref.activityName,
      activityType: ref.activityType,
      linkedServiceReference: ref.linkedServiceName ? { name: ref.linkedServiceName, type: ref.linkedServiceType || 'LinkedServiceReference' } : undefined,
      datasetReference: ref.datasetName ? { name: ref.datasetName, linkedServiceName: ref.datasetLinkedServiceName, linkedServiceType: ref.datasetLinkedServiceType } : undefined,
      status: 'pending'
    }));
  }

  /**
   * Resolves dataset LinkedService references by looking up actual dataset definitions
   * In a complete implementation, this would cross-reference with the datasets in adfComponents
   */
  static resolveDatasetLinkedServiceReferences(references: ActivityLinkedServiceReference[], adfComponents: ADFComponent[]): ActivityLinkedServiceReference[] {
    const datasets = adfComponents.filter(c => c.type === 'dataset');

    return references.map(ref => {
      if (ref.referenceLocation === 'dataset' && ref.datasetName) {
        const dataset = datasets.find(d => d.name === ref.datasetName);
        if (dataset?.definition?.properties?.linkedServiceName?.referenceName) {
          return {
            ...ref,
            datasetLinkedServiceName: dataset.definition.properties.linkedServiceName.referenceName,
            datasetLinkedServiceType: dataset.definition.properties.linkedServiceName.type || 'LinkedServiceReference'
          };
        }
      }
      return ref;
    });
  }

  /**
   * Gets a summary of all unique LinkedService references across all pipelines
   */
  static getUniqueLinkedServiceReferences(allReferences: ActivityLinkedServiceReference[]): string[] {
    const unique = new Set<string>();
    allReferences.forEach(ref => {
      if (ref.linkedServiceName) unique.add(ref.linkedServiceName);
      if (ref.datasetLinkedServiceName) unique.add(ref.datasetLinkedServiceName);
    });
    return Array.from(unique);
  }

  /**
   * Extracts all dataset parameters from pipeline activities and merges them with pipeline parameters
   * This ensures that dataset parameters are available at the pipeline level in Fabric
   */
  static extractAndMergeDatasetParameters(
    pipelineComponent: ADFComponent, 
    allDatasets?: ADFComponent[]
  ): { mergedParameters: Record<string, any>; datasetParameterMappings: Record<string, string[]> } {
    const pipelineParameters = pipelineComponent.definition?.properties?.parameters || {};
    const mergedParameters = { ...pipelineParameters };
    const datasetParameterMappings: Record<string, string[]> = {};

    if (pipelineComponent.type !== 'pipeline' || !pipelineComponent.definition?.properties?.activities) {
      return { mergedParameters, datasetParameterMappings };
    }

    const activities = pipelineComponent.definition.properties.activities;

    for (const activity of activities) {
      if (!activity?.name || !activity.type) continue;

      // Find all dataset references in this activity
      const datasetRefs = this.findAllDatasetReferences(activity);
      
      for (const datasetRef of datasetRefs) {
        if (!datasetRef.referenceName || !allDatasets) continue;

        // Find the dataset definition
        const datasetComponent = allDatasets.find(d => d.type === 'dataset' && d.name === datasetRef.referenceName);
        if (!datasetComponent?.definition?.properties?.parameters) continue;

        const datasetParameters = datasetComponent.definition.properties.parameters;
        const datasetName = datasetRef.referenceName;

        // Track which parameters came from which dataset
        if (!datasetParameterMappings[datasetName]) {
          datasetParameterMappings[datasetName] = [];
        }

        // Merge dataset parameters into pipeline parameters
        for (const [paramName, paramDef] of Object.entries(datasetParameters)) {
          const fabricParamName = `${datasetName}_${paramName}`;
          
          // Only add if not already present
          if (!mergedParameters[fabricParamName]) {
            mergedParameters[fabricParamName] = paramDef;
            datasetParameterMappings[datasetName].push(fabricParamName);
            
            console.log(`Added dataset parameter ${paramName} from dataset ${datasetName} as pipeline parameter ${fabricParamName}`);
          }
        }

        // Also merge any parameters used in the dataset reference itself
        if (datasetRef.parameters) {
          for (const [paramName, paramValue] of Object.entries(datasetRef.parameters)) {
            const fabricParamName = `${datasetName}_param_${paramName}`;
            
            if (!mergedParameters[fabricParamName]) {
              // Create a parameter definition based on the value type
              const paramType = this.inferParameterType(paramValue);
              mergedParameters[fabricParamName] = {
                type: paramType,
                defaultValue: paramValue
              };
              datasetParameterMappings[datasetName].push(fabricParamName);
              
              console.log(`Added dataset reference parameter ${paramName} from ${datasetName} as pipeline parameter ${fabricParamName}`);
            }
          }
        }
      }
    }

    return { mergedParameters, datasetParameterMappings };
  }

  /**
   * Finds all dataset references within an activity structure
   */
  private static findAllDatasetReferences(activity: any): Array<{ referenceName: string; parameters?: Record<string, any> }> {
    const references: Array<{ referenceName: string; parameters?: Record<string, any> }> = [];
    
    // Helper function to extract from a single reference
    const extractRef = (ref: any) => {
      if (ref?.type === 'DatasetReference' && ref.referenceName) {
        references.push({
          referenceName: ref.referenceName,
          parameters: ref.parameters || {}
        });
      }
    };

    // Check all known locations for dataset references
    if (activity.typeProperties) {
      // Source/sink datasets (Copy activity)
      if (activity.typeProperties.source?.dataset) {
        extractRef(activity.typeProperties.source.dataset);
      }
      if (activity.typeProperties.sink?.dataset) {
        extractRef(activity.typeProperties.sink.dataset);
      }
      
      // Direct dataset reference
      if (activity.typeProperties.dataset) {
        extractRef(activity.typeProperties.dataset);
      }

      // Recursively search for DatasetReference objects
      this.searchForDatasetReferences(activity.typeProperties, extractRef);
    }

    // Check inputs/outputs arrays
    if (Array.isArray(activity.inputs)) {
      activity.inputs.forEach(extractRef);
    }
    if (Array.isArray(activity.outputs)) {
      activity.outputs.forEach(extractRef);
    }

    return references;
  }

  /**
   * Recursively searches for DatasetReference objects in nested structures
   */
  private static searchForDatasetReferences(obj: any, extractRef: (ref: any) => void): void {
    if (!obj || typeof obj !== 'object') return;

    if (obj.type === 'DatasetReference') {
      extractRef(obj);
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => this.searchForDatasetReferences(item, extractRef));
    } else {
      Object.values(obj).forEach(value => this.searchForDatasetReferences(value, extractRef));
    }
  }

  /**
   * Infers parameter type from a value
   */
  private static inferParameterType(value: any): string {
    if (typeof value === 'string') return 'String';
    if (typeof value === 'number') return 'Int';
    if (typeof value === 'boolean') return 'Bool';
    if (Array.isArray(value)) return 'Array';
    if (value && typeof value === 'object') return 'Object';
    return 'String'; // Default fallback
  }

  /**
   * Gets activity count by LinkedService reference
   */
  static getActivityCountByLinkedService(allReferences: ActivityLinkedServiceReference[]): Record<string, number> {
    const counts: Record<string, number> = {};
    allReferences.forEach(ref => {
      const name = ref.linkedServiceName || ref.datasetLinkedServiceName;
      if (!name) return;
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }

  /**
   * Gets all required LinkedService mappings across all pipeline components
   * Used for validation to ensure all mappings are complete
   */
  static getAllRequiredLinkedServiceMappings(
    selectedComponents?: ADFComponent[], 
    allComponents?: ADFComponent[]
  ): Array<{ pipelineName: string; activityName: string; linkedServiceName: string; activityUniqueId: string }> {
    if (!selectedComponents) return [];
    
    const required: Array<{ pipelineName: string; activityName: string; linkedServiceName: string; activityUniqueId: string }> = [];
    
    selectedComponents.forEach(component => {
      if (component?.type === 'pipeline') {
        const activityReferences = this.analyzePipelineActivities(component, allComponents);
        activityReferences.forEach((ref, refIndex) => {
          const linkedServiceName = ref.linkedServiceName || ref.datasetLinkedServiceName;
          if (linkedServiceName) {
            const activityUniqueId = `${ref.activityName}_${linkedServiceName}_${refIndex}`;
            required.push({
              pipelineName: component.name,
              activityName: ref.activityName,
              linkedServiceName,
              activityUniqueId
            });
          }
        });
      }
    });
    
    return required;
  }
}



