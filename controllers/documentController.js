const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Document = require("../models/Document");
const Trash = require("../models/Trash");

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

// Helper to resolve a file path to the current uploads directory.
// We always extract just the basename so that stale absolute paths stored in the
// database (e.g. from an old project/machine folder) never break lookup.
const resolveFilePath = (filePath) => {
  if (!filePath) return null;
  return path.join(__dirname, "..", "uploads", path.basename(filePath));
};

// Helper to delete a file from disk if it exists (never throws on missing file)
const deleteFileFromDisk = (filePath) => {
  if (!filePath) return;
  try {
    const resolvedPath = resolveFilePath(filePath);
    if (resolvedPath && fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
      console.log("[OK] Deleted file from disk:", resolvedPath);
    }
  } catch (err) {
    console.error("Failed to delete file from disk:", err);
  }
};

// GET /documents — list with optional filters
exports.getDocuments = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { category, search, favourite } = req.query;

    let query = { userId };

    if (category && category !== "all") {
      query.category = new RegExp(`^${category}$`, "i");
    }
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { tags: new RegExp(search, "i") },
      ];
    }
    if (favourite === "true") {
      query.favourite = true;
    }

    const documents = await Document.find(query).sort({ createdAt: -1 });
    res.json({ documents, total: documents.length });
  } catch (err) {
    console.error("Get documents error:", err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
};

// GET /documents/:id — single document
exports.getDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
      userId: new mongoose.Types.ObjectId(req.user.id),
    });
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ document: doc });
  } catch (err) {
    console.error("Get document error:", err);
    res.status(500).json({ error: "Failed to fetch document" });
  }
};

// POST /documents — create document (supports file upload via multer)
exports.createDocument = async (req, res) => {
  try {
    const { name, type, size, category, tags } = req.body;
    const file = req.file;

    // A document must include a real file, otherwise the download would have no
    // original data to return.
    if (!file) {
      return res
        .status(400)
        .json({ error: "No file uploaded. Please attach the original file." });
    }

    let docName = name;
    let docType = type;
    let docSize = size;
    let filePath = null;

    if (file) {
      docName = name || file.originalname;
      docType = type || path.extname(file.originalname).slice(1).toLowerCase();
      docSize = size || `${(file.size / 1024).toFixed(2)} KB`;
      // Store only the filename so the path stays portable across machines/folders
      filePath = path.basename(file.path);
    }

    const tagsArray = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
        ? tags.split(",").map((t) => t.trim()).filter((t) => t)
        : [];

    const newDoc = new Document({
      userId: new mongoose.Types.ObjectId(req.user.id),
      name: docName || "Untitled Document",
      type: docType || "pdf",
      size: docSize || "0 KB",
      category: category || "Other",
      uploadedAt: new Date().toISOString().split("T")[0],
      favourite: false,
      tags: tagsArray,
      verified: false,
      filePath,
    });

    await newDoc.save();
    res
      .status(201)
      .json({ document: newDoc, message: "Document uploaded successfully" });
  } catch (err) {
    console.error("Create document error:", err);
    res.status(500).json({ error: "Failed to upload document" });
  }
};

// PUT /documents/:id — update document
exports.updateDocument = async (req, res) => {
  try {
    const doc = await Document.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(req.params.id),
        userId: new mongoose.Types.ObjectId(req.user.id),
      },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ document: doc, message: "Document updated" });
  } catch (err) {
    console.error("Update document error:", err);
    res.status(500).json({ error: "Failed to update document" });
  }
};

// DELETE /documents/:id — move to trash
exports.deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(req.params.id),
      userId: new mongoose.Types.ObjectId(req.user.id),
    });
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Add to trash
    const trashItem = new Trash({
      userId: doc.userId,
      name: doc.name,
      type: doc.type,
      size: doc.size,
      category: doc.category,
      uploadedAt: doc.uploadedAt,
      favourite: doc.favourite,
      tags: doc.tags,
      verified: doc.verified,
      filePath: doc.filePath,
      deletedAt: new Date(),
    });
    await trashItem.save();

    // Delete the original file from the server when the document is deleted
    deleteFileFromDisk(doc.filePath);

    res.json({ success: true, message: "Document moved to trash" });
  } catch (err) {
    console.error("Delete document error:", err);
    res.status(500).json({ error: "Failed to delete document" });
  }
};

// GET /documents/:id/download — download file
exports.downloadDocument = async (req, res) => {
  try {
    console.log("\n=== DOWNLOAD REQUEST ===");
    console.log("Document ID:", req.params.id);
    console.log("User ID:", req.user.id);

    // Validate document ID
    let docId;
    try {
      docId = new mongoose.Types.ObjectId(req.params.id);
    } catch (err) {
      console.error("Invalid document ID:", req.params.id);
      return res.status(400).json({ error: "Invalid document ID" });
    }

    // Find document
    const doc = await Document.findOne({
      _id: docId,
      userId: new mongoose.Types.ObjectId(req.user.id),
    });

    if (!doc) {
      console.log("Document not found");
      return res.status(404).json({ error: "Document not found" });
    }

    console.log("Document found:", doc.name);
    console.log("File path:", doc.filePath);

    // Resolve the file path to an absolute path for reliability
    if (doc.filePath) {
      const resolvedPath = resolveFilePath(doc.filePath);

      console.log("Resolved file path:", resolvedPath);
      console.log("File exists:", fs.existsSync(resolvedPath));

      if (fs.existsSync(resolvedPath)) {
        // Determine content type based on file extension
        const ext = path.extname(doc.name).slice(1).toLowerCase() || doc.type || "octet-stream";
        const contentTypes = {
          pdf: "application/pdf",
          doc: "application/msword",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xls: "application/vnd.ms-excel",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ppt: "application/vnd.ms-powerpoint",
          pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          txt: "text/plain",
          csv: "text/csv",
          zip: "application/zip",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          svg: "image/svg+xml",
          html: "text/html",
          json: "application/json",
        };
        const contentType = contentTypes[ext] || "application/octet-stream";

        // Set headers for download
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.name)}"`);
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Type");

        console.log("Sending file from:", resolvedPath);
        console.log("Original filename:", doc.name);

        // Send file using sendFile for reliable streaming
        return res.sendFile(resolvedPath, (err) => {
          if (err) {
            console.error("Error during file download:", err);
            if (!res.headersSent) {
              return res.status(500).json({ error: "Failed to download file" });
            }
          } else {
            console.log("Download completed successfully");
          }
        });
      }
    }

    // Fallback: file not found, return metadata as text file
    console.log("File not found on disk, returning metadata");
    const content = [
      `Document Name: ${doc.name}`,
      `Type: ${doc.type}`,
      `Size: ${doc.size}`,
      `Category: ${doc.category}`,
      `Uploaded: ${doc.uploadedAt}`,
      `Status: ${doc.verified ? "Verified" : "Pending"}`,
      `Tags: ${(doc.tags || []).join(", ")}`,
      `\nNote: The original file is not available on the server.`,
    ].join("\n");

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.name}.txt"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Type");
    res.send(content);
  } catch (err) {
    console.error("Download document error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({ error: "Failed to download document" });
  } finally {
    console.log("=== DOWNLOAD REQUEST END ===\n");
  }
};

// GET /documents/:id/view — view file
exports.viewDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
      userId: new mongoose.Types.ObjectId(req.user.id),
    });
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (doc.filePath && fs.existsSync(resolveFilePath(doc.filePath))) {
      return res.sendFile(path.resolve(resolveFilePath(doc.filePath)));
    }

    res.json({ document: doc, preview: `Preview for ${doc.name}` });
  } catch (err) {
    console.error("View document error:", err);
    res.status(500).json({ error: "Failed to view document" });
  }
};
