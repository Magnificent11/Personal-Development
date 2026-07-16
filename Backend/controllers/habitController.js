const Habit = require("../models/habit");
const User = require("../models/user");

// Helper: turn a Date (or date string) into a plain YYYY-MM-DD key,
// matching the frontend's `toKey()` (date.toISOString().slice(0, 10)).
function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// Helper: is this a valid scheduledDays array — non-empty, all integers 0-6?
// Used to decide whether an incoming value is safe to save, vs. silently
// falling back to "every day" (create) or leaving the existing value
// untouched (update) rather than letting a malformed request corrupt data.
function isValidScheduledDays(value) {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
}

// Get all habits for user
exports.getHabits = async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user.id }).sort({ order: 1, createdAt: 1 });
    res.json({ habits });
  } catch (error) {
    console.error("Get habits error:", error);
    res.status(500).json({ error: "Failed to fetch habits" });
  }
};

// Get the user's monthly goal target % (for the Goal Progress card)
exports.getGoal = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("monthlyGoalTarget");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ goalTarget: user.monthlyGoalTarget });
  } catch (error) {
    console.error("Get goal error:", error);
    res.status(500).json({ error: "Failed to fetch goal" });
  }
};

// Update the user's monthly goal target % (for the Goal Progress card)
// Body: { goalTarget: <number 1-100> }
exports.updateGoal = async (req, res) => {
  try {
    const { goalTarget } = req.body;

    if (typeof goalTarget !== "number" || Number.isNaN(goalTarget) || goalTarget < 1 || goalTarget > 100) {
      return res.status(400).json({ error: "goalTarget must be a number between 1 and 100" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.monthlyGoalTarget = Math.round(goalTarget);
    await user.save();

    res.json({ goalTarget: user.monthlyGoalTarget });
  } catch (error) {
    console.error("Update goal error:", error);
    res.status(500).json({ error: "Failed to update goal", details: error.message });
  }
};

// Create new habit
exports.createHabit = async (req, res) => {
  try {
    const { name, frequency, icon, color, order, scheduledDays } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Habit name is required" });
    }

    // Default to every day if the client didn't send a schedule (or sent
    // something invalid) — keeps any older/other client working unchanged.
    const validScheduledDays = isValidScheduledDays(scheduledDays)
      ? scheduledDays
      : [0, 1, 2, 3, 4, 5, 6];

    const habit = await Habit.create({
      userId: req.user.id,
      name,
      frequency: frequency || "daily",
      icon: icon || "✅",
      color: color || "#34d399",
      order: typeof order === "number" ? order : 0,
      scheduledDays: validScheduledDays,
      completedDates: []
    });

    res.status(201).json({ habit });
  } catch (error) {
    console.error("Create habit error:", error);
    res.status(500).json({ error: "Failed to create habit", details: error.message });
  }
};

// Update habit (name / icon / color / order / scheduledDays)
exports.updateHabit = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, color, order, scheduledDays } = req.body;

    const habit = await Habit.findOne({ _id: id, userId: req.user.id });
    if (!habit) {
      return res.status(404).json({ error: "Habit not found" });
    }

    if (name !== undefined) habit.name = name;
    if (icon !== undefined) habit.icon = icon;
    if (color !== undefined) habit.color = color;
    if (order !== undefined) habit.order = order;

    // Only touch scheduledDays if it was actually sent, and only if it's
    // valid — an invalid value is ignored rather than wiping the existing
    // schedule or failing the whole update.
    if (scheduledDays !== undefined && isValidScheduledDays(scheduledDays)) {
      habit.scheduledDays = scheduledDays;
    }

    await habit.save();

    res.json({ habit });
  } catch (error) {
    console.error("Update habit error:", error);
    res.status(500).json({ error: "Failed to update habit", details: error.message });
  }
};

// Toggle habit completion for a specific date (defaults to today)
// Body: { date: "YYYY-MM-DD" } (optional)
exports.toggleHabit = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;

    const habit = await Habit.findOne({ _id: id, userId: req.user.id });

    if (!habit) {
      return res.status(404).json({ error: "Habit not found" });
    }

    const targetKey = date ? date : toDateKey(new Date());

    const alreadyCompleted = habit.completedDates.some(
      d => toDateKey(d) === targetKey
    );

    if (alreadyCompleted) {
      habit.completedDates = habit.completedDates.filter(
        d => toDateKey(d) !== targetKey
      );
    } else {
      habit.completedDates.push(new Date(targetKey));
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