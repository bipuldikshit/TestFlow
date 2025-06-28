const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const testRoutes = require('./routes/tests');
const monitorRoutes = require('./routes/monitors');
const analyticsRoutes = require('./routes/analytics');
const webhookRoutes = require('./routes/webhooks');

// Import services
const SocketService = require('./services/socketService');
const MonitoringService = require('./services/monitoringService');
const QueueService = require('./services/queueService');

// Import documentation
const swaggerSetup = require('./docs/swagger');

class TestFlowServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });
    this.port = process.env.PORT || 3000;
  }

  async initialize() {
    try {
      // Setup middleware first
      this.setupMiddleware();
      
      // Connect to databases
      await connectDB();
      await connectRedis();
      
      // Initialize services
      await QueueService.initialize();
      SocketService.initialize(this.io);
      MonitoringService.initialize();

      // Setup routes
      this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      logger.info('Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      // Don't exit immediately, try to start with basic functionality
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    
    // Request logging - Fixed to use winston's http level
    const morganStream = {
      write: (message) => {
        logger.http(message.trim());
      }
    };
    
    this.app.use(morgan('combined', { 
      stream: morganStream,
      skip: (req, res) => {
        // Skip logging for health checks to reduce noise
        return req.url === '/health';
      }
    }));
    
    // Rate limiting
    this.app.use(generalLimiter);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
      });
    });
  }

  setupRoutes() {
    // API Documentation
    try {
      swaggerSetup(this.app);
    } catch (error) {
      logger.error('Failed to setup Swagger documentation:', error);
    }
    
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/projects', projectRoutes);
    this.app.use('/api/tests', testRoutes);
    this.app.use('/api/monitors', monitorRoutes);
    this.app.use('/api/analytics', analyticsRoutes);
    this.app.use('/api/webhooks', webhookRoutes);
    
    // Basic API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'TestFlow API',
        version: '1.0.0',
        description: 'Real-time API Testing and Monitoring Platform',
        endpoints: {
          auth: '/api/auth',
          projects: '/api/projects',
          tests: '/api/tests',
          monitors: '/api/monitors',
          analytics: '/api/analytics',
          webhooks: '/api/webhooks',
          health: '/health',
          docs: '/api-docs'
        }
      });
    });
    
    // Catch-all route
    this.app.use('*', notFound);
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
    
    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      // Don't exit immediately, log and continue
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit immediately, log and continue
    });
  }

  async gracefulShutdown() {
    logger.info('Shutting down gracefully...');
    
    this.server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown');
      process.exit(1);
    }, 10000);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`TestFlow server running on port ${this.port}`);
      logger.info(`API Documentation available at http://localhost:${this.port}/api-docs`);
    });
  }
}

// Start the server
const server = new TestFlowServer();
server.initialize().then(() => {
  server.start();
}).catch((error) => {
  logger.error('Failed to start server:', error);
  // Try to start anyway with basic functionality
  server.start();
});

module.exports = server;