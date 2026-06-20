import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  adminSetTelegramVerified,
  beginTelegramLink,
  confirmTelegram,
  findUserByTelegramId,
  markTelegramVerifiedByTelegramId,
  setTelegramPending,
  unlinkTelegram,
  unlinkTelegramByTelegramId,
} from '../services/telegram.js';
import {
  answerCallbackQuery,
  communityButtons,
  communityMessage,
  hasRequiredCommunityConfig,
  HELP_TEXT,
  joinKeyboard,
  joinRequiredMessage,
  sendTelegramMessage,
  setTelegramCommands,
  setTelegramWebhook,
  startMessage,
  supportMessage,
  telegramStartUrl,
  TELEGRAM_COMMANDS,
  verifyRequiredJoins,
} from '../services/telegramBot.js';
import { getServicePB } from '../pocketbase.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifications.js';
import { config } from '../config.js';

const router = Router();

function telegramUsername(from = {}) {
  return from.username || [from.first_name, from.last_name].filter(Boolean).join(' ');
}

function communityText() {
  const links = communityButtons();
  return [
    'ApexBot community links:',
    links.channel ? `Channel: ${links.channel}` : '',
    links.group ? `Group: ${links.group}` : '',
  ].filter(Boolean).join('\n') || 'Community links are not configured yet.';
}

async function verifyJoinAndReply(chatId, telegramUserId) {
  const user = await findUserByTelegramId(telegramUserId);
  if (!user) {
    await sendTelegramMessage(chatId, 'Telegram is not linked yet. Start verification from ApexBot onboarding or Account Settings.');
    return;
  }

  if (!hasRequiredCommunityConfig()) {
    await markTelegramVerifiedByTelegramId(telegramUserId);
    await sendTelegramMessage(chatId, 'Community verification is not configured yet. Telegram linking is saved, but community verification is skipped.');
    return;
  }

  const join = await verifyRequiredJoins(telegramUserId);
  if (!join.ok) {
    await sendTelegramMessage(chatId, 'You have not joined all required communities yet. Join them, then tap Verify Join again.', {
      reply_markup: joinKeyboard(),
    });
    return;
  }

  await markTelegramVerifiedByTelegramId(telegramUserId);
  await sendTelegramMessage(chatId, 'Telegram verified. ApexBot alerts and account notifications are now linked.');
}

async function handleTelegramStart(chatId, from, arg = '') {
  const token = String(arg || '').replace(/^verify_/, '');
  if (!token) {
    await sendTelegramMessage(chatId, startMessage().body, { reply_markup: joinKeyboard() });
    return;
  }

  const linked = await beginTelegramLink(token, from.id, telegramUsername(from));
  if (!linked.ok) {
    await sendTelegramMessage(chatId, linked.message);
    return;
  }

  if (!linked.requiresJoin) {
    await sendTelegramMessage(chatId, 'Telegram is linked. Community membership is optional because no required channel or group is configured.', {
      reply_markup: joinKeyboard(),
    });
    return;
  }

  const join = joinRequiredMessage();
  await sendTelegramMessage(chatId, `${join.title}\n\nTo enable ApexBot Telegram alerts, join the channel and group first.`, {
    reply_markup: joinKeyboard(),
  });
}

async function handleTelegramCommand(message) {
  const chatId = message.chat?.id;
  const from = message.from || {};
  const text = String(message.text || '').trim();
  if (!chatId || !text.startsWith('/')) return;
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.split('@')[0].toLowerCase();
  const arg = rest.join(' ');

  if (cmd === '/start') return handleTelegramStart(chatId, from, arg);
  if (cmd === '/verify') return verifyJoinAndReply(chatId, from.id);
  if (cmd === '/help' || cmd === '/commands') return sendTelegramMessage(chatId, HELP_TEXT);
  if (cmd === '/support') {
    const s = supportMessage();
    return sendTelegramMessage(chatId, `${s.title}\n\n${s.body}${s.url ? `\n${s.url}` : ''}`);
  }
  if (cmd === '/community') return sendTelegramMessage(chatId, communityText());
  if (cmd === '/alerts') return sendTelegramMessage(chatId, 'Telegram alerts are optional. After linking, ApexBot can send account notifications, scanner warnings, subscription notices, and safety alerts here.');
  if (cmd === '/privacy') return sendTelegramMessage(chatId, 'Privacy and safety: ApexBot support will never ask for your password, Deriv token, payment secret, PocketBase admin credentials, or one-time verification code.');
  if (cmd === '/unlink') {
    const unlinked = await unlinkTelegramByTelegramId(from.id);
    return sendTelegramMessage(chatId, unlinked ? 'Telegram unlinked from your ApexBot account.' : 'This Telegram account is not linked to an ApexBot account.');
  }
  if (cmd === '/status') {
    const user = await findUserByTelegramId(from.id);
    if (!user) return sendTelegramMessage(chatId, 'Telegram status: not linked.');
    return sendTelegramMessage(chatId, `Telegram status: ${user.telegram_verified ? 'verified' : 'unverified'}\nApexBot account: ${user.email || user.name || user.id}`);
  }
}

async function handleTelegramCallback(callbackQuery) {
  const id = callbackQuery.id;
  const data = callbackQuery.data;
  const message = callbackQuery.message || {};
  const chatId = message.chat?.id;
  const from = callbackQuery.from || {};
  await answerCallbackQuery(id, 'Working...');
  if (!chatId) return;

  if (data === 'verify_join') return verifyJoinAndReply(chatId, from.id);
  if (data === 'unlink_telegram') {
    const unlinked = await unlinkTelegramByTelegramId(from.id);
    return sendTelegramMessage(chatId, unlinked ? 'Telegram unlinked from your ApexBot account.' : 'This Telegram account is not linked.');
  }
  if (data === 'open_support') {
    const s = supportMessage();
    return sendTelegramMessage(chatId, `${s.title}\n\n${s.body}${s.url ? `\n${s.url}` : ''}`);
  }
  if (data === 'open_community') return sendTelegramMessage(chatId, communityText());
}

export async function processTelegramUpdate(update = {}) {
  if (update.message) await handleTelegramCommand(update.message);
  if (update.callback_query) await handleTelegramCallback(update.callback_query);
}

// User (re)issues a pairing token to link their Telegram via your bot.
router.post('/pair', requireAuth, async (req, res) => {
  const { telegram } = req.body || {};
  const token = await setTelegramPending(req.auth.user.id, telegram);
  res.json({
    ok: true,
    pairingToken: token,
    startUrl: telegramStartUrl(token),
    instructions: 'Telegram is optional. Open the ApexBot Telegram bot to finish verification for alerts and community access.',
  });
});

router.post('/start-verification', requireAuth, async (req, res) => {
  const { telegram } = req.body || {};
  const token = await setTelegramPending(req.auth.user.id, telegram);
  res.json({
    ok: true,
    pairingToken: token,
    startUrl: telegramStartUrl(token),
    joinRequired: joinRequiredMessage(),
    links: communityButtons(),
    instructions: 'Telegram is optional. You can finish this later in Account Settings. Recommended for alerts and community access.',
  });
});

router.post('/webhook', async (req, res) => {
  if (config.telegram.webhookSecret
    && req.get('x-telegram-bot-api-secret-token') !== config.telegram.webhookSecret) {
    return res.status(401).json({ error: 'Invalid Telegram webhook secret.' });
  }
  try {
    await processTelegramUpdate(req.body || {});
    res.json({ ok: true });
  } catch (e) {
    console.error('[telegram-webhook]', e?.message || e);
    res.json({ ok: true });
  }
});

// Called by YOUR Telegram bot worker (server-to-server) when a user sends the
// pairing token in chat. Protect this with a shared header in production.
router.post('/confirm', async (req, res) => {
  const { token, telegramUserId, telegramUsername, secret } = req.body || {};
  if (secret !== process.env.TELEGRAM_BOT_TOKEN) return res.status(401).json({ error: 'Unauthorized.' });
  if (!token || !telegramUserId) return res.status(400).json({ error: 'token and telegramUserId are required.' });

  if (hasRequiredCommunityConfig()) {
    const join = await verifyRequiredJoins(telegramUserId);
    if (!join.ok) {
      return res.status(403).json({
        error: 'Join Required',
        message: 'To enable ApexBot Telegram alerts, join the channel and group first.',
        detail: join.reason,
        joinRequired: joinRequiredMessage(),
      });
    }
  }

  const user = await confirmTelegram(token, telegramUserId, telegramUsername);
  if (!user) return res.status(404).json({ error: 'Invalid or expired pairing token.' });
  await audit({ actorEmail: 'system:telegram-bot', action: 'telegram.verified', target: user.email });
  notify({ userId: user.id, type: 'telegram', severity: 'success', title: 'Telegram verified', body: 'Your Telegram account is now linked and verified.' }).catch(() => {});
  res.json({ ok: true });
});

router.get('/help', (_req, res) => {
  res.json({ ok: true, text: HELP_TEXT, commands: TELEGRAM_COMMANDS, links: communityButtons() });
});

router.get('/start', (req, res) => {
  const token = String(req.query?.token || req.query?.start || '').replace(/^verify_/, '');
  res.json({ ok: true, ...startMessage(token) });
});

router.get('/commands', (_req, res) => {
  res.json({ ok: true, commands: TELEGRAM_COMMANDS });
});

router.get('/support', (_req, res) => {
  res.json({ ok: true, ...supportMessage() });
});

router.get('/community', (_req, res) => {
  res.json({ ok: true, ...communityMessage() });
});

router.get('/alerts', (_req, res) => {
  res.json({ ok: true, title: 'Telegram alerts', body: 'Telegram alerts are optional and can notify you about account activity, scanner warnings, subscriptions, and community updates after you link Telegram.' });
});

router.get('/privacy', (_req, res) => {
  res.json({ ok: true, title: 'Privacy and safety', body: 'ApexBot support will never ask for your password, Deriv token, payment secret, PocketBase admin credentials, or one-time verification code.' });
});

router.post('/set-commands', async (req, res) => {
  const { secret } = req.body || {};
  if (secret !== process.env.TELEGRAM_BOT_TOKEN) return res.status(401).json({ error: 'Unauthorized.' });
  try {
    const result = await setTelegramCommands();
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: 'Could not set Telegram command list.', detail: e.message });
  }
});

router.post('/set-webhook', async (req, res) => {
  const { secret, url } = req.body || {};
  if (secret !== process.env.TELEGRAM_BOT_TOKEN) return res.status(401).json({ error: 'Unauthorized.' });
  const webhookUrl = url || (process.env.PUBLIC_BACKEND_URL ? `${process.env.PUBLIC_BACKEND_URL.replace(/\/$/, '')}/api/telegram/webhook` : '');
  if (!webhookUrl) return res.status(400).json({ error: 'PUBLIC_BACKEND_URL or url is required.' });
  try {
    const result = await setTelegramWebhook(webhookUrl);
    res.json({ ok: true, webhookUrl, result });
  } catch (e) {
    res.status(500).json({ error: 'Could not set Telegram webhook.', detail: e.message });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  const user = await pb.collection('users').getOne(req.auth.user.id);
  res.json({
    ok: true,
    telegram_username: user.telegram_username || '',
    telegram_verified: !!user.telegram_verified,
    telegram_verified_at: user.telegram_verified_at || '',
    optional: true,
    message: user.telegram_verified ? 'Telegram verified.' : 'Telegram is optional. Recommended for alerts and community access.',
  });
});

router.post('/unlink', requireAuth, async (req, res) => {
  await unlinkTelegram(req.auth.user.id);
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'telegram.unlinked', ip: req.ip }).catch(() => {});
  notify({ userId: req.auth.user.id, type: 'telegram', severity: 'info', title: 'Telegram unlinked', body: 'Telegram alerts are off until you verify again.' }).catch(() => {});
  res.json({ ok: true });
});

// Admin: review/verify Telegram-linked accounts.
router.get('/pending', requireAuth, requireAdmin, async (req, res) => {
  const pb = await getServicePB();
  const users = await pb.collection('users').getFullList({
    filter: 'telegram_username != "" && telegram_verified = false', sort: '-created',
    fields: 'id,email,telegram_username,telegram_verified,created',
  });
  res.json({ pending: users });
});

router.post('/admin-verify', requireAuth, requireAdmin, async (req, res) => {
  const { userId, verified } = req.body || {};
  await adminSetTelegramVerified(userId, verified);
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'telegram.admin_set', target: userId, meta: { verified: !!verified }, ip: req.ip });
  res.json({ ok: true });
});

export default router;
