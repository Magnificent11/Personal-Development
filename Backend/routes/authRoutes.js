const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Register route
router.post('/register', authController.register);

// Login route
router.post('/login', authController.login);

// Refresh token route
router.post('/refresh', authController.refresh);

// Logout route
router.post('/logout', authController.logout);

// Heartbeat route — logged-in users only. Pinged periodically by the
// frontend while a tab is open so the admin dashboard can show a live
// online/offline indicator.
router.post('/heartbeat', authMiddleware, authController.heartbeat);

// Onboarding-complete route — logged-in users only. Called once by the
// frontend when a first-time user finishes or skips the onboarding tour,
// so it doesn't show again on future logins.
router.post('/onboarding-complete', authMiddleware, authController.completeOnboarding);

module.exports = router;