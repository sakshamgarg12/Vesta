(function () {
  const form = {
    name: '', email: '', phone: '', alt_phone: '',
    flat: '', building: '', street: '', landmark: '', locality: '',
    city: '', state: '', pincode: '',
    address_type: 'home',
    latitude: null, longitude: null, geo_accuracy: null,
    delivery_date: '', delivery_slot: 'Any time (9am - 8pm)',
    payment: 'upi',
    // Sanitized payment details — NEVER contains full PAN / CVV. Populated in
    // validateStep(3) before the review step and submission.
    payment_details: null,
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
    if (VestaCart.read().length === 0) {
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
      clearStepErrors();
      const sel = document.querySelector('input[name="payment"]:checked');
      if (!sel) return false;
      form.payment = sel.value;
      const result = validatePaymentMethod(form.payment);
      if (!result.ok) {
        renderErrorSummary(3, result.errors || [{ key: '_payment', message: result.message }]);
        scrollToFirstInvalid();
        return false;
      }
      form.payment_details = result.details;
      renderErrorSummary(3, []);
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

  // ====================================================================
  // Payment — per-method validation, formatting, brand detection, verify
  // ====================================================================
  //
  // Security: the card number and CVV live in the DOM only while the user is
  // on the payment step. We NEVER put them into `form` or the checkout
  // payload. Only a sanitized summary — last-4 digits, detected brand and the
  // cardholder name — is sent to the server.

  /** Detect card brand from a raw (digits-only) card number. */
  function detectCardBrand(digits) {
    const n = String(digits || '').replace(/\D/g, '');
    if (!n) return { key: '', label: '–' };
    // Amex: 34 or 37 (15 digits)
    if (/^3[47]/.test(n))        return { key: 'amex',       label: 'AMEX' };
    // Visa: starts with 4
    if (/^4/.test(n))            return { key: 'visa',       label: 'VISA' };
    // Mastercard: 51-55, or 2221-2720
    if (/^5[1-5]/.test(n))       return { key: 'mastercard', label: 'MASTERCARD' };
    if (/^2(2[2-9]\d|[3-6]\d{2}|7[01]\d|720)/.test(n)) return { key: 'mastercard', label: 'MASTERCARD' };
    // RuPay: 60, 65, 81, 82 (and some 508xxx bins)
    if (/^(60|65|81|82)/.test(n) || /^508/.test(n)) return { key: 'rupay', label: 'RUPAY' };
    // Discover: 6011, 65, 644-649
    if (/^(6011|65|64[4-9])/.test(n)) return { key: 'discover', label: 'DISCOVER' };
    // JCB: 3528-3589
    if (/^35(2[89]|[3-8]\d)/.test(n)) return { key: 'jcb',    label: 'JCB' };
    return { key: '', label: '–' };
  }

  /** Luhn algorithm — validates card number checksum. */
  function luhnValid(digits) {
    const n = String(digits || '').replace(/\D/g, '');
    if (n.length < 13 || n.length > 19) return false;
    let sum = 0, alt = false;
    for (let i = n.length - 1; i >= 0; i--) {
      let d = parseInt(n[i], 10);
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  /** Format a raw card number with spaces. Amex → 4-6-5, others → 4-4-4-4(-3). */
  function formatCardNumber(raw) {
    const n = String(raw || '').replace(/\D/g, '').slice(0, 19);
    const brand = detectCardBrand(n).key;
    if (brand === 'amex') {
      return n.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (m, a, b, c) =>
        [a, b, c].filter(Boolean).join(' '));
    }
    return n.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }

  /** Format a raw expiry into MM/YY. Accepts "0625", "6/25", "06/25", etc. */
  function formatExpiry(raw) {
    const n = String(raw || '').replace(/\D/g, '').slice(0, 4);
    if (n.length < 3) return n;
    return n.slice(0, 2) + '/' + n.slice(2);
  }

  /** Validate expiry string "MM/YY". Returns {ok, message}. */
  function validateExpiry(str) {
    const m = String(str || '').match(/^(\d{2})\/(\d{2})$/);
    if (!m) return { ok: false, message: 'Enter expiry as MM/YY (e.g. 06/28).' };
    const mm = parseInt(m[1], 10);
    const yy = parseInt(m[2], 10);
    if (mm < 1 || mm > 12) return { ok: false, message: 'Month must be between 01 and 12.' };
    const now = new Date();
    const curYear = now.getFullYear() % 100;
    const curMonth = now.getMonth() + 1;
    if (yy < curYear || (yy === curYear && mm < curMonth)) {
      return { ok: false, message: 'This card has expired — please use a different card.' };
    }
    if (yy > curYear + 20) return { ok: false, message: 'Expiry year seems too far in the future.' };
    return { ok: true };
  }

  /** Validate UPI ID like "name@bankhandle". */
  function validateUpiId(v) {
    const s = String(v || '').trim().toLowerCase();
    if (!s) return { ok: false, message: 'Please enter your UPI ID.' };
    if (!s.includes('@')) return { ok: false, message: 'UPI IDs contain "@" — e.g. yourname@okhdfcbank.' };
    const m = s.match(/^([a-z0-9._\-]{2,256})@([a-z][a-z0-9]{1,64})$/);
    if (!m) return { ok: false, message: 'That doesn\'t look like a valid UPI ID (letters, digits, . _ - only).' };
    return { ok: true, handle: m[2] };
  }

  /** Update card brand badge + formatted value in the card number field. */
  function refreshCardUI() {
    const num = document.querySelector('[name="card_number"]');
    const badge = document.getElementById('cardBrandBadge');
    if (!num || !badge) return;
    const raw = num.value.replace(/\D/g, '');
    const pretty = formatCardNumber(raw);
    if (pretty !== num.value) {
      const cursorEnd = num.selectionStart === num.value.length;
      num.value = pretty;
      if (cursorEnd) try { num.setSelectionRange(pretty.length, pretty.length); } catch (_) {}
    }
    const brand = detectCardBrand(raw);
    badge.textContent = brand.label;
    badge.className = 'brand-badge' + (brand.key ? ' ' + brand.key : '');
  }

  /** Show only the selected payment method's detail panel. */
  function showPaymentPanel(method) {
    document.querySelectorAll('[data-pay-panel]').forEach(p => {
      p.style.display = p.getAttribute('data-pay-panel') === method ? '' : 'none';
    });
    document.querySelectorAll('.pay-option').forEach(opt => {
      const isMatch = opt.getAttribute('data-pay-opt') === method;
      opt.classList.toggle('selected', isMatch);
      const input = opt.querySelector('input[type="radio"]');
      if (input) input.checked = isMatch;
    });
  }

  /**
   * Validate the fields for the chosen payment method and return a sanitized
   * `details` object (never full PAN / CVV) ready for submission.
   */
  function validatePaymentMethod(method) {
    if (method === 'upi') {
      const el = document.querySelector('[name="upi_id"]');
      const r = validateUpiId(el?.value);
      if (!r.ok) { mark(el, r.message); return { ok: false, errors: [{ key: 'upi_id', message: r.message }] }; }
      unmark(el);
      return { ok: true, details: {
        method: 'upi',
        upi_id: el.value.trim().toLowerCase(),
        handle: r.handle,
        verified: el.dataset.verified === '1',
      }};
    }

    if (method === 'card') {
      const numEl = document.querySelector('[name="card_number"]');
      const nameEl = document.querySelector('[name="card_name"]');
      const expEl = document.querySelector('[name="card_expiry"]');
      const cvvEl = document.querySelector('[name="card_cvv"]');
      const errors = [];

      const rawNum = (numEl?.value || '').replace(/\D/g, '');
      const brand = detectCardBrand(rawNum);
      const expectedCvvLen = brand.key === 'amex' ? 4 : 3;

      if (!rawNum)                 { mark(numEl, 'Please enter your card number.'); errors.push({ key: 'card_number', message: 'Please enter your card number.' }); }
      else if (rawNum.length < 13) { mark(numEl, 'Card number is too short (13-19 digits).'); errors.push({ key: 'card_number', message: 'Card number is too short (13-19 digits).' }); }
      else if (rawNum.length > 19) { mark(numEl, 'Card number is too long (max 19 digits).'); errors.push({ key: 'card_number', message: 'Card number is too long (max 19 digits).' }); }
      else if (!luhnValid(rawNum)) { mark(numEl, 'That card number isn\'t valid — please double-check.'); errors.push({ key: 'card_number', message: 'Invalid card number (checksum failed).' }); }
      else                         { unmark(numEl); }

      const nameVal = (nameEl?.value || '').trim();
      if (!nameVal)                       { mark(nameEl, 'Please enter the name on your card.'); errors.push({ key: 'card_name', message: 'Please enter the name on your card.' }); }
      else if (nameVal.length < 2)        { mark(nameEl, 'Name seems too short.'); errors.push({ key: 'card_name', message: 'Name seems too short.' }); }
      else if (!/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(nameVal)) { mark(nameEl, 'Use letters, spaces, apostrophes or dots only.'); errors.push({ key: 'card_name', message: 'Invalid characters in name.' }); }
      else                                { unmark(nameEl); }

      const expR = validateExpiry(expEl?.value);
      if (!expR.ok) { mark(expEl, expR.message); errors.push({ key: 'card_expiry', message: expR.message }); }
      else          { unmark(expEl); }

      const cvv = (cvvEl?.value || '').replace(/\D/g, '');
      if (!cvv)                                  { mark(cvvEl, 'Please enter the CVV.'); errors.push({ key: 'card_cvv', message: 'Please enter the CVV.' }); }
      else if (cvv.length !== expectedCvvLen)    { mark(cvvEl, `CVV must be ${expectedCvvLen} digits${brand.key === 'amex' ? ' for Amex cards' : ''}.`); errors.push({ key: 'card_cvv', message: `CVV must be ${expectedCvvLen} digits.` }); }
      else                                        { unmark(cvvEl); }

      if (errors.length) return { ok: false, errors };

      return { ok: true, details: {
        method: 'card',
        brand: brand.key || 'unknown',
        brand_label: brand.label,
        last4: rawNum.slice(-4),
        name_on_card: nameVal,
        expiry: expEl.value,
        verified: numEl.dataset.verified === '1',
      }};
    }

    if (method === 'netbanking') {
      const bankEl = document.querySelector('[name="bank"]');
      const otherEl = document.querySelector('[name="bank_other"]');
      const bank = bankEl?.value || '';
      if (!bank) {
        mark(bankEl, 'Please select your bank.');
        return { ok: false, errors: [{ key: 'bank', message: 'Please select your bank.' }] };
      }
      unmark(bankEl);
      let bankName = bank;
      if (bank === 'Other') {
        const custom = (otherEl?.value || '').trim();
        if (custom.length < 2) {
          mark(otherEl, 'Please type your bank name.');
          return { ok: false, errors: [{ key: 'bank_other', message: 'Please type your bank name.' }] };
        }
        unmark(otherEl);
        bankName = custom;
      }
      return { ok: true, details: { method: 'netbanking', bank: bankName } };
    }

    if (method === 'cod') {
      return { ok: true, details: { method: 'cod' } };
    }

    return { ok: false, message: 'Please select a payment method.' };
  }

  /** Wire the Verify buttons (simulated 1-second check with visible feedback). */
  function wireVerifyButtons() {
    const upiBtn = document.querySelector('[data-pay-verify="upi"]');
    const upiEl = document.querySelector('[name="upi_id"]');
    const upiStatus = document.getElementById('upiVerifyStatus');
    if (upiBtn && upiEl) {
      upiBtn.addEventListener('click', () => {
        const r = validateUpiId(upiEl.value);
        if (!r.ok) {
          mark(upiEl, r.message);
          upiStatus.innerHTML = `<span class="text-danger small">⚠ ${escapeHTML(r.message)}</span>`;
          upiEl.dataset.verified = '';
          return;
        }
        unmark(upiEl);
        upiStatus.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span><span class="small">Checking with your bank…</span>';
        upiBtn.disabled = true;
        setTimeout(() => {
          upiBtn.disabled = false;
          upiEl.dataset.verified = '1';
          upiStatus.innerHTML = `<span class="pay-verified">Verified — ${escapeHTML(upiEl.value.trim().toLowerCase())}</span>`;
        }, 900);
      });
    }

    const cardBtn = document.querySelector('[data-pay-verify="card"]');
    const cardStatus = document.getElementById('cardVerifyStatus');
    if (cardBtn) {
      cardBtn.addEventListener('click', () => {
        const r = validatePaymentMethod('card');
        if (!r.ok) {
          const first = r.errors?.[0];
          cardStatus.innerHTML = `<span class="text-danger small">⚠ ${escapeHTML(first?.message || 'Please fix the card details.')}</span>`;
          return;
        }
        cardStatus.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span><span class="small">Contacting your card issuer…</span>';
        cardBtn.disabled = true;
        setTimeout(() => {
          cardBtn.disabled = false;
          const numEl = document.querySelector('[name="card_number"]');
          if (numEl) numEl.dataset.verified = '1';
          cardStatus.innerHTML = `<span class="pay-verified">Verified — ${escapeHTML(r.details.brand_label)} ending ${escapeHTML(r.details.last4)}</span>`;
        }, 1100);
      });
    }
  }

  /** Wire all payment UX (radio → panel switch, auto-format, live validation). */
  function wirePaymentUX() {
    document.querySelectorAll('input[name="payment"]').forEach(input => {
      input.addEventListener('change', () => {
        form.payment = input.value;
        showPaymentPanel(input.value);
        renderErrorSummary(3, []); // clear any old error summary
      });
    });
    document.querySelectorAll('.pay-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const v = opt.getAttribute('data-pay-opt');
        if (v) { form.payment = v; showPaymentPanel(v); }
      });
    });

    // Card number: live format + brand detection
    const cardNum = document.querySelector('[name="card_number"]');
    if (cardNum) {
      cardNum.addEventListener('input', () => { refreshCardUI(); cardNum.dataset.verified = ''; });
      cardNum.addEventListener('blur', () => {
        const r = validatePaymentMethod('card');
        if (!r.ok && cardNum.value.trim()) {
          // Only flag fields that actually have content, so we don't yell at
          // the user for empty fields they haven't touched yet.
        }
      });
    }

    // Expiry: auto-insert /
    const exp = document.querySelector('[name="card_expiry"]');
    if (exp) {
      exp.addEventListener('input', () => {
        const f = formatExpiry(exp.value);
        if (f !== exp.value) exp.value = f;
      });
      exp.addEventListener('blur', () => {
        if (!exp.value.trim()) return;
        const r = validateExpiry(exp.value);
        if (!r.ok) mark(exp, r.message); else unmark(exp);
      });
    }

    // CVV: digits only
    const cvv = document.querySelector('[name="card_cvv"]');
    if (cvv) {
      cvv.addEventListener('input', () => {
        const digits = cvv.value.replace(/\D/g, '').slice(0, 4);
        if (digits !== cvv.value) cvv.value = digits;
      });
    }

    // UPI ID: lowercase + trim spaces
    const upi = document.querySelector('[name="upi_id"]');
    if (upi) {
      upi.addEventListener('input', () => {
        const lc = upi.value.replace(/\s+/g, '').toLowerCase();
        if (lc !== upi.value) upi.value = lc;
        upi.dataset.verified = '';
        // Clear stale verify status
        const s = document.getElementById('upiVerifyStatus');
        if (s) s.innerHTML = '';
      });
      upi.addEventListener('blur', () => {
        if (!upi.value.trim()) return;
        const r = validateUpiId(upi.value);
        if (!r.ok) mark(upi, r.message); else unmark(upi);
      });
    }

    // Net Banking: show "Other" field when needed
    const bank = document.querySelector('[name="bank"]');
    const bankOtherWrap = document.getElementById('bankOtherWrap');
    if (bank && bankOtherWrap) {
      bank.addEventListener('change', () => {
        bankOtherWrap.style.display = bank.value === 'Other' ? '' : 'none';
        if (bank.value) unmark(bank);
      });
    }
  }

  /** Friendly short description of the sanitized payment details (for Review). */
  function describePaymentDetails(d) {
    if (!d) return '';
    if (d.method === 'upi')        return `UPI: <code>${escapeHTML(d.upi_id)}</code>${d.verified ? ' <span class="pay-verified ms-1">Verified</span>' : ''}`;
    if (d.method === 'card')       return `${escapeHTML(d.brand_label || 'Card')} ending <strong>${escapeHTML(d.last4)}</strong> · ${escapeHTML(d.name_on_card)}${d.verified ? ' <span class="pay-verified ms-1">Verified</span>' : ''}`;
    if (d.method === 'netbanking') return `Net Banking — <strong>${escapeHTML(d.bank)}</strong>`;
    if (d.method === 'cod')        return `Cash or UPI on delivery`;
    return '';
  }

  // ---------- Summary ----------
  function renderSummary() {
    const items = VestaCart.read();
    const coupon = VestaCart.getCoupon();
    const totals = VestaCart.computeTotals(items, coupon);

    document.getElementById('summaryItems').innerHTML = items.map(i => `
      <div class="d-flex align-items-center gap-2 py-2 border-bottom" style="border-color:var(--line)!important">
        <img src="${i.image_url}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:4px" />
        <div class="flex-grow-1" style="min-width:0">
          <div style="font-weight:500; font-size:.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${escapeHTML(i.name)}</div>
          <div class="small text-muted-soft">Qty ${i.qty} · ${VestaCart.formatINR(i.price)}</div>
        </div>
        <div style="font-weight:600; font-size:.9rem">${VestaCart.formatINR(i.price * i.qty)}</div>
      </div>
    `).join('');

    document.getElementById('summaryTotals').innerHTML = `
      <div class="summary-line"><span>Subtotal</span><span>${VestaCart.formatINR(totals.subtotal)}</span></div>
      ${totals.discount_amount > 0 ? `
        <div class="summary-line discount"><span>Discount (${totals.discount_code})</span><span>− ${VestaCart.formatINR(totals.discount_amount)}</span></div>` : ''}
      <div class="summary-line"><span>GST (18%)</span><span>${VestaCart.formatINR(totals.gst_amount)}</span></div>
      <div class="summary-line"><span>Shipping${totals.shipping_fee === 0 ? ' <small class="text-forest">(Free)</small>' : ''}</span><span>${totals.shipping_fee === 0 ? '—' : VestaCart.formatINR(totals.shipping_fee)}</span></div>
      <div class="summary-line total"><span>Total</span><span>${VestaCart.formatINR(totals.total)}</span></div>
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
    const items = VestaCart.read();
    const totals = VestaCart.computeTotals(items, VestaCart.getCoupon());
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
          ${form.payment_details ? `<div class="small mt-1">${describePaymentDetails(form.payment_details)}</div>` : ''}
        </div>
      </div>
      <hr />
      <div class="small text-muted-soft text-uppercase mb-2" style="letter-spacing:.1em">Items (${items.length})</div>
      ${items.map(i => `
        <div class="d-flex justify-content-between py-1">
          <span>${escapeHTML(i.name)} × ${i.qty}</span>
          <span>${VestaCart.formatINR(i.price * i.qty)}</span>
        </div>`).join('')}
      <hr />
      <div class="summary-line"><span>Subtotal</span><span>${VestaCart.formatINR(totals.subtotal)}</span></div>
      ${totals.discount_amount > 0 ? `<div class="summary-line discount"><span>Discount (${totals.discount_code})</span><span>− ${VestaCart.formatINR(totals.discount_amount)}</span></div>` : ''}
      <div class="summary-line"><span>GST (18%)</span><span>${VestaCart.formatINR(totals.gst_amount)}</span></div>
      <div class="summary-line"><span>Shipping</span><span>${totals.shipping_fee === 0 ? 'Free' : VestaCart.formatINR(totals.shipping_fee)}</span></div>
      <div class="summary-line total"><span>Total</span><span>${VestaCart.formatINR(totals.total)}</span></div>
    `;
  }

  // ---------- Place order ----------
  async function placeOrder() {
    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Placing order...';

    try {
      const items = VestaCart.read().map(i => ({ product_id: i.id, quantity: i.qty }));
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
        payment:  { method: form.payment, details: form.payment_details || null },
        coupon_code: VestaCart.getCoupon() || null,
        items,
        notes: form.notes,
      };
      const res = await VestaAPI.checkout(payload);
      sessionStorage.setItem('vesta_last_order', JSON.stringify(res.order));
      VestaCart.clear();
      location.href = `/success.html?order=${encodeURIComponent(res.order.order_number)}`;
    } catch (err) {
      VestaCart.toast(err.message || 'Could not place order', 'error');
      btn.disabled = false;
      btn.textContent = 'Place Order';
    }
  }

  // ---------- Wire-up ----------
  document.addEventListener('DOMContentLoaded', async () => {
    if (window.VestaAuth) {
      try { await VestaAuth.whoami(); } catch (_) {}
      if (!VestaAuth.getUser()) {
        VestaAuth.requireLogin('/checkout.html');
        return;
      }
      const u = VestaAuth.getUser();
      const ne = document.querySelector('[name="email"]');
      const nn = document.querySelector('[name="name"]');
      if (u && u.email && ne && !String(ne.value || '').trim()) ne.value = u.email;
      if (u && u.name && nn && !String(nn.value || '').trim()) nn.value = u.name;
    }

    if (!ensureCartNotEmpty()) return;

    // Min delivery date = today + 3 days
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 3);
    document.querySelector('[name="delivery_date"]').min = minDate.toISOString().slice(0, 10);
    document.querySelector('[name="delivery_date"]').value = minDate.toISOString().slice(0, 10);

    // Payment method UX: radio switch, per-method panel, formatting, verify
    wirePaymentUX();
    wireVerifyButtons();
    showPaymentPanel(form.payment);

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
    cIn.value = VestaCart.getCoupon();
    cBtn.addEventListener('click', () => {
      const code = cIn.value.trim();
      if (!code) { VestaCart.setCoupon(''); renderSummary(); return; }
      const subtotal = VestaCart.read().reduce((s, i) => s + i.price * i.qty, 0);
      const res = VestaCart.applyCoupon(subtotal, code);
      if (res.code) { VestaCart.setCoupon(res.code); VestaCart.toast(res.message, 'success'); }
      else          { VestaCart.setCoupon('');      VestaCart.toast(res.message, 'error'); }
      renderSummary();
    });

    document.addEventListener('vesta:cart-updated', renderSummary);

    renderSummary();
    showStep(1);
  });
})();
