/**
 * Vesta Smart Chatbot — floating assistant widget.
 *
 * - Appears as a bubble in the bottom-right on every page.
 * - Opens into a small chat panel.
 * - Keeps conversation history in memory per session.
 * - Gracefully hides itself if the backend reports chatbot is not configured.
 */
(function () {
  if (window.__VESTA_CHAT_INIT) return;
  window.__VESTA_CHAT_INIT = true;

  const STORE = {
    messages: [],           // {role, content, products?}
    sending: false,
    open: false,
  };

  const SUGGESTIONS = [
    'Best sofa under ₹20,000',
    'Which bed is good for back pain?',
    'Show me modern style tables',
    'Teak vs Sheesham — which lasts longer?',
    'What\'s your return policy?',
  ];

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatINR(n) {
    const v = Number(n || 0);
    return 'Rs ' + v.toLocaleString('en-IN');
  }

  function productCardHTML(p) {
    const priceStrike = p.mrp && p.mrp > p.price
      ? `<span class="vchat-price-strike">${formatINR(p.mrp)}</span>`
      : '';
    const img = p.image_url || '';
    return `
      <a class="vchat-product" href="/product.html?slug=${encodeURIComponent(p.slug)}">
        <img class="vchat-product__img" src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy" />
        <div class="vchat-product__body">
          <div class="vchat-product__title">${escapeHtml(p.name)}</div>
          <div class="vchat-product__meta">${escapeHtml(p.wood_type)} · ${escapeHtml(p.category)}</div>
          <div class="vchat-product__price">
            <strong>${formatINR(p.price)}</strong>${priceStrike}
          </div>
        </div>
      </a>`;
  }

  function bubbleHTML(msg) {
    const who = msg.role === 'user' ? 'vchat-msg--user' : 'vchat-msg--bot';
    const text = escapeHtml(msg.content).replace(/\n/g, '<br/>');
    const products = Array.isArray(msg.products) && msg.products.length
      ? `<div class="vchat-products">${msg.products.map(productCardHTML).join('')}</div>`
      : '';
    return `
      <div class="vchat-msg ${who}">
        <div class="vchat-bubble">${text}</div>
        ${products}
      </div>`;
  }

  function typingHTML() {
    return `
      <div class="vchat-msg vchat-msg--bot vchat-msg--typing" id="vchatTyping">
        <div class="vchat-bubble">
          <span class="vchat-dot"></span>
          <span class="vchat-dot"></span>
          <span class="vchat-dot"></span>
        </div>
      </div>`;
  }

  function suggestionsHTML() {
    return `
      <div class="vchat-suggestions">
        ${SUGGESTIONS.map(s => `<button class="vchat-chip" type="button" data-suggest="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
      </div>`;
  }

  function render() {
    const body = document.getElementById('vchatBody');
    if (!body) return;
    const empty = STORE.messages.length === 0;
    body.innerHTML = (empty
      ? `<div class="vchat-welcome">
           <strong>Hi — I'm Vesta's assistant.</strong>
           <p>Ask me about products, delivery, warranties — or tell me what you're looking for and I'll find pieces that fit.</p>
           ${suggestionsHTML()}
         </div>`
      : STORE.messages.map(bubbleHTML).join('')
    ) + (STORE.sending ? typingHTML() : '');
    body.scrollTop = body.scrollHeight;
  }

  async function send(text) {
    const content = String(text || '').trim();
    if (!content || STORE.sending) return;
    STORE.messages.push({ role: 'user', content });
    STORE.sending = true;
    render();
    try {
      const res = await fetch(`${window.VestaAPI?.base || ''}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: STORE.messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      let data = null;
      try { data = await res.json(); } catch (_) {}
      if (!res.ok) {
        const msg = (data && data.error) || `Sorry — I couldn't reach the assistant (error ${res.status}).`;
        STORE.messages.push({ role: 'assistant', content: msg });
      } else {
        STORE.messages.push({
          role: 'assistant',
          content: data.reply || "Sorry, I couldn't come up with a reply.",
          products: Array.isArray(data.products) ? data.products : [],
        });
      }
    } catch (err) {
      STORE.messages.push({
        role: 'assistant',
        content: 'Network error — please check your connection and try again.',
      });
    } finally {
      STORE.sending = false;
      render();
    }
  }

  function toggle(forceState) {
    STORE.open = typeof forceState === 'boolean' ? forceState : !STORE.open;
    const panel = document.getElementById('vchatPanel');
    const btn = document.getElementById('vchatToggle');
    if (!panel || !btn) return;
    panel.classList.toggle('open', STORE.open);
    btn.classList.toggle('open', STORE.open);
    btn.setAttribute('aria-expanded', STORE.open ? 'true' : 'false');
    if (STORE.open) {
      setTimeout(() => document.getElementById('vchatInput')?.focus(), 80);
    }
  }

  function mount() {
    if (document.getElementById('vchatRoot')) return;
    const root = document.createElement('div');
    root.id = 'vchatRoot';
    root.innerHTML = `
      <button id="vchatToggle" class="vchat-toggle" type="button" aria-label="Open chat assistant" aria-expanded="false">
        <span class="vchat-toggle__icon vchat-toggle__icon--chat">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </span>
        <span class="vchat-toggle__icon vchat-toggle__icon--close">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </span>
        <span class="vchat-toggle__label">Ask Vesta</span>
      </button>

      <div id="vchatPanel" class="vchat-panel" role="dialog" aria-label="Vesta chat assistant" aria-hidden="true">
        <header class="vchat-header">
          <div class="vchat-header__brand">
            <span class="vchat-avatar">V</span>
            <div>
              <strong>Vesta Assistant</strong>
              <span class="vchat-header__sub">Usually replies in a few seconds</span>
            </div>
          </div>
          <button class="vchat-header__close" type="button" aria-label="Close chat">&times;</button>
        </header>

        <div id="vchatBody" class="vchat-body"></div>

        <form id="vchatForm" class="vchat-form" autocomplete="off">
          <input id="vchatInput" type="text" placeholder="Ask about sofas, beds, delivery…" maxlength="500" />
          <button type="submit" class="vchat-send" aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
      </div>`;
    document.body.appendChild(root);

    document.getElementById('vchatToggle').addEventListener('click', () => toggle());
    root.querySelector('.vchat-header__close').addEventListener('click', () => toggle(false));

    const form = document.getElementById('vchatForm');
    const input = document.getElementById('vchatInput');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      send(v);
    });

    // Suggestion chips (delegated — they're re-rendered).
    document.getElementById('vchatBody').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-suggest]');
      if (chip) {
        send(chip.getAttribute('data-suggest'));
      }
    });

    render();
  }

  async function init() {
    // Probe the backend first — hide the widget if chatbot isn't configured.
    try {
      const base = (window.VestaAPI && window.VestaAPI.base) || '';
      const res = await fetch(`${base}/api/chat/health`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.configured) return;
    } catch (_) {
      return; // backend unreachable — don't render the widget
    }
    mount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
