// Deriv onboarding helpers. OAuth is opened in a controlled popup so ApexBot
// stays visible while Deriv handles authentication on its own secure domain.
window.DerivOnboard = (function () {
  const OAUTH_MESSAGE = 'apex:deriv-oauth-result';

  async function affiliateUrl() {
    try {
      const cfg = await loadPublicConfig();
      return cfg?.derivAffiliateLink || '';
    } catch { return ''; }
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

  function popupFeatures() {
    const width = Math.min(520, Math.max(380, window.screen?.availWidth || 520));
    const height = Math.min(760, Math.max(620, window.screen?.availHeight || 760));
    const left = Math.max(0, Math.round((window.screenX || 0) + ((window.outerWidth || width) - width) / 2));
    const top = Math.max(0, Math.round((window.screenY || 0) + ((window.outerHeight || height) - height) / 2));
    return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
  }

  async function openOAuth(options = {}) {
    const trigger = options.trigger || null;
    const originalText = trigger?.textContent || '';
    if (trigger) {
      trigger.disabled = true;
      trigger.setAttribute('aria-busy', 'true');
      trigger.textContent = 'Opening Deriv…';
    }

    // Open synchronously before awaiting config so popup blockers do not block it.
    let popup = null;
    try { popup = window.open('about:blank', 'apexDerivOAuth', popupFeatures()); } catch {}

    try {
      const url = await oauthUrl();
      if (!popup || popup.closed) {
        // Reliable fallback for strict/mobile browsers. This remains same-tab rather
        // than target=_blank, and the callback returns to ApexBot.
        window.location.assign(url);
        return { mode: 'same-tab' };
      }

      try {
        popup.document.title = 'Connect Deriv — ApexBot';
        popup.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Opening secure Deriv sign in…</p>';
      } catch {}
      popup.location.replace(url);
      popup.focus();

      return await new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          clearInterval(closedPoll);
          clearTimeout(timeout);
          if (trigger) {
            trigger.disabled = false;
            trigger.removeAttribute('aria-busy');
            trigger.textContent = result?.ok ? 'Deriv connected' : originalText;
          }
          if (result?.ok) {
            window.dispatchEvent(new CustomEvent('apex:deriv-connected', { detail: result }));
          } else if (result?.error) {
            window.dispatchEvent(new CustomEvent('apex:deriv-oauth-error', { detail: result }));
          }
          resolve(result || { ok: false });
        };
        const onMessage = (event) => {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type !== OAUTH_MESSAGE) return;
          finish(event.data);
        };
        window.addEventListener('message', onMessage);
        const closedPoll = setInterval(() => {
          if (popup.closed) finish({ ok: false, cancelled: true });
        }, 500);
        const timeout = setTimeout(() => {
          try { if (!popup.closed) popup.close(); } catch {}
          finish({ ok: false, error: 'Deriv sign in timed out. Please try again.' });
        }, 5 * 60 * 1000);
      });
    } catch (error) {
      try { if (popup && !popup.closed) popup.close(); } catch {}
      if (trigger) {
        trigger.disabled = false;
        trigger.removeAttribute('aria-busy');
        trigger.textContent = originalText;
      }
      const result = { ok: false, error: error?.message || 'Could not open Deriv sign in.' };
      window.dispatchEvent(new CustomEvent('apex:deriv-oauth-error', { detail: result }));
      return result;
    }
  }

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
      if (el.tagName === 'A') el.href = url;
      el.removeAttribute('target');
      el.rel = 'noopener noreferrer';
      el.onclick = (event) => {
        event.preventDefault();
        openOAuth({ trigger: el });
      };
    });
  }

  function cardHTML(opts = {}) {
    const title = opts.title || 'Connect Your Deriv Account';
    const body = opts.body || 'To use real trading features, connect your Deriv account. ApexBot stays open while Deriv handles secure sign in, then the account returns here automatically.';
    const createText = opts.createText || 'Create Deriv Account';
    return `<div class="card" data-deriv-onboard style="border-color:#6366f1">
      <h3 style="margin-top:0">${title}</h3>
      <p class="muted" style="font-size:13px">${body}</p>
      <div id="deriv-oauth-warning" class="notice demo hidden" style="margin:10px 0"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        <a class="btn ghost" data-deriv-affiliate>${createText}</a>
        <a class="btn" data-deriv-oauth data-manual-text="Connect with API token">Connect Deriv Account</a>
      </div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">Deriv authentication is completed on Deriv's secure domain. API-token fallback remains available if a browser blocks the popup.</p>
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

  return { affiliateUrl, oauthUrl, openOAuth, wireAffiliate, wireOAuth, cardHTML, mount, OAUTH_MESSAGE };
})();
