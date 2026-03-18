import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { UserProfile, authApi } from '../services/apiService'
import { getUserAccount, getAccessToken } from '../services/authService'

interface AuthContextType {
  isAuthenticated: boolean
  user: UserProfile | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { instance } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUserProfile = useCallback(async (): Promise<void> => {
    if (!isAuthenticated) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      setError(null)
      
      // Get basic account info from MSAL
      const account = getUserAccount()
      if (!account) {
        throw new Error('No account information available')
      }

      // Try to get enhanced profile from API
      try {
        const response = await authApi.getMe()
        setUser(response.data)
      } catch (apiError) {
        console.warn('Failed to fetch enhanced user profile:', apiError)
        
        // Fallback to basic account info
        setUser({
          id: account.homeAccountId || account.localAccountId,
          email: account.username,
          name: account.name || account.username,
          tenantId: account.tenantId || '',
          roles: [],
          scopes: []
        })
      }
      
    } catch (err) {
      console.error('Failed to fetch user profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to load user profile')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  const refreshUser = async (): Promise<void> => {
    setLoading(true)
    await fetchUserProfile()
  }

  const signOut = async (): Promise<void> => {
    try {
      setUser(null)
      setError(null)
      await instance.logoutRedirect()
    } catch (err) {
      console.error('Sign out error:', err)
      setError(err instanceof Error ? err.message : 'Failed to sign out')
    }
  }

  // Fetch user profile when authentication state changes
  useEffect(() => {
    fetchUserProfile()
  }, [fetchUserProfile])

  // Set up token refresh logic
  useEffect(() => {
    if (!isAuthenticated) return

    const refreshInterval = setInterval(async () => {
      try {
        // Attempt to refresh token silently
        await getAccessToken()
      } catch (err) {
        console.warn('Token refresh failed:', err)
        // The API interceptor will handle redirect to login if needed
      }
    }, 5 * 60 * 1000) // Refresh every 5 minutes

    return () => clearInterval(refreshInterval)
  }, [isAuthenticated])

  const contextValue: AuthContextType = {
    isAuthenticated,
    user,
    loading,
    error,
    refreshUser,
    signOut
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}