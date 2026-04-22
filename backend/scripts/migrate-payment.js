/**
 * Idempotent migration: add the `payment_details` column to the `orders` table.
 * Stores the sanitized payment detail payload as a JSON string (card last-4,
 * UPI handle, bank name, etc.). NEVER contains full PAN / CVV.
 *
 * Safe to run multiple times.
 *
 *   node scripts/migrate-payment.js
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

async function run() {
  const db = process.env.DB_NAME || 'vesta_db';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: db,
  });

  console.log(`[migrate-payment] Target: ${db}.orders`);

  if (await columnExists(conn, db, 'orders', 'payment_details')) {
    console.log('  · payment_details: already exists');
  } else {
    await conn.query(
      `ALTER TABLE \`orders\`
         ADD COLUMN \`payment_details\` TEXT DEFAULT NULL
         AFTER \`payment_status\``,
    );
    console.log('  + payment_details: added');
  }

  console.log('[migrate-payment] Done.');
  await conn.end();
}

run().catch((err) => {
  console.error('[migrate-payment] FAILED:', err.message);
  process.exit(1);
});
