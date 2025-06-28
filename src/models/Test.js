const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['api', 'load', 'smoke', 'regression'],
    default: 'api'
  },
  config: {
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      default: 'GET'
    },
    url: {
      type: String,
      required: true
    },
    headers: {
      type: Map,
      of: String,
      default: {}
    },
    body: mongoose.Schema.Types.Mixed,
    auth: {
      type: {
        type: String,
        enum: ['none', 'bearer', 'basic', 'apikey']
      },
      credentials: mongoose.Schema.Types.Mixed
    },
    timeout: {
      type: Number,
      default: 30000
    },
    followRedirects: {
      type: Boolean,
      default: true
    }
  },
  assertions: [{
    type: {
      type: String,
      enum: ['status', 'response_time', 'body_contains', 'header_exists', 'json_path', 'schema_validation']
    },
    field: String,
    operator: {
      type: String,
      enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'exists', 'not_exists']
    },
    value: mongoose.Schema.Types.Mixed,
    description: String
  }],
  schedule: {
    enabled: {
      type: Boolean,
      default: false
    },
    interval: {
      type: String,
      enum: ['1m', '5m', '15m', '30m', '1h', '4h', '12h', '24h'],
      default: '15m'
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  environment: {
    type: String,
    enum: ['development', 'staging', 'production'],
    default: 'development'
  },
  regions: [{
    type: String,
    enum: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1', 'ap-southeast-1'],
    default: 'us-east-1'
  }],
  tags: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  stats: {
    totalRuns: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    avgResponseTime: { type: Number, default: 0 },
    lastRun: Date,
    lastStatus: {
      type: String,
      enum: ['passed', 'failed', 'error', 'timeout']
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
testSchema.index({ project: 1 });
testSchema.index({ createdBy: 1 });
testSchema.index({ 'schedule.enabled': 1 });
testSchema.index({ environment: 1 });
testSchema.index({ tags: 1 });

module.exports = mongoose.model('Test', testSchema);