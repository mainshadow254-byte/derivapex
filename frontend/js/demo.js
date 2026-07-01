window.DEMO = (function () {
  const BASE = window.APEX.API_BASE + '/demo';
  async function get(path) {
    const r = await fetch(`${BASE}${path}`);
    let body = null;
    try { body = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(body?.error || `Request failed (${r.status})`); e.status = r.status; e.body = body; throw e; }
    return body;
  }
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
        ['tutorials.html', 'Tutorials'],
        ['request-strategy.html', 'Request'],
        ['guide.html', 'Guide'],
      ];
      nav.innerHTML = items.map(([href, label]) => `<a class="btn ${href === active ? '' : 'ghost'}" href="${href}">${label}</a>`).join('') + `<a class="btn ok" href="auth.html">Sign up</a>`;
    }
  }
  return { get, mountChrome };
})();
