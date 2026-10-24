const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Document = require("../models/Document");
const Trash = require("../models/Trash");

// Enforced storage limit in GB — applied to all users (backend source of truth)
const STORAGE_LIMIT_GB = 10;

const createResetMailer = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
};

// POST /auth/forgot-password
exports.forgotPassword = async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }

  const mailer = createResetMailer();
  if (!mailer) {
    return res.status(503).json({ error: "Password reset email is not configured. Contact support." });
  }

  try {
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(email)}$`, "i") },
    }).select("+passwordResetTokenHash +passwordResetExpiresAt");
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      user.passwordResetTokenHash = crypto.createHash("sha256").update(token).digest("hex");
      user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();

      const appUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
      const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await mailer.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: "Reset your DocuVault password",
        text: `We received a request to reset your DocuVault password. Use this link within 30 minutes: ${resetUrl}\n\nIf you did not request this, you can ignore this email. Your documents remain safe.`,
        html: `<p>We received a request to reset your DocuVault password.</p><p><a href="${resetUrl}">Create a new password</a></p><p>This link expires in 30 minutes. If you did not request this, ignore this email. Your documents remain safe.</p>`,
      });
    }
    // Do not reveal whether an account exists for the submitted email.
    return res.json({ message: "If an account exists for that email, a reset link has been sent." });
  } catch (err) {
    console.error("Password reset request failed:", err.message);
    return res.status(503).json({ error: "Could not send the reset email right now. Please try again later." });
  }
};

// POST /auth/reset-password
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (typeof token !== "string" || token.length < 32) {
    return res.status(400).json({ error: "This password reset link is invalid or expired." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }

  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpiresAt");
    if (!user) return res.status(400).json({ error: "This password reset link is invalid or expired." });

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();
    return res.json({ message: "Password updated. You can now sign in with your new password." });
  } catch (err) {
    console.error("Password reset failed:", err.message);
    return res.status(500).json({ error: "Could not update your password. Please try again." });
  }
};

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET || "docuvault-secret-key-2024",
    { expiresIn: "7d" }
  );
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  return obj;
};

// Escape special regex characters so user input is treated literally
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// POST /auth/register
exports.register = async (req, res) => {
  console.log("\n========== REGISTER REQUEST ==========");
  console.log("Request body:", { ...req.body, password: req.body.password ? "[REDACTED]" : undefined });
  console.log("Request headers:", JSON.stringify(req.headers, null, 2));
  try {
    const { username, email, password, phone } = req.body;
    console.log("Extracted fields - username:", username, "email:", email, "phone:", phone);

    if (!username || !email || !password) {
      console.error("[FAIL] Validation failed: Missing required fields");
      console.error("  username:", !!username, "email:", !!email, "password:", !!password);
      return res
        .status(400)
        .json({ error: "Username, email and password are required" });
    }

    console.log("[OK] Validation passed, checking for existing user (case-insensitive)...");
    const existing = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") } },
        { email: { $regex: new RegExp(`^${escapeRegex(email)}$`, "i") } },
      ],
    });
    console.log("Existing user found:", existing ? `yes (username: ${existing.username}, email: ${existing.email})` : "no");

    if (existing) {
      if (existing.username.toLowerCase() === username.toLowerCase()) {
        console.error("[FAIL] Registration failed: Username already taken");
        return res.status(400).json({ error: "Username already taken" });
      }
      console.error("[FAIL] Registration failed: Email already registered");
      return res.status(400).json({ error: "Email already registered" });
    }

    console.log("[OK] No existing user, hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("[OK] Password hashed successfully");

    const user = new User({
      username,
      email,
      password: hashedPassword,
      phone: phone || "",
    });

    console.log("Saving user to database...");
    await user.save();
    console.log("[OK] User saved successfully, ID:", user._id);

    console.log("Generating JWT token...");
    const token = generateToken(user);
    console.log("[OK] Token generated successfully");

    const sanitizedUser = { ...sanitizeUser(user), storageTotal: STORAGE_LIMIT_GB };
    console.log("[OK] Registration complete, sending response");
    console.log("========== REGISTER REQUEST END ==========\n");

    res.status(201).json({
      user: sanitizedUser,
      token,
      message: "Registration successful",
    });
  } catch (err) {
    console.error("[FAIL] Register error:", err);
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error("========== REGISTER REQUEST END (ERROR) ==========\n");
    res.status(500).json({ error: "Registration failed" });
  }
};

// POST /auth/login
exports.login = async (req, res) => {
  console.log("\n========== LOGIN REQUEST ==========");
  console.log("Request body:", { username: req.body.username, password: req.body.password ? "[REDACTED]" : undefined });
  console.log("Request headers:", JSON.stringify(req.headers, null, 2));
  try {
    const { username, password } = req.body;
    console.log("Extracted fields - username:", username);

    if (!username || !password) {
      console.error("[FAIL] Validation failed: Missing required fields");
      console.error("  username:", !!username, "password:", !!password);
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    console.log("[OK] Validation passed, looking up user in database (case-insensitive)...");
    const user = await User.findOne({
      username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") },
    });
    console.log("User found:", user ? `yes (ID: ${user._id}, username: ${user.username}, email: ${user.email})` : "no");

    if (!user) {
      console.error("[FAIL] Login failed: User not found");
      console.error("========== LOGIN REQUEST END (FAILED) ==========\n");
      return res.status(401).json({ error: "Invalid username or password" });
    }

    console.log("[OK] User found, comparing passwords...");
    const validPassword = await bcrypt.compare(password, user.password);
    console.log("Password comparison result:", validPassword ? "match" : "mismatch");

    if (!validPassword) {
      console.error("[FAIL] Login failed: Password mismatch");
      console.error("========== LOGIN REQUEST END (FAILED) ==========\n");
      return res.status(401).json({ error: "Invalid username or password" });
    }

    console.log("[OK] Password verified, generating JWT token...");
    const token = generateToken(user);
    console.log("[OK] Token generated successfully");

    const sanitizedUser = { ...sanitizeUser(user), storageTotal: STORAGE_LIMIT_GB };
    console.log("[OK] Login successful, sending response");
    console.log("Response user (sanitized):", JSON.stringify(sanitizedUser, null, 2));
    console.log("========== LOGIN REQUEST END ==========\n");

    res.json({ user: sanitizedUser, token });
  } catch (err) {
    console.error("[FAIL] Login error:", err);
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error("========== LOGIN REQUEST END (ERROR) ==========\n");
    res.status(500).json({ error: "Login failed" });
  }
};

// GET /auth/me
exports.getMe = async (req, res) => {
  console.log("\n========== GET ME REQUEST ==========");
  console.log("User ID from token:", req.user.id);
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (user) user.storageTotal = STORAGE_LIMIT_GB;
    if (!user) {
      console.error("[FAIL] User not found for ID:", req.user.id);
      console.error("========== GET ME REQUEST END (FAILED) ==========\n");
      return res.status(404).json({ error: "User not found" });
    }
    console.log("[OK] User found:", user.username);
    console.log("========== GET ME REQUEST END ==========\n");
    res.json({ user });
  } catch (err) {
    console.error("[FAIL] Get user error:", err);
    console.error("Error message:", err.message);
    console.error("========== GET ME REQUEST END (ERROR) ==========\n");
    res.status(500).json({ error: "Failed to get user" });
  }
};

// PUT /auth/me
exports.updateProfile = async (req, res) => {
  console.log("\n========== UPDATE PROFILE REQUEST ==========");
  console.log("User ID from token:", req.user.id);
  console.log("Update data:", { ...req.body, password: req.body.password ? "[REDACTED]" : undefined });
  try {
    const updates = { ...req.body };

    // Check username uniqueness
    if (updates.username) {
      console.log("Checking username uniqueness for:", updates.username);
      const existing = await User.findOne({
        username: updates.username,
        _id: { $ne: req.user.id },
      });
      if (existing) {
        console.error("[FAIL] Username already taken");
        return res.status(400).json({ error: "Username already taken" });
      }
      console.log("[OK] Username is available");
    }

    // Hash password if being updated
    if (updates.password) {
      console.log("Hashing new password...");
      updates.password = await bcrypt.hash(updates.password, 10);
      console.log("[OK] Password hashed");
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      console.error("[FAIL] User not found for ID:", req.user.id);
      return res.status(404).json({ error: "User not found" });
    }

    console.log("[OK] Profile updated successfully");
    console.log("========== UPDATE PROFILE REQUEST END ==========\n");
    res.json({ user, message: "Profile updated" });
  } catch (err) {
    console.error("[FAIL] Update profile error:", err);
    console.error("Error message:", err.message);
    console.error("========== UPDATE PROFILE REQUEST END (ERROR) ==========\n");
    res.status(500).json({ error: "Failed to update profile" });
  }
};

// POST /auth/logout
exports.logout = (req, res) => {
  console.log("\n========== LOGOUT REQUEST ==========");
  console.log("[OK] Logout successful");
  console.log("========== LOGOUT REQUEST END ==========\n");
  res.json({ success: true });
};

// DELETE /auth/account
exports.deleteAccount = async (req, res) => {
  console.log("\n========== DELETE ACCOUNT REQUEST ==========");
  console.log("User ID from token:", req.user.id);
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    console.log("Deleting user...");
    await User.findByIdAndDelete(userId);
    console.log("[OK] User deleted");

    console.log("Deleting user documents...");
    const userDocs = await Document.find({ userId });
    const userTrash = await Trash.find({ userId });

    // Delete all associated files from disk before removing DB records
    const deleteFile = (filePath) => {
      if (!filePath) return;
      try {
        // Always resolve against the current uploads dir using basename, so both
        // portable filenames and stale absolute paths are handled correctly.
        const resolvedPath = path.join(__dirname, "..", "uploads", path.basename(filePath));
        if (fs.existsSync(resolvedPath)) {
          fs.unlinkSync(resolvedPath);
        }
      } catch (err) {
        console.error("Failed to delete file:", err);
      }
    };

    userDocs.forEach((doc) => deleteFile(doc.filePath));
    userTrash.forEach((item) => deleteFile(item.filePath));

    await Document.deleteMany({ userId });
    console.log("[OK] Documents deleted");

    console.log("Deleting user trash items...");
    await Trash.deleteMany({ userId });
    console.log("[OK] Trash items deleted");

    console.log("[OK] Account deleted successfully");
    console.log("========== DELETE ACCOUNT REQUEST END ==========\n");
    res.json({ success: true, message: "Account deleted successfully" });
  } catch (err) {
    console.error("[FAIL] Delete account error:", err);
    console.error("Error message:", err.message);
    console.error("========== DELETE ACCOUNT REQUEST END (ERROR) ==========\n");
    res.status(500).json({ error: "Failed to delete account" });
  }
};
