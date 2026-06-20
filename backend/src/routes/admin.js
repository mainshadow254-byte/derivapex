import { Router } from 'express';
import { requireAuth, requireAdmin, protectOwner, emailFromUserId } from '../middleware/auth.js';
import { getServicePB } from '../pocketbase.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// User management
router.get('/users', async (req, res) => {
  const pb = await getServicePB();
  const page = parseInt(req.query.page || '1', 10);
  const list = await pb.collection('users').getList(page, 50, {
    sort: '-created',
    fields: 'id,email,verified,telegram_username,telegram_verified,deriv_connected,created',
  });
  res.json(list);
});

router.post('/users/:id/disable', protectOwner((req) => emailFromUserId(req.params.id)), async (req, res) => {
  const pb = await getServicePB();
  const rec = await pb.collection('users').update(req.params.id, { disabled: true });
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'user.disable', target: rec.email, ip: req.ip });
  res.json({ ok: true });
});

// Subscription / payment status overview
router.get('/subscriptions', async (_req, res) => {
  const pb = await getServicePB();
  const subs = await pb.collection('subscriptions').getList(1, 100, { sort: '-created', expand: 'user' });
  res.json({
    ...subs,
    items: subs.items.map((sub) => ({
      id: sub.id,
      user: sub.user,
      plan: sub.plan,
      status: sub.status,
      expires_at: sub.expires_at,
      provider: sub.provider,
      payment_ref: sub.payment_ref,
      created: sub.created,
      updated: sub.updated,
      expand: sub.expand?.user ? {
        user: {
          id: sub.expand.user.id,
          email: sub.expand.user.email,
          name: sub.expand.user.name || '',
        },
      } : {},
    })),
  });
});

// Audit history (read-only)
router.get('/logs', async (req, res) => {
  const pb = await getServicePB();
  const page = parseInt(req.query.page || '1', 10);
  const logs = await pb.collection('audit_logs').getList(page, 100, { sort: '-created' });
  res.json(logs);
});

// Real/demo global mode control (system setting).
router.get('/system', async (_req, res) => {
  const pb = await getServicePB();
  const s = await pb.collection('system_settings').getFirstListItem('key="trading_mode"').catch(() => null);
  res.json({ trading_mode: s?.value || 'demo' });
});

router.post('/system/mode', async (req, res) => {
  const { mode } = req.body || {};
  if (!['demo', 'real'].includes(mode)) return res.status(400).json({ error: 'mode must be demo|real.' });
  const pb = await getServicePB();
  const existing = await pb.collection('system_settings').getFirstListItem('key="trading_mode"').catch(() => null);
  if (existing) await pb.collection('system_settings').update(existing.id, { value: mode });
  else await pb.collection('system_settings').create({ key: 'trading_mode', value: mode });
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'system.trading_mode', meta: { mode }, ip: req.ip });
  res.json({ ok: true, trading_mode: mode });
});

export default router;
