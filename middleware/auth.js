const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
  console.log("\n--- AUTH MIDDLEWARE ---");
  // Check Authorization header first, then fallback to query param (for download/view)
  const authHeader = req.headers["authorization"];
  let token = authHeader && authHeader.split(" ")[1];

  console.log("Authorization header:", authHeader ? "present" : "missing");
  console.log("Token extracted from header:", token ? "yes" : "no");

  // If no header token, check query parameter
  if (!token && req.query.token) {
    token = req.query.token;
    console.log("Token extracted from query parameter: yes");
  }

  if (!token) {
    console.error("[FAIL] No token provided in header or query");
    console.error("--- AUTH MIDDLEWARE END (UNAUTHORIZED) ---\n");
    return res.status(401).json({ error: "Access token required" });
  }

  console.log("Verifying JWT token...");
  jwt.verify(
    token,
    process.env.JWT_SECRET || "docuvault-secret-key-2024",
    (err, decoded) => {
      if (err) {
        console.error("[FAIL] Token verification failed:", err.name, "-", err.message);
        console.error("--- AUTH MIDDLEWARE END (FORBIDDEN) ---\n");
        return res.status(403).json({ error: "Invalid or expired token" });
      }

      console.log("[OK] Token verified successfully");
      console.log("Decoded token payload:", {
        id: decoded.id,
        username: decoded.username,
        exp: new Date(decoded.exp * 1000).toISOString()
      });
      req.user = decoded;
      console.log("--- AUTH MIDDLEWARE END (AUTHORIZED) ---\n");
      next();
    }
  );
};

module.exports = { authenticateToken };
