(function () {
  const shell = document.getElementById('productShell');

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function getIdentifier() {
    const p = new URLSearchParams(location.search);
    return p.get('slug') || p.get('id');
  }

  function render(p) {
    document.title = `${p.name} — FurniX`;
    const mrp = p.mrp ? Number(p.mrp) : null;
    const off = mrp && mrp > p.price ? Math.round(((mrp - p.price) / mrp) * 100) : 0;

    // Gallery is stored as JSON; guard against strings or missing data
    let gallery = [];
    try {
      gallery = Array.isArray(p.gallery) ? p.gallery
              : p.gallery ? JSON.parse(p.gallery) : [];
    } catch (_) { gallery = []; }
    if (!gallery.length) gallery = [p.image_url];

    shell.innerHTML = `
      <div class="breadcrumb-link mb-3">
        <a href="/">Home</a> /
        <a href="/products.html?category=${encodeURIComponent(p.category)}">${escapeHTML(p.category[0].toUpperCase() + p.category.slice(1))}</a> /
        <span>${escapeHTML(p.name)}</span>
      </div>
      <div class="row g-5">
        <div class="col-lg-6 product-gallery">
          <img id="mainImg" src="${gallery[0]}" alt="${escapeHTML(p.name)}"
               onerror="this.src='https://via.placeholder.com/900x700?text=FurniX'"/>
          ${gallery.length > 1 ? `
            <div class="d-flex gap-2 mt-3">
              ${gallery.map((g, i) => `
                <img src="${g}" class="thumb" data-i="${i}" alt="thumb ${i+1}"
                     style="width:80px;height:80px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid ${i===0?'var(--forest)':'transparent'}"
                     onerror="this.src='https://via.placeholder.com/120?text=FurniX'"/>
              `).join('')}
            </div>` : ''}
        </div>

        <div class="col-lg-6">
          <span class="wood-chip">${escapeHTML(p.wood_type)}</span>
          <h1 style="font-size:clamp(1.8rem, 3vw, 2.4rem); margin: .5rem 0 1rem">${escapeHTML(p.name)}</h1>

          <div class="d-flex align-items-center gap-2 mb-2">
            <span style="font-size:1.8rem; font-weight:600">${FurnixCart.formatINR(p.price)}</span>
            ${mrp ? `<span style="color:var(--charcoal-soft); text-decoration:line-through">${FurnixCart.formatINR(mrp)}</span>` : ''}
            ${off ? `<span class="text-forest small" style="font-weight:600">${off}% off</span>` : ''}
          </div>
          <div class="small text-muted-soft mb-3">Inclusive of all taxes · GST @ 18% included in cart.</div>

          <p class="mb-4" style="color:var(--charcoal-soft)">${escapeHTML(p.long_desc || p.short_desc || '')}</p>

          <div class="spec-table mb-4">
            <div class="row-item"><div class="label">Wood Type</div><div class="value">${escapeHTML(p.wood_type)}</div></div>
            <div class="row-item"><div class="label">Finish</div><div class="value">${escapeHTML(p.finish || 'Natural Matte')}</div></div>
            <div class="row-item"><div class="label">Dimensions</div><div class="value">${escapeHTML(p.dimensions || '—')}</div></div>
            ${p.weight_kg ? `<div class="row-item"><div class="label">Weight</div><div class="value">${p.weight_kg} kg</div></div>` : ''}
            <div class="row-item"><div class="label">SKU</div><div class="value">${escapeHTML(p.sku)}</div></div>
            <div class="row-item"><div class="label">Stock</div><div class="value">${p.stock > 0 ? `${p.stock} in stock` : '<span class="text-danger">Out of stock</span>'}</div></div>
          </div>

          <div class="d-flex gap-3 align-items-center flex-wrap mb-3">
            <div class="qty-selector">
              <button type="button" id="qtyMinus" aria-label="Decrease">−</button>
              <input id="qtyInput" type="text" value="1" readonly />
              <button type="button" id="qtyPlus" aria-label="Increase">+</button>
            </div>
            <button class="btn btn-forest" id="addToCartBtn" ${p.stock <= 0 ? 'disabled' : ''}>
              ${p.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
            </button>
            <button class="btn btn-outline-forest" id="buyNowBtn" ${p.stock <= 0 ? 'disabled' : ''}>Buy Now</button>
          </div>

          <ul class="list-unstyled small text-muted-soft mt-4">
            <li>✓ Free white-glove delivery on orders above ₹25,000</li>
            <li>✓ 10-year frame warranty · hand-crafted joinery</li>
            <li>✓ 7-day return policy · assembly included</li>
          </ul>
        </div>
      </div>
    `;

    // Gallery thumb switching
    shell.querySelectorAll('.thumb').forEach(t => {
      t.addEventListener('click', () => {
        const img = shell.querySelector('#mainImg');
        img.src = t.src;
        shell.querySelectorAll('.thumb').forEach(x =>
          x.style.border = '2px solid transparent');
        t.style.border = '2px solid var(--forest)';
      });
    });

    // Quantity controls
    const qtyIn = shell.querySelector('#qtyInput');
    shell.querySelector('#qtyMinus').addEventListener('click', () => {
      qtyIn.value = Math.max(1, parseInt(qtyIn.value, 10) - 1);
    });
    shell.querySelector('#qtyPlus').addEventListener('click', () => {
      qtyIn.value = Math.min(20, parseInt(qtyIn.value, 10) + 1);
    });

    shell.querySelector('#addToCartBtn').addEventListener('click', () => {
      FurnixCart.add(p, parseInt(qtyIn.value, 10) || 1);
      FurnixCart.openDrawer();
    });
    shell.querySelector('#buyNowBtn').addEventListener('click', () => {
      FurnixCart.add(p, parseInt(qtyIn.value, 10) || 1);
      location.href = '/checkout.html';
    });

    loadRelated(p);
  }

  async function loadRelated(current) {
    try {
      const { products } = await FurnixAPI.getProducts({ category: current.category, limit: 8 });
      const related = products.filter(p => p.id !== current.id).slice(0, 4);
      if (!related.length) return;

      const sec = document.getElementById('relatedSection');
      const grid = document.getElementById('relatedGrid');
      grid.innerHTML = related.map(p => {
        const mrp = p.mrp ? Number(p.mrp) : null;
        const off = mrp && mrp > p.price ? Math.round(((mrp - p.price) / mrp) * 100) : 0;
        return `
          <div class="col-sm-6 col-lg-3">
            <div class="product-card">
              <div class="img-wrap">
                <a href="/product.html?slug=${encodeURIComponent(p.slug)}">
                  <img src="${p.image_url}" alt="${escapeHTML(p.name)}" loading="lazy"/>
                </a>
              </div>
              <div class="body">
                <span class="wood-chip">${escapeHTML(p.wood_type)}</span>
                <h3 class="name">${escapeHTML(p.name)}</h3>
                <div class="price">
                  ${FurnixCart.formatINR(p.price)}
                  ${mrp ? `<span class="mrp">${FurnixCart.formatINR(mrp)}</span>` : ''}
                  ${off ? `<span class="off">${off}% off</span>` : ''}
                </div>
                <a class="btn btn-outline-forest" href="/product.html?slug=${encodeURIComponent(p.slug)}">View Details</a>
              </div>
            </div>
          </div>`;
      }).join('');
      sec.style.display = 'block';
    } catch (err) { console.warn(err); }
  }

  async function load() {
    const id = getIdentifier();
    if (!id) {
      shell.innerHTML = `<div class="text-center py-5 text-muted-soft">
        <p>No product specified.</p>
        <a href="/products.html" class="btn btn-outline-forest">Browse products</a></div>`;
      return;
    }
    try {
      const { product } = await FurnixAPI.getProduct(id);
      render(product);
    } catch (err) {
      shell.innerHTML = `<div class="text-center py-5 text-muted-soft">
        <p>${err.message || 'Product not found.'}</p>
        <a href="/products.html" class="btn btn-outline-forest">Browse products</a></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();
