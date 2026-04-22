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
          <a class="nav-link" href="/track.html" data-nav="track">Track Order</a>
          <a class="nav-link" href="/contact.html" data-nav="contact">Contact</a>
        </div>

        <div class="d-flex align-items-center gap-2">
          <a class="nav-link fx-auth-link d-none d-lg-inline" href="/login.html" data-auth-when="guest">Sign in</a>
          <div class="fx-user-pill d-none align-items-center gap-2" data-auth-when="user">
            <img class="fx-user-avatar" alt="" width="28" height="28" data-user-avatar />
            <span class="small text-muted-soft text-truncate" style="max-width:120px" data-user-name></span>
            <button type="button" class="btn btn-ghost btn-sm py-0" data-vesta-signout title="Sign out">Out</button>
          </div>
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
        <a class="nav-link" href="/track.html">Track Order</a>
        <a class="nav-link" href="/contact.html">Contact</a>
        <a class="nav-link" href="/login.html" data-auth-when="guest">Sign in</a>
        <div class="py-2 border-top border-light mt-2 d-none" data-auth-when="user">
          <div class="small text-muted-soft mb-1">Signed in</div>
          <div class="d-flex align-items-center gap-2">
            <img class="fx-user-avatar" alt="" width="32" height="32" data-user-avatar />
            <span class="small" data-user-name></span>
          </div>
          <button type="button" class="btn btn-forest btn-sm w-100 mt-2" data-vesta-signout>Sign out</button>
        </div>
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

    // Highlight active nav item. On the products page we prefer the category
    // filter (so /products.html?category=sofas underlines "Sofas", not "Shop");
    // if the filtered category doesn't have its own nav link (e.g. chairs,
    // storage) we fall back to highlighting "Shop". Every other page uses
    // <body data-page="...">.
    function applyActiveNav() {
      document
        .querySelectorAll('[data-nav].active')
        .forEach(el => el.classList.remove('active'));

      const page = document.body.dataset.page;
      const params = new URLSearchParams(window.location.search);
      const category = (params.get('category') || '').toLowerCase();

      let activeKey = page;
      if (page === 'products') {
        const hasCategoryLink =
          category && document.querySelector(`[data-nav="${category}"]`);
        activeKey = hasCategoryLink ? category : 'products';
      }
      if (activeKey) {
        document
          .querySelectorAll(`[data-nav="${activeKey}"]`)
          .forEach(el => el.classList.add('active'));
      }
    }
    applyActiveNav();

    // Expose for client-side URL changes (e.g. products.js filters use
    // history.replaceState without reloading). Also re-sync on back/forward.
    window.VestaLayout = Object.assign(window.VestaLayout || {}, {
      refreshActiveNav: applyActiveNav,
    });
    window.addEventListener('popstate', applyActiveNav);

    // Mobile menu toggle
    const toggle = document.getElementById('fxMobileToggle');
    const menu = document.getElementById('fxMobileMenu');
    if (toggle && menu) {
      toggle.addEventListener('click', () => {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      });
    }

    // Lazy-mount the smart chat widget on every page (the widget itself
    // probes /api/chat/health and silently hides if the chatbot is disabled).
    if (!document.querySelector('script[data-vchat]')) {
      const s = document.createElement('script');
      s.src = '/js/chat-widget.js?v=vesta1';
      s.defer = true;
      s.setAttribute('data-vchat', '1');
      document.body.appendChild(s);
    }

    // Auth UI (Google) — /js/auth.js must load before this script.
    function syncAuthUI() {
      if (!window.VestaAuth) return;
      const u = VestaAuth.getUser();
      document.querySelectorAll('[data-auth-when="guest"]').forEach((el) => {
        if (u) {
          el.classList.add('d-none');
        } else if (el.classList.contains('fx-auth-link')) {
          el.classList.add('d-none', 'd-lg-inline');
        } else {
          el.classList.remove('d-none');
        }
      });
      document.querySelectorAll('[data-auth-when="user"]').forEach((el) => {
        if (u) {
          el.classList.remove('d-none');
          if (el.classList.contains('fx-user-pill')) el.classList.add('d-flex');
        } else {
          el.classList.add('d-none');
          if (el.classList.contains('fx-user-pill')) el.classList.remove('d-flex');
        }
      });
      document.querySelectorAll('[data-user-name]').forEach((el) => {
        el.textContent = (u && (u.name || u.email)) ? (u.name || u.email) : '';
      });
      document.querySelectorAll('[data-user-avatar]').forEach((el) => {
        if (u && u.picture) {
          el.src = u.picture;
          el.referrerPolicy = 'no-referrer';
        } else {
          el.removeAttribute('src');
        }
      });
    }
    (async function refreshAuth() {
      if (!window.VestaAuth) return;
      try { await VestaAuth.whoami(); } catch (_) {}
      syncAuthUI();
      VestaAuth.onChange(() => syncAuthUI());
    })();

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-vesta-signout]')) {
        e.preventDefault();
        if (window.VestaAuth) VestaAuth.logout();
      }
    });
  });
})();
