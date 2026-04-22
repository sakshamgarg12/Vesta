/**
 * Non-destructive product import.
 *
 * Inserts 24 new pieces across all categories (beds, sofas, tables, chairs, storage —
 * including shoe racks and shoe cabinets). Existing rows, orders, and carts are left
 * untouched. The products table's UNIQUE(sku) constraint plus INSERT IGNORE makes this
 * idempotent — running it multiple times will not create duplicates.
 *
 * Usage:
 *   node scripts/add-products.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const NEW_PRODUCTS = [
  // ---------- Beds ----------
  {
    sku: 'FX-BED-004',
    name: 'Raja Teak Four-Poster King Bed',
    slug: 'raja-teak-four-poster-king-bed',
    category: 'beds',
    wood_type: 'Teak',
    finish: 'Dark Walnut',
    price: 72999.0,
    mrp: 89999.0,
    short_desc: 'Regal hand-carved four-poster king bed in solid teak.',
    long_desc:
      'A statement four-poster built from solid Burma Teak with hand-carved floral finials. Reinforced mortise-and-tenon joinery, slat-base construction and a rich dark-walnut hand-rubbed finish. Pairs beautifully with sheer canopy drapes (sold separately).',
    dimensions: '86 x 76 x 78 inches (L x W x H)',
    weight_kg: 138.0,
    image_url: 'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200&q=80'],
    stock: 4,
    is_featured: 1,
  },
  {
    sku: 'FX-BED-005',
    name: 'Linden Walnut Sleigh Bed',
    slug: 'linden-walnut-sleigh-bed',
    category: 'beds',
    wood_type: 'Walnut',
    finish: 'Natural Matte',
    price: 64999.0,
    mrp: 79999.0,
    short_desc: 'Curved walnut sleigh bed with deep grain character.',
    long_desc:
      'A modern take on the classic sleigh silhouette, crafted from solid American Walnut and finished to reveal the natural grain. Low-profile headboard, reinforced slat base, soft-close under-bed storage panel.',
    dimensions: '82 x 66 x 38 inches (L x W x H)',
    weight_kg: 102.0,
    image_url: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&q=80'],
    stock: 6,
    is_featured: 1,
  },
  {
    sku: 'FX-BED-006',
    name: 'Solara Oak Platform Storage Bed',
    slug: 'solara-oak-platform-storage-bed',
    category: 'beds',
    wood_type: 'Oak',
    finish: 'Natural Matte',
    price: 39999.0,
    mrp: 49999.0,
    short_desc: 'Minimalist oak platform bed with hydraulic storage.',
    long_desc:
      'A clean, Scandinavian-inspired platform bed in solid white Oak. Full hydraulic lift-up storage fits two comforters plus off-season linen. Low headboard design keeps the room feeling open.',
    dimensions: '80 x 64 x 34 inches (L x W x H)',
    weight_kg: 88.0,
    image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80'],
    stock: 9,
    is_featured: 0,
  },
  {
    sku: 'FX-BED-007',
    name: 'Aurora Mango Low-Profile Queen Bed',
    slug: 'aurora-mango-low-profile-queen-bed',
    category: 'beds',
    wood_type: 'Mango',
    finish: 'Honey Matte',
    price: 22999.0,
    mrp: 28999.0,
    short_desc: 'Japandi-style low-profile queen bed in Mango wood.',
    long_desc:
      'Solid Mango frame with a low-slung platform design inspired by Japandi interiors. Honey matte hand-rubbed finish, tatami-style slat support and chamfered edges for a soft modern feel.',
    dimensions: '78 x 62 x 28 inches (L x W x H)',
    weight_kg: 58.0,
    image_url: 'https://images.unsplash.com/photo-1616627561950-9f746e330187?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1616627561950-9f746e330187?w=1200&q=80'],
    stock: 11,
    is_featured: 0,
  },

  // ---------- Sofas ----------
  {
    sku: 'FX-SOF-004',
    name: 'Windsor Walnut Chesterfield 3-Seater',
    slug: 'windsor-walnut-chesterfield-sofa',
    category: 'sofas',
    wood_type: 'Walnut',
    finish: 'Dark Walnut',
    price: 79999.0,
    mrp: 98999.0,
    short_desc: 'Classic tufted Chesterfield on a solid walnut frame.',
    long_desc:
      'A heirloom Chesterfield with deep hand-tufted buttons, rolled arms and nail-head trim, mounted on a solid American Walnut frame. High-resilience foam with feather wrap for sink-in comfort. Top-grain leather in cognac.',
    dimensions: '86 x 36 x 30 inches (L x W x H)',
    weight_kg: 88.0,
    image_url: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1200&q=80'],
    stock: 3,
    is_featured: 1,
  },
  {
    sku: 'FX-SOF-005',
    name: 'Hamilton Mid-Century Teak Sofa',
    slug: 'hamilton-mid-century-teak-sofa',
    category: 'sofas',
    wood_type: 'Teak',
    finish: 'Honey Matte',
    price: 58999.0,
    mrp: 72999.0,
    short_desc: 'Scandinavian mid-century teak sofa with tapered legs.',
    long_desc:
      'Danish-inspired silhouette in solid Teak with slim tapered legs, a buttery honey matte finish and cream boucle upholstery. Removable, washable cushion covers. Built for decades of daily use.',
    dimensions: '80 x 34 x 30 inches (L x W x H)',
    weight_kg: 62.0,
    image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200&q=80'],
    stock: 5,
    is_featured: 1,
  },
  {
    sku: 'FX-SOF-006',
    name: 'Transit Mango Sofa-cum-Bed',
    slug: 'transit-mango-sofa-cum-bed',
    category: 'sofas',
    wood_type: 'Mango',
    finish: 'Charcoal Wash',
    price: 36999.0,
    mrp: 44999.0,
    short_desc: 'Convertible Mango-frame sofa-cum-bed with storage.',
    long_desc:
      'A smart 3-seater that folds out into a full-size sleeping surface in seconds. Solid Mango frame with charcoal wash, hidden under-seat storage for bedding, and charcoal performance-fabric upholstery.',
    dimensions: '76 x 34 x 32 inches (L x W x H)',
    weight_kg: 70.0,
    image_url: 'https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=1200&q=80'],
    stock: 8,
    is_featured: 0,
  },
  {
    sku: 'FX-SOF-007',
    name: 'Meridian Oak Modular Corner Sofa',
    slug: 'meridian-oak-modular-corner-sofa',
    category: 'sofas',
    wood_type: 'Oak',
    finish: 'Natural Matte',
    price: 74999.0,
    mrp: 92999.0,
    short_desc: 'Reconfigurable oak corner sofa for modern great rooms.',
    long_desc:
      'A six-piece modular system in solid white Oak — rearrange the corner, chaise and ottoman to suit your room. Linen-blend covers, cold-cured foam seats and steel-reinforced joints. Grows with your home.',
    dimensions: '114 x 68 x 32 inches (L x W x H)',
    weight_kg: 128.0,
    image_url: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1200&q=80'],
    stock: 3,
    is_featured: 1,
  },

  // ---------- Tables ----------
  {
    sku: 'FX-TAB-004',
    name: 'Navaratna Sheesham 4-Seater Dining Table',
    slug: 'navaratna-sheesham-4-seater-dining',
    category: 'tables',
    wood_type: 'Sheesham',
    finish: 'Walnut Finish',
    price: 27999.0,
    mrp: 34999.0,
    short_desc: 'Square 4-seater Sheesham dining table for smaller homes.',
    long_desc:
      'A compact 4-seater dining table in solid Sheesham with subtly turned legs and a hand-rubbed walnut finish. Sized for urban apartments without sacrificing presence.',
    dimensions: '48 x 48 x 30 inches (L x W x H)',
    weight_kg: 42.0,
    image_url: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1617806118233-18e1de247200?w=1200&q=80'],
    stock: 9,
    is_featured: 0,
  },
  {
    sku: 'FX-TAB-005',
    name: 'Solis Walnut Round Pedestal Table',
    slug: 'solis-walnut-round-pedestal-table',
    category: 'tables',
    wood_type: 'Walnut',
    finish: 'Dark Walnut',
    price: 34999.0,
    mrp: 42999.0,
    short_desc: 'Sculptural round pedestal table in solid walnut.',
    long_desc:
      'A single-pedestal round dining table with a 48-inch solid Walnut top and hand-turned pedestal base. Seats 4 comfortably. Statement piece for the centre of any dining room.',
    dimensions: '48 x 48 x 30 inches (Dia x Dia x H)',
    weight_kg: 54.0,
    image_url: 'https://images.unsplash.com/photo-1577140917170-285929fb55b7?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1577140917170-285929fb55b7?w=1200&q=80'],
    stock: 4,
    is_featured: 1,
  },
  {
    sku: 'FX-TAB-006',
    name: 'Stacked Teak Nesting Tables (Set of 3)',
    slug: 'stacked-teak-nesting-tables',
    category: 'tables',
    wood_type: 'Teak',
    finish: 'Honey Matte',
    price: 14999.0,
    mrp: 19999.0,
    short_desc: 'Set of 3 stackable Teak side tables.',
    long_desc:
      'A trio of graduated nesting side tables in solid Teak, each with hand-finished honey matte tops and slim tapered legs. Stack them to save space or spread them across the living room for guests.',
    dimensions: 'Largest: 22 x 16 x 22 inches (L x W x H)',
    weight_kg: 22.0,
    image_url: 'https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=1200&q=80'],
    stock: 14,
    is_featured: 0,
  },
  {
    sku: 'FX-TAB-007',
    name: 'Regent Oak Executive Desk',
    slug: 'regent-oak-executive-desk',
    category: 'tables',
    wood_type: 'Oak',
    finish: 'Dark Walnut',
    price: 32999.0,
    mrp: 39999.0,
    short_desc: 'Executive-scale oak desk with filing drawers.',
    long_desc:
      'A substantial executive desk in solid Oak with a dark walnut stain, three soft-close filing drawers on the right pedestal, integrated cable management and brass hardware. Built for long workdays.',
    dimensions: '60 x 30 x 30 inches (L x W x H)',
    weight_kg: 68.0,
    image_url: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=1200&q=80'],
    stock: 6,
    is_featured: 1,
  },
  {
    sku: 'FX-TAB-008',
    name: 'Relic Mango Rustic Console Table',
    slug: 'relic-mango-rustic-console-table',
    category: 'tables',
    wood_type: 'Mango',
    finish: 'Charcoal Wash',
    price: 15999.0,
    mrp: 21999.0,
    short_desc: 'Narrow Mango console table for entryways and hallways.',
    long_desc:
      'A 52-inch solid Mango console with two soft-close drawers, lower display shelf and iron-band accents. Charcoal wash finish lets the wood grain read through. Ideal for foyers and narrow hallways.',
    dimensions: '52 x 14 x 32 inches (L x W x H)',
    weight_kg: 34.0,
    image_url: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1617806118233-18e1de247200?w=1200&q=80'],
    stock: 10,
    is_featured: 0,
  },

  // ---------- Chairs ----------
  {
    sku: 'FX-CHR-003',
    name: 'Veda Teak Rocking Chair',
    slug: 'veda-teak-rocking-chair',
    category: 'chairs',
    wood_type: 'Teak',
    finish: 'Honey Matte',
    price: 17999.0,
    mrp: 22999.0,
    short_desc: 'Hand-crafted solid teak rocking chair with cane back.',
    long_desc:
      'A slow-living classic — solid Teak rocker with steam-bent runners, woven cane back for ventilation and cushioned seat in natural linen. Built for a lifetime of afternoon reading.',
    dimensions: '28 x 38 x 40 inches (L x W x H)',
    weight_kg: 16.0,
    image_url: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=1200&q=80'],
    stock: 7,
    is_featured: 1,
  },
  {
    sku: 'FX-CHR-004',
    name: 'Ergo Oak Home-Office Chair',
    slug: 'ergo-oak-home-office-chair',
    category: 'chairs',
    wood_type: 'Oak',
    finish: 'Natural Matte',
    price: 19999.0,
    mrp: 25999.0,
    short_desc: 'Ergonomic oak task chair with molded lumbar.',
    long_desc:
      'A modern task chair with solid Oak frame, moulded lumbar back, height-adjustable gas lift and full-grain leather seat. Finished in a natural matte that ages gracefully.',
    dimensions: '24 x 24 x 40 inches (L x W x H)',
    weight_kg: 14.0,
    image_url: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=1200&q=80'],
    stock: 8,
    is_featured: 0,
  },
  {
    sku: 'FX-CHR-005',
    name: 'Cottage Walnut Windsor Dining Chair (Set of 2)',
    slug: 'cottage-walnut-windsor-dining-chair-set',
    category: 'chairs',
    wood_type: 'Walnut',
    finish: 'Walnut Finish',
    price: 16999.0,
    mrp: 21999.0,
    short_desc: 'Windsor-style walnut dining chairs (set of 2).',
    long_desc:
      'A pair of traditional Windsor chairs in solid Walnut with spindle backs, saddle-shaped seats and turned legs. Comfortable for long family dinners; ages into a heirloom.',
    dimensions: '18 x 20 x 36 inches (per chair)',
    weight_kg: 13.0,
    image_url: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=1200&q=80'],
    stock: 12,
    is_featured: 0,
  },
  {
    sku: 'FX-CHR-006',
    name: 'Bistro Mango Bar Stool (Set of 2)',
    slug: 'bistro-mango-bar-stool-set',
    category: 'chairs',
    wood_type: 'Mango',
    finish: 'Natural Matte',
    price: 9999.0,
    mrp: 12999.0,
    short_desc: 'Backless Mango wood counter stools, set of 2.',
    long_desc:
      'A pair of classic bistro-height bar stools in solid Mango with a natural matte finish. Round seat, four splayed legs, foot-ring for comfort. Counter height (26 inches).',
    dimensions: '14 x 14 x 26 inches (per stool)',
    weight_kg: 9.0,
    image_url: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=1200&q=80'],
    stock: 16,
    is_featured: 0,
  },
  {
    sku: 'FX-CHR-007',
    name: 'Loka Sheesham Armchair',
    slug: 'loka-sheesham-armchair',
    category: 'chairs',
    wood_type: 'Sheesham',
    finish: 'Honey Oak',
    price: 13999.0,
    mrp: 17999.0,
    short_desc: 'Sheesham armchair with curved arms and cane inlay.',
    long_desc:
      'A compact armchair with solid Sheesham arms, cane-inlay side panels and a deep seat cushion. Perfect for reading nooks and smaller living rooms.',
    dimensions: '26 x 28 x 34 inches (L x W x H)',
    weight_kg: 15.0,
    image_url: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=1200&q=80'],
    stock: 9,
    is_featured: 1,
  },

  // ---------- Storage (Shoe racks / cabinets, chests, TV, credenza, linen) ----------
  {
    sku: 'FX-STG-003',
    name: 'Pauda Sheesham Shoe Rack (3-Tier)',
    slug: 'pauda-sheesham-shoe-rack-3-tier',
    category: 'storage',
    wood_type: 'Sheesham',
    finish: 'Natural Matte',
    price: 7999.0,
    mrp: 10999.0,
    short_desc: 'Open 3-tier Sheesham shoe rack for entryways.',
    long_desc:
      'A simple, sturdy 3-tier shoe rack in solid Sheesham. Holds up to 12 pairs of adult shoes. Slatted design keeps shoes ventilated; natural matte finish wipes clean.',
    dimensions: '34 x 11 x 20 inches (L x W x H)',
    weight_kg: 12.0,
    image_url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=1200&q=80'],
    stock: 18,
    is_featured: 0,
  },
  {
    sku: 'FX-STG-004',
    name: 'Orion Teak Shoe Cabinet (4-Tier)',
    slug: 'orion-teak-shoe-cabinet-4-tier',
    category: 'storage',
    wood_type: 'Teak',
    finish: 'Honey Matte',
    price: 14999.0,
    mrp: 19999.0,
    short_desc: 'Closed 4-tier Teak shoe cabinet with tip-out doors.',
    long_desc:
      'A dust-proof shoe cabinet in solid Teak with four tip-out doors. Holds up to 24 pairs behind clean closed doors. Soft-close hinges, integrated ventilation grilles, honey matte finish.',
    dimensions: '40 x 10 x 48 inches (L x W x H)',
    weight_kg: 32.0,
    image_url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=1200&q=80'],
    stock: 8,
    is_featured: 1,
  },
  {
    sku: 'FX-STG-005',
    name: 'Havelock Mango 6-Drawer Chest',
    slug: 'havelock-mango-6-drawer-chest',
    category: 'storage',
    wood_type: 'Mango',
    finish: 'Charcoal Wash',
    price: 21999.0,
    mrp: 27999.0,
    short_desc: 'Six-drawer Mango chest for bedroom organisation.',
    long_desc:
      'A generously sized six-drawer chest in solid Mango with soft-close runners, iron-handle hardware and a smoky charcoal wash finish. Deep drawers fit folded sweaters with room to spare.',
    dimensions: '38 x 18 x 48 inches (L x W x H)',
    weight_kg: 58.0,
    image_url: 'https://images.unsplash.com/photo-1594620302200-9a762244a156?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1594620302200-9a762244a156?w=1200&q=80'],
    stock: 6,
    is_featured: 0,
  },
  {
    sku: 'FX-STG-006',
    name: 'Cielo Walnut TV Unit',
    slug: 'cielo-walnut-tv-unit',
    category: 'storage',
    wood_type: 'Walnut',
    finish: 'Dark Walnut',
    price: 26999.0,
    mrp: 33999.0,
    short_desc: 'Low-profile walnut TV unit with cable management.',
    long_desc:
      'A 64-inch media console in solid Walnut with two cane-fronted doors, a central open shelf sized for a soundbar and integrated cable management. Holds TVs up to 75 inches.',
    dimensions: '64 x 16 x 22 inches (L x W x H)',
    weight_kg: 44.0,
    image_url: 'https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=1200&q=80'],
    stock: 7,
    is_featured: 1,
  },
  {
    sku: 'FX-STG-007',
    name: 'Bayana Oak Credenza',
    slug: 'bayana-oak-credenza',
    category: 'storage',
    wood_type: 'Oak',
    finish: 'Natural Matte',
    price: 29999.0,
    mrp: 36999.0,
    short_desc: 'Mid-century oak credenza / sideboard.',
    long_desc:
      'A mid-century sideboard in solid Oak with three doors, adjustable interior shelves, brass pull hardware and tapered legs. Perfect as a dining-room server or living-room storage statement.',
    dimensions: '68 x 18 x 32 inches (L x W x H)',
    weight_kg: 56.0,
    image_url: 'https://images.unsplash.com/photo-1594620302200-9a762244a156?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1594620302200-9a762244a156?w=1200&q=80'],
    stock: 5,
    is_featured: 1,
  },
  {
    sku: 'FX-STG-008',
    name: 'Kairo Teak Linen Chest',
    slug: 'kairo-teak-linen-chest',
    category: 'storage',
    wood_type: 'Teak',
    finish: 'Honey Matte',
    price: 18999.0,
    mrp: 24999.0,
    short_desc: 'Classic teak linen trunk for bedroom end-of-bed.',
    long_desc:
      'A hand-crafted blanket / linen chest in solid Teak with brass-bound corners, slow-close lid and cedar-lined interior to keep linen fresh. Doubles as an end-of-bed seat.',
    dimensions: '44 x 20 x 20 inches (L x W x H)',
    weight_kg: 38.0,
    image_url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=900&q=80',
    gallery: ['https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=1200&q=80'],
    stock: 9,
    is_featured: 0,
  },
];

async function run() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'vesta_db';

  console.log(`[add-products] Connecting to ${user}@${host}:${port}/${database} ...`);
  const conn = await mysql.createConnection({ host, port, user, password, database });

  const [beforeRows] = await conn.query('SELECT COUNT(*) AS c FROM products');
  console.log(`[add-products] Current catalogue size: ${beforeRows[0].c}`);

  // INSERT IGNORE so re-running the script is safe — dupes on UNIQUE(sku) are silently skipped.
  const sql = `
    INSERT IGNORE INTO products
      (sku, name, slug, category, wood_type, finish, price, mrp,
       short_desc, long_desc, dimensions, weight_kg, image_url, gallery, stock, is_featured)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)
  `;

  let inserted = 0;
  let skipped = 0;
  for (const p of NEW_PRODUCTS) {
    const [res] = await conn.execute(sql, [
      p.sku,
      p.name,
      p.slug,
      p.category,
      p.wood_type,
      p.finish,
      p.price,
      p.mrp,
      p.short_desc,
      p.long_desc,
      p.dimensions,
      p.weight_kg,
      p.image_url,
      JSON.stringify(p.gallery),
      p.stock,
      p.is_featured,
    ]);
    if (res.affectedRows > 0) {
      inserted++;
      console.log(`  + ${p.sku}  ${p.name}`);
    } else {
      skipped++;
      console.log(`  = ${p.sku}  (already exists, skipped)`);
    }
  }

  const [afterRows] = await conn.query('SELECT COUNT(*) AS c FROM products');
  console.log('');
  console.log(`[add-products] Inserted: ${inserted}   Skipped: ${skipped}`);
  console.log(`[add-products] New catalogue size: ${afterRows[0].c}`);

  const [byCat] = await conn.query(`
    SELECT category, COUNT(*) AS c, MIN(price) AS min_price
      FROM products
     WHERE is_active = 1
     GROUP BY category
     ORDER BY category
  `);
  console.log('[add-products] Breakdown by category:');
  byCat.forEach((r) => console.log(`  ${r.category.padEnd(10)}  ${r.c}  (from ₹${r.min_price})`));

  await conn.end();
}

run().catch((err) => {
  console.error('[add-products] FAILED:', err.message);
  process.exit(1);
});
