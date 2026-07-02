(function(){
  if(!document.querySelector('link[data-studio-fixes]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='css/trading-studio-fixes.css?v=20260702-1';
    link.dataset.studioFixes='1';
    document.head.appendChild(link);
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