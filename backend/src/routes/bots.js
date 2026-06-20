import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../services/subscriptions.js';
import { getServicePB } from '../pocketbase.js';
import { validateBot } from '../services/botValidator.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifications.js';
import { getCandles } from '../services/derivData.js';
import { normalizeStrategy, runBacktest } from '../services/backtest.js';
import { ALLOWED_GRANULARITIES } from '../config.js';

const router = Router();

router.post('/backtest', requireAuth, requireFeature('bot_import'), async (req, res) => {
  const strategy = normalizeStrategy(req.body?.strategy || {});
  const requestedGranularity = Number(req.body?.granularity || 300);
  const granularity = ALLOWED_GRANULARITIES.has(requestedGranularity) ? requestedGranularity : 300;
  const count = Math.max(100, Math.min(1000, Number(req.body?.count || 500)));
  try {
    const candles = await getCandles(strategy.symbol, granularity, count);
    res.json(runBacktest(candles, strategy));
  } catch (e) {
    res.status(502).json({ error: 'Backtest failed.', detail: e.message });
  }
});

// Import a bot — validated before it can ever be used. status starts 'inactive'.
router.post('/import', requireAuth, requireFeature('bot_import'), async (req, res) => {
  const { filename, content } = req.body || {};
  const result = validateBot({ filename, content });
  if (!result.valid) return res.status(422).json({ error: 'Bot failed validation.', ...result });

  const pb = await getServicePB();
  const rec = await pb.collection('bots').create({
    user: req.auth.user.id, name: filename || 'imported-bot', format: result.meta.format,
    symbol: result.meta.symbol || '', content, validated: true, status: 'inactive',
  });
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'bot.import', target: rec.id, meta: result.meta });
  await notify({ userId: req.auth.user.id, type: 'bot', severity: 'success', title: 'Bot imported', body: `"${rec.name}" passed validation and is ready to run.`, meta: { botId: rec.id } });
  res.json({ ok: true, bot: { id: rec.id, name: rec.name, status: rec.status }, warnings: result.warnings });
});

router.get('/', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  const bots = await pb.collection('bots').getFullList({ filter: `user="${req.auth.user.id}"`, fields: 'id,name,format,symbol,status,validated,created' });
  res.json({ bots });
});

// Start/stop — only validated bots, only own bots. Real execution worker reads
// status='running' and runs the strategy via the Deriv proxy (out of scope here).
router.post('/:id/:action(start|stop)', requireAuth, requireFeature('bot_import'), async (req, res) => {
  const pb = await getServicePB();
  const bot = await pb.collection('bots').getOne(req.params.id).catch(() => null);
  if (!bot || bot.user !== req.auth.user.id) return res.status(404).json({ error: 'Bot not found.' });
  if (!bot.validated) return res.status(422).json({ error: 'Bot is not validated.' });
  const status = req.params.action === 'start' ? 'running' : 'stopped';
  const rec = await pb.collection('bots').update(bot.id, { status });
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: `bot.${req.params.action}`, target: bot.id });
  await notify({ userId: req.auth.user.id, type: 'bot', severity: 'info', title: `Bot ${status}`, body: `"${bot.name}" is now ${status}.`, meta: { botId: bot.id } });
  res.json({ ok: true, bot: { id: rec.id, status: rec.status } });
});

export default router;
