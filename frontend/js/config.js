// PUBLIC frontend config. Contains NO secrets, NO admin emails, NO API keys.
// Everything sensitive lives on the backend. The only values here are public
// endpoints the browser legitimately needs.
const apexConfig = window.APEX_CONFIG || {};
const apexIsLocal = ['127.0.0.1', 'localhost'].includes(window.location.hostname);
const apexRuntimeHost = apexIsLocal ? window.location.hostname : window.location.hostname;
const apexRuntimeProtocol = apexIsLocal ? 'http:' : window.location.protocol;
function normalizeApiBase(value) {
  const base = String(value || '').trim().replace(/\/$/, '');
  return base && !base.endsWith('/api') ? `${base}/api` : base;
}
const apexApiBase = normalizeApiBase(window.APEX_API_BASE_URL
  || window.APEX_API_BASE
  || apexConfig.API_BASE_URL
  || apexConfig.API_BASE
  || (apexIsLocal ? `${apexRuntimeProtocol}//${apexRuntimeHost}:8787/api` : `${window.location.origin}/api`));
const apexPocketBaseUrl = window.APEX_POCKETBASE_URL
  || apexConfig.POCKETBASE_URL
  || (apexIsLocal ? `${apexRuntimeProtocol}//${apexRuntimeHost}:8090` : window.location.origin);
const apexPublicAppUrl = String(apexConfig.PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');

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
    const r = await fetch(`${window.APEX.API_BASE}/public-config`);
    window.APEX.public = await r.json();
  } catch {
    window.APEX.public = { derivAppId: "1089", telegram: {} };
  }
  return window.APEX.public;
};
