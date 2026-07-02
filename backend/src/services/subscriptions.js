// Early-access feature access.
//
// Subscription records are intentionally kept in PocketBase so billing can be
// enabled later without a schema migration. During the current product-polish
// phase, however, no feature is restricted by plan or payment status.
import { getServicePB } from '../pocketbase.js';
import { FEATURE_MIN_RANK } from '../config.js';

export const EARLY_ACCESS_PLAN = Object.freeze({
  plan: 'early_access',
  label: 'Open Early Access',
  rank: 999,
  status: 'open_access',
  expiresAt: null,
  billing: 'coming_soon',
});

export function freePlan(status = 'none', expiresAt = null) {
  return { plan: 'free', label: 'Free', rank: 0, status, expiresAt };
}

// Keep subscription reads available for admin/history pages. They no longer
// control feature access while billing is marked Coming Soon.
export async function getSubscriptionSnapshot(userId, { pbFactory = getServicePB } = {}) {
  try {
    const pb = await pbFactory();
    const filter = pb.filter('user = {:user}', { user: userId });
    const subscriptions = await pb.collection('subscriptions').getFullList({ filter, sort: '-created' });
    return { subscriptions, effective: { ...EARLY_ACCESS_PLAN }, lookupOk: true, accessMode: 'early_access' };
  } catch (error) {
    console.error('[subscriptions] lookup failed; continuing with open early access:', error?.message || error);
    return { subscriptions: [], effective: { ...EARLY_ACCESS_PLAN }, lookupOk: false, accessMode: 'early_access' };
  }
}

export async function getEffectivePlan(_userId) {
  return { ...EARLY_ACCESS_PLAN };
}

export function canUse(feature, _planRank) {
  // Unknown feature names remain denied so typos do not silently grant access.
  // Every registered feature is available during open early access.
  return Object.prototype.hasOwnProperty.call(FEATURE_MIN_RANK, feature);
}

export function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      if (!canUse(feature, EARLY_ACCESS_PLAN.rank)) {
        return res.status(404).json({ error: 'Unknown feature.', feature });
      }
      req.plan = { ...EARLY_ACCESS_PLAN };
      next();
    } catch (error) {
      res.status(500).json({ error: 'Could not resolve early-access permissions.' });
    }
  };
}
