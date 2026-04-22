(function () {
  const el = document.getElementById('receipt');

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function wireInvoiceDownload(order) {
    const btn = document.getElementById('btn-download-invoice');
    if (!btn) return;
    if (order && order.order_number) {
      btn.href = `/api/orders/${encodeURIComponent(order.order_number)}/invoice.pdf`;
      btn.setAttribute('download', `Vesta-Invoice-${order.order_number}.pdf`);
      btn.classList.remove('disabled');
    } else {
      btn.classList.add('disabled');
      btn.setAttribute('aria-disabled', 'true');
    }
  }

  function buildWhatsAppURL(order) {
    const store = (window.VESTA_STORE_PHONE || order._store_phone || '').replace(/[^\d]/g, '');
    // Fallback: the store phone is in the footer, but if we can't find it, skip.
    if (!store) return null;
    const phone = store.startsWith('91') ? store : (store.length === 10 ? '91' + store : store);
    const lat = order.shipping?.latitude ?? order.shipping_latitude;
    const lng = order.shipping?.longitude ?? order.shipping_longitude;
    const addr = [
      order.shipping?.flat || order.shipping_flat,
      order.shipping?.building || order.shipping_building,
      order.shipping?.street || order.shipping_street,
    ].filter(Boolean).join(', ');
    const city = order.shipping?.city || order.shipping_city || '';
    const pin  = order.shipping?.pincode || order.shipping_pincode || '';
    const lm   = order.shipping?.landmark || order.shipping_landmark || '—';
    const pinMsg = (lat != null && lng != null) ? `\nMy GPS pin: https://www.google.com/maps?q=${lat},${lng}` : '';
    const msg = `Hi Vesta team, confirming my order ${order.order_number}.\nAddress: ${addr}, ${city} - ${pin}. Landmark: ${lm}.${pinMsg}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  function wireWhatsApp(order) {
    const btn = document.getElementById('btn-wa-confirm');
    if (!btn) return;
    const url = buildWhatsAppURL(order);
    if (url) {
      btn.href = url;
      btn.style.display = '';
    } else {
      btn.style.display = 'none';
    }
  }

  function wireTrackButton(order) {
    const btn = document.getElementById('btn-track-order');
    if (!btn || !order?.order_number) return;
    const q = new URLSearchParams({ order: order.order_number });
    btn.href = `/track.html?${q.toString()}`;
  }

  function fmtDateTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'numeric', minute:'2-digit' });
  }

  async function renderStatusSnapshot(order) {
    const el = document.getElementById('statusSnapshot');
    if (!el || !order?.order_number) return;
    try {
      const { tracking } = await VestaAPI.trackOrder(order.order_number);
      const eta = tracking.eta_days;
      let etaLine = '';
      if (tracking.current_status === 'delivered') {
        etaLine = `Delivered on ${escapeHTML(new Date(tracking.delivery_date || Date.now()).toDateString())}`;
      } else if (tracking.cancelled) {
        etaLine = 'Order cancelled';
      } else if (eta != null && tracking.delivery_date) {
        etaLine = eta <= 0 ? `Arrives today · ${escapeHTML(new Date(tracking.delivery_date).toDateString())}`
                           : eta === 1 ? `Arrives tomorrow · ${escapeHTML(new Date(tracking.delivery_date).toDateString())}`
                                       : `Arrives in ${eta} days · ${escapeHTML(new Date(tracking.delivery_date).toDateString())}`;
      }
      el.innerHTML = `
        <div class="fx-track-card">
          <div class="fx-track-hero">
            <div>
              <div class="small text-muted-soft text-uppercase" style="letter-spacing:.12em;">Live status</div>
              <div style="font-size:1.1rem;font-weight:600;">${escapeHTML(tracking.current_label)}</div>
            </div>
            ${etaLine ? `<div class="eta"><strong>${etaLine}</strong></div>` : ''}
          </div>
          ${!tracking.cancelled ? `<div class="fx-progress-bar"><span style="width:${tracking.progress_pct}%"></span></div>` : ''}
          <ul class="fx-timeline">
            ${tracking.stages.map(s => `
              <li class="${s.done ? 'done' : ''} ${s.active ? 'active' : ''} ${!s.done && !s.active ? 'pending' : ''}">
                <span class="dot"></span>
                <div class="t-label">${escapeHTML(s.label)}</div>
                <div class="t-time">${s.timestamp ? escapeHTML(fmtDateTime(s.timestamp)) : (s.active ? 'In progress' : 'Pending')}</div>
              </li>`).join('')}
          </ul>
        </div>`;
      el.style.display = '';
    } catch (_) { /* silently skip snapshot if tracking is unavailable */ }
  }

  function describePayment(details) {
    let d = details;
    if (!d) return '';
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (_) { return ''; }
    }
    if (!d || typeof d !== 'object') return '';
    if (d.method === 'upi')        return `UPI: <code>${escapeHTML(d.upi_id || '')}</code>${d.verified ? ' <span class="text-forest">✓ Verified</span>' : ''}`;
    if (d.method === 'card')       return `${escapeHTML(d.brand_label || 'Card')} ending <strong>${escapeHTML(d.last4 || '')}</strong> · ${escapeHTML(d.name_on_card || '')}${d.verified ? ' <span class="text-forest">✓ Verified</span>' : ''}`;
    if (d.method === 'netbanking') return `Bank: <strong>${escapeHTML(d.bank || '')}</strong>`;
    if (d.method === 'cod')        return `Cash or UPI on delivery`;
    return '';
  }

  function renderReceipt(order, items) {
    wireInvoiceDownload(order);
    wireWhatsApp(order);
    wireTrackButton(order);
    renderStatusSnapshot(order);
    const placed = new Date(order.placed_at || order.created_at || Date.now());
    const payLabel = { upi: 'UPI', card: 'Credit / Debit Card', netbanking: 'Net Banking', cod: 'Cash on Delivery' }[order.payment_method] || order.payment_method;
    const payDetailsHTML = describePayment(order.payment_details);

    // Handle two shapes: /checkout response or /orders/:n response
    const customerName = order.customer?.name || order.customer_name;
    const customerEmail = order.customer?.email || order.customer_email;
    const customerPhone = order.customer?.phone || order.customer_phone;
    const customerAlt   = order.customer?.alt_phone || order.customer_alt_phone || '';
    const shipFlat     = order.shipping?.flat     || order.shipping_flat     || '';
    const shipBuilding = order.shipping?.building || order.shipping_building || '';
    const shipStreet   = order.shipping?.street   || order.shipping_street   || '';
    const shipLandmark = order.shipping?.landmark || order.shipping_landmark || '';
    const shipType     = order.shipping?.address_type || order.shipping_address_type || 'home';
    const shipAddrFallback = order.shipping?.address || order.shipping_address || '';
    const shipCity = order.shipping?.city || order.shipping_city;
    const shipState = order.shipping?.state || order.shipping_state;
    const shipPin  = order.shipping?.pincode || order.shipping_pincode;
    const shipLat = order.shipping?.latitude ?? order.shipping_latitude;
    const shipLng = order.shipping?.longitude ?? order.shipping_longitude;
    const shipGeoAcc = order.shipping?.geo_accuracy ?? order.shipping_geo_accuracy;
    const deliveryDate = order.delivery?.date || order.delivery_date;
    const deliverySlot = order.delivery?.slot || order.delivery_slot;
    const typeIcon = { home: '🏠 Home', office: '🏢 Office', other: '📍 Other' }[shipType] || '🏠 Home';

    const line2 = [shipFlat, shipBuilding].filter(Boolean).join(', ');
    const mapsLinkHTML = (shipLat != null && shipLng != null)
      ? `<div class="small mt-1"><a href="https://www.google.com/maps?q=${shipLat},${shipLng}" target="_blank" rel="noopener">📍 GPS pin on Google Maps</a>${shipGeoAcc ? ` (±${shipGeoAcc}m)` : ''}</div>`
      : '';

    el.innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div style="font-family:var(--font-serif); font-size:1.6rem; font-weight:600">Vesta</div>
          <div class="small text-muted-soft">Heirloom wooden furniture</div>
        </div>
        <div class="text-end small">
          <div><strong>Order #</strong> ${escapeHTML(order.order_number)}</div>
          <div class="text-muted-soft">${placed.toLocaleString()}</div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-sm-6">
          <h4>Shipping to <span class="small text-muted-soft">· ${typeIcon}</span></h4>
          <div><strong>${escapeHTML(customerName)}</strong></div>
          ${line2 ? `<div class="small">${escapeHTML(line2)}</div>` : ''}
          ${shipStreet ? `<div class="small">${escapeHTML(shipStreet)}</div>` : ''}
          ${shipLandmark ? `<div class="small"><span class="text-muted-soft">Landmark:</span> ${escapeHTML(shipLandmark)}</div>` : ''}
          ${(!line2 && !shipStreet && shipAddrFallback) ? `<div class="small">${escapeHTML(shipAddrFallback)}</div>` : ''}
          <div class="small">${escapeHTML(shipCity)}, ${escapeHTML(shipState)} — ${escapeHTML(shipPin)}</div>
          <div class="small text-muted-soft mt-1">
            ${escapeHTML(customerPhone)}${customerAlt ? ' · Alt: ' + escapeHTML(customerAlt) : ''}
            · ${escapeHTML(customerEmail)}
          </div>
          ${mapsLinkHTML}
        </div>
        <div class="col-sm-6">
          <h4>Delivery & Payment</h4>
          <div class="small"><strong>Delivery:</strong> ${new Date(deliveryDate).toDateString()}</div>
          <div class="small"><strong>Slot:</strong> ${escapeHTML(deliverySlot || 'Any time')}</div>
          <div class="small mt-1"><strong>Payment:</strong> ${escapeHTML(payLabel)}</div>
          ${payDetailsHTML ? `<div class="small">${payDetailsHTML}</div>` : ''}
          <div class="small"><strong>Status:</strong> <span class="text-forest">Order placed</span></div>
        </div>
      </div>

      <h4>Items</h4>
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead style="background:var(--cream-2)">
            <tr><th>Item</th><th class="text-center">Qty</th><th class="text-end">Price</th><th class="text-end">Line total</th></tr>
          </thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td>
                  <div>${escapeHTML(i.product_name)}</div>
                  <div class="small text-muted-soft">${escapeHTML(i.wood_type || '')}</div>
                </td>
                <td class="text-center">${i.quantity}</td>
                <td class="text-end">${VestaCart.formatINR(Number(i.unit_price))}</td>
                <td class="text-end">${VestaCart.formatINR(Number(i.line_total))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="row">
        <div class="col-md-6 ms-auto">
          <div class="summary-line"><span>Subtotal</span><span>${VestaCart.formatINR(Number(order.subtotal))}</span></div>
          ${Number(order.discount_amount) > 0 ? `
            <div class="summary-line discount">
              <span>Discount (${escapeHTML(order.discount_code || '')})</span>
              <span>− ${VestaCart.formatINR(Number(order.discount_amount))}</span>
            </div>` : ''}
          <div class="summary-line"><span>GST (18%)</span><span>${VestaCart.formatINR(Number(order.gst_amount))}</span></div>
          <div class="summary-line"><span>Shipping</span><span>${Number(order.shipping_fee) === 0 ? 'Free' : VestaCart.formatINR(Number(order.shipping_fee))}</span></div>
          <div class="summary-line total"><span>Total</span><span>${VestaCart.formatINR(Number(order.total))}</span></div>
        </div>
      </div>

      <hr class="mt-4" />
      <div class="small text-muted-soft">
        Questions? Email <a href="mailto:contactVesta@gmail.com">contactVesta@gmail.com</a> or call +91 75837 77875.
        Keep this receipt for your records — Vesta GSTIN will be printed on the invoice shipped with your order.
      </div>
    `;
  }

  async function loadStorePhone() {
    if (window.VESTA_STORE_PHONE) return;
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      const j = await r.json();
      if (j?.store?.phone) window.VESTA_STORE_PHONE = j.store.phone;
    } catch (_) { /* ignore */ }
  }

  async function load() {
    const orderNumber = new URLSearchParams(location.search).get('order');
    const cached = sessionStorage.getItem('vesta_last_order');

    await loadStorePhone();

    try {
      if (orderNumber) {
        const { order, items } = await VestaAPI.getOrder(orderNumber);
        renderReceipt(order, items);
        return;
      }
      if (cached) {
        const order = JSON.parse(cached);
        renderReceipt(order, order.items || []);
        return;
      }
      el.innerHTML = `<p class="text-center text-muted-soft">No recent order found. <a href="/products.html">Continue shopping</a>.</p>`;
    } catch (err) {
      if (cached) {
        const order = JSON.parse(cached);
        renderReceipt(order, order.items || []);
      } else {
        el.innerHTML = `<p class="text-center text-muted-soft">${err.message || 'Could not load order.'}</p>`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
