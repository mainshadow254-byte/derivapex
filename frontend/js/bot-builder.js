(async function () {
  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  if (!Auth.isLoggedIn) { location.href = 'auth.html?mode=login'; return; }
  let me;
  try { me = await api('/me'); } catch { location.href = 'auth.html?mode=login'; return; }
  if (!me.verified) { location.href = 'verify.html'; return; }
  ContentProtection.init(`${me.email} - BUILDER`);

  const defaults = {
    sellRule: 'mirror', afterWin: 'continue', afterLoss: 'cooldown', cooldownTrades: 1,
    dailyLossLimit: 25, maxTradesPerDay: 20, maxConsecutiveLosses: 3, demoOnly: true,
  };
  const templates = [
    { id:'trend', name:'Trend Rider', description:'Trades fresh fast/slow moving-average crossovers.', symbol:'R_100', strategy:'ma_cross', contract_type:'BOTH', stake:10, fastPeriod:10, slowPeriod:30, rsiPeriod:14, oversold:30, overbought:70, lookback:20, ...defaults },
    { id:'rsi', name:'RSI Reversal', description:'Looks for stretched momentum and mean-reversion entries.', symbol:'R_50', strategy:'rsi_reversal', contract_type:'BOTH', stake:10, fastPeriod:10, slowPeriod:30, rsiPeriod:14, oversold:28, overbought:72, lookback:20, ...defaults, dailyLossLimit:20 },
    { id:'breakout', name:'Breakout Scout', description:'Enters when price closes beyond a recent range.', symbol:'BOOM500', strategy:'breakout', contract_type:'BOTH', stake:10, fastPeriod:10, slowPeriod:30, rsiPeriod:14, oversold:30, overbought:70, lookback:20, ...defaults, maxTradesPerDay:12 },
  ];
  let current = { ...templates[0] };

  el('template-grid').innerHTML = templates.map((t) => `<button class="template-card" data-template="${t.id}"><span class="template-icon">${t.strategy === 'ma_cross' ? 'MA' : t.strategy === 'rsi_reversal' ? 'RSI' : 'BRK'}</span><strong>${esc(t.name)}</strong><span>${esc(t.description)}</span><small>${esc(t.symbol)} - ${esc(t.contract_type)}</small></button>`).join('');

  try {
    const { groups } = await api('/market/symbols');
    const options = Object.entries(groups || {}).flatMap(([market, symbols]) => symbols.map((s) => `<option value="${esc(s.symbol)}">${esc(s.name)} - ${esc(market)}</option>`));
    if (options.length) el('s-symbol').innerHTML = options.join('');
  } catch {}

  function writeForm(s) {
    el('s-name').value = s.name;
    el('s-symbol').value = s.symbol;
    if (el('s-symbol').value !== s.symbol) el('s-symbol').value = el('s-symbol').options[0]?.value || 'R_100';
    el('s-strategy').value = s.strategy;
    el('s-contract').value = s.contract_type;
    el('s-stake').value = s.stake;
    el('s-fast').value = s.fastPeriod;
    el('s-slow').value = s.slowPeriod;
    el('s-rsi').value = s.rsiPeriod;
    el('s-oversold').value = s.oversold;
    el('s-overbought').value = s.overbought;
    el('s-lookback').value = s.lookback;
    el('s-sell-rule').value = s.sellRule || defaults.sellRule;
    el('s-after-win').value = s.afterWin || defaults.afterWin;
    el('s-after-loss').value = s.afterLoss || defaults.afterLoss;
    el('s-cooldown').value = s.cooldownTrades ?? defaults.cooldownTrades;
    el('s-daily-loss').value = s.dailyLossLimit ?? defaults.dailyLossLimit;
    el('s-max-trades').value = s.maxTradesPerDay ?? defaults.maxTradesPerDay;
    el('s-max-losses').value = s.maxConsecutiveLosses ?? defaults.maxConsecutiveLosses;
    el('s-demo-only').value = String(s.demoOnly !== false);
    refresh();
  }

  function readForm() {
    return {
      name: el('s-name').value.trim() || 'Untitled strategy', symbol: el('s-symbol').value,
      strategy: el('s-strategy').value, contract_type: el('s-contract').value,
      stake: Number(el('s-stake').value), fastPeriod: Number(el('s-fast').value),
      slowPeriod: Number(el('s-slow').value), rsiPeriod: Number(el('s-rsi').value),
      oversold: Number(el('s-oversold').value), overbought: Number(el('s-overbought').value),
      lookback: Number(el('s-lookback').value),
      sellRule: el('s-sell-rule').value,
      afterWin: el('s-after-win').value,
      afterLoss: el('s-after-loss').value,
      cooldownTrades: Number(el('s-cooldown').value),
      dailyLossLimit: Number(el('s-daily-loss').value),
      maxTradesPerDay: Number(el('s-max-trades').value),
      maxConsecutiveLosses: Number(el('s-max-losses').value),
      demoOnly: el('s-demo-only').value !== 'false' || !me.deriv_connected,
    };
  }

  function refresh() {
    current = readForm();
    document.querySelectorAll('[data-param]').forEach((node) => {
      node.classList.toggle('hidden', node.dataset.param !== ({ ma_cross:'ma', rsi_reversal:'rsi', breakout:'breakout' }[current.strategy]));
    });
    const rule = current.strategy === 'ma_cross'
      ? `Fast MA ${current.fastPeriod} crosses slow MA ${current.slowPeriod}`
      : current.strategy === 'rsi_reversal'
        ? `RSI ${current.rsiPeriod} exits ${current.oversold}-${current.overbought} zone`
        : `Close breaks the previous ${current.lookback}-candle range`;
    el('buy-preview').textContent = current.strategy === 'breakout'
      ? `Buy/Rise when close breaks above the previous ${current.lookback}-candle range.`
      : current.strategy === 'rsi_reversal'
        ? `Buy/Rise when RSI ${current.rsiPeriod} recovers from ${current.oversold}.`
        : `Buy/Rise when fast MA ${current.fastPeriod} crosses above slow MA ${current.slowPeriod}.`;
    el('sell-preview').textContent = current.sellRule === 'disabled'
      ? 'Sell/Fall entries are disabled for this strategy.'
      : current.strategy === 'breakout'
        ? `Sell/Fall when close breaks below the previous ${current.lookback}-candle range.`
        : current.strategy === 'rsi_reversal'
          ? `Sell/Fall when RSI ${current.rsiPeriod} rejects near ${current.overbought}.`
          : `Sell/Fall when fast MA ${current.fastPeriod} crosses below slow MA ${current.slowPeriod}.`;
    el('strategy-flow').innerHTML = [
      ['1','Market',current.symbol], ['2','Signal',rule], ['3','Direction',current.contract_type],
      ['4','Restart',current.afterLoss === 'cooldown' ? `Cooldown ${current.cooldownTrades} after loss` : `After loss: ${current.afterLoss}`],
      ['5','Risk',`Stake ${current.stake || 0} - daily stop ${current.dailyLossLimit || 0}`],
      ['6','Mode',current.demoOnly ? 'Demo only' : 'Real allowed after Deriv connect'],
    ].map(([n,k,v], i) => `<div class="flow-node"><span>${n}</span><div><small>${esc(k)}</small><strong>${esc(v)}</strong></div></div>${i < 5 ? '<div class="flow-arrow">&rarr;</div>' : ''}`).join('');
    el('builder-status').textContent = 'DRAFT';
    el('builder-status').className = 'badge info';
  }

  document.querySelectorAll('[data-template]').forEach((button) => button.onclick = () => {
    const chosen = templates.find((t) => t.id === button.dataset.template);
    if (chosen) writeForm({ ...chosen });
  });
  document.querySelectorAll('.builder-form input,.builder-form select').forEach((input) => input.oninput = refresh);
  document.querySelectorAll('.palette-item').forEach((button) => button.onclick = () => {
    document.querySelectorAll('.palette-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    document.querySelector(`[data-block="${button.dataset.focus}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  el('tour-toggle').onclick = () => el('builder-tour').classList.toggle('hidden');

  el('run-backtest').onclick = async () => {
    const button = el('run-backtest');
    button.disabled = true; button.textContent = 'Testing...';
    el('builder-message').textContent = 'Loading historical Deriv candles.';
    try {
      const result = await api('/bots/backtest', { method:'POST', body: JSON.stringify({ strategy: readForm(), granularity: Number(el('s-gran').value), count: 500 }) });
      const s = result.summary;
      el('backtest-results').classList.remove('hidden');
      el('backtest-results').innerHTML = `<div class="card"><div class="row between"><h2 style="margin:0">Backtest results</h2><span class="badge demo">SIMULATION</span></div><p class="muted-sm">${esc(result.disclaimer)}</p>${MiniCharts.stats([
        {label:'Trades',value:s.trades},{label:'Win rate',value:s.winRate+'%'},{label:'Net P/L',value:MiniCharts.fmt(s.netProfit),tone:s.netProfit>=0?'up':'down'},{label:'Return',value:s.returnPct+'%',tone:s.returnPct>=0?'up':'down'},{label:'Max drawdown',value:s.maxDrawdown+'%',tone:'down'},{label:'Ending balance',value:MiniCharts.fmt(s.endingBalance)},
      ])}<div style="margin-top:12px">${MiniCharts.line(result.equityCurve, { color:'#22d3ee', area:true })}</div><details style="margin-top:12px"><summary>Trade-by-trade results (${s.trades})</summary><div class="table-wrap"><table><thead><tr><th>Time</th><th>Direction</th><th>Entry</th><th>Exit</th><th>Result</th><th>P/L</th></tr></thead><tbody>${result.trades.slice(-100).reverse().map((t) => `<tr><td>${new Date(t.opened_at).toLocaleString()}</td><td>${t.direction}</td><td>${t.entry}</td><td>${t.exit}</td><td>${t.status}</td><td>${MiniCharts.fmt(t.profit)}</td></tr>`).join('') || '<tr><td colspan="6">No signals were generated. Try another timeframe or template.</td></tr>'}</tbody></table></div></details></div>`;
      el('builder-status').textContent = 'TESTED'; el('builder-status').className = 'badge real';
      el('builder-message').textContent = 'Backtest complete.';
    } catch (e) {
      el('builder-message').textContent = e.message + (e.status === 402 ? ' Upgrade to Standard to use bot tools.' : '');
    } finally { button.disabled = false; button.textContent = 'Run demo backtest'; }
  };

  el('save-bot').onclick = async () => {
    const strategy = readForm();
    const filename = `${strategy.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'strategy'}.json`;
    try {
      const result = await api('/bots/import', { method:'POST', body: JSON.stringify({ filename, content: JSON.stringify(strategy, null, 2) }) });
      el('builder-message').textContent = `Saved ${result.bot.name} to your private bot library.`;
      el('builder-status').textContent = 'SAVED'; el('builder-status').className = 'badge real';
    } catch (e) { el('builder-message').textContent = e.message; }
  };

  el('export-bot').onclick = () => {
    const strategy = readForm();
    const blob = new Blob([JSON.stringify(strategy, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${strategy.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'strategy'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    el('builder-message').textContent = 'Strategy JSON exported.';
  };

  el('import-bot-json').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const strategy = JSON.parse(await file.text());
      writeForm({ ...templates[0], ...strategy });
      el('builder-message').textContent = 'Strategy imported into the workspace.';
    } catch {
      el('builder-message').textContent = 'Could not import that JSON strategy.';
    } finally {
      event.target.value = '';
    }
  };

  writeForm(current);
})();
