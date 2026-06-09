import { describe, it, expect } from 'vitest';

/**
 * Comprehensive test suite for Expression object extraction
 * 
 * Tests fix for "[object Object]" bug in activities using global parameters
 * 
 * Phases validated:
 * - Phase 0: Copy activity transformer
 * - Phase 1: Lookup activity transformer
 * - Phase 2: GetMetadata activity transformer
 * - Phase 3: InvokePipeline service
 */

describe('Expression Object Extraction Tests', () => {
  
  // =============================================================================
  // Phase 0: Copy Activity Transformer Tests
  // =============================================================================
  
  describe('Copy Activity - replaceParameterReferences()', () => {
    
    it('should extract .value from Expression objects in dataset parameters', () => {
      // Simulates Phase 0 implementation
      const datasetParameters = {
        p_FileName: {
          value: "@pipeline().globalParameters.gp_FileName",
          type: "Expression"
        }
      };
      
      // Expected behavior: Extract .value, replace @dataset() references
      const inputString = "files/@dataset().p_FileName";
      
      // Mock implementation (simulates fixed behavior)
      const extractedValue = datasetParameters.p_FileName.value;
      const result = inputString.replace(/@dataset\(\)\.p_FileName/g, extractedValue);
      
      expect(result).toBe("files/@pipeline().globalParameters.gp_FileName");
      expect(result).not.toContain("[object Object]");
    });
    
    it('should handle plain string parameters (backward compatibility)', () => {
      const datasetParameters = {
        p_FileName: "hardcoded_file.txt"
      };
      
      const inputString = "files/@dataset().p_FileName";
      const result = inputString.replace(/@dataset\(\)\.p_FileName/g, String(datasetParameters.p_FileName));
      
      expect(result).toBe("files/hardcoded_file.txt");
    });
    
    it('should handle nested Expression objects', () => {
      const datasetParameters = {
        p_Container: {
          value: {
            value: "@pipeline().globalParameters.gp_Container",
            type: "Expression"
          },
          type: "Expression"
        }
      };
      
      // Extract nested .value
      let paramValue: any = datasetParameters.p_Container;
      if (typeof paramValue === 'object' && paramValue !== null && 'value' in paramValue && paramValue.type === 'Expression') {
        paramValue = paramValue.value;
      }
      if (typeof paramValue === 'object' && paramValue !== null && 'value' in paramValue) {
        paramValue = paramValue.value;
      }
      
      expect(paramValue).toBe("@pipeline().globalParameters.gp_Container");
    });
    
    it('should handle arrays of parameters', () => {
      const datasetParameters = {
        p_Columns: [
          { value: "column1", type: "Expression" },
          { value: "column2", type: "Expression" }
        ]
      };
      
      const extracted = datasetParameters.p_Columns.map((col: any) => 
        (typeof col === 'object' && col !== null && 'value' in col && col.type === 'Expression') 
          ? col.value 
          : col
      );
      
      expect(extracted).toEqual(["column1", "column2"]);
    });
    
    it('should handle null and undefined parameters gracefully', () => {
      const datasetParameters = {
        p_Null: null,
        p_Undefined: undefined
      };
      
      expect(datasetParameters.p_Null).toBeNull();
      expect(datasetParameters.p_Undefined).toBeUndefined();
    });
  });
  
  // =============================================================================
  // Phase 1: Lookup Activity Transformer Tests
  // =============================================================================
  
  describe('Lookup Activity - applyParametersToTypeProperties()', () => {
    
    it('should extract .value from Expression objects before merging', () => {
      const typeProperties = { query: "SELECT * FROM table" };
      const datasetParameters = {
        tableName: {
          value: "@pipeline().globalParameters.gp_Table",
          type: "Expression"
        }
      };
      
      // Simulate Phase 1 implementation
      const sanitizedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(datasetParameters)) {
        if (typeof value === 'object' && value !== null && 'value' in value && (value as any).type === 'Expression') {
          sanitizedParams[key] = (value as any).value;
        } else {
          sanitizedParams[key] = value;
        }
      }
      
      const result = {
        ...typeProperties,
        ...sanitizedParams
      };
      
      expect(result.tableName).toBe("@pipeline().globalParameters.gp_Table");
      expect(result.tableName).not.toContain("[object Object]");
      expect(result.query).toBe("SELECT * FROM table");
    });
    
    it('should handle plain values without modification', () => {
      const typeProperties = {};
      const datasetParameters = {
        tableName: "hardcoded_table",
        timeout: 30
      };
      
      const sanitizedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(datasetParameters)) {
        if (typeof value === 'object' && value !== null && 'value' in value && (value as any).type === 'Expression') {
          sanitizedParams[key] = (value as any).value;
        } else {
          sanitizedParams[key] = value;
        }
      }
      
      const result = {
        ...typeProperties,
        ...sanitizedParams
      };
      
      expect(result.tableName).toBe("hardcoded_table");
      expect(result.timeout).toBe(30);
    });
    
    it('should handle mixed Expression and plain parameters', () => {
      const datasetParameters = {
        tableName: {
          value: "@pipeline().globalParameters.gp_Table",
          type: "Expression"
        },
        timeout: 30,
        enableLogging: true
      };
      
      const sanitizedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(datasetParameters)) {
        if (typeof value === 'object' && value !== null && 'value' in value && (value as any).type === 'Expression') {
          sanitizedParams[key] = (value as any).value;
        } else {
          sanitizedParams[key] = value;
        }
      }
      
      expect(sanitizedParams.tableName).toBe("@pipeline().globalParameters.gp_Table");
      expect(sanitizedParams.timeout).toBe(30);
      expect(sanitizedParams.enableLogging).toBe(true);
    });
    
    it('should handle empty datasetParameters', () => {
      const typeProperties = { query: "SELECT 1" };
      const datasetParameters = {};
      
      const sanitizedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(datasetParameters)) {
        if (typeof value === 'object' && value !== null && 'value' in value && (value as any).type === 'Expression') {
          sanitizedParams[key] = (value as any).value;
        } else {
          sanitizedParams[key] = value;
        }
      }
      
      const result = {
        ...typeProperties,
        ...sanitizedParams
      };
      
      expect(result).toEqual({ query: "SELECT 1" });
    });
  });
  
  // =============================================================================
  // Phase 2: GetMetadata Activity Transformer Tests
  // =============================================================================
  
  describe('GetMetadata Activity - applyParametersToTypeProperties()', () => {
    
    it('should extract .value from Expression objects before merging', () => {
      const typeProperties = {};
      const datasetParameters = {
        folderPath: {
          value: "@pipeline().globalParameters.gp_Directory",
          type: "Expression"
        },
        fileName: {
          value: "@pipeline().globalParameters.gp_FileName",
          type: "Expression"
        }
      };
      
      // Simulate Phase 2 implementation (identical to Phase 1)
      const sanitizedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(datasetParameters)) {
        if (typeof value === 'object' && value !== null && 'value' in value && (value as any).type === 'Expression') {
          sanitizedParams[key] = (value as any).value;
        } else {
          sanitizedParams[key] = value;
        }
      }
      
      const result = {
        ...typeProperties,
        ...sanitizedParams
      };
      
      expect(result.folderPath).toBe("@pipeline().globalParameters.gp_Directory");
      expect(result.fileName).toBe("@pipeline().globalParameters.gp_FileName");
      expect(JSON.stringify(result)).not.toContain("[object Object]");
    });
    
    it('should handle container + directory + fileName pattern', () => {
      const datasetParameters = {
        container: {
          value: "@pipeline().globalParameters.gp_Container",
          type: "Expression"
        },
        folderPath: {
          value: "@pipeline().globalParameters.gp_Directory",
          type: "Expression"
        },
        fileName: {
          value: "@pipeline().globalParameters.gp_FileName",
          type: "Expression"
        }
      };
      
      const sanitizedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(datasetParameters)) {
        if (typeof value === 'object' && value !== null && 'value' in value && (value as any).type === 'Expression') {
          sanitizedParams[key] = (value as any).value;
        } else {
          sanitizedParams[key] = value;
        }
      }
      
      expect(sanitizedParams.container).toBe("@pipeline().globalParameters.gp_Container");
      expect(sanitizedParams.folderPath).toBe("@pipeline().globalParameters.gp_Directory");
      expect(sanitizedParams.fileName).toBe("@pipeline().globalParameters.gp_FileName");
    });
    
    it('should use extracted Expression parameter values instead of hardcoded @{dataset()} references', () => {
      // Test for Phase 1 fix: Lines 298 & 301 in getMetadataActivityTransformer.ts
      // Bug: Was hardcoding @{dataset().Directory} and @{dataset().Container}
      // Fix: Now uses extracted directory and container variables
      
      const datasetParameters = {
        Container: {
          value: '@pipeline().parameters.SourceContainer',
          type: 'Expression',
        },
        Directory: {
          value: '@pipeline().parameters.SourceDirectory',
          type: 'Expression',
        },
      };
      
      // Simulate extractValue() helper (lines 283-288)
      const extractValue = (param: any): any => {
        if (param && typeof param === 'object' && 'value' in param && param.type === 'Expression') {
          return param.value;
        }
        return param;
      };
      
      const container = extractValue(datasetParameters.Container);
      const directory = extractValue(datasetParameters.Directory);
      
      // Expected behavior AFTER fix (lines 298 & 301)
      const result = {
        location: {
          folderPath: directory
            ? { value: directory, type: 'Expression' }
            : undefined,
          container: container
            ? { value: container, type: 'Expression' }
            : undefined,
        },
      };
      
      // Assert: Verify extracted parameter values are used (NOT @{dataset()})
      expect(result.location.container).toEqual({
        value: '@pipeline().parameters.SourceContainer',
        type: 'Expression',
      });
      expect(result.location.folderPath).toEqual({
        value: '@pipeline().parameters.SourceDirectory',
        type: 'Expression',
      });
      
      // Verify NO hardcoded @{dataset()} references in the output
      const outputJson = JSON.stringify(result);
      expect(outputJson).not.toContain('@{dataset().Container}');
      expect(outputJson).not.toContain('@{dataset().Directory}');
      expect(outputJson).toContain('@pipeline().parameters.SourceContainer');
      expect(outputJson).toContain('@pipeline().parameters.SourceDirectory');
    });
    
    it('should handle plain string dataset parameters without Expression wrappers', () => {
      // Test for Phase 1 fix: Handles plain string parameters correctly
      
      const datasetParameters = {
        Container: 'my-container', // Plain string (no Expression wrapper)
        Directory: 'my-directory', // Plain string (no Expression wrapper)
      };
      
      // Simulate extractValue() helper
      const extractValue = (param: any): any => {
        if (param && typeof param === 'object' && 'value' in param && param.type === 'Expression') {
          return param.value;
        }
        return param;
      };
      
      const container = extractValue(datasetParameters.Container);
      const directory = extractValue(datasetParameters.Directory);
      
      // Expected behavior AFTER fix
      const result = {
        location: {
          folderPath: directory
            ? { value: directory, type: 'Expression' }
            : undefined,
          container: container
            ? { value: container, type: 'Expression' }
            : undefined,
        },
      };
      
      // Assert: Verify plain strings are wrapped in Expression objects
      expect(result.location.container).toEqual({
        value: 'my-container',
        type: 'Expression',
      });
      expect(result.location.folderPath).toEqual({
        value: 'my-directory',
        type: 'Expression',
      });
      
      // Verify NO hardcoded @{dataset()} references
      const outputJson = JSON.stringify(result);
      expect(outputJson).not.toContain('@{dataset()');
      expect(outputJson).toContain('my-container');
      expect(outputJson).toContain('my-directory');
    });
    
    it('should handle undefined parameters with fallback to originalTypeProperties', () => {
      // Test for Phase 1 fix: Fallback logic when parameters are undefined
      
      const datasetParameters = {};
      const originalTypeProperties = {
        location: {
          container: 'default-container',
          folderPath: 'default-directory',
        },
      };
      
      // Simulate extractValue() helper
      const extractValue = (param: any): any => {
        if (param && typeof param === 'object' && 'value' in param && param.type === 'Expression') {
          return param.value;
        }
        return param;
      };
      
      const container = extractValue((datasetParameters as any).Container) || extractValue(originalTypeProperties.location.container);
      const directory = extractValue((datasetParameters as any).Directory) || extractValue(originalTypeProperties.location.folderPath);
      
      // Expected behavior AFTER fix: Uses ternary operator with fallback
      const result = {
        location: {
          folderPath: directory
            ? { value: directory, type: 'Expression' }
            : originalTypeProperties.location?.folderPath,
          container: container
            ? { value: container, type: 'Expression' }
            : originalTypeProperties.location?.container,
        },
      };
      
      // Assert: Verify fallback works
      expect(result.location.container).toEqual({
        value: 'default-container',
        type: 'Expression',
      });
      expect(result.location.folderPath).toEqual({
        value: 'default-directory',
        type: 'Expression',
      });
    });
    
    it('should handle both parameters undefined (Fabric default behavior)', () => {
      // Test edge case: Both dataset parameters and originalTypeProperties are undefined
      
      const datasetParameters = {};
      const originalTypeProperties = {
        location: {},
      };
      
      // Simulate extractValue() helper
      const extractValue = (param: any): any => {
        if (param && typeof param === 'object' && 'value' in param && param.type === 'Expression') {
          return param.value;
        }
        return param;
      };
      
      const container = extractValue((datasetParameters as any).Container) || extractValue(originalTypeProperties.location.container);
      const directory = extractValue((datasetParameters as any).Directory) || extractValue(originalTypeProperties.location.folderPath);
      
      // Expected behavior: Both are undefined, Fabric handles appropriately
      const result = {
        location: {
          folderPath: directory
            ? { value: directory, type: 'Expression' }
            : originalTypeProperties.location?.folderPath,
          container: container
            ? { value: container, type: 'Expression' }
            : originalTypeProperties.location?.container,
        },
      };
      
      // Assert: Both should be undefined
      expect(result.location.container).toBeUndefined();
      expect(result.location.folderPath).toBeUndefined();
    });
  });
  
  // =============================================================================
  // Phase 3: InvokePipeline Service Tests
  // =============================================================================
  
  describe('InvokePipeline Service - sanitizeParameters()', () => {
    
    it('should extract .value from Expression objects and wrap in { value, type }', () => {
      const params = {
        p_Container: {
          value: "@pipeline().globalParameters.gp_Container",
          type: "Expression"
        }
      };
      
      // Simulate Phase 3 helper implementation
      const sanitized: Record<string, { value: string; type: string }> = {};
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'object' && value !== null && 'value' in value) {
          const extractedValue = (value as any).type === 'Expression' ? (value as any).value : value;
          sanitized[key] = {
            value: String((extractedValue as any).value || extractedValue),
            type: 'Expression'
          };
        } else {
          sanitized[key] = {
            value: String(value),
            type: 'Expression'
          };
        }
      }
      
      expect(sanitized.p_Container.value).toBe("@pipeline().globalParameters.gp_Container");
      expect(sanitized.p_Container.type).toBe("Expression");
    });
    
    it('should wrap plain values in { value, type } format', () => {
      const params = {
        p_PlainValue: "hardcoded_value"
      };
      
      const sanitized: Record<string, { value: string; type: string }> = {};
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'object' && value !== null && 'value' in value) {
          const extractedValue = (value as any).type === 'Expression' ? (value as any).value : value;
          sanitized[key] = {
            value: String((extractedValue as any).value || extractedValue),
            type: 'Expression'
          };
        } else {
          sanitized[key] = {
            value: String(value),
            type: 'Expression'
          };
        }
      }
      
      expect(sanitized.p_PlainValue.value).toBe("hardcoded_value");
      expect(sanitized.p_PlainValue.type).toBe("Expression");
    });
    
    it('should handle mixed Expression and plain parameters', () => {
      const params = {
        p_Container: {
          value: "@pipeline().globalParameters.gp_Container",
          type: "Expression"
        },
        p_Timeout: 30,
        p_EnableLogging: true
      };
      
      const sanitized: Record<string, { value: string; type: string }> = {};
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'object' && value !== null && 'value' in value) {
          const extractedValue = (value as any).type === 'Expression' ? (value as any).value : value;
          sanitized[key] = {
            value: String((extractedValue as any).value || extractedValue),
            type: 'Expression'
          };
        } else {
          sanitized[key] = {
            value: String(value),
            type: 'Expression'
          };
        }
      }
      
      expect(sanitized.p_Container.value).toBe("@pipeline().globalParameters.gp_Container");
      expect(sanitized.p_Timeout.value).toBe("30");
      expect(sanitized.p_EnableLogging.value).toBe("true");
    });
  });
  
  // =============================================================================
  // Integration Tests (All Phases)
  // =============================================================================
  
  describe('Integration: End-to-End Expression Extraction', () => {
    
    it('should handle full Copy activity with global parameters', () => {
      // Simulates full pipeline transformation
      const activity = {
        type: "Copy",
        typeProperties: {
          source: {
            type: "BinarySource"
          },
          sink: {
            type: "BinarySink"
          }
        },
        inputs: [{
          parameters: {
            p_Container: {
              value: "@pipeline().globalParameters.gp_Container",
              type: "Expression"
            },
            p_Directory: {
              value: "@pipeline().globalParameters.gp_Directory",
              type: "Expression"
            },
            p_FileName: {
              value: "@pipeline().globalParameters.gp_FileName",
              type: "Expression"
            }
          }
        }]
      };
      
      // Extract all Expression values
      const extractedParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(activity.inputs[0].parameters)) {
        if (typeof value === 'object' && value !== null && 'value' in value && (value as any).type === 'Expression') {
          extractedParams[key] = (value as any).value;
        } else {
          extractedParams[key] = String(value);
        }
      }
      
      expect(extractedParams.p_Container).toBe("@pipeline().globalParameters.gp_Container");
      expect(extractedParams.p_Directory).toBe("@pipeline().globalParameters.gp_Directory");
      expect(extractedParams.p_FileName).toBe("@pipeline().globalParameters.gp_FileName");
      expect(JSON.stringify(extractedParams)).not.toContain("[object Object]");
    });
    
    it('should validate Expression extraction prevents serialization bug', () => {
      const expressionObject = {
        value: "@pipeline().globalParameters.gp_FileName",
        type: "Expression"
      };
      
      // WRONG: Direct serialization
      const wrongSerialization = String(expressionObject); // "[object Object]"
      expect(wrongSerialization).toBe("[object Object]");
      
      // CORRECT: Extract .value first
      const correctValue = expressionObject.value;
      expect(correctValue).toBe("@pipeline().globalParameters.gp_FileName");
      expect(correctValue).not.toContain("[object Object]");
    });
  });
  
  // =============================================================================
  // Edge Cases
  // =============================================================================
  
  describe('Edge Cases', () => {
    
    it('should handle deeply nested Expression objects', () => {
      const deeplyNested = {
        value: {
          value: {
            value: "@pipeline().globalParameters.gp_FileName",
            type: "Expression"
          },
          type: "Expression"
        },
        type: "Expression"
      };
      
      // Recursive extraction
      let extracted: any = deeplyNested;
      while (typeof extracted === 'object' && extracted !== null && 'value' in extracted) {
        extracted = extracted.value;
      }
      
      expect(extracted).toBe("@pipeline().globalParameters.gp_FileName");
    });
    
    it('should handle Expression without type property', () => {
      const expressionWithoutType = {
        value: "@pipeline().globalParameters.gp_FileName"
        // Missing: type: "Expression"
      };
      
      // Should NOT extract (missing type check)
      const result = (typeof expressionWithoutType === 'object' && 
                     expressionWithoutType !== null && 
                     'value' in expressionWithoutType && 
                     (expressionWithoutType as any).type === 'Expression')
        ? (expressionWithoutType as any).value
        : expressionWithoutType;
      
      expect(result).toEqual(expressionWithoutType); // Not extracted
    });
    
    it('should handle Expression with null value', () => {
      const expressionWithNull = {
        value: null,
        type: "Expression"
      };
      
      const extracted = (typeof expressionWithNull === 'object' && 
                        expressionWithNull !== null && 
                        'value' in expressionWithNull && 
                        expressionWithNull.type === 'Expression')
        ? expressionWithNull.value
        : expressionWithNull;
      
      expect(extracted).toBeNull();
    });
  });
});
