
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Trash = require("../models/Trash");
const Document = require("../models/Document");

// Trash retention period (in days). Items older than this are permanently
// deleted automatically by the scheduled cleanup task in server.js.
exports.TRASH_RETENTION_DAYS = 30;

// Resolve a stored file path against the current uploads directory using basename,
// so stale absolute paths in the DB can't break file cleanup.
const resolveFilePath = (filePath) => {
  if (!filePath) return null;
  return path.join(__dirname, "..", "uploads", path.basename(filePath));
};

// GET /trash — list trash items
exports.getTrash = async (req, res) => {
  try {
    const items = await Trash.find({
      userId: new mongoose.Types.ObjectId(req.user.id),
    }).sort({ deletedAt: -1 });
    res.json({ items });
  } catch (err) {
    console.error("Get trash error:", err);
    res.status(500).json({ error: "Failed to fetch trash" });
  }
};

// POST /trash/restore — restore item from trash
exports.restoreTrash = async (req, res) => {
  try {
    const { id } = req.body;
    const trashItem = await Trash.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(req.user.id),
    });
    if (!trashItem) {
      return res.status(404).json({ error: "Item not found in trash" });
    }

    // Restore to documents
    const doc = new Document({
      userId: trashItem.userId,
      name: trashItem.name,
      type: trashItem.type,
      size: trashItem.size,
      category: trashItem.category,
      uploadedAt: trashItem.uploadedAt,
      favourite: trashItem.favourite,
      tags: trashItem.tags,
      verified: trashItem.verified,
      filePath: trashItem.filePath,
    });
    await doc.save();

    res.json({ success: true, message: "Document restored" });
  } catch (err) {
    console.error("Restore trash error:", err);
    res.status(500).json({ error: "Failed to restore document" });
  }
};

// DELETE /trash/empty — empty all trash
exports.emptyTrash = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Delete files from disk
    const trashItems = await Trash.find({ userId });
    trashItems.forEach((item) => {
      const resolved = resolveFilePath(item.filePath);
      if (resolved && fs.existsSync(resolved)) {
        fs.unlink(resolved, () => { });
      }
    });

    await Trash.deleteMany({ userId });
    res.json({ success: true, message: "Trash emptied" });
  } catch (err) {
    console.error("Empty trash error:", err);
    res.status(500).json({ error: "Failed to empty trash" });
  }
};

// DELETE /trash/:id/permanent — permanently delete single item
exports.permanentDelete = async (req, res) => {
  try {
    const trashItem = await Trash.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(req.params.id),
      userId: new mongoose.Types.ObjectId(req.user.id),
    });
    if (!trashItem) {
      return res.status(404).json({ error: "Item not found in trash" });
    }

    // Delete file from disk
    const resolved = resolveFilePath(trashItem.filePath);
    if (resolved && fs.existsSync(resolved)) {
      fs.unlink(resolved, () => { });
    }

    res.json({ success: true, message: "Document permanently deleted" });
  } catch (err) {
    console.error("Permanent delete error:", err);
    res.status(500).json({ error: "Failed to permanently delete document" });
  }
};

// DELETE (scheduled) — automatically purge trash items past their retention period.
// Used by the recurring job set up in server.js; not exposed as a route handler.
exports.cleanupExpiredTrash = async () => {
  try {
    const cutoff = new Date(
      Date.now() - exports.TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    // Find expired items so we can also remove their files from disk
    const expiredItems = await Trash.find({ deletedAt: { $lt: cutoff } });

    expiredItems.forEach((item) => {
      const resolved = resolveFilePath(item.filePath);
      if (resolved && fs.existsSync(resolved)) {
        fs.unlink(resolved, () => {});
      }
    });

    const result = await Trash.deleteMany({ deletedAt: { $lt: cutoff } });
    if (result.deletedCount > 0) {
      console.log(
        `[OK] Auto-deleted ${result.deletedCount} expired trash item(s) older than ${exports.TRASH_RETENTION_DAYS} days`
      );
    }
    return result;
  } catch (err) {
    console.error("Auto-cleanup trash error:", err);
  }
};
