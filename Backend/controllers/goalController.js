const Goal = require("../models/goal");

// Get all goals for user
exports.getGoals = async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ goals });
  } catch (error) {
    console.error("Get goals error:", error);
    res.status(500).json({ error: "Failed to fetch goals" });
  }
};

// Create new goal
exports.createGoal = async (req, res) => {
  try {
    const { title, description, deadline } = req.body;

    if (!title || !deadline) {
      return res.status(400).json({ error: "Title and deadline are required" });
    }

    const goal = await Goal.create({
      userId: req.user.id,
      title,
      description,
      deadline
    });

    res.status(201).json({ goal });
  } catch (error) {
    console.error("Create goal error:", error);
    res.status(500).json({ error: "Failed to create goal" });
  }
};

// Update goal
exports.updateGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, deadline, completed } = req.body;

    const goal = await Goal.findOne({ _id: id, userId: req.user.id });

    if (!goal) {
      return res.status(404).json({ error: "Goal not found" });
    }

    if (title) goal.title = title;
    if (description !== undefined) goal.description = description;
    if (deadline) goal.deadline = deadline;
    if (completed !== undefined) {
      goal.completed = completed;
      goal.completedAt = completed ? new Date() : null;
    }

    await goal.save();

    res.json({ goal });
  } catch (error) {
    console.error("Update goal error:", error);
    res.status(500).json({ error: "Failed to update goal" });
  }
};

// Delete goal
exports.deleteGoal = async (req, res) => {
  try {
    const { id } = req.params;

    const goal = await Goal.findOneAndDelete({ _id: id, userId: req.user.id });

    if (!goal) {
      return res.status(404).json({ error: "Goal not found" });
    }

    res.json({ message: "Goal deleted successfully" });
  } catch (error) {
    console.error("Delete goal error:", error);
    res.status(500).json({ error: "Failed to delete goal" });
  }
};