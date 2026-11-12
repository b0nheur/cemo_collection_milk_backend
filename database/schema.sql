CREATE DATABASE IF NOT EXISTS cemo_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cemo_database;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('administrator','manager','milk_collector','accountant') NOT NULL DEFAULT 'milk_collector',
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_code VARCHAR(24) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  location VARCHAR(160) NOT NULL,
  type ENUM('Farmer','Abadongi') NOT NULL,
  registered_on DATE NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_suppliers_code (supplier_code),
  KEY idx_suppliers_name (full_name),
  KEY idx_suppliers_phone (phone),
  KEY idx_suppliers_status_type (status, type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS buyers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  buyer_name VARCHAR(120) NOT NULL,
  company_name VARCHAR(160) NULL,
  phone VARCHAR(32) NULL,
  address VARCHAR(200) NULL,
  type ENUM('Company','Market','Individual') NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_buyers_name (buyer_name),
  KEY idx_buyers_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS milk_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id BIGINT UNSIGNED NOT NULL,
  delivery_date DATE NOT NULL,
  quantity_litres DECIMAL(12,2) NOT NULL,
  grade ENUM('Grade 1','Grade 2') NOT NULL,
  price_per_litre DECIMAL(12,2) NOT NULL,
  total_payment DECIMAL(14,2) NOT NULL,
  recorded_by VARCHAR(120) NOT NULL,
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_deliveries_date_grade (delivery_date, grade),
  KEY idx_deliveries_supplier_date (supplier_id, delivery_date),
  CONSTRAINT fk_deliveries_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_deliveries_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_delivery_quantity CHECK (quantity_litres > 0),
  CONSTRAINT chk_delivery_price CHECK (price_per_litre >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS milk_quality_tests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  delivery_id BIGINT UNSIGNED NOT NULL,
  fat DECIMAL(6,2) NULL,
  density DECIMAL(7,3) NULL,
  temperature DECIMAL(6,2) NULL,
  notes VARCHAR(500) NULL,
  tested_by BIGINT UNSIGNED NULL,
  tested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quality_delivery (delivery_id),
  CONSTRAINT fk_quality_delivery FOREIGN KEY (delivery_id) REFERENCES milk_deliveries(id) ON DELETE CASCADE,
  CONSTRAINT fk_quality_user FOREIGN KEY (tested_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS milk_sales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  buyer_id BIGINT UNSIGNED NOT NULL,
  sale_date DATE NOT NULL,
  grade ENUM('Grade 1','Grade 2') NOT NULL,
  quantity_litres DECIMAL(12,2) NOT NULL,
  price_per_litre DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  recorded_by VARCHAR(120) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sales_date_grade (sale_date, grade),
  KEY idx_sales_buyer_date (buyer_id, sale_date),
  CONSTRAINT fk_sales_buyer FOREIGN KEY (buyer_id) REFERENCES buyers(id),
  CONSTRAINT fk_sales_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_sale_quantity CHECK (quantity_litres > 0),
  CONSTRAINT chk_sale_price CHECK (price_per_litre >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_date DATE NOT NULL,
  method ENUM('Mobile Money','Bank transfer','Cash') NOT NULL,
  reference VARCHAR(100) NULL,
  notes VARCHAR(500) NULL,
  recorded_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_supplier_date (supplier_id, payment_date),
  CONSTRAINT fk_payments_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_payments_user FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category ENUM('Transport','Employee salaries','Electricity','Maintenance','Other') NOT NULL,
  description VARCHAR(240) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  expense_date DATE NOT NULL,
  recorded_by VARCHAR(120) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_expenses_date_category (expense_date, category),
  CONSTRAINT fk_expenses_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_expense_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movement_type ENUM('delivery','sale','rejected','adjustment') NOT NULL,
  grade ENUM('Grade 1','Grade 2') NOT NULL,
  quantity_litres DECIMAL(12,2) NOT NULL,
  delivery_id BIGINT UNSIGNED NULL,
  sale_id BIGINT UNSIGNED NULL,
  reference VARCHAR(120) NULL,
  recorded_by VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_delivery (delivery_id),
  UNIQUE KEY uq_stock_sale (sale_id),
  KEY idx_stock_type_grade_date (movement_type, grade, created_at),
  CONSTRAINT fk_stock_delivery FOREIGN KEY (delivery_id) REFERENCES milk_deliveries(id) ON DELETE SET NULL,
  CONSTRAINT fk_stock_sale FOREIGN KEY (sale_id) REFERENCES milk_sales(id) ON DELETE SET NULL,
  CONSTRAINT chk_stock_quantity CHECK (quantity_litres > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_control (
  id TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_stock_control_singleton CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO stock_control (id) VALUES (1);
