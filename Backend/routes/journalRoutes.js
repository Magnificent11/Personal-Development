const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journalController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Get all journal entries
router.get('/', journalController.getJournals);

// Create new journal entry
router.post('/', journalController.createJournal);

// Update journal entry
router.put('/:id', journalController.updateJournal);

// Delete journal entry
router.delete('/:id', journalController.deleteJournal);

module.exports = router;