import { config } from '../config.js';

const DISCLAIMER = 'Market analysis is probabilistic, not financial advice. No market is risk-free and no outcome is guaranteed.';
const FORBIDDEN_CLAIMS = /\b(guaranteed? profits?|risk[- ]?free profits?|sure win|cannot lose|100% (?:safe|certain)|safe profit)\b/i;
const cache = new Map();

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', maxLength: 500 },
    marketState: { type: 'string', enum: ['calm', 'mixed', 'volatile', 'no_data'] },
    action: { type: 'string', enum: ['consider', 'wait', 'avoid'] },
    selectedMarket: { type: ['string', 'null'] },
    volatileMarket: { type: ['string', 'null'] },
    saferAlternative: { type: ['string', 'null'] },
    rationale: { type: 'array', items: { type: 'string', maxLength: 240 }, maxItems: 4 },
    warning: { type: 'string', maxLength: 400 },
    disclaimer: { type: 'string', maxLength: 300 },
  },
  required: ['summary', 'marketState', 'action', 'selectedMarket', 'volatileMarket', 'saferAlternative', 'rationale', 'warning', 'disclaimer'],
};

function marketSnapshot(scan) {
  return (scan.markets || []).slice(0, 12).map((market) => ({
    marketName: market.marketName,
    symbol: market.symbol,
    category: market.category,
    dataSourceLabel: market.dataSourceLabel,
    setup: market.setup,
    noTrade: !!market.noTrade,
    direction: market.direction,
    rawDirection: market.rawDirection,
    confidence: market.confidence,
    riskScore: market.riskScore,
    riskLevel: market.riskLevel,
    volatilityWarning: market.volatilityWarning,
    volatility: market.volatility,
    momentum: market.momentum,
    trend: market.trend,
    safe: market.safe,
    reason: market.reason,
    invalidation: market.invalidation,
  }));
}

function structuredFromAdvice(advice) {
  const actionMap = { consider: 'consider_entry', wait: 'wait', avoid: 'avoid_market' };
  const riskScore = advice.marketState === 'volatile' ? 80 : advice.marketState === 'mixed' ? 55 : advice.marketState === 'calm' ? 25 : 0;
  return {
    market: advice.selectedMarket || advice.saferAlternative || advice.volatileMarket || null,
    summary: advice.summary,
    confidence: advice.selectedMarket ? 70 : 0,
    risk_score: riskScore,
    recommendation: actionMap[advice.action] || 'wait',
    warnings: [advice.warning, advice.disclaimer].filter(Boolean),
  };
}

export function aiSetupRequiredAdvice(scan, reason = 'AI setup required') {
  const base = deterministicAdvice(scan, 'ai_setup_required');
  const summary = 'AI setup required. Add AI_PROVIDER, AI_API_KEY, and AI_MODEL in the backend environment to enable real AI market analysis.';
  const advice = {
    ...base,
    setupRequired: true,
    model: null,
    analysisLabel: 'AI setup required',
    summary,
    action: 'wait',
    warning: reason,
  };
  return { ...advice, structured: structuredFromAdvice(advice) };
}

export function deterministicAdvice(scan, source = 'deterministic') {
  const markets = scan.markets || [];
  const best = scan.best || null;
  const safeMarkets = markets.filter((market) => market.safe && market.riskLevel !== 'high');
  const volatileMarket = scan.volatileMarkets?.[0] || null;
  const unsafeFocus = volatileMarket || (best && (!best.safe || best.riskLevel === 'high') ? best : null);
  const alternative = scan.saferAlternative || (unsafeFocus ? safeMarkets[0] : null);

  if (!best) {
    const advice = {
      source,
      model: null,
      analysisLabel: 'Rules-based live analysis',
      dataSourceLabel: scan.dataSourceLabel || 'Live Deriv Data',
      summary: 'Live markets are still warming up. Wait for enough real tick data before making an entry decision.',
      marketState: 'no_data',
      action: 'wait',
      selectedMarket: null,
      volatileMarket: null,
      saferAlternative: null,
      rationale: ['The scanner does not have enough live observations to calculate a reliable volatility and trend profile.'],
      warning: 'Do not enter based on incomplete market data.',
      disclaimer: DISCLAIMER,
    };
    return { ...advice, structured: structuredFromAdvice(advice) };
  }

  const bestUnsafe = !best.safe || best.riskLevel === 'high';
  const selected = bestUnsafe ? alternative : best;
  const advice = {
    source,
    model: null,
    analysisLabel: source === 'deterministic' ? 'Rules-based live analysis' : 'Rules-based live analysis fallback',
    dataSourceLabel: scan.dataSourceLabel || 'Live Deriv Data',
    summary: unsafeFocus
      ? `${unsafeFocus.symbol} is not suitable for a new entry now. ${alternative ? `${alternative.symbol} currently has the cleaner lower-risk setup.` : 'No tracked market currently passes the safety checks.'}`
      : `${best.symbol} currently has the clearest setup, with ${best.riskLevel} measured volatility and ${best.confidence}% conservative confidence.`,
    marketState: volatileMarket ? 'volatile' : bestUnsafe ? 'mixed' : 'calm',
    action: selected ? 'consider' : unsafeFocus ? 'avoid' : 'wait',
    selectedMarket: selected && !selected.noTrade ? selected.symbol : null,
    volatileMarket: unsafeFocus?.symbol || null,
    saferAlternative: unsafeFocus ? alternative?.symbol || null : null,
    rationale: [
      `Top scan: ${best.symbol}, ${best.direction}, risk score ${best.riskScore}/100, ${best.riskLevel} risk, ${best.volatility}% volatility.`,
      unsafeFocus
        ? (alternative
          ? `${alternative.symbol} passes the deterministic safety gate at ${alternative.confidence}% confidence.`
          : 'No market passes both the direction and volatility safety gates.')
        : `${best.symbol} passes both the direction and volatility safety gates.`,
    ],
    warning: unsafeFocus
      ? `Avoid a new ${unsafeFocus.symbol} entry until volatility and direction conditions improve.`
      : 'Conditions can change quickly. Recheck the live scan immediately before any entry.',
    disclaimer: DISCLAIMER,
  };
  return { ...advice, structured: structuredFromAdvice(advice) };
}

function readOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chatContent = payload?.choices?.[0]?.message?.content;
  if (typeof chatContent === 'string') return chatContent;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function chatCompletionsUrl(baseUrl, explicitEndpoint = '') {
  if (explicitEndpoint) return explicitEndpoint;
  const base = String(baseUrl || '').replace(/\/$/, '');
  return `${base}${base.endsWith('/v1') ? '' : '/v1'}/chat/completions`;
}

function validateAdvice(candidate, scan) {
  if (!candidate || typeof candidate !== 'object' || FORBIDDEN_CLAIMS.test(JSON.stringify(candidate))) return null;

  const markets = scan.markets || [];
  const bySymbol = new Map(markets.map((market) => [market.symbol, market]));
  const safeSymbols = new Set(markets.filter((market) => market.safe && market.riskLevel !== 'high').map((market) => market.symbol));
  const validSymbol = (symbol) => symbol === null || bySymbol.has(symbol);
  if (!validSymbol(candidate.selectedMarket) || !validSymbol(candidate.volatileMarket) || !validSymbol(candidate.saferAlternative)) return null;
  if (candidate.selectedMarket && !safeSymbols.has(candidate.selectedMarket)) return null;
  if (candidate.saferAlternative && !safeSymbols.has(candidate.saferAlternative)) return null;

  const unsafeFocus = scan.volatileMarkets?.[0] || (scan.best && (!scan.best.safe || scan.best.riskLevel === 'high') ? scan.best : null);
  if (unsafeFocus && candidate.volatileMarket !== unsafeFocus.symbol) return null;
  if (unsafeFocus && candidate.action === 'consider' && !candidate.selectedMarket) return null;

  return {
    ...candidate,
    rationale: Array.isArray(candidate.rationale) ? candidate.rationale.slice(0, 4) : [],
    disclaimer: DISCLAIMER,
  };
}

function cacheKey(scan) {
  return JSON.stringify(marketSnapshot(scan).map(({ symbol, direction, confidence, riskLevel, volatility, safe }) => ({
    symbol, direction, confidence, riskLevel, volatility, safe,
  })));
}

export async function getMarketAdvice(scan, options = {}) {
  const provider = (options.provider ?? config.ai.provider ?? '').toLowerCase();
  const apiKey = options.apiKey ?? config.ai.apiKey;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!provider || !apiKey) return aiSetupRequiredAdvice(scan);
  if (provider !== 'openai') return aiSetupRequiredAdvice(scan, `Unsupported AI_PROVIDER "${provider}". Use "openai" or update the backend AI service.`);
  if (typeof fetchImpl !== 'function') return aiSetupRequiredAdvice(scan, 'Backend fetch is unavailable for AI requests.');

  const key = cacheKey(scan);
  const now = Date.now();
  const cached = cache.get(key);
  if (!options.disableCache && cached && cached.expiresAt > now) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? config.ai.timeoutMs);
  try {
    const response = await fetchImpl(chatCompletionsUrl(config.ai.baseUrl, config.ai.endpoint), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model ?? config.ai.model,
        messages: [{ role: 'system', content: [
          'You are ApexBot Market Advisor. Analyze only the supplied deterministic live-market snapshot.',
          'Never invent prices, symbols, news, certainty, or guarantees. Never recommend a market marked unsafe or high risk.',
          'If the top market is unsafe, warn clearly and choose a saferAlternative only from a supplied market where safe=true.',
          'If no supplied market is safe, tell the user to wait. Do not provide trading execution instructions or position sizing.',
          'Keep the explanation concise and state that conditions can change.',
        ].join(' ') }, { role: 'user', content: JSON.stringify({
          deterministicWarning: scan.warning || null,
          topMarket: scan.best?.symbol || null,
          markets: marketSnapshot(scan),
        }) }],
        response_format: {
            type: 'json_schema',
            json_schema: { name: 'market_advice', strict: true, schema: responseSchema },
        },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);

    const payload = await response.json();
    const validated = validateAdvice(JSON.parse(readOutputText(payload)), scan);
    if (!validated) throw new Error('OpenAI response did not pass the deterministic safety gate');

    const value = {
      ...validated,
      source: 'openai',
      model: options.model ?? config.ai.model,
      analysisLabel: 'OpenAI explanation of validated live metrics',
      dataSourceLabel: scan.dataSourceLabel || 'Live Deriv Data',
    };
    const structuredValue = { ...value, structured: structuredFromAdvice(value) };
    cache.set(key, { value: structuredValue, expiresAt: now + config.ai.cacheMs });
    return structuredValue;
  } catch (error) {
    console.warn(`[ai-advisor] ${error.name === 'AbortError' ? 'request timed out' : error.message}; using deterministic fallback`);
    return deterministicAdvice(scan, 'deterministic_fallback');
  } finally {
    clearTimeout(timer);
  }
}

export const _test = { validateAdvice, readOutputText, responseSchema, chatCompletionsUrl };
