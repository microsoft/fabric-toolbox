const express = require('express');
const { param, query, validationResult } = require('express-validator');
const axios = require('axios');
const { authenticateToken, requireScope } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication and dataset read permissions
router.use(authenticateToken);
router.use(requireScope(['https://api.fabric.microsoft.com/Item.Read.All']));

/**
 * @route GET /api/lakehouses/:id
 * @desc Get lakehouse details
 * @access Private
 */
router.get('/:id', [
  param('id').isUUID().withMessage('Lakehouse ID must be a valid UUID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { id } = req.params;

    logger.info('Fetching lakehouse details', {
      userId: req.user.id,
      lakehouseId: id
    });

    // Get lakehouse details from Fabric API
    const response = await axios.get(`${process.env.FABRIC_API_BASE_URL}/workspaces/items/${id}`, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const lakehouse = {
      id: response.data.id,
      name: response.data.displayName,
      description: response.data.description,
      type: response.data.type,
      workspaceId: response.data.workspaceId,
      createdDate: response.data.createdDate,
      modifiedDate: response.data.modifiedDate,
      createdBy: response.data.createdBy,
      modifiedBy: response.data.modifiedBy
    };

    logger.info('Lakehouse details retrieved', {
      userId: req.user.id,
      lakehouseId: id,
      lakehouseName: lakehouse.name
    });

    res.json(lakehouse);

  } catch (error) {
    logger.error('Error fetching lakehouse details:', {
      error: error.message,
      userId: req.user.id,
      lakehouseId: req.params.id,
      status: error.response?.status
    });

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Lakehouse not found or you do not have access to it'
      });
    }

    next(error);
  }
});

/**
 * @route GET /api/lakehouses/:id/tables
 * @desc Get all tables in a lakehouse
 * @access Private
 */
router.get('/:id/tables', [
  param('id').isUUID().withMessage('Lakehouse ID must be a valid UUID'),
  query('includeColumns').optional().isBoolean().withMessage('includeColumns must be a boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { includeColumns = false } = req.query;

    logger.info('Fetching tables in lakehouse', {
      userId: req.user.id,
      lakehouseId: id,
      includeColumns: includeColumns
    });

    // Get lakehouse tables using Fabric API
    const response = await axios.get(`${process.env.FABRIC_API_BASE_URL}/workspaces/items/${id}/lakehouse/tables`, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    let tables = response.data.value.map(table => ({
      name: table.name,
      type: table.type,
      format: table.format,
      location: table.location,
      createdDate: table.createdDate,
      modifiedDate: table.modifiedDate,
      size: table.size,
      rowCount: table.rowCount
    }));

    // If columns are requested, fetch column information for each table
    if (includeColumns === 'true' || includeColumns === true) {
      const tablesWithColumns = await Promise.allSettled(
        tables.map(async (table) => {
          try {
            const columnResponse = await axios.get(
              `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${id}/lakehouse/tables/${table.name}/columns`,
              {
                headers: {
                  'Authorization': `Bearer ${req.accessToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            return {
              ...table,
              columns: columnResponse.data.value.map(column => ({
                name: column.name,
                type: column.type,
                nullable: column.nullable,
                precision: column.precision,
                scale: column.scale,
                maxLength: column.maxLength
              }))
            };
          } catch (columnError) {
            logger.warn('Failed to fetch columns for table', {
              tableName: table.name,
              error: columnError.message
            });
            return { ...table, columns: [] };
          }
        })
      );

      tables = tablesWithColumns
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
    }

    logger.info('Tables retrieved', {
      userId: req.user.id,
      lakehouseId: id,
      tableCount: tables.length,
      includeColumns: includeColumns
    });

    res.json({
      tables: tables,
      count: tables.length,
      lakehouseId: id,
      includeColumns: includeColumns
    });

  } catch (error) {
    logger.error('Error fetching lakehouse tables:', {
      error: error.message,
      userId: req.user.id,
      lakehouseId: req.params.id,
      status: error.response?.status
    });

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Lakehouse not found or contains no tables'
      });
    }

    next(error);
  }
});

/**
 * @route GET /api/lakehouses/:id/schemas
 * @desc Get all schemas in a lakehouse
 * @access Private
 */
router.get('/:id/schemas', [
  param('id').isUUID().withMessage('Lakehouse ID must be a valid UUID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { id } = req.params;

    logger.info('Fetching schemas in lakehouse', {
      userId: req.user.id,
      lakehouseId: id
    });

    // Get lakehouse schemas using Fabric API
    const response = await axios.get(`${process.env.FABRIC_API_BASE_URL}/workspaces/items/${id}/lakehouse/schemas`, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const schemas = response.data.value.map(schema => ({
      name: schema.name,
      description: schema.description,
      createdDate: schema.createdDate,
      modifiedDate: schema.modifiedDate,
      tableCount: schema.tableCount || 0
    }));

    logger.info('Schemas retrieved', {
      userId: req.user.id,
      lakehouseId: id,
      schemaCount: schemas.length
    });

    res.json({
      schemas: schemas,
      count: schemas.length,
      lakehouseId: id
    });

  } catch (error) {
    logger.error('Error fetching lakehouse schemas:', {
      error: error.message,
      userId: req.user.id,
      lakehouseId: req.params.id,
      status: error.response?.status
    });

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Lakehouse not found or contains no schemas'
      });
    }

    next(error);
  }
});

/**
 * @route GET /api/lakehouses/:id/shortcuts
 * @desc Get all shortcuts in a lakehouse
 * @access Private
 */
router.get('/:id/shortcuts', [
  param('id').isUUID().withMessage('Lakehouse ID must be a valid UUID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { id } = req.params;

    logger.info('Fetching shortcuts in lakehouse', {
      userId: req.user.id,
      lakehouseId: id
    });

    // Get lakehouse shortcuts using Fabric API
    const response = await axios.get(`${process.env.FABRIC_API_BASE_URL}/workspaces/items/${id}/lakehouse/shortcuts`, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const shortcuts = response.data.value.map(shortcut => ({
      name: shortcut.name,
      path: shortcut.path,
      target: {
        type: shortcut.target?.type,
        connectionId: shortcut.target?.connectionId,
        location: shortcut.target?.location,
        subpath: shortcut.target?.subpath
      },
      createdDate: shortcut.createdDate,
      modifiedDate: shortcut.modifiedDate
    }));

    logger.info('Shortcuts retrieved', {
      userId: req.user.id,
      lakehouseId: id,
      shortcutCount: shortcuts.length
    });

    res.json({
      shortcuts: shortcuts,
      count: shortcuts.length,
      lakehouseId: id
    });

  } catch (error) {
    logger.error('Error fetching lakehouse shortcuts:', {
      error: error.message,
      userId: req.user.id,
      lakehouseId: req.params.id,
      status: error.response?.status
    });

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Lakehouse not found or contains no shortcuts'
      });
    }

    next(error);
  }
});

/**
 * @route GET /api/lakehouses/search
 * @desc Search lakehouses across all accessible workspaces
 * @access Private
 */
router.get('/search', [
  query('q').notEmpty().withMessage('Search query is required'),
  query('workspaceId').optional().isUUID().withMessage('Workspace ID must be a valid UUID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { q, workspaceId, limit = 50 } = req.query;

    logger.info('Searching lakehouses', {
      userId: req.user.id,
      query: q,
      workspaceId: workspaceId,
      limit: parseInt(limit)
    });

    let searchUrl = `${process.env.FABRIC_API_BASE_URL}/workspaces/items?type=Lakehouse`;
    
    if (workspaceId) {
      searchUrl = `${process.env.FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items?type=Lakehouse`;
    }

    const response = await axios.get(searchUrl, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Filter lakehouses by search query (case-insensitive)
    const searchTerm = q.toLowerCase();
    const filteredLakehouses = response.data.value
      .filter(lakehouse => 
        lakehouse.displayName.toLowerCase().includes(searchTerm) ||
        (lakehouse.description && lakehouse.description.toLowerCase().includes(searchTerm))
      )
      .slice(0, parseInt(limit))
      .map(lakehouse => ({
        id: lakehouse.id,
        name: lakehouse.displayName,
        description: lakehouse.description,
        type: lakehouse.type,
        workspaceId: lakehouse.workspaceId,
        createdDate: lakehouse.createdDate,
        modifiedDate: lakehouse.modifiedDate,
        createdBy: lakehouse.createdBy,
        modifiedBy: lakehouse.modifiedBy
      }));

    logger.info('Lakehouse search completed', {
      userId: req.user.id,
      query: q,
      workspaceId: workspaceId,
      totalLakehouses: response.data.value.length,
      matchingLakehouses: filteredLakehouses.length
    });

    res.json({
      lakehouses: filteredLakehouses,
      count: filteredLakehouses.length,
      query: q,
      workspaceId: workspaceId,
      totalCount: response.data.value.length
    });

  } catch (error) {
    logger.error('Error searching lakehouses:', {
      error: error.message,
      userId: req.user.id,
      query: req.query.q,
      status: error.response?.status
    });

    next(error);
  }
});

module.exports = router;