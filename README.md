# CampusEvents — Full Stack Event Management Portal

**SaiKet Systems Full Stack Development Internship — Task 5**  
A production-ready event management system built with **Node.js, Express, MySQL, JWT, bcryptjs**, and a responsive frontend using **HTML, Tailwind CSS (CDN), and Vanilla JavaScript**.

---

## 🌟 Features Overview

### 🔐 Part A — Backend Security & Authentication
- **Secure Authentication**: User sign-up and sign-in using **bcryptjs** (10+ salt rounds) and **JSON Web Tokens (JWT)**.
- **Generic Auth Feedback**: Uniform error message (`"Incorrect email or password"`) prevents user enumeration.
- **Safe Password Reset Flow**:
  - `POST /auth/forgot-password` always returns a generic response to prevent account leakage.
  - Generates cryptographically secure random tokens (`crypto.randomBytes`), stores only its **SHA-256 hash** with a **15-minute expiration**.
  - Demo prints the direct reset link to the server console (with comments for Nodemailer / SMTP production setup).
  - `POST /auth/reset-password` verifies token hash, enforces password complexity rules, updates the password, and invalidates the reset token.
- **Route Protection**: JWT `Authorization: Bearer <token>` middleware protects admin CRUD and registration endpoints while keeping `GET /events` public.
- **Brute-Force Rate Limiting**: `express-rate-limit` protects `/auth/login` and `/auth/forgot-password`.
- **SQL Injection Prevention**: All queries use parameterized `?` placeholders via `mysql2/promise`.

### 🎨 Part B — Responsive Front End
- **`login.html`**: Dual-tab Sign In / Sign Up interface with show/hide password eye toggles, real-time inline validation errors (no alerts), smooth fade/slide transitions, and forgot password flow.
- **`reset.html`**: Dedicated password reset screen reading the secure token from URL query parameters.
- **`dashboard.html`**: Protected dashboard with:
  - User initial circular profile avatar with dropdown menu (email display, theme toggle, sign out).
  - Upcoming events cards displaying real-time seat availability (`12 / 40 seats left` or `Full`).
  - Interactive "Register" and "Cancel registration" buttons with bump animations.
  - "My Registrations" section listing all events the student has signed up for.
  - Real-time search filter with smooth fade/stagger animation.
- **🌓 Dark (Black) Theme**: Class-based toggle (`darkMode: 'class'`) with persistent `localStorage` preference and smooth 300ms color transitions across all pages.
- **♿ Accessibility & Performance**: Semantic HTML5, accessible labels, ARIA attributes, focus rings, and `prefers-reduced-motion` compliance.

---

## ⚙️ Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=campus_events
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=2h
```

> **Note**: Never commit your real `.env` file to version control.

---

## 🚀 Setup & Installation

### 1. Database Setup
Make sure MySQL / MariaDB is running. Create the database and tables:
```bash
mysql -u root -p < schema.sql
```

#### Upgrading an Existing Database (Migration Snippet)
If you already have a `campus_events` database from previous steps, run:
```sql
ALTER TABLE users MODIFY name VARCHAR(50) NULL;
ALTER TABLE users MODIFY age INT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires DATETIME NULL;
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Server
```bash
# Start production server
npm start

# Or run with development watch mode
npm run dev
```

The portal will be live at **http://localhost:3000**  
- **Home / Entry**: `http://localhost:3000/` (auto-redirects to dashboard if logged in, otherwise login)
- **Login / Register**: `http://localhost:3000/login.html`
- **Dashboard**: `http://localhost:3000/dashboard.html`

---

## 📡 API Reference

### Authentication Endpoints

| Method | Endpoint | Access | Body / Params | Description |
|--------|----------|--------|---------------|-------------|
| `POST` | `/auth/register` | Public | `{ email, password, confirmPassword }` | Register new user (password >= 8 chars, letter + number) |
| `POST` | `/auth/login` | Public (Rate-limited) | `{ email, password }` | Authenticate and receive `{ token, user }` |
| `POST` | `/auth/forgot-password` | Public (Rate-limited) | `{ email }` | Generates 15-min reset token (printed to console) |
| `POST` | `/auth/reset-password` | Public | `{ token, newPassword, confirmPassword }` | Sets new password via token verification |
| `GET`  | `/auth/me` | Protected (Bearer Token) | *None* | Returns `{ id, email, ... }` of authenticated user |

### Users CRUD

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET`    | `/users?name=&page=&limit=` | Public | Search users with pagination |
| `GET`    | `/users/:id` | Public | Get single user by ID |
| `POST`   | `/users` | Protected | Create user `{ name, email, age }` |
| `PUT`    | `/users/:id` | Protected | Update user `{ name, email, age }` |
| `DELETE` | `/users/:id` | Protected | Delete user by ID |

### Events & Registrations

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET`    | `/events` | Public | List all upcoming events with registered count |
| `POST`   | `/events` | Protected | Create new event `{ title, venue, event_date, capacity }` |
| `GET`    | `/events/:id/attendees` | Public | View attendee list for a specific event |
| `GET`    | `/events/my-registrations` | Protected | List events joined by the logged-in user |
| `POST`   | `/events/:id/register` | Protected | Register authenticated user (no `userId` in body required) |
| `DELETE` | `/events/:id/register` | Protected | Cancel authenticated user's registration |
| `DELETE` | `/events/:id/register/:userId` | Protected | Cancel registration by user ID (admin/legacy support) |

---

## 🧪 Testing with Postman & Newman

Import `CampusEvents-API.postman_collection.json` into Postman.  
The collection variables automatically store `baseUrl` and `token` returned by `/auth/login`.

You can also run automated collection tests via **Newman**:
```bash
npx -y newman run CampusEvents-API.postman_collection.json
```
All 19 requests and 24 assertions pass with 0 failures.
