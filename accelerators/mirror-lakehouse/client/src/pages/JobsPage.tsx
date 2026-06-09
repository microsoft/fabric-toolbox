import React from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
} from '@mui/material'
import {
  Work as JobsIcon,
} from '@mui/icons-material'

const JobsPage: React.FC = () => {
  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="600" gutterBottom>
          Jobs & History
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Monitor active mirroring jobs and view historical operations with detailed logs and results.
        </Typography>
      </Box>

      <Paper sx={{ p: 4, borderRadius: 2, textAlign: 'center' }} elevation={2}>
        <JobsIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          Job Management & History
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 600, mx: 'auto' }}>
          Track the progress of your mirroring and validation jobs in real-time. View detailed 
          execution logs, performance metrics, and historical job results. Cancel running jobs 
          or retry failed operations.
        </Typography>
        <Button variant="outlined" disabled>
          Coming Soon
        </Button>
      </Paper>
    </Box>
  )
}

export default JobsPage