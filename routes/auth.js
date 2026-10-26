const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const authController = require("../controllers/authController");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/me", authenticateToken, authController.getMe);
router.put("/me", authenticateToken, authController.updateProfile);
router.post("/logout", authController.logout);
router.delete("/account", authenticateToken, authController.deleteAccount);

module.exports = router;
