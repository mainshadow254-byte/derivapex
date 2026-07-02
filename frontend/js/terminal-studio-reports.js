(function waitForStudio(){
  if(!window.ApexStudio){setTimeout(waitForStudio,80);return;}
  const {state,selectMarket,esc}=window.ApexStudio;
  const $=(id)=>document.getElementById(id);
  const money=(value)=>Number(value||0).toFixed(2);

  document.querySelectorAll('[data-report-tab]').forEach((button)=>button.onclick=()=>{
    document.querySelectorAll('[data-report-tab]').forEach((node)=>node.classList.toggle('active',node===button));
    document.querySelectorAll('[data-report-view]').forEach((view)=>view.classList.toggle('active',view.dataset.reportView===button.dataset.reportTab));
    if(button.dataset.reportTab!=='summary')loadReports();
  });

  async function loadReports(){
    let data;
    try{data=await api('/account/history');}
    catch(error){$('terminal-transactions').innerHTML=`<div class="studio-empty">${esc(error.message)}</div>`;$('terminal-journal').innerHTML=`<div class="studio-empty">${esc(error.message)}</div>`;return;}
    const trades=data.trades||[];
    const won=trades.filter((trade)=>Number(trade.profit)>0).length;
    const lost=trades.filter((trade)=>Number(trade.profit)<0).length;
    const totalStake=trades.reduce((sum,trade)=>sum+Number(trade.stake||0),0);
    const totalProfit=trades.reduce((sum,trade)=>sum+Number(trade.profit||0),0);
    const totalPayout=trades.reduce((sum,trade)=>sum+Math.max(0,Number(trade.stake||0)+Number(trade.profit||0)),0);
    const currency=trades[0]?.currency||'USD';
    $('metric-stake').textContent=`${money(totalStake)} ${currency}`;
    $('metric-payout').textContent=`${money(totalPayout)} ${currency}`;
    $('metric-runs').textContent=trades.length;
    $('metric-lost').textContent=lost;
    $('metric-won').textContent=won;
    $('metric-profit').textContent=`${money(totalProfit)} ${currency}`;
    $('terminal-summary-empty').style.display=trades.length?'none':'grid';
    $('terminal-transactions').innerHTML=trades.length?`<table class="studio-report-table"><thead><tr><th>Time</th><th>Market</th><th>Type</th><th>Stake</th><th>P/L</th></tr></thead><tbody>${trades.slice(0,100).map((trade)=>`<tr><td>${esc(new Date(trade.opened_at).toLocaleString())}</td><td>${esc(trade.symbol)}</td><td>${esc(trade.contract_type||'—')}</td><td>${money(trade.stake)}</td><td>${money(trade.profit)}</td></tr>`).join('')}</tbody></table>`:'<div class="studio-empty">No transactions yet.</div>';
    $('terminal-journal').innerHTML=trades.length?trades.slice(0,80).map((trade)=>{let note='';try{note=JSON.parse(trade.meta||'{}').journal_note||'';}catch{}return `<article class="studio-journal-entry"><strong>${esc(trade.symbol)} · ${esc(trade.contract_type||'Trade')}</strong><p>${esc(new Date(trade.opened_at).toLocaleString())} · P/L ${money(trade.profit)}</p><p>${esc(note||'No journal note recorded.')}</p></article>`;}).join(''):'<div class="studio-empty">No journal entries yet.</div>';
  }

  $('terminal-run').onclick=()=>{$('terminal-trade-drawer').classList.toggle('open');};
  $('trade-close').onclick=()=>$('terminal-trade-drawer').classList.remove('open');
  $('dt-symbol').innerHTML=state.symbols.map((item)=>`<option value="${esc(item.symbol)}">${esc(item.name||item.symbol)}</option>`).join('');
  $('dt-symbol').value=state.current.symbol;
  window.DTraderPanel?.init({
    me:state.me,
    symbolEl:$('dt-symbol'),stakeEl:$('dt-stake'),durationEl:$('dt-duration'),unitEl:$('dt-unit'),ticketEl:$('dt-ticket'),badgeEl:$('dt-mode-badge'),riseEl:$('dt-rise'),fallEl:$('dt-fall'),modeButtons:document.querySelectorAll('[data-dt-mode]'),
    onTrade:async()=>{await loadReports();$('studio-run-state').textContent='Trade recorded';setTimeout(()=>$('studio-run-state').textContent='Bot is not running',1800);}
  });
  $('dt-symbol').onchange=()=>selectMarket($('dt-symbol').value);
  $('terminal-reset-report').onclick=()=>loadReports();
  loadReports();
})();