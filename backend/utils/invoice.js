/**
 * PDF invoice generator for FurniX orders.
 *
 * Returns a Buffer containing a fully-formatted A4 invoice for the given
 * order + items. Uses `pdfkit` with built-in fonts, so there are no
 * external font dependencies.
 *
 * Usage:
 *   const pdfBuffer = await buildInvoicePDF({ order, items });
 */

const PDFDocument = require('pdfkit');

const BRAND = {
  name: process.env.STORE_NAME || 'FurniX',
  tagline: 'Heirloom wooden furniture',
  email: process.env.STORE_EMAIL || 'contact@furnix.store',
  phone: process.env.STORE_PHONE || '+91-9000000000',
  gstin: process.env.STORE_GSTIN || '',
  address: process.env.STORE_ADDRESS || '',
};

const COLORS = {
  charcoal: '#333333',
  forest: '#2D5A27',
  cream: '#F9F7F2',
  cream2: '#EFEAE0',
  muted: '#6B6B6B',
  border: '#D9D4C7',
};

function inr(n) {
  const num = Number(n || 0);
  return `Rs. ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function payLabel(method) {
  return ({
    cod: 'Cash on Delivery',
    upi: 'UPI',
    card: 'Credit / Debit Card',
    netbanking: 'Net Banking',
  })[method] || method || '—';
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
}

/**
 * Build the invoice PDF as a Buffer.
 * @param {object} params
 * @param {object} params.order  – row from `orders` or checkout response (flat or nested)
 * @param {Array}  params.items  – order line items
 * @returns {Promise<Buffer>}
 */
function buildInvoicePDF({ order, items }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ---------- Normalise both order shapes (flat DB row vs nested API response) ----------
      const o = order || {};
      const customerName  = o.customer?.name    || o.customer_name    || '—';
      const customerEmail = o.customer?.email   || o.customer_email   || '—';
      const customerPhone = o.customer?.phone   || o.customer_phone   || '—';
      const customerAlt   = o.customer?.alt_phone || o.customer_alt_phone || '';
      const shipFlat     = o.shipping?.flat     || o.shipping_flat     || '';
      const shipBuilding = o.shipping?.building || o.shipping_building || '';
      const shipStreet   = o.shipping?.street   || o.shipping_street   || '';
      const shipLandmark = o.shipping?.landmark || o.shipping_landmark || '';
      const shipAddrType = o.shipping?.address_type || o.shipping_address_type || 'home';
      const shipCity  = o.shipping?.city    || o.shipping_city    || '';
      const shipState = o.shipping?.state   || o.shipping_state   || '';
      const shipPin   = o.shipping?.pincode || o.shipping_pincode || '';
      const shipLat   = o.shipping?.latitude ?? o.shipping_latitude;
      const shipLng   = o.shipping?.longitude ?? o.shipping_longitude;
      const shipAddrFallback = o.shipping?.address || o.shipping_address || '';
      const deliveryDate = o.delivery?.date || o.delivery_date;
      const deliverySlot = o.delivery?.slot || o.delivery_slot || 'Any time';
      const paymentMethod = o.payment_method;
      const paymentStatus = o.payment_status || (paymentMethod === 'cod' ? 'pending' : 'paid');
      const orderNumber = o.order_number;
      const placedAt = o.placed_at || o.created_at || new Date().toISOString();
      const addrTypeLabel = { home: 'Home', office: 'Office', other: 'Other' }[shipAddrType] || 'Home';

      // ---------- Header ----------
      doc
        .fillColor(COLORS.forest)
        .font('Helvetica-Bold')
        .fontSize(26)
        .text(BRAND.name, 50, 50);

      doc
        .fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(9)
        .text(BRAND.tagline, 50, 80);

      // Right-side invoice meta
      const rightX = 340;
      doc
        .fillColor(COLORS.charcoal)
        .font('Helvetica-Bold')
        .fontSize(20)
        .text('TAX INVOICE', rightX, 50, { width: 205, align: 'right' });

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(COLORS.charcoal)
        .text(`Invoice #: ${orderNumber || '—'}`, rightX, 80, { width: 205, align: 'right' })
        .text(`Date: ${formatDate(placedAt)}`, rightX, 95, { width: 205, align: 'right' });

      if (BRAND.gstin) {
        doc.text(`GSTIN: ${BRAND.gstin}`, rightX, 110, { width: 205, align: 'right' });
      }

      // Divider
      doc
        .moveTo(50, 135)
        .lineTo(545, 135)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();

      // ---------- Seller / Buyer blocks ----------
      const blockTop = 150;

      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(9).text('FROM', 50, blockTop);
      doc.fillColor(COLORS.charcoal).font('Helvetica-Bold').fontSize(11).text(BRAND.name, 50, blockTop + 14);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.charcoal);
      let yFrom = blockTop + 30;
      if (BRAND.address) { doc.text(BRAND.address, 50, yFrom, { width: 230 }); yFrom += 24; }
      doc.text(BRAND.email, 50, yFrom); yFrom += 12;
      doc.text(BRAND.phone, 50, yFrom);

      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(9)
         .text(`BILL TO  (${addrTypeLabel})`, 310, blockTop);
      doc.fillColor(COLORS.charcoal).font('Helvetica-Bold').fontSize(11).text(customerName, 310, blockTop + 14);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.charcoal);
      let yTo = blockTop + 30;
      const line2 = [shipFlat, shipBuilding].filter(Boolean).join(', ');
      if (line2) { doc.text(line2, 310, yTo, { width: 235 }); yTo += 12; }
      if (shipStreet) { doc.text(shipStreet, 310, yTo, { width: 235 }); yTo += 12; }
      if (shipLandmark) {
        doc.fillColor(COLORS.muted).text('Landmark: ', 310, yTo, { continued: true })
           .fillColor(COLORS.charcoal).text(shipLandmark, { width: 235 });
        yTo += 12;
      }
      // Fallback if no structured parts were captured (legacy rows)
      if (!line2 && !shipStreet && shipAddrFallback) {
        doc.text(shipAddrFallback, 310, yTo, { width: 235 });
        yTo += 24;
      }
      const cityLine = [shipCity, shipState].filter(Boolean).join(', ') + (shipPin ? ` - ${shipPin}` : '');
      if (cityLine.trim()) { doc.text(cityLine, 310, yTo); yTo += 12; }
      doc.text(customerEmail, 310, yTo); yTo += 12;
      doc.text(customerPhone + (customerAlt ? `  ·  Alt: ${customerAlt}` : ''), 310, yTo); yTo += 12;
      if (shipLat != null && shipLng != null) {
        const acc = o.shipping?.geo_accuracy ?? o.shipping_geo_accuracy;
        doc.fillColor(COLORS.forest)
           .text(`GPS: ${Number(shipLat).toFixed(6)}, ${Number(shipLng).toFixed(6)}${acc ? ' (±' + acc + 'm)' : ''}`, 310, yTo, { width: 235 });
        doc.fillColor(COLORS.charcoal);
      }

      // ---------- Delivery / Payment strip ----------
      const stripTop = 260;
      doc
        .rect(50, stripTop, 495, 38)
        .fillColor(COLORS.cream)
        .fill();

      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8);
      doc.text('DELIVERY DATE', 62, stripTop + 7);
      doc.text('TIME SLOT', 210, stripTop + 7);
      doc.text('PAYMENT METHOD', 340, stripTop + 7);
      doc.text('STATUS', 470, stripTop + 7);

      doc.fillColor(COLORS.charcoal).font('Helvetica-Bold').fontSize(10);
      doc.text(formatDate(deliveryDate), 62, stripTop + 20);
      doc.text(String(deliverySlot), 210, stripTop + 20);
      doc.text(payLabel(paymentMethod), 340, stripTop + 20);
      doc.text(String(paymentStatus).toUpperCase(), 470, stripTop + 20);

      // ---------- Items table ----------
      const tableTop = 320;
      const colX = { item: 50, qty: 330, price: 385, total: 470 };

      doc.rect(50, tableTop, 495, 22).fillColor(COLORS.charcoal).fill();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10);
      doc.text('ITEM', colX.item + 8, tableTop + 7);
      doc.text('QTY', colX.qty, tableTop + 7, { width: 45, align: 'center' });
      doc.text('UNIT PRICE', colX.price, tableTop + 7, { width: 80, align: 'right' });
      doc.text('LINE TOTAL', colX.total, tableTop + 7, { width: 75, align: 'right' });

      let y = tableTop + 30;
      doc.fillColor(COLORS.charcoal).font('Helvetica').fontSize(10);
      (items || []).forEach((it, idx) => {
        if (y > 720) {
          doc.addPage();
          y = 60;
        }
        if (idx % 2 === 1) {
          doc.rect(50, y - 5, 495, 28).fillColor(COLORS.cream2).fill();
          doc.fillColor(COLORS.charcoal);
        }
        doc.font('Helvetica-Bold').fontSize(10).text(String(it.product_name || ''), colX.item + 8, y, { width: 270 });
        if (it.wood_type) {
          doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(String(it.wood_type), colX.item + 8, y + 13, { width: 270 });
          doc.fillColor(COLORS.charcoal);
        }
        doc.font('Helvetica').fontSize(10);
        doc.text(String(it.quantity), colX.qty, y + 4, { width: 45, align: 'center' });
        doc.text(inr(it.unit_price), colX.price, y + 4, { width: 80, align: 'right' });
        doc.font('Helvetica-Bold').text(inr(it.line_total), colX.total, y + 4, { width: 75, align: 'right' });
        doc.font('Helvetica');
        y += 30;
      });

      // ---------- Totals box ----------
      y += 10;
      if (y > 670) { doc.addPage(); y = 60; }

      const totalsX = 310;
      const totalsW = 235;

      const subtotal = Number(o.subtotal || 0);
      const discount = Number(o.discount_amount || 0);
      const gst = Number(o.gst_amount || 0);
      const shipping = Number(o.shipping_fee || 0);
      const total = Number(o.total || 0);

      const line = (label, value, opts = {}) => {
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(opts.big ? 13 : 10)
           .fillColor(opts.color || COLORS.charcoal);
        doc.text(label, totalsX, y, { width: 120 });
        doc.text(value, totalsX + 120, y, { width: totalsW - 120, align: 'right' });
        y += opts.big ? 22 : 18;
      };

      line('Subtotal', inr(subtotal));
      if (discount > 0) {
        line(`Discount${o.discount_code ? ' (' + o.discount_code + ')' : ''}`, '- ' + inr(discount), { color: COLORS.forest });
      }
      line('GST (18%)', inr(gst));
      line('Shipping', shipping === 0 ? 'Free' : inr(shipping));

      // Separator
      doc.moveTo(totalsX, y + 2).lineTo(totalsX + totalsW, y + 2)
         .lineWidth(1).strokeColor(COLORS.border).stroke();
      y += 10;

      line('TOTAL', inr(total), { bold: true, big: true, color: COLORS.forest });

      // ---------- Footer ----------
      const footerY = 770;
      doc.moveTo(50, footerY - 15).lineTo(545, footerY - 15)
         .lineWidth(1).strokeColor(COLORS.border).stroke();
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
      doc.text(
        `Thank you for shopping with ${BRAND.name}. For any queries email ${BRAND.email} or call ${BRAND.phone}.`,
        50, footerY, { width: 495, align: 'center' },
      );
      doc.fontSize(8).text(
        'This is a computer-generated invoice and does not require a signature.',
        50, footerY + 14, { width: 495, align: 'center' },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildInvoicePDF };
