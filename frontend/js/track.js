/**
 * Customer-facing order tracking page.
 * Deep-linkable via ?order=FX-...&contact=<email|last4>
 */
(function () {
  const form      = document.getElementById('trackForm');
  const btn       = document.getElementById('trackBtn');
  const errBox    = document.getElementById('trackError');
  const resultEl  = document.getElementById('trackResult');
  const emptyEl   = document.getElementById('trackEmptyState');

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function fmtINR(n) { return (window.VestaCart && VestaCart.formatINR) ? VestaCart.formatINR(Number(n)) : '₹' + Number(n).toLocaleString('en-IN'); }
  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
  }
  function fmtDateTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'numeric', minute:'2-digit' });
  }

  function etaText(eta, deliveryDate, currentStatus) {
    if (currentStatus === 'delivered') return { pill: 'Delivered', sub: 'Delivered on ' + fmtDate(deliveryDate) };
    if (currentStatus === 'cancelled') return { pill: 'Cancelled', sub: '' };
    if (eta == null || !deliveryDate) return { pill: '', sub: '' };
    if (eta < 0) {
      return { pill: 'Overdue', sub: `Scheduled for ${fmtDate(deliveryDate)} — please contact us.` };
    }
    if (eta === 0)  return { pill: 'Arrives today', sub: fmtDate(deliveryDate) };
    if (eta === 1)  return { pill: 'Arrives tomorrow', sub: fmtDate(deliveryDate) };
    return { pill: `Arrives in ${eta} days`, sub: fmtDate(deliveryDate) };
  }

  function renderTimeline(stages) {
    return `
      <ul class="fx-timeline">
        ${stages.map(s => `
          <li class="${s.done ? 'done' : ''} ${s.active ? 'active' : ''} ${!s.done && !s.active ? 'pending' : ''}">
            <span class="dot"></span>
            <div class="t-label">${esc(s.label)}</div>
            <div class="t-time">${s.timestamp ? esc(fmtDateTime(s.timestamp)) : (s.active ? 'In progress' : 'Pending')}</div>
          </li>`).join('')}
      </ul>`;
  }

  function render(tracking) {
    const eta = etaText(tracking.eta_days, tracking.delivery_date, tracking.current_status);
    const cancelled = tracking.cancelled;
    const statusPill = cancelled
      ? `<span class="status-pill cancelled">✖ ${esc(tracking.current_label)}</span>`
      : `<span class="status-pill">● ${esc(tracking.current_label)}</span>`;

    const courierBlock = (tracking.tracking_number || tracking.courier_name) ? `
      <div class="alert alert-light mb-3" style="border:1px solid var(--line)">
        <strong>Courier:</strong> ${esc(tracking.courier_name || '—')}
        ${tracking.tracking_number ? ` · <strong>AWB #:</strong> <code>${esc(tracking.tracking_number)}</code>` : ''}
      </div>` : '';

    resultEl.innerHTML = `
      <div class="fx-track-hero">
        <div>
          <div class="small text-muted-soft text-uppercase" style="letter-spacing:.12em;">Order</div>
          <h3 class="mb-1" style="font-family:var(--font-serif)">#${esc(tracking.order_number)}</h3>
          <div class="small text-muted-soft">Placed ${esc(fmtDateTime(tracking.placed_at))}</div>
        </div>
        <div class="text-end">
          ${statusPill}
          ${eta.pill ? `<div class="eta mt-2"><strong>${esc(eta.pill)}</strong></div>` : ''}
          ${eta.sub ? `<div class="small text-muted-soft">${esc(eta.sub)}</div>` : ''}
        </div>
      </div>

      ${!cancelled ? `
        <div class="fx-progress-bar"><span style="width:${tracking.progress_pct}%"></span></div>
      ` : ''}

      ${courierBlock}

      <h5 class="mb-3" style="font-family:var(--font-sans);font-weight:600">Delivery timeline</h5>
      ${renderTimeline(tracking.stages)}

      <div class="fx-track-meta">
        <div><div class="k">Customer</div><div class="v">${esc(tracking.customer_name || '—')}</div></div>
        <div><div class="k">Items</div><div class="v">${Number(tracking.items_count || 0)}</div></div>
        <div><div class="k">Total</div><div class="v">${esc(fmtINR(tracking.total))}</div></div>
        <div><div class="k">Ship to</div><div class="v">${esc(tracking.city || '—')}${tracking.pincode ? ' · ' + esc(tracking.pincode) : ''}</div></div>
        <div><div class="k">Delivery window</div><div class="v">${esc(tracking.delivery_slot || 'Any time')}</div></div>
      </div>

      <hr />
      <div class="d-flex flex-wrap gap-2 justify-content-end">
        <a class="btn btn-outline-forest btn-sm" href="/api/orders/${encodeURIComponent(tracking.order_number)}/invoice.pdf" target="_blank" rel="noopener">
          📄 Download invoice
        </a>
        <a class="btn btn-ghost btn-sm" href="/contact.html">Need help?</a>
      </div>
    `;

    resultEl.style.display = '';
    emptyEl.style.display = 'none';
  }

  function showError(msg) {
    errBox.textContent = msg;
    errBox.style.display = '';
    resultEl.style.display = 'none';
    emptyEl.style.display = '';
  }

  async function lookup(orderNumber, contact) {
    errBox.style.display = 'none';
    btn.disabled = true;
    const oldLabel = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Looking up…';
    try {
      const { tracking } = await VestaAPI.trackOrder(orderNumber, contact);
      render(tracking);
    } catch (err) {
      showError(err.message || 'Could not find that order.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldLabel;
    }
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const orderNumber = String(fd.get('order') || '').trim().toUpperCase();
    const contact = String(fd.get('contact') || '').trim();
    if (!orderNumber) return showError('Please enter your order number.');
    if (!contact) return showError('Please enter the email or phone you used at checkout.');

    // Keep the URL in sync so the result is shareable/refreshable.
    const params = new URLSearchParams({ order: orderNumber, contact });
    history.replaceState(null, '', `/track.html?${params.toString()}`);

    lookup(orderNumber, contact);
  });

  // Deep-link support: auto-fill + auto-lookup from the URL.
  document.addEventListener('DOMContentLoaded', () => {
    const p = new URLSearchParams(location.search);
    const o = p.get('order'); const c = p.get('contact');
    if (o) form.querySelector('[name="order"]').value = o;
    if (c) form.querySelector('[name="contact"]').value = c;
    if (o && c) lookup(o.trim().toUpperCase(), c.trim());
  });
})();
