import React, { useState } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  Container,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material'
import {
  Microsoft as MicrosoftIcon,
  Security as SecurityIcon,
  Cloud as CloudIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material'
import { useMsal } from '@azure/msal-react'
import { loginRequest } from '../services/authService'

const LoginPage: React.FC = () => {
  const { instance } = useMsal()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      await instance.loginRedirect(loginRequest)
    } catch (err) {
      console.error('Login failed:', err)
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  const features = [
    {
      icon: <CloudIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
      title: 'Microsoft Fabric Integration',
      description: 'Seamlessly connect to your Microsoft Fabric workspaces and lakehouses'
    },
    {
      icon: <SpeedIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
      title: 'Efficient Schema Shortcuts',
      description: 'Create schema shortcuts to mirror lakehouse structures quickly and efficiently'
    },
    {
      icon: <SecurityIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
      title: 'Secure Authentication',
      description: 'Enterprise-grade security with Microsoft Entra ID authentication'
    }
  ]

  return (
    <Container maxWidth="lg">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 1200 }}>
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography
              variant="h3"
              component="h1"
              fontWeight="bold"
              color="primary"
              gutterBottom
            >
              Lakehouse Mirror
            </Typography>
            <Typography
              variant="h6"
              color="text.secondary"
              sx={{ maxWidth: 600, mx: 'auto' }}
            >
              Mirror Microsoft Fabric lakehouses using schema shortcuts. 
              Replicate lakehouse structures efficiently and validate differences.
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
              gap: 4,
              alignItems: 'center',
            }}
          >
            {/* Login Card */}
            <Paper
              elevation={4}
              sx={{
                p: 4,
                borderRadius: 3,
                textAlign: 'center',
                order: { xs: 1, lg: 0 },
              }}
            >
              <Box sx={{ mb: 3 }}>
                <MicrosoftIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                <Typography variant="h5" fontWeight="600" gutterBottom>
                  Sign In to Continue
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Use your Microsoft Entra ID credentials to access your Fabric workspaces
                </Typography>
              </Box>

              {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {error}
                </Alert>
              )}

              <Button
                variant="contained"
                size="large"
                fullWidth
                onClick={handleLogin}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : <MicrosoftIcon />}
                sx={{
                  py: 1.5,
                  fontSize: '1rem',
                  borderRadius: 2,
                }}
              >
                {loading ? 'Signing in...' : 'Sign in with Microsoft'}
              </Button>

              <Divider sx={{ my: 3 }} />

              <Typography variant="caption" color="text.secondary">
                By signing in, you agree to our terms of service and privacy policy.
                This application requires access to your Microsoft Fabric workspaces.
              </Typography>
            </Paper>

            {/* Features */}
            <Box>
              <Typography
                variant="h4"
                fontWeight="600"
                gutterBottom
                sx={{ mb: 4 }}
              >
                Key Features
              </Typography>

              <Box sx={{ space: 3 }}>
                {features.map((feature, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 2,
                      mb: index < features.length - 1 ? 4 : 0,
                    }}
                  >
                    <Box sx={{ flexShrink: 0 }}>
                      {feature.icon}
                    </Box>
                    <Box>
                      <Typography variant="h6" fontWeight="600" gutterBottom>
                        {feature.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {feature.description}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          {/* Additional Info */}
          <Box sx={{ textAlign: 'center', mt: 8 }}>
            <Typography variant="h6" fontWeight="600" gutterBottom>
              What is Lakehouse Mirror?
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ maxWidth: 800, mx: 'auto', lineHeight: 1.7 }}
            >
              Lakehouse Mirror is a powerful tool designed to help you replicate Microsoft Fabric 
              lakehouse structures using schema shortcuts. Instead of copying data, it creates 
              efficient pointers to the original tables, allowing you to maintain synchronized 
              views across multiple lakehouses while minimizing storage costs and complexity.
            </Typography>
          </Box>

          {/* Process Overview */}
          <Box sx={{ mt: 6 }}>
            <Typography
              variant="h6"
              fontWeight="600"
              textAlign="center"
              gutterBottom
            >
              How It Works
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' },
                gap: 3,
                mt: 4,
              }}
            >
              {[
                { step: '1', title: 'Select Source', desc: 'Choose your source workspace and lakehouse' },
                { step: '2', title: 'Choose Destination', desc: 'Select target workspace and lakehouse' },
                { step: '3', title: 'Mirror Schemas', desc: 'Create schema shortcuts automatically' },
                { step: '4', title: 'Validate Results', desc: 'Compare and verify the mirroring results' },
              ].map((item, index) => (
                <Paper
                  key={index}
                  sx={{
                    p: 3,
                    textAlign: 'center',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                  elevation={0}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                      mb: 2,
                      fontWeight: 'bold',
                    }}
                  >
                    {item.step}
                  </Box>
                  <Typography variant="subtitle1" fontWeight="600" gutterBottom>
                    {item.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.desc}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Container>
  )
}

export default LoginPage