/**
 * Vesta — Smart Chatbot (Customer Assistant)
 *
 * POST /api/chat
 *   body: {
 *     messages: [{ role: 'user'|'assistant', content: string }, ...],
 *     filters?: { category?, wood?, minPrice?, maxPrice? }
 *   }
 *   200: { reply, products: [{ id, sku, name, slug, ... }], meta }
 *   503: { error } when GROQ_API_KEY is not configured
 *
 * GET /api/chat/health
 *   Reports whether the chatbot is configured + RAG index is ready.
 *
 * Uses Groq's OpenAI-compatible API for generation + local embeddings
 * (Xenova/all-MiniLM-L6-v2) for product retrieval.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const { pool } = require('../db');
const { retrieve, getStats, refreshCatalog } = require('../utils/rag');

const router = express.Router();

/* --------------------------------------------------------------------------
 * Groq client (OpenAI-compatible)
 * -------------------------------------------------------------------------- */
let _client = null;
function getClient() {
  if (!process.env.GROQ_API_KEY) return null;
  if (_client) return _client;
  _client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  return _client;
}
function isConfigured() { return !!process.env.GROQ_API_KEY; }

const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const RAG_TOP_K = Math.max(1, Math.min(12, parseInt(process.env.RAG_TOP_K || '6', 10)));

/* --------------------------------------------------------------------------
 * System prompt
 * -------------------------------------------------------------------------- */
const SYSTEM_PROMPT = `
You are "Vesta Assistant" — a warm, knowledgeable salesperson for Vesta, a
premium solid-wood furniture brand from Jodhpur, India. You help customers
find the right piece for their home.

Store facts (reference these naturally when relevant):
- All furniture is solid wood — Teak, Sheesham, Mango, Oak, Walnut. No particle
  board or veneer.
- 10-year warranty against frame/joint defects.
- Free white-glove delivery (unpacked + assembled) on orders above Rs 25,000.
- 7-day no-questions-asked returns.
- Coupons: WOOD20 = 20% off, FIRSTBED = flat Rs 2,000 off (min subtotal Rs 10,000).
- 18% GST is included in displayed prices where applicable.
- Contact email: contactVesta@gmail.com. Phone: +91-7583777875.
- Customers can track orders at /track.html with order number + phone/email.

Strict rules:
1. You will be given a CONTEXT block of candidate products retrieved from the
   catalog. ONLY recommend from that context. NEVER invent products, prices,
   or IDs. If nothing in the context matches, say so honestly and suggest a
   related category or ask a clarifying question.
2. When you recommend products, mention them naturally (e.g. "The Malabar Teak
   Bed is a great fit…") and ALWAYS list their numeric IDs in the final JSON.
3. Keep replies concise — 2 to 5 short sentences, plus a 1-2 line closer.
   Avoid wall-of-text. Use a friendly, helpful tone. No emojis.
4. If the customer's question is vague (e.g. "show me sofas"), ask ONE
   clarifying question (budget, room size, preferred wood) before overwhelming
   them with options.
5. For questions unrelated to furniture, shipping, orders, or the store
   (e.g. coding help, jokes, politics), politely steer back: "I'm here to help
   you find furniture — did you have something in mind for your home?"
6. Never quote prices the context doesn't show. If a price changes, say
   "please check the product page for the current price."
7. OUTPUT FORMAT — return a strict JSON object and NOTHING else:
   {
     "reply": "<your message to the customer, plain text, 1-5 sentences>",
     "product_ids": [<integer ids in recommended order, 0-5 items>]
   }
   No markdown fences, no prose before or after the JSON.`;

/* --------------------------------------------------------------------------
 * Very lightweight filter extraction from the user's latest message.
 * The LLM still does the heavy lifting; this just narrows retrieval so we
 * don't waste context on clearly irrelevant items.
 * -------------------------------------------------------------------------- */
const CATEGORY_WORDS = {
  beds: ['bed', 'beds', 'bedframe', 'bedframes'],
  sofas: ['sofa', 'sofas', 'couch', 'couches', 'settee', 'loveseat'],
  tables: ['table', 'tables', 'desk', 'dining', 'coffee table', 'study table'],
  chairs: ['chair', 'chairs', 'armchair', 'recliner'],
  storage: ['storage', 'wardrobe', 'cabinet', 'cupboard', 'shelf', 'shelves', 'bookshelf', 'sideboard', 'dresser', 'chest of drawers'],
};
const WOOD_WORDS = ['teak', 'sheesham', 'mango', 'oak', 'walnut'];

function extractHeuristicFilters(text) {
  const t = String(text || '').toLowerCase();
  const out = {};
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    if (words.some(w => t.includes(w))) { out.category = cat; break; }
  }
  for (const w of WOOD_WORDS) {
    if (t.includes(w)) { out.wood = w[0].toUpperCase() + w.slice(1); break; }
  }
  // Match "under 20k", "below 15000", "less than 30,000", "budget 25000"
  const kMatch = t.match(/(?:under|below|less than|within|max|budget|upto|up to)\s*(?:rs\.?|₹)?\s*(\d+(?:[\.,]\d+)?)\s*(k|thousand|lakh)?/i);
  if (kMatch) {
    let n = parseFloat(kMatch[1].replace(/,/g, ''));
    const unit = (kMatch[2] || '').toLowerCase();
    if (unit === 'k' || unit === 'thousand') n *= 1000;
    if (unit === 'lakh') n *= 100000;
    if (!isNaN(n) && n > 0) out.maxPrice = Math.round(n);
  }
  return out;
}

/* --------------------------------------------------------------------------
 * Build the CONTEXT block the LLM sees.
 * Very compact — we let the LLM pick the IDs from here.
 * -------------------------------------------------------------------------- */
function buildContextBlock(retrieved) {
  if (!retrieved.length) {
    return 'CONTEXT: No products currently match this query.';
  }
  const lines = retrieved.map(({ product: p, score }) => {
    const priceINR = `Rs ${p.price.toLocaleString('en-IN')}`;
    const mrpPart  = p.mrp ? ` (MRP Rs ${p.mrp.toLocaleString('en-IN')})` : '';
    const stockPart = p.stock > 0 ? `${p.stock} in stock` : 'OUT OF STOCK';
    const desc = String(p.short_desc || '').slice(0, 180);
    return `- id=${p.id} | ${p.name} [${p.category}, ${p.wood_type}] — ${priceINR}${mrpPart} — ${stockPart}${desc ? ` — ${desc}` : ''} (match=${score.toFixed(2)})`;
  });
  return `CONTEXT (candidate products retrieved for this question):\n${lines.join('\n')}`;
}

/* --------------------------------------------------------------------------
 * Safe JSON parse (Groq + Llama sometimes add stray markdown fences).
 * -------------------------------------------------------------------------- */
function safeParseJSON(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(s); } catch (_) {}
  const first = s.indexOf('{'); const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch (_) {}
  }
  return null;
}

/* --------------------------------------------------------------------------
 * Input hardening
 * -------------------------------------------------------------------------- */
const MAX_HISTORY  = 12;           // keep last N turns
const MAX_MSG_CHARS = 1000;        // per-message cap
function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const ok = raw
    .filter(m => m && typeof m === 'object' && typeof m.content === 'string')
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.slice(0, MAX_MSG_CHARS).trim(),
    }))
    .filter(m => m.content.length > 0);
  // Always end with a user message
  while (ok.length && ok[ok.length - 1].role !== 'user') ok.pop();
  return ok.slice(-MAX_HISTORY);
}

/* --------------------------------------------------------------------------
 * Rate limit — chatbots are cheap but still abusable.
 * 30 messages / 5 min / IP should cover real users comfortably.
 * -------------------------------------------------------------------------- */
const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You\'re chatting a bit fast. Please wait a few minutes and try again.' },
});

/* --------------------------------------------------------------------------
 * Routes
 * -------------------------------------------------------------------------- */
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    configured: isConfigured(),
    model: isConfigured() ? DEFAULT_MODEL : null,
    rag: getStats(),
  });
});

router.post('/', chatLimiter, async (req, res, next) => {
  try {
    const client = getClient();
    if (!client) {
      return res.status(503).json({
        error: "The chat assistant isn't available right now. Please try again later or contact us at contactVesta@gmail.com.",
      });
    }

    const messages = sanitizeMessages(req.body?.messages);
    if (messages.length === 0) {
      return res.status(400).json({ error: 'Please send at least one user message.' });
    }

    const lastUser = messages[messages.length - 1].content;
    const bodyFilters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
    const filters = { ...extractHeuristicFilters(lastUser), ...bodyFilters };

    // Retrieve relevant products via local vector search.
    let retrieved = await retrieve(lastUser, { k: RAG_TOP_K, filters });
    // If filters were too restrictive and nothing came back, retry without them.
    if (retrieved.length === 0 && (filters.category || filters.wood || filters.maxPrice || filters.minPrice)) {
      retrieved = await retrieve(lastUser, { k: RAG_TOP_K, filters: {} });
    }

    const contextBlock = buildContextBlock(retrieved);

    const started = Date.now();
    let completion;
    try {
      completion = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: contextBlock },
          ...messages,
        ],
      });
    } catch (err) {
      const msg = String(err?.message || err);
      console.warn('[chat] Groq call failed:', msg.slice(0, 200));
      if (/\b(401|403|invalid.*key|unauthorized|forbidden)\b/i.test(msg)) {
        return res.status(500).json({ error: 'Chat assistant is misconfigured. The site owner has been notified.' });
      }
      if (/\b(429|quota|rate limit|503|overload|unavail)\b/i.test(msg)) {
        return res.status(503).json({ error: 'The chat assistant is busy right now. Please try again in a minute.' });
      }
      return res.status(502).json({ error: 'The chat assistant hit a snag. Please try again.' });
    }

    const rawText = completion?.choices?.[0]?.message?.content || '';
    const parsed = safeParseJSON(rawText);

    // Primary happy path: model returned JSON.
    let reply = '';
    let productIds = [];
    if (parsed && typeof parsed === 'object') {
      reply = String(parsed.reply || '').slice(0, 1200).trim();
      if (Array.isArray(parsed.product_ids)) {
        productIds = parsed.product_ids
          .map(n => parseInt(n, 10))
          .filter(n => Number.isInteger(n));
      }
    }
    // Fallback: treat entire text as a plain reply.
    if (!reply) {
      reply = (rawText || '').replace(/^```.*?\n|```$/gs, '').slice(0, 1200).trim() ||
              "I couldn't come up with a good answer for that — could you rephrase?";
    }

    // Whitelist recommended IDs against the retrieved candidates (so the model
    // can't accidentally hallucinate IDs from outside the context).
    const allowedIds = new Set(retrieved.map(r => r.product.id));
    productIds = Array.from(new Set(productIds.filter(id => allowedIds.has(id)))).slice(0, 5);

    // Hydrate full product objects for the frontend.
    let products = [];
    if (productIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT id, sku, name, slug, category, wood_type, finish, price, mrp,
                short_desc, dimensions, image_url, stock
           FROM products WHERE id IN (?)`,
        [productIds],
      );
      const byId = new Map(rows.map(r => [r.id, r]));
      products = productIds.map(id => byId.get(id)).filter(Boolean).map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        slug: p.slug,
        category: p.category,
        wood_type: p.wood_type,
        finish: p.finish,
        price: Number(p.price),
        mrp: p.mrp != null ? Number(p.mrp) : null,
        short_desc: p.short_desc,
        dimensions: p.dimensions,
        image_url: p.image_url,
        stock: p.stock,
      }));
    }

    res.json({
      reply,
      products,
      meta: {
        model: DEFAULT_MODEL,
        retrieved_count: retrieved.length,
        filters_used: filters,
        elapsed_ms: Date.now() - started,
      },
    });
  } catch (err) { next(err); }
});

// Admin: rebuild the vector index (e.g. after a product seed/edit).
router.post('/reindex', async (req, res, next) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    const out = await refreshCatalog();
    res.json({ ok: true, ...out });
  } catch (err) { next(err); }
});

module.exports = router;
