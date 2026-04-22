/**
 * Idempotent migration: add granular address columns to the `orders` table.
 * Safe to run multiple times — each column is added only if it doesn't exist.
 *
 *   node scripts/migrate-address.js
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
  const db = process.env.DB_NAME || 'furnix_db';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: db,
  });

  console.log(`[migrate-address] Target: ${db}.orders`);

  const cols = [
    ['customer_alt_phone',   `\`customer_alt_phone\` VARCHAR(25) DEFAULT NULL AFTER \`customer_phone\``],
    ['shipping_flat',        `\`shipping_flat\` VARCHAR(120) DEFAULT NULL AFTER \`shipping_address\``],
    ['shipping_building',    `\`shipping_building\` VARCHAR(200) DEFAULT NULL AFTER \`shipping_flat\``],
    ['shipping_street',      `\`shipping_street\` VARCHAR(200) DEFAULT NULL AFTER \`shipping_building\``],
    ['shipping_landmark',    `\`shipping_landmark\` VARCHAR(200) DEFAULT NULL AFTER \`shipping_street\``],
    ['shipping_locality',    `\`shipping_locality\` VARCHAR(150) DEFAULT NULL AFTER \`shipping_landmark\``],
    ['shipping_address_type',`\`shipping_address_type\` ENUM('home','office','other') DEFAULT 'home' AFTER \`shipping_locality\``],
    ['shipping_latitude',    `\`shipping_latitude\` DECIMAL(10,7) DEFAULT NULL AFTER \`shipping_pincode\``],
    ['shipping_longitude',   `\`shipping_longitude\` DECIMAL(10,7) DEFAULT NULL AFTER \`shipping_latitude\``],
    ['shipping_geo_accuracy',`\`shipping_geo_accuracy\` INT DEFAULT NULL AFTER \`shipping_longitude\``],
  ];

  for (const [name, ddl] of cols) {
    await addIfMissing(conn, db, 'orders', name, ddl);
  }

  console.log('[migrate-address] Done.');
  await conn.end();
}

run().catch((err) => {
  console.error('[migrate-address] FAILED:', err.message);
  process.exit(1);
});
