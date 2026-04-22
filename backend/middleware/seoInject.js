/**
 * SEO middleware.
 *
 * Intercepts HTML requests BEFORE express.static and rewrites the <head>
 * with page-specific <title>, <meta>, Open Graph, canonical and JSON-LD.
 *
 * Each HTML page contains a token:
 *     <!-- FX_SEO -->
 * which this middleware replaces with the correct SEO block for the route.
 * If we can't match a page (or the token isn't there), we leave the file
 * unchanged, so the static file still works on its own.
 */

const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../db');
const {
  CATEGORY_META,
  getSiteUrl, buildSeoHead,
  orgJsonLd, websiteJsonLd, localBusinessJsonLd,
  breadcrumbJsonLd, productJsonLd, itemListJsonLd,
  escAttr, STORE_NAME,
} = require('../utils/seo');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const TOKEN = '<!-- FX_SEO -->';

/**
 * Map URL path -> physical HTML file to serve.
 */
function resolveFile(reqPath) {
  let p = reqPath.split('?')[0];
  if (p === '/' || p === '') p = '/index.html';
  if (!p.endsWith('.html') && !p.includes('.')) p += '.html';
  const candidate = path.join(FRONTEND_DIR, p);
  return candidate;
}

async function readFileSafe(file) {
  try { return await fs.readFile(file, 'utf8'); }
  catch (_) { return null; }
}

async function buildSeoForRequest(req) {
  const siteUrl = getSiteUrl(req);
  const urlPath = req.path.toLowerCase();
  const q = req.query || {};

  // ---------- Product detail ----------
  if (urlPath === '/product.html' && (q.slug || q.id)) {
    try {
      const isNum = /^\d+$/.test(String(q.slug || q.id));
      const [rows] = await pool.query(
        `SELECT id, sku, name, slug, category, wood_type, finish, price, mrp,
                short_desc, long_desc, dimensions, image_url, stock
         FROM products
         WHERE is_active = 1 AND ${isNum ? 'id = ?' : 'slug = ?'}
         LIMIT 1`,
        [isNum ? parseInt(q.slug || q.id, 10) : String(q.slug || q.id)],
      );
      if (rows.length) {
        const p = rows[0];
        const canonical = `${siteUrl}/product.html?slug=${encodeURIComponent(p.slug)}`;
        const title = `${p.name} — ${p.wood_type} | ${STORE_NAME}`;
        const desc = p.short_desc ||
          `${p.name} — hand-crafted ${p.wood_type} wood. Dimensions ${p.dimensions}. 10-year warranty, free delivery over ₹25,000.`;
        return buildSeoHead({
          title, description: desc, canonical,
          ogImage: p.image_url, ogType: 'product',
          keywords: `${p.wood_type}, ${p.category}, solid wood ${p.category}, ${p.name}, ${STORE_NAME}`,
          jsonLd: [
            orgJsonLd(siteUrl),
            productJsonLd(siteUrl, p),
            breadcrumbJsonLd(siteUrl, [
              { name: 'Home', url: '/' },
              { name: p.category[0].toUpperCase() + p.category.slice(1),
                url: `/products.html?category=${p.category}` },
              { name: p.name, url: `/product.html?slug=${p.slug}` },
            ]),
          ],
        });
      }
    } catch (err) { console.warn('[seoInject] product lookup failed:', err.message); }
  }

  // ---------- Category / product listing ----------
  if (urlPath === '/products.html') {
    const cat = (q.category || '').toLowerCase();
    const wood = q.wood || '';
    let title, desc, h1Url = '/products.html';

    if (CATEGORY_META[cat]) {
      ({ title, desc } = CATEGORY_META[cat]);
      h1Url = `/products.html?category=${cat}`;
    } else if (wood) {
      title = `${wood} Wood Furniture — Beds, Sofas & Tables | ${STORE_NAME}`;
      desc = `Explore our ${wood} wood collection — beds, sofas, tables, chairs and storage hand-crafted from solid ${wood} wood.`;
      h1Url = `/products.html?wood=${wood}`;
    } else {
      title = `Shop the Collection — Solid Wood Furniture | ${STORE_NAME}`;
      desc = `Browse every piece in the ${STORE_NAME} collection — beds, sofas, tables, chairs and storage crafted from solid Teak, Sheesham and Mango wood.`;
    }

    let itemList = null;
    try {
      const [rows] = await pool.query(
        `SELECT id, name, slug FROM products
         WHERE is_active = 1 ${cat ? 'AND category = ?' : ''} ${wood ? 'AND wood_type = ?' : ''}
         ORDER BY is_featured DESC, created_at DESC LIMIT 20`,
        [cat, wood].filter(Boolean),
      );
      if (rows.length) itemList = itemListJsonLd(siteUrl, rows);
    } catch (_) {}

    return buildSeoHead({
      title, description: desc,
      canonical: `${siteUrl}${h1Url}`,
      keywords: `wooden furniture, ${cat || 'beds sofas tables'}, Teak, Sheesham, Mango, ${STORE_NAME}`,
      jsonLd: [
        orgJsonLd(siteUrl),
        websiteJsonLd(siteUrl),
        breadcrumbJsonLd(siteUrl, [
          { name: 'Home', url: '/' },
          { name: CATEGORY_META[cat]?.h1 || 'Shop', url: h1Url },
        ]),
        itemList,
      ].filter(Boolean),
    });
  }

  // ---------- Homepage ----------
  if (urlPath === '/' || urlPath === '/index.html') {
    return buildSeoHead({
      title: `${STORE_NAME} — Premium Hand-crafted Solid Wood Furniture in India`,
      description: `Heirloom wooden furniture hand-crafted from solid Teak, Sheesham and Mango wood. Beds, sofas, tables and storage with 10-year frame warranty. Free shipping over ₹25,000.`,
      canonical: `${siteUrl}/`,
      keywords: 'wooden furniture, solid wood furniture India, teak furniture, sheesham furniture, premium furniture, FurniX',
      jsonLd: [
        orgJsonLd(siteUrl),
        websiteJsonLd(siteUrl),
        localBusinessJsonLd(siteUrl),
      ],
    });
  }

  // ---------- Contact ----------
  if (urlPath === '/contact.html') {
    return buildSeoHead({
      title: `Contact ${STORE_NAME} — Custom Orders & Trade Enquiries`,
      description: `Get in touch with ${STORE_NAME} for custom orders, bulk / trade enquiries, delivery status or warranty questions.`,
      canonical: `${siteUrl}/contact.html`,
      jsonLd: [
        orgJsonLd(siteUrl),
        localBusinessJsonLd(siteUrl),
        breadcrumbJsonLd(siteUrl, [
          { name: 'Home', url: '/' },
          { name: 'Contact', url: '/contact.html' },
        ]),
      ],
    });
  }

  // ---------- Checkout / Success / 404 (noindex) ----------
  if (urlPath === '/checkout.html' || urlPath === '/success.html' || urlPath === '/404.html') {
    return buildSeoHead({
      title: urlPath === '/checkout.html' ? `Checkout — ${STORE_NAME}`
           : urlPath === '/success.html' ? `Order Confirmed — ${STORE_NAME}`
           : `Page not found — ${STORE_NAME}`,
      description: 'Secure checkout.',
      canonical: `${siteUrl}${urlPath}`,
      noindex: true,
    });
  }

  // Default fallback
  return buildSeoHead({ canonical: `${siteUrl}${urlPath}` });
}

/**
 * Express middleware. Only rewrites .html requests; everything else is
 * passed through to express.static.
 */
function seoInjector() {
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    // Only intercept the page routes; assets + /api are handled elsewhere.
    const rawPath = req.path.toLowerCase();
    if (rawPath.startsWith('/api') || rawPath.startsWith('/js/') ||
        rawPath.startsWith('/css/') || rawPath.startsWith('/images/')) return next();
    if (rawPath.includes('.') && !rawPath.endsWith('.html')) return next();

    const file = resolveFile(rawPath);
    const html = await readFileSafe(file);
    if (!html || !html.includes(TOKEN)) {
      // Not an HTML page we manage, or the token isn't there.
      return next();
    }

    try {
      const seoBlock = await buildSeoForRequest(req);
      const injected = html.replace(TOKEN, seoBlock);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('X-FX-SEO', 'injected');
      return res.send(injected);
    } catch (err) {
      console.warn('[seoInject] failed, falling through to static:', err.message);
      return next();
    }
  };
}

module.exports = { seoInjector };
