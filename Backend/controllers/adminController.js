const User = require("../models/user");
const Habit = require("../models/habit");
const AuditLog = require("../models/auditLog");

// The JWT payload (req.user, set by authMiddleware) isn't guaranteed to
// carry a username depending on what was signed at login — fall back to a
// DB lookup so audit entries never end up attributed to "undefined".
async function getActorUsername(req) {
  if (req.user.username) return req.user.username;
  const actor = await User.findById(req.user.id).select("username");
  return actor ? actor.username : "unknown";
}

// Writes an audit log entry without ever letting a logging failure break
// the admin action it's attached to — the action has already succeeded
// by the time this is called, so at worst we log the error and move on.
async function recordAuditLog(entry) {
  try {
    await AuditLog.create(entry);
  } catch (error) {
    console.error("Audit log error:", error);
  }
}

// GET /api/admin/users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password -refreshToken")
      .sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    console.error("getAllUsers error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// GET /api/admin/users/:id
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -refreshToken");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (error) {
    console.error("getUserById error:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

// PUT /api/admin/users/:id/role   body: { role: "admin" | "user" }
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "role must be 'user' or 'admin'" });
    }

    // Prevent an admin from demoting themselves and locking themselves out
    if (req.params.id === req.user.id && role !== "admin") {
      return res.status(400).json({ error: "You cannot change your own admin role" });
    }

    const previousUser = await User.findById(req.params.id).select("role");
    if (!previousUser) return res.status(404).json({ error: "User not found" });
    const previousRole = previousUser.role;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select("-password -refreshToken");

    if (!user) return res.status(404).json({ error: "User not found" });

    if (previousRole !== role) {
      await recordAuditLog({
        actorId: req.user.id,
        actorUsername: await getActorUsername(req),
        action: "role_change",
        targetId: user._id,
        targetUsername: user.username,
        details: `${previousRole} \u2192 ${role}`
      });
    }

    res.json({ message: "Role updated", user });
  } catch (error) {
    console.error("updateUserRole error:", error);
    res.status(500).json({ error: "Failed to update role" });
  }
};

// PUT /api/admin/users/:id/ban   body: { isActive: boolean }
exports.setUserActive = async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive must be true or false" });
    }

    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "You cannot ban your own account" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive, ...(isActive ? {} : { refreshToken: null }) }, // force logout on ban
      { new: true }
    ).select("-password -refreshToken");

    if (!user) return res.status(404).json({ error: "User not found" });

    await recordAuditLog({
      actorId: req.user.id,
      actorUsername: await getActorUsername(req),
      action: isActive ? "unban" : "ban",
      targetId: user._id,
      targetUsername: user.username
    });

    res.json({ message: isActive ? "User reactivated" : "User banned", user });
  } catch (error) {
    console.error("setUserActive error:", error);
    res.status(500).json({ error: "Failed to update user status" });
  }
};

// DELETE /api/admin/users/:id
exports.deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Clean up their habits too
    const { deletedCount } = await Habit.deleteMany({ userId: req.params.id });

    await recordAuditLog({
      actorId: req.user.id,
      actorUsername: await getActorUsername(req),
      action: "delete",
      targetId: user._id,
      targetUsername: user.username,
      details: `${deletedCount} habit${deletedCount === 1 ? "" : "s"} removed`
    });

    res.json({ message: "User and their habits deleted" });
  } catch (error) {
    console.error("deleteUser error:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

// GET /api/admin/stats
exports.getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      adminCount,
      newUsersThisWeek,
      newUsersThisMonth,
      totalHabits
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ createdAt: { $gte: startOfWeek } }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Habit.countDocuments()
    ]);

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        banned: bannedUsers,
        admins: adminCount,
        newThisWeek: newUsersThisWeek,
        newThisMonth: newUsersThisMonth
      },
      habits: {
        total: totalHabits
      }
    });
  } catch (error) {
    console.error("getDashboardStats error:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

// GET /api/admin/users/:id/habits
exports.getUserHabits = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -refreshToken");
    if (!user) return res.status(404).json({ error: "User not found" });

    const habits = await Habit.find({ userId: req.params.id }).sort({ order: 1 });

    res.json({ user, habits });
  } catch (error) {
    console.error("getUserHabits error:", error);
    res.status(500).json({ error: "Failed to fetch user's habits" });
  }
};

// GET /api/admin/audit-log?page=1&limit=20
exports.getAuditLog = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments()
    ]);

    res.json({
      logs,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    console.error("getAuditLog error:", error);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
};