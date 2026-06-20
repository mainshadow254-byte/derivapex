// Bot marketplace service. Users publish their validated bots as listings;
// others install/buy, review and rate them. Downloads, ratings, reviews and
// performance are ALL real counts/aggregates from real records (bot_installs,
// bot_reviews, and the linked bot's recorded `trades`). No fabricated metrics.
import { getServicePB } from '../pocketbase.js';
import { listTrades, summarize } from './trades.js';

export const BOT_CATEGORIES = ['trading', 'signal', 'ai', 'automation'];

async function ratingFor(listingId) {
  const pb = await getServicePB();
  const reviews = await pb.collection('bot_reviews').getFullList({ filter: `listing="${listingId}"` });
  const count = reviews.length;
  const avg = count ? +(reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / count).toFixed(2) : 0;
  return { avg, count };
}

async function installCount(listingId) {
  const pb = await getServicePB();
  const r = await pb.collection('bot_installs').getList(1, 1, { filter: `listing="${listingId}"` });
  return r.totalItems;
}

// Performance for a listing = summary of the linked bot's recorded trades.
async function listingPerformance(listing) {
  if (!listing.bot) return { winRate: 0, netProfit: 0, trades: 0, hasHistory: false };
  const trades = await listTrades(`bot="${listing.bot}"`);
  const s = summarize(trades);
  return { winRate: s.winRate, netProfit: s.netProfit, trades: s.total, hasHistory: s.closed > 0 };
}

async function decorate(listing) {
  const rating = await ratingFor(listing.id);
  const installs = await installCount(listing.id);
  const perf = await listingPerformance(listing);
  return {
    id: listing.id, title: listing.title, description: listing.description,
    category: listing.category, price: Number(listing.price || 0),
    risk_rating: listing.risk_rating || 'medium', published: listing.published,
    seller: listing.expand?.seller?.email || listing.seller,
    bot: listing.bot || null, published_at: listing.published_at,
    downloads: installs, rating: rating.avg, reviews: rating.count, performance: perf,
  };
}

export async function listListings({ q = '', category = '', sort = 'downloads' } = {}) {
  const pb = await getServicePB();
  let filter = 'published=true';
  if (category) filter += ` && category="${category}"`;
  if (q) filter += ` && (title~"${q}" || description~"${q}")`;
  const recs = await pb.collection('marketplace_listings').getFullList({ filter, expand: 'seller' });
  const out = [];
  for (const r of recs) out.push(await decorate(r));
  const sorters = {
    downloads: (a, b) => b.downloads - a.downloads,
    rating: (a, b) => b.rating - a.rating,
    price_low: (a, b) => a.price - b.price,
    price_high: (a, b) => b.price - a.price,
    performance: (a, b) => b.performance.netProfit - a.performance.netProfit,
  };
  return out.sort(sorters[sort] || sorters.downloads);
}

export async function getListing(id) {
  const pb = await getServicePB();
  const rec = await pb.collection('marketplace_listings').getOne(id, { expand: 'seller' }).catch(() => null);
  if (!rec) return null;
  const data = await decorate(rec);
  const reviews = await pb.collection('bot_reviews').getFullList({ filter: `listing="${id}"`, sort: '-created', expand: 'user' });
  data.reviewList = reviews.map((r) => ({ rating: r.rating, review: r.review, user: r.expand?.user?.email || 'user', created: r.created }));
  return data;
}

// Publish: requires the user to own a validated bot (real). Listing is created
// referencing that bot so its performance is real.
export async function publishListing(sellerId, { botId, title, description, category, price, risk_rating }) {
  const pb = await getServicePB();
  if (botId) {
    const bot = await pb.collection('bots').getOne(botId).catch(() => null);
    if (!bot || bot.user !== sellerId) throw new Error('You can only publish your own bot.');
    if (!bot.validated) throw new Error('Bot must pass validation before publishing.');
  }
  return pb.collection('marketplace_listings').create({
    bot: botId || '', seller: sellerId, title, description: description || '',
    category: BOT_CATEGORIES.includes(category) ? category : 'trading',
    price: Number(price || 0), published: true, downloads: 0,
    risk_rating: ['low', 'medium', 'high'].includes(risk_rating) ? risk_rating : 'medium',
    published_at: new Date().toISOString(),
  });
}

// Install (free) or buy (paid). Records a real install row + clones the bot to
// the buyer's own bots collection so they can run it.
export async function installListing(userId, listingId, { purchased = false } = {}) {
  const pb = await getServicePB();
  const listing = await pb.collection('marketplace_listings').getOne(listingId).catch(() => null);
  if (!listing) throw new Error('Listing not found.');
  const already = await pb.collection('bot_installs')
    .getFirstListItem(`listing="${listingId}" && user="${userId}"`).catch(() => null);
  if (!already) {
    await pb.collection('bot_installs').create({ listing: listingId, user: userId, purchased: !!purchased });
  }
  // Clone the underlying bot into the buyer's library (validated, inactive).
  let cloned = null;
  if (listing.bot) {
    const src = await pb.collection('bots').getOne(listing.bot).catch(() => null);
    if (src) {
      cloned = await pb.collection('bots').create({
        user: userId, name: `${listing.title} (installed)`, format: src.format,
        symbol: src.symbol || '', content: src.content || '', validated: true, status: 'inactive',
      });
    }
  }
  return { installed: true, botId: cloned?.id || null };
}

export async function reviewListing(userId, listingId, rating, review) {
  const pb = await getServicePB();
  const r = Math.max(1, Math.min(5, Math.round(Number(rating))));
  const existing = await pb.collection('bot_reviews')
    .getFirstListItem(`listing="${listingId}" && user="${userId}"`).catch(() => null);
  if (existing) return pb.collection('bot_reviews').update(existing.id, { rating: r, review: review || '' });
  return pb.collection('bot_reviews').create({ listing: listingId, user: userId, rating: r, review: review || '' });
}

export async function myListings(sellerId) {
  const pb = await getServicePB();
  const recs = await pb.collection('marketplace_listings').getFullList({ filter: `seller="${sellerId}"`, expand: 'seller' });
  const out = [];
  for (const r of recs) out.push(await decorate(r));
  return out;
}
