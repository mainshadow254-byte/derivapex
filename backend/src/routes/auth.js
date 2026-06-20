import { Router } from 'express';
import { getServicePB } from '../pocketbase.js';
import { requireAuth } from '../middleware/auth.js';
import { setTelegramPending } from '../services/telegram.js';
import { config } from '../config.js';
import { audit } from '../services/audit.js';

const router = Router();

function normalizeTelegram(handle = '') {
  return String(handle || '')
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@+/, '')
    .split(/[/?#]/)[0]
    .trim()
    .slice(0, 64);
}

// Signup is performed by the frontend directly against PocketBase (email,
// password, optional telegram). This endpoint sends a verification email and,
// when present, stores Telegram as pending. Telegram must never block dashboard
// access after email verification.
// PB also has its own verification; we use Resend for branded delivery.
router.post('/start-verification', async (req, res) => {
  const { userId, telegram } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required.' });

  try {
    const pb = await getServicePB();
    const user = await pb.collection('users').getOne(userId);

    // Store telegram as pending only if the user supplied it. Bot verification
    // is optional and can be finished later from Account Settings.
    if (normalizeTelegram(telegram)) {
      await setTelegramPending(userId, telegram);
    }

    if (!config.resend.apiKey) {
      return res.status(503).json({
        error: 'Email verification is not configured yet. Set RESEND_API_KEY and configure PocketBase mail before users can verify.',
        setupNeeded: true,
      });
    }

    // PocketBase generates the single-use verification token and sends it.
    // Configure the PB verification action URL to:
    //   {PUBLIC_APP_URL}/verify.html?token={TOKEN}
    // We do not send a second token-less email, because it could not verify.
    await pb.collection('users').requestVerification(user.email);

    await audit({ actorId: userId, actorEmail: user.email, action: 'signup.verification_sent' });
    res.json({ ok: true, message: 'Verification email sent. Check your inbox.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not start verification.', detail: e.message });
  }
});

// Confirm a real PocketBase verification token. verify.html reads ?token= from
// the email link and calls this endpoint; success is returned only after PB
// accepts the token.
router.post('/confirm-verification', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Verification token is required.' });

  try {
    const pb = await getServicePB();
    await pb.collection('users').confirmVerification(token);
    await audit({ actorEmail: 'verification:token', action: 'signup.verification_confirmed' }).catch(() => {});
    res.json({ ok: true, message: 'Email verified. You can continue onboarding.' });
  } catch (e) {
    res.status(400).json({ error: 'Verification link is invalid or expired.', detail: e.message });
  }
});

// Called after PocketBase OAuth login/signup. The frontend authenticates with
// PB OAuth first, then this backend-controlled endpoint sets safe defaults.
router.post('/oauth-sync', requireAuth, async (req, res) => {
  try {
    const pb = await getServicePB();
    const user = await pb.collection('users').getOne(req.auth.user.id);
    const displayName = String(req.body?.displayName || user.name || req.auth.user.name || '').trim().slice(0, 120);
    const patch = {
      telegram_verified: !!user.telegram_verified,
      deriv_connected: !!user.deriv_connected,
      status: user.status || 'active',
      subscription_plan: user.subscription_plan || 'free',
      subscription_status: user.subscription_status || 'inactive',
      device_limit: user.device_limit || 1,
    };
    if (displayName && !user.name) patch.name = displayName;
    if (!user.role) patch.role = 'user';
    await pb.collection('users').update(user.id, patch);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.oauth_sync', meta: { provider: 'google' } }).catch(() => {});
    const refreshed = await pb.collection('users').getOne(user.id);
    res.json({
      ok: true,
      needsTelegram: false,
      telegramOptional: true,
      needsEmailVerification: !refreshed.verified,
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not sync OAuth account.', detail: e.message });
  }
});

router.patch('/profile', requireAuth, async (req, res) => {
  const patch = {};
  const wantsName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
  const wantsTelegram = Object.prototype.hasOwnProperty.call(req.body || {}, 'telegram_username');

  if (wantsName) {
    const name = String(req.body?.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'Profile name is required.' });
    patch.name = name;
  }

  if (wantsTelegram) {
    const telegram = normalizeTelegram(req.body?.telegram_username);
    patch.telegram_username = telegram;
    patch.telegram_verified = false;
    patch.telegram_verified_at = '';
    patch.telegram_user_id = '';
    patch.telegram_pairing_token = '';
    patch.telegram_pairing_expires_at = '';
  }

  if (!Object.keys(patch).length) return res.status(400).json({ error: 'No profile changes supplied.' });

  try {
    const pb = await getServicePB();
    const user = await pb.collection('users').update(req.auth.user.id, patch);
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'auth.profile_updated', meta: { fields: Object.keys(patch) } }).catch(() => {});
    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name || '',
        telegram_username: user.telegram_username || '',
        telegram_verified: !!user.telegram_verified,
        telegram_verified_at: user.telegram_verified_at || '',
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not update profile.', detail: e.message });
  }
});

router.post('/complete-telegram', requireAuth, async (req, res) => {
  const telegram = normalizeTelegram(req.body?.telegram);
  if (!telegram) return res.status(400).json({ error: 'Telegram username is required.' });

  try {
    await setTelegramPending(req.auth.user.id, telegram);
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'auth.telegram_completed' }).catch(() => {});
    res.json({ ok: true, telegram_username: telegram });
  } catch (e) {
    res.status(500).json({ error: 'Could not save Telegram username.', detail: e.message });
  }
});

// Request a password reset. PocketBase generates a single-use reset TOKEN and
// emails it to the user — that token email is the ONLY thing carrying a valid
// token (the API never returns it to us), so we rely on PB to deliver it.
//
// IMPORTANT (one-time setup): in the PocketBase Admin UI → Settings → Mail
// settings → "Password reset" template, set the action URL to:
//     {PUBLIC_APP_URL}/reset.html?token={TOKEN}
// (and point PB's SMTP at Resend if you want branded delivery). Our reset.html
// reads ?token= and calls confirmPasswordReset — no fake success is possible.
//
// We deliberately do NOT send a second branded email with a token-less link,
// because that link could never complete a reset and would mislead users.
router.post('/request-reset', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required.' });
  if (!config.resend.apiKey) {
    return res.status(503).json({
      error: 'Password reset email is not configured yet. Set RESEND_API_KEY and configure PocketBase mail before users can reset passwords.',
      setupNeeded: true,
    });
  }
  try {
    const pb = await getServicePB();
    await pb.collection('users').requestPasswordReset(email);
    await audit({ actorEmail: String(email).toLowerCase(), action: 'password.reset_requested' }).catch(() => {});
    // Always return ok (don't leak which emails exist).
    res.json({ ok: true, message: 'If that email exists, a reset link was sent.' });
  } catch {
    res.json({ ok: true, message: 'If that email exists, a reset link was sent.' });
  }
});

export default router;
