/**
 * Initialise the Vesta database:
 *   1. Creates the schema (tables).
 *   2. Seeds it with the product catalogue.
 *
 * Usage:
 *   node scripts/init-db.js
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'vesta_db';

  console.log(`[init-db] Connecting to ${user}@${host}:${port} ...`);

  // First connect WITHOUT selecting a database to ensure CREATE DATABASE works.
  const bootstrap = await mysql.createConnection({
    host, port, user, password, multipleStatements: true,
  });

  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const seedSql   = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.sql'),   'utf8');

  console.log('[init-db] Running schema.sql ...');
  await bootstrap.query(schemaSql);

  // Switch to the new database
  await bootstrap.query(`USE \`${database}\``);

  console.log('[init-db] Running seed.sql ...');
  await bootstrap.query(seedSql);

  const [rows] = await bootstrap.query('SELECT COUNT(*) AS c FROM products');
  console.log(`[init-db] Done. Products in catalogue: ${rows[0].c}`);

  await bootstrap.end();
}

run().catch((err) => {
  console.error('[init-db] FAILED:', err.message);
  process.exit(1);
});
