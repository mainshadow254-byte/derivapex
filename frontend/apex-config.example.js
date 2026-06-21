// Copy to apex-config.js on Hostinger and load it before js/config.js.
// Public endpoints only. Do not put API keys, admin emails, or passwords here.
window.APEX_CONFIG = {
  API_BASE_URL: 'https://your-railway-backend.up.railway.app',
  POCKETBASE_URL: 'https://your-pocketbase-domain.example.com',
  PUBLIC_APP_URL: 'https://your-frontend-domain.example.com',
  DERIV_CALLBACK_URL: 'https://your-frontend-domain.example.com/deriv-callback.html',
};
