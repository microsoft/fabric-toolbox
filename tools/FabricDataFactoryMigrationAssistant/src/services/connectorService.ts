/**
 * Connector service that exclusively uses the supportedConnectionTypes API
 * All static FabricConnectors.json references have been removed
 */

import { supportedConnectionTypesService, toFabricTypeName } from './supportedConnectionTypesService';
import { SupportedFabricConnector, FabricConnectorParameter, FabricConnectorCreationMethod } from '../types';

export interface ConnectorTypeInfo {
  type: string;
  displayName?: string;
  description?: string;
  connectionDetailsSchema?: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  creationMethods?: string[];
  supportedCredentialTypes?: string[];
  supportedConnectionEncryptionTypes?: string[];
  supportsSkipTestConnection?: boolean;
}

/**
 * Service for managing Fabric connector configurations using dynamic API data
 */
export class ConnectorService {
  private supportedConnectors: Map<string, ConnectorTypeInfo> = new Map();
  private initialized = false;

  /**
   * Initialize the service with supported connector types from Fabric API only
   */
  async initialize(accessToken?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Only use Fabric API - no static files
      if (accessToken) {
        await this.fetchSupportedConnectorsFromAPI(accessToken);
      } else {
        console.warn('No access token provided, connector service initialization limited');
      }
      
      this.initialized = true;
      console.log(`Connector service initialized with ${this.supportedConnectors.size} connector types from API`);
    } catch (error) {
      console.error('Failed to initialize connector service:', error);
      this.initialized = true;
    }
  }

  /**
   * Fetch supported connector types from Fabric API
   */
  private async fetchSupportedConnectorsFromAPI(accessToken: string): Promise<void> {
    try {
      const response = await fetch('https://api.fabric.microsoft.com/v1/connections/supportedConnectionTypes', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const connectors = data.value || [];
        
        connectors.forEach((connector: any) => {
          const supportedConnector: ConnectorTypeInfo = {
            type: connector.connectionType || connector.type,
            displayName: connector.displayName,
            description: connector.description,
            connectionDetailsSchema: connector.connectionDetailsSchema,
            creationMethods: connector.creationMethods || [],
            supportedCredentialTypes: connector.supportedCredentialTypes || []
          };
          
          this.supportedConnectors.set(supportedConnector.type, supportedConnector);
        });
        
        console.log(`Loaded ${connectors.length} connector types from Fabric API`);
      } else {
        console.warn(`Failed to fetch from Fabric API: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.warn('Error fetching from Fabric API:', error);
    }
  }

  /**
   * Get all supported connector types in SupportedFabricConnector format
   */
  getAllSupportedConnectorTypes(): SupportedFabricConnector[] {
    return Array.from(this.supportedConnectors.values()).map(connector => ({
      type: connector.type,
      creationMethods: this.transformCreationMethods(connector.creationMethods || []),
      supportedCredentialTypes: connector.supportedCredentialTypes || [],
      supportedConnectionEncryptionTypes: connector.supportedConnectionEncryptionTypes || ['NotEncrypted', 'Encrypted'],
      supportsSkipTestConnection: connector.supportsSkipTestConnection || false
    })).sort((a, b) => {
      const aType = a.type || '';
      const bType = b.type || '';
      return aType.localeCompare(bType, undefined, { sensitivity: 'base' });
    });
  }

  /**
   * Transform API creation methods to expected format
   */
  private transformCreationMethods(apiMethods: string[]): FabricConnectorCreationMethod[] {
    if (!Array.isArray(apiMethods)) {
      return [{
        name: 'Default',
        parameters: []
      }];
    }

    return apiMethods.map(method => ({
      name: method,
      parameters: []
    }));
  }

  /**
   * Get connector configuration by type
   */
  getConnectorByType(connectorType: string): ConnectorTypeInfo | undefined {
    return this.supportedConnectors.get(connectorType);
  }

  /**
   * Get connection details schema for a connector type
   */
  getConnectionDetailsSchema(connectorType: string): Record<string, any> | undefined {
    const connector = this.getConnectorByType(connectorType);
    return connector?.connectionDetailsSchema;
  }

  /**
   * Get required fields for a connector type
   */
  getRequiredFields(connectorType: string): string[] {
    const connector = this.getConnectorByType(connectorType);
    return connector?.connectionDetailsSchema?.required || [];
  }

  /**
   * Get all field properties for a connector type
   */
  getAllFields(connectorType: string): Record<string, any> {
    const connector = this.getConnectorByType(connectorType);
    return connector?.connectionDetailsSchema?.properties || {};
  }

  /**
   * Find similar connector types for fallback mapping
   */
  findSimilarConnectorTypes(requestedType: string, limit: number = 3): string[] {
    const lowerRequested = (requestedType || '').toLowerCase();
    const allTypes = Array.from(this.supportedConnectors.keys()).filter(type => type && typeof type === 'string');
    
    // Exact match first
    if (allTypes.some(type => type.toLowerCase() === lowerRequested)) {
      return [allTypes.find(type => type.toLowerCase() === lowerRequested)!];
    }

    // Partial matches
    const partialMatches = allTypes
      .filter(type => 
        type.toLowerCase().includes(lowerRequested) || 
        lowerRequested.includes(type.toLowerCase())
      )
      .sort((a, b) => {
        const aScore = this.calculateSimilarityScore(a.toLowerCase(), lowerRequested);
        const bScore = this.calculateSimilarityScore(b.toLowerCase(), lowerRequested);
        return bScore - aScore;
      })
      .slice(0, limit);

    return partialMatches;
  }

  /**
   * Calculate similarity score between two strings
   */
  private calculateSimilarityScore(str1: string, str2: string): number {
    // Simple scoring: longer common substring = higher score
    let maxLength = 0;
    for (let i = 0; i < str1.length; i++) {
      for (let j = 0; j < str2.length; j++) {
        let length = 0;
        while (
          i + length < str1.length && 
          j + length < str2.length && 
          str1[i + length] === str2[j + length]
        ) {
          length++;
        }
        maxLength = Math.max(maxLength, length);
      }
    }
    return maxLength;
  }

  /**
   * Build default connection details from ADF linked service using API schema
   */
  buildDefaultConnectionDetails(
    adfLinkedService: any, 
    connectorType: string
  ): Record<string, any> {
    const connector = this.getConnectorByType(connectorType);
    if (!connector || !connector.connectionDetailsSchema) {
      return this.buildFallbackConnectionDetails(adfLinkedService, connectorType);
    }

    const connectionDetails: Record<string, any> = {};
    const typeProps = adfLinkedService?.properties?.typeProperties || {};
    const schema = connector.connectionDetailsSchema;
    const properties = schema.properties || {};

    // Map each property from the schema
    Object.entries(properties).forEach(([fieldName, fieldSchema]) => {
      const value = this.extractParameterValue(fieldName, typeProps, connectorType, fieldSchema as any);
      if (value !== undefined) {
        connectionDetails[fieldName] = value;
      }
    });

    return connectionDetails;
  }

  /**
   * Extract parameter value from ADF properties using schema information
   */
  private extractParameterValue(
    fieldName: string, 
    typeProps: any, 
    connectorType: string,
    fieldSchema: any
  ): any {
    const fieldNameLower = (fieldName || '').toLowerCase();
    
    // Direct field mapping
    if (typeProps[fieldName] !== undefined) {
      return this.convertValueToType(typeProps[fieldName], fieldSchema.type);
    }

    // Common field mappings
    const mappings: Record<string, string[]> = {
      'server': ['server', 'serverName', 'host', 'hostName', 'dataSource'],
      'database': ['database', 'databaseName', 'initialCatalog', 'catalog'],
      'url': ['url', 'baseUrl', 'serviceUri', 'endpoint'],
      'baseurl': ['url', 'baseUrl', 'serviceUri', 'endpoint'],
      'account': ['account', 'accountName', 'storageAccount'],
      'domain': ['domain', 'endpoint', 'serviceEndpoint'],
      'sharepointsiteurl': ['siteUrl', 'url', 'sharePointSiteUrl'],
      'username': ['username', 'userId', 'user', 'userName'],
      'password': ['password', 'secret', 'accessKey'],
      'port': ['port', 'portNumber']
    };

    const possibleFields = mappings[fieldNameLower] || [fieldName];
    
    for (const field of possibleFields) {
      if (typeProps[field] !== undefined) {
        return this.convertValueToType(typeProps[field], fieldSchema.type);
      }
    }

    // Connector-specific mappings
    return this.getConnectorSpecificValue(fieldName, typeProps, connectorType);
  }

  /**
   * Get connector-specific parameter values
   */
  private getConnectorSpecificValue(
    fieldName: string,
    typeProps: any,
    connectorType: string
  ): any {
    const fieldNameLower = (fieldName || '').toLowerCase();
    
    switch (connectorType) {
      case 'AzureBlobs':
        if (fieldNameLower === 'account' && typeProps.serviceUri) {
          const match = typeProps.serviceUri.match(/https:\/\/([^.]+)\.blob\.core\.windows\.net/);
          return match ? match[1] : undefined;
        }
        if (fieldNameLower === 'domain') {
          return 'blob.core.windows.net';
        }
        break;
        
      case 'SQL':
        if (fieldNameLower === 'server' && typeProps.connectionString) {
          const match = typeProps.connectionString.match(/(?:Server|Data Source)=([^;]+)/i);
          return match ? match[1] : undefined;
        }
        if (fieldNameLower === 'database' && typeProps.connectionString) {
          const match = typeProps.connectionString.match(/(?:Database|Initial Catalog)=([^;]+)/i);
          return match ? match[1] : undefined;
        }
        break;
        
      case 'Web':
      case 'RestService':
        if (fieldNameLower === 'url' || fieldNameLower === 'baseurl') {
          return typeProps.url || typeProps.baseUrl || typeProps.serviceUri;
        }
        break;
    }

    return undefined;
  }

  /**
   * Convert value to expected parameter type
   */
  private convertValueToType(value: any, dataType: string): any {
    if (value === undefined || value === null) {
      return value;
    }

    switch (dataType) {
      case 'string':
        return String(value);
      case 'number':
      case 'integer':
        const numValue = typeof value === 'string' ? parseInt(value, 10) : Number(value);
        return isNaN(numValue) ? 0 : numValue;
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          return (value || '').toLowerCase() === 'true' || value === '1';
        }
        return Boolean(value);
      default:
        return value;
    }
  }

  /**
   * Build fallback connection details when no schema is available
   */
  private buildFallbackConnectionDetails(
    adfLinkedService: any, 
    connectorType: string
  ): Record<string, any> {
    const typeProps = adfLinkedService?.properties?.typeProperties || {};
    const connectionDetails: Record<string, any> = {};

    // Common fallback patterns
    if (typeProps.url || typeProps.baseUrl) {
      connectionDetails.url = typeProps.url || typeProps.baseUrl;
    }
    if (typeProps.server || typeProps.serverName) {
      connectionDetails.server = typeProps.server || typeProps.serverName;
    }
    if (typeProps.database || typeProps.databaseName) {
      connectionDetails.database = typeProps.database || typeProps.databaseName;
    }
    if (typeProps.serviceUri) {
      connectionDetails.serviceUri = typeProps.serviceUri;
    }

    return connectionDetails;
  }

  /**
   * Validate connection details against connector schema
   */
  validateConnectionDetails(
    connectorType: string, 
    connectionDetails: Record<string, any>
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const connector = this.getConnectorByType(connectorType);
    if (!connector) {
      return {
        isValid: false,
        errors: [`Connector type ${connectorType} is not supported`],
        warnings: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const requiredFields = this.getRequiredFields(connectorType);

    // Check required fields
    requiredFields.forEach(fieldName => {
      if (!connectionDetails[fieldName] || connectionDetails[fieldName] === '') {
        errors.push(`Missing required field: ${fieldName}`);
      }
    });

    // Type validation for provided fields
    const allFields = this.getAllFields(connectorType);
    Object.entries(connectionDetails).forEach(([key, value]) => {
      const fieldSchema = allFields[key];
      if (fieldSchema && value !== undefined) {
        if (!this.isValidFieldValue(value, fieldSchema)) {
          warnings.push(`Field ${key} may have invalid type or format`);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if field value is valid for its schema
   */
  private isValidFieldValue(value: any, fieldSchema: any): boolean {
    const expectedType = fieldSchema.type;
    
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
      case 'integer':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      default:
        return true; // Unknown type, assume valid
    }
  }

  /**
   * Get default value for a field based on schema
   */
  getDefaultFieldValue(connectorType: string, fieldName: string): any {
    const allFields = this.getAllFields(connectorType);
    const fieldSchema = allFields[fieldName];
    
    if (!fieldSchema) {
      return null;
    }

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
   * Check if connector service is properly initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get all parameters (fields) for a connector type - API compatible method
   */
  getAllParameters(connectorType: string): FabricConnectorParameter[] {
    const allFields = this.getAllFields(connectorType);
    const requiredFields = this.getRequiredFields(connectorType);
    
    return Object.entries(allFields).map(([fieldName, fieldSchema]) => {
      const schema = fieldSchema as any;
      
      // Map schema type to FabricConnectorParameter dataType
      let dataType: 'Text' | 'Number' | 'Boolean' | 'Password' | 'DropDown' = 'Text';
      
      switch (schema.type) {
        case 'string':
          dataType = fieldName.toLowerCase().includes('password') || 
                    fieldName.toLowerCase().includes('secret') ? 'Password' : 'Text';
          break;
        case 'number':
        case 'integer':
          dataType = 'Number';
          break;
        case 'boolean':
          dataType = 'Boolean';
          break;
        default:
          dataType = 'Text';
      }
      
      return {
        name: fieldName,
        dataType,
        required: requiredFields.includes(fieldName),
        allowedValues: schema.enum || null,
        description: schema.description
      };
    });
  }
}

// Export singleton instance
export const connectorService = new ConnectorService();