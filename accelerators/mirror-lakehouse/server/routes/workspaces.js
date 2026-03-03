const express = require('express');
const { body, query, validationResult } = require('express-validator');
const axios = require('axios');
const { authenticateToken, requireScope } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication and workspace read permissions
router.use(authenticateToken);
router.use(requireScope(['https://api.fabric.microsoft.com/Workspace.Read.All']));

/**
 * @route GET /api/workspaces
 * @desc Get all workspaces accessible to the user
 * @access Private
 */
router.get('/', async (req, res, next) => {
  try {
    logger.info('Fetching workspaces', { userId: req.user.id });

    const response = await axios.get(`${process.env.FABRIC_API_BASE_URL}/workspaces`, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const workspaces = response.data.value.map(workspace => ({
      id: workspace.id,
      name: workspace.displayName || workspace.name,
      description: workspace.description,
      type: workspace.type,
      capacityId: workspace.capacityId,
      createdDate: workspace.createdDate,
      modifiedDate: workspace.modifiedDate
    }));

    logger.info('Workspaces retrieved', {
      userId: req.user.id,
      workspaceCount: workspaces.length
    });

    res.json({
      workspaces: workspaces,
      count: workspaces.length
    });

  } catch (error) {
    logger.error('Error fetching workspaces:', {
      error: error.message,
      userId: req.user.id,
      status: error.response?.status,
      statusText: error.response?.statusText
    });

    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is invalid or expired'
      });
    }

    if (error.response?.status === 403) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions to access workspaces'
      });
    }

    next(error);
  }
});

/**
 * @route GET /api/workspaces/search
 * @desc Search workspaces by name
 * @access Private
 */
router.get('/search', [
  query('q').notEmpty().withMessage('Search query is required'),
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

    const { q, limit = 50 } = req.query;
    
    logger.info('Searching workspaces', {
      userId: req.user.id,
      query: q,
      limit: parseInt(limit)
    });

    // Get all workspaces first (Fabric API doesn't support server-side search)
    const response = await axios.get(`${process.env.FABRIC_API_BASE_URL}/workspaces`, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Filter workspaces by search query (case-insensitive)
    const searchTerm = q.toLowerCase();
    const filteredWorkspaces = response.data.value
      .filter(workspace => 
        (workspace.displayName || workspace.name).toLowerCase().includes(searchTerm) ||
        (workspace.description && workspace.description.toLowerCase().includes(searchTerm))
      )
      .slice(0, parseInt(limit))
      .map(workspace => ({
        id: workspace.id,
        name: workspace.displayName || workspace.name,
        description: workspace.description,
        type: workspace.type,
        capacityId: workspace.capacityId,
        createdDate: workspace.createdDate,
        modifiedDate: workspace.modifiedDate
      }));

    logger.info('Workspace search completed', {
      userId: req.user.id,
      query: q,
      totalWorkspaces: response.data.value.length,
      matchingWorkspaces: filteredWorkspaces.length
    });

    res.json({
      workspaces: filteredWorkspaces,
      count: filteredWorkspaces.length,
      query: q,
      totalCount: response.data.value.length
    });

  } catch (error) {
    logger.error('Error searching workspaces:', {
      error: error.message,
      userId: req.user.id,
      query: req.query.q,
      status: error.response?.status
    });

    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is invalid or expired'
      });
    }

    next(error);
  }
});

/**
 * @route GET /api/workspaces/:id
 * @desc Get details of a specific workspace
 * @access Private
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info('Fetching workspace details', {
      userId: req.user.id,
      workspaceId: id
    });

    const response = await axios.get(`${process.env.FABRIC_API_BASE_URL}/workspaces/${id}`, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const workspace = {
      id: response.data.id,
      name: response.data.displayName || response.data.name,
      description: response.data.description,
      type: response.data.type,
      capacityId: response.data.capacityId,
      createdDate: response.data.createdDate,
      modifiedDate: response.data.modifiedDate
    };

    logger.info('Workspace details retrieved', {
      userId: req.user.id,
      workspaceId: id,
      workspaceName: workspace.name
    });

    res.json(workspace);

  } catch (error) {
    logger.error('Error fetching workspace details:', {
      error: error.message,
      userId: req.user.id,
      workspaceId: req.params.id,
      status: error.response?.status
    });

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Workspace not found or you do not have access to it'
      });
    }

    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is invalid or expired'
      });
    }

    next(error);
  }
});

/**
 * @route GET /api/workspaces/:id/lakehouses
 * @desc Get all lakehouses in a specific workspace
 * @access Private
 */
router.get('/:id/lakehouses', async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info('Fetching lakehouses in workspace', {
      userId: req.user.id,
      workspaceId: id
    });

    // Use Fabric API to get lakehouses
    const response = await axios.get(`${process.env.FABRIC_API_BASE_URL}/workspaces/${id}/items?type=Lakehouse`, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const lakehouses = response.data.value.map(lakehouse => ({
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

    logger.info('Lakehouses retrieved', {
      userId: req.user.id,
      workspaceId: id,
      lakehouseCount: lakehouses.length
    });

    res.json({
      lakehouses: lakehouses,
      count: lakehouses.length,
      workspaceId: id
    });

  } catch (error) {
    logger.error('Error fetching lakehouses:', {
      error: error.message,
      userId: req.user.id,
      workspaceId: req.params.id,
      status: error.response?.status
    });

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Workspace not found or contains no lakehouses'
      });
    }

    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is invalid or expired'
      });
    }

    next(error);
  }
});

/**
 * @route POST /api/workspaces/:id/lakehouses
 * @desc Create a new lakehouse in a specific workspace
 * @access Private
 */
router.post('/:id/lakehouses', requireScope(['https://api.fabric.microsoft.com/Item.ReadWrite.All']), [
  body('name').notEmpty().withMessage('Lakehouse name is required')
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
    const { name } = req.body;

    logger.info('Creating lakehouse in workspace', {
      userId: req.user.id,
      workspaceId: id,
      lakehouseName: name
    });

    const response = await axios.post(
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${id}/items`,
      {
        displayName: name,
        type: 'Lakehouse',
        creationPayload: {
          enableSchemas: true
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${req.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const createdItem = response.data;

    const lakehouse = {
      id: createdItem.id,
      name: createdItem.displayName || name,
      description: createdItem.description,
      type: createdItem.type || 'Lakehouse',
      workspaceId: createdItem.workspaceId || id,
      createdDate: createdItem.createdDate || new Date().toISOString(),
      modifiedDate: createdItem.modifiedDate || new Date().toISOString(),
      createdBy: createdItem.createdBy || req.user.email,
      modifiedBy: createdItem.modifiedBy || req.user.email
    };

    logger.info('Lakehouse created in workspace', {
      userId: req.user.id,
      workspaceId: id,
      lakehouseId: lakehouse.id,
      lakehouseName: lakehouse.name,
      schemaEnabled: true
    });

    res.status(201).json({
      lakehouse
    });

  } catch (error) {
    logger.error('Error creating lakehouse:', {
      error: error.message,
      userId: req.user.id,
      workspaceId: req.params.id,
      status: error.response?.status,
      details: error.response?.data
    });

    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is invalid or expired'
      });
    }

    if (error.response?.status === 403) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions to create lakehouse in this workspace'
      });
    }

    if (error.response?.status === 400) {
      return res.status(400).json({
        error: 'Bad Request',
        message: error.response?.data?.message || 'Invalid lakehouse create request'
      });
    }

    next(error);
  }
});

module.exports = router;