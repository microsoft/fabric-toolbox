import { ADFComponent } from '../types';
import { supportedConnectionTypesService } from './supportedConnectionTypesService';
import { 
  mapADFToFabricConnectorType, 
  buildConnectionDetailsFromADF,
  getConnectionDetailsMapping 
} from '../lib/connectorMapping';

// Interface representing supported Fabric connector types from API
export interface FabricSupportedConnectorType {
  connectionType: string;
  displayName?: string;
  description?: string;
  creationMethods?: Array<{
    name: string;
    displayName: string;
    dataType: string;
    parameters: Array<{
      name: string;
      displayName: string;
      type: string;
      required: boolean;
    }>;
  }>;
  supportsSkipTestConnection?: boolean;
}

export interface ConnectorTypeMapping {
  adfType: string;
  fabricType: string;
  isSupported: boolean;
  mappingConfidence: 'high' | 'medium' | 'low';
  requiredFields: string[];
  optionalFields: string[];
}

// Interface for ADF to Fabric connector mapping
export interface ConnectorMapping {
  adfType: string;
  fabricType: string;
  isSupported: boolean;
  mappingConfidence: 'high' | 'medium' | 'low';
  requiredFields: string[];
  optionalFields: string[];
  connectionDetailsMapper: (adfLinkedService: any) => Record<string, any>;
}

/**
 * Service for managing connector type mappings between ADF and Fabric
 */
export class ConnectorMappingService {
  private supportedTypesCache: string[] = [];
  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /**
   * Get supported Fabric connector types (cached)
   */
  private async getSupportedFabricTypes(): Promise<string[]> {
    const now = Date.now();
    if (this.supportedTypesCache.length === 0 || (now - this.lastCacheUpdate) > this.CACHE_TTL) {
      try {
        this.supportedTypesCache = await supportedConnectionTypesService.getSupportedTypes();
        this.lastCacheUpdate = now;
      } catch (error) {
        console.warn('Failed to fetch supported types, using cached version:', error);
      }
    }
    return this.supportedTypesCache;
  }

  /**
   * Map a single ADF LinkedService to Fabric connector
   */
  async mapConnector(adfLinkedService: any): Promise<ConnectorMapping> {
    if (!adfLinkedService?.type) {
      throw new Error('Invalid ADF LinkedService: missing type');
    }

    const adfType = adfLinkedService.type;
    const fabricType = mapADFToFabricConnectorType(adfType);
    
    // Check if the mapped type is supported in Fabric
    const isSupported = await supportedConnectionTypesService.isSupported(adfType);
    
    // Get field mappings
    const fieldMapping = getConnectionDetailsMapping(fabricType);
    const requiredFields = Object.keys(fieldMapping);
    const optionalFields: string[] = []; // Could be enhanced based on schema

    // Determine mapping confidence
    let mappingConfidence: 'high' | 'medium' | 'low' = 'high';
    if (fabricType === 'Generic') {
      mappingConfidence = 'low';
    } else if (!isSupported) {
      mappingConfidence = 'medium';
    }

    return {
      adfType,
      fabricType,
      isSupported,
      mappingConfidence,
      requiredFields,
      optionalFields,
      connectionDetailsMapper: (linkedService: any) => buildConnectionDetailsFromADF(fabricType, linkedService)
    };
  }

  /**
   * Map multiple ADF LinkedServices to Fabric connectors
   */
  async mapConnectors(adfLinkedServices: any[]): Promise<ConnectorMapping[]> {
    const mappingPromises = adfLinkedServices.map(ls => this.mapConnector(ls));
    return Promise.all(mappingPromises);
  }

  /**
   * Get mapping for a specific ADF type
   */
  async getConnectorMapping(adfType: string): Promise<ConnectorMapping> {
    const mockLinkedService = { type: adfType, properties: { typeProperties: {} } };
    return this.mapConnector(mockLinkedService);
  }

  /**
   * Validate if an ADF type can be mapped to Fabric
   */
  async validateConnectorMapping(adfType: string): Promise<{
    canMap: boolean;
    fabricType: string;
    isSupported: boolean;
    confidence: 'high' | 'medium' | 'low';
    reason?: string;
  }> {
    try {
      const mapping = await this.getConnectorMapping(adfType);
      
      return {
        canMap: mapping.isSupported,
        fabricType: mapping.fabricType,
        isSupported: mapping.isSupported,
        confidence: mapping.mappingConfidence,
        reason: mapping.isSupported 
          ? undefined 
          : `Type ${adfType} maps to ${mapping.fabricType} but is not supported in Fabric`
      };
    } catch (error) {
      return {
        canMap: false,
        fabricType: 'Unknown',
        isSupported: false,
        confidence: 'low',
        reason: error instanceof Error ? error.message : 'Unknown error during mapping'
      };
    }
  }

  /**
   * Get batch validation for multiple ADF types
   */
  async validateConnectorMappings(adfTypes: string[]): Promise<Map<string, {
    canMap: boolean;
    fabricType: string;
    isSupported: boolean;
    confidence: 'high' | 'medium' | 'low';
    reason?: string;
  }>> {
    const results = new Map();
    
    const validationPromises = adfTypes.map(async (adfType) => {
      const validation = await this.validateConnectorMapping(adfType);
      return { adfType, validation };
    });
    
    const validations = await Promise.all(validationPromises);
    
    validations.forEach(({ adfType, validation }) => {
      results.set(adfType, validation);
    });
    
    return results;
  }

  /**
   * Get supported connector types summary
   */
  async getSupportedConnectorsSummary(): Promise<{
    totalSupported: number;
    supportedTypes: string[];
    lastUpdated: Date;
  }> {
    const supportedTypes = await this.getSupportedFabricTypes();
    
    return {
      totalSupported: supportedTypes.length,
      supportedTypes: supportedTypes.slice(), // Return copy
      lastUpdated: new Date(this.lastCacheUpdate)
    };
  }

  /**
   * Clear the cache to force refresh
   */
  clearCache(): void {
    this.supportedTypesCache = [];
    this.lastCacheUpdate = 0;
  }

  /**
   * Build connection details for deployment
   */
  buildConnectionDetails(adfLinkedService: any, fabricType: string): Record<string, any> {
    return buildConnectionDetailsFromADF(fabricType, adfLinkedService);
  }

  /**
   * Get list of ADF types that have high-confidence mappings
   */
  async getHighConfidenceMappings(): Promise<string[]> {
    // This would ideally be based on a comprehensive mapping table
    // For now, return types we know map well
    return [
      'SqlServer',
      'AzureSqlDatabase',
      'AzureBlobStorage',
      'AzureDataLakeStore',
      'RestService',
      'Web',
      'OData',
      'AzureFunction',
      'AzureKeyVault'
    ];
  }

  /**
   * Check if a connector type requires special handling
   */
  requiresSpecialHandling(adfType: string): boolean {
    const specialTypes = [
      'HttpServer', // Maps to Web but needs URL transformation
      'CustomDataSource', // Always generic
      'FileServer', // May need gateway configuration
    ];
    
    return specialTypes.includes(adfType);
  }

  /**
   * Get mapping statistics
   */
  async getMappingStatistics(adfTypes: string[]): Promise<{
    total: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    supported: number;
    unsupported: number;
  }> {
    const validations = await this.validateConnectorMappings(adfTypes);
    
    let highConfidence = 0;
    let mediumConfidence = 0;
    let lowConfidence = 0;
    let supported = 0;
    let unsupported = 0;
    
    validations.forEach((validation) => {
      switch (validation.confidence) {
        case 'high':
          highConfidence++;
          break;
        case 'medium':
          mediumConfidence++;
          break;
        case 'low':
          lowConfidence++;
          break;
      }
      
      if (validation.isSupported) {
        supported++;
      } else {
        unsupported++;
      }
    });
    
    return {
      total: adfTypes.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      supported,
      unsupported
    };
  }
}

// Export singleton instance
export const connectorMappingService = new ConnectorMappingService();