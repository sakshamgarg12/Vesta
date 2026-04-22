(function () {
  const grid = document.getElementById('grid');
  const countEl = document.getElementById('resultCount');
  const emptyEl = document.getElementById('emptyState');
  const searchEl = document.getElementById('searchInput');
  const titleEl = document.getElementById('pageTitle');
  const subEl = document.getElementById('pageSub');
  const crumbTailEl = document.getElementById('crumbTail');

  const state = {
    category: new URLSearchParams(location.search).get('category') || '',
    wood: new URLSearchParams(location.search).get('wood') || '',
    search: new URLSearchParams(location.search).get('search') || '',
    featured: new URLSearchParams(location.search).get('featured') || '',
  };

  const CAT_TITLES = {
    beds:    { title: 'Beds',    sub: 'Solid-wood bedframes built to last a lifetime.' },
    sofas:   { title: 'Sofas',   sub: 'Exposed-frame sofas upholstered in natural fabric.' },
    tables:  { title: 'Tables',  sub: 'Dining, coffee and study tables in solid wood.' },
    chairs:  { title: 'Chairs',  sub: 'Dining and accent chairs, hand-finished.' },
    storage: { title: 'Storage', sub: 'Wardrobes and bookshelves for every room.' },
  };

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function card(p) {
    const mrp = p.mrp ? Number(p.mrp) : null;
    const off = mrp && mrp > p.price ? Math.round(((mrp - p.price) / mrp) * 100) : 0;
    return `
      <div class="col-sm-6 col-lg-4 col-xl-3">
        <div class="product-card">
          <div class="img-wrap">
            ${p.is_featured ? '<span class="featured-badge">Featured</span>' : ''}
            <a href="/product.html?slug=${encodeURIComponent(p.slug)}">
              <img src="${p.image_url}" alt="${escapeHTML(p.name)}" loading="lazy"
                   onerror="this.src='https://via.placeholder.com/600x450?text=Vesta'"/>
            </a>
          </div>
          <div class="body">
            <span class="wood-chip">${escapeHTML(p.wood_type)}</span>
            <h3 class="name">${escapeHTML(p.name)}</h3>
            <div class="price">
              ${VestaCart.formatINR(p.price)}
              ${mrp ? `<span class="mrp">${VestaCart.formatINR(mrp)}</span>` : ''}
              ${off ? `<span class="off">${off}% off</span>` : ''}
            </div>
            <a class="btn btn-outline-forest" href="/product.html?slug=${encodeURIComponent(p.slug)}">View Details</a>
          </div>
        </div>
      </div>`;
  }

  function skeletons(n = 8) {
    return Array.from({ length: n }).map(() => `
      <div class="col-sm-6 col-lg-4 col-xl-3">
        <div class="product-card">
          <div class="skeleton" style="aspect-ratio:4/3"></div>
          <div class="body">
            <div class="skeleton" style="height:14px;width:40%;margin-bottom:.5rem"></div>
            <div class="skeleton" style="height:22px;width:80%;margin-bottom:.5rem"></div>
            <div class="skeleton" style="height:20px;width:50%;margin-bottom:1rem"></div>
            <div class="skeleton" style="height:38px;width:100%"></div>
          </div>
        </div>
      </div>`).join('');
  }

  function syncFilterUI() {
    document.querySelectorAll('.filter-chip[data-filter="category"]').forEach(el =>
      el.classList.toggle('active', (el.dataset.value || '') === state.category));
    document.querySelectorAll('.filter-chip[data-filter="wood"]').forEach(el =>
      el.classList.toggle('active', (el.dataset.value || '') === state.wood));
    if (searchEl && searchEl.value !== state.search) searchEl.value = state.search;
  }

  function updateHeader() {
    if (state.category && CAT_TITLES[state.category]) {
      titleEl.textContent = CAT_TITLES[state.category].title;
      subEl.textContent = CAT_TITLES[state.category].sub;
      crumbTailEl.textContent = CAT_TITLES[state.category].title;
    } else if (state.featured) {
      titleEl.textContent = 'Bestsellers';
      subEl.textContent = 'The pieces our customers love the most.';
      crumbTailEl.textContent = 'Bestsellers';
    } else {
      titleEl.textContent = 'The Collection';
      subEl.textContent = 'Heirloom pieces, built one at a time.';
      crumbTailEl.textContent = 'Shop';
    }
  }

  function updateURL() {
    const params = new URLSearchParams();
    if (state.category) params.set('category', state.category);
    if (state.wood)     params.set('wood', state.wood);
    if (state.search)   params.set('search', state.search);
    if (state.featured) params.set('featured', state.featured);
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  async function load() {
    syncFilterUI();
    updateHeader();
    updateURL();
    grid.innerHTML = skeletons(8);
    emptyEl.style.display = 'none';
    countEl.textContent = '';

    try {
      const params = {};
      if (state.category) params.category = state.category;
      if (state.wood)     params.wood = state.wood;
      if (state.search)   params.search = state.search;
      if (state.featured) params.featured = 1;

      const { products, count } = await VestaAPI.getProducts(params);
      if (!products.length) {
        grid.innerHTML = '';
        emptyEl.style.display = 'block';
        countEl.textContent = '';
      } else {
        grid.innerHTML = products.map(card).join('');
        countEl.textContent = `${count} product${count > 1 ? 's' : ''} found`;
      }
    } catch (err) {
      console.error(err);
      grid.innerHTML = `
        <div class="col-12 text-center text-muted-soft">
          <p>Could not load products. Is the backend running?</p>
        </div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const f = chip.dataset.filter;
        state[f] = chip.dataset.value || '';
        load();
      });
    });

    let tId;
    searchEl?.addEventListener('input', () => {
      clearTimeout(tId);
      tId = setTimeout(() => { state.search = searchEl.value.trim(); load(); }, 250);
    });

    document.getElementById('resetBtn')?.addEventListener('click', () => {
      state.category = ''; state.wood = ''; state.search = ''; state.featured = '';
      if (searchEl) searchEl.value = '';
      load();
    });

    load();
  });
})();
