import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../services/subscriptions.js';
import { scanAll, analyzeSymbol } from '../services/scanner.js';
import { deterministicAdvice, getMarketAdvice } from '../services/aiMarketAdvisor.js';
import { notifyVolatilityAlerts } from '../services/volatilityAlerts.js';

const router = Router();

router.get('/demo', requireAuth, requireFeature('demo_scanner'), async (req, res) => {
  const result = scanAll();
  const advisor = deterministicAdvice(result);
  await notifyVolatilityAlerts({ userId: req.auth.user.id, scan: result });
  res.json({ mode: 'demo', preview: true, ...result, advisor, ai_result: advisor.structured, markets: result.markets.slice(0, 5) });
});

// Open early access: the full validated AI explanation is available to every
// verified user. The deterministic scanner remains the safety source of truth.
router.get('/full', requireAuth, requireFeature('real_scanner'), async (req, res) => {
  const result = scanAll();
  const advisor = await getMarketAdvice(result);
  await notifyVolatilityAlerts({ userId: req.auth.user.id, scan: result });
  res.json({ mode: 'early_access', access: 'open', ...result, advisor, ai_result: advisor.structured });
});

router.get('/symbol/:symbol', requireAuth, async (req, res) => {
  const analysis = analyzeSymbol(req.params.symbol);
  if (!analysis) return res.status(425).json({ error: 'Not enough live data yet for this symbol. Try again shortly.' });
  const result = scanAll();
  const saferAlternative = !analysis.safe ? (result.safeCandidates || []).find((market) => market.symbol !== analysis.symbol) || null : null;
  res.json({
    mode: 'early_access',
    access: 'open',
    ...analysis,
    saferAlternative,
    warning: !analysis.safe
      ? `${analysis.symbol} is not suitable for a new entry now. ${saferAlternative ? `Lower-risk alternative: ${saferAlternative.symbol}.` : 'No tracked market currently passes the safety gate.'}`
      : null,
  });
});

router.get('/overview', requireAuth, (req, res) => {
  const result = scanAll();
  const markets = result.markets || [];
  if (!markets.length) return res.json({ ready: false, message: 'Markets are warming up — overview appears once enough live ticks are collected.' });
  const volatilityRanking = [...markets].sort((a, b) => b.riskScore - a.riskScore).map((market) => ({ symbol: market.symbol, volatility: market.volatility, risk: market.riskLevel, riskScore: market.riskScore }));
  const mostActive = [...markets].sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum)).map((market) => ({ symbol: market.symbol, momentum: market.momentum }));
  const opportunityRanking = [...markets].sort((a, b) => b.safetyScore - a.safetyScore).map((market) => ({ symbol: market.symbol, safetyScore: market.safetyScore, confidence: market.confidence, safe: market.safe }));
  const confidenceDistribution = { '0-20': 0, '20-40': 0, '40-60': 0, '60-80': 0, '80-100': 0 };
  markets.forEach((market) => {
    const confidence = market.confidence;
    const key = confidence < 20 ? '0-20' : confidence < 40 ? '20-40' : confidence < 60 ? '40-60' : confidence < 80 ? '60-80' : '80-100';
    confidenceDistribution[key] += 1;
  });
  const riskDistribution = { low: 0, medium: 0, high: 0 };
  markets.forEach((market) => { riskDistribution[market.riskLevel] = (riskDistribution[market.riskLevel] || 0) + 1; });
  res.json({ ready: true, generatedAt: result.generatedAt, count: markets.length, volatilityRanking, mostActive, opportunityRanking, confidenceDistribution, riskDistribution, saferAlternative: result.saferAlternative });
});

export default router;
