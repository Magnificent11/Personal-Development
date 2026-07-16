const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Every route below requires a valid token AND an admin role
router.use(authMiddleware, adminMiddleware);

router.get('/stats', adminController.getDashboardStats);
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.get('/users/:id/habits', adminController.getUserHabits);
router.put('/users/:id/role', adminController.updateUserRole);
router.put('/users/:id/ban', adminController.setUserActive);
router.delete('/users/:id', adminController.deleteUser);
router.get('/audit-log', adminController.getAuditLog);

module.exports = router;