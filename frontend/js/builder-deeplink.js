(function(){
  const params = new URLSearchParams(window.location.search);
  const template = params.get('template');
  const symbol = params.get('symbol');
  const contract = params.get('contract');
  if (!template && !symbol && !contract) return;

  function fire(node, type='change'){
    if (!node) return;
    node.dispatchEvent(new Event(type, { bubbles:true }));
  }

  function setSelectValue(select, value){
    if (!select || !value) return false;
    const option = Array.from(select.options || []).find((o)=>o.value === value || o.textContent === value || o.textContent.includes(value));
    if (!option) return false;
    select.value = option.value;
    fire(select, 'change');
    return true;
  }

  function log(text){
    const target = document.getElementById('builder-log');
    if (!target) return;
    const row = document.createElement('div');
    row.className = 'log-ok';
    row.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    target.prepend(row);
  }

  function apply(){
    const picker = document.getElementById('template-picker');
    if (!picker || picker.options.length < 2) return setTimeout(apply, 200);
    if (template) {
      picker.value = template;
      fire(picker, 'change');
      log(`Template preset loaded from link: ${template}.`);
    }
    setTimeout(()=>{
      const tradeBlock = Array.from(document.querySelectorAll('.visual-node')).find((n)=>n.className.includes('trade_parameters'));
      if (tradeBlock) tradeBlock.click();
      setTimeout(()=>{
        const okSymbol = setSelectValue(document.getElementById('p-symbol'), symbol);
        const okContract = setSelectValue(document.getElementById('p-contract'), contract);
        if (okSymbol || okContract) log('Market/contract preset applied from template link. Review risk controls before demo testing.');
      }, 500);
    }, 700);
  }

  apply();
})();
