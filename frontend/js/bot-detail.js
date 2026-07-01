(function(){
  const root = document.getElementById('bot-detail-root');
  const id = new URLSearchParams(location.search).get('id') || 'over-under-guard';
  const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const build = (x) => 'bot-builder.html?' + new URLSearchParams({ template:x.template || 'ema', symbol:x.symbol || 'R_100', contract:x.contract_type || 'CALL' }).toString();
  function save(x){
    const data = { format:'apexbot-template-v1', demo_only:true, item:x, note:'Learning template. Test in demo first.' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (x.id || 'apexbot-template') + '.json'; a.click();
    URL.revokeObjectURL(url);
  }
  function draw(x){
    root.innerHTML = '<section class="loop-hero"><div class="card launch-highlight"><span class="eyebrow">BOT TEMPLATE</span><h1>'+e(x.title)+'</h1><p class="muted page-lead">'+e(x.why || x.description || 'Open this template in the builder and test it in demo.')+'</p><div class="hero-actions row"><a class="btn" href="'+build(x)+'">Open in builder</a><a class="btn ghost" href="demo-scanner.html?symbol='+encodeURIComponent(x.symbol || 'R_100')+'">Scan market</a><button id="save-template" class="btn ghost" type="button">Download JSON</button></div><div class="loop-kpis"><div class="loop-kpi"><small>Market</small><strong>'+e(x.symbol)+'</strong></div><div class="loop-kpi"><small>Contract</small><strong>'+e(x.contract_type)+'</strong></div><div class="loop-kpi"><small>Risk</small><strong>'+e(x.risk_rating || 'medium')+'</strong></div></div></div><div class="card"><span class="eyebrow">USE FLOW</span><div class="loop-flow" style="margin-top:10px"><div class="loop-flow-row"><b>1</b><div><strong>Open builder</strong><span>Edit market, signal, stake, and risk.</span></div></div><div class="loop-flow-row"><b>2</b><div><strong>Scan market</strong><span>Wait when scanner rejects the setup.</span></div></div><div class="loop-flow-row"><b>3</b><div><strong>Demo test</strong><span>No real trading from public demo pages.</span></div></div></div></div></section><section class="section-block grid cols-2"><article class="card"><h2>Best use</h2><p>'+e(x.bestFor || 'Demo learning')+'</p></article><article class="card"><h2>Avoid when</h2><p>'+e(x.avoidWhen || x.warning || 'Risk is unclear')+'</p></article></section><section class="section-block"><div class="card final-cta launch-highlight"><div><h2>Template warning</h2><p class="muted">'+e(x.warning || 'No template guarantees profit.')+'</p></div><div class="row"><a class="btn" href="'+build(x)+'">Open builder</a><a class="btn ghost" href="free-bots.html">All free bots</a></div></div></section>';
    document.getElementById('save-template').onclick = () => save(x);
  }
  async function init(){
    if (window.DEMO) DEMO.mountChrome('free-bots.html');
    let list = [];
    try { const r = await DEMO.get('/templates'); list = r.templates || []; } catch {}
    draw(list.find((x)=>x.id===id) || { id, title:'ApexBot Template', symbol:'R_100', contract_type:'CALL', risk_rating:'medium' });
  }
  init();
})();
