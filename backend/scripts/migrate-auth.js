/**
 * Idempotent migration: add the `users` table (Google Sign-In) and the
 * `orders.user_id` column that stamps each order with its buyer.
 *
 * Safe to run multiple times.
 *
 *   node scripts/migrate-auth.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function tableExists(conn, db, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [db, table],
  );
  return rows.length > 0;
}

async function columnExists(conn, db, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [db, table, column],
  );
  return rows.length > 0;
}

async function indexExists(conn, db, table, indexName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
      LIMIT 1`,
    [db, table, indexName],
  );
  return rows.length > 0;
}

(async () => {
  const db = process.env.DB_NAME || 'vesta_db';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: db,
    multipleStatements: true,
  });

  console.log(`\n[migrate-auth] target database: ${db}`);

  // 1. users table --------------------------------------------------------
  if (await tableExists(conn, db, 'users')) {
    console.log('  · users table: already exists');
  } else {
    await conn.query(`
      CREATE TABLE users (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        google_sub      VARCHAR(64) NOT NULL,
        email           VARCHAR(255) NOT NULL,
        email_verified  TINYINT(1) NOT NULL DEFAULT 0,
        name            VARCHAR(255) DEFAULT NULL,
        picture_url     VARCHAR(500) DEFAULT NULL,
        role            ENUM('customer','admin') NOT NULL DEFAULT 'customer',
        last_login_at   DATETIME DEFAULT NULL,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_users_google_sub (google_sub),
        UNIQUE KEY uk_users_email      (email),
        INDEX idx_users_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  + users table: created');
  }

  // 2. orders.user_id -----------------------------------------------------
  if (await columnExists(conn, db, 'orders', 'user_id')) {
    console.log('  · orders.user_id: already exists');
  } else {
    await conn.query(`
      ALTER TABLE orders
        ADD COLUMN user_id INT DEFAULT NULL AFTER customer_alt_phone
    `);
    console.log('  + orders.user_id: added');
  }

  if (await indexExists(conn, db, 'orders', 'idx_orders_user')) {
    console.log('  · orders.idx_orders_user: already exists');
  } else {
    await conn.query('ALTER TABLE orders ADD INDEX idx_orders_user (user_id)');
    console.log('  + orders.idx_orders_user: added');
  }

  // NOTE: we intentionally do NOT add a hard FK constraint, because
  // (a) older orders pre-date the users table, (b) we want to keep the
  // historical customer_name/email/phone snapshot even if the user row is
  // later deleted.  The app enforces the join logically.

  console.log('\n[migrate-auth] done.\n');
  await conn.end();
})().catch((err) => {
  console.error('[migrate-auth] failed:', err.message);
  process.exit(1);
});
