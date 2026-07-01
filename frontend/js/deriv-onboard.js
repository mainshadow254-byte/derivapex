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
    const cfg = await loadPublicConfig();
    if (!cfg?.derivOAuthReady) {
      const fallback = new URL('deriv-callback.html', window.location.origin);
      fallback.searchParams.set('manual', '1');
      fallback.searchParams.set('reason', cfg?.derivOAuthIssue || 'Deriv OAuth is not configured yet.');
      return fallback.toString();
    }
    const appId = cfg?.derivOAuthAppId || cfg?.derivAppId || '1089';
    const base = cfg?.derivOAuthUrl || `https://oauth.deriv.com/oauth2/authorize?app_id=${encodeURIComponent(appId)}`;
    const url = new URL(base, window.location.origin);
    url.searchParams.set('app_id', url.searchParams.get('app_id') || appId);
    const redirect = cfg?.derivOAuthRedirect || window.APEX?.DERIV_CALLBACK_URL || `${window.location.origin}/deriv-callback.html`;
    if (redirect) url.searchParams.set('redirect_uri', redirect);
    return url.toString();
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
    const cfg = await loadPublicConfig().catch(() => ({}));
    const url = await oauthUrl();
    els.forEach((el) => {
      if (!cfg?.derivOAuthReady) {
        el.textContent = el.dataset.manualText || 'Connect with API token';
        el.title = cfg?.derivOAuthIssue || 'Deriv OAuth is not configured yet.';
      }
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
    const body = opts.body || 'To use real trading features, connect your Deriv account. If you don’t have one, create one first using the button below, then return here and connect.';
    const createText = opts.createText || 'Create Deriv Account';
    return `<div class="card" data-deriv-onboard style="border-color:#6366f1">
      <h3 style="margin-top:0">${title}</h3>
      <p class="muted" style="font-size:13px">${body}</p>
      <div id="deriv-oauth-warning" class="notice demo hidden" style="margin:10px 0"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        <a class="btn ghost" data-deriv-affiliate>${createText}</a>
        <a class="btn" data-deriv-oauth data-manual-text="Connect with API token">Connect Deriv Account</a>
      </div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">OAuth requires your own Deriv app ID and redirect URL. If it is not configured, use the API-token fallback; the backend verifies and encrypts the token.</p>
    </div>`;
  }

  async function mount(container, opts = {}) {
    if (!container) return;
    container.innerHTML = cardHTML(opts) + (container.innerHTML || '');
    const cfg = await loadPublicConfig().catch(() => ({}));
    const warning = container.querySelector('#deriv-oauth-warning');
    if (warning && !cfg?.derivOAuthReady) {
      warning.textContent = cfg?.derivOAuthIssue || 'Deriv OAuth is not configured yet. API-token fallback is available.';
      warning.classList.remove('hidden');
    }
    wireAffiliate(container);
    wireOAuth(container);
  }

  return { affiliateUrl, oauthUrl, wireAffiliate, wireOAuth, cardHTML, mount };
})();
