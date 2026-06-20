import { config } from '../config.js';

export const TELEGRAM_COMMANDS = [
  { command: 'start', description: 'Start or resume account linking' },
  { command: 'verify', description: 'Verify Telegram/community access' },
  { command: 'status', description: 'Check your account verification status' },
  { command: 'help', description: 'Show all commands and help text' },
  { command: 'commands', description: 'Show all bot commands' },
  { command: 'support', description: 'Contact support/admin' },
  { command: 'community', description: 'Show channel/group links' },
  { command: 'alerts', description: 'Explain Telegram alerts' },
  { command: 'unlink', description: 'Remove Telegram link from your account' },
  { command: 'privacy', description: 'Show privacy/safety message' },
];

export const HELP_TEXT = `Welcome to ApexBot help.

Commands:
/start - Start or resume account linking
/verify - Verify Telegram/community access
/status - Check your account verification status
/commands - Show all bot commands
/community - Open ApexBot community links
/alerts - Learn about Telegram alerts
/support - Contact support/admin
/unlink - Remove Telegram link from your account
/privacy - Read safety and privacy notes`;

export function telegramStartUrl(token) {
  if (!config.telegram.botUrl) return '';
  const sep = config.telegram.botUrl.includes('?') ? '&' : '?';
  return `${config.telegram.botUrl}${sep}start=verify_${encodeURIComponent(token)}`;
}

export function communityButtons() {
  return {
    channel: config.telegram.communityUrl,
    group: config.telegram.secondaryCommunityUrl,
    support: config.telegram.supportUrl,
    admin: config.telegram.adminContact,
    bot: config.telegram.botUrl,
  };
}

export function hasRequiredCommunityConfig() {
  return Boolean(config.telegram.requiredChannelId || config.telegram.requiredGroupId);
}

export function joinRequiredMessage() {
  if (!hasRequiredCommunityConfig()) {
    return {
      title: 'ApexBot Telegram',
      body: 'Telegram verification can start now. Community join checks are not configured, so use /help or /support if you need assistance.',
      buttons: [
        { text: 'Join Official Channel', url: config.telegram.communityUrl || '' },
        { text: 'Join Discussion Group', url: config.telegram.secondaryCommunityUrl || config.telegram.communityUrl || '' },
        { text: 'Verify Membership', callback_data: 'verify_join' },
        { text: 'Help', callback_data: 'open_community' },
        { text: 'Support', callback_data: 'open_support' },
      ],
    };
  }
  return {
    title: 'Join Required',
    body: 'To use ApexBot Telegram alerts, join the community first.',
    buttons: [
      { text: 'Join Official Channel', url: config.telegram.communityUrl || '' },
      { text: 'Join Discussion Group', url: config.telegram.secondaryCommunityUrl || config.telegram.communityUrl || '' },
      { text: 'Verify Membership', callback_data: 'verify_join' },
      { text: 'Help', callback_data: 'open_community' },
      { text: 'Support', callback_data: 'open_support' },
    ],
  };
}

export function startMessage(token = '') {
  if (token) {
    return {
      title: 'ApexBot Telegram verification',
      body: 'Use this chat to finish Telegram verification for alerts and community access. Join the configured community first if prompted, then choose Verify Join.',
      token,
      joinRequired: joinRequiredMessage(),
    };
  }
  return {
    title: 'ApexBot Telegram',
    body: 'Welcome. Use /verify from the website flow to link your account, /community for links, /support for help, or /privacy for safety notes.',
    links: communityButtons(),
  };
}

export function supportMessage() {
  return {
    title: 'ApexBot support',
    body: config.telegram.supportUrl ? 'Use the official support contact for account help. Never share passwords, Deriv tokens, or payment secrets.' : 'Support contact is not configured yet. Use /help for available commands.',
    url: config.telegram.supportUrl || '',
  };
}

export function communityMessage() {
  return {
    title: 'ApexBot community',
    body: 'Open the official ApexBot community links below.',
    links: communityButtons(),
  };
}

export async function setTelegramCommands() {
  if (!config.telegram.botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: TELEGRAM_COMMANDS }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.description || `Telegram setMyCommands failed (${res.status})`);
  return body;
}

export async function setTelegramWebhook(webhookUrl) {
  if (!webhookUrl) throw new Error('Webhook URL is required.');
  return telegramApi('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    ...(config.telegram.webhookSecret ? { secret_token: config.telegram.webhookSecret } : {}),
  });
}

export async function deleteTelegramWebhook(dropPendingUpdates = false) {
  return telegramApi('deleteWebhook', { drop_pending_updates: !!dropPendingUpdates });
}

export async function getTelegramUpdates(offset = 0, timeout = 25) {
  return telegramApi('getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message', 'callback_query'],
  });
}

export async function verifyRequiredJoins(telegramUserId) {
  const required = [
    config.telegram.requiredChannelId,
    config.telegram.requiredGroupId,
  ].filter(Boolean);
  if (!required.length) return { ok: true, checked: 0 };
  if (!config.telegram.botToken) return { ok: false, checked: 0, reason: 'TELEGRAM_BOT_TOKEN is not configured.' };

  for (const chatId of required) {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(telegramUserId)}`;
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    const status = body?.result?.status;
    if (!res.ok || body.ok === false || !['creator', 'administrator', 'member'].includes(status)) {
      return { ok: false, checked: required.length, reason: `User has not joined required Telegram community ${chatId}.` };
    }
  }
  return { ok: true, checked: required.length };
}

function inlineKeyboard(buttons = []) {
  const rows = buttons
    .filter((button) => button.url || button.callback_data)
    .map((button) => [{ text: button.text, ...(button.url ? { url: button.url } : { callback_data: button.callback_data }) }]);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

export function joinKeyboard() {
  return inlineKeyboard(joinRequiredMessage().buttons);
}

export async function telegramApi(method, payload = {}) {
  if (!config.telegram.botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.description || `Telegram ${method} failed (${res.status})`);
  return body.result ?? body;
}

export async function sendTelegramMessage(chatId, text, options = {}) {
  return telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...options,
  });
}

export async function answerCallbackQuery(callbackQueryId, text = '') {
  return telegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  }).catch(() => null);
}
