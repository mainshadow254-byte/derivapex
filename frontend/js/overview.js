// Market overview graphs — all from REAL /api/scanner/overview data.
// Lightweight dependency-free HTML/CSS bar charts. Honest empty state when the
// scanner is still warming up (no fabricated numbers).
window.MarketOverview = {
  _bars(items, valueKey, labelKey, fmt, color) {
    if (!items.length) return '<p class="muted">No data.</p>';
    const max = Math.max(...items.map((x) => Math.abs(x[valueKey]))) || 1;
    return items.slice(0, 8).map((x) => {
      const v = x[valueKey], w = Math.abs(v) / max * 100;
      return `<div style="margin:6px 0">
        <div style="display:flex;justify-content:space-between;font-size:12px"><span>${x[labelKey]}</span><b>${fmt(v)}</b></div>
        <div style="height:8px;background:#0d1426;border-radius:6px;overflow:hidden"><div style="height:100%;width:${w}%;background:${color}"></div></div>
      </div>`;
    }).join('');
  },

  async load(container) {
    container.innerHTML = '<p class="muted">Loading market overview…</p>';
    let d;
    try { d = await api('/scanner/overview'); }
    catch (e) { container.innerHTML = `<div class="notice err">${e.message}</div>`; return; }
    if (!d.ready) { container.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="notice demo">${d.message}</div></div>`; return; }

    const card = (title, body) => `<div class="card"><h3 style="margin-top:0;font-size:15px">${title}</h3>${body}</div>`;
    const conf = d.confidenceDistribution, risk = d.riskDistribution;
    const distBars = (obj, color) => {
      const max = Math.max(...Object.values(obj)) || 1;
      return Object.entries(obj).map(([k, v]) => `<div style="margin:6px 0"><div style="display:flex;justify-content:space-between;font-size:12px"><span>${k}</span><b>${v}</b></div><div style="height:8px;background:#0d1426;border-radius:6px;overflow:hidden"><div style="height:100%;width:${v/max*100}%;background:${color}"></div></div></div>`).join('');
    };

    container.innerHTML =
      card('🌪️ Volatility rankings', this._bars(d.volatilityRanking, 'volatility', 'symbol', (v)=>v.toFixed(4), '#f59e0b')) +
      card('⚡ Most active (momentum)', this._bars(d.mostActive, 'momentum', 'symbol', (v)=>v.toFixed(3)+'%', '#22d3ee')) +
      card('🎯 Opportunity rankings', this._bars(d.opportunityRanking, 'score', 'symbol', (v)=>Math.round(v), '#6366f1')) +
      card('📊 Scanner confidence distribution', distBars(conf, '#10b981')) +
      card('🛡️ Market risk distribution', distBars(risk, '#f43f5e'));
  },
};
