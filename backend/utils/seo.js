/**
 * SEO helpers.
 *
 * We server-render <title>, <meta description>, Open Graph, Twitter cards,
 * canonical URLs and JSON-LD structured data into the static HTML so that
 * Google / Bing / social scrapers see rich content BEFORE our JavaScript
 * runs. This is critical for ranking product and category pages.
 */

const STORE_NAME = process.env.STORE_NAME || 'Vesta';
const STORE_EMAIL = process.env.STORE_EMAIL || 'contactVesta@gmail.com';
const STORE_PHONE = process.env.STORE_PHONE || '+91-7583777875';

function getSiteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function escAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const CATEGORY_META = {
  beds: {
    title: 'Solid Wood Beds — Teak, Sheesham & Mango | Vesta',
    desc:  'Shop hand-crafted solid wood beds — king, queen and single sizes in Teak, Sheesham and Mango. 10-year frame warranty and free delivery over ₹25,000.',
    h1:    'Beds',
  },
  sofas: {
    title: 'Wooden Frame Sofas & Loveseats | Vesta',
    desc:  'Exposed solid-wood sofa frames with hand-tufted upholstery. 2-seater, 3-seater and L-shape sectionals in Teak, Sheesham and Mango wood.',
    h1:    'Sofas',
  },
  tables: {
    title: 'Wooden Dining, Coffee & Study Tables | Vesta',
    desc:  'Live-edge dining tables, modern coffee tables and work-from-home desks in solid Teak, Sheesham and Mango. Hand-finished in India.',
    h1:    'Tables',
  },
  chairs: {
    title: 'Dining & Accent Chairs in Solid Wood | Vesta',
    desc:  'Hand-crafted dining and accent chairs with woven cane, boucle and linen upholstery. Solid Teak and Sheesham frames.',
    h1:    'Chairs',
  },
  storage: {
    title: 'Wardrobes, Bookshelves & Storage in Solid Wood | Vesta',
    desc:  'Heirloom-grade wardrobes and open-back bookshelves crafted from solid Teak and Sheesham, with soft-close hinges and cedar-lined drawers.',
    h1:    'Storage',
  },
};

/**
 * Base SEO block used by every page. The individual pages may override any
 * of these by passing values in `overrides`.
 */
function buildSeoHead({
  title,
  description,
  canonical,
  ogImage,
  ogType = 'website',
  jsonLd = [],
  keywords,
  noindex = false,
}) {
  const finalTitle = title || `${STORE_NAME} — Premium Hand-crafted Wooden Furniture`;
  const finalDesc = description ||
    'Vesta — heirloom-grade wooden furniture built from solid Teak, Sheesham and Mango wood. Beds, sofas, tables, chairs and storage with 10-year warranty.';
  const finalImg = ogImage ||
    'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1200&q=85';

  const ldScripts = (Array.isArray(jsonLd) ? jsonLd : [jsonLd])
    .filter(Boolean)
    .map(obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`)
    .join('\n');

  return `
<title>${escAttr(finalTitle)}</title>
<meta name="description" content="${escAttr(finalDesc)}" />
${keywords ? `<meta name="keywords" content="${escAttr(keywords)}" />` : ''}
${noindex ? '<meta name="robots" content="noindex,nofollow" />' : '<meta name="robots" content="index,follow,max-image-preview:large" />'}
${canonical ? `<link rel="canonical" href="${escAttr(canonical)}" />` : ''}
<meta property="og:site_name" content="${escAttr(STORE_NAME)}" />
<meta property="og:type" content="${escAttr(ogType)}" />
<meta property="og:title" content="${escAttr(finalTitle)}" />
<meta property="og:description" content="${escAttr(finalDesc)}" />
${canonical ? `<meta property="og:url" content="${escAttr(canonical)}" />` : ''}
<meta property="og:image" content="${escAttr(finalImg)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="en_IN" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escAttr(finalTitle)}" />
<meta name="twitter:description" content="${escAttr(finalDesc)}" />
<meta name="twitter:image" content="${escAttr(finalImg)}" />
<meta name="theme-color" content="#2D5A27" />
<meta name="author" content="${escAttr(STORE_NAME)}" />
${ldScripts}
`.trim();
}

// -------- JSON-LD builders --------

function orgJsonLd(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}#organization`,
    name: STORE_NAME,
    url: siteUrl,
    logo: `${siteUrl}/favicon.svg`,
    email: STORE_EMAIL,
    telephone: STORE_PHONE,
    sameAs: [],
    contactPoint: [{
      '@type': 'ContactPoint',
      contactType: 'customer service',
      telephone: STORE_PHONE,
      email: STORE_EMAIL,
      areaServed: 'IN',
      availableLanguage: ['en', 'hi'],
    }],
  };
}

function websiteJsonLd(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}#website`,
    url: siteUrl,
    name: STORE_NAME,
    publisher: { '@id': `${siteUrl}#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/products.html?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function localBusinessJsonLd(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FurnitureStore',
    '@id': `${siteUrl}#localbusiness`,
    name: STORE_NAME,
    image: `${siteUrl}/favicon.svg`,
    url: siteUrl,
    telephone: STORE_PHONE,
    email: STORE_EMAIL,
    priceRange: '₹₹-₹₹₹',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Puja Furniture & Hardware, Subhash Chowk, Mirana Road',
      addressLocality: 'Bayana',
      addressRegion: 'Rajasthan',
      addressCountry: 'IN',
    },
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
      opens: '10:00',
      closes: '19:00',
    }],
  };
}

function breadcrumbJsonLd(siteUrl, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((x, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: x.name,
      item: x.url ? (x.url.startsWith('http') ? x.url : `${siteUrl}${x.url}`) : undefined,
    })),
  };
}

function productJsonLd(siteUrl, p) {
  const url = `${siteUrl}/product.html?slug=${encodeURIComponent(p.slug)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url,
    name: p.name,
    image: [p.image_url],
    description: p.long_desc || p.short_desc || p.name,
    sku: p.sku,
    brand: { '@type': 'Brand', name: STORE_NAME },
    category: p.category,
    material: p.wood_type,
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'INR',
      price: Number(p.price).toFixed(2),
      availability: p.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: STORE_NAME },
      priceValidUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000)
        .toISOString().slice(0, 10),
    },
  };
}

function itemListJsonLd(siteUrl, products) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.slice(0, 20).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/product.html?slug=${encodeURIComponent(p.slug)}`,
      name: p.name,
    })),
  };
}

module.exports = {
  STORE_NAME, STORE_EMAIL, STORE_PHONE,
  CATEGORY_META,
  getSiteUrl, escAttr, buildSeoHead,
  orgJsonLd, websiteJsonLd, localBusinessJsonLd,
  breadcrumbJsonLd, productJsonLd, itemListJsonLd,
};
