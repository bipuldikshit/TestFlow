const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
  }

  initialize(io) {
    this.io = io;
    this.setupSocketHandlers();
    logger.info('Socket service initialized');
  }

  setupSocketHandlers() {
    this.io.use(this.authenticateSocket.bind(this));
    
    this.io.on('connection', (socket) => {
      logger.info(`User connected: ${socket.userId}`);
      
      this.connectedUsers.set(socket.userId, {
        socketId: socket.id,
        connectedAt: new Date()
      });

      // Join user to their organization room
      socket.join(`org_${socket.userOrg}`);
      
      // Join user to their project rooms
      socket.on('join_project', (projectId) => {
        socket.join(`project_${projectId}`);
        logger.info(`User ${socket.userId} joined project ${projectId}`);
      });

      socket.on('leave_project', (projectId) => {
        socket.leave(`project_${projectId}`);
        logger.info(`User ${socket.userId} left project ${projectId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`User disconnected: ${socket.userId}`);
        this.connectedUsers.delete(socket.userId);
      });
    });
  }

  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userOrg = decoded.organization;
      
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error'));
    }
  }

  // Emit to specific user
  emitToUser(userId, event, data) {
    const userConnection = this.connectedUsers.get(userId);
    if (userConnection) {
      this.io.to(userConnection.socketId).emit(event, data);
    }
  }

  // Emit to all users in a project
  emitToProject(projectId, event, data) {
    this.io.to(`project_${projectId}`).emit(event, data);
  }

  // Emit to all users in an organization
  emitToOrganization(organization, event, data) {
    this.io.to(`org_${organization}`).emit(event, data);
  }

  // Emit test result updates
  emitTestResult(testResult) {
    this.emitToProject(testResult.project, 'test_result', {
      testId: testResult.test,
      executionId: testResult.executionId,
      status: testResult.status,
      duration: testResult.duration,
      region: testResult.region,
      timestamp: testResult.startTime
    });
  }

  // Emit system alerts
  emitAlert(alert) {
    this.emitToOrganization(alert.organization, 'alert', {
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      projectId: alert.projectId,
      timestamp: alert.timestamp
    });
  }

  // Emit real-time metrics
  emitMetrics(projectId, metrics) {
    this.emitToProject(projectId, 'metrics_update', {
      timestamp: new Date(),
      metrics
    });
  }

  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  getConnectionCount() {
    return this.connectedUsers.size;
  }
}

module.exports = new SocketService();