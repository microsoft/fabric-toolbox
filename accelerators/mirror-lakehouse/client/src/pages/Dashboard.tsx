import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Paper,
  Button,
  Card,
  CardContent,
  CardActions,
  Alert,
  CircularProgress,
} from '@mui/material'
import {
  Dashboard as DashboardIcon,
  ContentCopy as MirrorIcon,
  Assessment as ValidationIcon,
  Work as JobsIcon,
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { mirrorApi, DashboardStats } from '../services/apiService'

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load dashboard statistics
  useEffect(() => {
    loadDashboardStats()
  }, [])

  const loadDashboardStats = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await mirrorApi.getDashboardStats()
      setDashboardStats(response.data)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard statistics')
      console.error('Error loading dashboard stats:', err)
      // Set default stats if API fails
      setDashboardStats({
        mirrorJobs: { total: 0, completed: 0, failed: 0, running: 0, recent: 0 },
        statistics: {
          recentJobs: 0,
          recentJobsChange: 'No recent jobs',
          successRate: 'N/A',
          successRateChange: 'No data',
          avgDuration: 'N/A',
          avgDurationChange: 'No data'
        },
        recentActivity: []
      })
    } finally {
      setLoading(false)
    }
  }

  const quickActions = [
    {
      title: 'Mirror Lakehouses',
      description: 'Create schema shortcuts to mirror lakehouse structures',
      icon: <MirrorIcon sx={{ fontSize: 40 }} />,
      color: 'primary',
      path: '/mirror',
    },
    {
      title: 'Validate & Compare',
      description: 'Compare lakehouses and generate difference reports',
      icon: <ValidationIcon sx={{ fontSize: 40 }} />,
      color: 'secondary',
      path: '/validation',
    },
    {
      title: 'View Jobs',
      description: 'Monitor mirroring jobs and view history',
      icon: <JobsIcon sx={{ fontSize: 40 }} />,
      color: 'info',
      path: '/jobs',
    },
  ]

  // Create stats array from API data
  const stats = dashboardStats ? [
    {
      title: 'Recent Jobs',
      value: dashboardStats.statistics.recentJobs.toString(),
      change: dashboardStats.statistics.recentJobsChange,
      icon: <JobsIcon />,
      color: 'primary',
    },
    {
      title: 'Success Rate',
      value: dashboardStats.statistics.successRate,
      change: dashboardStats.statistics.successRateChange,
      icon: <TrendingUpIcon />,
      color: 'success',
    },
    {
      title: 'Avg. Duration',
      value: dashboardStats.statistics.avgDuration,
      change: dashboardStats.statistics.avgDurationChange,
      icon: <SpeedIcon />,
      color: 'info',
    },
  ] : []

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress size={40} />
      </Box>
    )
  }

  return (
    <Box>
      {/* Welcome Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="600" gutterBottom>
          Welcome back, {user?.name?.split(' ')[0] || 'User'}! 👋
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your Microsoft Fabric lakehouse mirroring operations from this dashboard.
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Paper
              sx={{
                p: 3,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderRadius: 2,
              }}
              elevation={2}
            >
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: `${stat.color}.light`,
                  color: `${stat.color}.main`,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {stat.icon}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h4" fontWeight="bold">
                  {stat.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {stat.title}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: stat.change.startsWith('+') ? 'success.main' : 'info.main',
                    fontWeight: 500,
                  }}
                >
                  {stat.change}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Quick Actions */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight="600" gutterBottom>
          Quick Actions
        </Typography>
        <Grid container spacing={3}>
          {quickActions.map((action, index) => (
            <Grid item xs={12} md={4} key={index}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 2,
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 4,
                  },
                }}
                elevation={2}
              >
                <CardContent sx={{ flex: 1, textAlign: 'center', p: 3 }}>
                  <Box
                    sx={{
                      color: `${action.color}.main`,
                      mb: 2,
                    }}
                  >
                    {action.icon}
                  </Box>
                  <Typography variant="h6" fontWeight="600" gutterBottom>
                    {action.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {action.description}
                  </Typography>
                </CardContent>
                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button
                    variant="contained"
                    color={action.color as any}
                    fullWidth
                    onClick={() => navigate(action.path)}
                    sx={{ borderRadius: 2 }}
                  >
                    Get Started
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Recent Activity */}
      <Box>
        <Typography variant="h5" fontWeight="600" gutterBottom>
          Recent Activity
        </Typography>
        <Paper sx={{ p: 3, borderRadius: 2 }} elevation={2}>
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Unable to load recent activity: {error}
            </Alert>
          )}
          {dashboardStats?.recentActivity && dashboardStats.recentActivity.length > 0 ? (
            <Box>
              {dashboardStats.recentActivity.map((activity, index) => (
                <Box
                  key={activity.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: 2,
                    borderBottom: index < dashboardStats.recentActivity.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: activity.status === 'completed' ? 'success.light' : 
                                activity.status === 'failed' ? 'error.light' : 'info.light',
                        color: activity.status === 'completed' ? 'success.main' : 
                               activity.status === 'failed' ? 'error.main' : 'info.main'
                      }}
                    >
                      <MirrorIcon />
                    </Box>
                    <Box>
                      <Typography variant="body1" fontWeight={500}>
                        {activity.type === 'mirror' ? 'Schema Mirror Job' : 'Validation Job'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {activity.source?.workspaceId && activity.destination?.workspaceId
                          ? `${activity.source.workspaceId} → ${activity.destination.workspaceId}`
                          : 'Job details'}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography
                      variant="caption"
                      sx={{
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        bgcolor: activity.status === 'completed' ? 'success.light' : 
                                activity.status === 'failed' ? 'error.light' : 'info.light',
                        color: activity.status === 'completed' ? 'success.main' : 
                               activity.status === 'failed' ? 'error.main' : 'info.main',
                        textTransform: 'capitalize'
                      }}
                    >
                      {activity.status}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                      {new Date(activity.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                </Box>
              ))}
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Button
                  variant="text"
                  onClick={() => navigate('/jobs')}
                  sx={{ borderRadius: 2 }}
                >
                  View All Jobs
                </Button>
              </Box>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <DashboardIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No recent activity
              </Typography>
              <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
                Start by creating your first lakehouse mirror or validation job
              </Typography>
              <Button
                variant="outlined"
                onClick={() => navigate('/mirror')}
                sx={{ borderRadius: 2 }}
              >
                Create Mirror Job
              </Button>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  )
}

export default Dashboard