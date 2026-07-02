(function(){
  const KEY='apexbot_visual_strategy_v1';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let forceLayout=false;

  function read(){try{const data=JSON.parse(localStorage.getItem(KEY)||'{}');return{all:data,strategy:data.strategy||{},blocks:Array.isArray(data.blocks)?data.blocks:[]};}catch{return{all:{},strategy:{},blocks:[]};}}
  function writeBlocks(blocks){try{const state=read().all;state.blocks=blocks;localStorage.setItem(KEY,JSON.stringify(state));}catch{}}
  function row(label,value){return value!==undefined&&value!==null&&value!==''?`<div class="node-config-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`:'';}
  function summary(type,s){
    if(type==='start')return row('Flow','Start');
    if(type==='trade_parameters')return row('Market',s.symbol||'Select')+row('Contract',s.contract_type||'Select')+row('Duration',`${s.duration||1} ${s.durationType||'t'}`)+row('Stake',`${s.stake||1} ${s.currency||''}`);
    if(['purchase_conditions','buy_signal','condition_chain'].includes(type))return row('Logic',s.strategy||'Select')+row('Rule',`${s.comparator||''} ${s.conditionValue??''}`.trim());
    if(type==='rsi')return row('Indicator','RSI')+row('Period',s.rsiPeriod||14)+row('Rule',`${s.comparator||'<'} ${s.conditionValue??30}`);
    if(type==='ema_cross')return row('Indicator','EMA cross')+row('Fast',s.fastPeriod||10)+row('Slow',s.slowPeriod||20);
    if(type==='macd')return row('Indicator','MACD');
    if(type==='volatility_filter')return row('Filter','Volatility')+row('Threshold',s.conditionValue??30);
    if(type==='digit_prediction')return row('Prediction',s.prediction??1);
    if(['sell_conditions','profit_target','loss_limit','time_exit'].includes(type))return row('Sell rule',s.sellRule||'available');
    if(['restart_conditions','after_win','after_loss','daily_reset'].includes(type))return row('After win',s.afterWin||'continue')+row('After loss',s.afterLoss||'continue');
    if(['risk_management','stop_loss','take_profit','max_trades','money_management'].includes(type))return row('Stop loss',s.stopLoss??0)+row('Take profit',s.takeProfit??0)+row('Max trades',s.maxTradesPerDay??0)+row('Stake mode',s.moneyMode||'fixed');
    return '';
  }
  function cleanLibrary(){
    $('#template-picker option[value="ai"]')?.remove();
    $$('.library-group').forEach(group=>{const visible=$$('.library-block',group).some(block=>getComputedStyle(block).display!=='none');group.style.display=visible?'':'none';});
  }
  function decorate(){
    const{strategy,blocks}=read(),map=new Map(blocks.map(block=>[block.id,block]));
    $$('.visual-node').forEach(node=>{const block=map.get(node.dataset.blockId);if(!block)return;let box=$('.node-config',node);const html=summary(block.type,strategy);if(!html){box?.remove();return;}if(!box){box=document.createElement('div');box.className='node-config';node.appendChild(box);}if(box.dataset.html!==html){box.innerHTML=html;box.dataset.html=html;}});
  }
  function redraw(){
    const svg=$('#connection-layer'),nodes=$$('.visual-node');if(!svg)return;svg.innerHTML='';
    nodes.forEach((node,index)=>{if(index===nodes.length-1)return;const next=nodes[index+1];const x1=node.offsetLeft+node.offsetWidth/2,y1=node.offsetTop+node.offsetHeight,x2=next.offsetLeft+next.offsetWidth/2,y2=next.offsetTop;svg.insertAdjacentHTML('beforeend',`<path d="M ${x1} ${y1} C ${x1} ${y1+55}, ${x2} ${y2-55}, ${x2} ${y2}" />`);});
  }
  function needsLayout(blocks){if(forceLayout)return true;if(blocks.length<3)return false;const xs=blocks.map(b=>Number(b.x)||0),ys=blocks.map(b=>Number(b.y)||0);return Math.max(...xs)-Math.min(...xs)>500&&Math.max(...ys)-Math.min(...ys)<220;}
  function verticalize(){
    const state=read(),blocks=state.blocks;if(!needsLayout(blocks)){redraw();return;}forceLayout=false;
    blocks.forEach((block,index)=>{block.x=70+(index%2)*24;block.y=55+index*155;});writeBlocks(blocks);
    const map=new Map(blocks.map(block=>[block.id,block]));$$('.visual-node').forEach(node=>{const block=map.get(node.dataset.blockId);if(block){node.style.left=`${block.x}px`;node.style.top=`${block.y}px`;}});redraw();
  }
  function openInspector(){$('#block-inspector')?.classList.remove('hidden');$('#inspector-backdrop')?.classList.remove('hidden');}
  function closeInspector(){$('#block-inspector')?.classList.add('hidden');$('#inspector-backdrop')?.classList.add('hidden');}
  function init(){
    const library=$('#block-categories'),canvas=$('#canvas-blocks');
    if(library)new MutationObserver(cleanLibrary).observe(library,{childList:true,subtree:true});
    if(canvas)new MutationObserver(()=>{decorate();requestAnimationFrame(verticalize);}).observe(canvas,{childList:true,subtree:true});
    document.addEventListener('click',event=>{if(event.target.closest?.('.visual-node'))setTimeout(openInspector,0);if(event.target.closest?.('.library-block,#new-strategy,#auto-layout'))forceLayout=true;});
    $('#template-picker')?.addEventListener('change',()=>{forceLayout=true;});
    $('#visual-canvas')?.addEventListener('drop',event=>{if(event.dataTransfer?.getData('application/x-apex-block'))forceLayout=true;});
    $('#close-block-inspector')?.addEventListener('click',closeInspector);$('#inspector-backdrop')?.addEventListener('click',closeInspector);document.addEventListener('keydown',event=>{if(event.key==='Escape')closeInspector();});
    document.addEventListener('input',()=>setTimeout(decorate,70),true);document.addEventListener('change',()=>setTimeout(decorate,90),true);
    cleanLibrary();decorate();requestAnimationFrame(verticalize);
  }
  function wait(){if($('#block-categories')&&$('#canvas-blocks'))init();else setTimeout(wait,100);}wait();
})();
