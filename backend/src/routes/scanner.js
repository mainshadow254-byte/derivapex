import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature, getEffectivePlan } from '../services/subscriptions.js';
import { scanAll, analyzeSymbol } from '../services/scanner.js';
import { deterministicAdvice, getMarketAdvice } from '../services/aiMarketAdvisor.js';
import { notifyVolatilityAlerts } from '../services/volatilityAlerts.js';

const router = Router();

// Demo scan — available to all verified users (clearly a preview).
router.get('/demo', requireAuth, requireFeature('demo_scanner'), async (req, res) => {
  const result = scanAll();
  const advisor = deterministicAdvice(result);
  await notifyVolatilityAlerts({ userId: req.auth.user.id, scan: result });
  res.json({ mode: 'demo', preview: true, ...result, advisor, ai_result: advisor.structured, markets: result.markets.slice(0, 3) });
});

// Full real scan — paid feature (real_scanner). Same engine, full results.
router.get('/full', requireAuth, requireFeature('real_scanner'), async (_req, res) => {
  const result = scanAll();
  const advisor = await getMarketAdvice(result);
  await notifyVolatilityAlerts({ userId: _req.auth.user.id, scan: result });
  res.json({ mode: 'real', ...result, advisor, ai_result: advisor.structured });
});

router.get('/symbol/:symbol', requireAuth, async (req, res) => {
  const eff = await getEffectivePlan(req.auth.user.id);
  const a = analyzeSymbol(req.params.symbol);
  if (!a) return res.status(425).json({ error: 'Not enough live data yet for this symbol. Try again shortly.' });
  // Free users get a reduced view.
  if (eff.rank < 1) return res.json({ mode: 'demo', symbol: a.symbol, direction: a.direction, riskWarning: a.riskWarning, locked: ['confidence', 'reason', 'invalidation'] });
  res.json({ mode: 'real', ...a });
});

// Market overview graphs data — all derived from the REAL live scan.
router.get('/overview', requireAuth, (req, res) => {
  const r = scanAll();
  const m = r.markets || [];
  if (!m.length) return res.json({ ready: false, message: 'Markets are warming up — overview appears once enough live ticks are collected.' });

  const volatilityRanking = [...m].sort((a, b) => b.volatility - a.volatility).map((x) => ({ symbol: x.symbol, volatility: x.volatility, risk: x.riskLevel }));
  const mostActive = [...m].sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum)).map((x) => ({ symbol: x.symbol, momentum: x.momentum }));
  const opportunityRanking = [...m].map((x) => ({ symbol: x.symbol, score: x.safe ? x.confidence : x.confidence - 40, confidence: x.confidence, safe: x.safe })).sort((a, b) => b.score - a.score);
  const buckets = { '0-20': 0, '20-40': 0, '40-60': 0, '60-80': 0, '80-100': 0 };
  m.forEach((x) => { const c = x.confidence; const k = c < 20 ? '0-20' : c < 40 ? '20-40' : c < 60 ? '40-60' : c < 80 ? '60-80' : '80-100'; buckets[k]++; });
  const riskDist = { low: 0, medium: 0, high: 0 };
  m.forEach((x) => { riskDist[x.riskLevel] = (riskDist[x.riskLevel] || 0) + 1; });

  res.json({ ready: true, generatedAt: r.generatedAt, count: m.length, volatilityRanking, mostActive, opportunityRanking, confidenceDistribution: buckets, riskDistribution: riskDist });
});

export default router;
