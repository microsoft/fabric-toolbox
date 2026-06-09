import React, { useState } from 'react'
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Paper,
  Alert,
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  ContentCopy as MirrorIcon,
} from '@mui/icons-material'
import { useSnackbar } from 'notistack'

import WorkspaceLakehouseSelection from '../components/Mirror/WorkspaceLakehouseSelection'
import MirrorConfiguration from '../components/Mirror/MirrorConfiguration'
import MirrorExecution from '../components/Mirror/MirrorExecution'

const steps = [
  'Select Source',
  'Select Destination',
  'Configure Mirroring',
  'Execute & Monitor'
]

export interface MirrorFormData {
  // Source workspace
  sourceWorkspaceId: string
  sourceWorkspaceName: string
  // Destination workspace  
  destinationWorkspaceId: string
  destinationWorkspaceName: string
  // Source lakehouse
  sourceLakehouseId: string
  sourceLakehouseName: string
  // Destination lakehouse
  destinationLakehouseId: string
  destinationLakehouseName: string
  // Configuration
  selectedSchemas: string[]
  excludeSchemas: string[]
  overwriteExisting: boolean
  includeAllViews: boolean
  selectedViews: string[]
  includeAllStoredProcedures: boolean
  selectedStoredProcedures: string[]
}

const MirrorPage: React.FC = () => {
  const { enqueueSnackbar } = useSnackbar()
  const [activeStep, setActiveStep] = useState(0)
  const [formData, setFormData] = useState<MirrorFormData>({
    sourceWorkspaceId: '',
    sourceWorkspaceName: '',
    destinationWorkspaceId: '',
    destinationWorkspaceName: '',
    sourceLakehouseId: '',
    sourceLakehouseName: '',
    destinationLakehouseId: '',
    destinationLakehouseName: '',
    selectedSchemas: [],
    excludeSchemas: [],
    overwriteExisting: false,
    includeAllViews: true,
    selectedViews: [],
    includeAllStoredProcedures: true,
    selectedStoredProcedures: [],
  })

  const handleNext = () => {
    if (validateStep(activeStep)) {
      setActiveStep((prevActiveStep) => prevActiveStep + 1)
    }
  }

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1)
  }

  const handleReset = () => {
    setActiveStep(0)
    setFormData({
      sourceWorkspaceId: '',
      sourceWorkspaceName: '',
      destinationWorkspaceId: '',
      destinationWorkspaceName: '',
      sourceLakehouseId: '',
      sourceLakehouseName: '',
      destinationLakehouseId: '',
      destinationLakehouseName: '',
      selectedSchemas: [],
      excludeSchemas: [],
      overwriteExisting: false,
      includeAllViews: true,
      selectedViews: [],
      includeAllStoredProcedures: true,
      selectedStoredProcedures: [],
    })
  }

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0: // Source Selection
        if (!formData.sourceWorkspaceId || !formData.sourceLakehouseId) {
          enqueueSnackbar('Please select a source workspace and source lakehouse', {
            variant: 'warning',
          })
          return false
        }
        return true

      case 1: // Destination Selection
        if (!formData.destinationWorkspaceId || !formData.destinationLakehouseId) {
          enqueueSnackbar('Please select a destination workspace and destination lakehouse', {
            variant: 'warning',
          })
          return false
        }
        return true
      
      case 2: // Configuration
        return true // Configuration is optional
      
      default:
        return true
    }
  }

  const updateFormData = (updates: Partial<MirrorFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <WorkspaceLakehouseSelection
            mode="source"
            formData={formData}
            updateFormData={updateFormData}
          />
        )
      case 1:
        return (
          <WorkspaceLakehouseSelection
            mode="destination"
            formData={formData}
            updateFormData={updateFormData}
          />
        )
      case 2:
        return (
          <MirrorConfiguration
            formData={formData}
            updateFormData={updateFormData}
          />
        )
      case 3:
        return (
          <MirrorExecution
            formData={formData}
            onReset={handleReset}
          />
        )
      default:
        return <div>Unknown step</div>
    }
  }

  const isStepOptional = (step: number) => {
    return step === 2 // Configuration step is optional
  }

  const isStepCompleted = (step: number) => {
    switch (step) {
      case 0:
        return !!(formData.sourceWorkspaceId && formData.sourceLakehouseId)
      case 1:
        return !!(formData.destinationWorkspaceId && formData.destinationLakehouseId)
      case 2:
        return true // Configuration is always considered complete
      case 3:
        return false // Execution step is never pre-completed
      default:
        return false
    }
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="600" gutterBottom>
          Mirror Lakehouses
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Create schema shortcuts to mirror lakehouse structures from source to destination.
        </Typography>
      </Box>

      <Paper sx={{ p: 4, borderRadius: 2 }} elevation={2}>
        {/* Stepper */}
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label, index) => {
            const stepProps: { completed?: boolean } = {}
            const labelProps: { optional?: React.ReactNode } = {}
            
            if (isStepOptional(index)) {
              labelProps.optional = (
                <Typography variant="caption">Optional</Typography>
              )
            }
            
            if (isStepCompleted(index)) {
              stepProps.completed = true
            }

            return (
              <Step key={label} {...stepProps}>
                <StepLabel {...labelProps}>{label}</StepLabel>
              </Step>
            )
          })}
        </Stepper>

        {/* Step Content */}
        {activeStep === steps.length ? (
          // All steps completed
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <MirrorIcon sx={{ fontSize: 60, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Mirroring Process Complete!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Your lakehouse mirroring job has been completed successfully.
            </Typography>
            <Button onClick={handleReset} variant="contained">
              Start New Mirror
            </Button>
          </Box>
        ) : (
          <Box>
            {/* Step Content */}
            <Box sx={{ mb: 4, minHeight: 400 }}>
              {renderStepContent(activeStep)}
            </Box>

            {/* Navigation Buttons */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button
                disabled={activeStep === 0}
                onClick={handleBack}
                startIcon={<ArrowBackIcon />}
                variant="outlined"
              >
                Back
              </Button>

              <Box sx={{ display: 'flex', gap: 1 }}>
                {isStepOptional(activeStep) && (
                  <Button
                    onClick={handleNext}
                    variant="text"
                  >
                    Skip
                  </Button>
                )}
                
                <Button
                  onClick={handleNext}
                  endIcon={<ArrowForwardIcon />}
                  variant="contained"
                >
                  {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
                </Button>
              </Box>
            </Box>

            {/* Progress Info */}
            {activeStep < steps.length - 1 && (
              <Alert severity="info" sx={{ mt: 3 }}>
                <Typography variant="body2">
                  <strong>Step {activeStep + 1} of {steps.length}:</strong> {steps[activeStep]}
                </Typography>
              </Alert>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  )
}

export default MirrorPage