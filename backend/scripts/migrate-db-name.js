/**
 * One-shot migration: move all tables from the OLD database (furnix_db by
 * default) into a NEW database (vesta_db by default).
 *
 * Usage:
 *   node scripts/migrate-db-name.js
 *
 * Environment overrides (optional):
 *   OLD_DB_NAME=furnix_db
 *   NEW_DB_NAME=vesta_db
 *   DROP_OLD=1     # if set, drops the old database after the move
 *
 * Idempotent: if the new DB already has all the tables, it just reports
 * "nothing to do" and exits 0. Safe to run multiple times.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const OLD_DB = process.env.OLD_DB_NAME || 'furnix_db';
const NEW_DB = process.env.NEW_DB_NAME || 'vesta_db';
const DROP_OLD = String(process.env.DROP_OLD || '').trim() === '1';

async function run() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    port:     Number(process.env.DB_PORT || 3306),
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    console.log(`\n==  DB rename: ${OLD_DB}  ->  ${NEW_DB}  ==\n`);

    // 1) Does the old DB exist?
    const [oldRow] = await conn.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [OLD_DB],
    );
    const oldExists = oldRow.length > 0;

    const [newRow] = await conn.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [NEW_DB],
    );
    const newExists = newRow.length > 0;

    if (!oldExists && newExists) {
      console.log(`[ok] ${NEW_DB} already exists and ${OLD_DB} is gone. Nothing to do.`);
      return;
    }
    if (!oldExists && !newExists) {
      console.log(`[info] Neither ${OLD_DB} nor ${NEW_DB} exists — creating empty ${NEW_DB}.`);
      await conn.query(
        `CREATE DATABASE \`${NEW_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      console.log('[ok] Done. Run "npm run init-db" next to create schema + seed.');
      return;
    }

    // 2) Ensure new DB exists
    if (!newExists) {
      console.log(`[info] Creating database \`${NEW_DB}\`...`);
      await conn.query(
        `CREATE DATABASE \`${NEW_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    } else {
      console.log(`[info] Database \`${NEW_DB}\` already exists.`);
    }

    // 3) List tables in the old DB
    const [tables] = await conn.query(
      `SELECT TABLE_NAME, TABLE_TYPE
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME`,
      [OLD_DB],
    );

    const baseTables = tables.filter(t => t.TABLE_TYPE === 'BASE TABLE');
    const views      = tables.filter(t => t.TABLE_TYPE === 'VIEW');

    if (baseTables.length === 0) {
      console.log(`[info] \`${OLD_DB}\` has no tables — nothing to move.`);
    } else {
      console.log(`[info] Moving ${baseTables.length} table(s)...`);
      // RENAME TABLE across databases = atomic move on the same MySQL server.
      // Temporarily relax FK checks so we don't fight ordering issues.
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const { TABLE_NAME } of baseTables) {
        // If a table with the same name already lives in the new DB, skip it.
        const [exists] = await conn.query(
          `SELECT 1 FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
          [NEW_DB, TABLE_NAME],
        );
        if (exists.length) {
          console.log(`   skip  ${TABLE_NAME} (already present in ${NEW_DB})`);
          continue;
        }
        console.log(`   move  ${TABLE_NAME}`);
        await conn.query(
          `RENAME TABLE \`${OLD_DB}\`.\`${TABLE_NAME}\` TO \`${NEW_DB}\`.\`${TABLE_NAME}\``,
        );
      }
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    // 4) Re-create views in the new DB (views can't be RENAMEd across DBs)
    if (views.length > 0) {
      console.log(`[info] Re-creating ${views.length} view(s)...`);
      for (const { TABLE_NAME } of views) {
        const [[row]] = await conn.query(`SHOW CREATE VIEW \`${OLD_DB}\`.\`${TABLE_NAME}\``);
        const createStmt = row['Create View'].replace(
          new RegExp(`\`${OLD_DB}\`\\.`, 'g'),
          `\`${NEW_DB}\`.`,
        );
        await conn.query(`USE \`${NEW_DB}\``);
        await conn.query(createStmt);
        console.log(`   view  ${TABLE_NAME}`);
      }
    }

    // 5) Optionally drop the old DB
    if (DROP_OLD) {
      console.log(`[info] Dropping old database \`${OLD_DB}\`...`);
      await conn.query(`DROP DATABASE \`${OLD_DB}\``);
      console.log(`[ok] \`${OLD_DB}\` dropped.`);
    } else {
      console.log(
        `[info] Old database \`${OLD_DB}\` kept (empty). Run with DROP_OLD=1 to delete it.`,
      );
    }

    // 6) Sanity check
    const [counts] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [NEW_DB],
    );
    console.log(`\n[ok] \`${NEW_DB}\` now has ${counts.length} table(s):`);
    counts.forEach(r => console.log(`       - ${r.TABLE_NAME}`));
    console.log('\n[done] DB rename complete.\n');
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('\n[migrate-db-name] FAILED:', err.message);
  process.exit(1);
});
