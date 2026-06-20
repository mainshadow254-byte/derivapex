// Telegram service. Stores the user's Telegram handle and supports a real
// verification handshake. Verification status is controlled by the backend.
import { getServicePB } from '../pocketbase.js';
import { config } from '../config.js';

const TOKEN_TTL_MS = 30 * 60 * 1000;

function cleanToken(token) {
  return String(token || '').trim().replace(/^verify_/, '');
}

function normalizeTelegramUsername(value = '') {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@+/, '')
    .split(/[/?#]/)[0]
    .trim()
    .slice(0, 64);
}

function hasRequiredCommunityConfig() {
  return Boolean(config.telegram.requiredChannelId || config.telegram.requiredGroupId);
}

// Generate a short-lived pairing token the user sends to your Telegram bot.
// The bot (your separate worker) calls back the /api/telegram/confirm endpoint
// with this token to mark the account verified. No fake auto-approval here.
export function generatePairingToken() {
  // Cryptographically strong, not Math.random.
  return 'TG-' + [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export async function setTelegramPending(userId, telegramHandle) {
  const pb = await getServicePB();
  const token = generatePairingToken();
  const username = normalizeTelegramUsername(telegramHandle);
  const patch = {
    telegram_verified: false,
    telegram_pairing_token: token,
    telegram_pairing_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
  if (username) patch.telegram_username = username;
  await pb.collection('users').update(userId, patch);
  return token;
}

export async function getPendingTelegramUser(token) {
  const pb = await getServicePB();
  const clean = cleanToken(token);
  const user = await pb
    .collection('users')
    .getFirstListItem(`telegram_pairing_token="${clean}"`)
    .catch(() => null);
  if (!user) return null;
  const expiresAt = user.telegram_pairing_expires_at ? new Date(user.telegram_pairing_expires_at).getTime() : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    await pb.collection('users').update(user.id, { telegram_pairing_token: '', telegram_pairing_expires_at: '' }).catch(() => {});
    return null;
  }
  return user;
}

export async function findUserByTelegramId(telegramUserId) {
  const pb = await getServicePB();
  const id = String(telegramUserId || '');
  if (!id) return null;
  return pb.collection('users').getFirstListItem(`telegram_user_id="${id}"`).catch(() => null);
}

export async function beginTelegramLink(token, telegramUserId, telegramUsername = '') {
  const pb = await getServicePB();
  const user = await getPendingTelegramUser(token);
  if (!user) return { ok: false, code: 'invalid_or_expired', message: 'Invalid or expired Telegram verification link. Start again from ApexBot Account Settings.' };

  const telegramId = String(telegramUserId || '');
  if (user.telegram_user_id && String(user.telegram_user_id) !== telegramId) {
    return { ok: false, code: 'token_already_started', message: 'This verification token is already being used by another Telegram account. Start again from ApexBot Account Settings.' };
  }
  const linked = await findUserByTelegramId(telegramId);
  if (linked && linked.id !== user.id) {
    return { ok: false, code: 'already_linked', message: 'This Telegram account is already linked to another ApexBot account. Use /unlink there first or contact support.' };
  }

  const patch = {
    telegram_user_id: telegramId,
    telegram_verified: !hasRequiredCommunityConfig(),
  };
  if (!hasRequiredCommunityConfig()) {
    patch.telegram_pairing_token = '';
    patch.telegram_pairing_expires_at = '';
    patch.telegram_verified_at = new Date().toISOString();
  }
  const username = normalizeTelegramUsername(telegramUsername);
  if (username) patch.telegram_username = username;
  await pb.collection('users').update(user.id, patch);
  return { ok: true, user, verified: patch.telegram_verified, requiresJoin: hasRequiredCommunityConfig() };
}

export async function confirmTelegram(token, telegramUserId, telegramUsername = '') {
  const started = await beginTelegramLink(token, telegramUserId, telegramUsername);
  if (!started.ok) return null;
  if (!started.requiresJoin) return started.user;
  return markTelegramVerified(started.user.id);
}

export async function markTelegramVerified(userId) {
  const pb = await getServicePB();
  return pb.collection('users').update(userId, {
    telegram_verified: true,
    telegram_verified_at: new Date().toISOString(),
    telegram_pairing_token: '',
    telegram_pairing_expires_at: '',
  });
}

export async function markTelegramVerifiedByTelegramId(telegramUserId) {
  const user = await findUserByTelegramId(telegramUserId);
  if (!user) return null;
  return markTelegramVerified(user.id);
}

export async function unlinkTelegram(userId) {
  const pb = await getServicePB();
  return pb.collection('users').update(userId, {
    telegram_username: '',
    telegram_user_id: '',
    telegram_verified: false,
    telegram_verified_at: '',
    telegram_pairing_token: '',
    telegram_pairing_expires_at: '',
  });
}

export async function unlinkTelegramByTelegramId(telegramUserId) {
  const user = await findUserByTelegramId(telegramUserId);
  if (!user) return null;
  return unlinkTelegram(user.id);
}

// Admin override (review/verify) — logged in audit by the route.
export async function adminSetTelegramVerified(userId, verified) {
  const pb = await getServicePB();
  return pb.collection('users').update(userId, {
    telegram_verified: !!verified,
    telegram_verified_at: verified ? new Date().toISOString() : '',
  });
}
