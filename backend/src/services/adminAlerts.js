import { config } from '../config.js';
import { sendTelegramMessage } from './telegramBot.js';

function clean(value, maxLength = 600) {
  return String(value ?? '')
    .replace(/\b(token|password|secret|api[_ -]?key)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function formatAdminAlert({ category = 'system', title = 'ApexBot alert', message = '', meta = {} }) {
  const lines = [
    'ApexBot admin alert',
    `Category: ${clean(category, 40).toUpperCase()}`,
    `Title: ${clean(title, 160)}`,
  ];
  if (message) lines.push(`Message: ${clean(message)}`);

  const context = Object.entries(meta || {}).slice(0, 8)
    .map(([key, value]) => `${clean(key, 40)}: ${clean(value, 180)}`);
  if (context.length) lines.push('', 'Context:', ...context);
  return lines.join('\n').slice(0, 3500);
}

export async function notifyAdminTelegram(payload, options = {}) {
  const adminId = String(options.adminId ?? config.telegram.adminId ?? '').trim();
  const botToken = options.botToken ?? config.telegram.botToken;
  const sendImpl = options.sendImpl ?? sendTelegramMessage;
  if (!adminId || !/^\d+$/.test(adminId) || !botToken) {
    return { sent: false, reason: 'not_configured' };
  }

  try {
    await sendImpl(adminId, formatAdminAlert(payload));
    return { sent: true };
  } catch (error) {
    console.error('[admin-alert] Telegram delivery failed:', error?.message || error);
    return { sent: false, reason: 'delivery_failed' };
  }
}

export function notifyAdminError(context, error, meta = {}) {
  return notifyAdminTelegram({
    category: 'backend_error',
    title: context,
    message: error?.message || error || 'Unknown backend error',
    meta,
  });
}

export const _test = { clean };
