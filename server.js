/*
 * Task 5 - CampusEvents API (Node.js + Express + MySQL)
 * SaiKet Systems Full Stack Development internship
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Configuration ----------
const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_campus_events_2026";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

// ---------- Rate Limiters ----------
// Applied to sensitive auth endpoints to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again after 15 minutes" },
});

// ---------- MySQL connection pool ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "campus_events",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // return DATE columns as plain "YYYY-MM-DD" text
});

// ---------- Helpers ----------
// Express 4 does not catch errors from async routes, so wrap them.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const parseId = (v) => (/^\d+$/.test(String(v)) ? Number(v) : null);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function validateUser({ name, email, age }, isUpdate = false) {
  const errors = [];
  if (!isUpdate || email !== undefined) {
    if (typeof email !== "string" || !emailRegex.test(email.trim())) {
      errors.push("email must be a valid email address");
    }
  }
  // Name and age are nullable for registration; validation applies when provided
  if (name !== undefined && name !== null) {
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 50) {
      errors.push("name must be 2 to 50 characters");
    }
  }
  if (age !== undefined && age !== null) {
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      errors.push("age must be a whole number between 1 and 120");
    }
  }
  return errors;
}

function validateEvent({ title, venue, event_date, capacity }) {
  const errors = [];
  if (typeof title !== "string" || title.trim().length < 3 || title.trim().length > 100)
    errors.push("title must be 3 to 100 characters");
  if (typeof venue !== "string" || venue.trim().length < 2 || venue.trim().length > 100)
    errors.push("venue must be 2 to 100 characters");
  if (typeof event_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(event_date) || isNaN(new Date(event_date)))
    errors.push("event_date must be a valid date like 2026-12-31");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)
    errors.push("capacity must be a whole number between 1 and 10000");
  return errors;
}

async function userExists(id) {
  const [rows] = await pool.query("SELECT id FROM users WHERE id = ?", [id]);
  return rows.length > 0;
}

async function getEvent(id) {
  const [rows] = await pool.query("SELECT * FROM events WHERE id = ?", [id]);
  return rows[0] || null;
}

// ---------- Auth Middleware ----------
// Verifies Bearer JWT token in Authorization header
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token required" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Optional Auth: decodes token if present, does not reject if absent
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    } catch (e) {
      // ignore invalid token for optional endpoints
    }
  }
  next();
}

// ---------- Home / API Endpoints Information ----------
app.get("/", (req, res) => {
  if (req.xhr || req.headers["accept"]?.includes("application/json") || req.query.format === "json") {
    return res.json({
      message: "CampusEvents API is running",
      endpoints: [
        "POST /auth/register", "POST /auth/login", "POST /auth/forgot-password", "POST /auth/reset-password", "GET /auth/me",
        "GET/POST /users", "GET/PUT/DELETE /users/:id",
        "GET/POST /events", "GET /events/:id/attendees", "GET /events/my-registrations",
        "POST /events/:id/register", "DELETE /events/:id/register", "DELETE /events/:id/register/:userId",
      ],
    });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api", (req, res) => {
  res.json({
    message: "CampusEvents API is running",
    endpoints: [
      "POST /auth/register", "POST /auth/login", "POST /auth/forgot-password", "POST /auth/reset-password", "GET /auth/me",
      "GET/POST /users", "GET/PUT/DELETE /users/:id",
      "GET/POST /events", "GET /events/:id/attendees", "GET /events/my-registrations",
      "POST /events/:id/register", "DELETE /events/:id/register", "DELETE /events/:id/register/:userId",
    ],
  });
});

// ---------- AUTHENTICATION ENDPOINTS ----------

// POST /auth/register { email, password, confirmPassword }
app.post("/auth/register", wrap(async (req, res) => {
  const { email, password, confirmPassword } = req.body || {};

  if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (!password || typeof password !== "string" || !passwordRegex.test(password)) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long and contain at least one letter and one number",
    });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if email already registered
  const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  if (existing.length > 0) {
    return res.status(409).json({ error: "Email already exists" });
  }

  // Hash password with bcrypt (10 rounds)
  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)",
    [normalizedEmail, passwordHash]
  );

  res.status(201).json({
    message: "User registered successfully",
    id: result.insertId,
    email: normalizedEmail,
  });
}));

// POST /auth/login { email, password } -> returns { token, user: { id, email } }
app.post("/auth/login", authLimiter, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [rows] = await pool.query("SELECT id, email, password_hash FROM users WHERE email = ?", [normalizedEmail]);
  if (!rows.length || !rows[0].password_hash) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  const user = rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({
    token,
    user: { id: user.id, email: user.email },
  });
}));

// POST /auth/forgot-password { email }
// Always responds with generic message to avoid leaking account existence
app.post("/auth/forgot-password", authLimiter, wrap(async (req, res) => {
  const { email } = req.body || {};

  if (email && typeof email === "string" && emailRegex.test(email.trim())) {
    const normalizedEmail = email.trim().toLowerCase();
    const [rows] = await pool.query("SELECT id, email FROM users WHERE email = ?", [normalizedEmail]);

    if (rows.length > 0) {
      const user = rows[0];
      // Generate secure random reset token
      const rawToken = crypto.randomBytes(32).toString("hex");
      // Store only its SHA-256 hash in database
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      // 15-minute expiry
      const expires = new Date(Date.now() + 15 * 60 * 1000);

      await pool.query(
        "UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?",
        [tokenHash, expires, user.id]
      );

      const host = req.get("host") || "localhost:3000";
      const protocol = req.protocol || "http";
      const resetLink = `${protocol}://${host}/reset.html?token=${rawToken}`;

      // DEMO: Print reset link to server console
      console.log("\n=======================================================");
      console.log("🔑 PASSWORD RESET LINK (DEMO):");
      console.log(`User:        ${user.email}`);
      console.log(`Reset URL:   ${resetLink}`);
      console.log(`Expires in:  15 minutes`);
      console.log("=======================================================\n");

      /*
       * Production Email Delivery Setup:
       * In production, install nodemailer or an API SDK (SendGrid, AWS SES, Resend).
       * Example:
       *   const transporter = nodemailer.createTransport({ ...smtpConfig });
       *   await transporter.sendMail({
       *     from: '"CampusEvents" <noreply@campusevents.edu>',
       *     to: user.email,
       *     subject: 'CampusEvents Password Reset Request',
       *     html: `<p>Click here to reset your password: <a href="${resetLink}">${resetLink}</a> (valid for 15 mins)</p>`
       *   });
       */
    }
  }

  // Consistent generic response
  res.json({ message: "If that email exists, a reset link has been sent" });
}));

// POST /auth/reset-password { token, newPassword, confirmPassword }
app.post("/auth/reset-password", wrap(async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body || {};

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Reset token is required" });
  }
  if (!newPassword || typeof newPassword !== "string" || !passwordRegex.test(newPassword)) {
    return res.status(400).json({
      error: "New password must be at least 8 characters long and contain at least one letter and one number",
    });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  // Compute SHA-256 hash of provided token
  const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");

  // Find user with matching unexpired token
  const [rows] = await pool.query(
    "SELECT id, email FROM users WHERE reset_token_hash = ? AND reset_token_expires > NOW()",
    [tokenHash]
  );

  if (!rows.length) {
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  const user = rows[0];
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  // Update password and clear reset token fields
  await pool.query(
    "UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL WHERE id = ?",
    [newPasswordHash, user.id]
  );

  res.json({ message: "Password reset successful. You may now log in with your new password." });
}));

// GET /auth/me (protected) -> returns logged-in user id & email
app.get("/auth/me", requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT id, name, email, age, created_at FROM users WHERE id = ?", [req.user.id]);
  if (!rows.length) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(rows[0]);
}));

// ---------- USERS (CRUD) ----------
// GET /users?name=asha&page=1&limit=10
app.get("/users", wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const like = `%${req.query.name || ""}%`;
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE name LIKE ? OR email LIKE ?", [like, like]);
  const [data] = await pool.query(
    "SELECT id, name, email, age, created_at FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY id LIMIT ? OFFSET ?",
    [like, like, limit, (page - 1) * limit]
  );
  res.json({ page, limit, total, data });
}));

app.get("/users/:id", wrap(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id must be a number" });
  const [rows] = await pool.query("SELECT id, name, email, age, created_at FROM users WHERE id = ?", [id]);
  if (!rows.length) return res.status(404).json({ error: `User ${id} not found` });
  res.json(rows[0]);
}));

// Protected: POST /users
app.post("/users", requireAuth, wrap(async (req, res) => {
  const errors = validateUser(req.body || {});
  if (errors.length) return res.status(400).json({ errors });
  const { name, email, age } = req.body;
  const userName = name ? name.trim() : null;
  const userAge = Number.isInteger(age) ? age : null;
  const [r] = await pool.query(
    "INSERT INTO users (name, email, age) VALUES (?, ?, ?)",
    [userName, email.trim(), userAge]
  );
  res.status(201).json({ id: r.insertId, name: userName, email: email.trim(), age: userAge });
}));

// Protected: PUT /users/:id
app.put("/users/:id", requireAuth, wrap(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id must be a number" });
  const errors = validateUser(req.body || {}, true);
  if (errors.length) return res.status(400).json({ errors });
  if (!(await userExists(id))) return res.status(404).json({ error: `User ${id} not found` });
  const { name, email, age } = req.body;
  const userName = name ? name.trim() : null;
  const userAge = Number.isInteger(age) ? age : null;
  await pool.query(
    "UPDATE users SET name = ?, email = ?, age = ? WHERE id = ?",
    [userName, email.trim(), userAge, id]
  );
  res.json({ id, name: userName, email: email.trim(), age: userAge });
}));

// Protected: DELETE /users/:id
app.delete("/users/:id", requireAuth, wrap(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id must be a number" });
  const [r] = await pool.query("DELETE FROM users WHERE id = ?", [id]);
  if (!r.affectedRows) return res.status(404).json({ error: `User ${id} not found` });
  res.json({ message: "User deleted", id });
}));

// ---------- EVENTS ----------
// Public: GET /events
app.get("/events", optionalAuth, wrap(async (req, res) => {
  const userId = req.user ? req.user.id : null;
  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.venue, e.event_date, e.capacity,
            COUNT(DISTINCT r.id) AS registered,
            MAX(CASE WHEN r.user_id = ? THEN 1 ELSE 0 END) AS is_registered
     FROM events e
     LEFT JOIN registrations r ON r.event_id = e.id
     GROUP BY e.id
     ORDER BY e.event_date ASC`,
    [userId]
  );
  res.json(rows);
}));

// Protected: POST /events
app.post("/events", requireAuth, wrap(async (req, res) => {
  const errors = validateEvent(req.body || {});
  if (errors.length) return res.status(400).json({ errors });
  const { title, venue, event_date, capacity } = req.body;
  const [r] = await pool.query(
    "INSERT INTO events (title, venue, event_date, capacity) VALUES (?, ?, ?, ?)",
    [title.trim(), venue.trim(), event_date, capacity]
  );
  res.status(201).json({ id: r.insertId, title: title.trim(), venue: venue.trim(), event_date, capacity });
}));

// Public: GET /events/:id/attendees
app.get("/events/:id/attendees", wrap(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id must be a number" });
  const event = await getEvent(id);
  if (!event) return res.status(404).json({ error: `Event ${id} not found` });
  const [attendees] = await pool.query(
    `SELECT u.id, u.name, u.email, r.registered_at
     FROM registrations r JOIN users u ON u.id = r.user_id
     WHERE r.event_id = ? ORDER BY r.registered_at`,
    [id]
  );
  res.json({ event: event.title, capacity: event.capacity, registered: attendees.length, attendees });
}));

// Protected: GET /events/my-registrations
app.get("/events/my-registrations", requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.venue, e.event_date, e.capacity, r.registered_at
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     WHERE r.user_id = ?
     ORDER BY e.event_date ASC`,
    [req.user.id]
  );
  res.json(rows);
}));

// ---------- REGISTRATIONS ----------
// Protected: POST /events/:id/register
// Uses logged-in user id from token (or fallback to body for backwards compatibility)
app.post("/events/:id/register", requireAuth, wrap(async (req, res) => {
  const eventId = parseId(req.params.id);
  // Use userId from body if explicitly provided (for backwards compatibility/admin),
  // otherwise use the authenticated user's ID from the JWT token (no userId in body)
  const userId = (req.body && Number.isInteger(req.body.userId))
    ? req.body.userId
    : (req.user && req.user.id);

  if (!eventId) return res.status(400).json({ error: "event id must be a number" });
  if (!userId) return res.status(400).json({ error: "User identity required" });

  const event = await getEvent(eventId);
  if (!event) return res.status(404).json({ error: `Event ${eventId} not found` });
  if (!(await userExists(userId))) return res.status(404).json({ error: `User ${userId} not found` });

  const [[{ taken }]] = await pool.query("SELECT COUNT(*) AS taken FROM registrations WHERE event_id = ?", [eventId]);
  if (taken >= event.capacity) return res.status(409).json({ error: "Event is full" });

  try {
    await pool.query("INSERT INTO registrations (user_id, event_id) VALUES (?, ?)", [userId, eventId]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "User already registered for this event" });
    throw err;
  }
  res.status(201).json({ message: "Registered successfully", eventId, userId });
}));

// Protected: DELETE /events/:id/register (cancels for currently logged-in user)
app.delete("/events/:id/register", requireAuth, wrap(async (req, res) => {
  const eventId = parseId(req.params.id);
  const userId = req.user.id;
  if (!eventId) return res.status(400).json({ error: "event id must be a number" });

  const [r] = await pool.query("DELETE FROM registrations WHERE event_id = ? AND user_id = ?", [eventId, userId]);
  if (!r.affectedRows) return res.status(404).json({ error: "Registration not found" });
  res.json({ message: "Registration cancelled", eventId, userId });
}));

// Protected: DELETE /events/:id/register/:userId (supports URL parameter userId)
app.delete("/events/:id/register/:userId", requireAuth, wrap(async (req, res) => {
  const eventId = parseId(req.params.id);
  const userId = parseId(req.params.userId) || (req.user && req.user.id);
  if (!eventId || !userId) return res.status(400).json({ error: "ids must be numbers" });

  const [r] = await pool.query("DELETE FROM registrations WHERE event_id = ? AND user_id = ?", [eventId, userId]);
  if (!r.affectedRows) return res.status(404).json({ error: "Registration not found" });
  res.json({ message: "Registration cancelled", eventId, userId });
}));

// ---------- Errors ----------
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON in request body" });
  if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email already exists" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// ---------- Start (check the database first) ----------
const PORT = process.env.PORT || 3000;
pool.query("SELECT 1")
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`CampusEvents API running on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error("Could not connect to MySQL:", err.message);
    console.error("Check your .env file and that MySQL is running and schema.sql was imported.");
    process.exit(1);
  });
