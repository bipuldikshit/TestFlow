const cron = require('node-cron');
const Test = require('../models/Test');
const QueueService = require('./queueService');
const logger = require('../utils/logger');

class MonitoringService {
  constructor() {
    this.scheduledJobs = new Map();
    this.isInitialized = false;
  }

  initialize() {
    if (this.isInitialized) return;

    // Start monitoring service
    this.startHealthCheckScheduler();
    this.startMetricsCollector();
    this.startAlertProcessor();
    
    this.isInitialized = true;
    logger.info('Monitoring service initialized');
  }

  startHealthCheckScheduler() {
    // Run every minute to check for scheduled tests
    cron.schedule('* * * * *', async () => {
      try {
        await this.processScheduledTests();
      } catch (error) {
        logger.error('Error in health check scheduler:', error);
      }
    });
  }

  startMetricsCollector() {
    // Collect metrics every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        await this.collectSystemMetrics();
      } catch (error) {
        logger.error('Error in metrics collector:', error);
      }
    });
  }

  startAlertProcessor() {
    // Process alerts every 2 minutes
    cron.schedule('*/2 * * * *', async () => {
      try {
        await this.processAlerts();
      } catch (error) {
        logger.error('Error in alert processor:', error);
      }
    });
  }

  async processScheduledTests() {
    const scheduledTests = await Test.find({
      'schedule.enabled': true,
      isActive: true
    }).populate('project');

    for (const test of scheduledTests) {
      const shouldRun = this.shouldRunScheduledTest(test);
      
      if (shouldRun) {
        // Add test to execution queue
        await QueueService.addJob('test-execution', 'run-test', {
          testId: test._id,
          triggeredBy: 'scheduled',
          regions: test.regions
        });
        
        logger.info(`Scheduled test queued: ${test.name}`);
      }
    }
  }

  shouldRunScheduledTest(test) {
    const now = new Date();
    const lastRun = test.stats.lastRun || new Date(0);
    const intervalMs = this.getIntervalInMs(test.schedule.interval);
    
    return (now - lastRun) >= intervalMs;
  }

  getIntervalInMs(interval) {
    const intervals = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000
    };
    
    return intervals[interval] || intervals['15m'];
  }

  async collectSystemMetrics() {
    const metrics = {
      timestamp: new Date(),
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpu: process.cpuUsage()
      },
      queues: await QueueService.getAllQueueStats()
    };

    // Add to analytics queue for processing
    await QueueService.addJob('analytics', 'calculate-metrics', {
      type: 'system',
      metrics
    });
  }

  async processAlerts() {
    // This would check for various alert conditions
    // For now, we'll implement basic threshold checking
    
    const TestResult = require('../models/TestResult');
    const Project = require('../models/Project');
    
    const projects = await Project.find({ isActive: true });
    
    for (const project of projects) {
      const recentResults = await TestResult.find({
        project: project._id,
        createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Last 15 minutes
      });

      if (recentResults.length > 0) {
        const failureRate = recentResults.filter(r => r.status === 'failed').length / recentResults.length;
        const avgResponseTime = recentResults.reduce((sum, r) => sum + (r.response?.responseTime || 0), 0) / recentResults.length;

        // Check thresholds
        if (failureRate > project.settings.alertThresholds.errorRate) {
          await this.sendAlert(project, 'high_error_rate', {
            currentRate: failureRate,
            threshold: project.settings.alertThresholds.errorRate
          });
        }

        if (avgResponseTime > project.settings.alertThresholds.responseTime) {
          await this.sendAlert(project, 'high_response_time', {
            currentTime: avgResponseTime,
            threshold: project.settings.alertThresholds.responseTime
          });
        }
      }
    }
  }

  async sendAlert(project, type, data) {
    await QueueService.addJob('notifications', 'send-notification', {
      type: 'alert',
      project: project._id,
      alertType: type,
      data,
      timestamp: new Date()
    });
  }

  // Schedule a custom monitoring job
  scheduleCustomJob(name, cronExpression, callback) {
    if (this.scheduledJobs.has(name)) {
      this.scheduledJobs.get(name).destroy();
    }

    const job = cron.schedule(cronExpression, callback, {
      scheduled: false
    });

    this.scheduledJobs.set(name, job);
    job.start();
    
    logger.info(`Custom monitoring job scheduled: ${name}`);
  }

  // Remove scheduled job
  removeScheduledJob(name) {
    if (this.scheduledJobs.has(name)) {
      this.scheduledJobs.get(name).destroy();
      this.scheduledJobs.delete(name);
      logger.info(`Scheduled job removed: ${name}`);
    }
  }

  // Get monitoring status
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      scheduledJobs: Array.from(this.scheduledJobs.keys()),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }
}

module.exports = new MonitoringService();