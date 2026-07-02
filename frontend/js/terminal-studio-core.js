(async function(){
  const $=(id)=>document.getElementById(id);
  const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!window.Auth?.isLoggedIn){location.href='auth.html?mode=login&next=terminal.html';return;}
  let me;
  try{me=await api('/me');}catch{location.href='auth.html?mode=login&next=terminal.html';return;}
  if(!me.verified){location.href='verify.html';return;}
  try{window.ContentProtection?.init(`${me.email} · CHART STUDIO`);window.Devices?.heartbeat();}catch{}

  const cfg=await loadPublicConfig().catch(()=>({derivAppId:'1089'}));
  const state={me,groups:{},symbols:[],category:'all',query:'',current:null,chartType:'candlestick',granularity:60,favorites:new Set(),term:null};
  try{state.favorites=new Set(JSON.parse(localStorage.getItem('apex_studio_favorites')||'[]'));}catch{}
  const modal=$('studio-modal');
  const openModal=(title,body,wide=false)=>{$('studio-modal-title').textContent=title;$('studio-modal-body').innerHTML=body;modal.querySelector('.studio-modal').classList.toggle('wide',wide);modal.classList.add('open');};
  const closeModal=()=>modal.classList.remove('open');
  modal.addEventListener('click',(event)=>{if(event.target===modal||event.target.closest('[data-close-studio-modal]'))closeModal();});

  const flatten=(groups)=>Object.entries(groups).flatMap(([market,rows])=>(rows||[]).map((row)=>({...row,market,submarket:row.submarket||market})));
  try{const response=await api('/market/symbols');state.groups=response.groups||{};state.symbols=flatten(state.groups);}catch{state.groups={Derived:[{symbol:'R_100',name:'Volatility 100 Index',submarket:'Synthetics'}]};state.symbols=flatten(state.groups);}
  state.current=state.symbols.find((item)=>item.symbol==='R_100')||state.symbols[0]||{symbol:'R_100',name:'Volatility 100 Index',market:'Derived'};

  function updateMarketCard(){
    $('terminal-market-name').textContent=state.current?.name||state.current?.symbol||'Market';
    $('terminal-market-symbol').textContent=state.current?.symbol||'';
  }
  updateMarketCard();

  const term=new ChartTerminal({
    container:$('main-chart'),oscContainer:$('osc-chart'),appId:cfg.derivAppId||'1089',symbol:state.current.symbol,granularity:state.granularity,
    onReadout:(data)=>{
      const quote=data.quote??data.c;
      if(quote!=null){const value=Number(quote).toFixed(4);$('terminal-market-quote').textContent=value;$('terminal-price-badge').textContent=value;if($('dt-price'))$('dt-price').value=value;}
      const parts=[];
      if(data.time)parts.push(data.time);
      if(data.o!=null)parts.push(`O ${Number(data.o).toFixed(4)}`);
      if(data.h!=null)parts.push(`H ${Number(data.h).toFixed(4)}`);
      if(data.l!=null)parts.push(`L ${Number(data.l).toFixed(4)}`);
      if(data.c!=null)parts.push(`C ${Number(data.c).toFixed(4)}`);
      if(data.bid!=null)parts.push(`Bid ${Number(data.bid).toFixed(4)}`);
      if(data.ask!=null)parts.push(`Ask ${Number(data.ask).toFixed(4)}`);
      $('terminal-readout').textContent=parts.join(' · ');
    }
  });
  state.term=term;state.chartType=term.type;
  await term.load().catch((error)=>{$('terminal-readout').textContent=error.message||'Chart data unavailable.';});

  function saveFavorites(){try{localStorage.setItem('apex_studio_favorites',JSON.stringify([...state.favorites]));}catch{}}
  function renderMarketDrawer(){
    const labels={all:'All markets',favorites:'Favorites'};
    const categories=['all','favorites',...Object.keys(state.groups)];
    $('studio-market-categories').innerHTML=`<h3>Markets</h3>${categories.map((cat)=>`<div class="studio-market-category ${state.category===cat?'active':''}" data-market-category="${esc(cat)}"><span>${cat==='favorites'?'☆':cat==='all'?'◎':'◉'}</span>${esc(labels[cat]||cat)}</div>`).join('')}`;
    let rows=state.symbols;
    if(state.category==='favorites')rows=rows.filter((item)=>state.favorites.has(item.symbol));
    else if(state.category!=='all')rows=rows.filter((item)=>item.market===state.category);
    if(state.query){const query=state.query.toLowerCase();rows=rows.filter((item)=>`${item.name} ${item.symbol} ${item.submarket}`.toLowerCase().includes(query));}
    const grouped=rows.reduce((map,item)=>{const key=item.submarket||item.market||'Markets';(map[key]||(map[key]=[])).push(item);return map;},{});
    $('studio-market-list').innerHTML=Object.keys(grouped).length?Object.entries(grouped).map(([group,items])=>`<div class="studio-market-group-title">${esc(group)}</div>${items.map((item)=>`<div class="studio-market-row" data-market-symbol="${esc(item.symbol)}"><div><strong>${esc(item.name||item.symbol)}</strong><small>${esc(item.symbol)}</small></div><button class="studio-favorite ${state.favorites.has(item.symbol)?'on':''}" data-favorite-symbol="${esc(item.symbol)}">☆</button></div>`).join('')}`).join(''):'<div class="studio-empty">No markets match this view.</div>';
    document.querySelectorAll('[data-market-category]').forEach((node)=>node.onclick=()=>{state.category=node.dataset.marketCategory;renderMarketDrawer();});
    document.querySelectorAll('[data-market-symbol]').forEach((node)=>node.onclick=(event)=>{if(!event.target.closest('[data-favorite-symbol]'))selectMarket(node.dataset.marketSymbol);});
    document.querySelectorAll('[data-favorite-symbol]').forEach((button)=>button.onclick=(event)=>{event.stopPropagation();const symbol=button.dataset.favoriteSymbol;state.favorites.has(symbol)?state.favorites.delete(symbol):state.favorites.add(symbol);saveFavorites();renderMarketDrawer();});
  }
  async function selectMarket(symbol){
    const item=state.symbols.find((row)=>row.symbol===symbol);if(!item)return;
    state.current=item;updateMarketCard();if($('dt-symbol'))$('dt-symbol').value=symbol;$('studio-market-drawer').classList.remove('open');$('terminal-readout').textContent='Loading market…';
    await term.setSymbol(symbol).catch((error)=>{$('terminal-readout').textContent=error.message||'Market unavailable.';});
  }
  $('studio-market-search').oninput=(event)=>{state.query=event.target.value;renderMarketDrawer();};
  $('terminal-market-card').onclick=()=>{renderMarketDrawer();$('studio-market-drawer').classList.toggle('open');};
  document.addEventListener('click',(event)=>{if(!event.target.closest('#studio-market-drawer,#terminal-market-card'))$('studio-market-drawer').classList.remove('open');});

  const chartTypes=[['area','▰','Area'],['candlestick','▥','Candle'],['hollow','▯','Hollow'],['ohlc','⌁','OHLC'],['line','╱','Line'],['tick','•','Tick']];
  const timeframes=[[0,'1 tick'],[60,'1 minute'],[120,'2 minutes'],[180,'3 minutes'],[300,'5 minutes'],[600,'10 minutes'],[900,'15 minutes'],[1800,'30 minutes'],[3600,'1 hour'],[7200,'2 hours'],[14400,'4 hours'],[28800,'8 hours'],[86400,'1 day']];
  function chartSettings(){
    openModal('Chart types',`<div class="studio-choice-grid">${chartTypes.map(([id,icon,label])=>`<button class="studio-choice ${state.chartType===id?'active':''}" data-chart-type="${id}"><span class="studio-choice-icon">${icon}</span>${label}</button>`).join('')}</div><h4 class="studio-section-title">Time interval</h4><div class="studio-time-grid">${timeframes.map(([value,label])=>`<button class="studio-time ${state.granularity===value?'active':''}" data-chart-time="${value}">${label}</button>`).join('')}</div>`);
    document.querySelectorAll('[data-chart-type]').forEach((button)=>button.onclick=async()=>{state.chartType=button.dataset.chartType;await term.setType(state.chartType);chartSettings();});
    document.querySelectorAll('[data-chart-time]').forEach((button)=>button.onclick=async()=>{const value=Number(button.dataset.chartTime);state.granularity=value;state.chartType=value===0?'tick':state.chartType==='tick'?'candlestick':state.chartType;if(term.type!==state.chartType)await term.setType(state.chartType);if(value>0)await term.setGranularity(value);chartSettings();});
  }

  const indicators=[['ema20','EMA 20'],['ema50','EMA 50'],['ma20','Simple MA'],['bollinger','Bollinger Bands'],['sr','Support / Resistance'],['trendline','Trend line'],['rsi','RSI'],['macd','MACD'],['atr','ATR']];
  function indicatorSettings(){
    openModal('Indicators',`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${indicators.map(([id,label])=>`<label style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #e3e6e8"><input type="checkbox" data-indicator="${id}" ${term.enabled.has(id)?'checked':''}> ${label}</label>`).join('')}</div><button id="studio-reset-indicators" class="studio-reset">Reset indicators</button>`);
    document.querySelectorAll('[data-indicator]').forEach((input)=>input.onchange=()=>term.toggleIndicator(input.dataset.indicator,input.checked));
    $('studio-reset-indicators').onclick=()=>{term.resetLayout();state.chartType=term.type;indicatorSettings();};
  }

  window.ApexStudio={state,term,openModal,closeModal,selectMarket,esc,chartSettings,indicatorSettings};
})();