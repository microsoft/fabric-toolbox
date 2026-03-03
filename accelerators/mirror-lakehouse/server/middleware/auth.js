const { ConfidentialClientApplication } = require('@azure/msal-node');
const logger = require('../utils/logger');

// MSAL configuration
const msalConfig = {
  auth: {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`
  }
};

const cca = new ConfidentialClientApplication(msalConfig);

/**
 * Middleware to validate Azure AD access tokens
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No access token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Basic token validation (in production, you should validate the token signature)
    if (!token || token.length < 10) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid access token format'
      });
    }

    // Decode token to get user information (simplified - in production use proper JWT validation)
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      
      // Check token expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Access token has expired'
        });
      }

      // Attach user info to request (handle different token types)
      req.user = {
        id: payload.oid || payload.sub || payload.appid, // appid for client credentials
        email: payload.preferred_username || payload.upn || payload.unique_name,
        name: payload.name || `App ${payload.appid}`, // Fallback for client credentials
        tenantId: payload.tid,
        roles: payload.roles || [],
        scopes: payload.scp ? payload.scp.split(' ') : [], // scp might be empty for client credentials
        tokenType: payload.appidacr || payload.amr ? 'ClientCredentials' : 'UserToken',
        audience: payload.aud
      };

      req.accessToken = token;

      logger.info('User authenticated successfully', {
        userId: req.user.id,
        email: req.user.email,
        tokenType: req.user.tokenType,
        audience: req.user.audience,
        scopeCount: req.user.scopes.length,
        scopes: req.user.scopes,
        roles: req.user.roles,
        tenantId: req.user.tenantId,
        method: req.method,
        url: req.url
      });

      next();
    } catch (decodeError) {
      logger.error('Token decode error:', decodeError);
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid access token'
      });
    }

  } catch (error) {
    logger.error('Authentication middleware error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Authentication validation failed'
    });
  }
};

/**
 * Middleware to check if user has required scopes
 */
const requireScope = (requiredScopes) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No user context available'
      });
    }

    // For Fabric API tokens, check audience first
    try {
      const tokenParts = req.accessToken.split('.');
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      
      // If token audience is Fabric API, allow access regardless of scopes
      // This handles client credentials tokens and other valid Fabric API tokens
      if (payload.aud === 'https://api.fabric.microsoft.com' || 
          payload.aud === 'https://api.fabric.microsoft.com/') {
        
        logger.info('Fabric API token detected - allowing access', {
          userId: req.user.id,
          audience: payload.aud,
          appId: payload.appid,
          tokenType: payload.appidacr ? 'Client Credentials' : 'User Token',
          scopes: req.user?.scopes || [],
          roles: req.user?.roles || []
        });
        
        return next();
      }
    } catch (error) {
      logger.warn('Could not parse token for audience check', {
        error: error.message,
        userId: req.user.id
      });
    }

    // Fall back to traditional scope checking for other tokens
    const userScopes = req.user.scopes || [];
    
    if (userScopes.length === 0) {
      logger.warn('No scopes found in token, but not a Fabric API token', {
        userId: req.user.id,
        audience: req.user.audience,
        scopes: userScopes,
        roles: req.user.roles || [],
        requiredScopes: requiredScopes
      });
      
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'No permissions found in token'
      });
    }

    const hasRequiredScope = requiredScopes.some(scope => {
      // Check if user has exact scope
      if (userScopes.includes(scope)) {
        return true;
      }
      
      // Check if user has .default scope (covers all)
      if (userScopes.includes('https://api.fabric.microsoft.com/.default')) {
        return true;
      }
      
      // Check if user has ReadWrite scope when Read scope is required
      if (scope.includes('Read.All')) {
        const writeScope = scope.replace('Read.All', 'ReadWrite.All');
        if (userScopes.includes(writeScope)) {
          return true;
        }
      }
      
      return false;
    });

    if (!hasRequiredScope) {
      logger.warn('Insufficient scopes for non-Fabric API token', {
        userId: req.user.id,
        audience: req.user.audience,
        userScopes: userScopes,
        userRoles: req.user.roles || [],
        requiredScopes: requiredScopes
      });
      
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireScope,
  cca
};