const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, requireScope, cca } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const requireFabricReadScope = requireScope(['https://api.fabric.microsoft.com/Item.Read.All']);
const requireFabricWriteScope = requireScope(['https://api.fabric.microsoft.com/Item.ReadWrite.All']);

// All routes require authentication
router.use(authenticateToken);

/**
 * @route GET /api/mirror/programmable-objects
 * @desc Get source views and stored procedures from lakehouse SQL endpoint
 * @access Private
 */
router.get(['/programmable-objects', '/programmableObjects'], requireFabricReadScope, [
  query('sourceLakehouseId').isUUID().withMessage('Source lakehouse ID must be a valid UUID'),
  query('sourceWorkspaceId').isUUID().withMessage('Source workspace ID must be a valid UUID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { sourceLakehouseId, sourceWorkspaceId } = req.query;
    const executionToken = await resolveExecutionAccessToken(req.accessToken, {
      route: '/api/mirror/programmable-objects',
      userId: req.user?.id,
      sourceLakehouseId,
      sourceWorkspaceId
    });

    const { views, storedProcedures } = await fetchLakehouseProgrammableObjectsViaSqlEndpoint(
      executionToken,
      sourceLakehouseId,
      sourceWorkspaceId
    );

    res.json({
      sourceLakehouseId,
      sourceWorkspaceId,
      views,
      storedProcedures,
      count: {
        views: views.length,
        storedProcedures: storedProcedures.length
      }
    });
  } catch (error) {
    logger.error('Failed to fetch programmable objects', {
      userId: req.user?.id,
      sourceLakehouseId: req.query?.sourceLakehouseId,
      sourceWorkspaceId: req.query?.sourceWorkspaceId,
      error: error.message
    });
    next(error);
  }
});

// Store job status in memory (in production, use Redis or database)
const jobStatus = new Map();

function maskToken(token) {
  if (!token || token.length < 16) return 'n/a';
  return `${token.slice(0, 10)}...${token.slice(-6)}`;
}

function extractAxiosErrorDiagnostics(error) {
  return {
    status: error?.response?.status,
    statusText: error?.response?.statusText,
    errorCode: error?.response?.data?.errorCode,
    requestId: error?.response?.data?.requestId,
    message: error?.response?.data?.message || error?.message,
    moreDetails: error?.response?.data?.moreDetails || null,
    relatedResource: error?.response?.data?.relatedResource || null,
    responseHeaders: error?.response?.headers || null
  };
}

function appendJobDiagnostic(jobId, stage, details = {}) {
  const job = jobStatus.get(jobId);
  if (!job) return;

  if (!Array.isArray(job.diagnostics)) {
    job.diagnostics = [];
  }

  job.diagnostics.push({
    timestamp: new Date().toISOString(),
    stage,
    ...details
  });

  if (job.diagnostics.length > 250) {
    job.diagnostics = job.diagnostics.slice(job.diagnostics.length - 250);
  }

  jobStatus.set(jobId, job);
}

async function resolveExecutionAccessToken(userAccessToken, context = {}) {
  try {
    const appToken = await cca.acquireTokenByClientCredential({
      scopes: ['https://api.fabric.microsoft.com/.default']
    });

    if (appToken?.accessToken) {
      logger.info('Using application token for Fabric execution', {
        ...context,
        tokenSource: 'application',
        expiresOn: appToken.expiresOn ? appToken.expiresOn.toISOString() : null
      });
      return appToken.accessToken;
    }
  } catch (error) {
    logger.warn('Failed to acquire application token for Fabric execution; falling back to user token', {
      ...context,
      error: error.message
    });
  }

  logger.info('Using user token for Fabric execution fallback', {
    ...context,
    tokenSource: 'user'
  });
  return userAccessToken;
}

/**
 * @route POST /api/mirror/schema-shortcuts
 * @desc Create schema shortcuts from source to destination lakehouse
 * @access Private
 */
router.post('/schema-shortcuts', requireFabricWriteScope, [
  body('sourceLakehouseId').isUUID().withMessage('Source lakehouse ID must be a valid UUID'),
  body('destinationLakehouseId').isUUID().withMessage('Destination lakehouse ID must be a valid UUID'),
  body('sourceWorkspaceId').isUUID().withMessage('Source workspace ID must be a valid UUID'),
  body('destinationWorkspaceId').isUUID().withMessage('Destination workspace ID must be a valid UUID'),
  body('schemas').optional().isArray().withMessage('Schemas must be an array'),
  body('schemas.*').optional().isString().withMessage('Schema names must be strings'),
  body('excludeSchemas').optional().isArray().withMessage('Exclude schemas must be an array'),
  body('excludeSchemas.*').optional().isString().withMessage('Exclude schema names must be strings'),
  body('overwriteExisting').optional().isBoolean().withMessage('Overwrite existing must be a boolean'),
  body('includeAllViews').optional().isBoolean().withMessage('Include all views must be a boolean'),
  body('selectedViews').optional().isArray().withMessage('Selected views must be an array'),
  body('selectedViews.*').optional().isString().withMessage('Selected view names must be strings'),
  body('includeAllStoredProcedures').optional().isBoolean().withMessage('Include all stored procedures must be a boolean'),
  body('selectedStoredProcedures').optional().isArray().withMessage('Selected stored procedures must be an array'),
  body('selectedStoredProcedures.*').optional().isString().withMessage('Selected stored procedure names must be strings')
], async (req, res, next) => {
  try {
    const requestId = uuidv4();
    const startTime = Date.now();

    logger.info('Mirror schema-shortcuts request received', {
      requestId,
      userId: req.user?.id,
      tokenAudience: req.user?.tokenAudience,
      tokenScopes: req.user?.scopes || [],
      tokenRoles: req.user?.roles || [],
      tokenPreview: maskToken(req.accessToken),
      body: {
        sourceLakehouseId: req.body?.sourceLakehouseId,
        destinationLakehouseId: req.body?.destinationLakehouseId,
        sourceWorkspaceId: req.body?.sourceWorkspaceId,
        destinationWorkspaceId: req.body?.destinationWorkspaceId,
        schemas: req.body?.schemas || [],
        excludeSchemas: req.body?.excludeSchemas || [],
        overwriteExisting: req.body?.overwriteExisting,
        includeAllViews: req.body?.includeAllViews,
        selectedViewsCount: Array.isArray(req.body?.selectedViews) ? req.body.selectedViews.length : 0,
        includeAllStoredProcedures: req.body?.includeAllStoredProcedures,
        selectedStoredProceduresCount: Array.isArray(req.body?.selectedStoredProcedures) ? req.body.selectedStoredProcedures.length : 0
      }
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Mirror schema-shortcuts validation failed', {
        requestId,
        validationErrors: errors.array()
      });
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const {
      sourceLakehouseId,
      destinationLakehouseId,
      sourceWorkspaceId,
      destinationWorkspaceId,
      schemas = [],
      excludeSchemas = [],
      overwriteExisting = false,
      includeAllViews = true,
      selectedViews = [],
      includeAllStoredProcedures = true,
      selectedStoredProcedures = []
    } = req.body;

    // Generate job ID
    const jobId = uuidv4();

    // Initialize job status
    jobStatus.set(jobId, {
      id: jobId,
      requestId,
      status: 'initiated',
      progress: 0,
      message: 'Starting schema shortcut creation...',
      createdAt: new Date().toISOString(),
      userId: req.user.id,
      source: {
        lakehouseId: sourceLakehouseId,
        workspaceId: sourceWorkspaceId
      },
      destination: {
        lakehouseId: destinationLakehouseId,
        workspaceId: destinationWorkspaceId
      },
      results: {
        created: [],
        failed: [],
        skipped: []
      },
      diagnostics: [
        {
          timestamp: new Date().toISOString(),
          stage: 'job-initialized',
          requestId,
          latencyMs: Date.now() - startTime,
          payload: {
            sourceLakehouseId,
            destinationLakehouseId,
            sourceWorkspaceId,
            destinationWorkspaceId,
            schemas,
            excludeSchemas,
            overwriteExisting,
            includeAllViews,
            selectedViews,
            includeAllStoredProcedures,
            selectedStoredProcedures
          }
        }
      ]
    });

    logger.info('Schema shortcut job initiated', {
      jobId: jobId,
      requestId,
      userId: req.user.id,
      sourceLakehouseId: sourceLakehouseId,
      destinationLakehouseId: destinationLakehouseId,
      enqueueLatencyMs: Date.now() - startTime
    });

    const executionToken = await resolveExecutionAccessToken(req.accessToken, {
      route: '/api/mirror/schema-shortcuts',
      requestId,
      userId: req.user?.id
    });

    // Start the mirroring process asynchronously
    processSchemaShortcuts(
      jobId,
      executionToken,
      sourceLakehouseId,
      destinationLakehouseId,
      sourceWorkspaceId,
      destinationWorkspaceId,
      schemas,
      excludeSchemas,
      overwriteExisting,
      includeAllViews,
      selectedViews,
      includeAllStoredProcedures,
      selectedStoredProcedures
    ).catch(error => {
      logger.error('Schema shortcut job error:', {
        jobId: jobId,
        error: error.message
      });
      
      const job = jobStatus.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.completedAt = new Date().toISOString();
        jobStatus.set(jobId, job);
      }
    });

    res.status(202).json({
      jobId: jobId,
      status: 'initiated',
      message: 'Schema shortcut creation started. Use the job ID to check progress.',
      statusUrl: `/api/mirror/status/${jobId}`
    });

  } catch (error) {
    logger.error('Error initiating schema shortcuts:', {
      error: error.message,
      userId: req.user.id
    });
    next(error);
  }
});

/**
 * @route GET /api/mirror/status/:jobId
 * @desc Get the status of a mirroring job
 * @access Private
 */
router.get('/status/:jobId', requireFabricReadScope, [
  param('jobId').isUUID().withMessage('Job ID must be a valid UUID')
], (req, res) => {
  const { jobId } = req.params;
  const job = jobStatus.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Job not found'
    });
  }

  // Check if user has access to this job
  if (job.userId !== req.user.id) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have access to this job'
    });
  }

  res.json(job);
});

/**
 * @route GET /api/mirror/jobs/:jobId
 * @desc Get specific job details by ID
 * @access Private
 */
router.get('/jobs/:jobId', requireFabricReadScope, [
  param('jobId').isUUID().withMessage('Job ID must be a valid UUID')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { jobId } = req.params;
    const job = jobStatus.get(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found'
      });
    }

    // Check if user owns this job
    if (job.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this job'
      });
    }

    res.json(job);
  } catch (error) {
    logger.error('Error getting job details:', error, {
      service: 'lakehouse-mirror-api',
      userId: req.user.id,
      jobId: req.params.jobId,
      endpoint: '/api/mirror/jobs/:jobId'
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve job details'
    });
  }
});

/**
 * @route GET /api/mirror/jobs/:jobId/diagnostics
 * @desc Get detailed diagnostics for a specific job
 * @access Private
 */
router.get('/jobs/:jobId/diagnostics', requireFabricReadScope, [
  param('jobId').isUUID().withMessage('Job ID must be a valid UUID')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { jobId } = req.params;
    const limitRaw = req.query.limit;
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 500)
      : null;

    const job = jobStatus.get(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found'
      });
    }

    if (job.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this job diagnostics'
      });
    }

    const diagnostics = Array.isArray(job.diagnostics) ? job.diagnostics : [];
    const limitedDiagnostics = limit ? diagnostics.slice(-limit) : diagnostics;

    logger.info('Job diagnostics retrieved', {
      jobId,
      userId: req.user.id,
      totalDiagnostics: diagnostics.length,
      returnedDiagnostics: limitedDiagnostics.length,
      limit: limit || 'none'
    });

    res.json({
      jobId,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt || null,
      totalDiagnostics: diagnostics.length,
      returnedDiagnostics: limitedDiagnostics.length,
      diagnostics: limitedDiagnostics
    });
  } catch (error) {
    logger.error('Error getting job diagnostics:', {
      error: error.message,
      userId: req.user?.id,
      jobId: req.params?.jobId,
      endpoint: '/api/mirror/jobs/:jobId/diagnostics'
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve job diagnostics'
    });
  }
});

/**
 * @route DELETE /api/mirror/jobs/:jobId
 * @desc Cancel or delete a mirroring job
 * @access Private
 */
router.delete('/jobs/:jobId', requireFabricReadScope, [
  param('jobId').isUUID().withMessage('Job ID must be a valid UUID')
], (req, res) => {
  const { jobId } = req.params;
  const job = jobStatus.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Job not found'
    });
  }

  // Check if user has access to this job
  if (job.userId !== req.user.id) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have access to this job'
    });
  }

  // Mark job as cancelled if it's still running
  if (job.status === 'running' || job.status === 'initiated') {
    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    jobStatus.set(jobId, job);
  } else {
    // Delete completed job
    jobStatus.delete(jobId);
  }

  logger.info('Job cancelled/deleted', {
    jobId: jobId,
    userId: req.user.id
  });

  res.json({
    message: 'Job cancelled/deleted successfully'
  });
});

/**
 * @route GET /api/mirror/jobs
 * @desc Get all jobs for the current user
 * @access Private
 */
router.get('/jobs', requireFabricReadScope, (req, res) => {
  const userJobs = Array.from(jobStatus.values())
    .filter(job => job.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    jobs: userJobs,
    count: userJobs.length
  });
});

/**
 * @route POST /api/mirror/validate
 * @desc Create validation job to compare source and destination lakehouses
 * @access Private
 */
router.post('/validate', requireFabricReadScope, [
  body('sourceLakehouseId').isUUID().withMessage('Source lakehouse ID must be a valid UUID'),
  body('destinationLakehouseId').isUUID().withMessage('Destination lakehouse ID must be a valid UUID'),
  body('sourceWorkspaceId').isUUID().withMessage('Source workspace ID must be a valid UUID'),
  body('destinationWorkspaceId').isUUID().withMessage('Destination workspace ID must be a valid UUID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const {
      sourceLakehouseId,
      destinationLakehouseId,
      sourceWorkspaceId,
      destinationWorkspaceId,
      name = 'Lakehouse Validation'
    } = req.body;

    // Generate job ID
    const jobId = uuidv4();

    // Initialize validation job status
    jobStatus.set(jobId, {
      id: jobId,
      type: 'validation',
      status: 'initiated',
      progress: 0,
      message: 'Starting lakehouse validation...',
      createdAt: new Date().toISOString(),
      userId: req.user.id,
      name: name,
      source: {
        lakehouseId: sourceLakehouseId,
        workspaceId: sourceWorkspaceId
      },
      destination: {
        lakehouseId: destinationLakehouseId,
        workspaceId: destinationWorkspaceId
      },
      results: {
        summary: null,
        differences: [],
        sourceMetadata: null,
        destinationMetadata: null,
        comparisonStats: null
      }
    });

    logger.info('Validation job initiated', {
      jobId: jobId,
      userId: req.user.id,
      sourceLakehouseId: sourceLakehouseId,
      destinationLakehouseId: destinationLakehouseId
    });

    const executionToken = await resolveExecutionAccessToken(req.accessToken, {
      route: '/api/mirror/validate',
      userId: req.user?.id,
      jobId
    });

    // Start the validation process asynchronously
    processLakehouseValidation(
      jobId,
      executionToken,
      sourceLakehouseId,
      destinationLakehouseId,
      sourceWorkspaceId,
      destinationWorkspaceId
    ).catch(error => {
      logger.error('Validation job failed', {
        jobId: jobId,
        error: error.message
      });
    });

    res.status(202).json({
      jobId: jobId,
      status: 'initiated',
      message: 'Validation job started successfully',
      statusUrl: `/api/mirror/jobs/${jobId}`
    });

  } catch (error) {
    logger.error('Error creating validation job:', error, {
      service: 'lakehouse-mirror-api',
      userId: req.user.id,
      endpoint: '/api/mirror/validate'
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create validation job'
    });
  }
});

/**
 * @route GET /api/mirror/dashboard-stats
 * @desc Get dashboard statistics for the current user
 * @access Private
 */
router.get('/dashboard-stats', requireFabricReadScope, (req, res) => {
  try {
    // Get user's mirror jobs
    const userMirrorJobs = Array.from(jobStatus.values())
      .filter(job => job.userId === req.user.id);
    
    // Calculate mirror job statistics
    const totalMirrorJobs = userMirrorJobs.length;
    const completedMirrorJobs = userMirrorJobs.filter(job => job.status === 'completed').length;
    const failedMirrorJobs = userMirrorJobs.filter(job => job.status === 'failed').length;
    const runningMirrorJobs = userMirrorJobs.filter(job => job.status === 'running').length;
    
    // Calculate recent jobs (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentMirrorJobs = userMirrorJobs.filter(job => new Date(job.createdAt) > sevenDaysAgo).length;
    
    // Calculate average duration for completed jobs
    const completedJobsWithDuration = userMirrorJobs.filter(job => 
      job.status === 'completed' && job.completedAt && job.createdAt
    );
    
    let avgDurationMinutes = 0;
    if (completedJobsWithDuration.length > 0) {
      const totalDuration = completedJobsWithDuration.reduce((sum, job) => {
        const duration = new Date(job.completedAt) - new Date(job.createdAt);
        return sum + duration;
      }, 0);
      avgDurationMinutes = Math.round((totalDuration / completedJobsWithDuration.length) / (1000 * 60) * 10) / 10;
    }
    
    // Calculate success rate
    const successRate = totalMirrorJobs > 0 ? Math.round((completedMirrorJobs / totalMirrorJobs) * 100) : 0;
    
    // Get recent jobs for activity display
    const recentJobsDetails = userMirrorJobs
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map(job => ({
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        source: job.source,
        destination: job.destination,
        type: 'mirror'
      }));
    
    res.json({
      mirrorJobs: {
        total: totalMirrorJobs,
        completed: completedMirrorJobs,
        failed: failedMirrorJobs,
        running: runningMirrorJobs,
        recent: recentMirrorJobs
      },
      statistics: {
        recentJobs: totalMirrorJobs,
        recentJobsChange: `+${recentMirrorJobs} this week`,
        successRate: `${successRate}%`,
        successRateChange: successRate >= 90 ? '+2% this month' : 'needs improvement',
        avgDuration: avgDurationMinutes > 0 ? `${avgDurationMinutes}m` : 'N/A',
        avgDurationChange: avgDurationMinutes > 0 && avgDurationMinutes < 5 ? '-30s faster' : 'baseline'
      },
      recentActivity: recentJobsDetails
    });
  } catch (error) {
    logger.error('Error getting dashboard statistics:', error, {
      service: 'lakehouse-mirror-api',
      userId: req.user.id,
      endpoint: '/api/mirror/dashboard-stats'
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve dashboard statistics'
    });
  }
});

/**
 * Process schema shortcuts creation
 * @param {string} jobId - Job identifier
 * @param {string} accessToken - User access token
 * @param {string} sourceLakehouseId - Source lakehouse ID
 * @param {string} destinationLakehouseId - Destination lakehouse ID
 * @param {string} sourceWorkspaceId - Source workspace ID
 * @param {string} destinationWorkspaceId - Destination workspace ID
 * @param {string[]} schemas - Specific schemas to include
 * @param {string[]} excludeSchemas - Schemas to exclude
 * @param {boolean} overwriteExisting - Whether to overwrite existing shortcuts
 */
async function processSchemaShortcuts(
  jobId,
  accessToken,
  sourceLakehouseId,
  destinationLakehouseId,
  sourceWorkspaceId,
  destinationWorkspaceId,
  schemas,
  excludeSchemas,
  overwriteExisting,
  includeAllViews = true,
  selectedViews = [],
  includeAllStoredProcedures = true,
  selectedStoredProcedures = []
) {
  const job = jobStatus.get(jobId);
  const previewToken = `${String(accessToken || '').slice(0, 12)}...`;
  const startedAt = Date.now();
  
  try {
    appendJobDiagnostic(jobId, 'process-start', {
      sourceLakehouseId,
      destinationLakehouseId,
      sourceWorkspaceId,
      destinationWorkspaceId,
      schemas,
      excludeSchemas,
      overwriteExisting,
      includeAllViews,
      selectedViewsCount: Array.isArray(selectedViews) ? selectedViews.length : 0,
      includeAllStoredProcedures,
      selectedStoredProceduresCount: Array.isArray(selectedStoredProcedures) ? selectedStoredProcedures.length : 0,
      tokenPreview: previewToken
    });

    // Update job status
    job.status = 'running';
    job.progress = 10;
    job.message = 'Fetching source lakehouse schemas...';
    jobStatus.set(jobId, job);

    // Get source lakehouse schemas (with table-metadata fallback)
    const sourceSchemas = await fetchLakehouseSchemas(accessToken, sourceLakehouseId, sourceWorkspaceId);
    const sourceTables = await fetchLakehouseTables(accessToken, sourceLakehouseId, sourceWorkspaceId);
    const destinationSchemas = await fetchLakehouseSchemas(accessToken, destinationLakehouseId, destinationWorkspaceId);
    const destinationSchemaNames = new Set(destinationSchemas.map(schema => String(schema.name || '').trim().toLowerCase()));

    appendJobDiagnostic(jobId, 'source-schemas-loaded', {
      count: sourceSchemas.length,
      names: sourceSchemas.map(schema => schema.name)
    });

    appendJobDiagnostic(jobId, 'source-tables-loaded', {
      count: sourceTables.length
    });

    appendJobDiagnostic(jobId, 'destination-schemas-loaded', {
      count: destinationSchemas.length,
      names: destinationSchemas.map(schema => schema.name)
    });

    logger.info('Source schemas discovered', {
      jobId,
      sourceLakehouseId,
      sourceWorkspaceId,
      sourceSchemaCount: sourceSchemas.length,
      sourceSchemaNames: sourceSchemas.map(schema => schema.name),
      tokenPreview: previewToken
    });
    
    job.progress = 20;
    job.message = 'Filtering schemas based on criteria...';
    jobStatus.set(jobId, job);

    // Filter schemas based on include/exclude criteria
    let targetSchemas = sourceSchemas;
    
    if (schemas.length > 0) {
      targetSchemas = targetSchemas.filter(schema => schemas.includes(schema.name));
    }
    
    if (excludeSchemas.length > 0) {
      targetSchemas = targetSchemas.filter(schema => !excludeSchemas.includes(schema.name));
    }

    appendJobDiagnostic(jobId, 'target-schemas-filtered', {
      count: targetSchemas.length,
      names: targetSchemas.map(schema => schema.name),
      includeFilter: schemas,
      excludeFilter: excludeSchemas
    });

    logger.info('Target schemas after filtering', {
      jobId,
      includedSchemaFilter: schemas,
      excludedSchemaFilter: excludeSchemas,
      targetSchemaCount: targetSchemas.length,
      targetSchemaNames: targetSchemas.map(schema => schema.name),
      overwriteExisting
    });

    job.progress = 30;
    job.message = `Creating shortcuts for ${targetSchemas.length} schemas...`;
    job.totalSchemas = targetSchemas.length;
    jobStatus.set(jobId, job);

    // Process each schema
    for (let i = 0; i < targetSchemas.length; i++) {
      const schema = targetSchemas[i];
      
      try {
        job.progress = 30 + ((i / targetSchemas.length) * 60);
        job.message = `Processing schema: ${schema.name}`;
        jobStatus.set(jobId, job);

        // Check if schema shortcut already exists
        const existingShortcuts = await fetchLakehouseShortcuts(accessToken, destinationLakehouseId, destinationWorkspaceId);
        const existingSchema = existingShortcuts.find(sc => sc.name === schema.name);

        appendJobDiagnostic(jobId, 'destination-shortcuts-loaded', {
          schemaName: schema.name,
          count: existingShortcuts.length,
          names: existingShortcuts.map(shortcut => shortcut.name),
          existingSchemaFound: !!existingSchema
        });

        logger.info('Destination shortcut state before create', {
          jobId,
          schemaName: schema.name,
          destinationLakehouseId,
          destinationWorkspaceId,
          existingShortcutCount: existingShortcuts.length,
          existingSchemaFound: !!existingSchema,
          overwriteExisting
        });

        const schemaNameLower = String(schema.name || '').trim().toLowerCase();
        const destinationSchemaExists = destinationSchemaNames.has(schemaNameLower);

        if (destinationSchemaExists) {
          const sourceSchemaTables = sourceTables.filter(table => String(getTableSchemaName(table) || '').trim().toLowerCase() === schemaNameLower);

          appendJobDiagnostic(jobId, 'table-shortcut-mode-selected', {
            schemaName: schema.name,
            tableCount: sourceSchemaTables.length,
            reason: 'Destination schema already exists'
          });

          if (!sourceSchemaTables.length) {
            logger.warn('No source tables discovered for existing destination schema; falling back to schema shortcut create', {
              jobId,
              schemaName: schema.name,
              sourceLakehouseId,
              destinationLakehouseId,
              reason: 'Fabric tables endpoints may be unsupported for schema-enabled lakehouses in this tenant'
            });

            appendJobDiagnostic(jobId, 'table-shortcut-fallback-schema', {
              schemaName: schema.name,
              reason: 'No source tables discovered; fallback to schema shortcut creation'
            });
          } else {
            for (const table of sourceSchemaTables) {
              const tableName = getTableShortName(table);

              if (!tableName) {
                job.results.skipped.push({
                  schemaName: schema.name,
                  reason: 'Skipping table shortcut create due to missing table name in source metadata'
                });
                continue;
              }

              const existingTableShortcut = existingShortcuts.find(shortcut => String(shortcut.name || '').trim().toLowerCase() === tableName.toLowerCase());

              if (existingTableShortcut && !overwriteExisting) {
                job.results.skipped.push({
                  schemaName: schema.name,
                  tableName,
                  reason: 'Table shortcut already exists and overwrite is disabled'
                });
                continue;
              }

              try {
                const tableResult = await createTableShortcut(
                  accessToken,
                  destinationLakehouseId,
                  destinationWorkspaceId,
                  sourceLakehouseId,
                  sourceWorkspaceId,
                  schema.name,
                  tableName,
                  overwriteExisting
                );

                const createdShortcutName = tableResult?.createdShortcutName || tableName;
                existingShortcuts.push({ name: createdShortcutName });

                job.results.created.push({
                  schemaName: schema.name,
                  tableName,
                  shortcutType: 'table',
                  destinationShortcutName: createdShortcutName,
                  usedFallbackName: Boolean(tableResult?.usedFallbackName),
                  createdAt: new Date().toISOString()
                });

                appendJobDiagnostic(jobId, 'table-shortcut-create-success', {
                  schemaName: schema.name,
                  tableName,
                  destinationShortcutName: createdShortcutName,
                  usedFallbackName: Boolean(tableResult?.usedFallbackName)
                });
              } catch (tableError) {
                job.results.failed.push({
                  schemaName: schema.name,
                  tableName,
                  shortcutType: 'table',
                  error: tableError.message,
                  details: tableError.details || tableError.response?.data || null
                });

                appendJobDiagnostic(jobId, 'table-shortcut-create-failed', {
                  schemaName: schema.name,
                  tableName,
                  error: tableError.message,
                  details: tableError.details || tableError.response?.data || null
                });
              }
            }

            continue;
          }
        }

        if (existingSchema && !overwriteExisting) {
          appendJobDiagnostic(jobId, 'schema-skipped-existing', {
            schemaName: schema.name,
            overwriteExisting
          });
          job.results.skipped.push({
            schemaName: schema.name,
            reason: 'Already exists and overwrite is disabled'
          });
          continue;
        }

        // Create schema shortcut
        const createResult = await createSchemaShortcut(
          accessToken,
          destinationLakehouseId,
          destinationWorkspaceId,
          sourceLakehouseId,
          sourceWorkspaceId,
          schema.name,
          overwriteExisting
        );

        job.results.created.push({
          schemaName: schema.name,
          destinationShortcutName: createResult?.createdShortcutName || schema.name,
          usedFallbackName: Boolean(createResult?.usedFallbackName),
          createdAt: new Date().toISOString()
        });

        appendJobDiagnostic(jobId, 'schema-create-success', {
          schemaName: schema.name,
          destinationShortcutName: createResult?.createdShortcutName || schema.name,
          usedFallbackName: Boolean(createResult?.usedFallbackName)
        });

        logger.info('Schema shortcut created', {
          jobId: jobId,
          schemaName: schema.name,
          sourceLakehouseId: sourceLakehouseId,
          destinationLakehouseId: destinationLakehouseId
        });

      } catch (schemaError) {
        const isConflictError = Array.isArray(schemaError.details)
          && schemaError.details.some(detail => detail.status === 409);
        const isDefaultDbo = String(schema.name || '').toLowerCase() === 'dbo';

        if (isConflictError && isDefaultDbo) {
          appendJobDiagnostic(jobId, 'schema-skipped-dbo-conflict', {
            schemaName: schema.name,
            details: schemaError.details || null
          });
          job.results.skipped.push({
            schemaName: schema.name,
            reason: 'Default dbo schema already exists in destination lakehouse'
          });
          continue;
        }

        logger.error('Failed to create schema shortcut', {
          jobId: jobId,
          schemaName: schema.name,
          error: schemaError.message,
          details: schemaError.details || schemaError.response?.data || null
        });

        job.results.failed.push({
          schemaName: schema.name,
          error: schemaError.message,
          details: schemaError.details || schemaError.response?.data || null
        });

        appendJobDiagnostic(jobId, 'schema-create-failed', {
          schemaName: schema.name,
          error: schemaError.message,
          details: schemaError.details || schemaError.response?.data || null
        });
      }
    }

    const shouldApplyProgrammableObjects = includeAllViews || includeAllStoredProcedures || selectedViews.length > 0 || selectedStoredProcedures.length > 0;
    let applySummary = {
      views: { applied: [], failed: [], skipped: [] },
      storedProcedures: { applied: [], failed: [], skipped: [] }
    };

    if (shouldApplyProgrammableObjects) {
      const destinationSqlDetails = await resolveSqlEndpointConnectionDetails(
        accessToken,
        destinationLakehouseId,
        destinationWorkspaceId
      );

      if (!destinationSqlDetails.discoveredEndpointId) {
        throw new Error('Destination SQL endpoint ID could not be resolved; metadata refresh is required before applying views/procedures.');
      }

      job.progress = 88;
      job.message = 'Refreshing destination SQL endpoint metadata...';
      jobStatus.set(jobId, job);

      const refreshResult = await refreshSqlEndpointMetadata(
        accessToken,
        destinationWorkspaceId,
        destinationSqlDetails.discoveredEndpointId
      );

      appendJobDiagnostic(jobId, 'sql-endpoint-metadata-refresh-complete', {
        destinationWorkspaceId,
        destinationLakehouseId,
        sqlEndpointId: destinationSqlDetails.discoveredEndpointId,
        mode: refreshResult.mode,
        statusCode: refreshResult.statusCode,
        tableStatuses: refreshResult.tableStatuses,
        pollCount: refreshResult.pollCount
      });

      job.progress = 92;
      job.message = 'Applying views and stored procedures with CREATE OR ALTER...';
      jobStatus.set(jobId, job);

      applySummary = await applyProgrammableObjectsToLakehouse(
        accessToken,
        sourceLakehouseId,
        sourceWorkspaceId,
        destinationLakehouseId,
        destinationWorkspaceId,
        {
          includeAllViews,
          selectedViews,
          includeAllStoredProcedures,
          selectedStoredProcedures
        }
      );

      job.results.appliedObjects = applySummary;

      appendJobDiagnostic(jobId, 'programmable-objects-apply-complete', {
        viewsApplied: applySummary.views.applied.length,
        viewsFailed: applySummary.views.failed.length,
        viewsSkipped: applySummary.views.skipped.length,
        storedProceduresApplied: applySummary.storedProcedures.applied.length,
        storedProceduresFailed: applySummary.storedProcedures.failed.length,
        storedProceduresSkipped: applySummary.storedProcedures.skipped.length
      });
    }

    // Complete job
    job.status = 'completed';
    job.progress = 100;
    job.message = `Completed successfully. Created: ${job.results.created.length}, Failed: ${job.results.failed.length}, Skipped: ${job.results.skipped.length}, Views Applied: ${applySummary.views.applied.length}, Procedures Applied: ${applySummary.storedProcedures.applied.length}`;
    job.completedAt = new Date().toISOString();
    jobStatus.set(jobId, job);

    logger.info('Schema shortcut job completed', {
      jobId: jobId,
      created: job.results.created.length,
      failed: job.results.failed.length,
      skipped: job.results.skipped.length,
      durationMs: Date.now() - startedAt
    });

    appendJobDiagnostic(jobId, 'process-complete', {
      durationMs: Date.now() - startedAt,
      createdCount: job.results.created.length,
      failedCount: job.results.failed.length,
      skippedCount: job.results.skipped.length
    });

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    jobStatus.set(jobId, job);

    appendJobDiagnostic(jobId, 'process-fatal-error', {
      durationMs: Date.now() - startedAt,
      error: error.message,
      diagnostics: extractAxiosErrorDiagnostics(error)
    });
    
    throw error;
  }
}

/**
 * Fetch schemas from a lakehouse
 */
async function fetchLakehouseSchemas(accessToken, lakehouseId, workspaceId = null) {
  const schemaUrls = [
    `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/schemas`
  ];

  if (workspaceId) {
    schemaUrls.push(`${process.env.FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items/${lakehouseId}/lakehouse/schemas`);
    schemaUrls.push(`${process.env.FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items/${lakehouseId}/schemas`);
  }

  let lastError = null;

  for (const url of schemaUrls) {
    try {
      const attemptId = uuidv4();
      const t0 = Date.now();
      logger.info('Attempting schema fetch endpoint', {
        lakehouseId,
        workspaceId,
        url,
        attemptId
      });

      const response = await axios.get(
        url,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-ms-client-request-id': attemptId,
            'x-ms-correlation-id': attemptId
          }
        }
      );

      logger.info('Schema fetch endpoint succeeded', {
        lakehouseId,
        workspaceId,
        url,
        schemaCount: response.data?.value?.length || 0,
        attemptId,
        elapsedMs: Date.now() - t0,
        responseHeaders: response.headers || null
      });

      return response.data.value || [];
    } catch (error) {
      lastError = error;
      const diagnostics = extractAxiosErrorDiagnostics(error);
      logger.warn('Schema fetch endpoint failed', {
        lakehouseId,
        workspaceId,
        url,
        diagnostics
      });
      if (![400, 404].includes(error.response?.status)) {
        throw error;
      }
    }
  }

  const tables = await fetchLakehouseTables(accessToken, lakehouseId, workspaceId);
  const derivedSchemas = deriveSchemasFromTables(tables);

  logger.warn('Falling back to schema derivation from tables metadata', {
    lakehouseId,
    workspaceId,
    derivedSchemaCount: derivedSchemas.length,
    tableCount: tables.length,
    schemaEndpointError: lastError?.response?.data || lastError?.message
  });

  if (!derivedSchemas.length) {
    logger.warn('No schemas resolved from endpoints or tables; using dbo fallback', {
      lakehouseId,
      workspaceId
    });
    return [{
      name: 'dbo',
      description: 'Default schema fallback',
      tableCount: 0
    }];
  }

  return derivedSchemas.map(name => ({
    name,
    description: 'Derived from table metadata fallback',
    tableCount: tables.filter(table => getTableSchemaName(table) === name).length
  }));
}

function getTableSchemaName(table) {
  if (table?.schema) return String(table.schema).trim();
  if (table?.schemaName) return String(table.schemaName).trim();

  const location = String(table?.location || '');
  const locationMatch = location.match(/(?:^|\/)Tables\/([^\/]+)/i);
  if (locationMatch?.[1]) {
    return locationMatch[1].trim();
  }

  const tableName = String(table?.name || '');
  if (tableName.includes('.')) {
    return tableName.split('.')[0].trim();
  }

  return 'dbo';
}

function getTableShortName(table) {
  const explicit = String(table?.tableName || '').trim();
  if (explicit) return explicit;

  const name = String(table?.name || '').trim();
  if (name) {
    const parts = name.split('.').map(part => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : name;
  }

  const location = String(table?.location || '').trim();
  const locationMatch = location.match(/(?:^|\/)Tables\/[^\/]+\/([^\/]+)/i);
  if (locationMatch?.[1]) return locationMatch[1].trim();

  return '';
}

function deriveSchemasFromTables(tables) {
  const schemaSet = new Set();

  for (const table of tables || []) {
    const schemaName = getTableSchemaName(table);
    if (schemaName) {
      schemaSet.add(schemaName);
    }
  }

  return Array.from(schemaSet);
}

function parseJsonEnvMap(rawValue) {
  if (!rawValue) return {};
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    logger.warn('Failed to parse JSON map from environment variable', {
      error: error.message
    });
    return {};
  }
}

function resolveSqlEndpointServer(workspaceId) {
  const serverMap = parseJsonEnvMap(process.env.FABRIC_SQL_ENDPOINT_SERVER_MAP);
  return serverMap[workspaceId] || process.env.FABRIC_SQL_ENDPOINT_SERVER || '';
}

function resolveSqlEndpointDatabaseName(lakehouseId, workspaceId) {
  const dbMap = parseJsonEnvMap(process.env.FABRIC_SQL_ENDPOINT_DATABASE_MAP);

  if (dbMap[lakehouseId]) return dbMap[lakehouseId];

  const compositeKey = `${workspaceId}/${lakehouseId}`;
  if (dbMap[compositeKey]) return dbMap[compositeKey];

  return process.env.FABRIC_SQL_ENDPOINT_DATABASE || '';
}

function parseSqlEndpointConnectionString(rawConnectionString) {
  const value = String(rawConnectionString || '').trim();
  if (!value) {
    return {
      server: '',
      database: ''
    };
  }

  if (!value.includes(';')) {
    return {
      server: value,
      database: ''
    };
  }

  const parts = value
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);

  let server = '';
  let database = '';

  for (const part of parts) {
    const [rawKey, ...rawRest] = part.split('=');
    if (!rawKey || rawRest.length === 0) continue;

    const key = rawKey.trim().toLowerCase();
    const val = rawRest.join('=').trim();

    if (key === 'server' || key === 'data source' || key === 'address' || key === 'addr') {
      let normalizedServer = val;
      normalizedServer = normalizedServer.replace(/^tcp:/i, '').trim();
      normalizedServer = normalizedServer.replace(/,\d+$/i, '').trim();
      server = normalizedServer;
    }

    if (key === 'database' || key === 'initial catalog') {
      database = val;
    }
  }

  return {
    server,
    database
  };
}

async function getSqlEndpointAccessToken() {
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing TENANT_ID/CLIENT_ID/CLIENT_SECRET required for SQL endpoint token acquisition');
  }

  const response = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://database.windows.net/.default',
      grant_type: 'client_credentials'
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 30000
    }
  );

  return response.data?.access_token;
}

async function resolveSqlEndpointConnectionDetails(accessToken, lakehouseId, workspaceId = null) {
  const configuredServer = resolveSqlEndpointServer(workspaceId || '');
  const configuredDatabase = resolveSqlEndpointDatabaseName(lakehouseId, workspaceId || '');
  const dbCandidates = [];

  if (configuredDatabase) {
    dbCandidates.push(configuredDatabase);
  }

  let discoveredServer = '';
  let discoveredConnectionString = '';
  let discoveredDatabase = '';
  let discoveredEndpointId = '';
  let discoveredDisplayName = '';

  if (workspaceId && accessToken) {
    try {
      const response = await axios.get(
        `${process.env.FABRIC_API_BASE_URL}/workspaces/${workspaceId}/lakehouses/${lakehouseId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      discoveredConnectionString =
        response.data?.sqlEndpoint?.connectionString ||
        response.data?.properties?.sqlEndpoint?.connectionString ||
        response.data?.properties?.sqlEndpointProperties?.connectionString ||
        '';

      const parsedConnection = parseSqlEndpointConnectionString(discoveredConnectionString);
      discoveredServer = parsedConnection.server || discoveredConnectionString;
      discoveredDatabase = parsedConnection.database || '';
      discoveredEndpointId =
        response.data?.properties?.sqlEndpointProperties?.id ||
        response.data?.sqlEndpoint?.id ||
        response.data?.properties?.sqlEndpoint?.id ||
        response.data?.sqlEndpointProperties?.id ||
        '';
      discoveredDisplayName = response.data?.displayName || '';
    } catch (error) {
      logger.warn('Failed to auto-resolve SQL endpoint metadata from lakehouse', {
        lakehouseId,
        workspaceId,
        error: error.response?.data || error.message
      });
    }
  }

  if (discoveredDatabase) dbCandidates.push(discoveredDatabase);
  if (discoveredDisplayName) dbCandidates.push(discoveredDisplayName);
  if (lakehouseId) dbCandidates.push(lakehouseId);
  if (discoveredEndpointId) dbCandidates.push(discoveredEndpointId);

  if (!discoveredEndpointId && workspaceId && accessToken) {
    try {
      const response = await axios.get(
        `${process.env.FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items?type=SQLEndpoint`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const sqlEndpoints = Array.isArray(response.data?.value) ? response.data.value : [];
      const normalizedLakehouseName = normalizeName(discoveredDisplayName);

      const matchedEndpoint = sqlEndpoints.find(item => {
        const endpointName = normalizeName(item?.displayName || item?.name);
        if (!endpointName) return false;
        if (!normalizedLakehouseName) return false;
        return endpointName === normalizedLakehouseName
          || endpointName.includes(normalizedLakehouseName)
          || normalizedLakehouseName.includes(endpointName);
      }) || (sqlEndpoints.length === 1 ? sqlEndpoints[0] : null);

      discoveredEndpointId = matchedEndpoint?.id || '';
    } catch (error) {
      logger.warn('Failed to resolve SQL endpoint ID from workspace SQLEndpoint items', {
        lakehouseId,
        workspaceId,
        error: error.response?.data || error.message
      });
    }
  }

  const uniqueDbCandidates = Array.from(new Set(dbCandidates.filter(Boolean)));
  const server = configuredServer || discoveredServer;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const inferredEndpointId = !discoveredEndpointId
    ? uniqueDbCandidates.find(candidate => uuidPattern.test(String(candidate)) && String(candidate).toLowerCase() !== String(lakehouseId || '').toLowerCase()) || ''
    : discoveredEndpointId;

  return {
    server,
    dbCandidates: uniqueDbCandidates,
    discoveredEndpointId: inferredEndpointId,
    discoveredDisplayName
  };
}

function escapeSqlLiteral(value) {
  return String(value || '').replace(/'/g, "''");
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function buildAbsoluteUrl(baseUrl, maybeRelativeUrl) {
  if (!maybeRelativeUrl) return '';
  if (/^https?:\/\//i.test(maybeRelativeUrl)) {
    return maybeRelativeUrl;
  }

  const normalizedBase = String(baseUrl || '').replace(/\/$/, '');
  const normalizedRelative = String(maybeRelativeUrl).startsWith('/')
    ? String(maybeRelativeUrl)
    : `/${String(maybeRelativeUrl)}`;

  return `${normalizedBase}${normalizedRelative}`;
}

async function refreshSqlEndpointMetadata(
  accessToken,
  workspaceId,
  sqlEndpointId,
  options = {}
) {
  const refreshUrl = `${process.env.FABRIC_API_BASE_URL}/workspaces/${workspaceId}/sqlEndpoints/${sqlEndpointId}/refreshMetadata`;
  const refreshPayload = {
    recreateTables: Boolean(options.recreateTables || false),
    timeout: options.timeout || {
      timeUnit: 'Minutes',
      value: 15
    }
  };

  const refreshMaxAttempts = Number(options.refreshMaxAttempts || 5);
  let refreshResponse = null;

  for (let attempt = 1; attempt <= refreshMaxAttempts; attempt++) {
    refreshResponse = await axios.post(
      refreshUrl,
      refreshPayload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        validateStatus: () => true
      }
    );

    if (![429, 503].includes(refreshResponse.status)) {
      break;
    }

    if (attempt < refreshMaxAttempts) {
      const retryAfterHeader = Number(refreshResponse.headers?.['retry-after'] || refreshResponse.headers?.['Retry-After']);
      const retryAfterSeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? Math.min(retryAfterHeader, 30)
        : 5;
      await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
    }
  }

  if (refreshResponse.status === 200) {
    return {
      mode: 'immediate',
      statusCode: 200,
      tableStatuses: Array.isArray(refreshResponse.data?.value) ? refreshResponse.data.value.length : 0,
      pollCount: 0
    };
  }

  if (refreshResponse.status !== 202) {
    const diagnostics = refreshResponse.data?.message || JSON.stringify(refreshResponse.data || {});
    throw new Error(`SQL endpoint metadata refresh failed with status ${refreshResponse.status}: ${diagnostics}`);
  }

  const locationHeader = refreshResponse.headers?.location || refreshResponse.headers?.Location;
  const operationUrl = buildAbsoluteUrl(process.env.FABRIC_API_BASE_URL, locationHeader);
  if (!operationUrl) {
    throw new Error('SQL endpoint metadata refresh returned 202 but no Location header was provided for polling.');
  }

  const maxPolls = Number(options.maxPolls || 60);
  let pollCount = 0;
  let retryAfterSeconds = Number(refreshResponse.headers?.['retry-after'] || refreshResponse.headers?.['Retry-After']);
  retryAfterSeconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.min(retryAfterSeconds, 30)
    : 5;

  while (pollCount < maxPolls) {
    pollCount += 1;
    await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));

    const pollResponse = await axios.get(operationUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      validateStatus: () => true
    });

    if (pollResponse.status === 200) {
      return {
        mode: 'lro',
        statusCode: 200,
        tableStatuses: Array.isArray(pollResponse.data?.value) ? pollResponse.data.value.length : 0,
        pollCount
      };
    }

    if (pollResponse.status === 202) {
      const retryAfterHeader = Number(pollResponse.headers?.['retry-after'] || pollResponse.headers?.['Retry-After']);
      retryAfterSeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? Math.min(retryAfterHeader, 30)
        : 5;
      continue;
    }

    const diagnostics = pollResponse.data?.message || JSON.stringify(pollResponse.data || {});
    throw new Error(`SQL endpoint metadata refresh polling failed with status ${pollResponse.status}: ${diagnostics}`);
  }

  throw new Error(`SQL endpoint metadata refresh polling timed out after ${maxPolls} attempts.`);
}

async function fetchLakehouseTablesViaSqlEndpoint(accessToken, lakehouseId, workspaceId = null) {
  const {
    server,
    dbCandidates,
    discoveredEndpointId,
    discoveredDisplayName
  } = await resolveSqlEndpointConnectionDetails(accessToken, lakehouseId, workspaceId);

  if (!server || dbCandidates.length === 0) {
    logger.info('SQL endpoint fallback skipped due to missing server/database candidates', {
      lakehouseId,
      workspaceId,
      hasServer: Boolean(server),
      dbCandidatesCount: dbCandidates.length,
      discoveredEndpointId,
      discoveredDisplayName
    });
    return [];
  }

  let sql;
  try {
    sql = require('mssql');
  } catch (moduleError) {
    logger.warn('SQL endpoint fallback unavailable because mssql dependency is not installed', {
      error: moduleError.message,
      lakehouseId,
      workspaceId
    });
    return [];
  }

  const sqlUser = process.env.FABRIC_SQL_ENDPOINT_USER;
  const sqlPassword = process.env.FABRIC_SQL_ENDPOINT_PASSWORD;
  let sqlAccessToken = null;

  if (!sqlUser || !sqlPassword) {
    try {
      sqlAccessToken = await getSqlEndpointAccessToken();
    } catch (tokenError) {
      logger.warn('Failed to acquire SQL endpoint access token for fallback', {
        lakehouseId,
        workspaceId,
        error: tokenError.message
      });
      return [];
    }
  }

  for (const database of dbCandidates) {
    let pool;
    try {
      const config = {
        server,
        database,
        options: {
          encrypt: true,
          trustServerCertificate: false,
          enableArithAbort: true
        },
        pool: {
          max: 3,
          min: 0,
          idleTimeoutMillis: 10000
        },
        connectionTimeout: 15000,
        requestTimeout: 30000
      };

      if (sqlUser && sqlPassword) {
        config.user = sqlUser;
        config.password = sqlPassword;
      } else {
        config.authentication = {
          type: 'azure-active-directory-access-token',
          options: {
            token: sqlAccessToken
          }
        };
      }

      pool = await sql.connect(config);
      const result = await pool.request().query(`
        SELECT
          TABLE_SCHEMA AS schemaName,
          TABLE_NAME AS tableName
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
      `);

      const rows = Array.isArray(result.recordset) ? result.recordset : [];
      const tables = rows
        .filter(row => row?.schemaName && row?.tableName)
        .map(row => ({
          name: `${row.schemaName}.${row.tableName}`,
          schema: String(row.schemaName),
          tableName: String(row.tableName),
          location: `Tables/${row.schemaName}/${row.tableName}`,
          source: 'sql-endpoint'
        }));

      logger.info('SQL endpoint fallback succeeded for lakehouse table discovery', {
        lakehouseId,
        workspaceId,
        server,
        database,
        discoveredTableCount: tables.length
      });

      return tables;
    } catch (error) {
      logger.warn('SQL endpoint database candidate failed during fallback', {
        lakehouseId,
        workspaceId,
        server,
        database,
        error: error.message
      });
    } finally {
      try {
        if (pool) {
          await pool.close();
        } else if (sql?.close) {
          await sql.close();
        }
      } catch (closeError) {
        logger.debug('Error closing SQL endpoint fallback connection', {
          error: closeError.message
        });
      }
    }
  }

  return [];
}

function quoteSqlIdentifier(identifier) {
  return `[${String(identifier || '').replace(/\]/g, ']]')}]`;
}

function normalizeProgrammableObjectRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row?.schemaName && row?.name)
    .filter(row => !isSystemSchemaName(row.schemaName))
    .map(row => {
      const schemaName = String(row.schemaName).trim();
      const name = String(row.name).trim();
      return {
        schemaName,
        name,
        fullName: `${schemaName}.${name}`
      };
    });
}

function parseQualifiedObjectName(value, fallbackSchema = 'dbo') {
  const raw = String(value || '').trim();
  if (!raw) return { schemaName: fallbackSchema, name: '' };

  const cleaned = raw.replace(/\[/g, '').replace(/\]/g, '');
  const parts = cleaned.split('.').map(part => part.trim()).filter(Boolean);

  if (parts.length === 1) {
    return { schemaName: fallbackSchema, name: parts[0] };
  }

  return {
    schemaName: parts[parts.length - 2],
    name: parts[parts.length - 1]
  };
}

function isSystemSchemaName(schemaName) {
  const normalized = normalizeName(schemaName);
  return normalized === 'sys'
    || normalized === 'information_schema'
    || normalized === 'queryinsights';
}

function toCreateOrAlterStatement(definition, objectType, schemaName, objectName) {
  const trimmedDefinition = String(definition || '').trim();
  const typeKeyword = objectType === 'view' ? 'VIEW' : 'PROCEDURE';
  const objectRef = `${quoteSqlIdentifier(schemaName)}.${quoteSqlIdentifier(objectName)}`;

  if (!trimmedDefinition) {
    return null;
  }

  const createOrAlterRegex = /^\s*(CREATE|ALTER)\s+(OR\s+ALTER\s+)?(VIEW|PROC|PROCEDURE)\b/i;
  if (createOrAlterRegex.test(trimmedDefinition)) {
    return trimmedDefinition.replace(createOrAlterRegex, `CREATE OR ALTER ${typeKeyword}`);
  }

  if (/^\s*AS\b/i.test(trimmedDefinition)) {
    return `CREATE OR ALTER ${typeKeyword} ${objectRef}\n${trimmedDefinition}`;
  }

  return `CREATE OR ALTER ${typeKeyword} ${objectRef}\nAS\n${trimmedDefinition}`;
}

async function fetchLakehouseProgrammableObjectsViaSqlEndpoint(accessToken, lakehouseId, workspaceId = null) {
  const {
    server,
    dbCandidates
  } = await resolveSqlEndpointConnectionDetails(accessToken, lakehouseId, workspaceId);

  if (!server || dbCandidates.length === 0) {
    return { views: [], storedProcedures: [] };
  }

  let sql;
  try {
    sql = require('mssql');
  } catch (moduleError) {
    logger.warn('Programmable object SQL discovery unavailable because mssql dependency is not installed', {
      error: moduleError.message,
      lakehouseId,
      workspaceId
    });
    return { views: [], storedProcedures: [] };
  }

  const sqlUser = process.env.FABRIC_SQL_ENDPOINT_USER;
  const sqlPassword = process.env.FABRIC_SQL_ENDPOINT_PASSWORD;
  let sqlAccessToken = null;

  if (!sqlUser || !sqlPassword) {
    sqlAccessToken = await getSqlEndpointAccessToken();
  }

  for (const database of dbCandidates) {
    let pool;
    try {
      const config = {
        server,
        database,
        options: {
          encrypt: true,
          trustServerCertificate: false,
          enableArithAbort: true
        },
        pool: {
          max: 3,
          min: 0,
          idleTimeoutMillis: 10000
        },
        connectionTimeout: 15000,
        requestTimeout: 30000
      };

      if (sqlUser && sqlPassword) {
        config.user = sqlUser;
        config.password = sqlPassword;
      } else {
        config.authentication = {
          type: 'azure-active-directory-access-token',
          options: {
            token: sqlAccessToken
          }
        };
      }

      pool = await sql.connect(config);

      const [viewsResult, proceduresResult] = await Promise.all([
        pool.request().query(`
          SELECT
            TABLE_SCHEMA AS schemaName,
            TABLE_NAME AS name
          FROM INFORMATION_SCHEMA.VIEWS
        `),
        pool.request().query(`
          SELECT
            s.name AS schemaName,
            p.name AS name
          FROM sys.procedures p
          INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
        `)
      ]);

      return {
        views: normalizeProgrammableObjectRows(viewsResult.recordset),
        storedProcedures: normalizeProgrammableObjectRows(proceduresResult.recordset)
      };
    } catch (error) {
      logger.warn('SQL endpoint candidate failed while loading programmable objects', {
        lakehouseId,
        workspaceId,
        server,
        database,
        error: error.message
      });
    } finally {
      try {
        if (pool) {
          await pool.close();
        } else if (sql?.close) {
          await sql.close();
        }
      } catch (closeError) {
        logger.debug('Error closing programmable object SQL connection', {
          error: closeError.message
        });
      }
    }
  }

  return { views: [], storedProcedures: [] };
}

async function fetchLakehouseObjectDefinitionsViaSqlEndpoint(accessToken, lakehouseId, workspaceId = null) {
  const {
    server,
    dbCandidates
  } = await resolveSqlEndpointConnectionDetails(accessToken, lakehouseId, workspaceId);

  if (!server || dbCandidates.length === 0) {
    return { views: [], storedProcedures: [] };
  }

  let sql;
  try {
    sql = require('mssql');
  } catch (moduleError) {
    logger.warn('SQL definitions discovery unavailable because mssql dependency is not installed', {
      error: moduleError.message,
      lakehouseId,
      workspaceId
    });
    return { views: [], storedProcedures: [] };
  }

  const sqlUser = process.env.FABRIC_SQL_ENDPOINT_USER;
  const sqlPassword = process.env.FABRIC_SQL_ENDPOINT_PASSWORD;
  let sqlAccessToken = null;

  if (!sqlUser || !sqlPassword) {
    sqlAccessToken = await getSqlEndpointAccessToken();
  }

  for (const database of dbCandidates) {
    let pool;
    try {
      const config = {
        server,
        database,
        options: {
          encrypt: true,
          trustServerCertificate: false,
          enableArithAbort: true
        },
        pool: {
          max: 3,
          min: 0,
          idleTimeoutMillis: 10000
        },
        connectionTimeout: 15000,
        requestTimeout: 30000
      };

      if (sqlUser && sqlPassword) {
        config.user = sqlUser;
        config.password = sqlPassword;
      } else {
        config.authentication = {
          type: 'azure-active-directory-access-token',
          options: {
            token: sqlAccessToken
          }
        };
      }

      pool = await sql.connect(config);

      const [viewsResult, proceduresResult] = await Promise.all([
        pool.request().query(`
          SELECT
            s.name AS schemaName,
            v.name AS name,
            m.definition AS definition
          FROM sys.views v
          INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
          INNER JOIN sys.sql_modules m ON v.object_id = m.object_id
        `),
        pool.request().query(`
          SELECT
            s.name AS schemaName,
            p.name AS name,
            m.definition AS definition
          FROM sys.procedures p
          INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
          INNER JOIN sys.sql_modules m ON p.object_id = m.object_id
        `)
      ]);

      return {
        views: Array.isArray(viewsResult.recordset) ? viewsResult.recordset : [],
        storedProcedures: Array.isArray(proceduresResult.recordset) ? proceduresResult.recordset : []
      };
    } catch (error) {
      logger.warn('SQL endpoint candidate failed while loading object definitions', {
        lakehouseId,
        workspaceId,
        server,
        database,
        error: error.message
      });
    } finally {
      try {
        if (pool) {
          await pool.close();
        } else if (sql?.close) {
          await sql.close();
        }
      } catch (closeError) {
        logger.debug('Error closing object definitions SQL connection', {
          error: closeError.message
        });
      }
    }
  }

  return { views: [], storedProcedures: [] };
}

async function applyProgrammableObjectsToLakehouse(
  accessToken,
  sourceLakehouseId,
  sourceWorkspaceId,
  destinationLakehouseId,
  destinationWorkspaceId,
  options
) {
  const summary = {
    schemas: { created: [], existing: [], failed: [] },
    views: { applied: [], failed: [], skipped: [] },
    storedProcedures: { applied: [], failed: [], skipped: [] }
  };

  const sourceDefinitions = await fetchLakehouseObjectDefinitionsViaSqlEndpoint(
    accessToken,
    sourceLakehouseId,
    sourceWorkspaceId
  );

  const viewsByName = new Map(
    sourceDefinitions.views
      .filter(item => !isSystemSchemaName(item.schemaName))
      .map(item => [
      `${String(item.schemaName || '').toLowerCase()}.${String(item.name || '').toLowerCase()}`,
      item
    ])
  );

  const proceduresByName = new Map(
    sourceDefinitions.storedProcedures
      .filter(item => !isSystemSchemaName(item.schemaName))
      .map(item => [
      `${String(item.schemaName || '').toLowerCase()}.${String(item.name || '').toLowerCase()}`,
      item
    ])
  );

  const requestedViews = options.includeAllViews
    ? sourceDefinitions.views
      .filter(item => !isSystemSchemaName(item.schemaName))
      .map(item => `${item.schemaName}.${item.name}`)
    : options.selectedViews;

  const requestedProcedures = options.includeAllStoredProcedures
    ? sourceDefinitions.storedProcedures
      .filter(item => !isSystemSchemaName(item.schemaName))
      .map(item => `${item.schemaName}.${item.name}`)
    : options.selectedStoredProcedures;

  const {
    server,
    dbCandidates
  } = await resolveSqlEndpointConnectionDetails(accessToken, destinationLakehouseId, destinationWorkspaceId);

  if (!server || dbCandidates.length === 0) {
    const message = 'Destination SQL endpoint connection details are unavailable';
    requestedViews.forEach(name => summary.views.failed.push({ name, error: message }));
    requestedProcedures.forEach(name => summary.storedProcedures.failed.push({ name, error: message }));
    return summary;
  }

  let sql;
  try {
    sql = require('mssql');
  } catch (moduleError) {
    const message = `Destination SQL apply unavailable: ${moduleError.message}`;
    requestedViews.forEach(name => summary.views.failed.push({ name, error: message }));
    requestedProcedures.forEach(name => summary.storedProcedures.failed.push({ name, error: message }));
    return summary;
  }

  const sqlUser = process.env.FABRIC_SQL_ENDPOINT_USER;
  const sqlPassword = process.env.FABRIC_SQL_ENDPOINT_PASSWORD;
  let sqlAccessToken = null;

  if (!sqlUser || !sqlPassword) {
    sqlAccessToken = await getSqlEndpointAccessToken();
  }

  let pool = null;
  let connectedDatabase = '';

  for (const database of dbCandidates) {
    try {
      const config = {
        server,
        database,
        options: {
          encrypt: true,
          trustServerCertificate: false,
          enableArithAbort: true
        },
        pool: {
          max: 3,
          min: 0,
          idleTimeoutMillis: 10000
        },
        connectionTimeout: 15000,
        requestTimeout: 45000
      };

      if (sqlUser && sqlPassword) {
        config.user = sqlUser;
        config.password = sqlPassword;
      } else {
        config.authentication = {
          type: 'azure-active-directory-access-token',
          options: {
            token: sqlAccessToken
          }
        };
      }

      pool = await sql.connect(config);
      connectedDatabase = database;
      break;
    } catch (connectError) {
      logger.warn('Destination SQL endpoint candidate failed during apply connection', {
        destinationLakehouseId,
        destinationWorkspaceId,
        server,
        database,
        error: connectError.message
      });
    }
  }

  if (!pool) {
    const message = 'Unable to connect to destination SQL endpoint for applying programmable objects';
    requestedViews.forEach(name => summary.views.failed.push({ name, error: message }));
    requestedProcedures.forEach(name => summary.storedProcedures.failed.push({ name, error: message }));
    return summary;
  }

  logger.info('Applying programmable objects to destination SQL endpoint', {
    destinationLakehouseId,
    destinationWorkspaceId,
    server,
    database: connectedDatabase,
    requestedViews: requestedViews.length,
    requestedStoredProcedures: requestedProcedures.length
  });

  const requiredSchemaNames = new Set();

  for (const requestedName of requestedViews) {
    const parsed = parseQualifiedObjectName(requestedName);
    const key = `${parsed.schemaName.toLowerCase()}.${parsed.name.toLowerCase()}`;
    const definitionRow = viewsByName.get(key);
    if (definitionRow?.schemaName) {
      requiredSchemaNames.add(String(definitionRow.schemaName));
    }
  }

  for (const requestedName of requestedProcedures) {
    const parsed = parseQualifiedObjectName(requestedName);
    const key = `${parsed.schemaName.toLowerCase()}.${parsed.name.toLowerCase()}`;
    const definitionRow = proceduresByName.get(key);
    if (definitionRow?.schemaName) {
      requiredSchemaNames.add(String(definitionRow.schemaName));
    }
  }

  summary.schemas = await ensureDestinationSchemasExist(pool, Array.from(requiredSchemaNames));
  const failedSchemaNames = new Set(summary.schemas.failed.map(item => normalizeName(item.name)));

  for (const requestedName of requestedViews) {
    const parsed = parseQualifiedObjectName(requestedName);
    const key = `${parsed.schemaName.toLowerCase()}.${parsed.name.toLowerCase()}`;
    const definitionRow = viewsByName.get(key);

    if (!definitionRow) {
      summary.views.skipped.push({ name: requestedName, reason: 'Not found in source SQL metadata' });
      continue;
    }

    if (failedSchemaNames.has(normalizeName(definitionRow.schemaName))) {
      summary.views.failed.push({
        name: `${definitionRow.schemaName}.${definitionRow.name}`,
        error: `Destination schema '${definitionRow.schemaName}' could not be created`
      });
      continue;
    }

    const statement = toCreateOrAlterStatement(definitionRow.definition, 'view', definitionRow.schemaName, definitionRow.name);
    if (!statement) {
      summary.views.skipped.push({ name: `${definitionRow.schemaName}.${definitionRow.name}`, reason: 'Source definition is empty' });
      continue;
    }

    try {
      await pool.request().batch(statement);
      summary.views.applied.push({ name: `${definitionRow.schemaName}.${definitionRow.name}` });
    } catch (applyError) {
      summary.views.failed.push({
        name: `${definitionRow.schemaName}.${definitionRow.name}`,
        error: applyError.message
      });
    }
  }

  for (const requestedName of requestedProcedures) {
    const parsed = parseQualifiedObjectName(requestedName);
    const key = `${parsed.schemaName.toLowerCase()}.${parsed.name.toLowerCase()}`;
    const definitionRow = proceduresByName.get(key);

    if (!definitionRow) {
      summary.storedProcedures.skipped.push({ name: requestedName, reason: 'Not found in source SQL metadata' });
      continue;
    }

    if (failedSchemaNames.has(normalizeName(definitionRow.schemaName))) {
      summary.storedProcedures.failed.push({
        name: `${definitionRow.schemaName}.${definitionRow.name}`,
        error: `Destination schema '${definitionRow.schemaName}' could not be created`
      });
      continue;
    }

    const statement = toCreateOrAlterStatement(definitionRow.definition, 'procedure', definitionRow.schemaName, definitionRow.name);
    if (!statement) {
      summary.storedProcedures.skipped.push({ name: `${definitionRow.schemaName}.${definitionRow.name}`, reason: 'Source definition is empty' });
      continue;
    }

    try {
      await pool.request().batch(statement);
      summary.storedProcedures.applied.push({ name: `${definitionRow.schemaName}.${definitionRow.name}` });
    } catch (applyError) {
      summary.storedProcedures.failed.push({
        name: `${definitionRow.schemaName}.${definitionRow.name}`,
        error: applyError.message
      });
    }
  }

  try {
    await pool.close();
  } catch (closeError) {
    logger.debug('Error closing destination SQL apply connection', {
      error: closeError.message
    });
  }

  return summary;
}

async function ensureDestinationSchemasExist(pool, schemaNames) {
  const summary = {
    created: [],
    existing: [],
    failed: []
  };

  const uniqueSchemas = Array.from(new Set(
    (schemaNames || [])
      .map(name => String(name || '').trim())
      .filter(Boolean)
  ));

  for (const schemaName of uniqueSchemas) {
    try {
      const checkResponse = await pool
        .request()
        .query(`SELECT schema_id FROM sys.schemas WHERE name = N'${escapeSqlLiteral(schemaName)}'`);

      if (Array.isArray(checkResponse.recordset) && checkResponse.recordset.length > 0) {
        summary.existing.push({ name: schemaName });
        continue;
      }

      await pool
        .request()
        .batch(`CREATE SCHEMA ${quoteSqlIdentifier(schemaName)};`);

      summary.created.push({ name: schemaName });
    } catch (error) {
      summary.failed.push({
        name: schemaName,
        error: error.message
      });
    }
  }

  return summary;
}

/**
 * Fetch shortcuts from a lakehouse
 */
async function fetchLakehouseShortcuts(accessToken, lakehouseId, workspaceId = null) {
  const urls = [];

  if (workspaceId) {
    urls.push(`${process.env.FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items/${lakehouseId}/shortcuts`);
  }

  urls.push(`${process.env.FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/shortcuts`);

  let lastError = null;

  for (const url of urls) {
    try {
      const attemptId = uuidv4();
      const t0 = Date.now();
      logger.info('Attempting shortcut fetch endpoint', {
        lakehouseId,
        workspaceId,
        url,
        attemptId
      });

      const response = await axios.get(
        url,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-ms-client-request-id': attemptId,
            'x-ms-correlation-id': attemptId
          }
        }
      );

      logger.info('Shortcut fetch endpoint succeeded', {
        lakehouseId,
        workspaceId,
        url,
        shortcutCount: response.data?.value?.length || 0,
        attemptId,
        elapsedMs: Date.now() - t0,
        responseHeaders: response.headers || null
      });

      return response.data.value || [];
    } catch (error) {
      lastError = error;
      const diagnostics = extractAxiosErrorDiagnostics(error);
      logger.warn('Shortcut fetch endpoint failed', {
        lakehouseId,
        workspaceId,
        url,
        diagnostics
      });
      if (![400, 404].includes(error.response?.status)) {
        throw error;
      }
    }
  }

  logger.warn('Could not fetch shortcuts with known endpoints', {
    lakehouseId,
    workspaceId,
    error: lastError?.response?.data || lastError?.message
  });

  return [];
}

/**
 * Create a schema shortcut
 */
async function createSchemaShortcut(
  accessToken,
  destinationLakehouseId,
  destinationWorkspaceId,
  sourceLakehouseId,
  sourceWorkspaceId,
  schemaName,
  overwrite = false
) {
  const schemaNameCandidates = [schemaName, `${schemaName}_1`];
  const endpointVariants = [
    `${process.env.FABRIC_API_BASE_URL}/workspaces/${destinationWorkspaceId}/items/${destinationLakehouseId}/shortcuts`,
    `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${destinationLakehouseId}/lakehouse/shortcuts`
  ];

  const errors = [];

  const isUniqueNameConflict = (errorDetails) => {
    if (!errorDetails) return false;
    const detailMessages = Array.isArray(errorDetails.moreDetails)
      ? errorDetails.moreDetails.map(detail => `${detail?.errorCode || ''} ${detail?.message || ''}`.toLowerCase())
      : [];
    const flattenedDetails = detailMessages.join(' ');
    const combined = `${errorDetails.errorCode || ''} ${errorDetails.message || ''} ${flattenedDetails}`.toLowerCase();
    return combined.includes('nameconflicterror') || combined.includes('unique name conflict') || (errorDetails.status === 409 && combined.includes('conflict'));
  };

  for (let nameIndex = 0; nameIndex < schemaNameCandidates.length; nameIndex++) {
    const candidateName = schemaNameCandidates[nameIndex];
    const payloadVariants = [
      {
        name: candidateName,
        path: 'Tables',
        target: {
          oneLake: {
            workspaceId: sourceWorkspaceId,
            itemId: sourceLakehouseId,
            path: `Tables/${schemaName}`
          }
        }
      }
    ];

    const candidateErrors = [];

    for (const endpoint of endpointVariants) {
      for (let i = 0; i < payloadVariants.length; i++) {
      const attemptId = uuidv4();
      const t0 = Date.now();
      logger.info('Attempting schema shortcut create', {
        schemaName,
        requestedShortcutName: candidateName,
        destinationWorkspaceId,
        destinationLakehouseId,
        sourceWorkspaceId,
        sourceLakehouseId,
        endpoint,
        payloadVariant: i + 1,
        attemptId,
        payload: payloadVariants[i],
        conflictPolicy: overwrite ? 'CreateOrOverwrite' : 'Abort'
      });

        try {
          const response = await axios.post(
            endpoint,
            payloadVariants[i],
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'x-ms-client-request-id': attemptId,
                'x-ms-correlation-id': attemptId
              },
              params: {
                shortcutConflictPolicy: overwrite ? 'CreateOrOverwrite' : 'Abort'
              }
            }
          );

          logger.info('Schema shortcut create succeeded', {
            schemaName,
            requestedShortcutName: candidateName,
            endpoint,
            payloadVariant: i + 1,
            attemptId,
            status: response.status,
            elapsedMs: Date.now() - t0,
            location: response.headers?.location,
            responseHeaders: response.headers || null,
            responseBody: response.data || null
          });

          return {
            ...response.data,
            createdShortcutName: candidateName,
            sourceSchemaName: schemaName,
            usedFallbackName: candidateName !== schemaName
          };
        } catch (error) {
          const errorDetails = {
            endpoint,
            payloadVariant: i + 1,
            attemptId,
            elapsedMs: Date.now() - t0,
            status: error.response?.status,
            message: error.response?.data?.message || error.message,
            errorCode: error.response?.data?.errorCode,
            requestId: error.response?.data?.requestId,
            relatedResource: error.response?.data?.relatedResource,
            moreDetails: error.response?.data?.moreDetails || null,
            responseHeaders: error.response?.headers || null,
            responseBody: error.response?.data || null,
            requestedShortcutName: candidateName
          };

          errors.push(errorDetails);
          candidateErrors.push(errorDetails);

          logger.warn('Schema shortcut create attempt failed', {
            schemaName,
            ...errorDetails
          });
        }
      }
    }

    const shouldRetryWithSuffix = nameIndex === 0 && candidateErrors.some(isUniqueNameConflict);
    if (!shouldRetryWithSuffix) {
      break;
    }

    logger.warn('Retrying schema shortcut create with suffixed name after name conflict', {
      schemaName,
      retryName: schemaNameCandidates[1],
      destinationWorkspaceId,
      destinationLakehouseId
    });
  }

  logger.error('All schema shortcut create attempts failed', {
    schemaName,
    destinationWorkspaceId,
    destinationLakehouseId,
    sourceWorkspaceId,
    sourceLakehouseId,
    attempts: errors
  });

  const aggregateError = new Error(`Failed to create schema shortcut '${schemaName}' using all known endpoint/payload variants`);
  aggregateError.details = errors;
  throw aggregateError;
}

async function createTableShortcut(
  accessToken,
  destinationLakehouseId,
  destinationWorkspaceId,
  sourceLakehouseId,
  sourceWorkspaceId,
  schemaName,
  tableName,
  overwrite = false
) {
  const shortcutNameCandidates = [tableName, `${tableName}_1`];
  const endpointVariants = [
    `${process.env.FABRIC_API_BASE_URL}/workspaces/${destinationWorkspaceId}/items/${destinationLakehouseId}/shortcuts`,
    `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${destinationLakehouseId}/lakehouse/shortcuts`
  ];

  const errors = [];

  const isUniqueNameConflict = (errorDetails) => {
    if (!errorDetails) return false;
    const detailMessages = Array.isArray(errorDetails.moreDetails)
      ? errorDetails.moreDetails.map(detail => `${detail?.errorCode || ''} ${detail?.message || ''}`.toLowerCase())
      : [];
    const combined = `${errorDetails.errorCode || ''} ${errorDetails.message || ''} ${detailMessages.join(' ')}`.toLowerCase();
    return combined.includes('nameconflicterror') || combined.includes('unique name conflict') || (errorDetails.status === 409 && combined.includes('conflict'));
  };

  for (let nameIndex = 0; nameIndex < shortcutNameCandidates.length; nameIndex++) {
    const candidateName = shortcutNameCandidates[nameIndex];
    const payloadVariants = [
      {
        name: candidateName,
        path: `Tables/${schemaName}`,
        target: {
          oneLake: {
            workspaceId: sourceWorkspaceId,
            itemId: sourceLakehouseId,
            path: `Tables/${schemaName}/${tableName}`
          }
        }
      }
    ];

    const candidateErrors = [];

    for (const endpoint of endpointVariants) {
      for (let i = 0; i < payloadVariants.length; i++) {
        const attemptId = uuidv4();
        const t0 = Date.now();

        logger.info('Attempting table shortcut create', {
          schemaName,
          tableName,
          requestedShortcutName: candidateName,
          destinationWorkspaceId,
          destinationLakehouseId,
          sourceWorkspaceId,
          sourceLakehouseId,
          endpoint,
          payloadVariant: i + 1,
          attemptId,
          payload: payloadVariants[i],
          conflictPolicy: overwrite ? 'CreateOrOverwrite' : 'Abort'
        });

        try {
          const response = await axios.post(
            endpoint,
            payloadVariants[i],
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'x-ms-client-request-id': attemptId,
                'x-ms-correlation-id': attemptId
              },
              params: {
                shortcutConflictPolicy: overwrite ? 'CreateOrOverwrite' : 'Abort'
              }
            }
          );

          logger.info('Table shortcut create succeeded', {
            schemaName,
            tableName,
            requestedShortcutName: candidateName,
            endpoint,
            payloadVariant: i + 1,
            attemptId,
            status: response.status,
            elapsedMs: Date.now() - t0,
            responseHeaders: response.headers || null,
            responseBody: response.data || null
          });

          return {
            ...response.data,
            createdShortcutName: candidateName,
            sourceSchemaName: schemaName,
            sourceTableName: tableName,
            usedFallbackName: candidateName !== tableName
          };
        } catch (error) {
          const errorDetails = {
            endpoint,
            payloadVariant: i + 1,
            attemptId,
            elapsedMs: Date.now() - t0,
            status: error.response?.status,
            message: error.response?.data?.message || error.message,
            errorCode: error.response?.data?.errorCode,
            requestId: error.response?.data?.requestId,
            relatedResource: error.response?.data?.relatedResource,
            moreDetails: error.response?.data?.moreDetails || null,
            responseHeaders: error.response?.headers || null,
            responseBody: error.response?.data || null,
            requestedShortcutName: candidateName
          };

          errors.push(errorDetails);
          candidateErrors.push(errorDetails);

          logger.warn('Table shortcut create attempt failed', {
            schemaName,
            tableName,
            ...errorDetails
          });
        }
      }
    }

    const shouldRetryWithSuffix = nameIndex === 0 && candidateErrors.some(isUniqueNameConflict);
    if (!shouldRetryWithSuffix) {
      break;
    }

    logger.warn('Retrying table shortcut create with suffixed name after name conflict', {
      schemaName,
      tableName,
      retryName: shortcutNameCandidates[1],
      destinationWorkspaceId,
      destinationLakehouseId
    });
  }

  logger.error('All table shortcut create attempts failed', {
    schemaName,
    tableName,
    destinationWorkspaceId,
    destinationLakehouseId,
    sourceWorkspaceId,
    sourceLakehouseId,
    attempts: errors
  });

  const aggregateError = new Error(`Failed to create table shortcut '${schemaName}.${tableName}' using all known endpoint/payload variants`);
  aggregateError.details = errors;
  throw aggregateError;
}

/**
 * Process lakehouse validation and comparison
 * @param {string} jobId - Job identifier
 * @param {string} accessToken - User access token  
 * @param {string} sourceLakehouseId - Source lakehouse ID
 * @param {string} destinationLakehouseId - Destination lakehouse ID
 * @param {string} sourceWorkspaceId - Source workspace ID
 * @param {string} destinationWorkspaceId - Destination workspace ID
 */
async function processLakehouseValidation(
  jobId,
  accessToken,
  sourceLakehouseId,
  destinationLakehouseId,
  sourceWorkspaceId,
  destinationWorkspaceId
) {
  const job = jobStatus.get(jobId);
  
  try {
    // Update job status
    job.status = 'running';
    job.progress = 10;
    job.message = 'Fetching source lakehouse metadata...';
    jobStatus.set(jobId, job);

    // Get source lakehouse metadata
    const sourceSchemas = await fetchLakehouseSchemas(accessToken, sourceLakehouseId, sourceWorkspaceId);
    const sourceTables = await fetchLakehouseTables(accessToken, sourceLakehouseId);
    const sourceShortcuts = await fetchLakehouseShortcuts(accessToken, sourceLakehouseId, sourceWorkspaceId);
    
    job.progress = 30;
    job.message = 'Fetching destination lakehouse metadata...';
    jobStatus.set(jobId, job);

    // Get destination lakehouse metadata  
    const destSchemas = await fetchLakehouseSchemas(accessToken, destinationLakehouseId, destinationWorkspaceId);
    const destTables = await fetchLakehouseTables(accessToken, destinationLakehouseId);
    const destShortcuts = await fetchLakehouseShortcuts(accessToken, destinationLakehouseId, destinationWorkspaceId);

    job.progress = 50;
    job.message = 'Comparing lakehouse structures...';
    jobStatus.set(jobId, job);

    // Compare schemas
    const schemaComparison = compareLakehouseItems(sourceSchemas, destSchemas, 'schema');
    
    // Compare tables
    const tableComparison = compareLakehouseItems(sourceTables, destTables, 'table');
    
    // Compare shortcuts
    const shortcutComparison = compareLakehouseItems(sourceShortcuts, destShortcuts, 'shortcut');

    job.progress = 80;
    job.message = 'Generating validation report...';
    jobStatus.set(jobId, job);

    // Generate summary
    const summary = {
      totalComparisons: 3,
      schemasMatched: schemaComparison.matched.length,
      tablesMatched: tableComparison.matched.length,
      shortcutsMatched: shortcutComparison.matched.length,
      totalDifferences: schemaComparison.onlyInSource.length + schemaComparison.onlyInDestination.length +
                       tableComparison.onlyInSource.length + tableComparison.onlyInDestination.length +
                       shortcutComparison.onlyInSource.length + shortcutComparison.onlyInDestination.length,
      validationScore: calculateValidationScore(schemaComparison, tableComparison, shortcutComparison)
    };

    // Store results
    job.results = {
      summary: summary,
      differences: [
        ...formatDifferences(schemaComparison, 'schema'),
        ...formatDifferences(tableComparison, 'table'),
        ...formatDifferences(shortcutComparison, 'shortcut')
      ],
      sourceMetadata: {
        schemas: sourceSchemas.length,
        tables: sourceTables.length,
        shortcuts: sourceShortcuts.length
      },
      destinationMetadata: {
        schemas: destSchemas.length,
        tables: destTables.length,
        shortcuts: destShortcuts.length
      },
      comparisonStats: {
        schemasComparison: schemaComparison,
        tablesComparison: tableComparison,
        shortcutsComparison: shortcutComparison
      }
    };

    // Complete job
    job.status = 'completed';
    job.progress = 100;
    job.message = `Validation completed. Score: ${summary.validationScore}%, Differences: ${summary.totalDifferences}`;
    job.completedAt = new Date().toISOString();
    jobStatus.set(jobId, job);

    logger.info('Validation job completed', {
      jobId: jobId,
      validationScore: summary.validationScore,
      totalDifferences: summary.totalDifferences
    });

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    jobStatus.set(jobId, job);
    
    logger.error('Validation job failed', {
      jobId: jobId,
      error: error.message
    });
    
    throw error;
  }
}

/**
 * Fetch tables from a lakehouse
 */
async function fetchLakehouseTables(accessToken, lakehouseId, workspaceId = null) {
  try {
    const urls = [
      `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/tables`
    ];

    if (workspaceId) {
      urls.push(`${process.env.FABRIC_API_BASE_URL}/workspaces/${workspaceId}/lakehouses/${lakehouseId}/tables`);
      urls.push(`${process.env.FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items/${lakehouseId}/lakehouse/tables`);
    }

    let lastError = null;
    let unsupportedForSchemasEnabled = false;

    for (const url of urls) {
      try {
        const response = await axios.get(
          url,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        return response.data.value || [];
      } catch (error) {
        lastError = error;
        if (![400, 404].includes(error.response?.status)) {
          throw error;
        }

        if (error.response?.data?.errorCode === 'UnsupportedOperationForSchemasEnabledLakehouse') {
          unsupportedForSchemasEnabled = true;
          logger.warn('Tables endpoint unsupported for schema-enabled lakehouse; returning empty table list for fallback', {
            lakehouseId,
            workspaceId,
            url,
            errorCode: error.response?.data?.errorCode
          });
        }
      }
    }

    if (unsupportedForSchemasEnabled || !lastError || [400, 404].includes(lastError?.response?.status)) {
      const sqlFallbackTables = await fetchLakehouseTablesViaSqlEndpoint(accessToken, lakehouseId, workspaceId);
      if (sqlFallbackTables.length > 0) {
        return sqlFallbackTables;
      }
    }

    logger.warn('Could not fetch tables with known endpoints', {
      lakehouseId,
      workspaceId,
      error: lastError?.response?.data || lastError?.message
    });
    return [];
  } catch (error) {
    if ([400, 404].includes(error.response?.status)) {
      const sqlFallbackTables = await fetchLakehouseTablesViaSqlEndpoint(accessToken, lakehouseId, workspaceId);
      if (sqlFallbackTables.length > 0) {
        return sqlFallbackTables;
      }
      return []; // No tables found
    }
    throw error;
  }
}

/**
 * Compare two arrays of lakehouse items
 */
function compareLakehouseItems(sourceItems, destItems, itemType) {
  const sourceNames = sourceItems.map(item => item.name);
  const destNames = destItems.map(item => item.name);
  
  return {
    matched: sourceNames.filter(name => destNames.includes(name)),
    onlyInSource: sourceNames.filter(name => !destNames.includes(name)),
    onlyInDestination: destNames.filter(name => !sourceNames.includes(name)),
    type: itemType
  };
}

/**
 * Format differences for reporting
 */
function formatDifferences(comparison, type) {
  const differences = [];
  
  comparison.onlyInSource.forEach(name => {
    differences.push({
      type: type,
      name: name,
      difference: 'missing_in_destination',
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} '${name}' exists in source but not in destination`
    });
  });
  
  comparison.onlyInDestination.forEach(name => {
    differences.push({
      type: type,
      name: name,
      difference: 'extra_in_destination',
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} '${name}' exists in destination but not in source`
    });
  });
  
  return differences;
}

/**
 * Calculate validation score based on comparisons
 */
function calculateValidationScore(schemaComparison, tableComparison, shortcutComparison) {
  const totalSourceItems = schemaComparison.matched.length + schemaComparison.onlyInSource.length +
                          tableComparison.matched.length + tableComparison.onlyInSource.length +
                          shortcutComparison.matched.length + shortcutComparison.onlyInSource.length;
  
  if (totalSourceItems === 0) return 100; // If no source items, consider it 100% match
  
  const matchedItems = schemaComparison.matched.length + tableComparison.matched.length + shortcutComparison.matched.length;
  
  return Math.round((matchedItems / totalSourceItems) * 100);
}

module.exports = router;