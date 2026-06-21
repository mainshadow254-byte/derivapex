import { Router } from 'express';
import crypto from 'node:crypto';
import { getServicePB } from '../pocketbase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { config, PLAN_TIERS } from '../config.js';
import { sendAccountNotice } from '../services/resend.js';
import { notify } from '../services/notifications.js';
import { getSubscriptionSnapshot } from '../services/subscriptions.js';
import { notifyAdminError, notifyAdminTelegram } from '../services/adminAlerts.js';

const router = Router();

// ---------------------------------------------------------------------------
// WEBHOOK: the ONLY place a subscription becomes active. Provider-agnostic.
// The processor signs the payload with PAYMENT_WEBHOOK_SECRET (HMAC-SHA256).
// We verify the signature, then activate. No frontend can call this to fake it.
// raw body is required for signature verification (see server.js mounting).
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-apexbot-signature'] || '';
  const raw = req.rawBody || JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', config.payments.webhookSecret || '').update(raw).digest('hex');

  const sigBuf = Buffer.from(String(signature));
  const expBuf = Buffer.from(expected);
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!signature || !valid) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  let event;
  try { event = typeof req.body === 'object' ? req.body : JSON.parse(raw); } catch { return res.status(400).json({ error: 'Bad payload.' }); }

  // Expected normalized fields from your adapter: { type, email, plan, periodDays, paymentRef }
  if (event.type !== 'payment.succeeded') {
    return res.json({ ok: true, ignored: event.type });
  }
  const plan = event.plan;
  if (!PLAN_TIERS[plan] || plan === 'free') return res.status(400).json({ error: 'Unknown plan.' });

  try {
    const pb = await getServicePB();
    const user = await pb.collection('users').getFirstListItem(`email="${String(event.email).toLowerCase()}"`);
    const paymentRef = String(event.paymentRef || '');
    if (paymentRef) {
      const duplicate = await pb.collection('payments').getFirstListItem(
        pb.filter('provider={:provider} && payment_ref={:paymentRef}', {
          provider: config.payments.provider,
          paymentRef,
        }),
      ).catch(() => null);
      if (duplicate) return res.json({ ok: true, duplicate: true, paymentId: duplicate.id });
    }
    const days = parseInt(event.periodDays || '30', 10);
    const expires = new Date(Date.now() + days * 86400000).toISOString();

    // Deactivate previous active subs, then create the new active one.
    const prev = await pb.collection('subscriptions').getFullList({
      filter: pb.filter('user = {:user} && status = {:status}', { user: user.id, status: 'active' }),
    });
    for (const p of prev) await pb.collection('subscriptions').update(p.id, { status: 'replaced' });

    const sub = await pb.collection('subscriptions').create({
      user: user.id, plan, status: 'active', expires_at: expires, current_period_end: expires,
      payment_ref: event.paymentRef || '', provider: config.payments.provider,
    });
    const payment = await pb.collection('payments').create({
      user: user.id,
      amount: Math.max(0, Number(event.amount || PLAN_TIERS[plan].price || 0)),
      currency: String(event.currency || 'USD').toUpperCase(),
      status: 'succeeded',
      provider: config.payments.provider,
      payment_ref: paymentRef,
      event_type: event.type,
      paid_at: new Date().toISOString(),
      meta: JSON.stringify({ plan, periodDays: days }),
    });
    await pb.collection('users').update(user.id, {
      subscription_plan: plan,
      subscription_status: 'active',
      subscription_expires_at: expires,
    });

    await audit({ actorEmail: 'system:webhook', action: 'subscription.activated', target: user.email, meta: { plan, paymentRef: event.paymentRef } });
    notify({ userId: user.id, type: 'payment', severity: 'success', title: 'Payment received', body: `Payment confirmed for the ${PLAN_TIERS[plan].label} plan.`, meta: { paymentRef: event.paymentRef } }).catch(() => {});
    notify({ userId: user.id, type: 'subscription', severity: 'success', title: 'Subscription active', body: `Your ${PLAN_TIERS[plan].label} plan is active until ${new Date(expires).toDateString()}.`, meta: { plan } }).catch(() => {});
    sendAccountNotice(user.email, 'Subscription active', `Your ${PLAN_TIERS[plan].label} plan is now active until ${new Date(expires).toDateString()}.`).catch(() => {});
    void notifyAdminTelegram({
      category: 'payment', title: 'Payment and subscription activated',
      message: `${user.email} activated the ${plan} plan.`,
      meta: { paymentRef, amount: payment.amount, currency: payment.currency, expires },
    });
    res.json({ ok: true, subscriptionId: sub.id, paymentId: payment.id });
  } catch (e) {
    void notifyAdminError('Payment activation failed', e, { plan, email: event.email || '' });
    res.status(500).json({ error: 'Activation failed.', detail: e.message });
  }
});

// Read current user's subscription status (backend-verified).
router.get('/me', requireAuth, async (req, res) => {
  try {
    const snapshot = await getSubscriptionSnapshot(req.auth.user.id);
    res.json({
      subscriptions: snapshot.subscriptions,
      effective: snapshot.effective,
      degraded: !snapshot.lookupOk,
    });
  } catch (error) {
    // Defensive final boundary: subscription reads must never terminate the
    // request process, even if a future service implementation throws.
    console.error('[payments/me] subscription snapshot failed:', error?.message || error);
    res.json({
      subscriptions: [],
      effective: { plan: 'free', rank: 0, status: 'unavailable', expiresAt: null },
      degraded: true,
    });
  }
});

// MANUAL activation (admin) — only if you chose a manual flow. Audited.
router.post('/manual-activate', requireAuth, requireAdmin, async (req, res) => {
  const { email, plan, periodDays } = req.body || {};
  if (!PLAN_TIERS[plan] || plan === 'free') return res.status(400).json({ error: 'Invalid plan.' });
  try {
    const pb = await getServicePB();
    const user = await pb.collection('users').getFirstListItem(`email="${String(email).toLowerCase()}"`);
    const expires = new Date(Date.now() + (parseInt(periodDays || '30', 10)) * 86400000).toISOString();
    const prev = await pb.collection('subscriptions').getFullList({
      filter: pb.filter('user = {:user} && status = {:status}', { user: user.id, status: 'active' }),
    });
    for (const current of prev) await pb.collection('subscriptions').update(current.id, { status: 'replaced' });
    const sub = await pb.collection('subscriptions').create({
      user: user.id, plan, status: 'active', expires_at: expires, current_period_end: expires, provider: 'manual', payment_ref: `manual:${req.auth.email}`,
    });
    await pb.collection('users').update(user.id, {
      subscription_plan: plan,
      subscription_status: 'active',
      subscription_expires_at: expires,
    });
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'subscription.manual_activate', target: user.email, meta: { plan }, ip: req.ip });
    notify({ userId: user.id, type: 'subscription', severity: 'success', title: 'Subscription active', body: `Your ${PLAN_TIERS[plan].label} plan was activated by an admin until ${new Date(expires).toDateString()}.`, meta: { plan } }).catch(() => {});
    void notifyAdminTelegram({
      category: 'payment', title: 'Manual subscription activation',
      message: `${req.auth.email} activated ${plan} for ${user.email}.`,
      meta: { expires },
    });
    res.json({ ok: true, subscriptionId: sub.id });
  } catch (e) {
    void notifyAdminError('Manual subscription activation failed', e, { plan, email: email || '' });
    res.status(500).json({ error: 'Manual activation failed.', detail: e.message });
  }
});

export default router;
