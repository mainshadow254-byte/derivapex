// AI chart analysis (REAL, from candles). Produces trend, momentum, support &
// resistance zones, volatility, confidence and risk scores, with plain-language
// reasons for bullish/bearish/risk — and never claims guaranteed outcomes.
import { getCandles } from './derivData.js';

const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
function emaArr(values, n) {
  const k = 2 / (n + 1); let prev = values[0]; const out = [prev];
  for (let i = 1; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out.push(prev); }
  return out;
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
// Swing-based support/resistance: cluster recent local extremes.
function levels(candles, lookback = 60) {
  const win = candles.slice(-lookback);
  const highs = [], lows = [];
  for (let i = 2; i < win.length - 2; i++) {
    const h = win[i].h, l = win[i].l;
    if (h > win[i-1].h && h > win[i-2].h && h > win[i+1].h && h > win[i+2].h) highs.push(h);
    if (l < win[i-1].l && l < win[i-2].l && l < win[i+1].l && l < win[i+2].l) lows.push(l);
  }
  const top = (arr) => arr.sort((a,b)=>b-a).slice(0,3);
  return { resistance: top(highs), support: top(lows.map(x=>-x)).map(x=>-x) };
}

export async function analyzeChart(symbol, granularity = 60) {
  const candles = await getCandles(symbol, granularity, 200);
  if (candles.length < 50) return null;
  const closes = candles.map((c) => c.c);
  const last = closes[closes.length - 1];

  const ema20 = emaArr(closes, 20);
  const ema50 = emaArr(closes, 50);
  const e20 = ema20[ema20.length - 1], e50 = ema50[ema50.length - 1];
  const trendUp = e20 > e50;
  const slope = (ema20[ema20.length - 1] - ema20[ema20.length - 10]) / (Math.abs(ema20[ema20.length - 10]) || 1) * 100;
  const momentum = (last - closes[closes.length - 14]) / closes[closes.length - 14] * 100;

  const a = atr(candles, 14);
  const atrPct = (a / last) * 100;
  let volLevel = 'low'; if (atrPct > 0.15) volLevel = 'medium'; if (atrPct > 0.4) volLevel = 'high';

  const { support, resistance } = levels(candles);

  // Confidence: structure agreement, capped (never 100). Risk: volatility-led.
  let confidence = 40;
  if (Math.abs(slope) > 0.05) confidence += 15;
  if ((trendUp && momentum > 0) || (!trendUp && momentum < 0)) confidence += 20;
  if (volLevel === 'low') confidence += 10; else if (volLevel === 'high') confidence -= 25;
  confidence = Math.max(5, Math.min(85, Math.round(confidence)));
  let risk = Math.round(Math.min(100, atrPct * 120 + (Math.abs(momentum) > 0.5 ? 15 : 0)));

  const bias = trendUp && momentum >= 0 ? 'bullish' : (!trendUp && momentum <= 0 ? 'bearish' : 'neutral');
  const reasons = {
    bullish: trendUp ? `EMA20 (${e20.toFixed(4)}) is above EMA50 (${e50.toFixed(4)}) and momentum is ${momentum.toFixed(2)}% — buyers in control.` : null,
    bearish: !trendUp ? `EMA20 (${e20.toFixed(4)}) is below EMA50 (${e50.toFixed(4)}) and momentum is ${momentum.toFixed(2)}% — sellers in control.` : null,
    risk: volLevel !== 'low' ? `ATR is ${atrPct.toFixed(2)}% of price (${volLevel} volatility) — wider swings raise the chance of being stopped out.` : `Volatility is contained (ATR ${atrPct.toFixed(2)}%).`,
    selection: `Selected on trend/momentum agreement (${bias}) with ${volLevel} volatility and confidence ${confidence}%.`,
  };

  return {
    symbol, granularity, last,
    trend: { direction: trendUp ? 'up' : 'down', strength: +slope.toFixed(3), bias },
    momentum: +momentum.toFixed(3),
    volatility: { atr: +a.toFixed(5), atrPct: +atrPct.toFixed(3), level: volLevel },
    support, resistance,
    confidence, risk,
    reasons,
    invalidation: trendUp
      ? `Bullish view invalid below nearest support ${support[0]?.toFixed(4) ?? 'n/a'} or EMA20/EMA50 bearish cross.`
      : `Bearish view invalid above nearest resistance ${resistance[0]?.toFixed(4) ?? 'n/a'} or EMA20/EMA50 bullish cross.`,
    riskWarning: 'Probabilistic analysis. No guaranteed outcome. Manage risk and trade only what you can afford to lose.',
    ts: Date.now(),
  };
}
