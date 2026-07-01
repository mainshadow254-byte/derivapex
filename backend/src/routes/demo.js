// PUBLIC DEMO endpoints. NO authentication, NO subscription, NO account.
// These power the public demo experience (demo dashboard/scanner/charts/markets)
// for visitors. They are READ-ONLY and clearly labeled DEMO — they NEVER place a
// real trade and never touch a user's real account. Market data is the same live
// Deriv public feed the rest of the app uses; balances/positions are SIMULATED.
import { Router } from 'express';
import { scanAll, analyzeSymbol } from '../services/scanner.js';
import { getTrackedSymbols, getReadySymbols } from '../services/deriv.js';
import { getCandles, getTickHistory, getSymbolsGrouped } from '../services/derivData.js';
import { analyzeChart } from '../services/chartAI.js';
import { CHART_GRANULARITIES, ALLOWED_GRANULARITIES } from '../config.js';

const router = Router();

const DEMO_BANNER = 'DEMO MODE — SIMULATED DATA';
function demoMeta(extra = {}) {
  return { mode: 'demo', demo: true, banner: DEMO_BANNER, simulated: true, ...extra };
}

const DEMO_TEMPLATES = [
  {
    id: 'over-under-guard',
    template: 'over',
    title: 'Over/Under Guard',
    category: 'Digits',
    symbol: 'R_100',
    contract_type: 'DIGITOVER',
    risk_rating: 'medium',
    stake: 1,
    duration: '1 tick',
    readiness: 86,
    blocks: ['Trade Parameters', 'Prediction Digit', 'Purchase Conditions', 'Restart Conditions', 'Risk Management'],
    why: 'Good for learning digit contracts because prediction, stake, and restart rules are visible before demo testing.',
    warning: 'Digit streaks do not predict the future. Use demo testing and hard daily loss limits.',
  },
  {
    id: 'even-odd-rhythm',
    template: 'even',
    title: 'Even/Odd Rhythm',
    category: 'Digits',
    symbol: 'R_75',
    contract_type: 'DIGITEVEN',
    risk_rating: 'medium',
    stake: 1,
    duration: '1 tick',
    readiness: 84,
    blocks: ['Trade Parameters', 'Prediction Digit', 'Purchase Conditions', 'Restart Conditions', 'Risk Management'],
    why: 'Beginner-friendly structure for testing Even/Odd ideas without pretending that streaks are guaranteed.',
    warning: 'Avoid increasing stake after losses unless you fully understand drawdown risk.',
  },
  {
    id: 'ema-rise-fall',
    template: 'ema',
    title: 'EMA Rise/Fall',
    category: 'Trend',
    symbol: 'R_50',
    contract_type: 'CALL',
    risk_rating: 'low',
    stake: 1,
    duration: '5 ticks',
    readiness: 90,
    blocks: ['Trade Parameters', 'EMA Cross', 'Purchase Conditions', 'Restart Conditions', 'Risk Management'],
    why: 'Uses a readable trend rule that can be checked against the live chart and scanner reasoning.',
    warning: 'Trend logic can fail in choppy markets; wait when scanner trend and momentum disagree.',
  },
  {
    id: 'boom-crash-guard',
    template: 'boom',
    title: 'Boom/Crash Guard',
    category: 'Volatility',
    symbol: 'BOOM500',
    contract_type: 'CALL',
    risk_rating: 'high',
    stake: 0.5,
    duration: '5 ticks',
    readiness: 78,
    blocks: ['Trade Parameters', 'Volatility Filter', 'Purchase Conditions', 'Profit Target', 'Risk Management'],
    why: 'Built around caution: the strategy structure makes volatility filters and stop rules visible first.',
    warning: 'Boom/Crash spikes can invalidate calm-looking demo runs. Treat as advanced/high risk.',
  },
  {
    id: 'ai-approval-gate',
    template: 'ai',
    title: 'AI Approval Gate',
    category: 'AI Filter',
    symbol: 'R_25',
    contract_type: 'CALL',
    risk_rating: 'medium',
    stake: 1,
    duration: '3 ticks',
    readiness: 82,
    blocks: ['Trade Parameters', 'AI Signal', 'AI Trend Filter', 'AI Approval', 'Risk Management'],
    why: 'Shows how AI/scanner confirmation can be used as a gate, not as an automatic profit claim.',
    warning: 'AI output is analysis, not certainty. Backend safety checks and manual review still matter.',
  },
];

const DEMO_COPY_STRATEGIES = [
  {
    id: 'copy-safe-trend-demo',
    name: 'Safe Trend Demo',
    provider_name: 'ApexBot Lab',
    category: 'trend',
    symbol: 'R_50',
    risk_score: 42,
    maxDrawdown: 6.8,
    followers: 0,
    hasHistory: false,
    winRate: null,
    netProfit: null,
    trustLabel: 'Demo preview only',
    safeguards: ['Capital allocation required', 'Max risk per trade required', 'Daily loss limit required', 'Pause/stop controls'],
    description: 'Preview of how a transparent copy profile should look before any real followers or ledger-derived stats exist.',
  },
  {
    id: 'copy-digit-discipline-demo',
    name: 'Digit Discipline Demo',
    provider_name: 'ApexBot Lab',
    category: 'digits',
    symbol: 'R_100',
    risk_score: 58,
    maxDrawdown: 9.4,
    followers: 0,
    hasHistory: false,
    winRate: null,
    netProfit: null,
    trustLabel: 'Demo preview only',
    safeguards: ['No martingale by default', 'Hard daily loss limit', 'Trade count cap', 'Ledger stats required before ranking'],
    description: 'A copy-trading card that teaches users what risk controls must be visible before following anyone.',
  },
];

function productReadiness() {
  const readySymbols = getReadySymbols();
  const trackedSymbols = getTrackedSymbols();
  return {
    backend: true,
    marketFeed: {
      tracked: trackedSymbols.length,
      ready: readySymbols.length,
      status: readySymbols.length ? 'live-data-ready' : 'warming-up',
    },
    trust: [
      'No real trade from public demo endpoints',
      'Demo balances and positions are labeled simulated',
      'Scanner returns no-trade/wait instead of fake signals',
      'Copy and marketplace performance must come from backend records',
      'Tokens and permissions stay backend-controlled',
    ],
    productLoop: ['Discover template', 'Open builder', 'Scan live market', 'Run demo/backtest', 'Compare/copy with limits', 'Publish with real stats'],
  };
}

// Supported chart timeframes (same list the real terminal uses).
router.get('/timeframes', (_req, res) => res.json({ ...demoMeta(), timeframes: CHART_GRANULARITIES }));

// Public product status/readiness. Safe for marketing/status UI; no secrets.
router.get('/status', (_req, res) => res.json({ ...demoMeta({ simulated: false }), ...productReadiness(), generatedAt: Date.now() }));

// Public demo bot templates. These are transparent learning templates, not claims.
router.get('/templates', (_req, res) => res.json({
  ...demoMeta(),
  templates: DEMO_TEMPLATES,
  disclaimer: 'Templates are for learning and demo testing. They do not guarantee profit.',
}));

// Public copy-trading preview. No fake followers/profits; shows what a safe card should expose.
router.get('/copy-preview', (_req, res) => res.json({
  ...demoMeta(),
  strategies: DEMO_COPY_STRATEGIES,
  disclaimer: 'Copy-trading is not a guarantee. Real rankings require recorded backend trade history.',
}));

// Markets the backend tracks (for the demo market list / chart selector).
router.get('/markets', (_req, res) => {
  res.json({ ...demoMeta(), tracked: getTrackedSymbols(), ready: getReadySymbols() });
});

// Full symbol list grouped by market (Volatility/Boom/Crash/Step/Jump/Range
// Break/Forex/Crypto). Real Deriv data, public.
router.get('/symbols', async (_req, res) => {
  try { res.json({ ...demoMeta({ simulated: false }), groups: await getSymbolsGrouped() }); }
  catch (e) { res.status(502).json({ error: 'Deriv symbols unavailable.', detail: e.message }); }
});

// Demo scan — the same conservative engine, capped to a preview set and clearly
// labeled. Never invents signals (returns an honest warming-up state instead).
router.get('/scan', (_req, res) => {
  const result = scanAll();
  const readiness = productReadiness();
  res.json({ ...demoMeta({ preview: true, simulated: false }), ...result, readiness, markets: (result.markets || []).slice(0, 6) });
});

// Demo single-symbol analysis (full reasoning is fine in demo preview).
router.get('/scan/:symbol', (req, res) => {
  const a = analyzeSymbol(req.params.symbol);
  if (!a) return res.status(425).json({ error: 'Not enough live data yet for this symbol. Try again shortly.' });
  res.json({ ...demoMeta({ simulated: false }), ...a });
});

// Demo candles for the charting terminal.
router.get('/candles', async (req, res) => {
  const { symbol, granularity = 60, count = 200 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  if (!ALLOWED_GRANULARITIES.has(+granularity)) return res.status(400).json({ error: 'Unsupported granularity.' });
  try {
    res.json({ ...demoMeta({ simulated: false }), symbol, granularity: +granularity, candles: await getCandles(symbol, +granularity, Math.min(+count, 1000)) });
  } catch (e) { res.status(502).json({ error: 'Candles unavailable.', detail: e.message }); }
});

// Demo tick history.
router.get('/ticks', async (req, res) => {
  const { symbol, count = 500 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try { res.json({ ...demoMeta({ simulated: false }), symbol, ticks: await getTickHistory(symbol, Math.min(+count, 1000)) }); }
  catch (e) { res.status(502).json({ error: 'Ticks unavailable.', detail: e.message }); }
});

// Demo AI chart analysis (full, since it's a public preview).
router.get('/analysis', async (req, res) => {
  const { symbol, granularity = 60 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try {
    const a = await analyzeChart(symbol, +granularity);
    if (!a) return res.status(425).json({ error: 'Not enough candle data yet.' });
    res.json({ ...demoMeta({ simulated: false }), ...a });
  } catch (e) { res.status(502).json({ error: 'Analysis failed.', detail: e.message }); }
});

// Demo market overview (derived from the live scan, same shape as the real one).
router.get('/overview', (_req, res) => {
  const r = scanAll();
  const m = r.markets || [];
  if (!m.length) return res.json({ ...demoMeta({ simulated: false }), ready: false, message: 'Markets are warming up — overview appears once enough live ticks are collected.' });
  const volatilityRanking = [...m].sort((a, b) => b.volatility - a.volatility).map((x) => ({ symbol: x.symbol, volatility: x.volatility, risk: x.riskLevel }));
  const mostActive = [...m].sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum)).map((x) => ({ symbol: x.symbol, momentum: x.momentum }));
  const opportunityRanking = [...m].map((x) => ({ symbol: x.symbol, score: x.safe ? x.confidence : x.confidence - 40, confidence: x.confidence, safe: x.safe })).sort((a, b) => b.score - a.score);
  res.json({ ...demoMeta({ simulated: false }), ready: true, count: m.length, volatilityRanking, mostActive, opportunityRanking });
});

// SIMULATED account summary for the demo dashboard. Static, clearly fake figures —
// no real money, no real positions. Demo NEVER executes real trades.
router.get('/account', (_req, res) => {
  res.json({
    ...demoMeta(),
    currency: 'USD',
    balance: 10000.0,
    equity: 10120.5,
    marginUsed: 250.0,
    freeMargin: 9870.5,
    openPositions: 2,
    note: 'Simulated demo balance. No real funds. Sign up and connect Deriv for real trading.',
    profitLoss: { daily: 42.5, weekly: 120.5, monthly: 380.0 },
    positions: [
      { symbol: 'R_100', contract_type: 'CALL', buy_price: 100, payout: 195, longcode: 'DEMO — Higher than entry', purchase_time: Math.floor(Date.now() / 1000) - 600 },
      { symbol: 'BOOM500', contract_type: 'PUT', buy_price: 150, payout: 288, longcode: 'DEMO — Lower than entry', purchase_time: Math.floor(Date.now() / 1000) - 1800 },
    ],
  });
});

export default router;
