import { AuthenticationResult } from '@azure/msal-browser';

/**
 * Required scopes for Microsoft Fabric API operations
 */
export const REQUIRED_SCOPES = {
  CONNECTION: 'Connection.ReadWrite.All',
  GATEWAY: 'Gateway.ReadWrite.All',
  ITEM: 'Item.ReadWrite.All',
  DATA_PIPELINE: 'DataPipeline.ReadWrite.All'
} as const;

/**
 * Alias for backward compatibility
 */
export const REQUIRED_FABRIC_SCOPES = REQUIRED_SCOPES;

/**
 * Interface for scope validation result
 */
export interface ScopeValidationResult {
  isValid: boolean;
  missingScopes: string[];
  presentScopes: string[];
  hasConnectionScope: boolean;
  hasGatewayScope: boolean;
  hasItemScope: boolean;
  hasDataPipelineScope: boolean;
}

/**
 * Interface for token scope information
 */
export interface TokenScopeInfo {
  scopes: string[];
  hasAllRequiredScopes: boolean;
  connectionReadWrite: boolean;
  gatewayReadWrite: boolean;
  hasItemScope: boolean;
  hasDataPipelineScope: boolean;
}

/**
 * Extract and validate scopes from an authentication result
 */
export function validateTokenScopes(authResult: AuthenticationResult): ScopeValidationResult {
  if (!authResult || !authResult.scopes) {
    return {
      isValid: false,
      missingScopes: Object.values(REQUIRED_SCOPES),
      presentScopes: [],
      hasConnectionScope: false,
      hasGatewayScope: false,
      hasItemScope: false,
      hasDataPipelineScope: false
    };
  }

  const presentScopes = authResult.scopes || [];
  const hasConnectionScope = presentScopes.some(scope => 
    scope.includes('Connection.ReadWrite') || scope.includes('Connection.ReadWrite.All')
  );
  const hasGatewayScope = presentScopes.some(scope => 
    scope.includes('Gateway.ReadWrite') || scope.includes('Gateway.ReadWrite.All')
  );
  const hasItemScope = presentScopes.some(scope => 
    scope.includes('Item.ReadWrite') || scope.includes('Item.ReadWrite.All')
  );
  const hasDataPipelineScope = presentScopes.some(scope => 
    scope.includes('DataPipeline.ReadWrite') || scope.includes('DataPipeline.ReadWrite.All')
  );

  const missingScopes: string[] = [];
  if (!hasConnectionScope) missingScopes.push(REQUIRED_SCOPES.CONNECTION);
  if (!hasGatewayScope) missingScopes.push(REQUIRED_SCOPES.GATEWAY);
  if (!hasItemScope) missingScopes.push(REQUIRED_SCOPES.ITEM);
  if (!hasDataPipelineScope) missingScopes.push(REQUIRED_SCOPES.DATA_PIPELINE);

  return {
    isValid: missingScopes.length === 0,
    missingScopes,
    presentScopes,
    hasConnectionScope,
    hasGatewayScope,
    hasItemScope,
    hasDataPipelineScope
  };
}

/**
 * Extract token scope information for display
 */
export function extractTokenScopeInfo(authResult: AuthenticationResult): TokenScopeInfo {
  const validation = validateTokenScopes(authResult);
  
  return {
    scopes: validation.presentScopes,
    hasAllRequiredScopes: validation.isValid,
    connectionReadWrite: validation.hasConnectionScope,
    gatewayReadWrite: validation.hasGatewayScope,
    hasItemScope: validation.hasItemScope,
    hasDataPipelineScope: validation.hasDataPipelineScope
  };
}

/**
 * Check if token has minimum required scopes
 */
export function hasMinimumRequiredScopes(authResult: AuthenticationResult): boolean {
  const validation = validateTokenScopes(authResult);
  // Require at least connection and gateway scopes for basic functionality
  return validation.hasConnectionScope && validation.hasGatewayScope;
}

/**
 * Get user-friendly scope names
 */
export function getScopeFriendlyNames(): Record<string, string> {
  return {
    [REQUIRED_SCOPES.CONNECTION]: 'Create and manage Fabric connections',
    [REQUIRED_SCOPES.GATEWAY]: 'Create and manage Fabric gateways',
    [REQUIRED_SCOPES.ITEM]: 'Create and manage Fabric items (pipelines, notebooks, etc.)',
    [REQUIRED_SCOPES.DATA_PIPELINE]: 'Create and manage Fabric data pipelines'
  };
}

/**
 * Format missing scopes message for user display
 */
export function formatMissingScopesMessage(missingScopes: string[]): string {
  if (missingScopes.length === 0) {
    return 'All required permissions are available.';
  }

  const friendlyNames = getScopeFriendlyNames();
  const missingScopeDescriptions = missingScopes
    .map(scope => friendlyNames[scope] || scope)
    .join(', ');

  return `Missing permissions: ${missingScopeDescriptions}. Please contact your administrator to grant these permissions.`;
}