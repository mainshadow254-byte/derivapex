import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getCandles, getTickHistory, getSymbolsGrouped, getContractsFor } from '../services/derivData.js';
import { analyzeChart } from '../services/chartAI.js';
import { CHART_GRANULARITIES, ALLOWED_GRANULARITIES } from '../config.js';

const router = Router();

router.get('/timeframes', (_req, res) => res.json({ timeframes: CHART_GRANULARITIES }));

router.get('/symbols', async (_req, res) => {
  try { res.json({ groups: await getSymbolsGrouped() }); }
  catch (error) { res.status(502).json({ error: 'Deriv symbols unavailable.', detail: error.message }); }
});

router.get('/contracts', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try { res.json({ symbol, contracts: await getContractsFor(symbol) }); }
  catch (error) { res.status(502).json({ error: 'Deriv contracts unavailable.', detail: error.message }); }
});

router.get('/candles', requireAuth, async (req, res) => {
  const { symbol, granularity = 60, count = 200 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  if (!ALLOWED_GRANULARITIES.has(+granularity)) return res.status(400).json({ error: 'Unsupported granularity.' });
  try {
    res.json({ symbol, granularity: +granularity, candles: await getCandles(symbol, +granularity, Math.min(+count, 1000)) });
  } catch (error) { res.status(502).json({ error: 'Candles unavailable.', detail: error.message }); }
});

router.get('/ticks', requireAuth, async (req, res) => {
  const { symbol, count = 500 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try { res.json({ symbol, ticks: await getTickHistory(symbol, Math.min(+count, 1000)) }); }
  catch (error) { res.status(502).json({ error: 'Ticks unavailable.', detail: error.message }); }
});

// Full chart reasoning is open to every verified user during early access.
router.get('/analysis', requireAuth, async (req, res) => {
  const { symbol, granularity = 60 } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required.' });
  try {
    const analysis = await analyzeChart(symbol, +granularity);
    if (!analysis) return res.status(425).json({ error: 'Not enough candle data yet.' });
    res.json({ mode: 'early_access', access: 'open', ...analysis });
  } catch (error) { res.status(502).json({ error: 'Analysis failed.', detail: error.message }); }
});

export default router;
