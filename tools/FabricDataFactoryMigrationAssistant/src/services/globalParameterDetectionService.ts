/**
 * Global Parameter Detection Service
 * 
 * Scans ADF components (pipelines) to detect global parameter references and extract metadata.
 * Supports both expression-based detection and ARM template fallback.
 */

import type { ADFComponent, GlobalParameterReference } from '../types';

class GlobalParameterDetectionService {
  // Regex patterns for detecting @pipeline().globalParameters.X
  private readonly primaryPattern = /@pipeline\(\)\.globalParameters\.(\w+)/g;
  private readonly alternativePattern = /@\{pipeline\(\)\.globalParameters\.(\w+)\}/g;
  private readonly nestedPattern = /pipeline\(\)\.globalParameters\.(\w+)/g; // Catches function-wrapped references

  /**
   * Primary detection method: Scans all pipelines for global parameter references
   * @param components All ADF components from uploaded ARM template
   * @returns Array of detected global parameter references with metadata
   */
  detectGlobalParameters(components: ADFComponent[]): GlobalParameterReference[] {
    console.log('[GlobalParameterDetection] Starting detection...');
    
    const pipelines = components.filter(c => c.type === 'pipeline');
    console.log(`[GlobalParameterDetection] Found ${pipelines.length} pipelines to scan`);

    const referencesMap = new Map<string, GlobalParameterReference>();

    pipelines.forEach(pipeline => {
      const pipelineRefs = this.scanPipelineForReferences(pipeline);
      
      pipelineRefs.forEach(paramName => {
        if (!referencesMap.has(paramName)) {
          // Create new reference stub
          referencesMap.set(paramName, this.createReferenceStub(paramName));
        }
        
        // Add pipeline to referencedByPipelines array
        const ref = referencesMap.get(paramName)!;
        if (!ref.referencedByPipelines.includes(pipeline.name)) {
          ref.referencedByPipelines.push(pipeline.name);
        }
      });
    });

    const detectedReferences = Array.from(referencesMap.values());
    console.log(`[GlobalParameterDetection] Detected ${detectedReferences.length} unique global parameters`);
    
    return detectedReferences;
  }

  /**
   * Scans a single pipeline's content for global parameter references
   * @param pipeline The pipeline component to scan
   * @returns Array of unique parameter names found in this pipeline
   */
  private scanPipelineForReferences(pipeline: ADFComponent): string[] {
    const paramNames = new Set<string>();
    
    // Convert pipeline definition to JSON string for regex scanning
    const pipelineJson = JSON.stringify(pipeline.definition);
    
    // Scan with primary pattern: @pipeline().globalParameters.X
    let match;
    this.primaryPattern.lastIndex = 0; // Reset regex state
    while ((match = this.primaryPattern.exec(pipelineJson)) !== null) {
      paramNames.add(match[1]);
    }

    // Scan with alternative pattern: @{pipeline().globalParameters.X}
    this.alternativePattern.lastIndex = 0; // Reset regex state
    while ((match = this.alternativePattern.exec(pipelineJson)) !== null) {
      paramNames.add(match[1]);
    }

    // Scan with nested pattern: pipeline().globalParameters.X (catches function-wrapped references)
    this.nestedPattern.lastIndex = 0; // Reset regex state
    while ((match = this.nestedPattern.exec(pipelineJson)) !== null) {
      paramNames.add(match[1]);
    }

    if (paramNames.size > 0) {
      console.log(`[GlobalParameterDetection] Pipeline "${pipeline.name}" references: ${Array.from(paramNames).join(', ')}`);
    }

    return Array.from(paramNames);
  }

  /**
   * Creates a default GlobalParameterReference stub with unknown metadata
   * Users will configure actual values in the UI
   * @param name The parameter name
   * @returns Default reference object
   */
  private createReferenceStub(name: string): GlobalParameterReference {
    return {
      name,
      adfDataType: 'String', // Default to String, user can change
      fabricDataType: 'String',
      defaultValue: '', // User must provide
      note: 'Detected from pipeline expressions. Please configure type and value.',
      referencedByPipelines: [],
      isSecure: false,
    };
  }

  /**
   * Fallback detection: Extract global parameters from ARM template globalParameters section
   * This is used when no expression-based references are found, or as supplemental detection
   * @param armTemplate The full ARM template object
   * @returns Array of global parameter references from template definition
   */
  detectFromARMTemplate(armTemplate: any): GlobalParameterReference[] {
    console.log('[GlobalParameterDetection] Attempting ARM template fallback detection...');
    
    const references: GlobalParameterReference[] = [];

    try {
      // Navigate to factories resource in ARM template
      const factories = armTemplate?.resources?.filter(
        (r: any) => r.type === 'Microsoft.DataFactory/factories'
      ) || [];

      factories.forEach((factory: any) => {
        const globalParams = factory?.properties?.globalParameters;
        
        if (globalParams && typeof globalParams === 'object') {
          Object.entries(globalParams).forEach(([paramName, paramDef]: [string, any]) => {
            const adfType = paramDef?.type || 'String';
            
            references.push({
              name: paramName,
              adfDataType: adfType,
              fabricDataType: this.mapADFTypeToFabric(adfType),
              defaultValue: paramDef?.value ?? '',
              note: 'Detected from ARM template globalParameters definition',
              referencedByPipelines: [], // Will be populated by expression scan
              isSecure: adfType === 'SecureString',
            });
          });
        }
      });

      console.log(`[GlobalParameterDetection] ARM fallback detected ${references.length} parameters`);
    } catch (error) {
      console.error('[GlobalParameterDetection] Error parsing ARM template:', error);
    }

    return references;
  }

  /**
   * Maps ADF data types to Fabric Variable Library types
   * @param adfType The ADF type (String, Int, Float, Bool, Array, Object, SecureString)
   * @returns Corresponding Fabric type (String, Integer, Number, Boolean)
   */
  private mapADFTypeToFabric(
    adfType: string
  ): 'String' | 'Integer' | 'Number' | 'Boolean' {
    switch (adfType) {
      case 'Int':
        return 'Integer';
      case 'Float':
        return 'Number';
      case 'Bool':
        return 'Boolean';
      case 'String':
      case 'SecureString':
      case 'Array':
      case 'Object':
      default:
        return 'String';
    }
  }

  /**
   * Combined detection strategy: Use both expression scanning and ARM template
   * Merges results, preferring ARM template metadata when available
   * @param components Pipeline components
   * @param armTemplate Full ARM template
   * @returns Comprehensive list of global parameters
   */
  detectWithFallback(
    components: ADFComponent[],
    armTemplate: any
  ): GlobalParameterReference[] {
    // Step 1: Expression-based detection (primary)
    const expressionRefs = this.detectGlobalParameters(components);
    
    // Step 2: ARM template detection (fallback/supplemental)
    const armRefs = this.detectFromARMTemplate(armTemplate);

    // Step 3: Merge results
    const mergedMap = new Map<string, GlobalParameterReference>();

    // Add ARM template refs first (they have better metadata)
    armRefs.forEach(ref => {
      mergedMap.set(ref.name, ref);
    });

    // Merge expression refs, preserving referencedByPipelines
    expressionRefs.forEach(ref => {
      if (mergedMap.has(ref.name)) {
        // Update pipeline references in ARM-detected param
        const existing = mergedMap.get(ref.name)!;
        existing.referencedByPipelines = ref.referencedByPipelines;
      } else {
        // Add expression-only detected param
        mergedMap.set(ref.name, ref);
      }
    });

    const merged = Array.from(mergedMap.values());
    console.log(`[GlobalParameterDetection] Final merged result: ${merged.length} parameters`);
    
    return merged;
  }

  /**
   * Utility: Extract factory name from ARM template for default library naming
   * @param armTemplate Full ARM template
   * @returns Factory name or 'DataFactory' as fallback
   */
  extractFactoryName(armTemplate: any): string {
    try {
      const factories = armTemplate?.resources?.filter(
        (r: any) => r.type === 'Microsoft.DataFactory/factories'
      ) || [];

      if (factories.length > 0) {
        // Extract name from "[parameters('factoryName')]" or direct string
        const factoryName = factories[0]?.name;
        
        if (typeof factoryName === 'string') {
          // Handle "[parameters('factoryName')]" pattern
          const match = factoryName.match(/parameters\('(.+?)'\)/);
          if (match) {
            // Get actual value from parameters section
            const paramName = match[1];
            const paramValue = armTemplate?.parameters?.[paramName]?.defaultValue;
            if (paramValue) {
              return paramValue;
            }
          }
          // Direct string name
          return factoryName;
        }
      }
    } catch (error) {
      console.error('[GlobalParameterDetection] Error extracting factory name:', error);
    }

    return 'DataFactory'; // Fallback
  }
}

// Export singleton instance
export const globalParameterDetectionService = new GlobalParameterDetectionService();
