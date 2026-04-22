/**
 * Vesta — Admin dashboard.
 *
 * Drives /admin.html. /api/admin/* is protected on the server by the
 * signed-in Google session: user must be in ADMIN_EMAILS and their email
 * must contain the substring "admin" (see backend/middleware/auth.js).
 * The browser sends the httpOnly `vesta_sid` cookie; no user-manual tokens.
 */
(function () {
  const PAGE_SIZE    = 25;

  // ------------------------------------------------------------------
  //  tiny helpers
  // ------------------------------------------------------------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'html') n.innerHTML = v;
      else if (v != null) n.setAttribute(k, v);
    });
    kids.flat().forEach(k => n.append(k instanceof Node ? k : document.createTextNode(String(k))));
    return n;
  };
  const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const formatINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const formatDate = (iso, withTime = true) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!withTime) return dd;
    const tt = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return `${dd}, ${tt}`;
  };
  const STATUS_LABELS = {
    placed: 'Placed', confirmed: 'Confirmed', packed: 'Packed',
    shipped: 'Shipped', out_for_delivery: 'Out for delivery',
    delivered: 'Delivered', cancelled: 'Cancelled',
  };
  const STATUS_STAGES = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
  const METHOD_LABELS = { cod: 'COD', upi: 'UPI', card: 'Card', netbanking: 'Netbanking' };

  // ------------------------------------------------------------------
  //  API layer (session cookie; see /js/api.js for credentials: include)
  // ------------------------------------------------------------------
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      showSignInGate('Your session expired. Please sign in again.');
      throw new Error('unauthorized');
    }
    if (res.status === 403) {
      const text = await res.text();
      let json; try { json = text ? JSON.parse(text) : {}; } catch (_) { json = {}; }
      const err = new Error(json?.error || 'Forbidden');
      err.status = 403;
      throw err;
    }
    if (res.status === 503) {
      const text = await res.text();
      let json; try { json = text ? JSON.parse(text) : {}; } catch (_) { json = {}; }
      throw new Error(json?.error || 'Service unavailable.');
    }
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { raw: text }; }
    if (!res.ok) {
      const msg = json?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return json;
  }

  // ------------------------------------------------------------------
  //  Login / access gate (Google)
  // ------------------------------------------------------------------
  function hideAllGates() {
    $('#adminLoginGate').hidden = true;
    $('#adminDenied').hidden = true;
    $('#adminDashboard').hidden = true;
  }

  function showSignInGate(errMsg) {
    hideAllGates();
    $('#adminLoginGate').hidden = false;
    const err = $('#adminLoginErr');
    if (errMsg) { err.textContent = errMsg; err.hidden = false; }
    else        { err.hidden = true; err.textContent = ''; }
    const mount = $('#adminGoogleMount');
    mount.innerHTML = '';
    if (window.VestaAuth && typeof window.VestaAuth.renderSignInButton === 'function') {
      window.VestaAuth.renderSignInButton(mount, {
        onSuccess: () => {
          window.location.reload();
        },
        onError: (msg) => {
          err.textContent = msg;
          err.hidden = false;
        },
      });
    } else {
      mount.textContent = 'Auth script not loaded. Check the page network tab.';
    }
  }

  function showDenied(user) {
    hideAllGates();
    $('#adminDenied').hidden = false;
    const em = $('#adminDeniedEmail');
    if (em) em.textContent = user?.email || '—';
  }

  function showDashboard() {
    hideAllGates();
    $('#adminDashboard').hidden = false;
  }

  $('#adminDeniedSignOut')?.addEventListener('click', () => {
    if (window.VestaAuth) window.VestaAuth.logout();
  });

  $('#adminLogoutBtn').addEventListener('click', () => {
    if (window.VestaAuth) window.VestaAuth.logout();
  });

  // ------------------------------------------------------------------
  //  State + rendering
  // ------------------------------------------------------------------
  const state = {
    filters: {
      status: '',
      payment_status: '',
      payment_method: '',
      search: '',
    },
    page: 1,
    pages: 1,
    total: 0,
    rows: [],
  };

  function paymentPill(row) {
    const map = {
      paid:     { cls: 'pill--ok',   label: 'Paid' },
      pending:  { cls: 'pill--warn', label: 'Pending' },
      failed:   { cls: 'pill--bad',  label: 'Failed' },
      refunded: { cls: 'pill--mut',  label: 'Refunded' },
    };
    const p = map[row.payment_status] || { cls: 'pill--mut', label: row.payment_status };
    const m = METHOD_LABELS[row.payment_method] || row.payment_method;
    return `<span class="pill ${p.cls}" title="${escapeHTML(m + ' — ' + p.label)}">${escapeHTML(m)} · ${escapeHTML(p.label)}</span>`;
  }

  function statusPill(row) {
    const map = {
      placed:           'pill--info',
      confirmed:        'pill--accent',
      packed:           'pill--accent',
      shipped:          'pill--accent',
      out_for_delivery: 'pill--accent',
      delivered:        'pill--ok',
      cancelled:        'pill--bad',
    };
    const cls = map[row.order_status] || 'pill--mut';
    return `<span class="pill ${cls}">${escapeHTML(STATUS_LABELS[row.order_status] || row.order_status)}</span>`;
  }

  function rowActionAttention(row) {
    // Visual hint: orders that need the owner's attention.
    const needsConfirmation = row.order_status === 'placed';
    const needsPaymentCheck = row.payment_status === 'pending' && row.payment_method !== 'cod';
    return needsConfirmation || needsPaymentCheck ? 'admin-row--attention' : '';
  }

  function renderRows() {
    const tbody = $('#adminOrdersBody');
    tbody.innerHTML = '';
    if (state.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="admin-empty">No orders match these filters.</td></tr>';
      $('#adminPager').hidden = true;
      return;
    }
    state.rows.forEach(r => {
      const tr = el('tr', { class: rowActionAttention(r), dataset: { order: r.order_number } });
      tr.innerHTML = `
        <td><span class="admin-mono">${escapeHTML(r.order_number)}</span></td>
        <td>
          <div class="admin-cust">
            <div class="admin-cust__name">${escapeHTML(r.customer_name || '—')}</div>
            <div class="admin-cust__sub">${escapeHTML(r.customer_phone || '—')} · ${escapeHTML(r.customer_email || '—')}</div>
          </div>
        </td>
        <td>
          <div>${formatDate(r.delivery_date, false)}</div>
          <div class="admin-muted">${escapeHTML(r.shipping_city || '')}${r.shipping_pincode ? ' · ' + escapeHTML(r.shipping_pincode) : ''}</div>
        </td>
        <td class="admin-col-num">${r.items_count || 0}</td>
        <td class="admin-col-num"><strong>${formatINR(r.total)}</strong></td>
        <td>${paymentPill(r)}</td>
        <td>${statusPill(r)}</td>
        <td class="admin-col-num admin-muted">${formatDate(r.created_at)}</td>
        <td><button class="admin-btn admin-btn--sm" data-open="${escapeHTML(r.order_number)}">Open</button></td>
      `;
      tbody.appendChild(tr);
    });

    $('#adminPager').hidden = state.pages <= 1;
    $('#adminPagerLabel').textContent = `Page ${state.page} of ${state.pages} · ${state.total} orders`;
  }

  function renderStats(stats) {
    const wrap = $('.admin-kpis');
    wrap.querySelector('[data-kpi="orders_today"] [data-val]').textContent = stats.orders_today;
    wrap.querySelector('[data-kpi="orders_week"] [data-val]').textContent = stats.orders_week;
    wrap.querySelector('[data-kpi="needs_confirmation"] [data-val]').textContent = stats.needs_confirmation;
    wrap.querySelector('[data-kpi="needs_payment_check"] [data-val]').textContent = stats.needs_payment_check;
    wrap.querySelector('[data-kpi="cod_in_flight"] [data-val]').textContent = stats.cod_in_flight;
    wrap.querySelector('[data-kpi="gross_revenue"] [data-val]').textContent = formatINR(stats.gross_revenue);
  }

  // ------------------------------------------------------------------
  //  Loaders
  // ------------------------------------------------------------------
  async function loadStats() {
    try {
      const stats = await api('/api/admin/stats');
      renderStats(stats);
    } catch (err) {
      console.warn('[admin] stats failed:', err.message);
    }
  }

  async function loadOrders() {
    const params = new URLSearchParams();
    if (state.filters.status)         params.set('status', state.filters.status);
    if (state.filters.payment_status) params.set('payment_status', state.filters.payment_status);
    if (state.filters.payment_method) params.set('payment_method', state.filters.payment_method);
    if (state.filters.search)         params.set('search', state.filters.search);
    params.set('page', state.page);
    params.set('limit', PAGE_SIZE);

    $('#adminOrdersBody').innerHTML = '<tr><td colspan="9" class="admin-loading">Loading...</td></tr>';
    try {
      const data = await api(`/api/admin/orders?${params.toString()}`);
      state.rows  = data.orders;
      state.total = data.total;
      state.pages = data.pages;
      state.page  = data.page;
      renderRows();
    } catch (err) {
      $('#adminOrdersBody').innerHTML = `<tr><td colspan="9" class="admin-empty">Error: ${escapeHTML(err.message)}</td></tr>`;
    }
  }

  function refreshAll() {
    loadStats();
    loadOrders();
  }

  // ------------------------------------------------------------------
  //  Filters + pager
  // ------------------------------------------------------------------
  let searchTimer;
  $('#adminSearch').addEventListener('input', (e) => {
    state.filters.search = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.page = 1; loadOrders(); }, 250);
  });
  ['adminStatusFilter', 'adminPaymentFilter', 'adminMethodFilter'].forEach((id, i) => {
    const key = ['status', 'payment_status', 'payment_method'][i];
    $('#' + id).addEventListener('change', (e) => {
      state.filters[key] = e.target.value;
      state.page = 1;
      loadOrders();
    });
  });
  $('#adminClearFilters').addEventListener('click', () => {
    state.filters = { status: '', payment_status: '', payment_method: '', search: '' };
    state.page = 1;
    $('#adminSearch').value = '';
    $('#adminStatusFilter').value = '';
    $('#adminPaymentFilter').value = '';
    $('#adminMethodFilter').value = '';
    loadOrders();
  });
  $('#adminPager').addEventListener('click', (e) => {
    const act = e.target.closest('[data-page-act]')?.dataset.pageAct;
    if (!act) return;
    if (act === 'prev' && state.page > 1)         { state.page--; loadOrders(); }
    if (act === 'next' && state.page < state.pages) { state.page++; loadOrders(); }
  });
  $('#adminRefreshBtn').addEventListener('click', refreshAll);

  // Delegated "Open" button click on any order row
  $('#adminOrdersBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]');
    if (btn) openDrawer(btn.dataset.open);
  });

  // ------------------------------------------------------------------
  //  Detail drawer
  // ------------------------------------------------------------------
  const drawer = $('#adminDrawer');
  let currentDetail = null;

  function closeDrawer() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-drawer-open');
    currentDetail = null;
  }
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-drawer-close]')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
  });

  async function openDrawer(orderNumber) {
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-drawer-open');
    $('[data-drawer-order-eyebrow]').textContent = 'Order';
    $('[data-drawer-order-title]').textContent = orderNumber;
    $('#adminDrawerBody').innerHTML = '<div class="admin-loading">Loading...</div>';

    try {
      const detail = await api(`/api/admin/orders/${encodeURIComponent(orderNumber)}`);
      currentDetail = detail;
      renderDrawer(detail);
    } catch (err) {
      $('#adminDrawerBody').innerHTML = `<div class="admin-empty">Error: ${escapeHTML(err.message)}</div>`;
    }
  }

  function renderDrawer({ order, items }) {
    const body = $('#adminDrawerBody');
    const pdRaw = order.payment_details || {};
    const pd = typeof pdRaw === 'string' ? (() => { try { return JSON.parse(pdRaw); } catch (_) { return {}; } })() : pdRaw;

    const paymentLines = [];
    if (order.payment_method === 'upi') {
      paymentLines.push(`<div><b>UPI ID:</b> <span class="admin-mono">${escapeHTML(pd.upi_id || '—')}</span></div>`);
      paymentLines.push(`<div><b>Handle:</b> ${escapeHTML(pd.handle || '—')}</div>`);
    } else if (order.payment_method === 'card') {
      paymentLines.push(`<div><b>Card:</b> ${escapeHTML(pd.brand_label || 'Card')} ···· ${escapeHTML(pd.last4 || '----')}</div>`);
      paymentLines.push(`<div><b>Name on card:</b> ${escapeHTML(pd.name_on_card || '—')}</div>`);
      paymentLines.push(`<div><b>Expiry:</b> ${escapeHTML(pd.expiry || '—')}</div>`);
    } else if (order.payment_method === 'netbanking') {
      paymentLines.push(`<div><b>Bank:</b> ${escapeHTML(pd.bank || '—')}</div>`);
    } else if (order.payment_method === 'cod') {
      paymentLines.push(`<div class="admin-muted">Cash on Delivery — collect at handover.</div>`);
    }

    const shippingAddr = [
      order.shipping_flat,
      order.shipping_building,
      order.shipping_street,
      order.shipping_landmark ? `Landmark: ${order.shipping_landmark}` : null,
      order.shipping_locality,
      `${order.shipping_city || ''}, ${order.shipping_state || ''} — ${order.shipping_pincode || ''}`,
    ].filter(Boolean).join('<br>');

    const itemsHtml = items.map(it => `
      <div class="admin-item">
        <div class="admin-item__name">${escapeHTML(it.product_name)}</div>
        <div class="admin-item__meta">${escapeHTML(it.wood_type || '')} · Qty ${it.quantity} × ${formatINR(it.unit_price)}</div>
        <div class="admin-item__total">${formatINR(it.line_total)}</div>
      </div>
    `).join('');

    const cancelled = order.order_status === 'cancelled';
    const nextStatus = cancelled ? null : (() => {
      const i = STATUS_STAGES.indexOf(order.order_status);
      return (i >= 0 && i < STATUS_STAGES.length - 1) ? STATUS_STAGES[i + 1] : null;
    })();

    const mapsLink = (order.shipping_latitude != null && order.shipping_longitude != null)
      ? `<a href="https://maps.google.com/?q=${order.shipping_latitude},${order.shipping_longitude}" target="_blank" rel="noopener" class="admin-muted">View GPS pin ↗</a>`
      : '';

    body.innerHTML = `
      <div class="admin-drawer__grid">

        <!-- ============ Actions ============ -->
        <section class="admin-card">
          <h3 class="admin-card__title">Actions</h3>
          <div class="admin-actions">

            <div class="admin-action-group">
              <div class="admin-action-group__label">Payment (currently <b>${escapeHTML(order.payment_status)}</b>)</div>
              <div class="admin-action-group__btns">
                ${order.payment_status !== 'paid'     ? `<button class="admin-btn admin-btn--ok"  data-action="pay" data-value="paid">Mark as paid</button>` : ''}
                ${order.payment_status !== 'pending' ? `<button class="admin-btn admin-btn--ghost" data-action="pay" data-value="pending">Mark as pending</button>` : ''}
                ${order.payment_status !== 'failed'  ? `<button class="admin-btn admin-btn--bad"   data-action="pay" data-value="failed">Mark as failed</button>` : ''}
                ${order.payment_status !== 'refunded'? `<button class="admin-btn admin-btn--ghost" data-action="pay" data-value="refunded">Mark as refunded</button>` : ''}
              </div>
              <p class="admin-muted admin-action-group__hint">
                Use this after you verify the transfer in your UPI / bank app. An audit line is
                appended to the order's notes with a timestamp.
              </p>
            </div>

            <div class="admin-action-group">
              <div class="admin-action-group__label">Order status (currently <b>${escapeHTML(STATUS_LABELS[order.order_status] || order.order_status)}</b>)</div>
              <div class="admin-action-group__btns">
                ${nextStatus ? `<button class="admin-btn admin-btn--accent" data-action="status" data-value="${nextStatus}">Advance → ${escapeHTML(STATUS_LABELS[nextStatus])}</button>` : ''}
                ${!cancelled && order.order_status !== 'delivered' ? `<button class="admin-btn admin-btn--bad" data-action="status" data-value="cancelled">Cancel order</button>` : ''}
              </div>
              <div class="admin-track-fields">
                <input type="text" class="form-control" id="adminTrackNo" placeholder="Tracking number (optional)" value="${escapeHTML(order.tracking_number || '')}" maxlength="80" />
                <input type="text" class="form-control" id="adminCourier" placeholder="Courier name (optional)" value="${escapeHTML(order.courier_name || '')}" maxlength="80" />
              </div>
              <p class="admin-muted admin-action-group__hint">
                Advancing the status emails the customer (if SMTP is configured).
              </p>
            </div>

            <div class="admin-action-group">
              <a class="admin-btn admin-btn--ghost" href="/api/orders/${encodeURIComponent(order.order_number)}/invoice.pdf" target="_blank" rel="noopener">Download invoice PDF</a>
            </div>
          </div>
        </section>

        <!-- ============ Summary ============ -->
        <section class="admin-card">
          <h3 class="admin-card__title">Summary</h3>
          <dl class="admin-dl">
            <dt>Placed</dt><dd>${formatDate(order.created_at)}</dd>
            <dt>Status</dt><dd>${statusPill(order)}</dd>
            <dt>Payment</dt><dd>${paymentPill(order)}</dd>
            <dt>Delivery</dt><dd>${formatDate(order.delivery_date, false)} · ${escapeHTML(order.delivery_slot || 'Any time')}</dd>
            ${order.tracking_number ? `<dt>Tracking</dt><dd>${escapeHTML(order.courier_name || '—')} — <span class="admin-mono">${escapeHTML(order.tracking_number)}</span></dd>` : ''}
          </dl>
        </section>

        <!-- ============ Customer ============ -->
        <section class="admin-card">
          <h3 class="admin-card__title">Customer</h3>
          <dl class="admin-dl">
            <dt>Name</dt><dd>${escapeHTML(order.customer_name)}</dd>
            <dt>Email</dt><dd><a href="mailto:${encodeURIComponent(order.customer_email)}">${escapeHTML(order.customer_email)}</a></dd>
            <dt>Phone</dt><dd><a href="tel:${encodeURIComponent(order.customer_phone)}">${escapeHTML(order.customer_phone)}</a></dd>
            ${order.customer_alt_phone ? `<dt>Alt. phone</dt><dd>${escapeHTML(order.customer_alt_phone)}</dd>` : ''}
          </dl>
        </section>

        <!-- ============ Shipping ============ -->
        <section class="admin-card">
          <h3 class="admin-card__title">Shipping address</h3>
          <p class="admin-address">${shippingAddr}</p>
          ${mapsLink}
        </section>

        <!-- ============ Payment details ============ -->
        <section class="admin-card">
          <h3 class="admin-card__title">Payment details</h3>
          <div class="admin-paydetails">${paymentLines.join('') || '<div class="admin-muted">No extra details.</div>'}</div>
          ${order.payment_method !== 'cod' ? `
            <p class="admin-muted admin-action-group__hint" style="margin-top:.5rem">
              ⚠ This system does not process real payments. Confirm the transfer in your
              UPI / bank app, then use <b>Mark as paid</b> above.
            </p>
          ` : ''}
        </section>

        <!-- ============ Items ============ -->
        <section class="admin-card admin-card--wide">
          <h3 class="admin-card__title">Items</h3>
          <div class="admin-items">${itemsHtml}</div>
          <dl class="admin-dl admin-dl--totals">
            <dt>Subtotal</dt><dd>${formatINR(order.subtotal)}</dd>
            ${Number(order.discount_amount) > 0 ? `<dt>Discount ${order.discount_code ? `(${escapeHTML(order.discount_code)})` : ''}</dt><dd>− ${formatINR(order.discount_amount)}</dd>` : ''}
            <dt>Shipping</dt><dd>${Number(order.shipping_fee) > 0 ? formatINR(order.shipping_fee) : 'Free'}</dd>
            <dt>GST</dt><dd>${formatINR(order.gst_amount)}</dd>
            <dt class="admin-dl__strong">Total</dt><dd class="admin-dl__strong">${formatINR(order.total)}</dd>
          </dl>
        </section>

        ${order.notes ? `
        <section class="admin-card admin-card--wide">
          <h3 class="admin-card__title">Notes</h3>
          <pre class="admin-notes">${escapeHTML(order.notes)}</pre>
        </section>` : ''}

      </div>
    `;

    // Wire up action buttons
    body.querySelectorAll('[data-action="pay"]').forEach(btn => {
      btn.addEventListener('click', () => runPaymentAction(btn.dataset.value, order.order_number));
    });
    body.querySelectorAll('[data-action="status"]').forEach(btn => {
      btn.addEventListener('click', () => runStatusAction(btn.dataset.value, order.order_number));
    });
  }

  async function runPaymentAction(newStatus, orderNumber) {
    let note = '';
    if (newStatus === 'paid') {
      note = window.prompt(
        `Mark payment as PAID for ${orderNumber}?\n\n` +
        'Optional: paste the UPI reference / bank UTR / receipt number for your records. ' +
        'This will be saved in the order notes.',
        ''
      );
      if (note === null) return; // cancelled
    } else {
      const ok = window.confirm(`Change payment to "${newStatus}" for ${orderNumber}?`);
      if (!ok) return;
      if (newStatus === 'refunded') {
        note = window.prompt('Reason / reference for refund (optional):', '') || '';
        if (note === null) return;
      }
    }

    try {
      await api(`/api/admin/orders/${encodeURIComponent(orderNumber)}/payment`, {
        method: 'PATCH',
        body: { payment_status: newStatus, note: note || undefined },
      });
      await openDrawer(orderNumber);
      refreshAll();
    } catch (err) {
      alert('Failed to update payment: ' + err.message);
    }
  }

  async function runStatusAction(newStatus, orderNumber) {
    if (newStatus === 'cancelled' && !window.confirm(`Cancel order ${orderNumber}? The customer will be notified.`)) return;

    const tn  = $('#adminTrackNo')?.value.trim();
    const cr  = $('#adminCourier')?.value.trim();

    try {
      await api(`/api/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
        method: 'PATCH',
        body: {
          status: newStatus,
          tracking_number: tn || undefined,
          courier_name: cr || undefined,
        },
      });
      await openDrawer(orderNumber);
      refreshAll();
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  }

  // ------------------------------------------------------------------
  //  Boot
  // ------------------------------------------------------------------
  function bootDashboard() { refreshAll(); }

  (async function init() {
    await (window.VestaAuth && VestaAuth.whoami && VestaAuth.whoami());
    const u = (window.VestaAuth && VestaAuth.getUser) ? VestaAuth.getUser() : null;
    if (!u) {
      showSignInGate();
      return;
    }
    if (!VestaAuth.isAdmin || !VestaAuth.isAdmin()) {
      showDenied(u);
      return;
    }
    try {
      await api('/api/admin/stats');
      showDashboard();
      bootDashboard();
    } catch (err) {
      if (err.message === 'unauthorized') return;
      if (err.status === 403) {
        showDenied(u);
        return;
      }
      showSignInGate(err.message);
    }
  })();
})();
