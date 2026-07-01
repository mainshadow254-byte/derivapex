(function () {
  const translations = {
    en: {
      login: 'Log in',
      getStarted: 'Get started',
      eyebrow: 'BUILD. TEST. AUTOMATE.',
      headline: 'Build Deriv bots, scan live markets, and copy strategies safely.',
      lead: 'Create visual trading bots, test them in demo, inspect risk clearly, and connect real Deriv trading only when you are ready. ApexBot keeps secrets, roles, payments, and tokens on the backend.',
      createAccount: 'Create free account',
      tryDemo: 'Try the live demo',
    },
    sw: {
      login: 'Ingia',
      getStarted: 'Anza',
      eyebrow: 'JENGA. JARIBU. ENDESHA.',
      headline: 'Jenga bot za Deriv, chunguza masoko, na fuata mikakati kwa usalama.',
      lead: 'Tengeneza bot kwa blocks, jaribu kwenye demo, ona hatari wazi, kisha unganisha biashara halisi ya Deriv ukiwa tayari. ApexBot hulinda siri, roles, malipo, na tokeni kwenye backend.',
      createAccount: 'Fungua akaunti ya bure',
      tryDemo: 'Jaribu demo ya moja kwa moja',
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
    { plan: 'free', label: 'Free / Demo', price: 0, features: '$10K simulation, live charts, demo scanner' },
    { plan: 'starter', label: 'Starter', price: 10, features: 'Full AI scanner and real-time alerts' },
    { plan: 'standard', label: 'Standard', price: 20, features: 'Visual builder, backtesting, copy trading, bot imports' },
    { plan: 'premium', label: 'Premium', price: 30, features: 'Real trading through your connected Deriv account' },
    { plan: 'elite', label: 'Elite', price: 50, features: 'Priority alerts and higher operational limits' },
  ];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    grid.innerHTML = plans.map((p) => `<article class="card plan"><div class="eyebrow">${escapeHtml(p.label)}</div><div class="price">$${escapeHtml(p.price)}<span class="muted-sm">/mo</span></div><p class="muted">${escapeHtml(p.features || '')}</p><a class="btn ${Number(p.price) === 0 ? 'ghost' : ''}" href="auth.html">${Number(p.price) === 0 ? 'Start free' : 'Choose plan'}</a></article>`).join('');
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
      strip.innerHTML = '<span>Public demo available — live market analysis resumes when the backend is online.</span>';
    }
  }

  loadPlans();
  loadTicker();
  setInterval(loadTicker, 20000);
})();
