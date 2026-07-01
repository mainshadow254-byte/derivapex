(function(){
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const $ = (id)=>document.getElementById(id);
  const riskBadge = (r)=>`<span class="badge ${r==='high'?'warn':r==='medium'?'demo':'real'}">${esc(r || 'medium')} risk</span>`;

  function fallbackTemplates(){
    return [
      { id:'over-under-guard', template:'over', title:'Over/Under Guard', category:'Digits', symbol:'R_100', contract_type:'DIGITOVER', risk_rating:'medium', stake:1, duration:'1 tick', readiness:86, blocks:['Trade Parameters','Prediction Digit','Purchase Conditions','Restart Conditions','Risk Management'], why:'Starter template for learning digit prediction with visible risk controls.', warning:'Digit streaks do not predict the future.' },
      { id:'even-odd-rhythm', template:'even', title:'Even/Odd Rhythm', category:'Digits', symbol:'R_75', contract_type:'DIGITEVEN', risk_rating:'medium', stake:1, duration:'1 tick', readiness:84, blocks:['Trade Parameters','Prediction Digit','Purchase Conditions','Restart Conditions','Risk Management'], why:'Even/Odd template for demo testing simple digit logic.', warning:'Avoid increasing stake after losses.' },
      { id:'ema-rise-fall', template:'ema', title:'EMA Rise/Fall', category:'Trend', symbol:'R_50', contract_type:'CALL', risk_rating:'low', stake:1, duration:'5 ticks', readiness:90, blocks:['Trade Parameters','EMA Cross','Purchase Conditions','Restart Conditions','Risk Management'], why:'Readable trend structure that can be checked against the chart.', warning:'Trend logic can fail in choppy markets.' },
      { id:'boom-crash-guard', template:'boom', title:'Boom/Crash Guard', category:'Volatility', symbol:'BOOM500', contract_type:'CALL', risk_rating:'high', stake:.5, duration:'5 ticks', readiness:78, blocks:['Trade Parameters','Volatility Filter','Purchase Conditions','Profit Target','Risk Management'], why:'High-caution Boom/Crash starter with filters visible first.', warning:'Boom/Crash spikes can invalidate calm demo runs.' },
      { id:'ai-approval-gate', template:'ai', title:'AI Approval Gate', category:'AI Filter', symbol:'R_25', contract_type:'CALL', risk_rating:'medium', stake:1, duration:'3 ticks', readiness:82, blocks:['Trade Parameters','AI Signal','AI Trend Filter','AI Approval','Risk Management'], why:'Shows AI as an approval gate, not a guarantee.', warning:'AI analysis is not certainty.' },
    ];
  }

  function fallbackCopy(){
    return [
      { id:'copy-safe-trend-demo', name:'Safe Trend Demo', provider_name:'ApexBot Lab', category:'trend', symbol:'R_50', risk_score:42, maxDrawdown:6.8, followers:0, hasHistory:false, trustLabel:'Demo preview only', safeguards:['Capital allocation required','Max risk per trade required','Daily loss limit required','Pause/stop controls'], description:'Preview of a transparent copy profile before real follower stats exist.' },
      { id:'copy-digit-discipline-demo', name:'Digit Discipline Demo', provider_name:'ApexBot Lab', category:'digits', symbol:'R_100', risk_score:58, maxDrawdown:9.4, followers:0, hasHistory:false, trustLabel:'Demo preview only', safeguards:['No martingale by default','Hard daily loss limit','Trade count cap','Ledger stats required before ranking'], description:'Shows the risk controls that must be visible before copying anyone.' },
    ];
  }

  function openBuilderUrl(t){
    const q = new URLSearchParams({ template:t.template || 'ema', symbol:t.symbol || 'R_100', contract:t.contract_type || 'CALL' });
    return `bot-builder.html?${q.toString()}`;
  }

  function templateCard(t){
    return `<article class="card template-card-pro" data-cat="${esc(t.category)}" data-risk="${esc(t.risk_rating)}">
      <div class="template-head"><div><small>${esc(t.category)}</small><h3>${esc(t.title)}</h3></div>${riskBadge(t.risk_rating)}</div>
      <p class="muted">${esc(t.why)}</p>
      <div class="template-score">
        <div><small>Readiness</small><strong>${esc(t.readiness)}%</strong></div>
        <div><small>Contract</small><strong>${esc(t.contract_type)}</strong></div>
        <div><small>Market</small><strong>${esc(t.symbol)}</strong></div>
        <div><small>Stake</small><strong>${esc(t.stake)}</strong></div>
      </div>
      <div class="block-list">${(t.blocks||[]).map((b)=>`<span>${esc(b)}</span>`).join('')}</div>
      <div class="risk-note">${esc(t.warning)}</div>
      <div class="bot-actions"><a class="btn" href="${openBuilderUrl(t)}">Open in builder</a><a class="btn ghost" href="demo-scanner.html">Scan market</a></div>
    </article>`;
  }

  function copyCard(s){
    return `<article class="card copy-preview-card">
      <div class="row between"><div><small>${esc(s.category)}</small><h3 style="margin:0">${esc(s.name)}</h3></div><span class="badge demo">${esc(s.trustLabel || 'Preview')}</span></div>
      <p class="muted">${esc(s.description)}</p>
      <div class="template-score">
        <div><small>Followers</small><strong>${esc(s.followers ?? 0)}</strong></div>
        <div><small>Risk score</small><strong>${esc(s.risk_score ?? '—')}</strong></div>
        <div><small>Max DD</small><strong>${esc(s.maxDrawdown ?? '—')}%</strong></div>
        <div><small>History</small><strong>${s.hasHistory ? 'Recorded' : 'Required'}</strong></div>
      </div>
      <div class="safeguards">${(s.safeguards||[]).map((x)=>`<span>✓ ${esc(x)}</span>`).join('')}</div>
      <div class="risk-note">Real copy rankings should use recorded backend trade history only. No fake profits or fake followers.</div>
      <div class="bot-actions"><a class="btn ghost" href="auth.html">Sign up to compare</a><a class="btn ghost" href="guide.html#risk">Risk guide</a></div>
    </article>`;
  }

  function renderStatus(status){
    const wrap = $('demo-status'); if (!wrap) return;
    const feed = status?.marketFeed || {};
    wrap.innerHTML = `<div class="status-grid">
      <div class="status-card"><small>Backend</small><strong>${status?.backend ? 'Online' : 'Demo fallback'}</strong></div>
      <div class="status-card"><small>Tracked markets</small><strong>${esc(feed.tracked ?? '—')}</strong></div>
      <div class="status-card"><small>Ready markets</small><strong>${esc(feed.ready ?? '—')}</strong></div>
      <div class="status-card"><small>Feed status</small><strong>${esc(feed.status || 'warming-up')}</strong></div>
    </div>
    <div class="trust-list" style="margin-top:12px">${(status?.trust || []).map((x)=>`<span>${esc(x)}</span>`).join('')}</div>`;
  }

  function setupFilters(templates){
    const cat = $('template-category');
    const risk = $('template-risk');
    const q = $('template-search');
    const render = ()=>{
      const text = (q?.value || '').toLowerCase();
      const c = cat?.value || '';
      const r = risk?.value || '';
      const rows = templates.filter((t)=>
        (!c || t.category === c) && (!r || t.risk_rating === r) && (!text || `${t.title} ${t.category} ${t.symbol} ${t.contract_type}`.toLowerCase().includes(text))
      );
      $('template-list').innerHTML = rows.length ? rows.map(templateCard).join('') : '<div class="empty-upgrade">No templates match this filter.</div>';
    };
    [cat,risk,q].forEach((x)=> x && x.addEventListener('input', render));
    render();
  }

  async function init(){
    if (window.DEMO) DEMO.mountChrome('demo-bots.html');
    let templates = fallbackTemplates();
    let copy = fallbackCopy();
    try {
      const status = await DEMO.get('/status');
      renderStatus(status);
    } catch {
      renderStatus({ backend:false, marketFeed:{ status:'fallback' }, trust:['No public demo page places real trades','Templates are learning structures','Real stats must come from backend records'] });
    }
    try { const r = await DEMO.get('/templates'); if (r.templates?.length) templates = r.templates; } catch {}
    try { const r = await DEMO.get('/copy-preview'); if (r.strategies?.length) copy = r.strategies; } catch {}
    setupFilters(templates);
    $('copy-preview-list').innerHTML = copy.map(copyCard).join('');
  }

  init();
})();
