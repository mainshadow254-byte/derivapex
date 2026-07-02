(function () {
  const translations = {
    en: {
      login: 'Log in',
      getStarted: 'Try Free Bot',
      eyebrow: 'OPEN EARLY ACCESS. LIVE SCANNER. DEMO FIRST.',
      headline: 'Build, scan, and test Deriv strategies without subscription limits.',
      lead: 'ApexBot is in open early access while billing and higher-capacity APIs are being prepared. Use the current builder, scanner, charts, bots, copy tools, and marketplace without a paid plan. No guaranteed profits and no hidden token handling.',
      tryBot: 'Try Free Bot',
      tryScanner: 'Open AI Scanner',
      joinSupport: 'Join / Support',
    },
    sw: {
      login: 'Ingia',
      getStarted: 'Jaribu Bot Bure',
      eyebrow: 'EARLY ACCESS WAZI. SCANNER LIVE. DEMO KWANZA.',
      headline: 'Jenga, scan, na jaribu mikakati ya Deriv bila mipaka ya subscription.',
      lead: 'ApexBot iko open early access wakati billing na API zenye uwezo mkubwa zinaandaliwa. Tumia builder, scanner, charts, bots, copy tools na marketplace bila plan ya kulipia. Hakuna faida iliyohakikishwa na tokeni hazifichwi frontend.',
      tryBot: 'Jaribu Bot Bure',
      tryScanner: 'Fungua AI Scanner',
      joinSupport: 'Jiunge / Support',
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

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function renderComingSoon() {
    const section = document.getElementById('plans');
    if (section) {
      const eyebrow = section.querySelector('.section-heading .eyebrow');
      const heading = section.querySelector('.section-heading h2');
      const paragraph = section.querySelector('.section-heading p');
      if (eyebrow) eyebrow.textContent = 'OPEN EARLY ACCESS';
      if (heading) heading.textContent = 'Subscriptions and payments are coming soon';
      if (paragraph) paragraph.textContent = 'All currently available tools are open while the platform, AI capacity, payment provider, and production limits are being completed.';
    }

    const grid = document.getElementById('plans-grid');
    if (!grid) return;
    grid.className = 'grid cols-2';
    grid.innerHTML = `
      <article class="card plan featured">
        <div class="eyebrow">OPEN EARLY ACCESS</div>
        <div class="price">Free for now</div>
        <p class="muted">Subscription enforcement is disabled while the platform, AI capacity, payments, and production trading integrations are being completed.</p>
        <ul class="plan-list">
          <li>Full authenticated AI scanner and chart reasoning</li>
          <li>Bot builder, imports, backtesting, and saved bots</li>
          <li>Copy-trading and marketplace tools</li>
          <li>Charts, analytics, alerts, and device controls</li>
        </ul>
        <a class="btn" href="auth.html">Enter early access</a>
      </article>
      <article class="card plan">
        <div class="eyebrow">PLANS & PAYMENTS</div>
        <div class="price">Coming Soon</div>
        <p class="muted">No payment is required now. Future plans will be published only after the required APIs, capacity limits, billing provider, and support flow are ready.</p>
        <ul class="plan-list">
          <li>No automatic charge</li>
          <li>No feature is currently locked by subscription</li>
          <li>Existing account and strategy data stay intact</li>
          <li>Trading risk never changes with a plan</li>
        </ul>
        <a class="btn ghost" href="support.html">Follow updates</a>
      </article>`;
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
        ? rows.map((market) => `<span><strong>${escapeHtml(market.symbol)}</strong> ${escapeHtml(market.direction || 'WAIT')} <small>${market.confidence == null ? '' : escapeHtml(market.confidence) + '% confidence'}</small></span>`).join('')
        : '<span>Live markets are warming up. Explore the builder while the scanner collects data.</span>';
    } catch {
      strip.innerHTML = '<span>Open early access remains available while the live market backend wakes up.</span>';
    }
  }

  renderComingSoon();
  loadTicker();
  setInterval(loadTicker, 20000);
})();
