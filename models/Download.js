const mongoose = require("mongoose");

const downloadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    name: { type: String, required: true },
    type: { type: String, default: "pdf" },
    size: { type: String, default: "0 KB" },
    category: { type: String, default: "Other" },
    downloadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Virtual id field (string representation of _id)
downloadSchema.virtual("id").get(function () {
  return this._id.toString();
});

downloadSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Download", downloadSchema);
