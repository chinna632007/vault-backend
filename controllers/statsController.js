const mongoose = require("mongoose");
const Document = require("../models/Document");
const Trash = require("../models/Trash");
const Download = require("../models/Download");

const parseSizeToMB = (sizeStr) => {
  if (!sizeStr) return 0;
  const size = parseFloat(sizeStr) || 0;
  return sizeStr.includes("MB") ? size : size / 1024;
};

const getCategoryColor = (category) => {
  const colors = {
    Work: "#2563eb",
    Legal: "#8b5cf6",
    Identity: "#10b981",
    Financial: "#f59e0b",
    Health: "#ef4444",
    Education: "#06b6d4",
    Personal: "#ec4899",
    Other: "#64748b",
  };
  return colors[category] || "#64748b";
};

// GET /stats — dashboard statistics
exports.getStats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const documents = await Document.find({ userId });
    const trash = await Trash.find({ userId });
    const categories = [...new Set(documents.map((d) => d.category))];

    const totalSize =
      documents
        .reduce((acc, d) => acc + parseSizeToMB(d.size), 0)
        .toFixed(1) + " MB";

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const uniqueDownloadedDocuments = await Download.distinct("documentId", { userId });
    const downloadCount = uniqueDownloadedDocuments.length;

    res.json({
      stats: {
        totalDocuments: documents.length,
        totalSize,
        categories: categories.length,
        favourite: documents.filter((d) => d.favourite).length,
        downloads: downloadCount,
        trash: trash.length,
        recentActivity: documents.filter((d) => {
          const uploaded = new Date(d.uploadedAt);
          return uploaded >= weekAgo;
        }).length,
      },
    });
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

// GET /wallet — wallet overview
exports.getWallet = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const documents = await Document.find({ userId });
    const categories = [...new Set(documents.map((d) => d.category))];

    const categoryBreakdown = categories.map((cat) => ({
      name: cat,
      count: documents.filter((d) => d.category === cat).length,
      color: getCategoryColor(cat),
    }));

    const recentDocs = [...documents]
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .slice(0, 5);

    const totalSize =
      documents
        .reduce((acc, d) => acc + parseSizeToMB(d.size), 0)
        .toFixed(1) + " MB";

    const uniqueDownloadedDocuments = await Download.distinct("documentId", { userId });
    const downloadCount = uniqueDownloadedDocuments.length;

    res.json({
      wallet: {
        totalDocuments: documents.length,
        totalSize,
        categories: categories.length,
        favourite: documents.filter((d) => d.favourite).length,
        downloads: downloadCount,
        categoryBreakdown,
        recentDocuments: recentDocs,
        lastBackup: new Date().toISOString().split("T")[0],
      },
    });
  } catch (err) {
    console.error("Get wallet error:", err);
    res.status(500).json({ error: "Failed to fetch wallet" });
  }
};

