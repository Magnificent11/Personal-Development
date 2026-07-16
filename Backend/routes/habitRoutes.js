const express = require('express');
const router = express.Router();
const habitController = require('../controllers/habitController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Get all habits
router.get('/', habitController.getHabits);

// Create new habit
router.post('/', habitController.createHabit);

// Goal target (Goal Progress card) — declared before the "/:id" routes
// below so a request to "/goal" isn't swallowed by ":id" matching the
// literal string "goal" as a habit ID.
router.get('/goal', habitController.getGoal);
router.put('/goal', habitController.updateGoal);

// Update habit (name / icon / color / order)
router.put('/:id', habitController.updateHabit);

// Toggle habit completion for a given date (body: { date: "YYYY-MM-DD" })
router.post('/:id/toggle', habitController.toggleHabit);

// Delete habit
router.delete('/:id', habitController.deleteHabit);

module.exports = router;