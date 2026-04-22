/**
 * Injects the shared navbar and footer on every page.
 * Pages just need <div data-fx-nav></div> and <div data-fx-footer></div>.
 */
(function () {
  const nav = `
    <nav class="fx-navbar">
      <div class="container d-flex align-items-center justify-content-between">
        <a class="fx-brand" href="/">Ves<span>ta</span></a>

        <button class="btn btn-ghost d-lg-none" type="button" id="fxMobileToggle" aria-label="Menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <div class="d-none d-lg-flex align-items-center gap-1" id="fxMainMenu">
          <a class="nav-link" href="/" data-nav="home">Home</a>
          <a class="nav-link" href="/products.html" data-nav="products">Shop</a>
          <a class="nav-link" href="/products.html?category=beds" data-nav="beds">Beds</a>
          <a class="nav-link" href="/products.html?category=sofas" data-nav="sofas">Sofas</a>
          <a class="nav-link" href="/products.html?category=tables" data-nav="tables">Tables</a>
          <a class="nav-link" href="/ai-suggest.html" data-nav="ai">
            <span class="ai-nav-pill">AI</span> Stylist
          </a>
          <a class="nav-link" href="/track.html" data-nav="track">Track Order</a>
          <a class="nav-link" href="/contact.html" data-nav="contact">Contact</a>
        </div>

        <div class="d-flex align-items-center gap-2">
          <button class="cart-btn" type="button" data-open-cart aria-label="Open cart">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            <span class="ms-2">Cart</span>
            <span class="cart-badge" data-cart-badge style="display:none">0</span>
          </button>
        </div>
      </div>

      <div class="d-lg-none container pt-2" id="fxMobileMenu" style="display:none;">
        <a class="nav-link" href="/">Home</a>
        <a class="nav-link" href="/products.html">Shop</a>
        <a class="nav-link" href="/products.html?category=beds">Beds</a>
        <a class="nav-link" href="/products.html?category=sofas">Sofas</a>
        <a class="nav-link" href="/products.html?category=tables">Tables</a>
        <a class="nav-link" href="/ai-suggest.html"><span class="ai-nav-pill">AI</span> Stylist</a>
        <a class="nav-link" href="/track.html">Track Order</a>
        <a class="nav-link" href="/contact.html">Contact</a>
      </div>
    </nav>
  `;

  const footer = `
    <footer class="fx-footer">
      <div class="container">
        <div class="row g-4">
          <div class="col-md-4">
            <div class="brand-line">Furni<span style="color:#9AC69B">X</span></div>
            <p class="mb-2" style="max-width:360px">
              Hand-crafted, solid-wood furniture built for the homes we grow up in —
              and the homes our children will inherit.
            </p>
          </div>
          <div class="col-6 col-md-2">
            <h5>Shop</h5>
            <ul class="list-unstyled">
              <li><a href="/products.html?category=beds">Beds</a></li>
              <li><a href="/products.html?category=sofas">Sofas</a></li>
              <li><a href="/products.html?category=tables">Tables</a></li>
              <li><a href="/products.html?category=chairs">Chairs</a></li>
              <li><a href="/products.html?category=storage">Storage</a></li>
            </ul>
          </div>
          <div class="col-6 col-md-3">
            <h5>Company</h5>
            <ul class="list-unstyled">
              <li><a href="/contact.html">Contact</a></li>
              <li><a href="/ai-suggest.html">AI Room Stylist</a></li>
              <li><a href="/track.html">Track Order</a></li>
              <li><a href="/contact.html">Bulk &amp; Trade</a></li>
              <li><a href="/contact.html">Custom Orders</a></li>
            </ul>
          </div>
          <div class="col-12 col-md-3">
            <h5>Support</h5>
            <ul class="list-unstyled">
              <li>GST: 18% included in prices where applicable</li>
              <li>Free shipping over ₹25,000</li>
              <li>Use code <strong style="color:#fff">WOOD20</strong> for 20% off</li>
            </ul>
          </div>
        </div>
        <hr />
        <div class="d-flex flex-wrap justify-content-between align-items-center">
          <span class="small">© ${new Date().getFullYear()} Vesta. All rights reserved.</span>
          <span class="small">Crafted with solid-wood care.</span>
        </div>
      </div>
    </footer>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-fx-nav]').forEach(el => { el.outerHTML = nav; });
    document.querySelectorAll('[data-fx-footer]').forEach(el => { el.outerHTML = footer; });

    // Highlight active nav item based on <body data-page="...">.
    const page = document.body.dataset.page;
    if (page) {
      document.querySelectorAll(`[data-nav="${page}"]`).forEach(el => el.classList.add('active'));
    }

    // Mobile menu toggle
    const toggle = document.getElementById('fxMobileToggle');
    const menu = document.getElementById('fxMobileMenu');
    if (toggle && menu) {
      toggle.addEventListener('click', () => {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      });
    }
  });
})();
