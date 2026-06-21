(async function () {
  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const fmt = (value) => Number(value || 0).toFixed(2);
  const uid = () => Math.random().toString(36).slice(2, 8);

  if (window.DerivOnboard) DerivOnboard.wireOAuth(document);
  if (window.ContentProtection && window.Auth?.isLoggedIn) {
    try { ContentProtection.init('ApexBot Builder'); } catch {}
  }

  const AUTOSAVE_KEY = 'apexbot_visual_strategy_v1';
  const WORKSTATION_KEY = 'apexbot_workstation_open_v1';
  const API_BASE = (window.APEX?.API_BASE || `${(window.APEX_CONFIG?.API_BASE_URL || '').replace(/\/$/, '')}/api`).replace(/\/$/, '');

  const tradeTypeGroups = [
    { id:'rise_fall', label:'Rise/Fall', categories:['callput'], contracts:['CALL','PUT'] },
    { id:'higher_lower', label:'Higher/Lower', categories:['highlowticks','higherlower'], contracts:['CALL','PUT'] },
    { id:'touch_no_touch', label:'Touch/No Touch', categories:['touchnotouch'], contracts:['ONETOUCH','NOTOUCH'] },
    { id:'ends_between_outside', label:'Ends Between / Ends Outside', categories:['endsinout'], contracts:['EXPIRYRANGE','EXPIRYMISS'] },
    { id:'stays_goes', label:'Stays Between / Goes Outside', categories:['staysinout'], contracts:['RANGE','UPORDOWN'] },
    { id:'matches_differs', label:'Matches/Differs', categories:['digits'], contracts:['DIGITMATCH','DIGITDIFF'] },
    { id:'even_odd', label:'Even/Odd', categories:['digits'], contracts:['DIGITEVEN','DIGITODD'] },
    { id:'over_under', label:'Over/Under', categories:['digits'], contracts:['DIGITOVER','DIGITUNDER'] },
    { id:'asian', label:'Asian Up/Asian Down', categories:['asian'], contracts:['ASIANU','ASIAND'] },
    { id:'reset', label:'Reset Call/Reset Put', categories:['reset'], contracts:['RESETCALL','RESETPUT'] },
    { id:'spread', label:'Call/Put Spread', categories:['callputspread'], contracts:['CALLSPREAD','PUTSPREAD'] },
    { id:'multiplier', label:'Multiplier', categories:['multiplier'], contracts:['MULTUP','MULTDOWN'] },
  ];

  const contractLabels = {
    CALL:'Rise', PUT:'Fall', ONETOUCH:'Touch', NOTOUCH:'No Touch',
    EXPIRYRANGE:'Ends Between', EXPIRYMISS:'Ends Outside', RANGE:'Stays Between', UPORDOWN:'Goes Outside',
    DIGITMATCH:'Matches', DIGITDIFF:'Differs', DIGITEVEN:'Even', DIGITODD:'Odd', DIGITOVER:'Over', DIGITUNDER:'Under',
    ASIANU:'Asian Up', ASIAND:'Asian Down', RESETCALL:'Reset Call', RESETPUT:'Reset Put',
    CALLSPREAD:'Call Spread', PUTSPREAD:'Put Spread', MULTUP:'Multiplier Up', MULTDOWN:'Multiplier Down',
  };

  const blockCatalog = [
    { id:'trade', title:'Trade Parameters', blocks:[
      ['trade_parameters','Trade Parameters','Set market, symbol, contract, duration, stake.'],
      ['market_filter','Market Filter','Limit the strategy to a market family.'],
      ['duration','Duration','Set duration and unit.'],
      ['stake','Stake','Set stake and currency.'],
    ] },
    { id:'purchase', title:'Purchase Conditions', blocks:[
      ['purchase_conditions','Purchase Conditions','Entry rules before buying.'],
      ['digit_prediction','Prediction Digit','Use digit prediction for digit contracts.'],
      ['buy_signal','Buy Signal','Signal gate before purchase.'],
      ['condition_chain','AND / OR Chain','Combine conditions visually.'],
    ] },
    { id:'sell', title:'Sell Conditions', blocks:[
      ['sell_conditions','Sell Conditions','Optional sell-before-expiry logic.'],
      ['profit_target','Profit > target','Sell when profit target is met.'],
      ['loss_limit','Loss > limit','Sell when loss limit is met.'],
      ['time_exit','Time exceeded','Exit after a time condition.'],
    ] },
    { id:'restart', title:'Restart Conditions', blocks:[
      ['restart_conditions','Restart Conditions','Control what happens after a trade.'],
      ['after_win','After Win','Continue, pause, or reset.'],
      ['after_loss','After Loss','Continue, cooldown, or pause.'],
      ['daily_reset','Daily Reset','Restart after day boundary.'],
    ] },
    { id:'indicators', title:'Indicators', blocks:[
      ['rsi','RSI','RSI threshold condition.'],
      ['ema_cross','EMA Cross','EMA fast/slow crossover.'],
      ['macd','MACD','MACD crossover condition.'],
      ['volatility_filter','Volatility Filter','Volatility above or below a threshold.'],
    ] },
    { id:'logic', title:'Logic', blocks:[
      ['and','AND','All connected conditions must pass.'],
      ['or','OR','Any connected condition may pass.'],
      ['not','NOT','Invert a condition.'],
      ['compare','Compare','Compare two values.'],
    ] },
    { id:'variables', title:'Variables', blocks:[
      ['counter','Counter','Track runs or losses.'],
      ['profit_var','Current Profit','Use current profit.'],
      ['loss_var','Current Loss','Use current loss.'],
    ] },
    { id:'risk', title:'Risk Management', blocks:[
      ['risk_management','Risk Management','Stop loss, take profit, daily limits.'],
      ['stop_loss','Stop Loss','Stop after loss threshold.'],
      ['take_profit','Take Profit','Stop after profit threshold.'],
      ['max_trades','Max Trades','Limit daily trades.'],
      ['money_management','Money Management','Martingale or fixed stake.'],
    ] },
    { id:'ai', title:'AI Blocks', blocks:[
      ['ai_signal','AI Signal','Requires backend AI analysis.'],
      ['ai_trend','AI Trend Filter','Uses AI trend confirmation.'],
      ['ai_volatility','AI Volatility Filter','Uses AI volatility risk.'],
      ['ai_approval','AI Trade Approval','Approval gate before trade.'],
    ] },
    { id:'notifications', title:'Notifications', blocks:[
      ['journal_note','Journal Note','Write to journal.'],
      ['browser_alert','Browser Alert','Show local browser alert.'],
      ['telegram_alert','Telegram Alert','Telegram notification after setup.'],
    ] },
    { id:'utilities', title:'Utilities', blocks:[
      ['comment','Comment','Annotate your strategy.'],
      ['wait','Wait','Pause before next action.'],
      ['template_marker','Template Marker','Organize a section.'],
    ] },
  ];

  const templates = {
    rsi: { label:'RSI Reversal', strategy:'rsi_reversal', tradeType:'rise_fall', contract_type:'CALL', blocks:['start','trade_parameters','rsi','purchase_conditions','sell_conditions','restart_conditions','risk_management'] },
    ema: { label:'EMA Cross', strategy:'ma_cross', tradeType:'rise_fall', contract_type:'CALL', blocks:['start','trade_parameters','ema_cross','purchase_conditions','restart_conditions','risk_management'] },
    even: { label:'Even/Odd', strategy:'digit_pattern', tradeType:'even_odd', contract_type:'DIGITEVEN', blocks:['start','trade_parameters','digit_prediction','purchase_conditions','restart_conditions','risk_management'] },
    over: { label:'Over/Under', strategy:'digit_pattern', tradeType:'over_under', contract_type:'DIGITOVER', blocks:['start','trade_parameters','digit_prediction','purchase_conditions','restart_conditions','risk_management'] },
    boom: { label:'Boom Hunter', strategy:'breakout', blocks:['start','trade_parameters','volatility_filter','purchase_conditions','profit_target','restart_conditions','risk_management'] },
    crash: { label:'Crash Hunter', strategy:'breakout', blocks:['start','trade_parameters','volatility_filter','purchase_conditions','loss_limit','restart_conditions','risk_management'] },
    ai: { label:'AI Strategy', blocks:['start','trade_parameters','ai_signal','ai_trend','ai_approval','purchase_conditions','restart_conditions','risk_management'] },
  };

  const defaults = {
    name: 'ApexBot visual strategy',
    symbol: 'R_100',
    marketGroup: 'Volatility',
    submarket: '',
    tradeType: 'rise_fall',
    contract_type: 'CALL',
    duration: 1,
    durationType: 't',
    stake: 1,
    currency: 'AUD',
    barrier: '',
    prediction: '1',
    multiplier: 2,
    strategy: 'ma_cross',
    comparator: '<',
    conditionValue: 30,
    fastPeriod: 10,
    slowPeriod: 20,
    rsiPeriod: 14,
    sellRule: 'available',
    afterWin: 'continue',
    afterLoss: 'continue',
    stopLoss: 10,
    takeProfit: 20,
    dailyLossLimit: 25,
    maxTradesPerDay: 20,
    moneyMode: 'fixed',
  };

  let strategy = { ...defaults };
  let blocks = [];
  let selectedId = '';
  let flatSymbols = [];
  let availableContracts = [];
  let zoom = 1;
  const botStats = { runs: 0, stake: 0, payout: 0, won: 0, lost: 0, profit: 0 };
  const transactions = [];
  const signals = [];

  async function request(path, options = {}) {
    if (typeof window.api === 'function') return api(path, options);
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type':'application/json', ...(options.headers || {}) },
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
    while (el('builder-log').children.length > 100) el('builder-log').lastElementChild.remove();
  }

  function blockMeta(type) {
    if (type === 'start') return { title:'START', desc:'Strategy entry point.' };
    for (const group of blockCatalog) {
      const found = group.blocks.find(([id]) => id === type);
      if (found) return { title: found[1], desc: found[2], category: group.title };
    }
    return { title: type.replace(/_/g, ' '), desc:'Custom builder block.' };
  }

  function createBlock(type, x, y) {
    const meta = blockMeta(type);
    return { id:`${type}-${uid()}`, type, title: meta.title, desc: meta.desc, x, y, settings:{} };
  }

  function makeBlocks(types = ['start','trade_parameters','purchase_conditions','sell_conditions','restart_conditions','risk_management']) {
    return types.map((type, index) => createBlock(type, 80 + index * 260, 130 + (index % 2) * 24));
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
      el('canvas-status').textContent = `${flatSymbols.length} markets`;
      log(`Market selected: loaded ${flatSymbols.length} Deriv symbols.`, 'ok');
    } catch (e) {
      flatSymbols = [
        { symbol:'R_10', name:'Volatility 10 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
        { symbol:'R_25', name:'Volatility 25 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
        { symbol:'R_50', name:'Volatility 50 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
        { symbol:'R_75', name:'Volatility 75 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
        { symbol:'R_100', name:'Volatility 100 Index', family:'Volatility', submarket:'Continuous Indices', exchange_open:true },
      ];
      el('canvas-status').textContent = 'Fallback markets';
      log(`Market feed unavailable: ${e.message}`, 'warn');
    }
  }

  function contractMatchesGroup(group, contract) {
    return group.contracts.includes(contract.contract_type)
      && (!group.categories.length || group.categories.includes(String(contract.contract_category || '').toLowerCase()));
  }

  async function loadContracts(symbol) {
    availableContracts = [];
    try {
      const res = await request(`/market/contracts?symbol=${encodeURIComponent(symbol)}`);
      availableContracts = res.contracts || [];
      log(`Contract list updated: ${availableContracts.length} contracts for ${symbol}.`, 'ok');
    } catch (e) {
      log(`Contract unavailable: ${e.message}`, 'warn');
    }
    normalizeTradeSelection();
    renderProperties();
    validate();
  }

  function normalizeTradeSelection() {
    const usable = tradeTypeGroups.filter((group) => !availableContracts.length || availableContracts.some((contract) => contractMatchesGroup(group, contract)));
    if (!usable.some((group) => group.id === strategy.tradeType)) strategy.tradeType = usable[0]?.id || 'rise_fall';
    const group = tradeTypeGroups.find((g) => g.id === strategy.tradeType) || tradeTypeGroups[0];
    const contracts = availableContracts.length
      ? availableContracts.filter((contract) => contractMatchesGroup(group, contract)).map((contract) => contract.contract_type)
      : group.contracts;
    if (!contracts.includes(strategy.contract_type)) strategy.contract_type = contracts[0] || '';
  }

  function renderLibrary() {
    const query = el('block-search').value.trim().toLowerCase();
    el('block-categories').innerHTML = blockCatalog.map((group, index) => {
      const blocksHtml = group.blocks
        .filter(([, label, desc]) => !query || `${label} ${desc} ${group.title}`.toLowerCase().includes(query))
        .map(([type, label, desc]) => `<button class="library-block" type="button" draggable="true" data-block-type="${type}"><b>${esc(label)}</b><span>${esc(desc)}</span></button>`)
        .join('');
      if (!blocksHtml && query) return '';
      return `<details class="library-group" ${index < 4 || query ? 'open' : ''}>
        <summary>${esc(group.title)}</summary>
        <div class="library-group-body">${blocksHtml || '<small>No blocks match.</small>'}</div>
      </details>`;
    }).join('');
    document.querySelectorAll('.library-block').forEach((button) => {
      button.onclick = () => addBlock(button.dataset.blockType);
      button.ondragstart = (event) => event.dataTransfer.setData('application/x-apex-block', button.dataset.blockType);
    });
  }

  function renderTemplates() {
    el('template-picker').innerHTML = '<option value="">Templates</option>' +
      Object.entries(templates).map(([id, template]) => `<option value="${id}">${esc(template.label)}</option>`).join('');
  }

  function renderCanvas() {
    el('canvas-blocks').style.transform = `scale(${zoom})`;
    el('canvas-blocks').innerHTML = blocks.map((block, index) => `
      <button class="visual-node ${selectedId === block.id ? 'selected' : ''} ${block.type}" data-block-id="${esc(block.id)}" draggable="true" style="left:${block.x}px;top:${block.y}px">
        <span class="node-port in"></span>
        <span class="node-port out"></span>
        <small>${index + 1}</small>
        <b>${esc(block.title)}</b>
        <em>${esc(block.desc)}</em>
      </button>
    `).join('');
    el('canvas-empty').classList.toggle('hidden', blocks.length > 0);
    document.querySelectorAll('.visual-node').forEach((node) => {
      node.onclick = () => { selectedId = node.dataset.blockId; renderCanvas(); renderProperties(); };
      node.ondragstart = (event) => event.dataTransfer.setData('application/x-apex-existing-block', node.dataset.blockId);
    });
    renderConnections();
    renderMiniMap();
    el('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
    saveLocal();
  }

  function renderConnections() {
    const svg = el('connection-layer');
    svg.innerHTML = '';
    for (let i = 0; i < blocks.length - 1; i++) {
      const a = blocks[i], b = blocks[i + 1];
      const x1 = (a.x + 220) * zoom, y1 = (a.y + 45) * zoom;
      const x2 = b.x * zoom, y2 = (b.y + 45) * zoom;
      svg.insertAdjacentHTML('beforeend', `<path d="M ${x1} ${y1} C ${x1 + 70} ${y1}, ${x2 - 70} ${y2}, ${x2} ${y2}" />`);
    }
  }

  function renderMiniMap() {
    el('mini-map').innerHTML = blocks.map((block) => `<span style="left:${Math.max(2, block.x / 13)}px;top:${Math.max(2, block.y / 13)}px"></span>`).join('');
  }

  function addBlock(type, x = 120, y = 220) {
    blocks.push(createBlock(type, x + blocks.length * 20, y + blocks.length * 18));
    selectedId = blocks[blocks.length - 1].id;
    log(`Block added: ${blocks[blocks.length - 1].title}.`);
    renderCanvas();
    renderProperties();
    validate();
  }

  function autoLayout() {
    blocks.forEach((block, index) => {
      block.x = 70 + index * 255;
      block.y = 130 + (index % 2) * 30;
    });
    log('Strategy layout refreshed.', 'ok');
    renderCanvas();
  }

  function canvasPoint(event) {
    const rect = el('visual-canvas').getBoundingClientRect();
    const snap = el('snap-grid').checked ? 20 : 1;
    return {
      x: Math.max(0, Math.round(((event.clientX - rect.left + el('visual-canvas').scrollLeft) / zoom) / snap) * snap),
      y: Math.max(0, Math.round(((event.clientY - rect.top + el('visual-canvas').scrollTop) / zoom) / snap) * snap),
    };
  }

  function setupCanvasDrop() {
    const canvas = el('visual-canvas');
    canvas.ondragover = (event) => event.preventDefault();
    canvas.ondrop = (event) => {
      event.preventDefault();
      const point = canvasPoint(event);
      const type = event.dataTransfer.getData('application/x-apex-block');
      const existingId = event.dataTransfer.getData('application/x-apex-existing-block');
      if (type) return addBlock(type, point.x, point.y);
      const block = blocks.find((item) => item.id === existingId);
      if (block) {
        block.x = point.x;
        block.y = point.y;
        selectedId = block.id;
        renderCanvas();
        renderProperties();
      }
    };
  }

  function selectOptions(options, value) {
    return options.map(([val, label]) => `<option value="${esc(val)}" ${String(val) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  function marketGroupOptions() {
    return [...new Set(flatSymbols.map((s) => s.family || s.market || 'Other'))].map((family) => [family, family]);
  }

  function submarketOptions() {
    const rows = flatSymbols.filter((s) => (s.family || s.market || 'Other') === strategy.marketGroup);
    return [...new Set(rows.map((s) => s.submarket || strategy.marketGroup))].map((sub) => [sub, sub]);
  }

  function symbolOptions() {
    const rows = flatSymbols.filter((s) => (s.family || s.market || 'Other') === strategy.marketGroup && (s.submarket || strategy.marketGroup) === strategy.submarket);
    return rows.map((s) => [s.symbol, `${s.name || s.symbol}${s.exchange_open === false ? ' (closed)' : ''}`]);
  }

  function tradeTypeOptions() {
    return tradeTypeGroups
      .filter((group) => !availableContracts.length || availableContracts.some((contract) => contractMatchesGroup(group, contract)))
      .map((group) => [group.id, group.label]);
  }

  function contractOptions() {
    const group = tradeTypeGroups.find((item) => item.id === strategy.tradeType) || tradeTypeGroups[0];
    const rows = availableContracts.length
      ? availableContracts.filter((contract) => contractMatchesGroup(group, contract))
      : group.contracts.map((contract_type) => ({ contract_type }));
    return rows.map((contract) => [contract.contract_type, contract.contract_display || contractLabels[contract.contract_type] || contract.contract_type]);
  }

  function propertyField(label, body) {
    return `<label class="property-field"><span>${label}</span>${body}</label>`;
  }

  function renderProperties() {
    const block = blocks.find((item) => item.id === selectedId);
    el('selected-block-name').textContent = block ? block.title : 'No block selected';
    if (!block) {
      el('properties-form').innerHTML = '<p class="muted-sm">Select a block on the canvas to edit its settings.</p>';
      return;
    }

    const removeButton = block.type === 'start' ? '' : '<button id="remove-selected-block" class="btn ghost danger" type="button">Remove block</button>';
    if (block.type === 'trade_parameters') {
      el('properties-form').innerHTML = `
        ${propertyField('Market Category', `<select id="p-market-group" class="input">${selectOptions(marketGroupOptions(), strategy.marketGroup)}</select>`)}
        ${propertyField('Market Symbol', `<select id="p-submarket" class="input">${selectOptions(submarketOptions(), strategy.submarket)}</select><select id="p-symbol" class="input">${selectOptions(symbolOptions(), strategy.symbol)}</select>`)}
        ${propertyField('Trade Type', `<select id="p-trade-type" class="input">${selectOptions(tradeTypeOptions(), strategy.tradeType)}</select>`)}
        ${propertyField('Contract Type', `<select id="p-contract" class="input">${selectOptions(contractOptions(), strategy.contract_type)}</select>`)}
        <div class="property-grid">
          ${propertyField('Duration', `<input id="p-duration" class="input" type="number" min="1" value="${esc(strategy.duration)}" />`)}
          ${propertyField('Unit', `<select id="p-duration-type" class="input">${selectOptions([['t','Ticks'],['m','Minutes'],['h','Hours'],['d','Days']], strategy.durationType)}</select>`)}
          ${propertyField('Stake', `<input id="p-stake" class="input" type="number" min="0.35" step="0.01" value="${esc(strategy.stake)}" />`)}
          ${propertyField('Currency', `<select id="p-currency" class="input">${selectOptions([['AUD','AUD'],['USD','USD'],['KES','KES']], strategy.currency)}</select>`)}
          ${propertyField('Barrier', `<input id="p-barrier" class="input" value="${esc(strategy.barrier)}" placeholder="+0.12" />`)}
          ${propertyField('Prediction Digit', `<select id="p-prediction" class="input">${selectOptions(Array.from({ length: 10 }, (_, i) => [String(i), String(i)]), strategy.prediction)}</select>`)}
          ${propertyField('Multiplier', `<input id="p-multiplier" class="input" type="number" min="1" step="0.1" value="${esc(strategy.multiplier)}" />`)}
        </div>
        ${removeButton}`;
      wireTradeProperties();
      return;
    }

    if (['purchase_conditions','rsi','ema_cross','macd','digit_prediction','volatility_filter','condition_chain'].includes(block.type)) {
      el('properties-form').innerHTML = `
        ${propertyField('Condition Type', `<select id="p-strategy" class="input">${selectOptions([['ma_cross','EMA cross'],['rsi_reversal','RSI'],['breakout','Breakout'],['digit_pattern','Digits'],['ai_filter','AI confidence']], strategy.strategy)}</select>`)}
        <div class="property-grid">
          ${propertyField('Comparator', `<select id="p-comparator" class="input">${selectOptions([['<','<'],['>','>'],['=','='],['>=','>='],['<=','<='],['cross_above','Cross Above'],['cross_below','Cross Below']], strategy.comparator)}</select>`)}
          ${propertyField('Value', `<input id="p-condition-value" class="input" type="number" step="any" value="${esc(strategy.conditionValue)}" />`)}
          ${propertyField('RSI Period', `<input id="p-rsi-period" class="input" type="number" min="2" value="${esc(strategy.rsiPeriod)}" />`)}
          ${propertyField('Fast EMA', `<input id="p-fast" class="input" type="number" min="2" value="${esc(strategy.fastPeriod)}" />`)}
          ${propertyField('Slow EMA', `<input id="p-slow" class="input" type="number" min="3" value="${esc(strategy.slowPeriod)}" />`)}
          ${propertyField('Prediction Digit', `<select id="p-prediction" class="input">${selectOptions(Array.from({ length: 10 }, (_, i) => [String(i), String(i)]), strategy.prediction)}</select>`)}
        </div>
        ${removeButton}`;
      wireGenericProperties();
      return;
    }

    if (['sell_conditions','profit_target','loss_limit','time_exit'].includes(block.type)) {
      el('properties-form').innerHTML = `
        ${propertyField('Sell Logic', `<select id="p-sell-rule" class="input">${selectOptions([['available','Sell is available'],['profit','Profit > target'],['loss','Loss > limit'],['time','Time exceeded'],['ai_risk','AI risk warning'],['disabled','Disabled']], strategy.sellRule)}</select>`)}
        ${removeButton}`;
      el('p-sell-rule').onchange = () => { strategy.sellRule = el('p-sell-rule').value; validate(); saveLocal(); };
      wireRemoveButton();
      return;
    }

    if (['restart_conditions','after_win','after_loss','daily_reset'].includes(block.type)) {
      el('properties-form').innerHTML = `
        ${propertyField('After Win', `<select id="p-after-win" class="input">${selectOptions([['continue','Trade again'],['pause','Pause bot'],['reset','Reset stake']], strategy.afterWin)}</select>`)}
        ${propertyField('After Loss', `<select id="p-after-loss" class="input">${selectOptions([['continue','Trade again'],['cooldown','Cooldown first'],['pause','Pause bot']], strategy.afterLoss)}</select>`)}
        ${removeButton}`;
      el('p-after-win').onchange = () => { strategy.afterWin = el('p-after-win').value; saveLocal(); };
      el('p-after-loss').onchange = () => { strategy.afterLoss = el('p-after-loss').value; saveLocal(); };
      wireRemoveButton();
      return;
    }

    if (['risk_management','stop_loss','take_profit','max_trades','money_management'].includes(block.type)) {
      el('properties-form').innerHTML = `
        <div class="property-grid">
          ${propertyField('Stop Loss', `<input id="p-stop-loss" class="input" type="number" min="0" value="${esc(strategy.stopLoss)}" />`)}
          ${propertyField('Take Profit', `<input id="p-take-profit" class="input" type="number" min="0" value="${esc(strategy.takeProfit)}" />`)}
          ${propertyField('Max Daily Loss', `<input id="p-daily-loss" class="input" type="number" min="0" value="${esc(strategy.dailyLossLimit)}" />`)}
          ${propertyField('Max Trades', `<input id="p-max-trades" class="input" type="number" min="1" value="${esc(strategy.maxTradesPerDay)}" />`)}
          ${propertyField('Money Mode', `<select id="p-money-mode" class="input">${selectOptions([['fixed','Fixed stake'],['martingale','Martingale'],['anti_martingale','Anti-Martingale'],['custom','Custom progression']], strategy.moneyMode)}</select>`)}
        </div>
        ${removeButton}`;
      ['p-stop-loss','p-take-profit','p-daily-loss','p-max-trades','p-money-mode'].forEach((id) => {
        el(id).oninput = () => {
          strategy.stopLoss = Number(el('p-stop-loss').value || 0);
          strategy.takeProfit = Number(el('p-take-profit').value || 0);
          strategy.dailyLossLimit = Number(el('p-daily-loss').value || 0);
          strategy.maxTradesPerDay = Number(el('p-max-trades').value || 1);
          strategy.moneyMode = el('p-money-mode').value;
          validate();
          saveLocal();
        };
      });
      wireRemoveButton();
      return;
    }

    if (block.type.startsWith('ai_')) {
      el('properties-form').innerHTML = `<div class="ai-property-note">AI blocks do not invent signals. They display confidence, risk, trend, and market analysis only when backend analysis is available.</div>${removeButton}`;
      wireRemoveButton();
      return;
    }

    el('properties-form').innerHTML = `<p class="muted-sm">${esc(block.desc)}</p>${removeButton}`;
    wireRemoveButton();
  }

  function wireTradeProperties() {
    el('p-market-group').onchange = () => {
      strategy.marketGroup = el('p-market-group').value;
      strategy.submarket = submarketOptions()[0]?.[0] || '';
      strategy.symbol = symbolOptions()[0]?.[0] || strategy.symbol;
      loadContracts(strategy.symbol);
      renderProperties();
      saveLocal();
    };
    el('p-submarket').onchange = () => {
      strategy.submarket = el('p-submarket').value;
      strategy.symbol = symbolOptions()[0]?.[0] || strategy.symbol;
      loadContracts(strategy.symbol);
      renderProperties();
      saveLocal();
    };
    el('p-symbol').onchange = () => { strategy.symbol = el('p-symbol').value; loadContracts(strategy.symbol); saveLocal(); };
    el('p-trade-type').onchange = () => { strategy.tradeType = el('p-trade-type').value; normalizeTradeSelection(); renderProperties(); validate(); saveLocal(); };
    el('p-contract').onchange = () => { strategy.contract_type = el('p-contract').value; validate(); saveLocal(); };
    ['p-duration','p-duration-type','p-stake','p-currency','p-barrier','p-prediction','p-multiplier'].forEach((id) => {
      el(id).oninput = () => {
        strategy.duration = Number(el('p-duration').value || 1);
        strategy.durationType = el('p-duration-type').value;
        strategy.stake = Number(el('p-stake').value || 0);
        strategy.currency = el('p-currency').value;
        strategy.barrier = el('p-barrier').value;
        strategy.prediction = el('p-prediction').value;
        strategy.multiplier = Number(el('p-multiplier').value || 1);
        validate();
        saveLocal();
      };
    });
    wireRemoveButton();
  }

  function wireGenericProperties() {
    ['p-strategy','p-comparator','p-condition-value','p-rsi-period','p-fast','p-slow','p-prediction'].forEach((id) => {
      el(id).oninput = () => {
        strategy.strategy = el('p-strategy').value;
        strategy.comparator = el('p-comparator').value;
        strategy.conditionValue = Number(el('p-condition-value').value || 0);
        strategy.rsiPeriod = Number(el('p-rsi-period').value || 14);
        strategy.fastPeriod = Number(el('p-fast').value || 10);
        strategy.slowPeriod = Number(el('p-slow').value || 20);
        strategy.prediction = el('p-prediction').value;
        validate();
        saveLocal();
      };
    });
    wireRemoveButton();
  }

  function wireRemoveButton() {
    const button = el('remove-selected-block');
    if (!button) return;
    button.onclick = () => {
      blocks = blocks.filter((block) => block.id !== selectedId);
      selectedId = blocks[0]?.id || '';
      renderCanvas();
      renderProperties();
      validate();
    };
  }

  function validationMessages() {
    const messages = [];
    if (!blocks.some((block) => block.type === 'trade_parameters')) messages.push('Missing Trade Parameters block.');
    if (!blocks.some((block) => ['purchase_conditions','buy_signal','rsi','ema_cross','digit_prediction','ai_signal'].includes(block.type))) messages.push('Missing Purchase Conditions block.');
    if (!blocks.some((block) => ['risk_management','stop_loss','take_profit'].includes(block.type))) messages.push('Missing Risk Controls.');
    const symbol = flatSymbols.find((item) => item.symbol === strategy.symbol);
    if (symbol?.exchange_open === false) messages.push('Market closed.');
    if (availableContracts.length && !availableContracts.some((contract) => contract.contract_type === strategy.contract_type)) messages.push('Contract unavailable for selected market.');
    if (!strategy.stake || strategy.stake < 0.35) messages.push('Stake must be at least 0.35.');
    if (!strategy.duration || strategy.duration < 1) messages.push('Duration must be at least 1.');
    return messages;
  }

  function validate() {
    const messages = validationMessages();
    el('validation-warnings').innerHTML = messages.length ? messages.map((message) => `<div>${esc(message)}</div>`).join('') : '<div class="ok-text">Strategy validation passed.</div>';
    el('canvas-status').textContent = messages.length ? `${messages.length} warning${messages.length === 1 ? '' : 's'}` : 'Ready';
    el('canvas-status').className = `badge ${messages.length ? 'warn' : 'real'}`;
    return messages;
  }

  function signalText() {
    return strategy.strategy === 'digit_pattern'
      ? `Last digit condition: ${contractLabels[strategy.contract_type] || strategy.contract_type} with prediction ${strategy.prediction}.`
      : strategy.strategy === 'rsi_reversal'
        ? `RSI ${strategy.rsiPeriod} ${strategy.comparator} ${strategy.conditionValue}.`
        : strategy.strategy === 'ma_cross'
          ? `EMA ${strategy.fastPeriod} cross against EMA ${strategy.slowPeriod}.`
          : 'Breakout condition waits for range confirmation.';
  }

  function addSignal(reason = 'Signal generated') {
    signals.unshift({ at: new Date().toLocaleTimeString(), text: `${reason}: ${signalText()}` });
    renderSignals();
  }

  function renderSignals() {
    el('signal-list').innerHTML = signals.length
      ? signals.slice(0, 12).map((item) => `<div><b>${esc(item.at)}</b><span>${esc(item.text)}</span></div>`).join('')
      : 'No signals generated yet.';
  }

  function renderDigitStream() {
    const digits = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10));
    el('digit-stream').innerHTML = digits.map((digit) => `<b>${digit}</b>`).join('');
  }

  function renderTransactions() {
    el('transaction-list').innerHTML = transactions.length ? `
      <table class="bot-transactions-table">
        <thead><tr><th>Time</th><th>Market</th><th>Contract</th><th>Stake</th><th>Status</th></tr></thead>
        <tbody>${transactions.map((tx) => `<tr><td>${esc(tx.time)}</td><td>${esc(tx.symbol)}</td><td>${esc(tx.contract)}</td><td>${esc(tx.stake)}</td><td>${esc(tx.status)}</td></tr>`).join('')}</tbody>
      </table>
    ` : 'No transactions yet.';
  }

  function setWorkstation(open = true, tab = '') {
    el('workstation-panel').classList.toggle('minimized', !open);
    el('toggle-workstation').textContent = open ? 'Hide' : 'Show';
    try { localStorage.setItem(WORKSTATION_KEY, open ? 'open' : 'closed'); } catch {}
    if (tab) setPanelTab(tab);
  }

  function setPanelTab(tab) {
    document.querySelectorAll('.workstation-tab').forEach((button) => button.classList.toggle('active', button.dataset.panelTab === tab));
    document.querySelectorAll('.workstation-view').forEach((view) => view.classList.toggle('active', view.dataset.panelView === tab));
  }

  function saveLocal() {
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ strategy, blocks, selectedId, zoom })); } catch {}
  }

  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
      if (!saved) return false;
      strategy = { ...defaults, ...(saved.strategy || {}) };
      blocks = Array.isArray(saved.blocks) ? saved.blocks : makeBlocks();
      selectedId = saved.selectedId || blocks[0]?.id || '';
      zoom = saved.zoom || 1;
      return true;
    } catch { return false; }
  }

  function exportStrategy() {
    const payload = { strategy, blocks };
    const base = (strategy.name || 'apexbot-strategy').replace(/[^a-z0-9_-]+/gi, '-');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${base}.json`;
    link.click();
    URL.revokeObjectURL(url);
    log('Strategy exported.', 'ok');
  }

  async function importStrategy(file) {
    const text = await file.text();
    if (text.trim().startsWith('{')) {
      const parsed = JSON.parse(text);
      strategy = { ...defaults, ...(parsed.strategy || parsed) };
      blocks = Array.isArray(parsed.blocks) ? parsed.blocks : makeBlocks();
    } else {
      const symbol = text.match(/SYMBOL(?:_LIST)?">([^<]+)/)?.[1] || defaults.symbol;
      const contract = text.match(/CONTRACTTYPE">([^<]+)/)?.[1] || text.match(/TYPE_LIST">([^<]+)/)?.[1] || defaults.contract_type;
      strategy = { ...defaults, name: file.name.replace(/\.[^.]+$/, ''), symbol, contract_type: contract };
      blocks = makeBlocks();
    }
    selectedId = blocks.find((block) => block.type === 'trade_parameters')?.id || blocks[0]?.id || '';
    await loadContracts(strategy.symbol);
    renderAll();
    log(`Strategy imported: ${file.name}.`, 'ok');
  }

  async function saveStrategy() {
    try {
      const filename = `${(strategy.name || 'strategy').replace(/[^a-z0-9_-]+/gi, '-')}.json`;
      const result = await request('/bots/import', { method:'POST', body: JSON.stringify({ filename, content: JSON.stringify({ strategy, blocks }, null, 2) }) });
      log(`Strategy saved: ${result.bot?.name || strategy.name}.`, 'ok');
    } catch (e) {
      log(`Save failed: ${e.message}${e.status === 401 ? ' Login is required.' : ''}`, 'warn');
    }
  }

  async function backtestDemo() {
    setWorkstation(true, 'journal');
    try {
      log('Backtest started in demo mode.', 'ok');
      const result = await request('/bots/backtest', { method:'POST', body: JSON.stringify({ strategy, count: 500 }) });
      log(`Backtest complete: ${result.summary?.trades || 0} trades, win rate ${result.summary?.winRate || 0}%.`, 'ok');
    } catch (e) {
      log(`Backtest unavailable: ${e.message}${e.status === 401 ? ' Login is required.' : ''}`, 'warn');
    }
  }

  async function runDemo() {
    const messages = validate();
    if (messages.length) {
      setWorkstation(true, 'validation');
      log(`Trade rejected: ${messages.join(' ')}`, 'warn');
      return;
    }
    setWorkstation(true, 'journal');
    el('bot-run-state').textContent = 'Running demo';
    log('Bot started in demo mode. No real trade will be placed.', 'ok');
    try {
      const result = await request('/trading/demo-trade', {
        method:'POST',
        body: JSON.stringify({ symbol: strategy.symbol, contractType: strategy.contract_type, amount: strategy.stake, duration: strategy.duration }),
      });
      botStats.runs += 1;
      botStats.stake += strategy.stake;
      transactions.unshift({ time:new Date().toLocaleTimeString(), symbol:strategy.symbol, contract:strategy.contract_type, stake:`${fmt(strategy.stake)} ${strategy.currency}`, status:result.tradeId ? 'Demo executed' : 'Demo simulation' });
      el('last-signal').textContent = `${strategy.contract_type} on ${strategy.symbol}`;
      renderTransactions();
      addSignal('Demo signal');
      log(`Trade executed in demo: ${strategy.contract_type} on ${strategy.symbol}.`, 'ok');
    } catch (e) {
      log(`Trade rejected: ${e.message}${e.status === 401 ? ' Login is required for demo execution.' : ''}`, 'warn');
    } finally {
      el('bot-run-state').textContent = 'Bot is not running';
      log('Bot stopped.', 'ok');
    }
  }

  function applyTemplate(id) {
    const template = templates[id];
    if (!template) return;
    strategy = { ...defaults, ...template, name: template.label };
    blocks = makeBlocks(template.blocks);
    selectedId = blocks.find((block) => block.type === 'trade_parameters')?.id || blocks[0]?.id || '';
    loadContracts(strategy.symbol).then(renderAll);
    log(`Template loaded: ${template.label}.`, 'ok');
  }

  function renderAll() {
    el('s-name').value = strategy.name;
    renderCanvas();
    renderProperties();
    renderSignals();
    validate();
    renderTransactions();
  }

  el('block-search').oninput = renderLibrary;
  el('new-strategy').onclick = () => {
    strategy = { ...defaults };
    blocks = makeBlocks();
    selectedId = blocks[1].id;
    loadContracts(strategy.symbol).then(renderAll);
    log('New visual strategy created.');
  };
  el('template-picker').onchange = () => applyTemplate(el('template-picker').value);
  el('auto-layout').onclick = autoLayout;
  el('save-bot').onclick = saveStrategy;
  el('export-bot').onclick = exportStrategy;
  el('import-bot-file').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await importStrategy(file); }
    catch (e) { log(`Import failed: ${e.message}`, 'warn'); }
    finally { event.target.value = ''; }
  };
  el('run-backtest').onclick = backtestDemo;
  el('run-demo-bottom').onclick = runDemo;
  el('show-workstation').onclick = () => setWorkstation(true, 'journal');
  el('toggle-workstation').onclick = () => setWorkstation(el('workstation-panel').classList.contains('minimized'));
  document.querySelectorAll('.workstation-tab').forEach((button) => button.onclick = () => setWorkstation(true, button.dataset.panelTab));
  el('zoom-in').onclick = () => { zoom = Math.min(1.4, +(zoom + 0.1).toFixed(2)); renderCanvas(); };
  el('zoom-out').onclick = () => { zoom = Math.max(0.7, +(zoom - 0.1).toFixed(2)); renderCanvas(); };
  el('s-name').oninput = () => { strategy.name = el('s-name').value; saveLocal(); };

  setupCanvasDrop();
  renderLibrary();
  renderTemplates();
  await loadSymbols();
  if (!loadLocal()) {
    blocks = makeBlocks();
    selectedId = blocks[1].id;
  }
  if (!strategy.marketGroup && flatSymbols[0]) strategy.marketGroup = flatSymbols[0].family;
  if (!strategy.submarket && flatSymbols[0]) strategy.submarket = flatSymbols[0].submarket || strategy.marketGroup;
  if (!flatSymbols.some((s) => s.symbol === strategy.symbol) && flatSymbols[0]) strategy.symbol = flatSymbols[0].symbol;
  await loadContracts(strategy.symbol);
  renderDigitStream();
  renderAll();
  setWorkstation(localStorage.getItem(WORKSTATION_KEY) === 'open');
})();
