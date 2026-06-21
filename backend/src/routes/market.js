import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getEffectivePlan } from '../services/subscriptions.js';
import { getCandles, getTickHistory, getSymbolsGrouped, getContractsFor } from '../services/derivData.js';
import { analyzeChart } from '../services/chartAI.js';
import { CHART_GRANULARITIES, ALLOWED_GRANULARITIES } from '../config.js';

const router = Router();

// Public read-only metadata used by the builder before login.
// No balances, account data, or trading actions are exposed here.
router.get('/timeframes', (_req, res) => res.json({ timeframes: CHART_GRANULARITIES }));

// Symbols grouped by market (synthetic/forex/crypto/...). Real Deriv data.
// This dynamically returns EVERY market Deriv currently exposes (Volatility,
// Boom, Crash, Step, Jump, Range Break, Forex, Crypto, ...), so future Deriv
// markets appear automatically without any frontend change.
router.get('/symbols', async (_req, res) => {
  try { res.json({ groups: await getSymbolsGrouped() }); }
  catch (e) { res.status(502).json({ error: 'Deriv symbols unavailable.', detail: e.message }); }
});

router.get('/contracts', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try { res.json({ symbol, contracts: await getContractsFor(symbol) }); }
  catch (e) { res.status(502).json({ error: 'Deriv contracts unavailable.', detail: e.message }); }
});

// Candles for the charting terminal. granularity in seconds.
router.get('/candles', requireAuth, async (req, res) => {
  const { symbol, granularity = 60, count = 200 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  if (!ALLOWED_GRANULARITIES.has(+granularity)) return res.status(400).json({ error: 'Unsupported granularity.' });
  try {
    res.json({ symbol, granularity: +granularity, candles: await getCandles(symbol, +granularity, Math.min(+count, 1000)) });
  } catch (e) { res.status(502).json({ error: 'Candles unavailable.', detail: e.message }); }
});

router.get('/ticks', requireAuth, async (req, res) => {
  const { symbol, count = 500 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try { res.json({ symbol, ticks: await getTickHistory(symbol, Math.min(+count, 1000)) }); }
  catch (e) { res.status(502).json({ error: 'Ticks unavailable.', detail: e.message }); }
});

// AI chart analysis. Free users get a reduced view; paid get full reasoning.
router.get('/analysis', requireAuth, async (req, res) => {
  const { symbol, granularity = 60 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try {
    const a = await analyzeChart(symbol, +granularity);
    if (!a) return res.status(425).json({ error: 'Not enough candle data yet.' });
    const eff = await getEffectivePlan(req.auth.user.id);
    if (eff.rank < 1) {
      return res.json({ mode: 'demo', symbol: a.symbol, trend: a.trend, volatility: a.volatility, riskWarning: a.riskWarning, locked: ['confidence', 'risk', 'support', 'resistance', 'reasons', 'invalidation'] });
    }
    res.json({ mode: 'real', ...a });
  } catch (e) { res.status(502).json({ error: 'Analysis failed.', detail: e.message }); }
});

export default router;
