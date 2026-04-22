/**
 * One-off image refresh for the 24 newly added pieces (FX-BED-004..007,
 * FX-SOF-004..007, FX-TAB-004..008, FX-CHR-003..007, FX-STG-003..008).
 *
 * The initial import accidentally reused a handful of images across multiple
 * products — this script replaces each SKU's image_url and gallery with a
 * distinct, category-appropriate photo. It is non-destructive and idempotent;
 * running it again just re-sets the same values.
 *
 * Usage:
 *   node scripts/refresh-product-images.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// Each entry maps an existing SKU to its new image base (Unsplash photo id).
// We render the card image at 900w and the first gallery image at 1200w.
const IMAGE_UPDATES = [
  // ---------- Beds ----------
  { sku: 'FX-BED-004', photo: 'photo-1617325247661-675ab4b64ae2' }, // Raja four-poster
  { sku: 'FX-BED-005', photo: 'photo-1558882224-dda166733046' },   // Linden sleigh
  { sku: 'FX-BED-006', photo: 'photo-1560448204-e02f11c3d0e2' },   // Solara platform
  { sku: 'FX-BED-007', photo: 'photo-1631679706909-1844bbd07221' }, // Aurora low profile

  // ---------- Sofas ----------
  { sku: 'FX-SOF-004', photo: 'photo-1550254478-ead40cc54513' }, // Windsor chesterfield
  { sku: 'FX-SOF-005', photo: 'photo-1506898667547-42e22a46e125' }, // Hamilton mid-century
  { sku: 'FX-SOF-006', photo: 'photo-1580229080435-1c7e2b7b0772' }, // Transit sofa-bed
  { sku: 'FX-SOF-007', photo: 'photo-1598300042247-d088f8ab3a91' }, // Meridian modular

  // ---------- Tables ----------
  { sku: 'FX-TAB-004', photo: 'photo-1615529182904-14819c35db37' }, // Navaratna square dining
  { sku: 'FX-TAB-005', photo: 'photo-1583845112203-29329902332e' }, // Solis round pedestal
  { sku: 'FX-TAB-006', photo: 'photo-1586208958839-06c17cacdf08' }, // Stacked nesting
  { sku: 'FX-TAB-007', photo: 'photo-1542372147193-a7aca54189cd' }, // Regent executive desk
  { sku: 'FX-TAB-008', photo: 'photo-1533090481720-856c6e3c1fdc' }, // Relic console

  // ---------- Chairs ----------
  { sku: 'FX-CHR-003', photo: 'photo-1592078615290-033ee584e267' }, // Veda rocking
  { sku: 'FX-CHR-004', photo: 'photo-1580480055273-228ff5388ef8' }, // Ergo office chair
  { sku: 'FX-CHR-005', photo: 'photo-1551298370-9d3d53740c72' },   // Cottage Windsor
  { sku: 'FX-CHR-006', photo: 'photo-1611464908623-07f19927264e' }, // Bistro bar stool
  { sku: 'FX-CHR-007', photo: 'photo-1578500494198-246f612d3b3d' }, // Loka armchair

  // ---------- Storage ----------
  { sku: 'FX-STG-003', photo: 'photo-1558211583-d26f610c1eb1' }, // Pauda shoe rack
  { sku: 'FX-STG-004', photo: 'photo-1615529328331-f8917597711f' }, // Orion shoe cabinet
  { sku: 'FX-STG-005', photo: 'photo-1616137422495-1e9e46e2aa77' }, // Havelock chest
  { sku: 'FX-STG-006', photo: 'photo-1593845984085-3412f0aec86a' }, // Cielo TV unit
  { sku: 'FX-STG-007', photo: 'photo-1572981779307-38e8c59dc22c' }, // Bayana credenza
  { sku: 'FX-STG-008', photo: 'photo-1589834390005-5d4fb9bf3d32' }, // Kairo linen chest
];

function cardUrl(id) {
  return `https://images.unsplash.com/${id}?w=900&q=80`;
}
function galleryUrl(id) {
  return `https://images.unsplash.com/${id}?w=1200&q=80`;
}

async function run() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'vesta_db';

  console.log(`[refresh-images] Connecting to ${user}@${host}:${port}/${database} ...`);
  const conn = await mysql.createConnection({ host, port, user, password, database });

  const sql = `
    UPDATE products
       SET image_url = ?,
           gallery   = CAST(? AS JSON)
     WHERE sku = ?
  `;

  let updated = 0;
  let missing = 0;
  for (const { sku, photo } of IMAGE_UPDATES) {
    const [res] = await conn.execute(sql, [
      cardUrl(photo),
      JSON.stringify([galleryUrl(photo)]),
      sku,
    ]);
    if (res.affectedRows > 0) {
      updated++;
      console.log(`  ↻ ${sku}  →  ${photo}`);
    } else {
      missing++;
      console.log(`  ? ${sku}  (sku not found — skipped)`);
    }
  }

  console.log('');
  console.log(`[refresh-images] Updated: ${updated}   Not found: ${missing}`);

  const [imgs] = await conn.query(
    'SELECT COUNT(DISTINCT image_url) AS unique_images, COUNT(*) AS total FROM products'
  );
  console.log(
    `[refresh-images] Catalogue now has ${imgs[0].unique_images} unique images across ${imgs[0].total} products.`
  );

  await conn.end();
}

run().catch((err) => {
  console.error('[refresh-images] FAILED:', err.message);
  process.exit(1);
});
