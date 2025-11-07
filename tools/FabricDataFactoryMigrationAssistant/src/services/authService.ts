import { PublicClientApplication, PopupRequest, AuthenticationResult, IPublicClientApplication } from '@azure/msal-browser';
import { AuthState, ServicePrincipalAuth, isValidTokenResponse, isAzureADError, TenantConfig, InteractiveLoginConfig } from '../types';
import { fabricScopes } from '../lib/msalConfig';
import { 
  validateAndConfigureTenant, 
  createTenantSpecificMsalInstance,
  createTenantSpecificLoginRequest,
  createTenantSpecificSilentRequest
} from '../lib/msalTenantUtils';
import { isValidAuthState, extractErrorMessage, sanitizeString } from '../lib/authUtils';
import { validateAuthenticationResult, validateTokenScopes, TokenScopes } from '../lib/tokenUtils';

interface MSALAuthError extends Error {
  errorCode?: string;
  errorMessage?: string;
}

class AuthService {
  private msalInstances: Map<string, IPublicClientApplication> = new Map();
  private currentTenantConfig: TenantConfig | null = null;

  /**
   * Get or create MSAL instance for a specific tenant with optional application ID
   */
  private getMsalInstance(tenantConfig: TenantConfig, applicationId?: string): IPublicClientApplication {
    const key = `${tenantConfig.tenantId}-${applicationId || 'default'}`;
    
    if (!this.msalInstances.has(key)) {
      const instance = createTenantSpecificMsalInstance(tenantConfig, applicationId);
      this.msalInstances.set(key, instance);
    }
    
    return this.msalInstances.get(key)!;
  }

  /**
   * Configure authentication for a specific tenant
   */
  configureTenant(tenantId: string): TenantConfig {
    const tenantConfig = validateAndConfigureTenant(tenantId);
    
    if (tenantConfig.isValid) {
      this.currentTenantConfig = tenantConfig;
    }
    
    return tenantConfig;
  }

  /**
   * Get current tenant configuration
   */
  getCurrentTenantConfig(): TenantConfig | null {
    return this.currentTenantConfig;
  }

  async loginWithMicrosoft(loginConfig: InteractiveLoginConfig): Promise<AuthState> {
    try {
      // Validate and configure tenant
      const tenantConfig = this.configureTenant(loginConfig.tenantId);
      
      if (!tenantConfig.isValid) {
        throw new Error('Invalid tenant configuration. Please check your tenant ID.');
      }

      // Get tenant-specific MSAL instance with application ID
      const msalInstance = this.getMsalInstance(tenantConfig, loginConfig.applicationId);
      
      // Ensure MSAL is initialized
      await msalInstance.initialize();

      // Create tenant-specific login request with enhanced scopes
      const loginRequest = createTenantSpecificLoginRequest(tenantConfig);

      console.log('Initiating Microsoft login with scopes:', fabricScopes);

      // Launch the Microsoft login popup
      const response: AuthenticationResult = await msalInstance.loginPopup(loginRequest);
      
      if (!response || !response.accessToken) {
        throw new Error('Failed to obtain access token from Microsoft login');
      }

      // Validate the response structure
      if (!response.account?.homeAccountId || !response.account?.username) {
        throw new Error('Invalid authentication response - missing account information');
      }

      // Verify that the response is from the expected tenant
      if (response.account.tenantId !== tenantConfig.tenantId && 
          response.tenantId !== tenantConfig.tenantId) {
        console.warn(`Token issued for different tenant. Expected: ${tenantConfig.tenantId}, Got: ${response.account.tenantId || response.tenantId}`);
      }

      // Enhanced: Validate authentication result and scopes
      const authValidation = validateAuthenticationResult(response);
      if (!authValidation.isValid) {
        console.error('Authentication validation failed:', authValidation.error);
        throw new Error(`Authentication failed: ${authValidation.error}`);
      }

      console.log('Authentication successful with scopes:', {
        hasAllRequiredScopes: authValidation.tokenScopes.hasAllRequiredScopes,
        connectionReadWrite: authValidation.tokenScopes.connectionReadWrite,
        gatewayReadWrite: authValidation.tokenScopes.gatewayReadWrite,
        itemReadWrite: authValidation.tokenScopes.itemReadWrite,
        totalScopes: authValidation.tokenScopes.scopes.length
      });

      // Extract user information from the response
      const userInfo = {
        id: response.account.homeAccountId,
        name: response.account.name || response.account.username,
        email: response.account.username,
        tenantId: response.account.tenantId || response.tenantId || tenantConfig.tenantId
      };

      // Validate workspace access (simplified for demo)
      const hasContributorAccess = await this.validateWorkspaceAccess(response.accessToken, 'default-workspace');

      const authState: AuthState = {
        isAuthenticated: true,
        accessToken: response.accessToken,
        user: userInfo,
        workspaceId: 'default-workspace', // In real implementation, this would be selected/detected
        hasContributorAccess,
        tokenScopes: authValidation.tokenScopes // Add token scopes to auth state
      };

      return authState;
    } catch (error) {
      // Handle specific MSAL errors
      if (error && typeof error === 'object' && 'errorCode' in error) {
        const msalError = error as MSALAuthError;
        switch (msalError.errorCode) {
          case 'popup_window_error':
            throw new Error('Popup was blocked or closed. Please enable popups and try again.');
          case 'user_cancelled':
            throw new Error('Login was cancelled by user.');
          case 'access_denied':
            throw new Error('Access denied. Please ensure you have the required permissions.');
          case 'invalid_client':
            throw new Error('Invalid client configuration. Please contact support.');
          case 'invalid_scope':
            throw new Error('Invalid or insufficient scopes requested. The application may need additional permissions.');
          default:
            throw new Error(`Authentication failed: ${msalError.errorMessage || msalError.message}`);
        }
      }
      
      // Handle general errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
      throw new Error(`Microsoft login failed: ${errorMessage}`);
    }
  }

  async loginWithServicePrincipal(credentials: ServicePrincipalAuth): Promise<AuthState> {
    try {
      // Validate and sanitize input credentials
      const sanitizedCredentials = {
        tenantId: sanitizeString(credentials.tenantId),
        clientId: sanitizeString(credentials.clientId),
        clientSecret: sanitizeString(credentials.clientSecret)
      };

      if (!sanitizedCredentials.tenantId || !sanitizedCredentials.clientId || !sanitizedCredentials.clientSecret) {
        throw new Error('All service principal credentials are required');
      }

      const tokenEndpoint = `https://login.microsoftonline.com/${sanitizedCredentials.tenantId}/oauth2/v2.0/token`;
      
      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', sanitizedCredentials.clientId);
      formData.append('client_secret', sanitizedCredentials.clientSecret);
      // Enhanced: Use all required scopes for service principal authentication
      formData.append('scope', [
        'https://analysis.windows.net/powerbi/api/Connection.ReadWrite.All',
        'https://analysis.windows.net/powerbi/api/Gateway.ReadWrite.All',
        'https://analysis.windows.net/powerbi/api/Item.ReadWrite.All',
        'https://analysis.windows.net/powerbi/api/DataPipeline.ReadWrite.All'
      ].join(' '));

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'unknown_error' }));
        
        // Use type guard to check if it's a valid Azure AD error
        if (isAzureADError(errorData)) {
          switch (errorData.error) {
            case 'invalid_client':
              throw new Error('Invalid client ID or client secret');
            case 'invalid_grant':
              throw new Error('Invalid credentials or expired client secret');
            case 'unauthorized_client':
              throw new Error('Client not authorized for this grant type');
            default:
              throw new Error(`Authentication failed: ${errorData.error_description || 'Invalid credentials'}`);
          }
        } else {
          throw new Error('Authentication failed with unknown error format');
        }
      }

      const tokenResponse = await response.json();
      
      // Use type guard to validate token response
      if (!isValidTokenResponse(tokenResponse)) {
        throw new Error('Invalid token response format');
      }

      // Validate workspace access for service principal
      const hasContributorAccess = await this.validateWorkspaceAccess(tokenResponse.access_token, 'default-workspace');

      const authState: AuthState = {
        isAuthenticated: true,
        accessToken: tokenResponse.access_token,
        user: {
          id: sanitizedCredentials.clientId,
          name: 'Service Principal',
          email: `sp-${sanitizedCredentials.clientId}@tenant.com`,
          tenantId: sanitizedCredentials.tenantId
        },
        workspaceId: 'default-workspace',
        hasContributorAccess,
        tokenScopes: validateTokenScopes(tokenResponse.access_token) // Validate scopes for service principal too
      };

      return authState;
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      throw new Error(`Service principal authentication failed: ${errorMessage}`);
    }
  }

  async validateWorkspaceAccess(accessToken: string, workspaceId: string): Promise<boolean> {
    try {
      // Validate input parameters
      if (!accessToken || !workspaceId) {
        return false;
      }

      // In a real implementation, this would call the Fabric API to check permissions
      // Example: GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/roleAssignments
      const response = await fetch(`https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => null);

      // For demo purposes, simulate API response
      // In real implementation, check if user has Contributor or higher role
      if (!response || !response.ok) {
        console.warn('Could not validate workspace access - assuming access granted for demo');
        return true; // Allow access for demo purposes
      }

      // In real implementation, parse response and check role
      // const workspaceInfo = await response.json();
      // return workspaceInfo.userRole === 'Contributor' || workspaceInfo.userRole === 'Admin';
      
      return true; // Simplified for demo
    } catch (error) {
      console.error('Failed to validate workspace access:', error);
      return false;
    }
  }

  async refreshToken(currentToken: string): Promise<string> {
    try {
      if (!this.currentTenantConfig) {
        throw new Error('No tenant configuration available');
      }

      const msalInstance = this.getMsalInstance(this.currentTenantConfig);
      
      // Check if we have an active account in MSAL
      const accounts = msalInstance.getAllAccounts();
      
      if (accounts.length === 0) {
        throw new Error('No active account found');
      }

      const firstAccount = accounts[0];
      if (!firstAccount) {
        throw new Error('No valid account found');
      }

      const silentTokenRequest = {
        ...createTenantSpecificSilentRequest(this.currentTenantConfig),
        account: firstAccount
      };

      const response = await msalInstance.acquireTokenSilent(silentTokenRequest);
      
      if (!response || !response.accessToken) {
        throw new Error('Failed to refresh token');
      }

      return response.accessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // In case of failure, the user will need to re-authenticate
      throw new Error('Token refresh failed - please sign in again');
    }
  }

  logout(): void {
    try {
      // Clear all MSAL instances
      this.msalInstances.forEach(async (msalInstance) => {
        const accounts = msalInstance.getAllAccounts();
        const firstAccount = accounts[0];
        if (firstAccount) {
          msalInstance.logoutPopup({
            account: firstAccount,
            postLogoutRedirectUri: window.location.origin
          }).catch((error) => {
            console.error('MSAL logout failed:', error);
          });
        }
      });
      
      // Clear instance cache
      this.msalInstances.clear();
      this.currentTenantConfig = null;
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear local storage regardless of MSAL logout success
      localStorage.removeItem('authState');
    }
  }

  saveAuthState(authState: AuthState): void {
    localStorage.setItem('authState', JSON.stringify(authState));
  }

  loadAuthState(): AuthState | null {
    try {
      const stored = localStorage.getItem('authState');
      if (!stored) {
        return null;
      }
      
      const parsed = JSON.parse(stored);
      
      // Use the validation utility
      if (!isValidAuthState(parsed)) {
        console.warn('Invalid or expired auth state found in localStorage');
        localStorage.removeItem('authState');
        return null;
      }
      
      return parsed;
    } catch (error) {
      console.error('Failed to parse stored auth state:', error);
      localStorage.removeItem('authState');
      return null;
    }
  }
}

export const authService = new AuthService();