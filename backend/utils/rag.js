/**
 * Vesta — Product RAG (Retrieval-Augmented Generation) helper.
 *
 * Builds an in-memory vector index over the product catalog using a small
 * local embedding model (all-MiniLM-L6-v2, ~25MB, CPU-friendly) served by
 * @xenova/transformers. No external embedding API key required.
 *
 * Public API:
 *   initRAG()                      -> preload model + build the index
 *   refreshCatalog()               -> rebuild embeddings (call after product edits)
 *   retrieve(query, { k, filters })-> top-k products semantically matched
 *   getStats()                     -> diagnostic counts / status
 *
 * The index is lazy: first call auto-builds. After that, refresh is cheap
 * because only query embedding is computed per request.
 */

const { pool } = require('../db');

let _pipelinePromise = null;
let _embedder = null;
let _catalog = [];        // array of products with numeric price etc.
let _vectors = [];        // array of Float32Array, aligned with _catalog
let _buildingPromise = null;
let _lastBuiltAt = 0;

/* --------------------------------------------------------------------------
 * Model loader
 * -------------------------------------------------------------------------- */
async function getEmbedder() {
  if (_embedder) return _embedder;
  if (!_pipelinePromise) {
    _pipelinePromise = (async () => {
      // Dynamic import: @xenova/transformers is ESM-only.
      const { pipeline, env } = await import('@xenova/transformers');
      // Prefer cached models; don't try to hit the network after first load.
      env.allowRemoteModels = true;
      env.allowLocalModels = true;
      const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true, // int8 quantized — faster on CPU, near-identical quality
      });
      _embedder = pipe;
      return pipe;
    })();
  }
  return _pipelinePromise;
}

/* --------------------------------------------------------------------------
 * Embed one string -> Float32Array (unit-normalized)
 * -------------------------------------------------------------------------- */
async function embed(text) {
  const pipe = await getEmbedder();
  const out = await pipe(String(text || '').slice(0, 2000), {
    pooling: 'mean',
    normalize: true,
  });
  // `out.data` is a TypedArray (Float32Array)
  return out.data;
}

/* --------------------------------------------------------------------------
 * Build the RAG "document" string for a product.
 * We include everything a sales assistant might need to answer questions:
 * name, category, wood, finish, price, dimensions, and descriptions.
 * -------------------------------------------------------------------------- */
function buildDoc(p) {
  const priceINR = `Rs ${Number(p.price).toLocaleString('en-IN')}`;
  const mrpINR   = p.mrp != null ? `, MRP Rs ${Number(p.mrp).toLocaleString('en-IN')}` : '';
  const parts = [
    `Product: ${p.name}`,
    `Category: ${p.category}`,
    `Wood: ${p.wood_type}, Finish: ${p.finish || 'Natural Matte'}`,
    `Price: ${priceINR}${mrpINR}`,
    p.dimensions ? `Dimensions: ${p.dimensions}` : null,
    p.weight_kg  ? `Weight: ${p.weight_kg} kg` : null,
    p.short_desc || null,
    p.long_desc  || null,
  ].filter(Boolean);
  return parts.join('. ');
}

/* --------------------------------------------------------------------------
 * Build / refresh the catalog index.
 * -------------------------------------------------------------------------- */
async function refreshCatalog() {
  if (_buildingPromise) return _buildingPromise;
  _buildingPromise = (async () => {
    const [rows] = await pool.query(
      `SELECT id, sku, name, slug, category, wood_type, finish, price, mrp,
              short_desc, long_desc, dimensions, weight_kg, image_url, stock, is_featured
         FROM products
        WHERE is_active = 1
        ORDER BY is_featured DESC, id ASC`,
    );
    const docs = rows.map(buildDoc);
    // Embed sequentially — a dozen-ish products embeds in <2s on CPU.
    const vectors = [];
    for (const doc of docs) {
      const v = await embed(doc);
      vectors.push(v);
    }
    _catalog = rows.map(r => ({
      ...r,
      price: Number(r.price),
      mrp: r.mrp != null ? Number(r.mrp) : null,
      weight_kg: r.weight_kg != null ? Number(r.weight_kg) : null,
    }));
    _vectors = vectors;
    _lastBuiltAt = Date.now();
    console.log(`[rag] Indexed ${_catalog.length} products.`);
    return { count: _catalog.length };
  })().finally(() => { _buildingPromise = null; });
  return _buildingPromise;
}

async function initRAG() {
  try {
    await getEmbedder();
    await refreshCatalog();
    return true;
  } catch (err) {
    console.warn('[rag] init failed — chatbot will lazy-init on first query:', err.message);
    return false;
  }
}

/* --------------------------------------------------------------------------
 * Cosine similarity between two unit-normalized vectors.
 * -------------------------------------------------------------------------- */
function cosine(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/* --------------------------------------------------------------------------
 * Retrieve top-k semantically similar products, optionally pre-filtered by
 * category / price-range / wood type / in-stock.
 * -------------------------------------------------------------------------- */
async function retrieve(query, { k = 6, filters = {} } = {}) {
  if (!_catalog.length) await refreshCatalog();
  if (!_catalog.length) return [];

  const qVec = await embed(query);

  const {
    category,
    wood,
    minPrice,
    maxPrice,
    inStockOnly = true,
  } = filters;

  const scored = [];
  for (let i = 0; i < _catalog.length; i++) {
    const p = _catalog[i];
    if (inStockOnly && p.stock <= 0) continue;
    if (category && p.category !== category) continue;
    if (wood && p.wood_type !== wood) continue;
    if (minPrice != null && p.price < minPrice) continue;
    if (maxPrice != null && p.price > maxPrice) continue;

    const score = cosine(qVec, _vectors[i]);
    scored.push({ product: p, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

function getStats() {
  return {
    ready: _catalog.length > 0,
    products: _catalog.length,
    model_loaded: !!_embedder,
    last_built_at: _lastBuiltAt ? new Date(_lastBuiltAt).toISOString() : null,
  };
}

module.exports = {
  initRAG,
  refreshCatalog,
  retrieve,
  getStats,
};
