const Queue = require('bull');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

class QueueService {
  constructor() {
    this.queues = new Map();
  }

  async initialize() {
    try {
      // Create different queues for different types of jobs
      this.createQueue('test-execution', {
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      this.createQueue('monitoring', {
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 25,
          attempts: 2,
          backoff: 'fixed',
        },
      });

      this.createQueue('notifications', {
        defaultJobOptions: {
          removeOnComplete: 25,
          removeOnFail: 10,
          attempts: 5,
          backoff: 'exponential',
        },
      });

      this.createQueue('analytics', {
        defaultJobOptions: {
          removeOnComplete: 200,
          removeOnFail: 50,
          attempts: 1,
        },
      });

      // Setup job processors
      this.setupProcessors();
      
      logger.info('Queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  createQueue(name, options = {}) {
    const queue = new Queue(name, {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
      },
      ...options,
    });

    // Queue event handlers
    queue.on('completed', (job, result) => {
      logger.info(`Job completed: ${job.id} in queue ${name}`);
    });

    queue.on('failed', (job, err) => {
      logger.error(`Job failed: ${job.id} in queue ${name}`, err);
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job stalled: ${job.id} in queue ${name}`);
    });

    this.queues.set(name, queue);
    return queue;
  }

  setupProcessors() {
    // Test execution processor
    this.getQueue('test-execution').process('run-test', 5, require('../processors/testProcessor'));
    
    // Monitoring processor
    this.getQueue('monitoring').process('health-check', 10, require('../processors/monitorProcessor'));
    
    // Notification processor
    this.getQueue('notifications').process('send-notification', 3, require('../processors/notificationProcessor'));
    
    // Analytics processor
    this.getQueue('analytics').process('calculate-metrics', 2, require('../processors/analyticsProcessor'));
  }

  getQueue(name) {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue '${name}' not found`);
    }
    return queue;
  }

  // Add job to queue
  async addJob(queueName, jobType, data, options = {}) {
    try {
      const queue = this.getQueue(queueName);
      const job = await queue.add(jobType, data, options);
      logger.info(`Job added to queue ${queueName}: ${job.id}`);
      return job;
    } catch (error) {
      logger.error(`Failed to add job to queue ${queueName}:`, error);
      throw error;
    }
  }

  // Get queue statistics
  async getQueueStats(queueName) {
    const queue = this.getQueue(queueName);
    
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  // Get all queue statistics
  async getAllQueueStats() {
    const stats = {};
    
    for (const [name, queue] of this.queues) {
      stats[name] = await this.getQueueStats(name);
    }
    
    return stats;
  }

  // Schedule recurring job
  async scheduleRecurringJob(queueName, jobType, data, cronExpression, options = {}) {
    const queue = this.getQueue(queueName);
    return queue.add(jobType, data, {
      repeat: { cron: cronExpression },
      ...options,
    });
  }

  // Remove job
  async removeJob(queueName, jobId) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    
    if (job) {
      await job.remove();
      logger.info(`Job removed: ${jobId} from queue ${queueName}`);
    }
  }

  // Pause queue
  async pauseQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.pause();
    logger.info(`Queue paused: ${queueName}`);
  }

  // Resume queue
  async resumeQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.resume();
    logger.info(`Queue resumed: ${queueName}`);
  }

  // Clean old jobs
  async cleanQueue(queueName, grace = 24 * 60 * 60 * 1000) {
    const queue = this.getQueue(queueName);
    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
    logger.info(`Queue cleaned: ${queueName}`);
  }
}

module.exports = new QueueService();