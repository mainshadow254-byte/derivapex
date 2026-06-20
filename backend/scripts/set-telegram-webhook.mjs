import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
const publicBackendUrl = process.env.PUBLIC_BACKEND_URL || process.env.RAILWAY_BACKEND_URL || '';
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || (publicBackendUrl ? `${publicBackendUrl.replace(/\/$/, '')}/api/telegram/webhook` : '');

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required.');
  process.exit(1);
}
if (!webhookUrl) {
  console.error('PUBLIC_BACKEND_URL or TELEGRAM_WEBHOOK_URL is required.');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    ...(process.env.TELEGRAM_WEBHOOK_SECRET ? { secret_token: process.env.TELEGRAM_WEBHOOK_SECRET } : {}),
  }),
});

const body = await response.json().catch(() => ({}));
if (!response.ok || body.ok === false) {
  console.error(body.description || `Telegram setWebhook failed (${response.status})`);
  process.exit(1);
}

console.log(`Telegram webhook set: ${webhookUrl}`);
