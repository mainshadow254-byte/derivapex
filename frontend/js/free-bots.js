(function(){
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const $ = (id) => document.getElementById(id);

  function fallbackTemplates(){
    return [
      { id:'over-under-guard', template:'over', title:'Over/Under Guard', category:'Digits', symbol:'R_100', contract_type:'DIGITOVER', risk_rating:'medium', stake:1, duration:'1 tick', readiness:88, bestFor:'Learning Over/Under structure on synthetic digits', avoidWhen:'Avoid during long losing streaks or high volatility.', why:'Digit starter with visible prediction, stake, restart, and risk controls.', warning:'Digit streaks do not predict the future.' },
      { id:'even-odd-rhythm', template:'even', title:'Even/Odd Rhythm', category:'Digits', symbol:'R_75', contract_type:'DIGITEVEN', risk_rating:'medium', stake:1, duration:'1 tick', readiness:85, bestFor:'Practicing Even/Odd rules', avoidWhen:'Avoid raising stake after losses.', why:'Simple Even/Odd structure for demo testing.', warning:'Avoid martingale until you understand drawdown.' },
      { id:'ema-rise-fall', template:'ema', title:'EMA Rise/Fall', category:'Trend', symbol:'R_50', contract_type:'CALL', risk_rating:'low', stake:1, duration:'5 ticks', readiness:91, bestFor:'Trend-following with chart confirmation', avoidWhen:'Avoid sideways chop.', why:'Readable EMA structure for Rise/Fall testing.', warning:'Trend logic can fail in choppy markets.' },
      { id:'rsi-reversal-lab', template:'rsi', title:'RSI Reversal Lab', category:'Trend', symbol:'R_25', contract_type:'PUT', risk_rating:'medium', stake:1, duration:'5 ticks', readiness:84, bestFor:'Testing reversal ideas in demo', avoidWhen:'Avoid strong trends.', why:'Mean-reversion template with risk controls.', warning:'RSI is not a reversal guarantee.' },
      { id:'boom-500-guard', template:'boom', title:'Boom 500 Guard', category:'Volatility', symbol:'BOOM500', contract_type:'CALL', risk_rating:'high', stake:.5, duration:'5 ticks', readiness:79, bestFor:'Learning Boom spike caution', avoidWhen:'Avoid after large spikes or high warnings.', why:'Risk-first Boom 500 structure.', warning:'Boom/Crash is advanced/high risk.' },
      { id:'crash-500-guard', template:'boom', title:'Crash 500 Guard', category:'Volatility', symbol:'CRASH500', contract_type:'PUT', risk_rating:'high', stake:.5, duration:'5 ticks', readiness:78, bestFor:'Crash spike awareness', avoidWhen:'Avoid when scanner rejects setup.', why:'Crash learner template with strict limits.', warning:'Stay in demo until spike behavior is clear.' },
      { id:'step-index-discipline', template:'ema', title:'Step Index Discipline', category:'Step', symbol:'stpRNG', contract_type:'CALL', risk_rating:'medium', stake:1, duration:'5 ticks', readiness:82, bestFor:'Strict trade count and trend filters', avoidWhen:'Avoid low-confidence flat conditions.', why:'Capped-trade structure for slower synthetic conditions.', warning:'Do not force trades when scanner says wait.' },
      { id:'ai-approval-gate', template:'ai', title:'AI Approval Gate', category:'AI Filter', symbol:'R_25', contract_type:'CALL', risk_rating:'medium', stake:1, duration:'3 ticks', readiness:83, bestFor:'Using scanner/AI as a gate', avoidWhen:'Avoid when AI explanation is uncertain.', why:'AI confirmation gate, not automatic profit logic.', warning:'AI is analysis, not certainty.' },
    ];
  }

  function fallbackCopy(){
    return [
      { id:'copy-ema-trend-lab', name:'EMA Trend Lab', provider_name:'ApexBot Lab', category:'synthetic', symbol:'R_50', risk_score:42, trustLabel:'Demo preview only', followers:0, hasHistory:false, safeguards:['Capital allocation required','Max risk per trade required','Daily loss limit required','Pause/stop controls'], description:'Provider-style preview for a trend-following copy strategy.' },
      { id:'copy-digit-discipline-demo', name:'Digit Discipline Demo', provider_name:'ApexBot Lab', category:'synthetic', symbol:'R_100', risk_score:58, trustLabel:'Demo preview only', followers:0, hasHistory:false, safeguards:['No martingale by default','Hard daily loss limit','Trade count cap','Ledger stats required before ranking'], description:'Shows risk controls before copying digit ideas.' },
      { id:'copy-boom-crash-guard', name:'Boom/Crash Guard Preview', provider_name:'ApexBot Lab', category:'synthetic', symbol:'BOOM500', risk_score:72, trustLabel:'High-risk preview', followers:0, hasHistory:false, safeguards:['Advanced-risk label visible','Auto-stop daily loss required','Manual review before follow','No fake win rate'], description:'High-risk copy preview with warnings before performance.' },
      { id:'copy-ai-confirmation-gate', name:'AI Confirmation Gate', provider_name:'ApexBot Lab', category:'mixed', symbol:'R_25', risk_score:49, trustLabel:'Demo preview only', followers:0, hasHistory:false, safeguards:['AI is advisory only','Scanner rejection respected','Risk limits required','No auto-follow without approval'], description:'Copy preview that waits for scanner confirmation.' },
    ];
  }

  const riskClass = (risk) => risk === 'high' ? 'warn' : risk === 'low' ? 'real' : 'demo';
  const builderUrl = (bot) => `bot-builder.html?${new URLSearchParams({ template:bot.template || 'ema', symbol:bot.symbol || 'R_100', contract:bot.contract_type || 'CALL' }).toString()}`;
  const scannerUrl = (bot) => `demo-scanner.html?symbol=${encodeURIComponent(bot.symbol || 'R_100')}`;

  function botCard(bot){
    return `<article class="card template-card-pro" data-category="${esc(bot.category)}" data-risk="${esc(bot.risk_rating)}">
      <div class="template-head"><div><small>${esc(bot.category)}</small><h3>${esc(bot.title)}</h3></div><span class="badge ${riskClass(bot.risk_rating)}">${esc(bot.risk_rating)} risk</span></div>
      <p class="muted">${esc(bot.why)}</p>
      <div class="template-score">
        <div><small>Market</small><strong>${esc(bot.symbol)}</strong></div>
        <div><small>Contract</small><strong>${esc(bot.contract_type)}</strong></div>
        <div><small>Readiness</small><strong>${esc(bot.readiness)}%</strong></div>
        <div><small>Stake</small><strong>${esc(bot.stake)}</strong></div>
      </div>
      <div class="builder-summary-list">
        <div class="builder-summary-row"><span>Best for</span><b>${esc(bot.bestFor || 'Demo learning')}</b></div>
        <div class="builder-summary-row"><span>Avoid when</span><b>${esc(bot.avoidWhen || bot.warning || 'Risk is unclear')}</b></div>
      </div>
      <div class="block-list">${(bot.blocks || []).map((b)=>`<span>${esc(b)}</span>`).join('')}</div>
      <div class="risk-note">${esc(bot.warning)}</div>
      <div class="bot-actions"><a class="btn" href="${builderUrl(bot)}">Open in builder</a><a class="btn ghost" href="${scannerUrl(bot)}">Scan market</a><a class="btn ghost" href="demo-dashboard.html">Demo test</a></div>
    </article>`;
  }

  function copyCard(strategy){
    return `<article class="card copy-preview-card">
      <div class="row between"><div><small>${esc(strategy.category)}</small><h3 style="margin:0">${esc(strategy.name)}</h3></div><span class="badge demo">${esc(strategy.trustLabel || 'Preview')}</span></div>
      <p class="muted">${esc(strategy.description)}</p>
      <div class="template-score"><div><small>Followers</small><strong>${esc(strategy.followers ?? 0)}</strong></div><div><small>Risk score</small><strong>${esc(strategy.risk_score ?? '—')}</strong></div><div><small>History</small><strong>${strategy.hasHistory ? 'Recorded' : 'Required'}</strong></div><div><small>Symbol</small><strong>${esc(strategy.symbol || '—')}</strong></div></div>
      <div class="safeguards">${(strategy.safeguards || []).map((s)=>`<span>✓ ${esc(s)}</span>`).join('')}</div>
      <div class="risk-note">No fake followers, win rate, or profit. Real rankings require backend trade records.</div>
    </article>`;
  }

  function renderBots(templates){
    const q = ($('freebot-search')?.value || '').toLowerCase();
    const cat = $('freebot-category')?.value || '';
    const risk = $('freebot-risk')?.value || '';
    const list = templates.filter((bot)=>
      (!cat || bot.category === cat) && (!risk || bot.risk_rating === risk) && (!q || `${bot.title} ${bot.category} ${bot.symbol} ${bot.contract_type}`.toLowerCase().includes(q))
    );
    $('free-bot-grid').innerHTML = list.length ? list.map(botCard).join('') : '<div class="empty-upgrade">No bots match that filter.</div>';
  }

  async function init(){
    if (window.DEMO) DEMO.mountChrome('free-bots.html');
    let templates = fallbackTemplates();
    let copy = fallbackCopy();
    try { const res = await DEMO.get('/templates'); if (res.templates?.length) templates = res.templates; } catch {}
    try { const res = await DEMO.get('/copy-preview'); if (res.strategies?.length) copy = res.strategies; } catch {}
    if ($('bot-count')) $('bot-count').textContent = String(templates.length);
    ['freebot-search','freebot-category','freebot-risk'].forEach((id)=>$(id)?.addEventListener('input', ()=>renderBots(templates)));
    renderBots(templates);
    $('copy-preview-grid').innerHTML = copy.map(copyCard).join('');
  }

  init();
})();
