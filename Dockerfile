FROM node:18-alpine

WORKDIR /app

# Install netcat for wait-for-it script
RUN apk add --no-cache bash netcat-openbsd

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Copy wait-for-it script
COPY wait-for-it.sh ./
RUN chmod +x wait-for-it.sh

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S testflow -u 1001

# Change ownership of the app directory
RUN chown -R testflow:nodejs /app
USER testflow

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]