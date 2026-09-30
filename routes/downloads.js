const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const downloadController = require("../controllers/downloadController");

router.get("/", authenticateToken, downloadController.getDownloads);
router.post("/", authenticateToken, downloadController.createDownload);
router.delete("/", authenticateToken, downloadController.deleteAllDownloads);
router.delete("/:id", authenticateToken, downloadController.deleteDownload);

module.exports = router;