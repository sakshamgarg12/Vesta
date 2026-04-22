-- =====================================================
-- FurniX - Seed data (real product catalogue)
-- Run after schema.sql
-- =====================================================

USE furnix_db;

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
