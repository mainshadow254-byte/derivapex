// Analytics routes. Admin dashboards, per-user performance, and per-bot
// performance graphs — all computed from real PocketBase data.
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getServicePB } from '../pocketbase.js';
import { adminAnalytics, userAnalytics, botAnalytics } from '../services/analytics.js';

const router = Router();

// Admin analytics dashboard (revenue, subs, users, DAU/MAU, scanner/trading/bot/copy usage).
router.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  const days = Math.min(parseInt(req.query.days || '30', 10), 365);
  res.json(await adminAnalytics({ days }));
});

// Current user's own performance analytics.
router.get('/me', requireAuth, async (req, res) => {
  res.json(await userAnalytics(req.auth.user.id));
});

// Per-bot performance (only the owner — or an admin — may view).
router.get('/bot/:id', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  const bot = await pb.collection('bots').getOne(req.params.id).catch(() => null);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  if (bot.user !== req.auth.user.id && !req.auth.isAdmin) return res.status(403).json({ error: 'Not your bot.' });
  res.json(await botAnalytics(req.params.id));
});

export default router;
