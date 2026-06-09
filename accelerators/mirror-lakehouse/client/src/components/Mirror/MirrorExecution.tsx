import React, { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Alert,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import {
  PlayArrow as PlayIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Assessment as ValidationIcon,
  ExpandMore as ExpandMoreIcon,
  Storage as LakehouseIcon,
  Schema as SchemaIcon,
  TableChart as TableIcon,
  Link as ShortcutIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { useSnackbar } from 'notistack'
import { MirrorFormData } from '../../pages/MirrorPage'
import { mirrorApi, validationApi, MirrorJob, ValidationJob } from '../../services/apiService'

interface MirrorExecutionProps {
  formData: MirrorFormData
  onReset: () => void
}

interface JobProgress {
  mirrorJob: MirrorJob | null
  validationJob: ValidationJob | null
  currentPhase: 'configuration' | 'mirroring' | 'validation' | 'completed' | 'error'
}

const MirrorExecution: React.FC<MirrorExecutionProps> = ({
  formData,
  onReset,
}) => {
  const { enqueueSnackbar } = useSnackbar()
  const [jobProgress, setJobProgress] = useState<JobProgress>({
    mirrorJob: null,
    validationJob: null,
    currentPhase: 'configuration'
  })
  const [isStarting, setIsStarting] = useState(false)
  const [expandedPanels, setExpandedPanels] = useState<string[]>(['config'])

  // Configuration summary data
  const configSummary = {
    source: {
      workspace: formData.sourceWorkspaceName || formData.sourceWorkspaceId,
      lakehouse: formData.sourceLakehouseName || formData.sourceLakehouseId,
    },
    destination: {
      workspace: formData.destinationWorkspaceName || formData.destinationWorkspaceId,
      lakehouse: formData.destinationLakehouseName || formData.destinationLakehouseId,
    },
    options: {
      selectedSchemas: formData.selectedSchemas.length > 0 ? formData.selectedSchemas : ['All schemas'],
      excludeSchemas: formData.excludeSchemas,
      overwriteExisting: formData.overwriteExisting,
      views: formData.includeAllViews ? ['All views'] : formData.selectedViews,
      storedProcedures: formData.includeAllStoredProcedures ? ['All stored procedures'] : formData.selectedStoredProcedures,
    }
  }

  // Start validation process
  const startValidation = async () => {
    try {
      const request = {
        sourceLakehouseId: formData.sourceLakehouseId,
        destinationLakehouseId: formData.destinationLakehouseId,
        sourceWorkspaceId: formData.sourceWorkspaceId,
        destinationWorkspaceId: formData.destinationWorkspaceId,
        name: 'Post-Mirror Validation'
      }

      const response = await validationApi.createValidation(request)
      const jobId = response.data.jobId

      // Start polling for validation status
      const pollInterval = setInterval(async () => {
        const shouldContinue = await pollJobStatus(jobId, 'validation')
        if (!shouldContinue) {
          clearInterval(pollInterval)
          setExpandedPanels(['progress', 'validation'])
        }
      }, 2000)

    } catch (error: any) {
      console.error('Error starting validation:', error)
      enqueueSnackbar('Failed to start validation: ' + (error.response?.data?.message || error.message), { 
        variant: 'error' 
      })
    }
  }

  // Poll job status
  const pollJobStatus = async (jobId: string, jobType: 'mirror' | 'validation') => {
    try {
      if (jobType === 'mirror') {
        const response = await mirrorApi.getJobStatus(jobId)
        const job = response.data
        
        setJobProgress(prev => ({
          ...prev,
          mirrorJob: job,
          currentPhase: job.status === 'completed' ? 'validation' : 
                      job.status === 'failed' ? 'error' : 'mirroring'
        }))

        if (job.status === 'completed') {
          enqueueSnackbar('Mirroring completed successfully! Starting validation...', { variant: 'success' })
          startValidation()
        } else if (job.status === 'failed') {
          enqueueSnackbar('Mirroring failed: ' + job.error, { variant: 'error' })
        }

        return job.status !== 'completed' && job.status !== 'failed'
      } else {
        const response = await validationApi.getJobStatus(jobId)
        const job = response.data
        
        setJobProgress(prev => ({
          ...prev,
          validationJob: job,
          currentPhase: job.status === 'completed' ? 'completed' : 
                      job.status === 'failed' ? 'error' : 'validation'
        }))

        if (job.status === 'completed') {
          enqueueSnackbar('Validation completed successfully!', { variant: 'success' })
        } else if (job.status === 'failed') {
          enqueueSnackbar('Validation failed: ' + job.error, { variant: 'error' })
        }

        return job.status !== 'completed' && job.status !== 'failed'
      }
    } catch (error) {
      console.error('Error polling job status:', error)
      return false
    }
  }

  // Start mirroring process
  const startMirroring = async () => {
    try {
      setIsStarting(true)
      setJobProgress(prev => ({ ...prev, currentPhase: 'mirroring' }))
      setExpandedPanels(['progress'])

      const request = {
        sourceLakehouseId: formData.sourceLakehouseId,
        destinationLakehouseId: formData.destinationLakehouseId,
        sourceWorkspaceId: formData.sourceWorkspaceId,
        destinationWorkspaceId: formData.destinationWorkspaceId,
        schemas: formData.selectedSchemas,
        excludeSchemas: formData.excludeSchemas,
        overwriteExisting: formData.overwriteExisting,
        includeAllViews: formData.includeAllViews,
        selectedViews: formData.selectedViews,
        includeAllStoredProcedures: formData.includeAllStoredProcedures,
        selectedStoredProcedures: formData.selectedStoredProcedures,
      }

      const response = await mirrorApi.createSchemaShortcuts(request)
      const jobId = response.data.jobId

      enqueueSnackbar('Mirroring job started successfully!', { variant: 'success' })

      // Start polling for status updates
      const pollInterval = setInterval(async () => {
        const shouldContinue = await pollJobStatus(jobId, 'mirror')
        if (!shouldContinue) {
          clearInterval(pollInterval)
        }
      }, 2000)

    } catch (error: any) {
      console.error('Error starting mirror job:', error)
      enqueueSnackbar('Failed to start mirroring: ' + (error.response?.data?.message || error.message), { 
        variant: 'error' 
      })
      setJobProgress(prev => ({ ...prev, currentPhase: 'error' }))
    } finally {
      setIsStarting(false)
    }
  }

  const handlePanelChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedPanels(prev => 
      isExpanded 
        ? [...prev, panel] 
        : prev.filter(p => p !== panel)
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckIcon color="success" />
      case 'failed':
        return <ErrorIcon color="error" />
      case 'running':
        return <CircularProgress size={20} />
      default:
        return <InfoIcon color="info" />
    }
  }

  const getStatusColor = (status: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'failed':
        return 'error'
      case 'running':
        return 'primary'
      default:
        return 'default'
    }
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Execute Mirroring Operation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Review your configuration and start the schema shortcut creation process.
      </Typography>
      
      {/* Configuration Summary */}
      <Accordion 
        expanded={expandedPanels.includes('config')} 
        onChange={handlePanelChange('config')}
        sx={{ mb: 2 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Configuration Summary</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <LakehouseIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6">Source</Typography>
                  </Box>
                  <Typography><strong>Workspace:</strong> {configSummary.source.workspace}</Typography>
                  <Typography><strong>Lakehouse:</strong> {configSummary.source.lakehouse}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <LakehouseIcon color="secondary" sx={{ mr: 1 }} />
                    <Typography variant="h6">Destination</Typography>
                  </Box>
                  <Typography><strong>Workspace:</strong> {configSummary.destination.workspace}</Typography>
                  <Typography><strong>Lakehouse:</strong> {configSummary.destination.lakehouse}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Options</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box>
                      <Typography component="span"><strong>Schemas:</strong> </Typography>
                      {configSummary.options.selectedSchemas.map((schema, index) => (
                        <Chip key={index} label={schema} size="small" sx={{ mr: 0.5 }} />
                      ))}
                    </Box>
                    {configSummary.options.excludeSchemas.length > 0 && (
                      <Box>
                        <Typography component="span"><strong>Exclude:</strong> </Typography>
                        {configSummary.options.excludeSchemas.map((schema, index) => (
                          <Chip key={index} label={schema} size="small" color="error" sx={{ mr: 0.5 }} />
                        ))}
                      </Box>
                    )}
                    <Typography>
                      <strong>Overwrite Existing:</strong> {configSummary.options.overwriteExisting ? 'Yes' : 'No'}
                    </Typography>
                    <Box>
                      <Typography component="span"><strong>Views:</strong> </Typography>
                      {(configSummary.options.views.length > 0 ? configSummary.options.views : ['None selected']).map((view, index) => (
                        <Chip key={`view-${index}`} label={view} size="small" sx={{ mr: 0.5 }} />
                      ))}
                    </Box>
                    <Box>
                      <Typography component="span"><strong>Stored Procedures:</strong> </Typography>
                      {(configSummary.options.storedProcedures.length > 0 ? configSummary.options.storedProcedures : ['None selected']).map((proc, index) => (
                        <Chip key={`proc-${index}`} label={proc} size="small" sx={{ mr: 0.5 }} />
                      ))}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Start Button */}
      {jobProgress.currentPhase === 'configuration' && (
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={isStarting ? <CircularProgress size={20} color="inherit" /> : <PlayIcon />}
            onClick={startMirroring}
            disabled={isStarting}
            sx={{ px: 4, py: 1.5 }}
          >
            {isStarting ? 'Starting Mirror Job...' : 'Start Mirroring'}
          </Button>
        </Box>
      )}

      {/* Progress Section */}
      {jobProgress.currentPhase !== 'configuration' && (
        <Accordion 
          expanded={expandedPanels.includes('progress')} 
          onChange={handlePanelChange('progress')}
          sx={{ mb: 2 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Progress & Status</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {/* Mirror Job Progress */}
            {jobProgress.mirrorJob && (
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <SchemaIcon sx={{ mr: 1 }} />
                  <Typography variant="h6">Schema Mirroring</Typography>
                  <Box sx={{ ml: 'auto' }}>
                    {getStatusIcon(jobProgress.mirrorJob.status)}
                    <Chip 
                      label={jobProgress.mirrorJob.status.toUpperCase()} 
                      color={getStatusColor(jobProgress.mirrorJob.status)}
                      size="small" 
                      sx={{ ml: 1 }}
                    />
                  </Box>
                </Box>
                
                <LinearProgress 
                  variant="determinate" 
                  value={jobProgress.mirrorJob.progress} 
                  sx={{ mb: 1 }}
                />
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {jobProgress.mirrorJob.message} ({jobProgress.mirrorJob.progress}%)
                </Typography>

                {jobProgress.mirrorJob.status === 'completed' && jobProgress.mirrorJob.results && (
                  <Box sx={{ mt: 2 }}>
                    <Grid container spacing={2}>
                      <Grid item>
                        <Chip 
                          icon={<CheckIcon />}
                          label={`Created: ${jobProgress.mirrorJob.results.created.length}`}
                          color="success" 
                        />
                      </Grid>
                      <Grid item>
                        <Chip 
                          icon={<ErrorIcon />}
                          label={`Failed: ${jobProgress.mirrorJob.results.failed.length}`}
                          color="error" 
                        />
                      </Grid>
                      <Grid item>
                        <Chip 
                          icon={<WarningIcon />}
                          label={`Skipped: ${jobProgress.mirrorJob.results.skipped.length}`}
                          color="warning" 
                        />
                      </Grid>
                    </Grid>

                    {jobProgress.mirrorJob.results.created.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Created Shortcuts
                        </Typography>
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Source Schema</TableCell>
                                <TableCell>Created Shortcut</TableCell>
                                <TableCell>Mode</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {jobProgress.mirrorJob.results.created.map((item, index) => (
                                <TableRow key={`${item.schemaName}-${index}`}>
                                  <TableCell>{item.schemaName}</TableCell>
                                  <TableCell>{item.destinationShortcutName || item.schemaName}</TableCell>
                                  <TableCell>
                                    <Chip
                                      size="small"
                                      color={item.usedFallbackName ? 'warning' : 'success'}
                                      label={item.usedFallbackName ? 'Fallback (_1)' : 'Direct'}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            )}

            {/* Validation Job Progress */}
            {jobProgress.validationJob && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <ValidationIcon sx={{ mr: 1 }} />
                  <Typography variant="h6">Validation</Typography>
                  <Box sx={{ ml: 'auto' }}>
                    {getStatusIcon(jobProgress.validationJob.status)}
                    <Chip 
                      label={jobProgress.validationJob.status.toUpperCase()} 
                      color={getStatusColor(jobProgress.validationJob.status)}
                      size="small" 
                      sx={{ ml: 1 }}
                    />
                  </Box>
                </Box>
                
                <LinearProgress 
                  variant="determinate" 
                  value={jobProgress.validationJob.progress} 
                  sx={{ mb: 1 }}
                />
                
                <Typography variant="body2" color="text.secondary">
                  {jobProgress.validationJob.message} ({jobProgress.validationJob.progress}%)
                </Typography>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Validation Results */}
      {jobProgress.validationJob && jobProgress.validationJob.status === 'completed' && jobProgress.validationJob.results && (
        <Accordion 
          expanded={expandedPanels.includes('validation')} 
          onChange={handlePanelChange('validation')}
          sx={{ mb: 2 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Validation Report</Typography>
            <Chip 
              label={`Score: ${jobProgress.validationJob.results.summary?.validationScore}%`}
              color={jobProgress.validationJob.results.summary?.validationScore >= 90 ? 'success' : 'warning'}
              size="small"
              sx={{ ml: 2 }}
            />
          </AccordionSummary>
          <AccordionDetails>
            {/* Validation Summary */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <SchemaIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="h4">{jobProgress.validationJob.results.summary?.schemasMatched || 0}</Typography>
                    <Typography color="text.secondary">Schemas Matched</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <TableIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="h4">{jobProgress.validationJob.results.summary?.tablesMatched || 0}</Typography>
                    <Typography color="text.secondary">Tables Matched</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <ShortcutIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="h4">{jobProgress.validationJob.results.summary?.shortcutsMatched || 0}</Typography>
                    <Typography color="text.secondary">Shortcuts Matched</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Differences Table */}
            {jobProgress.validationJob.results.differences && jobProgress.validationJob.results.differences.length > 0 && (
              <Box>
                <Typography variant="h6" gutterBottom>Differences Found</Typography>
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Type</TableCell>
                        <TableCell>Name</TableCell>
                        <TableCell>Issue</TableCell>
                        <TableCell>Description</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {jobProgress.validationJob.results.differences.map((diff, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Chip 
                              label={diff.type} 
                              size="small"
                              color={diff.type === 'schema' ? 'primary' : diff.type === 'table' ? 'secondary' : 'default'}
                            />
                          </TableCell>
                          <TableCell>{diff.name}</TableCell>
                          <TableCell>
                            <Chip 
                              label={diff.difference === 'missing_in_destination' ? 'Missing' : 'Extra'}
                              size="small"
                              color={diff.difference === 'missing_in_destination' ? 'error' : 'warning'}
                            />
                          </TableCell>
                          <TableCell>{diff.description}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Perfect Match */}
            {jobProgress.validationJob.results.summary?.totalDifferences === 0 && (
              <Alert severity="success" sx={{ mt: 2 }}>
                <Typography variant="h6">Perfect Match! 🎉</Typography>
                <Typography>
                  The source and destination lakehouses are perfectly synchronized. 
                  All schemas, tables, and shortcuts match exactly.
                </Typography>
              </Alert>
            )}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Completion Actions */}
      {jobProgress.currentPhase === 'completed' && (
        <Card>
          <CardContent sx={{ textAlign: 'center' }}>
            <CheckIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Mirroring & Validation Complete!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Your lakehouse has been successfully mirrored and validated.
            </Typography>
            <Button 
              variant="contained" 
              startIcon={<RefreshIcon />}
              onClick={onReset}
            >
              Start New Mirror
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {jobProgress.currentPhase === 'error' && (
        <Alert severity="error" sx={{ mt: 2 }}>
          <Typography variant="h6">Operation Failed</Typography>
          <Typography>
            The mirroring operation encountered an error. Please check the logs above and try again.
          </Typography>
          <Button 
            variant="outlined" 
            startIcon={<RefreshIcon />}
            onClick={onReset}
            sx={{ mt: 2 }}
          >
            Reset and Try Again
          </Button>
        </Alert>
      )}
    </Box>
  )
}

export default MirrorExecution