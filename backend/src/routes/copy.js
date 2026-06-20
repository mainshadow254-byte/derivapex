// Copy-trading marketplace routes. Browse/search/filter/compare strategies,
// follow/unfollow, copy controls (start/pause/stop + capital + risk limits) and
// real performance graphs. All stats are computed from real trade records.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../services/subscriptions.js';
import {
  listStrategies, strategyStats, strategyPerformance, publishStrategy,
  follow, unfollow, setFollowStatus, updateFollowControls, myFollows,
} from '../services/copy.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifications.js';

const router = Router();

// Browse + search + filter + sort published strategies (any verified user).
router.get('/strategies', requireAuth, async (req, res) => {
  const { q = '', category = '', sort = 'followers' } = req.query;
  res.json({ strategies: await listStrategies({ q, category, sort }) });
});

// Compare a set of strategies side by side (real stats).
router.get('/compare', requireAuth, async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const out = [];
  for (const id of ids) out.push({ id, stats: await strategyStats(id), performance: await strategyPerformance(id) });
  res.json({ compare: out });
});

router.get('/strategies/:id/performance', requireAuth, async (req, res) => {
  res.json(await strategyPerformance(req.params.id));
});

// Publish your own strategy (paid: copy_publish). Performance accrues from your
// real trades tagged with this strategy.
router.post('/strategies', requireAuth, requireFeature('copy_publish'), async (req, res) => {
  const { name, description, category, symbol, risk_score, provider_name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required.' });
  const rec = await publishStrategy(req.auth.user.id, { name, description, category, symbol, risk_score, provider_name });
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'copy.publish', target: rec.id, meta: { name } });
  res.json({ ok: true, strategy: rec });
});

// Follow / copy a strategy (paid: copy_trading) with capital + risk limits.
router.post('/follow/:strategyId', requireAuth, requireFeature('copy_trading'), async (req, res) => {
  const { capital_allocation, risk_max_daily_loss, risk_max_per_trade } = req.body || {};
  const rec = await follow(req.auth.user.id, req.params.strategyId, { capital_allocation, risk_max_daily_loss, risk_max_per_trade });
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'copy.follow', target: req.params.strategyId });
  await notify({ userId: req.auth.user.id, type: 'copy', severity: 'success', title: 'Now copying strategy', body: `Copy started with ${capital_allocation || 0} allocation. Backend enforces your risk limits.`, meta: { strategyId: req.params.strategyId } });
  res.json({ ok: true, follow: rec });
});

// Copy controls: start / pause / stop.
router.post('/follow/:strategyId/:action(start|pause|stop)', requireAuth, requireFeature('copy_trading'), async (req, res) => {
  const map = { start: 'active', pause: 'paused', stop: 'stopped' };
  const rec = await setFollowStatus(req.auth.user.id, req.params.strategyId, map[req.params.action]);
  if (!rec) return res.status(404).json({ error: 'You are not following this strategy.' });
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: `copy.${req.params.action}`, target: req.params.strategyId });
  await notify({ userId: req.auth.user.id, type: 'copy', severity: 'info', title: `Copy ${req.params.action}`, body: `Copying ${map[req.params.action]} for this strategy.`, meta: { strategyId: req.params.strategyId } });
  res.json({ ok: true, follow: rec });
});

// Update capital allocation + risk limits on an existing follow.
router.patch('/follow/:strategyId', requireAuth, requireFeature('copy_trading'), async (req, res) => {
  const rec = await updateFollowControls(req.auth.user.id, req.params.strategyId, req.body || {});
  if (!rec) return res.status(404).json({ error: 'You are not following this strategy.' });
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'copy.controls', target: req.params.strategyId, meta: req.body });
  res.json({ ok: true, follow: rec });
});

router.delete('/follow/:strategyId', requireAuth, requireFeature('copy_trading'), async (req, res) => {
  const ok = await unfollow(req.auth.user.id, req.params.strategyId);
  if (ok) await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'copy.unfollow', target: req.params.strategyId });
  res.json({ ok });
});

router.get('/my-follows', requireAuth, async (req, res) => {
  res.json({ follows: await myFollows(req.auth.user.id) });
});

export default router;
