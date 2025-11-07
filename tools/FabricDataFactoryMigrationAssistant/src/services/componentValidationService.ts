import { ADFComponent } from '../types';
import { toFabricTypeName } from './supportedConnectionTypesService';

/**
 * Service for validating ADF components against Fabric capabilities
 */
export class ComponentValidationService {
  
  /**
   * Validate a linked service component against Fabric capabilities
   */
  async validateLinkedService(component: ADFComponent): Promise<{
    compatibilityStatus: ADFComponent['compatibilityStatus'];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    if (component.type !== 'linkedService') {
      return { compatibilityStatus: 'supported', warnings };
    }

    const adfType = component.definition?.properties?.type;
    if (!adfType) {
      warnings.push('Linked service type not specified');
      return { compatibilityStatus: 'unsupported', warnings };
    }

    try {
      // All linked services are now supported - let deployment handle specifics
      console.log(`Validating linked service ${component.name} of type ${adfType}`);

      // Additional validation based on properties
      const typeProperties = component.definition?.properties?.typeProperties;
      if (typeProperties) {
        const propertyWarnings = this.validateLinkedServiceProperties(adfType, typeProperties);
        warnings.push(...propertyWarnings);
      }

      return { 
        compatibilityStatus: warnings.length > 0 ? 'partiallySupported' : 'supported', 
        warnings 
      };
    } catch (error) {
      console.warn('Error validating linked service:', error);
      warnings.push('Failed to validate connector compatibility - proceeding with caution');
      return { compatibilityStatus: 'partiallySupported', warnings };
    }
  }

  /**
   * Validate integration runtime component
   */
  async validateIntegrationRuntime(component: ADFComponent): Promise<{
    compatibilityStatus: ADFComponent['compatibilityStatus'];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    if (component.type !== 'integrationRuntime') {
      return { compatibilityStatus: 'supported', warnings };
    }

    const irType = component.definition?.properties?.type;
    
    switch (irType) {
      case 'Managed':
        warnings.push('Managed Integration Runtime will be converted to Virtual Network Gateway in Fabric');
        return { compatibilityStatus: 'partiallySupported', warnings };
        
      case 'SelfHosted':
        warnings.push('Self-Hosted Integration Runtime will be converted to On-Premises Gateway in Fabric');
        return { compatibilityStatus: 'partiallySupported', warnings };
        
      default:
        warnings.push(`Unknown Integration Runtime type: ${irType}`);
        return { compatibilityStatus: 'unsupported', warnings };
    }
  }

  /**
   * Validate pipeline component
   */
  async validatePipeline(component: ADFComponent): Promise<{
    compatibilityStatus: ADFComponent['compatibilityStatus'];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    if (component.type !== 'pipeline') {
      return { compatibilityStatus: 'supported', warnings };
    }

    const activities = component.definition?.properties?.activities || [];
    const unsupportedActivities = this.getUnsupportedActivities(activities);
    
    if (unsupportedActivities.length > 0) {
      warnings.push(`Contains ${unsupportedActivities.length} unsupported activity type(s): ${unsupportedActivities.slice(0, 3).join(', ')}${unsupportedActivities.length > 3 ? '...' : ''}`);
      return { compatibilityStatus: 'partiallySupported', warnings };
    }

    const deprecatedActivities = this.getDeprecatedActivities(activities);
    if (deprecatedActivities.length > 0) {
      warnings.push(`Contains ${deprecatedActivities.length} deprecated activity type(s) that may need manual updates`);
      return { compatibilityStatus: 'partiallySupported', warnings };
    }

    return { compatibilityStatus: 'supported', warnings };
  }

  /**
   * Validate mapping data flow component
   */
  async validateMappingDataFlow(component: ADFComponent): Promise<{
    compatibilityStatus: ADFComponent['compatibilityStatus'];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    if (component.type !== 'mappingDataFlow') {
      return { compatibilityStatus: 'supported', warnings };
    }

    warnings.push('Mapping Data Flows are not supported in Fabric Data Factory. Consider using Dataflow Gen2 instead.');
    return { compatibilityStatus: 'unsupported', warnings };
  }

  /**
   * Validate trigger component
   */
  async validateTrigger(component: ADFComponent): Promise<{
    compatibilityStatus: ADFComponent['compatibilityStatus'];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    if (component.type !== 'trigger') {
      return { compatibilityStatus: 'supported', warnings };
    }

    const triggerType = component.definition?.properties?.type;
    
    switch (triggerType) {
      case 'ScheduleTrigger':
        return { compatibilityStatus: 'supported', warnings };
        
      case 'TumblingWindowTrigger':
        warnings.push('Tumbling Window Triggers may need manual configuration in Fabric');
        return { compatibilityStatus: 'partiallySupported', warnings };
        
      case 'BlobEventsTrigger':
      case 'CustomEventsTrigger':
      case 'MultiplePipelineTrigger':
        warnings.push(`${triggerType} is not directly supported in Fabric and will need manual recreation`);
        return { compatibilityStatus: 'unsupported', warnings };
        
      default:
        warnings.push(`Unknown trigger type: ${triggerType}`);
        return { compatibilityStatus: 'unsupported', warnings };
    }
  }

  /**
   * Validate global parameter component
   */
  async validateGlobalParameter(component: ADFComponent): Promise<{
    compatibilityStatus: ADFComponent['compatibilityStatus'];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    if (component.type !== 'globalParameter') {
      return { compatibilityStatus: 'supported', warnings };
    }

    // Global parameters are supported but become workspace variables
    warnings.push('Global Parameters will be converted to Workspace Variables in Fabric');
    return { compatibilityStatus: 'partiallySupported', warnings };
  }

  /**
   * Main validation function that routes to specific validators
   */
  async validateComponent(component: ADFComponent): Promise<{
    compatibilityStatus: ADFComponent['compatibilityStatus'];
    warnings: string[];
  }> {
    switch (component.type) {
      case 'linkedService':
        return this.validateLinkedService(component);
      case 'integrationRuntime':
        return this.validateIntegrationRuntime(component);
      case 'pipeline':
        return this.validatePipeline(component);
      case 'mappingDataFlow':
        return this.validateMappingDataFlow(component);
      case 'trigger':
        return this.validateTrigger(component);
      case 'globalParameter':
        return this.validateGlobalParameter(component);
      case 'dataset':
        // Datasets are embedded in pipeline activities in Fabric
        return { 
          compatibilityStatus: 'partiallySupported', 
          warnings: ['Datasets are embedded within pipeline activities in Fabric'] 
        };
      case 'customActivity':
        return { 
          compatibilityStatus: 'partiallySupported', 
          warnings: ['Custom Activities may need to be replaced with Notebook or external compute in Fabric'] 
        };
      default:
        return { 
          compatibilityStatus: 'unsupported', 
          warnings: [`Unknown component type: ${component.type}`] 
        };
    }
  }

  /**
   * Validate linked service properties for additional warnings
   */
  private validateLinkedServiceProperties(adfType: string, typeProperties: any): string[] {
    const warnings: string[] = [];

    // Check for authentication types that might need updates
    if (typeProperties.authenticationType) {
      const authType = typeProperties.authenticationType;
      if (authType === 'MSI' || authType === 'ServicePrincipal') {
        warnings.push('Authentication type may need to be updated for Fabric compatibility');
      }
    }

    // Check for specific property patterns that need attention
    if (typeProperties.connectionString && typeof typeProperties.connectionString === 'object') {
      warnings.push('Connection string parameters may need manual configuration');
    }

    return warnings;
  }

  /**
   * Get list of unsupported activity types
   */
  private getUnsupportedActivities(activities: any[]): string[] {
    const unsupportedTypes = [
      'ExecutePipeline', // May be limited in Fabric
      'AzureMLBatchExecution',
      'AzureMLUpdateResource',
      'DatabricksNotebook',
      'DatabricksSparkJar',
      'DatabricksSparkPython',
      'DataLakeAnalyticsU-SQL',
      'HDInsightHive',
      'HDInsightPig',
      'HDInsightMapReduce',
      'HDInsightSpark',
      'HDInsightStreaming'
    ];

    return activities
      .map((activity: any) => activity.type)
      .filter((type: string) => unsupportedTypes.includes(type))
      .filter((type: string, index: number, arr: string[]) => arr.indexOf(type) === index); // Remove duplicates
  }

  /**
   * Get list of deprecated activity types
   */
  private getDeprecatedActivities(activities: any[]): string[] {
    const deprecatedTypes = [
      'SqlServerStoredProcedure', // May need updates
      'AzureFunction' // May need reconfiguration
    ];

    return activities
      .map((activity: any) => activity.type)
      .filter((type: string) => deprecatedTypes.includes(type))
      .filter((type: string, index: number, arr: string[]) => arr.indexOf(type) === index); // Remove duplicates
  }

  /**
   * Validate all components in a list
   */
  async validateAllComponents(components: ADFComponent[]): Promise<ADFComponent[]> {
    const validatedComponents: ADFComponent[] = [];

    for (const component of components) {
      try {
        const validation = await this.validateComponent(component);
        validatedComponents.push({
          ...component,
          compatibilityStatus: validation.compatibilityStatus,
          warnings: validation.warnings
        });
      } catch (error) {
        console.warn(`Failed to validate component ${component.name}:`, error);
        validatedComponents.push({
          ...component,
          compatibilityStatus: 'unsupported',
          warnings: ['Failed to validate component']
        });
      }
    }

    return validatedComponents;
  }
}

// Export singleton instance
export const componentValidationService = new ComponentValidationService();