import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../services/subscriptions.js';
import { getServicePB } from '../pocketbase.js';
import { placeRealTrade, simulateDemoTrade, fetchActiveSymbols, getTrackedSymbols } from '../services/deriv.js';
import { getDerivToken } from '../services/crypto.js';
import { audit } from '../services/audit.js';
import { recordTrade } from '../services/trades.js';
import { notify } from '../services/notifications.js';

const router = Router();

// Public-ish: list markets the backend tracks (for charts/scanner UI).
router.get('/markets', requireAuth, async (_req, res) => {
  res.json({ tracked: getTrackedSymbols() });
});

router.get('/symbols', requireAuth, async (_req, res) => {
  try { res.json({ symbols: await fetchActiveSymbols() }); }
  catch (e) { res.status(502).json({ error: 'Deriv symbols unavailable.', detail: e.message }); }
});

// DEMO trade — simulated, clearly labeled. Allowed for all verified users.
router.post('/demo-trade', requireAuth, requireFeature('demo_trade'), async (req, res) => {
  const { symbol, contractType, amount, duration } = req.body || {};
  if (!symbol || !contractType || !amount) return res.status(400).json({ error: 'symbol, contractType, amount required.' });
  const result = simulateDemoTrade({ symbol, contractType, amount, duration: duration || 5 });
  // Record the demo trade in the real ledger (clearly mode='demo') so demo
  // analytics/positions/history are computed from real recorded activity.
  const trade = await recordTrade({
    user: req.auth.user.id, symbol, mode: 'demo', source: 'manual',
    contract_type: contractType, stake: Number(amount), entry_price: result.entry_price,
    status: 'open', meta: { duration: duration || 5 },
  }).catch(() => null);
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'trade.demo', target: symbol, meta: { amount } });
  await notify({ userId: req.auth.user.id, type: 'trading', severity: 'info', title: 'Demo trade placed', body: `${contractType} on ${symbol} for ${amount} (DEMO — simulated).`, meta: { tradeId: trade?.id } });
  res.json({ ...result, tradeId: trade?.id || null });
});

// REAL trade — paid (real_trading). Uses the user's connected Deriv token,
// stored server-side. Frontend cannot place real trades directly.
router.post('/real-trade', requireAuth, requireFeature('real_trading'), async (req, res) => {
  const { symbol, contractType, amount, duration, durationUnit } = req.body || {};
  if (!symbol || !contractType || !amount) return res.status(400).json({ error: 'symbol, contractType, amount required.' });
  try {
    const pb = await getServicePB();
    const user = await pb.collection('users').getOne(req.auth.user.id);
    const derivToken = getDerivToken(user);
    if (!derivToken) return res.status(400).json({ error: 'Connect your Deriv account first.' });

    const result = await placeRealTrade({
      derivToken, symbol, contractType,
      amount: Number(amount), duration: Number(duration || 5), durationUnit: durationUnit || 't',
    });
    const trade = await recordTrade({
      user: req.auth.user.id, symbol, mode: 'real', source: 'manual',
      contract_type: contractType, stake: Number(amount), entry_price: result.buy_price,
      status: 'open', contract_id: result.contract_id, meta: { longcode: result.longcode },
    }).catch(() => null);
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'trade.real', target: symbol, meta: { amount, contract_id: result.contract_id } });
    await notify({ userId: req.auth.user.id, type: 'trading', severity: 'success', title: 'Real trade placed', body: `${contractType} on ${symbol} for ${amount}. Contract ${result.contract_id}.`, meta: { contract_id: result.contract_id } });
    res.json({ ...result, tradeId: trade?.id || null });
  } catch (e) {
    res.status(502).json({ error: 'Real trade failed.', detail: e.message });
  }
});

export default router;
