(async function () {
  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toFixed(2);

  if (!Auth.isLoggedIn) { location.href = 'auth.html?mode=login'; return; }
  let me;
  try { me = await api('/me'); } catch { location.href = 'auth.html?mode=login'; return; }
  if (!me.verified) { location.href = 'verify.html'; return; }
  ContentProtection.init(`${me.email} - BUILDER`);
  if (window.DerivOnboard) DerivOnboard.wireOAuth(document);

  const publicConfig = await loadPublicConfig().catch(() => ({ derivAppId: '1089' }));
  let builderChart = null;
  let builderChartSymbol = '';
  let analysisTimer = null;
  let symbolGroups = {};
  let flatSymbols = [];
  let availableContracts = [];

  const tradeTypeGroups = [
    { id:'rise_fall', label:'Rise/Fall', categories:['callput'], contracts:['CALL','PUT'] },
    { id:'higher_lower', label:'Higher/Lower', categories:['higherlower'], contracts:['CALL','PUT'] },
    { id:'touch_no_touch', label:'Touch/No Touch', categories:['touchnotouch'], contracts:['ONETOUCH','NOTOUCH'] },
    { id:'ends_between_outside', label:'Ends Between / Ends Outside', categories:['endsinout'], contracts:['EXPIRYMISS','EXPIRYRANGE'] },
    { id:'stays_goes', label:'Stays Between / Goes Outside', categories:['staysinout'], contracts:['RANGE','UPORDOWN'] },
    { id:'matches_differs', label:'Matches/Differs', categories:['digits'], contracts:['DIGITMATCH','DIGITDIFF'] },
    { id:'even_odd', label:'Even/Odd', categories:['digits'], contracts:['DIGITEVEN','DIGITODD'] },
    { id:'over_under', label:'Over/Under', categories:['digits'], contracts:['DIGITOVER','DIGITUNDER'] },
    { id:'asians', label:'Asian Up/Asian Down', categories:['asian'], contracts:['ASIANU','ASIAND'] },
    { id:'reset', label:'Reset Call/Reset Put', categories:['reset'], contracts:['RESETCALL','RESETPUT'] },
    { id:'call_put_spread', label:'Call/Put Spread', categories:['callputspread'], contracts:['CALLSPREAD','PUTSPREAD'] },
    { id:'multiplier', label:'Multiplier', categories:['multiplier'], contracts:['MULTUP','MULTDOWN'] },
  ];

  const contractLabels = {
    CALL:'Rise / Call', PUT:'Fall / Put', ONETOUCH:'Touch', NOTOUCH:'No Touch',
    EXPIRYMISS:'Ends Outside', EXPIRYRANGE:'Ends Between', RANGE:'Stays Between', UPORDOWN:'Goes Outside',
    DIGITMATCH:'Matches', DIGITDIFF:'Differs', DIGITEVEN:'Even', DIGITODD:'Odd', DIGITOVER:'Over', DIGITUNDER:'Under',
    ASIANU:'Asian Up', ASIAND:'Asian Down', RESETCALL:'Reset Call', RESETPUT:'Reset Put',
    CALLSPREAD:'Call Spread', PUTSPREAD:'Put Spread', MULTUP:'Multiplier Up', MULTDOWN:'Multiplier Down',
    BOTH:'Both directions',
  };

  const categoryBlocks = {
    trade:['Trade definition','Trade type','Contract type','Duration','Stake'],
    markets:['Derived / Synthetic','Volatility','Boom & Crash','Step','Jump','Forex','Crypto'],
    conditions:['Buy condition','Sell condition','If sell is available','Compare price','Digit condition'],
    indicators:['Moving average','RSI','Breakout range','Tick analysis','Candle read'],
    risk:['Stop loss','Take profit','Max daily loss','Max trades','Max consecutive losses'],
    restart:['Trade again','Restart after win','Restart after loss','Cooldown','Restart on error'],
    notifications:['Telegram notification','Browser alert','Execution log','Signal note'],
    utilities:['Import XML','Export XML','Reset workspace','Read balance','Time filter'],
  };

  const defaults = {
    name: 'Deriv block strategy', symbol: 'R_100', strategy: 'ma_cross', contract_type: 'CALL',
    tradeType: 'rise_fall', stake: 1, duration: 5, durationType: 't', granularity: 60,
    fastPeriod: 10, slowPeriod: 30, rsiPeriod: 14, oversold: 30, overbought: 70, lookback: 20,
    sellRule: 'available', stopLoss: 10, takeProfit: 20, dailyLossLimit: 25,
    maxTradesPerDay: 20, maxConsecutiveLosses: 3, afterWin: 'continue', afterLoss: 'cooldown',
    cooldownTrades: 1, demoOnly: true, restartOnError: true,
  };
  let current = { ...defaults };

  function log(message, tone = '') {
    const row = document.createElement('div');
    row.className = tone ? `log-${tone}` : '';
    row.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    el('builder-log').prepend(row);
  }

  function classifySymbol(s) {
    const text = `${s.symbol} ${s.name} ${s.market} ${s.submarket}`.toLowerCase();
    if (text.includes('boom')) return 'Boom & Crash';
    if (text.includes('crash')) return 'Boom & Crash';
    if (text.includes('step')) return 'Step';
    if (text.includes('jump') || /^jd/i.test(s.symbol)) return 'Jump';
    if (text.includes('range break') || /^rd/i.test(s.symbol)) return 'Range Break';
    if (text.includes('forex') || /^frx/i.test(s.symbol)) return 'Forex';
    if (text.includes('crypto') || /^cry/i.test(s.symbol)) return 'Crypto';
    if (text.includes('drift') || text.includes('dex')) return 'Other Synthetic';
    if (text.includes('volatility') || /^r_/i.test(s.symbol) || /1s/i.test(text)) return 'Volatility';
    return s.market || 'Other';
  }

  function normalizeSymbols(groups) {
    const rows = [];
    Object.entries(groups || {}).forEach(([market, symbols]) => {
      (symbols || []).forEach((s) => rows.push({ ...s, market, family: classifySymbol({ ...s, market }) }));
    });
    return rows.sort((a, b) => `${a.family} ${a.name}`.localeCompare(`${b.family} ${b.name}`));
  }

  async function loadSymbols() {
    try {
      const { groups } = await api('/market/symbols');
      symbolGroups = groups || {};
      flatSymbols = normalizeSymbols(symbolGroups);
      log(`Loaded ${flatSymbols.length} live Deriv symbols.`, 'ok');
    } catch (e) {
      flatSymbols = [
        { symbol:'R_10', name:'Volatility 10 Index', family:'Volatility', exchange_open:true },
        { symbol:'R_25', name:'Volatility 25 Index', family:'Volatility', exchange_open:true },
        { symbol:'R_50', name:'Volatility 50 Index', family:'Volatility', exchange_open:true },
        { symbol:'R_75', name:'Volatility 75 Index', family:'Volatility', exchange_open:true },
        { symbol:'R_100', name:'Volatility 100 Index', family:'Volatility', exchange_open:true },
      ];
      log(`Live symbols unavailable: ${e.message}`, 'warn');
    }
    renderMarketSelectors();
  }

  function renderMarketSelectors() {
    const groups = [...new Set(flatSymbols.map((s) => s.family || s.market || 'Other'))];
    el('s-market-group').innerHTML = groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    const selected = flatSymbols.find((s) => s.symbol === current.symbol) || flatSymbols[0];
    if (selected) {
      el('s-market-group').value = selected.family || selected.market || groups[0];
      renderSubmarkets(selected.submarket);
      el('s-symbol').value = selected.symbol;
    }
  }

  function renderSubmarkets(preferred = '') {
    const group = el('s-market-group').value;
    const symbols = flatSymbols.filter((s) => (s.family || s.market || 'Other') === group);
    const subs = [...new Set(symbols.map((s) => s.submarket || group))];
    el('s-submarket').innerHTML = subs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (preferred && subs.includes(preferred)) el('s-submarket').value = preferred;
    renderSymbols();
  }

  function renderSymbols() {
    const group = el('s-market-group').value;
    const sub = el('s-submarket').value;
    const symbols = flatSymbols.filter((s) => (s.family || s.market || 'Other') === group && (s.submarket || group) === sub);
    el('s-symbol').innerHTML = symbols.map((s) => `<option value="${esc(s.symbol)}">${esc(s.name || s.symbol)}${s.exchange_open === false ? ' (closed)' : ''}</option>`).join('');
    if (symbols.some((s) => s.symbol === current.symbol)) el('s-symbol').value = current.symbol;
    else if (symbols[0]) el('s-symbol').value = symbols[0].symbol;
  }

  async function loadContracts(symbol) {
    availableContracts = [];
    el('contract-warning').classList.add('hidden');
    try {
      const res = await api(`/market/contracts?symbol=${encodeURIComponent(symbol)}`);
      availableContracts = res.contracts || [];
      log(`Loaded ${availableContracts.length} contracts for ${symbol}.`, 'ok');
    } catch (e) {
      el('contract-warning').textContent = `Contract availability could not be loaded for ${symbol}: ${e.message}`;
      el('contract-warning').classList.remove('hidden');
      log(`Contracts unavailable for ${symbol}: ${e.message}`, 'warn');
    }
    renderTradeTypes();
  }

  function renderTradeTypes() {
    const matchesGroup = (g, c) => g.contracts.includes(c.contract_type)
      && (!g.categories?.length || g.categories.includes(String(c.contract_category || '').toLowerCase()));
    const usable = availableContracts.length
      ? tradeTypeGroups.filter((g) => availableContracts.some((c) => matchesGroup(g, c)))
      : tradeTypeGroups.slice(0, 4);
    el('s-trade-type').innerHTML = usable.map((g) => `<option value="${g.id}">${g.label}</option>`).join('');
    if (usable.some((g) => g.id === current.tradeType)) el('s-trade-type').value = current.tradeType;
    renderContracts();
  }

  function renderContracts() {
    const group = tradeTypeGroups.find((g) => g.id === el('s-trade-type').value) || tradeTypeGroups[0];
    const metas = availableContracts.length
      ? availableContracts.filter((c) => group.contracts.includes(c.contract_type) && (!group.categories?.length || group.categories.includes(String(c.contract_category || '').toLowerCase())))
      : group.contracts.map((contract_type) => ({ contract_type }));
    const list = metas.map((c) => c.contract_type);
    el('s-contract').innerHTML = metas.map((meta) => {
      const label = meta.contract_display || contractLabels[meta.contract_type] || meta.contract_type;
      return `<option value="${esc(meta.contract_type)}">${esc(label)}</option>`;
    }).join('');
    if (list.includes(current.contract_type)) el('s-contract').value = current.contract_type;
    else if (list[0]) el('s-contract').value = list[0];
    if (!list.length) {
      el('contract-warning').textContent = `${group.label} is not available for this selected symbol right now. Choose another trade type or market.`;
      el('contract-warning').classList.remove('hidden');
    }
  }

  function readForm() {
    return {
      name: el('s-name').value.trim() || 'Untitled strategy',
      symbol: el('s-symbol').value,
      marketGroup: el('s-market-group').value,
      submarket: el('s-submarket').value,
      tradeType: el('s-trade-type').value,
      contract_type: el('s-contract').value,
      strategy: el('s-strategy').value,
      granularity: Number(el('s-gran').value),
      stake: Number(el('s-stake').value),
      duration: Number(el('s-duration').value || 5),
      durationType: el('s-duration-type').value,
      restartOnError: el('s-restart-error').value !== 'false',
      fastPeriod: Number(el('s-fast').value),
      slowPeriod: Number(el('s-slow').value),
      rsiPeriod: Number(el('s-rsi').value),
      oversold: Number(el('s-oversold').value),
      overbought: Number(el('s-overbought').value),
      lookback: Number(el('s-lookback').value),
      sellRule: el('s-sell-rule').value,
      stopLoss: Number(el('s-stop-loss').value),
      takeProfit: Number(el('s-take-profit').value),
      dailyLossLimit: Number(el('s-daily-loss').value),
      maxTradesPerDay: Number(el('s-max-trades').value),
      maxConsecutiveLosses: Number(el('s-max-losses').value),
      afterWin: el('s-after-win').value,
      afterLoss: el('s-after-loss').value,
      cooldownTrades: Number(el('s-cooldown').value),
      demoOnly: el('s-demo-only').value !== 'false' || !me.deriv_connected,
    };
  }

  function writeForm(s) {
    current = { ...defaults, ...s };
    el('s-name').value = current.name;
    el('s-strategy').value = current.strategy;
    el('s-gran').value = String(current.granularity || 60);
    el('s-stake').value = current.stake;
    el('s-duration').value = current.duration;
    el('s-duration-type').value = current.durationType;
    el('s-restart-error').value = String(current.restartOnError !== false);
    el('s-fast').value = current.fastPeriod;
    el('s-slow').value = current.slowPeriod;
    el('s-rsi').value = current.rsiPeriod;
    el('s-oversold').value = current.oversold;
    el('s-overbought').value = current.overbought;
    el('s-lookback').value = current.lookback;
    el('s-sell-rule').value = current.sellRule;
    el('s-stop-loss').value = current.stopLoss;
    el('s-take-profit').value = current.takeProfit;
    el('s-daily-loss').value = current.dailyLossLimit;
    el('s-max-trades').value = current.maxTradesPerDay;
    el('s-max-losses').value = current.maxConsecutiveLosses;
    el('s-after-win').value = current.afterWin;
    el('s-after-loss').value = current.afterLoss;
    el('s-cooldown').value = current.cooldownTrades;
    el('s-demo-only').value = String(current.demoOnly !== false);
    renderMarketSelectors();
    refresh(true);
  }

  function validation(strategy) {
    const warnings = [];
    const symbol = flatSymbols.find((s) => s.symbol === strategy.symbol);
    if (symbol?.exchange_open === false) warnings.push('Selected market is currently closed.');
    if (!availableContracts.some((c) => c.contract_type === strategy.contract_type) && availableContracts.length) warnings.push('Selected contract is not available for this symbol.');
    if (!strategy.stake || strategy.stake < 0.35) warnings.push('Stake must be at least 0.35.');
    if (!strategy.duration || strategy.duration < 1) warnings.push('Duration must be at least 1.');
    if (strategy.stopLoss && strategy.takeProfit && strategy.stopLoss > strategy.takeProfit) warnings.push('Stop loss is greater than take profit.');
    if (!strategy.demoOnly && !me.deriv_connected) warnings.push('Real mode requires a connected Deriv account.');
    return warnings;
  }

  function refreshBuilderAnalysis() {
    clearTimeout(analysisTimer);
    analysisTimer = setTimeout(() => {
      const symbol = el('s-symbol').value || 'R_100';
      const granularity = Number(el('s-gran').value || 60);
      const canvas = el('builder-chart');
      if (canvas && window.LiveChart) {
        if (!builderChart) {
          builderChart = new LiveChart(canvas, symbol, publicConfig.derivAppId);
          builderChart.connect();
          builderChartSymbol = symbol;
        } else if (builderChartSymbol !== symbol) {
          builderChart.setSymbol(symbol);
          builderChartSymbol = symbol;
        }
      }
      if (window.AIAnalysis && el('builder-ai')) AIAnalysis.render(el('builder-ai'), symbol, granularity);
    }, 250);
  }

  function refresh(skipContractLoad = false) {
    current = readForm();
    document.querySelectorAll('[data-param]').forEach((node) => {
      node.classList.toggle('hidden', node.dataset.param !== ({ ma_cross:'ma', rsi_reversal:'rsi', breakout:'breakout', digit_pattern:'digit' }[current.strategy]));
    });
    const rule = current.strategy === 'ma_cross'
      ? `Fast MA ${current.fastPeriod} crosses slow MA ${current.slowPeriod}`
      : current.strategy === 'rsi_reversal'
        ? `RSI ${current.rsiPeriod} exits ${current.oversold}-${current.overbought}`
        : current.strategy === 'digit_pattern'
          ? `Digit rule uses ${contractLabels[current.contract_type] || current.contract_type}`
          : `Close breaks previous ${current.lookback}-candle range`;
    el('buy-preview').textContent = `Buy condition: ${rule}.`;
    el('sell-preview').textContent = current.sellRule === 'disabled' ? 'Sell condition disabled.' : `Sell condition: ${current.sellRule}.`;

    const exposure = +(current.stake * Math.max(1, current.maxTradesPerDay || 1)).toFixed(2);
    const risk = Math.min(100, Math.round((current.stake * 4) + (current.maxTradesPerDay || 0) + (current.maxConsecutiveLosses || 0) * 8 + (current.demoOnly ? 0 : 20)));
    el('risk-score').textContent = `${risk}/100`;
    el('risk-meter-fill').style.width = `${risk}%`;
    el('risk-meter-fill').style.background = risk > 70 ? '#fb7185' : risk > 40 ? '#fbbf24' : '#2dd4a4';
    el('exposure-value').textContent = `$${fmt(exposure)}`;
    el('strategy-summary').innerHTML = [
      ['Market', current.symbol], ['Trade type', tradeTypeGroups.find((g) => g.id === current.tradeType)?.label || current.tradeType],
      ['Contract', contractLabels[current.contract_type] || current.contract_type], ['Stake', `$${fmt(current.stake)}`],
      ['Duration', `${current.duration}${current.durationType}`], ['Logic', rule],
    ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const symbol = flatSymbols.find((s) => s.symbol === current.symbol);
    el('market-status').innerHTML = [
      ['Status', symbol?.exchange_open === false ? 'Closed' : 'Open / available'],
      ['Family', symbol?.family || current.marketGroup],
      ['Submarket', symbol?.submarket || current.submarket],
      ['Contracts loaded', availableContracts.length || 'Pending'],
    ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const warnings = validation(current);
    el('validation-warnings').innerHTML = warnings.length ? warnings.map((w) => `<div>${esc(w)}</div>`).join('') : '<div class="ok-text">No validation warnings.</div>';
    el('builder-status').textContent = warnings.length ? 'CHECK' : 'READY';
    el('builder-status').className = `badge ${warnings.length ? 'warn' : 'real'}`;
    if (!skipContractLoad) refreshBuilderAnalysis();
  }

  function renderBlockLibrary(category = 'trade') {
    document.querySelectorAll('.builder-category').forEach((button) => button.classList.toggle('active', button.dataset.category === category));
    el('builder-block-library').innerHTML = (categoryBlocks[category] || []).map((label) => `<button class="builder-mini-block" type="button">${esc(label)}</button>`).join('');
    el('builder-block-library').querySelectorAll('button').forEach((button) => button.onclick = () => {
      log(`Added block: ${button.textContent}`);
      refresh();
    });
  }

  function strategyXml(strategy) {
    return `<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true">
  <variables></variables>
  <block type="trade_definition" x="0" y="0">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market"><field name="MARKET_LIST">${esc(strategy.marketGroup)}</field><field name="SUBMARKET_LIST">${esc(strategy.submarket)}</field><field name="SYMBOL_LIST">${esc(strategy.symbol)}</field></block>
      <block type="trade_definition_tradetype"><field name="TRADETYPE_LIST">${esc(strategy.tradeType)}</field></block>
      <block type="trade_definition_contracttype"><field name="TYPE_LIST">${esc(strategy.contract_type)}</field></block>
      <block type="trade_definition_candleinterval"><field name="CANDLEINTERVAL_LIST">${esc(strategy.granularity)}</field></block>
      <block type="trade_definition_restartonerror"><field name="RESTARTONERROR">${strategy.restartOnError ? 'TRUE' : 'FALSE'}</field></block>
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions"><field name="DURATIONTYPE_LIST">${esc(strategy.durationType)}</field><field name="CURRENCY_LIST">USD</field><value name="DURATION"><shadow type="math_number_positive"><field name="NUM">${esc(strategy.duration)}</field></shadow></value><value name="AMOUNT"><shadow type="math_number_positive"><field name="NUM">${esc(strategy.stake)}</field></shadow></value></block>
    </statement>
  </block>
  <block type="before_purchase" x="0" y="576"><statement name="BEFOREPURCHASE_STACK"><block type="purchase"><field name="PURCHASE_LIST">${esc(strategy.contract_type)}</field></block></statement></block>
  <block type="during_purchase" x="720" y="0"><statement name="DURING_PURCHASE_STACK"><block type="controls_if"><value name="IF0"><block type="check_sell"></block></value></block></statement></block>
  <block type="after_purchase" x="720" y="248"><statement name="AFTERPURCHASE_STACK"><block type="trade_again"></block></statement></block>
</xml>`;
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  async function runDemoTrade() {
    const strategy = readForm();
    const warnings = validation(strategy);
    if (warnings.length) { log(`Demo run blocked: ${warnings.join(' ')}`, 'warn'); return; }
    el('bot-run-state').textContent = 'Running demo';
    log('Starting demo run. No real trade will be placed.', 'ok');
    try {
      const result = await api('/trading/demo-trade', {
        method: 'POST',
        body: JSON.stringify({ symbol: strategy.symbol, contractType: strategy.contract_type, amount: strategy.stake, duration: strategy.duration }),
      });
      el('last-signal').textContent = `${strategy.contract_type} on ${strategy.symbol}`;
      log(`Demo trade recorded: ${result.tradeId || 'simulation'} on ${strategy.symbol}.`, 'ok');
    } catch (e) {
      log(`Demo run failed: ${e.message}${e.status === 402 ? ' Upgrade may be required for demo trading.' : ''}`, 'warn');
    } finally {
      el('bot-run-state').textContent = 'Bot is not running';
    }
  }

  document.querySelectorAll('.builder-category').forEach((button) => button.onclick = () => renderBlockLibrary(button.dataset.category));
  document.querySelectorAll('input,select').forEach((input) => input.addEventListener('input', () => refresh()));
  el('s-market-group').onchange = () => { renderSubmarkets(); current.symbol = el('s-symbol').value; loadContracts(current.symbol).then(() => refresh()); };
  el('s-submarket').onchange = () => { renderSymbols(); current.symbol = el('s-symbol').value; loadContracts(current.symbol).then(() => refresh()); };
  el('s-symbol').onchange = () => { current.symbol = el('s-symbol').value; loadContracts(current.symbol).then(() => refresh()); };
  el('s-trade-type').onchange = () => { current.tradeType = el('s-trade-type').value; renderContracts(); refresh(); };

  el('new-strategy').onclick = () => { writeForm({ ...defaults }); log('New strategy created.'); };
  el('export-bot').onclick = () => {
    const strategy = readForm();
    download(`${strategy.name.replace(/[^a-z0-9_-]+/gi, '-') || 'strategy'}.json`, JSON.stringify(strategy, null, 2), 'application/json');
    download(`${strategy.name.replace(/[^a-z0-9_-]+/gi, '-') || 'strategy'}.xml`, strategyXml(strategy), 'application/xml');
    log('Exported JSON and XML.');
  };
  el('import-bot-file').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name) || text.trim().startsWith('{')) writeForm({ ...defaults, ...JSON.parse(text) });
      else {
        const sym = text.match(/SYMBOL_LIST">([^<]+)/)?.[1] || text.match(/symbol["'>\s:]+([A-Za-z0-9_]+)/)?.[1];
        const ct = text.match(/TYPE_LIST">([^<]+)/)?.[1] || text.match(/PURCHASE_LIST">([^<]+)/)?.[1];
        writeForm({ ...defaults, name: file.name.replace(/\.[^.]+$/, ''), symbol: sym || defaults.symbol, contract_type: ct || defaults.contract_type });
      }
      log(`Imported ${file.name}.`, 'ok');
    } catch (e) {
      log(`Import failed: ${e.message}`, 'warn');
    } finally { event.target.value = ''; }
  };
  el('save-bot').onclick = async () => {
    const strategy = readForm();
    try {
      const filename = `${strategy.name.replace(/[^a-z0-9_-]+/gi, '-') || 'strategy'}.json`;
      const result = await api('/bots/import', { method:'POST', body: JSON.stringify({ filename, content: JSON.stringify(strategy, null, 2) }) });
      log(`Saved ${result.bot.name} to your bot library.`, 'ok');
    } catch (e) { log(`Save failed: ${e.message}${e.status === 401 ? ' Please log in again.' : ''}`, 'warn'); }
  };
  el('run-backtest').onclick = async () => {
    try {
      log('Starting demo backtest...');
      const result = await api('/bots/backtest', { method:'POST', body: JSON.stringify({ strategy: readForm(), granularity: Number(el('s-gran').value), count: 500 }) });
      const s = result.summary;
      el('backtest-results').classList.remove('hidden');
      el('backtest-results').innerHTML = `<div class="card"><h3>Backtest results</h3>${MiniCharts.stats([
        {label:'Trades',value:s.trades},{label:'Win rate',value:s.winRate+'%'},{label:'Net P/L',value:MiniCharts.fmt(s.netProfit),tone:s.netProfit>=0?'up':'down'},{label:'Max drawdown',value:s.maxDrawdown+'%',tone:'down'},
      ])}<div style="margin-top:12px">${MiniCharts.line(result.equityCurve, { color:'#22d3ee', area:true })}</div></div>`;
      log('Demo backtest complete.', 'ok');
    } catch (e) { log(`Backtest failed: ${e.message}`, 'warn'); }
  };
  el('run-demo').onclick = runDemoTrade;

  renderBlockLibrary('trade');
  await loadSymbols();
  writeForm(defaults);
  await loadContracts(el('s-symbol').value);
  refresh();
})();
