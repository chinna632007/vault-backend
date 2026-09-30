const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticateToken } = require("../middleware/auth");
const documentController = require("../controllers/documentController");

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "..", "uploads");
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

router.get("/", authenticateToken, documentController.getDocuments);
router.post(
  "/",
  authenticateToken,
  upload.single("file"),
  documentController.createDocument
);
router.get(
  "/:id/download",
  authenticateToken,
  documentController.downloadDocument
);
router.get("/:id/view", authenticateToken, documentController.viewDocument);
router.get("/:id", authenticateToken, documentController.getDocument);
router.put("/:id", authenticateToken, documentController.updateDocument);
router.delete("/:id", authenticateToken, documentController.deleteDocument);

module.exports = router;
