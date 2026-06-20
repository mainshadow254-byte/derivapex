window.ApexOnboarding = (function () {
  const KEY = 'apex_onboarding_v1';
  const steps = [
    { title:'Start in demo', body:'Use live market data with clearly simulated balances and trades. No Deriv connection is required.' },
    { title:'Build and backtest', body:'Open the visual builder, choose a quick strategy, and inspect drawdown and every simulated result.' },
    { title:'Use the terminal', body:'Explore charts, indicators, watchlists, positions, transaction history, and your private journal.' },
    { title:'Connect only when ready', body:'Real trading remains backend-controlled and requires your own connected Deriv account and an eligible plan.' },
  ];
  let index = 0;
  function open(force = false) {
    if (!force) { try { if (localStorage.getItem(KEY)) return; } catch {} }
    index = 0;
    let modal = document.getElementById('apex-tour');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'apex-tour'; modal.className = 'tour-overlay';
      modal.innerHTML = '<div class="card tour-modal"><div class="row between"><span class="eyebrow">QUICK TOUR</span><button class="btn ghost sm" data-tour-close>Close</button></div><div data-tour-body></div><div class="row between"><span class="muted-sm" data-tour-count></span><div class="row"><button class="btn ghost" data-tour-prev>Back</button><button class="btn" data-tour-next>Next</button></div></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('[data-tour-close]').onclick = close;
      modal.querySelector('[data-tour-prev]').onclick = () => { index = Math.max(0, index - 1); render(); };
      modal.querySelector('[data-tour-next]').onclick = () => { if (index === steps.length - 1) close(); else { index++; render(); } };
    }
    modal.classList.remove('hidden'); render();
  }
  function render() {
    const modal = document.getElementById('apex-tour'); const step = steps[index];
    modal.querySelector('[data-tour-body]').innerHTML = `<div class="tour-step-number">${index + 1}</div><h2>${step.title}</h2><p class="muted">${step.body}</p>${index === 1 ? '<a class="btn ghost" href="bot-builder.html">Open builder</a>' : index === 2 ? '<a class="btn ghost" href="terminal.html">Open terminal</a>' : ''}`;
    modal.querySelector('[data-tour-count]').textContent = `${index + 1} of ${steps.length}`;
    modal.querySelector('[data-tour-prev]').disabled = index === 0;
    modal.querySelector('[data-tour-next]').textContent = index === steps.length - 1 ? 'Finish' : 'Next';
  }
  function close() { document.getElementById('apex-tour')?.classList.add('hidden'); try { localStorage.setItem(KEY, 'done'); } catch {} }
  return { open };
})();
