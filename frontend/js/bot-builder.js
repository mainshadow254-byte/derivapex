(async function () {
  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const num = (id, fallback = 0) => Number(el(id)?.value || fallback);
  const val = (id, fallback = '') => el(id)?.value || fallback;
  const checked = (id) => !!el(id)?.checked;
  const fmt = (n) => Number(n || 0).toFixed(2);

  if (window.DerivOnboard) DerivOnboard.wireOAuth(document);
  if (window.ContentProtection && window.Auth?.isLoggedIn) {
    try { ContentProtection.init('ApexBot Builder'); } catch {}
  }

  const API_BASE = (window.ApexConfig?.apiBaseUrl || window.APEX_CONFIG?.API_BASE_URL || '').replace(/\/$/, '');
  const AUTOSAVE_KEY = 'apexbot_dbot_flow_v1';
  const RESULTS_PANEL_KEY = 'apexbot_results_panel_open_v1';

  const tradeTypeGroups = [
    { id:'rise_fall', label:'Rise/Fall', categories:['callput'], contracts:['CALL','PUT'] },
    { id:'higher_lower', label:'Higher/Lower', categories:['highlowticks','higherlower'], contracts:['CALL','PUT'] },
    { id:'touch_no_touch', label:'Touch/No Touch', categories:['touchnotouch'], contracts:['ONETOUCH','NOTOUCH'] },
    { id:'ends_between_outside', label:'Ends Between / Ends Outside', categories:['endsinout'], contracts:['EXPIRYRANGE','EXPIRYMISS'] },
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
    CALL:'Rise', PUT:'Fall', ONETOUCH:'Touch', NOTOUCH:'No Touch',
    EXPIRYRANGE:'Ends Between', EXPIRYMISS:'Ends Outside', RANGE:'Stays Between', UPORDOWN:'Goes Outside',
    DIGITMATCH:'Matches', DIGITDIFF:'Differs', DIGITEVEN:'Even', DIGITODD:'Odd', DIGITOVER:'Over', DIGITUNDER:'Under',
    ASIANU:'Asian Up', ASIAND:'Asian Down', RESETCALL:'Reset Call', RESETPUT:'Reset Put',
    CALLSPREAD:'Call Spread', PUTSPREAD:'Put Spread', MULTUP:'Multiplier Up', MULTDOWN:'Multiplier Down',
  };

  const blockCatalog = {
    trade: {
      title: 'Trade Parameters',
      blocks: [['trade_definition', 'Trade definition'], ['trade_options', 'Trade options'], ['purchase', 'Purchase'], ['run_once', 'Run once at start']],
    },
    markets: {
      title: 'Markets',
      blocks: [['synthetic', 'Synthetic / Derived'], ['volatility', 'Volatility indices'], ['boom_crash', 'Boom & Crash'], ['step_jump', 'Step / Jump'], ['forex_crypto', 'Forex / Crypto']],
    },
    conditions: {
      title: 'Conditions',
      blocks: [['if', 'If'], ['then', 'Then'], ['sell_available', 'Sell is available'], ['compare', 'Compare'], ['digit_prediction', 'Digit prediction']],
    },
    indicators: {
      title: 'Indicators',
      blocks: [['rsi', 'RSI'], ['ma', 'Moving average'], ['bollinger', 'Bollinger bands'], ['macd', 'MACD'], ['breakout', 'Breakout range']],
    },
    risk: {
      title: 'Risk Management',
      blocks: [['stop_loss', 'Stop loss'], ['take_profit', 'Take profit'], ['daily_loss', 'Max daily loss'], ['max_trades', 'Max trades'], ['loss_limit', 'Consecutive loss limit']],
    },
    restart: {
      title: 'Restart Logic',
      blocks: [['trade_again', 'Trade again'], ['after_win', 'After win'], ['after_loss', 'After loss'], ['cooldown', 'Cooldown'], ['restart_error', 'Restart on error']],
    },
    notifications: {
      title: 'Notifications',
      blocks: [['log', 'Execution log'], ['browser_alert', 'Browser alert'], ['telegram', 'Telegram alert']],
    },
    utilities: {
      title: 'Utilities',
      blocks: [['import', 'Import'], ['export', 'Export'], ['comment', 'Comment'], ['wait', 'Wait']],
    },
  };

  const defaults = {
    name: 'ApexBot block strategy',
    symbol: 'R_100',
    tradeType: 'rise_fall',
    contract_type: 'CALL',
    strategy: 'ma_cross',
    stake: 1,
    duration: 1,
    durationType: 't',
    granularity: 60,
    fastPeriod: 10,
    slowPeriod: 30,
    rsiPeriod: 14,
    conditionValue: 30,
    lookback: 20,
    comparator: '>',
    prediction: '1',
    barrier: '',
    sellRule: 'available',
    restartOnError: true,
    afterWin: 'continue',
    afterLoss: 'continue',
    stopLoss: 10,
    takeProfit: 20,
    dailyLossLimit: 25,
    maxTradesPerDay: 20,
    maxConsecutiveLosses: 3,
    cooldownTrades: 0,
    moneyMode: 'fixed',
    multiplier: 2,
    demoOnly: true,
    stacks: {
      start: ['start trading condition'],
      buy: ['purchase selected contract'],
      sell: ['sell if available'],
      restart: ['trade again'],
    },
  };

  let current = { ...defaults, stacks: structuredCloneSafe(defaults.stacks) };
  let flatSymbols = [];
  let availableContracts = [];
  const botStats = { runs: 0, stake: 0, payout: 0, won: 0, lost: 0, profit: 0 };
  const transactions = [];

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function authHeaders() {
    const token = window.Auth?.token || window.pb?.authStore?.token || localStorage.getItem('pb_auth') && '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function request(path, options = {}) {
    if (typeof window.api === 'function') return api(path, options);
    const res = await fetch(`${API_BASE}/api${path}`, {
      ...options,
      headers: { 'Content-Type':'application/json', ...authHeaders(), ...(options.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  function log(message, tone = '') {
    const row = document.createElement('div');
    row.className = tone ? `log-${tone}` : '';
    row.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    el('builder-log').prepend(row);
    while (el('builder-log').children.length > 80) el('builder-log').lastElementChild.remove();
  }

  function setResultsPanel(open = true, tab = '') {
    el('bot-results-panel').classList.toggle('minimized', !open);
    el('minimize-results').textContent = open ? 'Hide' : 'Show';
    el('minimize-results').setAttribute('aria-label', open ? 'Minimize results panel' : 'Show results panel');
    try { localStorage.setItem(RESULTS_PANEL_KEY, open ? 'open' : 'closed'); } catch {}
    if (tab) setResultTab(tab);
  }

  function setResultTab(tab) {
    document.querySelectorAll('.bot-result-tab').forEach((button) => button.classList.toggle('active', button.dataset.resultTab === tab));
    document.querySelectorAll('.bot-result-view').forEach((view) => view.classList.toggle('active', view.dataset.resultView === tab));
  }

  function renderTransactions() {
    el('transaction-list').innerHTML = transactions.length ? `
      <table class="bot-transactions-table">
        <thead><tr><th>Time</th><th>Market</th><th>Contract</th><th>Stake</th><th>Status</th></tr></thead>
        <tbody>${transactions.map((tx) => `<tr><td>${esc(tx.time)}</td><td>${esc(tx.symbol)}</td><td>${esc(tx.contract)}</td><td>${esc(tx.stake)}</td><td>${esc(tx.status)}</td></tr>`).join('')}</tbody>
      </table>
    ` : 'No transactions yet. Demo transactions will appear after Run.';
  }

  function renderSummary() {
    el('summary-stake').textContent = `${fmt(botStats.stake)} AUD`;
    el('summary-payout').textContent = `${fmt(botStats.payout)} AUD`;
    el('summary-runs').textContent = botStats.runs;
    el('summary-lost').textContent = botStats.lost;
    el('summary-won').textContent = botStats.won;
    el('summary-profit').textContent = `${fmt(botStats.profit)} AUD`;
    el('summary-ready-text').classList.toggle('hidden', botStats.runs > 0);
  }

  function classifySymbol(s) {
    const text = `${s.symbol} ${s.name} ${s.market} ${s.submarket}`.toLowerCase();
    if (text.includes('boom') || text.includes('crash')) return 'Boom & Crash';
    if (text.includes('step')) return 'Step';
    if (text.includes('jump') || /^jd/i.test(s.symbol)) return 'Jump';
    if (text.includes('range break') || /^rd/i.test(s.symbol)) return 'Range Break';
    if (text.includes('forex') || /^frx/i.test(s.symbol)) return 'Forex';
    if (text.includes('crypto') || /^cry/i.test(s.symbol)) return 'Crypto';
    if (text.includes('volatility') || /^r_/i.test(s.symbol)) return 'Volatility';
    if (text.includes('drift') || text.includes('dex')) return 'Other Synthetic';
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
      const { groups } = await request('/market/symbols');
      flatSymbols = normalizeSymbols(groups);
      el('market-state').textContent = `${flatSymbols.length} Deriv symbols`;
      log(`Loaded ${flatSymbols.length} live Deriv symbols.`, 'ok');
    } catch (e) {
      flatSymbols = [
        { symbol:'R_10', name:'Volatility 10 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
        { symbol:'R_25', name:'Volatility 25 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
        { symbol:'R_50', name:'Volatility 50 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
        { symbol:'R_75', name:'Volatility 75 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
        { symbol:'R_100', name:'Volatility 100 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
      ];
      el('market-state').textContent = 'Fallback symbols';
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
    const group = val('s-market-group');
    const symbols = flatSymbols.filter((s) => (s.family || s.market || 'Other') === group);
    const subs = [...new Set(symbols.map((s) => s.submarket || group))];
    el('s-submarket').innerHTML = subs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (preferred && subs.includes(preferred)) el('s-submarket').value = preferred;
    renderSymbols();
  }

  function renderSymbols() {
    const group = val('s-market-group');
    const sub = val('s-submarket');
    const symbols = flatSymbols.filter((s) => (s.family || s.market || 'Other') === group && (s.submarket || group) === sub);
    el('s-symbol').innerHTML = symbols.map((s) => `<option value="${esc(s.symbol)}">${esc(s.name || s.symbol)}${s.exchange_open === false ? ' (closed)' : ''}</option>`).join('');
    if (symbols.some((s) => s.symbol === current.symbol)) el('s-symbol').value = current.symbol;
    else if (symbols[0]) el('s-symbol').value = symbols[0].symbol;
  }

  function contractMatchesGroup(group, contract) {
    return group.contracts.includes(contract.contract_type)
      && (!group.categories.length || group.categories.includes(String(contract.contract_category || '').toLowerCase()));
  }

  async function loadContracts(symbol) {
    availableContracts = [];
    el('contract-warning').classList.add('hidden');
    try {
      const res = await request(`/market/contracts?symbol=${encodeURIComponent(symbol)}`);
      availableContracts = res.contracts || [];
      log(`Loaded ${availableContracts.length} contracts for ${symbol}.`, 'ok');
    } catch (e) {
      el('contract-warning').textContent = `Contracts unavailable for ${symbol}: ${e.message}`;
      el('contract-warning').classList.remove('hidden');
      log(`Contracts unavailable for ${symbol}: ${e.message}`, 'warn');
    }
    renderTradeTypes();
  }

  function renderTradeTypes() {
    const usable = availableContracts.length
      ? tradeTypeGroups.filter((group) => availableContracts.some((contract) => contractMatchesGroup(group, contract)))
      : tradeTypeGroups.slice(0, 4);
    el('s-trade-type').innerHTML = usable.map((group) => `<option value="${group.id}">${esc(group.label)}</option>`).join('');
    if (usable.some((group) => group.id === current.tradeType)) el('s-trade-type').value = current.tradeType;
    renderContracts();
  }

  function renderContracts() {
    const group = tradeTypeGroups.find((g) => g.id === val('s-trade-type')) || tradeTypeGroups[0];
    const metas = availableContracts.length
      ? availableContracts.filter((contract) => contractMatchesGroup(group, contract))
      : group.contracts.map((contract_type) => ({ contract_type }));
    el('s-contract').innerHTML = metas.map((meta) => {
      const label = meta.contract_display || contractLabels[meta.contract_type] || meta.contract_type;
      return `<option value="${esc(meta.contract_type)}">${esc(label)}</option>`;
    }).join('');
    if (metas.some((meta) => meta.contract_type === current.contract_type)) el('s-contract').value = current.contract_type;
    else if (metas[0]) el('s-contract').value = metas[0].contract_type;
    if (!metas.length) {
      el('contract-warning').textContent = `${group.label} is not available for ${val('s-symbol')}.`;
      el('contract-warning').classList.remove('hidden');
    }
  }

  function renderToolbox(category = 'trade') {
    const catalog = blockCatalog[category] || blockCatalog.trade;
    el('toolbox-title').textContent = catalog.title;
    document.querySelectorAll('.dbot-tool-icon').forEach((button) => button.classList.toggle('active', button.dataset.category === category));
    el('builder-block-library').innerHTML = catalog.blocks.map(([type, label]) => (
      `<button class="toolbox-block" draggable="true" data-block-type="${esc(type)}" type="button"><span>${esc(type)}</span><b>${esc(label)}</b></button>`
    )).join('');
    el('builder-block-library').querySelectorAll('.toolbox-block').forEach((button) => {
      button.onclick = () => addBlock(button.dataset.blockType);
      button.ondragstart = (event) => event.dataTransfer.setData('application/x-apex-block', button.dataset.blockType);
    });
  }

  function targetZoneFor(type) {
    if (['trade_definition','trade_options','run_once','synthetic','volatility','boom_crash','step_jump','forex_crypto'].includes(type)) return 'start';
    if (['sell_available'].includes(type)) return 'sell';
    if (['trade_again','after_win','after_loss','cooldown','restart_error'].includes(type)) return 'restart';
    return 'buy';
  }

  function addBlock(type, zone = targetZoneFor(type)) {
    current.stacks[zone] ||= [];
    const label = blockLabel(type);
    if (current.stacks[zone].includes(label)) {
      log(`${label} is already in this block stack.`, 'warn');
      return;
    }
    current.stacks[zone].push(label);
    renderStacks();
    refresh();
    log(`Added block: ${blockLabel(type)}`);
  }

  function blockLabel(type) {
    return Object.values(blockCatalog).flatMap((group) => group.blocks).find(([id]) => id === type)?.[1] || type.replace(/_/g, ' ');
  }

  function renderStacks() {
    Object.entries({ start:'start-stack', buy:'buy-stack', sell:'sell-stack', restart:'restart-stack' }).forEach(([zone, id]) => {
      const rows = current.stacks?.[zone] || [];
      el(id).innerHTML = rows.map((label, index) => (
        `<div class="dbot-nested-block" draggable="true" data-zone="${zone}" data-index="${index}">
          <b>${esc(label)}</b><button class="block-remove" type="button" title="Remove block">x</button>
        </div>`
      )).join('');
    });
    document.querySelectorAll('.block-remove').forEach((button) => {
      button.onclick = () => {
        const node = button.closest('.dbot-nested-block');
        current.stacks[node.dataset.zone].splice(Number(node.dataset.index), 1);
        renderStacks();
        refresh();
      };
    });
  }

  function setupDrops() {
    document.querySelectorAll('.dbot-drop-slot').forEach((zone) => {
      zone.ondragover = (event) => event.preventDefault();
      zone.ondrop = (event) => {
        event.preventDefault();
        const type = event.dataTransfer.getData('application/x-apex-block');
        if (type) addBlock(type, zone.dataset.zone);
      };
    });
  }

  function readForm() {
    return {
      ...current,
      name: val('s-name', defaults.name),
      marketGroup: val('s-market-group'),
      submarket: val('s-submarket'),
      symbol: val('s-symbol', defaults.symbol),
      tradeType: val('s-trade-type', defaults.tradeType),
      contract_type: val('s-contract', defaults.contract_type),
      strategy: val('s-strategy', defaults.strategy),
      stake: num('s-stake', defaults.stake),
      duration: num('s-duration', defaults.duration),
      durationType: val('s-duration-type', defaults.durationType),
      granularity: num('s-gran', defaults.granularity),
      restartOnError: checked('s-restart-error'),
      fastPeriod: num('s-fast', defaults.fastPeriod),
      slowPeriod: num('s-slow', defaults.slowPeriod),
      rsiPeriod: num('s-rsi', defaults.rsiPeriod),
      conditionValue: num('s-condition-value', defaults.conditionValue),
      lookback: num('s-lookback', defaults.lookback),
      comparator: val('s-comparator', defaults.comparator),
      prediction: val('s-prediction', defaults.prediction),
      barrier: val('s-barrier'),
      sellRule: val('s-sell-rule', defaults.sellRule),
      afterWin: val('s-after-win', defaults.afterWin),
      afterLoss: val('s-after-loss', defaults.afterLoss),
      stopLoss: num('s-stop-loss', defaults.stopLoss),
      takeProfit: num('s-take-profit', defaults.takeProfit),
      dailyLossLimit: num('s-daily-loss', defaults.dailyLossLimit),
      maxTradesPerDay: num('s-max-trades', defaults.maxTradesPerDay),
      maxConsecutiveLosses: num('s-max-losses', defaults.maxConsecutiveLosses),
      cooldownTrades: num('s-cooldown', defaults.cooldownTrades),
      moneyMode: val('s-money-mode', defaults.moneyMode),
      multiplier: num('s-multiplier', defaults.multiplier),
      demoOnly: checked('s-demo-only'),
      stacks: structuredCloneSafe(current.stacks),
    };
  }

  function writeForm(strategy) {
    current = { ...defaults, ...strategy, stacks: structuredCloneSafe(strategy.stacks || defaults.stacks) };
    el('s-name').value = current.name;
    el('s-duration').value = current.duration;
    el('s-duration-type').value = current.durationType;
    el('s-stake').value = current.stake;
    el('s-gran').value = current.granularity;
    el('s-restart-error').checked = !!current.restartOnError;
    el('s-strategy').value = current.strategy;
    el('s-fast').value = current.fastPeriod;
    el('s-slow').value = current.slowPeriod;
    el('s-rsi').value = current.rsiPeriod;
    el('s-condition-value').value = current.conditionValue;
    el('s-lookback').value = current.lookback;
    el('s-comparator').value = current.comparator;
    el('s-prediction').value = current.prediction;
    el('s-barrier').value = current.barrier;
    el('s-sell-rule').value = current.sellRule;
    el('s-after-win').value = current.afterWin;
    el('s-after-loss').value = current.afterLoss;
    el('s-stop-loss').value = current.stopLoss;
    el('s-take-profit').value = current.takeProfit;
    el('s-daily-loss').value = current.dailyLossLimit;
    el('s-max-trades').value = current.maxTradesPerDay;
    el('s-max-losses').value = current.maxConsecutiveLosses;
    el('s-cooldown').value = current.cooldownTrades;
    el('s-money-mode').value = current.moneyMode;
    el('s-multiplier').value = current.multiplier;
    el('s-demo-only').checked = current.demoOnly !== false;
    renderMarketSelectors();
    renderStacks();
    refresh();
  }

  function warnings(strategy) {
    const list = [];
    const symbol = flatSymbols.find((s) => s.symbol === strategy.symbol);
    if (symbol?.exchange_open === false) list.push('Selected market is closed.');
    if (availableContracts.length && !availableContracts.some((c) => c.contract_type === strategy.contract_type)) list.push('Selected contract is unavailable for this symbol.');
    if (strategy.stake < 0.35) list.push('Stake must be at least 0.35.');
    if (strategy.duration < 1) list.push('Duration must be at least 1.');
    if (!strategy.stacks.buy?.length) list.push('Buy conditions are empty.');
    if (!strategy.stacks.restart?.length) list.push('Restart trading conditions are empty.');
    if (strategy.stopLoss > strategy.takeProfit && strategy.takeProfit > 0) list.push('Stop loss is greater than take profit.');
    if (!strategy.demoOnly && !window.Auth?.user?.deriv_connected) list.push('Real mode requires Deriv connection and safety confirmation.');
    return list;
  }

  function autosave() {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(readForm())); } catch {}
  }

  function refresh() {
    current = readForm();
    document.querySelectorAll('[data-param]').forEach((node) => {
      node.classList.toggle('hidden', node.dataset.param !== ({ ma_cross:'ma', rsi_reversal:'rsi', breakout:'breakout', digit_pattern:'digit' }[current.strategy]));
    });
    const risk = Math.min(100, Math.round((current.stake * 4) + current.maxTradesPerDay + current.maxConsecutiveLosses * 8 + (current.moneyMode === 'martingale' ? 18 : 0)));
    const list = warnings(current);
    el('validation-warnings').innerHTML = list.length ? list.map((w) => `<div>${esc(w)}</div>`).join('') : '<div class="ok-text">No validation errors.</div>';
    el('validation-warnings').dataset.risk = `Risk: ${risk}/100 | Exposure: AUD ${fmt(current.stake * current.maxTradesPerDay)}`;
    autosave();
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function strategyXml(strategy) {
    return `<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true">
  <block type="trade_definition" x="0" y="0">
    <field name="SYMBOL">${esc(strategy.symbol)}</field>
    <field name="TRADETYPE">${esc(strategy.tradeType)}</field>
    <field name="CONTRACTTYPE">${esc(strategy.contract_type)}</field>
    <field name="DURATION">${esc(strategy.duration)}</field>
    <field name="AMOUNT">${esc(strategy.stake)}</field>
  </block>
  <block type="before_purchase" x="0" y="360"><field name="CONDITION">${esc(strategy.strategy)}</field></block>
  <block type="during_purchase" x="620" y="0"><field name="SELL">${esc(strategy.sellRule)}</field></block>
  <block type="after_purchase" x="620" y="220"><field name="RESTART">${esc(strategy.afterWin)}/${esc(strategy.afterLoss)}</field></block>
</xml>`;
  }

  async function runDemoTrade() {
    const strategy = readForm();
    const list = warnings(strategy);
    if (list.length) {
      setResultsPanel(true, 'journal');
      log(`Run blocked: ${list.join(' ')}`, 'warn');
      return;
    }
    el('bot-run-state').textContent = 'Running demo';
    setResultsPanel(true, 'journal');
    log('Starting demo run. No real trade will be placed.', 'ok');
    try {
      const result = await request('/trading/demo-trade', {
        method: 'POST',
        body: JSON.stringify({ symbol: strategy.symbol, contractType: strategy.contract_type, amount: strategy.stake, duration: strategy.duration }),
      });
      el('last-signal').textContent = `${strategy.contract_type} on ${strategy.symbol}`;
      botStats.runs += 1;
      botStats.stake += strategy.stake;
      transactions.unshift({
        time: new Date().toLocaleTimeString(),
        symbol: strategy.symbol,
        contract: strategy.contract_type,
        stake: `${fmt(strategy.stake)} AUD`,
        status: result.tradeId ? 'Demo recorded' : 'Demo simulation',
      });
      renderSummary();
      renderTransactions();
      log(`Demo trade recorded: ${result.tradeId || 'simulation'}.`, 'ok');
    } catch (e) {
      const login = e.status === 401 ? ' Login is required to run the demo bot.' : '';
      log(`Demo run failed: ${e.message}.${login}`, 'warn');
    } finally {
      el('bot-run-state').textContent = 'Bot is not running';
    }
  }

  document.querySelectorAll('.dbot-tool-icon').forEach((button) => button.onclick = () => renderToolbox(button.dataset.category));
  document.querySelectorAll('input,select').forEach((input) => input.addEventListener('input', refresh));
  el('s-market-group').onchange = () => { renderSubmarkets(); current.symbol = val('s-symbol'); loadContracts(current.symbol).then(refresh); };
  el('s-submarket').onchange = () => { renderSymbols(); current.symbol = val('s-symbol'); loadContracts(current.symbol).then(refresh); };
  el('s-symbol').onchange = () => { current.symbol = val('s-symbol'); loadContracts(current.symbol).then(refresh); };
  el('s-trade-type').onchange = () => { current.tradeType = val('s-trade-type'); renderContracts(); refresh(); };
  el('quick-strategy').onclick = () => {
    writeForm({ ...defaults, name: 'Quick Rise/Fall strategy' });
    log('Quick strategy loaded.', 'ok');
  };
  el('new-strategy').onclick = () => {
    writeForm({ ...defaults, name: 'ApexBot block strategy', stacks: structuredCloneSafe(defaults.stacks) });
    log('New strategy created.');
  };
  el('save-bot').onclick = async () => {
    const strategy = readForm();
    try {
      const filename = `${strategy.name.replace(/[^a-z0-9_-]+/gi, '-') || 'strategy'}.json`;
      const result = await request('/bots/import', { method:'POST', body: JSON.stringify({ filename, content: JSON.stringify(strategy, null, 2) }) });
      log(`Saved ${result.bot?.name || strategy.name} to your bot library.`, 'ok');
    } catch (e) {
      const login = e.status === 401 ? ' Please log in first.' : '';
      log(`Save failed: ${e.message}.${login}`, 'warn');
    }
  };
  el('export-bot').onclick = () => {
    const strategy = readForm();
    const base = strategy.name.replace(/[^a-z0-9_-]+/gi, '-') || 'strategy';
    download(`${base}.json`, JSON.stringify(strategy, null, 2), 'application/json');
    download(`${base}.xml`, strategyXml(strategy), 'application/xml');
    log('Exported JSON and XML.', 'ok');
  };
  el('import-bot-file').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name) || text.trim().startsWith('{')) writeForm({ ...defaults, ...JSON.parse(text) });
      else {
        const sym = text.match(/SYMBOL(?:_LIST)?">([^<]+)/)?.[1] || text.match(/symbol["'>\s:]+([A-Za-z0-9_]+)/i)?.[1];
        const contract = text.match(/CONTRACTTYPE">([^<]+)/)?.[1] || text.match(/TYPE_LIST">([^<]+)/)?.[1] || text.match(/PURCHASE_LIST">([^<]+)/)?.[1];
        writeForm({ ...defaults, name: file.name.replace(/\.[^.]+$/, ''), symbol: sym || defaults.symbol, contract_type: contract || defaults.contract_type });
      }
      await loadContracts(val('s-symbol'));
      log(`Imported ${file.name}.`, 'ok');
    } catch (e) {
      log(`Import failed: ${e.message}`, 'warn');
    } finally {
      event.target.value = '';
    }
  };
  el('run-backtest').onclick = () => {
    setResultsPanel(true, 'summary');
    log('Backtest demo is prepared from the current block settings. Use Run for demo execution.', 'ok');
  };
  el('run-demo-bottom').onclick = runDemoTrade;
  el('toggle-log').onclick = () => setResultsPanel(true, 'summary');
  el('minimize-results').onclick = () => setResultsPanel(el('bot-results-panel').classList.contains('minimized'));
  document.querySelectorAll('.bot-result-tab').forEach((button) => button.onclick = () => setResultsPanel(true, button.dataset.resultTab));

  renderToolbox('trade');
  setupDrops();
  await loadSymbols();
  const saved = localStorage.getItem(AUTOSAVE_KEY);
  if (saved) {
    try { writeForm({ ...defaults, ...JSON.parse(saved) }); }
    catch { writeForm(defaults); }
  } else {
    writeForm(defaults);
  }
  await loadContracts(val('s-symbol'));
  renderSummary();
  renderTransactions();
  refresh();
  setResultsPanel(localStorage.getItem(RESULTS_PANEL_KEY) === 'open');
})();
