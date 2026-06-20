import test from 'node:test';
import assert from 'node:assert/strict';
import { getSubscriptionSnapshot } from '../src/services/subscriptions.js';

function mockPB(rows = []) {
  return {
    filter(template, values) {
      assert.equal(template, 'user = {:user}');
      assert.ok(values.user);
      return `bound:${values.user}`;
    },
    collection(name) {
      assert.equal(name, 'subscriptions');
      return {
        async getFullList(options) {
          assert.match(options.filter, /^bound:/);
          assert.equal(options.sort, '-created');
          return rows;
        },
      };
    },
  };
}

test('missing subscription returns a stable free snapshot', async () => {
  const result = await getSubscriptionSnapshot('user123', { pbFactory: async () => mockPB([]) });
  assert.deepEqual(result.subscriptions, []);
  assert.deepEqual(result.effective, { plan: 'free', rank: 0, status: 'none', expiresAt: null });
  assert.equal(result.lookupOk, true);
});

test('PocketBase lookup failure fails closed without throwing', async () => {
  const result = await getSubscriptionSnapshot('user123', {
    pbFactory: async () => { throw new Error('PocketBase unavailable'); },
  });
  assert.deepEqual(result.subscriptions, []);
  assert.deepEqual(result.effective, { plan: 'free', rank: 0, status: 'unavailable', expiresAt: null });
  assert.equal(result.lookupOk, false);
});

test('active paid subscription resolves its backend plan rank', async () => {
  const row = { id: 'sub1', plan: 'premium', status: 'active', expires_at: new Date(Date.now() + 60_000).toISOString() };
  const result = await getSubscriptionSnapshot('user123', { pbFactory: async () => mockPB([row]) });
  assert.equal(result.effective.plan, 'premium');
  assert.equal(result.effective.rank, 3);
  assert.equal(result.effective.subId, 'sub1');
});
