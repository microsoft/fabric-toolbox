import { PublicClientApplication, Configuration, LogLevel } from '@azure/msal-browser'

type MsalLikeError = {
  name?: string
  message?: string
  errorCode?: string
  subError?: string
  correlationId?: string
  stack?: string
}

type MsalDebugEvent = {
  ts: string
  level: 'info' | 'error'
  context: string
  data: Record<string, unknown>
}

type MsalSilentError = {
  name?: string
  message?: string
  errorCode?: string
  subError?: string
}

const MSAL_DEBUG_STORAGE_KEY = 'lakehouse_msal_debug_events'
const MSAL_INTERACTION_GUARD_KEY = 'lakehouse_msal_redirect_in_progress'

const appendMsalDebugEvent = (event: MsalDebugEvent): void => {
  try {
    const existingRaw = sessionStorage.getItem(MSAL_DEBUG_STORAGE_KEY)
    const existing = existingRaw ? (JSON.parse(existingRaw) as MsalDebugEvent[]) : []
    const next = [...existing.slice(-99), event]
    sessionStorage.setItem(MSAL_DEBUG_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage issues in debug logging
  }
}

export const getMsalDebugEvents = (): MsalDebugEvent[] => {
  try {
    const raw = sessionStorage.getItem(MSAL_DEBUG_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as MsalDebugEvent[]) : []
  } catch {
    return []
  }
}

export const clearMsalDebugEvents = (): void => {
  try {
    sessionStorage.removeItem(MSAL_DEBUG_STORAGE_KEY)
  } catch {
    // Ignore storage issues in debug logging
  }
}

const isInteractionRequiredError = (error: unknown): boolean => {
  const details = error as MsalSilentError
  const normalized = `${details?.name || ''} ${details?.errorCode || ''} ${details?.subError || ''} ${details?.message || ''}`.toLowerCase()

  return [
    'interaction_required',
    'login_required',
    'consent_required',
    'no_tokens_found',
    'monitor_window_timeout',
    'block_iframe_reload'
  ].some(token => normalized.includes(token))
}

const canStartInteractiveRedirect = (): boolean => {
  try {
    const raw = sessionStorage.getItem(MSAL_INTERACTION_GUARD_KEY)
    if (!raw) {
      return true
    }

    const startedAt = Number(raw)
    if (!Number.isFinite(startedAt)) {
      return true
    }

    return (Date.now() - startedAt) > 15000
  } catch {
    return true
  }
}

const markInteractiveRedirectStart = (): void => {
  try {
    sessionStorage.setItem(MSAL_INTERACTION_GUARD_KEY, String(Date.now()))
  } catch {
    // Ignore storage issues
  }
}

const clearInteractiveRedirectGuard = (): void => {
  try {
    sessionStorage.removeItem(MSAL_INTERACTION_GUARD_KEY)
  } catch {
    // Ignore storage issues
  }
}

export const logMsalInfo = (
  context: string,
  extra: Record<string, unknown> = {}
): void => {
  const payload = {
    ...extra,
    location: window.location.href
  }

  appendMsalDebugEvent({
    ts: new Date().toISOString(),
    level: 'info',
    context,
    data: payload
  })

  console.info(`[MSAL] ${context}`, payload)
}

export const logMsalDiagnostic = (
  context: string,
  error: unknown,
  extra: Record<string, unknown> = {}
): void => {
  const details = error as MsalLikeError
  const payload = {
    name: details?.name,
    message: details?.message,
    errorCode: details?.errorCode,
    subError: details?.subError,
    correlationId: details?.correlationId,
    stack: details?.stack,
    location: window.location.href,
    ...extra
  }

  appendMsalDebugEvent({
    ts: new Date().toISOString(),
    level: 'error',
    context,
    data: payload
  })

  console.error(`[MSAL] ${context}`, payload)
}

if (typeof window !== 'undefined') {
  ;(window as Window & { dumpMsalDebugEvents?: () => MsalDebugEvent[] }).dumpMsalDebugEvents = getMsalDebugEvents
}

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
let msalInitializePromise: Promise<void> | null = null

export const ensureMsalInitialized = async (): Promise<void> => {
  if (!msalInitializePromise) {
    msalInitializePromise = msalInstance.initialize()
  }

  await msalInitializePromise
}

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
  ]
}

// Graph scopes for additional user information
export const graphRequest = {
  scopes: ['User.Read']
}

/**
 * Get access token for API calls
 */
export const getAccessToken = async (): Promise<string> => {
  await ensureMsalInitialized()

  const activeAccount = msalInstance.getActiveAccount()
  const accounts = msalInstance.getAllAccounts()
  const account = activeAccount || accounts[0]
  
  if (!account) {
    throw new Error('No accounts found')
  }

  if (!activeAccount) {
    msalInstance.setActiveAccount(account)
  }

  const tokenSilentRequest = {
    ...silentRequest,
    account
  }

  try {
    const response = await msalInstance.acquireTokenSilent(tokenSilentRequest)
    clearInteractiveRedirectGuard()
    return response.accessToken
  } catch (error) {
    logMsalDiagnostic('acquireTokenSilent failed', error, {
      accountId: account.homeAccountId,
      username: account.username,
      scopes: tokenSilentRequest.scopes,
      accountCount: accounts.length,
      hasActiveAccount: !!activeAccount,
      location: window.location.href
    })

    if (isInteractionRequiredError(error)) {
      const interactionError = new Error('MSAL_INTERACTION_REQUIRED')
      interactionError.name = (error as MsalSilentError)?.errorCode || 'interaction_required'
      throw interactionError
    }

    throw new Error('Failed to acquire access token silently')
  }
}

/**
 * Get user account information
 */
export const getUserAccount = () => {
  const activeAccount = msalInstance.getActiveAccount()
  if (activeAccount) {
    return activeAccount
  }

  const accounts = msalInstance.getAllAccounts()
  const account = accounts.length > 0 ? accounts[0] : null
  if (account) {
    msalInstance.setActiveAccount(account)
  }

  return account
}

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return !!msalInstance.getActiveAccount() || msalInstance.getAllAccounts().length > 0
}

/**
 * Sign out user
 */
export const signOut = async (): Promise<void> => {
  try {
    await msalInstance.logoutRedirect()
  } catch (error) {
    logMsalDiagnostic('logoutRedirect failed', error, {
      location: window.location.href
    })
    throw error
  }
}

/**
 * Sign in user with redirect
 */
export const signInRedirect = async (): Promise<void> => {
  try {
    logMsalInfo('loginRedirect start', {
      scopes: loginRequest.scopes,
      prompt: loginRequest.prompt,
      accountCount: msalInstance.getAllAccounts().length,
      hasActiveAccount: !!msalInstance.getActiveAccount()
    })
    await msalInstance.loginRedirect(loginRequest)
  } catch (error) {
    logMsalDiagnostic('loginRedirect failed', error, {
      scopes: loginRequest.scopes,
      location: window.location.href
    })
    throw error
  }
}

export const beginInteractiveReauth = async (reason: string): Promise<void> => {
  await ensureMsalInitialized()

  if (!canStartInteractiveRedirect()) {
    logMsalInfo('Interactive reauth skipped due to redirect guard', { reason })
    return
  }

  markInteractiveRedirectStart()
  logMsalInfo('Interactive reauth via loginRedirect', {
    reason,
    accountCount: msalInstance.getAllAccounts().length,
    hasActiveAccount: !!msalInstance.getActiveAccount(),
    scopes: loginRequest.scopes
  })

  await msalInstance.loginRedirect(loginRequest)
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