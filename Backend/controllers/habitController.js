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

// Helper: is this a valid flexDaysPerWeek value — an integer 0-3?
// Same "ignore if invalid" philosophy as scheduledDays above.
function isValidFlexDaysPerWeek(value) {
  return Number.isInteger(value) && value >= 0 && value <= 3;
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
    const { name, frequency, icon, color, order, scheduledDays, flexDaysPerWeek } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Habit name is required" });
    }

    // Default to every day if the client didn't send a schedule (or sent
    // something invalid) — keeps any older/other client working unchanged.
    const validScheduledDays = isValidScheduledDays(scheduledDays)
      ? scheduledDays
      : [0, 1, 2, 3, 4, 5, 6];

    // Default to 0 (feature off) if the client didn't send a flex
    // allowance (or sent something invalid).
    const validFlexDaysPerWeek = isValidFlexDaysPerWeek(flexDaysPerWeek)
      ? flexDaysPerWeek
      : 0;

    const habit = await Habit.create({
      userId: req.user.id,
      name,
      frequency: frequency || "daily",
      icon: icon || "✅",
      color: color || "#34d399",
      order: typeof order === "number" ? order : 0,
      scheduledDays: validScheduledDays,
      flexDaysPerWeek: validFlexDaysPerWeek,
      completedDates: [],
      flexedDates: []
    });

    res.status(201).json({ habit });
  } catch (error) {
    console.error("Create habit error:", error);
    res.status(500).json({ error: "Failed to create habit", details: error.message });
  }
};

// Update habit (name / icon / color / order / scheduledDays / flexDaysPerWeek)
exports.updateHabit = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, color, order, scheduledDays, flexDaysPerWeek } = req.body;

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

    // Same "ignore if invalid, don't fail the whole request" treatment
    // for the flex allowance.
    if (flexDaysPerWeek !== undefined && isValidFlexDaysPerWeek(flexDaysPerWeek)) {
      habit.flexDaysPerWeek = flexDaysPerWeek;
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

      // A day can't be both completed and flexed at once — completing a
      // day clears any flex mark on it, same as the frontend's own rule
      // that a checked day never shows the flex icon.
      habit.flexedDates = habit.flexedDates.filter(
        d => toDateKey(d) !== targetKey
      );
    }

    await habit.save();

    res.json({ habit });
  } catch (error) {
    console.error("Toggle habit error:", error);
    res.status(500).json({ error: "Failed to toggle habit" });
  }
};

// Toggle a Flex Day for a specific date (defaults to today)
// Body: { date: "YYYY-MM-DD" } (optional)
//
// Mirrors toggleHabit above, but writes to flexedDates instead of
// completedDates. Enforces the weekly allowance server-side too (not just
// in the UI), and refuses to flex a day that's already marked complete.
exports.toggleFlexDay = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;

    const habit = await Habit.findOne({ _id: id, userId: req.user.id });

    if (!habit) {
      return res.status(404).json({ error: "Habit not found" });
    }

    const targetKey = date ? date : toDateKey(new Date());
    const targetDate = new Date(targetKey);

    const alreadyCompleted = habit.completedDates.some(
      d => toDateKey(d) === targetKey
    );
    if (alreadyCompleted) {
      return res.status(400).json({ error: "Can't flex a day that's already marked complete" });
    }

    const alreadyFlexed = habit.flexedDates.some(
      d => toDateKey(d) === targetKey
    );

    if (alreadyFlexed) {
      // Un-flex — always allowed, this just frees up the allowance again.
      habit.flexedDates = habit.flexedDates.filter(
        d => toDateKey(d) !== targetKey
      );
    } else {
      // Enforce the weekly allowance server-side: count how many flex
      // days are already used in the Mon-Sun calendar week containing
      // targetDate, same week-boundary math as the frontend.
      const allowance = habit.flexDaysPerWeek || 0;
      if (allowance === 0) {
        return res.status(400).json({ error: "This habit doesn't have flex days enabled" });
      }

      const dayOfWeek = targetDate.getUTCDay(); // 0=Sun..6=Sat
      const distToMonday = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(targetDate);
      weekStart.setUTCDate(weekStart.getUTCDate() + distToMonday);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

      const usedThisWeek = habit.flexedDates.filter(d => {
        const dd = new Date(d);
        return dd >= weekStart && dd <= weekEnd;
      }).length;

      if (usedThisWeek >= allowance) {
        return res.status(400).json({ error: "No flex days left this week" });
      }

      habit.flexedDates.push(targetDate);
    }

    await habit.save();

    res.json({ habit });
  } catch (error) {
    console.error("Toggle flex day error:", error);
    res.status(500).json({ error: "Failed to toggle flex day" });
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