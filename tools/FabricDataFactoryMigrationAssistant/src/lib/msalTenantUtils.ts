import { Configuration, PopupRequest, IPublicClientApplication, PublicClientApplication } from '@azure/msal-browser';
import { TenantConfig } from '../types';

// Base MSAL configuration template
const baseMsalConfig: Omit<Configuration, 'auth'> = {
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: number, message: string, containsPii: boolean) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case 0: // Error
            console.error('MSAL Error:', message);
            break;
          case 1: // Warning
            console.warn('MSAL Warning:', message);
            break;
          case 2: // Info
            console.info('MSAL Info:', message);
            break;
          default:
            console.log('MSAL:', message);
            break;
        }
      }
    }
  }
};

// Required scopes for Microsoft Fabric API access - Enhanced with all required permissions
export const fabricScopes: string[] = [
  'https://analysis.windows.net/powerbi/api/Connection.ReadWrite.All',
  'https://analysis.windows.net/powerbi/api/DataPipeline.ReadWrite.All',
  'https://analysis.windows.net/powerbi/api/Gateway.ReadWrite.All',
  'https://analysis.windows.net/powerbi/api/Item.ReadWrite.All',
  'https://analysis.windows.net/powerbi/api/Workspace.ReadWrite.All',
  'openid',
  'profile',
  'email'
];

/**
 * Validates a tenant ID format and constructs authority URL
 */
export function validateAndConfigureTenant(tenantId: string): TenantConfig {
  const sanitizedTenantId = tenantId.trim();
  
  if (!sanitizedTenantId) {
    return {
      tenantId: '',
      authority: '',
      isValid: false
    };
  }

  // Accept GUID format or domain format (e.g., contoso.onmicrosoft.com)
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.onmicrosoft\.com$/i;
  const customDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]{1,253}[a-zA-Z0-9]$/;
  
  const isValidFormat = guidRegex.test(sanitizedTenantId) || 
                       domainRegex.test(sanitizedTenantId) ||
                       customDomainRegex.test(sanitizedTenantId);

  if (!isValidFormat) {
    return {
      tenantId: sanitizedTenantId,
      authority: '',
      isValid: false
    };
  }

  const authority = `https://login.microsoftonline.com/${sanitizedTenantId}`;
  
  return {
    tenantId: sanitizedTenantId,
    authority,
    isValid: true
  };
}

/**
 * Creates a tenant-specific MSAL configuration with user-provided application ID
 */
export function createTenantSpecificMsalConfig(tenantConfig: TenantConfig, applicationId?: string): Configuration {
  // Application ID is now required - no fallback to hard-coded CLIENT_ID
  if (!applicationId) {
    throw new Error('Application ID is required for MSAL configuration');
  }
  
  return {
    ...baseMsalConfig,
    auth: {
      clientId: applicationId,
      authority: tenantConfig.authority,
      redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
      postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    }
  };
}

/**
 * Creates a tenant-specific MSAL instance with user-provided application ID
 */
export function createTenantSpecificMsalInstance(tenantConfig: TenantConfig, applicationId?: string): IPublicClientApplication {
  const config = createTenantSpecificMsalConfig(tenantConfig, applicationId);
  return new PublicClientApplication(config);
}

/**
 * Creates a tenant-specific login request
 */
export function createTenantSpecificLoginRequest(tenantConfig: TenantConfig): PopupRequest {
  return {
    scopes: fabricScopes,
    prompt: 'select_account',
    authority: tenantConfig.authority
  };
}

/**
 * Creates a silent token request for a specific tenant
 */
export function createTenantSpecificSilentRequest(tenantConfig: TenantConfig) {
  return {
    scopes: fabricScopes,
    forceRefresh: false,
    authority: tenantConfig.authority
  };
}

/**
 * Validates tenant ID format and provides user-friendly error messages
 */
export function validateTenantIdInput(tenantId: string): { isValid: boolean; error?: string } {
  const trimmed = tenantId.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'Tenant ID is required' };
  }
  
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.onmicrosoft\.com$/i;
  const customDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]{1,253}[a-zA-Z0-9]$/;
  
  if (guidRegex.test(trimmed)) {
    return { isValid: true };
  }
  
  if (domainRegex.test(trimmed)) {
    return { isValid: true };
  }
  
  if (customDomainRegex.test(trimmed)) {
    return { isValid: true };
  }
  
  return { 
    isValid: false, 
    error: 'Invalid tenant format. Use tenant ID (GUID), domain.onmicrosoft.com, or custom domain' 
  };
}