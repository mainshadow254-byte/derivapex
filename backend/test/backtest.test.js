import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStrategy, runBacktest } from '../src/services/backtest.js';

function candles(count = 120) {
  return Array.from({ length: count }, (_, i) => {
    const wave = Math.sin(i / 5) * 4;
    const c = 100 + i * 0.05 + wave;
    return { t: 1700000000 + i * 60, o: c - 0.2, h: c + 0.5, l: c - 0.5, c };
  });
}

test('normalizes unsafe strategy inputs', () => {
  const s = normalizeStrategy({ strategy: 'code_execution', stake: -10, fastPeriod: 500, slowPeriod: 1 });
  assert.equal(s.strategy, 'ma_cross');
  assert.equal(s.stake, 0.35);
  assert.ok(s.slowPeriod > s.fastPeriod);
});

test('backtest is deterministic and returns bounded metrics', () => {
  const input = { strategy: 'ma_cross', fastPeriod: 3, slowPeriod: 8, stake: 10 };
  const first = runBacktest(candles(), input);
  const second = runBacktest(candles(), input);
  assert.deepEqual(first, second);
  assert.equal(first.simulation, true);
  assert.ok(first.summary.trades > 0);
  assert.ok(first.summary.winRate >= 0 && first.summary.winRate <= 100);
  assert.ok(first.summary.maxDrawdown <= 0);
});

test('rejects insufficient candle data', () => {
  assert.throws(() => runBacktest(candles(10), {}), /At least 30/);
});

for (const strategy of ['ma_cross', 'rsi_reversal', 'breakout']) {
  test(`${strategy} template produces a valid report`, () => {
    const report = runBacktest(candles(180), { strategy, fastPeriod: 3, slowPeriod: 8, rsiPeriod: 5, lookback: 5 });
    assert.equal(report.strategy.strategy, strategy);
    assert.equal(report.candles, 180);
    assert.ok(Array.isArray(report.trades));
    assert.ok(Array.isArray(report.equityCurve));
    assert.match(report.disclaimer, /does not predict future results/i);
  });
}
