const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const statsController = require("../controllers/statsController");

router.get("/", authenticateToken, statsController.getWallet);

module.exports = router;
