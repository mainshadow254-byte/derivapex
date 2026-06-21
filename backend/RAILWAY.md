# ApexBot Backend on Railway

Railway should deploy the `backend` directory with Node.js 20 or newer.

## Build and start

```text
Root directory: backend
Build command: npm ci
Start command: npm start
Health check path: /api/health
```

The start script runs `node src/server.js`, and the server binds to Railway's
`PORT`. Do not set a public fixed port in code.

## Required variables

Copy names from `.env.example` into Railway Variables. At minimum production
startup requires:

```dotenv
NODE_ENV=production
PUBLIC_BACKEND_URL=https://your-service.up.railway.app
PUBLIC_APP_URL=https://your-frontend.example.com
ALLOWED_ORIGINS=https://your-frontend.example.com
POCKETBASE_URL=https://your-pocketbase.example.com
PB_ADMIN_EMAIL=replace-me
PB_ADMIN_PASSWORD=replace-me
OWNER_EMAIL=replace-me
TOKEN_ENC_KEY=replace-with-a-long-independent-random-value
```

Never prefix backend secrets with `VITE_`, `NEXT_PUBLIC_`, or another frontend
public prefix. Railway owns `PORT`; an explicit value is optional.

## Telegram webhook

Set:

```dotenv
TELEGRAM_BOT_TOKEN=replace-me
TELEGRAM_WEBHOOK_SECRET=replace-with-random-webhook-secret
TELEGRAM_BOT_USERNAME=Apexrebornbot
TELEGRAM_ADMIN_ID=123456789
TELEGRAM_USE_POLLING=false
PUBLIC_BACKEND_URL=https://your-service.up.railway.app
```

The backend configures this webhook on startup:

```text
https://your-service.up.railway.app/api/telegram/webhook
```

It can also be set explicitly from a Railway shell:

```bash
npm run telegram:set-webhook
```

Use polling only for local development by setting
`TELEGRAM_USE_POLLING=true`. Channel and group IDs are optional; set
`TELEGRAM_REQUIRED_CHANNEL_ID` and/or `TELEGRAM_REQUIRED_GROUP_ID` only when
membership must be checked. Telegram linking remains optional for ApexBot users.

## AI scanner

```dotenv
AI_PROVIDER=openai
AI_API_KEY=replace-me
AI_MODEL=openai-t1-sg
AI_BASE_URL=https://api.freemodel.dev
```

The API key is read only by the backend. The adapter calls the provider's
OpenAI-compatible `/v1/chat/completions` endpoint, then validates its structured
answer against live Deriv scanner metrics. Without a key, the API reports
`AI setup required` and does not claim an AI result.

## Verification

```bash
npm ci
npm test
npm start
curl https://your-service.up.railway.app/api/health
curl https://your-service.up.railway.app/api/public-config
```

The public-config response may contain only public Deriv URLs/app ID and public
Telegram links. It must never contain PocketBase credentials, bot tokens, AI
keys, payment secrets, or `TOKEN_ENC_KEY`.
