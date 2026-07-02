(function(){
  const $=(id)=>document.getElementById(id);
  const tradingTypes=new Set(['trade_parameters','purchase_conditions','sell_conditions','restart_conditions','risk_management','rsi','ema_cross','macd','volatility_filter']);

  function workspace(){return window.ApexBuilderWorkspace;}
  function normalizeRunLabel(){
    const button=$('run-demo-bottom');
    if(!button)return;
    if(button.textContent.trim()==='▶ Run demo')button.textContent='▶ Run';
  }
  function normalizeEmptySummary(){
    const runs=$('builder-summary-runs');
    if(!runs||runs.textContent.trim()!=='0')return;
    const values={
      'builder-summary-stake':'0.00',
      'builder-summary-payout':'0.00',
      'builder-summary-lost':'0',
      'builder-summary-won':'0',
      'builder-summary-profit':'0.00'
    };
    Object.entries(values).forEach(([id,value])=>{const node=$(id);if(node)node.textContent=value;});
  }
  function recolorBlocks(){
    const ws=workspace();
    if(!ws)return;
    ws.getAllBlocks(false).forEach((block)=>{
      if(tradingTypes.has(block.type))block.setColour(128);
    });
  }
  function wireToolbar(){
    $('builder-undo')?.addEventListener('click',()=>workspace()?.undo(false));
    $('builder-redo')?.addEventListener('click',()=>workspace()?.undo(true));
    $('builder-cleanup')?.addEventListener('click',()=>workspace()?.cleanUp());
  }
  function initWorkspace(){
    wireToolbar();
    recolorBlocks();
    workspace()?.addChangeListener((event)=>{if(!event.isUiEvent)setTimeout(recolorBlocks,0);});
  }
  function init(){
    normalizeRunLabel();
    normalizeEmptySummary();
    if(workspace())initWorkspace();
    else window.addEventListener('apex:builder-workspace-ready',initWorkspace,{once:true});
    const monitor=new MutationObserver(()=>{normalizeRunLabel();normalizeEmptySummary();});
    const button=$('run-demo-bottom');
    const panel=$('workstation-panel');
    if(button)monitor.observe(button,{childList:true,subtree:true});
    if(panel)monitor.observe(panel,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
