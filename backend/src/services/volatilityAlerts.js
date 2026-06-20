import { notify } from './notifications.js';

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const lastAlertAt = new Map();

export async function notifyVolatilityAlerts({
  userId,
  scan,
  notifyFn = notify,
  now = Date.now(),
  cooldownMs = DEFAULT_COOLDOWN_MS,
}) {
  if (!userId) return 0;
  const volatileMarkets = (scan?.volatileMarkets || []).slice(0, 3);
  const alternative = scan?.saferAlternative || null;
  let sent = 0;

  for (const market of volatileMarkets) {
    const key = `${userId}:${market.symbol}`;
    const previous = lastAlertAt.get(key);
    if (previous !== undefined && now - previous < cooldownMs) continue;
    lastAlertAt.set(key, now);
    await notifyFn({
      userId,
      type: 'volatility',
      severity: 'warning',
      title: `High volatility: ${market.symbol}`,
      body: `${market.symbol} is currently high risk at ${market.volatility}% measured volatility. ${alternative ? `${alternative.symbol} currently passes the lower-risk safety checks.` : 'No tracked market currently passes the alternative safety checks; consider waiting.'}`,
      meta: {
        symbol: market.symbol,
        volatility: market.volatility,
        riskLevel: market.riskLevel,
        saferAlternative: alternative?.symbol || null,
        generatedAt: scan.generatedAt,
      },
    });
    sent += 1;
  }

  if (lastAlertAt.size > 10_000) {
    const staleBefore = now - cooldownMs;
    for (const [key, timestamp] of lastAlertAt) {
      if (timestamp < staleBefore) lastAlertAt.delete(key);
    }
  }
  return sent;
}

export function clearVolatilityAlertCooldowns() {
  lastAlertAt.clear();
}
