/**
 * Dynamic Connector Service - Uses ONLY Fabric API data, no static files
 * 
 * This service replaces all static connector definitions with real-time API data
 * from Microsoft Fabric. It provides dynamic mapping, validation, and configuration
 * for connectors based solely on what Fabric actually supports.
 */

import { authService } from './authService';

export interface FabricConnectorType {
  connectionType: string;
  displayName: string;
  description?: string;
  connectionDetailsSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  creationMethods?: string[];
  supportedCredentialTypes?: string[];
  supportedConnectionEncryptionTypes?: string[];
  supportsSkipTestConnection?: boolean;
}

export interface ConnectorMapping {
  adfType: string;
  fabricType: string | null; // null means unmapped
  confidence: 'exact' | 'partial' | 'suggested' | 'unmapped';
  userOverride?: string; // User-selected connector type
}

export interface ConnectorValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingFields: string[];
}

/**
 * Service for managing connector types exclusively from Fabric API
 */
export class DynamicConnectorService {
  private fabricConnectorTypes: Map<string, FabricConnectorType> = new Map();
  private adfToFabricMapping: Map<string, ConnectorMapping> = new Map();
  private isInitialized = false;
  private lastApiCall: number = 0;
  private cacheTimeout = 60 * 60 * 1000; // 1 hour

  /**
   * Initialize service by fetching supported types from Fabric API
   * NO STATIC FALLBACKS - API is the single source of truth
   */
  async initialize(accessToken?: string): Promise<void> {
    if (!accessToken) {
      const authState = authService.loadAuthState();
      accessToken = authState?.accessToken || undefined;
    }

    if (!accessToken) {
      throw new Error('No access token available for Fabric API calls');
    }

    // Check if we need to refresh data from API
    const now = Date.now();
    if (this.isInitialized && (now - this.lastApiCall) < this.cacheTimeout) {
      console.log('Using cached Fabric connector types');
      return;
    }

    console.log('Fetching supported connector types from Fabric API...');
    
    try {
      const response = await fetch('https://api.fabric.microsoft.com/v1/connections/supportedConnectionTypes', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Fabric API call failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const connectorTypes = data.value || [];

      if (connectorTypes.length === 0) {
        throw new Error('Fabric API returned empty connector types list');
      }

      // Clear existing data and populate with fresh API data
      this.fabricConnectorTypes.clear();
      
      connectorTypes.forEach((connector: any) => {
        const fabricConnector: FabricConnectorType = {
          connectionType: connector.connectionType || connector.type,
          displayName: connector.displayName || connector.connectionType,
          description: connector.description,
          connectionDetailsSchema: connector.connectionDetailsSchema || { type: 'object', properties: {} },
          creationMethods: connector.creationMethods || [],
          supportedCredentialTypes: connector.supportedCredentialTypes || [],
          supportedConnectionEncryptionTypes: connector.supportedConnectionEncryptionTypes || [],
          supportsSkipTestConnection: connector.supportsSkipTestConnection || false
        };
        
        this.fabricConnectorTypes.set(fabricConnector.connectionType, fabricConnector);
      });

      this.isInitialized = true;
      this.lastApiCall = now;
      
      console.log(`Successfully loaded ${connectorTypes.length} connector types from Fabric API:`, 
        Array.from(this.fabricConnectorTypes.keys()).slice(0, 10));

    } catch (error) {
      console.error('CRITICAL: Failed to load connector types from Fabric API:', error);
      this.isInitialized = false;
      // NO FALLBACK TO STATIC DATA - this is now a hard requirement
      throw error;
    }
  }

  /**
   * Get all supported Fabric connector types from API
   */
  getAllSupportedTypes(): string[] {
    this.ensureInitialized();
    return Array.from(this.fabricConnectorTypes.keys()).sort();
  }

  /**
   * Get connector type details from API
   */
  getConnectorDetails(connectorType: string): FabricConnectorType | undefined {
    this.ensureInitialized();
    return this.fabricConnectorTypes.get(connectorType);
  }

  /**
   * Map ADF type to Fabric type using dynamic logic
   * Returns null if no suitable mapping can be determined automatically
   */
  mapADFToFabricType(adfType: string): ConnectorMapping {
    this.ensureInitialized();
    
    if (this.adfToFabricMapping.has(adfType)) {
      return this.adfToFabricMapping.get(adfType)!;
    }

    const fabricTypes = this.getAllSupportedTypes();
    let mapping: ConnectorMapping = {
      adfType,
      fabricType: null,
      confidence: 'unmapped'
    };

    // 1. Exact match (case-insensitive)
    const exactMatch = fabricTypes.find(type => 
      type.toLowerCase() === adfType.toLowerCase()
    );
    if (exactMatch) {
      mapping = {
        adfType,
        fabricType: exactMatch,
        confidence: 'exact'
      };
    } else {
      // 2. Partial match based on common patterns
      const partialMatch = this.findPartialMatch(adfType, fabricTypes);
      if (partialMatch) {
        mapping = {
          adfType,
          fabricType: partialMatch,
          confidence: 'partial'
        };
      } else {
        // 3. Suggested match based on common patterns
        const suggestedMatch = this.findSuggestedMatch(adfType, fabricTypes);
        if (suggestedMatch) {
          mapping = {
            adfType,
            fabricType: suggestedMatch,
            confidence: 'suggested'
          };
        }
      }
    }

    // Cache the mapping
    this.adfToFabricMapping.set(adfType, mapping);
    return mapping;
  }

  /**
   * Find partial match based on common substrings
   */
  private findPartialMatch(adfType: string, fabricTypes: string[]): string | null {
    const adfLower = adfType.toLowerCase();
    
    // Remove common suffixes/prefixes for better matching
    const normalizedAdf = this.normalizeTypeName(adfLower);
    
    for (const fabricType of fabricTypes) {
      const fabricLower = fabricType.toLowerCase();
      const normalizedFabric = this.normalizeTypeName(fabricLower);
      
      // Check if normalized names match
      if (normalizedAdf === normalizedFabric) {
        return fabricType;
      }
      
      // Check if one contains the other
      if (normalizedAdf.includes(normalizedFabric) || normalizedFabric.includes(normalizedAdf)) {
        return fabricType;
      }
    }
    
    return null;
  }

  /**
   * Find suggested match based on known patterns
   */
  private findSuggestedMatch(adfType: string, fabricTypes: string[]): string | null {
    const suggestions: Record<string, string[]> = {
      // SQL variants
      'sql': ['SQL', 'SqlServer', 'AzureSqlDatabase'],
      'sqlserver': ['SQL', 'SqlServer'],
      'azuresqldatabase': ['SQL', 'AzureSqlDatabase'],
      
      // Storage variants  
      'azureblobstorage': ['AzureBlobs', 'AzureDataLakeStorage'],
      'azuredatalakestore': ['AzureDataLakeStorage', 'AzureBlobs'],
      
      // Web/HTTP variants
      'rest': ['RestService', 'Web', 'Http'],
      'restservice': ['RestService', 'Web'],
      'http': ['Web', 'Http', 'RestService'],
      'httpserver': ['Web', 'Http'],
      'web': ['Web', 'RestService'],
      
      // Database variants
      'mysql': ['MySql', 'MySQL'],
      'postgresql': ['PostgreSQL', 'PostgreSql'],
      'oracle': ['Oracle', 'AmazonRdsForOracle'],
      
      // Microsoft services
      'sharepoint': ['SharePoint', 'SharePointOnlineList'],
      'office365': ['Microsoft365', 'Office365']
    };

    const adfLower = adfType.toLowerCase();
    const possibleMatches = suggestions[adfLower] || [];
    
    // Find the first available match in Fabric
    for (const suggestion of possibleMatches) {
      if (fabricTypes.includes(suggestion)) {
        return suggestion;
      }
    }
    
    return null;
  }

  /**
   * Normalize type name for better matching
   */
  private normalizeTypeName(typeName: string): string {
    return typeName
      .toLowerCase()
      .replace(/service|server|storage|source|sink|connector|linked/g, '')
      .replace(/[-_\s]/g, '')
      .trim();
  }

  /**
   * Build connection details from ADF definition using Fabric schema
   */
  buildConnectionDetails(
    adfLinkedService: any, 
    fabricConnectorType: string
  ): Record<string, any> {
    this.ensureInitialized();
    
    const connectorDetails = this.getConnectorDetails(fabricConnectorType);
    if (!connectorDetails) {
      console.warn(`No schema found for connector type: ${fabricConnectorType}`);
      return {};
    }

    const connectionDetails: Record<string, any> = {};
    const adfProps = adfLinkedService?.properties?.typeProperties || {};
    const schema = connectorDetails.connectionDetailsSchema;
    
    if (schema.properties) {
      const required = schema.required || [];
      
      // Map each schema property from ADF data
      Object.entries(schema.properties).forEach(([fieldName, fieldSchema]) => {
        const value = this.extractFieldValue(fieldName, adfProps, fieldSchema as any);
        
        if (value !== undefined) {
          connectionDetails[fieldName] = value;
        } else if (required.includes(fieldName)) {
          // Set default for required fields
          connectionDetails[fieldName] = this.getDefaultValue(fieldSchema as any);
          console.warn(`Using default value for required field ${fieldName} in ${fabricConnectorType}`);
        }
      });
    }

    return connectionDetails;
  }

  /**
   * Extract field value from ADF properties
   */
  private extractFieldValue(fieldName: string, adfProps: any, fieldSchema: any): any {
    // Direct mapping
    if (adfProps[fieldName] !== undefined) {
      return this.convertValue(adfProps[fieldName], fieldSchema.type);
    }

    // Common field mappings
    const fieldMappings: Record<string, string[]> = {
      'url': ['url', 'baseUrl', 'serviceUri', 'endpoint'],
      'baseUrl': ['url', 'baseUrl', 'serviceUri', 'endpoint'],
      'server': ['server', 'serverName', 'host', 'hostName'],
      'database': ['database', 'databaseName', 'initialCatalog'],
      'account': ['account', 'accountName', 'storageAccount'],
      'username': ['username', 'userId', 'user'],
      'password': ['password', 'secret', 'accessKey']
    };

    const possibleFields = fieldMappings[fieldName] || [fieldName];
    
    for (const field of possibleFields) {
      if (adfProps[field] !== undefined) {
        return this.convertValue(adfProps[field], fieldSchema.type);
      }
    }

    return undefined;
  }

  /**
   * Convert value to expected type
   */
  private convertValue(value: any, expectedType: string): any {
    if (value === undefined || value === null) return value;
    
    switch (expectedType) {
      case 'string':
        return String(value);
      case 'number':
      case 'integer':
        return typeof value === 'number' ? value : parseInt(String(value), 10) || 0;
      case 'boolean':
        return typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
      default:
        return value;
    }
  }

  /**
   * Get default value for field type
   */
  private getDefaultValue(fieldSchema: any): any {
    switch (fieldSchema.type) {
      case 'string':
        return '';
      case 'number':
      case 'integer':
        return 0;
      case 'boolean':
        return false;
      default:
        return null;
    }
  }

  /**
   * Validate connection details against schema
   */
  validateConnectionDetails(
    connectorType: string, 
    connectionDetails: Record<string, any>
  ): ConnectorValidationResult {
    this.ensureInitialized();
    
    const connectorDetails = this.getConnectorDetails(connectorType);
    if (!connectorDetails) {
      return {
        isValid: false,
        errors: [`Connector type ${connectorType} is not supported by Fabric`],
        warnings: [],
        missingFields: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const missingFields: string[] = [];
    
    const schema = connectorDetails.connectionDetailsSchema;
    const required = schema.required || [];

    // Check required fields
    required.forEach(fieldName => {
      if (!connectionDetails[fieldName] || connectionDetails[fieldName] === '') {
        errors.push(`Missing required field: ${fieldName}`);
        missingFields.push(fieldName);
      }
    });

    // Validate field types
    if (schema.properties) {
      Object.entries(connectionDetails).forEach(([fieldName, value]) => {
        const fieldSchema = schema.properties[fieldName];
        if (fieldSchema && value !== undefined) {
          if (!this.isValidType(value, (fieldSchema as any).type)) {
            warnings.push(`Field ${fieldName} may have incorrect type`);
          }
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingFields
    };
  }

  /**
   * Check if value matches expected type
   */
  private isValidType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
      case 'integer':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      default:
        return true;
    }
  }

  /**
   * Override mapping with user selection
   */
  setUserOverride(adfType: string, fabricType: string): void {
    const mapping = this.mapADFToFabricType(adfType);
    mapping.userOverride = fabricType;
    mapping.fabricType = fabricType;
    mapping.confidence = 'exact'; // User choice is always exact
    this.adfToFabricMapping.set(adfType, mapping);
  }

  /**
   * Get final connector type for deployment (with user overrides)
   */
  getFinalConnectorType(adfType: string): string | null {
    const mapping = this.mapADFToFabricType(adfType);
    return mapping.userOverride || mapping.fabricType;
  }

  /**
   * Check if service is properly initialized
   */
  isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get all mappings for review
   */
  getAllMappings(): Map<string, ConnectorMapping> {
    return new Map(this.adfToFabricMapping);
  }

  /**
   * Clear all cached data and force re-initialization
   */
  clearCache(): void {
    this.fabricConnectorTypes.clear();
    this.adfToFabricMapping.clear();
    this.isInitialized = false;
    this.lastApiCall = 0;
  }

  /**
   * Ensure service is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('DynamicConnectorService must be initialized before use. Call initialize() first.');
    }
  }
}

// Export singleton instance
export const dynamicConnectorService = new DynamicConnectorService();