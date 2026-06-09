import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Autocomplete,
  TextField,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material'
import { workspaceApi, Workspace } from '../../services/apiService'
import { MirrorFormData } from '../../pages/MirrorPage'

interface WorkspaceSelectionProps {
  formData: MirrorFormData
  updateFormData: (updates: Partial<MirrorFormData>) => void
}

const WorkspaceSelection: React.FC<WorkspaceSelectionProps> = ({
  formData,
  updateFormData,
}) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Load workspaces on component mount
  useEffect(() => {
    loadWorkspaces()
  }, [])

  const loadWorkspaces = async (query?: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = query 
        ? await workspaceApi.search(query, 50)
        : await workspaceApi.getAll()
      setWorkspaces(response.data.workspaces)
    } catch (err: any) {
      let errorMessage = 'Failed to load workspaces'
      
      if (err.response?.status === 401) {
        errorMessage = 'Authentication required. Please sign in again.'
      } else if (err.response?.status === 403) {
        errorMessage = 'Insufficient permissions. Please ensure you have access to Microsoft Fabric workspaces and the required Fabric API scopes are granted.'
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message
      }
      
      setError(errorMessage)
      console.error('Error loading workspaces:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle search with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm) {
        loadWorkspaces(searchTerm)
      } else {
        loadWorkspaces()
      }
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [searchTerm])

  const handleSourceWorkspaceChange = (workspace: Workspace | null) => {
    updateFormData({
      sourceWorkspaceId: workspace?.id || '',
      sourceWorkspaceName: workspace?.name || '',
      sourceLakehouseId: '', // Reset lakehouse when workspace changes
      sourceLakehouseName: ''
    })
  }

  const handleDestinationWorkspaceChange = (workspace: Workspace | null) => {
    updateFormData({
      destinationWorkspaceId: workspace?.id || '',
      destinationWorkspaceName: workspace?.name || '',
      destinationLakehouseId: '', // Reset lakehouse when workspace changes
      destinationLakehouseName: ''
    })
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Select Source and Destination Workspaces
        </Typography>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Select Source and Destination Workspaces
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose the Microsoft Fabric workspaces that contain your source and destination lakehouses.
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" gutterBottom color="primary">
              Source Workspace
            </Typography>
            <Autocomplete
              options={workspaces}
              getOptionLabel={(option) => option.name}
              value={workspaces.find(w => w.id === formData.sourceWorkspaceId) || null}
              onChange={(_, workspace) => handleSourceWorkspaceChange(workspace)}
              loading={loading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search and select source workspace"
                  placeholder="Type workspace name..."
                  variant="outlined"
                  fullWidth
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <Box>
                    <Typography variant="body1">{option.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.type} • {option.isOnDedicatedCapacity ? 'Premium' : 'Shared'}
                    </Typography>
                  </Box>
                </Box>
              )}
              noOptionsText={loading ? "Loading workspaces..." : "No workspaces found"}
            />
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" gutterBottom color="primary">
              Destination Workspace
            </Typography>
            <Autocomplete
              options={workspaces}
              getOptionLabel={(option) => option.name}
              value={workspaces.find(w => w.id === formData.destinationWorkspaceId) || null}
              onChange={(_, workspace) => handleDestinationWorkspaceChange(workspace)}
              loading={loading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search and select destination workspace"
                  placeholder="Type workspace name..."
                  variant="outlined"
                  fullWidth
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props}>
                  <Box>
                    <Typography variant="body1">{option.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.type} • {option.isOnDedicatedCapacity ? 'Premium' : 'Shared'}
                    </Typography>
                  </Box>
                </Box>
              )}
              noOptionsText={loading ? "Loading workspaces..." : "No workspaces found"}
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default WorkspaceSelection