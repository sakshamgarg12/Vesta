const express = require('express');
const { pool } = require('../db');
const { computeTotals, applyCoupon } = require('../utils/pricing');
const { sendOrderEmails } = require('../utils/mailer');
const { buildInvoicePDF } = require('../utils/invoice');

const router = express.Router();

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
router.post('/checkout', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { customer = {}, shipping = {}, delivery = {}, payment = {}, coupon_code, items = [], notes = '' } = req.body;

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
         customer_name, customer_email, customer_phone, customer_alt_phone,
         shipping_address, shipping_flat, shipping_building, shipping_street,
         shipping_landmark, shipping_locality, shipping_address_type,
         shipping_city, shipping_state, shipping_pincode,
         shipping_latitude, shipping_longitude, shipping_geo_accuracy,
         delivery_date, delivery_slot, payment_method, payment_status,
         subtotal, discount_code, discount_amount, shipping_fee, gst_amount,
         total, order_status, notes)
       VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?, ?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?)`,
      [
        orderNumber,
        customer.name, customer.email, customer.phone, altRaw || null,
        composedAddress, shippingFlat || null, shippingBuilding || null, shippingStreet || null,
        shippingLandmark || null, shippingLocality || null, addressType,
        shipping.city, shipping.state, String(shipping.pincode),
        lat, lng, geoAcc,
        delivery.date, delivery.slot || 'Any time',
        payment.method, payment.method === 'cod' ? 'pending' : 'paid',
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
    res.json({ order: orders[0], items });
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

    const pdf = await buildInvoicePDF({ order: orders[0], items });

    const disposition = req.query.download === '0' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="FurniX-Invoice-${orders[0].order_number}.pdf"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.send(pdf);
  } catch (err) { next(err); }
});

module.exports = router;
