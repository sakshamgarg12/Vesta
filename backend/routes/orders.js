const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { computeTotals, applyCoupon } = require('../utils/pricing');
const { sendOrderEmails, sendStatusUpdateEmail } = require('../utils/mailer');
const { buildInvoicePDF } = require('../utils/invoice');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* --------------------------------------------------------------------------
 * Order tracking — shared helpers
 * -------------------------------------------------------------------------- */

// The customer-visible stages, in order. `placed` is implicit / always the
// starting state. `cancelled` is a terminal state shown separately.
const STATUS_STAGES = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const STATUS_LABELS = {
  placed:           'Order placed',
  confirmed:        'Order confirmed',
  packed:           'Packed & ready',
  shipped:          'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered:        'Delivered',
  cancelled:        'Cancelled',
};
const STATUS_TIMESTAMP_COL = {
  confirmed:        'confirmed_at',
  packed:           'packed_at',
  shipped:          'shipped_at',
  out_for_delivery: 'out_for_delivery_at',
  delivered:        'delivered_at',
};

/** Build a customer-safe tracking payload from a raw `orders` row. */
function buildTrackingView(order) {
  const status = order.order_status || 'placed';
  const placedAt = order.created_at || order.placed_at || null;
  const stageTimestamps = {
    placed:           placedAt,
    confirmed:        order.confirmed_at        || null,
    packed:           order.packed_at           || null,
    shipped:          order.shipped_at          || null,
    out_for_delivery: order.out_for_delivery_at || null,
    delivered:        order.delivered_at        || null,
  };

  const currentIdx = STATUS_STAGES.indexOf(status);
  const cancelled = status === 'cancelled';

  const stages = STATUS_STAGES.map((key, idx) => ({
    key,
    label: STATUS_LABELS[key],
    timestamp: stageTimestamps[key],
    done: !cancelled && idx <= currentIdx,
    active: !cancelled && idx === currentIdx,
  }));

  const progressPct = cancelled
    ? 0
    : Math.round(((currentIdx + 1) / STATUS_STAGES.length) * 100);

  // Expected delivery is whatever was scheduled at checkout.
  const deliveryDate = order.delivery_date || null;
  let etaDays = null;
  if (deliveryDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(deliveryDate); target.setHours(0, 0, 0, 0);
    etaDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
  }

  return {
    order_number: order.order_number,
    placed_at: placedAt,
    current_status: status,
    current_label: STATUS_LABELS[status] || status,
    cancelled,
    stages,
    progress_pct: progressPct,
    delivery_date: deliveryDate,
    delivery_slot: order.delivery_slot || null,
    eta_days: etaDays,
    tracking_number: order.tracking_number || null,
    courier_name: order.courier_name || null,
    // Echo a little customer-facing summary so the tracker can show it
    // without a second round-trip.
    customer_name: order.customer_name,
    total: Number(order.total || 0),
    items_count: order.items_count || null, // filled in by the route
    city: order.shipping_city,
    pincode: order.shipping_pincode,
  };
}

/**
 * Sanitize and validate the payment.details payload the client sent.
 *
 * Security contract:
 *   - We NEVER persist a full PAN or CVV. If the client accidentally sent
 *     them (e.g. buggy integration), we throw so the caller returns 400.
 *   - For `card` we only accept: brand, brand_label, last4 (4 digits),
 *     name_on_card, expiry (MM/YY), and a boolean `verified`.
 *   - For `upi` we accept: upi_id (matches VPA regex), handle, verified.
 *   - For `netbanking` we accept: bank (trimmed, max 80 chars).
 *   - For `cod` no extra details are required.
 *
 * Returns the sanitized object (or null for COD with no details), throws
 * with a user-facing message on validation failures.
 */
function sanitizePaymentDetails(method, details) {
  if (details == null) {
    if (method === 'cod') return { method: 'cod' };
    throw new Error('Payment details are required for this method.');
  }
  if (typeof details !== 'object') {
    throw new Error('Invalid payment details payload.');
  }

  // Safety net: reject any obvious full-PAN / CVV / password leakage.
  const forbiddenKeys = ['card_number', 'cardNumber', 'pan', 'cvv', 'card_cvv', 'cvc', 'password', 'pin'];
  for (const k of forbiddenKeys) {
    if (k in details) {
      throw new Error(`Sensitive field "${k}" must not be sent to the server.`);
    }
  }

  if (method === 'upi') {
    const raw = String(details.upi_id || '').trim().toLowerCase();
    if (!raw) throw new Error('UPI ID is required.');
    if (!/^[a-z0-9._\-]{2,256}@[a-z][a-z0-9]{1,64}$/.test(raw)) {
      throw new Error('Invalid UPI ID format.');
    }
    return {
      method: 'upi',
      upi_id: raw,
      handle: raw.split('@')[1],
      verified: !!details.verified,
    };
  }

  if (method === 'card') {
    const last4 = String(details.last4 || '').replace(/\D/g, '');
    if (last4.length !== 4) throw new Error('Invalid card last-4 digits.');
    const brandKey = String(details.brand || 'unknown').toLowerCase().slice(0, 20);
    const brandLabel = String(details.brand_label || 'Card').slice(0, 30);
    const name = String(details.name_on_card || '').trim().slice(0, 60);
    if (!name) throw new Error('Name on card is required.');
    if (!/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(name)) {
      throw new Error('Invalid characters in name on card.');
    }
    const expiry = String(details.expiry || '').trim();
    if (!/^\d{2}\/\d{2}$/.test(expiry)) throw new Error('Invalid card expiry (MM/YY).');
    const [mm, yy] = expiry.split('/').map(n => parseInt(n, 10));
    if (mm < 1 || mm > 12) throw new Error('Invalid card expiry month.');
    const now = new Date();
    const curYY = now.getFullYear() % 100;
    const curMM = now.getMonth() + 1;
    if (yy < curYY || (yy === curYY && mm < curMM)) {
      throw new Error('Card has expired.');
    }
    return {
      method: 'card',
      brand: brandKey,
      brand_label: brandLabel,
      last4,
      name_on_card: name,
      expiry,
      verified: !!details.verified,
    };
  }

  if (method === 'netbanking') {
    const bank = String(details.bank || '').trim().slice(0, 80);
    if (bank.length < 2) throw new Error('Bank name is required.');
    return { method: 'netbanking', bank };
  }

  if (method === 'cod') {
    return { method: 'cod' };
  }

  throw new Error('Unsupported payment method.');
}

/** Generate a human-friendly order number. */
function genOrderNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `FX-${y}${m}${d}-${rand}`;
}

/**
 * POST /api/coupons/validate
 *   Body: { subtotal:Number, code:String }
 *   Returns the discount that *would* be applied – the client uses this
 *   to display the coupon result before the user submits the order.
 */
router.post('/coupons/validate', (req, res) => {
  const subtotal = Number(req.body.subtotal || 0);
  const code = req.body.code || '';
  if (!subtotal || subtotal <= 0) {
    return res.status(400).json({ valid: false, message: 'Subtotal required' });
  }
  const result = applyCoupon(subtotal, code);
  res.json({
    valid: !!result.code,
    code: result.code,
    discount: result.discount,
    message: result.message,
  });
});

/**
 * POST /api/checkout
 *   Body: {
 *     customer: { name, email, phone },
 *     shipping: { address, city, state, pincode },
 *     delivery: { date, slot },
 *     payment:  { method },
 *     coupon_code,
 *     items: [ { product_id, quantity } ]
 *   }
 *   Creates the order and returns the saved order + receipt.
 */
router.post('/checkout', requireLogin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { customer = {}, shipping = {}, delivery = {}, payment = {}, coupon_code, items = [], notes = '' } = req.body;

    // The buyer is always the signed-in user. We keep a frozen snapshot of
    // their name/email/phone in the order row so it stays stable even if the
    // user later edits their profile (or is deleted).
    const buyerId = req.user.id;
    if (!customer.email && req.user.email) customer.email = req.user.email;
    if (!customer.name  && req.user.name)  customer.name  = req.user.name;

    // Back-compat: if client sent only a single `address` string but no structured parts,
    // use it as the street and leave the rest blank.
    const shippingFlat     = (shipping.flat     || '').trim();
    const shippingBuilding = (shipping.building || '').trim();
    const shippingStreet   = (shipping.street   || shipping.address || '').trim();
    const shippingLandmark = (shipping.landmark || '').trim();
    const shippingLocality = (shipping.locality || '').trim();
    const allowedTypes = ['home', 'office', 'other'];
    const addressType = allowedTypes.includes(shipping.address_type) ? shipping.address_type : 'home';

    const composedAddress = [shippingFlat, shippingBuilding, shippingStreet, shippingLandmark ? `Landmark: ${shippingLandmark}` : '']
      .filter(Boolean).join(', ') || (shipping.address || '').trim();

    // ---- Validation ----
    const required = {
      'customer.name': customer.name,
      'customer.email': customer.email,
      'customer.phone': customer.phone,
      'shipping.flat or shipping.address': shippingFlat || shipping.address,
      'shipping.street': shippingStreet,
      'shipping.landmark': shippingLandmark || shipping.address, // tolerate legacy payloads
      'shipping.city': shipping.city,
      'shipping.state': shipping.state,
      'shipping.pincode': shipping.pincode,
      'delivery.date': delivery.date,
      'payment.method': payment.method,
    };
    for (const [k, v] of Object.entries(required)) {
      if (!v || String(v).trim() === '') {
        return res.status(400).json({ error: `Missing required field: ${k}` });
      }
    }
    if (!/^\S+@\S+\.\S+$/.test(customer.email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (!/^\d{6}$/.test(String(shipping.pincode))) {
      return res.status(400).json({ error: 'Invalid pincode (6 digits required)' });
    }

    const phoneDigits = String(customer.phone).replace(/[^\d]/g, '');
    const isValidIndianMobile = (dig) =>
      (dig.length === 10 && /^[6-9]\d{9}$/.test(dig)) ||
      (dig.length === 11 && /^0[6-9]\d{9}$/.test(dig)) ||
      (dig.length === 12 && /^91[6-9]\d{9}$/.test(dig));
    if (!isValidIndianMobile(phoneDigits)) {
      return res.status(400).json({ error: 'Invalid mobile number (10-digit Indian number required)' });
    }
    const altRaw = (customer.alt_phone || '').trim();
    if (altRaw) {
      const altDigits = altRaw.replace(/[^\d]/g, '');
      if (!isValidIndianMobile(altDigits)) {
        return res.status(400).json({ error: 'Invalid alternate mobile number' });
      }
    }

    // Validate GPS pin (if provided)
    let lat = null, lng = null, geoAcc = null;
    if (shipping.latitude != null && shipping.longitude != null) {
      lat = Number(shipping.latitude);
      lng = Number(shipping.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Invalid GPS coordinates' });
      }
      geoAcc = shipping.geo_accuracy != null ? Math.max(0, Math.round(Number(shipping.geo_accuracy))) : null;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    const allowedPay = ['cod', 'upi', 'card', 'netbanking'];
    if (!allowedPay.includes(payment.method)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    let sanitizedPaymentDetails;
    try {
      sanitizedPaymentDetails = sanitizePaymentDetails(payment.method, payment.details);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // ---- Re-price server-side (never trust the client) ----
    await conn.beginTransaction();

    const productIds = items.map(i => parseInt(i.product_id, 10)).filter(Boolean);
    if (productIds.length !== items.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Invalid items in cart' });
    }

    const [prodRows] = await conn.query(
      `SELECT id, name, wood_type, price, stock FROM products
       WHERE is_active = 1 AND id IN (${productIds.map(() => '?').join(',')})`,
      productIds,
    );
    const byId = new Map(prodRows.map(p => [p.id, p]));

    const pricedItems = [];
    for (const it of items) {
      const p = byId.get(parseInt(it.product_id, 10));
      const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      if (!p) {
        await conn.rollback();
        return res.status(400).json({ error: `Product ${it.product_id} unavailable` });
      }
      if (p.stock < qty) {
        await conn.rollback();
        return res.status(409).json({ error: `Only ${p.stock} left in stock for "${p.name}"` });
      }
      pricedItems.push({
        product_id: p.id,
        product_name: p.name,
        wood_type: p.wood_type,
        unit_price: Number(p.price),
        quantity: qty,
        line_total: +(Number(p.price) * qty).toFixed(2),
      });
    }

    const totals = computeTotals(
      pricedItems.map(i => ({ price: i.unit_price, quantity: i.quantity })),
      coupon_code,
    );

    // ---- Insert order ----
    const orderNumber = genOrderNumber();
    const [orderRes] = await conn.query(
      `INSERT INTO orders
        (order_number,
         customer_name, customer_email, customer_phone, customer_alt_phone, user_id,
         shipping_address, shipping_flat, shipping_building, shipping_street,
         shipping_landmark, shipping_locality, shipping_address_type,
         shipping_city, shipping_state, shipping_pincode,
         shipping_latitude, shipping_longitude, shipping_geo_accuracy,
         delivery_date, delivery_slot, payment_method, payment_status, payment_details,
         subtotal, discount_code, discount_amount, shipping_fee, gst_amount,
         total, order_status, notes)
       VALUES (?,?,?,?,?,?, ?,?,?,?,?, ?,?, ?,?,?, ?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?)`,
      [
        orderNumber,
        customer.name, customer.email, customer.phone, altRaw || null, buyerId,
        composedAddress, shippingFlat || null, shippingBuilding || null, shippingStreet || null,
        shippingLandmark || null, shippingLocality || null, addressType,
        shipping.city, shipping.state, String(shipping.pincode),
        lat, lng, geoAcc,
        delivery.date, delivery.slot || 'Any time',
        payment.method, payment.method === 'cod' ? 'pending' : 'paid',
        JSON.stringify(sanitizedPaymentDetails),
        totals.subtotal,
        totals.discount_code,
        totals.discount_amount,
        totals.shipping_fee,
        totals.gst_amount,
        totals.total,
        'placed',
        notes || null,
      ],
    );
    const orderId = orderRes.insertId;

    // ---- Insert order_items + decrement stock ----
    for (const it of pricedItems) {
      await conn.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, wood_type, unit_price, quantity, line_total)
         VALUES (?,?,?,?,?,?,?)`,
        [orderId, it.product_id, it.product_name, it.wood_type, it.unit_price, it.quantity, it.line_total],
      );
      await conn.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [it.quantity, it.product_id],
      );
    }

    await conn.commit();

    const placedOrder = {
      id: orderId,
      order_number: orderNumber,
      customer: { ...customer, alt_phone: altRaw || null },
      shipping: {
        address: composedAddress,
        flat: shippingFlat || null,
        building: shippingBuilding || null,
        street: shippingStreet || null,
        landmark: shippingLandmark || null,
        locality: shippingLocality || null,
        address_type: addressType,
        city: shipping.city,
        state: shipping.state,
        pincode: String(shipping.pincode),
        latitude: lat,
        longitude: lng,
        geo_accuracy: geoAcc,
      },
      delivery,
      payment_method: payment.method,
      payment_status: payment.method === 'cod' ? 'pending' : 'paid',
      payment_details: sanitizedPaymentDetails,
      items: pricedItems,
      notes: notes || null,
      ...totals,
      placed_at: new Date().toISOString(),
    };

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: placedOrder,
    });

    // Fire-and-forget: email the admin + the customer (with PDF invoice attached).
    // Never block the checkout response on email delivery.
    setImmediate(() => {
      sendOrderEmails({ order: placedOrder, items: pricedItems }).catch((err) => {
        console.warn('[mail] sendOrderEmails failed:', err.message);
      });
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    next(err);
  } finally {
    conn.release();
  }
});

/**
 * GET /api/orders/:orderNumber
 *   Fetches an order + its items (for the "order success" page).
 */
router.get('/orders/:orderNumber', async (req, res, next) => {
  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE order_number = ?',
      [req.params.orderNumber],
    );
    if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });

    const [items] = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [orders[0].id],
    );
    const order = orders[0];
    if (order.payment_details && typeof order.payment_details === 'string') {
      try { order.payment_details = JSON.parse(order.payment_details); }
      catch (_) { /* leave as string if it isn't valid JSON */ }
    }
    res.json({ order, items });
  } catch (err) { next(err); }
});

/**
 * GET /api/orders/:orderNumber/invoice.pdf
 *   Generates + streams the invoice PDF for download.
 */
router.get('/orders/:orderNumber/invoice.pdf', async (req, res, next) => {
  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE order_number = ?',
      [req.params.orderNumber],
    );
    if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });

    const [items] = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [orders[0].id],
    );

    const order = orders[0];
    if (order.payment_details && typeof order.payment_details === 'string') {
      try { order.payment_details = JSON.parse(order.payment_details); }
      catch (_) { /* leave as string if it isn't valid JSON */ }
    }

    const pdf = await buildInvoicePDF({ order, items });

    const disposition = req.query.download === '0' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="Vesta-Invoice-${orders[0].order_number}.pdf"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.send(pdf);
  } catch (err) { next(err); }
});

/** True if this order was placed by the signed-in account (user_id link or same email). */
function orderBelongsToUser(order, user) {
  if (!user || !order) return false;
  if (order.user_id != null && Number(order.user_id) === Number(user.id)) return true;
  const ce = String(order.customer_email || '').trim().toLowerCase();
  const ue = String(user.email || '').trim().toLowerCase();
  return Boolean(ce && ue && ce === ue);
}

/* --------------------------------------------------------------------------
 * GET /api/track?order=FX-...
 *   Signed-in customers only. Verifies the order belongs to the session user
 *   (placed while logged in via user_id, or same email as checkout for legacy rows).
 *   Rate-limited so the order-number space can't be hammered.
 * -------------------------------------------------------------------------- */
const trackLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tracking requests — please try again in a few minutes.' },
});

router.get('/track', trackLimiter, requireLogin, async (req, res, next) => {
  try {
    const orderNumber = String(req.query.order || '').trim();
    if (!orderNumber) {
      return res.status(400).json({ error: 'Please enter your order number.' });
    }
    if (!/^FX-\d{8}-\d{6}$/.test(orderNumber)) {
      return res.status(400).json({ error: 'That order number doesn\'t look right — it should be like FX-20260422-123456.' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM orders WHERE order_number = ? LIMIT 1',
      [orderNumber],
    );
    // Same opaque 404 for "not found" vs "not yours" — no enumeration.
    if (rows.length === 0 || !orderBelongsToUser(rows[0], req.user)) {
      return res.status(404).json({ error: 'No order matches that number for your account. Check the order ID or sign in with the Google account you used at checkout.' });
    }

    const order = rows[0];
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?',
      [order.id],
    );
    order.items_count = countRows[0]?.c || 0;

    res.json({ tracking: buildTrackingView(order) });
  } catch (err) { next(err); }
});

/* --------------------------------------------------------------------------
 * ADMIN routes
 *   All /api/admin/* endpoints are gated by `requireAdmin` from
 *   backend/middleware/auth.js, which checks the session cookie and asserts:
 *     (a) the user is signed in with Google,
 *     (b) their email appears in ADMIN_EMAILS, AND
 *     (c) the email contains the substring "admin".
 *
 *   There is no separate admin-token login — the old /api/admin/login was
 *   removed when we moved to Google Sign-In for the whole site.
 * -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
 * ADMIN:  GET /api/admin/stats
 *   Compact KPI block for the admin dashboard header.
 * -------------------------------------------------------------------------- */
router.get('/admin/stats', requireAdmin, async (_req, res, next) => {
  try {
    const [[totals]] = await pool.query(`
      SELECT
        COUNT(*)                                                   AS total_orders,
        COALESCE(SUM(total), 0)                                    AS gross_revenue,
        SUM(CASE WHEN DATE(created_at) = CURDATE()         THEN 1 ELSE 0 END) AS orders_today,
        SUM(CASE WHEN created_at >= (NOW() - INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS orders_week,
        SUM(CASE WHEN order_status   = 'placed'            THEN 1 ELSE 0 END) AS needs_confirmation,
        SUM(CASE WHEN payment_status = 'pending' AND payment_method <> 'cod' THEN 1 ELSE 0 END) AS needs_payment_check,
        SUM(CASE WHEN payment_method = 'cod' AND order_status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS cod_in_flight
      FROM orders
    `);

    const [statusBreakdown] = await pool.query(`
      SELECT order_status AS status, COUNT(*) AS c
        FROM orders
       GROUP BY order_status
    `);
    const [paymentBreakdown] = await pool.query(`
      SELECT payment_status AS status, COUNT(*) AS c
        FROM orders
       GROUP BY payment_status
    `);

    res.json({
      total_orders:        Number(totals.total_orders || 0),
      gross_revenue:       Number(totals.gross_revenue || 0),
      orders_today:        Number(totals.orders_today || 0),
      orders_week:         Number(totals.orders_week || 0),
      needs_confirmation:  Number(totals.needs_confirmation || 0),
      needs_payment_check: Number(totals.needs_payment_check || 0),
      cod_in_flight:       Number(totals.cod_in_flight || 0),
      by_status:  Object.fromEntries(statusBreakdown.map(r => [r.status, Number(r.c)])),
      by_payment: Object.fromEntries(paymentBreakdown.map(r => [r.status, Number(r.c)])),
    });
  } catch (err) { next(err); }
});

/* --------------------------------------------------------------------------
 * ADMIN:  GET /api/admin/orders
 *   List orders with optional filters + simple pagination.
 *
 *   Query:
 *     status=placed|confirmed|...|cancelled   (optional)
 *     payment_status=pending|paid|failed|refunded (optional)
 *     payment_method=cod|upi|card|netbanking  (optional)
 *     search=<partial order #, email, phone, or customer name> (optional)
 *     page=1  limit=25   (limit capped at 100)
 * -------------------------------------------------------------------------- */
router.get('/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const clauses = [];
    const values  = [];

    const ALLOWED_STATUS = new Set(STATUS_STAGES.concat(['cancelled']));
    if (req.query.status && ALLOWED_STATUS.has(req.query.status)) {
      clauses.push('order_status = ?');
      values.push(req.query.status);
    }
    const ALLOWED_PAY_STATUS = new Set(['pending', 'paid', 'failed', 'refunded']);
    if (req.query.payment_status && ALLOWED_PAY_STATUS.has(req.query.payment_status)) {
      clauses.push('payment_status = ?');
      values.push(req.query.payment_status);
    }
    const ALLOWED_PAY_METHOD = new Set(['cod', 'upi', 'card', 'netbanking']);
    if (req.query.payment_method && ALLOWED_PAY_METHOD.has(req.query.payment_method)) {
      clauses.push('payment_method = ?');
      values.push(req.query.payment_method);
    }

    const search = String(req.query.search || '').trim();
    if (search) {
      const like = `%${search}%`;
      clauses.push('(order_number LIKE ? OR customer_email LIKE ? OR customer_phone LIKE ? OR customer_name LIKE ?)');
      values.push(like, like, like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders ${where}`,
      values,
    );

    const [rows] = await pool.query(
      `SELECT
         id, order_number, customer_name, customer_email, customer_phone,
         shipping_city, shipping_pincode,
         delivery_date, delivery_slot,
         payment_method, payment_status,
         subtotal, discount_amount, shipping_fee, gst_amount, total,
         order_status, tracking_number, courier_name,
         created_at,
         confirmed_at, packed_at, shipped_at, out_for_delivery_at, delivered_at
         FROM orders
         ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    // Attach item counts (one small extra query — fine for admin traffic).
    if (rows.length) {
      const ids = rows.map(r => r.id);
      const [counts] = await pool.query(
        `SELECT order_id, COUNT(*) AS c, SUM(quantity) AS q
           FROM order_items
          WHERE order_id IN (${ids.map(() => '?').join(',')})
          GROUP BY order_id`,
        ids,
      );
      const byId = new Map(counts.map(r => [r.order_id, r]));
      rows.forEach(r => {
        const cc = byId.get(r.id);
        r.items_count = cc ? Number(cc.c) : 0;
        r.items_qty   = cc ? Number(cc.q) : 0;
      });
    }

    res.json({
      orders: rows,
      page,
      limit,
      total: Number(total),
      pages: Math.max(1, Math.ceil(Number(total) / limit)),
    });
  } catch (err) { next(err); }
});

/* --------------------------------------------------------------------------
 * ADMIN:  GET /api/admin/orders/:orderNumber
 *   Full order detail (customer + shipping + items + payment details).
 * -------------------------------------------------------------------------- */
router.get('/admin/orders/:orderNumber', requireAdmin, async (req, res, next) => {
  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE order_number = ?',
      [req.params.orderNumber],
    );
    if (orders.length === 0) return res.status(404).json({ error: 'Order not found.' });

    const order = orders[0];
    if (order.payment_details && typeof order.payment_details === 'string') {
      try { order.payment_details = JSON.parse(order.payment_details); }
      catch (_) { /* leave as-is */ }
    }

    const [items] = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [order.id],
    );

    res.json({ order, items, tracking: buildTrackingView({ ...order, items_count: items.length }) });
  } catch (err) { next(err); }
});

/* --------------------------------------------------------------------------
 * ADMIN:  PATCH /api/admin/orders/:orderNumber/payment
 *   Update the payment status.  Used when the owner manually verifies a UPI
 *   transfer, marks a card payment as failed/refunded, etc.
 *
 *   Body: {
 *     payment_status: "pending" | "paid" | "failed" | "refunded",
 *     note?: string                 // appended to order notes for audit trail
 *   }
 * -------------------------------------------------------------------------- */
router.patch('/admin/orders/:orderNumber/payment', requireAdmin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { payment_status, note } = req.body || {};
    const allowed = ['pending', 'paid', 'failed', 'refunded'];
    if (!allowed.includes(payment_status)) {
      return res.status(400).json({ error: `Invalid payment_status. Must be one of: ${allowed.join(', ')}` });
    }

    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT * FROM orders WHERE order_number = ? FOR UPDATE',
      [req.params.orderNumber],
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = rows[0];

    const setParts = ['payment_status = ?'];
    const setVals  = [payment_status];

    if (typeof note === 'string' && note.trim()) {
      // Append a timestamped audit line to `notes` so the owner can reconstruct
      // why this payment was flipped to paid / failed / refunded.
      const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
      const line  = `[${stamp}] payment → ${payment_status}: ${note.trim().slice(0, 400)}`;
      const combined = order.notes ? `${order.notes}\n${line}` : line;
      setParts.push('notes = ?');
      setVals.push(combined);
    }

    setVals.push(order.id);
    await conn.query(`UPDATE orders SET ${setParts.join(', ')} WHERE id = ?`, setVals);
    await conn.commit();

    const [[updated]] = await conn.query(
      'SELECT * FROM orders WHERE id = ?',
      [order.id],
    );
    if (updated.payment_details && typeof updated.payment_details === 'string') {
      try { updated.payment_details = JSON.parse(updated.payment_details); }
      catch (_) { /* leave */ }
    }

    res.json({
      success: true,
      message: `Payment for ${updated.order_number} → ${payment_status}`,
      order: updated,
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    next(err);
  } finally {
    conn.release();
  }
});

router.patch('/admin/orders/:orderNumber/status', requireAdmin, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const orderNumber = req.params.orderNumber;
    const { status, tracking_number, courier_name, notify } = req.body || {};
    const allowed = ['confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT * FROM orders WHERE order_number = ? FOR UPDATE',
      [orderNumber],
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = rows[0];

    // Persist the stage timestamp (if not already set) so the customer sees
    // "Confirmed at 5:30pm" even after subsequent updates.
    const tsCol = STATUS_TIMESTAMP_COL[status];
    const setParts = ['order_status = ?'];
    const setVals = [status];
    if (tsCol && !order[tsCol]) {
      setParts.push(`\`${tsCol}\` = NOW()`);
    }
    if (typeof tracking_number === 'string' && tracking_number.trim()) {
      setParts.push('tracking_number = ?');
      setVals.push(tracking_number.trim().slice(0, 80));
    }
    if (typeof courier_name === 'string' && courier_name.trim()) {
      setParts.push('courier_name = ?');
      setVals.push(courier_name.trim().slice(0, 80));
    }
    setVals.push(order.id);

    await conn.query(`UPDATE orders SET ${setParts.join(', ')} WHERE id = ?`, setVals);
    await conn.commit();

    const [[updated]] = await conn.query(
      'SELECT * FROM orders WHERE id = ?',
      [order.id],
    );
    const [countRows] = await conn.query(
      'SELECT COUNT(*) AS c FROM order_items WHERE order_id = ?',
      [order.id],
    );
    updated.items_count = countRows[0]?.c || 0;

    res.json({
      success: true,
      message: `Order ${orderNumber} → ${STATUS_LABELS[status] || status}`,
      tracking: buildTrackingView(updated),
    });

    // Fire-and-forget customer notification.
    if (notify !== false) {
      setImmediate(() => {
        sendStatusUpdateEmail({ order: updated, newStatus: status }).catch((err) => {
          console.warn('[mail] sendStatusUpdateEmail failed:', err.message);
        });
      });
    }
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
