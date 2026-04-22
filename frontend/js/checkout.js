(function () {
  const form = {
    name: '', email: '', phone: '', alt_phone: '',
    flat: '', building: '', street: '', landmark: '', locality: '',
    city: '', state: '', pincode: '',
    address_type: 'home',
    latitude: null, longitude: null, geo_accuracy: null,
    delivery_date: '', delivery_slot: 'Any time (9am - 8pm)',
    payment: 'upi',
    notes: '',
  };
  let currentStep = 1;

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ---------- Guards ----------
  function ensureCartNotEmpty() {
    if (FurnixCart.read().length === 0) {
      document.querySelector('.container').innerHTML = `
        <div class="text-center py-5">
          <h2>Your cart is empty</h2>
          <p class="text-muted-soft mb-3">Add a few pieces before checkout.</p>
          <a href="/products.html" class="btn btn-forest">Browse Products</a>
        </div>`;
      return false;
    }
    return true;
  }

  // ---------- Steps ----------
  function showStep(n) {
    currentStep = n;
    document.querySelectorAll('.step').forEach(s => {
      s.style.display = parseInt(s.dataset.step, 10) === n ? 'block' : 'none';
    });
    document.querySelectorAll('.checkout-step').forEach(ind => {
      const i = parseInt(ind.dataset.stepIndicator, 10);
      ind.classList.toggle('active', i === n);
      ind.classList.toggle('done', i < n);
    });
    if (n === 4) renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Field-level validation ----------
  //
  // Each validator returns { ok, message, label }.
  //  - ok:       true / false
  //  - message:  user-facing error message (empty string on success)
  //  - label:    human name of the field (used in the error summary)
  //
  const FIELD_LABELS = {
    name: 'Full name', email: 'Email', phone: 'Mobile number',
    alt_phone: 'Alternate mobile', pincode: 'Pincode',
    flat: 'Flat / House no.', building: 'Building / Society',
    street: 'Street / Area', landmark: 'Landmark',
    city: 'City', state: 'State',
    delivery_date: 'Delivery date', delivery_slot: 'Delivery slot',
  };

  function vName(v)     { v = (v || '').trim();
    if (!v)              return { ok: false, message: 'Please enter your full name.' };
    if (v.length < 2)    return { ok: false, message: 'Name looks too short — please enter your full name.' };
    if (!/^[A-Za-z][A-Za-z .'-]{1,99}$/.test(v)) return { ok: false, message: 'Use letters, spaces, apostrophes or dots only (e.g. "Arjun Mehta").' };
    return { ok: true }; }
  function vEmail(v)    { v = (v || '').trim();
    if (!v)              return { ok: false, message: 'Please enter your email address.' };
    if (!/^\S+@\S+\.\S+$/.test(v)) return { ok: false, message: 'That doesn\'t look like a valid email (e.g. name@gmail.com).' };
    return { ok: true }; }
  function vPhone(v, required=true) {
    v = (v || '').trim();
    if (!v) return required
      ? { ok: false, message: 'Please enter your 10-digit Indian mobile number.' }
      : { ok: true };
    const digits = v.replace(/[^\d]/g, '');
    if (digits.length < 10)                   return { ok: false, message: 'Too short — we need a 10-digit number.' };
    if (digits.length > 12)                   return { ok: false, message: 'Too long — please remove extra digits.' };
    if (digits.length === 10 && !/^[6-9]/.test(digits))           return { ok: false, message: 'Indian mobile numbers start with 6, 7, 8 or 9.' };
    if (digits.length === 11 && !/^0[6-9]\d{9}$/.test(digits))    return { ok: false, message: 'Remove the leading 0 or enter only 10 digits.' };
    if (digits.length === 12 && !/^91[6-9]\d{9}$/.test(digits))   return { ok: false, message: 'After +91, the number must start with 6-9 and have 10 digits.' };
    return { ok: true };
  }
  function vPincode(v)  { v = (v || '').trim();
    if (!v)                return { ok: false, message: 'Please enter your 6-digit pincode.' };
    if (!/^\d+$/.test(v))  return { ok: false, message: 'Pincode should contain digits only — no spaces or letters.' };
    if (v.length !== 6)    return { ok: false, message: 'Indian pincodes are exactly 6 digits.' };
    if (v[0] === '0')      return { ok: false, message: 'Pincode cannot start with 0.' };
    return { ok: true }; }
  function vFlat(v)     { v = (v || '').trim();
    if (!v) return { ok: false, message: 'Required — e.g. "Flat 203" or "House 14-B".' };
    return { ok: true }; }
  function vStreet(v)   { v = (v || '').trim();
    if (!v)           return { ok: false, message: 'Required — e.g. "5th Main, HSR Layout".' };
    if (v.length < 4) return { ok: false, message: 'Please enter a fuller street / area name.' };
    return { ok: true }; }
  function vLandmark(v) { v = (v || '').trim();
    if (!v)           return { ok: false, message: 'Required — helps our delivery team find you.' };
    if (v.length < 4) return { ok: false, message: 'Be a bit more specific (e.g. "opp. SBI ATM, near Green Park gate").' };
    return { ok: true }; }
  function vCity(v)     { v = (v || '').trim();
    if (!v) return { ok: false, message: 'Enter your city — this auto-fills when you type the pincode.' };
    return { ok: true }; }
  function vState(v)    { v = (v || '').trim();
    if (!v) return { ok: false, message: 'Please select your state — this auto-fills when you type the pincode.' };
    return { ok: true }; }

  const FIELD_VALIDATORS = {
    name: vName, email: vEmail, phone: v => vPhone(v, true),
    alt_phone: v => vPhone(v, false),
    pincode: vPincode, flat: vFlat, street: vStreet, landmark: vLandmark,
    city: vCity, state: vState,
  };

  function validateField(key) {
    const el = document.querySelector(`[name="${key}"]`);
    if (!el) return { ok: true };
    const fn = FIELD_VALIDATORS[key];
    if (!fn) return { ok: true };
    const result = fn(el.value);
    if (result.ok) {
      unmark(el);
      form[key] = (el.value || '').trim();
    } else {
      mark(el, result.message);
    }
    return result;
  }

  function validateStep(n) {
    if (n === 1) {
      clearStepErrors();
      const keysToCheck = ['name', 'email', 'phone', 'alt_phone', 'pincode', 'flat', 'street', 'landmark', 'city', 'state'];
      const errors = [];
      keysToCheck.forEach(k => {
        const r = validateField(k);
        if (!r.ok) errors.push({ key: k, message: r.message });
      });

      // Sync optional fields / radios
      form.building = (document.querySelector('[name="building"]')?.value || '').trim();
      const typeEl = document.querySelector('input[name="address_type"]:checked');
      form.address_type = typeEl ? typeEl.value : 'home';

      if (errors.length) {
        renderErrorSummary(1, errors);
        scrollToFirstInvalid();
        return false;
      }
      renderErrorSummary(1, []);
      return true;
    }
    if (n === 2) {
      clearStepErrors();
      const dateEl = document.querySelector('[name="delivery_date"]');
      const v = dateEl.value;
      const errors = [];
      if (!v) {
        mark(dateEl, 'Please pick a delivery date.');
        errors.push({ key: 'delivery_date', message: 'Please pick a delivery date.' });
      } else {
        const d = new Date(v);
        const minDate = new Date(); minDate.setHours(0,0,0,0); minDate.setDate(minDate.getDate() + 3);
        if (d < minDate) {
          const msg = `Earliest available date is ${minDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} (we need 3 days for craftsmanship & assembly).`;
          mark(dateEl, msg);
          errors.push({ key: 'delivery_date', message: msg });
        } else {
          unmark(dateEl);
          form.delivery_date = v;
        }
      }
      form.delivery_slot = document.querySelector('[name="delivery_slot"]').value;
      form.notes = document.querySelector('[name="notes"]').value.trim();
      if (errors.length) {
        renderErrorSummary(2, errors);
        scrollToFirstInvalid();
        return false;
      }
      renderErrorSummary(2, []);
      return true;
    }
    if (n === 3) {
      const sel = document.querySelector('input[name="payment"]:checked');
      if (!sel) return false;
      form.payment = sel.value;
      return true;
    }
    return true;
  }

  function isValidIndianMobile(v) {
    const digits = String(v).replace(/[^\d]/g, '');
    if (digits.length === 10) return /^[6-9]\d{9}$/.test(digits);
    if (digits.length === 11) return /^0[6-9]\d{9}$/.test(digits);
    if (digits.length === 12) return /^91[6-9]\d{9}$/.test(digits);
    return false;
  }

  // ---------- Error rendering ----------
  function mark(el, msg) {
    if (!el) return;
    el.classList.add('is-invalid');
    // Find the closest reasonable container for the feedback message.
    // Prefer the column (.col-*) or form-group so it sits below helper text.
    const host = el.closest('.col-md-6, .col-12, .col-sm-6, .mb-3') || el.parentElement;
    let fb = host.querySelector(':scope > .invalid-feedback.fx-err');
    if (!fb) {
      fb = document.createElement('div');
      fb.className = 'invalid-feedback fx-err d-block mt-1';
      fb.style.fontSize = '.85rem';
      host.appendChild(fb);
    }
    fb.innerHTML = `<strong>⚠</strong> ${escapeHTML(msg)}`;
  }
  function unmark(el) {
    if (!el) return;
    el.classList.remove('is-invalid');
    el.classList.add('is-valid');
    const host = el.closest('.col-md-6, .col-12, .col-sm-6, .mb-3') || el.parentElement;
    const fb = host && host.querySelector(':scope > .invalid-feedback.fx-err');
    if (fb) fb.remove();
  }
  function clearStepErrors() {
    const step = document.querySelector(`.step[data-step="${currentStep}"]`) || document;
    step.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    step.querySelectorAll('.is-valid').forEach(el => el.classList.remove('is-valid'));
    step.querySelectorAll('.invalid-feedback.fx-err').forEach(el => el.remove());
    renderErrorSummary(currentStep, []);
  }

  function renderErrorSummary(step, errors) {
    const stepEl = document.querySelector(`.step[data-step="${step}"]`);
    if (!stepEl) return;
    let box = stepEl.querySelector('.fx-error-summary');
    if (!errors || errors.length === 0) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'fx-error-summary alert alert-danger mb-3';
      box.setAttribute('role', 'alert');
      // Insert right above the form grid (so it appears below the step's heading/description).
      const anchor = stepEl.querySelector('.row.g-3') || stepEl.firstElementChild;
      stepEl.insertBefore(box, anchor);
    }
    box.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px;">
        Please fix ${errors.length} issue${errors.length > 1 ? 's' : ''} to continue:
      </div>
      <ul class="mb-0 ps-3">
        ${errors.map(e => `
          <li>
            <a href="#" data-jump="${escapeHTML(e.key)}" class="text-danger text-decoration-underline">
              <strong>${escapeHTML(FIELD_LABELS[e.key] || e.key)}</strong>
            </a>
            — ${escapeHTML(e.message)}
          </li>`).join('')}
      </ul>`;
    box.querySelectorAll('a[data-jump]').forEach(a => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const el = document.querySelector(`[name="${a.getAttribute('data-jump')}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => el.focus({ preventScroll: true }), 250);
        }
      });
    });
  }

  function scrollToFirstInvalid() {
    const first = document.querySelector(`.step[data-step="${currentStep}"] .is-invalid`);
    if (!first) return;
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => first.focus({ preventScroll: true }), 250);
  }

  // ---------- Pincode auto-fill (India Post) ----------
  async function lookupPincode(pin) {
    const status = document.getElementById('fx-pin-status');
    const hint = document.getElementById('fx-pin-hint');
    const chips = document.getElementById('fx-locality-chips');

    if (!/^\d{6}$/.test(pin)) {
      status.textContent = '–';
      status.style.color = '';
      hint.textContent = 'City & state will be auto-filled.';
      chips.innerHTML = '';
      return;
    }

    status.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    hint.textContent = 'Looking up pincode…';
    chips.innerHTML = '';

    try {
      const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { cache: 'force-cache' });
      const data = await r.json();
      const rec = Array.isArray(data) ? data[0] : null;
      if (!rec || rec.Status !== 'Success' || !Array.isArray(rec.PostOffice) || rec.PostOffice.length === 0) {
        status.textContent = '✕'; status.style.color = '#b23';
        hint.textContent = 'Pincode not recognised. Please double-check.';
        return;
      }
      const po = rec.PostOffice;
      const first = po[0];
      const cityEl = document.querySelector('[name="city"]');
      const stateEl = document.querySelector('[name="state"]');
      // Use District as city, State as state (most accurate for India Post data).
      if (cityEl && !cityEl.value.trim()) cityEl.value = first.District || first.Block || '';
      if (stateEl) {
        const matchOpt = Array.from(stateEl.options).find(o => o.value.toLowerCase() === String(first.State).toLowerCase());
        if (matchOpt) stateEl.value = matchOpt.value;
      }
      form.city = cityEl.value.trim();
      form.state = stateEl.value;

      status.textContent = '✓'; status.style.color = '#2D5A27';
      hint.innerHTML = `Deliverable to <strong>${escapeHTML(first.District)}, ${escapeHTML(first.State)}</strong>.`;

      // Show up to 6 locality chips so the customer can click one to drop into the Street field.
      const streetEl = document.querySelector('[name="street"]');
      const localities = Array.from(new Set(po.map(p => p.Name))).slice(0, 6);
      chips.innerHTML = localities.map(name => `
        <button type="button" class="btn btn-outline-forest btn-sm" data-locality="${escapeHTML(name)}">
          ${escapeHTML(name)}
        </button>`).join('');
      chips.querySelectorAll('button[data-locality]').forEach(b => {
        b.addEventListener('click', () => {
          const name = b.getAttribute('data-locality');
          form.locality = name;
          // Prepend locality to street if not already present
          const curr = (streetEl.value || '').trim();
          if (!curr.toLowerCase().includes(name.toLowerCase())) {
            streetEl.value = curr ? `${curr}, ${name}` : name;
          }
          chips.querySelectorAll('button').forEach(bb => bb.classList.remove('btn-forest','text-white'));
          b.classList.add('btn-forest','text-white');
        });
      });
    } catch (err) {
      status.textContent = '!'; status.style.color = '#b23';
      hint.textContent = 'Could not reach pincode service — please fill city & state manually.';
    }
  }

  // ---------- Locate me (browser geolocation) ----------
  function wireLocateButton() {
    const btn = document.getElementById('fx-locate-btn');
    const label = document.getElementById('fx-locate-label');
    const hint = document.getElementById('fx-locate-hint');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        hint.textContent = 'Your browser does not support location sharing.';
        return;
      }
      label.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Requesting permission…';
      btn.disabled = true;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          form.latitude = +pos.coords.latitude.toFixed(7);
          form.longitude = +pos.coords.longitude.toFixed(7);
          form.geo_accuracy = Math.round(pos.coords.accuracy || 0);
          label.innerHTML = '✅ Location pinned';
          const mapUrl = `https://www.google.com/maps?q=${form.latitude},${form.longitude}`;
          hint.innerHTML = `Saved with ±${form.geo_accuracy}m accuracy — <a href="${mapUrl}" target="_blank" rel="noopener">preview on Google Maps</a>.`;
          btn.disabled = false;
          btn.classList.remove('btn-outline-forest');
          btn.classList.add('btn-forest');
        },
        (err) => {
          btn.disabled = false;
          label.textContent = '📍 Pin my exact location';
          if (err.code === err.PERMISSION_DENIED) {
            hint.innerHTML = 'Location permission was denied. You can re-enable it from the browser address bar and try again.';
          } else if (err.code === err.TIMEOUT) {
            hint.textContent = 'Location request timed out. Please try again.';
          } else {
            hint.textContent = 'Could not get location — please try again.';
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }

  // ---------- Summary ----------
  function renderSummary() {
    const items = FurnixCart.read();
    const coupon = FurnixCart.getCoupon();
    const totals = FurnixCart.computeTotals(items, coupon);

    document.getElementById('summaryItems').innerHTML = items.map(i => `
      <div class="d-flex align-items-center gap-2 py-2 border-bottom" style="border-color:var(--line)!important">
        <img src="${i.image_url}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:4px" />
        <div class="flex-grow-1" style="min-width:0">
          <div style="font-weight:500; font-size:.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${escapeHTML(i.name)}</div>
          <div class="small text-muted-soft">Qty ${i.qty} · ${FurnixCart.formatINR(i.price)}</div>
        </div>
        <div style="font-weight:600; font-size:.9rem">${FurnixCart.formatINR(i.price * i.qty)}</div>
      </div>
    `).join('');

    document.getElementById('summaryTotals').innerHTML = `
      <div class="summary-line"><span>Subtotal</span><span>${FurnixCart.formatINR(totals.subtotal)}</span></div>
      ${totals.discount_amount > 0 ? `
        <div class="summary-line discount"><span>Discount (${totals.discount_code})</span><span>− ${FurnixCart.formatINR(totals.discount_amount)}</span></div>` : ''}
      <div class="summary-line"><span>GST (18%)</span><span>${FurnixCart.formatINR(totals.gst_amount)}</span></div>
      <div class="summary-line"><span>Shipping${totals.shipping_fee === 0 ? ' <small class="text-forest">(Free)</small>' : ''}</span><span>${totals.shipping_fee === 0 ? '—' : FurnixCart.formatINR(totals.shipping_fee)}</span></div>
      <div class="summary-line total"><span>Total</span><span>${FurnixCart.formatINR(totals.total)}</span></div>
    `;

    const input = document.getElementById('fxCouponInputCheckout');
    if (input && input.value !== coupon) input.value = coupon;
    const msg = document.getElementById('fxCouponMsgCheckout');
    if (msg) {
      msg.textContent = coupon ? totals.discount_message : '';
      msg.className = 'coupon-msg ' + (totals.discount_code ? 'ok' : (coupon ? 'err' : ''));
    }
  }

  // ---------- Review (final step) ----------
  function composedAddress() {
    return [
      form.flat,
      form.building,
      form.street,
      form.landmark ? `Landmark: ${form.landmark}` : '',
    ].filter(Boolean).join(', ');
  }

  function renderReview() {
    const items = FurnixCart.read();
    const totals = FurnixCart.computeTotals(items, FurnixCart.getCoupon());
    const payLabel = { upi: 'UPI', card: 'Credit / Debit Card', netbanking: 'Net Banking', cod: 'Cash on Delivery' }[form.payment];
    const typeIcon = { home: '🏠 Home', office: '🏢 Office', other: '📍 Other' }[form.address_type] || 'Home';
    const geo = (form.latitude && form.longitude)
      ? `<div class="small mt-1"><a href="https://www.google.com/maps?q=${form.latitude},${form.longitude}" target="_blank" rel="noopener">📍 View pinned location</a> (±${form.geo_accuracy || '?'}m)</div>`
      : `<div class="small text-muted-soft mt-1">No GPS pin — we'll rely on the written address.</div>`;

    document.getElementById('reviewPanel').innerHTML = `
      <div class="row g-3">
        <div class="col-md-6">
          <div class="small text-muted-soft text-uppercase mb-1" style="letter-spacing:.1em">Ship to · ${typeIcon}</div>
          <strong>${escapeHTML(form.name)}</strong><br/>
          ${escapeHTML(form.flat)}${form.building ? ', ' + escapeHTML(form.building) : ''}<br/>
          ${escapeHTML(form.street)}<br/>
          <span class="text-muted-soft">Landmark: ${escapeHTML(form.landmark)}</span><br/>
          ${escapeHTML(form.city)}, ${escapeHTML(form.state)} — ${escapeHTML(form.pincode)}<br/>
          <span class="text-muted-soft">${escapeHTML(form.phone)}${form.alt_phone ? ' · Alt: ' + escapeHTML(form.alt_phone) : ''}</span><br/>
          <span class="text-muted-soft">${escapeHTML(form.email)}</span>
          ${geo}
        </div>
        <div class="col-md-6">
          <div class="small text-muted-soft text-uppercase mb-1" style="letter-spacing:.1em">Delivery</div>
          <strong>${escapeHTML(new Date(form.delivery_date).toDateString())}</strong><br/>
          <span class="text-muted-soft">${escapeHTML(form.delivery_slot)}</span>
          <div class="small text-muted-soft text-uppercase mb-1 mt-3" style="letter-spacing:.1em">Payment</div>
          <strong>${payLabel}</strong>
        </div>
      </div>
      <hr />
      <div class="small text-muted-soft text-uppercase mb-2" style="letter-spacing:.1em">Items (${items.length})</div>
      ${items.map(i => `
        <div class="d-flex justify-content-between py-1">
          <span>${escapeHTML(i.name)} × ${i.qty}</span>
          <span>${FurnixCart.formatINR(i.price * i.qty)}</span>
        </div>`).join('')}
      <hr />
      <div class="summary-line"><span>Subtotal</span><span>${FurnixCart.formatINR(totals.subtotal)}</span></div>
      ${totals.discount_amount > 0 ? `<div class="summary-line discount"><span>Discount (${totals.discount_code})</span><span>− ${FurnixCart.formatINR(totals.discount_amount)}</span></div>` : ''}
      <div class="summary-line"><span>GST (18%)</span><span>${FurnixCart.formatINR(totals.gst_amount)}</span></div>
      <div class="summary-line"><span>Shipping</span><span>${totals.shipping_fee === 0 ? 'Free' : FurnixCart.formatINR(totals.shipping_fee)}</span></div>
      <div class="summary-line total"><span>Total</span><span>${FurnixCart.formatINR(totals.total)}</span></div>
    `;
  }

  // ---------- Place order ----------
  async function placeOrder() {
    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Placing order...';

    try {
      const items = FurnixCart.read().map(i => ({ product_id: i.id, quantity: i.qty }));
      const payload = {
        customer: { name: form.name, email: form.email, phone: form.phone, alt_phone: form.alt_phone || null },
        shipping: {
          address: composedAddress(),
          flat: form.flat,
          building: form.building || null,
          street: form.street,
          landmark: form.landmark,
          locality: form.locality || null,
          address_type: form.address_type,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          latitude: form.latitude,
          longitude: form.longitude,
          geo_accuracy: form.geo_accuracy,
        },
        delivery: { date: form.delivery_date, slot: form.delivery_slot },
        payment:  { method: form.payment },
        coupon_code: FurnixCart.getCoupon() || null,
        items,
        notes: form.notes,
      };
      const res = await FurnixAPI.checkout(payload);
      sessionStorage.setItem('furnix_last_order', JSON.stringify(res.order));
      FurnixCart.clear();
      location.href = `/success.html?order=${encodeURIComponent(res.order.order_number)}`;
    } catch (err) {
      FurnixCart.toast(err.message || 'Could not place order', 'error');
      btn.disabled = false;
      btn.textContent = 'Place Order';
    }
  }

  // ---------- Wire-up ----------
  document.addEventListener('DOMContentLoaded', () => {
    if (!ensureCartNotEmpty()) return;

    // Min delivery date = today + 3 days
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 3);
    document.querySelector('[name="delivery_date"]').min = minDate.toISOString().slice(0, 10);
    document.querySelector('[name="delivery_date"]').value = minDate.toISOString().slice(0, 10);

    // Payment option UX
    document.querySelectorAll('.pay-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.pay-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        opt.querySelector('input').checked = true;
      });
    });

    // Step navigation
    document.querySelectorAll('[data-next]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (validateStep(currentStep)) showStep(currentStep + 1);
      });
    });
    document.querySelectorAll('[data-prev]').forEach(btn => {
      btn.addEventListener('click', () => showStep(currentStep - 1));
    });

    // Place order
    document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);

    // Pincode → auto-fill city & state (debounced)
    const pinEl = document.getElementById('fx-pincode');
    let pinTimer = null;
    pinEl.addEventListener('input', () => {
      const v = pinEl.value.replace(/\D/g, '').slice(0, 6);
      if (v !== pinEl.value) pinEl.value = v;
      clearTimeout(pinTimer);
      if (v.length === 6) {
        pinTimer = setTimeout(() => lookupPincode(v), 250);
      } else {
        lookupPincode(''); // reset UI
      }
    });
    pinEl.addEventListener('blur', () => {
      if (/^\d{6}$/.test(pinEl.value)) lookupPincode(pinEl.value);
    });

    // Live per-field validation: re-validate a field the moment the user leaves it,
    // and clear the error as soon as they're typing a valid value again.
    Object.keys(FIELD_VALIDATORS).forEach(key => {
      const el = document.querySelector(`[name="${key}"]`);
      if (!el) return;
      const revalidate = () => {
        // Only validate if the user has actually touched the field OR it was already flagged.
        if (el.dataset.touched || el.classList.contains('is-invalid')) {
          validateField(key);
          // Refresh the error summary if it's visible.
          const box = document.querySelector(`.step[data-step="1"] .fx-error-summary`);
          if (box) {
            const errs = [];
            Object.keys(FIELD_VALIDATORS).forEach(k => {
              const elK = document.querySelector(`[name="${k}"]`);
              if (!elK) return;
              const r = FIELD_VALIDATORS[k](elK.value);
              if (!r.ok) errs.push({ key: k, message: r.message });
            });
            renderErrorSummary(1, errs);
          }
        }
      };
      el.addEventListener('blur',  () => { el.dataset.touched = '1'; revalidate(); });
      el.addEventListener('input', revalidate);
      el.addEventListener('change', revalidate);
    });

    // Also re-validate the delivery date live.
    const deliveryDateEl = document.querySelector('[name="delivery_date"]');
    if (deliveryDateEl) {
      deliveryDateEl.addEventListener('change', () => {
        if (deliveryDateEl.classList.contains('is-invalid')) validateStep(2);
      });
    }

    // Locate me
    wireLocateButton();

    // Coupon in sidebar
    const cIn = document.getElementById('fxCouponInputCheckout');
    const cBtn = document.getElementById('fxCouponBtnCheckout');
    cIn.value = FurnixCart.getCoupon();
    cBtn.addEventListener('click', () => {
      const code = cIn.value.trim();
      if (!code) { FurnixCart.setCoupon(''); renderSummary(); return; }
      const subtotal = FurnixCart.read().reduce((s, i) => s + i.price * i.qty, 0);
      const res = FurnixCart.applyCoupon(subtotal, code);
      if (res.code) { FurnixCart.setCoupon(res.code); FurnixCart.toast(res.message, 'success'); }
      else          { FurnixCart.setCoupon('');      FurnixCart.toast(res.message, 'error'); }
      renderSummary();
    });

    document.addEventListener('furnix:cart-updated', renderSummary);

    renderSummary();
    showStep(1);
  });
})();
