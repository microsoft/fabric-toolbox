/**
 * Runtime validation utilities for external data
 * These functions help ensure type safety when parsing external data like JSON files
 */

import { ADFComponent, ComponentSummary } from '../types';
import { sanitizeString } from './authUtils';

/**
 * Type guard to check if a value is a valid ARM resource
 */
export function isValidARMResource(obj: any): obj is { type: string; name: string; properties?: any; resources?: any[] } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.type === 'string' &&
    typeof obj.name === 'string'
  );
}

/**
 * Type guard to check if a value is a valid ARM template
 */
export function isValidARMTemplate(obj: any): obj is { resources: any[] } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    Array.isArray(obj.resources)
  );
}

/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse<T = any>(jsonString: string): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = JSON.parse(jsonString);
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Invalid JSON format' 
    };
  }
}

/**
 * Parse ARM template expression to extract component name, ignoring factoryName/workspaceName parameters
 */
export function parseARMExpression(expression: string): string {
  if (!expression || typeof expression !== 'string') {
    return '';
  }

  // Handle ARM template expressions like [concat(parameters('factoryName'), '/componentName')] 
  // or [concat(parameters('workspaceName'), '/componentName')]
  if (expression.startsWith('[') && expression.endsWith(']')) {
    const innerExpression = expression.slice(1, -1);
    
    // Look for concat expressions with factoryName parameter (Azure Data Factory)
    const factoryNameMatch = innerExpression.match(/concat\s*\(\s*parameters\s*\(\s*['"]factoryName['"]?\s*\)\s*,\s*['"]([^'"]+)['"]\s*\)/i);
    if (factoryNameMatch && factoryNameMatch[1]) {
      // Extract the component name after the factory name (remove leading slash if present)
      return factoryNameMatch[1].replace(/^\/+/, '');
    }
    
    // Look for concat expressions with workspaceName parameter (Synapse Workspace)
    const workspaceNameMatch = innerExpression.match(/concat\s*\(\s*parameters\s*\(\s*['"]workspaceName['"]?\s*\)\s*,\s*['"]([^'"]+)['"]\s*\)/i);
    if (workspaceNameMatch && workspaceNameMatch[1]) {
      // Extract the component name after the workspace name (remove leading slash if present)
      return workspaceNameMatch[1].replace(/^\/+/, '');
    }
    
    // Look for other concat patterns where we want the last part
    const generalConcatMatch = innerExpression.match(/concat\s*\([^)]+['"]([^'"\/]+)['"][^)]*\)/i);
    if (generalConcatMatch && generalConcatMatch[1]) {
      return generalConcatMatch[1];
    }
    
    // Look for direct parameter references
    const paramMatch = innerExpression.match(/parameters\s*\(\s*['"]([^'"]+)['"]?\s*\)/i);
    if (paramMatch && paramMatch[1] && paramMatch[1] !== 'factoryName' && paramMatch[1] !== 'workspaceName') {
      return paramMatch[1];
    }
    
    // Look for variables
    const variableMatch = innerExpression.match(/variables\s*\(\s*['"]([^'"]+)['"]?\s*\)/i);
    if (variableMatch && variableMatch[1]) {
      return variableMatch[1];
    }
    
    // If no specific pattern is found, try to extract any quoted string that's not 'factoryName' or 'workspaceName'
    const quotedMatch = innerExpression.match(/['"]([^'"]+)['"]/g);
    if (quotedMatch) {
      for (const match of quotedMatch) {
        const content = match.slice(1, -1); // Remove quotes
        if (content !== 'factoryName' && content !== 'workspaceName' && content !== '/') {
          return content.replace(/^\/+/, ''); // Remove leading slashes
        }
      }
    }
  }
  
  // If it's not an ARM expression, return as-is but clean it up
  return expression.replace(/^\/+/, ''); // Remove leading slashes
}

/**
 * Validate and extract string value with fallback and sanitization
 */
export function extractString(value: unknown, fallback = ''): string {
  const str = typeof value === 'string' ? value : fallback;
  return sanitizeString(str);
}

/**
 * Extract component name from ARM template resource name, handling factoryName parameters
 */
export function extractComponentName(resourceName: unknown, fallback = ''): string {
  const str = typeof resourceName === 'string' ? resourceName : fallback;
  const parsedName = parseARMExpression(str);
  return sanitizeString(parsedName || fallback);
}

/**
 * Validate and extract number value with fallback
 */
export function extractNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && !isNaN(value) ? value : fallback;
}

/**
 * Validate and extract boolean value with fallback
 */
export function extractBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Validate and extract array with type checking
 */
export function extractArray<T>(value: unknown, itemValidator: (item: any) => item is T): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(itemValidator);
}

/**
 * Check if a component type is valid
 */
export function isValidComponentType(type: any): type is ADFComponent['type'] {
  const validTypes: ADFComponent['type'][] = [
    'pipeline', 'dataset', 'linkedService', 'trigger', 
    'globalParameter', 'integrationRuntime', 'mappingDataFlow', 'customActivity', 'managedIdentity'
  ];
  return typeof type === 'string' && validTypes.includes(type as ADFComponent['type']);
}

/**
 * Check if a compatibility status is valid
 */
export function isValidCompatibilityStatus(status: any): status is ADFComponent['compatibilityStatus'] {
  const validStatuses: ADFComponent['compatibilityStatus'][] = ['supported', 'partiallySupported', 'unsupported'];
  return typeof status === 'string' && validStatuses.includes(status as ADFComponent['compatibilityStatus']);
}

/**
 * Safely get array length with fallback
 */
export function safeArrayLength(arr: unknown): number {
  return Array.isArray(arr) ? arr.length : 0;
}

/**
 * Safely access array element with fallback
 */
export function safeArrayAccess<T>(arr: unknown, index: number, fallback: T): T {
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) {
    return fallback;
  }
  return arr[index] ?? fallback;
}

/**
 * Safely filter array with type checking
 */
export function safeArrayFilter<T>(arr: unknown, predicate: (item: any) => item is T): T[] {
  if (!Array.isArray(arr)) {
    return [];
  }
  return arr.filter(predicate);
}

/**
 * Safely map array with error handling
 */
export function safeArrayMap<T, R>(
  arr: unknown, 
  mapper: (item: T, index: number) => R,
  fallback: R[] = []
): R[] {
  if (!Array.isArray(arr)) {
    return fallback;
  }
  
  try {
    return arr.map(mapper);
  } catch {
    return fallback;
  }
}

/**
 * Validate and sanitize component summary data
 */
export function validateComponentSummary(summary: any): ComponentSummary {
  return {
    total: extractNumber(summary?.total),
    supported: extractNumber(summary?.supported),
    partiallySupported: extractNumber(summary?.partiallySupported),
    unsupported: extractNumber(summary?.unsupported),
    byType: typeof summary?.byType === 'object' && summary.byType !== null ? summary.byType : {}
  };
}

/**
 * Validate user input for credentials
 */
export function validateCredentials(credentials: any): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!credentials || typeof credentials !== 'object') {
    errors.push('Credentials object is required');
    return { isValid: false, errors };
  }
  
  if (!extractString(credentials.tenantId)) {
    errors.push('Tenant ID is required');
  }
  
  if (!extractString(credentials.clientId)) {
    errors.push('Client ID is required');
  }
  
  if (!extractString(credentials.clientSecret)) {
    errors.push('Client Secret is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize file input
 */
export function validateFileInput(file: unknown): file is File {
  return file instanceof File && file.name.endsWith('.json');
}