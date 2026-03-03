import { PublicClientApplication, Configuration, LogLevel } from '@azure/msal-browser'

// MSAL configuration
const msalConfig: Configuration = {
  auth: {
    clientId: process.env.REACT_APP_CLIENT_ID || '',
    authority: process.env.REACT_APP_AUTHORITY || `https://login.microsoftonline.com/${process.env.REACT_APP_TENANT_ID}`,
    redirectUri: process.env.REACT_APP_REDIRECT_URI || window.location.origin,
    postLogoutRedirectUri: process.env.REACT_APP_REDIRECT_URI || window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage', // This configures where your cache will be stored
    storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return
        }
        switch (level) {
          case LogLevel.Error:
            console.error(message)
            return
          case LogLevel.Info:
            console.info(message)
            return
          case LogLevel.Verbose:
            console.debug(message)
            return
          case LogLevel.Warning:
            console.warn(message)
            return
          default:
            return
        }
      }
    }
  }
}

// Create the MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig)

// Login request configuration
export const loginRequest = {
  scopes: [
    'https://api.fabric.microsoft.com/Item.ReadWrite.All',
    'https://api.fabric.microsoft.com/Workspace.ReadWrite.All',
    'openid',
    'profile',
    'email'
  ],
  prompt: 'select_account'
}

// Silent request configuration for token refresh
export const silentRequest = {
  scopes: [
    'https://api.fabric.microsoft.com/Item.ReadWrite.All',
    'https://api.fabric.microsoft.com/Workspace.ReadWrite.All'
  ],
  account: undefined as any, // Will be set dynamically
}

// Graph scopes for additional user information
export const graphRequest = {
  scopes: ['User.Read']
}

/**
 * Get access token for API calls
 */
export const getAccessToken = async (): Promise<string> => {
  const accounts = msalInstance.getAllAccounts()
  
  if (accounts.length === 0) {
    throw new Error('No accounts found')
  }

  const account = accounts[0]
  silentRequest.account = account

  try {
    const response = await msalInstance.acquireTokenSilent(silentRequest)
    return response.accessToken
  } catch (error) {
    console.warn('Silent token acquisition failed, falling back to interactive login')
    
    try {
      const response = await msalInstance.acquireTokenPopup(loginRequest)
      return response.accessToken
    } catch (interactiveError) {
      console.error('Interactive token acquisition failed:', interactiveError)
      throw new Error('Failed to acquire access token')
    }
  }
}

/**
 * Get user account information
 */
export const getUserAccount = () => {
  const accounts = msalInstance.getAllAccounts()
  return accounts.length > 0 ? accounts[0] : null
}

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return msalInstance.getAllAccounts().length > 0
}

/**
 * Sign out user
 */
export const signOut = async (): Promise<void> => {
  try {
    await msalInstance.logoutRedirect()
  } catch (error) {
    console.error('Sign out error:', error)
    throw error
  }
}

/**
 * Sign in user with redirect
 */
export const signInRedirect = async (): Promise<void> => {
  try {
    await msalInstance.loginRedirect(loginRequest)
  } catch (error) {
    console.error('Sign in redirect error:', error)
    throw error
  }
}

/**
 * Sign in user with popup
 */
export const signInPopup = async (): Promise<void> => {
  try {
    await msalInstance.loginPopup(loginRequest)
  } catch (error) {
    console.error('Sign in popup error:', error)
    throw error
  }
}