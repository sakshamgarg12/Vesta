-- =====================================================
-- FurniX - Premium Wooden Furniture Store
-- MySQL Schema
-- =====================================================

CREATE DATABASE IF NOT EXISTS furnix_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE furnix_db;

-- ---------- Products ----------
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customer_queries;
DROP TABLE IF EXISTS products;

CREATE TABLE products (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  sku             VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(200) NOT NULL,
  slug            VARCHAR(220) UNIQUE NOT NULL,
  category        ENUM('beds', 'sofas', 'tables', 'chairs', 'storage') NOT NULL,
  wood_type       ENUM('Teak', 'Sheesham', 'Mango', 'Oak', 'Walnut') NOT NULL,
  finish          VARCHAR(100) DEFAULT 'Natural Matte',
  price           DECIMAL(10, 2) NOT NULL,
  mrp             DECIMAL(10, 2) DEFAULT NULL,
  short_desc      VARCHAR(500),
  long_desc       TEXT,
  dimensions      VARCHAR(150) COMMENT 'e.g. 78 x 60 x 36 inches (L x W x H)',
  weight_kg       DECIMAL(6, 2),
  image_url       VARCHAR(500) NOT NULL,
  gallery         JSON COMMENT 'Array of additional image URLs',
  stock           INT NOT NULL DEFAULT 10,
  is_featured     TINYINT(1) DEFAULT 0,
  is_active       TINYINT(1) DEFAULT 1,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_wood_type (wood_type),
  INDEX idx_active (is_active)
) ENGINE=InnoDB;

-- ---------- Orders ----------
CREATE TABLE orders (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  order_number         VARCHAR(30) UNIQUE NOT NULL,
  customer_name        VARCHAR(150) NOT NULL,
  customer_email       VARCHAR(150) NOT NULL,
  customer_phone       VARCHAR(25) NOT NULL,
  customer_alt_phone   VARCHAR(25) DEFAULT NULL,
  shipping_address     VARCHAR(500) NOT NULL,
  shipping_flat        VARCHAR(120) DEFAULT NULL,
  shipping_building    VARCHAR(200) DEFAULT NULL,
  shipping_street      VARCHAR(200) DEFAULT NULL,
  shipping_landmark    VARCHAR(200) DEFAULT NULL,
  shipping_locality    VARCHAR(150) DEFAULT NULL,
  shipping_address_type ENUM('home','office','other') DEFAULT 'home',
  shipping_city        VARCHAR(100) NOT NULL,
  shipping_state       VARCHAR(100) NOT NULL,
  shipping_pincode     VARCHAR(10) NOT NULL,
  shipping_latitude    DECIMAL(10, 7) DEFAULT NULL,
  shipping_longitude   DECIMAL(10, 7) DEFAULT NULL,
  shipping_geo_accuracy INT DEFAULT NULL,
  delivery_date        DATE NOT NULL,
  delivery_slot        VARCHAR(50) DEFAULT 'Any time',
  payment_method       ENUM('cod', 'upi', 'card', 'netbanking') NOT NULL,
  payment_status       ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  payment_details      TEXT DEFAULT NULL COMMENT 'Sanitized payment payload (JSON): card last-4, UPI handle, bank name, etc. NEVER stores full PAN or CVV.',
  subtotal             DECIMAL(10, 2) NOT NULL,
  discount_code        VARCHAR(50) DEFAULT NULL,
  discount_amount      DECIMAL(10, 2) DEFAULT 0,
  shipping_fee         DECIMAL(10, 2) DEFAULT 0,
  gst_amount           DECIMAL(10, 2) DEFAULT 0,
  total                DECIMAL(10, 2) NOT NULL,
  order_status         ENUM('placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled') DEFAULT 'placed',
  confirmed_at         DATETIME DEFAULT NULL,
  packed_at            DATETIME DEFAULT NULL,
  shipped_at           DATETIME DEFAULT NULL,
  out_for_delivery_at  DATETIME DEFAULT NULL,
  delivered_at         DATETIME DEFAULT NULL,
  tracking_number      VARCHAR(80) DEFAULT NULL,
  courier_name         VARCHAR(80) DEFAULT NULL,
  notes                TEXT,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (customer_email),
  INDEX idx_status (order_status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ---------- Order Items ----------
CREATE TABLE order_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT NOT NULL,
  product_id    INT NOT NULL,
  product_name  VARCHAR(200) NOT NULL,
  wood_type     VARCHAR(50),
  unit_price    DECIMAL(10, 2) NOT NULL,
  quantity      INT NOT NULL,
  line_total    DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  INDEX idx_order (order_id)
) ENGINE=InnoDB;

-- ---------- Customer Queries (Contact form) ----------
CREATE TABLE customer_queries (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  email       VARCHAR(150) NOT NULL,
  phone       VARCHAR(25),
  subject     VARCHAR(200),
  message     TEXT NOT NULL,
  status      ENUM('new', 'in_progress', 'resolved') DEFAULT 'new',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status)
) ENGINE=InnoDB;
