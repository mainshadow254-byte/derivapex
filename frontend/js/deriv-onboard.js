// Deriv onboarding helpers. The affiliate/referral link is PUBLIC-SAFE and is
// loaded from GET /api/public-config (never hardcoded across pages, never a
// secret). Provides:
//   DerivOnboard.wireAffiliate(scope)  -> turn [data-deriv-affiliate] elements
//                                         into new-tab links to the affiliate URL
//   DerivOnboard.wireOAuth(scope)      -> turn [data-deriv-oauth] elements into
//                                         official Deriv OAuth authorize links
//   DerivOnboard.cardHTML(opts)        -> the "Connect Your Deriv Account" card
//   DerivOnboard.mount(container,opts) -> insert the card + wire its buttons
window.DerivOnboard = (function () {
  async function affiliateUrl() {
    try {
      const cfg = await loadPublicConfig();
      return cfg?.derivAffiliateLink || '';
    }
    catch { return ''; }
  }

  async function oauthUrl() {
    try {
      const cfg = await loadPublicConfig();
      const base = cfg?.derivOAuthUrl || `https://oauth.deriv.com/oauth2/authorize?app_id=${encodeURIComponent(cfg?.derivAppId || '1089')}`;
      const url = new URL(base, window.location.origin);
      if (!url.searchParams.get('app_id')) url.searchParams.set('app_id', cfg?.derivAppId || '1089');
      const redirect = cfg?.derivOAuthRedirect || window.APEX?.DERIV_CALLBACK_URL || `${window.location.origin}/deriv-callback.html`;
      if (redirect && !url.searchParams.get('redirect_uri')) url.searchParams.set('redirect_uri', redirect);
      return url.toString();
    } catch {
      return `https://oauth.deriv.com/oauth2/authorize?app_id=1089&redirect_uri=${encodeURIComponent(window.APEX?.DERIV_CALLBACK_URL || `${window.location.origin}/deriv-callback.html`)}`;
    }
  }

  // Wire every element marked [data-deriv-affiliate] within `scope` (default: document).
  // If no affiliate link is configured, those elements are hidden (no broken links).
  async function wireAffiliate(scope) {
    const root = scope || document;
    const els = root.querySelectorAll('[data-deriv-affiliate]');
    if (!els.length) return;
    const url = await affiliateUrl();
    els.forEach((el) => {
      if (!url) { el.style.display = 'none'; return; }
      if (el.tagName === 'A') {
        el.href = url; el.target = '_blank'; el.rel = 'noopener noreferrer';
      } else {
        el.onclick = () => window.open(url, '_blank', 'noopener');
      }
    });
  }

  async function wireOAuth(scope) {
    const root = scope || document;
    const els = root.querySelectorAll('[data-deriv-oauth]');
    if (!els.length) return;
    const url = await oauthUrl();
    els.forEach((el) => {
      if (el.tagName === 'A') {
        el.href = url; el.rel = 'noopener noreferrer';
      } else {
        el.onclick = () => { location.href = url; };
      }
    });
  }

  // The standard Deriv onboarding card. `opts.title`, `opts.body` optional.
  function cardHTML(opts = {}) {
    const title = opts.title || 'Connect Your Deriv Account';
    const body = opts.body || 'To use real trading features, connect your Deriv account. If you don\u2019t have one, create one first using the button below, then return here and connect.';
    const createText = opts.createText || 'Create Deriv Account';
    return `<div class="card" data-deriv-onboard style="border-color:#6366f1">
      <h3 style="margin-top:0">${title}</h3>
      <p class="muted" style="font-size:13px">${body}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        <a class="btn ghost" data-deriv-affiliate>${createText}</a>
        <a class="btn" data-deriv-oauth>Connect Deriv Account</a>
      </div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">If Deriv login shows a 403 page, open the connect page and use the API-token fallback while the Deriv app ID is being updated.</p>
    </div>`;
  }

  function mount(container, opts = {}) {
    if (!container) return;
    container.innerHTML = cardHTML(opts) + (container.innerHTML || '');
    wireAffiliate(container);
    wireOAuth(container);
  }

  return { affiliateUrl, oauthUrl, wireAffiliate, wireOAuth, cardHTML, mount };
})();
