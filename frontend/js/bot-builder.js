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
  let canvasBlocks = [];
  let selectedBlockId = '';
  let undoStack = [];
  let redoStack = [];
  let zoom = 1;
  const AUTOSAVE_KEY = 'apexbot_builder_autosave_v2';
  const VERSION_KEY = 'apexbot_builder_versions_v1';

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

  const blockCatalog = {
    trade:[['start','Start block'],['purchase','Purchase block'],['trade_again','Trade Again block'],['condition','Condition block']],
    markets:[['market_synthetic','Derived / Synthetic'],['market_volatility','Volatility'],['market_boom_crash','Boom & Crash'],['market_step','Step'],['market_jump','Jump'],['market_forex','Forex'],['market_crypto','Crypto']],
    contracts:[['rise_fall','Rise/Fall'],['higher_lower','Higher/Lower + Barrier'],['touch_no_touch','Touch/No Touch'],['digits','Digits'],['range','Range'],['multipliers','Multipliers'],['asian','Asian'],['spreads','Spread contracts']],
    conditions:[['buy_condition','Buy condition'],['sell_condition','Sell condition'],['if_sell_available','If sell is available'],['digit_prediction','Prediction digit selector']],
    indicators:[['rsi','RSI'],['ema','EMA'],['sma','SMA'],['macd','MACD'],['bollinger','Bollinger Bands'],['stochastic','Stochastic'],['atr','ATR'],['adx','ADX'],['cci','CCI'],['momentum','Momentum'],['support','Support'],['resistance','Resistance']],
    logic:[['if','IF'],['else','ELSE'],['and','AND'],['or','OR'],['not','NOT'],['gt','>'],['lt','<'],['eq','='],['gte','>='],['lte','<='],['cross_above','Cross Above'],['cross_below','Cross Below']],
    variables:[['global_variable','Global variable'],['local_variable','Local variable'],['counter','Counter'],['trade_counter','Trade counter'],['current_profit','CurrentProfit'],['current_loss','CurrentLoss'],['wins','ConsecutiveWins'],['losses','ConsecutiveLosses'],['trade_count','TradeCount']],
    risk:[['stop_loss','Stop Loss'],['take_profit','Take Profit'],['daily_profit','Daily Profit Target'],['daily_loss','Daily Loss Limit'],['max_drawdown','Max Drawdown'],['loss_limit','Consecutive Loss Limit'],['win_limit','Consecutive Win Limit'],['max_trades','Max Trades'],['session_stop','Session Stop']],
    money:[['fixed_stake','Fixed stake'],['martingale','Martingale'],['anti_martingale','Anti-Martingale'],['custom_progression','Custom progression'],['reset_on_win','Reset on Win'],['reset_on_loss','Reset on Loss'],['max_recovery','Max Recovery Levels']],
    ai:[['ai_signal','AI Signal Block'],['ai_trend','AI Trend Confirmation'],['ai_volatility','AI Volatility Filter'],['ai_risk','AI Risk Assessment'],['ai_veto','AI Trade Veto'],['ai_confidence','AI Confidence Filter']],
    events:[['before_purchase','Before Purchase'],['after_purchase','After Purchase'],['during_trade','During Trade'],['on_win','On Win'],['on_loss','On Loss'],['on_error','On Error'],['on_disconnect','On Disconnect']],
    restart:[['trade_again','Trade again'],['restart_win','Restart after win'],['restart_loss','Restart after loss'],['cooldown','Cooldown'],['restart_error','Restart on error']],
    notifications:[['telegram','Telegram notification'],['browser_alert','Browser alert'],['execution_log','Execution log'],['signal_note','Signal note']],
    utilities:[['import_json','Import JSON'],['export_json','Export JSON'],['version_history','Version History'],['read_balance','Read balance'],['time_filter','Time filter']],
  };

  const templates = {
    rsi_reversal: { label:'RSI Reversal', strategy:'rsi_reversal', tradeType:'rise_fall', contract_type:'CALL', blocks:['start','rsi','lt','purchase','if_sell_available','trade_again','stop_loss','take_profit'] },
    ema_cross: { label:'EMA Cross', strategy:'ma_cross', blocks:['start','ema','cross_above','purchase','trade_again','stop_loss'] },
    trend_following: { label:'Trend Following', strategy:'ma_cross', blocks:['start','sma','ema','and','purchase','on_win','trade_again'] },
    bollinger_bounce: { label:'Bollinger Bounce', strategy:'breakout', blocks:['start','bollinger','condition','purchase','stop_loss','take_profit'] },
    even_odd: { label:'Even/Odd Digits', strategy:'digit_pattern', tradeType:'even_odd', contract_type:'DIGITEVEN', blocks:['start','digit_prediction','purchase','trade_again','loss_limit'] },
    over_under: { label:'Over/Under Digits', strategy:'digit_pattern', tradeType:'over_under', contract_type:'DIGITOVER', blocks:['start','digit_prediction','purchase','trade_again','stop_loss'] },
    matches_differs: { label:'Matches/Differs Digits', strategy:'digit_pattern', tradeType:'matches_differs', contract_type:'DIGITMATCH', blocks:['start','digit_prediction','purchase','trade_again'] },
    boom_spike: { label:'Boom Spike Hunter', strategy:'breakout', blocks:['start','market_boom_crash','atr','condition','purchase','session_stop'] },
    crash_spike: { label:'Crash Spike Hunter', strategy:'breakout', blocks:['start','market_boom_crash','atr','condition','purchase','session_stop'] },
    volatility_scalper: { label:'Volatility Scalper', strategy:'ma_cross', blocks:['start','market_volatility','tick_analysis','purchase','max_trades','daily_loss'] },
    martingale_recovery: { label:'Martingale Recovery', moneyMode:'martingale', blocks:['start','purchase','on_loss','martingale','max_recovery','loss_limit','trade_again'] },
    ai_assisted: { label:'AI Assisted Strategy', blocks:['start','ai_signal','ai_trend','ai_volatility','ai_risk','ai_veto','purchase','trade_again'] },
  };

  const defaults = {
    name: 'Deriv block strategy', symbol: 'R_100', strategy: 'ma_cross', contract_type: 'CALL',
    tradeType: 'rise_fall', stake: 1, duration: 5, durationType: 't', granularity: 60,
    fastPeriod: 10, slowPeriod: 30, rsiPeriod: 14, oversold: 30, overbought: 70, lookback: 20,
    sellRule: 'available', stopLoss: 10, takeProfit: 20, dailyLossLimit: 25,
    maxTradesPerDay: 20, maxConsecutiveLosses: 3, dailyProfitTarget: 30, maxDrawdown: 25,
    sessionStop: 'none', afterWin: 'continue', afterLoss: 'cooldown',
    cooldownTrades: 1, demoOnly: true, restartOnError: true, prediction: 0, barrier: '',
    comparator: '>', conditionValue: 70, moneyMode: 'fixed', multiplier: 2, maxRecoveryLevels: 3,
  };
  let current = { ...defaults };

  function log(message, tone = '') {
    const row = document.createElement('div');
    row.className = tone ? `log-${tone}` : '';
    row.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    el('builder-log').prepend(row);
  }

  function blockLabel(type) {
    return Object.values(blockCatalog).flat().find(([id]) => id === type)?.[1] || type.replace(/_/g, ' ');
  }

  function defaultBlocks(types = ['start', 'condition', 'purchase', 'trade_again', 'stop_loss', 'take_profit']) {
    return types.map((type, index) => ({
      id: `${type}-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 6)}`,
      type,
      title: blockLabel(type),
      x: 40 + (index % 2) * 330,
      y: 35 + Math.floor(index / 2) * 118,
      settings: {},
    }));
  }

  function snapshot() {
    return JSON.stringify({ strategy: readFormSafe(), canvasBlocks, selectedBlockId, zoom });
  }

  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  }

  function restoreSnapshot(raw) {
    try {
      const parsed = JSON.parse(raw);
      canvasBlocks = parsed.canvasBlocks || canvasBlocks;
      selectedBlockId = parsed.selectedBlockId || '';
      zoom = parsed.zoom || 1;
      if (parsed.strategy) writeForm(parsed.strategy, { noHistory: true, noAutosave: true });
      renderCanvas();
      refresh(true);
    } catch (e) {
      log(`Could not restore builder state: ${e.message}`, 'warn');
    }
  }

  function autosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, snapshot());
      el('autosave-status').textContent = `Autosaved ${new Date().toLocaleTimeString()}`;
    } catch {}
  }

  function saveVersion(label = 'Manual version') {
    try {
      const versions = JSON.parse(localStorage.getItem(VERSION_KEY) || '[]');
      versions.unshift({ label, at: new Date().toISOString(), state: snapshot() });
      localStorage.setItem(VERSION_KEY, JSON.stringify(versions.slice(0, 20)));
    } catch {}
  }

  function renderCanvas() {
    const blocks = el('canvas-blocks');
    blocks.style.transform = `scale(${zoom})`;
    blocks.innerHTML = canvasBlocks.map((block, index) => `
      <button class="canvas-block ${selectedBlockId === block.id ? 'selected' : ''}" draggable="true" data-block-id="${esc(block.id)}" style="left:${block.x}px;top:${block.y}px">
        <span>${index + 1}</span>
        <b>${esc(block.title)}</b>
        <small>${esc(block.type)}</small>
      </button>
    `).join('');
    el('empty-canvas').classList.toggle('hidden', canvasBlocks.length > 0);
    blocks.querySelectorAll('.canvas-block').forEach((node) => {
      node.onclick = () => { selectedBlockId = node.dataset.blockId; renderCanvas(); renderBlockProperties(); };
      node.ondragstart = (event) => {
        event.dataTransfer.setData('application/x-apex-existing-block', node.dataset.blockId);
      };
    });
    renderConnections();
    renderMiniMap();
    renderBlockProperties();
    el('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  }

  function renderConnections() {
    const svg = el('connection-layer');
    svg.innerHTML = '';
    for (let i = 0; i < canvasBlocks.length - 1; i++) {
      const a = canvasBlocks[i], b = canvasBlocks[i + 1];
      const x1 = (a.x + 250) * zoom, y1 = (a.y + 36) * zoom;
      const x2 = b.x * zoom, y2 = (b.y + 36) * zoom;
      svg.insertAdjacentHTML('beforeend', `<path d="M ${x1} ${y1} C ${x1 + 70} ${y1}, ${x2 - 70} ${y2}, ${x2} ${y2}" />`);
    }
  }

  function renderMiniMap() {
    el('mini-map').innerHTML = canvasBlocks.map((block) => `<span style="left:${Math.max(0, block.x / 8)}px;top:${Math.max(0, block.y / 8)}px"></span>`).join('');
  }

  function renderBlockProperties() {
    const block = canvasBlocks.find((b) => b.id === selectedBlockId);
    el('block-properties').innerHTML = block
      ? [
          ['Block', block.title],
          ['Type', block.type],
          ['Position', `${Math.round(block.x)}, ${Math.round(block.y)}`],
          ['Status', block.type.startsWith('ai_') ? 'Backend AI only' : 'Local builder block'],
        ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')
      : '<div><span>Selected</span><b>None</b></div>';
  }

  function addCanvasBlock(type, x = 70, y = 70) {
    pushHistory();
    const block = { id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, type, title: blockLabel(type), x, y, settings: {} };
    canvasBlocks.push(block);
    selectedBlockId = block.id;
    log(`Added block: ${block.title}`);
    renderCanvas();
    refresh();
  }

  function readFormSafe() {
    try { return readForm(); } catch { return { ...current }; }
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
      prediction: Number(el('s-prediction').value || 0),
      barrier: el('s-barrier').value.trim(),
      fastPeriod: Number(el('s-fast').value),
      slowPeriod: Number(el('s-slow').value),
      rsiPeriod: Number(el('s-rsi').value),
      oversold: Number(el('s-oversold').value),
      overbought: Number(el('s-overbought').value),
      lookback: Number(el('s-lookback').value),
      comparator: el('s-comparator').value,
      conditionValue: Number(el('s-condition-value').value || 0),
      sellRule: el('s-sell-rule').value,
      stopLoss: Number(el('s-stop-loss').value),
      takeProfit: Number(el('s-take-profit').value),
      dailyLossLimit: Number(el('s-daily-loss').value),
      dailyProfitTarget: Number(el('s-daily-profit').value),
      maxDrawdown: Number(el('s-max-drawdown').value),
      sessionStop: el('s-session-stop').value,
      maxTradesPerDay: Number(el('s-max-trades').value),
      maxConsecutiveLosses: Number(el('s-max-losses').value),
      afterWin: el('s-after-win').value,
      afterLoss: el('s-after-loss').value,
      cooldownTrades: Number(el('s-cooldown').value),
      moneyMode: el('s-money-mode').value,
      multiplier: Number(el('s-multiplier').value || 1),
      maxRecoveryLevels: Number(el('s-max-recovery').value || 0),
      demoOnly: el('s-demo-only').value !== 'false' || !me.deriv_connected,
      blocks: canvasBlocks.map((b) => ({ type: b.type, title: b.title, x: b.x, y: b.y, settings: b.settings || {} })),
    };
  }

  function writeForm(s, options = {}) {
    current = { ...defaults, ...s };
    if (!options.noHistory) pushHistory();
    el('s-name').value = current.name;
    el('s-strategy').value = current.strategy;
    el('s-gran').value = String(current.granularity || 60);
    el('s-stake').value = current.stake;
    el('s-duration').value = current.duration;
    el('s-duration-type').value = current.durationType;
    el('s-restart-error').value = String(current.restartOnError !== false);
    el('s-prediction').value = String(current.prediction ?? 0);
    el('s-barrier').value = current.barrier || '';
    el('s-fast').value = current.fastPeriod;
    el('s-slow').value = current.slowPeriod;
    el('s-rsi').value = current.rsiPeriod;
    el('s-oversold').value = current.oversold;
    el('s-overbought').value = current.overbought;
    el('s-lookback').value = current.lookback;
    el('s-comparator').value = current.comparator || '>';
    el('s-condition-value').value = current.conditionValue ?? 70;
    el('s-sell-rule').value = current.sellRule;
    el('s-stop-loss').value = current.stopLoss;
    el('s-take-profit').value = current.takeProfit;
    el('s-daily-loss').value = current.dailyLossLimit;
    el('s-daily-profit').value = current.dailyProfitTarget;
    el('s-max-drawdown').value = current.maxDrawdown;
    el('s-session-stop').value = current.sessionStop || 'none';
    el('s-max-trades').value = current.maxTradesPerDay;
    el('s-max-losses').value = current.maxConsecutiveLosses;
    el('s-after-win').value = current.afterWin;
    el('s-after-loss').value = current.afterLoss;
    el('s-cooldown').value = current.cooldownTrades;
    el('s-money-mode').value = current.moneyMode || 'fixed';
    el('s-multiplier').value = current.multiplier || 1;
    el('s-max-recovery').value = current.maxRecoveryLevels || 0;
    el('s-demo-only').value = String(current.demoOnly !== false);
    if (Array.isArray(current.blocks)) {
      canvasBlocks = current.blocks.map((b, index) => typeof b === 'string'
        ? { id: `${b}-${Date.now()}-${index}`, type: b, title: blockLabel(b), x: 60 + (index % 2) * 330, y: 50 + Math.floor(index / 2) * 116, settings: {} }
        : { id: b.id || `${b.type}-${Date.now()}-${index}`, type: b.type, title: b.title || blockLabel(b.type), x: b.x ?? 60, y: b.y ?? 50, settings: b.settings || {} });
      renderCanvas();
    }
    renderMarketSelectors();
    refresh(true);
    if (!options.noAutosave) autosave();
  }

  function validation(strategy) {
    const warnings = [];
    const symbol = flatSymbols.find((s) => s.symbol === strategy.symbol);
    if (symbol?.exchange_open === false) warnings.push('Selected market is currently closed.');
    if (!availableContracts.some((c) => c.contract_type === strategy.contract_type) && availableContracts.length) warnings.push('Selected contract is not available for this symbol.');
    if (!strategy.stake || strategy.stake < 0.35) warnings.push('Stake must be at least 0.35.');
    if (!strategy.duration || strategy.duration < 1) warnings.push('Duration must be at least 1.');
    if (!canvasBlocks.some((b) => b.type === 'purchase')) warnings.push('Missing Purchase Block.');
    if (!canvasBlocks.some((b) => ['condition','buy_condition','rsi','ema','sma','macd','bollinger','ai_signal'].includes(b.type))) warnings.push('Missing Conditions.');
    if (!canvasBlocks.some((b) => b.type === 'start')) warnings.push('Missing Start Block.');
    if (!strategy.stopLoss && !canvasBlocks.some((b) => b.type === 'stop_loss')) warnings.push('Missing Stop Loss.');
    if (strategy.stopLoss && strategy.takeProfit && strategy.stopLoss > strategy.takeProfit) warnings.push('Stop loss is greater than take profit.');
    if (strategy.moneyMode !== 'fixed' && strategy.maxRecoveryLevels > 12) warnings.push('Recovery levels are high. Reduce recovery depth.');
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
        ? `RSI ${current.rsiPeriod} ${current.comparator} ${current.conditionValue || current.oversold}`
        : current.strategy === 'digit_pattern'
          ? `Digit rule uses ${contractLabels[current.contract_type] || current.contract_type} with prediction ${current.prediction}`
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
      ['Money mode', current.moneyMode], ['AI blocks', canvasBlocks.filter((b) => b.type.startsWith('ai_')).length],
    ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const symbol = flatSymbols.find((s) => s.symbol === current.symbol);
    el('market-status').innerHTML = [
      ['Status', symbol?.exchange_open === false ? 'Closed' : 'Open / available'],
      ['Family', symbol?.family || current.marketGroup],
      ['Submarket', symbol?.submarket || current.submarket],
      ['Contracts loaded', availableContracts.length || 'Pending'],
      ['Connection', 'Backend Deriv feed'],
    ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    el('ai-summary').innerHTML = [
      ['Confidence', canvasBlocks.some((b) => b.type === 'ai_confidence') ? 'Backend required' : 'Not enabled'],
      ['Risk', canvasBlocks.some((b) => b.type === 'ai_risk') ? 'Backend required' : 'Not enabled'],
      ['Market used', current.symbol],
    ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const warnings = validation(current);
    el('validation-warnings').innerHTML = warnings.length ? warnings.map((w) => `<div>${esc(w)}</div>`).join('') : '<div class="ok-text">No validation warnings.</div>';
    el('builder-status').textContent = warnings.length ? 'CHECK' : 'READY';
    el('builder-status').className = `badge ${warnings.length ? 'warn' : 'real'}`;
    autosave();
    if (!skipContractLoad) refreshBuilderAnalysis();
  }

  function renderBlockLibrary(category = 'trade') {
    document.querySelectorAll('.builder-category').forEach((button) => button.classList.toggle('active', button.dataset.category === category));
    el('builder-block-library').innerHTML = (blockCatalog[category] || []).map(([type, label]) => `<button class="builder-mini-block" type="button" draggable="true" data-block-type="${esc(type)}">${esc(label)}</button>`).join('');
    el('builder-block-library').querySelectorAll('button').forEach((button) => button.onclick = () => {
      addCanvasBlock(button.dataset.blockType);
    });
    el('builder-block-library').querySelectorAll('button').forEach((button) => {
      button.ondragstart = (event) => event.dataTransfer.setData('application/x-apex-block', button.dataset.blockType);
    });
  }

  async function loadTradingDashboard() {
    try {
      const summary = await api('/account/summary');
      el('trading-dashboard').innerHTML = [
        ['Mode', summary.mode?.toUpperCase() || 'DEMO'],
        ['Balance', `${summary.currency || 'USD'} ${fmt(summary.balance)}`],
        ['Equity', `${summary.currency || 'USD'} ${fmt(summary.equity)}`],
        ['Daily P/L', fmt(summary.profitLoss?.daily)],
        ['Open Positions', summary.openPositions ?? 0],
        ['Connection', summary.mode === 'real' ? 'Deriv connected' : 'Demo ledger'],
      ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    } catch (e) {
      el('trading-dashboard').innerHTML = `<div><span>Status</span><b>${esc(e.message)}</b></div>`;
    }
  }

  function renderTemplates() {
    el('template-picker').innerHTML = '<option value="">Templates</option>' +
      Object.entries(templates).map(([id, t]) => `<option value="${id}">${esc(t.label)}</option>`).join('');
  }

  function applyTemplate(id) {
    const t = templates[id];
    if (!t) return;
    pushHistory();
    writeForm({ ...defaults, ...t, name: t.label, blocks: t.blocks }, { noHistory: true });
    log(`Loaded template: ${t.label}`, 'ok');
  }

  function canvasPoint(event) {
    const rect = el('drag-canvas').getBoundingClientRect();
    const snap = el('snap-grid').checked ? 20 : 1;
    return {
      x: Math.max(0, Math.round(((event.clientX - rect.left) / zoom) / snap) * snap),
      y: Math.max(0, Math.round(((event.clientY - rect.top) / zoom) / snap) * snap),
    };
  }

  function setupCanvasDragDrop() {
    const canvas = el('drag-canvas');
    canvas.ondragover = (event) => event.preventDefault();
    canvas.ondrop = (event) => {
      event.preventDefault();
      const point = canvasPoint(event);
      const type = event.dataTransfer.getData('application/x-apex-block');
      const existingId = event.dataTransfer.getData('application/x-apex-existing-block');
      if (type) {
        addCanvasBlock(type, point.x, point.y);
        return;
      }
      if (existingId) {
        const block = canvasBlocks.find((b) => b.id === existingId);
        if (block) {
          pushHistory();
          block.x = point.x;
          block.y = point.y;
          selectedBlockId = block.id;
          renderCanvas();
          refresh();
        }
      }
    };
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
      <block type="apex_canvas_blocks"><field name="COUNT">${canvasBlocks.length}</field></block>
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

  el('new-strategy').onclick = () => { writeForm({ ...defaults, blocks: defaultBlocks().map((b) => b.type) }); log('New strategy created.'); };
  el('duplicate-strategy').onclick = () => {
    const strategy = readForm();
    writeForm({ ...strategy, name: `${strategy.name} copy`, blocks: canvasBlocks.map((b) => ({ ...b, id: undefined, x: b.x + 24, y: b.y + 24 })) });
    log('Duplicated current strategy.', 'ok');
  };
  el('clone-strategy').onclick = () => {
    const strategy = readForm();
    download(`${strategy.name.replace(/[^a-z0-9_-]+/gi, '-') || 'strategy'}-clone.json`, JSON.stringify(strategy, null, 2), 'application/json');
    log('Clone exported locally. Marketplace clone workflow is prepared for backend integration.', 'ok');
  };
  el('update-strategy').onclick = () => {
    saveVersion('Update snapshot');
    log('Update snapshot saved locally. Existing published-strategy update needs marketplace backend integration.', 'ok');
  };
  el('publish-strategy').onclick = () => {
    saveVersion('Publish draft');
    log('Publish draft prepared locally. Public marketplace publishing is not enabled without backend approval.', 'warn');
  };
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
  el('template-picker').onchange = () => applyTemplate(el('template-picker').value);
  el('undo-builder').onclick = () => {
    if (!undoStack.length) return log('Nothing to undo.', 'warn');
    redoStack.push(snapshot());
    restoreSnapshot(undoStack.pop());
    log('Undo applied.');
  };
  el('redo-builder').onclick = () => {
    if (!redoStack.length) return log('Nothing to redo.', 'warn');
    undoStack.push(snapshot());
    restoreSnapshot(redoStack.pop());
    log('Redo applied.');
  };
  el('zoom-in').onclick = () => { zoom = Math.min(1.4, +(zoom + 0.1).toFixed(2)); renderCanvas(); autosave(); };
  el('zoom-out').onclick = () => { zoom = Math.max(0.7, +(zoom - 0.1).toFixed(2)); renderCanvas(); autosave(); };

  setupCanvasDragDrop();
  renderTemplates();
  renderBlockLibrary('trade');
  await loadSymbols();
  const saved = localStorage.getItem(AUTOSAVE_KEY);
  if (saved) restoreSnapshot(saved);
  else writeForm({ ...defaults, blocks: defaultBlocks().map((b) => b.type) });
  await loadContracts(el('s-symbol').value);
  await loadTradingDashboard();
  refresh();
})();
