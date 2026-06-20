import test from 'node:test';
import assert from 'node:assert/strict';
import { aiSetupRequiredAdvice, deterministicAdvice, getMarketAdvice } from '../src/services/aiMarketAdvisor.js';

function scanFixture() {
  const unsafe = {
    symbol: 'R_100', direction: 'mixed', confidence: 25, riskLevel: 'high',
    volatility: 0.31, momentum: -0.02, trend: 'up', safe: false,
    reason: 'Trend and momentum disagree.', invalidation: 'Wait for agreement.',
  };
  const safe = {
    symbol: 'R_25', direction: 'CALL/up', confidence: 72, riskLevel: 'low',
    volatility: 0.04, momentum: 0.12, trend: 'up', safe: true,
    reason: 'Trend and momentum agree.', invalidation: 'MA cross down.',
  };
  return {
    best: unsafe,
    saferAlternative: safe,
    warning: 'R_100 is volatile.',
    markets: [unsafe, safe],
  };
}

function modelPayload(overrides = {}) {
  return {
    summary: 'R_100 is volatile; R_25 is the cleaner current setup.',
    marketState: 'volatile',
    action: 'consider',
    selectedMarket: 'R_25',
    volatileMarket: 'R_100',
    saferAlternative: 'R_25',
    rationale: ['R_100 failed the volatility gate.', 'R_25 passed the supplied safety gate.'],
    warning: 'Conditions can change; recheck before entry.',
    disclaimer: 'No outcome is guaranteed.',
    ...overrides,
  };
}

test('deterministic advisor warns and selects only the safe alternative', () => {
  const advice = deterministicAdvice(scanFixture());
  assert.equal(advice.volatileMarket, 'R_100');
  assert.equal(advice.saferAlternative, 'R_25');
  assert.equal(advice.selectedMarket, 'R_25');
  assert.equal(advice.structured.market, 'R_25');
  assert.equal(Array.isArray(advice.structured.warnings), true);
});

test('a volatile non-top market is still surfaced with the safe top market as its alternative', () => {
  const scan = scanFixture();
  scan.best = scan.markets[1];
  scan.volatileMarkets = [scan.markets[0]];
  scan.saferAlternative = scan.markets[1];
  const advice = deterministicAdvice(scan);

  assert.equal(advice.volatileMarket, 'R_100');
  assert.equal(advice.selectedMarket, 'R_25');
  assert.equal(advice.saferAlternative, 'R_25');
  assert.equal(advice.marketState, 'volatile');
});

test('valid structured model advice passes the backend safety gate', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(modelPayload()) } }] }),
    };
  };
  const advice = await getMarketAdvice(scanFixture(), {
    provider: 'openai', apiKey: 'test-key', fetchImpl, model: 'test-model', disableCache: true,
  });

  assert.equal(advice.source, 'openai');
  assert.equal(advice.selectedMarket, 'R_25');
  assert.deepEqual(Object.keys(advice.structured).sort(), ['confidence', 'market', 'recommendation', 'risk_score', 'summary', 'warnings']);
  assert.match(request.url, /\/v1\/chat\/completions$/);
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.doesNotMatch(request.options.body, /test-key/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
});

test('hallucinated or unsafe model recommendation is rejected', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ output_text: JSON.stringify(modelPayload({ selectedMarket: 'R_100', saferAlternative: 'MADE_UP' })) }),
  });
  const advice = await getMarketAdvice(scanFixture(), {
    provider: 'openai', apiKey: 'test-key', fetchImpl, disableCache: true,
  });

  assert.equal(advice.source, 'deterministic_fallback');
  assert.equal(advice.selectedMarket, 'R_25');
});

test('missing AI config fails safely without fake AI success', async () => {
  const noKey = await getMarketAdvice(scanFixture(), { provider: '', apiKey: '' });
  assert.equal(noKey.source, 'ai_setup_required');
  assert.equal(noKey.setupRequired, true);
  assert.match(noKey.summary, /AI setup required/i);
  assert.equal(noKey.structured.recommendation, 'wait');

  const failed = await getMarketAdvice(scanFixture(), {
    provider: 'openai', apiKey: 'test-key', fetchImpl: async () => ({ ok: false, status: 429 }), disableCache: true,
  });
  assert.equal(failed.source, 'deterministic_fallback');
  assert.equal(failed.saferAlternative, 'R_25');
});

test('AI setup-required helper returns the public structured API shape', () => {
  const advice = aiSetupRequiredAdvice(scanFixture());
  assert.equal(advice.setupRequired, true);
  assert.deepEqual(Object.keys(advice.structured).sort(), ['confidence', 'market', 'recommendation', 'risk_score', 'summary', 'warnings']);
});
