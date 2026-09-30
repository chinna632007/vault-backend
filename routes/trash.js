const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const trashController = require("../controllers/trashController");

router.get("/", authenticateToken, trashController.getTrash);
router.post("/restore", authenticateToken, trashController.restoreTrash);
router.delete("/empty", authenticateToken, trashController.emptyTrash);
router.delete(
  "/:id/permanent",
  authenticateToken,
  trashController.permanentDelete
);

module.exports = router;
