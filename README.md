# FurniX — Premium Wooden Furniture Store

A full-stack, production-ready e-commerce application for a premium wooden
furniture business. Built with **Node.js + Express + MySQL** on the backend
and **HTML5 + Bootstrap 5 + Vanilla JavaScript** on the frontend.

> Minimalist-Luxury aesthetic · Cream `#F9F7F2` · Charcoal `#333333` · Forest `#2D5A27`

---

## Features

### Storefront
- **Homepage** with a full-bleed hero, category tiles (Beds / Sofas / Tables) and a featured-product grid.
- **Product grid** with live filters by category and wood type, plus free-text search.
- **Product detail page** with image gallery, specs table (wood, finish, dimensions, weight, SKU, stock), quantity selector and Add-to-Cart.
- **Side-drawer cart** that persists in `localStorage`, with per-item quantity controls, remove buttons and a live total.
- **Coupon system**:
  - `WOOD20`    → 20% off the subtotal.
  - `FIRSTBED`  → flat ₹2000 off (min subtotal ₹10,000).
- **Multi-step checkout**: Shipping → Delivery scheduling (date + slot) → Payment selection → Review.
- **Receipt**: Subtotal, Discount, GST (18%), Shipping, Total — printable.
- **Contact form** that writes to `customer_queries`.
- **Success page** with order lookup via `/api/orders/:orderNumber`.

### Backend
- `GET  /api/health` – health check.
- `GET  /api/products` – list with filters (`category`, `wood`, `search`, `featured`, `limit`).
- `GET  /api/products/categories` – category list with counts.
- `GET  /api/products/:idOrSlug` – single product.
- `POST /api/coupons/validate` – validate a coupon against a subtotal.
- `POST /api/checkout` – creates an order + `order_items`, decrements stock (transactional).
- `GET  /api/orders/:orderNumber` – fetch an order + items (for the success page).
- `POST /api/queries` – saves a contact-form submission.

Server hardening: `helmet`, `cors`, `express-rate-limit`, server-side re-pricing (the client total is never trusted).

---

## Project structure

```
WOOD MENIA/
├─ backend/
│  ├─ db/
│  │  ├─ schema.sql        # MySQL schema (products, orders, order_items, customer_queries)
│  │  └─ seed.sql          # Real product catalogue (14 pieces across 5 categories)
│  ├─ routes/
│  │  ├─ products.js
│  │  ├─ orders.js         # checkout + coupon validation + get order
│  │  └─ queries.js        # contact form
│  ├─ scripts/
│  │  └─ init-db.js        # one-shot DB bootstrapper
│  ├─ utils/
│  │  └─ pricing.js        # central GST / shipping / coupon logic
│  ├─ db.js                # MySQL connection pool
│  ├─ server.js            # Express app (also serves the frontend statically)
│  ├─ .env.example
│  └─ package.json
├─ frontend/
│  ├─ index.html           # Homepage
│  ├─ products.html        # Product grid + filters
│  ├─ product.html         # Product detail
│  ├─ checkout.html        # Multi-step checkout
│  ├─ success.html         # Order confirmation + receipt
│  ├─ contact.html         # Contact form
│  ├─ 404.html
│  ├─ css/style.css
│  └─ js/
│     ├─ api.js            # Fetch wrapper (window.FurnixAPI)
│     ├─ cart.js           # Cart + drawer + coupon + toast (window.FurnixCart)
│     ├─ layout.js         # Shared navbar + footer injection
│     ├─ home.js
│     ├─ products.js
│     ├─ product.js
│     ├─ checkout.js
│     └─ success.js
└─ README.md
```

---

## Prerequisites

- **Node.js** 18+ (22 recommended)
- **MySQL** 8+ (or MySQL-compatible such as MariaDB 10.6+)
- A terminal (PowerShell, bash, zsh — all fine)

---

## 1 · Local setup

```bash
# From the repository root
cd backend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env        # on Windows: copy .env.example .env
# then edit .env and set DB_PASSWORD, CORS_ORIGIN etc.

# 3. Create schema + seed the catalogue (creates `furnix_db`)
npm run init-db

# 4. Start the server
npm start
# → http://localhost:5000          (storefront)
# → http://localhost:5000/api/...  (API)
```

The Express server serves the `frontend/` folder as static files, so you
only need **one process**. Open <http://localhost:5000> and the store is
live.

> If you prefer to develop the frontend on its own static host
> (e.g. VS Code Live Server on port 5500), edit `.env` so that
> `CORS_ORIGIN` includes `http://127.0.0.1:5500`, and in each HTML
> page add `<script>window.FURNIX_API_BASE="http://localhost:5000"</script>`
> before `js/api.js`.

---

## 2 · Environment variables (`.env`)

| Key                       | Example                                              | Notes                                                         |
|---------------------------|------------------------------------------------------|---------------------------------------------------------------|
| `PORT`                    | `5000`                                               | HTTP port.                                                    |
| `NODE_ENV`                | `development` / `production`                         |                                                               |
| `CORS_ORIGIN`             | `http://localhost:5000,https://mystore.com`          | Comma-separated list. `*` means any origin (dev only).        |
| `DB_HOST` / `DB_PORT`     | `localhost` / `3306`                                 |                                                               |
| `DB_USER` / `DB_PASSWORD` | `root` / `...`                                       |                                                               |
| `DB_NAME`                 | `furnix_db`                                          | Created automatically by `npm run init-db`.                   |
| `GST_RATE`                | `0.18`                                               | Indian GST for furniture.                                     |
| `SHIPPING_FEE`            | `499`                                                | Flat fee when below threshold.                                |
| `FREE_SHIPPING_THRESHOLD` | `25000`                                              | Subtotal at or above which shipping is free.                  |
| `STORE_NAME` / `STORE_EMAIL` / `STORE_PHONE` | Used in the `/api/health` payload and receipts. |                                          |

---

## 3 · Deployment

### A · Single VPS (Ubuntu + PM2 + Nginx + MySQL)

```bash
# On the server
sudo apt update && sudo apt install -y nodejs npm mysql-server nginx
sudo npm i -g pm2

# Clone & install
git clone <your-repo-url> /opt/furnix && cd /opt/furnix/backend
cp .env.example .env && nano .env    # set real DB credentials & CORS_ORIGIN

# MySQL: create user (optional)
sudo mysql -e "CREATE USER 'furnix'@'localhost' IDENTIFIED BY 'StrongPass!';
               GRANT ALL PRIVILEGES ON furnix_db.* TO 'furnix'@'localhost';"

npm ci
npm run init-db
pm2 start server.js --name furnix
pm2 save && pm2 startup
```

Minimal Nginx config (`/etc/nginx/sites-available/furnix`):

```nginx
server {
  listen 80;
  server_name yourdomain.com;

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable TLS with `sudo certbot --nginx -d yourdomain.com`.

### B · Render / Railway / Fly.io (managed)

1. Create a MySQL service (Railway, PlanetScale, Aiven, etc.). Copy the credentials.
2. Create a **Web Service** pointing at this repo.
   - Root: `backend`
   - Build command: `npm ci`
   - Start command: `node server.js`
   - Environment variables: copy from `.env.example` and fill in production values.
3. One-time from the shell of the service (or locally pointing at the prod DB):
   ```bash
   npm run init-db
   ```
4. Add your production domain to `CORS_ORIGIN`.

### C · Docker (self-host)

`backend/Dockerfile` (create if you want to containerise):
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend .
COPY frontend ../frontend
EXPOSE 5000
CMD ["node","server.js"]
```

`docker-compose.yml`:
```yaml
services:
  db:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: furnix_db
    volumes: [ "dbdata:/var/lib/mysql" ]
  web:
    build: .
    env_file: backend/.env
    depends_on: [db]
    ports: [ "5000:5000" ]
volumes:
  dbdata:
```

---

## 4 · Using the store

- **Apply a coupon** → open the cart drawer, enter `WOOD20` or `FIRSTBED`.
- **Checkout** → `Shipping → Delivery → Payment → Review → Place Order`.
  Minimum lead time for the delivery date is 3 days.
- **Receipt** → `success.html?order=FX-YYYYMMDD-XXXXXX`. Also printable.
- **Contact** → `contact.html` saves into `customer_queries`.
- **Admin look-up** (quick SQL):

---

## 4b · Built-in SEO

FurniX ships with production-grade SEO out of the box. You do **not** need to touch any HTML to get it — the server rewrites the `<head>` on every page request.

### What you get
- **Server-rendered `<title>` and `<meta description>`** unique to each page (homepage, every category, every single product, contact) — this is what Google actually indexes.
- **Open Graph + Twitter Card** tags on every page (so link previews on WhatsApp, LinkedIn, X look great).
- **Canonical URLs** on every page to prevent duplicate-content penalties (so `/products.html`, `/products.html?category=beds` etc. are canonicalised correctly).
- **JSON-LD structured data** (schema.org):
  - `Organization` + `WebSite` + `FurnitureStore` (LocalBusiness) site-wide.
  - `Product` + `Offer` on every product page — eligible for Google's rich product snippets (price, stock, image).
  - `BreadcrumbList` on product / category pages.
  - `ItemList` on category pages.
- **Dynamic `/sitemap.xml`** generated from the MySQL catalogue (includes every active product with `lastmod` + image sitemap extension).
- **`/robots.txt`** pointing search engines at the sitemap, and blocking `/checkout.html` / `/success.html` / `/api/`.
- **`site.webmanifest`** + SVG favicon for PWA install and nice mobile home-screen icon.
- **`Cache-Control`** headers on static assets (1 week) and HTML (5 min) for fast repeat loads.
- **gzip compression** on every response.
- **`theme-color`**, `preconnect` hints to fonts/CDNs/image host for better Core Web Vitals.

### Quick check (after you deploy)
```bash
curl -s https://your-domain.com/sitemap.xml | head -30
curl -s https://your-domain.com/robots.txt
curl -s https://your-domain.com/product.html?slug=aranya-teak-king-bed | grep -E "(<title|og:title|application/ld\+json)"
```

### Submit to Google & Bing (5 minutes)

1. **Set `SITE_URL`** in your production `.env`:
   ```
   SITE_URL=https://www.furnix.store
   ```
   This is what goes into canonical tags and the sitemap. Restart the server.

2. **Google Search Console** — <https://search.google.com/search-console>
   - Add your property (use the **Domain** option for full coverage).
   - Verify ownership via DNS TXT record (or one of the other methods).
   - Open **Sitemaps** → submit `https://your-domain.com/sitemap.xml`.
   - Use **URL Inspection** on a few key product URLs and click **Request Indexing**.

3. **Bing Webmaster Tools** — <https://www.bing.com/webmasters>
   - Add your site, verify, and submit the same sitemap. (Bing powers DuckDuckGo and Yahoo, so one submit covers three engines.)

4. **Google Business Profile** (huge for local search) — <https://business.google.com>
   - Create a free profile for FurniX with your workshop address, phone and website. This is what makes you show up in Google Maps and the "knowledge panel" on the right of search results.

### Validators
- Rich results test — <https://search.google.com/test/rich-results?url=https://your-domain.com/product.html?slug=aranya-teak-king-bed>
- Mobile-friendly test — <https://search.google.com/test/mobile-friendly>
- Schema validator — <https://validator.schema.org/>
- Open Graph preview — <https://www.opengraph.xyz/>

### Things you should still do yourself
SEO is 10% code and 90% content + links. The site is now technically perfect; to rank on Google you still need to:
- **Buy a good domain** (short, brand-matching). Avoid `.shop` / `.store` if you can — `.in` or `.com` is best for India.
- **Get backlinks.** List on Justdial, IndiaMart, local directories, Houzz, Pinterest. Ask every happy customer for a Google review.
- **Add original content.** Consider a `/blog/` with articles like "How to care for Sheesham wood" or "Teak vs Mango: which is right for you?" — this is what captures long-tail searches.
- **Page speed.** Keep images under 200 KB; swap the Unsplash URLs for your own real product photos hosted on a CDN (Cloudflare R2, Bunny.net). Google ranks fast sites higher.
- **Be patient.** A brand-new domain typically takes 3-8 weeks to start appearing in Google results, regardless of how good the SEO is.

---

- **Admin look-up** (quick SQL):
  ```sql
  SELECT order_number, customer_name, total, order_status, created_at
  FROM orders ORDER BY id DESC LIMIT 50;
  ```

---

## 5 · Customising

- **Prices / tax / shipping** → `backend/utils/pricing.js` & the matching numbers in `frontend/js/cart.js`.
- **Coupons** → `applyCoupon()` in both files above (keep them in sync).
- **Product catalogue** → edit `backend/db/seed.sql` and re-run `npm run init-db`, or `INSERT INTO products (...)` directly.
- **Brand / colours** → CSS custom properties at the top of `frontend/css/style.css` (`--cream`, `--charcoal`, `--forest`).
- **Logo** → replace the `Furni<span>X</span>` markup in `frontend/js/layout.js`.

---

## 6 · Security notes for production

- **Use a dedicated DB user** with only `SELECT / INSERT / UPDATE / DELETE` on `furnix_db`.
- **Rotate `DB_PASSWORD`** and never commit `.env`.
- **Restrict CORS** to your production domains.
- **Put the server behind HTTPS** (Nginx + Let's Encrypt, Cloudflare, etc.).
- **Integrate a real payment gateway** (Razorpay / Stripe). Today the app marks the order `paid` for non-COD methods without charging a card — swap in the gateway webhook in `routes/orders.js` where we do `payment_status: 'paid'`.
- Consider adding **reCAPTCHA** to `/api/queries` and `/api/checkout` to fight spam.

---

## 7 · License

MIT — use it, fork it, ship it.
