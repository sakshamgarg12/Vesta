const express = require('express');
const { pool } = require('../db');
const { getSiteUrl } = require('../utils/seo');

const router = express.Router();

/**
 * /robots.txt — tells crawlers what they can index.
 */
router.get('/robots.txt', (req, res) => {
  const site = getSiteUrl(req);
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /checkout.html
Disallow: /success.html
Disallow: /api/

Sitemap: ${site}/sitemap.xml
`);
});

/**
 * /sitemap.xml — dynamic. Lists the homepage, every category page and
 * every active product, with a last-modified date where possible.
 */
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const site = getSiteUrl(req);
    const today = new Date().toISOString().slice(0, 10);

    const staticUrls = [
      { loc: '/',                     priority: '1.0', changefreq: 'weekly' },
      { loc: '/products.html',        priority: '0.9', changefreq: 'weekly' },
      { loc: '/products.html?category=beds',    priority: '0.8', changefreq: 'weekly' },
      { loc: '/products.html?category=sofas',   priority: '0.8', changefreq: 'weekly' },
      { loc: '/products.html?category=tables',  priority: '0.8', changefreq: 'weekly' },
      { loc: '/products.html?category=chairs',  priority: '0.7', changefreq: 'weekly' },
      { loc: '/products.html?category=storage', priority: '0.7', changefreq: 'weekly' },
      { loc: '/contact.html',         priority: '0.5', changefreq: 'yearly' },
    ];

    let products = [];
    try {
      const [rows] = await pool.query(
        `SELECT slug, image_url, updated_at
         FROM products WHERE is_active = 1 ORDER BY updated_at DESC`,
      );
      products = rows;
    } catch (err) {
      // If DB unavailable, still serve a sitemap with static URLs.
      console.warn('[sitemap] DB lookup failed:', err.message);
    }

    const esc = s => String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;',
    }[c]));

    const urlEntries = [
      ...staticUrls.map(u => `
  <url>
    <loc>${esc(site + u.loc)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`),
      ...products.map(p => {
        const loc = `${site}/product.html?slug=${encodeURIComponent(p.slug)}`;
        const lastmod = (p.updated_at || today).toString().slice(0, 10);
        return `
  <url>
    <loc>${esc(loc)}</loc>
    <lastmod>${esc(lastmod)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    ${p.image_url ? `<image:image><image:loc>${esc(p.image_url)}</image:loc></image:image>` : ''}
  </url>`;
      }),
    ].join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urlEntries}
</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) { next(err); }
});

module.exports = router;
