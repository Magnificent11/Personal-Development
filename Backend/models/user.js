const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2
  },
  refreshToken: { 
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user"
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Target % for the "Goal Progress" card — overall pooled completion rate
  // (across all habits combined) the user is aiming for each calendar month.
  monthlyGoalTarget: {
    type: Number,
    default: 80,
    min: 1,
    max: 100
  },
  // Updated by the heartbeat endpoint every time a logged-in user's tab
  // pings the server. Used by the admin dashboard to derive a live
  // online/offline indicator — not exposed anywhere in the regular
  // user-facing app itself.
  lastSeen: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

module.exports = mongoose.model("User", userSchema);