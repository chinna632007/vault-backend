const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    passwordResetTokenHash: { type: String, default: undefined, select: false },
    passwordResetExpiresAt: { type: Date, default: undefined, select: false },
    phone: { type: String, default: "" },
    plan: { type: String, default: "Free" },
    avatar: { type: String, default: null },
    company: { type: String, default: "" },
    storageUsed: { type: Number, default: 0 },
        storageTotal: { type: Number, default: 10 },
    joinedAt: {
      type: String,
      default: () => new Date().toISOString().split("T")[0],
    },
  
  },
  { timestamps: true }
);

// Virtual id field (string representation of _id)
userSchema.virtual("id").get(function () {
  return this._id.toString();
});

userSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("User", userSchema);
