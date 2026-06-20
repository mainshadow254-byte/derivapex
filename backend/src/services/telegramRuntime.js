import { config } from '../config.js';
import {
  deleteTelegramWebhook,
  getTelegramUpdates,
  setTelegramCommands,
  setTelegramWebhook,
} from './telegramBot.js';
import { processTelegramUpdate } from '../routes/telegram.js';

let polling = false;
let offset = 0;

export function telegramWebhookUrl() {
  if (!config.publicBackendUrl) return '';
  return `${config.publicBackendUrl.replace(/\/$/, '')}/api/telegram/webhook`;
}

async function pollOnce() {
  const updates = await getTelegramUpdates(offset, 25);
  for (const update of updates || []) {
    offset = Math.max(offset, Number(update.update_id || 0) + 1);
    try {
      await processTelegramUpdate(update);
    } catch (error) {
      console.error('[telegram-polling:update]', error?.message || error);
    }
  }
}

export async function startTelegramRuntime() {
  if (!config.telegram.botToken) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN is not configured; bot runtime disabled.');
    return;
  }

  setTelegramCommands().catch((error) => {
    console.warn('[telegram] could not set command menu:', error?.message || error);
  });

  if (config.telegram.usePolling) {
    if (polling) return;
    polling = true;
    await deleteTelegramWebhook(true).catch((error) => {
      console.warn('[telegram] could not clear webhook before polling:', error?.message || error);
    });
    console.log('[telegram] polling mode enabled for local development');
    while (polling) {
      try {
        await pollOnce();
      } catch (error) {
        console.error('[telegram-polling]', error?.message || error);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    return;
  }

  const webhook = telegramWebhookUrl();
  if (!webhook) {
    console.warn('[telegram] PUBLIC_BACKEND_URL is not set; webhook was not configured.');
    return;
  }
  await setTelegramWebhook(webhook);
  console.log(`[telegram] webhook configured: ${webhook}`);
}

export function stopTelegramPolling() {
  polling = false;
}
