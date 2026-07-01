(function () {
  const translations = {
    en: {
      login: 'Log in',
      getStarted: 'Open demo',
      eyebrow: 'FREE BOTS. LIVE SCANNER. SAFE DEMO.',
      headline: 'Free Deriv bots, AI scanner, copy trading, and safe demo testing.',
      lead: 'Start with ready bot templates, inspect live Deriv market conditions, test everything in demo, then connect real trading only when you understand the risk. No fake profits, no hidden token handling, no blind automation.',
      tryBot: 'Try free bot templates',
      tryScanner: 'Open AI scanner',
      joinSupport: 'Join / support',
    },
    sw: {
      login: 'Ingia',
      getStarted: 'Fungua demo',
      eyebrow: 'BOTI BURE. SCANNER LIVE. DEMO SALAMA.',
      headline: 'Bot za Deriv za bure, AI scanner, copy trading, na demo salama.',
      lead: 'Anza na templates tayari, angalia hali ya soko la Deriv live, jaribu kila kitu kwenye demo, kisha unganisha real trading ukielewa hatari. Hakuna faida za uongo, hakuna tokeni frontend, hakuna automation ya kubahatisha.',
      tryBot: 'Jaribu templates za bot',
      tryScanner: 'Fungua AI scanner',
      joinSupport: 'Jiunge / support',
    },
  };

  const lang = document.getElementById('language');
  function setLanguage(code) {
    const dict = translations[code] || translations.en;
    document.documentElement.lang = code;
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      if (dict[node.dataset.i18n]) node.textContent = dict[node.dataset.i18n];
    });
    try { localStorage.setItem('apex_language', code); } catch {}
  }

  if (lang) {
    try { lang.value = localStorage.getItem('apex_language') || 'en'; } catch {}
    setLanguage(lang.value);
    lang.onchange = () => setLanguage(lang.value);
  }

  const FALLBACK = [
    { plan: 'free', label: 'Free / Demo', price: 0, currency: 'USD', features: ['No-login demo dashboard', 'Free starter bot templates', 'Live charts and demo scanner'] },
    { plan: 'starter', label: 'Starter', price: 10, currency: 'USD', features: ['Full AI scanner', 'Real-time alerts', 'Watchlists and notifications'] },
    { plan: 'standard', label: 'Standard', price: 20, currency: 'USD', features: ['Visual builder', 'Bot imports', 'Copy trading access'] },
    { plan: 'premium', label: 'Premium', price: 30, currency: 'USD', features: ['Real trading permissions', 'Connected Deriv account tools', 'Marketplace installs'] },
    { plan: 'elite', label: 'Elite', price: 50, currency: 'USD', features: ['Priority alerts', 'Higher operational limits', 'Advanced copy publishing'] },
  ];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function normalizeFeatures(features) {
    if (Array.isArray(features)) return features.filter(Boolean);
    if (!features) return [];
    return String(features)
      .split(/[|;,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  function displayPrice(plan) {
    const price = Number(plan.price || 0);
    if (!price) return 'Free';
    const currency = String(plan.currency || 'USD').toUpperCase();
    if (currency === 'USD') return `$${price}`;
    return `${currency} ${price.toLocaleString()}`;
  }

  async function loadPlans() {
    const grid = document.getElementById('plans-grid');
    if (!grid) return;
    let plans = FALLBACK;
    try {
      if (!window.PocketBase) throw new Error('PocketBase SDK unavailable');
      const pb = new PocketBase(window.APEX.POCKETBASE_URL);
      const records = await pb.collection('plans').getFullList({ sort: 'price' });
      if (records.length) plans = records;
    } catch {}
    grid.innerHTML = plans.map((p) => {
      const price = Number(p.price || 0);
      const features = normalizeFeatures(p.features);
      const isFeatured = ['standard', 'premium', 'pro'].includes(String(p.plan || p.code || p.label || '').toLowerCase());
      const featureHtml = features.length
        ? `<ul class="plan-list">${features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
        : '<p class="muted">Tool access is controlled by your verified backend subscription.</p>';
      return `<article class="card plan ${isFeatured ? 'featured' : ''}">
        <div class="eyebrow">${escapeHtml(p.label || p.name || p.plan || 'Plan')}</div>
        <div class="plan-code">${escapeHtml(p.plan || p.code || '')}</div>
        <div class="price">${escapeHtml(displayPrice(p))}${price ? '<span class="muted-sm">/mo</span>' : ''}</div>
        ${featureHtml}
        <a class="btn ${price === 0 ? 'ghost' : ''}" href="auth.html">${price === 0 ? 'Start free' : 'Choose plan'}</a>
      </article>`;
    }).join('');
  }

  async function loadTicker() {
    const strip = document.getElementById('market-strip');
    if (!strip) return;
    try {
      const response = await fetch(`${window.APEX.API_BASE}/demo/scan`);
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      const rows = (data.markets || []).slice(0, 8);
      strip.innerHTML = rows.length
        ? rows.map((m) => `<span><strong>${escapeHtml(m.symbol)}</strong> ${escapeHtml(m.direction || 'WAIT')} <small>${m.confidence == null ? '' : escapeHtml(m.confidence) + '% confidence'}</small></span>`).join('')
        : '<span>Live markets are warming up. The scanner waits for enough data instead of inventing signals.</span>';
    } catch {
      strip.innerHTML = '<span>Public demo available — free bot templates, demo scanner, and charts can still be explored when the backend is waking up.</span>';
    }
  }

  loadPlans();
  loadTicker();
  setInterval(loadTicker, 20000);
})();
