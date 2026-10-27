require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const morgan = require("morgan");
const connectDB = require("./config/db");
const User = require("./models/User");
const trashController = require("./controllers/trashController");

const app = express();
const PORT = process.env.PORT || 3000;

// Interval (in ms) between automatic trash cleanups.
const TRASH_CLEANUP_INTERVAL = 60 * 60 * 1000; // every hour

// Connect to MongoDB, then enforce the 10 GB storage limit for all users
connectDB().then(async () => {
  try {
    const result = await User.updateMany(
      { storageTotal: { $ne: 10 } },
      { $set: { storageTotal: 10 } }
    );
    console.log(`[OK] Storage limit set to 10 GB (updated ${result.modifiedCount || 0} user(s))`);
  } catch (err) {
    console.error("[FAIL] Failed to enforce storage limit:", err.message);
  }

  // Run the trash auto-cleanup once on startup, then schedule it to recur
  // every hour so trashed items older than 30 days are permanently deleted.
  try {
    await trashController.cleanupExpiredTrash();
  } catch (err) {
    console.error("[FAIL] Initial trash cleanup failed:", err.message);
  }
  setInterval(() => {
    trashController.cleanupExpiredTrash().catch((err) =>
      console.error("[FAIL] Scheduled trash cleanup failed:", err.message)
    );
  }, TRASH_CLEANUP_INTERVAL);
});

// Middleware
app.use(
  cors({
    exposedHeaders: ["Content-Disposition", "Content-Type"],
  })
);
app.use(express.json());

// Request logging with morgan (detailed HTTP request logs)
app.use(morgan("dev", {
  skip: (req, res) => {
    // Skip logging for health check to reduce noise
    return req.url === "/";
  },
}));

// Request logging middleware - logs all incoming requests (with body details)
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`\n>>> ${req.method} ${req.url} - ${new Date().toISOString()}`);
  if (req.body && Object.keys(req.body).length > 0) {
    const logBody = { ...req.body };
    if (logBody.password) logBody.password = "[REDACTED]";
    if (logBody.token) logBody.token = "[REDACTED]";
    console.log("    Body:", JSON.stringify(logBody, null, 2));
  }
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`<<< ${req.method} ${req.url} - Status: ${res.statusCode} - ${duration}ms`);
  });
  next();
});

app.use(express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/documents", require("./routes/documents"));
app.use("/trash", require("./routes/trash"));
app.use("/stats", require("./routes/stats"));
app.use("/wallet", require("./routes/wallet"));
app.use("/downloads", require("./routes/downloads"));

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "DocuVault Backend API is running",
    server_url: process.env.SERVER_URL
  });
});

// Serve static frontend assets (JS, CSS, images)
app.use(express.static(path.join(__dirname, "public")));

// SPA fallback — serve React app for all client-side routes (including /reset-password)
// API routes and static files above take priority; everything else falls back to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("[FAIL] Unhandled error:", err);
  console.error("Error name:", err.name);
  console.error("Error message:", err.message);
  console.error("Stack:", err.stack);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DocuVault backend running on http://localhost:${PORT}`);
});
