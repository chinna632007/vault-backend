const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
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
  },
  { timestamps: true }
);

// Virtual id field (string representation of _id)
documentSchema.virtual("id").get(function () {
  return this._id.toString();
});

documentSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Document", documentSchema);