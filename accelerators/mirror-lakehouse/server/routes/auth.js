const express = require('express');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const { cca, authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route POST /api/auth/token
 * @desc Exchange authorization code for access token
 * @access Public
 */
router.post('/token', [
  body('code').notEmpty().withMessage('Authorization code is required'),
  body('redirectUri').isURL().withMessage('Valid redirect URI is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { code, redirectUri } = req.body;

    const tokenRequest = {
      code: code,
      scopes: [
        'https://api.fabric.microsoft.com/Item.ReadWrite.All',
        'https://api.fabric.microsoft.com/Workspace.ReadWrite.All',
        'openid',
        'profile',
        'email'
      ],
      redirectUri: redirectUri,
    };

    const response = await cca.acquireTokenByCode(tokenRequest);

    logger.info('Token acquired successfully', {
      account: response.account?.username,
      scopes: response.scopes
    });

    res.json({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresOn: response.expiresOn,
      account: {
        id: response.account?.homeAccountId,
        username: response.account?.username,
        name: response.account?.name,
        tenantId: response.account?.tenantId
      },
      scopes: response.scopes
    });

  } catch (error) {
    logger.error('Token acquisition error:', error);
    next(error);
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public
 */
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  body('account').isObject().withMessage('Account information is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }

    const { refreshToken, account } = req.body;

    const refreshRequest = {
      refreshToken: refreshToken,
      scopes: [
        'https://api.fabric.microsoft.com/Item.ReadWrite.All',
        'https://api.fabric.microsoft.com/Workspace.ReadWrite.All'
      ],
      account: account,
    };

    const response = await cca.acquireTokenSilent(refreshRequest);

    logger.info('Token refreshed successfully', {
      account: response.account?.username
    });

    res.json({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresOn: response.expiresOn
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    
    // If refresh fails, client should re-authenticate
    if (error.errorCode === 'invalid_grant') {
      return res.status(401).json({
        error: 'Authentication Required',
        message: 'Refresh token is invalid or expired. Please re-authenticate.'
      });
    }
    
    next(error);
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user information
 * @access Private
 */
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    // Return user information from the token (no external API calls needed)
    const userProfile = {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      tenantId: req.user.tenantId,
      roles: req.user.roles,
      scopes: req.user.scopes
    };

    logger.info('User profile retrieved', {
      userId: req.user.id,
      email: req.user.email
    });

    res.json(userProfile);

  } catch (error) {
    logger.error('Get user profile error:', error);
    next(error);
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (invalidate token)
 * @access Private
 */
router.post('/logout', authenticateToken, (req, res) => {
  logger.info('User logged out', {
    userId: req.user.id,
    email: req.user.email
  });

  res.json({
    message: 'Logged out successfully'
  });
});

/**
 * @route GET /api/auth/config
 * @desc Get MSAL configuration for client
 * @access Public
 */
router.get('/config', (req, res) => {
  res.json({
    clientId: process.env.CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
    redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000',
    scopes: [
      'https://api.fabric.microsoft.com/Item.ReadWrite.All',
      'https://api.fabric.microsoft.com/Workspace.ReadWrite.All',
      'openid',
      'profile',
      'email'
    ],
    postLogoutRedirectUri: process.env.REDIRECT_URI || 'http://localhost:3000'
  });
});

module.exports = router;