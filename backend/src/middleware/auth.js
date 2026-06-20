// Authentication + role resolution middleware.
// The role is computed on the BACKEND from OWNER_EMAIL and the `admins`
// collection. The frontend cannot assert its own role or permissions.
import { config } from '../config.js';
import { verifyUserToken } from '../pocketbase.js';
import { getServicePB } from '../pocketbase.js';

// Roles: 'owner' (super, only OWNER_EMAIL) > 'admin' > 'user'
export async function attachUser(req, _res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await verifyUserToken(token);

  req.auth = { user: null, role: 'guest', isOwner: false, isAdmin: false };

  if (user) {
    // Re-read through the backend superuser client so hidden enforcement fields
    // (status/disabled) are authoritative and never need to reach the browser.
    let trustedUser = user;
    try {
      const pb = await getServicePB();
      trustedUser = await pb.collection('users').getOne(user.id);
    } catch {
      return next();
    }
    if (trustedUser.disabled || ['suspended', 'disabled'].includes(trustedUser.status)) return next();

    const email = (trustedUser.email || '').toLowerCase().trim();
    let role = 'user';
    const isOwner = !!config.ownerEmail && email === config.ownerEmail;

    if (isOwner) {
      role = 'owner';
    } else {
      // Check admins collection (backend-controlled). active=true required.
      try {
        const pb = await getServicePB();
        const adminRec = await pb
          .collection('admins')
          .getFirstListItem(`user="${trustedUser.id}" && active=true`)
          .catch(() => null);
        if (adminRec) role = 'admin';
      } catch {
        /* fall back to user */
      }
    }

    req.auth = {
      user: trustedUser,
      role,
      isOwner,
      isAdmin: role === 'owner' || role === 'admin',
      email,
    };
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.auth?.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!req.auth.user.verified) {
    return res.status(403).json({ error: 'Email not verified. Please verify your email first.' });
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth?.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

export const requireAdmin = requireRole('owner', 'admin');
export const requireOwner = requireRole('owner');

// Permanent owner protection. Blocks ANY mutating action whose target is the
// owner account, regardless of who is calling (including other admins).
// Pass a function that extracts the target user's email from the request.
export function protectOwner(getTargetEmail) {
  return async (req, res, next) => {
    try {
      let email = getTargetEmail ? await getTargetEmail(req) : null;
      if (email && email.toLowerCase().trim() === config.ownerEmail) {
        return res.status(403).json({ error: 'The owner account is permanently protected and cannot be modified, suspended, demoted, or deleted.' });
      }
    } catch { /* if we cannot resolve, fail safe below by allowing only non-owner */ }
    next();
  };
}

// Helper: resolve a user record's email by id (for protectOwner on /users/:id).
export async function emailFromUserId(id) {
  if (!id) return null;
  const pb = await getServicePB();
  const u = await pb.collection('users').getOne(id).catch(() => null);
  return u?.email || null;
}
