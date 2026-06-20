// Professional trading workspace pieces for the terminal:
//  - MarketWatch: available markets, search, categories, favorites + watchlists
//  - AccountSummary: balance / equity / margin / free margin / daily-weekly-monthly P/L
//  - TradingPanels: open positions / pending orders / closed positions / history
// All data is REAL (Deriv symbols + Deriv account when connected, otherwise the
// recorded trade ledger). Honest empty states; never fabricated numbers.

window.MarketWatch = (function () {
  let groups = {}, favorites = [], watchlists = [], onSelect = () => {}, current = null;
  let view = 'all', q = '';

  function askWatchlistName() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:60;display:flex;align-items:center;justify-content:center;padding:18px';
      overlay.innerHTML = `<form class="card" style="width:min(420px,100%);box-shadow:0 30px 90px rgba(0,0,0,.45)">
        <h3 style="margin-top:0">New watchlist</h3>
        <p class="muted" style="font-size:13px">Create a private list for markets you want to monitor.</p>
        <label class="label">Watchlist name</label>
        <input id="watchlist-name-input" class="input" maxlength="120" required placeholder="Favorites for today" />
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
          <button class="btn ghost" type="button" data-cancel>Cancel</button>
          <button class="btn" type="submit">Create</button>
        </div>
      </form>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#watchlist-name-input');
      const close = (value) => { overlay.remove(); resolve(value); };
      overlay.querySelector('[data-cancel]').onclick = () => close('');
      overlay.onclick = (event) => { if (event.target === overlay) close(''); };
      overlay.querySelector('form').onsubmit = (event) => { event.preventDefault(); close(input.value.trim()); };
      setTimeout(() => input.focus(), 0);
    });
  }

  async function init(container, opts = {}) {
    onSelect = opts.onSelect || (() => {});
    container.innerHTML = '<p class="muted">Loading markets…</p>';
    try {
      const [sym, wl] = await Promise.all([api('/market/symbols'), api('/watchlist')]);
      groups = sym.groups || {};
      watchlists = wl.watchlists || [];
      favorites = (watchlists.find((w) => w.is_favorites) || { symbols: [] }).symbols;
    } catch (e) { container.innerHTML = `<div class="notice err">${e.message}</div>`; return; }
    render(container);
  }

  function allSymbols() {
    return Object.entries(groups).flatMap(([market, arr]) => arr.map((s) => ({ ...s, market })));
  }

  function render(container) {
    const cats = Object.keys(groups);
    const customs = watchlists.filter((w) => !w.is_favorites);
    container.innerHTML = `
      <div class="card" style="padding:12px">
        <div class="row between"><strong>Market Watch</strong>
          <button id="new-wl" class="btn ghost sm" title="New watchlist">+ List</button></div>
        <input id="mw-search" class="input" style="margin:8px 0" placeholder="Search markets…" value="${q}">
        <div class="row" style="gap:6px;margin-bottom:8px;overflow-x:auto">
          <span class="pill ${view==='all'?'active':''}" data-v="all">All</span>
          <span class="pill ${view==='fav'?'active':''}" data-v="fav">★ Favorites</span>
          ${customs.map((w)=>`<span class="pill ${view==='wl:'+w.id?'active':''}" data-v="wl:${w.id}">${w.name}</span>`).join('')}
          ${cats.map((c)=>`<span class="pill ${view==='cat:'+c?'active':''}" data-v="cat:${c}">${c}</span>`).join('')}
        </div>
        <div id="mw-list" style="max-height:420px;overflow:auto"></div>
      </div>`;
    container.querySelector('#mw-search').oninput = (e) => { q = e.target.value; list(container); };
    container.querySelectorAll('.pill[data-v]').forEach((p) => p.onclick = () => { view = p.dataset.v; render(container); });
    container.querySelector('#new-wl').onclick = async () => {
      const name = await askWatchlistName(); if (!name) return;
      try { const r = await api('/watchlist', { method:'POST', body: JSON.stringify({ name, symbols: [] }) }); watchlists.push(r.watchlist); render(container); } catch (e) { alert(e.message); }
    };
    list(container);
  }

  function visibleSymbols() {
    let items = allSymbols();
    if (view === 'fav') items = items.filter((s) => favorites.includes(s.symbol));
    else if (view.startsWith('cat:')) items = items.filter((s) => s.market === view.slice(4));
    else if (view.startsWith('wl:')) { const wl = watchlists.find((w) => 'wl:' + w.id === view); const set = new Set(wl?.symbols || []); items = items.filter((s) => set.has(s.symbol)); }
    if (q) { const t = q.toLowerCase(); items = items.filter((s) => (s.name || '').toLowerCase().includes(t) || (s.symbol || '').toLowerCase().includes(t)); }
    return items;
  }

  function list(container) {
    const el = container.querySelector('#mw-list');
    const items = visibleSymbols();
    if (!items.length) { el.innerHTML = '<div class="mc-empty">No markets match.</div>'; return; }
    el.innerHTML = items.slice(0, 300).map((s) => `
      <div class="watch-item ${s.symbol===current?'active':''}" data-sym="${s.symbol}">
        <span><span class="star ${favorites.includes(s.symbol)?'on':''}" data-fav="${s.symbol}">★</span> ${s.name}</span>
        <span class="muted-sm">${s.market}</span>
      </div>`).join('');
    el.querySelectorAll('.watch-item').forEach((row) => row.onclick = (e) => {
      if (e.target.dataset.fav) return;
      current = row.dataset.sym; onSelect(current); list(container);
    });
    el.querySelectorAll('.star[data-fav]').forEach((st) => st.onclick = async (e) => {
      e.stopPropagation();
      try { const r = await api('/watchlist/favorites/toggle', { method:'POST', body: JSON.stringify({ symbol: st.dataset.fav }) }); favorites = r.favorites; list(container); } catch (err) { alert(err.message); }
    });
  }
  function setCurrent(sym) { current = sym; }
  return { init, setCurrent };
})();

window.AccountSummary = (function () {
  async function load(el) {
    el.innerHTML = '<p class="muted">Loading account…</p>';
    let s;
    try { s = await api('/account/summary'); }
    catch (e) { el.innerHTML = `<div class="notice err">${e.message}</div>`; return; }
    const tone = (v) => v > 0 ? 'color:#34d399' : v < 0 ? 'color:#fb7185' : '';
    el.innerHTML = `
      <div class="row between"><strong>Account Summary</strong>
        <span class="badge ${s.mode==='real'?'real':'demo'}">${s.mode.toUpperCase()}</span></div>
      <div class="sum-grid" style="margin-top:8px">
        <div class="sum-item"><div class="k">Balance</div><div class="v">${s.currency} ${MiniCharts.fmt(s.balance)}</div></div>
        <div class="sum-item"><div class="k">Equity</div><div class="v">${MiniCharts.fmt(s.equity)}</div></div>
        <div class="sum-item"><div class="k">Margin</div><div class="v">${MiniCharts.fmt(s.marginUsed)}</div></div>
        <div class="sum-item"><div class="k">Free margin</div><div class="v">${MiniCharts.fmt(s.freeMargin)}</div></div>
        <div class="sum-item"><div class="k">Daily P/L</div><div class="v" style="${tone(s.profitLoss.daily)}">${MiniCharts.fmt(s.profitLoss.daily)}</div></div>
        <div class="sum-item"><div class="k">Weekly P/L</div><div class="v" style="${tone(s.profitLoss.weekly)}">${MiniCharts.fmt(s.profitLoss.weekly)}</div></div>
        <div class="sum-item"><div class="k">Monthly P/L</div><div class="v" style="${tone(s.profitLoss.monthly)}">${MiniCharts.fmt(s.profitLoss.monthly)}</div></div>
        <div class="sum-item"><div class="k">Open positions</div><div class="v">${s.openPositions}</div></div>
      </div>
      ${s.note ? `<p class="muted-sm" style="margin-top:6px">${s.note}</p>` : ''}`;
  }
  return { load };
})();

window.TradingPanels = (function () {
  function init(container) {
    container.innerHTML = `
      <div class="tabs" style="margin-bottom:10px">
        <div class="tab active" data-p="positions">Open Positions</div>
        <div class="tab" data-p="orders">Pending Orders</div>
        <div class="tab" data-p="closed">Closed</div>
        <div class="tab" data-p="history">History</div>
        <div class="tab" data-p="journal">Journal</div>
      </div>
      <div id="tp-body"></div>`;
    const body = container.querySelector('#tp-body');
    const tabs = container.querySelectorAll('.tab[data-p]');
    tabs.forEach((t) => t.onclick = () => { tabs.forEach((x) => x.classList.remove('active')); t.classList.add('active'); show(body, t.dataset.p); });
    show(body, 'positions');
  }

  async function show(body, panel) {
    body.innerHTML = '<p class="muted">Loading…</p>';
    try {
      if (panel === 'positions') {
        const d = await api('/account/positions');
        body.innerHTML = table(['Symbol','Type','Stake/Buy','Entry','Opened'],
          d.positions.map((p) => [p.symbol, p.contract_type || '—', MiniCharts.fmt(p.buy_price || 0), p.entry_price != null ? MiniCharts.fmt(p.entry_price) : '—', p.purchase_time ? new Date(p.purchase_time * (String(p.purchase_time).length>11?1:1000) || p.purchase_time).toLocaleString() : '—']),
          'No open positions.');
      } else if (panel === 'orders') {
        const d = await api('/account/orders');
        body.innerHTML = table(['Symbol','Type','Stake','Created'],
          d.orders.map((o) => [o.symbol, o.contract_type || '—', MiniCharts.fmt(o.stake || 0), new Date(o.opened_at).toLocaleString()]),
          'No pending orders. (Deriv contracts fill instantly; pending orders appear here only when used.)');
      } else if (panel === 'closed') {
        const d = await api('/account/closed');
        const real = (d.deriv || []).map((t) => [t.symbol || '—', MiniCharts.fmt(t.buy_price), MiniCharts.fmt(t.sell_price), profitCell(t.profit), 'real']);
        const led = (d.ledger || []).map((t) => [t.symbol, MiniCharts.fmt(t.stake || 0), t.exit_price != null ? MiniCharts.fmt(t.exit_price) : '—', profitCell(t.profit), t.mode]);
        const rows = [...real, ...led];
        body.innerHTML = table(['Symbol','Buy','Sell/Exit','Profit','Mode'], rows, 'No closed positions yet.');
      } else if (panel === 'history') {
        const d = await api('/account/history');
        body.innerHTML = MiniCharts.stats([
          { label:'Trades', value: d.summary.total },
          { label:'Win rate', value: d.summary.winRate + '%' },
          { label:'Net P/L', value: MiniCharts.fmt(d.summary.netProfit), tone: d.summary.netProfit>=0?'up':'down' },
        ]) + table(['Time','Symbol','Mode','Type','Stake','Status','Profit'],
          d.trades.map((t) => [new Date(t.opened_at).toLocaleString(), t.symbol, t.mode, t.contract_type || '—', MiniCharts.fmt(t.stake||0), t.status, t.profit!=null?profitCell(t.profit):'—']),
          'No trade history yet.');
      } else {
        const d = await api('/account/history');
        if (!d.trades.length) { body.innerHTML = '<div class="mc-empty">No trades to journal yet.</div>'; return; }
        body.innerHTML = `<div class="notice demo">Journal notes are private and stored with your backend trade record.</div><div class="journal-list">${d.trades.map((t) => {
          let note = ''; try { note = JSON.parse(t.meta || '{}').journal_note || ''; } catch {}
          return `<article class="card journal-entry"><div class="row between"><strong>${escapeHtml(t.symbol)} - ${escapeHtml(t.contract_type || 'Trade')}</strong><span class="badge ${t.mode === 'real' ? 'real' : 'demo'}">${escapeHtml(t.mode)}</span></div><div class="muted-sm">${new Date(t.opened_at).toLocaleString()} - ${escapeHtml(t.status)} - P/L ${t.profit == null ? '-' : MiniCharts.fmt(t.profit)}</div><textarea class="input journal-note" maxlength="2000" data-trade="${t.id}" placeholder="What was the setup, emotion, mistake, or lesson?">${escapeHtml(note)}</textarea><div class="row between"><small class="muted">Private note, maximum 2,000 characters</small><button class="btn ghost sm" data-save-note="${t.id}">Save note</button></div></article>`;
        }).join('')}</div>`;
        body.querySelectorAll('[data-save-note]').forEach((button) => button.onclick = async () => {
          const note = body.querySelector(`textarea[data-trade="${button.dataset.saveNote}"]`);
          button.disabled = true;
          try { await api(`/account/history/${button.dataset.saveNote}/note`, { method:'PATCH', body:JSON.stringify({ note:note.value }) }); button.textContent = 'Saved'; }
          catch (e) { button.textContent = e.message; }
          finally { setTimeout(() => { button.disabled = false; button.textContent = 'Save note'; }, 1200); }
        });
      }
    } catch (e) { body.innerHTML = `<div class="notice err">${e.message}</div>`; }
  }

  function profitCell(p) { const v = Number(p || 0); return `<span style="color:${v>=0?'#34d399':'#fb7185'}">${MiniCharts.fmt(v)}</span>`; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
  function table(head, rows, empty) {
    if (!rows.length) return `<div class="mc-empty">${empty}</div>`;
    return `<div class="table-wrap"><table><thead><tr>${head.map((h)=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r)=>`<tr>${r.map((c)=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  return { init };
})();
