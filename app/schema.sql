-- منصة التدريب التعاوني وشؤون الخريجين — مخطط قاعدة البيانات (MySQL 5.7+ / MariaDB 10.3+)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role ENUM('admin','supervisor','trainee') NOT NULL,
  username VARCHAR(32) NOT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NULL,
  email VARCHAR(150) NULL,
  password_hash VARCHAR(255) NULL,
  activation_code VARCHAR(16) NULL,
  must_change TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_user (role, username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trainees (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  acad VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  nid VARCHAR(20) NULL,
  phone VARCHAR(20) NULL,
  dept VARCHAR(100) NULL,
  specialty VARCHAR(100) NULL,
  gpa VARCHAR(10) NULL,
  entity VARCHAR(200) NULL,
  sector VARCHAR(40) NULL,
  field_supervisor VARCHAR(150) NULL,
  field_supervisor_phone VARCHAR(20) NULL,
  supervisor_id INT UNSIGNED NULL,
  reg_status VARCHAR(30) NULL,
  start_status VARCHAR(30) NULL,
  letter_no VARCHAR(50) NULL,
  notes TEXT NULL,
  user_id INT UNSIGNED NULL,
  eval_token CHAR(32) NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY k_sup (supervisor_id),
  KEY k_entity (entity),
  CONSTRAINT fk_tr_sup FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trainee_id INT UNSIGNED NOT NULL,
  visit_date DATE NOT NULL,
  type VARCHAR(40) NOT NULL,
  attendance VARCHAR(30) NULL,
  rating VARCHAR(20) NULL,
  met_field TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  report_file VARCHAR(80) NULL,
  report_name VARCHAR(200) NULL,
  report_url VARCHAR(500) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY k_tr (trainee_id),
  CONSTRAINT fk_v_tr FOREIGN KEY (trainee_id) REFERENCES trainees(id) ON DELETE CASCADE,
  CONSTRAINT fk_v_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trainee_id INT UNSIGNED NOT NULL,
  week TINYINT UNSIGNED NOT NULL,
  tasks TEXT NOT NULL,
  skills TEXT NULL,
  challenges TEXT NULL,
  hours DECIMAL(5,1) NULL,
  file VARCHAR(80) NULL,
  file_name VARCHAR(200) NULL,
  status ENUM('submitted','reviewed','returned') NOT NULL DEFAULT 'submitted',
  sup_comment TEXT NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tr_week (trainee_id, week),
  CONSTRAINT fk_w_tr FOREIGN KEY (trainee_id) REFERENCES trainees(id) ON DELETE CASCADE,
  CONSTRAINT fk_w_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS field_evals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trainee_id INT UNSIGNED NOT NULL,
  evaluator_name VARCHAR(150) NOT NULL,
  evaluator_title VARCHAR(150) NULL,
  evaluator_phone VARCHAR(20) NULL,
  scores TEXT NOT NULL,
  total DECIMAL(5,1) NOT NULL,
  recommend VARCHAR(40) NULL,
  comments TEXT NULL,
  ip VARCHAR(45) NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY k_tr (trainee_id),
  CONSTRAINT fk_e_tr FOREIGN KEY (trainee_id) REFERENCES trainees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS graduates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  acad VARCHAR(20) NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NULL,
  email VARCHAR(150) NULL,
  dept VARCHAR(100) NULL,
  specialty VARCHAR(100) NULL,
  gpa VARCHAR(10) NULL,
  grad_term VARCHAR(40) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'غير معروف',
  employer VARCHAR(200) NULL,
  job_title VARCHAR(150) NULL,
  sector VARCHAR(40) NULL,
  employed_on DATE NULL,
  last_contact DATE NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY k_acad (acad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  body TEXT NULL,
  audience ENUM('all','trainees','supervisors') NOT NULL DEFAULT 'trainees',
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  user_name VARCHAR(150) NULL,
  action VARCHAR(40) NOT NULL,
  target VARCHAR(40) NULL,
  target_id VARCHAR(40) NULL,
  details VARCHAR(500) NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY k_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  success TINYINT(1) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY k_u (username, created_at),
  KEY k_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
