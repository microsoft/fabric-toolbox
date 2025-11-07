import { Configuration, PopupRequest } from '@azure/msal-browser';

// Legacy MSAL configuration - kept for backward compatibility
// Most functionality has moved to msalTenantUtils.ts
export const msalConfig: Configuration = {
  auth: {
    clientId: '', // Client ID provided by user through UI
    authority: 'https://login.microsoftonline.com/common', // Default fallback, not used in tenant-specific mode
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '',
  },
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

// Legacy login request configuration - kept for backward compatibility
export const loginRequest: PopupRequest = {
  scopes: fabricScopes,
  prompt: 'select_account'
};

// Silent token acquisition request
export const silentRequest = {
  scopes: fabricScopes,
  forceRefresh: false
};
