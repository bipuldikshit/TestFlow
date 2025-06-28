const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// API Key authentication middleware
const apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const user = await User.findOne({
      'apiKeys.key': apiKey,
      'apiKeys.isActive': true,
      isActive: true
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Update last used timestamp
    const apiKeyObj = user.apiKeys.find(key => key.key === apiKey);
    if (apiKeyObj) {
      apiKeyObj.lastUsed = new Date();
      await user.save();
    }

    req.user = {
      userId: user._id,
      email: user.email,
      organization: user.organization,
      role: user.role
    };
    
    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(401).json({ error: 'Invalid API key' });
  }
};

// Role-based access control
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

module.exports = { auth, apiKeyAuth, authorize };