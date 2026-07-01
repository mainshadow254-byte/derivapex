// Copy-trading marketplace service. A "strategy" is published by a real user
// (provider). Its statistics — followers, win rate, drawdown, risk score,
// equity/profit/drawdown curves, monthly returns — are ALL computed live from
// the real `trades` rows linked to the strategy. Nothing is fabricated; a brand
// new strategy with no trades reports zeros and an honest "no history yet".
import { getServicePB } from '../pocketbase.js';
import { listTrades, summarize, curves, monthlyReturns } from './trades.js';

const SCHEMA_CATEGORIES = new Set(['forex', 'synthetic', 'crypto', 'mixed']);
const CATEGORY_ALIASES = {
  trend: 'synthetic',
  scalping: 'synthetic',
  grid: 'mixed',
  reversal: 'synthetic',
  ai: 'mixed',
  digits: 'synthetic',
  volatility: 'synthetic',
  boomcrash: 'synthetic',
};

function filterValue(value = '') {
  return String(value || '').replace(/["\\]/g, '').trim().slice(0, 120);
}

function normalizeCategory(category = '') {
  const c = String(category || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!c) return '';
  if (SCHEMA_CATEGORIES.has(c)) return c;
  return CATEGORY_ALIASES[c] || 'mixed';
}

function emptyStats() {
  return { followers: 0, trades: 0, closedTrades: 0, winRate: 0, netProfit: 0, profitFactor: 0, maxDrawdown: 0, hasHistory: false };
}

function emptyPerformance() {
  return { equityCurve: [], profitCurve: [], drawdownCurve: [], monthlyReturns: [], riskTrend: [], summary: summarize([]), maxDrawdown: 0, hasHistory: false };
}

async function strategyTrades(strategyId) {
  try { return await listTrades(`strategy="${filterValue(strategyId)}"`, { sort: 'opened_at' }); }
  catch { return []; }
}

async function followerCount(strategyId) {
  try {
    const pb = await getServicePB();
    const r = await pb.collection('copy_follows').getList(1, 1, { filter: `strategy="${filterValue(strategyId)}" && status="active"` });
    return r.totalItems;
  } catch { return 0; }
}

// Compute a real performance snapshot for a strategy.
export async function strategyStats(strategyId) {
  if (!strategyId) return emptyStats();
  const trades = await strategyTrades(strategyId);
  const s = summarize(trades);
  const c = curves(trades);
  const followers = await followerCount(strategyId);
  return {
    followers,
    trades: s.total,
    closedTrades: s.closed,
    winRate: s.winRate,
    netProfit: s.netProfit,
    profitFactor: s.profitFactor,
    maxDrawdown: c.maxDrawdown,
    hasHistory: s.closed > 0,
  };
}

export async function strategyPerformance(strategyId) {
  if (!strategyId) return emptyPerformance();
  const trades = await strategyTrades(strategyId);
  const c = curves(trades);
  return {
    equityCurve: c.equityCurve,
    profitCurve: c.profitCurve,
    drawdownCurve: c.drawdownCurve,
    monthlyReturns: monthlyReturns(trades),
    riskTrend: c.drawdownCurve.map((d) => ({ t: d.t, value: Math.abs(d.value) })),
    summary: summarize(trades),
    maxDrawdown: c.maxDrawdown,
    hasHistory: c.equityCurve.length > 0,
  };
}

// List published strategies with real stats, optional search + filters + sort.
export async function listStrategies({ q = '', category = '', sort = 'followers' } = {}) {
  const pb = await getServicePB();
  const normalizedCategory = normalizeCategory(category);
  const parts = ['status="published"'];
  if (normalizedCategory) parts.push(`category="${normalizedCategory}"`);
  const search = filterValue(q);
  if (search) parts.push(`(name~"${search}" || provider_name~"${search}" || symbol~"${search}")`);
  let recs = [];
  try {
    recs = await pb.collection('strategies').getFullList({ filter: parts.join(' && '), expand: 'owner' });
  } catch (error) {
    // If the collection/migration is not deployed yet, fail softly so the UI can
    // show an honest empty state instead of breaking the whole dashboard.
    if (String(error?.message || '').toLowerCase().includes('collection')) return [];
    throw error;
  }
  const out = [];
  for (const r of recs) {
    const stats = await strategyStats(r.id);
    out.push({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      symbol: r.symbol,
      provider_name: r.provider_name || r.expand?.owner?.email || 'Provider',
      risk_score: r.risk_score ?? null,
      published_at: r.published_at,
      ...stats,
    });
  }
  const sorters = {
    followers: (a, b) => b.followers - a.followers,
    winRate: (a, b) => b.winRate - a.winRate,
    profit: (a, b) => b.netProfit - a.netProfit,
    drawdown: (a, b) => a.maxDrawdown - b.maxDrawdown,
    risk: (a, b) => (a.risk_score ?? 99) - (b.risk_score ?? 99),
  };
  return out.sort(sorters[sort] || sorters.followers);
}

export async function publishStrategy(ownerId, { name, description, category, symbol, risk_score, provider_name }) {
  const pb = await getServicePB();
  const cleanName = filterValue(name);
  if (!cleanName) throw new Error('Strategy name is required.');
  return pb.collection('strategies').create({
    owner: ownerId,
    name: cleanName,
    description: String(description || '').trim().slice(0, 10000),
    category: normalizeCategory(category) || 'mixed',
    symbol: filterValue(symbol).slice(0, 80),
    risk_score: risk_score != null && risk_score !== '' ? Math.max(0, Math.min(100, Number(risk_score))) : null,
    status: 'published',
    provider_name: filterValue(provider_name).slice(0, 160),
    published_at: new Date().toISOString(),
  });
}

export async function follow(followerId, strategyId, opts = {}) {
  const pb = await getServicePB();
  const strategy = filterValue(strategyId);
  const capital = Math.max(0, Number(opts.capital_allocation || 0));
  const daily = Math.max(0, Number(opts.risk_max_daily_loss || 0));
  const perTrade = Math.max(0, Number(opts.risk_max_per_trade || 0));
  if (!capital) throw new Error('Capital allocation is required.');
  if (!daily) throw new Error('Max daily loss is required.');
  if (!perTrade) throw new Error('Max risk per trade is required.');
  const existing = await pb.collection('copy_follows')
    .getFirstListItem(`follower="${filterValue(followerId)}" && strategy="${strategy}"`).catch(() => null);
  const body = {
    follower: followerId,
    strategy,
    status: 'active',
    capital_allocation: capital,
    risk_max_daily_loss: daily,
    risk_max_per_trade: perTrade,
    started_at: new Date().toISOString(),
  };
  if (existing) return pb.collection('copy_follows').update(existing.id, { ...body, started_at: existing.started_at });
  return pb.collection('copy_follows').create(body);
}

export async function setFollowStatus(followerId, strategyId, status) {
  const pb = await getServicePB();
  const existing = await pb.collection('copy_follows')
    .getFirstListItem(`follower="${filterValue(followerId)}" && strategy="${filterValue(strategyId)}"`).catch(() => null);
  if (!existing) return null;
  return pb.collection('copy_follows').update(existing.id, { status });
}

export async function updateFollowControls(followerId, strategyId, controls) {
  const pb = await getServicePB();
  const existing = await pb.collection('copy_follows')
    .getFirstListItem(`follower="${filterValue(followerId)}" && strategy="${filterValue(strategyId)}"`).catch(() => null);
  if (!existing) return null;
  const body = {};
  if (controls.capital_allocation != null) body.capital_allocation = Math.max(0, Number(controls.capital_allocation));
  if (controls.risk_max_daily_loss != null) body.risk_max_daily_loss = Math.max(0, Number(controls.risk_max_daily_loss));
  if (controls.risk_max_per_trade != null) body.risk_max_per_trade = Math.max(0, Number(controls.risk_max_per_trade));
  return pb.collection('copy_follows').update(existing.id, body);
}

export async function unfollow(followerId, strategyId) {
  const pb = await getServicePB();
  const existing = await pb.collection('copy_follows')
    .getFirstListItem(`follower="${filterValue(followerId)}" && strategy="${filterValue(strategyId)}"`).catch(() => null);
  if (!existing) return false;
  await pb.collection('copy_follows').delete(existing.id);
  return true;
}

export async function myFollows(followerId) {
  const pb = await getServicePB();
  let recs = [];
  try { recs = await pb.collection('copy_follows').getFullList({ filter: `follower="${filterValue(followerId)}"`, expand: 'strategy' }); }
  catch { return []; }
  const out = [];
  for (const f of recs) {
    const stats = await strategyStats(f.strategy);
    out.push({
      id: f.id,
      strategy: f.strategy,
      status: f.status,
      name: f.expand?.strategy?.name || 'Strategy',
      capital_allocation: f.capital_allocation,
      risk_max_daily_loss: f.risk_max_daily_loss,
      risk_max_per_trade: f.risk_max_per_trade,
      started_at: f.started_at,
      stats,
    });
  }
  return out;
}
