const Habit = require("../models/habit");

// Get all habits for user
exports.getHabits = async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ habits });
  } catch (error) {
    console.error("Get habits error:", error);
    res.status(500).json({ error: "Failed to fetch habits" });
  }
};

// Create new habit
exports.createHabit = async (req, res) => {
  try {
    const { name, frequency } = req.body;

    console.log("Create habit request:", { name, frequency, userId: req.user.id });

    if (!name) {
      return res.status(400).json({ error: "Habit name is required" });
    }

    const habit = await Habit.create({
      userId: req.user.id,
      name,
      frequency: frequency || "daily",
      completedDates: []
    });

    console.log("Habit created:", habit);

    res.status(201).json({ habit });
  } catch (error) {
    console.error("Create habit error:", error);
    res.status(500).json({ error: "Failed to create habit", details: error.message });
  }
};

// Toggle habit completion for today
exports.toggleHabit = async (req, res) => {
  try {
    const { id } = req.params;

    const habit = await Habit.findOne({ _id: id, userId: req.user.id });

    if (!habit) {
      return res.status(404).json({ error: "Habit not found" });
    }

    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already completed today
    const completedToday = habit.completedDates.some(date => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });

    if (completedToday) {
      // Remove today's completion
      habit.completedDates = habit.completedDates.filter(date => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() !== today.getTime();
      });
    } else {
      // Add today's completion
      habit.completedDates.push(new Date());
    }

    await habit.save();

    res.json({ habit });
  } catch (error) {
    console.error("Toggle habit error:", error);
    res.status(500).json({ error: "Failed to toggle habit" });
  }
};

// Delete habit
exports.deleteHabit = async (req, res) => {
  try {
    const { id } = req.params;

    const habit = await Habit.findOneAndDelete({ _id: id, userId: req.user.id });

    if (!habit) {
      return res.status(404).json({ error: "Habit not found" });
    }

    res.json({ message: "Habit deleted successfully" });
  } catch (error) {
    console.error("Delete habit error:", error);
    res.status(500).json({ error: "Failed to delete habit" });
  }
};