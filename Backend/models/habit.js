const mongoose = require("mongoose");

const habitSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  frequency: {
    type: String,
    enum: ["daily", "weekly"],
    default: "daily"
  },
  icon: {
    type: String,
    default: "✅"
  },
  color: {
    type: String,
    default: "#34d399"
  },
  // Which days of the week this habit applies to, using JS's native
  // getDay() convention: 0=Sunday, 1=Monday, ... 6=Saturday. Defaults to
  // every day — this also means any habit that predates this field (or
  // any request that omits it) is read back as "every day" automatically,
  // since Mongoose applies schema defaults for missing paths on read too.
  scheduledDays: {
    type: [Number],
    default: [0, 1, 2, 3, 4, 5, 6],
    validate: {
      validator: function (arr) {
        return Array.isArray(arr) &&
          arr.length > 0 &&
          arr.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
      },
      message: "scheduledDays must be a non-empty array of integers 0-6 (0=Sunday..6=Saturday)"
    }
  },
  order: {
    type: Number,
    default: 0
  },
  completedDates: [{
    type: Date
  }],
  // How many Flex Days (excused skips) this habit gets per calendar week.
  // 0 means the feature is off for this habit — no flex icon shows on its
  // cells, and it behaves exactly like it did before this field existed.
  flexDaysPerWeek: {
    type: Number,
    default: 0,
    validate: {
      validator: function (v) {
        return Number.isInteger(v) && v >= 0 && v <= 3;
      },
      message: "flexDaysPerWeek must be an integer between 0 and 3"
    }
  },
  // Dates this habit was excused with a Flex Day — mirrors completedDates
  // in shape and behavior (a plain array of Dates, toggled on/off by date).
  flexedDates: [{
    type: Date
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model("Habit", habitSchema);