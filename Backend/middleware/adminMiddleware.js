// Must run AFTER authMiddleware, e.g.:
//   router.use(authMiddleware, adminMiddleware);
// req.user is the decoded JWT payload set by authMiddleware, which now
// includes `role` (see authController.login/refresh).
module.exports = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }
    next();
};