// Technical indicators — pure functions over REAL candle arrays [{t,o,h,l,c}].
// No randomness, no fabrication. Returns series aligned to candle time.
window.Indicators = (function () {
  const closes = (c) => c.map((x) => x.c);

  function sma(candles, period) {
    const v = closes(candles); const out = [];
    for (let i = 0; i < v.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      let s = 0; for (let j = i - period + 1; j <= i; j++) s += v[j];
      out.push({ time: candles[i].t, value: s / period });
    }
    return out.filter(Boolean);
  }

  function ema(candles, period) {
    const v = closes(candles); const k = 2 / (period + 1); const out = [];
    let prev; for (let i = 0; i < v.length; i++) {
      prev = i === 0 ? v[0] : v[i] * k + prev * (1 - k);
      if (i >= period - 1) out.push({ time: candles[i].t, value: prev });
    }
    return out;
  }

  function rsi(candles, period = 14) {
    const v = closes(candles); const out = []; let gain = 0, loss = 0;
    for (let i = 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      if (i <= period) { gain += Math.max(d, 0); loss += Math.max(-d, 0); if (i === period) { gain /= period; loss /= period; const rs = loss === 0 ? 100 : gain / loss; out.push({ time: candles[i].t, value: 100 - 100 / (1 + rs) }); } }
      else { gain = (gain * (period - 1) + Math.max(d, 0)) / period; loss = (loss * (period - 1) + Math.max(-d, 0)) / period; const rs = loss === 0 ? 100 : gain / loss; out.push({ time: candles[i].t, value: 100 - 100 / (1 + rs) }); }
    }
    return out;
  }

  function macd(candles, fast = 12, slow = 26, signal = 9) {
    const ef = ema(candles, fast), es = ema(candles, slow);
    const map = new Map(ef.map((p) => [p.time, p.value]));
    const line = es.map((p) => ({ time: p.time, value: (map.get(p.time) ?? p.value) - p.value }));
    // signal = EMA of macd line
    const k = 2 / (signal + 1); let prev; const sig = [];
    line.forEach((p, i) => { prev = i === 0 ? p.value : p.value * k + prev * (1 - k); sig.push({ time: p.time, value: prev }); });
    const hist = line.map((p, i) => ({ time: p.time, value: p.value - (sig[i]?.value ?? 0) }));
    return { line, signal: sig, hist };
  }

  function bollinger(candles, period = 20, mult = 2) {
    const v = closes(candles); const upper = [], lower = [], mid = [];
    for (let i = period - 1; i < v.length; i++) {
      const slice = v.slice(i - period + 1, i + 1);
      const m = slice.reduce((a, b) => a + b, 0) / period;
      const sd = Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / period);
      mid.push({ time: candles[i].t, value: m });
      upper.push({ time: candles[i].t, value: m + mult * sd });
      lower.push({ time: candles[i].t, value: m - mult * sd });
    }
    return { upper, mid, lower };
  }

  function atr(candles, period = 14) {
    const out = []; const tr = [];
    for (let i = 1; i < candles.length; i++) {
      const c = candles[i], p = candles[i - 1];
      tr.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
      if (i >= period) { const a = tr.slice(i - period, i).reduce((s, x) => s + x, 0) / period; out.push({ time: candles[i].t, value: a }); }
    }
    return out;
  }

  // Support/resistance from recent swing points (returns price levels).
  function levels(candles, lookback = 80) {
    const w = candles.slice(-lookback); const highs = [], lows = [];
    for (let i = 2; i < w.length - 2; i++) {
      if (w[i].h > w[i-1].h && w[i].h > w[i-2].h && w[i].h > w[i+1].h && w[i].h > w[i+2].h) highs.push(w[i].h);
      if (w[i].l < w[i-1].l && w[i].l < w[i-2].l && w[i].l < w[i+1].l && w[i].l < w[i+2].l) lows.push(w[i].l);
    }
    return { resistance: [...new Set(highs)].sort((a,b)=>b-a).slice(0,3), support: [...new Set(lows)].sort((a,b)=>a-b).slice(0,3) };
  }

  // Trend line from linear regression of closes (returns 2 endpoints).
  function trendline(candles) {
    const n = candles.length; if (n < 2) return null;
    const xs = candles.map((_, i) => i), ys = closes(candles);
    const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
    let num = 0, den = 0; for (let i=0;i<n;i++){ num += (xs[i]-mx)*(ys[i]-my); den += (xs[i]-mx)**2; }
    const slope = den ? num/den : 0, intercept = my - slope*mx;
    return [{ time: candles[0].t, value: intercept }, { time: candles[n-1].t, value: intercept + slope*(n-1) }];
  }

  return { sma, ema, rsi, macd, bollinger, atr, levels, trendline };
})();
