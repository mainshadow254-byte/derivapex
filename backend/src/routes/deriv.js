// Deriv account connection. The user authorizes their OWN Deriv account via
// Deriv OAuth; the callback page (deriv-callback.html) posts the returned token
// here. We VERIFY the token against Deriv, store it ENCRYPTED at rest, and flag
// the account connected. The raw token is never returned to the frontend again.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getServicePB } from '../pocketbase.js';
import { encryptToken } from '../services/crypto.js';
import { getAccountSummary } from '../services/derivAccount.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifications.js';

const router = Router();

// Connect: body { token, loginid?, currency? }. Verifies, encrypts, stores.
router.post('/connect', requireAuth, async (req, res) => {
  const { token, loginid, currency } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Deriv token is required.' });

  // Verify the token actually works by reading the real account summary.
  let summary;
  try {
    summary = await getAccountSummary(token);
  } catch (e) {
    return res.status(400).json({ error: 'Could not verify the Deriv token with Deriv.', detail: e.message });
  }

  try {
    const pb = await getServicePB();
    await pb.collection('users').update(req.auth.user.id, {
      deriv_token: encryptToken(token),         // encrypted at rest
      deriv_connected: true,
      deriv_loginid: summary.loginid || loginid || '',
      deriv_account_id: summary.loginid || loginid || '',
      deriv_currency: summary.currency || currency || '',
    });
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'deriv.connected', target: summary.loginid || '', ip: req.ip });
    notify({ userId: req.auth.user.id, type: 'security', severity: 'success', title: 'Deriv account connected', body: `Your Deriv account ${summary.loginid || ''} is now linked. Real account data is available.` }).catch(() => {});
    // Return ONLY non-sensitive confirmation (never the token).
    res.json({ ok: true, connected: true, loginid: summary.loginid, currency: summary.currency, balance: summary.balance });
  } catch (e) {
    res.status(500).json({ error: 'Could not store Deriv connection.', detail: e.message });
  }
});

// Status: is this user's Deriv account connected? (No token ever returned.)
router.get('/status', requireAuth, async (req, res) => {
  try {
    const pb = await getServicePB();
    const u = await pb.collection('users').getOne(req.auth.user.id);
    res.json({ connected: !!u.deriv_connected, loginid: u.deriv_loginid || '', currency: u.deriv_currency || '' });
  } catch (e) {
    res.status(500).json({ error: 'Could not read Deriv status.', detail: e.message });
  }
});

// Disconnect: clears the stored token and flags.
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    const pb = await getServicePB();
    await pb.collection('users').update(req.auth.user.id, { deriv_token: '', deriv_connected: false, deriv_loginid: '', deriv_account_id: '', deriv_currency: '' });
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'deriv.disconnected', ip: req.ip });
    res.json({ ok: true, connected: false });
  } catch (e) {
    res.status(500).json({ error: 'Could not disconnect Deriv account.', detail: e.message });
  }
});

export default router;
