// AI market scanner. Analyzes market structure, volatility, trend, and momentum
// from REAL Deriv tick series. Real mode never invents signals or confidence.
import { getTicks, getTrackedSymbols, getSymbolInfo } from './deriv.js';

function pct(a, b) { return b ? ((a - b) / b) * 100 : 0; }
function mean(a) { return a.reduce((s, x) => s + x, 0) / (a.length || 1); }
function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
}
function sma(values, n) {
  if (values.length < n) return null;
  return mean(values.slice(-n));
}

function srLevels(series, lookback = 120) {
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

export function analyzeSymbol(symbol) {
  const series = getTicks(symbol).map((t) => t.q);
  if (series.length < 60) return null;

  const info = getSymbolInfo(symbol);
  const last = series[series.length - 1];
  const sFast = sma(series, 10);
  const sSlow = sma(series, 40);
  const recent = series.slice(-30);
  const returns = recent.slice(1).map((v, i) => pct(v, recent[i]));
  const vol = stdev(returns);
  const momentum = pct(last, series[series.length - 20]);
  const trendUp = sFast != null && sSlow != null && sFast > sSlow;
  const trendStrength = sSlow ? Math.abs(pct(sFast, sSlow)) : 0;

  let riskLevel = 'low';
  if (vol > 0.08) riskLevel = 'medium';
  if (vol > 0.18) riskLevel = 'high';

  let confidence = 40;
  if (trendStrength > 0.02) confidence += 15;
  if (Math.abs(momentum) > 0.05) confidence += 15;
  if (riskLevel === 'low') confidence += 15;
  else if (riskLevel === 'high') confidence -= 20;
  confidence = Math.max(5, Math.min(85, Math.round(confidence)));

  const rawDirection = trendUp && momentum >= 0 ? 'CALL/up' : (!trendUp && momentum <= 0 ? 'PUT/down' : 'mixed');
  const weakTrend = trendStrength < 0.01 && Math.abs(momentum) < 0.02;
  const noTrade = rawDirection === 'mixed' || riskLevel === 'high' || confidence < 55 || weakTrend;
  const direction = noTrade ? 'NO_TRADE' : rawDirection;
  const safe = !noTrade && riskLevel !== 'high';
  const riskScore = Math.max(1, Math.min(100, Math.round(
    (vol * 300) + (rawDirection === 'mixed' ? 25 : 0) + (weakTrend ? 15 : 0) + (riskLevel === 'high' ? 35 : riskLevel === 'medium' ? 18 : 6),
  )));
  const rejectionReason = noTrade
    ? (riskLevel === 'high'
      ? 'No clear setup: volatility is too high for a conservative entry.'
      : rawDirection === 'mixed'
        ? 'No clear setup: trend and momentum disagree.'
        : weakTrend
          ? 'No clear setup: trend and momentum are too weak.'
          : 'No clear setup: confidence is below the live-data threshold.')
    : null;

  const { support, resistance } = srLevels(series);
  const nearestSupport = support[support.length - 1];
  const nearestResistance = resistance[0];

  const reasons = [
    trendUp ? 'Short MA above long MA (uptrend structure).' : 'Short MA below long MA (downtrend structure).',
    `20-tick momentum ${momentum.toFixed(3)}%.`,
    `Short-term return volatility ${vol.toFixed(3)}% (${riskLevel} risk).`,
  ];
  if (rawDirection === 'mixed') reasons.push('Trend and momentum disagree - no clear edge.');
  if (weakTrend) reasons.push('Trend and momentum are too weak to justify a new entry.');
  if (riskLevel === 'high') reasons.push('Volatility is high - stand aside until conditions settle.');

  const explain = {
    selection: noTrade
      ? `${symbol} was rejected for a new trade. ${rejectionReason}`
      : `${symbol} was surfaced because MA(10), MA(40), and 20-tick momentum agree on a ${direction} bias with ${riskLevel} volatility.`,
    trending: trendStrength > 0.02
      ? `MA(10) sits ${trendStrength.toFixed(3)}% ${trendUp ? 'above' : 'below'} MA(40), showing a measurable ${trendUp ? 'up' : 'down'} drift.`
      : `MA(10) and MA(40) are only ${trendStrength.toFixed(3)}% apart, so the market is range-bound or weakly trending.`,
    bullish: trendUp
      ? `Bullish case: MA10 is above MA40 and momentum is ${momentum.toFixed(3)}%.`
      : 'Bullish case is weak because MA10 is below MA40.',
    bearish: !trendUp
      ? `Bearish case: MA10 is below MA40 and momentum is ${momentum.toFixed(3)}%.`
      : 'Bearish case is weak because MA10 is above MA40.',
    volatility: `Volatility is ${riskLevel}: short-term return standard deviation is ${vol.toFixed(3)}%.`,
    confidence: `Confidence ${confidence}% is calculated from trend separation, momentum, and volatility. It is capped at 85 and is never a guarantee.`,
    risk: `Risk score ${riskScore}/100. ${riskLevel === 'high' ? 'High volatility blocks this setup.' : safe ? 'The setup passes the live-data safety gate.' : 'The setup does not pass the live-data safety gate.'}`,
    entry: noTrade
      ? 'Entry: no trade. Wait for cleaner trend, momentum, and volatility conditions.'
      : `Entry: consider only a pullback toward ${trendUp ? `support near ${nearestSupport != null ? nearestSupport.toFixed(4) : 'the recent swing low'}` : `resistance near ${nearestResistance != null ? nearestResistance.toFixed(4) : 'the recent swing high'}`}.`,
    exit: trendUp
      ? `Invalidation: price closes below support ${nearestSupport != null ? nearestSupport.toFixed(4) : 'recent swing low'} or MA10 crosses below MA40.`
      : `Invalidation: price closes above resistance ${nearestResistance != null ? nearestResistance.toFixed(4) : 'recent swing high'} or MA10 crosses above MA40.`,
  };

  return {
    marketName: info.name,
    symbol,
    category: info.category,
    market: info.market,
    submarket: info.submarket,
    dataSourceLabel: 'Live Deriv Data',
    analysisLabel: 'Rules-based live analysis',
    setup: noTrade ? 'no_trade' : 'trade_candidate',
    noTrade,
    tradeable: !noTrade,
    rejectionReason,
    last,
    direction,
    rawDirection,
    confidence,
    riskScore,
    riskLevel,
    volatilityWarning: riskLevel === 'high' ? 'High volatility. Avoid new entries until conditions settle.' : null,
    volatility: +vol.toFixed(4),
    momentum: +momentum.toFixed(4),
    trend: trendUp ? 'up' : 'down',
    trendStrength: +trendStrength.toFixed(4),
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
    .map((r) => ({ ...r, score: r.safe ? r.confidence : r.confidence - 40 }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0] || null;
  const volatileMarkets = scored
    .filter((r) => r.riskLevel === 'high')
    .sort((a, b) => b.volatility - a.volatility);
  const unsafeFocus = volatileMarkets[0] || (best && !best.safe ? best : null);
  const saferAlt = unsafeFocus ? scored.find((r) => r.safe && r.riskLevel !== 'high') || null : null;

  let alternativeAnalysis = null;
  if (unsafeFocus) {
    alternativeAnalysis = {
      unsafeMarket: unsafeFocus.symbol,
      whyUnsafe: unsafeFocus.rejectionReason || `${unsafeFocus.symbol} does not pass the live-data safety gate.`,
      risks: `Risk score ${unsafeFocus.riskScore}/100, volatility ${unsafeFocus.volatility}%, confidence ${unsafeFocus.confidence}%.`,
      alternative: saferAlt ? saferAlt.symbol : null,
      whyBetter: saferAlt
        ? `${saferAlt.symbol} has ${saferAlt.riskLevel} volatility, ${saferAlt.confidence}% calculated confidence, and a clearer ${saferAlt.direction} setup.`
        : 'No tracked market currently meets the safety criteria. The safest action is to wait.',
    };
  }

  return {
    dataSourceLabel: 'Live Deriv Data',
    analysisLabel: 'Rules-based live analysis',
    status: scored.length ? (best?.noTrade ? 'no_clear_setup' : 'ok') : 'insufficient_data',
    message: scored.length
      ? (best?.noTrade ? 'No clear setup. Live data was available, but the top market failed the safety checks.' : 'Live Deriv scan complete.')
      : 'No clear setup: not enough live Deriv tick data yet.',
    generatedAt: Date.now(),
    count: scored.length,
    best,
    saferAlternative: saferAlt,
    volatileMarkets,
    alternativeAnalysis,
    warning: unsafeFocus
      ? `${volatileMarkets.length ? `${volatileMarkets.length} market${volatileMarkets.length === 1 ? '' : 's'} currently show high volatility; ${unsafeFocus.symbol} is the riskiest.` : `Top market ${unsafeFocus.symbol} is currently not tradeable.`} ${saferAlt ? `Consider the lower-risk conditions on ${saferAlt.symbol} instead.` : 'No safer market meets criteria right now - consider waiting.'}`
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
