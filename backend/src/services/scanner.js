// AI market scanner core. Uses REAL Deriv tick series only.
// It scans all tracked markets, rejects unsafe/high-volatility setups, and ranks
// safer alternatives using indicator confluence. No guaranteed outcomes.
import { getTicks, getTrackedSymbols, getSymbolInfo } from './deriv.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round = (n, d = 4) => Number.isFinite(n) ? +n.toFixed(d) : null;
const pct = (a, b) => b ? ((a - b) / b) * 100 : 0;
const ratioPct = (a, b) => b ? (a / b) * 100 : 0;
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const stdev = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const sma = (values, n) => values.length >= n ? mean(values.slice(-n)) : null;
function emaSeries(values, n) {
  if (!values.length) return [];
  const k = 2 / (n + 1);
  let prev = values[0];
  const out = [prev];
  for (let i = 1; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out.push(prev); }
  return out;
}
function last(arr) { return arr[arr.length - 1]; }
function rsi(values, n = 14) {
  if (values.length <= n) return null;
  const changes = values.slice(1).map((v, i) => v - values[i]);
  const recent = changes.slice(-n);
  const gains = recent.filter((x) => x > 0);
  const losses = recent.filter((x) => x < 0).map(Math.abs);
  const avgGain = mean(gains);
  const avgLoss = mean(losses);
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + (avgGain / avgLoss)));
}
function macd(values) {
  if (values.length < 35) return null;
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  const line = values.map((_, i) => ema12[i] - ema26[i]).slice(25);
  const signal = emaSeries(line, 9);
  const macdLine = last(line);
  const signalLine = last(signal);
  return { line: macdLine, signal: signalLine, histogram: macdLine - signalLine, bullish: macdLine > signalLine, bearish: macdLine < signalLine };
}
function bollinger(values, n = 20, mult = 2) {
  if (values.length < n) return null;
  const win = values.slice(-n);
  const mid = mean(win);
  const sd = stdev(win);
  const upper = mid + sd * mult;
  const lower = mid - sd * mult;
  const price = last(values);
  const widthPct = ratioPct(upper - lower, mid);
  const position = upper === lower ? 0.5 : (price - lower) / (upper - lower);
  return { upper, middle: mid, lower, widthPct, position, nearUpper: position > 0.82, nearLower: position < 0.18 };
}
function stochastic(values, n = 14) {
  if (values.length < n) return null;
  const win = values.slice(-n);
  const hi = Math.max(...win);
  const lo = Math.min(...win);
  const k = hi === lo ? 50 : ((last(values) - lo) / (hi - lo)) * 100;
  return { k, overbought: k > 80, oversold: k < 20 };
}
function atrLikePct(values, n = 30) {
  if (values.length < n + 1) return 0;
  const recent = values.slice(-(n + 1));
  const ranges = recent.slice(1).map((v, i) => Math.abs(pct(v, recent[i])));
  return mean(ranges);
}
function srLevels(series, lookback = 160) {
  const w = series.slice(-lookback);
  const highs = [], lows = [];
  for (let i = 2; i < w.length - 2; i++) {
    if (w[i] > w[i - 1] && w[i] > w[i - 2] && w[i] > w[i + 1] && w[i] > w[i + 2]) highs.push(w[i]);
    if (w[i] < w[i - 1] && w[i] < w[i - 2] && w[i] < w[i + 1] && w[i] < w[i + 2]) lows.push(w[i]);
  }
  return {
    resistance: [...new Set(highs)].sort((a, b) => b - a).slice(0, 3),
    support: [...new Set(lows)].sort((a, b) => a - b).slice(0, 3),
  };
}
function indicatorVotes({ trendUp, momentum, macdInfo, rsiValue, bb, stoch }) {
  const bullish = [];
  const bearish = [];
  const neutral = [];
  if (trendUp) bullish.push('EMA10 above EMA40'); else bearish.push('EMA10 below EMA40');
  if (momentum > 0.025) bullish.push('positive momentum'); else if (momentum < -0.025) bearish.push('negative momentum'); else neutral.push('flat momentum');
  if (macdInfo?.bullish) bullish.push('MACD above signal'); else if (macdInfo?.bearish) bearish.push('MACD below signal');
  if (rsiValue != null) {
    if (rsiValue > 70) bearish.push('RSI overbought caution');
    else if (rsiValue < 30) bullish.push('RSI oversold bounce potential');
    else neutral.push('RSI neutral zone');
  }
  if (bb?.nearUpper) bearish.push('price near Bollinger upper band');
  else if (bb?.nearLower) bullish.push('price near Bollinger lower band');
  if (stoch?.overbought) bearish.push('stochastic overbought');
  else if (stoch?.oversold) bullish.push('stochastic oversold');
  return { bullish, bearish, neutral, bullishCount: bullish.length, bearishCount: bearish.length };
}
function riskLevelFrom({ vol, atrPct, bb }) {
  let riskLevel = 'low';
  if (vol > 0.08 || atrPct > 0.06 || (bb?.widthPct ?? 0) > 0.22) riskLevel = 'medium';
  if (vol > 0.18 || atrPct > 0.16 || (bb?.widthPct ?? 0) > 0.55) riskLevel = 'high';
  return riskLevel;
}
function buildIndicators(series) {
  const ema10 = emaSeries(series, 10);
  const ema20 = emaSeries(series, 20);
  const ema40 = emaSeries(series, 40);
  const ema100 = emaSeries(series, 100);
  const macdInfo = macd(series);
  const rsiValue = rsi(series, 14);
  const bb = bollinger(series, 20, 2);
  const stoch = stochastic(series, 14);
  const lastPrice = last(series);
  return {
    sma20: round(sma(series, 20)),
    sma50: round(sma(series, 50)),
    ema10: round(last(ema10)),
    ema20: round(last(ema20)),
    ema40: round(last(ema40)),
    ema100: round(last(ema100)),
    macd: macdInfo ? { line: round(macdInfo.line, 6), signal: round(macdInfo.signal, 6), histogram: round(macdInfo.histogram, 6), state: macdInfo.bullish ? 'bullish' : 'bearish' } : null,
    rsi14: round(rsiValue, 2),
    bollinger: bb ? { upper: round(bb.upper), middle: round(bb.middle), lower: round(bb.lower), widthPct: round(bb.widthPct, 3), position: round(bb.position, 3) } : null,
    stochastic14: stoch ? { k: round(stoch.k, 2), state: stoch.overbought ? 'overbought' : stoch.oversold ? 'oversold' : 'neutral' } : null,
    priceVsEma20Pct: round(pct(lastPrice, last(ema20)), 4),
  };
}

export function analyzeSymbol(symbol) {
  const series = getTicks(symbol).map((t) => t.q);
  if (series.length < 80) return null;

  const info = getSymbolInfo(symbol);
  const lastPrice = last(series);
  const ema10 = emaSeries(series, 10);
  const ema40 = emaSeries(series, 40);
  const e10 = last(ema10);
  const e40 = last(ema40);
  const recent = series.slice(-40);
  const returns = recent.slice(1).map((v, i) => pct(v, recent[i]));
  const vol = stdev(returns);
  const atrPct = atrLikePct(series, 30);
  const momentum = pct(lastPrice, series[series.length - 20]);
  const trendUp = e10 > e40;
  const trendStrength = Math.abs(pct(e10, e40));
  const macdInfo = macd(series);
  const rsiValue = rsi(series, 14);
  const bb = bollinger(series, 20, 2);
  const stoch = stochastic(series, 14);
  const votes = indicatorVotes({ trendUp, momentum, macdInfo, rsiValue, bb, stoch });
  const riskLevel = riskLevelFrom({ vol, atrPct, bb });
  const confluence = Math.abs(votes.bullishCount - votes.bearishCount);

  const rawDirection = votes.bullishCount > votes.bearishCount + 1 ? 'CALL/up' : votes.bearishCount > votes.bullishCount + 1 ? 'PUT/down' : 'mixed';
  const weakTrend = trendStrength < 0.01 && Math.abs(momentum) < 0.02;
  const overextended = (rawDirection === 'CALL/up' && (bb?.nearUpper || stoch?.overbought || rsiValue > 76)) || (rawDirection === 'PUT/down' && (bb?.nearLower || stoch?.oversold || rsiValue < 24));

  let confidence = 35;
  confidence += clamp(trendStrength * 180, 0, 18);
  confidence += Math.min(16, Math.abs(momentum) * 120);
  confidence += confluence * 7;
  if (macdInfo && rawDirection !== 'mixed') confidence += 6;
  if (riskLevel === 'low') confidence += 12;
  if (riskLevel === 'medium') confidence -= 4;
  if (riskLevel === 'high') confidence -= 26;
  if (overextended) confidence -= 12;
  if (weakTrend) confidence -= 10;
  confidence = clamp(Math.round(confidence), 5, 88);

  const noTrade = rawDirection === 'mixed' || riskLevel === 'high' || confidence < 58 || weakTrend || overextended;
  const direction = noTrade ? 'NO_TRADE' : rawDirection;
  const safe = !noTrade && riskLevel !== 'high';
  const riskScore = clamp(Math.round((vol * 240) + (atrPct * 180) + ((bb?.widthPct || 0) * 35) + (rawDirection === 'mixed' ? 18 : 0) + (weakTrend ? 12 : 0) + (overextended ? 16 : 0) + (riskLevel === 'high' ? 35 : riskLevel === 'medium' ? 18 : 6)), 1, 100);
  const rejectionReason = noTrade
    ? (riskLevel === 'high'
      ? 'No entry: volatility is too high for a conservative synthetic-market setup.'
      : rawDirection === 'mixed'
        ? 'No entry: indicator confluence is mixed; trend, MACD, momentum, RSI/Bollinger/Stochastic do not agree.'
        : overextended
          ? 'No entry: the move is overextended near an exhaustion zone; wait for a pullback or cleaner confirmation.'
          : weakTrend
            ? 'No entry: trend and momentum are too weak.'
            : 'No entry: confidence is below the safety threshold.')
    : null;

  const { support, resistance } = srLevels(series);
  const nearestSupport = support[support.length - 1];
  const nearestResistance = resistance[0];
  const indicators = buildIndicators(series);
  const reasons = [
    trendUp ? 'EMA10 is above EMA40, showing upward structure.' : 'EMA10 is below EMA40, showing downward structure.',
    macdInfo ? `MACD is ${macdInfo.bullish ? 'bullish' : 'bearish'} with histogram ${round(macdInfo.histogram, 6)}.` : 'MACD needs more data.',
    `RSI14 is ${indicators.rsi14 ?? 'n/a'}; Stochastic is ${indicators.stochastic14?.state || 'n/a'}.`,
    `Bollinger width is ${indicators.bollinger?.widthPct ?? 'n/a'}%; ATR-like tick volatility is ${round(atrPct, 4)}%.`,
  ];

  const explain = {
    selection: noTrade ? `${symbol} is rejected for live entry. ${rejectionReason}` : `${symbol} passes the safety gate because trend, MACD, momentum, and volatility conditions align for ${direction}.`,
    saferWhy: safe ? `${symbol} has ${riskLevel} risk, ${confidence}% conservative confidence, risk score ${riskScore}/100, and ${votes.bullishCount}/${votes.bearishCount} bullish/bearish confluence.` : null,
    trending: `EMA10 ${round(e10)} vs EMA40 ${round(e40)}; trend separation ${round(trendStrength, 4)}%.`,
    bullish: votes.bullish.length ? votes.bullish.join('; ') : 'No strong bullish confluence.',
    bearish: votes.bearish.length ? votes.bearish.join('; ') : 'No strong bearish confluence.',
    volatility: `Risk is ${riskLevel}: return volatility ${round(vol, 4)}%, ATR-like volatility ${round(atrPct, 4)}%, Bollinger width ${indicators.bollinger?.widthPct ?? 'n/a'}%.`,
    confidence: `Confidence ${confidence}% comes from trend separation, momentum, MACD agreement, RSI/Bollinger/Stochastic context, and volatility. It is capped and never a guarantee.`,
    risk: `Risk score ${riskScore}/100. ${riskLevel === 'high' ? 'High volatility blocks this setup.' : safe ? 'The market passes the safety gate.' : 'The market does not pass the safety gate.'}`,
    entry: noTrade ? 'Entry: wait. Do not enter while the safety gate rejects this market.' : `Entry idea: only after live confirmation remains valid; prefer pullback toward ${trendUp ? `support near ${nearestSupport != null ? nearestSupport.toFixed(4) : 'recent swing support'}` : `resistance near ${nearestResistance != null ? nearestResistance.toFixed(4) : 'recent swing resistance'}`}.`,
    exit: trendUp ? `Invalidation: price breaks below support ${nearestSupport != null ? nearestSupport.toFixed(4) : 'recent swing low'} or EMA/MACD turns bearish.` : `Invalidation: price breaks above resistance ${nearestResistance != null ? nearestResistance.toFixed(4) : 'recent swing high'} or EMA/MACD turns bullish.`,
  };

  return {
    marketName: info.name,
    symbol,
    category: info.category,
    market: info.market,
    submarket: info.submarket,
    dataSourceLabel: 'Live Deriv Data',
    analysisLabel: 'Multi-indicator AI safety scan',
    setup: noTrade ? 'no_trade' : 'safe_candidate',
    noTrade,
    tradeable: !noTrade,
    rejectionReason,
    last: lastPrice,
    direction,
    rawDirection,
    confidence,
    riskScore,
    riskLevel,
    volatilityWarning: riskLevel === 'high' ? 'High volatility. Avoid this market and review safer alternatives immediately.' : null,
    volatility: round(vol, 4),
    atrLikePct: round(atrPct, 4),
    momentum: round(momentum, 4),
    trend: trendUp ? 'up' : 'down',
    trendStrength: round(trendStrength, 4),
    confluence: { bullish: votes.bullishCount, bearish: votes.bearishCount, neutral: votes.neutral.length, notes: [...votes.bullish, ...votes.bearish, ...votes.neutral].slice(0, 8) },
    indicators,
    safe,
    support,
    resistance,
    reason: reasons.join(' '),
    explain,
    entryReasoning: explain.entry,
    invalidationLevel: trendUp ? nearestSupport ?? null : nearestResistance ?? null,
    invalidation: explain.exit,
    riskWarning: 'Not financial advice. No outcome is guaranteed. Trade only what you can afford to lose.',
    ts: Date.now(),
  };
}

export function buildScanResult(results = []) {
  const scored = results
    .map((r) => ({ ...r, safetyScore: clamp((r.safe ? r.confidence : r.confidence - 35) - Math.round(r.riskScore * 0.35), -100, 100) }))
    .sort((a, b) => b.safetyScore - a.safetyScore);
  const safeCandidates = scored.filter((r) => r.safe && r.riskLevel !== 'high').sort((a, b) => b.safetyScore - a.safetyScore);
  const best = safeCandidates[0] || scored[0] || null;
  const volatileMarkets = scored.filter((r) => r.riskLevel === 'high').sort((a, b) => b.riskScore - a.riskScore);
  const unsafeFocus = volatileMarkets[0] || (best && !best.safe ? best : null);
  const saferAlt = unsafeFocus ? safeCandidates.find((r) => r.symbol !== unsafeFocus.symbol) || safeCandidates[0] || null : safeCandidates[0] || null;

  let alternativeAnalysis = null;
  if (unsafeFocus) {
    alternativeAnalysis = {
      unsafeMarket: unsafeFocus.symbol,
      whyUnsafe: unsafeFocus.rejectionReason || `${unsafeFocus.symbol} does not pass the multi-indicator safety gate.`,
      risks: `Risk score ${unsafeFocus.riskScore}/100, volatility ${unsafeFocus.volatility}%, ATR-like ${unsafeFocus.atrLikePct}%, confidence ${unsafeFocus.confidence}%.`,
      alternative: saferAlt ? saferAlt.symbol : null,
      whyBetter: saferAlt
        ? `${saferAlt.symbol} is safer now because risk is ${saferAlt.riskLevel}, safety score ${saferAlt.safetyScore}, confidence ${saferAlt.confidence}%, MACD/EMA/momentum confluence is clearer, and volatility is lower.`
        : 'No tracked market currently meets the safety criteria. The safest action is to wait.',
      saferAlternative: saferAlt,
    };
  }

  return {
    dataSourceLabel: 'Live Deriv Data',
    analysisLabel: 'Multi-indicator AI safety scan',
    status: scored.length ? (safeCandidates.length ? 'safe_candidates_found' : 'no_safe_setup') : 'insufficient_data',
    message: scored.length
      ? (safeCandidates.length ? 'Live Deriv scan complete. Safer candidates are ranked first.' : 'Live data is available, but no market currently passes the safety gate.')
      : 'No clear setup: not enough live Deriv tick data yet.',
    generatedAt: Date.now(),
    count: scored.length,
    best,
    safeCandidates: safeCandidates.slice(0, 8),
    saferAlternative: saferAlt,
    volatileMarkets,
    alternativeAnalysis,
    warning: unsafeFocus
      ? `${unsafeFocus.symbol} is volatile/unsafe now. ${saferAlt ? `Safer alternative: ${saferAlt.symbol} (${saferAlt.confidence}% confidence, ${saferAlt.riskLevel} risk).` : 'No safer market meets criteria right now — wait.'}`
      : null,
    markets: scored,
    disclaimer: 'AI analysis is probabilistic, not a guarantee. Always apply your own risk management.',
  };
}

export function scanAll() {
  const results = getTrackedSymbols()
    .map((s) => analyzeSymbol(s))
    .filter(Boolean);
  return buildScanResult(results);
}
