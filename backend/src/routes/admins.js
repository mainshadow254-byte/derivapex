import { Router } from 'express';
import { getServicePB } from '../pocketbase.js';
import { requireAuth, requireAdmin, requireOwner } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { config } from '../config.js';

const router = Router();

// List admins — any admin/owner can view.
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const pb = await getServicePB();
  const admins = await pb.collection('admins').getFullList({ expand: 'user', sort: '-created' });
  res.json({ admins: admins.map((admin) => ({
    id: admin.id,
    user: admin.user,
    email: admin.email,
    level: admin.level,
    active: admin.active,
    approved_by: admin.approved_by,
    created: admin.created,
    updated: admin.updated,
    expand: admin.expand?.user ? {
      user: {
        id: admin.expand.user.id,
        email: admin.expand.user.email,
        name: admin.expand.user.name || '',
      },
    } : {},
  })) });
});

// Create / approve an admin — OWNER ONLY.
// Normal admins cannot create admins or escalate privileges.
router.post('/', requireAuth, requireOwner, async (req, res) => {
  const { email, level } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required.' });
  if (email.toLowerCase() === config.ownerEmail) {
    return res.status(400).json({ error: 'Owner is managed by OWNER_EMAIL, not the admins list.' });
  }
  try {
    const pb = await getServicePB();
    const user = await pb.collection('users').getFirstListItem(`email="${email.toLowerCase()}"`).catch(() => null);
    if (!user) return res.status(404).json({ error: 'No user with that email. They must sign up first.' });

    // level is capped — there is no "higher than owner". Admins are flat.
    const rec = await pb.collection('admins').create({
      user: user.id,
      email: user.email,
      level: 'admin',
      active: true,
      approved_by: req.auth.user.id,
    });
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'admin.create', target: user.email, ip: req.ip });
    res.json({ ok: true, admin: rec });
  } catch (e) {
    res.status(500).json({ error: 'Could not create admin.', detail: e.message });
  }
});

// Enable/disable an admin — OWNER ONLY.
router.patch('/:id', requireAuth, requireOwner, async (req, res) => {
  const { active } = req.body || {};
  try {
    const pb = await getServicePB();
    const target = await pb.collection('admins').getOne(req.params.id);
    if (target.email.toLowerCase() === config.ownerEmail) {
      return res.status(403).json({ error: 'The owner cannot be modified or removed.' });
    }
    const rec = await pb.collection('admins').update(req.params.id, { active: !!active });
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'admin.update', target: target.email, meta: { active: !!active }, ip: req.ip });
    res.json({ ok: true, admin: rec });
  } catch (e) {
    res.status(500).json({ error: 'Could not update admin.', detail: e.message });
  }
});

// Remove an admin — OWNER ONLY. Owner can never be removed.
router.delete('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const pb = await getServicePB();
    const target = await pb.collection('admins').getOne(req.params.id);
    if (target.email.toLowerCase() === config.ownerEmail) {
      return res.status(403).json({ error: 'The owner cannot be removed.' });
    }
    await pb.collection('admins').delete(req.params.id);
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'admin.delete', target: target.email, ip: req.ip });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not remove admin.', detail: e.message });
  }
});

export default router;
