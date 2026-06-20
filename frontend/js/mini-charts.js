// Dependency-free SVG charts for analytics / performance graphs. Renders ONLY
// the real series passed to it (equity, profit, drawdown, win-rate, monthly
// returns, growth, activity). If a series is empty it shows an honest empty
// state — it never invents data points.
window.MiniCharts = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = (n) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : (+n).toFixed(Math.abs(n) < 1 ? 3 : 2));

  function empty(msg) {
    return `<div class="mc-empty">${msg || 'No data yet — this graph fills in from real activity.'}</div>`;
  }

  // Line / area chart from [{t,value}] (t is a label or timestamp).
  function line(series, opts = {}) {
    const data = (series || []).filter((d) => d && d.value != null);
    if (data.length < 2) return empty(opts.emptyMsg);
    const w = opts.width || 320, h = opts.height || 120, pad = 6;
    const ys = data.map((d) => +d.value);
    let min = Math.min(...ys), max = Math.max(...ys);
    if (opts.zeroBase && min > 0) min = 0;
    if (opts.zeroBase && max < 0) max = 0;
    if (min === max) { min -= 1; max += 1; }
    const range = max - min;
    const stepX = (w - pad * 2) / (data.length - 1);
    const x = (i) => pad + i * stepX;
    const y = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
    const color = opts.color || '#6366f1';
    const pts = data.map((d, i) => `${x(i)},${y(+d.value)}`).join(' ');
    const areaPts = `${x(0)},${h - pad} ${pts} ${x(data.length - 1)},${h - pad}`;
    const zeroY = (min < 0 && max > 0) ? y(0) : null;
    const last = data[data.length - 1].value;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="mc-svg" style="width:100%;height:${h}px">
      ${opts.area ? `<polygon points="${areaPts}" fill="${color}22"/>` : ''}
      ${zeroY != null ? `<line x1="${pad}" x2="${w - pad}" y1="${zeroY}" y2="${zeroY}" stroke="#64748b55" stroke-dasharray="3 3"/>` : ''}
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${x(data.length - 1)}" cy="${y(+last)}" r="3" fill="${color}"/>
    </svg>
    <div class="mc-meta"><span>${fmt(min)}</span><span>last <b style="color:${color}">${fmt(last)}</b></span><span>${fmt(max)}</span></div>`;
  }

  // Bar chart from [{label,value}] (diverging colors for +/-).
  function bars(series, opts = {}) {
    const data = (series || []).filter((d) => d && d.value != null);
    if (!data.length) return empty(opts.emptyMsg);
    const max = Math.max(...data.map((d) => Math.abs(+d.value))) || 1;
    const pos = opts.color || '#10b981', neg = opts.negColor || '#f43f5e';
    return `<div class="mc-bars">` + data.slice(0, opts.limit || 24).map((d) => {
      const v = +d.value, pct = Math.abs(v) / max * 100;
      return `<div class="mc-bar-row">
        <span class="mc-bar-label">${d.label}</span>
        <div class="mc-bar-track"><div class="mc-bar-fill" style="width:${pct}%;background:${v < 0 ? neg : pos}"></div></div>
        <b class="mc-bar-val" style="color:${v < 0 ? neg : pos}">${fmt(v)}</b>
      </div>`;
    }).join('') + `</div>`;
  }

  // KPI stat tiles from [{label,value,tone}].
  function stats(items) {
    return `<div class="mc-stats">` + items.map((s) => `
      <div class="mc-stat">
        <div class="mc-stat-val ${s.tone || ''}">${s.value}</div>
        <div class="mc-stat-label">${s.label}</div>
      </div>`).join('') + `</div>`;
  }

  function card(title, inner, sub) {
    return `<div class="card mc-card"><div class="mc-title">${title}${sub ? `<span class="muted mc-sub">${sub}</span>` : ''}</div>${inner}</div>`;
  }

  return { line, bars, stats, card, empty, fmt };
})();
