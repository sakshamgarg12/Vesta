/**
 * Vesta — client-side authentication.
 *
 * Loads Google Identity Services (GIS) lazily, renders the Google Sign-In
 * button wherever the page asks for one, and keeps a small in-memory
 * copy of the current user so every page can render the navbar / gate
 * state without another round-trip.
 *
 * Public surface: window.VestaAuth
 *
 *   VestaAuth.whoami()            -> Promise<user|null>
 *   VestaAuth.getUser()           -> user|null  (synchronous, after whoami)
 *   VestaAuth.isAdmin()           -> boolean
 *   VestaAuth.requireLogin(next)  -> redirects to /login.html if not signed in
 *   VestaAuth.requireAdmin()      -> returns true if admin, else shows gate
 *   VestaAuth.logout()            -> clears server cookie + reloads
 *   VestaAuth.renderSignInButton(el, onSuccess)
 *                                  -> mounts the Google button inside `el`
 *   VestaAuth.onChange(cb)        -> cb fires when user state changes
 */
(function () {
  const GIS_SRC = 'https://accounts.google.com/gsi/client';

  const state = {
    user: undefined,   // undefined = not probed yet, null = signed out, object = signed in
    config: null,      // { configured, client_id }
    gisReady: null,    // Promise that resolves when GIS script is loaded
    changeSubs: new Set(),
  };

  // ---------- internal helpers -------------------------------------------

  function api(path, options = {}) {
    return fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  }

  async function fetchConfig() {
    if (state.config) return state.config;
    try {
      const r = await api('/api/auth/config');
      state.config = await r.json();
    } catch (_) {
      state.config = { configured: false, client_id: null };
    }
    return state.config;
  }

  function loadGIS() {
    if (state.gisReady) return state.gisReady;
    state.gisReady = new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        return resolve();
      }
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Google Sign-In.'));
      document.head.appendChild(s);
    });
    return state.gisReady;
  }

  function notifyChange() {
    state.changeSubs.forEach(fn => { try { fn(state.user); } catch (_) {} });
  }

  // ---------- public API -------------------------------------------------

  async function whoami() {
    try {
      const r = await api('/api/auth/me');
      if (r.status === 401) {
        state.user = null;
      } else if (r.ok) {
        const data = await r.json();
        state.user = data.user || null;
      } else {
        state.user = null;
      }
    } catch (_) {
      state.user = null;
    }
    notifyChange();
    return state.user;
  }

  function getUser() { return state.user || null; }

  function isAdmin() {
    const u = getUser();
    return !!u && u.role === 'admin' && String(u.email || '').toLowerCase().includes('admin');
  }

  function requireLogin(nextUrl) {
    if (getUser()) return true;
    const ret = encodeURIComponent(nextUrl || (location.pathname + location.search));
    location.replace(`/login.html?next=${ret}`);
    return false;
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    state.user = null;
    notifyChange();
    // Also tell GIS to forget the session so the next "Sign in with Google"
    // shows the account chooser rather than auto-selecting.
    try {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.disableAutoSelect();
      }
    } catch (_) {}
    location.replace('/');
  }

  async function exchangeGoogleCredential(credential) {
    const r = await api('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(data.error || `Sign-in failed (${r.status}).`);
    }
    state.user = data.user || null;
    notifyChange();
    return state.user;
  }

  /**
   * Mount a real Google Sign-In button inside `container`.
   *
   *   container  HTMLElement   — where the button renders
   *   opts       { onSuccess(user), onError(msg), theme, size, text }
   */
  async function renderSignInButton(container, opts = {}) {
    const cfg = await fetchConfig();
    if (!cfg.configured || !cfg.client_id) {
      container.innerHTML =
        '<div class="auth-misconfig">' +
        'Google Sign-In is not configured on this server yet.<br>' +
        'Ask the site owner to set <code>GOOGLE_CLIENT_ID</code> in ' +
        '<code>backend/.env</code> (see <code>GOOGLE_OAUTH_SETUP.md</code>).' +
        '</div>';
      return;
    }

    try {
      await loadGIS();
    } catch (err) {
      container.textContent = err.message;
      return;
    }

    // Initialize once.
    window.google.accounts.id.initialize({
      client_id: cfg.client_id,
      callback: async (response) => {
        try {
          const user = await exchangeGoogleCredential(response.credential);
          if (opts.onSuccess) opts.onSuccess(user);
        } catch (err) {
          if (opts.onError) opts.onError(err.message);
          else alert(err.message);
        }
      },
      auto_select: false,
      ux_mode: 'popup',
      context: 'signin',
    });

    container.innerHTML = '';
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: opts.theme || 'outline',
      size: opts.size || 'large',
      text: opts.text || 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: opts.width || 280,
    });
  }

  function onChange(cb) {
    state.changeSubs.add(cb);
    // Fire immediately if we already know the user state.
    if (state.user !== undefined) {
      try { cb(state.user); } catch (_) {}
    }
    return () => state.changeSubs.delete(cb);
  }

  /** True if the signed-in user may open /admin (server also enforces). */
  function canAccessAdmin() {
    return isAdmin();
  }

  /**
   * Send guests to /login. Call only after a positive whoami, or it will
   * flash — pages should await whoami() first.
   */
  function requireAdminOrLogin() {
    if (!getUser()) {
      const ret = encodeURIComponent('/admin.html');
      location.replace(`/login.html?next=${ret}`);
      return false;
    }
    if (!canAccessAdmin()) return false;
    return true;
  }

  window.VestaAuth = {
    whoami,
    getUser,
    isAdmin,
    canAccessAdmin,
    requireLogin,
    requireAdminOrLogin,
    logout,
    renderSignInButton,
    onChange,
  };

  // Kick off the whoami probe early so pages that need it don't have to wait.
  whoami();
})();
