import test from 'node:test';
import assert from 'node:assert/strict';
import { clearVolatilityAlertCooldowns, notifyVolatilityAlerts } from '../src/services/volatilityAlerts.js';

function scan() {
  return {
    generatedAt: 123,
    volatileMarkets: [
      { symbol: 'R_100', volatility: 0.31, riskLevel: 'high' },
      { symbol: 'BOOM500', volatility: 0.25, riskLevel: 'high' },
    ],
    saferAlternative: { symbol: 'R_25' },
  };
}

test('writes preference-aware volatility notifications with a per-market cooldown', async () => {
  clearVolatilityAlertCooldowns();
  const notifications = [];
  const notifyFn = async (payload) => notifications.push(payload);

  const first = await notifyVolatilityAlerts({ userId: 'user1', scan: scan(), notifyFn, now: 1_000, cooldownMs: 300_000 });
  const second = await notifyVolatilityAlerts({ userId: 'user1', scan: scan(), notifyFn, now: 2_000, cooldownMs: 300_000 });
  const third = await notifyVolatilityAlerts({ userId: 'user1', scan: scan(), notifyFn, now: 302_000, cooldownMs: 300_000 });

  assert.equal(first, 2);
  assert.equal(second, 0);
  assert.equal(third, 2);
  assert.equal(notifications.length, 4);
  assert.equal(notifications[0].type, 'volatility');
  assert.equal(notifications[0].severity, 'warning');
  assert.equal(notifications[0].meta.saferAlternative, 'R_25');
  assert.match(notifications[0].body, /lower-risk safety checks/);
});

test('does nothing when no market is high volatility', async () => {
  clearVolatilityAlertCooldowns();
  const sent = await notifyVolatilityAlerts({ userId: 'user1', scan: { volatileMarkets: [] }, notifyFn: async () => assert.fail('should not notify') });
  assert.equal(sent, 0);
});
