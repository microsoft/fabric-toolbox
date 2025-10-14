import { AuthenticationResult } from '@azure/msal-browser';

/**
 * Interface for token scope validation results
 */
export interface TokenScopes {
  connectionReadWrite: boolean;
  gatewayReadWrite: boolean;
  itemReadWrite: boolean;
  hasAllRequiredScopes: boolean;
  scopes: string[];
}

/**
 * Interface for decoded JWT token
 */
export interface DecodedToken {
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  scp: string;
  sub: string;
  tenant_id?: string;
  oid?: string;
  upn?: string;
  name?: string;
  email?: string;
}

/**
 * Interface for authentication validation result
 */
export interface AuthValidationResult {
  isValid: boolean;
  tokenScopes: TokenScopes;
  error?: string;
}

/**
 * Decode JWT token without verification (for client-side inspection only)
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded as DecodedToken;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
}

/**
 * Check if token has expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return decoded.exp < now;
  } catch (error) {
    return true;
  }
}

/**
 * Validate token scopes for Fabric API access
 */
export function validateTokenScopes(token: string): TokenScopes {
  const defaultResult: TokenScopes = {
    connectionReadWrite: false,
    gatewayReadWrite: false,
    itemReadWrite: false,
    hasAllRequiredScopes: false,
    scopes: []
  };

  try {
    const decoded = decodeToken(token);
    if (!decoded) {
      console.warn('Unable to decode token for scope validation');
      return defaultResult;
    }

    // Extract scopes from the token
    const scopeString = decoded.scp || '';
    if (!scopeString) {
      console.warn('No scopes found in token');
      return defaultResult;
    }

    const scopes = scopeString.split(' ').filter(scope => scope && scope.length > 0);

    // Check for required scopes
    const connectionReadWrite = scopes.includes('Connection.ReadWrite.All');
    const gatewayReadWrite = scopes.includes('Gateway.ReadWrite.All');
    const itemReadWrite = scopes.includes('Item.ReadWrite.All');
    const hasAllRequiredScopes = connectionReadWrite && gatewayReadWrite && itemReadWrite;

    return {
      connectionReadWrite,
      gatewayReadWrite,
      itemReadWrite,
      hasAllRequiredScopes,
      scopes
    };
  } catch (error) {
    console.error('Error validating token scopes:', error);
    return defaultResult;
  }
}

/**
 * Validate authentication result and extract scope information
 */
export function validateAuthResult(authResult: AuthenticationResult): AuthValidationResult {
  try {
    if (!authResult || !authResult.accessToken) {
      return {
        isValid: false,
        tokenScopes: {
          connectionReadWrite: false,
          gatewayReadWrite: false,
          itemReadWrite: false,
          hasAllRequiredScopes: false,
          scopes: []
        },
        error: 'No access token found in authentication result'
      };
    }

    // Check if token is expired
    if (isTokenExpired(authResult.accessToken)) {
      return {
        isValid: false,
        tokenScopes: {
          connectionReadWrite: false,
          gatewayReadWrite: false,
          itemReadWrite: false,
          hasAllRequiredScopes: false,
          scopes: []
        },
        error: 'Access token has expired'
      };
    }

    // Validate scopes
    const tokenScopes = validateTokenScopes(authResult.accessToken);

    return {
      isValid: true,
      tokenScopes
    };
  } catch (error) {
    console.error('Error validating authentication result:', error);
    return {
      isValid: false,
      tokenScopes: {
        connectionReadWrite: false,
        gatewayReadWrite: false,
        itemReadWrite: false,
        hasAllRequiredScopes: false,
        scopes: []
      },
      error: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}

/**
 * Extract user information from token safely
 */
export function extractUserInfoFromToken(token: string): {
  id?: string;
  name?: string;
  email?: string;
  tenantId?: string;
} {
  try {
    const decoded = decodeToken(token);
    if (!decoded) {
      return {};
    }

    return {
      id: decoded.oid || decoded.sub,
      name: decoded.name,
      email: decoded.email || decoded.upn,
      tenantId: decoded.tenant_id
    };
  } catch (error) {
    console.error('Error extracting user info from token:', error);
    return {};
  }
}

/**
 * Get scope display names for UI
 */
export function getScopeDisplayNames(scopes: string[]): { scope: string; displayName: string; hasPermission: boolean }[] {
  const safeScopes = scopes || [];
  const scopeMap = {
    'Connection.ReadWrite.All': 'Create and manage connections',
    'Gateway.ReadWrite.All': 'Create and manage gateways',
    'Item.ReadWrite.All': 'Create and manage workspace items'
  };

  return Object.entries(scopeMap).map(([scope, displayName]) => ({
    scope,
    displayName,
    hasPermission: safeScopes.includes(scope)
  }));
}

/**
 * Format scopes for display in UI
 */
export function formatScopesForDisplay(scopes: string[]): string {
  const safeScopes = scopes || [];
  if (safeScopes.length === 0) {
    return 'No scopes available';
  }
  
  const displayScopes = getScopeDisplayNames(safeScopes);
  return displayScopes
    .filter(item => item.hasPermission)
    .map(item => item.displayName)
    .join(', ');
}

/**
 * Get description of missing scopes
 */
export function getMissingScopesDescription(scopes: string[]): string {
  const safeScopes = scopes || [];
  const displayScopes = getScopeDisplayNames(safeScopes);
  const missingScopes = displayScopes.filter(item => !item.hasPermission);
  
  if (missingScopes.length === 0) {
    return 'All required permissions are available';
  }
  
  return `Missing permissions: ${missingScopes.map(item => item.displayName).join(', ')}`;
}

/**
 * Validate authentication result (alias for validateAuthResult for backward compatibility)
 */
export function validateAuthenticationResult(authResult: AuthenticationResult): AuthValidationResult {
  return validateAuthResult(authResult);
}

/**
 * Extract scopes from token for validation
 */
export function extractScopesFromToken(token: string): string[] {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.scp) {
      return [];
    }
    return decoded.scp.split(' ').filter(scope => scope && scope.length > 0);
  } catch (error) {
    console.error('Error extracting scopes from token:', error);
    return [];
  }
}

/**
 * Check if an error is due to insufficient scopes
 */
export function isInsufficientScopesError(error: any): boolean {
  if (!error) return false;
  
  // Check for common insufficient scope error patterns
  const errorMessage = error.message || error.error_description || '';
  const errorCode = error.error || error.code || '';
  
  return (
    errorCode === 'insufficient_scopes' ||
    errorCode === 'AADSTS65001' ||
    errorMessage.toLowerCase().includes('insufficient') ||
    errorMessage.toLowerCase().includes('scope') ||
    errorMessage.toLowerCase().includes('permission')
  );
}

/**
 * Inspect token and return detailed information for debugging
 */
export function inspectToken(token: string): {
  isValid: boolean;
  isExpired: boolean;
  scopes: string[];
  claims: Record<string, any>;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    tenantId?: string;
  };
} {
  try {
    const decoded = decodeToken(token);
    
    if (!decoded) {
      return {
        isValid: false,
        isExpired: true,
        scopes: [],
        claims: {}
      };
    }

    const scopes = decoded.scp ? decoded.scp.split(' ').filter(s => s) : [];
    const expired = isTokenExpired(token);
    
    return {
      isValid: !expired,
      isExpired: expired,
      scopes,
      claims: decoded,
      user: extractUserInfoFromToken(token)
    };
  } catch (error) {
    console.error('Error inspecting token:', error);
    return {
      isValid: false,
      isExpired: true,
      scopes: [],
      claims: {}
    };
  }
}

/**
 * Get scope descriptions for UI display
 */
export function getScopeDescriptions(): { [key: string]: string } {
  return {
    'Connection.ReadWrite.All': 'Create and manage connections to data sources',
    'Gateway.ReadWrite.All': 'Create and manage data gateways',
    'Item.ReadWrite.All': 'Create and manage workspace items (pipelines, datasets, etc.)',
    'Workspace.ReadWrite.All': 'Access and modify workspace content',
    'Dataset.ReadWrite.All': 'Create and manage datasets',
    'Pipeline.ReadWrite.All': 'Create and manage data pipelines'
  };
}