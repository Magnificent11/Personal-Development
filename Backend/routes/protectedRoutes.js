const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Protected route - requires valid JWT token
router.get('/profile', authMiddleware, (req, res) => {
  res.json({
    message: "This is a protected route",
    user: req.user // Contains the decoded JWT data (id and username)
  });
});

module.exports = router;