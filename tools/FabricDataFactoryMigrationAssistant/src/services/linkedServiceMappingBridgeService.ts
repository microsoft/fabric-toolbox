/**
 * LinkedService Mapping Bridge Service
 * 
 * This service creates a bridge between the "Configure Connections" page (Step 3)
 * and the "Map Components" page (Step 4), enabling automatic application of
 * LinkedService-to-Connection mappings to pipeline activities.
 * 
 * Problem Solved:
 * - Users previously had to manually map LinkedServices twice:
 *   1. In Configure Connections (LinkedService → Fabric Connection)
 *   2. In Map Components (Pipeline Activity → Fabric Connection)
 * 
 * Solution:
 * - Build a bridge from connectionMappings state
 * - Auto-apply mappings to pipeline activities
 * - Handle renamed LinkedServices via fuzzy matching
 * - Provide validation and coverage metrics
 */

import { 
  ConnectionMappingState, 
  ActivityConnectionMapping,
  LinkedServiceConnection 
} from '../types';
import { ActivityLinkedServiceReference } from './pipelineActivityAnalysisService';

/**
 * Bridge mapping from LinkedService name to Fabric Connection details
 */
export interface LinkedServiceConnectionBridge {
  [linkedServiceName: string]: {
    originalName: string;           // Original ADF LinkedService name
    connectionId: string;            // Mapped Fabric Connection ID
    connectionDisplayName: string;   // Connection display name for UI
    connectionType: string;          // Connection type
    mappingSource: 'auto' | 'manual'; // How mapping was created
    timestamp: string;               // When mapping was created
  };
}

/**
 * Validation result for bridge coverage
 */
export interface BridgeCoverageValidation {
  isComplete: boolean;
  missingMappings: string[];
  coveragePercentage: number;
  totalLinkedServices: number;
  mappedLinkedServices: number;
}

/**
 * Service for building and managing LinkedService-to-Connection bridge
 */
export class LinkedServiceMappingBridgeService {
  
  /**
   * Builds bridge from Configure Connections page mappings
   * 
   * @param connectionMappings State from Configure Connections page
   * @returns Bridge object mapping LinkedService names to Connection IDs
   */
  static buildBridge(
    connectionMappings: ConnectionMappingState | undefined
  ): LinkedServiceConnectionBridge {
    const bridge: LinkedServiceConnectionBridge = {};
    
    if (!connectionMappings?.linkedServices) {
      return bridge;
    }
    
    connectionMappings.linkedServices.forEach((ls: LinkedServiceConnection) => {
      // Skip if LinkedService is marked to be skipped
      if (ls.skip) {
        return;
      }
      
      // Case 1: Mapped to existing connection
      if (ls.mappingMode === 'existing' && ls.existingConnectionId) {
        bridge[ls.linkedServiceName] = {
          originalName: ls.linkedServiceName,
          connectionId: ls.existingConnectionId,
          connectionDisplayName: ls.existingConnection?.displayName || 'Unknown',
          connectionType: ls.existingConnection?.connectionDetails?.type || 'Unknown',
          mappingSource: 'auto',
          timestamp: new Date().toISOString()
        };
      }
      // Case 2: New connection was configured
      else if (ls.mappingMode === 'new' && ls.status === 'configured') {
        // For new connections, we need to get the ID after deployment
        // For now, use a placeholder that indicates pending deployment
        const connectionId = `new-${ls.linkedServiceName}`;
        
        bridge[ls.linkedServiceName] = {
          originalName: ls.linkedServiceName,
          connectionId: connectionId,
          connectionDisplayName: ls.linkedServiceName, // Use LinkedService name as display name
          connectionType: ls.selectedConnectionType || 'Unknown',
          mappingSource: 'auto',
          timestamp: new Date().toISOString()
        };
      }
    });
    
    return bridge;
  }
  
  /**
   * Applies bridge mappings to pipeline activities
   * 
   * @param pipelineName Pipeline name
   * @param activityReferences Activity references requiring mapping
   * @param bridge LinkedService-to-Connection bridge
   * @returns Pre-populated pipeline connection mappings
   */
  static applyBridgeToPipeline(
    pipelineName: string,
    activityReferences: ActivityLinkedServiceReference[],
    bridge: LinkedServiceConnectionBridge
  ): ActivityConnectionMapping[] {
    return activityReferences.map((ref) => {
      const linkedServiceName = ref.linkedServiceName || ref.datasetLinkedServiceName;
      
      if (!linkedServiceName) {
        return {
          activityName: ref.activityName,
          activityType: ref.activityType,
          selectedConnectionId: undefined
        };
      }
      
      // Check if we have a direct bridge mapping for this LinkedService
      let bridgeMapping = bridge[linkedServiceName];
      
      // If no direct match, try fuzzy matching (handles renamed LinkedServices)
      if (!bridgeMapping) {
        const fuzzyMatch = this.findFuzzyMatch(linkedServiceName, bridge, 0.8);
        if (fuzzyMatch) {
          bridgeMapping = bridge[fuzzyMatch];
        }
      }
      
      return {
        activityName: ref.activityName,
        activityType: ref.activityType,
        linkedServiceReference: ref.linkedServiceName 
          ? { name: ref.linkedServiceName, type: ref.linkedServiceType }
          : undefined,
        selectedConnectionId: bridgeMapping?.connectionId
      };
    });
  }
  
  /**
   * Validates that all required LinkedServices have bridge mappings
   * 
   * @param activityReferences All activity references
   * @param bridge The bridge object
   * @returns Validation result with missing mappings
   */
  static validateBridgeCoverage(
    activityReferences: ActivityLinkedServiceReference[],
    bridge: LinkedServiceConnectionBridge
  ): BridgeCoverageValidation {
    const uniqueLinkedServices = new Set<string>();
    
    activityReferences.forEach(ref => {
      const name = ref.linkedServiceName || ref.datasetLinkedServiceName;
      if (name) {
        uniqueLinkedServices.add(name);
      }
    });
    
    const totalLinkedServices = uniqueLinkedServices.size;
    const missingMappings: string[] = [];
    
    uniqueLinkedServices.forEach(name => {
      if (!bridge[name]) {
        // Try fuzzy match before marking as missing
        const fuzzyMatch = this.findFuzzyMatch(name, bridge, 0.8);
        if (!fuzzyMatch) {
          missingMappings.push(name);
        }
      }
    });
    
    const mappedLinkedServices = totalLinkedServices - missingMappings.length;
    const coveragePercentage = totalLinkedServices === 0 
      ? 100 
      : Math.round((mappedLinkedServices / totalLinkedServices) * 100);
    
    return {
      isComplete: missingMappings.length === 0,
      missingMappings,
      coveragePercentage,
      totalLinkedServices,
      mappedLinkedServices
    };
  }
  
  /**
   * Handles renamed LinkedServices by fuzzy matching
   * 
   * @param linkedServiceName Current name to match
   * @param bridge Existing bridge
   * @param threshold Similarity threshold (0-1), default 0.8
   * @returns Best matching LinkedService name from bridge or undefined
   */
  static findFuzzyMatch(
    linkedServiceName: string,
    bridge: LinkedServiceConnectionBridge,
    threshold: number = 0.8
  ): string | undefined {
    const bridgeNames = Object.keys(bridge);
    let bestMatch: string | undefined;
    let bestScore = 0;
    
    bridgeNames.forEach(name => {
      const score = this.calculateSimilarity(linkedServiceName, name);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = name;
      }
    });
    
    return bestMatch;
  }
  
  /**
   * Calculates similarity between two strings (0-1)
   * Uses Levenshtein distance ratio
   * 
   * @param str1 First string
   * @param str2 Second string
   * @returns Similarity score (0-1, where 1 is identical)
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Substring match
    if (s1.includes(s2) || s2.includes(s1)) return 0.85;
    
    // Calculate Levenshtein distance ratio
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(s1, s2);
    return 1 - (distance / maxLength);
  }
  
  /**
   * Calculates Levenshtein distance between two strings
   * (minimum number of single-character edits required to change one string into another)
   * 
   * @param str1 First string
   * @param str2 Second string
   * @returns Levenshtein distance
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * Gets mapping statistics for display in UI
   * 
   * @param bridge The bridge object
   * @param activityReferences All activity references
   * @returns Statistics for UI display
   */
  static getMappingStatistics(
    bridge: LinkedServiceConnectionBridge,
    activityReferences: ActivityLinkedServiceReference[]
  ): {
    totalLinkedServices: number;
    autoMapped: number;
    requiresManual: number;
    coveragePercentage: number;
  } {
    const validation = this.validateBridgeCoverage(activityReferences, bridge);
    
    return {
      totalLinkedServices: validation.totalLinkedServices,
      autoMapped: validation.mappedLinkedServices,
      requiresManual: validation.missingMappings.length,
      coveragePercentage: validation.coveragePercentage
    };
  }
  
  /**
   * Checks if a specific LinkedService has a bridge mapping
   * 
   * @param linkedServiceName LinkedService name to check
   * @param bridge The bridge object
   * @param allowFuzzy Whether to allow fuzzy matching
   * @returns True if mapping exists (direct or fuzzy)
   */
  static hasBridgeMapping(
    linkedServiceName: string,
    bridge: LinkedServiceConnectionBridge,
    allowFuzzy: boolean = true
  ): boolean {
    if (bridge[linkedServiceName]) {
      return true;
    }
    
    if (allowFuzzy) {
      const fuzzyMatch = this.findFuzzyMatch(linkedServiceName, bridge, 0.8);
      return fuzzyMatch !== undefined;
    }
    
    return false;
  }
  
  /**
   * Gets the connection ID for a LinkedService (with fuzzy matching fallback)
   * 
   * @param linkedServiceName LinkedService name
   * @param bridge The bridge object
   * @returns Connection ID or undefined
   */
  static getConnectionId(
    linkedServiceName: string,
    bridge: LinkedServiceConnectionBridge
  ): string | undefined {
    // Direct match
    if (bridge[linkedServiceName]) {
      return bridge[linkedServiceName].connectionId;
    }
    
    // Fuzzy match
    const fuzzyMatch = this.findFuzzyMatch(linkedServiceName, bridge, 0.8);
    if (fuzzyMatch && bridge[fuzzyMatch]) {
      return bridge[fuzzyMatch].connectionId;
    }
    
    return undefined;
  }
}
