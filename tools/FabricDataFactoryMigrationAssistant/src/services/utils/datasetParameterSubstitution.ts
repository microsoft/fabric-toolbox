/**
 * Shared utility for dataset parameter substitution
 * Recursively replaces @dataset() references with actual parameter values
 * Used by Copy, Lookup, GetMetadata, and other Category A transformers
 */

export class DatasetParameterSubstitution {
  /**
   * Applies parameter values to dataset typeProperties
   * Recursively replaces ALL @dataset() references throughout the structure
   * 
   * @param typeProperties Original dataset typeProperties (will be cloned)
   * @param parameters Parameter values from activity (e.g., {p_Directory: "test"})
   * @returns Deep clone with all @dataset() references replaced
   * 
   * @example
   * // Input typeProperties:
   * {
   *   location: {
   *     fileName: { value: "@dataset().p_FileName", type: "Expression" }
   *   }
   * }
   * // Input parameters: { p_FileName: "data.csv" }
   * // Output: { location: { fileName: "data.csv" } }
   */
  static applyParametersToTypeProperties(
    typeProperties: any,
    parameters: any
  ): any {
    if (!parameters || Object.keys(parameters).length === 0) {
      return typeProperties;
    }

    // Clone to avoid mutation
    const result = JSON.parse(JSON.stringify(typeProperties));

    // Recursively replace ALL @dataset() references
    this.substituteParameterValues(result, parameters);

    return result;
  }

  /**
   * Recursively walks object tree substituting parameter values
   * Handles:
   * - Plain strings: "@dataset().p_Name" → "value"
   * - Expression objects: { value: "@dataset().p_Name", type: "Expression" } → "value"
   * - Nested objects/arrays
   * 
   * @param obj Object to process (mutated in place)
   * @param parameters Parameter values
   */
  private static substituteParameterValues(obj: any, parameters: any): void {
    if (!obj || typeof obj !== 'object') return;

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        if (typeof item === 'string') {
          const replaced = this.replaceParameterReferences(item, parameters);
          if (replaced !== item) {
            console.log(`[DatasetParameterSubstitution] Replaced in array[${index}]: "${item}" → "${replaced}"`);
          }
          obj[index] = replaced;
        } else if (typeof item === 'object' && item !== null) {
          this.substituteParameterValues(item, parameters);
        }
      });
      return;
    }

    // Handle objects
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Replace parameter references in plain strings
        const replacedValue = this.replaceParameterReferences(value, parameters);
        if (replacedValue !== value) {
          console.log(`[DatasetParameterSubstitution] Replaced in ${key}: "${value}" → "${replacedValue}"`);
        }
        obj[key] = replacedValue;
      } else if (typeof value === 'object' && value !== null) {
        // Handle Expression objects { value: string, type: 'Expression' }
        if ((value as any).type === 'Expression' && typeof (value as any).value === 'string') {
          const originalValue = (value as any).value;
          const replacedValue = this.replaceParameterReferences(originalValue, parameters);
          
          if (replacedValue !== originalValue) {
            console.log(`[DatasetParameterSubstitution] Replaced in Expression ${key}: "${originalValue}" → "${replacedValue}"`);
            
            // If we successfully replaced all @dataset references, convert to simple string
            if (!replacedValue.includes('@dataset') && !replacedValue.includes('@{')) {
              obj[key] = replacedValue;
            } else {
              (value as any).value = replacedValue;
            }
          } else {
            (value as any).value = replacedValue;
          }
        } else {
          // Recurse into nested objects/arrays
          this.substituteParameterValues(value, parameters);
        }
      }
    }
  }

  /**
   * Replaces @dataset() references in a string with actual parameter values
   * Supports both @{dataset().paramName} and @dataset().paramName formats
   * Extracts .value from Expression objects before substitution
   * 
   * @param value String potentially containing @dataset() references
   * @param parameters Parameter values
   * @returns String with @dataset() references replaced
   * 
   * @example
   * replaceParameterReferences("@{dataset().p_Dir}/file.csv", {p_Dir: "raw"})
   * // Returns: "raw/file.csv"
   */
  private static replaceParameterReferences(value: string, parameters: any): string {
    if (!value || typeof value !== 'string') {
      return value;
    }

    let result = value;

    // Handle @{dataset().parameterName} format
    result = result.replace(/@\{dataset\(\)\.(\w+)\}/g, (match, paramName) => {
      if (parameters && parameters.hasOwnProperty(paramName)) {
        let paramValue = parameters[paramName];
        
        // Handle null/undefined
        if (paramValue === null || paramValue === undefined) {
          console.warn(`[DatasetParameterSubstitution] Parameter ${paramName} is null/undefined, keeping @dataset() reference`);
          return match;
        }
        
        // Extract .value from Expression objects
        if (typeof paramValue === 'object' && paramValue !== null && 
            'value' in paramValue && (paramValue as any).type === 'Expression') {
          paramValue = (paramValue as any).value;
        }
        
        console.log(`[DatasetParameterSubstitution] Replacing @{dataset().${paramName}} with: ${paramValue}`);
        return String(paramValue);
      }
      return match; // Keep original if parameter not found
    });

    // Handle @dataset().parameterName format (without curly braces)
    result = result.replace(/@dataset\(\)\.(\w+)/g, (match, paramName) => {
      if (parameters && parameters.hasOwnProperty(paramName)) {
        let paramValue = parameters[paramName];
        
        // Handle null/undefined
        if (paramValue === null || paramValue === undefined) {
          console.warn(`[DatasetParameterSubstitution] Parameter ${paramName} is null/undefined, keeping @dataset() reference`);
          return match;
        }
        
        // Extract .value from Expression objects
        if (typeof paramValue === 'object' && paramValue !== null && 
            'value' in paramValue && (paramValue as any).type === 'Expression') {
          paramValue = (paramValue as any).value;
        }
        
        console.log(`[DatasetParameterSubstitution] Replacing @dataset().${paramName} with: ${paramValue}`);
        return String(paramValue);
      }
      return match; // Keep original if parameter not found
    });

    return result;
  }
}
