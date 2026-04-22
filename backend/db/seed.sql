-- =====================================================
-- Vesta - Seed data (real product catalogue)
-- Run after schema.sql
-- =====================================================

USE vesta_db;

TRUNCATE TABLE order_items;
DELETE FROM orders;
DELETE FROM products;
ALTER TABLE products AUTO_INCREMENT = 1;
ALTER TABLE orders AUTO_INCREMENT = 1;

INSERT INTO products
  (sku, name, slug, category, wood_type, finish, price, mrp, short_desc, long_desc, dimensions, weight_kg, image_url, gallery, stock, is_featured) VALUES

-- ---------- Beds ----------
('FX-BED-001', 'Aranya Teak King Bed', 'aranya-teak-king-bed', 'beds', 'Teak',
 'Honey Matte', 42999.00, 54999.00,
 'Hand-crafted solid teak king bed with clean modern lines.',
 'The Aranya is built from kiln-dried solid Burma Teak, finished in a hand-rubbed honey matte. Features a reinforced slatted base (no box-spring required), soft-close storage drawers and mortise-and-tenon joinery for a lifetime of use.',
 '82 x 72 x 40 inches (L x W x H)', 95.50,
 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=900&q=80',
 JSON_ARRAY(
   'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80',
   'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200&q=80'
 ), 8, 1),

('FX-BED-002', 'Kaveri Sheesham Queen Bed', 'kaveri-sheesham-queen-bed', 'beds', 'Sheesham',
 'Walnut Finish', 28499.00, 35999.00,
 'Classic Sheesham queen bed with hydraulic storage.',
 'A timeless silhouette carved from seasoned Sheesham (Indian Rosewood). Hydraulic lift-up storage comfortably holds two full sets of linen. Finished with a food-safe walnut stain.',
 '78 x 60 x 36 inches (L x W x H)', 82.00,
 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80'), 12, 1),

('FX-BED-003', 'Nirvana Mango Wood Single Bed', 'nirvana-mango-single-bed', 'beds', 'Mango',
 'Natural Matte', 16999.00, 21999.00,
 'Minimalist single bed, perfect for guest rooms.',
 'Made from sustainably sourced Mango wood with open-grain natural matte finish. Low-profile platform design with breathable slat base.',
 '78 x 42 x 30 inches (L x W x H)', 48.00,
 'https://images.unsplash.com/photo-1616627561950-9f746e330187?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1616627561950-9f746e330187?w=1200&q=80'), 15, 0),

-- ---------- Sofas ----------
('FX-SOF-001', 'Heritage Teak 3-Seater Sofa', 'heritage-teak-3-seater-sofa', 'sofas', 'Teak',
 'Dark Walnut', 54999.00, 69999.00,
 'Solid teak frame with hand-tufted linen cushions.',
 'A heirloom-grade 3-seater sofa with solid teak exposed frame and hand-tufted off-white linen cushions filled with high-resilience foam and feather topper.',
 '84 x 34 x 32 inches (L x W x H)', 75.00,
 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200&q=80'), 6, 1),

('FX-SOF-002', 'Kyoto Sheesham 2-Seater Loveseat', 'kyoto-sheesham-loveseat', 'sofas', 'Sheesham',
 'Honey Oak', 32999.00, 41999.00,
 'Compact Sheesham loveseat for modern apartments.',
 'An elegant 2-seater with Sheesham frame, beige cotton upholstery and removable, washable covers. Built for compact living spaces without compromising comfort.',
 '58 x 32 x 32 inches (L x W x H)', 52.00,
 'https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=1200&q=80'), 9, 1),

('FX-SOF-003', 'Bodhi Mango L-Shape Sectional', 'bodhi-mango-sectional', 'sofas', 'Mango',
 'Charcoal Wash', 64999.00, 82999.00,
 'Spacious L-shape sectional in Mango wood.',
 'L-shape sectional featuring a solid Mango base with a charcoal wash, deep seat cushions and charcoal performance-fabric upholstery. Reversible chaise.',
 '110 x 65 x 33 inches (L x W x H)', 102.00,
 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1200&q=80'), 4, 0),

-- ---------- Tables ----------
('FX-TAB-001', 'Shilpa Teak 6-Seater Dining Table', 'shilpa-teak-6-seater-dining', 'tables', 'Teak',
 'Honey Matte', 38999.00, 48999.00,
 'Solid teak 6-seater live-edge dining table.',
 'A 72-inch live-edge dining table built from a single plank of reclaimed Burma Teak. Hand-finished with food-safe oil. Pairs beautifully with our Heritage chairs.',
 '72 x 38 x 30 inches (L x W x H)', 68.00,
 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1617806118233-18e1de247200?w=1200&q=80'), 7, 1),

('FX-TAB-002', 'Urban Sheesham Coffee Table', 'urban-sheesham-coffee-table', 'tables', 'Sheesham',
 'Natural Matte', 12499.00, 16999.00,
 'Modern Sheesham coffee table with lower shelf.',
 'A versatile centre table featuring a two-tier Sheesham top and powder-coated iron legs. Lower shelf perfect for books and magazines.',
 '42 x 22 x 18 inches (L x W x H)', 28.00,
 'https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=1200&q=80'), 20, 1),

('FX-TAB-003', 'Zen Mango Wood Study Desk', 'zen-mango-study-desk', 'tables', 'Mango',
 'Natural Matte', 17999.00, 23999.00,
 'Minimalist study/work-from-home desk.',
 'A 48-inch solid Mango study desk with a soft-close single drawer and integrated cable management. Matte-lacquer finish.',
 '48 x 24 x 30 inches (L x W x H)', 32.00,
 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=1200&q=80'), 14, 0),

-- ---------- Chairs ----------
('FX-CHR-001', 'Heritage Teak Dining Chair (Set of 2)', 'heritage-teak-dining-chair-set', 'chairs', 'Teak',
 'Honey Matte', 14999.00, 19999.00,
 'Matching teak dining chairs (set of 2).',
 'Hand-crafted solid teak dining chairs with woven cane backrest and upholstered seat. Sold as a set of two.',
 '18 x 20 x 36 inches (per chair)', 14.00,
 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=1200&q=80'), 18, 0),

('FX-CHR-002', 'Nordic Sheesham Accent Chair', 'nordic-sheesham-accent-chair', 'chairs', 'Sheesham',
 'Walnut Finish', 11999.00, 14999.00,
 'Nordic-inspired Sheesham accent chair.',
 'A statement accent chair with Sheesham splayed legs, curved solid-wood armrests and cream boucle upholstery.',
 '28 x 30 x 32 inches (L x W x H)', 18.00,
 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=1200&q=80'), 10, 1),

-- ---------- Storage ----------
('FX-STG-001', 'Vayu Teak 4-Door Wardrobe', 'vayu-teak-4-door-wardrobe', 'storage', 'Teak',
 'Honey Matte', 58999.00, 74999.00,
 'Spacious 4-door teak wardrobe with mirror.',
 '4-door solid teak wardrobe with soft-close hinges, full-length mirror, cedar-lined drawers and a dedicated tie/belt rack.',
 '72 x 22 x 80 inches (L x W x H)', 120.00,
 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=1200&q=80'), 5, 0),

('FX-STG-002', 'Aranya Sheesham Bookshelf', 'aranya-sheesham-bookshelf', 'storage', 'Sheesham',
 'Natural Matte', 18999.00, 24999.00,
 '5-tier Sheesham bookshelf for the reader in you.',
 'Open-back 5-tier Sheesham bookshelf with adjustable shelves. Anti-tip wall-mount hardware included.',
 '36 x 14 x 72 inches (L x W x H)', 42.00,
 'https://images.unsplash.com/photo-1594620302200-9a762244a156?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1594620302200-9a762244a156?w=1200&q=80'), 11, 1);

-- =====================================================
-- Expanded catalog — additional 24 pieces across all categories.
-- =====================================================
INSERT INTO products
  (sku, name, slug, category, wood_type, finish, price, mrp, short_desc, long_desc, dimensions, weight_kg, image_url, gallery, stock, is_featured) VALUES

-- ---------- More Beds ----------
('FX-BED-004', 'Raja Teak Four-Poster King Bed', 'raja-teak-four-poster-king-bed', 'beds', 'Teak',
 'Dark Walnut', 72999.00, 89999.00,
 'Regal hand-carved four-poster king bed in solid teak.',
 'A statement four-poster built from solid Burma Teak with hand-carved floral finials. Reinforced mortise-and-tenon joinery, slat-base construction and a rich dark-walnut hand-rubbed finish. Pairs beautifully with sheer canopy drapes (sold separately).',
 '86 x 76 x 78 inches (L x W x H)', 138.00,
 'https://images.unsplash.com/photo-1617325247661-675ab4b64ae2?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1617325247661-675ab4b64ae2?w=1200&q=80'), 4, 1),

('FX-BED-005', 'Linden Walnut Sleigh Bed', 'linden-walnut-sleigh-bed', 'beds', 'Walnut',
 'Natural Matte', 64999.00, 79999.00,
 'Curved walnut sleigh bed with deep grain character.',
 'A modern take on the classic sleigh silhouette, crafted from solid American Walnut and finished to reveal the natural grain. Low-profile headboard, reinforced slat base, soft-close under-bed storage panel.',
 '82 x 66 x 38 inches (L x W x H)', 102.00,
 'https://images.unsplash.com/photo-1558882224-dda166733046?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1558882224-dda166733046?w=1200&q=80'), 6, 1),

('FX-BED-006', 'Solara Oak Platform Storage Bed', 'solara-oak-platform-storage-bed', 'beds', 'Oak',
 'Natural Matte', 39999.00, 49999.00,
 'Minimalist oak platform bed with hydraulic storage.',
 'A clean, Scandinavian-inspired platform bed in solid white Oak. Full hydraulic lift-up storage fits two comforters plus off-season linen. Low headboard design keeps the room feeling open.',
 '80 x 64 x 34 inches (L x W x H)', 88.00,
 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80'), 9, 0),

('FX-BED-007', 'Aurora Mango Low-Profile Queen Bed', 'aurora-mango-low-profile-queen-bed', 'beds', 'Mango',
 'Honey Matte', 22999.00, 28999.00,
 'Japandi-style low-profile queen bed in Mango wood.',
 'Solid Mango frame with a low-slung platform design inspired by Japandi interiors. Honey matte hand-rubbed finish, tatami-style slat support and chamfered edges for a soft modern feel.',
 '78 x 62 x 28 inches (L x W x H)', 58.00,
 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=1200&q=80'), 11, 0),

-- ---------- More Sofas ----------
('FX-SOF-004', 'Windsor Walnut Chesterfield 3-Seater', 'windsor-walnut-chesterfield-sofa', 'sofas', 'Walnut',
 'Dark Walnut', 79999.00, 98999.00,
 'Classic tufted Chesterfield on a solid walnut frame.',
 'A heirloom Chesterfield with deep hand-tufted buttons, rolled arms and nail-head trim, mounted on a solid American Walnut frame. High-resilience foam with feather wrap for sink-in comfort. Top-grain leather in cognac.',
 '86 x 36 x 30 inches (L x W x H)', 88.00,
 'https://images.unsplash.com/photo-1550254478-ead40cc54513?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1550254478-ead40cc54513?w=1200&q=80'), 3, 1),

('FX-SOF-005', 'Hamilton Mid-Century Teak Sofa', 'hamilton-mid-century-teak-sofa', 'sofas', 'Teak',
 'Honey Matte', 58999.00, 72999.00,
 'Scandinavian mid-century teak sofa with tapered legs.',
 'Danish-inspired silhouette in solid Teak with slim tapered legs, a buttery honey matte finish and cream boucle upholstery. Removable, washable cushion covers. Built for decades of daily use.',
 '80 x 34 x 30 inches (L x W x H)', 62.00,
 'https://images.unsplash.com/photo-1506898667547-42e22a46e125?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1506898667547-42e22a46e125?w=1200&q=80'), 5, 1),

('FX-SOF-006', 'Transit Mango Sofa-cum-Bed', 'transit-mango-sofa-cum-bed', 'sofas', 'Mango',
 'Charcoal Wash', 36999.00, 44999.00,
 'Convertible Mango-frame sofa-cum-bed with storage.',
 'A smart 3-seater that folds out into a full-size sleeping surface in seconds. Solid Mango frame with charcoal wash, hidden under-seat storage for bedding, and charcoal performance-fabric upholstery.',
 '76 x 34 x 32 inches (L x W x H)', 70.00,
 'https://images.unsplash.com/photo-1580229080435-1c7e2b7b0772?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1580229080435-1c7e2b7b0772?w=1200&q=80'), 8, 0),

('FX-SOF-007', 'Meridian Oak Modular Corner Sofa', 'meridian-oak-modular-corner-sofa', 'sofas', 'Oak',
 'Natural Matte', 74999.00, 92999.00,
 'Reconfigurable oak corner sofa for modern great rooms.',
 'A six-piece modular system in solid white Oak — rearrange the corner, chaise and ottoman to suit your room. Linen-blend covers, cold-cured foam seats and steel-reinforced joints. Grows with your home.',
 '114 x 68 x 32 inches (L x W x H)', 128.00,
 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=1200&q=80'), 3, 1),

-- ---------- More Tables ----------
('FX-TAB-004', 'Navaratna Sheesham 4-Seater Dining Table', 'navaratna-sheesham-4-seater-dining', 'tables', 'Sheesham',
 'Walnut Finish', 27999.00, 34999.00,
 'Square 4-seater Sheesham dining table for smaller homes.',
 'A compact 4-seater dining table in solid Sheesham with subtly turned legs and a hand-rubbed walnut finish. Sized for urban apartments without sacrificing presence.',
 '48 x 48 x 30 inches (L x W x H)', 42.00,
 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1615529182904-14819c35db37?w=1200&q=80'), 9, 0),

('FX-TAB-005', 'Solis Walnut Round Pedestal Table', 'solis-walnut-round-pedestal-table', 'tables', 'Walnut',
 'Dark Walnut', 34999.00, 42999.00,
 'Sculptural round pedestal table in solid walnut.',
 'A single-pedestal round dining table with a 48-inch solid Walnut top and hand-turned pedestal base. Seats 4 comfortably. Statement piece for the centre of any dining room.',
 '48 x 48 x 30 inches (Dia x Dia x H)', 54.00,
 'https://images.unsplash.com/photo-1583845112203-29329902332e?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1583845112203-29329902332e?w=1200&q=80'), 4, 1),

('FX-TAB-006', 'Stacked Teak Nesting Tables (Set of 3)', 'stacked-teak-nesting-tables', 'tables', 'Teak',
 'Honey Matte', 14999.00, 19999.00,
 'Set of 3 stackable Teak side tables.',
 'A trio of graduated nesting side tables in solid Teak, each with hand-finished honey matte tops and slim tapered legs. Stack them to save space or spread them across the living room for guests.',
 'Largest: 22 x 16 x 22 inches (L x W x H)', 22.00,
 'https://images.unsplash.com/photo-1586208958839-06c17cacdf08?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1586208958839-06c17cacdf08?w=1200&q=80'), 14, 0),

('FX-TAB-007', 'Regent Oak Executive Desk', 'regent-oak-executive-desk', 'tables', 'Oak',
 'Dark Walnut', 32999.00, 39999.00,
 'Executive-scale oak desk with filing drawers.',
 'A substantial executive desk in solid Oak with a dark walnut stain, three soft-close filing drawers on the right pedestal, integrated cable management and brass hardware. Built for long workdays.',
 '60 x 30 x 30 inches (L x W x H)', 68.00,
 'https://images.unsplash.com/photo-1542372147193-a7aca54189cd?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1542372147193-a7aca54189cd?w=1200&q=80'), 6, 1),

('FX-TAB-008', 'Relic Mango Rustic Console Table', 'relic-mango-rustic-console-table', 'tables', 'Mango',
 'Charcoal Wash', 15999.00, 21999.00,
 'Narrow Mango console table for entryways and hallways.',
 'A 52-inch solid Mango console with two soft-close drawers, lower display shelf and iron-band accents. Charcoal wash finish lets the wood grain read through. Ideal for foyers and narrow hallways.',
 '52 x 14 x 32 inches (L x W x H)', 34.00,
 'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?w=1200&q=80'), 10, 0),

-- ---------- More Chairs ----------
('FX-CHR-003', 'Veda Teak Rocking Chair', 'veda-teak-rocking-chair', 'chairs', 'Teak',
 'Honey Matte', 17999.00, 22999.00,
 'Hand-crafted solid teak rocking chair with cane back.',
 'A slow-living classic — solid Teak rocker with steam-bent runners, woven cane back for ventilation and cushioned seat in natural linen. Built for a lifetime of afternoon reading.',
 '28 x 38 x 40 inches (L x W x H)', 16.00,
 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1592078615290-033ee584e267?w=1200&q=80'), 7, 1),

('FX-CHR-004', 'Ergo Oak Home-Office Chair', 'ergo-oak-home-office-chair', 'chairs', 'Oak',
 'Natural Matte', 19999.00, 25999.00,
 'Ergonomic oak task chair with molded lumbar.',
 'A modern task chair with solid Oak frame, moulded lumbar back, height-adjustable gas lift and full-grain leather seat. Finished in a natural matte that ages gracefully.',
 '24 x 24 x 40 inches (L x W x H)', 14.00,
 'https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=1200&q=80'), 8, 0),

('FX-CHR-005', 'Cottage Walnut Windsor Dining Chair (Set of 2)', 'cottage-walnut-windsor-dining-chair-set', 'chairs', 'Walnut',
 'Walnut Finish', 16999.00, 21999.00,
 'Windsor-style walnut dining chairs (set of 2).',
 'A pair of traditional Windsor chairs in solid Walnut with spindle backs, saddle-shaped seats and turned legs. Comfortable for long family dinners; ages into a heirloom.',
 '18 x 20 x 36 inches (per chair)', 13.00,
 'https://images.unsplash.com/photo-1551298370-9d3d53740c72?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1551298370-9d3d53740c72?w=1200&q=80'), 12, 0),

('FX-CHR-006', 'Bistro Mango Bar Stool (Set of 2)', 'bistro-mango-bar-stool-set', 'chairs', 'Mango',
 'Natural Matte', 9999.00, 12999.00,
 'Backless Mango wood counter stools, set of 2.',
 'A pair of classic bistro-height bar stools in solid Mango with a natural matte finish. Round seat, four splayed legs, foot-ring for comfort. Counter height (26 inches).',
 '14 x 14 x 26 inches (per stool)', 9.00,
 'https://images.unsplash.com/photo-1611464908623-07f19927264e?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1611464908623-07f19927264e?w=1200&q=80'), 16, 0),

('FX-CHR-007', 'Loka Sheesham Armchair', 'loka-sheesham-armchair', 'chairs', 'Sheesham',
 'Honey Oak', 13999.00, 17999.00,
 'Sheesham armchair with curved arms and cane inlay.',
 'A compact armchair with solid Sheesham arms, cane-inlay side panels and a deep seat cushion. Perfect for reading nooks and smaller living rooms.',
 '26 x 28 x 34 inches (L x W x H)', 15.00,
 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=1200&q=80'), 9, 1),

-- ---------- More Storage (including Shoe Racks / Cabinets) ----------
('FX-STG-003', 'Pauda Sheesham Shoe Rack (3-Tier)', 'pauda-sheesham-shoe-rack-3-tier', 'storage', 'Sheesham',
 'Natural Matte', 7999.00, 10999.00,
 'Open 3-tier Sheesham shoe rack for entryways.',
 'A simple, sturdy 3-tier shoe rack in solid Sheesham. Holds up to 12 pairs of adult shoes. Slatted design keeps shoes ventilated; natural matte finish wipes clean.',
 '34 x 11 x 20 inches (L x W x H)', 12.00,
 'https://images.unsplash.com/photo-1558211583-d26f610c1eb1?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1558211583-d26f610c1eb1?w=1200&q=80'), 18, 0),

('FX-STG-004', 'Orion Teak Shoe Cabinet (4-Tier)', 'orion-teak-shoe-cabinet-4-tier', 'storage', 'Teak',
 'Honey Matte', 14999.00, 19999.00,
 'Closed 4-tier Teak shoe cabinet with tip-out doors.',
 'A dust-proof shoe cabinet in solid Teak with four tip-out doors. Holds up to 24 pairs behind clean closed doors. Soft-close hinges, integrated ventilation grilles, honey matte finish.',
 '40 x 10 x 48 inches (L x W x H)', 32.00,
 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1615529328331-f8917597711f?w=1200&q=80'), 8, 1),

('FX-STG-005', 'Havelock Mango 6-Drawer Chest', 'havelock-mango-6-drawer-chest', 'storage', 'Mango',
 'Charcoal Wash', 21999.00, 27999.00,
 'Six-drawer Mango chest for bedroom organisation.',
 'A generously sized six-drawer chest in solid Mango with soft-close runners, iron-handle hardware and a smoky charcoal wash finish. Deep drawers fit folded sweaters with room to spare.',
 '38 x 18 x 48 inches (L x W x H)', 58.00,
 'https://images.unsplash.com/photo-1616137422495-1e9e46e2aa77?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1616137422495-1e9e46e2aa77?w=1200&q=80'), 6, 0),

('FX-STG-006', 'Cielo Walnut TV Unit', 'cielo-walnut-tv-unit', 'storage', 'Walnut',
 'Dark Walnut', 26999.00, 33999.00,
 'Low-profile walnut TV unit with cable management.',
 'A 64-inch media console in solid Walnut with two cane-fronted doors, a central open shelf sized for a soundbar and integrated cable management. Holds TVs up to 75 inches.',
 '64 x 16 x 22 inches (L x W x H)', 44.00,
 'https://images.unsplash.com/photo-1593845984085-3412f0aec86a?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1593845984085-3412f0aec86a?w=1200&q=80'), 7, 1),

('FX-STG-007', 'Bayana Oak Credenza', 'bayana-oak-credenza', 'storage', 'Oak',
 'Natural Matte', 29999.00, 36999.00,
 'Mid-century oak credenza / sideboard.',
 'A mid-century sideboard in solid Oak with three doors, adjustable interior shelves, brass pull hardware and tapered legs. Perfect as a dining-room server or living-room storage statement.',
 '68 x 18 x 32 inches (L x W x H)', 56.00,
 'https://images.unsplash.com/photo-1572981779307-38e8c59dc22c?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1572981779307-38e8c59dc22c?w=1200&q=80'), 5, 1),

('FX-STG-008', 'Kairo Teak Linen Chest', 'kairo-teak-linen-chest', 'storage', 'Teak',
 'Honey Matte', 18999.00, 24999.00,
 'Classic teak linen trunk for bedroom end-of-bed.',
 'A hand-crafted blanket / linen chest in solid Teak with brass-bound corners, slow-close lid and cedar-lined interior to keep linen fresh. Doubles as an end-of-bed seat.',
 '44 x 20 x 20 inches (L x W x H)', 38.00,
 'https://images.unsplash.com/photo-1589834390005-5d4fb9bf3d32?w=900&q=80',
 JSON_ARRAY('https://images.unsplash.com/photo-1589834390005-5d4fb9bf3d32?w=1200&q=80'), 9, 0);
