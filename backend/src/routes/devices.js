// Device / session management routes.
//  - Users: register heartbeat, view active devices + session history, remove a
//    device, log out everywhere.
//  - Admins: view all sessions, terminate sessions, see suspicious logins.
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  touchDevice, listDevices, revokeDevice, revokeAll,
  adminListSessions, adminTerminate, suspiciousLogins,
} from '../services/devices.js';

const router = Router();

// Heartbeat from the browser on load/login. Records/refreshes the real device.
router.post('/heartbeat', requireAuth, async (req, res) => {
  const { deviceId, label } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: 'deviceId required.' });
  const ua = req.headers['user-agent'] || '';
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const result = await touchDevice({ userId: req.auth.user.id, deviceId, userAgent: ua, ip, label });
  res.json({ ok: true, isNew: result.isNew, suspicious: result.suspicious });
});

router.get('/mine', requireAuth, async (req, res) => {
  res.json({ devices: await listDevices(req.auth.user.id) });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const ok = await revokeDevice(req.auth.user.id, req.params.id);
  res.json({ ok });
});

router.post('/logout-all', requireAuth, async (req, res) => {
  const keep = req.body?.keepDeviceId || null;
  const count = await revokeAll(req.auth.user.id, keep);
  res.json({ ok: true, revoked: count });
});

// ---- Admin ------------------------------------------------------------------
router.get('/admin/sessions', requireAuth, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  res.json(await adminListSessions({ page }));
});

router.post('/admin/terminate/:id', requireAuth, requireAdmin, async (req, res) => {
  const ok = await adminTerminate(req.params.id);
  res.json({ ok });
});

router.get('/admin/suspicious', requireAuth, requireAdmin, async (_req, res) => {
  res.json({ suspicious: await suspiciousLogins() });
});

export default router;
