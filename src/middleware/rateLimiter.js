const rateLimit = require('express-rate-limit');
const { MemoryStore } = require('express-rate-limit');
const logger = require('../utils/logger');

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  store: new MemoryStore(),
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.userId || req.ip;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for ${req.user?.userId || req.ip}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Authentication rate limiter (very restrictive)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  store: new MemoryStore(),
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP ${req.ip}`);
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Please try again later',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

module.exports = {
  generalLimiter,
  authLimiter
};