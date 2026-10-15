-- CampusEvents database (MySQL)
-- Run:  mysql -u root -p < schema.sql
CREATE DATABASE IF NOT EXISTS campus_events;
USE campus_events;

CREATE TABLE IF NOT EXISTS users (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(50)  NULL,
  email               VARCHAR(100) NOT NULL UNIQUE,
  age                 INT          NULL,
  password_hash       VARCHAR(255) NULL,
  reset_token_hash    VARCHAR(255) NULL,
  reset_token_expires DATETIME     NULL,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  title      VARCHAR(100) NOT NULL,
  venue      VARCHAR(100) NOT NULL,
  event_date DATE         NOT NULL,
  capacity   INT          NOT NULL
);

CREATE TABLE IF NOT EXISTS registrations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  event_id      INT NOT NULL,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY one_signup_per_event (user_id, event_id),
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- ============================================================
-- Migration snippet for an existing database (if upgrading):
-- ============================================================
-- ALTER TABLE users MODIFY name VARCHAR(50) NULL;
-- ALTER TABLE users MODIFY age INT NULL;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(255) NULL;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires DATETIME NULL;
-- ============================================================

-- Sample data
INSERT IGNORE INTO users (id, name, email, age, password_hash) VALUES
  (1, 'Asha Raman', 'asha@example.com', 21, NULL),
  (2, 'Karthik Selvam', 'karthik@example.com', 22, NULL);

INSERT IGNORE INTO events (id, title, venue, event_date, capacity) VALUES
  (1, 'Hackathon 2026', 'Main Auditorium', '2026-11-20', 100),
  (2, 'AI Workshop', 'Seminar Hall B', '2026-12-05', 40),
  (3, 'Tech Quiz', 'Room 204', '2026-12-12', 2);
