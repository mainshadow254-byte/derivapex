// Notification center routes. List real notifications, mark read, and manage
// per-type preferences (enable/disable/configure).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listNotifications, markRead, markAllRead, unreadCount,
  getPrefs, setPrefs, NOTIFICATION_TYPES,
} from '../services/notifications.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const unreadOnly = req.query.unread === 'true';
  const list = await listNotifications(req.auth.user.id, { page, unreadOnly });
  res.json({ ...list, unread: await unreadCount(req.auth.user.id) });
});

router.get('/unread-count', requireAuth, async (req, res) => {
  res.json({ unread: await unreadCount(req.auth.user.id) });
});

router.post('/read', requireAuth, async (req, res) => {
  const ids = req.body?.ids || [];
  await markRead(req.auth.user.id, Array.isArray(ids) ? ids : [ids]);
  res.json({ ok: true, unread: await unreadCount(req.auth.user.id) });
});

router.post('/read-all', requireAuth, async (req, res) => {
  const n = await markAllRead(req.auth.user.id);
  res.json({ ok: true, marked: n, unread: await unreadCount(req.auth.user.id) });
});

// Preferences: which notification types are enabled.
router.get('/prefs', requireAuth, async (req, res) => {
  const { prefs } = await getPrefs(req.auth.user.id);
  res.json({ types: NOTIFICATION_TYPES, prefs });
});

router.post('/prefs', requireAuth, async (req, res) => {
  const merged = await setPrefs(req.auth.user.id, req.body?.prefs || req.body || {});
  res.json({ ok: true, prefs: merged });
});

export default router;
