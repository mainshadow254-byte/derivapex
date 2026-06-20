# ApexBot — secure trading platform

A re-architected, security-first replacement for the original static mock. Every
sensitive action is verified on the backend. No secrets, no owner email, no role
logic, and no fake success states live in the frontend.

```
apexbot/
├── backend/        Node/Express — ALL sensitive logic (auth checks, roles,
│                   Deriv real-trade proxy, payment webhook, Resend, audit)
├── pocketbase/     PocketBase schema + locked collection rules + setup guide
└── frontend/       Static site (HTML/CSS/JS). Talks to backend + PB auth only.
```

## How the security model works
- **Roles:** computed on the backend from `OWNER_EMAIL` (one super-owner) and the
  `admins` collection. The frontend cannot assert its role — it just calls
  `GET /api/me` and renders what the backend reports. Owner-only endpoints reject
  non-owners even if requests are forged.
- **Subscriptions:** activated ONLY by a signature-verified payment webhook
  (`POST /api/payments/webhook`). Feature access is computed backend-side.
  The frontend never activates a plan.
- **Deriv real trading:** proxied through the backend using the user's own Deriv
  token (stored server-side). The browser cannot place real orders directly.
- **Demo vs real:** demo trades are simulated and labeled `DEMO`. The AI scanner
  uses real Deriv ticks and refuses to emit a signal without enough data — it
  never fabricates random signals.
- **PocketBase rules:** all sensitive collections are locked (`null` rules); only
  the backend superuser client reads/writes them.
- **Secrets:** every key (Resend, PB admin, payment webhook secret) is a backend
  env var. Nothing sensitive is shipped to the browser.
- **Audit:** every admin/sensitive action writes an append-only `audit_logs` row.
- **Anti-copy:** the watermark + copy/blur protection is preserved (`security.js`),
  with the user's verified identity in the watermark. (Client-side deterrent only.)

## What you must provide to go live (none are in code)
| Need | Where |
|---|---|
| Hosted PocketBase + superuser creds | `backend/.env` (`PB_ADMIN_*`) |
| Resend API key + verified domain | `backend/.env` (`RESEND_*`) |
| Your Deriv `app_id` (+ OAuth for real accounts) | `backend/.env` (`DERIV_*`) |
| Your Deriv affiliate/referral link | `backend/.env` (`DERIV_AFFILIATE_LINK`) |
| Google OAuth client ID/secret | PocketBase `users` OAuth provider settings |
| Payment processor + webhook secret | `backend/.env` (`PAYMENT_*`) |
| Telegram bot token + channel/bot/support links | `backend/.env` (`TELEGRAM_*`) |
| OpenAI API key for model-backed market commentary | `backend/.env` (`OPENAI_API_KEY`) |
| Owner email | `backend/.env` (`OWNER_EMAIL`) |

See `DEPLOYMENT.md` for step-by-step setup.

## ⚠️ Important
This software can place **real-money** trades via Deriv. It is provided as a
foundation; you are responsible for legal/regulatory compliance, payment-provider
integration, hosting, and securing funds. The AI is probabilistic and never
guarantees profit.

## Status / implemented features
Secure core (unchanged): auth/roles, owner protection, admins, payments webhook,
subscriptions, Telegram, Deriv real-trade proxy + demo sim, PocketBase rules,
anti-copy, audit log.

Completed in this build (all backed by REAL data — no placeholders):
- **Charting:** timeframes 1m/5m/15m/**30m**/1h/**4h**/**Daily** (data-driven via
  `/api/market/timeframes`), all chart types (tick/line/area/OHLC/candlestick),
  full readout (O/H/L/C/price/bid/ask/tick-volume/trend/volatility).
- **Indicators:** MA, EMA, RSI, MACD, Bollinger, ATR, support, resistance, trend
  lines — enable/disable, **configurable periods**, and **save/reset layout**.
- **Trading workspace:** market watch (search/categories/favorites), custom
  **watchlists**, open positions / pending orders / closed positions / history,
  and an account summary (balance/equity/margin/free-margin + daily/weekly/monthly
  P/L). Real Deriv account data when connected; recorded demo ledger otherwise.
- **AI analysis:** a backend-only OpenAI Responses API advisor explains live
  scanner results, warns on volatile markets, and can select only alternatives
  that already pass deterministic safety gates. Missing keys, timeouts, invalid
  model output, and provider failures fall back to the deterministic advisor so
  scanning remains available. The API key never reaches the browser.
- **Copy-trading marketplace:** strategies with followers/win-rate/drawdown/risk/
  performance history/monthly returns; search/filter/compare/follow/unfollow/copy;
  start/pause/stop, capital allocation, risk limits; equity/profit/drawdown/
  monthly/risk-trend graphs.
- **Bot marketplace:** upload/install/share/publish/sell/buy/review/rate; downloads,
  ratings, reviews, performance, risk rating, categories (trading/signal/ai/automation).
- **Notification center:** market/scanner/volatility/trading/copy/bot/telegram/
  payment/subscription/security alerts with per-type enable/disable.
- **Device management:** users view/remove devices, session history, log out
  everywhere; admins view/terminate sessions and see suspicious logins.
- **Analytics graphs:** admin (revenue/subscription/user growth, DAU/MAU, scanner/
  trading/bot/copy usage), user (performance/win-rate/P&L/scanner/bot/copy), and
  per-bot (profit history/win-rate/drawdown/activity/over-time).
- **Deriv coverage:** the live feed dynamically discovers and subscribes to EVERY
  Deriv market (Volatility, Boom, Crash, Step, Jump, Range Break, Forex, Crypto);
  new Deriv markets appear automatically with no frontend change.

No-placeholder guarantee: every statistic is computed from real backend data —
the `trades` ledger, real subscriptions/users, the audit log, real follow/install/
review records, and live Deriv data. Empty data renders an honest empty state.

To extend next (operational glue, not UI): payment-provider adapter (Stripe/crypto),
Deriv OAuth connect flow + encrypted token storage, the bot execution worker (reads
`bots.status` / `copy_follows` and trades via the Deriv proxy, writing results to the
`trades` ledger so analytics keep filling), and the Telegram bot worker that calls
`POST /api/telegram/confirm`.

## Enable the real AI market advisor

1. Add `OPENAI_API_KEY` to `backend/.env`. Never add it to a frontend file.
2. Keep `OPENAI_MODEL=gpt-5.4-mini`, or choose another Structured Outputs-capable
   model using the backend environment variable.
3. Restart the backend with `cd backend` then `npm start`.
4. Sign in with a plan that includes the real scanner and open **AI Scanner**.

The model receives only market symbols and calculated scan metrics. It does not
receive Deriv tokens, PocketBase credentials, user secrets, or permission to place
trades. The deterministic backend always has final authority over whether a market
can be presented as an alternative.
