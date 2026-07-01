// Copy-trading marketplace UI. Browse/search/filter/compare strategies, follow
// with capital + risk limits, control copying (start/pause/stop), and view real
// performance graphs (equity / profit / drawdown / monthly returns / risk).
// All stats come from the backend (real recorded trades). Honest empty states.
window.CopyTrading = (function () {
  let state = { q: '', category: '', sort: 'followers', canCopy: false };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  function emptyCopyState() {
    return `<div class="empty-upgrade" style="grid-column:1/-1">
      <strong>No copy strategies published yet — no fake leaders shown.</strong><br>
      ApexBot should only show copy leaders after backend-recorded trades exist. Use the public bot lab to see the safe copy-trading standard: capital limit, max risk per trade, daily loss limit, and pause/stop controls.
      <div class="row"><a class="btn" href="demo-bots.html">Open copy preview</a><a class="btn ghost" href="guide.html#risk">Read risk guide</a></div>
    </div>`;
  }

  function copyRiskModal(name) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:60;display:flex;align-items:center;justify-content:center;padding:18px';
      overlay.innerHTML = `<form class="card" style="width:min(500px,100%);box-shadow:0 30px 90px rgba(0,0,0,.45)">
        <h3 style="margin-top:0">Follow / Copy strategy</h3>
        <p class="muted" style="font-size:13px">Set backend-enforced limits before copying "${esc(name)}". Copying is not a guarantee and can lose money.</p>
        <label class="label">Capital allocation</label>
        <input id="copy-capital" class="input" type="number" min="0" step="0.01" required value="100" />
        <label class="label" style="margin-top:10px">Max risk per trade</label>
        <input id="copy-per-trade" class="input" type="number" min="0" step="0.01" required value="5" />
        <label class="label" style="margin-top:10px">Max daily loss</label>
        <input id="copy-daily" class="input" type="number" min="0" step="0.01" required value="20" />
        <div class="risk-note" style="margin-top:10px">Recommended: max risk per trade should be much smaller than capital allocation, and max daily loss should stop copying automatically.</div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
          <button class="btn ghost" type="button" data-cancel>Cancel</button>
          <button class="btn" type="submit">Start copying with limits</button>
        </div>
      </form>`;
      document.body.appendChild(overlay);
      const close = (value) => { overlay.remove(); resolve(value); };
      overlay.querySelector('[data-cancel]').onclick = () => close(null);
      overlay.onclick = (event) => { if (event.target === overlay) close(null); };
      overlay.querySelector('form').onsubmit = (event) => {
        event.preventDefault();
        const capital = +overlay.querySelector('#copy-capital').value;
        const perTrade = +overlay.querySelector('#copy-per-trade').value;
        const daily = +overlay.querySelector('#copy-daily').value;
        if (perTrade > capital * 0.1 && !confirm('Risk per trade is above 10% of allocated capital. Continue?')) return;
        if (daily > capital * 0.3 && !confirm('Daily loss limit is above 30% of allocated capital. Continue?')) return;
        close({ capital_allocation: capital, risk_max_per_trade: perTrade, risk_max_daily_loss: daily });
      };
      setTimeout(() => overlay.querySelector('#copy-capital').focus(), 0);
    });
  }

  function strategyCard(s) {
    const dd = s.maxDrawdown != null ? s.maxDrawdown.toFixed(1) + '%' : '—';
    const hasHistory = !!s.hasHistory;
    return `<div class="card">
      <div class="row between"><strong>${esc(s.name)}</strong>
        <span class="badge ${hasHistory && s.winRate >= 55 ? 'real' : hasHistory && s.winRate >= 45 ? 'demo' : 'warn'}">${hasHistory ? esc(s.winRate) + '% win' : 'needs history'}</span></div>
      <div class="muted-sm">by ${esc(s.provider_name)} · ${esc(s.category)}${s.symbol ? ' · ' + esc(s.symbol) : ''}</div>
      <div class="mc-stats" style="margin:8px 0">
        <div class="mc-stat"><div class="mc-stat-val">${esc(s.followers || 0)}</div><div class="mc-stat-label">Followers</div></div>
        <div class="mc-stat"><div class="mc-stat-val ${s.netProfit >= 0 ? 'up' : 'down'}">${hasHistory ? MiniCharts.fmt(s.netProfit) : '—'}</div><div class="mc-stat-label">Net P/L</div></div>
        <div class="mc-stat"><div class="mc-stat-val">${hasHistory ? dd : '—'}</div><div class="mc-stat-label">Max DD</div></div>
        <div class="mc-stat"><div class="mc-stat-val">${esc(s.risk_score ?? '—')}</div><div class="mc-stat-label">Risk score</div></div>
      </div>
      ${s.description ? `<p class="muted" style="font-size:12px">${esc(s.description)}</p>` : ''}
      <div class="risk-note">Follow only with capital, per-trade, and daily-loss limits. Performance history is not a guarantee.</div>
      <div class="row">
        <button class="btn ghost sm" data-perf="${esc(s.id)}">Performance</button>
        <label class="pill"><input type="checkbox" data-cmp="${esc(s.id)}" style="margin-right:4px"> Compare</label>
        ${state.canCopy
          ? `<button class="btn sm" data-follow="${esc(s.id)}" data-name="${esc(s.name)}">Follow / Copy</button>`
          : `<span class="muted-sm">Standard plan+ to copy</span>`}
      </div>
      <div class="perf-slot" id="perf-${esc(s.id)}"></div>
    </div>`;
  }

  async function load(container) {
    container.innerHTML = `
      <div class="card" style="grid-column:1/-1">
        <div class="row between">
          <div><h3 style="margin:0">Copy Trading Marketplace</h3><p class="muted" style="font-size:12px;margin:4px 0 0">Copy only with risk limits. Rankings must come from backend trade records.</p></div>
          <button id="cmp-btn" class="btn ghost sm" disabled>Compare selected</button>
        </div>
        <div class="row" style="margin-top:10px">
          <input id="cp-q" class="input" style="max-width:240px" placeholder="Search strategies…" value="${esc(state.q)}">
          <select id="cp-cat" class="input" style="max-width:160px">
            <option value="">All categories</option>
            ${['trend','scalping','grid','reversal','ai','mixed'].map((c)=>`<option ${state.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <select id="cp-sort" class="input" style="max-width:170px">
            <option value="followers">Most followers</option>
            <option value="winRate">Best win rate</option>
            <option value="profit">Most profit</option>
            <option value="risk">Lowest risk</option>
          </select>
          <a class="btn ghost sm" href="demo-bots.html">Copy preview</a>
        </div>
        <div id="my-follows" style="margin-top:10px"></div>
      </div>
      <div id="cp-list" class="grid cols-2" style="grid-column:1/-1"></div>
      <div id="cmp-panel" style="grid-column:1/-1"></div>`;

    const listEl = container.querySelector('#cp-list');
    const renderList = async () => {
      listEl.innerHTML = '<p class="muted">Loading strategies…</p>';
      try {
        const { strategies } = await api(`/copy/strategies?q=${encodeURIComponent(state.q)}&category=${state.category}&sort=${state.sort}`);
        listEl.innerHTML = strategies.length ? strategies.map(strategyCard).join('') : emptyCopyState();
        wireCards(listEl, container);
      } catch (e) { listEl.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
    };
    container.querySelector('#cp-q').oninput = (e) => { state.q = e.target.value; clearTimeout(window._cpT); window._cpT = setTimeout(renderList, 300); };
    container.querySelector('#cp-cat').onchange = (e) => { state.category = e.target.value; renderList(); };
    container.querySelector('#cp-sort').onchange = (e) => { state.sort = e.target.value; renderList(); };
    container.querySelector('#cmp-btn').onclick = () => compareSelected(container);
    await renderFollows(container);
    renderList();
  }

  function selectedIds(container) { return [...container.querySelectorAll('input[data-cmp]:checked')].map((x) => x.dataset.cmp); }

  function wireCards(listEl, container) {
    listEl.querySelectorAll('input[data-cmp]').forEach((cb) => cb.onchange = () => {
      const n = selectedIds(container).length;
      const btn = container.querySelector('#cmp-btn'); btn.disabled = n < 2; btn.textContent = `Compare selected (${n})`;
    });
    listEl.querySelectorAll('button[data-perf]').forEach((b) => b.onclick = () => togglePerf(b.dataset.perf));
    listEl.querySelectorAll('button[data-follow]').forEach((b) => b.onclick = () => followFlow(b.dataset.follow, b.dataset.name, container));
  }

  async function togglePerf(id) {
    const slot = document.getElementById('perf-' + id);
    if (!slot) return;
    if (slot.innerHTML) { slot.innerHTML = ''; return; }
    slot.innerHTML = '<p class="muted">Loading performance…</p>';
    try {
      const p = await api(`/copy/strategies/${id}/performance`);
      if (!p.hasHistory) { slot.innerHTML = '<div class="mc-empty">No backend trade history yet for this strategy.</div>'; return; }
      slot.innerHTML = `<div style="margin-top:8px">
        ${MiniCharts.card('Equity curve', MiniCharts.line(p.equityCurve, { color:'#22d3ee', area:true }))}
        ${MiniCharts.card('Profit curve', MiniCharts.line(p.profitCurve, { color:'#10b981', area:true }))}
        ${MiniCharts.card('Drawdown', MiniCharts.line(p.drawdownCurve, { color:'#f43f5e' }))}
        ${MiniCharts.card('Monthly returns', MiniCharts.bars(p.monthlyReturns.map((m)=>({label:m.month,value:m.profit}))))}
        ${MiniCharts.card('Risk trend', MiniCharts.line(p.riskTrend, { color:'#f59e0b' }))}
      </div>`;
    } catch (e) { slot.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
  }

  async function followFlow(id, name, container) {
    const limits = await copyRiskModal(name);
    if (!limits) return;
    try {
      await api(`/copy/follow/${id}`, { method: 'POST', body: JSON.stringify(limits) });
      await renderFollows(container);
      alert('Now copying. Copying is backend-enforced with your risk limits.');
    } catch (e) { alert(e.message); }
  }

  async function renderFollows(container) {
    const wrap = container.querySelector('#my-follows'); if (!wrap) return;
    try {
      const { follows } = await api('/copy/my-follows');
      if (!follows.length) { wrap.innerHTML = ''; return; }
      wrap.innerHTML = `<div class="muted-sm" style="margin-bottom:6px">Your copies</div>` + follows.map((f) => `
        <div class="row between" style="padding:6px 0;border-top:1px solid var(--line)">
          <span>${esc(f.name)} <span class="badge ${f.status==='active'?'real':f.status==='paused'?'demo':'warn'}">${esc(f.status)}</span>
            <span class="muted-sm">· cap ${esc(f.capital_allocation)} · ${esc(f.stats.winRate)}% win · P/L ${MiniCharts.fmt(f.stats.netProfit)}</span></span>
          <span class="row">
            <button class="btn ghost sm" data-ctl="start" data-s="${esc(f.strategy)}">Start</button>
            <button class="btn ghost sm" data-ctl="pause" data-s="${esc(f.strategy)}">Pause</button>
            <button class="btn ghost sm" data-ctl="stop" data-s="${esc(f.strategy)}">Stop</button>
            <button class="btn danger sm" data-unf="${esc(f.strategy)}">Unfollow</button>
          </span>
        </div>`).join('');
      wrap.querySelectorAll('button[data-ctl]').forEach((b) => b.onclick = async () => {
        await api(`/copy/follow/${b.dataset.s}/${b.dataset.ctl}`, { method: 'POST' }); renderFollows(container);
      });
      wrap.querySelectorAll('button[data-unf]').forEach((b) => b.onclick = async () => {
        if (!confirm('Stop copying and unfollow?')) return;
        await api(`/copy/follow/${b.dataset.unf}`, { method: 'DELETE' }); renderFollows(container);
      });
    } catch { wrap.innerHTML = ''; }
  }

  async function compareSelected(container) {
    const ids = selectedIds(container); if (ids.length < 2) return;
    const panel = container.querySelector('#cmp-panel');
    panel.innerHTML = '<p class="muted">Comparing…</p>';
    try {
      const { compare } = await api(`/copy/compare?ids=${ids.join(',')}`);
      panel.innerHTML = `<div class="card"><h3 style="margin-top:0">Comparison</h3>
        <div class="table-wrap"><table><thead><tr><th>Strategy</th><th>Followers</th><th>Win rate</th><th>Net P/L</th><th>Profit factor</th><th>Max DD</th></tr></thead>
        <tbody>${compare.map((c)=>`<tr><td>${esc(c.id).slice(0,6)}…</td><td>${esc(c.stats.followers)}</td><td>${esc(c.stats.winRate)}%</td><td>${MiniCharts.fmt(c.stats.netProfit)}</td><td>${esc(c.stats.profitFactor)}</td><td>${esc(c.stats.maxDrawdown)}%</td></tr>`).join('')}</tbody></table></div></div>`;
    } catch (e) { panel.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
  }

  return { load, setCanCopy(v) { state.canCopy = v; } };
})();
