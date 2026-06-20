import '../src/config.js';
import { getServicePB } from '../src/pocketbase.js';

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

const pb = await getServicePB();
const users = await pb.collection('users').getFullList({
  filter: 'telegram_username != ""',
  fields: 'id,email,telegram_username,telegram_verified',
});

let changed = 0;
for (const user of users) {
  const normalized = normalizeTelegramUsername(user.telegram_username);
  if (normalized !== user.telegram_username) {
    await pb.collection('users').update(user.id, {
      telegram_username: normalized,
      telegram_verified: false,
      telegram_user_id: '',
      telegram_pairing_token: '',
      telegram_pairing_expires_at: '',
      telegram_verified_at: '',
    });
    changed += 1;
  }
}

console.log(`Checked ${users.length} users; normalized ${changed} Telegram username(s).`);
