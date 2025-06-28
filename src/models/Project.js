const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organization: {
    type: String,
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'viewer'],
      default: 'viewer'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    retryPolicy: {
      maxRetries: { type: Number, default: 3 },
      backoffStrategy: { type: String, enum: ['linear', 'exponential'], default: 'exponential' }
    },
    notifications: {
      onFailure: { type: Boolean, default: true },
      onSuccess: { type: Boolean, default: false },
      onThreshold: { type: Boolean, default: true }
    },
    alertThresholds: {
      responseTime: { type: Number, default: 5000 }, // ms
      errorRate: { type: Number, default: 0.05 }, // 5%
      availability: { type: Number, default: 0.99 } // 99%
    }
  },
  tags: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  stats: {
    totalTests: { type: Number, default: 0 },
    totalMonitors: { type: Number, default: 0 },
    lastActivity: Date
  }
}, {
  timestamps: true
});

// Indexes for better performance
projectSchema.index({ owner: 1 });
projectSchema.index({ organization: 1 });
projectSchema.index({ 'members.user': 1 });
projectSchema.index({ tags: 1 });

// Update stats when tests or monitors are added
projectSchema.methods.updateStats = function() {
  this.stats.lastActivity = new Date();
  return this.save();
};

module.exports = mongoose.model('Project', projectSchema);