(function(){
  const wrap = document.getElementById('community-links');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function card(title, body, href, cta){
    return '<article class="card"><h3>'+esc(title)+'</h3><p class="muted">'+esc(body)+'</p>'+(href ? '<a class="btn" target="_blank" rel="noopener" href="'+esc(href)+'">'+esc(cta || 'Open')+'</a>' : '<span class="badge demo">Configure env</span>')+'</article>';
  }
  async function init(){
    if (window.DEMO) DEMO.mountChrome('community.html');
    let cfg = {};
    try { cfg = await loadPublicConfig(); } catch {}
    const t = cfg.telegram || {};
    wrap.innerHTML = [
      card('Telegram channel', 'Announcements, bot drops, platform updates.', t.community, 'Join channel'),
      card('Telegram group', 'Community discussion, questions, and strategy ideas.', t.secondaryCommunity, 'Join group'),
      card('Telegram bot', 'Quick commands, help, and account guidance.', t.bot, 'Open bot'),
      card('Support', 'Contact admin or support route configured by backend.', t.support, 'Contact support'),
      card('Request strategy', 'Tell ApexBot what market or bot you want next.', 'request-strategy.html', 'Request'),
      card('Tutorials', 'Learn the safe flow before connecting real trading.', 'tutorials.html', 'Learn'),
    ].join('');
  }
  init();
})();
