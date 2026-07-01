(function(){
  const wrap = document.getElementById('proof-status');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function statusCard(label, value, note){ return '<div class="status-card"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span class="muted-sm">'+esc(note || '')+'</span></div>'; }
  async function init(){
    if (window.DEMO) DEMO.mountChrome('proof.html');
    let demo = {}; let cfg = {};
    try { demo = await DEMO.get('/status'); } catch {}
    try { cfg = await loadPublicConfig(); } catch {}
    const t = cfg.telegram || {};
    wrap.innerHTML = [
      statusCard('Backend', demo.backend ? 'Online' : 'Fallback', 'Public demo status'),
      statusCard('Free bots', demo.botTemplates || 8, 'Templates visible'),
      statusCard('Copy previews', demo.copyPreviews || 4, 'Safeguard cards'),
      statusCard('Market feed', demo.marketFeed?.status || 'warming-up', 'Live data readiness'),
      statusCard('Deriv OAuth', cfg.derivOAuthReady ? 'Configured' : 'Needs setup', cfg.derivOAuthIssue || 'Uses backend public config'),
      statusCard('Community', (t.community || t.secondaryCommunity || t.support) ? 'Configured' : 'Needs links', 'Telegram/support env'),
    ].join('');
  }
  init();
})();
