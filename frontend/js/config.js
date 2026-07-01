// PUBLIC frontend config. Contains NO secrets, NO admin emails, NO API keys.
// Everything sensitive lives on the backend. The only values here are public
// endpoints the browser legitimately needs.
const apexConfig = window.APEX_CONFIG || {};
const apexIsLocal = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
const apexRuntimeHost = window.location.hostname;
const apexRuntimeProtocol = apexIsLocal ? 'http:' : window.location.protocol;

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function normalizeApiBase(value) {
  const base = normalizeBaseUrl(value);
  return base && !base.endsWith('/api') ? `${base}/api` : base;
}

function publicConfigFallback() {
  return {
    derivAppId: '1089',
    derivOAuthAppId: '',
    derivOAuthReady: false,
    derivOAuthIssue: 'Backend public config is unavailable. Deriv OAuth is disabled until the backend is reachable; API-token fallback remains available.',
    derivOAuthUrl: '',
    derivOAuthRedirect: `${window.APEX.PUBLIC_APP_URL}/deriv-callback.html`,
    derivAffiliateLink: 'https://deriv.com/signup/',
    telegram: {},
    degraded: true,
  };
}

const apexApiBase = normalizeApiBase(window.APEX_API_BASE_URL
  || window.APEX_API_BASE
  || apexConfig.API_BASE_URL
  || apexConfig.API_BASE
  || (apexIsLocal ? `${apexRuntimeProtocol}//${apexRuntimeHost}:8787/api` : `${window.location.origin}/api`));
const apexPocketBaseUrl = normalizeBaseUrl(window.APEX_POCKETBASE_URL
  || apexConfig.POCKETBASE_URL
  || (apexIsLocal ? `${apexRuntimeProtocol}//${apexRuntimeHost}:8090` : window.location.origin));
const apexPublicAppUrl = normalizeBaseUrl(apexConfig.PUBLIC_APP_URL || window.location.origin);

window.APEX = {
  // Your backend (Node) base URL. All sensitive logic goes through here.
  API_BASE: apexApiBase,

  // PocketBase URL — used ONLY for user auth (login/signup/refresh).
  POCKETBASE_URL: apexPocketBaseUrl,

  PUBLIC_APP_URL: apexPublicAppUrl,
  DERIV_CALLBACK_URL: apexConfig.DERIV_CALLBACK_URL || `${apexPublicAppUrl}/deriv-callback.html`,

  // Filled at runtime from GET /api/public-config (deriv app id + telegram links).
  // Do not hardcode the owner email or any key here.
  public: null,
};

// Load public config (safe, non-secret) once.
window.loadPublicConfig = async function () {
  if (window.APEX.public) return window.APEX.public;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const r = await fetch(`${window.APEX.API_BASE}/public-config`, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`Public config unavailable (${r.status})`);
    const data = await r.json();
    window.APEX.public = {
      ...publicConfigFallback(),
      ...data,
      telegram: data.telegram || {},
      degraded: false,
    };
  } catch (error) {
    console.warn('[apex-config] Falling back to local public config:', error?.message || error);
    window.APEX.public = publicConfigFallback();
  }
  return window.APEX.public;
};
