import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScanResult } from '../src/services/scanner.js';

function market(symbol, overrides = {}) {
  return {
    symbol,
    direction: 'CALL/up',
    confidence: 70,
    riskLevel: 'low',
    volatility: 0.04,
    momentum: 0.1,
    trend: 'up',
    safe: true,
    ...overrides,
  };
}

test('warns about high volatility even when another market is the safe top pick', () => {
  const result = buildScanResult([
    market('SAFE_TOP', { confidence: 80 }),
    market('VOLATILE', { confidence: 75, riskLevel: 'high', volatility: 0.4, safe: false }),
  ]);

  assert.equal(result.best.symbol, 'SAFE_TOP');
  assert.deepEqual(result.volatileMarkets.map((item) => item.symbol), ['VOLATILE']);
  assert.equal(result.saferAlternative.symbol, 'SAFE_TOP');
  assert.equal(result.alternativeAnalysis.unsafeMarket, 'VOLATILE');
  assert.match(result.warning, /VOLATILE is volatile\/unsafe now/);
  assert.match(result.warning, /SAFE_TOP/);
});

test('returns no warning when every market passes the volatility gate', () => {
  const result = buildScanResult([market('A'), market('B', { confidence: 60 })]);
  assert.equal(result.warning, null);
  assert.deepEqual(result.volatileMarkets, []);
});
