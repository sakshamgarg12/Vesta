/**
 * AI Room Stylist — Gemini-powered product recommender.
 *
 * POST /api/ai/suggest
 *   body: {
 *     image:    string  // "data:image/jpeg;base64,...." OR raw base64
 *     category: 'beds' | 'sofas' | 'tables' | 'dining_tables' | 'chairs' | 'storage' | 'any'
 *     notes?:   string  // optional free-text preferences
 *     count?:   number  // default 5, max 8
 *   }
 *   200: { room_analysis, recommendations: [...], general_advice }
 *   400/422: { error }
 *   503: { error } when GEMINI_API_KEY is not configured
 *
 * GET /api/ai/health
 *   Reports whether the Gemini key is configured (used to gate the UI).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');

const router = express.Router();

/* --------------------------------------------------------------------------
 * Configuration + lazy Gemini client
 *
 * MODEL_NAMES is an ordered fallback chain. We try the first model; if it
 * returns a retryable error after all in-model retries, we fall through to
 * the next model. This makes the AI Stylist resilient to per-model outages
 * on Gemini's free tier (e.g. 2.5-flash spiking demand while 2.5-flash-lite
 * is still available).
 *
 * Override with GEMINI_MODEL (single model) or GEMINI_MODELS (comma-sep list).
 * -------------------------------------------------------------------------- */
const DEFAULT_MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
];
const MODEL_NAMES = (() => {
  if (process.env.GEMINI_MODELS) {
    return process.env.GEMINI_MODELS.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (process.env.GEMINI_MODEL) {
    // Still prepend the explicit model, but keep fallbacks after it.
    const primary = process.env.GEMINI_MODEL.trim();
    return [primary, ...DEFAULT_MODEL_CHAIN.filter(m => m !== primary)];
  }
  return DEFAULT_MODEL_CHAIN.slice();
})();
const MODEL_NAME = MODEL_NAMES[0]; // primary, reported in /health + meta

let _genAI = null;

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (_genAI) return _genAI;
  try {
    // Lazy-require so the app still boots if the SDK is missing in some envs.
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    return _genAI;
  } catch (err) {
    console.warn('[ai] @google/generative-ai SDK not available:', err.message);
    return null;
  }
}

function isConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

/* --------------------------------------------------------------------------
 * Input helpers
 * -------------------------------------------------------------------------- */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB after base64 decode
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Maps the UI category chip to the DB `category` column.
 * The DB enum is: beds, sofas, tables, chairs, storage
 * We also accept "dining_tables" from the UI and map it to "tables"
 * (the LLM is nudged to prefer dining pieces in that case).
 */
function resolveCategory(input) {
  const v = String(input || 'any').toLowerCase().trim();
  if (v === 'any' || v === 'all' || v === '') return { dbCategory: null, hint: null };
  if (v === 'dining_tables' || v === 'dining') {
    return { dbCategory: 'tables', hint: 'The customer is specifically looking for a DINING TABLE. Prefer larger tables that seat multiple people.' };
  }
  if (['beds', 'sofas', 'tables', 'chairs', 'storage'].includes(v)) {
    return { dbCategory: v, hint: null };
  }
  return { dbCategory: null, hint: null, invalid: true };
}

function parseDataUri(input) {
  const s = String(input || '').trim();
  if (!s) return { ok: false, error: 'No image provided.' };

  let mime = 'image/jpeg';
  let b64 = s;
  const m = s.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
  if (m) { mime = m[1].toLowerCase(); b64 = m[2]; }

  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, error: `Unsupported image type ${mime}. Please upload a JPG, PNG or WebP.` };
  }
  // Rough size check before decoding (base64 is ~4/3 the size).
  if (b64.length * 0.75 > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image is too large. Please keep it under 4 MB.' };
  }
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch (_) {
    return { ok: false, error: 'Image could not be decoded.' };
  }
  if (buf.length < 2000) {
    return { ok: false, error: 'Image is too small or empty.' };
  }
  return { ok: true, mime, base64: b64, bytes: buf.length };
}

/* --------------------------------------------------------------------------
 * Catalog passed to the LLM.
 * We only send a compact, LLM-friendly subset so the prompt stays small.
 * -------------------------------------------------------------------------- */
async function loadCatalog({ dbCategory }) {
  const params = [];
  let sql = `
    SELECT id, name, slug, category, wood_type, finish, price, mrp,
           short_desc, long_desc, dimensions, is_featured
      FROM products
     WHERE is_active = 1 AND stock > 0`;
  if (dbCategory) {
    sql += ' AND category = ?';
    params.push(dbCategory);
  }
  sql += ' ORDER BY is_featured DESC, id ASC LIMIT 60';
  const [rows] = await pool.query(sql, params);
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category,
    wood: r.wood_type,
    finish: r.finish,
    price_inr: Number(r.price),
    mrp_inr: r.mrp != null ? Number(r.mrp) : null,
    dimensions: r.dimensions,
    featured: !!r.is_featured,
    // Truncate descriptions to keep the prompt compact.
    description: [r.short_desc, r.long_desc].filter(Boolean).join(' ').slice(0, 320),
  }));
}

/* --------------------------------------------------------------------------
 * Prompt construction — the secret sauce.
 * The LLM is forced into a strict JSON schema and told to ONLY pick from
 * the supplied product IDs.
 * -------------------------------------------------------------------------- */
const SYSTEM_INSTRUCTION = `
You are Vesta's in-house interior-design AI — warm, concise, and tastefully
opinionated like a thoughtful senior stylist. Your job: given a photo of the
customer's room and a shortlist of real furniture from the Vesta catalog,
pick the best-suited pieces for THIS specific room.

Strict rules:
1. You may ONLY recommend items from the provided catalog, referenced by their
   numeric "id". NEVER invent products, names, or IDs.
2. Respect the "preferred_category" filter when present. If no suitable match
   exists in the filter, return fewer recommendations rather than off-topic ones.
3. Base reasoning on what you can actually see: colour palette, lighting,
   existing furniture, room size/proportions, floor type, wall decor, and
   overall style (traditional, modern, industrial, scandinavian, rustic, etc.).
4. Keep every "reason" under 40 words, grounded in the photo (e.g. "the rich
   teak tone echoes your wooden ceiling beams and suits the warm natural light").
5. match_score is a 0–100 integer reflecting how confident you are this piece
   fits the room.
6. Your tone: friendly, specific, never generic. Avoid filler like "Great
   choice!" — be useful.
7. If the image is not a room (e.g. a selfie, a blank wall, a screenshot),
   set "is_room": false and leave recommendations empty with a helpful
   "general_advice" telling the user to send a wider room photo.

8. PLACEMENT — VERY IMPORTANT. For every recommendation, also return a
   "placement" object telling the frontend exactly WHERE the piece would
   physically sit in the customer's room photo, so the site can visually
   composite the item into the scene.
   - "bbox" is the normalized 0-1 bounding box where the front-facing face
     of the piece should appear in the photo. Coordinates are measured from
     the TOP-LEFT of the image: x (horizontal start), y (vertical start),
     w (width), h (height). Example: {"x":0.20,"y":0.55,"w":0.50,"h":0.30}
     means "starts 20% from the left and 55% down, spans half the width
     and 30% of the height".
   - Size the bbox so the furniture looks REALISTICALLY SCALED in the room
     (a king bed should dominate a small bedroom; a dining table should fit
     between visible chairs; a bookshelf should reach ~60-80% of wall height).
   - "anchor" tells the renderer which wall/area of the room the item sits
     against: one of "floor_center", "floor_left", "floor_right", "back_wall",
     "left_wall", "right_wall", "corner_left", "corner_right".
   - "facing" is how the piece is oriented relative to the camera:
     "front", "three_quarter_left", "three_quarter_right", "side", "back".
     (Pick the orientation that best matches what the customer would see
     when entering the room.)
   - "floor_y" is the normalized y-coordinate of the floor line at that spot
     (helps the frontend drop the shadow correctly).
   - "confidence" is 0-100: how sure you are the placement is physically
     sensible given the photo.
   Be CONSERVATIVE — if the room is mostly occluded or you can't see a clear
   floor, pick a small, safe bbox and a low "confidence".

9. Output MUST be valid JSON matching the required schema. Do not include
   markdown fences or prose outside the JSON object.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    is_room: { type: 'boolean' },
    room_analysis: {
      type: 'object',
      properties: {
        style:         { type: 'string', description: 'E.g. "traditional Indian", "modern minimalist", "industrial", "scandinavian"' },
        colours:       { type: 'array', items: { type: 'string' }, description: '3-5 dominant colours, plain words ("warm beige", "charcoal grey")' },
        lighting:      { type: 'string', description: 'E.g. "bright natural", "dim warm", "mixed"' },
        size_impression: { type: 'string', description: 'E.g. "spacious", "compact", "medium"' },
        existing_notes: { type: 'string', description: 'One line about existing furniture / decor that influenced the picks.' },
      },
      required: ['style', 'colours', 'lighting', 'size_impression'],
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product_id:  { type: 'integer', description: 'One of the IDs from the catalog.' },
          reason:      { type: 'string', description: 'Why this piece fits THIS room (<=40 words).' },
          match_score: { type: 'integer', minimum: 0, maximum: 100 },
          placement: {
            type: 'object',
            description: 'Where and how to composite this piece into the room photo.',
            properties: {
              bbox: {
                type: 'object',
                description: 'Normalized 0-1 bounding box in the room photo (top-left origin).',
                properties: {
                  x: { type: 'number', minimum: 0, maximum: 1 },
                  y: { type: 'number', minimum: 0, maximum: 1 },
                  w: { type: 'number', minimum: 0.05, maximum: 1 },
                  h: { type: 'number', minimum: 0.05, maximum: 1 },
                },
                required: ['x', 'y', 'w', 'h'],
              },
              anchor:     { type: 'string', description: 'floor_center | floor_left | floor_right | back_wall | left_wall | right_wall | corner_left | corner_right' },
              facing:     { type: 'string', description: 'front | three_quarter_left | three_quarter_right | side | back' },
              floor_y:    { type: 'number', minimum: 0, maximum: 1, description: 'Normalized y of the floor line under the piece.' },
              confidence: { type: 'integer', minimum: 0, maximum: 100 },
            },
            required: ['bbox', 'anchor', 'facing', 'confidence'],
          },
        },
        required: ['product_id', 'reason', 'match_score', 'placement'],
      },
    },
    general_advice: { type: 'string', description: 'One warm sentence with styling tips for the room.' },
  },
  required: ['is_room', 'room_analysis', 'recommendations', 'general_advice'],
};

function buildUserPrompt({ catalog, categoryHint, notes, count }) {
  const catalogJson = JSON.stringify(catalog, null, 0);
  const notesLine = notes ? `\nCustomer's preferences / notes: """${notes.trim().slice(0, 400)}"""` : '';
  const catHint = categoryHint ? `\nCategory hint: ${categoryHint}` : '';

  return `
Here is the customer's room photo and the Vesta catalog shortlist.

Pick the TOP ${count} pieces that would look best in THIS specific room — with a concise, photo-grounded reason for each. ${catHint}${notesLine}

For EACH recommendation, also decide a realistic "placement" (bbox, anchor, facing, floor_y, confidence) as described in the system instructions — these coordinates will be used by the website to visually composite the piece into the very same photo the customer uploaded, so be spatially careful: respect the visible floor, walls, windows, doors, and existing furniture. If a piece doesn't fit anywhere safely, omit it rather than force a placement.

Catalog (array of {id, name, category, wood, finish, price_inr, mrp_inr, dimensions, featured, description}):
${catalogJson}
`.trim();
}

/* --------------------------------------------------------------------------
 * Sanitize the LLM's placement output so the frontend gets safe, bounded
 * numbers. Defaults provide a reasonable "floor-centered lower half"
 * fallback when the LLM forgets a field or hallucinates wild coordinates.
 * -------------------------------------------------------------------------- */
const ALLOWED_ANCHORS = new Set([
  'floor_center', 'floor_left', 'floor_right',
  'back_wall', 'left_wall', 'right_wall',
  'corner_left', 'corner_right',
]);
const ALLOWED_FACINGS = new Set([
  'front', 'three_quarter_left', 'three_quarter_right', 'side', 'back',
]);
function clamp01(n, def) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.max(0, Math.min(1, v));
}
function sanitizePlacement(p) {
  p = p && typeof p === 'object' ? p : {};
  const b = p.bbox && typeof p.bbox === 'object' ? p.bbox : {};
  let x = clamp01(b.x, 0.25);
  let y = clamp01(b.y, 0.45);
  let w = clamp01(b.w, 0.50);
  let h = clamp01(b.h, 0.35);
  // Guarantee the bbox stays inside the image.
  if (x + w > 1) w = Math.max(0.05, 1 - x);
  if (y + h > 1) h = Math.max(0.05, 1 - y);
  return {
    bbox: { x, y, w, h },
    anchor:     ALLOWED_ANCHORS.has(p.anchor) ? p.anchor : 'floor_center',
    facing:     ALLOWED_FACINGS.has(p.facing) ? p.facing : 'front',
    floor_y:    clamp01(p.floor_y, y + h),
    confidence: Math.max(0, Math.min(100, parseInt(p.confidence, 10) || 50)),
  };
}

/* --------------------------------------------------------------------------
 * Safely parse LLM output. Gemini in JSON-mode returns valid JSON; we still
 * try to salvage if a stray \`\`\` appears.
 * -------------------------------------------------------------------------- */
function safeParseJSON(text) {
  if (!text) return null;
  let s = String(text).trim();
  // Strip accidental ```json fences.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(s); } catch (_) { /* fall through */ }
  // Last-ditch: find the outermost { ... } block.
  const first = s.indexOf('{'); const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch (_) {}
  }
  // Truncated-response salvage: if Gemini was cut off mid-array,
  // keep only the complete recommendation objects we can parse.
  const salvaged = salvageTruncatedJSON(s);
  if (salvaged) return salvaged;
  return null;
}

/**
 * Gemini occasionally truncates long JSON when hitting MAX_TOKENS. We try
 * to recover by closing off unterminated strings/arrays/objects and
 * keeping only fully-formed recommendations.
 */
function salvageTruncatedJSON(s) {
  if (!s || !s.includes('"recommendations"')) return null;
  // Find the start of the recommendations array.
  const recIdx = s.indexOf('"recommendations"');
  const bracketIdx = s.indexOf('[', recIdx);
  if (bracketIdx < 0) return null;

  // Walk forwards collecting complete top-level objects inside the array.
  const recs = [];
  let i = bracketIdx + 1;
  while (i < s.length) {
    // skip whitespace + commas
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (s[i] === ']' || i >= s.length) break;
    if (s[i] !== '{') break;
    // Find the matching closing brace (respecting strings and escapes).
    let depth = 0, inStr = false, esc = false;
    const start = i;
    for (; i < s.length; i++) {
      const c = s[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    if (depth !== 0) break; // truncated object — stop
    try { recs.push(JSON.parse(s.slice(start, i))); } catch (_) { break; }
  }

  // Pull room_analysis if it parses standalone
  let room_analysis = null;
  const roomMatch = s.match(/"room_analysis"\s*:\s*\{/);
  if (roomMatch) {
    let j = roomMatch.index + roomMatch[0].length - 1; // at the '{'
    let depth = 0, inStr = false, esc = false, start = j;
    for (; j < s.length; j++) {
      const c = s[j];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { j++; break; }
      }
    }
    if (depth === 0) {
      try { room_analysis = JSON.parse(s.slice(start, j)); } catch (_) {}
    }
  }

  if (recs.length === 0 && !room_analysis) return null;
  console.warn(`[ai] Salvaged ${recs.length} complete recommendations from truncated response.`);
  return {
    is_room: true,
    room_analysis,
    recommendations: recs,
    general_advice: '',
  };
}

/* --------------------------------------------------------------------------
 * Retry Gemini calls on transient 429 / 503 overload errors with
 * exponential backoff + jitter. Up to 3 tries, ~5 s total wall-time.
 * Gemini 2.5 Flash's free tier occasionally returns 503 ("high demand"),
 * so this dramatically reduces user-visible failures.
 * -------------------------------------------------------------------------- */
const RETRYABLE = /(429|503|overload|unavail|quota exceeded|rate limit)/i;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function generateWithRetry(model, parts, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await model.generateContent(parts);
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message || err);
      const retryable = RETRYABLE.test(msg);
      if (!retryable || i === attempts - 1) throw err;
      const delay = 400 * Math.pow(2, i) + Math.floor(Math.random() * 250); // 400, 800, 1600 + jitter
      console.warn(`[ai] Gemini transient error (attempt ${i + 1}/${attempts}) — retrying in ${delay}ms: ${msg.slice(0, 140)}`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/* --------------------------------------------------------------------------
 * Rate limit: AI calls are relatively expensive; cap at 8 / 10 min / IP.
 * -------------------------------------------------------------------------- */
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You\'re analysing rooms too quickly — please wait a few minutes and try again.' },
});

/* --------------------------------------------------------------------------
 * Routes
 * -------------------------------------------------------------------------- */
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    configured: isConfigured(),
    model: isConfigured() ? MODEL_NAME : null,
  });
});

router.post('/suggest', aiLimiter, async (req, res, next) => {
  try {
    const client = getGeminiClient();
    if (!client) {
      return res.status(503).json({
        error: 'AI Stylist isn\'t available right now. Please try again later or contact us.',
      });
    }

    const { image, category, notes, count } = req.body || {};
    const cat = resolveCategory(category);
    if (cat.invalid) {
      return res.status(400).json({ error: `Unknown category "${category}".` });
    }

    const img = parseDataUri(image);
    if (!img.ok) return res.status(400).json({ error: img.error });

    const num = Math.max(1, Math.min(8, parseInt(count || 5, 10) || 5));

    const catalog = await loadCatalog({ dbCategory: cat.dbCategory });
    if (catalog.length === 0) {
      return res.status(200).json({
        is_room: true,
        room_analysis: null,
        recommendations: [],
        general_advice: 'We don\'t have in-stock items matching that category right now. Try "Any category" or contact us for a custom build.',
      });
    }

    const userPrompt = buildUserPrompt({
      catalog,
      categoryHint: cat.hint,
      notes,
      count: num,
    });

    const started = Date.now();
    let text, modelUsed = null, lastErr = null;
    for (const modelName of MODEL_NAMES) {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.6,
          // Higher budget — the placement schema adds ~120 tokens per
          // recommendation, so 5 picks + room analysis comfortably need 4k+.
          maxOutputTokens: 6144,
        },
        // Permissive safety — we're dealing with room photos.
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      });
      try {
        const result = await generateWithRetry(model, [
          { text: userPrompt },
          { inlineData: { mimeType: img.mime, data: img.base64 } },
        ]);
        text = result.response.text();
        modelUsed = modelName;
        // Warn if Gemini truncated the output — helps diagnose token-limit issues.
        const finishReason = result.response?.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== 'STOP') {
          console.warn(`[ai] ${modelName} finishReason=${finishReason} — response may be truncated (len=${text.length})`);
        }
        break; // success
      } catch (err) {
        lastErr = err;
        const msg = String(err && err.message || err);
        // If it's a retryable error AND we have more models to try, fall through.
        if (RETRYABLE.test(msg) && modelName !== MODEL_NAMES[MODEL_NAMES.length - 1]) {
          console.warn(`[ai] ${modelName} unavailable, falling back to next model.`);
          continue;
        }
        // Non-retryable (auth/invalid) OR last model — break and let the code below decide.
        break;
      }
    }

    if (!text) {
      const msg = String(lastErr && lastErr.message || lastErr);
      console.warn('[ai] All models failed:', msg);
      if (/\b(429|503|overload|unavail|quota|rate)\b/i.test(msg)) {
        return res.status(503).json({
          error: 'The AI Stylist is experiencing high demand. Please try again in about a minute.',
          retry_after_seconds: 45,
        });
      }
      if (/API key|permission|invalid|forbidden|401|403/i.test(msg)) {
        return res.status(500).json({
          error: 'AI Stylist is misconfigured. The site owner has been notified.',
        });
      }
      return res.status(502).json({
        error: 'Our AI stylist hit a snag. Please try again in a moment.',
      });
    }
    const elapsedMs = Date.now() - started;

    const parsed = safeParseJSON(text);
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[ai] Could not parse LLM response:', text?.slice(0, 300));
      return res.status(502).json({
        error: 'The AI returned an unexpected response. Please try again.',
      });
    }

    // Whitelist the returned product IDs against the catalog we sent.
    const validIds = new Set(catalog.map(c => c.id));
    const rawRecs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    const seen = new Set();
    const cleanRecs = rawRecs
      .filter(r => r && Number.isInteger(r.product_id) && validIds.has(r.product_id) && !seen.has(r.product_id) && seen.add(r.product_id))
      .slice(0, num)
      .map(r => ({
        product_id: r.product_id,
        reason: String(r.reason || '').slice(0, 320),
        match_score: Math.max(0, Math.min(100, parseInt(r.match_score, 10) || 0)),
        placement: sanitizePlacement(r.placement),
      }));

    // Hydrate with full product objects from the DB so the frontend can
    // render product cards immediately (image, slug, price).
    let products = [];
    if (cleanRecs.length > 0) {
      const ids = cleanRecs.map(r => r.product_id);
      const [rows] = await pool.query(
        `SELECT id, sku, name, slug, category, wood_type, finish, price, mrp,
                short_desc, dimensions, image_url, stock
           FROM products WHERE id IN (?)`,
        [ids],
      );
      const byId = new Map(rows.map(r => [r.id, r]));
      products = cleanRecs
        .map(r => {
          const p = byId.get(r.product_id);
          if (!p) return null;
          return {
            product: {
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
            },
            reason: r.reason,
            match_score: r.match_score,
            placement: r.placement,
          };
        })
        .filter(Boolean);
    }

    res.json({
      is_room: parsed.is_room !== false,
      room_analysis: parsed.room_analysis || null,
      general_advice: String(parsed.general_advice || '').slice(0, 500),
      recommendations: products,
      meta: {
        model: modelUsed || MODEL_NAME,
        catalog_size: catalog.length,
        elapsed_ms: elapsedMs,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
