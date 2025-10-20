-- === TimeWeave schema (CTE-free, MySQL-compatible) ===
CREATE DATABASE IF NOT EXISTS timeweave CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE timeweave;

-- Tables
CREATE TABLE IF NOT EXISTS tenants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) UNIQUE,
  name VARCHAR(128),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, code VARCHAR(16), section VARCHAR(8), size INT,
  UNIQUE KEY uniq_class (tenant_id, code, section)
);

CREATE TABLE IF NOT EXISTS subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, code VARCHAR(16), name VARCHAR(64), is_lab TINYINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, name VARCHAR(64), max_periods_per_day INT DEFAULT 5, max_periods_per_week INT DEFAULT 28
);

CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, code VARCHAR(16), capacity INT, is_lab TINYINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, teacher_id INT, subject_id INT,
  UNIQUE KEY uniq_ts (tenant_id, teacher_id, subject_id)
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, class_id INT, subject_id INT
);

CREATE TABLE IF NOT EXISTS availability_teacher (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, teacher_id INT, day TINYINT, period TINYINT, available TINYINT
);

CREATE TABLE IF NOT EXISTS availability_room (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, room_id INT, day TINYINT, period TINYINT, available TINYINT
);

CREATE TABLE IF NOT EXISTS demand_forecast (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, week_start DATE, class_id INT, subject_id INT, periods_required INT,
  source ENUM('ml','manual') DEFAULT 'ml',
  UNIQUE KEY uniq_dem (tenant_id, week_start, class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS hard_locks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, week_start DATE, class_id INT, subject_id INT, teacher_id INT, room_id INT,
  day TINYINT, period TINYINT
);

CREATE TABLE IF NOT EXISTS timetable (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT, solution_id VARCHAR(36), week_start DATE,
  class_id INT, subject_id INT, teacher_id INT, room_id INT,
  day TINYINT, period TINYINT, hard_lock TINYINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS penalties (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT,
  teacher_gap INT DEFAULT 3,
  uneven_subject INT DEFAULT 2,
  room_mismatch INT DEFAULT 4,
  early_or_late INT DEFAULT 1
);

-- Seeds
INSERT IGNORE INTO tenants (id, slug, name) VALUES (1,'demo','Demo School');

INSERT IGNORE INTO classes (id,tenant_id,code,section,size) VALUES
 (1,1,'8','A',35),
 (2,1,'8','B',34);

INSERT IGNORE INTO subjects (id,tenant_id,code,name,is_lab) VALUES
 (1,1,'MATH','Mathematics',0),
 (2,1,'SCI','Science',1),
 (3,1,'ENG','English',0);

INSERT IGNORE INTO teachers (id,tenant_id,name) VALUES
 (1,1,'Ms. Priya'),
 (2,1,'Mr. Raj'),
 (3,1,'Ms. Anu');

INSERT IGNORE INTO rooms (id,tenant_id,code,capacity,is_lab) VALUES
 (1,1,'R101',40,0),
 (2,1,'R201',40,0),
 (3,1,'LAB1',30,1);

INSERT IGNORE INTO teacher_subjects (tenant_id,teacher_id,subject_id) VALUES
 (1,1,1), (1,2,2), (1,3,3);

INSERT IGNORE INTO class_subjects (tenant_id,class_id,subject_id) VALUES
 (1,1,1),(1,1,2),(1,1,3),
 (1,2,1),(1,2,2),(1,2,3);

-- Availability 5 days x 8 periods (CTE-free)

-- TEACHERS
INSERT IGNORE INTO availability_teacher(tenant_id, teacher_id, day, period, available)
SELECT 1, t.id, d.day, p.period, 1
FROM teachers t
CROSS JOIN (
  SELECT 0 AS day UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
) d
CROSS JOIN (
  SELECT 0 AS period UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
) p
WHERE t.tenant_id = 1;

-- ROOMS
INSERT IGNORE INTO availability_room(tenant_id, room_id, day, period, available)
SELECT 1, r.id, d.day, p.period, 1
FROM rooms r
CROSS JOIN (
  SELECT 0 AS day UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
) d
CROSS JOIN (
  SELECT 0 AS period UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
) p
WHERE r.tenant_id = 1;

-- Demand for the seeded week (Mon Oct 20, 2025)
INSERT IGNORE INTO demand_forecast(tenant_id,week_start,class_id,subject_id,periods_required,source) VALUES
 (1,'2025-10-20',1,1,6,'manual'),
 (1,'2025-10-20',1,2,5,'manual'),
 (1,'2025-10-20',1,3,5,'manual'),
 (1,'2025-10-20',2,1,6,'manual'),
 (1,'2025-10-20',2,2,5,'manual'),
 (1,'2025-10-20',2,3,5,'manual');
