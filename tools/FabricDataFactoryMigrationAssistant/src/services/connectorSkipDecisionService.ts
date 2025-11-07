import { supportedConnectionTypesService, toFabricTypeName } from './supportedConnectionTypesService';

/**
 * Skip decision result interface
 */
export interface ConnectorSkipDecision {
  shouldSkip: boolean;
  reasonCode: 'unsupported' | 'verificationUnavailable' | 'supported';
  note: string;
  availableTypes?: string;
  suggestedAlternatives?: string[];
}

/**
 * Centralized service for making consistent connector validation decisions
 * REMOVED AUTO-SKIP: All connectors now require explicit user choice
 */
export class ConnectorSkipDecisionService {
  
  /**
   * Make a centralized validation decision for a connector type
   * NEVER auto-skips - always requires explicit user configuration
   */
  async makeValidationDecision(adfType: string): Promise<ConnectorSkipDecision> {
    if (!adfType || typeof adfType !== 'string') {
      return {
        shouldSkip: false, // Changed: Don't auto-skip, flag for user attention
        reasonCode: 'verificationUnavailable',
        note: 'Invalid or missing connector type - requires manual configuration'
      };
    }

    try {
      // Check verification availability first
      const isVerificationAvailable = supportedConnectionTypesService.isVerificationAvailable();
      
      if (!isVerificationAvailable) {
        // When verification is unavailable, flag for user attention but don't skip
        return {
          shouldSkip: false,
          reasonCode: 'verificationUnavailable',
          note: 'Connector support verification unavailable - manual configuration required'
        };
      }

      // Get the dynamic type map for current mapping
      const typeMap = supportedConnectionTypesService.getTypeMap();
      const fabricType = toFabricTypeName(adfType, typeMap);
      
      // Check if type is supported
      const isSupported = await supportedConnectionTypesService.isSupported(adfType);
      
      if (isSupported) {
        return {
          shouldSkip: false,
          reasonCode: 'supported',
          note: `Connector type '${adfType}' is supported in Microsoft Fabric`
        };
      } else {
        // Get suggested alternatives and available types
        const alternatives = await supportedConnectionTypesService.findSimilarTypes(fabricType);
        const availableTypes = await supportedConnectionTypesService.getAvailableTypesForError();
        
        // Only include availableTypes if we have a non-empty list
        const supportedTypesList = await supportedConnectionTypesService.getSupportedTypes();
        const includeAvailableTypes = supportedTypesList.length > 0;
        
        // NEVER auto-skip - always require user choice
        return {
          shouldSkip: false, // Changed: Don't auto-skip unsupported types
          reasonCode: 'unsupported',
          note: `Connector type '${adfType}' (mapped to '${fabricType}') not found in Fabric API - manual connector selection required`,
          suggestedAlternatives: alternatives,
          availableTypes: includeAvailableTypes ? availableTypes : undefined
        };
      }
    } catch (error) {
      // On error, require user attention but don't skip
      return {
        shouldSkip: false,
        reasonCode: 'verificationUnavailable',
        note: `Error verifying connector support for '${adfType}': ${error instanceof Error ? error.message : 'Unknown error'}. Manual configuration required.`
      };
    }
  }

  /**
   * Get batch validation decisions for multiple connector types
   */
  async getBatchValidationDecisions(adfTypes: string[]): Promise<Map<string, ConnectorSkipDecision>> {
    const decisions = new Map<string, ConnectorSkipDecision>();
    
    const promises = adfTypes.map(async (adfType) => {
      const decision = await this.makeValidationDecision(adfType);
      return { adfType, decision };
    });
    
    const results = await Promise.all(promises);
    
    results.forEach(({ adfType, decision }) => {
      decisions.set(adfType, decision);
    });
    
    return decisions;
  }

  /**
   * Get summary statistics for skip decisions
   */
  getSkipDecisionSummary(decisions: Map<string, ConnectorSkipDecision>): {
    total: number;
    skipped: number;
    processed: number;
    verificationUnavailable: number;
    withAlternatives: number;
  } {
    let skipped = 0;
    let processed = 0;
    let verificationUnavailable = 0;
    let withAlternatives = 0;

    decisions.forEach((decision) => {
      if (decision.shouldSkip) {
        skipped++;
      } else {
        processed++;
      }
      
      if (decision.reasonCode === 'verificationUnavailable') {
        verificationUnavailable++;
      }
      
      if (decision.suggestedAlternatives && decision.suggestedAlternatives.length > 0) {
        withAlternatives++;
      }
    });

    return {
      total: decisions.size,
      skipped,
      processed,
      verificationUnavailable,
      withAlternatives
    };
  }

  /**
   * Validate web connector types specifically
   */
  async validateWebConnectors(adfTypes: string[]): Promise<{
    hasWebConnectors: boolean;
    webSupported: boolean;
    webReason?: string;
  }> {
    const webTypes = ['Web', 'HttpServer', 'Http'];
    const hasWebConnectors = adfTypes.some(type => webTypes.includes(type));
    
    if (!hasWebConnectors) {
      return { hasWebConnectors: false, webSupported: true };
    }

    const webDecision = await this.makeValidationDecision('Web');
    const httpServerDecision = await this.makeValidationDecision('HttpServer');
    
    return {
      hasWebConnectors: true,
      webSupported: !webDecision.shouldSkip || !httpServerDecision.shouldSkip,
      webReason: webDecision.note || httpServerDecision.note
    };
  }

  /**
   * Check if verification is reliable for a decision
   */
  isVerificationReliable(decision: ConnectorSkipDecision): boolean {
    return decision.reasonCode !== 'verificationUnavailable';
  }

  /**
   * Get formatted skip decision message
   */
  getSkipDecisionMessage(adfType: string, decision: ConnectorSkipDecision): string {
    return decision.note;
  }

  /**
   * Get formatted suggested alternatives message
   */
  getSuggestedAlternativesMessage(decision: ConnectorSkipDecision): string | null {
    if (decision.suggestedAlternatives && decision.suggestedAlternatives.length > 0) {
      return `Consider using: ${decision.suggestedAlternatives.join(', ')}`;
    }
    return null;
  }

  /**
   * Get formatted available types message
   */
  getAvailableTypesMessage(decision: ConnectorSkipDecision): string | null {
    if (decision.availableTypes && decision.reasonCode === 'unsupported') {
      return `Available types: ${decision.availableTypes}`;
    }
    return null;
  }

  /**
   * Initialize the service with ADF template data to build dynamic mappings
   */
  async initializeWithADFTemplate(armTemplate: any): Promise<{
    adfTypesFound: number;
    mappingsGenerated: number;
    fabricTypesAvailable: number;
  }> {
    try {
      // Discover ADF types from the template
      const adfTypes = supportedConnectionTypesService.discoverADFTypes(armTemplate);
      
      // Get current Fabric supported types
      const fabricTypes = await supportedConnectionTypesService.getSupportedTypes();
      
      // Generate dynamic mapping
      const mapping = supportedConnectionTypesService.generateDynamicMapping(adfTypes, fabricTypes);
      
      console.log(`Initialized connector skip decision service with ${adfTypes.size} ADF types and ${fabricTypes.length} Fabric types`);
      
      return {
        adfTypesFound: adfTypes.size,
        mappingsGenerated: mapping.size,
        fabricTypesAvailable: fabricTypes.length
      };
    } catch (error) {
      console.warn('Failed to initialize with ADF template:', error);
      return {
        adfTypesFound: 0,
        mappingsGenerated: 0,
        fabricTypesAvailable: 0
      };
    }
  }

  /**
   * Get the current mapping summary for debugging
   */
  getMappingSummary(): { totalMappings: number; mappings: Array<{ adfType: string; fabricType: string }> } {
    const typeMap = supportedConnectionTypesService.getTypeMap();
    const mappings = Array.from(typeMap.entries()).map(([adfType, fabricType]) => ({
      adfType,
      fabricType
    }));
    
    return {
      totalMappings: mappings.length,
      mappings
    };
  }

  /**
   * Alias for getBatchValidationDecisions for backward compatibility
   */
  async makeBatchSkipDecisions(adfTypes: string[]): Promise<Map<string, ConnectorSkipDecision>> {
    return this.getBatchValidationDecisions(adfTypes);
  }

  /**
   * Alias for validateWebConnectors for backward compatibility
   */
  async validateWebConnectorMapping(adfTypes: string[]): Promise<{
    hasWebConnectors: boolean;
    webSupported: boolean;
    webReason?: string;
  }> {
    return this.validateWebConnectors(adfTypes);
  }
}

// Export singleton instance
export const connectorSkipDecisionService = new ConnectorSkipDecisionService();