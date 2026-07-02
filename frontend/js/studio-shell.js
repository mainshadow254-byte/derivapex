(function(){
  function loadStyle(href,key){
    if(document.querySelector(`link[data-studio-style="${key}"]`))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    link.dataset.studioStyle=key;
    document.head.appendChild(link);
  }
  loadStyle('css/trading-studio-fixes.css?v=20260702-2','fixes');
  if(document.getElementById('blocklyDiv')){
    loadStyle('css/builder-workspace-layout.css?v=20260702-1','builder-layout');
    loadStyle('css/builder-workspace-blockly.css?v=20260702-1','builder-blockly');
  }
  const $=(id)=>document.getElementById(id);
  const timeEl=$('studio-time');
  const modal=$('studio-risk-modal');
  function tick(){if(timeEl)timeEl.textContent=new Date().toLocaleString(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
  tick();setInterval(tick,1000);
  $('studio-risk-open')?.addEventListener('click',()=>modal?.classList.add('open'));
  modal?.addEventListener('click',(event)=>{if(event.target===modal||event.target.closest('[data-close-studio-modal]'))modal.classList.remove('open');});
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape')document.querySelectorAll('.studio-modal-backdrop.open').forEach((node)=>node.classList.remove('open'));});
})();