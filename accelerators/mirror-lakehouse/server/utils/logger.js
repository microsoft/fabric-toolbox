const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, '../../logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'lakehouse-mirror-api' },
  transports: [
    // Write all logs with level `error` and below to `error.log`
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Write all logs with level `info` and below to `combined.log`
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// If we're not in production, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        let output = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length) {
          try {
            // Clean meta object to avoid circular references
            const cleanMeta = {};
            Object.keys(meta).forEach(key => {
              const value = meta[key];
              if (value && typeof value === 'object' && (value.constructor.name === 'ClientRequest' || value.constructor.name === 'IncomingMessage')) {
                // Skip circular request/response objects
                return;
              }
              cleanMeta[key] = value;
            });
            output += ` ${JSON.stringify(cleanMeta, null, 2)}`;
          } catch (err) {
            output += ` [Logging Error: ${err.message}]`;
          }
        }
        return output;
      })
    )
  }));
}

module.exports = logger;