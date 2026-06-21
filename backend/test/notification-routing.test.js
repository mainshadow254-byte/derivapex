import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldNotifyAdmin } from '../src/services/notifications.js';

test('normal user security/login alerts are not sent to admin Telegram', () => {
  assert.equal(shouldNotifyAdmin({
    type: 'security',
    severity: 'info',
    meta: { deviceId: 'dev-1', ip: '203.0.113.10' },
  }), false);
});

test('critical, explicit admin, and payment alerts are sent to admin Telegram', () => {
  assert.equal(shouldNotifyAdmin({ type: 'security', severity: 'critical' }), true);
  assert.equal(shouldNotifyAdmin({ type: 'security', meta: { adminAlert: true } }), true);
  assert.equal(shouldNotifyAdmin({ type: 'payment', severity: 'success' }), true);
});
