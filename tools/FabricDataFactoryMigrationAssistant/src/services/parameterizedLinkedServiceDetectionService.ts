/**
 * Parameterized LinkedService Detection Service
 * 
 * Detects LinkedServices with parameters (not supported in Fabric connections).
 * Tracks usage across Datasets → Activities → Pipelines.
 */

import { ADFComponent, ParameterizedLinkedServiceInfo, LinkedServiceParameter } from '../types';

class ParameterizedLinkedServiceDetectionService {
  /**
   * Detect all LinkedServices with parameters from parsed components
   * @param components Parsed ADF components
   * @returns Array of parameterized LinkedService info
   */
  detectParameterizedLinkedServices(components: ADFComponent[]): ParameterizedLinkedServiceInfo[] {
    const results: ParameterizedLinkedServiceInfo[] = [];
    
    // Step 1: Find LinkedServices with explicit "parameters" object
    const linkedServices = components.filter(c => c.type === 'linkedService');
    const datasets = components.filter(c => c.type === 'dataset');
    const pipelines = components.filter(c => c.type === 'pipeline');
    
    for (const linkedService of linkedServices) {
      const lsProperties = linkedService.definition?.properties;
      
      // Check for explicit "parameters" object in LinkedService definition
      if (lsProperties?.parameters && typeof lsProperties.parameters === 'object') {
        const parameterKeys = Object.keys(lsProperties.parameters);
        
        if (parameterKeys.length > 0) {
          // Found parameterized LinkedService - extract parameters
          const parameters: LinkedServiceParameter[] = parameterKeys.map(paramName => {
            const paramDef = lsProperties.parameters[paramName];
            return {
              name: paramName,
              type: paramDef?.type || 'string',
              hasDefaultValue: paramDef?.defaultValue !== undefined
            };
          });
          
          // Step 2: Find datasets that use this LinkedService
          const affectedDatasets = datasets.filter(dataset => {
            const dsLinkedService = dataset.definition?.properties?.linkedServiceName;
            return dsLinkedService?.referenceName === linkedService.name;
          }).map(ds => ds.name);
          
          // Step 3: Find activities that use those datasets
          const affectedActivities: Array<{
            pipelineName: string;
            activityName: string;
            activityType: string;
          }> = [];
          
          const affectedPipelineNames = new Set<string>();
          
          for (const pipeline of pipelines) {
            const activities = pipeline.definition?.properties?.activities || [];
            
            for (const activity of activities) {
              // Check if activity references any affected dataset
              const usesDataset = this.activityUsesDataset(activity, affectedDatasets);
              
              if (usesDataset) {
                affectedActivities.push({
                  pipelineName: pipeline.name,
                  activityName: activity.name,
                  activityType: activity.type
                });
                affectedPipelineNames.add(pipeline.name);
              }
            }
          }
          
          // Build result
          const info: ParameterizedLinkedServiceInfo = {
            linkedServiceName: linkedService.name,
            linkedServiceType: lsProperties.type || 'Unknown',
            parameters,
            usedByDatasets: affectedDatasets,
            usedByActivities: affectedActivities,
            affectedPipelines: Array.from(affectedPipelineNames),
            totalUsageCount: affectedActivities.length,
            warningMessage: this.generateWarningMessage(
              linkedService.name,
              parameters.length,
              affectedPipelineNames.size
            )
          };
          
          results.push(info);
          
          console.log(`[ParameterizedLS] Detected: ${linkedService.name} with ${parameters.length} parameter(s), affects ${affectedPipelineNames.size} pipeline(s)`);
        }
      }
    }
    
    return results;
  }
  
  /**
   * Check if activity uses any of the specified datasets
   */
  private activityUsesDataset(activity: any, datasetNames: string[]): boolean {
    // Check inputs array
    const inputs = activity.inputs || [];
    for (const input of inputs) {
      if (input.referenceName && datasetNames.includes(input.referenceName)) {
        return true;
      }
    }
    
    // Check outputs array
    const outputs = activity.outputs || [];
    for (const output of outputs) {
      if (output.referenceName && datasetNames.includes(output.referenceName)) {
        return true;
      }
    }
    
    // Check typeProperties.dataset (for Lookup, GetMetadata, Delete activities)
    const datasetRef = activity.typeProperties?.dataset?.referenceName;
    if (datasetRef && datasetNames.includes(datasetRef)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Generate user-friendly warning message
   */
  private generateWarningMessage(
    linkedServiceName: string,
    parameterCount: number,
    affectedPipelineCount: number
  ): string {
    return `LinkedService "${linkedServiceName}" has ${parameterCount} parameter(s). Fabric connections do not support parameters. Affects ${affectedPipelineCount} pipeline(s).`;
  }
  
  /**
   * Check if a specific LinkedService has parameters
   */
  hasParameters(linkedServiceComponent: ADFComponent): boolean {
    if (linkedServiceComponent.type !== 'linkedService') {
      return false;
    }
    
    const parameters = linkedServiceComponent.definition?.properties?.parameters;
    return parameters && typeof parameters === 'object' && Object.keys(parameters).length > 0;
  }
}

// Singleton instance
export const parameterizedLinkedServiceDetectionService = new ParameterizedLinkedServiceDetectionService();
