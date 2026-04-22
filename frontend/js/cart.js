/**
 * FurniX Cart
 *
 * Persists to localStorage under the key `furnix_cart`.
 * Exposes `window.FurnixCart` with helpers plus mount/render for the drawer.
 *
 * Business rules (mirrored on the server):
 *   - GST 18% on (subtotal - discount)
 *   - Free shipping over ₹25,000 subtotal, else ₹499
 *   - Coupons:  WOOD20   -> 20% off subtotal
 *               FIRSTBED -> flat ₹2000 off (min subtotal ₹10,000)
 */
(function () {
  const KEY = 'furnix_cart';
  const COUPON_KEY = 'furnix_coupon';

  const GST_RATE = 0.18;
  const SHIPPING_FEE = 499;
  const FREE_SHIPPING_THRESHOLD = 25000;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch (_) { return []; }
  }
  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    dispatch();
  }
  function dispatch() {
    document.dispatchEvent(new CustomEvent('furnix:cart-updated'));
    updateBadge();
  }

  function add(product, qty = 1) {
    const items = read();
    const existing = items.find(i => i.id === product.id);
    if (existing) existing.qty = Math.min(20, existing.qty + qty);
    else items.push({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: Number(product.price),
      mrp: product.mrp ? Number(product.mrp) : null,
      wood_type: product.wood_type,
      image_url: product.image_url,
      qty,
    });
    write(items);
    toast(`${product.name} added to cart`, 'success');
  }

  function updateQty(id, qty) {
    const items = read();
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.qty = Math.max(1, Math.min(20, qty));
    write(items);
  }

  function remove(id) {
    write(read().filter(i => i.id !== id));
  }

  function clear() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(COUPON_KEY);
    dispatch();
  }

  function count() {
    return read().reduce((s, i) => s + i.qty, 0);
  }

  function applyCoupon(subtotal, code) {
    if (!code) return { code: null, discount: 0, message: '' };
    const upper = String(code).trim().toUpperCase();
    if (upper === 'WOOD20') {
      return { code: upper, discount: +(subtotal * 0.20).toFixed(2), message: '20% off applied' };
    }
    if (upper === 'FIRSTBED') {
      if (subtotal < 10000) {
        return { code: null, discount: 0, message: 'FIRSTBED requires a minimum subtotal of ₹10,000' };
      }
      return { code: upper, discount: 2000, message: 'Flat ₹2000 off applied' };
    }
    return { code: null, discount: 0, message: 'Invalid coupon code' };
  }

  function computeTotals(items, couponCode) {
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const coupon = applyCoupon(subtotal, couponCode);
    const discount = Math.min(coupon.discount, subtotal);
    const taxable = Math.max(subtotal - discount, 0);
    const gst = +(taxable * GST_RATE).toFixed(2);
    const shipping = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FEE;
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

  function setCoupon(code) {
    if (code) localStorage.setItem(COUPON_KEY, code);
    else localStorage.removeItem(COUPON_KEY);
    dispatch();
  }
  function getCoupon() { return localStorage.getItem(COUPON_KEY) || ''; }

  // ---------- Formatting helpers ----------
  function formatINR(amt) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(amt);
  }

  // ---------- Cart drawer UI ----------
  function openDrawer() {
    document.querySelector('#fxCartDrawer')?.classList.add('open');
    document.querySelector('#fxCartOverlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderDrawer();
  }
  function closeDrawer() {
    document.querySelector('#fxCartDrawer')?.classList.remove('open');
    document.querySelector('#fxCartOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderDrawer() {
    const body = document.querySelector('#fxCartBody');
    const foot = document.querySelector('#fxCartFoot');
    if (!body || !foot) return;

    const items = read();
    if (items.length === 0) {
      body.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
          </div>
          <h5 class="mb-1">Your cart is empty</h5>
          <p class="mb-3">Discover hand-crafted furniture that lasts a lifetime.</p>
          <a class="btn btn-forest" href="/products.html">Browse Products</a>
        </div>`;
      foot.innerHTML = '';
      return;
    }

    body.innerHTML = items.map(i => `
      <div class="cart-item" data-id="${i.id}">
        <img src="${i.image_url}" alt="${escapeHTML(i.name)}" onerror="this.src='https://via.placeholder.com/120?text=Furni%0AX'">
        <div class="info">
          <h5>${escapeHTML(i.name)}</h5>
          <div class="wood">${escapeHTML(i.wood_type)}</div>
          <div class="price">${formatINR(i.price * i.qty)}</div>
          <div class="controls">
            <div class="qty-mini">
              <button data-act="dec" aria-label="Decrease">−</button>
              <span>${i.qty}</span>
              <button data-act="inc" aria-label="Increase">+</button>
            </div>
            <button class="remove" data-act="rm">Remove</button>
          </div>
        </div>
      </div>
    `).join('');

    const currentCoupon = getCoupon();
    const totals = computeTotals(items, currentCoupon);

    foot.innerHTML = `
      <div class="coupon-row">
        <input id="fxCouponInput" type="text" placeholder="Coupon code (WOOD20, FIRSTBED)" value="${escapeHTML(currentCoupon)}" />
        <button class="btn btn-outline-forest btn-sm" id="fxCouponBtn">Apply</button>
      </div>
      <div class="coupon-msg ${totals.discount_code ? 'ok' : (currentCoupon && !totals.discount_code ? 'err' : '')}" id="fxCouponMsg">
        ${currentCoupon ? escapeHTML(totals.discount_message) : ''}
      </div>

      <div class="summary-line"><span>Subtotal</span><span>${formatINR(totals.subtotal)}</span></div>
      ${totals.discount_amount > 0 ? `
        <div class="summary-line discount">
          <span>Discount (${totals.discount_code})</span><span>− ${formatINR(totals.discount_amount)}</span>
        </div>` : ''}
      <div class="summary-line"><span>GST (18%)</span><span>${formatINR(totals.gst_amount)}</span></div>
      <div class="summary-line"><span>Shipping${totals.shipping_fee === 0 ? ' <small class="text-forest">(Free)</small>' : ''}</span><span>${totals.shipping_fee === 0 ? '—' : formatINR(totals.shipping_fee)}</span></div>
      <div class="summary-line total"><span>Total</span><span>${formatINR(totals.total)}</span></div>

      <a class="btn btn-forest w-100 mt-3" href="/checkout.html">Proceed to Checkout</a>
      <button class="btn btn-ghost w-100 mt-1" id="fxCartClear">Clear cart</button>
    `;

    // ---- Wire drawer events ----
    body.querySelectorAll('.cart-item').forEach(el => {
      const id = parseInt(el.dataset.id, 10);
      el.querySelector('[data-act="inc"]').addEventListener('click', () => {
        const item = read().find(i => i.id === id);
        updateQty(id, (item?.qty || 1) + 1);
        renderDrawer();
      });
      el.querySelector('[data-act="dec"]').addEventListener('click', () => {
        const item = read().find(i => i.id === id);
        updateQty(id, (item?.qty || 1) - 1);
        renderDrawer();
      });
      el.querySelector('[data-act="rm"]').addEventListener('click', () => {
        remove(id); renderDrawer();
      });
    });

    const applyBtn = foot.querySelector('#fxCouponBtn');
    applyBtn?.addEventListener('click', () => {
      const code = foot.querySelector('#fxCouponInput').value.trim();
      if (!code) { setCoupon(''); renderDrawer(); return; }
      const res = applyCoupon(read().reduce((s,i)=>s+i.price*i.qty,0), code);
      if (res.code) { setCoupon(res.code); toast(res.message, 'success'); }
      else          { setCoupon('');      toast(res.message, 'error'); }
      renderDrawer();
    });
    foot.querySelector('#fxCartClear')?.addEventListener('click', () => {
      if (confirm('Clear all items from your cart?')) { clear(); renderDrawer(); }
    });
  }

  function updateBadge() {
    const c = count();
    document.querySelectorAll('[data-cart-badge]').forEach(el => {
      el.textContent = c;
      el.style.display = c > 0 ? 'inline-block' : 'none';
    });
  }

  // ---------- Toast ----------
  function toast(message, variant = '') {
    let el = document.querySelector('.fx-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'fx-toast';
      document.body.appendChild(el);
    }
    el.className = `fx-toast ${variant} show`;
    el.textContent = message;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ---------- Mount ----------
  document.addEventListener('DOMContentLoaded', () => {
    // Inject cart drawer at the end of <body> if not already present.
    if (!document.querySelector('#fxCartDrawer')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div id="fxCartOverlay" class="cart-overlay"></div>
        <aside id="fxCartDrawer" class="cart-drawer" aria-label="Shopping cart">
          <div class="drawer-head">
            <h3>Your Cart</h3>
            <button class="close-btn" id="fxCartClose" aria-label="Close cart">×</button>
          </div>
          <div class="drawer-body" id="fxCartBody"></div>
          <div class="drawer-foot" id="fxCartFoot"></div>
        </aside>`;
      document.body.appendChild(wrap);
    }
    document.querySelector('#fxCartClose')?.addEventListener('click', closeDrawer);
    document.querySelector('#fxCartOverlay')?.addEventListener('click', closeDrawer);

    document.body.addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-cart]');
      if (openBtn) { e.preventDefault(); openDrawer(); }
    });

    document.addEventListener('furnix:cart-updated', () => {
      if (document.querySelector('#fxCartDrawer.open')) renderDrawer();
    });

    updateBadge();
  });

  window.FurnixCart = {
    read, write, add, remove, updateQty, clear, count,
    computeTotals, applyCoupon, setCoupon, getCoupon,
    formatINR, openDrawer, closeDrawer, toast,
    GST_RATE, SHIPPING_FEE, FREE_SHIPPING_THRESHOLD,
  };
})();
