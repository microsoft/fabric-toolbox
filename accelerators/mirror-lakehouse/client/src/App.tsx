import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { SnackbarProvider } from 'notistack'
import { QueryClient, QueryClientProvider } from 'react-query'
import { ensureMsalInitialized, logMsalDiagnostic, logMsalInfo, msalInstance } from './services/authService'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout/Layout'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import MirrorPage from './pages/MirrorPage'
import ValidationPage from './pages/ValidationPage'
import JobsPage from './pages/JobsPage'
import './App.css'

// Create Material-UI theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#f57c00',
      light: '#ffb74d',
      dark: '#e65100',
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
    error: {
      main: '#d32f2f',
    },
    warning: {
      main: '#ed6c02',
    },
    info: {
      main: '#0288d1',
    },
    success: {
      main: '#2e7d32',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
  },
})

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

const App: React.FC = () => {
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await ensureMsalInitialized()

        const response = await msalInstance.handleRedirectPromise()
        if (response?.account) {
          msalInstance.setActiveAccount(response.account)
          logMsalInfo('handleRedirectPromise returned account', {
            homeAccountId: response.account.homeAccountId,
            username: response.account.username,
            tenantId: response.account.tenantId
          })
          return
        }

        logMsalInfo('handleRedirectPromise returned no response')

        const activeAccount = msalInstance.getActiveAccount()
        const accounts = msalInstance.getAllAccounts()
        if (!activeAccount && accounts.length > 0) {
          msalInstance.setActiveAccount(accounts[0])
        }
      } catch (error) {
        logMsalDiagnostic('App initializeAuth failed', error, {
          location: window.location.href,
          accountCount: msalInstance.getAllAccounts().length,
          hasActiveAccount: !!msalInstance.getActiveAccount()
        })
      }
    }

    initializeAuth()

    // Hide initial loading spinner
    const loadingElement = document.getElementById('loading')
    if (loadingElement) {
      loadingElement.style.display = 'none'
    }
  }, [])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider 
        maxSnack={3} 
        anchorOrigin={{ 
          vertical: 'top', 
          horizontal: 'right' 
        }}
      >
        <QueryClientProvider client={queryClient}>
          <MsalProvider instance={msalInstance}>
            <AuthProvider>
              <Router>
                <div className="App">
                  <AuthenticatedTemplate>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/mirror" element={<MirrorPage />} />
                        <Route path="/validation" element={<ValidationPage />} />
                        <Route path="/jobs" element={<JobsPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </Layout>
                  </AuthenticatedTemplate>
                  
                  <UnauthenticatedTemplate>
                    <LoginPage />
                  </UnauthenticatedTemplate>
                </div>
              </Router>
            </AuthProvider>
          </MsalProvider>
        </QueryClientProvider>
      </SnackbarProvider>
    </ThemeProvider>
  )
}

export default App