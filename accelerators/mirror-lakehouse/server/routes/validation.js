const express = require('express');
const { body, param, validationResult } = require('express-validator');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, requireScope } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication and dataset read permissions
router.use(authenticateToken);
router.use(requireScope(['https://api.fabric.microsoft.com/Item.Read.All']));

// Store validation results in memory (in production, use Redis or database)
const validationJobs = new Map();

/**
 * @route POST /api/validation/compare-lakehouses
 * @desc Compare two lakehouses and generate a difference report
 * @access Private
 */
router.post('/compare-lakehouses', [
  body('sourceLakehouseId').isUUID().withMessage('Source lakehouse ID must be a valid UUID'),
  body('destinationLakehouseId').isUUID().withMessage('Destination lakehouse ID must be a valid UUID'),
  body('includeColumns').optional().isBoolean().withMessage('Include columns must be a boolean'),
  body('includeMetadata').optional().isBoolean().withMessage('Include metadata must be a boolean'),
  body('compareRowCounts').optional().isBoolean().withMessage('Compare row counts must be a boolean')
], async (req, res, next) => {
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
      includeColumns = true,
      includeMetadata = true,
      compareRowCounts = false
    } = req.body;

    // Generate validation job ID
    const jobId = uuidv4();

    // Initialize validation job
    validationJobs.set(jobId, {
      id: jobId,
      status: 'initiated',
      progress: 0,
      message: 'Starting lakehouse comparison...',
      createdAt: new Date().toISOString(),
      userId: req.user.id,
      source: {
        lakehouseId: sourceLakehouseId
      },
      destination: {
        lakehouseId: destinationLakehouseId
      },
      options: {
        includeColumns,
        includeMetadata,
        compareRowCounts
      },
      results: null
    });

    logger.info('Lakehouse validation job initiated', {
      jobId: jobId,
      userId: req.user.id,
      sourceLakehouseId: sourceLakehouseId,
      destinationLakehouseId: destinationLakehouseId
    });

    // Start the validation process asynchronously
    processLakehouseComparison(
      jobId,
      req.accessToken,
      sourceLakehouseId,
      destinationLakehouseId,
      includeColumns,
      includeMetadata,
      compareRowCounts
    ).catch(error => {
      logger.error('Lakehouse validation job error:', {
        jobId: jobId,
        error: error.message
      });
      
      const job = validationJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.completedAt = new Date().toISOString();
        validationJobs.set(jobId, job);
      }
    });

    res.status(202).json({
      jobId: jobId,
      status: 'initiated',
      message: 'Lakehouse comparison started. Use the job ID to check progress.',
      statusUrl: `/api/validation/status/${jobId}`
    });

  } catch (error) {
    logger.error('Error initiating lakehouse validation:', {
      error: error.message,
      userId: req.user.id
    });
    next(error);
  }
});

/**
 * @route GET /api/validation/status/:jobId
 * @desc Get the status of a validation job
 * @access Private
 */
router.get('/status/:jobId', [
  param('jobId').isUUID().withMessage('Job ID must be a valid UUID')
], (req, res) => {
  const { jobId } = req.params;
  const job = validationJobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Validation job not found'
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
 * @route GET /api/validation/report/:jobId
 * @desc Get the detailed validation report
 * @access Private
 */
router.get('/report/:jobId', [
  param('jobId').isUUID().withMessage('Job ID must be a valid UUID')
], (req, res) => {
  const { jobId } = req.params;
  const job = validationJobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Validation job not found'
    });
  }

  // Check if user has access to this job
  if (job.userId !== req.user.id) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have access to this job'
    });
  }

  if (job.status !== 'completed') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Validation job is not completed yet'
    });
  }

  res.json({
    jobId: jobId,
    completedAt: job.completedAt,
    summary: job.results.summary,
    differences: job.results.differences,
    sourceMetadata: job.results.sourceMetadata,
    destinationMetadata: job.results.destinationMetadata
  });
});

/**
 * @route GET /api/validation/jobs
 * @desc Get all validation jobs for the current user
 * @access Private
 */
router.get('/jobs', (req, res) => {
  const userJobs = Array.from(validationJobs.values())
    .filter(job => job.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(job => ({
      id: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      source: job.source,
      destination: job.destination,
      error: job.error
    }));

  res.json({
    jobs: userJobs,
    count: userJobs.length
  });
});

/**
 * Process lakehouse comparison
 */
async function processLakehouseComparison(
  jobId,
  accessToken,
  sourceLakehouseId,
  destinationLakehouseId,
  includeColumns,
  includeMetadata,
  compareRowCounts
) {
  const job = validationJobs.get(jobId);
  
  try {
    // Update job status
    job.status = 'running';
    job.progress = 10;
    job.message = 'Fetching source lakehouse structure...';
    validationJobs.set(jobId, job);

    // Get source lakehouse structure
    const [sourceSchemas, sourceTables, sourceShortcuts] = await Promise.all([
      fetchLakehouseSchemas(accessToken, sourceLakehouseId),
      fetchLakehouseTables(accessToken, sourceLakehouseId, includeColumns),
      fetchLakehouseShortcuts(accessToken, sourceLakehouseId)
    ]);

    job.progress = 30;
    job.message = 'Fetching destination lakehouse structure...';
    validationJobs.set(jobId, job);

    // Get destination lakehouse structure
    const [destSchemas, destTables, destShortcuts] = await Promise.all([
      fetchLakehouseSchemas(accessToken, destinationLakehouseId),
      fetchLakehouseTables(accessToken, destinationLakehouseId, includeColumns),
      fetchLakehouseShortcuts(accessToken, destinationLakehouseId)
    ]);

    job.progress = 60;
    job.message = 'Comparing lakehouse structures...';
    validationJobs.set(jobId, job);

    // Compare structures
    const comparison = {
      schemas: compareSchemas(sourceSchemas, destSchemas),
      tables: compareTables(sourceTables, destTables, includeColumns),
      shortcuts: compareShortcuts(sourceShortcuts, destShortcuts)
    };

    job.progress = 80;
    job.message = 'Generating comparison report...';
    validationJobs.set(jobId, job);

    // Generate summary
    const summary = generateSummary(comparison);

    // Prepare results
    job.results = {
      summary: summary,
      differences: {
        schemas: comparison.schemas,
        tables: comparison.tables,
        shortcuts: comparison.shortcuts
      },
      sourceMetadata: includeMetadata ? {
        schemaCount: sourceSchemas.length,
        tableCount: sourceTables.length,
        shortcutCount: sourceShortcuts.length,
        schemas: sourceSchemas,
        tables: sourceTables.map(t => ({
          name: t.name,
          type: t.type,
          size: t.size,
          rowCount: t.rowCount,
          columnCount: t.columns?.length || 0
        }))
      } : null,
      destinationMetadata: includeMetadata ? {
        schemaCount: destSchemas.length,
        tableCount: destTables.length,
        shortcutCount: destShortcuts.length,
        schemas: destSchemas,
        tables: destTables.map(t => ({
          name: t.name,
          type: t.type,
          size: t.size,
          rowCount: t.rowCount,
          columnCount: t.columns?.length || 0
        }))
      } : null
    };

    // Complete job
    job.status = 'completed';
    job.progress = 100;
    job.message = `Comparison completed. Found ${summary.totalDifferences} differences.`;
    job.completedAt = new Date().toISOString();
    validationJobs.set(jobId, job);

    logger.info('Lakehouse validation job completed', {
      jobId: jobId,
      totalDifferences: summary.totalDifferences,
      missingInDestination: summary.missingInDestination,
      extraInDestination: summary.extraInDestination
    });

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    validationJobs.set(jobId, job);
    
    throw error;
  }
}

/**
 * Helper functions for fetching lakehouse data
 */
async function fetchLakehouseSchemas(accessToken, lakehouseId) {
  try {
    const response = await axios.get(
      `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/schemas`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.value || [];
  } catch (error) {
    if (error.response?.status === 404) {
      return [];
    }
    throw error;
  }
}

async function fetchLakehouseTables(accessToken, lakehouseId, includeColumns = false) {
  try {
    const response = await axios.get(
      `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/tables`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    let tables = response.data.value || [];
    
    if (includeColumns) {
      tables = await Promise.allSettled(
        tables.map(async (table) => {
          try {
            const columnResponse = await axios.get(
              `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/tables/${table.name}/columns`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            return {
              ...table,
              columns: columnResponse.data.value || []
            };
          } catch (columnError) {
            return { ...table, columns: [] };
          }
        })
      ).then(results => 
        results
          .filter(result => result.status === 'fulfilled')
          .map(result => result.value)
      );
    }
    
    return tables;
  } catch (error) {
    if (error.response?.status === 404) {
      return [];
    }
    throw error;
  }
}

async function fetchLakehouseShortcuts(accessToken, lakehouseId) {
  try {
    const response = await axios.get(
      `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/shortcuts`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.value || [];
  } catch (error) {
    if (error.response?.status === 404) {
      return [];
    }
    throw error;
  }
}

/**
 * Comparison functions
 */
function compareSchemas(sourceSchemas, destSchemas) {
  const sourceNames = new Set(sourceSchemas.map(s => s.name));
  const destNames = new Set(destSchemas.map(s => s.name));
  
  return {
    missingInDestination: sourceSchemas.filter(s => !destNames.has(s.name)),
    extraInDestination: destSchemas.filter(s => !sourceNames.has(s.name)),
    matching: sourceSchemas.filter(s => destNames.has(s.name))
  };
}

function compareTables(sourceTables, destTables, includeColumns) {
  const sourceMap = new Map(sourceTables.map(t => [t.name, t]));
  const destMap = new Map(destTables.map(t => [t.name, t]));
  
  const missing = sourceTables.filter(t => !destMap.has(t.name));
  const extra = destTables.filter(t => !sourceMap.has(t.name));
  const matching = [];
  const different = [];
  
  for (const sourceTable of sourceTables) {
    const destTable = destMap.get(sourceTable.name);
    if (destTable) {
      const tableDifferences = [];
      
      // Compare basic properties
      if (sourceTable.type !== destTable.type) {
        tableDifferences.push({
          property: 'type',
          source: sourceTable.type,
          destination: destTable.type
        });
      }
      
      if (sourceTable.format !== destTable.format) {
        tableDifferences.push({
          property: 'format',
          source: sourceTable.format,
          destination: destTable.format
        });
      }
      
      // Compare columns if included
      if (includeColumns && sourceTable.columns && destTable.columns) {
        const columnComparison = compareColumns(sourceTable.columns, destTable.columns);
        if (columnComparison.differences.length > 0) {
          tableDifferences.push({
            property: 'columns',
            source: sourceTable.columns.length,
            destination: destTable.columns.length,
            details: columnComparison
          });
        }
      }
      
      if (tableDifferences.length > 0) {
        different.push({
          name: sourceTable.name,
          differences: tableDifferences
        });
      } else {
        matching.push(sourceTable.name);
      }
    }
  }
  
  return {
    missingInDestination: missing,
    extraInDestination: extra,
    matching: matching,
    different: different
  };
}

function compareColumns(sourceColumns, destColumns) {
  const sourceMap = new Map(sourceColumns.map(c => [c.name, c]));
  const destMap = new Map(destColumns.map(c => [c.name, c]));
  
  const missing = sourceColumns.filter(c => !destMap.has(c.name));
  const extra = destColumns.filter(c => !sourceMap.has(c.name));
  const different = [];
  
  for (const sourceColumn of sourceColumns) {
    const destColumn = destMap.get(sourceColumn.name);
    if (destColumn) {
      const columnDiffs = [];
      
      if (sourceColumn.type !== destColumn.type) {
        columnDiffs.push({
          property: 'type',
          source: sourceColumn.type,
          destination: destColumn.type
        });
      }
      
      if (sourceColumn.nullable !== destColumn.nullable) {
        columnDiffs.push({
          property: 'nullable',
          source: sourceColumn.nullable,
          destination: destColumn.nullable
        });
      }
      
      if (columnDiffs.length > 0) {
        different.push({
          name: sourceColumn.name,
          differences: columnDiffs
        });
      }
    }
  }
  
  return {
    missing: missing,
    extra: extra,
    different: different,
    differences: [...missing, ...extra, ...different]
  };
}

function compareShortcuts(sourceShortcuts, destShortcuts) {
  const sourceNames = new Set(sourceShortcuts.map(s => s.name));
  const destNames = new Set(destShortcuts.map(s => s.name));
  
  return {
    missingInDestination: sourceShortcuts.filter(s => !destNames.has(s.name)),
    extraInDestination: destShortcuts.filter(s => !sourceNames.has(s.name)),
    matching: sourceShortcuts.filter(s => destNames.has(s.name))
  };
}

function generateSummary(comparison) {
  const totalDifferences = 
    comparison.schemas.missingInDestination.length +
    comparison.schemas.extraInDestination.length +
    comparison.tables.missingInDestination.length +
    comparison.tables.extraInDestination.length +
    comparison.tables.different.length +
    comparison.shortcuts.missingInDestination.length +
    comparison.shortcuts.extraInDestination.length;
  
  return {
    totalDifferences: totalDifferences,
    isIdentical: totalDifferences === 0,
    missingInDestination: 
      comparison.schemas.missingInDestination.length +
      comparison.tables.missingInDestination.length +
      comparison.shortcuts.missingInDestination.length,
    extraInDestination:
      comparison.schemas.extraInDestination.length +
      comparison.tables.extraInDestination.length +
      comparison.shortcuts.extraInDestination.length,
    modifiedTables: comparison.tables.different.length,
    schemaComparison: {
      matching: comparison.schemas.matching.length,
      missing: comparison.schemas.missingInDestination.length,
      extra: comparison.schemas.extraInDestination.length
    },
    tableComparison: {
      matching: comparison.tables.matching.length,
      missing: comparison.tables.missingInDestination.length,
      extra: comparison.tables.extraInDestination.length,
      different: comparison.tables.different.length
    },
    shortcutComparison: {
      matching: comparison.shortcuts.matching.length,
      missing: comparison.shortcuts.missingInDestination.length,
      extra: comparison.shortcuts.extraInDestination.length
    }
  };
}

module.exports = router;