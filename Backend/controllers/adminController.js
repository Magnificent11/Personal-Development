const User = require("../models/user");
const Habit = require("../models/habit");

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

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select("-password -refreshToken");

    if (!user) return res.status(404).json({ error: "User not found" });
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
    await Habit.deleteMany({ userId: req.params.id });

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