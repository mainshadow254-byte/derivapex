// Central config. Reads secrets from environment ONLY. Never imported by frontend.
import 'dotenv/config';

// Read the FIRST defined / non-empty value among one or more env names.
// This lets us accept multiple naming conventions (compatibility aliases) so
// deployments using either name work without changing code.
function pick(names, fallback = undefined) {
  const list = Array.isArray(names) ? names : [names];
  for (const n of list) {
    const v = process.env[n];
    if (v !== undefined && v !== '') return v;
  }
  if (fallback === undefined) {
    console.warn(`[config] Missing env var: ${list.join(' | ')}`);
  }
  return fallback;
}

// Build a Resend "from" string. Prefers RESEND_FROM; otherwise composes it from
// RESEND_FROM_NAME + RESEND_FROM_EMAIL.
function resolveResendFrom() {
  const direct = pick('RESEND_FROM', '');
  if (direct) return direct;
  const email = pick('RESEND_FROM_EMAIL', '');
  const name = pick('RESEND_FROM_NAME', '');
  if (email && name) return `${name} <${email}>`;
  if (email) return email;
  return 'ApexBot <no-reply@example.com>';
}

// Telegram bot URL: prefer explicit URL, else derive from a username/handle.
function resolveTelegramBotUrl() {
  const url = pick('TELEGRAM_BOT_URL', '');
  if (url) return url;
  let uname = pick('TELEGRAM_BOT_USERNAME', '');
  if (!uname) return '';
  uname = uname.replace(/^@/, '').trim();
  return uname ? `https://t.me/${uname}` : '';
}

const derivAppId = pick('DERIV_APP_ID', '1089');
const defaultDerivAffiliateLink = 'https://track.deriv.com/_mOh_WtlcE0NMjdsyM5hasGNd7ZgqdRLk/1/';
const defaultDerivOAuthUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${encodeURIComponent(derivAppId)}`;
const aiProvider = pick('AI_PROVIDER', pick('OPENAI_API_KEY', '') ? 'openai' : '');
const aiApiKey = pick(['AI_API_KEY', 'OPENAI_API_KEY'], '');
const aiModel = pick(['AI_MODEL', 'OPENAI_MODEL'], 'gpt-5.4-mini');
const aiBaseUrl = pick(['AI_BASE_URL', 'OPENAI_BASE_URL'], 'https://api.openai.com/v1');
const aiEndpoint = pick('AI_ENDPOINT', '');
const aiTimeoutMs = Math.max(1_000, parseInt(pick(['AI_TIMEOUT_MS', 'OPENAI_TIMEOUT_MS'], '12000'), 10) || 12_000);
const aiCacheMs = Math.max(0, parseInt(pick(['AI_ADVISOR_CACHE_MS', 'OPENAI_ADVISOR_CACHE_MS'], '30000'), 10) || 30_000);
const hostingerFrontendUrl = pick('HOSTINGER_FRONTEND_URL', '');
const allowedOrigins = [
  ...pick('ALLOWED_ORIGINS', 'http://localhost:8000,http://127.0.0.1:8000,http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  hostingerFrontendUrl,
].filter(Boolean);

export const config = {
  nodeEnv: pick('NODE_ENV', 'development'),
  port: parseInt(pick('PORT', '8787'), 10),
  allowedOrigins,

  ownerEmail: (pick('OWNER_EMAIL', '') || '').toLowerCase().trim(),

  pb: {
    url: pick(['POCKETBASE_URL'], 'http://127.0.0.1:8090'),
    adminEmail: pick(['PB_ADMIN_EMAIL', 'POCKETBASE_ADMIN_EMAIL']),
    adminPassword: pick(['PB_ADMIN_PASSWORD', 'POCKETBASE_ADMIN_PASSWORD']),
  },

  resend: {
    apiKey: pick('RESEND_API_KEY'),
    from: resolveResendFrom(),
  },

  publicAppUrl: pick('PUBLIC_APP_URL', 'http://localhost:8000'),
  publicBackendUrl: pick(['PUBLIC_BACKEND_URL', 'RAILWAY_BACKEND_URL'], ''),

  deriv: {
    appId: derivAppId,
    oauthUrl: pick('DERIV_OAUTH_URL', defaultDerivOAuthUrl),
    oauthRedirect: pick('DERIV_OAUTH_REDIRECT', ''),
    // Public-safe affiliate/referral link used to guide users who don't yet have
    // a Deriv account to create one. NOT a secret — surfaced via public-config.
    affiliateLink: pick('DERIV_AFFILIATE_LINK', defaultDerivAffiliateLink),
    // Prefer an explicit base URL (DERIV_API_URL); else derive from the app id.
    wsUrl: pick('DERIV_API_URL', '')
      ? `${pick('DERIV_API_URL')}${pick('DERIV_API_URL').includes('app_id') ? '' : (pick('DERIV_API_URL').includes('?') ? '&' : '?') + 'app_id=' + derivAppId}`
      : `wss://ws.derivws.com/websockets/v3?app_id=${derivAppId}`,
  },

  payments: {
    webhookSecret: pick('PAYMENT_WEBHOOK_SECRET'),
    provider: pick('PAYMENT_PROVIDER', 'pluggable'),
  },

  telegram: {
    botToken: pick('TELEGRAM_BOT_TOKEN', ''),
    botUsername: (pick('TELEGRAM_BOT_USERNAME', '') || '').replace(/^@/, ''),
    communityUrl: pick(['TELEGRAM_CHANNEL_URL', 'TELEGRAM_COMMUNITY_URL', 'TELEGRAM_COMMUNITY_LINK'], ''),
    secondaryCommunityUrl: pick(['TELEGRAM_GROUP_URL', 'TELEGRAM_SECONDARY_COMMUNITY_URL'], ''),
    botUrl: resolveTelegramBotUrl(),
    webhookSecret: pick('TELEGRAM_WEBHOOK_SECRET', ''),
    usePolling: String(pick('TELEGRAM_USE_POLLING', 'false')).toLowerCase() === 'true',
    supportUrl: pick('TELEGRAM_SUPPORT_URL', ''),
    adminContact: pick('TELEGRAM_ADMIN_CONTACT', ''),
    adminId: (pick('TELEGRAM_ADMIN_ID', '') || '').trim(),
    requiredChannelId: pick('TELEGRAM_REQUIRED_CHANNEL_ID', ''),
    requiredGroupId: pick('TELEGRAM_REQUIRED_GROUP_ID', ''),
  },

  // Backend-only AI market commentary. The deterministic scanner remains the
  // source of truth; the model may only explain and rank supplied scan data.
  ai: {
    provider: aiProvider,
    apiKey: aiApiKey,
    model: aiModel,
    baseUrl: aiBaseUrl,
    endpoint: aiEndpoint,
    timeoutMs: aiTimeoutMs,
    cacheMs: aiCacheMs,
  },
  // Backward-compatible alias for older deployments that still use OPENAI_*.
  openai: {
    apiKey: aiApiKey,
    model: aiModel,
    baseUrl: aiBaseUrl,
    timeoutMs: aiTimeoutMs,
    cacheMs: aiCacheMs,
  },

  // Optional key used to encrypt sensitive at-rest tokens (e.g. Deriv token).
  // If unset, a key is derived from the PB admin password (still better than
  // plaintext) — set TOKEN_ENC_KEY explicitly in production.
  tokenEncKey: pick('TOKEN_ENC_KEY', ''),
};

function isLoopbackUrl(value) {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function validateRuntimeConfig(runtime = config) {
  if (runtime.nodeEnv !== 'production') return;

  const errors = [];
  if (!runtime.tokenEncKey) errors.push('TOKEN_ENC_KEY is required in production.');
  if (!runtime.pb.url || isLoopbackUrl(runtime.pb.url)) {
    errors.push('POCKETBASE_URL must be a reachable production URL, not localhost.');
  }
  if (!runtime.pb.adminEmail || !runtime.pb.adminPassword) {
    errors.push('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required in production.');
  }
  if (errors.length) throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);

  if (runtime.telegram.botToken && !runtime.telegram.usePolling && !runtime.publicBackendUrl) {
    console.warn('[config] Telegram webhook disabled: PUBLIC_BACKEND_URL is required when TELEGRAM_USE_POLLING=false.');
  }
  if (runtime.telegram.botToken && !runtime.telegram.usePolling && !runtime.telegram.webhookSecret) {
    console.warn('[config] TELEGRAM_WEBHOOK_SECRET is recommended to authenticate Telegram webhook requests.');
  }
  if (!runtime.ai.apiKey) console.warn('[config] AI scanner disabled: AI_API_KEY is not configured.');
}

// Subscription plans live in the project already ($10/$20/$30/$50).
// Source of truth is PocketBase `plans` collection; this is the seed/fallback.
export const PLAN_TIERS = {
  free: { rank: 0, label: 'Free / Demo', price: 0 },
  starter: { rank: 1, label: 'Starter', price: 10 },
  standard: { rank: 2, label: 'Standard', price: 20 },
  premium: { rank: 3, label: 'Premium', price: 30 },
  elite: { rank: 4, label: 'Elite', price: 50 },
};

// Feature gates by minimum plan rank. Enforced on the BACKEND only.
export const FEATURE_MIN_RANK = {
  demo_scanner: 0,
  demo_trade: 0,
  live_market_data: 0, // public data ok
  charting_terminal: 0, // charts + indicators are available to everyone
  watchlists: 0,
  notifications: 0,
  device_management: 0,
  marketplace_browse: 0,
  user_analytics: 0,
  real_scanner: 1,
  copy_trading: 2,      // follow/copy strategies
  copy_publish: 2,      // publish your own strategy
  bot_import: 2,
  marketplace_publish: 2,
  real_trading: 3,
  priority_alerts: 4,
};

// Supported chart timeframes (granularity in seconds). Future-proof: the chart
// terminal reads this list, so adding a timeframe needs no UI changes elsewhere.
export const CHART_GRANULARITIES = [
  { value: 0, label: 'Tick' },          // tick stream (no aggregation)
  { value: 60, label: '1 Minute' },
  { value: 300, label: '5 Minutes' },
  { value: 900, label: '15 Minutes' },
  { value: 1800, label: '30 Minutes' },
  { value: 3600, label: '1 Hour' },
  { value: 14400, label: '4 Hours' },
  { value: 86400, label: 'Daily' },
];
export const ALLOWED_GRANULARITIES = new Set(CHART_GRANULARITIES.map((g) => g.value).filter(Boolean));
