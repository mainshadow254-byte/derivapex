// Notification center service. Notifications are REAL events written by the
// backend (trades, subscriptions, payments, bot/copy actions, security, etc.).
// Respects each user's per-type preferences. No synthetic alerts.
import { getServicePB } from '../pocketbase.js';
import { notifyAdminTelegram } from './adminAlerts.js';
import { sendTelegramMessage } from './telegramBot.js';

export const NOTIFICATION_TYPES = [
  'market', 'scanner', 'volatility', 'trading', 'copy',
  'bot', 'telegram', 'payment', 'subscription', 'security',
];

export function shouldNotifyAdmin({ type, severity = 'info', meta = {} } = {}) {
  return meta?.adminAlert === true || severity === 'critical' || type === 'payment';
}

function defaultPrefs() {
  return Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, true]));
}

export async function getPrefs(userId) {
  const pb = await getServicePB();
  const rec = await pb.collection('notification_prefs').getFirstListItem(`user="${userId}"`).catch(() => null);
  if (!rec) return { prefs: defaultPrefs(), _id: null };
  let prefs = defaultPrefs();
  try { prefs = { ...prefs, ...JSON.parse(rec.prefs || '{}') }; } catch {}
  return { prefs, _id: rec.id };
}

export async function setPrefs(userId, partial) {
  const pb = await getServicePB();
  const { prefs, _id } = await getPrefs(userId);
  const merged = { ...prefs };
  for (const [k, v] of Object.entries(partial || {})) {
    if (NOTIFICATION_TYPES.includes(k)) merged[k] = !!v;
  }
  const body = { user: userId, prefs: JSON.stringify(merged) };
  if (_id) await pb.collection('notification_prefs').update(_id, body);
  else await pb.collection('notification_prefs').create(body);
  return merged;
}

// Write a notification, but only if the user enabled that type. Security alerts
// are always delivered (cannot be silenced) for account-safety reasons.
export async function notify({ userId, type, title, body = '', severity = 'info', meta = {} }) {
  try {
    if (!userId || !NOTIFICATION_TYPES.includes(type)) return null;
    const pb = await getServicePB();
    if (type !== 'security') {
      const { prefs } = await getPrefs(userId);
      if (prefs[type] === false) return null;
    }
    const record = await pb.collection('notifications').create({
      user: userId, type, title, body, severity, read: false,
      meta: JSON.stringify(meta || {}),
    });

    // User-facing Telegram alerts go only to the linked, verified Telegram
    // account for that user. Admin Telegram is reserved for operational events.
    const user = await pb.collection('users').getOne(userId).catch(() => null);
    if (user?.telegram_verified && user?.telegram_user_id) {
      void sendTelegramMessage(
        user.telegram_user_id,
        `ApexBot ${type} alert\n${title}${body ? `\n\n${body}` : ''}`,
      ).catch((error) => console.error('[notify] user Telegram delivery failed:', error?.message || error));
    }

    if (shouldNotifyAdmin({ type, severity, meta })) {
      void notifyAdminTelegram({
        category: type, title, message: body,
        meta: { ...meta, userId, severity },
      });
    }
    return record;
  } catch (e) {
    console.error('[notify] failed:', e?.message || e);
    return null;
  }
}

export async function listNotifications(userId, { page = 1, perPage = 50, unreadOnly = false } = {}) {
  const pb = await getServicePB();
  const filter = unreadOnly ? `user="${userId}" && read=false` : `user="${userId}"`;
  return pb.collection('notifications').getList(page, perPage, { filter, sort: '-created' });
}

export async function markRead(userId, ids) {
  const pb = await getServicePB();
  for (const id of ids) {
    const n = await pb.collection('notifications').getOne(id).catch(() => null);
    if (n && n.user === userId) await pb.collection('notifications').update(id, { read: true });
  }
  return true;
}

export async function markAllRead(userId) {
  const pb = await getServicePB();
  const unread = await pb.collection('notifications').getFullList({ filter: `user="${userId}" && read=false` });
  for (const n of unread) await pb.collection('notifications').update(n.id, { read: true });
  return unread.length;
}

export async function unreadCount(userId) {
  const pb = await getServicePB();
  const r = await pb.collection('notifications').getList(1, 1, { filter: `user="${userId}" && read=false` });
  return r.totalItems;
}
