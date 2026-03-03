import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import { Lakehouse, workspaceApi, Workspace } from '../../services/apiService'
import { MirrorFormData } from '../../pages/MirrorPage'

interface WorkspaceLakehouseSelectionProps {
  mode: 'source' | 'destination'
  formData: MirrorFormData
  updateFormData: (updates: Partial<MirrorFormData>) => void
}

const WorkspaceLakehouseSelection: React.FC<WorkspaceLakehouseSelectionProps> = ({
  mode,
  formData,
  updateFormData,
}) => {
  const isSource = mode === 'source'

  const workspaceId = isSource ? formData.sourceWorkspaceId : formData.destinationWorkspaceId
  const workspaceName = isSource ? formData.sourceWorkspaceName : formData.destinationWorkspaceName
  const lakehouseId = isSource ? formData.sourceLakehouseId : formData.destinationLakehouseId

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [lakehouses, setLakehouses] = useState<Lakehouse[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [lakehousesLoading, setLakehousesLoading] = useState(false)
  const [creatingLakehouse, setCreatingLakehouse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [newLakehouseName, setNewLakehouseName] = useState('')

  const title = isSource
    ? 'Select Source Workspace and Lakehouse'
    : 'Select Destination Workspace and Lakehouse'

  const subtitle = isSource
    ? 'Choose the source workspace first, then select the source lakehouse in that workspace.'
    : 'Choose the destination workspace first, then select or create the destination lakehouse.'

  const selectedWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.id === workspaceId) || null,
    [workspaces, workspaceId]
  )

  const selectedLakehouse = useMemo(
    () => lakehouses.find(lakehouse => lakehouse.id === lakehouseId) || null,
    [lakehouses, lakehouseId]
  )

  const updateWorkspaceSelection = (workspace: Workspace | null) => {
    if (isSource) {
      updateFormData({
        sourceWorkspaceId: workspace?.id || '',
        sourceWorkspaceName: workspace?.name || '',
        sourceLakehouseId: '',
        sourceLakehouseName: '',
      })
      return
    }

    updateFormData({
      destinationWorkspaceId: workspace?.id || '',
      destinationWorkspaceName: workspace?.name || '',
      destinationLakehouseId: '',
      destinationLakehouseName: '',
    })
  }

  const updateLakehouseSelection = (lakehouse: Lakehouse | null) => {
    if (isSource) {
      updateFormData({
        sourceLakehouseId: lakehouse?.id || '',
        sourceLakehouseName: lakehouse?.name || '',
      })
      return
    }

    updateFormData({
      destinationLakehouseId: lakehouse?.id || '',
      destinationLakehouseName: lakehouse?.name || '',
    })
  }

  const loadWorkspaces = async (query?: string) => {
    setWorkspacesLoading(true)
    setError(null)

    try {
      const response = query
        ? await workspaceApi.search(query, 50)
        : await workspaceApi.getAll()
      setWorkspaces(response.data.workspaces)
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to load workspaces'
      setError(message)
    } finally {
      setWorkspacesLoading(false)
    }
  }

  const loadLakehouses = async (targetWorkspaceId: string) => {
    setLakehousesLoading(true)
    setError(null)

    try {
      const response = await workspaceApi.getLakehouses(targetWorkspaceId)
      setLakehouses(response.data.lakehouses)
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to load lakehouses'
      setError(message)
      setLakehouses([])
    } finally {
      setLakehousesLoading(false)
    }
  }

  useEffect(() => {
    loadWorkspaces()
  }, [])

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

  useEffect(() => {
    if (!workspaceId) {
      setLakehouses([])
      return
    }

    loadLakehouses(workspaceId)
  }, [workspaceId])

  const createDestinationLakehouse = async () => {
    if (!workspaceId || !newLakehouseName.trim() || isSource) {
      return
    }

    setCreatingLakehouse(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const trimmedName = newLakehouseName.trim()
      const response = await workspaceApi.createLakehouse(workspaceId, trimmedName)

      const createdLakehouse = response.data.lakehouse
      await loadLakehouses(workspaceId)

      if (createdLakehouse) {
        updateLakehouseSelection(createdLakehouse)
      }

      setNewLakehouseName('')
      setSuccessMessage(`Created lakehouse: ${trimmedName}`)
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to create destination lakehouse'
      setError(message)
    } finally {
      setCreatingLakehouse(false)
    }
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {subtitle}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom color="primary">
          {isSource ? 'Source Workspace' : 'Destination Workspace'}
        </Typography>

        <Autocomplete
          options={workspaces}
          getOptionLabel={(option) => option.name}
          value={selectedWorkspace}
          onChange={(_, workspace) => updateWorkspaceSelection(workspace)}
          loading={workspacesLoading}
          renderInput={(params) => (
            <TextField
              {...params}
              label={isSource ? 'Select source workspace' : 'Select destination workspace'}
              placeholder="Type workspace name..."
              fullWidth
              onChange={(event) => setSearchTerm(event.target.value)}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {workspacesLoading ? <CircularProgress color="inherit" size={20} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
          noOptionsText={workspacesLoading ? 'Loading workspaces...' : 'No workspaces found'}
        />
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" gutterBottom color="primary">
          {isSource ? 'Source Lakehouse' : 'Destination Lakehouse'}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {workspaceName
            ? `Workspace: ${workspaceName}`
            : 'Select a workspace first to load lakehouses.'}
        </Typography>

        <Autocomplete
          options={lakehouses}
          getOptionLabel={(option) => option.name}
          value={selectedLakehouse}
          onChange={(_, lakehouse) => updateLakehouseSelection(lakehouse)}
          loading={lakehousesLoading}
          disabled={!workspaceId}
          renderInput={(params) => (
            <TextField
              {...params}
              label={isSource ? 'Select source lakehouse' : 'Select destination lakehouse'}
              placeholder="Choose lakehouse..."
              fullWidth
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {lakehousesLoading ? <CircularProgress color="inherit" size={20} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
          noOptionsText={
            !workspaceId
              ? 'Select a workspace first'
              : lakehousesLoading
                ? 'Loading lakehouses...'
                : 'No lakehouses found'
          }
        />

        {!isSource && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Create New Destination Lakehouse
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Lakehouse name"
                placeholder="Enter new lakehouse name"
                value={newLakehouseName}
                onChange={(event) => setNewLakehouseName(event.target.value)}
                size="small"
                fullWidth
                disabled={!workspaceId || creatingLakehouse}
              />
              <Button
                variant="contained"
                onClick={createDestinationLakehouse}
                disabled={!workspaceId || !newLakehouseName.trim() || creatingLakehouse}
              >
                {creatingLakehouse ? 'Creating...' : 'Create'}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  )
}

export default WorkspaceLakehouseSelection
