(function(){
  const root = document.getElementById('copy-profile-root');
  const id = new URLSearchParams(location.search).get('id') || 'copy-ema-trend-lab';
  const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const backup = { id, name:'ApexBot Copy Preview', provider_name:'ApexBot Lab', category:'synthetic', symbol:'R_50', risk_score:50, trustLabel:'Demo preview only', followers:0, hasHistory:false, safeguards:['Capital allocation required','Max risk per trade required','Daily loss limit required','Pause/stop controls'], description:'Public preview of safe copy-trading controls.' };
  function draw(x){
    root.innerHTML = '<section class="loop-hero"><div class="card launch-highlight"><span class="eyebrow">COPY STRATEGY PROFILE</span><h1>'+e(x.name)+'</h1><p class="muted page-lead">'+e(x.description)+'</p><div class="hero-actions row"><a class="btn" href="auth.html">Sign up to compare</a><a class="btn ghost" href="free-bots.html">Open free bots</a><a class="btn ghost" href="guide.html#risk">Risk guide</a></div><div class="loop-kpis"><div class="loop-kpi"><small>Followers</small><strong>'+e(x.followers || 0)+'</strong></div><div class="loop-kpi"><small>Risk score</small><strong>'+e(x.risk_score ?? '—')+'</strong></div><div class="loop-kpi"><small>History</small><strong>'+(x.hasHistory ? 'Recorded' : 'Required')+'</strong></div></div></div><div class="card"><span class="eyebrow">FOLLOW STANDARD</span><div class="loop-flow" style="margin-top:10px"><div class="loop-flow-row"><b>1</b><div><strong>Inspect provider</strong><span>Never copy without visible controls.</span></div></div><div class="loop-flow-row"><b>2</b><div><strong>Set allocation</strong><span>Limit capital before follow.</span></div></div><div class="loop-flow-row"><b>3</b><div><strong>Set stop rules</strong><span>Daily loss and per-trade risk are required.</span></div></div></div></div></section><section class="section-block grid cols-2"><article class="card"><h2>Safeguards</h2><div class="safeguards">'+(x.safeguards || []).map((s)=>'<span>✓ '+e(s)+'</span>').join('')+'</div></article><article class="card"><h2>Honest stats policy</h2><p class="muted">No fake followers, no fake profit, and no fake win rate. Real rankings require backend trade records.</p><div class="risk-note">This preview is for product education until real provider history exists.</div></article></section>';
  }
  async function init(){
    if (window.DEMO) DEMO.mountChrome('demo-bots.html');
    let list = [backup];
    try { const r = await DEMO.get('/copy-preview'); if (r.strategies?.length) list = r.strategies; } catch {}
    draw(list.find((x)=>x.id===id) || list[0]);
  }
  init();
})();
