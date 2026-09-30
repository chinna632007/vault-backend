const mongoose = require("mongoose");

const trashSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    type: { type: String, default: "pdf" },
    size: { type: String, default: "0 KB" },
    category: { type: String, default: "Other" },
    uploadedAt: {
      type: String,
      default: () => new Date().toISOString().split("T")[0],
    },
    favourite: { type: Boolean, default: false },
    tags: [{ type: String }],
    verified: { type: Boolean, default: false },
    filePath: { type: String, default: null },
    deletedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Virtual id field (string representation of _id)
trashSchema.virtual("id").get(function () {
  return this._id.toString();
});

trashSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Trash", trashSchema);