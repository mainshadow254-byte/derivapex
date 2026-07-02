// PocketBase auth wrapper. The frontend uses PB ONLY to authenticate the user
// (signup/login/refresh/logout). It never reads protected collections directly —
// those are locked by PB rules and served via the backend.
const pb = new PocketBase(window.APEX.POCKETBASE_URL);
window.pb = pb;

function normalizeTelegramUsername(value = '') {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@+/, '')
    .split(/[/?#]/)[0]
    .trim()
    .slice(0, 64);
}

window.Auth = {
  get token() { return pb.authStore.token; },
  get isLoggedIn() { return pb.authStore.isValid; },

  async signup({ name, email, password, telegram }) {
    // 1. Create the user in PocketBase (name + email + password).
    const user = await pb.collection('users').create({
      name,
      email,
      password,
      passwordConfirm: password,
      telegram_username: normalizeTelegramUsername(telegram),
    });
    // 2. Log in to get a token.
    await pb.collection('users').authWithPassword(email, password);
    // 3. Ask backend to trigger PocketBase's real verification-token email
    // and store Telegram as pending only when supplied.
    const verification = await fetch(`${window.APEX.API_BASE}/auth/start-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
      },
      body: JSON.stringify({ userId: user.id, telegram: normalizeTelegramUsername(telegram) }),
    });
    if (!verification.ok) {
      const body = await verification.json().catch(() => ({}));
      const err = new Error(body?.error || 'Could not send verification email.');
      err.status = verification.status;
      err.body = body;
      throw err;
    }
    return user;
  },

  async login(email, password) {
    return pb.collection('users').authWithPassword(email, password);
  },

  async googleLogin() {
    const methods = await pb.collection('users').listAuthMethods();
    const providers = methods?.oauth2?.providers || [];
    const google = providers.find((provider) => provider.name === 'google');
    if (!methods?.oauth2?.enabled || !google) {
      const pbOrigin = String(window.APEX.POCKETBASE_URL || '').replace(/\/$/, '');
      const err = new Error(`Google sign-in is not configured in PocketBase yet. Add Google OAuth credentials in PocketBase and set this Google redirect URI: ${pbOrigin}/api/oauth2-redirect`);
      err.code = 'GOOGLE_OAUTH_NOT_CONFIGURED';
      err.redirectUri = `${pbOrigin}/api/oauth2-redirect`;
      throw err;
    }
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    const authUrl = new URL(google.authUrl || google.authURL);
    authUrl.searchParams.set('redirect_uri', redirectUrl);

    sessionStorage.setItem('apex_google_oauth', JSON.stringify({
      provider: 'google',
      state: google.state || '',
      codeVerifier: google.codeVerifier,
      redirectUrl,
    }));
    sessionStorage.setItem('apex_google_next', window.location.search || '');
    window.location.href = authUrl.toString();
    return new Promise(() => {});
  },

  async completeGoogleLogin() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const stored = JSON.parse(sessionStorage.getItem('apex_google_oauth') || '{}');
    if (!code || !stored.codeVerifier || !stored.redirectUrl) {
      throw new Error('Google sign-in session expired. Please try again.');
    }
    if (stored.state && state && stored.state !== state) {
      throw new Error('Google sign-in state mismatch. Please try again.');
    }

    const authData = await pb.collection('users').authWithOAuth2Code(
      stored.provider || 'google',
      code,
      stored.codeVerifier,
      stored.redirectUrl,
      { name: '' }
    );
    sessionStorage.removeItem('apex_google_oauth');
    const displayName = authData?.meta?.name || authData?.record?.name || pb.authStore.model?.name || '';
    return api('/auth/oauth-sync', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', displayName }),
    });
  },

  async requestReset(email) {
    const res = await fetch(`${window.APEX.API_BASE}/auth/request-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error || 'Could not request password reset.');
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  },

  logout() { pb.authStore.clear(); },
};

// Authenticated fetch to the backend — always sends the PB token; the BACKEND
// decides role/plan. The frontend never asserts its own permissions.
window.api = async function (path, opts = {}) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    opts.headers || {},
    pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}
  );
  const res = await fetch(`${window.APEX.API_BASE}${path}`, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status; err.body = body;
    throw err;
  }
  return body;
};
