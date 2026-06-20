// Analytics service. Builds admin, user and bot performance graph data ENTIRELY
// from real PocketBase records: real users, real subscriptions, the real audit
// log (activity), and the real `trades` ledger. There are no synthetic series —
// if there is no data yet, the series are simply empty and the UI says so.
import { getServicePB } from '../pocketbase.js';
import { PLAN_TIERS } from '../config.js';
import { listTrades, summarize, curves, monthlyReturns, winRateTrend, pnlTrend } from './trades.js';

const DAY = 86400000;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const monthKey = (d) => { const x = new Date(d); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };

// Build an ordered day bucket list for the last N days.
function lastNDays(n) {
  const out = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(now - i * DAY));
  return out;
}

// ---- ADMIN -----------------------------------------------------------------
export async function adminAnalytics({ days = 30 } = {}) {
  const pb = await getServicePB();
  const [users, subs, logs] = await Promise.all([
    pb.collection('users').getFullList({ fields: 'id,created' }),
    pb.collection('subscriptions').getFullList({ sort: 'created' }),
    pb.collection('audit_logs').getFullList({ sort: 'created' }),
  ]);

  const dayList = lastNDays(days);

  // User growth (cumulative real signups).
  const usersByDay = {};
  users.forEach((u) => { const k = dayKey(u.created); usersByDay[k] = (usersByDay[k] || 0) + 1; });
  let cumU = users.filter((u) => new Date(u.created) < new Date(dayList[0])).length;
  const userGrowth = dayList.map((d) => { cumU += usersByDay[d] || 0; return { t: d, value: cumU }; });

  // Subscription growth (cumulative active subscriptions created).
  const subsByDay = {};
  subs.forEach((s) => { const k = dayKey(s.created); subsByDay[k] = (subsByDay[k] || 0) + 1; });
  let cumS = subs.filter((s) => new Date(s.created) < new Date(dayList[0])).length;
  const subscriptionGrowth = dayList.map((d) => { cumS += subsByDay[d] || 0; return { t: d, value: cumS }; });

  // Revenue growth (real plan prices, by day, cumulative).
  const priceOf = (plan) => PLAN_TIERS[plan]?.price || 0;
  const revByDay = {};
  subs.forEach((s) => { const k = dayKey(s.created); revByDay[k] = (revByDay[k] || 0) + priceOf(s.plan); });
  let cumR = subs.filter((s) => new Date(s.created) < new Date(dayList[0])).reduce((a, s) => a + priceOf(s.plan), 0);
  const revenueGrowth = dayList.map((d) => { cumR += revByDay[d] || 0; return { t: d, value: +cumR.toFixed(2) }; });

  // DAU/MAU from real audit-log activity (distinct actors per day/month).
  const dauMap = {}; const mauMap = {};
  logs.forEach((l) => {
    if (!l.actor) return;
    const dk = dayKey(l.created); (dauMap[dk] ||= new Set()).add(l.actor);
    const mk = monthKey(l.created); (mauMap[mk] ||= new Set()).add(l.actor);
  });
  const dau = dayList.map((d) => ({ t: d, value: dauMap[d] ? dauMap[d].size : 0 }));
  const monthsSorted = Object.keys(mauMap).sort();
  const mau = monthsSorted.map((m) => ({ t: m, value: mauMap[m].size }));

  // Activity by action category from the real audit log.
  const actionSeries = (prefixes) => {
    const map = {};
    logs.forEach((l) => {
      if (!prefixes.some((p) => (l.action || '').startsWith(p))) return;
      const k = dayKey(l.created); map[k] = (map[k] || 0) + 1;
    });
    return dayList.map((d) => ({ t: d, value: map[d] || 0 }));
  };
  const scannerActivity = actionSeries(['scan', 'scanner']);
  const tradingActivity = actionSeries(['trade.']);
  const botUsage = actionSeries(['bot.']);
  const copyUsage = actionSeries(['copy.']);

  return {
    days, generatedAt: Date.now(),
    totals: {
      users: users.length,
      activeSubscriptions: subs.filter((s) => s.status === 'active' && (!s.expires_at || new Date(s.expires_at) > new Date())).length,
      mrr: +subs.filter((s) => s.status === 'active').reduce((a, s) => a + priceOf(s.plan), 0).toFixed(2),
    },
    revenueGrowth, subscriptionGrowth, userGrowth,
    dau, mau, scannerActivity, tradingActivity, botUsage, copyUsage,
    hasData: users.length > 0,
  };
}

// ---- USER -------------------------------------------------------------------
export async function userAnalytics(userId) {
  const pb = await getServicePB();
  const trades = await listTrades(`user="${userId}"`, { sort: 'opened_at' });
  const s = summarize(trades);
  const c = curves(trades);

  // Scanner + bot + copy usage from this user's real audit rows.
  const logs = await pb.collection('audit_logs').getFullList({ filter: `actor="${userId}"`, sort: 'created' });
  const usage = (prefixes) => {
    const map = {};
    logs.forEach((l) => { if (prefixes.some((p) => (l.action || '').startsWith(p))) { const k = dayKey(l.created); map[k] = (map[k] || 0) + 1; } });
    return Object.entries(map).sort().map(([t, value]) => ({ t, value }));
  };

  const botTrades = trades.filter((t) => t.source === 'bot');
  const copyTrades = trades.filter((t) => t.source === 'copy');

  return {
    summary: s,
    equityCurve: c.equityCurve, profitCurve: c.profitCurve, drawdownCurve: c.drawdownCurve, maxDrawdown: c.maxDrawdown,
    winRateTrend: winRateTrend(trades),
    pnlTrend: pnlTrend(trades),
    monthlyReturns: monthlyReturns(trades),
    scannerUsage: usage(['scan', 'scanner']),
    botPerformance: summarize(botTrades),
    copyPerformance: summarize(copyTrades),
    hasData: trades.length > 0,
  };
}

// ---- BOT --------------------------------------------------------------------
export async function botAnalytics(botId) {
  const trades = await listTrades(`bot="${botId}"`, { sort: 'opened_at' });
  const s = summarize(trades);
  const c = curves(trades);
  // Bot activity = trades opened per day.
  const actMap = {};
  trades.forEach((t) => { const k = dayKey(t.opened_at); actMap[k] = (actMap[k] || 0) + 1; });
  const activity = Object.entries(actMap).sort().map(([t, value]) => ({ t, value }));
  return {
    summary: s,
    profitHistory: c.profitCurve,        // cumulative profit over time
    winRateTrend: winRateTrend(trades),
    drawdownCurve: c.drawdownCurve, maxDrawdown: c.maxDrawdown,
    activity,
    performanceOverTime: c.equityCurve,
    hasData: trades.length > 0,
  };
}
