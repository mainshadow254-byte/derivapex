window.DTraderPanel = (function () {
  function money(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  }

  function init(opts) {
    const state = { mode: 'demo', busy: false };
    const setMode = (mode) => {
      state.mode = mode === 'real' ? 'real' : 'demo';
      opts.badgeEl.textContent = state.mode.toUpperCase();
      opts.badgeEl.className = `badge ${state.mode === 'real' ? 'real' : 'demo'}`;
      opts.modeButtons.forEach((button) => {
        const active = button.dataset.dtMode === state.mode;
        button.classList.toggle('ghost', !active);
      });
      if (state.mode === 'real' && !opts.me.deriv_connected) {
        opts.ticketEl.innerHTML = 'Real trading needs a connected Deriv account. Use the connect card above, then return to this panel.';
      } else {
        opts.ticketEl.innerHTML = `${state.mode === 'real' ? 'Real' : 'Demo'} ticket ready. Stake <b>${money(opts.stakeEl.value)}</b>, duration <b>${opts.durationEl.value || 5}${opts.unitEl.value}</b>.`;
      }
    };

    const place = async (contractType) => {
      if (state.busy) return;
      const amount = Number(opts.stakeEl.value);
      const duration = Number(opts.durationEl.value || 5);
      if (!opts.symbolEl.value || !amount || amount < 0.35) {
        opts.ticketEl.textContent = 'Choose a market and enter a stake of at least 0.35.';
        return;
      }
      if (state.mode === 'real' && !opts.me.deriv_connected) {
        opts.ticketEl.textContent = 'Connect your Deriv account before placing real trades.';
        return;
      }

      state.busy = true;
      opts.riseEl.disabled = true;
      opts.fallEl.disabled = true;
      opts.ticketEl.textContent = `Placing ${state.mode} ${contractType === 'CALL' ? 'Rise' : 'Fall'} trade...`;
      try {
        const path = state.mode === 'real' ? '/trading/real-trade' : '/trading/demo-trade';
        const body = {
          symbol: opts.symbolEl.value,
          contractType,
          amount,
          duration,
          durationUnit: opts.unitEl.value,
        };
        const result = await api(path, { method: 'POST', body: JSON.stringify(body) });
        const id = result.contract_id || result.tradeId || 'recorded';
        opts.ticketEl.innerHTML = `<b>${state.mode.toUpperCase()} ${contractType === 'CALL' ? 'Rise' : 'Fall'}</b> placed on ${opts.symbolEl.value}. Ticket: ${id}.`;
        opts.onTrade?.(result);
      } catch (error) {
        const detail = error?.body?.detail ? ` ${error.body.detail}` : '';
        opts.ticketEl.textContent = `${error.message || 'Trade failed.'}${detail}`;
      } finally {
        state.busy = false;
        opts.riseEl.disabled = false;
        opts.fallEl.disabled = false;
      }
    };

    opts.modeButtons.forEach((button) => {
      button.onclick = () => setMode(button.dataset.dtMode);
    });
    opts.stakeEl.oninput = () => setMode(state.mode);
    opts.durationEl.oninput = () => setMode(state.mode);
    opts.unitEl.onchange = () => setMode(state.mode);
    opts.riseEl.onclick = () => place('CALL');
    opts.fallEl.onclick = () => place('PUT');
    setMode('demo');
  }

  return { init };
})();
