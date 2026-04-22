(function () {
  function productCard(p) {
    const mrp = p.mrp ? Number(p.mrp) : null;
    const off = mrp && mrp > p.price
      ? Math.round(((mrp - p.price) / mrp) * 100)
      : 0;
    return `
      <div class="col-sm-6 col-lg-3">
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

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  async function loadFeatured() {
    const grid = document.getElementById('featuredGrid');
    if (!grid) return;
    try {
      const { products } = await VestaAPI.getProducts({ featured: 1, limit: 8 });
      if (!products.length) {
        grid.innerHTML = '<p class="text-center text-muted-soft">No featured items yet.</p>';
        return;
      }
      grid.innerHTML = products.slice(0, 8).map(productCard).join('');
    } catch (err) {
      console.error(err);
      grid.innerHTML = `
        <div class="col-12 text-center text-muted-soft">
          <p>Could not load products. Is the backend running?</p>
          <p class="small">Expected at <code>${VestaAPI.base}/api</code></p>
        </div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', loadFeatured);
})();
