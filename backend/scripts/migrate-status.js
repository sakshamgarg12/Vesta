/**
 * Idempotent migration: add per-stage timestamp + tracking columns to `orders`.
 * Powers the customer-facing order-tracking feature.
 *
 * Safe to run multiple times — each column is added only if it doesn't exist.
 *
 *   node scripts/migrate-status.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function columnExists(conn, db, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [db, table, column],
  );
  return rows.length > 0;
}

async function addIfMissing(conn, db, table, column, ddl) {
  if (await columnExists(conn, db, table, column)) {
    console.log(`  · ${column}: already exists`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`  + ${column}: added`);
}

async function run() {
  const db = process.env.DB_NAME || 'vesta_db';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: db,
  });

  console.log(`[migrate-status] Target: ${db}.orders`);

  const cols = [
    ['confirmed_at',        `\`confirmed_at\` DATETIME DEFAULT NULL AFTER \`order_status\``],
    ['packed_at',           `\`packed_at\` DATETIME DEFAULT NULL AFTER \`confirmed_at\``],
    ['shipped_at',          `\`shipped_at\` DATETIME DEFAULT NULL AFTER \`packed_at\``],
    ['out_for_delivery_at', `\`out_for_delivery_at\` DATETIME DEFAULT NULL AFTER \`shipped_at\``],
    ['delivered_at',        `\`delivered_at\` DATETIME DEFAULT NULL AFTER \`out_for_delivery_at\``],
    ['tracking_number',     `\`tracking_number\` VARCHAR(80) DEFAULT NULL AFTER \`delivered_at\``],
    ['courier_name',        `\`courier_name\` VARCHAR(80) DEFAULT NULL AFTER \`tracking_number\``],
  ];

  for (const [name, ddl] of cols) {
    await addIfMissing(conn, db, 'orders', name, ddl);
  }

  // Widen the order_status enum to include the new granular stages.
  const [[row]] = await conn.query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'order_status'`,
    [db],
  );
  const wanted = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
  const current = String(row?.t || '').toLowerCase();
  const hasAll = wanted.every(v => current.includes(`'${v}'`));
  if (!hasAll) {
    await conn.query(
      `ALTER TABLE \`orders\`
         MODIFY COLUMN \`order_status\`
         ENUM('placed','confirmed','packed','shipped','out_for_delivery','delivered','cancelled')
         DEFAULT 'placed'`,
    );
    console.log(`  + order_status: enum widened (placed | confirmed | packed | shipped | out_for_delivery | delivered | cancelled)`);
  } else {
    console.log(`  · order_status: enum already up-to-date`);
  }

  console.log('[migrate-status] Done.');
  await conn.end();
}

run().catch((err) => {
  console.error('[migrate-status] FAILED:', err.message);
  process.exit(1);
});
