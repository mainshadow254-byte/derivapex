// Bot marketplace routes: browse/search/filter, view, publish/sell, install/buy,
// review + rate. Downloads, ratings, reviews and performance are all real
// aggregates from real records.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../services/subscriptions.js';
import {
  listListings, getListing, publishListing, installListing, reviewListing,
  myListings, BOT_CATEGORIES,
} from '../services/marketplace.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notifications.js';

const router = Router();

router.get('/categories', requireAuth, (_req, res) => res.json({ categories: BOT_CATEGORIES }));

// Browse / search / filter / sort (any verified user).
router.get('/listings', requireAuth, async (req, res) => {
  const { q = '', category = '', sort = 'downloads' } = req.query;
  res.json({ listings: await listListings({ q, category, sort }) });
});

router.get('/listings/:id', requireAuth, async (req, res) => {
  const listing = await getListing(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  res.json({ listing });
});

router.get('/mine', requireAuth, async (req, res) => {
  res.json({ listings: await myListings(req.auth.user.id) });
});

// Publish / sell a bot (paid: marketplace_publish). Must own a validated bot.
router.post('/publish', requireAuth, requireFeature('marketplace_publish'), async (req, res) => {
  const { botId, title, description, category, price, risk_rating } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required.' });
  try {
    const rec = await publishListing(req.auth.user.id, { botId, title, description, category, price, risk_rating });
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'marketplace.publish', target: rec.id, meta: { title, price } });
    await notify({ userId: req.auth.user.id, type: 'bot', severity: 'success', title: 'Bot published', body: `"${title}" is now live in the marketplace.`, meta: { listingId: rec.id } });
    res.json({ ok: true, listing: rec });
  } catch (e) { res.status(422).json({ error: e.message }); }
});

// Install (free) or buy (paid listing). Clones the bot into the user's library.
router.post('/listings/:id/install', requireAuth, async (req, res) => {
  try {
    const listing = await getListing(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    const purchased = Number(listing.price) > 0;
    const result = await installListing(req.auth.user.id, req.params.id, { purchased });
    await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: purchased ? 'marketplace.buy' : 'marketplace.install', target: req.params.id });
    await notify({ userId: req.auth.user.id, type: 'bot', severity: 'success', title: purchased ? 'Bot purchased' : 'Bot installed', body: `"${listing.title}" added to your bots.`, meta: { listingId: req.params.id } });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Review + rate an installed bot.
router.post('/listings/:id/review', requireAuth, async (req, res) => {
  const { rating, review } = req.body || {};
  if (rating == null) return res.status(400).json({ error: 'rating (1-5) required.' });
  const rec = await reviewListing(req.auth.user.id, req.params.id, rating, review);
  await audit({ actorId: req.auth.user.id, actorEmail: req.auth.email, action: 'marketplace.review', target: req.params.id, meta: { rating } });
  res.json({ ok: true, review: rec });
});

export default router;
