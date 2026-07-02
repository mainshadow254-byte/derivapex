(function(){
  const AUTOSAVE_KEY = 'apexbot_visual_strategy_v1';
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => Array.from(root.querySelectorAll(selector));
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function readState(){
    try {
      const data = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '{}');
      return { strategy:data.strategy || {}, blocks:Array.isArray(data.blocks) ? data.blocks : [] };
    } catch { return { strategy:{}, blocks:[] }; }
  }

  function removeEmptyLibraryGroups(){
    $$('.library-group').forEach((group)=>{
      const visible = $$('.library-block', group).some((block)=>getComputedStyle(block).display !== 'none');
      group.style.display = visible ? '' : 'none';
    });
  }

  function configRows(type, strategy){
    const row = (label, value) => value !== undefined && value !== null && value !== '' ? `<div class="node-config-row"><span>${safe(label)}</span><strong>${safe(value)}</strong></div>` : '';
    if (type === 'start') return row('Flow', 'Start once');
    if (type === 'trade_parameters') return [
      row('Market', strategy.symbol || 'Select'),
      row('Contract', strategy.contract_type || 'Select'),
      row('Duration', `${strategy.duration || 1} ${strategy.durationType || 't'}`),
      row('Stake', `${strategy.stake || 1} ${strategy.currency || ''}`),
    ].join('');
    if (['purchase_conditions','buy_signal','condition_chain'].includes(type)) return [row('Logic', strategy.strategy || 'Select'),row('Rule', `${strategy.comparator || ''} ${strategy.conditionValue ?? ''}`.trim())].join('');
    if (type === 'rsi') return [row('Indicator','RSI'),row('Period',strategy.rsiPeriod || 14),row('Condition',`${strategy.comparator || '<'} ${strategy.conditionValue ?? 30}`)].join('');
    if (type === 'ema_cross') return [row('Indicator','EMA cross'),row('Fast',strategy.fastPeriod || 10),row('Slow',strategy.slowPeriod || 20)].join('');
    if (type === 'macd') return row('Indicator','MACD crossover');
    if (type === 'volatility_filter') return [row('Filter','Volatility'),row('Threshold',strategy.conditionValue ?? 30)].join('');
    if (type === 'digit_prediction') return [row('Contract',strategy.contract_type || 'Digits'),row('Prediction',strategy.prediction ?? 1)].join('');
    if (['sell_conditions','profit_target','loss_limit','time_exit'].includes(type)) return row('Sell rule', strategy.sellRule || 'available');
    if (['restart_conditions','after_win','after_loss','daily_reset'].includes(type)) return [row('After win',strategy.afterWin || 'continue'),row('After loss',strategy.afterLoss || 'continue')].join('');
    if (['risk_management','stop_loss','take_profit','max_trades','money_management'].includes(type)) return [row('Stop loss',strategy.stopLoss ?? 0),row('Take profit',strategy.takeProfit ?? 0),row('Max trades',strategy.maxTradesPerDay ?? 0),row('Stake mode',strategy.moneyMode || 'fixed')].join('');
    if (['and','or','not','compare'].includes(type)) return row('Logic', type.toUpperCase());
    if (['counter','profit_var','loss_var'].includes(type)) return row('Variable', type.replace(/_/g,' '));
    if (type === 'journal_note') return row('Output','Journal');
    if (type === 'wait') return row('Action','Wait before next step');
    if (type === 'comment') return row('Note','Strategy comment');
    return '';
  }

  function decorateNodes(){
    const { strategy, blocks } = readState();
    const byId = new Map(blocks.map((block)=>[block.id, block]));
    $$('.visual-node').forEach((node)=>{
      const block = byId.get(node.dataset.blockId);
      if (!block) return;
      let config = $('.node-config', node);
      const html = configRows(block.type, strategy);
      if (!html) { config?.remove(); return; }
      if (!config) { config=document.createElement('div'); config.className='node-config'; node.appendChild(config); }
      if (config.dataset.rendered !== html) { config.innerHTML=html; config.dataset.rendered=html; }
    });
  }

  function init(){
    const library = $('#block-categories');
    const canvas = $('#canvas-blocks');
    if (library) new MutationObserver(removeEmptyLibraryGroups).observe(library,{childList:true,subtree:true});
    if (canvas) new MutationObserver(decorateNodes).observe(canvas,{childList:true,subtree:true});
    document.addEventListener('input',()=>setTimeout(decorateNodes,80),true);
    document.addEventListener('change',()=>setTimeout(decorateNodes,100),true);
    removeEmptyLibraryGroups();
    decorateNodes();
  }

  function wait(){
    if ($('#block-categories') && $('#canvas-blocks')) init();
    else setTimeout(wait,120);
  }
  wait();
})();
