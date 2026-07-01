// Chart analysis from REAL Deriv candles. Uses multi-indicator confluence for
// synthetic markets: EMA/SMA, MACD, RSI, Bollinger Bands, Stochastic, ATR,
// support/resistance, trend strength, volatility and invalidation.
import { getCandles } from './derivData.js';

const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const stdev = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const pct = (a, b) => b ? ((a - b) / b) * 100 : 0;
const round = (n, d = 4) => Number.isFinite(n) ? +n.toFixed(d) : null;
const last = (a) => a[a.length - 1];
function sma(values, n) { return values.length >= n ? mean(values.slice(-n)) : null; }
function emaArr(values, n) { const k = 2 / (n + 1); let prev = values[0]; const out = [prev]; for (let i = 1; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out.push(prev); } return out; }
function rsi(values, n = 14) {
  if (values.length <= n) return null;
  const changes = values.slice(1).map((v, i) => v - values[i]).slice(-n);
  const gains = changes.filter((x) => x > 0);
  const losses = changes.filter((x) => x < 0).map(Math.abs);
  const avgGain = mean(gains);
  const avgLoss = mean(losses);
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}
function macd(values) {
  if (values.length < 35) return null;
  const e12 = emaArr(values, 12), e26 = emaArr(values, 26);
  const line = values.map((_, i) => e12[i] - e26[i]).slice(25);
  const signal = emaArr(line, 9);
  const m = last(line), s = last(signal);
  return { line: m, signal: s, histogram: m - s, state: m > s ? 'bullish' : 'bearish' };
}
function bollinger(values, n = 20, mult = 2) {
  if (values.length < n) return null;
  const win = values.slice(-n), mid = mean(win), sd = stdev(win), upper = mid + sd * mult, lower = mid - sd * mult, price = last(values);
  return { upper, middle: mid, lower, widthPct: pct(upper - lower, mid), position: upper === lower ? 0.5 : (price - lower) / (upper - lower) };
}
function stochastic(candles, n = 14) {
  if (candles.length < n) return null;
  const win = candles.slice(-n), hi = Math.max(...win.map((c) => c.h)), lo = Math.min(...win.map((c) => c.l));
  const k = hi === lo ? 50 : ((last(candles).c - lo) / (hi - lo)) * 100;
  return { k, state: k > 80 ? 'overbought' : k < 20 ? 'oversold' : 'neutral' };
}
function atr(candles, n = 14) {
  if (candles.length < 2) return 0;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    tr.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  return mean(tr.slice(-n));
}
function levels(candles, lookback = 80) {
  const win = candles.slice(-lookback);
  const highs = [], lows = [];
  for (let i = 2; i < win.length - 2; i++) {
    const h = win[i].h, l = win[i].l;
    if (h > win[i - 1].h && h > win[i - 2].h && h > win[i + 1].h && h > win[i + 2].h) highs.push(h);
    if (l < win[i - 1].l && l < win[i - 2].l && l < win[i + 1].l && l < win[i + 2].l) lows.push(l);
  }
  return { resistance: [...new Set(highs)].sort((a, b) => b - a).slice(0, 3), support: [...new Set(lows)].sort((a, b) => a - b).slice(0, 3) };
}

export async function analyzeChart(symbol, granularity = 60) {
  const candles = await getCandles(symbol, granularity, 240);
  if (candles.length < 60) return null;
  const closes = candles.map((c) => c.c);
  const price = last(closes);
  const ema20 = emaArr(closes, 20), ema50 = emaArr(closes, 50), ema100 = emaArr(closes, 100);
  const e20 = last(ema20), e50 = last(ema50), e100 = last(ema100);
  const trendUp = e20 > e50 && e50 > e100;
  const trendDown = e20 < e50 && e50 < e100;
  const slope = pct(e20, ema20[ema20.length - 10]);
  const momentum = pct(price, closes[closes.length - 14]);
  const m = macd(closes), r = rsi(closes, 14), b = bollinger(closes, 20, 2), st = stochastic(candles, 14);
  const a = atr(candles, 14), atrPct = pct(a, price);
  let volLevel = 'low'; if (atrPct > 0.12 || (b?.widthPct || 0) > 0.35) volLevel = 'medium'; if (atrPct > 0.35 || (b?.widthPct || 0) > 0.75) volLevel = 'high';
  const { support, resistance } = levels(candles);

  const bullish = [];
  const bearish = [];
  if (trendUp) bullish.push('EMA20 > EMA50 > EMA100');
  if (trendDown) bearish.push('EMA20 < EMA50 < EMA100');
  if (momentum > 0.05) bullish.push('positive 14-candle momentum');
  if (momentum < -0.05) bearish.push('negative 14-candle momentum');
  if (m?.state === 'bullish') bullish.push('MACD above signal');
  if (m?.state === 'bearish') bearish.push('MACD below signal');
  if (r > 70 || st?.state === 'overbought' || (b?.position ?? 0.5) > 0.85) bearish.push('overbought/exhaustion caution');
  if (r < 30 || st?.state === 'oversold' || (b?.position ?? 0.5) < 0.15) bullish.push('oversold/bounce context');

  const bias = bullish.length > bearish.length + 1 ? 'bullish' : bearish.length > bullish.length + 1 ? 'bearish' : 'neutral';
  const overextended = (bias === 'bullish' && ((b?.position ?? 0.5) > 0.9 || r > 76 || st?.state === 'overbought')) || (bias === 'bearish' && ((b?.position ?? 0.5) < 0.1 || r < 24 || st?.state === 'oversold'));
  const safe = bias !== 'neutral' && volLevel !== 'high' && !overextended;
  let confidence = 35 + Math.abs(slope) * 60 + Math.min(18, Math.abs(momentum) * 18) + Math.abs(bullish.length - bearish.length) * 7;
  if (volLevel === 'low') confidence += 10; if (volLevel === 'high') confidence -= 28; if (overextended) confidence -= 15;
  confidence = Math.max(5, Math.min(88, Math.round(confidence)));
  const risk = Math.round(Math.min(100, atrPct * 130 + ((b?.widthPct || 0) * 45) + (overextended ? 18 : 0) + (bias === 'neutral' ? 15 : 0)));

  const reasons = {
    selection: safe ? `${symbol} is safer because ${bias} indicator confluence is present while volatility is ${volLevel}.` : `${symbol} is not safe for entry now: ${bias === 'neutral' ? 'confluence is mixed' : overextended ? 'move is overextended' : 'volatility is too high'}.`,
    bullish: bullish.join('; ') || 'No strong bullish confluence.',
    bearish: bearish.join('; ') || 'No strong bearish confluence.',
    risk: `ATR is ${atrPct.toFixed(3)}% of price and Bollinger width is ${round(b?.widthPct, 3) ?? 'n/a'}% (${volLevel} volatility).`,
    macd: m ? `MACD ${m.state}: line ${m.line.toFixed(6)}, signal ${m.signal.toFixed(6)}, histogram ${m.histogram.toFixed(6)}.` : 'MACD needs more data.',
    oscillators: `RSI14 ${round(r, 2)}, stochastic ${round(st?.k, 2)} (${st?.state || 'n/a'}).`,
  };

  return {
    symbol, granularity, last: price,
    safe,
    setup: safe ? 'safe_candidate' : 'wait',
    bias,
    trend: { direction: trendUp ? 'up' : trendDown ? 'down' : 'mixed', strength: round(slope, 3), ema20: round(e20), ema50: round(e50), ema100: round(e100) },
    momentum: round(momentum, 3),
    indicators: { sma20: round(sma(closes, 20)), sma50: round(sma(closes, 50)), ema20: round(e20), ema50: round(e50), ema100: round(e100), macd: m ? { line: round(m.line, 6), signal: round(m.signal, 6), histogram: round(m.histogram, 6), state: m.state } : null, rsi14: round(r, 2), bollinger: b ? { upper: round(b.upper), middle: round(b.middle), lower: round(b.lower), widthPct: round(b.widthPct, 3), position: round(b.position, 3) } : null, stochastic14: st ? { k: round(st.k, 2), state: st.state } : null },
    volatility: { atr: round(a, 5), atrPct: round(atrPct, 3), level: volLevel },
    support, resistance,
    confidence, risk,
    reasons,
    invalidation: bias === 'bullish'
      ? `Bullish view invalid below nearest support ${support[0]?.toFixed(4) ?? 'n/a'} or MACD/EMA bearish reversal.`
      : bias === 'bearish'
        ? `Bearish view invalid above nearest resistance ${resistance[0]?.toFixed(4) ?? 'n/a'} or MACD/EMA bullish reversal.`
        : 'No entry: wait for EMA/MACD/momentum confluence and controlled volatility.',
    riskWarning: 'Probabilistic analysis. No guaranteed outcome. Manage risk and trade only what you can afford to lose.',
    ts: Date.now(),
  };
}
