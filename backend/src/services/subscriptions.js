// Subscription resolution. Source of truth = PocketBase `subscriptions`.
// A subscription is ACTIVE only if status='active' and not expired.
// Activation happens ONLY via verified payment webhook (see routes/payments.js).
import { getServicePB } from '../pocketbase.js';
import { PLAN_TIERS, FEATURE_MIN_RANK } from '../config.js';

export function freePlan(status = 'none', expiresAt = null) {
  return { plan: 'free', rank: 0, status, expiresAt };
}

function effectiveFromRows(rows) {
  const active = (rows || []).find((row) => row.status === 'active');
  if (!active) return freePlan();
  const expiresAt = active.expires_at || active.current_period_end || null;
  const expired = expiresAt && new Date(expiresAt) < new Date();
  if (expired) return freePlan('expired', expiresAt);
  const tier = PLAN_TIERS[active.plan] || PLAN_TIERS.free;
  if (!tier.rank) return freePlan(active.plan === 'free' ? 'active' : 'invalid');
  return { plan: active.plan, rank: tier.rank, status: 'active', expiresAt, subId: active.id };
}

// Subscription reads are intentionally fail-closed: an unavailable or empty
// collection produces a free plan instead of crashing a route or granting paid
// access. `pb.filter` safely binds relation values for PocketBase.
export async function getSubscriptionSnapshot(userId, { pbFactory = getServicePB } = {}) {
  try {
    const pb = await pbFactory();
    const filter = pb.filter('user = {:user}', { user: userId });
    const subscriptions = await pb.collection('subscriptions').getFullList({ filter, sort: '-created' });
    return { subscriptions, effective: effectiveFromRows(subscriptions), lookupOk: true };
  } catch (error) {
    console.error('[subscriptions] lookup failed; using free plan:', error?.message || error);
    return { subscriptions: [], effective: freePlan('unavailable'), lookupOk: false };
  }
}

export async function getEffectivePlan(userId) {
  const snapshot = await getSubscriptionSnapshot(userId);
  return snapshot.effective;
}

export function canUse(feature, planRank) {
  const min = FEATURE_MIN_RANK[feature];
  if (min === undefined) return false;
  return planRank >= min;
}

// Express guard factory: blocks a route unless the user's backend-resolved plan
// allows the feature. Demo features (rank 0) are always allowed for verified users.
export function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      const eff = await getEffectivePlan(req.auth.user.id);
      req.plan = eff;
      if (!canUse(feature, eff.rank)) {
        return res.status(402).json({
          error: 'Your current plan does not include this feature.',
          feature,
          currentPlan: eff.plan,
          upgradeRequired: true,
        });
      }
      next();
    } catch (e) {
      res.status(500).json({ error: 'Could not verify subscription.' });
    }
  };
}
