const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
  test: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  executionId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['passed', 'failed', 'error', 'timeout', 'running'],
    default: 'running'
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: Date,
  duration: Number, // in milliseconds
  region: {
    type: String,
    required: true
  },
  response: {
    statusCode: Number,
    headers: Map,
    body: mongoose.Schema.Types.Mixed,
    size: Number,
    responseTime: Number
  },
  assertions: [{
    type: String,
    description: String,
    passed: Boolean,
    expected: mongoose.Schema.Types.Mixed,
    actual: mongoose.Schema.Types.Mixed,
    error: String
  }],
  error: {
    message: String,
    stack: String,
    code: String
  },
  metadata: {
    userAgent: String,
    ip: String,
    triggeredBy: {
      type: String,
      enum: ['manual', 'scheduled', 'webhook', 'api']
    },
    retryCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
testResultSchema.index({ test: 1 });
testResultSchema.index({ project: 1 });
testResultSchema.index({ executionId: 1 });
testResultSchema.index({ status: 1 });
testResultSchema.index({ startTime: -1 });
testResultSchema.index({ region: 1 });

// TTL index to automatically delete old results after 90 days
testResultSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model('TestResult', testResultSchema);