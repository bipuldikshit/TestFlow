const express = require('express');
const { body, validationResult } = require('express-validator');
const Project = require('../models/Project');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get user's projects
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of projects
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  const projects = await Project.find({
    $or: [
      { owner: req.user.userId },
      { 'members.user': req.user.userId }
    ],
    isActive: true
  }).populate('owner', 'firstName lastName email');

  res.json(projects);
}));

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
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
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Project created successfully
 */
router.post('/', [
  auth,
  body('name').trim().isLength({ min: 1 }).withMessage('Project name is required'),
  body('description').optional().trim()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description } = req.body;

  const project = new Project({
    name,
    description,
    owner: req.user.userId,
    organization: req.user.organization
  });

  await project.save();
  await project.populate('owner', 'firstName lastName email');

  logger.info(`Project created: ${project.name} by ${req.user.email}`);
  res.status(201).json(project);
}));

module.exports = router;