# ApexBot PocketBase setup

This schema targets PocketBase `0.39.x` (validated with `0.39.4`). PocketBase
provides user authentication; every business-data request goes through the Node
backend using a PocketBase superuser account.

## Collections found in the code

| Collection | Purpose | Direct client access |
|---|---|---|
| `users` | PocketBase auth and private account state | signup plus own list/view |
| `admins` | owner-approved delegated admins | locked |
| `subscriptions` | subscription source of truth | locked |
| `payments` | verified webhook payment ledger | locked |
| `bots` | imported bot definitions and state | locked |
| `audit_logs` | append-only application audit trail | locked |
| `plans` | public pricing catalogue | public read only |
| `system_settings` | backend/admin settings | locked |
| `trades` | demo and real trade ledger | locked |
| `strategies` | published copy-trading strategies | locked |
| `copy_follows` | copy-trading follower controls | locked |
| `marketplace_listings` | bot marketplace catalogue | locked |
| `bot_reviews` | marketplace reviews | locked |
| `bot_installs` | installs and purchases | locked |
| `notifications` | per-user notification feed | locked |
| `notification_prefs` | per-user notification preferences | locked |
| `devices` | device/session activity and revocation | locked |
| `watchlists` | watchlists and favorites | locked |

`sessions` is not a separate collection because `devices` is the session/device
registry used by the backend. `settings` is implemented as `system_settings`.
Telegram links are backend environment configuration, while Telegram identity and
pairing state are fields on `users`; there is no `telegram_links` data access in
the project.

Before this work, only `users` existed in the running instance. The other 17
collections above were missing. The old schema file described 16 additional
collections but omitted `payments`, all indexes, and required account fields.

## Security model

- All business collections have `null` API rules. Only the backend superuser can
  access them. Backend routes apply ownership filters before returning user data.
- `plans` permits list/view only. Writes remain backend/superuser-only.
- `users` permits public creation for signup and own-record list/view. Client
  update/delete is locked. The create rule rejects protected status, role,
  subscription, Telegram verification, Deriv, device-limit, and login fields.
- Sensitive `users` fields are marked hidden. `deriv_token` contains the backend's
  AES-256-GCM ciphertext and is never returned to ordinary users.
- `OWNER_EMAIL` is read only by the backend. It is not stored as an admin record
  and is not returned by the admin-list endpoint.
- Admin authority is calculated from `OWNER_EMAIL` and an active `admins` row.
  The `users.role` field exists for schema compatibility but is hidden and is not
  an authorization source.
- Payment/subscription collections accept no direct client writes. The backend
  writes payments only after webhook signature verification, or subscriptions
  through the existing audited admin activation route.

## Final local PowerShell commands

Run these commands on Windows for this local installation.

1. Start PocketBase:

```powershell
cd D:\pocketbase_0.39.4_windows_amd64
.\pocketbase.exe serve
```

2. Apply migrations:

```powershell
cd D:\pocketbase_0.39.4_windows_amd64
.\pocketbase.exe migrate up --dir "D:\pocketbase_0.39.4_windows_amd64\pb_data" --migrationsDir "C:\Users\hezro\OneDrive\Desktop\deriv\apexbot_platform_complete (2)\apexbot\pocketbase\pb_migrations"
```

3. Start backend:

```powershell
cd "C:\Users\hezro\OneDrive\Desktop\deriv\apexbot_platform_complete (2)\apexbot\backend"
npm start
```

4. Start frontend:

```powershell
cd "C:\Users\hezro\OneDrive\Desktop\deriv\apexbot_platform_complete (2)\apexbot\frontend"
npx http-server -p 8000
```

## Apply the migration (recommended)

Stop PocketBase briefly so the CLI can safely migrate the same SQLite data file.
From the directory containing `pocketbase.exe`, run:

```powershell
.\pocketbase.exe migrate up `
  --dir .\pb_data `
  --migrationsDir "C:\Users\hezro\OneDrive\Desktop\deriv\apexbot_platform_complete (2)\apexbot\pocketbase\pb_migrations"
```

For this local Windows installation, open **PowerShell as Administrator** and run
the checked migration/backup/verification script:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
& "C:\Users\hezro\OneDrive\Desktop\deriv\apexbot_platform_complete (2)\apexbot\pocketbase\run-local-migration.ps1"
```

The script uses `D:\pocketbase_0.39.4_windows_amd64\pocketbase.exe`, backs up
`pb_data`, runs `pocketbase migrate up`, proves the core auth fields are unchanged,
checks that no pre-existing system collection disappeared, verifies all 18
required collections, and restarts PocketBase if it was running.

Then restart PocketBase against the same data and migration directories:

```powershell
.\pocketbase.exe serve `
  --dir .\pb_data `
  --migrationsDir "C:\Users\hezro\OneDrive\Desktop\deriv\apexbot_platform_complete (2)\apexbot\pocketbase\pb_migrations"
```

The migration set currently includes:

- `1781913000_apexbot_schema.js`
- `1781915000_add_business_autodates.js`
- `1781917000_add_subscription_current_period_end.js`

The migration finds the existing `users` auth collection and adds/updates only
ApexBot custom fields by field ID. It then calls `importCollections(..., false)`
for the 17 business collections only. Its rollback is intentionally
non-destructive.

Do not use browser import. `pb_schema.json` is retained as a review/reference
snapshot of the 17 non-auth collections; the JS migration is the supported setup
path for this installation.

## Seed plans

In the `plans` collection create these rows (one per `plan`; the field is unique):

| plan | label | price | features |
|---|---|---:|---|
| `free` | Free / Demo | 0 | Demo scanner preview, demo trades, live charts |
| `starter` | Starter | 10 | Full AI scanner, real-time alerts |
| `standard` | Standard | 20 | Copy trading, bot imports |
| `premium` | Premium | 30 | Real trading via the user's Deriv account |
| `elite` | Elite | 50 | Priority alerts and higher limits |

## Backend environment

Copy `backend/.env.example` to `backend/.env`. These are server-only variables:

```dotenv
POCKETBASE_URL=http://127.0.0.1:8090
PB_ADMIN_EMAIL=your-pocketbase-superuser@example.com
PB_ADMIN_PASSWORD=your-superuser-password

# Supported aliases (use either pair, not both):
# POCKETBASE_ADMIN_EMAIL=your-pocketbase-superuser@example.com
# POCKETBASE_ADMIN_PASSWORD=your-superuser-password
```

Also set `OWNER_EMAIL` in the backend environment. Never put `OWNER_EMAIL`, a
PocketBase superuser credential, or a Deriv token in frontend configuration.

Set the public-safe Deriv affiliate link in the backend environment:

```dotenv
DERIV_AFFILIATE_LINK=https://track.deriv.com/_mOh_WtlcE0NMjdsyM5hasGNd7ZgqdRLk/1/
```

The frontend reads it only from `GET /api/public-config` as
`derivAffiliateLink`; do not hardcode it in HTML.

## Email verification setup

Email verification uses PocketBase's real single-use verification token. Configure
PocketBase mail delivery with Resend/SMTP and set the verification action URL to:

```text
{PUBLIC_APP_URL}/verify.html?token={TOKEN}
```

For local development with the default app URL, use:

```text
http://localhost:8000/verify.html?token={TOKEN}
```

`verify.html` reads `?token=` and calls `POST /api/auth/confirm-verification`.
The page only shows success after PocketBase confirms the token. If
`RESEND_API_KEY` is not configured in the backend, `/api/auth/start-verification`
returns a setup-needed error instead of pretending a verification email was sent.

## Google OAuth setup

Google sign-in is configured in PocketBase, not in the frontend.

1. Create a Google Cloud Console OAuth 2.0 Web application.
2. Add authorized redirect URLs:

```text
http://127.0.0.1:8090/api/oauth2-redirect
http://localhost:8090/api/oauth2-redirect
```

3. In PocketBase Admin UI, open Collections -> `users` -> Auth options -> OAuth2.
4. Enable Google and paste the Google client ID/client secret.
5. Test from `http://127.0.0.1:8000/auth.html`.

If Google is not enabled in PocketBase, the frontend shows
`Google sign-in not configured yet`. After Google login, the backend sync endpoint
sets only safe defaults, preserves the Google display name when available, and
does not require Telegram before the dashboard.

Install the updated backend dependency and start the API:

```powershell
cd backend
npm install
npm start
```

## Test checklist

- [ ] Signup creates a `users` auth record without accepting protected fields.
- [ ] Login returns a PocketBase user token and the backend accepts it.
- [ ] Email verification changes PocketBase `verified` and `/api/me` then succeeds.
- [ ] Password reset email reaches `reset.html`, and its single-use token works.
- [ ] Owner/admin detection comes only from backend `OWNER_EMAIL`/`admins` state.
- [ ] A normal user cannot read `admins`, tokens, payments, or another user's data.
- [ ] Subscription lookup returns only the caller's effective active subscription.
- [ ] A signed payment event writes `payments` and activates one subscription.
- [ ] Device heartbeat creates/updates `devices` and `last_login`; revoke works.
- [ ] Notifications list, unread count, preferences, and mark-read work.
- [ ] Watchlist create/update/delete and the single Favorites list work.
- [ ] Bot import/list/start/stop records work and bot content stays private.
- [ ] Copy strategy publish/follow/pause/stop records work.
- [ ] Trades ledger writes and user/bot/strategy analytics can read it.
- [ ] Sensitive actions append records to `audit_logs`.
- [ ] Suspended/disabled users are rejected by backend authentication middleware.

Deriv, Resend, Telegram bot, and payment-provider integration are intentionally
outside this schema task; only their existing PocketBase storage compatibility is
covered here.
