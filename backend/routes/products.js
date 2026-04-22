const express = require('express');
const { pool } = require('../db');

const router = express.Router();

/**
 * GET /api/products
 *   Optional query params:
 *     - category   (beds | sofas | tables | chairs | storage)
 *     - wood       (Teak | Sheesham | Mango | Oak | Walnut)
 *     - featured   (1 to return only featured)
 *     - search     (free-text search on name / description)
 *     - limit      (default 50)
 */
router.get('/', async (req, res, next) => {
  try {
    const { category, wood, featured, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

    const conditions = ['is_active = 1'];
    const params = [];

    if (category) { conditions.push('category = ?');  params.push(category); }
    if (wood)     { conditions.push('wood_type = ?'); params.push(wood); }
    if (featured) { conditions.push('is_featured = 1'); }
    if (search) {
      conditions.push('(name LIKE ? OR short_desc LIKE ? OR long_desc LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const sql = `
      SELECT id, sku, name, slug, category, wood_type, finish,
             price, mrp, short_desc, dimensions, image_url, stock,
             is_featured
      FROM products
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_featured DESC, created_at DESC
      LIMIT ?
    `;
    params.push(limit);

    const [rows] = await pool.query(sql, params);
    res.json({ count: rows.length, products: rows });
  } catch (err) { next(err); }
});

/**
 * GET /api/products/categories
 *   Returns the list of categories with product counts.
 */
router.get('/categories', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT category, COUNT(*) AS count
      FROM products
      WHERE is_active = 1
      GROUP BY category
      ORDER BY category
    `);
    res.json({ categories: rows });
  } catch (err) { next(err); }
});

/**
 * GET /api/products/:idOrSlug
 *   Fetches a single product either by numeric id or by slug.
 */
router.get('/:idOrSlug', async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;
    const isNumeric = /^\d+$/.test(idOrSlug);

    const [rows] = await pool.query(
      `SELECT * FROM products
       WHERE is_active = 1 AND ${isNumeric ? 'id = ?' : 'slug = ?'}`,
      [isNumeric ? parseInt(idOrSlug, 10) : idOrSlug],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
