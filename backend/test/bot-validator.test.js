import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBot } from '../src/services/botValidator.js';

test('accepts declarative builder output with BOTH direction', () => {
  const content = JSON.stringify({ symbol: 'R_100', contract_type: 'BOTH', strategy: 'ma_cross', stake: 10 });
  const result = validateBot({ filename: 'trend-rider.json', content });
  assert.equal(result.valid, true);
  assert.equal(result.meta.contract_type, 'BOTH');
});

test('rejects executable or external bot content', () => {
  const result = validateBot({ filename: 'unsafe.json', content: '{"symbol":"R_100","contract_type":"CALL","x":"fetch(https://bad.test)"}' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('Disallowed content')));
});
