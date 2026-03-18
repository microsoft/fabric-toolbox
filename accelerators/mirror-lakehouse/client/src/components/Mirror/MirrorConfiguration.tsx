import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Switch,
  Grid,
  TextField,
  Autocomplete,
} from '@mui/material'
import { lakehouseApi, mirrorApi, ProgrammableObject } from '../../services/apiService'
import { MirrorFormData } from '../../pages/MirrorPage'

interface MirrorConfigurationProps {
  formData: MirrorFormData
  updateFormData: (updates: Partial<MirrorFormData>) => void
}

const MirrorConfiguration: React.FC<MirrorConfigurationProps> = ({
  formData,
  updateFormData,
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schemas, setSchemas] = useState<string[]>([])
  const [views, setViews] = useState<ProgrammableObject[]>([])
  const [storedProcedures, setStoredProcedures] = useState<ProgrammableObject[]>([])

  const canLoad = Boolean(formData.sourceLakehouseId && formData.sourceWorkspaceId)

  useEffect(() => {
    const loadConfigurationData = async () => {
      if (!canLoad) {
        setSchemas([])
        setViews([])
        setStoredProcedures([])
        return
      }

      setLoading(true)
      setError(null)

      const [schemasResult, programmableResult] = await Promise.allSettled([
        lakehouseApi.getSchemas(formData.sourceLakehouseId),
        mirrorApi.getProgrammableObjects(formData.sourceLakehouseId, formData.sourceWorkspaceId),
      ])

      let nextSchemas: string[] = []
      let nextViews: ProgrammableObject[] = []
      let nextStoredProcedures: ProgrammableObject[] = []
      const errors: string[] = []
      let schemaError: { message: string; status?: number } | null = null

      if (schemasResult.status === 'fulfilled') {
        nextSchemas = (schemasResult.value.data.schemas || [])
          .map(schema => schema.name)
          .filter(Boolean)
      } else {
        const schemaMessage = schemasResult.reason?.response?.data?.message || schemasResult.reason?.message || 'Schema metadata unavailable'
        schemaError = {
          message: schemaMessage,
          status: schemasResult.reason?.response?.status,
        }
      }

      if (programmableResult.status === 'fulfilled') {
        nextViews = programmableResult.value.data.views || []
        nextStoredProcedures = programmableResult.value.data.storedProcedures || []
      } else {
        const programmableMessage = programmableResult.reason?.response?.data?.message || programmableResult.reason?.message || 'Programmable objects unavailable'
        errors.push(`Views/Procedures: ${programmableMessage}`)
      }

      if (nextSchemas.length === 0) {
        const derivedSchemas = Array.from(new Set([
          ...nextViews.map(view => view.schemaName),
          ...nextStoredProcedures.map(proc => proc.schemaName),
        ].filter(Boolean)))
        nextSchemas = derivedSchemas
      }

      const shouldShowSchemaError = schemaError
        && !(schemaError.status === 400 && nextSchemas.length > 0)

      if (shouldShowSchemaError && schemaError) {
        errors.push(`Schemas: ${schemaError.message}`)
      }

      setSchemas(nextSchemas)
      setViews(nextViews)
      setStoredProcedures(nextStoredProcedures)

      if (errors.length > 0) {
        setError(errors.join(' | '))
      }

      setLoading(false)
    }

    loadConfigurationData()
  }, [canLoad, formData.sourceLakehouseId, formData.sourceWorkspaceId])

  const viewOptions = useMemo(() => views.map(item => item.fullName), [views])
  const storedProcedureOptions = useMemo(() => storedProcedures.map(item => item.fullName), [storedProcedures])

  useEffect(() => {
    if (!schemas.length) return

    if (formData.selectedSchemas.length > 0) {
      const validSelectedSchemas = formData.selectedSchemas.filter(schema => schemas.includes(schema))
      if (validSelectedSchemas.length !== formData.selectedSchemas.length) {
        updateFormData({ selectedSchemas: validSelectedSchemas })
      }
    }

    if (formData.excludeSchemas.length > 0) {
      const validExcludedSchemas = formData.excludeSchemas.filter(schema => schemas.includes(schema))
      if (validExcludedSchemas.length !== formData.excludeSchemas.length) {
        updateFormData({ excludeSchemas: validExcludedSchemas })
      }
    }
  }, [schemas, formData.selectedSchemas, formData.excludeSchemas, updateFormData])

  useEffect(() => {
    if (formData.selectedViews.length > 0) {
      const validSelectedViews = formData.selectedViews.filter(view => viewOptions.includes(view))
      if (validSelectedViews.length !== formData.selectedViews.length) {
        updateFormData({ selectedViews: validSelectedViews })
      }
    }

    if (formData.selectedStoredProcedures.length > 0) {
      const validSelectedProcedures = formData.selectedStoredProcedures.filter(proc => storedProcedureOptions.includes(proc))
      if (validSelectedProcedures.length !== formData.selectedStoredProcedures.length) {
        updateFormData({ selectedStoredProcedures: validSelectedProcedures })
      }
    }
  }, [
    viewOptions,
    storedProcedureOptions,
    formData.selectedViews,
    formData.selectedStoredProcedures,
    updateFormData
  ])

  const toggleSchemaSelection = (schemaName: string) => {
    const exists = formData.selectedSchemas.includes(schemaName)
    const nextSelectedSchemas = exists
      ? formData.selectedSchemas.filter(schema => schema !== schemaName)
      : [...formData.selectedSchemas, schemaName]

    updateFormData({ selectedSchemas: nextSelectedSchemas })
  }

  const toggleSchemaExclusion = (schemaName: string) => {
    const exists = formData.excludeSchemas.includes(schemaName)
    const nextExcludedSchemas = exists
      ? formData.excludeSchemas.filter(schema => schema !== schemaName)
      : [...formData.excludeSchemas, schemaName]

    updateFormData({ excludeSchemas: nextExcludedSchemas })
  }

  const isSchemaEffectivelySelected = (schemaName: string) => {
    const inSelection = formData.selectedSchemas.length === 0 || formData.selectedSchemas.includes(schemaName)
    const excluded = formData.excludeSchemas.includes(schemaName)
    return inSelection && !excluded
  }

  if (!canLoad) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Configure Mirroring Options
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Select source and destination lakehouses first, then configure schemas, views, and stored procedures.
        </Typography>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Lakehouse selection is required before configuring mirroring options.
          </Typography>
        </Paper>
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Configure Mirroring Options
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Customize schema mirroring and choose which views and stored procedures to apply with CREATE OR ALTER after shortcut creation.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Schemas
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Leave all unchecked to mirror all schemas. Use Exclude to skip specific schemas.
            </Typography>

            {schemas.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No schemas discovered from source metadata.
              </Typography>
            ) : (
              <Box>
                {schemas.map(schemaName => (
                  <Box key={schemaName} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.selectedSchemas.includes(schemaName)}
                          onChange={() => toggleSchemaSelection(schemaName)}
                        />
                      }
                      label={schemaName}
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.excludeSchemas.includes(schemaName)}
                          onChange={() => toggleSchemaExclusion(schemaName)}
                        />
                      }
                      label="Exclude"
                    />
                  </Box>
                ))}
              </Box>
            )}

            <FormControlLabel
              sx={{ mt: 1 }}
              control={
                <Switch
                  checked={formData.overwriteExisting}
                  onChange={(_, checked) => updateFormData({ overwriteExisting: checked })}
                />
              }
              label="Overwrite existing shortcuts"
            />
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Views
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.includeAllViews}
                  onChange={(_, checked) => updateFormData({ includeAllViews: checked })}
                />
              }
              label="Apply all views"
            />
            <Autocomplete
              multiple
              disableCloseOnSelect
              options={viewOptions}
              value={formData.selectedViews}
              onChange={(_, value) => updateFormData({ selectedViews: value })}
              disabled={formData.includeAllViews}
              renderInput={(params) => (
                <TextField {...params} label="Selected views" placeholder="Choose views" />
              )}
              sx={{ mt: 1 }}
            />
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" gutterBottom>
              Stored Procedures
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.includeAllStoredProcedures}
                  onChange={(_, checked) => updateFormData({ includeAllStoredProcedures: checked })}
                />
              }
              label="Apply all stored procedures"
            />
            <Autocomplete
              multiple
              disableCloseOnSelect
              options={storedProcedureOptions}
              value={formData.selectedStoredProcedures}
              onChange={(_, value) => updateFormData({ selectedStoredProcedures: value })}
              disabled={formData.includeAllStoredProcedures}
              renderInput={(params) => (
                <TextField {...params} label="Selected stored procedures" placeholder="Choose stored procedures" />
              )}
              sx={{ mt: 1 }}
            />
          </Paper>
        </Grid>
      </Grid>

      {schemas.length > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {`Selected effective schemas: ${schemas.filter(isSchemaEffectivelySelected).length} of ${schemas.length}.`}
        </Alert>
      )}
    </Box>
  )
}

export default MirrorConfiguration