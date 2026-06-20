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

// Supported chart timeframes (same list the real terminal uses).
router.get('/timeframes', (_req, res) => res.json({ ...demoMeta(), timeframes: CHART_GRANULARITIES }));

// Markets the backend tracks (for the demo market list / chart selector).
router.get('/markets', (_req, res) => {
  res.json({ ...demoMeta(), tracked: getTrackedSymbols(), ready: getReadySymbols() });
});

// Full symbol list grouped by market (Volatility/Boom/Crash/Step/Jump/Range
// Break/Forex/Crypto). Real Deriv data, public.
router.get('/symbols', async (_req, res) => {
  try { res.json({ ...demoMeta(), groups: await getSymbolsGrouped() }); }
  catch (e) { res.status(502).json({ error: 'Deriv symbols unavailable.', detail: e.message }); }
});

// Demo scan — the same conservative engine, capped to a preview set and clearly
// labeled. Never invents signals (returns an honest warming-up state instead).
router.get('/scan', (_req, res) => {
  const result = scanAll();
  res.json({ ...demoMeta({ preview: true }), ...result, markets: (result.markets || []).slice(0, 6) });
});

// Demo single-symbol analysis (full reasoning is fine in demo preview).
router.get('/scan/:symbol', (req, res) => {
  const a = analyzeSymbol(req.params.symbol);
  if (!a) return res.status(425).json({ error: 'Not enough live data yet for this symbol. Try again shortly.' });
  res.json({ ...demoMeta(), ...a });
});

// Demo candles for the charting terminal.
router.get('/candles', async (req, res) => {
  const { symbol, granularity = 60, count = 200 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  if (!ALLOWED_GRANULARITIES.has(+granularity)) return res.status(400).json({ error: 'Unsupported granularity.' });
  try {
    res.json({ ...demoMeta(), symbol, granularity: +granularity, candles: await getCandles(symbol, +granularity, Math.min(+count, 1000)) });
  } catch (e) { res.status(502).json({ error: 'Candles unavailable.', detail: e.message }); }
});

// Demo tick history.
router.get('/ticks', async (req, res) => {
  const { symbol, count = 500 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try { res.json({ ...demoMeta(), symbol, ticks: await getTickHistory(symbol, Math.min(+count, 1000)) }); }
  catch (e) { res.status(502).json({ error: 'Ticks unavailable.', detail: e.message }); }
});

// Demo AI chart analysis (full, since it's a public preview).
router.get('/analysis', async (req, res) => {
  const { symbol, granularity = 60 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try {
    const a = await analyzeChart(symbol, +granularity);
    if (!a) return res.status(425).json({ error: 'Not enough candle data yet.' });
    res.json({ ...demoMeta(), ...a });
  } catch (e) { res.status(502).json({ error: 'Analysis failed.', detail: e.message }); }
});

// Demo market overview (derived from the live scan, same shape as the real one).
router.get('/overview', (_req, res) => {
  const r = scanAll();
  const m = r.markets || [];
  if (!m.length) return res.json({ ...demoMeta(), ready: false, message: 'Markets are warming up — overview appears once enough live ticks are collected.' });
  const volatilityRanking = [...m].sort((a, b) => b.volatility - a.volatility).map((x) => ({ symbol: x.symbol, volatility: x.volatility, risk: x.riskLevel }));
  const mostActive = [...m].sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum)).map((x) => ({ symbol: x.symbol, momentum: x.momentum }));
  const opportunityRanking = [...m].map((x) => ({ symbol: x.symbol, score: x.safe ? x.confidence : x.confidence - 40, confidence: x.confidence, safe: x.safe })).sort((a, b) => b.score - a.score);
  res.json({ ...demoMeta(), ready: true, count: m.length, volatilityRanking, mostActive, opportunityRanking });
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
