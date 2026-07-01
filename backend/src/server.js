import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, validateRuntimeConfig } from './config.js';
import { attachUser } from './middleware/auth.js';
import { startMarketFeed } from './services/deriv.js';
import { startTelegramRuntime } from './services/telegramRuntime.js';
import { notifyAdminError } from './services/adminAlerts.js';

import meRoutes from './routes/me.js';
import authRoutes from './routes/auth.js';
import adminsRoutes from './routes/admins.js';
import adminRoutes from './routes/admin.js';
import paymentRoutes from './routes/payments.js';
import telegramRoutes from './routes/telegram.js';
import scannerRoutes from './routes/scanner.js';
import tradingRoutes from './routes/trading.js';
import botRoutes from './routes/bots.js';
import marketRoutes from './routes/market.js';
import accountRoutes from './routes/account.js';
import copyRoutes from './routes/copy.js';
import marketplaceRoutes from './routes/marketplace.js';
import notificationRoutes from './routes/notifications.js';
import deviceRoutes from './routes/devices.js';
import analyticsRoutes from './routes/analytics.js';
import watchlistRoutes from './routes/watchlist.js';
import demoRoutes from './routes/demo.js';
import derivRoutes from './routes/deriv.js';

const app = express();
validateRuntimeConfig();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.allowedOrigins, credentials: true }));

// Capture raw body for webhook signature verification.
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

// Global rate limit (tighten per-route as needed).
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

app.get('/', (_req, res) => res.json({
  ok: true,
  service: 'ApexBot backend',
  health: '/api/health',
  publicConfig: '/api/public-config',
  ts: Date.now(),
}));
app.get('/api', (_req, res) => res.json({ ok: true, service: 'ApexBot API', health: '/api/health' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Public config the frontend is allowed to know (NO secrets).
app.get('/api/public-config', (_req, res) => {
  res.json({
    derivAppId: config.deriv.appId, // public app id for chart tick streams
    derivOAuthUrl: config.deriv.oauthUrl, // public OAuth authorize URL, no token
    derivOAuthRedirect: config.deriv.oauthRedirect || `${config.publicAppUrl.replace(/\/$/, '')}/deriv-callback.html`,
    derivAffiliateLink: config.deriv.affiliateLink, // public-safe referral link
    telegram: {
      community: config.telegram.communityUrl,
      secondaryCommunity: config.telegram.secondaryCommunityUrl,
      bot: config.telegram.botUrl,
      support: config.telegram.supportUrl,
    },
  });
});

// PUBLIC demo API — guest-safe, no auth, read-only, clearly labeled DEMO.
// Mounted BEFORE attachUser so visitors can use it without any token.
app.use('/api/demo', demoRoutes);

// Attach user/role to every request (backend-resolved).
app.use(attachUser);

app.use('/api/me', meRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admins', adminsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/copy', copyRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/deriv', derivRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.', path: req.originalUrl }));
app.use((err, req, res, _next) => {
  console.error('[error]', err);
  void notifyAdminError('Unhandled API error', err, { path: req.originalUrl, method: req.method });
  res.status(500).json({ error: 'Internal server error.' });
});

// Seed set spanning every Deriv synthetic family + forex + crypto. This is only
// a fallback — at boot the feed discovers and subscribes to ALL live Deriv
// markets dynamically (see startMarketFeed), so Boom/Crash/Step/Jump/Range
// Break and any FUTURE markets are covered automatically with no code change.
const SEED_SYMBOLS = [
  // Volatility indices
  'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
  // Boom indices
  'BOOM300N', 'BOOM500', 'BOOM1000',
  // Crash indices
  'CRASH300N', 'CRASH500', 'CRASH1000',
  // Step / Jump / Range Break
  'stpRNG', 'JD10', 'JD25', 'JD50', 'JD75', 'JD100', 'RDBEAR', 'RDBULL',
  // Forex + crypto
  'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'cryBTCUSD', 'cryETHUSD',
];

app.listen(config.port, () => {
  console.log(`[apexbot] backend on :${config.port} | ownerConfigured=${Boolean(config.ownerEmail)}`);
  // dynamic discovery ON: subscribe to every live Deriv market, seeded by the set above.
  startMarketFeed({ dynamic: true, seed: SEED_SYMBOLS });
  startTelegramRuntime().catch((error) => {
    console.error('[telegram-runtime]', error?.message || error);
    void notifyAdminError('Telegram runtime failed', error);
  });
});
