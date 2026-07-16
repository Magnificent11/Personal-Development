const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Denormalized rather than populated on read: if the acting admin's
  // account is ever deleted or renamed, past log entries should still
  // read correctly instead of showing a broken reference.
  actorUsername: {
    type: String,
    required: true
  },
  action: {
    type: String,
    enum: ["ban", "unban", "delete", "role_change"],
    required: true
  },
  // Not a ref — the target user is very often gone by the time anyone
  // reads this log (that's the whole point of logging deletes), so a
  // strict reference would just dangle. Same denormalization reasoning
  // as actorUsername above.
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  targetUsername: {
    type: String,
    required: true
  },
  // Free-form extra context — e.g. "user → admin" for a role change, or
  // "6 habits removed" for a delete. Null when the action needs none.
  details: {
    type: String,
    default: null
  }
}, {
  timestamps: true // createdAt is what the log is sorted/displayed by
});

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);