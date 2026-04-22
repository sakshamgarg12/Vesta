/**
 * FurniX — Premium Wooden Furniture Store
 * Express server (static frontend + REST API)
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config();

const { testConnection } = require('./db');
const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const queriesRouter = require('./routes/queries');
const seoRouter = require('./routes/seo');
const { seoInjector } = require('./middleware/seoInject');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// ------------------ Security & parsing ------------------
app.use(helmet({
  contentSecurityPolicy: false, // we load Bootstrap + Unsplash images from CDNs
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const corsOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigins.includes('*') ? true : corsOrigins }));

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Behind a reverse proxy (Nginx / Cloudflare / Render), trust X-Forwarded-* headers.
app.set('trust proxy', 1);
// Ensure search engines receive the right canonical casing.
app.disable('x-powered-by');

// Lightweight rate limit on write endpoints to prevent abuse.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly.' },
});

// ------------------ Health ------------------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'FurniX API',
    time: new Date().toISOString(),
    store: {
      name: process.env.STORE_NAME || 'FurniX',
      email: process.env.STORE_EMAIL || 'contactFurniX@gmail.com',
      phone: process.env.STORE_PHONE || '+91-7583777875',
    },
  });
});

// ------------------ API ------------------
app.use('/api/products', productsRouter);
app.use('/api', writeLimiter, ordersRouter); // /api/checkout + /api/coupons/validate + /api/orders/:n
app.use('/api/queries', writeLimiter, queriesRouter);

// ------------------ SEO ------------------
// Must come BEFORE express.static so /sitemap.xml and /robots.txt are dynamic.
app.use('/', seoRouter);
// Intercept HTML requests and rewrite <!-- FX_SEO --> token with rich meta + JSON-LD.
app.use(seoInjector());

// ------------------ Frontend (static) ------------------
const frontendDir = path.join(__dirname, '..', 'frontend');
const isProd = process.env.NODE_ENV === 'production';
app.use(express.static(frontendDir, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (!isProd) {
      // In development, never cache — so code changes show up on a normal reload.
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
      return;
    }
    // Production: long-cache static assets, short-cache HTML.
    if (/\.(css|js|svg|png|jpg|jpeg|webp|gif|woff2?|ttf|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    } else if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    }
  },
}));

// SPA-style fallback: any non-API route serves index.html
app.get(/^(?!\/api).*/, (_req, res, next) => {
  res.sendFile(path.join(frontendDir, 'index.html'), (err) => {
    if (err) next();
  });
});

// ------------------ Error handler ------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || 'Something went wrong. Please try again.',
  });
});

// ------------------ Boot ------------------
(async () => {
  const ok = await testConnection();
  if (!ok) {
    console.warn('[WARN] Database is not reachable. API will return 500 until MySQL is available.');
    console.warn('       Run:   npm run init-db   after configuring .env');
  }
  app.listen(PORT, () => {
    console.log('\n====================================================');
    console.log(`  FurniX store running at  http://localhost:${PORT}`);
    console.log(`  API health check:         http://localhost:${PORT}/api/health`);
    console.log('====================================================\n');
  });
})();
