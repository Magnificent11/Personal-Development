const express = require('express');
const router = express.Router();
const goalController = require('../controllers/goalController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Get all goals
router.get('/', goalController.getGoals);

// Create new goal
router.post('/', goalController.createGoal);

// Update goal
router.put('/:id', goalController.updateGoal);

// Delete goal
router.delete('/:id', goalController.deleteGoal);

module.exports = router;