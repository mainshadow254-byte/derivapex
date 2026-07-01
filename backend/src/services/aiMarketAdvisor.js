import { config } from '../config.js';

const DISCLAIMER = 'Market analysis is probabilistic, not financial advice. No market is risk-free and no outcome is guaranteed.';
const FORBIDDEN_CLAIMS = /\b(guaranteed? profits?|risk[- ]?free profits?|sure win|cannot lose|100% (?:safe|certain)|safe profit)\b/i;
const cache = new Map();

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', maxLength: 700 },
    marketState: { type: 'string', enum: ['calm', 'mixed', 'volatile', 'no_data'] },
    action: { type: 'string', enum: ['consider', 'wait', 'avoid'] },
    selectedMarket: { type: ['string', 'null'] },
    volatileMarket: { type: ['string', 'null'] },
    saferAlternative: { type: ['string', 'null'] },
    rationale: { type: 'array', items: { type: 'string', maxLength: 260 }, maxItems: 5 },
    indicatorSummary: { type: 'array', items: { type: 'string', maxLength: 220 }, maxItems: 6 },
    warning: { type: 'string', maxLength: 500 },
    disclaimer: { type: 'string', maxLength: 300 },
  },
  required: ['summary', 'marketState', 'action', 'selectedMarket', 'volatileMarket', 'saferAlternative', 'rationale', 'indicatorSummary', 'warning', 'disclaimer'],
};

function marketSnapshot(scan) {
  return (scan.markets || []).slice(0, 16).map((market) => ({
    marketName: market.marketName,
    symbol: market.symbol,
    category: market.category,
    dataSourceLabel: market.dataSourceLabel,
    setup: market.setup,
    noTrade: !!market.noTrade,
    direction: market.direction,
    rawDirection: market.rawDirection,
    confidence: market.confidence,
    safetyScore: market.safetyScore,
    riskScore: market.riskScore,
    riskLevel: market.riskLevel,
    volatilityWarning: market.volatilityWarning,
    volatility: market.volatility,
    atrLikePct: market.atrLikePct,
    momentum: market.momentum,
    trend: market.trend,
    confluence: market.confluence,
    indicators: market.indicators,
    safe: market.safe,
    rejectionReason: market.rejectionReason,
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
    indicators: advice.indicatorSummary || [],
    warnings: [advice.warning, advice.disclaimer].filter(Boolean),
  };
}

export function aiSetupRequiredAdvice(scan, reason = 'AI setup required') {
  const base = deterministicAdvice(scan, 'ai_setup_required');
  const summary = 'AI setup required. Add AI_PROVIDER, AI_API_KEY, and AI_MODEL in the backend environment to enable OpenAI explanations on top of the multi-indicator live scanner.';
  const advice = { ...base, setupRequired: true, model: null, analysisLabel: 'AI setup required', summary, action: 'wait', warning: reason };
  return { ...advice, structured: structuredFromAdvice(advice) };
}

export function deterministicAdvice(scan, source = 'deterministic') {
  const markets = scan.markets || [];
  const best = scan.best || null;
  const safeMarkets = scan.safeCandidates || markets.filter((market) => market.safe && market.riskLevel !== 'high');
  const volatileMarket = scan.volatileMarkets?.[0] || null;
  const unsafeFocus = volatileMarket || (best && (!best.safe || best.riskLevel === 'high') ? best : null);
  const alternative = scan.saferAlternative || (unsafeFocus ? safeMarkets[0] : null);

  if (!best) {
    const advice = {
      source, model: null, analysisLabel: 'Multi-indicator rules-based analysis', dataSourceLabel: scan.dataSourceLabel || 'Live Deriv Data',
      summary: 'Live markets are still warming up. Wait for enough real tick data before making an entry decision.',
      marketState: 'no_data', action: 'wait', selectedMarket: null, volatileMarket: null, saferAlternative: null,
      rationale: ['The scanner does not have enough live observations to calculate EMA, MACD, RSI, Bollinger, stochastic, support/resistance, volatility and confluence safely.'],
      indicatorSummary: [], warning: 'Do not enter based on incomplete market data.', disclaimer: DISCLAIMER,
    };
    return { ...advice, structured: structuredFromAdvice(advice) };
  }

  const selected = best.safe && best.riskLevel !== 'high' ? best : alternative;
  const state = unsafeFocus ? 'volatile' : selected ? 'calm' : 'mixed';
  const advice = {
    source,
    model: null,
    analysisLabel: source === 'deterministic' ? 'Multi-indicator rules-based analysis' : 'Multi-indicator rules-based fallback',
    dataSourceLabel: scan.dataSourceLabel || 'Live Deriv Data',
    summary: unsafeFocus
      ? `${unsafeFocus.symbol} is not suitable for a new live entry now. ${alternative ? `${alternative.symbol} is the safer alternative because its indicator confluence and volatility profile are cleaner.` : 'No tracked market currently passes the safety checks.'}`
      : `${selected?.symbol || best.symbol} currently has the clearest safer setup with ${selected?.riskLevel || best.riskLevel} measured risk and ${selected?.confidence || best.confidence}% conservative confidence.`,
    marketState: state,
    action: selected && !selected.noTrade ? 'consider' : unsafeFocus ? 'avoid' : 'wait',
    selectedMarket: selected && !selected.noTrade ? selected.symbol : null,
    volatileMarket: unsafeFocus?.symbol || null,
    saferAlternative: unsafeFocus ? alternative?.symbol || null : null,
    rationale: [
      `Top scan: ${best.symbol}, ${best.direction}, confidence ${best.confidence}%, risk score ${best.riskScore}/100, safety score ${best.safetyScore ?? 'n/a'}.`,
      unsafeFocus ? `Unsafe focus: ${unsafeFocus.symbol}. ${unsafeFocus.rejectionReason || 'It failed the safety gate.'}` : `${best.symbol} passed the safety gate.`,
      alternative ? `Safer alternative: ${alternative.symbol}, ${alternative.confidence}% confidence, ${alternative.riskLevel} risk, MACD/EMA/momentum confluence reviewed.` : 'No safer alternative currently passes all gates.',
    ],
    indicatorSummary: selected?.confluence?.notes || best.confluence?.notes || [],
    warning: unsafeFocus ? `Avoid ${unsafeFocus.symbol} now; use ${alternative?.symbol || 'wait'} instead until volatility and confluence improve.` : 'Conditions can change quickly. Recheck the live scan immediately before any entry.',
    disclaimer: DISCLAIMER,
  };
  return { ...advice, structured: structuredFromAdvice(advice) };
}

function readOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chatContent = payload?.choices?.[0]?.message?.content;
  if (typeof chatContent === 'string') return chatContent;
  for (const item of payload?.output || []) for (const content of item?.content || []) if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
  return '';
}
function chatCompletionsUrl(baseUrl, explicitEndpoint = '') { if (explicitEndpoint) return explicitEndpoint; const base = String(baseUrl || '').replace(/\/$/, ''); return `${base}${base.endsWith('/v1') ? '' : '/v1'}/chat/completions`; }

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
  return { ...candidate, rationale: Array.isArray(candidate.rationale) ? candidate.rationale.slice(0, 5) : [], indicatorSummary: Array.isArray(candidate.indicatorSummary) ? candidate.indicatorSummary.slice(0, 6) : [], disclaimer: DISCLAIMER };
}
function cacheKey(scan) { return JSON.stringify(marketSnapshot(scan).map(({ symbol, direction, confidence, riskLevel, riskScore, safetyScore, safe }) => ({ symbol, direction, confidence, riskLevel, riskScore, safetyScore, safe }))); }

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
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model ?? config.ai.model,
        messages: [{ role: 'system', content: [
          'You are ApexBot Market Advisor for Deriv synthetic markets.',
          'Analyze only the supplied live-market snapshot and supplied indicators: EMA/SMA, MACD, RSI, Bollinger, stochastic, volatility, support/resistance, confluence, risk score and safety score.',
          'Never invent prices, symbols, news, certainty, guarantees, win rates, or unsupported indicators.',
          'Never recommend a market marked unsafe, noTrade=true, or riskLevel=high. If the live trader is focused on a volatile market, warn immediately and choose saferAlternative only from supplied safe=true markets.',
          'If no supplied market is safe, tell the user to wait. Do not provide trading execution instructions, position sizing, or profit promises.',
          'Explain why the selected market is safer using indicator confluence and why the volatile market is unsafe.',
        ].join(' ') }, { role: 'user', content: JSON.stringify({
          deterministicWarning: scan.warning || null,
          topMarket: scan.best?.symbol || null,
          saferAlternative: scan.saferAlternative?.symbol || null,
          volatileMarkets: (scan.volatileMarkets || []).slice(0, 3).map((m) => ({ symbol: m.symbol, riskScore: m.riskScore, volatility: m.volatility, rejectionReason: m.rejectionReason })),
          markets: marketSnapshot(scan),
        }) }],
        response_format: { type: 'json_schema', json_schema: { name: 'market_advice', strict: true, schema: responseSchema } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
    const payload = await response.json();
    const validated = validateAdvice(JSON.parse(readOutputText(payload)), scan);
    if (!validated) throw new Error('OpenAI response did not pass the deterministic safety gate');
    const value = { ...validated, source: 'openai', model: options.model ?? config.ai.model, analysisLabel: 'OpenAI explanation of validated multi-indicator live metrics', dataSourceLabel: scan.dataSourceLabel || 'Live Deriv Data' };
    const structuredValue = { ...value, structured: structuredFromAdvice(value) };
    cache.set(key, { value: structuredValue, expiresAt: now + config.ai.cacheMs });
    return structuredValue;
  } catch (error) {
    console.warn(`[ai-advisor] ${error.name === 'AbortError' ? 'request timed out' : error.message}; using deterministic fallback`);
    return deterministicAdvice(scan, 'deterministic_fallback');
  } finally { clearTimeout(timer); }
}

export const _test = { validateAdvice, readOutputText, responseSchema, chatCompletionsUrl };
