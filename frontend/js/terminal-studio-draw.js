(function waitForStudio(){
  if(!window.ApexStudio){setTimeout(waitForStudio,80);return;}
  const {state,term,openModal,closeModal,esc,selectMarket}=window.ApexStudio;
  const $=(id)=>document.getElementById(id);
  try{state.drawings=JSON.parse(localStorage.getItem('apex_studio_drawings')||'[]');if(!Array.isArray(state.drawings))state.drawings=[];}catch{state.drawings=[];}
  try{state.templates=JSON.parse(localStorage.getItem('apex_chart_templates')||'[]');if(!Array.isArray(state.templates))state.templates=[];}catch{state.templates=[];}
  state.drawTool='';state.drawStart=null;
  const drawLayer=$('terminal-draw-layer');

  function persistDrawings(){try{localStorage.setItem('apex_studio_drawings',JSON.stringify(state.drawings));}catch{}}
  function shape(drawing,preview=false){
    const stroke=preview?'#df244e':'#e11f4f';
    const common=`stroke="${stroke}" stroke-width="2" fill="none"`;
    if(drawing.tool==='horizontal')return `<line x1="0" y1="${drawing.y1}" x2="100%" y2="${drawing.y1}" ${common}/>`;
    if(drawing.tool==='vertical')return `<line x1="${drawing.x1}" y1="0" x2="${drawing.x1}" y2="100%" ${common}/>`;
    if(drawing.tool==='rectangle')return `<rect x="${Math.min(drawing.x1,drawing.x2)}" y="${Math.min(drawing.y1,drawing.y2)}" width="${Math.abs(drawing.x2-drawing.x1)}" height="${Math.abs(drawing.y2-drawing.y1)}" ${common}/>`;
    if(drawing.tool==='fib')return [0,.5,1].map((ratio)=>`<line x1="${drawing.x1}" y1="${drawing.y1}" x2="${drawing.x2}" y2="${drawing.y1+(drawing.y2-drawing.y1)*ratio}" ${common}/>`).join('');
    if(drawing.tool==='channel')return `<line x1="${drawing.x1}" y1="${drawing.y1}" x2="${drawing.x2}" y2="${drawing.y2}" ${common}/><line x1="${drawing.x1}" y1="${drawing.y1+24}" x2="${drawing.x2}" y2="${drawing.y2+24}" ${common}/>`;
    return `<line x1="${drawing.x1}" y1="${drawing.y1}" x2="${drawing.x2}" y2="${drawing.y2}" ${common}/>`;
  }
  function render(preview){drawLayer.innerHTML=state.drawings.map((drawing)=>shape(drawing)).join('')+(preview?shape(preview,true):'');}
  render();
  const point=(event)=>{const rect=drawLayer.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};};
  drawLayer.addEventListener('pointerdown',(event)=>{if(!state.drawTool)return;const p=point(event);state.drawStart={tool:state.drawTool,x1:p.x,y1:p.y,x2:p.x,y2:p.y};drawLayer.setPointerCapture?.(event.pointerId);});
  drawLayer.addEventListener('pointermove',(event)=>{if(!state.drawStart)return;const p=point(event);state.drawStart.x2=p.x;state.drawStart.y2=p.y;render(state.drawStart);});
  drawLayer.addEventListener('pointerup',(event)=>{if(!state.drawStart)return;const p=point(event);state.drawStart.x2=p.x;state.drawStart.y2=p.y;state.drawings.push({...state.drawStart});state.drawStart=null;persistDrawings();render();state.drawTool='';drawLayer.classList.remove('active');document.querySelectorAll('.terminal-chart-tools button').forEach((button)=>button.classList.remove('active'));});

  const tools=[['channel','Channel'],['continuous','Continuous'],['fib','Fib Fan'],['horizontal','Horizontal'],['line','Line'],['ray','Ray'],['rectangle','Rectangle'],['trend','Trend'],['vertical','Vertical']];
  function drawingSettings(){
    openModal('Drawing tools',`<div style="display:grid;grid-template-columns:240px 1fr;min-height:410px"><div style="background:#f5f5f6;margin:-26px 0 -26px -30px;padding:24px 0"><div style="padding:13px 24px;background:#fff;border-left:4px solid var(--studio-red);font-weight:900">All drawings</div><button id="clear-drawings" style="width:100%;margin-top:14px;padding:12px 24px;border:0;background:transparent;text-align:left">Clear drawings</button></div><div style="padding-left:30px">${tools.map(([id,label])=>`<button data-draw-tool="${id}" style="width:100%;display:flex;align-items:center;gap:18px;padding:12px;border:0;background:#fff;text-align:left;font-size:13px"><span style="font-size:22px;color:#71aab1">╱</span>${label}</button>`).join('')}</div></div>`,true);
    document.querySelectorAll('[data-draw-tool]').forEach((button)=>button.onclick=()=>{state.drawTool=button.dataset.drawTool;drawLayer.classList.add('active');document.querySelectorAll('.terminal-chart-tools button').forEach((node)=>node.classList.toggle('active',node.dataset.terminalAction==='draw'));closeModal();});
    $('clear-drawings').onclick=()=>{state.drawings=[];persistDrawings();render();closeModal();};
  }

  function saveTemplates(){try{localStorage.setItem('apex_chart_templates',JSON.stringify(state.templates));}catch{}}
  function templates(){
    const body=state.templates.length?`<div>${state.templates.map((template,index)=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid #e5e7e9"><div><strong>${esc(template.name)}</strong><div style="color:#858b92;font-size:10px">${esc(template.symbol)} · ${esc(template.type)} · ${esc(template.granularity)}</div></div><div><button class="studio-header-button" data-load-template="${index}">Load</button> <button class="studio-header-button" data-delete-template="${index}">Delete</button></div></div>`).join('')}</div><button id="add-template" class="studio-reset">+ Add current chart as template</button>`:`<div class="studio-empty"><div><div style="font-size:55px">◔</div><p>You have no saved templates yet.</p><button id="add-template" class="studio-header-button primary">+ Add new template</button></div></div>`;
    openModal('Templates',body);
    $('add-template').onclick=()=>{const name=prompt('Template name',`${state.current.name||state.current.symbol} ${state.chartType}`);if(!name)return;state.templates.push({name,symbol:state.current.symbol,type:state.chartType,granularity:state.granularity,drawings:state.drawings});saveTemplates();templates();};
    document.querySelectorAll('[data-load-template]').forEach((button)=>button.onclick=async()=>{const template=state.templates[Number(button.dataset.loadTemplate)];await selectMarket(template.symbol);state.chartType=template.type;state.granularity=template.granularity;await term.setType(template.type);if(template.granularity>0)await term.setGranularity(template.granularity);state.drawings=template.drawings||[];persistDrawings();render();closeModal();});
    document.querySelectorAll('[data-delete-template]').forEach((button)=>button.onclick=()=>{state.templates.splice(Number(button.dataset.deleteTemplate),1);saveTemplates();templates();});
  }

  function zoom(factor){const scale=term.chart.timeScale(),range=scale.getVisibleLogicalRange();if(!range)return;const center=(range.from+range.to)/2,half=(range.to-range.from)*factor/2;scale.setVisibleLogicalRange({from:center-half,to:center+half});}
  function download(){try{const canvas=term.chart.takeScreenshot();const link=document.createElement('a');link.download=`apex-${state.current.symbol}-${Date.now()}.png`;link.href=canvas.toDataURL('image/png');link.click();}catch(error){alert(error.message||'Screenshot unavailable.');}}

  document.querySelectorAll('[data-terminal-action]').forEach((button)=>button.onclick=()=>{
    const action=button.dataset.terminalAction;
    if(action==='chart')window.ApexStudio.chartSettings();
    if(action==='indicators')window.ApexStudio.indicatorSettings();
    if(action==='templates')templates();
    if(action==='draw')drawingSettings();
    if(action==='download')download();
    if(action==='zoom-in')zoom(.72);
    if(action==='zoom-out')zoom(1.35);
    if(action==='fullscreen')term.fullscreen();
    if(action==='reset'){term.resetLayout();state.chartType=term.type;state.drawings=[];persistDrawings();render();term.chart.timeScale().fitContent();}
  });
  window.addEventListener('resize',()=>render());
})();