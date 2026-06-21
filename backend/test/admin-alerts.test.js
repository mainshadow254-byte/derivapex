import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAdminAlert, notifyAdminTelegram } from '../src/services/adminAlerts.js';

test('admin alerts use the private numeric target and redact secret-shaped text', async () => {
  const deliveries = [];
  const result = await notifyAdminTelegram({
    category: 'security',
    title: 'Sensitive event',
    message: 'token=do-not-send password=hunter2',
    meta: { userId: 'user1' },
  }, {
    adminId: '123456789',
    botToken: 'test-token',
    sendImpl: async (chatId, text) => deliveries.push({ chatId, text }),
  });

  assert.equal(result.sent, true);
  assert.equal(deliveries[0].chatId, '123456789');
  assert.doesNotMatch(deliveries[0].text, /do-not-send|hunter2/);
  assert.match(deliveries[0].text, /Category: SECURITY/);
});

test('missing or invalid admin configuration disables delivery safely', async () => {
  const sendImpl = async () => assert.fail('should not send');
  assert.deepEqual(await notifyAdminTelegram({ title: 'x' }, { adminId: '', botToken: 'x', sendImpl }), {
    sent: false, reason: 'not_configured',
  });
  assert.deepEqual(await notifyAdminTelegram({ title: 'x' }, { adminId: 'not-numeric', botToken: 'x', sendImpl }), {
    sent: false, reason: 'not_configured',
  });
});

test('Telegram delivery failures never escape into user requests', async () => {
  const result = await notifyAdminTelegram({ title: 'x' }, {
    adminId: '123456789', botToken: 'x',
    sendImpl: async () => { throw new Error('network unavailable'); },
  });
  assert.deepEqual(result, { sent: false, reason: 'delivery_failed' });
});

test('formatted alerts stay within Telegram message limits', () => {
  const text = formatAdminAlert({ title: 'x'.repeat(5000), message: 'y'.repeat(5000) });
  assert.ok(text.length <= 3500);
});
