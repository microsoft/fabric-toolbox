const logger = require('../utils/logger');

const errorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || error.status || 500;
  let message = error.message || 'Internal Server Error';

  // Log the error
  logger.error('Error occurred:', {
    error: {
      message: error.message,
      stack: error.stack,
      statusCode: statusCode
    },
    request: {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    },
    timestamp: new Date().toISOString()
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (error.code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value';
  }

  // Don't expose stack traces in production
  const response = {
    error: {
      message: message,
      status: statusCode,
      timestamp: new Date().toISOString()
    }
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = error.stack;
  }

  // Add request ID if available
  if (req.id) {
    response.error.requestId = req.id;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;