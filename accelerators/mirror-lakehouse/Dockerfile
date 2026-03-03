# Multi-stage Docker build for Lakehouse Mirror application

# Stage 1: Build the React frontend
FROM node:18-alpine as client-build

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install client dependencies
RUN npm ci --only=production

# Copy client source code
COPY client/ ./

# Build the client
RUN npm run build

# Stage 2: Build the Node.js backend
FROM node:18-alpine as server-build

WORKDIR /app/server

# Copy server package files
COPY server/package*.json ./

# Install server dependencies
RUN npm ci --only=production

# Copy server source code
COPY server/ ./

# Stage 3: Production runtime
FROM node:18-alpine as production

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

# Copy server files from build stage
COPY --from=server-build --chown=appuser:nodejs /app/server ./server

# Copy client build files from build stage
COPY --from=client-build --chown=appuser:nodejs /app/client/build ./client/build

# Copy environment configuration
COPY --chown=appuser:nodejs .env.example ./.env

# Create logs directory
RUN mkdir -p ./logs && chown appuser:nodejs ./logs

# Install production dependencies only
WORKDIR /app/server
RUN npm ci --only=production && npm cache clean --force

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
        const req = http.request({hostname:'localhost',port:3001,path:'/health',timeout:2000}, \
        (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); \
        req.on('error', () => process.exit(1)); \
        req.end();"

# Start the application
CMD ["node", "index.js"]