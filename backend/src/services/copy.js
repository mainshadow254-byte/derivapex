// Copy-trading marketplace service. A "strategy" is published by a real user
// (provider). Its statistics — followers, win rate, drawdown, risk score,
// equity/profit/drawdown curves, monthly returns — are ALL computed live from
// the real `trades` rows linked to the strategy. Nothing is fabricated; a brand
// new strategy with no trades reports zeros and an honest "no history yet".
import { getServicePB } from '../pocketbase.js';
import { listTrades, summarize, curves, monthlyReturns } from './trades.js';

async function strategyTrades(strategyId) {
  return listTrades(`strategy="${strategyId}"`, { sort: 'opened_at' });
}

async function followerCount(strategyId) {
  const pb = await getServicePB();
  const r = await pb.collection('copy_follows').getList(1, 1, { filter: `strategy="${strategyId}" && status="active"` });
  return r.totalItems;
}

// Compute a real performance snapshot for a strategy.
export async function strategyStats(strategyId) {
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
  let filter = 'status="published"';
  if (category) filter += ` && category="${category}"`;
  if (q) filter += ` && (name~"${q}" || provider_name~"${q}" || symbol~"${q}")`;
  const recs = await pb.collection('strategies').getFullList({ filter, expand: 'owner' });
  const out = [];
  for (const r of recs) {
    const stats = await strategyStats(r.id);
    out.push({
      id: r.id, name: r.name, description: r.description, category: r.category,
      symbol: r.symbol, provider_name: r.provider_name || r.expand?.owner?.email || 'Provider',
      risk_score: r.risk_score ?? null, published_at: r.published_at, ...stats,
    });
  }
  const sorters = {
    followers: (a, b) => b.followers - a.followers,
    winRate: (a, b) => b.winRate - a.winRate,
    profit: (a, b) => b.netProfit - a.netProfit,
    drawdown: (a, b) => b.maxDrawdown - a.maxDrawdown, // closest to 0 first (less negative)
    risk: (a, b) => (a.risk_score ?? 99) - (b.risk_score ?? 99),
  };
  return out.sort(sorters[sort] || sorters.followers);
}

export async function publishStrategy(ownerId, { name, description, category, symbol, risk_score, provider_name }) {
  const pb = await getServicePB();
  return pb.collection('strategies').create({
    owner: ownerId, name, description: description || '', category: category || 'mixed',
    symbol: symbol || '', risk_score: risk_score != null ? Number(risk_score) : null,
    status: 'published', provider_name: provider_name || '', published_at: new Date().toISOString(),
  });
}

export async function follow(followerId, strategyId, opts = {}) {
  const pb = await getServicePB();
  const existing = await pb.collection('copy_follows')
    .getFirstListItem(`follower="${followerId}" && strategy="${strategyId}"`).catch(() => null);
  const body = {
    follower: followerId, strategy: strategyId, status: 'active',
    capital_allocation: Number(opts.capital_allocation || 0),
    risk_max_daily_loss: Number(opts.risk_max_daily_loss || 0),
    risk_max_per_trade: Number(opts.risk_max_per_trade || 0),
    started_at: new Date().toISOString(),
  };
  if (existing) return pb.collection('copy_follows').update(existing.id, { ...body, started_at: existing.started_at });
  return pb.collection('copy_follows').create(body);
}

export async function setFollowStatus(followerId, strategyId, status) {
  const pb = await getServicePB();
  const existing = await pb.collection('copy_follows')
    .getFirstListItem(`follower="${followerId}" && strategy="${strategyId}"`).catch(() => null);
  if (!existing) return null;
  return pb.collection('copy_follows').update(existing.id, { status });
}

export async function updateFollowControls(followerId, strategyId, controls) {
  const pb = await getServicePB();
  const existing = await pb.collection('copy_follows')
    .getFirstListItem(`follower="${followerId}" && strategy="${strategyId}"`).catch(() => null);
  if (!existing) return null;
  const body = {};
  if (controls.capital_allocation != null) body.capital_allocation = Number(controls.capital_allocation);
  if (controls.risk_max_daily_loss != null) body.risk_max_daily_loss = Number(controls.risk_max_daily_loss);
  if (controls.risk_max_per_trade != null) body.risk_max_per_trade = Number(controls.risk_max_per_trade);
  return pb.collection('copy_follows').update(existing.id, body);
}

export async function unfollow(followerId, strategyId) {
  const pb = await getServicePB();
  const existing = await pb.collection('copy_follows')
    .getFirstListItem(`follower="${followerId}" && strategy="${strategyId}"`).catch(() => null);
  if (!existing) return false;
  await pb.collection('copy_follows').delete(existing.id);
  return true;
}

export async function myFollows(followerId) {
  const pb = await getServicePB();
  const recs = await pb.collection('copy_follows').getFullList({ filter: `follower="${followerId}"`, expand: 'strategy' });
  const out = [];
  for (const f of recs) {
    const stats = await strategyStats(f.strategy);
    out.push({
      id: f.id, strategy: f.strategy, status: f.status,
      name: f.expand?.strategy?.name || 'Strategy',
      capital_allocation: f.capital_allocation, risk_max_daily_loss: f.risk_max_daily_loss,
      risk_max_per_trade: f.risk_max_per_trade, started_at: f.started_at, stats,
    });
  }
  return out;
}
