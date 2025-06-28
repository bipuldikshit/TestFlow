const express = require('express');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @swagger
 * /api/monitors:
 *   get:
 *     summary: Get monitoring data
 *     tags: [Monitors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monitoring data
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  res.json({
    message: 'Monitoring endpoints coming soon',
    features: [
      'Real-time test monitoring',
      'Performance metrics',
      'Alert management',
      'Uptime tracking'
    ]
  });
}));

module.exports = router;