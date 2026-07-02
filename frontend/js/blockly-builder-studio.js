(function () {
  const AUTOSAVE_KEY = 'apexbot_visual_strategy_v1';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const uid = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (!window.Blockly) {
    const host = $('blocklyDiv');
    if (host) host.innerHTML = '<div class="studio-empty">The visual builder library did not load. Check the browser connection and refresh.</div>';
    return;
  }

  const defaults = {
    name: 'ApexBot visual strategy', symbol: 'R_100', contract_type: 'CALL',
    duration: 1, durationType: 't', stake: 1, currency: 'USD', strategy: 'rsi_reversal',
    comparator: '<', conditionValue: 30, rsiPeriod: 14, fastPeriod: 10, slowPeriod: 20,
    sellRule: 'available', afterWin: 'continue', afterLoss: 'continue', stopLoss: 10,
    takeProfit: 20, maxTradesPerDay: 20, moneyMode: 'fixed',
  };

  const categoryMap = [
    ['Trade Parameters', [['trade_parameters', 'Trade parameters']]],
    ['Purchase Conditions', [['purchase_conditions', 'Purchase conditions'], ['rsi', 'RSI condition'], ['ema_cross', 'EMA crossover'], ['macd', 'MACD confirmation'], ['volatility_filter', 'Volatility filter']]],
    ['Sell Conditions', [['sell_conditions', 'Sell conditions']]],
    ['Restart Conditions', [['restart_conditions', 'Restart trading conditions']]],
    ['Risk Management', [['risk_management', 'Risk management']]],
    ['Logic', [['logic_and', 'AND'], ['logic_or', 'OR'], ['logic_not', 'NOT'], ['compare_value', 'Compare values']]],
    ['Variables', [['counter_value', 'Counter'], ['profit_value', 'Current profit'], ['loss_value', 'Current loss']]],
    ['Utility', [['wait_block', 'Wait'], ['journal_note', 'Journal note'], ['comment_block', 'Comment']]],
  ];

  const templates = {
    rsi: { label: 'RSI Reversal', strategy: { strategy: 'rsi_reversal', contract_type: 'CALL' }, blocks: ['trade_parameters', 'rsi', 'purchase_conditions', 'sell_conditions', 'restart_conditions', 'risk_management'] },
    ema: { label: 'EMA Cross', strategy: { strategy: 'ma_cross', contract_type: 'CALL' }, blocks: ['trade_parameters', 'ema_cross', 'purchase_conditions', 'restart_conditions', 'risk_management'] },
    even: { label: 'Even / Odd', strategy: { strategy: 'digit_pattern', contract_type: 'DIGITEVEN' }, blocks: ['trade_parameters', 'purchase_conditions', 'restart_conditions', 'risk_management'] },
    over: { label: 'Over / Under', strategy: { strategy: 'digit_pattern', contract_type: 'DIGITOVER' }, blocks: ['trade_parameters', 'purchase_conditions', 'restart_conditions', 'risk_management'] },
    breakout: { label: 'Volatility Breakout', strategy: { strategy: 'breakout', contract_type: 'CALL' }, blocks: ['trade_parameters', 'volatility_filter', 'purchase_conditions', 'sell_conditions', 'restart_conditions', 'risk_management'] },
  };

  let strategy = { ...defaults };
  let marketOptions = [['Volatility 100 Index', 'R_100'], ['Volatility 75 Index', 'R_75'], ['Volatility 50 Index', 'R_50']];
  const contractCache = new Map();
  const commonContracts = [
    ['Rise', 'CALL'], ['Fall', 'PUT'], ['Even', 'DIGITEVEN'], ['Odd', 'DIGITODD'],
    ['Over', 'DIGITOVER'], ['Under', 'DIGITUNDER'], ['Matches', 'DIGITMATCH'], ['Differs', 'DIGITDIFF'],
  ];

  const fieldText = (fallback = '') => new Blockly.FieldTextInput(fallback, (value) => String(value).slice(0, 120));
  const number = (value, min = 0, max = 1e9, precision = 1) => new Blockly.FieldNumber(value, min, max, precision);
  const dropdown = (options) => new Blockly.FieldDropdown(options);
  const dynamicMarket = () => new Blockly.FieldDropdown(() => marketOptions.length ? marketOptions : [['Volatility 100 Index', 'R_100']]);
  const dynamicContracts = () => new Blockly.FieldDropdown(function () {
    const symbol = this.getSourceBlock()?.getFieldValue('MARKET') || strategy.symbol;
    return contractCache.get(symbol) || commonContracts;
  });

  function statement(block, colour) {
    block.setPreviousStatement(true, null);
    block.setNextStatement(true, null);
    block.setColour(colour);
    block.setInputsInline(false);
  }

  Blockly.Blocks.trade_parameters = {
    init() {
      this.appendDummyInput().appendField('Trade parameters');
      this.appendDummyInput().appendField('Market').appendField(dynamicMarket(), 'MARKET');
      this.appendDummyInput().appendField('Trade type').appendField(dynamicContracts(), 'CONTRACT');
      this.appendDummyInput().appendField('Duration').appendField(number(1, 1, 100000, 1), 'DURATION').appendField(dropdown([['ticks', 't'], ['minutes', 'm'], ['hours', 'h'], ['days', 'd']]), 'UNIT');
      this.appendDummyInput().appendField('Stake').appendField(number(1, 0.35, 1000000, 0.01), 'STAKE').appendField(dropdown([['USD', 'USD'], ['AUD', 'AUD'], ['KES', 'KES']]), 'CURRENCY');
      statement(this, 128);
      this.setTooltip('Choose the market, contract, duration and stake.');
    },
  };
  Blockly.Blocks.purchase_conditions = {
    init() {
      this.appendDummyInput().appendField('Purchase conditions');
      this.appendDummyInput().appendField('Require').appendField(dropdown([['All connected rules', 'all'], ['Any connected rule', 'any']]), 'MODE');
      statement(this, 128);
    },
  };
  Blockly.Blocks.sell_conditions = {
    init() {
      this.appendDummyInput().appendField('Sell conditions (optional)');
      this.appendDummyInput().appendField('Sell when').appendField(dropdown([['Sell is available', 'available'], ['Profit reaches target', 'profit'], ['Loss reaches limit', 'loss'], ['Time is exceeded', 'time'], ['Disabled', 'disabled']]), 'SELL_RULE');
      statement(this, 150);
    },
  };
  Blockly.Blocks.restart_conditions = {
    init() {
      this.appendDummyInput().appendField('Restart trading conditions');
      this.appendDummyInput().appendField('After win').appendField(dropdown([['Trade again', 'continue'], ['Pause', 'pause'], ['Reset stake', 'reset']]), 'AFTER_WIN');
      this.appendDummyInput().appendField('After loss').appendField(dropdown([['Trade again', 'continue'], ['Cooldown', 'cooldown'], ['Pause', 'pause']]), 'AFTER_LOSS');
      statement(this, 128);
    },
  };
  Blockly.Blocks.risk_management = {
    init() {
      this.appendDummyInput().appendField('Risk management');
      this.appendDummyInput().appendField('Stop loss').appendField(number(10, 0, 1000000, 0.01), 'STOP_LOSS');
      this.appendDummyInput().appendField('Take profit').appendField(number(20, 0, 1000000, 0.01), 'TAKE_PROFIT');
      this.appendDummyInput().appendField('Maximum trades').appendField(number(20, 1, 100000, 1), 'MAX_TRADES');
      statement(this, 330);
    },
  };
  Blockly.Blocks.rsi = {
    init() {
      this.appendDummyInput().appendField('RSI condition');
      this.appendDummyInput().appendField('Period').appendField(number(14, 2, 200, 1), 'PERIOD');
      this.appendDummyInput().appendField('RSI').appendField(dropdown([['<', '<'], ['>', '>'], ['≤', '<='], ['≥', '>=']]), 'COMPARATOR').appendField(number(30, 0, 100, 1), 'VALUE');
      statement(this, 185);
    },
  };
  Blockly.Blocks.ema_cross = {
    init() {
      this.appendDummyInput().appendField('EMA crossover');
      this.appendDummyInput().appendField('Fast EMA').appendField(number(10, 2, 200, 1), 'FAST');
      this.appendDummyInput().appendField('Slow EMA').appendField(number(20, 3, 400, 1), 'SLOW');
      statement(this, 185);
    },
  };
  Blockly.Blocks.macd = {
    init() {
      this.appendDummyInput().appendField('MACD confirmation');
      this.appendDummyInput().appendField('Signal').appendField(dropdown([['Bullish crossover', 'bullish'], ['Bearish crossover', 'bearish']]), 'SIGNAL');
      statement(this, 185);
    },
  };
  Blockly.Blocks.volatility_filter = {
    init() {
      this.appendDummyInput().appendField('Volatility filter');
      this.appendDummyInput().appendField('Risk score').appendField(dropdown([['below', '<'], ['above', '>']]), 'COMPARATOR').appendField(number(30, 0, 100, 1), 'VALUE');
      statement(this, 185);
    },
  };

  const generic = {
    logic_and: ['AND', 210], logic_or: ['OR', 210], logic_not: ['NOT', 210], compare_value: ['Compare values', 210],
    counter_value: ['Counter', 45], profit_value: ['Current profit', 45], loss_value: ['Current loss', 45],
    wait_block: ['Wait', 60], journal_note: ['Journal note', 60], comment_block: ['Comment', 60],
  };
  Object.entries(generic).forEach(([type, [label, colour]]) => {
    Blockly.Blocks[type] = { init() { this.appendDummyInput().appendField(label).appendField(fieldText(''), 'TEXT'); statement(this, colour); } };
  });

  const theme = Blockly.Theme.defineTheme('apexStudio', {
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#ffffff', toolboxBackgroundColour: '#ffffff', toolboxForegroundColour: '#33383e',
      flyoutBackgroundColour: '#ffffff', flyoutForegroundColour: '#33383e', flyoutOpacity: 1,
      scrollbarColour: '#bcc1c5', scrollbarOpacity: .65, insertionMarkerColour: '#1ab85a', insertionMarkerOpacity: .35,
      cursorColour: '#e81f4f', blackBackground: '#000000',
    },
    fontStyle: { family: 'Inter, system-ui, sans-serif', weight: '600', size: 11 },
  });

  const workspace = Blockly.inject('blocklyDiv', {
    toolbox: null, renderer: 'geras', theme, trashcan: true, sounds: false,
    grid: { spacing: 22, length: 2, colour: '#e7e9ea', snap: true },
    move: { scrollbars: true, drag: true, wheel: true },
    zoom: { controls: false, wheel: true, startScale: .9, maxScale: 1.4, minScale: .45, scaleSpeed: 1.1 },
  });

  function titleFor(type) {
    for (const [, rows] of categoryMap) {
      const item = rows.find(([id]) => id === type);
      if (item) return item[1];
    }
    return type;
  }

  function blockRecords() {
    return workspace.getAllBlocks(false).map((block) => {
      const pos = block.getRelativeToSurfaceXY();
      return { id: block.id || uid(), type: block.type, title: titleFor(block.type), x: Math.round(pos.x), y: Math.round(pos.y) };
    });
  }

  function readFields() {
    const all = workspace.getAllBlocks(false);
    const find = (type) => all.find((block) => block.type === type);
    const trade = find('trade_parameters');
    if (trade) {
      strategy.symbol = trade.getFieldValue('MARKET') || strategy.symbol;
      strategy.contract_type = trade.getFieldValue('CONTRACT') || strategy.contract_type;
      strategy.duration = Number(trade.getFieldValue('DURATION') || 1);
      strategy.durationType = trade.getFieldValue('UNIT') || 't';
      strategy.stake = Number(trade.getFieldValue('STAKE') || 0);
      strategy.currency = trade.getFieldValue('CURRENCY') || 'USD';
    }
    const rsi = find('rsi');
    const ema = find('ema_cross');
    const volatility = find('volatility_filter');
    if (rsi) {
      strategy.strategy = 'rsi_reversal';
      strategy.rsiPeriod = Number(rsi.getFieldValue('PERIOD') || 14);
      strategy.comparator = rsi.getFieldValue('COMPARATOR') || '<';
      strategy.conditionValue = Number(rsi.getFieldValue('VALUE') || 30);
    } else if (ema) {
      strategy.strategy = 'ma_cross';
      strategy.fastPeriod = Number(ema.getFieldValue('FAST') || 10);
      strategy.slowPeriod = Number(ema.getFieldValue('SLOW') || 20);
    } else if (volatility) {
      strategy.strategy = 'breakout';
      strategy.comparator = volatility.getFieldValue('COMPARATOR') || '<';
      strategy.conditionValue = Number(volatility.getFieldValue('VALUE') || 30);
    }
    const sell = find('sell_conditions');
    if (sell) strategy.sellRule = sell.getFieldValue('SELL_RULE') || 'available';
    const restart = find('restart_conditions');
    if (restart) {
      strategy.afterWin = restart.getFieldValue('AFTER_WIN') || 'continue';
      strategy.afterLoss = restart.getFieldValue('AFTER_LOSS') || 'continue';
    }
    const risk = find('risk_management');
    if (risk) {
      strategy.stopLoss = Number(risk.getFieldValue('STOP_LOSS') || 0);
      strategy.takeProfit = Number(risk.getFieldValue('TAKE_PROFIT') || 0);
      strategy.maxTradesPerDay = Number(risk.getFieldValue('MAX_TRADES') || 1);
    }
    strategy.name = $('s-name')?.value.trim() || strategy.name;
  }

  function saveLocal() {
    readFields();
    const payload = { strategy, blocks: blockRecords(), blockly: Blockly.serialization.workspaces.save(workspace) };
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload)); } catch {}
    updateStatus();
    return payload;
  }

  function validationMessages() {
    const types = new Set(workspace.getAllBlocks(false).map((block) => block.type));
    const messages = [];
    if (!types.has('trade_parameters')) messages.push('Add Trade Parameters.');
    if (![...types].some((type) => ['purchase_conditions', 'rsi', 'ema_cross', 'macd', 'volatility_filter'].includes(type))) messages.push('Add a Purchase Condition.');
    if (!types.has('restart_conditions')) messages.push('Add Restart Conditions.');
    if (!types.has('risk_management')) messages.push('Add Risk Management.');
    if (!(Number(strategy.stake) >= .35)) messages.push('Stake must be at least 0.35.');
    return messages;
  }

  function updateStatus() {
    const node = $('canvas-status');
    if (!node) return;
    readFields();
    const messages = validationMessages();
    node.textContent = messages.length ? `${messages.length} check${messages.length === 1 ? '' : 's'}` : 'Ready';
    node.className = `builder-status ${messages.length ? 'warn' : 'ok'}`;
    node.title = messages.join(' ');
  }

  async function loadMarkets() {
    try {
      const response = await api('/market/symbols');
      marketOptions = Object.values(response.groups || {}).flat().map((item) => [String(item.name || item.symbol), String(item.symbol)]);
      marketOptions = marketOptions.length ? marketOptions : [['Volatility 100 Index', 'R_100']];
    } catch {}
  }

  async function loadContracts(symbol) {
    if (!symbol || contractCache.has(symbol)) return;
    try {
      const response = await api(`/market/contracts?symbol=${encodeURIComponent(symbol)}`);
      const options = (response.contracts || []).map((item) => [String(item.contract_display || item.contract_type), String(item.contract_type)]);
      if (options.length) contractCache.set(symbol, options);
    } catch {}
  }

  function createBlock(type, x = 60, y = 60) {
    const block = workspace.newBlock(type);
    block.initSvg();
    block.render();
    block.moveBy(x, y);
    block.select();
    if (type === 'trade_parameters') {
      block.setFieldValue(strategy.symbol || 'R_100', 'MARKET');
      block.setFieldValue(strategy.contract_type || 'CALL', 'CONTRACT');
      block.setFieldValue(String(strategy.duration || 1), 'DURATION');
      block.setFieldValue(strategy.durationType || 't', 'UNIT');
      block.setFieldValue(String(strategy.stake || 1), 'STAKE');
      block.setFieldValue(strategy.currency || 'USD', 'CURRENCY');
    }
    saveLocal();
    return block;
  }

  function connectChain(blocks) {
    for (let index = 0; index < blocks.length - 1; index += 1) {
      const next = blocks[index].nextConnection;
      const previous = blocks[index + 1].previousConnection;
      if (next && previous && !next.isConnected() && !previous.isConnected()) next.connect(previous);
    }
  }

  function loadTemplate(id = 'rsi') {
    const template = templates[id] || templates.rsi;
    strategy = { ...defaults, ...template.strategy, name: template.label };
    if ($('s-name')) $('s-name').value = strategy.name;
    workspace.clear();
    const blocks = template.blocks.map((type, index) => createBlock(type, 160, 70 + index * 120));
    connectChain(blocks);
    workspace.cleanUp();
    saveLocal();
  }

  function renderLibrary() {
    const query = ($('block-search')?.value || '').trim().toLowerCase();
    $('block-categories').innerHTML = categoryMap.map(([category, rows], index) => {
      const visible = rows.filter(([, label]) => !query || `${category} ${label}`.toLowerCase().includes(query));
      if (!visible.length) return '';
      return `<details class="library-group" ${index < 5 || query ? 'open' : ''}><summary>${esc(category)}</summary><div class="library-group-body">${visible.map(([type, label]) => `<button class="library-block" type="button" draggable="true" data-block-type="${esc(type)}"><b>${esc(label)}</b></button>`).join('')}</div></details>`;
    }).join('');
    document.querySelectorAll('[data-block-type]').forEach((button) => {
      button.onclick = () => createBlock(button.dataset.blockType, 100 + Math.random() * 80, 80 + Math.random() * 140);
      button.ondragstart = (event) => event.dataTransfer.setData('application/x-apex-blockly', button.dataset.blockType);
    });
  }

  function arrange() {
    const top = workspace.getTopBlocks(true);
    top.forEach((root, column) => {
      const current = root.getRelativeToSurfaceXY();
      root.moveBy(110 + column * 380 - current.x, 70 - current.y);
    });
    workspace.cleanUp();
    saveLocal();
  }

  function exportStrategy() {
    const payload = saveLocal();
    const base = (strategy.name || 'apexbot-strategy').replace(/[^a-z0-9_-]+/gi, '-');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${base}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function saveStrategy() {
    const payload = saveLocal();
    const filename = `${(strategy.name || 'strategy').replace(/[^a-z0-9_-]+/gi, '-')}.json`;
    const status = $('canvas-status');
    try {
      const result = await api('/bots/import', { method: 'POST', body: JSON.stringify({ filename, content: JSON.stringify(payload, null, 2) }) });
      if (status) { status.textContent = `Saved ${result.bot?.name || strategy.name}`; status.className = 'builder-status ok'; }
    } catch (error) {
      if (status) { status.textContent = error.message || 'Save failed'; status.className = 'builder-status warn'; }
    }
  }

  function applyLegacy(parsed) {
    strategy = { ...defaults, ...(parsed.strategy || parsed) };
    const types = Array.isArray(parsed.blocks) ? parsed.blocks.map((block) => block.type).filter((type) => Blockly.Blocks[type]) : templates.rsi.blocks;
    workspace.clear();
    const blocks = (types.length ? types : templates.rsi.blocks).map((type, index) => createBlock(type, 160, 70 + index * 120));
    connectChain(blocks);
    workspace.cleanUp();
  }

  async function importStrategy(file) {
    const text = await file.text();
    if (text.trim().startsWith('{')) {
      const parsed = JSON.parse(text);
      strategy = { ...defaults, ...(parsed.strategy || {}) };
      if ($('s-name')) $('s-name').value = strategy.name;
      workspace.clear();
      if (parsed.blockly) Blockly.serialization.workspaces.load(parsed.blockly, workspace);
      else applyLegacy(parsed);
    } else {
      const symbol = text.match(/SYMBOL(?:_LIST)?">([^<]+)/)?.[1] || defaults.symbol;
      const contract = text.match(/CONTRACTTYPE">([^<]+)/)?.[1] || text.match(/TYPE_LIST">([^<]+)/)?.[1] || defaults.contract_type;
      strategy = { ...defaults, name: file.name.replace(/\.[^.]+$/, ''), symbol, contract_type: contract };
      loadTemplate('rsi');
    }
    saveLocal();
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
      if (!saved) return false;
      strategy = { ...defaults, ...(saved.strategy || {}) };
      if ($('s-name')) $('s-name').value = strategy.name;
      if (saved.blockly) Blockly.serialization.workspaces.load(saved.blockly, workspace);
      else applyLegacy(saved);
      return true;
    } catch { return false; }
  }

  function resize() { Blockly.svgResize(workspace); }
  new ResizeObserver(resize).observe($('blocklyDiv'));
  window.addEventListener('resize', resize);

  workspace.addChangeListener((event) => {
    if (event.isUiEvent) return;
    const trade = workspace.getAllBlocks(false).find((block) => block.type === 'trade_parameters');
    if (trade) loadContracts(trade.getFieldValue('MARKET'));
    clearTimeout(workspace._apexSaveTimer);
    workspace._apexSaveTimer = setTimeout(saveLocal, 120);
  });

  $('block-search').oninput = renderLibrary;
  $('template-picker').innerHTML = '<option value="">Quick strategies</option>' + Object.entries(templates).map(([id, template]) => `<option value="${id}">${esc(template.label)}</option>`).join('');
  $('template-picker').onchange = () => { if ($('template-picker').value) loadTemplate($('template-picker').value); };
  $('new-strategy').onclick = () => { strategy = { ...defaults }; $('s-name').value = strategy.name; workspace.clear(); createBlock('trade_parameters', 130, 70); saveLocal(); };
  $('auto-layout').onclick = arrange;
  $('save-bot').onclick = saveStrategy;
  $('export-bot').onclick = exportStrategy;
  $('import-bot-file').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await importStrategy(file); }
    catch (error) { const status = $('canvas-status'); if (status) { status.textContent = error.message || 'Import failed'; status.className = 'builder-status warn'; } }
    finally { event.target.value = ''; }
  };
  $('zoom-in').onclick = () => workspace.zoomCenter(1);
  $('zoom-out').onclick = () => workspace.zoomCenter(-1);
  $('s-name').oninput = saveLocal;

  const host = $('blocklyDiv');
  host.addEventListener('dragover', (event) => event.preventDefault());
  host.addEventListener('drop', (event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/x-apex-blockly');
    if (!type || !Blockly.Blocks[type]) return;
    const rect = host.getBoundingClientRect();
    const metrics = workspace.getMetrics();
    const x = Math.max(30, (event.clientX - rect.left - (metrics.absoluteLeft || 0) - workspace.scrollX) / workspace.scale);
    const y = Math.max(30, (event.clientY - rect.top - (metrics.absoluteTop || 0) - workspace.scrollY) / workspace.scale);
    createBlock(type, x, y);
  });

  renderLibrary();
  loadMarkets().then(() => {
    if (!restore()) loadTemplate('rsi');
    resize();
    updateStatus();
  });
})();