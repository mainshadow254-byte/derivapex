// Public DEMO helpers. NO authentication. Talks ONLY to /api/demo/* (guest-safe,
// read-only). Injects the persistent "DEMO MODE — SIMULATED DATA" banner and a
// shared demo nav. Demo pages NEVER place real trades.
window.DEMO = (function () {
  const BASE = window.APEX.API_BASE + '/demo';

  async function get(path) {
    const r = await fetch(`${BASE}${path}`);
    let body = null;
    try { body = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(body?.error || `Request failed (${r.status})`); e.status = r.status; e.body = body; throw e; }
    return body;
  }

  // Persistent demo banner + demo nav. Call once on each demo page.
  function mountChrome(active) {
    if (!document.getElementById('demo-banner')) {
      const b = document.createElement('div');
      b.id = 'demo-banner';
      b.className = 'demo-banner';
      b.textContent = 'DEMO MODE — SIMULATED DATA — NO REAL TRADES';
      document.body.prepend(b);
    }
    const nav = document.getElementById('demo-nav');
    if (nav) {
      const items = [
        ['free-bots.html', 'Free Bots'],
        ['demo-dashboard.html', 'Dashboard'],
        ['demo-bots.html', 'Bots & Copy'],
        ['demo-scanner.html', 'AI Scanner'],
        ['demo-terminal.html', 'Charts'],
        ['demo-markets.html', 'Markets'],
        ['guide.html', 'Guide'],
      ];
      nav.innerHTML = items.map(([href, label]) =>
        `<a class="btn ${href === active ? '' : 'ghost'}" href="${href}">${label}</a>`).join('') +
        `<a class="btn ok" href="auth.html">Sign up for real tools</a>`;
    }
  }

  return { get, mountChrome };
})();
