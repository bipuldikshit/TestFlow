const express = require('express');
const { body, validationResult } = require('express-validator');
const Test = require('../models/Test');
const Project = require('../models/Project');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const QueueService = require('../services/queueService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/tests:
 *   get:
 *     summary: Get tests for a project
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tests
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  const { projectId } = req.query;

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  // Verify user has access to the project
  const project = await Project.findOne({
    _id: projectId,
    $or: [
      { owner: req.user.userId },
      { 'members.user': req.user.userId }
    ]
  });

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const tests = await Test.find({ project: projectId, isActive: true })
    .populate('createdBy', 'firstName lastName email')
    .sort({ createdAt: -1 });

  res.json(tests);
}));

/**
 * @swagger
 * /api/tests:
 *   post:
 *     summary: Create a new test
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               projectId:
 *                 type: string
 *               config:
 *                 type: object
 *     responses:
 *       201:
 *         description: Test created successfully
 */
router.post('/', [
  auth,
  body('name').trim().isLength({ min: 1 }).withMessage('Test name is required'),
  body('projectId').isMongoId().withMessage('Valid project ID is required'),
  body('config.url').isURL().withMessage('Valid URL is required'),
  body('config.method').isIn(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).withMessage('Valid HTTP method is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, projectId, config, description, assertions } = req.body;

  // Verify user has access to the project
  const project = await Project.findOne({
    _id: projectId,
    $or: [
      { owner: req.user.userId },
      { 'members.user': req.user.userId }
    ]
  });

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const test = new Test({
    name,
    description,
    project: projectId,
    createdBy: req.user.userId,
    config,
    assertions: assertions || []
  });

  await test.save();
  await test.populate('createdBy', 'firstName lastName email');

  logger.info(`Test created: ${test.name} by ${req.user.email}`);
  res.status(201).json(test);
}));

/**
 * @swagger
 * /api/tests/{id}/execute:
 *   post:
 *     summary: Execute a test
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test execution started
 */
router.post('/:id/execute', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const test = await Test.findById(id).populate('project');
  if (!test) {
    return res.status(404).json({ error: 'Test not found' });
  }

  // Verify user has access to the project
  const hasAccess = test.project.owner.toString() === req.user.userId ||
    test.project.members.some(member => member.user.toString() === req.user.userId);

  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Add test to execution queue
  const job = await QueueService.addJob('test-execution', 'run-test', {
    testId: test._id,
    triggeredBy: 'manual',
    regions: test.regions.length > 0 ? test.regions : ['us-east-1']
  });

  logger.info(`Test execution queued: ${test.name} by ${req.user.email}`);
  
  res.json({
    message: 'Test execution started',
    jobId: job.id,
    testId: test._id
  });
}));

module.exports = router;