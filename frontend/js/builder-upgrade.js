(function(){
  const AUTOSAVE_KEY = 'apexbot_visual_strategy_v1';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function waitForBuilder(){
    const ready = $('#template-picker') && $('.visual-builder-topbar') && $('.visual-properties');
    if (ready) return init();
    setTimeout(waitForBuilder, 150);
  }

  function readState(){
    try {
      const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '{}');
      return { strategy: saved.strategy || {}, blocks: Array.isArray(saved.blocks) ? saved.blocks : [] };
    } catch { return { strategy:{}, blocks:[] }; }
  }

  function applyTemplate(id){
    const picker = $('#template-picker');
    if (!picker) return;
    picker.value = id;
    picker.dispatchEvent(new Event('change', { bubbles:true }));
    setTimeout(updateInspector, 450);
  }

  function exportXmlSkeleton(){
    const { strategy, blocks } = readState();
    const safeName = (strategy.name || 'apexbot-strategy').replace(/[^a-z0-9_-]+/gi, '-');
    const rows = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<apexbot_strategy format="apexbot-visual-v1">',
      `  <name>${esc(strategy.name || 'ApexBot strategy')}</name>`,
      `  <symbol>${esc(strategy.symbol || 'R_100')}</symbol>`,
      `  <contract_type>${esc(strategy.contract_type || 'CALL')}</contract_type>`,
      `  <duration unit="${esc(strategy.durationType || 't')}">${esc(strategy.duration || 1)}</duration>`,
      `  <stake currency="${esc(strategy.currency || 'USD')}">${esc(strategy.stake || 1)}</stake>`,
      `  <risk stop_loss="${esc(strategy.stopLoss || 0)}" take_profit="${esc(strategy.takeProfit || 0)}" daily_loss_limit="${esc(strategy.dailyLossLimit || 0)}" max_trades="${esc(strategy.maxTradesPerDay || 0)}" />`,
      '  <blocks>',
      ...blocks.map((b, i)=>`    <block order="${i+1}" type="${esc(b.type)}" title="${esc(b.title)}" />`),
      '  </blocks>',
      '  <warning>This is an ApexBot XML export skeleton for review/import workflows. Test in demo before any real trading.</warning>',
      '</apexbot_strategy>'
    ];
    const blob = new Blob([rows.join('\n')], { type:'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    addUpgradeLog('XML skeleton exported for review. Test in demo first.');
  }

  function addUpgradeLog(text){
    const log = $('#builder-log');
    if (!log) return;
    const row = document.createElement('div');
    row.className = 'log-ok';
    row.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    log.prepend(row);
  }

  function readinessScore(strategy, blocks){
    let score = 0;
    if (strategy.symbol) score += 15;
    if (strategy.contract_type) score += 15;
    if (Number(strategy.duration) > 0) score += 10;
    if (Number(strategy.stake) >= .35) score += 10;
    if (blocks.some(b=>b.type === 'trade_parameters')) score += 12;
    if (blocks.some(b=>['purchase_conditions','buy_signal','rsi','ema_cross','digit_prediction','ai_signal'].includes(b.type))) score += 14;
    if (blocks.some(b=>['risk_management','stop_loss','take_profit','max_trades'].includes(b.type))) score += 18;
    if (Number(strategy.dailyLossLimit) > 0 || Number(strategy.stopLoss) > 0) score += 6;
    return Math.min(100, score);
  }

  function riskLabel(strategy, blocks){
    const stake = Number(strategy.stake || 0);
    const hasRisk = blocks.some(b=>['risk_management','stop_loss','take_profit','max_trades'].includes(b.type));
    const mode = strategy.moneyMode || 'fixed';
    if (!hasRisk || mode === 'martingale' || stake > 10) return ['High', 'score-bad'];
    if (stake > 2 || !Number(strategy.dailyLossLimit)) return ['Medium', 'score-warn'];
    return ['Controlled', 'score-good'];
  }

  function blockCount(type){
    return $$('.visual-node.' + type).length;
  }

  function updateInspector(){
    const { strategy, blocks } = readState();
    const score = readinessScore(strategy, blocks);
    const [risk, riskClass] = riskLabel(strategy, blocks);
    const hasTrade = blocks.some(b=>b.type === 'trade_parameters') || blockCount('trade_parameters');
    const hasEntry = blocks.some(b=>['purchase_conditions','buy_signal','rsi','ema_cross','digit_prediction','ai_signal'].includes(b.type));
    const hasRisk = blocks.some(b=>['risk_management','stop_loss','take_profit','max_trades'].includes(b.type));
    const warnings = [];
    if (!hasTrade) warnings.push('Add Trade Parameters before testing.');
    if (!hasEntry) warnings.push('Add a clear entry condition before demo run.');
    if (!hasRisk) warnings.push('Add Risk Management before any real account connection.');
    if (Number(strategy.stake || 0) > 5) warnings.push('Stake looks high for a beginner template.');

    const progress = $('#builder-readiness-bar');
    if (progress) progress.style.width = `${score}%`;
    const scoreEl = $('#builder-readiness');
    if (scoreEl){ scoreEl.textContent = `${score}%`; scoreEl.className = score >= 80 ? 'score-good' : score >= 55 ? 'score-warn' : 'score-bad'; }
    const riskEl = $('#builder-risk');
    if (riskEl){ riskEl.textContent = risk; riskEl.className = riskClass; }
    const marketEl = $('#builder-market'); if (marketEl) marketEl.textContent = strategy.symbol || 'Select market';
    const contractEl = $('#builder-contract'); if (contractEl) contractEl.textContent = strategy.contract_type || 'Select contract';
    const blocksEl = $('#builder-blocks'); if (blocksEl) blocksEl.textContent = String(blocks.length || $$('.visual-node').length || 0);

    $$('.workflow-step').forEach((step)=>{
      const key = step.dataset.step;
      const done = key === 'template' ? blocks.length > 1 : key === 'market' ? Boolean(strategy.symbol) : key === 'contract' ? Boolean(strategy.contract_type) : key === 'conditions' ? hasEntry : key === 'risk' ? hasRisk : score >= 70;
      step.classList.toggle('done', done);
      step.classList.toggle('warn', !done);
    });

    const summary = $('#builder-live-summary');
    if (summary) summary.innerHTML = `
      <div class="builder-summary-row"><span>Name</span><b>${esc(strategy.name || 'Unsaved strategy')}</b></div>
      <div class="builder-summary-row"><span>Market</span><b>${esc(strategy.symbol || '—')}</b></div>
      <div class="builder-summary-row"><span>Contract</span><b>${esc(strategy.contract_type || '—')}</b></div>
      <div class="builder-summary-row"><span>Stake</span><b>${esc(strategy.stake || '—')} ${esc(strategy.currency || '')}</b></div>
      <div class="builder-summary-row"><span>Duration</span><b>${esc(strategy.duration || '—')} ${esc(strategy.durationType || '')}</b></div>
      <div class="builder-summary-row"><span>Blocks</span><b>${esc(blocks.length || $$('.visual-node').length || 0)}</b></div>`;

    const warnBox = $('#builder-live-warnings');
    if (warnBox) warnBox.innerHTML = warnings.length
      ? warnings.map(w=>`<div class="builder-warning">${esc(w)}</div>`).join('')
      : '<div class="builder-warning ok">Builder is ready for demo testing. This is not a profit guarantee.</div>';
  }

  function buildCommandCenter(){
    if ($('#builder-command-center')) return;
    const topbar = $('.visual-builder-topbar');
    const div = document.createElement('section');
    div.id = 'builder-command-center';
    div.className = 'builder-command-center';
    div.innerHTML = `
      <div class="builder-command-card">
        <span class="builder-kicker">Bot builder workflow</span>
        <h3>Build like DBot, explain like ApexBot</h3>
        <p>Pick a ready template, select a market, confirm contract type, add entry logic, lock risk controls, then run demo/backtest before saving.</p>
        <div class="builder-workflow">
          <div class="workflow-step" data-step="template"><b>Template</b><span>Start with a known structure</span></div>
          <div class="workflow-step" data-step="market"><b>Market</b><span>Volatility, Boom/Crash, Forex, Crypto</span></div>
          <div class="workflow-step" data-step="contract"><b>Contract</b><span>Rise/Fall, Digits, Touch, Multiplier</span></div>
          <div class="workflow-step" data-step="conditions"><b>Signal</b><span>RSI, EMA, digit, AI filter</span></div>
          <div class="workflow-step" data-step="risk"><b>Risk</b><span>Stops, max trades, daily loss</span></div>
          <div class="workflow-step" data-step="test"><b>Test</b><span>Demo run and backtest</span></div>
        </div>
      </div>
      <div class="builder-command-card">
        <span class="builder-kicker">One-click templates</span>
        <h3>Load popular Deriv bot styles</h3>
        <p>These buttons use your existing template engine, then you can edit every block on the canvas.</p>
        <div class="quick-template-grid">
          <button class="quick-template hot" data-load-template="over"><b>Over / Under</b><span>Digits learner with prediction</span></button>
          <button class="quick-template hot" data-load-template="even"><b>Even / Odd</b><span>Digit pattern starter</span></button>
          <button class="quick-template" data-load-template="ema"><b>EMA Rise/Fall</b><span>Trend-following structure</span></button>
          <button class="quick-template" data-load-template="rsi"><b>RSI Reversal</b><span>Mean-reversion structure</span></button>
          <button class="quick-template" data-load-template="boom"><b>Boom Guard</b><span>Volatility filter + risk</span></button>
          <button class="quick-template" data-load-template="ai"><b>AI Approval</b><span>Scanner confirmation gate</span></button>
        </div>
      </div>
      <div class="builder-command-card">
        <span class="builder-kicker">Readiness meter</span>
        <h3>Know if the bot is test-ready</h3>
        <p>This checks structure and risk controls. It does not predict profit.</p>
        <div class="builder-progress"><span id="builder-readiness-bar"></span></div>
        <div class="builder-score-grid">
          <div class="builder-score"><small>Readiness</small><strong id="builder-readiness">0%</strong></div>
          <div class="builder-score"><small>Risk</small><strong id="builder-risk">—</strong></div>
          <div class="builder-score"><small>Market</small><strong id="builder-market">—</strong></div>
          <div class="builder-score"><small>Contract</small><strong id="builder-contract">—</strong></div>
        </div>
      </div>`;
    topbar.after(div);
    $$('.quick-template').forEach(btn=>btn.addEventListener('click',()=>applyTemplate(btn.dataset.loadTemplate)));
  }

  function buildInspector(){
    if ($('#builder-inspector')) return;
    const props = $('.visual-properties');
    if (!props) return;
    const div = document.createElement('section');
    div.id = 'builder-inspector';
    div.className = 'builder-inspector';
    div.innerHTML = `
      <h4>Strategy inspector</h4>
      <div id="builder-live-summary" class="builder-summary-list"></div>
      <div id="builder-live-warnings" class="builder-warnings"></div>
      <div class="builder-upgrade-actions">
        <button id="builder-validate-now" class="btn ghost" type="button">Refresh checks</button>
        <button id="builder-export-xml" class="btn ghost" type="button">Export XML skeleton</button>
      </div>
      <div class="builder-export-note">JSON export remains the main ApexBot format. XML skeleton export helps users inspect/share strategy structure without claiming guaranteed DBot compatibility.</div>`;
    props.appendChild(div);
    $('#builder-validate-now').addEventListener('click', updateInspector);
    $('#builder-export-xml').addEventListener('click', exportXmlSkeleton);
  }

  function init(){
    buildCommandCenter();
    buildInspector();
    const canvas = $('#canvas-blocks');
    if (canvas) new MutationObserver(updateInspector).observe(canvas, { childList:true, subtree:true, attributes:true });
    ['input','change','click'].forEach(evt=>document.addEventListener(evt, ()=>setTimeout(updateInspector, 120), true));
    setInterval(updateInspector, 1200);
    updateInspector();
  }

  waitForBuilder();
})();
