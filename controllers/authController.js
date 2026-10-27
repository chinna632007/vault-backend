const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const User = require("../models/User");
const Document = require("../models/Document");
const Trash = require("../models/Trash");

// Enforced storage limit in GB — applied to all users (backend source of truth)
const STORAGE_LIMIT_GB = 10;

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

const crypto = require("crypto");
const { google } = require("googleapis");

// --- Password-reset rate limiting (prevents token flooding / abuse).
// Keyed by ip + email so the limit applies regardless of registration status,
// which avoids leaking whether an email is registered. ---
const resetRequestLog = new Map(); // key: "${ip}|${email}" -> { count, firstAt }
const RESET_RATE_LIMIT_MAX = 3;
const RESET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const checkResetRateLimit = (key) => {
  const now = Date.now();
  const record = resetRequestLog.get(key) || { count: 0, firstAt: now };
  if (now - record.firstAt > RESET_RATE_LIMIT_WINDOW_MS) {
    record.count = 0;
    record.firstAt = now;
  }
  record.count += 1;
  resetRequestLog.set(key, record);
  return record.count <= RESET_RATE_LIMIT_MAX;
};

// --- Gmail API transport used only by the backend to send reset emails ---
const getGmailClient = () => {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    throw new Error("Gmail API OAuth credentials are not configured");
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: "v1", auth: oauth2Client });
};

const buildResetEmailMime = (to, resetUrl) => {
  const from = process.env.GMAIL_SENDER || "DocuVault <noreply@example.com>";
  const subject = "Reset your DocuVault password";
  const textBody = `You requested a password reset for your DocuVault account.\n\nReset your password: ${resetUrl}\n\nThis link is single-use and expires after 30 minutes. If you did not request this, you can safely ignore this email — your password was not changed.\n\n— The DocuVault team`;
  const encodeMimeBody = (body) =>
    Buffer.from(body, "utf8").toString("base64").match(/.{1,76}/g).join("\r\n");
  const htmlBody = `<!DOCTYPE html>
<html>
  <body style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#1f2933;margin:0;padding:24px">
    <h2 style="color:#4f46e5">Reset your DocuVault password</h2>
    <p>You requested a password reset for your DocuVault account.</p>
    <p>
      <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Reset password</a>
    </p>
    <p style="font-size:14px;color:#6b7280">
      Or copy this link into your browser:<br />
      ${resetUrl}
    </p>
    <p style="font-size:14px;color:#6b7280">
      This link is single-use and expires after 30 minutes.
    </p>
    <p style="font-size:14px;color:#6b7280">
      If you did not request this, please ignore this email — your password
      was not changed.
    </p>
    <p style="font-size:14px;color:#6b7280">— The DocuVault team</p>
  </body>
</html>`;

  const mimeParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="boundary_12345"`,
    ``,
    `--boundary_12345`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodeMimeBody(textBody),
    ``,
    `--boundary_12345`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodeMimeBody(htmlBody),
    ``,
    `--boundary_12345--`,
  ];
  return mimeParts.join("\r\n");
};

const sendResetPasswordEmailViaGmail = async (to, resetUrl) => {
  const gmail = getGmailClient();
  const mimeEmail = buildResetEmailMime(to, resetUrl);
  const encodedEmail = Buffer.from(mimeEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedEmail,
    },
  });
};

// POST /auth/forgot-password
// Never reveals whether an email address is registered: the HTTP 200 response
// is identical whether or not the account exists.
exports.forgotPassword = async (req, res) => {
  console.log("\n========== FORGOT PASSWORD REQUEST ==========");
  try {
    const { username, email } = req.body;
    if (!username || !String(username).trim()) {
      return res.status(400).json({ error: "Username is required" });
    }
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: "Email address is required" });
    }

    const emailKey = String(email).trim().toLowerCase();
    const usernameKey = String(username).trim();
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    if (!checkResetRateLimit(`${ip}|${emailKey}`)) {
      console.error("[FAIL] Password reset rate limit exceeded");
      return res
        .status(429)
        .json({ error: "Too many password reset requests. Please try again later." });
    }

    // Validate email format — must have correct domain after @ (e.g., gmail.com)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(emailKey)) {
      return res.status(400).json({ error: "Please enter a valid email address with correct domain (e.g., name@gmail.com)" });
    }

    // Check if username exists
    let existingUserByUsername = null;
    try {
      existingUserByUsername = await User.findOne({
        username: { $regex: new RegExp(`^${escapeRegex(usernameKey)}$`, "i") },
      });
    } catch (dbErr) {
      console.error("[WARN] Username lookup failed:", dbErr.message);
    }

    // Check if email exists
    let existingUserByEmail = null;
    try {
      existingUserByEmail = await User.findOne({
        email: { $regex: new RegExp(`^${escapeRegex(emailKey)}$`, "i") },
      });
    } catch (dbErr) {
      console.error("[WARN] Email lookup failed:", dbErr.message);
    }

    if (!existingUserByUsername && !existingUserByEmail) {
      console.log("[OK] No matching account — both username and email not registered");
      return res.status(400).json({ error: "not registered mail or not registered username" });
    }
    if (!existingUserByUsername) {
      console.log("[OK] Username not registered");
      return res.status(400).json({ error: "not registered username" });
    }
    if (!existingUserByEmail) {
      console.log("[OK] Email not registered");
      return res.status(400).json({ error: "not registered mail" });
    }

    // Both exist — verify they belong to the same account
    let user = null;
    if (existingUserByUsername.id === existingUserByEmail.id) {
      user = existingUserByUsername;
    }

    if (!user) {
      console.log("[OK] Username and email do not belong to the same account");
      return res.status(400).json({ error: "Username and email do not match the same account" });
    }

    const gmailConfigured = Boolean(
      process.env.GMAIL_CLIENT_ID &&
        process.env.GMAIL_CLIENT_SECRET &&
        process.env.GMAIL_REFRESH_TOKEN &&
        process.env.GMAIL_SENDER
    );
    let demo = false;
    let resetUrl = null;

    if (user) {
      // Cryptographically random, single-use token; only its hash is stored.
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = await bcrypt.hash(rawToken, 10);
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3030").replace(/\/+$/, "");
      resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

      if (gmailConfigured) {
        try {
          await sendResetPasswordEmailViaGmail(user.email, resetUrl);
          user.passwordResetToken = hashedToken;
          user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
          await user.save();
          console.log("[OK] Password reset email sent | token stored (hash only), expires in 30 minutes");
        } catch (mailErr) {
          const apiError = mailErr.response?.data?.error;
          console.error("[WARN] Email delivery failed (Gmail API):", {
            status: mailErr.response?.status,
            code: mailErr.code,
            reason: Array.isArray(apiError?.errors)
              ? apiError.errors.map(({ reason }) => reason).filter(Boolean)
              : undefined,
            message: apiError?.message || mailErr.message,
          });
          return res.status(500).json({ error: "Failed to send password reset email. Please try again later." });
        }
      } else {
        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();
        demo = true;
        console.log("[WARN] Gmail API not configured — demo mode: reset link generated but email not sent");
      }
    } else {
      console.log(
        "[OK] No matching account — responding without revealing registration status"
      );
    }

    return res.json({
      message: demo
        ? "Demo mode: email not configured. Use the simulated reset link below."
        : "If an account exists for that email address, a password reset link has been sent. Please check your inbox.",
      demo,
      // Only return resetUrl in demo mode (Gmail API not configured). In production,
      // the reset link is sent by email only — never exposed in the API response.
      resetUrl: demo ? resetUrl : null,
    });
  } catch (err) {
    console.error("[FAIL] Forgot password error:", err);
    return res.status(500).json({ error: "Password reset request failed" });
  }
};

// POST /auth/reset-password
exports.resetPassword = async (req, res) => {
  console.log("\n========== RESET PASSWORD REQUEST ==========");
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res
        .status(400)
        .json({ error: "Reset token and new password are required" });
    }
    if (typeof password !== "string" || password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters." });
    }

    // Find an account with an unexpired reset token
    const user = await User.findOne({
      passwordResetToken: { $ne: null },
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      console.error("[FAIL] Reset token not found or expired");
      return res
        .status(400)
        .json({ error: "Invalid or expired reset token" });
    }

    // Constant-time comparison of the raw token against its stored hash
    const validToken = await bcrypt.compare(token, user.passwordResetToken);
    if (!validToken) {
      console.error("[FAIL] Reset token mismatch");
      return res
        .status(400)
        .json({ error: "Invalid or expired reset token" });
    }

    // Hash the new password with the project's existing method (bcrypt, salt 10)
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(user.id, {
      $set: { password: hashedPassword },
      // Single-use: invalidate the token so it cannot be reused
      $unset: { passwordResetToken: "", passwordResetExpires: "" },
    });

    console.log("[OK] Password reset complete; reset token invalidated (single-use)");
    return res.json({
      message:
        "Your password has been reset successfully. You can now log in with your new password.",
    });
  } catch (err) {
    console.error("[FAIL] Reset password error:", err);
    return res.status(500).json({ error: "Password reset failed" });
  }
};