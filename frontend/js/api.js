/**
 * Central API client. Works whether the frontend is served by the
 * Express backend (same-origin) or by a separate static host
 * (set window.VESTA_API_BASE before this script loads).
 */
(function () {
  const DEFAULT_BASE =
    (window.VESTA_API_BASE && window.VESTA_API_BASE.replace(/\/$/, '')) ||
    `${window.location.protocol}//${window.location.host}`;

  async function request(path, options = {}) {
    const url = `${DEFAULT_BASE}${path}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (!res.ok) {
      const msg = (data && data.error) || `Request failed (${res.status})`;
      const err = new Error(msg); err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  window.VestaAPI = {
    base: DEFAULT_BASE,

    getProducts(params = {}) {
      const q = new URLSearchParams(params).toString();
      return request(`/api/products${q ? `?${q}` : ''}`);
    },
    getProduct(idOrSlug) { return request(`/api/products/${encodeURIComponent(idOrSlug)}`); },
    getCategories()      { return request('/api/products/categories'); },

    validateCoupon(payload) {
      return request('/api/coupons/validate', { method: 'POST', body: JSON.stringify(payload) });
    },
    checkout(payload) {
      return request('/api/checkout', { method: 'POST', body: JSON.stringify(payload) });
    },
    getOrder(orderNumber) { return request(`/api/orders/${encodeURIComponent(orderNumber)}`); },
    trackOrder(orderNumber, contact) {
      const q = new URLSearchParams({ order: orderNumber, contact }).toString();
      return request(`/api/track?${q}`);
    },
    submitQuery(payload) {
      return request('/api/queries', { method: 'POST', body: JSON.stringify(payload) });
    },

    // --- AI Room Stylist ---
    aiHealth() { return request('/api/ai/health'); },
    aiSuggest(payload) {
      return request('/api/ai/suggest', { method: 'POST', body: JSON.stringify(payload) });
    },

    health() { return request('/api/health'); },
  };
})();
