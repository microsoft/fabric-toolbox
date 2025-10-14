/**
 * TypeScript interfaces for MSAL authentication responses
 * These interfaces ensure type safety when handling authentication data
 */

/**
 * MSAL Account information
 */
export interface MSALAccount {
  homeAccountId: string;
  environment: string;
  tenantId: string;
  username: string;
  name?: string;
  localAccountId: string;
  idTokenClaims?: {
    aud?: string;
    iss?: string;
    iat?: number;
    nbf?: number;
    exp?: number;
    name?: string;
    preferred_username?: string;
    oid?: string;
    tid?: string;
    sub?: string;
    email?: string;
    emails?: string[];
  };
}

/**
 * MSAL Authentication Result
 */
export interface MSALAuthResult {
  accessToken: string;
  account: MSALAccount | null;
  authority: string;
  correlationId: string;
  expiresOn: Date | null;
  extExpiresOn?: Date;
  familyId?: string;
  fromCache: boolean;
  idToken: string;
  idTokenClaims: Record<string, any>;
  scopes: string[];
  tenantId: string;
  uniqueId: string;
  tokenType: string;
  state?: string;
}

/**
 * OAuth Token Response for Service Principal
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  ext_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  error_codes?: number[];
  timestamp?: string;
  trace_id?: string;
  correlation_id?: string;
}

/**
 * Azure AD Error Response
 */
export interface AzureADError {
  error: string;
  error_description?: string;
  error_codes?: number[];
  timestamp?: string;
  trace_id?: string;
  correlation_id?: string;
  error_uri?: string;
}

/**
 * Microsoft Fabric API Error Response
 */
export interface FabricAPIError {
  error: {
    code: string;
    message: string;
    details?: Array<{
      code: string;
      message: string;
      target?: string;
    }>;
  };
}

/**
 * Type guard for MSAL Account
 */
export function isValidMSALAccount(obj: any): obj is MSALAccount {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.homeAccountId === 'string' &&
    typeof obj.environment === 'string' &&
    typeof obj.tenantId === 'string' &&
    typeof obj.username === 'string' &&
    typeof obj.localAccountId === 'string'
  );
}

/**
 * Type guard for Token Response
 */
export function isValidTokenResponse(obj: any): obj is TokenResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.access_token === 'string' &&
    typeof obj.token_type === 'string' &&
    typeof obj.expires_in === 'number'
  );
}

/**
 * Type guard for Azure AD Error
 */
export function isAzureADError(obj: any): obj is AzureADError {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.error === 'string'
  );
}

/**
 * Type guard for Fabric API Error
 */
export function isFabricAPIError(obj: any): obj is FabricAPIError {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.error === 'object' &&
    obj.error !== null &&
    typeof obj.error.code === 'string' &&
    typeof obj.error.message === 'string'
  );
}