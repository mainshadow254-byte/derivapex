import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getEffectivePlan } from '../services/subscriptions.js';
import { config } from '../config.js';

const router = Router();

// The frontend asks the backend "who am I and what can I do".
// Role + plan are authoritative from here — never from localStorage.
router.get('/', requireAuth, async (req, res) => {
  const u = req.auth.user;
  const plan = await getEffectivePlan(u.id);
  res.json({
    id: u.id,
    email: u.email,
    name: u.name || '',
    verified: u.verified,
    role: req.auth.role,
    isOwner: req.auth.isOwner,
    isAdmin: req.auth.isAdmin,
    telegram_username: u.telegram_username || '',
    telegram_verified: !!u.telegram_verified,
    telegram_verified_at: u.telegram_verified_at || '',
    deriv_connected: !!u.deriv_connected,
    plan,
    telegramLinks: {
      community: config.telegram.communityUrl,
      bot: config.telegram.botUrl,
      support: config.telegram.supportUrl,
    },
  });
});

export default router;
