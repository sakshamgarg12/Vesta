/**
 * Gmail-based mailer for FurniX.
 *
 * - Reads SMTP credentials from env (see .env.example).
 * - Exposes sendOrderEmails({order, items}) which fires off BOTH:
 *     1. An admin notification to ADMIN_EMAIL with every order detail.
 *     2. A customer confirmation with the PDF invoice attached.
 *
 * Emails are sent non-blocking from the checkout route (fire-and-forget)
 * so a mail outage never breaks the order flow.
 *
 * To use with Gmail:
 *   - Enable 2-Step Verification on the Google account.
 *   - Create an "App password" at  https://myaccount.google.com/apppasswords
 *   - Put that 16-character password (no spaces) in  MAIL_PASS.
 */

const nodemailer = require('nodemailer');
const { buildInvoicePDF } = require('./invoice');

const BRAND_NAME = process.env.STORE_NAME || 'FurniX';
const STORE_EMAIL = process.env.STORE_EMAIL || 'contact@furnix.store';
const STORE_PHONE = process.env.STORE_PHONE || '+91-9000000000';

let transporter = null;
let verifiedOnce = false;

/** Build (or return cached) nodemailer transporter. Returns null if not configured. */
function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  if (!user || !pass) {
    console.warn('[mail] MAIL_USER / MAIL_PASS not set — order emails are disabled.');
    return null;
  }

  const host = process.env.MAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.MAIL_PORT || '465', 10);
  const secure = String(process.env.MAIL_SECURE || (port === 465 ? 'true' : 'false')) === 'true';

  transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
  });

  transporter.verify().then(
    () => { verifiedOnce = true; console.log(`[mail] SMTP ready on ${host}:${port} as ${user}`); },
    (err) => { console.warn('[mail] SMTP verify failed:', err.message); },
  );
  return transporter;
}

function inr(n) {
  const num = Number(n || 0);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function payLabel(method) {
  return ({
    cod: 'Cash on Delivery',
    upi: 'UPI',
    card: 'Credit / Debit Card',
    netbanking: 'Net Banking',
  })[method] || method || '—';
}

function itemsTableHTML(items) {
  const rows = (items || []).map(i => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #EFEAE0;">
        <div style="font-weight:600;color:#333;">${esc(i.product_name)}</div>
        <div style="font-size:12px;color:#6B6B6B;">${esc(i.wood_type || '')}</div>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #EFEAE0;text-align:center;">${Number(i.quantity)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #EFEAE0;text-align:right;">${inr(i.unit_price)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #EFEAE0;text-align:right;font-weight:600;">${inr(i.line_total)}</td>
    </tr>`).join('');

  return `
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;color:#333;">
      <thead>
        <tr style="background:#333;color:#fff;">
          <th style="padding:10px 8px;text-align:left;">Item</th>
          <th style="padding:10px 8px;text-align:center;">Qty</th>
          <th style="padding:10px 8px;text-align:right;">Unit</th>
          <th style="padding:10px 8px;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function totalsHTML(o) {
  const discount = Number(o.discount_amount || 0);
  const rows = [
    ['Subtotal', inr(o.subtotal)],
    ...(discount > 0 ? [[`Discount (${esc(o.discount_code || '')})`, '− ' + inr(discount)]] : []),
    ['GST (18%)', inr(o.gst_amount)],
    ['Shipping', Number(o.shipping_fee) === 0 ? 'Free' : inr(o.shipping_fee)],
  ].map(([l, v]) => `<tr><td style="padding:4px 0;color:#6B6B6B;">${l}</td><td style="padding:4px 0;text-align:right;">${v}</td></tr>`).join('');

  return `
    <table style="width:280px;margin-left:auto;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
      ${rows}
      <tr>
        <td style="padding-top:10px;border-top:2px solid #333;font-weight:700;font-size:16px;color:#2D5A27;">Total</td>
        <td style="padding-top:10px;border-top:2px solid #333;text-align:right;font-weight:700;font-size:16px;color:#2D5A27;">${inr(o.total)}</td>
      </tr>
    </table>`;
}

function headerHTML(title) {
  return `
    <div style="background:#F9F7F2;padding:24px;border-bottom:3px solid #2D5A27;">
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:28px;color:#2D5A27;font-weight:700;">${esc(BRAND_NAME)}</div>
      <div style="font-size:13px;color:#6B6B6B;">Heirloom wooden furniture</div>
      <div style="margin-top:14px;font-family:Arial,sans-serif;font-size:20px;color:#333;font-weight:600;">${esc(title)}</div>
    </div>`;
}

function footerHTML() {
  return `
    <div style="padding:20px 24px;background:#F9F7F2;color:#6B6B6B;font-size:12px;font-family:Arial,sans-serif;border-top:1px solid #EFEAE0;">
      Questions? Reply to this email, write to
      <a href="mailto:${esc(STORE_EMAIL)}" style="color:#2D5A27;">${esc(STORE_EMAIL)}</a>
      or call ${esc(STORE_PHONE)}.
    </div>`;
}

function normaliseOrder(order) {
  const o = order || {};
  return {
    order_number: o.order_number,
    placed_at: o.placed_at || o.created_at || new Date().toISOString(),
    customer_name: o.customer?.name || o.customer_name,
    customer_email: o.customer?.email || o.customer_email,
    customer_phone: o.customer?.phone || o.customer_phone,
    customer_alt_phone: o.customer?.alt_phone || o.customer_alt_phone,
    shipping_address: o.shipping?.address || o.shipping_address,
    shipping_flat: o.shipping?.flat || o.shipping_flat,
    shipping_building: o.shipping?.building || o.shipping_building,
    shipping_street: o.shipping?.street || o.shipping_street,
    shipping_landmark: o.shipping?.landmark || o.shipping_landmark,
    shipping_locality: o.shipping?.locality || o.shipping_locality,
    shipping_address_type: o.shipping?.address_type || o.shipping_address_type || 'home',
    shipping_city: o.shipping?.city || o.shipping_city,
    shipping_state: o.shipping?.state || o.shipping_state,
    shipping_pincode: o.shipping?.pincode || o.shipping_pincode,
    shipping_latitude: o.shipping?.latitude ?? o.shipping_latitude,
    shipping_longitude: o.shipping?.longitude ?? o.shipping_longitude,
    shipping_geo_accuracy: o.shipping?.geo_accuracy ?? o.shipping_geo_accuracy,
    delivery_date: o.delivery?.date || o.delivery_date,
    delivery_slot: o.delivery?.slot || o.delivery_slot,
    payment_method: o.payment_method,
    payment_status: o.payment_status || (o.payment_method === 'cod' ? 'pending' : 'paid'),
    subtotal: o.subtotal,
    discount_code: o.discount_code,
    discount_amount: o.discount_amount,
    gst_amount: o.gst_amount,
    shipping_fee: o.shipping_fee,
    total: o.total,
    notes: o.notes,
  };
}

function mapsBlockHTML(o) {
  if (o.shipping_latitude == null || o.shipping_longitude == null) return '';
  const lat = Number(o.shipping_latitude);
  const lng = Number(o.shipping_longitude);
  const acc = o.shipping_geo_accuracy ? ` (±${o.shipping_geo_accuracy}m)` : '';
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  return `
    <div style="margin-top:10px;padding:10px 12px;background:#F9F7F2;border-left:3px solid #2D5A27;border-radius:4px;">
      <div style="font-size:13px;color:#333;">
        <strong>📍 GPS pin</strong>${acc}
        &nbsp;·&nbsp;
        <a href="${url}" target="_blank" rel="noopener" style="color:#2D5A27;">Open in Google Maps</a>
      </div>
      <div style="font-size:12px;color:#6B6B6B;margin-top:2px;">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
    </div>`;
}

const ADDRESS_TYPE_LABEL = { home: '🏠 Home', office: '🏢 Office', other: '📍 Other' };

function shippingBlockHTML(o) {
  const typeLbl = ADDRESS_TYPE_LABEL[o.shipping_address_type] || 'Home';
  const line2 = [o.shipping_flat, o.shipping_building].filter(Boolean).join(', ');
  const line3 = o.shipping_street;
  const lineCity = [o.shipping_city, o.shipping_state].filter(Boolean).join(', ')
    + (o.shipping_pincode ? ` — ${o.shipping_pincode}` : '');
  return `
    <div style="font-size:13px;color:#333;line-height:1.6;">
      <strong>${esc(o.customer_name)}</strong>
      <span style="font-size:11px;color:#6B6B6B;">&nbsp;· ${typeLbl}</span><br/>
      ${line2 ? esc(line2) + '<br/>' : ''}
      ${line3 ? esc(line3) + '<br/>' : ''}
      ${o.shipping_landmark ? `<span style="color:#6B6B6B;">Landmark:</span> ${esc(o.shipping_landmark)}<br/>` : ''}
      ${esc(lineCity)}<br/>
      <span style="color:#6B6B6B;">
        ${esc(o.customer_phone)}${o.customer_alt_phone ? ' · Alt: ' + esc(o.customer_alt_phone) : ''} · ${esc(o.customer_email)}
      </span>
    </div>
    ${mapsBlockHTML(o)}
  `;
}

function buildWhatsAppURL(o) {
  const raw = String(STORE_PHONE || '').replace(/[^\d]/g, '');
  if (!raw) return null;
  const phoneForLink = raw.startsWith('91') ? raw : (raw.length === 10 ? '91' + raw : raw);
  const mapLine = (o.shipping_latitude != null && o.shipping_longitude != null)
    ? `\nMy GPS pin: https://www.google.com/maps?q=${o.shipping_latitude},${o.shipping_longitude}`
    : '';
  const msg = `Hi FurniX team, confirming my order ${o.order_number}.\n` +
              `Address: ${[o.shipping_flat, o.shipping_building, o.shipping_street].filter(Boolean).join(', ')}, ` +
              `${o.shipping_city} - ${o.shipping_pincode}. ` +
              `Landmark: ${o.shipping_landmark || '—'}.` +
              mapLine;
  return `https://wa.me/${phoneForLink}?text=${encodeURIComponent(msg)}`;
}

function customerEmailHTML(o, items) {
  const waURL = buildWhatsAppURL(o);
  const waBlock = waURL ? `
    <div style="margin:24px 0;padding:16px;background:#F9F7F2;border-radius:6px;text-align:center;">
      <div style="font-size:14px;color:#333;margin-bottom:10px;">
        <strong>Help us deliver on time</strong> — share your live location on WhatsApp so our team reaches the right gate.
      </div>
      <a href="${waURL}" target="_blank" rel="noopener"
         style="display:inline-block;background:#25D366;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
        💬 Confirm address on WhatsApp
      </a>
    </div>` : '';

  return `
  <div style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;color:#333;background:#fff;">
    ${headerHTML('Order Confirmed — Thank you!')}
    <div style="padding:24px;">
      <p style="font-size:15px;margin:0 0 8px 0;">Hi ${esc(o.customer_name)},</p>
      <p style="font-size:14px;color:#6B6B6B;margin:0 0 18px 0;">
        We've received your order <strong style="color:#333;">#${esc(o.order_number)}</strong>
        and our craftsmen will begin preparations shortly.
        Your invoice is attached to this email as a PDF.
      </p>

      <table style="width:100%;font-size:13px;color:#333;margin-bottom:18px;">
        <tr>
          <td style="padding:6px 0;"><strong>Order #</strong></td>
          <td style="padding:6px 0;text-align:right;">${esc(o.order_number)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;"><strong>Placed on</strong></td>
          <td style="padding:6px 0;text-align:right;">${new Date(o.placed_at).toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;"><strong>Delivery</strong></td>
          <td style="padding:6px 0;text-align:right;">${esc(o.delivery_date)} · ${esc(o.delivery_slot || 'Any time')}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;"><strong>Payment</strong></td>
          <td style="padding:6px 0;text-align:right;">${esc(payLabel(o.payment_method))} (${esc(String(o.payment_status).toUpperCase())})</td>
        </tr>
      </table>

      <h3 style="margin:20px 0 10px 0;font-size:15px;color:#333;">Shipping to</h3>
      ${shippingBlockHTML(o)}

      ${waBlock}

      <h3 style="margin:24px 0 10px 0;font-size:15px;color:#333;">Items</h3>
      ${itemsTableHTML(items)}

      <div style="margin-top:18px;">${totalsHTML(o)}</div>

      <p style="font-size:13px;color:#6B6B6B;margin-top:24px;">
        Your invoice is attached to this email, and is always available from your order page.
      </p>
    </div>
    ${footerHTML()}
  </div>`;
}

function adminEmailHTML(o, items) {
  return `
  <div style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;color:#333;background:#fff;">
    ${headerHTML('New Order Received')}
    <div style="padding:24px;">
      <p style="font-size:14px;margin:0 0 16px 0;">
        A new order has been placed on the FurniX storefront.
      </p>

      <table style="width:100%;font-size:13px;color:#333;margin-bottom:18px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;width:140px;"><strong>Order #</strong></td>
          <td style="padding:6px 0;">${esc(o.order_number)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;"><strong>Placed on</strong></td>
          <td style="padding:6px 0;">${new Date(o.placed_at).toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;"><strong>Customer</strong></td>
          <td style="padding:6px 0;">
            ${esc(o.customer_name)}<br/>
            <a href="mailto:${esc(o.customer_email)}" style="color:#2D5A27;">${esc(o.customer_email)}</a><br/>
            <a href="tel:${esc(o.customer_phone)}" style="color:#2D5A27;">${esc(o.customer_phone)}</a>${o.customer_alt_phone ? ` · <a href="tel:${esc(o.customer_alt_phone)}" style="color:#2D5A27;">${esc(o.customer_alt_phone)}</a>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;vertical-align:top;"><strong>Shipping</strong></td>
          <td style="padding:6px 0;">${shippingBlockHTML(o)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;"><strong>Delivery</strong></td>
          <td style="padding:6px 0;">${esc(o.delivery_date)} · ${esc(o.delivery_slot || 'Any time')}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;"><strong>Payment</strong></td>
          <td style="padding:6px 0;">${esc(payLabel(o.payment_method))} — <strong>${esc(String(o.payment_status).toUpperCase())}</strong></td>
        </tr>
        ${o.notes ? `<tr>
          <td style="padding:6px 0;vertical-align:top;"><strong>Notes</strong></td>
          <td style="padding:6px 0;">${esc(o.notes)}</td>
        </tr>` : ''}
      </table>

      <h3 style="margin:20px 0 10px 0;font-size:15px;color:#333;">Items</h3>
      ${itemsTableHTML(items)}

      <div style="margin-top:18px;">${totalsHTML(o)}</div>

      <p style="font-size:13px;color:#6B6B6B;margin-top:24px;">
        The full invoice is attached as a PDF.
      </p>
    </div>
    ${footerHTML()}
  </div>`;
}

/**
 * Send both emails for a new order. Fire-and-forget from the route.
 * @param {object} params
 * @param {object} params.order
 * @param {Array}  params.items
 */
async function sendOrderEmails({ order, items }) {
  const t = getTransporter();
  if (!t) return { skipped: true };

  const o = normaliseOrder(order);
  const fromName = BRAND_NAME;
  const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER;
  const from = `"${fromName}" <${fromAddress}>`;

  const adminTo = process.env.ADMIN_EMAIL || process.env.MAIL_USER;

  let pdfBuffer;
  try {
    pdfBuffer = await buildInvoicePDF({ order: o, items });
  } catch (err) {
    console.warn('[mail] PDF generation failed:', err.message);
  }

  const pdfAttachment = pdfBuffer ? [{
    filename: `FurniX-Invoice-${o.order_number}.pdf`,
    content: pdfBuffer,
    contentType: 'application/pdf',
  }] : [];

  const jobs = [];

  // 1. Admin notification
  if (adminTo) {
    jobs.push(
      t.sendMail({
        from,
        to: adminTo,
        subject: `[New Order] ${o.order_number} — ${o.customer_name} — ${inr(o.total)}`,
        html: adminEmailHTML(o, items),
        attachments: pdfAttachment,
        replyTo: o.customer_email,
      }).then(
        (info) => console.log(`[mail] admin notified (${info.messageId})`),
        (err) => console.warn('[mail] admin email failed:', err.message),
      ),
    );
  }

  // 2. Customer confirmation + invoice
  if (o.customer_email) {
    jobs.push(
      t.sendMail({
        from,
        to: o.customer_email,
        subject: `Your ${BRAND_NAME} order ${o.order_number} is confirmed`,
        html: customerEmailHTML(o, items),
        attachments: pdfAttachment,
      }).then(
        (info) => console.log(`[mail] customer emailed (${info.messageId})`),
        (err) => console.warn('[mail] customer email failed:', err.message),
      ),
    );
  }

  await Promise.allSettled(jobs);
  return { sent: true, verifiedOnce };
}

module.exports = { sendOrderEmails, getTransporter };
