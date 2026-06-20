(function () {
  const translations = {
    en: { login:'Log in', getStarted:'Get started', eyebrow:'BUILD. TEST. UNDERSTAND.', headline:'Automate trading ideas without hiding the risk.', lead:'Build a strategy visually, backtest it on real historical Deriv candles, inspect every simulated trade, and move to demo or real tools only when you are ready.', createAccount:'Create free account', tryDemo:'Try the live demo' },
    sw: { login:'Ingia', getStarted:'Anza', eyebrow:'JENGA. JARIBU. ELEWA.', headline:'Geuza mawazo ya biashara bila kuficha hatari.', lead:'Jenga mkakati kwa picha, ujaribu kwa data ya kihistoria ya Deriv, kagua kila biashara ya majaribio, kisha uendelee ukiwa tayari.', createAccount:'Fungua akaunti ya bure', tryDemo:'Jaribu demo ya moja kwa moja' },
  };
  const lang = document.getElementById('language');
  function setLanguage(code) {
    const dict = translations[code] || translations.en;
    document.documentElement.lang = code;
    document.querySelectorAll('[data-i18n]').forEach((node) => { if (dict[node.dataset.i18n]) node.textContent = dict[node.dataset.i18n]; });
    try { localStorage.setItem('apex_language', code); } catch {}
  }
  try { lang.value = localStorage.getItem('apex_language') || 'en'; } catch {}
  setLanguage(lang.value);
  lang.onchange = () => setLanguage(lang.value);

  const FALLBACK = [
    { plan:'free', label:'Free / Demo', price:0, features:'$10K simulation, live charts, demo scanner' },
    { plan:'starter', label:'Starter', price:10, features:'Full AI scanner and real-time alerts' },
    { plan:'standard', label:'Standard', price:20, features:'Visual builder, backtesting, copy trading, bot imports' },
    { plan:'premium', label:'Premium', price:30, features:'Real trading through your connected Deriv account' },
    { plan:'elite', label:'Elite', price:50, features:'Priority alerts and higher operational limits' },
  ];
  async function loadPlans() {
    let plans = FALLBACK;
    try {
      const pb = new PocketBase(window.APEX.POCKETBASE_URL);
      const records = await pb.collection('plans').getFullList({ sort:'price' });
      if (records.length) plans = records;
    } catch {}
    document.getElementById('plans-grid').innerHTML = plans.map((p) => `<article class="card plan"><div class="eyebrow">${p.label}</div><div class="price">$${p.price}<span class="muted-sm">/mo</span></div><p class="muted">${p.features || ''}</p><a class="btn ${Number(p.price) === 0 ? 'ghost' : ''}" href="auth.html">${Number(p.price) === 0 ? 'Start free' : 'Choose plan'}</a></article>`).join('');
  }
  async function loadTicker() {
    const strip = document.getElementById('market-strip');
    try {
      const response = await fetch(`${window.APEX.API_BASE}/demo/scan`);
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      const rows = (data.markets || []).slice(0, 8);
      strip.innerHTML = rows.length ? rows.map((m) => `<span><strong>${m.symbol}</strong> ${m.direction || 'WAIT'} <small>${m.confidence == null ? '' : m.confidence + '% confidence'}</small></span>`).join('') : '<span>Live markets are warming up. The scanner waits for enough data instead of inventing signals.</span>';
    } catch { strip.innerHTML = '<span>Public demo available - live market analysis resumes when the backend is online.</span>'; }
  }
  loadPlans(); loadTicker(); setInterval(loadTicker, 20000);
})();
