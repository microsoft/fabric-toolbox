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
import { workspaceApi, Lakehouse } from '../../services/apiService'
import { MirrorFormData } from '../../pages/MirrorPage'

interface LakehouseSelectionProps {
  formData: MirrorFormData
  updateFormData: (updates: Partial<MirrorFormData>) => void
}

const LakehouseSelection: React.FC<LakehouseSelectionProps> = ({
  formData,
  updateFormData,
}) => {
  const [sourceLakehouses, setSourceLakehouses] = useState<Lakehouse[]>([])
  const [destinationLakehouses, setDestinationLakehouses] = useState<Lakehouse[]>([])
  const [sourceLoading, setSourceLoading] = useState(false)
  const [destinationLoading, setDestinationLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load source lakehouses when source workspace is selected
  useEffect(() => {
    if (formData.sourceWorkspaceId) {
      loadSourceLakehouses(formData.sourceWorkspaceId)
    } else {
      setSourceLakehouses([])
      updateFormData({ sourceLakehouseId: '', sourceLakehouseName: '' })
    }
  }, [formData.sourceWorkspaceId, updateFormData])

  // Load destination lakehouses when destination workspace is selected
  useEffect(() => {
    if (formData.destinationWorkspaceId) {
      loadDestinationLakehouses(formData.destinationWorkspaceId)
    } else {
      setDestinationLakehouses([])
      updateFormData({ destinationLakehouseId: '', destinationLakehouseName: '' })
    }
  }, [formData.destinationWorkspaceId, updateFormData])

  const loadSourceLakehouses = async (workspaceId: string) => {
    setSourceLoading(true)
    setError(null)
    try {
      const response = await workspaceApi.getLakehouses(workspaceId)
      setSourceLakehouses(response.data.lakehouses)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load source lakehouses')
      console.error('Error loading source lakehouses:', err)
    } finally {
      setSourceLoading(false)
    }
  }

  const loadDestinationLakehouses = async (workspaceId: string) => {
    setDestinationLoading(true)
    setError(null)
    try {
      const response = await workspaceApi.getLakehouses(workspaceId)
      setDestinationLakehouses(response.data.lakehouses)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load destination lakehouses')
      console.error('Error loading destination lakehouses:', err)
    } finally {
      setDestinationLoading(false)
    }
  }

  const handleSourceLakehouseChange = (lakehouse: Lakehouse | null) => {
    updateFormData({
      sourceLakehouseId: lakehouse?.id || '',
      sourceLakehouseName: lakehouse?.name || ''
    })
  }

  const handleDestinationLakehouseChange = (lakehouse: Lakehouse | null) => {
    updateFormData({
      destinationLakehouseId: lakehouse?.id || '',
      destinationLakehouseName: lakehouse?.name || ''
    })
  }

  const canSelectLakehouses = formData.sourceWorkspaceId && formData.destinationWorkspaceId

  if (error) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Select Source and Destination Lakehouses
        </Typography>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      </Box>
    )
  }

  if (!canSelectLakehouses) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Select Source and Destination Lakehouses
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Please select both source and destination workspaces first.
        </Typography>
        
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Workspace selection is required before choosing lakehouses.
          </Typography>
        </Paper>
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Select Source and Destination Lakehouses
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose the specific lakehouses within your selected workspaces.
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" gutterBottom color="primary">
              Source Lakehouse
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              From: {formData.sourceWorkspaceName}
            </Typography>
            <Autocomplete
              options={sourceLakehouses}
              getOptionLabel={(option) => option.name}
              value={sourceLakehouses.find(l => l.id === formData.sourceLakehouseId) || null}
              onChange={(_, lakehouse) => handleSourceLakehouseChange(lakehouse)}
              loading={sourceLoading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select source lakehouse"
                  placeholder="Choose lakehouse..."
                  variant="outlined"
                  fullWidth
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {sourceLoading ? <CircularProgress color="inherit" size={20} /> : null}
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
                      {option.type} • Created: {new Date(option.createdDate).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>
              )}
              noOptionsText={sourceLoading ? "Loading lakehouses..." : "No lakehouses found"}
            />
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" gutterBottom color="primary">
              Destination Lakehouse
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              To: {formData.destinationWorkspaceName}
            </Typography>
            <Autocomplete
              options={destinationLakehouses}
              getOptionLabel={(option) => option.name}
              value={destinationLakehouses.find(l => l.id === formData.destinationLakehouseId) || null}
              onChange={(_, lakehouse) => handleDestinationLakehouseChange(lakehouse)}
              loading={destinationLoading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select destination lakehouse"
                  placeholder="Choose lakehouse..."
                  variant="outlined"
                  fullWidth
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {destinationLoading ? <CircularProgress color="inherit" size={20} /> : null}
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
                      {option.type} • Created: {new Date(option.createdDate).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>
              )}
              noOptionsText={destinationLoading ? "Loading lakehouses..." : "No lakehouses found"}
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default LakehouseSelection