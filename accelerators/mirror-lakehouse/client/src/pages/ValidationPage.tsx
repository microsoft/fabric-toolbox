import React from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
} from '@mui/material'
import {
  Assessment as ValidationIcon,
} from '@mui/icons-material'

const ValidationPage: React.FC = () => {
  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="600" gutterBottom>
          Validate & Compare Lakehouses
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Compare source and destination lakehouses to validate mirroring results and identify differences.
        </Typography>
      </Box>

      <Paper sx={{ p: 4, borderRadius: 2, textAlign: 'center' }} elevation={2}>
        <ValidationIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          Validation & Comparison Tool
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 600, mx: 'auto' }}>
          This feature will allow you to compare two lakehouses and generate detailed reports 
          showing differences in schemas, tables, columns, and other metadata. You can validate 
          that your mirroring operations completed successfully.
        </Typography>
        <Button variant="outlined" disabled>
          Coming Soon
        </Button>
      </Paper>
    </Box>
  )
}

export default ValidationPage