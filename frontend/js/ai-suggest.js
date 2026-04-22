/**
 * AI Room Stylist — camera capture / upload, category picker, LLM call,
 * and rich result rendering.
 *
 * Deep-link support:  /ai-suggest.html?category=beds   (pre-selects a chip)
 */
(function () {
  // ---------- State ----------
  const state = {
    imageDataUrl: null,     // "data:image/jpeg;base64,..."
    category: 'any',
    stream: null,
    currentFacing: 'environment', // rear camera by default on phones
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    tabCam:      $('tab-cam'),
    tabUp:       $('tab-up'),
    panelCam:    $('panel-cam'),
    panelUp:     $('panel-up'),
    video:       $('camVideo'),
    canvas:      $('camCanvas'),
    placeholder: $('camPlaceholder'),
    camError:    $('camError'),
    btnStartCam: $('btnStartCam'),
    btnSnap:     $('btnSnap'),
    btnFlip:     $('btnFlip'),
    btnStopCam:  $('btnStopCam'),
    fileInput:   $('fileInput'),
    dropArea:    $('dropArea'),
    previewWrap: $('previewWrap'),
    previewImg:  $('previewImg'),
    btnClearImg: $('btnClearImg'),
    catChips:    $('catChips'),
    notesInput:  $('notesInput'),
    notesCount:  $('notesCount'),
    btnAnalyze:  $('btnAnalyze'),
    aiError:     $('aiError'),
    aiEmpty:     $('aiEmpty'),
    aiLoading:   $('aiLoading'),
    aiResult:    $('aiResult'),
    aiDisabled:  $('aiDisabled'),
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function fmtINR(n) {
    return (window.VestaCart && VestaCart.formatINR) ? VestaCart.formatINR(Number(n)) : '₹' + Number(n).toLocaleString('en-IN');
  }

  // ---------- Availability check ----------
  async function checkAvailability() {
    try {
      const h = await VestaAPI.aiHealth();
      if (!h.configured) {
        els.aiEmpty.style.display = 'none';
        els.aiDisabled.style.display = '';
        els.btnAnalyze.disabled = true;
        els.btnAnalyze.querySelector('.btn-label').textContent = '🔧 Currently unavailable';
      }
    } catch (_) { /* leave as-is */ }
  }

  // ---------- Tab switching ----------
  function switchTab(target) {
    els.tabCam.classList.toggle('active', target === 'cam');
    els.tabUp.classList.toggle('active', target === 'up');
    els.panelCam.style.display = target === 'cam' ? '' : 'none';
    els.panelUp.style.display  = target === 'up'  ? '' : 'none';
    if (target !== 'cam') stopCamera();
  }
  els.tabCam.addEventListener('click', () => switchTab('cam'));
  els.tabUp .addEventListener('click', () => switchTab('up'));

  // ---------- Camera ----------
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showCamError('Your browser doesn\'t support camera access. Try the Upload tab instead.');
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: state.currentFacing, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      state.stream = stream;
      els.video.srcObject = stream;
      els.video.style.display = '';
      els.placeholder.style.display = 'none';
      els.camError.style.display = 'none';
      els.btnStartCam.style.display = 'none';
      els.btnSnap.style.display = '';
      els.btnFlip.style.display = '';
      els.btnStopCam.style.display = '';
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission was denied. Please allow it in your browser settings, or use the Upload tab.'
        : (err.message || 'Could not access the camera.');
      showCamError(msg);
    }
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach(t => t.stop());
      state.stream = null;
    }
    els.video.srcObject = null;
    els.video.style.display = 'none';
    els.placeholder.style.display = '';
    els.btnStartCam.style.display = '';
    els.btnSnap.style.display = 'none';
    els.btnFlip.style.display = 'none';
    els.btnStopCam.style.display = 'none';
  }

  function showCamError(msg) {
    els.camError.textContent = msg;
    els.camError.style.display = '';
    els.placeholder.style.display = 'none';
    els.video.style.display = 'none';
  }

  async function flipCamera() {
    state.currentFacing = state.currentFacing === 'environment' ? 'user' : 'environment';
    await startCamera();
  }

  function captureFrame() {
    const v = els.video;
    if (!v.videoWidth) return;
    const canvas = els.canvas;
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setImage(dataUrl);
    stopCamera();
  }

  els.btnStartCam.addEventListener('click', startCamera);
  els.btnSnap    .addEventListener('click', captureFrame);
  els.btnFlip    .addEventListener('click', flipCamera);
  els.btnStopCam .addEventListener('click', stopCamera);

  // ---------- Upload ----------
  function handleFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setError('Please choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is too big. Please use one under 4 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target.result);
    reader.readAsDataURL(file);
  }

  els.fileInput.addEventListener('change', (e) => handleFile(e.target.files?.[0]));
  els.dropArea.addEventListener('click', () => els.fileInput.click());
  ;['dragenter','dragover'].forEach(evt =>
    els.dropArea.addEventListener(evt, (e) => { e.preventDefault(); els.dropArea.classList.add('drag'); })
  );
  ;['dragleave','drop'].forEach(evt =>
    els.dropArea.addEventListener(evt, (e) => { e.preventDefault(); els.dropArea.classList.remove('drag'); })
  );
  els.dropArea.addEventListener('drop', (e) => handleFile(e.dataTransfer?.files?.[0]));

  // ---------- Image preview ----------
  function setImage(dataUrl) {
    state.imageDataUrl = dataUrl;
    els.previewImg.src = dataUrl;
    els.previewWrap.style.display = '';
    els.aiError.style.display = 'none';
    updateAnalyzeButton();
  }
  function clearImage() {
    state.imageDataUrl = null;
    els.previewImg.src = '';
    els.previewWrap.style.display = 'none';
    els.fileInput.value = '';
    updateAnalyzeButton();
  }
  els.btnClearImg.addEventListener('click', clearImage);

  // ---------- Category chips ----------
  els.catChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-chip');
    if (!chip) return;
    els.catChips.querySelectorAll('.ai-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.category = chip.dataset.cat;
  });

  // ---------- Notes counter ----------
  els.notesInput.addEventListener('input', () => {
    const len = els.notesInput.value.length;
    els.notesCount.textContent = `${len} / 300`;
  });

  // ---------- Analyze ----------
  function updateAnalyzeButton() {
    els.btnAnalyze.disabled = !state.imageDataUrl;
  }

  function setError(msg) {
    els.aiError.textContent = msg;
    els.aiError.style.display = '';
  }

  async function analyze() {
    if (!state.imageDataUrl) return;
    els.aiError.style.display = 'none';
    els.aiEmpty.style.display = 'none';
    els.aiResult.style.display = 'none';
    els.aiLoading.style.display = '';
    els.btnAnalyze.disabled = true;
    const btnLabel = els.btnAnalyze.querySelector('.btn-label');
    const prev = btnLabel.textContent;
    btnLabel.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing…';

    try {
      const data = await VestaAPI.aiSuggest({
        image: state.imageDataUrl,
        category: state.category,
        notes: els.notesInput.value.trim(),
        count: 5,
      });
      renderResults(data);
    } catch (err) {
      els.aiLoading.style.display = 'none';
      els.aiEmpty.style.display = '';
      setError(err.message || 'Could not analyze the image. Please try again.');
    } finally {
      btnLabel.textContent = prev;
      updateAnalyzeButton();
    }
  }
  els.btnAnalyze.addEventListener('click', analyze);

  // ---------- Results rendering ----------
  function renderResults(data) {
    els.aiLoading.style.display = 'none';

    if (data.is_room === false || !data.recommendations?.length) {
      els.aiResult.innerHTML = `
        <div class="checkout-card text-center py-5">
          <div style="font-size:2.5rem;">🖼️</div>
          <h4 class="mt-2">Hmm — we need a room photo</h4>
          <p class="text-muted-soft mb-3">${esc(data.general_advice || 'Try a wider shot that shows the floor, walls and existing furniture.')}</p>
          <button class="btn btn-outline-forest" onclick="window.scrollTo({top:0,behavior:'smooth'})">Try another photo</button>
        </div>`;
      els.aiResult.style.display = '';
      return;
    }

    const a = data.room_analysis || {};
    const colourChips = (a.colours || []).map(c =>
      `<span class="ai-colour-chip">${esc(c)}</span>`
    ).join('');

    const cards = data.recommendations.map((r, i) => {
      const p = r.product;
      const href = `/product.html?slug=${encodeURIComponent(p.slug)}`;
      const scoreClass = r.match_score >= 85 ? 'strong' : r.match_score >= 70 ? 'good' : 'ok';
      const canShow = r.placement && r.placement.bbox;
      return `
        <div class="ai-rec-card">
          <div class="ai-rec-rank">#${i + 1}</div>
          <a href="${href}" class="ai-rec-img" style="background-image:url('${esc(p.image_url)}')"></a>
          <div class="ai-rec-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <a href="${href}" class="ai-rec-title">${esc(p.name)}</a>
                <div class="small text-muted-soft">${esc(p.wood_type)} · ${esc(p.finish || '')}</div>
              </div>
              <span class="ai-match ${scoreClass}" title="AI match score">${r.match_score}% match</span>
            </div>
            <p class="ai-rec-reason mt-2 mb-2">${esc(r.reason)}</p>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="ai-rec-price">
                ${fmtINR(p.price)}
                ${p.mrp && p.mrp > p.price ? `<span class="text-muted-soft small text-decoration-line-through ms-1">${fmtINR(p.mrp)}</span>` : ''}
              </div>
              <div class="d-flex gap-2 flex-wrap">
                ${canShow ? `<button class="btn btn-forest btn-sm" data-show-in-room="${i}" title="See it in your room">🪄 See in my room</button>` : ''}
                <button class="btn btn-outline-forest btn-sm" data-add-to-cart="${p.id}">Add to cart</button>
                <a class="btn btn-ghost btn-sm" href="${href}">View →</a>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    // Build hero "after" preview for the #1 recommendation, if we have
    // a placement. This is the showstopper: the customer sees THEIR room
    // with the top-picked Vesta piece composited into it.
    const top = data.recommendations[0];
    const canHero = top && top.placement && top.placement.bbox;
    const heroHtml = canHero ? buildHeroPreview(top, state.imageDataUrl) : '';

    els.aiResult.innerHTML = `
      ${heroHtml}

      <div class="checkout-card mb-3">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <div class="small text-muted-soft text-uppercase" style="letter-spacing:.12em;">Room analysis</div>
            <h4 class="mb-0 mt-1" style="font-family:var(--font-serif)">${esc(a.style || 'Your room')}</h4>
          </div>
          <div class="small text-muted-soft text-end">
            <div>💡 ${esc(a.lighting || '—')}</div>
            <div>📐 ${esc(a.size_impression || '—')}</div>
          </div>
        </div>
        ${colourChips ? `<div class="mt-3 d-flex flex-wrap gap-2">${colourChips}</div>` : ''}
        ${a.existing_notes ? `<p class="small text-muted-soft mt-3 mb-0"><em>${esc(a.existing_notes)}</em></p>` : ''}
        ${data.general_advice ? `<div class="ai-advice mt-3">💬 ${esc(data.general_advice)}</div>` : ''}
      </div>

      <h4 class="mb-3" style="font-family:var(--font-serif)">${data.recommendations.length > 1 ? 'More picks for your space' : 'Your pick'}</h4>
      <div class="ai-rec-list">${cards}</div>

      <div class="text-center mt-4">
        <button class="btn btn-ghost" onclick="location.reload()">Try another room →</button>
      </div>
    `;
    els.aiResult.style.display = '';

    // Wire hero interactions (if present).
    if (canHero) wireHeroInteractions(top, data.recommendations);

    // Wire up "Add to cart" buttons (uses the already-known product IDs).
    els.aiResult.querySelectorAll('[data-add-to-cart]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.addToCart);
        const rec = data.recommendations.find(x => x.product.id === id);
        if (!rec) return;
        try {
          if (window.VestaCart?.addItem) {
            VestaCart.addItem({
              id: rec.product.id,
              name: rec.product.name,
              price: rec.product.price,
              image: rec.product.image_url,
              slug: rec.product.slug,
              wood_type: rec.product.wood_type,
            }, 1);
            VestaCart.toast(`Added "${rec.product.name}" to cart`, 'success');
          }
        } catch (e) { console.warn(e); }
      });
    });

    // Wire up "See it in my room" buttons — opens the compositing modal.
    els.aiResult.querySelectorAll('[data-show-in-room]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.showInRoom);
        const rec = data.recommendations[idx];
        if (!rec || !rec.placement) return;
        openRoomPreview({
          roomImage: state.imageDataUrl,
          recommendation: rec,
          allRecs: data.recommendations,
          startIndex: idx,
        });
      });
    });

    els.aiResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ========================================================================
   *  HERO "AFTER" PREVIEW — composited straight into the results page.
   *  The customer sees their room with the #1 Vesta pick placed into it
   *  BEFORE they have to click anything else. Includes a drag-able
   *  before/after slider for instant comparison.
   * ====================================================================== */
  function buildHeroPreview(rec, roomImage) {
    const p = rec.product;
    const pl = rec.placement;
    const bbox = pl.bbox;
    const mirror = (pl.facing === 'three_quarter_right' || pl.facing === 'side') ? 'scaleX(-1)' : '';
    const floorY = (pl.floor_y != null ? pl.floor_y : (bbox.y + bbox.h)) * 100;
    const scoreClass = rec.match_score >= 85 ? 'strong' : rec.match_score >= 70 ? 'good' : 'ok';

    return `
      <div class="ai-hero mb-4">
        <div class="ai-hero__head">
          <div>
            <div class="small text-muted-soft text-uppercase" style="letter-spacing:.12em">AI visualisation</div>
            <h3 class="mb-0 mt-1" style="font-family:var(--font-serif)">Here's your room with the top pick</h3>
            <p class="small text-muted-soft mb-0 mt-1">Drag the slider to compare — ${esc(p.name)} at ${fmtINR(p.price)}</p>
          </div>
          <span class="ai-match ${scoreClass} ai-hero__match">${rec.match_score}% match</span>
        </div>

        <div class="ai-hero__stage" id="aiHeroStage" data-room="${esc(roomImage)}">
          <!-- BEFORE -->
          <img class="ai-hero__bg ai-hero__bg--before" src="${esc(roomImage)}" alt="Your room" />

          <!-- AFTER (clipped by the slider) -->
          <div class="ai-hero__after" id="aiHeroAfter">
            <img class="ai-hero__bg" src="${esc(roomImage)}" alt="" />
            <div class="ai-hero__overlay"
                 style="left:${(bbox.x*100).toFixed(2)}%;
                        top:${(bbox.y*100).toFixed(2)}%;
                        width:${(bbox.w*100).toFixed(2)}%;
                        height:${(bbox.h*100).toFixed(2)}%;
                        transform:${mirror}">
              <img class="ai-room-product" src="${esc(p.image_url)}" alt="${esc(p.name)}" />
            </div>
            <div class="ai-hero__shadow"
                 style="left:${((bbox.x + bbox.w*0.1)*100).toFixed(2)}%;
                        width:${(bbox.w*0.8*100).toFixed(2)}%;
                        bottom:${(100-floorY).toFixed(2)}%"></div>
          </div>

          <!-- Before / After labels -->
          <span class="ai-hero__label ai-hero__label--before">Before</span>
          <span class="ai-hero__label ai-hero__label--after">After</span>

          <!-- Slider handle -->
          <div class="ai-hero__slider" id="aiHeroSlider" role="slider" tabindex="0"
               aria-label="Before/after slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
            <div class="ai-hero__slider-line"></div>
            <div class="ai-hero__slider-knob">↔</div>
          </div>
        </div>

        <div class="ai-hero__footer">
          <div class="ai-hero__reason">🪄 ${esc(rec.reason)}</div>
          <div class="ai-hero__actions">
            <button class="btn btn-forest" id="aiHeroAdd" type="button">Add to cart</button>
            <a class="btn btn-outline-forest" href="/product.html?slug=${encodeURIComponent(p.slug)}">View details →</a>
          </div>
        </div>
      </div>
    `;
  }

  function wireHeroInteractions(topRec, allRecs) {
    const stage  = document.getElementById('aiHeroStage');
    const after  = document.getElementById('aiHeroAfter');
    const slider = document.getElementById('aiHeroSlider');
    const addBtn = document.getElementById('aiHeroAdd');
    if (!stage || !after || !slider) return;

    // Drag slider
    let dragging = false;
    function setPosition(pct) {
      pct = Math.max(0, Math.min(100, pct));
      after.style.clipPath  = `inset(0 ${100 - pct}% 0 0)`;
      slider.style.left = pct + '%';
      slider.setAttribute('aria-valuenow', Math.round(pct));
    }
    setPosition(55); // start slightly to the right so "After" is visible

    function posFromEvent(e) {
      const rect = stage.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      return ((clientX - rect.left) / rect.width) * 100;
    }
    function onDown(e) { dragging = true; setPosition(posFromEvent(e)); e.preventDefault(); }
    function onMove(e) { if (dragging) setPosition(posFromEvent(e)); }
    function onUp()    { dragging = false; }
    stage.addEventListener('mousedown', onDown);
    stage.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    // Keyboard
    slider.addEventListener('keydown', (e) => {
      const cur = parseFloat(slider.style.left) || 50;
      if (e.key === 'ArrowLeft')  { setPosition(cur - 5); e.preventDefault(); }
      if (e.key === 'ArrowRight') { setPosition(cur + 5); e.preventDefault(); }
    });
    // Click on bg to jump
    stage.addEventListener('click', (e) => {
      if (!dragging) setPosition(posFromEvent(e));
    });

    // Add-to-cart on the hero CTA
    addBtn?.addEventListener('click', () => {
      const p = topRec.product;
      try {
        if (window.VestaCart?.addItem) {
          VestaCart.addItem({
            id: p.id, name: p.name, price: p.price,
            image: p.image_url, slug: p.slug, wood_type: p.wood_type,
          }, 1);
          VestaCart.toast(`Added "${p.name}" to cart`, 'success');
        }
      } catch (_) {}
    });
  }

  /* ========================================================================
   *  ROOM PREVIEW MODAL — composites the recommended product into the
   *  uploaded room photo at the AI's chosen bbox + anchor + facing.
   *  Uses CSS mix-blend-mode: multiply to knock out white catalog
   *  backgrounds, plus a floor-anchored drop-shadow for grounding.
   * ====================================================================== */
  let modalEl = null, modalState = null;

  function openRoomPreview({ roomImage, recommendation, allRecs, startIndex }) {
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.className = 'ai-room-modal';
      modalEl.innerHTML = `
        <div class="ai-room-modal__backdrop" data-close></div>
        <div class="ai-room-modal__dialog" role="dialog" aria-label="Preview in your room">
          <button class="ai-room-modal__close" type="button" aria-label="Close" data-close>&times;</button>
          <div class="ai-room-modal__head">
            <div>
              <div class="small text-muted-soft text-uppercase" style="letter-spacing:.12em">AI visualisation</div>
              <h4 class="mb-0 mt-1" id="aiModalTitle" style="font-family:var(--font-serif)">Preview</h4>
              <div class="small text-muted-soft mt-1" id="aiModalMeta"></div>
            </div>
            <div class="ai-room-modal__toggle" role="tablist" aria-label="Toggle view">
              <button type="button" class="ai-toggle-btn" data-view="before">Before</button>
              <button type="button" class="ai-toggle-btn active" data-view="after">After</button>
            </div>
          </div>
          <div class="ai-room-stage" id="aiRoomStage">
            <img class="ai-room-bg" id="aiRoomBg" alt="" />
            <div class="ai-room-overlay" id="aiRoomOverlay">
              <div class="ai-room-shadow" id="aiRoomShadow"></div>
              <img class="ai-room-product" id="aiRoomProduct" alt="" />
            </div>
          </div>
          <div class="ai-room-modal__footer">
            <button class="btn btn-ghost btn-sm" id="aiPrevRec" type="button">← Previous</button>
            <div class="ai-room-actions text-center">
              <button class="btn btn-outline-forest btn-sm" id="aiAddFromModal" type="button">Add to cart</button>
              <a class="btn btn-forest btn-sm" id="aiViewFromModal" href="#">View details →</a>
            </div>
            <button class="btn btn-ghost btn-sm" id="aiNextRec" type="button">Next →</button>
          </div>
          <p class="ai-room-disclaimer">
            AI-simulated placement based on the photo. Final scale, lighting and
            perspective may vary — contact us for a free in-home consultation.
          </p>
        </div>
      `;
      document.body.appendChild(modalEl);
      // Close handlers
      modalEl.addEventListener('click', (e) => {
        if (e.target.matches('[data-close]')) closeRoomPreview();
      });
      document.addEventListener('keydown', onEscKey);
      // Before/After toggle
      modalEl.querySelectorAll('.ai-toggle-btn').forEach(b => {
        b.addEventListener('click', () => {
          modalEl.querySelectorAll('.ai-toggle-btn').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          modalEl.querySelector('.ai-room-overlay').classList.toggle('hidden', b.dataset.view === 'before');
        });
      });
      // Prev/Next
      modalEl.querySelector('#aiPrevRec').addEventListener('click', () => stepRec(-1));
      modalEl.querySelector('#aiNextRec').addEventListener('click', () => stepRec(+1));
      // Add / View wired per-render below.
    }
    modalState = { roomImage, allRecs, index: startIndex };
    renderModal();
    modalEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function stepRec(delta) {
    if (!modalState) return;
    const n = modalState.allRecs.length;
    modalState.index = (modalState.index + delta + n) % n;
    renderModal();
  }

  function onEscKey(e) {
    if (e.key === 'Escape' && modalEl?.classList.contains('open')) closeRoomPreview();
  }

  function closeRoomPreview() {
    if (!modalEl) return;
    modalEl.classList.remove('open');
    document.body.style.overflow = '';
    // Reset to After view for next open.
    modalEl.querySelectorAll('.ai-toggle-btn').forEach(x =>
      x.classList.toggle('active', x.dataset.view === 'after')
    );
    modalEl.querySelector('.ai-room-overlay').classList.remove('hidden');
  }

  function renderModal() {
    if (!modalEl || !modalState) return;
    const rec = modalState.allRecs[modalState.index];
    const p = rec.product;
    const pl = rec.placement || { bbox: {x:0.25,y:0.45,w:0.5,h:0.35}, facing:'front', floor_y:0.85 };
    const bbox = pl.bbox;

    // Title + meta
    modalEl.querySelector('#aiModalTitle').textContent = p.name;
    modalEl.querySelector('#aiModalMeta').innerHTML =
      `${esc(p.wood_type || '')} · <strong>${fmtINR(p.price)}</strong>` +
      `<span class="ai-room-confidence ms-2" title="AI placement confidence">placement ${pl.confidence ?? 50}%</span>`;

    // Room photo
    modalEl.querySelector('#aiRoomBg').src = modalState.roomImage;

    // Product overlay — positioned in % of the stage
    const prod = modalEl.querySelector('#aiRoomProduct');
    prod.src = p.image_url;
    prod.alt = p.name;
    // Mirror horizontally if the AI says the piece should face the other way.
    const mirror = pl.facing === 'three_quarter_right' || pl.facing === 'side' ? ' scaleX(-1)' : '';
    const overlay = modalEl.querySelector('#aiRoomOverlay');
    overlay.style.left   = (bbox.x * 100).toFixed(2) + '%';
    overlay.style.top    = (bbox.y * 100).toFixed(2) + '%';
    overlay.style.width  = (bbox.w * 100).toFixed(2) + '%';
    overlay.style.height = (bbox.h * 100).toFixed(2) + '%';
    overlay.style.transform = mirror;

    // Shadow anchored at floor_y (relative to the stage, not the overlay).
    const stage = modalEl.querySelector('#aiRoomStage');
    const shadow = modalEl.querySelector('#aiRoomShadow');
    const floorY = (pl.floor_y != null ? pl.floor_y : (bbox.y + bbox.h)) * 100;
    shadow.style.left = ((bbox.x + bbox.w * 0.1) * 100) + '%';
    shadow.style.width = (bbox.w * 0.8 * 100) + '%';
    shadow.style.top  = 'auto';
    shadow.style.bottom = (100 - floorY) + '%';

    // Footer actions
    modalEl.querySelector('#aiViewFromModal').href = `/product.html?slug=${encodeURIComponent(p.slug)}`;
    const addBtn = modalEl.querySelector('#aiAddFromModal');
    addBtn.onclick = () => {
      try {
        if (window.VestaCart?.addItem) {
          VestaCart.addItem({
            id: p.id, name: p.name, price: p.price,
            image: p.image_url, slug: p.slug, wood_type: p.wood_type,
          }, 1);
          VestaCart.toast(`Added "${p.name}" to cart`, 'success');
        }
      } catch (_) {}
    };

    const multi = modalState.allRecs.length > 1;
    modalEl.querySelector('#aiPrevRec').style.visibility = multi ? '' : 'hidden';
    modalEl.querySelector('#aiNextRec').style.visibility = multi ? '' : 'hidden';
  }

  // ---------- Deep-link: ?category=xxx ----------
  document.addEventListener('DOMContentLoaded', () => {
    const p = new URLSearchParams(location.search);
    const cat = p.get('category');
    if (cat) {
      const chip = els.catChips.querySelector(`.ai-chip[data-cat="${CSS.escape(cat)}"]`);
      if (chip) {
        els.catChips.querySelectorAll('.ai-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.category = cat;
      }
    }
    checkAvailability();
    updateAnalyzeButton();
  });

  // Clean up camera if the page is hidden or unloaded.
  window.addEventListener('pagehide', stopCamera);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
  });
})();
