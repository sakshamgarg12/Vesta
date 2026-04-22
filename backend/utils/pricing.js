/**
 * Central pricing logic – kept on the server so the backend is the
 * source of truth for all totals. The frontend mirrors this for UX
 * but the server always recomputes before inserting an order.
 */

const GST_RATE = parseFloat(process.env.GST_RATE || '0.18');
const SHIPPING_FEE = parseFloat(process.env.SHIPPING_FEE || '499');
const FREE_SHIPPING_THRESHOLD = parseFloat(process.env.FREE_SHIPPING_THRESHOLD || '25000');

/**
 * Known coupon codes.
 *   WOOD20    -> 20% off subtotal
 *   FIRSTBED  -> flat ₹2000 off (min subtotal ₹10,000)
 */
function applyCoupon(subtotal, code) {
  if (!code) return { code: null, discount: 0, message: '' };
  const upper = String(code).trim().toUpperCase();

  if (upper === 'WOOD20') {
    const discount = +(subtotal * 0.20).toFixed(2);
    return { code: upper, discount, message: '20% off applied' };
  }
  if (upper === 'FIRSTBED') {
    if (subtotal < 10000) {
      return { code: null, discount: 0, message: 'FIRSTBED requires a minimum subtotal of ₹10,000' };
    }
    return { code: upper, discount: 2000, message: 'Flat ₹2000 off applied' };
  }
  return { code: null, discount: 0, message: 'Invalid coupon code' };
}

/**
 * Given an array of items [{price, quantity}] and a coupon code,
 * return a full price breakdown.
 */
function computeTotals(items, couponCode) {
  const subtotal = items.reduce(
    (sum, it) => sum + Number(it.price) * Number(it.quantity),
    0,
  );

  const coupon = applyCoupon(subtotal, couponCode);
  const discount = Math.min(coupon.discount, subtotal);
  const taxable = Math.max(subtotal - discount, 0);

  const gst = +(taxable * GST_RATE).toFixed(2);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = +(taxable + gst + shipping).toFixed(2);

  return {
    subtotal: +subtotal.toFixed(2),
    discount_code: coupon.code,
    discount_amount: +discount.toFixed(2),
    discount_message: coupon.message,
    gst_rate: GST_RATE,
    gst_amount: gst,
    shipping_fee: shipping,
    total,
  };
}

module.exports = { applyCoupon, computeTotals, GST_RATE, SHIPPING_FEE, FREE_SHIPPING_THRESHOLD };
