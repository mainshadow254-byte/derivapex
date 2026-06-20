# Deployment

## 0. Prerequisites
- Node.js 20+
- A PocketBase binary (https://pocketbase.io)
- Accounts: Resend (verified sending domain), Deriv (registered app_id), your
  payment processor, a Telegram bot.

## Package hygiene
Before creating a deployment ZIP, include source files and `backend/.env.example` only. Do not include:

- `backend/.env` or any real `.env` file
- `node_modules`
- `*.log` files
- `pb_data`
- temporary test output, coverage, or local cache folders

The project includes `.gitignore` and `.zipignore` rules for these files. Keep production secrets in the deployment environment, not in the ZIP.

## 1. PocketBase
```bash
./pocketbase serve            # http://127.0.0.1:8090/_/  -> create superuser
```
Apply all migrations in `pocketbase/pb_migrations` (recommended), including
`1781913000_apexbot_schema.js`, `1781915000_add_business_autodates.js`, and
`1781917000_add_subscription_current_period_end.js`; see `pocketbase/SETUP.md`.
Do not use browser import for the local setup. Seed the `plans`
rows ($0/$10/$20/$30/$50).

> The schema now includes the workspace/marketplace/notification/device
> collections (`trades`, `strategies`, `copy_follows`, `marketplace_listings`,
> `bot_reviews`, `bot_installs`, `notifications`, `notification_prefs`, `devices`,
> `watchlists`). Create all of them with **null** rules — only the backend writes
> them, which is what keeps every statistic real. The `trades` collection is the
> single source of truth for all P/L, positions, history and performance graphs;
> your bot/copy execution worker should append filled trades here.

## 2. Backend
```bash
cd backend
cp .env.example .env          # fill EVERY value (owner, PB creds, Resend, Deriv, payment, telegram)
npm install
npm start                     # serves API on :8787, connects live Deriv feed
```
Verify:
```bash
curl localhost:8787/api/health          # {"ok":true}
curl localhost:8787/api/public-config   # deriv app id + telegram links (no secrets)
```

For Railway production set:
```dotenv
PUBLIC_BACKEND_URL=https://your-railway-backend.up.railway.app
HOSTINGER_FRONTEND_URL=https://your-hostinger-frontend-domain.com
ALLOWED_ORIGINS=https://your-hostinger-frontend-domain.com
POCKETBASE_URL=https://your-pocketbase-domain.example.com
DERIV_APP_ID=1089
DERIV_OAUTH_URL=https://oauth.deriv.com/oauth2/authorize?app_id=1089
DERIV_OAUTH_REDIRECT=https://your-hostinger-frontend-domain.com/deriv-callback.html
```

## 3. Frontend
Local development auto-matches the current host:
- `http://127.0.0.1:8000` calls `http://127.0.0.1:8787/api`
- `http://localhost:8000` calls `http://localhost:8787/api`

For Hostinger, copy `frontend/apex-config.example.js` to `frontend/apex-config.js`, set public endpoints, and load it before `js/config.js`:
```js
window.APEX_CONFIG = {
  API_BASE_URL: "https://your-railway-backend.up.railway.app/api",
  POCKETBASE_URL: "https://your-pocketbase-domain.example.com",
};
```
Serve the static files (any static host / CDN):
```bash
cd frontend && python3 -m http.server 8000
```
Set `ALLOWED_ORIGINS` in the backend `.env` to your frontend origin(s).

## 4. Make yourself the owner
Set `OWNER_EMAIL` to the email you sign up with. On login the backend reports
`role: "owner"`. Only this account can create/enable/remove admins.

## 5. Payment webhook (provider-agnostic)
Point your processor's webhook at `POST /api/payments/webhook`. Send an
`x-apexbot-signature` header = HMAC-SHA256 of the raw body using
`PAYMENT_WEBHOOK_SECRET`, with a normalized body:
```json
{ "type":"payment.succeeded", "email":"buyer@x.com", "plan":"premium", "periodDays":30, "paymentRef":"..." }
```
Write a small adapter that converts Stripe/crypto events into this shape and signs
them. Subscriptions activate ONLY through this verified path (or audited
`POST /api/payments/manual-activate` by an admin).

## 6. Telegram bot runtime
Telegram is optional and never blocks normal dashboard access.

Local development can use polling:
```dotenv
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=Apexrebornbot
TELEGRAM_USE_POLLING=true
```
Then start the backend normally with `npm start`.

Railway production should use webhook mode:
```dotenv
TELEGRAM_USE_POLLING=false
PUBLIC_BACKEND_URL=https://your-railway-backend.up.railway.app
```
Webhook URL:
```text
https://your-railway-backend.up.railway.app/api/telegram/webhook
```
Set it from Railway shell or locally with production env loaded:
```bash
npm run telegram:set-webhook
```
The bot supports `/start`, `/verify`, `/help`, `/commands`, `/status`,
`/community`, `/support`, `/alerts`, `/unlink`, and `/privacy`. If
`TELEGRAM_REQUIRED_CHANNEL_ID` or `TELEGRAM_REQUIRED_GROUP_ID` is configured, the
bot asks users to join before marking Telegram verified. If those IDs are empty,
Telegram linking still works and community links are optional.

## 7. Real trading (Deriv)
Add a Deriv OAuth connect flow (`/deriv-callback.html`) that stores the user's
token in `users.deriv_token` via the backend (encrypt at rest). Real trades then
go through `POST /api/trading/real-trade`, gated by the `real_trading` plan.

> Implemented: `deriv-callback.html` + `POST /api/deriv/connect` (verifies the
> token against Deriv, stores it AES-256-GCM encrypted, sets `deriv_connected`).
> Set `DERIV_APP_ID`, `DERIV_OAUTH_URL` (default:
> `https://oauth.deriv.com/oauth2/authorize?app_id=1089`),
> `DERIV_OAUTH_REDIRECT` (must equal the redirect URI in your Deriv app, pointing
> at `/deriv-callback.html`), and `TOKEN_ENC_KEY`.

## 7a. AI scanner provider
The scanner always uses backend live-market metrics. The AI advisor only runs
when backend env contains a real provider key:
```dotenv
AI_PROVIDER=openai
AI_API_KEY=...
AI_MODEL=openai-t1-sg
AI_BASE_URL=https://api.freemodel.dev
```
If these values are missing, the dashboard shows "AI setup required" instead of
fake AI output. The API key stays on Railway/backend only.

## 7b. Password reset URL (PocketBase) — REQUIRED for reset links to work
PocketBase generates the single-use reset TOKEN and emails it (the API never
returns the token to us). Point that email at our page:
- PocketBase Admin UI → **Settings → Mail settings → Password reset** template.
- Set the action URL to: `{PUBLIC_APP_URL}/reset.html?token={TOKEN}`
- (Optional) configure PB's SMTP to use Resend for branded delivery.
`reset.html` reads `?token=` and calls `confirmPasswordReset` — success is shown
ONLY when PocketBase confirms the change. The backend no longer sends a separate
token-less reset email (which could never complete a reset).

## 7c. Email verification URL (PocketBase) - REQUIRED for verification links
PocketBase generates the single-use verification TOKEN and emails it. Point that
email at our page:
- PocketBase Admin UI -> **Settings -> Mail settings -> Verification** template.
- Set the action URL to: `{PUBLIC_APP_URL}/verify.html?token={TOKEN}`
- Configure PocketBase mail delivery with Resend/SMTP.
`verify.html` reads `?token=` and calls `POST /api/auth/confirm-verification`.
Success is shown only after PocketBase confirms the token. The backend refuses to
pretend an email was sent when `RESEND_API_KEY` is missing.

## 7d. Google login with PocketBase OAuth
Google sign-in uses PocketBase OAuth; no Google client secret is stored in the
frontend or Node backend.

1. In Google Cloud Console, create an OAuth 2.0 Web application.
2. Add the PocketBase OAuth redirect URL:
   `http://127.0.0.1:8090/api/oauth2-redirect`
   Also add `http://localhost:8090/api/oauth2-redirect` if you open PocketBase
   through `localhost`.
3. In PocketBase Admin UI -> Collections -> `users` -> Auth options -> OAuth2,
   enable Google and paste the Google client ID/client secret.
4. Test locally from `http://127.0.0.1:8000/auth.html` or
   `http://localhost:8000/auth.html`.

After OAuth succeeds, the frontend calls `POST /api/auth/oauth-sync`. The backend
sets safe user defaults only: free plan, inactive subscription, active status,
unverified Telegram, and not Deriv-connected. Admin rights still come only from
`OWNER_EMAIL` and the backend-controlled `admins` collection.

## 7e. Resend transactional email
Set these backend-only variables:

```dotenv
RESEND_API_KEY=...
RESEND_FROM_NAME=ApexBot
RESEND_FROM_EMAIL=no-reply@your-verified-domain.com
```

Configure PocketBase SMTP/Mail settings to use the same verified Resend sender.
PocketBase sends the token-bearing verification and password-reset emails; the
Node backend sends security alerts and subscription notices through Resend. If
`RESEND_API_KEY` is missing, signup verification and password reset return a
setup-needed error instead of fake success.

## 7f. Deriv affiliate onboarding
Set `DERIV_AFFILIATE_LINK` in the backend `.env`:
```dotenv
DERIV_AFFILIATE_LINK=https://track.deriv.com/_mOh_WtlcE0NMjdsyM5hasGNd7ZgqdRLk/1/
```
It is exposed (public-safe) via
`GET /api/public-config` as `derivAffiliateLink`, and the frontend renders
"Create Deriv Account" buttons (new tab) on the signup/login, verify/onboarding,
Deriv connect + callback-failure, demo dashboard, dashboard and terminal pages.
If the variable is empty, those buttons are hidden automatically.

## Production hardening checklist
- [ ] HTTPS everywhere; `ALLOWED_ORIGINS` locked to your domains
- [ ] PocketBase behind a reverse proxy; superuser creds only in backend env
- [ ] Encrypt `users.deriv_token` at rest
- [ ] Tighten per-route rate limits (auth, trading, webhook)
- [ ] Rotate `PAYMENT_WEBHOOK_SECRET` and verify signatures (already enforced)
- [ ] Back up PocketBase data; ship `audit_logs` to external storage
- [ ] Legal review of Terms/Privacy and trading risk disclosures
