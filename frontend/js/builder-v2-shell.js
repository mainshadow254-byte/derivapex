(function(){
  const KEY='apexbot_visual_strategy_v1',VERSION=8;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let force=false,layingOut=false;
  function read(){try{const all=JSON.parse(localStorage.getItem(KEY)||'{}');return{all,strategy:all.strategy||{},blocks:Array.isArray(all.blocks)?all.blocks:[]};}catch{return{all:{},strategy:{},blocks:[]};}}
  function save(blocks){try{const state=read().all;state.blocks=blocks;state.uiLayoutVersion=VERSION;localStorage.setItem(KEY,JSON.stringify(state));}catch{}}
  const row=(label,value)=>value!==undefined&&value!==null&&value!==''?`<div class="node-config-row"><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`:'';
  function summary(type,s){
    if(type==='start')return row('Flow','Start once');
    if(type==='trade_parameters')return row('Market',s.symbol||'Select')+row('Contract',s.contract_type||'Select')+row('Duration',`${s.duration||1} ${s.durationType||'t'}`)+row('Stake',`${s.stake||1} ${s.currency||''}`);
    if(['purchase_conditions','buy_signal','condition_chain'].includes(type))return row('Logic',s.strategy||'Select')+row('Rule',`${s.comparator||''} ${s.conditionValue??''}`.trim());
    if(type==='rsi')return row('Indicator','RSI')+row('Period',s.rsiPeriod||14)+row('Rule',`${s.comparator||'<'} ${s.conditionValue??30}`);
    if(type==='ema_cross')return row('Indicator','EMA cross')+row('Fast',s.fastPeriod||10)+row('Slow',s.slowPeriod||20);
    if(type==='macd')return row('Indicator','MACD crossover');
    if(type==='volatility_filter')return row('Filter','Volatility')+row('Threshold',s.conditionValue??30);
    if(type==='digit_prediction')return row('Prediction',s.prediction??1);
    if(['sell_conditions','profit_target','loss_limit','time_exit'].includes(type))return row('Sell rule',s.sellRule||'available');
    if(['restart_conditions','after_win','after_loss','daily_reset'].includes(type))return row('After win',s.afterWin||'continue')+row('After loss',s.afterLoss||'continue');
    if(['risk_management','stop_loss','take_profit','max_trades','money_management'].includes(type))return row('Stop loss',s.stopLoss??0)+row('Take profit',s.takeProfit??0)+row('Max trades',s.maxTradesPerDay??0)+row('Stake mode',s.moneyMode||'fixed');
    return'';
  }
  function cleanLibrary(){
    $('#template-picker option[value="ai"]')?.remove();
    const names={'Sell Conditions':'Sell Conditions (optional)','Restart Conditions':'Restart Trading Conditions','Indicators':'Analysis','Utilities':'Utility','Notifications':'Journal & Notifications'};
    $$('.library-group summary').forEach(node=>{const name=node.textContent.trim();if(names[name])node.textContent=names[name];});
    $$('.library-group').forEach(group=>{group.style.display=$$('.library-block',group).some(block=>getComputedStyle(block).display!=='none')?'':'none';});
  }
  function decorate(){
    const{strategy,blocks}=read(),map=new Map(blocks.map(block=>[block.id,block]));
    $$('.visual-node').forEach(node=>{const block=map.get(node.dataset.blockId);if(!block)return;let box=$('.node-config',node),html=summary(block.type,strategy);if(!html){box?.remove();return;}if(!box){box=document.createElement('div');box.className='node-config';node.appendChild(box);}if(box.dataset.rendered!==html){box.innerHTML=html;box.dataset.rendered=html;}});
  }
  const leftTypes=new Set(['start','trade_parameters','purchase_conditions','buy_signal','condition_chain','rsi','ema_cross','macd','volatility_filter','digit_prediction']);
  const rightTypes=new Set(['sell_conditions','profit_target','loss_limit','time_exit','restart_conditions','after_win','after_loss','daily_reset','risk_management','stop_loss','take_profit','max_trades','money_management']);
  function positions(blocks){
    let leftY=42,rightY=42;const leftX=64,rightX=525;
    blocks.forEach(block=>{
      if(block.type==='start'){block.x=leftX;block.y=leftY;leftY+=130;return;}
      if(block.type==='trade_parameters'){block.x=leftX;block.y=leftY;leftY+=205;return;}
      if(leftTypes.has(block.type)){block.x=leftX;block.y=leftY;leftY+=155;return;}
      if(rightTypes.has(block.type)){block.x=rightX;block.y=rightY;rightY+=block.type==='risk_management'?185:155;return;}
      if(leftY<=rightY){block.x=leftX;block.y=leftY;leftY+=145;}else{block.x=rightX;block.y=rightY;rightY+=145;}
    });
  }
  function apply(blocks){const map=new Map(blocks.map(block=>[block.id,block]));$$('.visual-node').forEach(node=>{const block=map.get(node.dataset.blockId);if(block){node.style.left=`${block.x}px`;node.style.top=`${block.y}px`;}});}
  function redraw(blocks=read().blocks){
    const svg=$('#connection-layer'),nodes=new Map($$('.visual-node').map(node=>[node.dataset.blockId,node]));if(!svg)return;svg.innerHTML='';
    for(let i=0;i<blocks.length-1;i++){const from=nodes.get(blocks[i].id),to=nodes.get(blocks[i+1].id);if(!from||!to)continue;const same=Math.abs(from.offsetLeft-to.offsetLeft)<120;if(same&&to.offsetTop>from.offsetTop){const x1=from.offsetLeft+from.offsetWidth/2,y1=from.offsetTop+from.offsetHeight,x2=to.offsetLeft+to.offsetWidth/2,y2=to.offsetTop;svg.insertAdjacentHTML('beforeend',`<path d="M ${x1} ${y1} C ${x1} ${y1+45}, ${x2} ${y2-45}, ${x2} ${y2}" />`);}else{const x1=from.offsetLeft+from.offsetWidth,y1=from.offsetTop+44,x2=to.offsetLeft,y2=to.offsetTop+44;svg.insertAdjacentHTML('beforeend',`<path d="M ${x1} ${y1} C ${x1+65} ${y1}, ${x2-65} ${y2}, ${x2} ${y2}" />`);}}
  }
  function arrange(always=false){if(layingOut)return;const state=read(),blocks=state.blocks;if(!blocks.length)return;if(!always&&!force&&Number(state.all.uiLayoutVersion||0)>=VERSION){apply(blocks);redraw(blocks);return;}layingOut=true;positions(blocks);save(blocks);apply(blocks);redraw(blocks);force=false;layingOut=false;}
  function prepareInspector(){
    const panel=$('#block-inspector');if(!panel||panel.querySelector('.inspector-popover-head'))return;
    const name=$('#selected-block-name'),form=$('#properties-form'),validation=$('#validation-warnings');panel.innerHTML='';
    const head=document.createElement('div');head.className='inspector-popover-head';head.innerHTML='<div><small>Block settings</small></div><button id="close-block-inspector" type="button" aria-label="Close block settings">×</button>';head.firstElementChild.appendChild(name);panel.append(head,form);
    const checks=document.createElement('div');checks.className='inspector-validation';checks.innerHTML='<strong>Strategy checks</strong>';checks.appendChild(validation);panel.appendChild(checks);
  }
  function openInspector(node){const panel=$('#block-inspector');if(!panel||!node)return;panel.hidden=false;panel.classList.remove('hidden');panel.setAttribute('aria-hidden','false');const rect=node.getBoundingClientRect(),width=360;let left=rect.right+8;if(left+width>window.innerWidth-8)left=Math.max(8,rect.left-width-8);panel.style.left=`${left}px`;panel.style.top=`${Math.min(Math.max(62,rect.top),Math.max(62,window.innerHeight-430))}px`;panel.style.right='auto';}
  function closeInspector(){const panel=$('#block-inspector');if(!panel)return;panel.hidden=true;panel.classList.add('hidden');panel.setAttribute('aria-hidden','true');}
  function initial(attempt=0){const state=read(),picker=$('#template-picker');if(state.blocks.length||!picker)return;if(!picker.querySelector('option[value="rsi"]')){if(attempt<20)setTimeout(()=>initial(attempt+1),100);return;}picker.value='rsi';force=true;picker.dispatchEvent(new Event('change',{bubbles:true}));}
  function init(){
    prepareInspector();const library=$('#block-categories'),canvas=$('#canvas-blocks');
    if(library)new MutationObserver(cleanLibrary).observe(library,{childList:true,subtree:true});
    if(canvas)new MutationObserver(()=>{decorate();requestAnimationFrame(()=>arrange(false));}).observe(canvas,{childList:true,subtree:true});
    document.addEventListener('click',event=>{const node=event.target.closest?.('.visual-node');if(node)setTimeout(()=>openInspector($('.visual-node.selected')||node),0);if(event.target.closest?.('#new-strategy,#auto-layout,.library-block')){force=true;setTimeout(()=>arrange(true),75);}if(!event.target.closest?.('.visual-node,#block-inspector'))closeInspector();});
    $('#template-picker')?.addEventListener('change',()=>{force=true;setTimeout(()=>arrange(true),85);});
    $('#visual-canvas')?.addEventListener('drop',event=>{if(event.dataTransfer?.getData('application/x-apex-block')){force=true;setTimeout(()=>arrange(true),85);}});
    document.addEventListener('click',event=>{if(event.target.closest?.('#close-block-inspector')){event.preventDefault();event.stopPropagation();closeInspector();}},true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeInspector();});
    document.addEventListener('input',()=>setTimeout(decorate,70),true);document.addEventListener('change',()=>setTimeout(decorate,90),true);
    $('#visual-canvas')?.addEventListener('scroll',closeInspector);
    cleanLibrary();initial();decorate();requestAnimationFrame(()=>arrange(false));
  }
  function wait(){if($('#block-categories')&&$('#canvas-blocks')&&$('#properties-form'))init();else setTimeout(wait,100);}wait();
})();
