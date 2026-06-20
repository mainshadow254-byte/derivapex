// AI analysis panel — renders REAL backend chart analysis. Free users see a
// reduced view (locked fields), paid users see full reasoning. No fabrication.
window.AIAnalysis = {
  async render(el, symbol, granularity, refs) {
    try {
      const a = await api(`/market/analysis?symbol=${symbol}&granularity=${granularity}`);
      if (refs?.trendEl) refs.trendEl.textContent = a.trend ? `${a.trend.direction} (${a.trend.bias||''})` : '—';
      if (refs?.volatEl) refs.volatEl.textContent = a.volatility ? `${a.volatility.level} (${a.volatility.atrPct}%)` : '—';

      if (a.locked) {
        el.innerHTML = `
          <div class="notice demo">Demo view — upgrade to unlock confidence, risk, S/R zones & full reasoning.</div>
          <p>Trend: <b>${a.trend.direction}</b></p>
          <p>Volatility: <b>${a.volatility.level}</b> (${a.volatility.atrPct}%)</p>
          <p class="muted" style="font-size:12px">${a.riskWarning}</p>`;
        return;
      }

      const bar = (label, val, color) => `
        <div style="margin:6px 0">
          <div style="display:flex;justify-content:space-between;font-size:12px"><span class="muted">${label}</span><b>${val}%</b></div>
          <div style="height:8px;background:#0d1426;border-radius:6px;overflow:hidden"><div style="height:100%;width:${val}%;background:${color}"></div></div>
        </div>`;

      el.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span class="badge ${a.trend.bias==='bullish'?'real':a.trend.bias==='bearish'?'warn':'demo'}">${a.trend.bias.toUpperCase()}</span>
          <span class="badge ${a.volatility.level==='high'?'warn':a.volatility.level==='medium'?'demo':'real'}">VOL ${a.volatility.level.toUpperCase()}</span>
        </div>
        ${bar('Confidence', a.confidence, '#22d3ee')}
        ${bar('Risk', a.risk, '#f43f5e')}
        <div style="font-size:13px;margin-top:10px">
          <p><b>Trend:</b> ${a.trend.direction} · momentum ${a.momentum}% · strength ${a.trend.strength}</p>
          <p><b>Support:</b> ${a.support.map(x=>x.toFixed(4)).join(', ')||'—'}</p>
          <p><b>Resistance:</b> ${a.resistance.map(x=>x.toFixed(4)).join(', ')||'—'}</p>
          ${a.reasons.bullish?`<p>🟢 ${a.reasons.bullish}</p>`:''}
          ${a.reasons.bearish?`<p>🔴 ${a.reasons.bearish}</p>`:''}
          <p>⚠️ ${a.reasons.risk}</p>
          <p class="muted">${a.reasons.selection}</p>
          <p style="font-size:12px"><b>Invalidation:</b> ${a.invalidation}</p>
        </div>
        <p class="muted" style="font-size:11px;margin-top:8px">${a.riskWarning}</p>`;
    } catch (e) {
      el.innerHTML = `<div class="notice ${e.status===425?'demo':'err'}">${e.message}${e.status===425?' (collecting candles…)':''}</div>`;
    }
  }
};
