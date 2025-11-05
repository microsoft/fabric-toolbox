import { authService } from './authService';

/**
 * Service interface for supported connection types
 */
export interface ISupportedConnectionTypesService {
  getSupportedTypes(): Promise<string[]>;
  isSupported(adfType: string): Promise<boolean>;
  getDisplayList(): Promise<string[]>;
  invalidateCache(): void;
  isVerificationAvailable(): boolean;
  getAvailableTypesForError(): Promise<string>;
  findSimilarTypes(requestedType: string, limit?: number): Promise<string[]>;
  discoverADFTypes(armTemplate: any): Set<string>;
  generateDynamicMapping(adfTypes: Set<string>, fabricTypes: string[]): Map<string, string>;
  getTypeMap(): Map<string, string>;
}

/**
 * Fabric API supported connection type structure
 */
interface FabricSupportedConnectionType {
  connectionType: string;
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
 * API response structure for supported connection types
 */
interface FabricSupportedConnectionTypesResponse {
  value: FabricSupportedConnectionType[];
}

/**
 * Configuration for the service
 */
interface ServiceConfig {
  fabricApiBaseUrl: string;
  ttlMinutes: number;
  cacheDir: string;
}

/**
 * Cache entry structure
 */
interface CacheEntry {
  data: string[];
  timestamp: number;
  ttl: number;
}

/**
 * Persistent mapping structure
 */
interface PersistedMapping {
  [adfType: string]: string;
}

/**
 * Minimal seed synonyms for well-known aliases
 */
const SEED_SYNONYMS: Record<string, string> = {
  'Web': 'Web',
  'HttpServer': 'Web',
  'Http': 'Web',
  'RestService': 'RestService',
  'SqlServer': 'SqlServer',
  'AzureSqlDatabase': 'SQL',
  'AzureBlobStorage': 'AzureBlobs',
  'AzureDataLakeStore': 'AzureDataLakeStorage',
  'AzureKeyVault': 'AzureKeyVault',
  'AzureFunction': 'AzureFunction'
};

/**
 * Safe sorting utility to avoid localeCompare errors with undefined values
 * Guards against undefined/null values and ensures string comparison
 */
export function safeSorted(arr: (string | undefined | null)[]): string[] {
  return arr
    .filter((x): x is string => x != null && typeof x === 'string') // Remove null/undefined and non-strings
    .map(x => x.trim()) // Remove whitespace
    .filter(x => x.length > 0) // Remove empty strings
    .sort((a, b) => {
      // Extra safety check before calling localeCompare
      const aStr = a || '';
      const bStr = b || '';
      return aStr.localeCompare(bStr, undefined, { sensitivity: 'base' });
    });
}

/**
 * Map ADF type to Fabric type name using dynamic mapping
 */
export function toFabricTypeName(adfType: string, typeMap?: Map<string, string>): string {
  if (typeMap && typeMap.has(adfType)) {
    return typeMap.get(adfType)!;
  }
  return SEED_SYNONYMS[adfType] ?? adfType;
}

/**
 * Service for managing supported Fabric connection types
 * Fetches data from Fabric API with caching and safe operations
 */
class SupportedConnectionTypesService implements ISupportedConnectionTypesService {
  private cache: CacheEntry | null = null;
  private verificationUnavailable = false;
  private isInitializing = false;
  private readonly config: ServiceConfig;
  private dynamicTypeMap: Map<string, string> = new Map();
  private persistedMappingPath: string;

  constructor() {
    this.config = {
      fabricApiBaseUrl: 'https://api.fabric.microsoft.com/v1',
      ttlMinutes: 60,
      cacheDir: '.cache'
    };
    this.persistedMappingPath = `${this.config.cacheDir}/connector-type-map.json`;
    this.initializeDynamicMapping();
  }

  /**
   * Initialize dynamic mapping by loading persisted mapping and merging with seed synonyms
   */
  private initializeDynamicMapping(): void {
    try {
      // Start with seed synonyms
      for (const [adfType, fabricType] of Object.entries(SEED_SYNONYMS)) {
        this.dynamicTypeMap.set(adfType, fabricType);
      }

      // Load persisted mapping if available (in browser context, we'd use localStorage)
      if (typeof localStorage !== 'undefined') {
        const persistedData = localStorage.getItem('connector-type-map');
        if (persistedData) {
          const persistedMapping: PersistedMapping = JSON.parse(persistedData);
          for (const [adfType, fabricType] of Object.entries(persistedMapping)) {
            this.dynamicTypeMap.set(adfType, fabricType);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to initialize dynamic mapping:', error);
    }
  }

  /**
   * Persist the current dynamic mapping
   */
  private persistDynamicMapping(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const mappingObject: PersistedMapping = {};
        this.dynamicTypeMap.forEach((fabricType, adfType) => {
          mappingObject[adfType] = fabricType;
        });
        localStorage.setItem('connector-type-map', JSON.stringify(mappingObject));
      }
    } catch (error) {
      console.warn('Failed to persist dynamic mapping:', error);
    }
  }

  /**
   * Get current access token from auth service
   */
  private async getAccessToken(): Promise<string> {
    const authState = authService.loadAuthState();
    if (!authState?.accessToken) {
      throw new Error('No valid authentication found. Please sign in again.');
    }

    try {
      // Try to refresh token if needed
      const refreshedToken = await authService.refreshToken(authState.accessToken);
      return refreshedToken;
    } catch (error) {
      // If refresh fails, use current token (user may need to re-authenticate later)
      if (authState.accessToken) {
        return authState.accessToken;
      }
      throw new Error('Authentication token is invalid. Please sign in again.');
    }
  }

  /**
   * Fetch supported connection types from Fabric API
   */
  private async fetchFromAPI(): Promise<string[]> {
    if (this.isInitializing) {
      // Wait for existing initialization to complete
      let attempts = 0;
      while (this.isInitializing && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (this.cache && this.isCacheValid()) {
        return this.cache.data;
      }
    }

    this.isInitializing = true;

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = `${this.config.fabricApiBaseUrl}/connections/supportedConnectionTypes`;

      console.log(`Fetching supported connection types from: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.verificationUnavailable = true;
          throw new Error(`Authentication error (${response.status}): Please check your permissions and sign in again.`);
        }
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Handle both direct array and wrapped response formats
      let connectors: FabricSupportedConnectionType[];
      if (Array.isArray(data)) {
        connectors = data;
      } else if (data.value && Array.isArray(data.value)) {
        connectors = data.value;
      } else {
        throw new Error('Unexpected API response format');
      }

      // Extract connection types and normalize
      const connectionTypes = connectors
        .map(connector => connector.connectionType || connector.displayName)
        .filter((type): type is string => Boolean(type))
        .map(type => type.trim());

      // Remove duplicates and sort safely
      const uniqueTypes = Array.from(new Set(connectionTypes));
      const sortedTypes = safeSorted(uniqueTypes);

      // Cache the result
      this.cache = {
        data: sortedTypes,
        timestamp: Date.now(),
        ttl: this.config.ttlMinutes * 60 * 1000
      };

      this.verificationUnavailable = false;
      console.log(`Successfully fetched ${sortedTypes.length} supported connection types from Fabric API`);
      return sortedTypes;

    } catch (error) {
      console.warn('Failed to fetch supported connection types:', error);
      
      // If we have cached data, use it
      if (this.cache && this.cache.data.length > 0) {
        console.log('Using cached supported connection types due to API failure');
        return this.cache.data;
      }

      // First-run offline scenario
      this.verificationUnavailable = true;
      console.warn('No cached data available, returning empty list. Verification unavailable.');
      return [];
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }
    return (Date.now() - this.cache.timestamp) < this.cache.ttl;
  }

  /**
   * Discover ADF types from ARM template
   */
  discoverADFTypes(armTemplate: any): Set<string> {
    const adfTypes = new Set<string>();
    
    try {
      if (!armTemplate || !armTemplate.resources) {
        return adfTypes;
      }

      const resources = Array.isArray(armTemplate.resources) ? armTemplate.resources : [];
      
      for (const resource of resources) {
        if (resource?.type === 'Microsoft.DataFactory/factories/linkedServices') {
          const linkedServiceType = resource?.properties?.type;
          if (linkedServiceType && typeof linkedServiceType === 'string') {
            adfTypes.add(linkedServiceType.trim());
          }
        }
      }

      console.log(`Discovered ${adfTypes.size} unique ADF LinkedService types from ARM template`);
      return adfTypes;
    } catch (error) {
      console.warn('Error discovering ADF types from ARM template:', error);
      return adfTypes;
    }
  }

  /**
   * Generate dynamic ADF to Fabric type mapping
   */
  generateDynamicMapping(adfTypes: Set<string>, fabricTypes: string[]): Map<string, string> {
    const newMapping = new Map<string, string>();
    
    // Start with existing dynamic mapping
    this.dynamicTypeMap.forEach((fabricType, adfType) => {
      newMapping.set(adfType, fabricType);
    });

    const fabricTypesLower = fabricTypes.map(t => t.toLowerCase());
    
    adfTypes.forEach(adfType => {
      if (newMapping.has(adfType)) {
        return; // Already mapped
      }

      const adfTypeLower = adfType.toLowerCase();
      
      // 1. Exact match (case-insensitive)
      const exactMatch = fabricTypes.find(fabricType => 
        fabricType.toLowerCase() === adfTypeLower
      );
      if (exactMatch) {
        newMapping.set(adfType, exactMatch);
        return;
      }

      // 2. Normalized match (strip common tokens)
      const normalizedAdf = this.normalizeTypeName(adfType);
      const normalizedMatch = fabricTypes.find(fabricType => 
        this.normalizeTypeName(fabricType) === normalizedAdf
      );
      if (normalizedMatch) {
        newMapping.set(adfType, normalizedMatch);
        return;
      }

      // 3. Partial matching
      const partialMatch = fabricTypes.find(fabricType => {
        const fabricLower = fabricType.toLowerCase();
        return fabricLower.includes(adfTypeLower) || adfTypeLower.includes(fabricLower);
      });
      if (partialMatch) {
        newMapping.set(adfType, partialMatch);
        return;
      }

      // 4. If no match found, leave unmapped (don't default to Generic)
      console.log(`No Fabric mapping found for ADF type: ${adfType}`);
    });

    // Update the dynamic type map
    this.dynamicTypeMap = newMapping;
    this.persistDynamicMapping();

    const mappedCount = Array.from(adfTypes).filter(adfType => newMapping.has(adfType)).length;
    console.log(`Generated dynamic mapping: ${mappedCount}/${adfTypes.size} ADF types mapped to Fabric types`);

    return newMapping;
  }

  /**
   * Normalize type name by removing common tokens
   */
  private normalizeTypeName(typeName: string): string {
    return typeName
      .toLowerCase()
      .replace(/service|server|source|sink|connector/g, '')
      .replace(/[-_\s]/g, '')
      .trim();
  }

  /**
   * Get the current type mapping
   */
  getTypeMap(): Map<string, string> {
    return new Map(this.dynamicTypeMap);
  }

  /**
   * Get supported connection types
   */
  async getSupportedTypes(): Promise<string[]> {
    // Return cached data if valid
    if (this.cache && this.isCacheValid()) {
      return this.cache.data;
    }

    // Fetch from API
    return await this.fetchFromAPI();
  }

  /**
   * Check if a type is supported (after mapping)
   * Implements "non-skip on unknown" policy - only returns false when verification is available and type is definitively not supported
   */
  async isSupported(adfType: string): Promise<boolean> {
    if (!adfType || typeof adfType !== 'string') {
      console.warn('Invalid ADF type provided for support check');
      return false;
    }

    if (this.verificationUnavailable) {
      // When verification is unavailable, assume supported to avoid false negatives (non-skip policy)
      console.warn(`Cannot verify support for ${adfType} - verification unavailable, assuming supported`);
      return true;
    }

    try {
      const fabricType = toFabricTypeName(adfType, this.dynamicTypeMap);
      const supportedTypes = await this.getSupportedTypes();
      
      // If we have no supported types (API error or empty response), assume supported
      if (supportedTypes.length === 0) {
        console.warn(`No supported types available for verification of ${adfType}, assuming supported`);
        return true;
      }
      
      // FIXED: Enhanced case-insensitive search with proper normalization
      const normalizedFabricType = this.normalizeForComparison(fabricType);
      const isSupported = supportedTypes.some(type => {
        if (!type || typeof type !== 'string') return false;
        const normalizedSupportedType = this.normalizeForComparison(type);
        return normalizedSupportedType === normalizedFabricType;
      });

      if (!isSupported) {
        console.log(`Type ${adfType} (mapped to ${fabricType}, normalized: ${normalizedFabricType}) not found in supported types:`, 
          supportedTypes.slice(0, 10).map(t => `${t} (${this.normalizeForComparison(t)})`));
      } else {
        console.log(`Type ${adfType} (mapped to ${fabricType}) found as supported`);
      }
      
      return isSupported;
    } catch (error) {
      console.warn(`Error checking support for ${adfType}:`, error);
      // On error, assume supported to avoid false negatives (non-skip policy)
      return true;
    }
  }

  /**
   * Normalize strings for comparison - trim whitespace and convert to lowercase
   */
  private normalizeForComparison(value: string): string {
    if (!value || typeof value !== 'string') {
      return '';
    }
    return value.trim().toLowerCase();
  }

  /**
   * Get display list of supported types (safely sorted)
   */
  async getDisplayList(): Promise<string[]> {
    const types = await this.getSupportedTypes();
    return safeSorted(types);
  }

  /**
   * Invalidate cache and force refresh on next request
   */
  invalidateCache(): void {
    this.cache = null;
    this.verificationUnavailable = false;
    console.log('Supported connection types cache invalidated');
  }

  /**
   * Check if verification is available
   */
  isVerificationAvailable(): boolean {
    return !this.verificationUnavailable;
  }

  /**
   * Get available types for error messaging with safe handling
   */
  async getAvailableTypesForError(): Promise<string> {
    try {
      const types = await this.getDisplayList();
      if (types.length === 0) {
        if (this.verificationUnavailable) {
          return 'Unable to verify supported types (Fabric API unavailable)';
        }
        return 'Unable to load supported types from Fabric API';
      }
      return types.join(', ');
    } catch (error) {
      console.warn('Error getting available types for error message:', error);
      return 'Unable to load supported types';
    }
  }

  /**
   * Find similar types for suggestions with safe string handling
   */
  async findSimilarTypes(requestedType: string, limit: number = 3): Promise<string[]> {
    if (!requestedType || typeof requestedType !== 'string') {
      return [];
    }

    const fabricType = toFabricTypeName(requestedType, this.dynamicTypeMap);
    const supportedTypes = await this.getSupportedTypes();
    
    if (supportedTypes.length === 0) {
      return [];
    }

    const lowerRequested = fabricType.trim().toLowerCase();
    
    // Exact match first (case-insensitive)
    const exactMatch = supportedTypes.find(type => {
      if (!type || typeof type !== 'string') return false;
      return type.trim().toLowerCase() === lowerRequested;
    });
    
    if (exactMatch) {
      return [exactMatch];
    }

    // Partial matches, sorted by similarity with safe string handling
    const partialMatches = supportedTypes
      .filter((type): type is string => Boolean(type && typeof type === 'string'))
      .filter(type => {
        const lowerType = type.trim().toLowerCase();
        return lowerType.includes(lowerRequested) || 
               lowerRequested.includes(lowerType);
      })
      .sort((a, b) => {
        const aScore = this.calculateSimilarityScore(a.toLowerCase(), lowerRequested);
        const bScore = this.calculateSimilarityScore(b.toLowerCase(), lowerRequested);
        return bScore - aScore;
      })
      .slice(0, limit);

    return partialMatches;
  }

  /**
   * Calculate similarity score between two strings with safety checks
   */
  private calculateSimilarityScore(str1: string, str2: string): number {
    if (!str1 || !str2 || typeof str1 !== 'string' || typeof str2 !== 'string') {
      return 0;
    }

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
}

// Export singleton instance
export const supportedConnectionTypesService = new SupportedConnectionTypesService();