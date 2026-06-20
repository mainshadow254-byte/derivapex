const ALLOWED_STRATEGIES = new Set(['ma_cross', 'rsi_reversal', 'breakout']);
const ALLOWED_CONTRACTS = new Set(['CALL', 'PUT', 'BOTH']);

function boundedNumber(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeStrategy(input = {}) {
  const type = ALLOWED_STRATEGIES.has(input.strategy) ? input.strategy : 'ma_cross';
  const fastPeriod = Math.round(boundedNumber(input.fastPeriod, 10, 2, 100));
  const slowPeriod = Math.round(boundedNumber(input.slowPeriod, 30, fastPeriod + 1, 250));
  return {
    name: String(input.name || 'Untitled strategy').slice(0, 120),
    symbol: String(input.symbol || 'R_100').slice(0, 80),
    contract_type: ALLOWED_CONTRACTS.has(String(input.contract_type || '').toUpperCase())
      ? String(input.contract_type).toUpperCase() : 'BOTH',
    strategy: type,
    stake: boundedNumber(input.stake, 10, 0.35, 100000),
    payoutRate: boundedNumber(input.payoutRate, 0.85, 0.1, 5),
    fastPeriod,
    slowPeriod,
    rsiPeriod: Math.round(boundedNumber(input.rsiPeriod, 14, 2, 100)),
    oversold: boundedNumber(input.oversold, 30, 1, 49),
    overbought: boundedNumber(input.overbought, 70, 51, 99),
    lookback: Math.round(boundedNumber(input.lookback, 20, 2, 250)),
    maxTrades: Math.round(boundedNumber(input.maxTrades, 200, 1, 1000)),
  };
}

function sma(candles, end, period) {
  if (end + 1 < period) return null;
  let total = 0;
  for (let i = end - period + 1; i <= end; i++) total += Number(candles[i].c);
  return total / period;
}

function rsi(candles, end, period) {
  if (end < period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = end - period + 1; i <= end; i++) {
    const diff = Number(candles[i].c) - Number(candles[i - 1].c);
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (!losses) return gains ? 100 : 50;
  return 100 - (100 / (1 + gains / losses));
}

function signalAt(candles, i, s) {
  if (s.strategy === 'ma_cross') {
    const fast = sma(candles, i, s.fastPeriod);
    const slow = sma(candles, i, s.slowPeriod);
    const prevFast = sma(candles, i - 1, s.fastPeriod);
    const prevSlow = sma(candles, i - 1, s.slowPeriod);
    if ([fast, slow, prevFast, prevSlow].some((v) => v == null)) return null;
    if (prevFast <= prevSlow && fast > slow) return 'CALL';
    if (prevFast >= prevSlow && fast < slow) return 'PUT';
    return null;
  }
  if (s.strategy === 'rsi_reversal') {
    const value = rsi(candles, i, s.rsiPeriod);
    if (value == null) return null;
    if (value <= s.oversold) return 'CALL';
    if (value >= s.overbought) return 'PUT';
    return null;
  }
  if (i < s.lookback) return null;
  const prior = candles.slice(i - s.lookback, i);
  const resistance = Math.max(...prior.map((c) => Number(c.h)));
  const support = Math.min(...prior.map((c) => Number(c.l)));
  if (Number(candles[i].c) > resistance) return 'CALL';
  if (Number(candles[i].c) < support) return 'PUT';
  return null;
}

export function runBacktest(rawCandles, rawStrategy = {}, { startingBalance = 10000 } = {}) {
  const strategy = normalizeStrategy(rawStrategy);
  const candles = (rawCandles || [])
    .map((c) => ({ t: Number(c.t), o: Number(c.o), h: Number(c.h), l: Number(c.l), c: Number(c.c) }))
    .filter((c) => [c.t, c.o, c.h, c.l, c.c].every(Number.isFinite))
    .sort((a, b) => a.t - b.t);
  if (candles.length < 30) throw new Error('At least 30 valid candles are required for a backtest.');

  const trades = [];
  let balance = Number(startingBalance);
  let peak = balance;
  let maxDrawdown = 0;
  const equityCurve = [{ t: candles[0].t, value: balance }];

  for (let i = 1; i < candles.length - 1 && trades.length < strategy.maxTrades; i++) {
    const direction = signalAt(candles, i, strategy);
    if (!direction) continue;
    if (strategy.contract_type !== 'BOTH' && strategy.contract_type !== direction) continue;
    const entry = candles[i].c;
    const exit = candles[i + 1].c;
    const won = direction === 'CALL' ? exit > entry : exit < entry;
    const tied = exit === entry;
    const profit = tied ? 0 : won ? strategy.stake * strategy.payoutRate : -strategy.stake;
    balance += profit;
    peak = Math.max(peak, balance);
    const drawdown = peak ? ((balance - peak) / peak) * 100 : 0;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    const trade = {
      opened_at: new Date(candles[i].t * 1000).toISOString(),
      closed_at: new Date(candles[i + 1].t * 1000).toISOString(),
      direction,
      entry,
      exit,
      stake: strategy.stake,
      status: tied ? 'draw' : won ? 'won' : 'lost',
      profit: +profit.toFixed(2),
      balance: +balance.toFixed(2),
    };
    trades.push(trade);
    equityCurve.push({ t: candles[i + 1].t, value: trade.balance });
  }

  const wins = trades.filter((t) => t.status === 'won');
  const losses = trades.filter((t) => t.status === 'lost');
  const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
  const netProfit = trades.reduce((sum, t) => sum + t.profit, 0);
  return {
    simulation: true,
    disclaimer: 'Historical candle simulation using a fixed payout assumption. It does not predict future results or reproduce live Deriv quotes.',
    strategy,
    candles: candles.length,
    period: {
      from: new Date(candles[0].t * 1000).toISOString(),
      to: new Date(candles[candles.length - 1].t * 1000).toISOString(),
    },
    summary: {
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? +(wins.length / trades.length * 100).toFixed(2) : 0,
      netProfit: +netProfit.toFixed(2),
      endingBalance: +balance.toFixed(2),
      returnPct: +((balance - startingBalance) / startingBalance * 100).toFixed(2),
      maxDrawdown: +maxDrawdown.toFixed(2),
      profitFactor: grossLoss ? +(grossProfit / grossLoss).toFixed(2) : grossProfit ? null : 0,
    },
    equityCurve,
    trades,
  };
}
