const mongoose = require("mongoose");
const Download = require("../models/Download");
const Document = require("../models/Document");

// GET /downloads — list user's downloads
exports.getDownloads = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { search } = req.query;

    let query = { userId };

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    const downloads = await Download.find(query).sort({ downloadedAt: -1 });
    res.json({ downloads });
  } catch (err) {
    console.error("Get downloads error:", err);
    res.status(500).json({ error: "Failed to fetch downloads" });
  }
};

// POST /downloads — record a new download
exports.createDownload = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { documentId, name, type, size, category } = req.body;

    const download = new Download({
      userId,
      documentId: documentId ? new mongoose.Types.ObjectId(documentId) : null,
      name: name || "Unknown Document",
      type: type || "pdf",
      size: size || "0 KB",
      category: category || "Other",
    });

    await download.save();
    res.status(201).json({ download });
  } catch (err) {
    console.error("Create download error:", err);
    res.status(500).json({ error: "Failed to record download" });
  }
};

// DELETE /downloads/:id — delete a download record
exports.deleteDownload = async (req, res) => {
  try {
    const download = await Download.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(req.params.id),
      userId: new mongoose.Types.ObjectId(req.user.id),
    });
    if (!download) {
      return res.status(404).json({ error: "Download record not found" });
    }
    res.json({ success: true, message: "Download record deleted" });
  } catch (err) {
    console.error("Delete download error:", err);
    res.status(500).json({ error: "Failed to delete download record" });
  }
};

// DELETE /downloads — clear all of the user's download records
exports.deleteAllDownloads = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    await Download.deleteMany({ userId });
    res.json({ success: true, message: "All download records deleted" });
  } catch (err) {
    console.error("Delete all downloads error:", err);
    res.status(500).json({ error: "Failed to delete download records" });
  }
};