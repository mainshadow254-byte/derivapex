(function(){
  const AUTOSAVE_KEY = 'apexbot_visual_strategy_v1';
  const report = { transactions:[], journal:[], current:null, running:false, controller:null };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const money = (value, currency='') => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}${currency ? ` ${currency}` : ''}` : '—';
  const spot = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(5).replace(/0+$/,'').replace(/\.$/,'') : '—';

  function state(){
    try {
      const data = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '{}');
      return { strategy:data.strategy || {}, blocks:Array.isArray(data.blocks) ? data.blocks : [] };
    } catch { return { strategy:{}, blocks:[] }; }
  }

  function activateTab(name){
    document.querySelectorAll('.workstation-tab').forEach((button)=>button.classList.toggle('active', button.dataset.panelTab === name));
    document.querySelectorAll('.workstation-view').forEach((view)=>view.classList.toggle('active', view.dataset.panelView === name));
  }

  function addJournal(message, level='info', details={}){
    report.journal.unshift({ id:crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, at:new Date(), level, message, details });
    renderJournal();
  }

  function renderJournal(){
    const host = $('builder-log');
    if (!host) return;
    const filter = $('journal-filter')?.value || 'all';
    const rows = report.journal.filter((item)=>filter === 'all' || item.level === filter);
    host.innerHTML = rows.length ? rows.map((item)=>`
      <article class="journal-entry ${esc(item.level)}">
        <div class="journal-meta"><span>${esc(item.level.toUpperCase())}</span><time>${esc(item.at.toLocaleString())}</time></div>
        <p>${esc(item.message)}</p>
      </article>`).join('') : '<div class="table-empty">No journal entries match this filter.</div>';
  }

  function renderTransactions(){
    const host = $('transaction-list');
    if (!host) return;
    if (!report.transactions.length) {
      host.className = 'table-empty';
      host.textContent = 'No transactions yet.';
      return;
    }
    host.className = '';
    host.innerHTML = `<table class="report-transactions">
      <thead><tr><th>Type</th><th>Entry / exit spot</th><th>Buy price / P&amp;L</th><th>Status</th></tr></thead>
      <tbody>${report.transactions.map((tx)=>`
        <tr>
          <td><strong>${esc(tx.contract)}</strong><br><span class="muted">${esc(tx.symbol)}</span></td>
          <td>${spot(tx.entry)}<br><span class="muted">${spot(tx.exit)}</span></td>
          <td>${money(tx.stake, tx.currency)}<br><span class="${Number(tx.pnl) > 0 ? 'positive' : Number(tx.pnl) < 0 ? 'negative' : 'muted'}">${money(tx.pnl, tx.currency)}</span></td>
          <td>${esc(tx.status)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  }

  function renderCurrent(){
    const card = $('current-contract-card');
    if (!card) return;
    const tx = report.current;
    if (!tx) {
      card.className = 'current-contract empty';
      $('current-contract-title').textContent = 'No contract';
      $('current-contract-status').className = 'contract-status';
      $('current-contract-status').textContent = 'Idle';
      $('current-contract-body').textContent = 'Run the bot in demo mode to display a verified order here.';
      return;
    }
    card.className = 'current-contract';
    $('current-contract-title').textContent = `${tx.symbol} · ${tx.contract}`;
    $('current-contract-status').className = `contract-status ${tx.statusClass || 'open'}`;
    $('current-contract-status').textContent = tx.status;
    $('current-contract-body').innerHTML = `<div class="current-contract-grid">
      <div class="current-contract-field"><span>Entry spot</span><strong>${spot(tx.entry)}</strong></div>
      <div class="current-contract-field"><span>Exit spot</span><strong>${spot(tx.exit)}</strong></div>
      <div class="current-contract-field"><span>Buy price</span><strong>${money(tx.stake, tx.currency)}</strong></div>
      <div class="current-contract-field"><span>Profit / loss</span><strong>${money(tx.pnl, tx.currency)}</strong></div>
      <div class="current-contract-field"><span>Duration</span><strong>${esc(tx.duration)} ${esc(tx.durationUnit)}</strong></div>
      <div class="current-contract-field"><span>Mode</span><strong>${esc(tx.mode)}</strong></div>
    </div>`;
  }

  function renderStats(){
    const { strategy } = state();
    const settled = report.transactions.filter((tx)=>Number.isFinite(Number(tx.pnl)));
    const totalStake = report.transactions.reduce((sum, tx)=>sum + (Number(tx.stake) || 0), 0);
    const totalPayout = settled.reduce((sum, tx)=>sum + (Number(tx.payout) || 0), 0);
    const totalPnl = settled.reduce((sum, tx)=>sum + Number(tx.pnl), 0);
    const won = settled.filter((tx)=>Number(tx.pnl) > 0).length;
    const lost = settled.filter((tx)=>Number(tx.pnl) < 0).length;
    $('builder-summary-stake').textContent = money(totalStake, strategy.currency || '');
    $('builder-summary-runs').textContent = String(report.transactions.length);
    $('builder-summary-payout').textContent = settled.length ? money(totalPayout, strategy.currency || '') : '—';
    $('builder-summary-profit').textContent = settled.length ? money(totalPnl, strategy.currency || '') : '—';
    $('builder-summary-won').textContent = settled.length ? String(won) : '—';
    $('builder-summary-lost').textContent = settled.length ? String(lost) : '—';
  }

  function renderAll(){ renderCurrent(); renderTransactions(); renderStats(); renderJournal(); }

  function setRunState(running, title, progressText=''){
    report.running = running;
    const button = $('run-demo-bottom');
    button.classList.toggle('running', running);
    button.textContent = running ? '■ Stop' : '▶ Run demo';
    $('bot-run-state').textContent = title || (running ? 'Bot is running' : 'Bot is not running');
    $('builder-progress-text').textContent = progressText || (running ? 'Processing' : 'Ready');
    const bar = $('builder-run-progress-bar');
    bar.classList.toggle('indeterminate', running);
    if (!running) { bar.classList.remove('indeterminate'); bar.style.width='0'; bar.style.transform=''; }
  }

  function validationErrors(strategy, blocks){
    const errors = [];
    if (!blocks.some((block)=>block.type === 'trade_parameters')) errors.push('Add Trade Parameters.');
    if (!blocks.some((block)=>['purchase_conditions','buy_signal','rsi','ema_cross','macd','digit_prediction','volatility_filter'].includes(block.type))) errors.push('Add a Purchase Condition or indicator rule.');
    if (!blocks.some((block)=>block.type === 'restart_conditions')) errors.push('Add Restart Conditions.');
    if (!strategy.symbol) errors.push('Select a market.');
    if (!strategy.contract_type) errors.push('Select a contract type.');
    if (!(Number(strategy.stake) >= 0.35)) errors.push('Stake must be at least 0.35.');
    if (!(Number(strategy.duration) >= 1)) errors.push('Duration must be at least 1.');
    return errors;
  }

  async function runDemo(){
    if (report.running) {
      report.controller?.abort();
      setRunState(false, 'Bot stopped', 'Stopped by user');
      addJournal('The demo request was stopped by the user.', 'warning');
      return;
    }

    const { strategy, blocks } = state();
    const errors = validationErrors(strategy, blocks);
    if (errors.length) {
      setRunState(false, 'Bot is not running', 'Fix strategy checks');
      addJournal(`Run rejected: ${errors.join(' ')}`, 'error');
      activateTab('journal');
      return;
    }
    if (!window.Auth?.isLoggedIn) {
      addJournal('Log in before running a demo order. The builder will not invent a local transaction.', 'error');
      activateTab('journal');
      return;
    }

    report.controller = new AbortController();
    setRunState(true, 'Attempting to buy', 'Sending verified demo request');
    addJournal(`Attempting demo purchase: ${strategy.contract_type} on ${strategy.symbol}, stake ${money(strategy.stake, strategy.currency)}.`, 'info');
    try {
      const result = await api('/trading/demo-trade', {
        method:'POST', signal:report.controller.signal,
        body:JSON.stringify({ symbol:strategy.symbol, contractType:strategy.contract_type, amount:Number(strategy.stake), duration:Number(strategy.duration) }),
      });
      const tx = {
        id:result.tradeId || `demo-${Date.now()}`, time:new Date(), mode:'DEMO',
        symbol:result.symbol || strategy.symbol, contract:result.contract_type || strategy.contract_type,
        entry:result.entry_price, exit:null, stake:Number(result.stake ?? strategy.stake),
        payout:null, pnl:null, currency:strategy.currency || '', duration:result.duration || strategy.duration,
        durationUnit:strategy.durationType || 't', status:'Open demo', statusClass:'open',
      };
      report.transactions.unshift(tx); report.current = tx;
      setRunState(false, 'Demo order recorded', 'Waiting for settlement data');
      addJournal(`Demo order recorded${result.tradeId ? ` with ledger ID ${result.tradeId}` : ''}. Payout and P/L remain blank until a settled result exists.`, 'success');
      renderAll();
      activateTab('summary');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setRunState(false, 'Bot is not running', 'Order rejected');
      addJournal(error?.body?.detail || error?.message || 'Demo order failed.', 'error');
      activateTab('journal');
    } finally { report.controller = null; }
  }

  async function backtest(){
    const { strategy, blocks } = state();
    const errors = validationErrors(strategy, blocks);
    if (errors.length) { addJournal(`Backtest rejected: ${errors.join(' ')}`, 'error'); activateTab('journal'); return; }
    if (!window.Auth?.isLoggedIn) { addJournal('Log in before running the backend backtest.', 'error'); activateTab('journal'); return; }
    addJournal('Backtest started using backend strategy data.', 'info'); activateTab('journal');
    try {
      const result = await api('/bots/backtest', { method:'POST', body:JSON.stringify({ strategy, blocks, count:500 }) });
      const summary = result?.summary || {};
      addJournal(`Backtest complete: ${summary.trades ?? 0} trades${summary.winRate != null ? `, ${summary.winRate}% win rate` : ''}. Backtest results are kept separate from live/demo order totals.`, 'success');
    } catch (error) { addJournal(error?.body?.detail || error?.message || 'Backtest failed.', 'error'); }
  }

  function resetReport(){
    report.controller?.abort(); report.transactions=[]; report.journal=[]; report.current=null; report.running=false;
    setRunState(false, 'Bot is not running', 'Ready');
    addJournal('Report reset. No trading account data was deleted.', 'info');
    renderAll(); activateTab('summary');
  }

  function download(name, content, type='text/plain'){
    const blob = new Blob([content], { type }); const url=URL.createObjectURL(blob); const link=document.createElement('a');
    link.href=url; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),0);
  }

  function downloadTransactions(){
    const rows = [['time','mode','symbol','contract','entry','exit','stake','payout','profit_loss','status'], ...report.transactions.map((tx)=>[tx.time.toISOString(),tx.mode,tx.symbol,tx.contract,tx.entry ?? '',tx.exit ?? '',tx.stake ?? '',tx.payout ?? '',tx.pnl ?? '',tx.status])];
    download('apexbot-transactions.csv', rows.map((row)=>row.map((cell)=>`"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n'), 'text/csv');
  }

  function downloadJournal(){
    download('apexbot-journal.txt', report.journal.slice().reverse().map((item)=>`${item.at.toISOString()} [${item.level.toUpperCase()}] ${item.message}`).join('\n'));
  }

  function init(){
    document.querySelectorAll('.workstation-tab').forEach((button)=>button.addEventListener('click',()=>activateTab(button.dataset.panelTab)));
    $('journal-filter')?.addEventListener('change', renderJournal);
    $('download-journal')?.addEventListener('click', downloadJournal);
    $('download-transactions')?.addEventListener('click', downloadTransactions);
    $('reset-builder-report')?.addEventListener('click', resetReport);

    // Capture before the legacy one-shot handlers so only this report engine runs.
    document.addEventListener('click', (event)=>{
      const target = event.target.closest?.('#run-demo-bottom,#run-backtest');
      if (!target) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (target.id === 'run-demo-bottom') runDemo(); else backtest();
    }, true);

    setRunState(false, 'Bot is not running', 'Ready');
    addJournal('Builder ready. Summary, Transactions and Journal display verified session data only.', 'info');
    renderAll(); activateTab('summary');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
