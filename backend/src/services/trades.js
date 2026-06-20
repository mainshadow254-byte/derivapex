// Trade ledger service. Every demo/real/bot/copy trade is recorded here so that
// ALL downstream analytics (positions, history, P/L, win-rate, equity curves,
// strategy + bot performance) are computed from REAL recorded activity — never
// fabricated. Backend writes only; the frontend reads through guarded routes.
import { getServicePB } from '../pocketbase.js';

export async function recordTrade(rec) {
  const pb = await getServicePB();
  return pb.collection('trades').create({
    user: rec.user,
    symbol: rec.symbol,
    mode: rec.mode || 'demo',
    source: rec.source || 'manual',
    contract_type: rec.contract_type || '',
    stake: Number(rec.stake || 0),
    entry_price: rec.entry_price != null ? Number(rec.entry_price) : null,
    exit_price: rec.exit_price != null ? Number(rec.exit_price) : null,
    profit: rec.profit != null ? Number(rec.profit) : null,
    status: rec.status || 'open',
    contract_id: String(rec.contract_id || ''),
    bot: rec.bot || '',
    strategy: rec.strategy || '',
    opened_at: rec.opened_at || new Date().toISOString(),
    closed_at: rec.closed_at || '',
    meta: rec.meta ? JSON.stringify(rec.meta) : '',
  });
}

export async function updateTrade(id, patch) {
  const pb = await getServicePB();
  return pb.collection('trades').update(id, patch);
}

// Return raw trade rows for a filter (newest first).
export async function listTrades(filter, { sort = '-opened_at', limit = 500 } = {}) {
  const pb = await getServicePB();
  return pb.collection('trades').getFullList({ filter, sort }).then((r) => r.slice(0, limit));
}

// ---- Performance maths (all derived from real rows) --------------------------

export function summarize(trades) {
  const closed = trades.filter((t) => t.status === 'won' || t.status === 'lost' || t.status === 'closed');
  const wins = closed.filter((t) => Number(t.profit) > 0);
  const losses = closed.filter((t) => Number(t.profit) <= 0);
  const net = closed.reduce((s, t) => s + Number(t.profit || 0), 0);
  const grossWin = wins.reduce((s, t) => s + Number(t.profit || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.profit || 0), 0));
  return {
    total: trades.length,
    open: trades.filter((t) => t.status === 'open').length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? +(wins.length / closed.length * 100).toFixed(2) : 0,
    netProfit: +net.toFixed(2),
    grossWin: +grossWin.toFixed(2),
    grossLoss: +grossLoss.toFixed(2),
    profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : (grossWin ? Infinity : 0),
    avgProfit: closed.length ? +(net / closed.length).toFixed(2) : 0,
  };
}

// Equity curve, profit curve and drawdown curve, ordered oldest -> newest.
export function curves(trades, startingEquity = 0) {
  const closed = trades
    .filter((t) => t.profit != null && (t.status === 'won' || t.status === 'lost' || t.status === 'closed'))
    .sort((a, b) => new Date(a.closed_at || a.opened_at) - new Date(b.closed_at || b.opened_at));

  let equity = startingEquity;
  let cumulative = 0;
  let peak = startingEquity;
  const equityCurve = [];
  const profitCurve = [];
  const drawdownCurve = [];
  for (const t of closed) {
    const p = Number(t.profit || 0);
    equity += p; cumulative += p;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? +((equity - peak) / peak * 100).toFixed(2) : 0;
    const ts = t.closed_at || t.opened_at;
    equityCurve.push({ t: ts, value: +equity.toFixed(2) });
    profitCurve.push({ t: ts, value: +cumulative.toFixed(2) });
    drawdownCurve.push({ t: ts, value: dd });
  }
  const maxDrawdown = drawdownCurve.length ? Math.min(...drawdownCurve.map((d) => d.value)) : 0;
  return { equityCurve, profitCurve, drawdownCurve, maxDrawdown };
}

// Group closed-trade profit by month -> [{ month:'YYYY-MM', profit }].
export function monthlyReturns(trades) {
  const map = new Map();
  for (const t of trades) {
    if (t.profit == null) continue;
    if (!(t.status === 'won' || t.status === 'lost' || t.status === 'closed')) continue;
    const d = new Date(t.closed_at || t.opened_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    map.set(key, (map.get(key) || 0) + Number(t.profit || 0));
  }
  return [...map.entries()].sort().map(([month, profit]) => ({ month, profit: +profit.toFixed(2) }));
}

// Win-rate trend by day -> [{ t:'YYYY-MM-DD', winRate, trades }].
export function winRateTrend(trades) {
  const byDay = new Map();
  for (const t of trades) {
    if (!(t.status === 'won' || t.status === 'lost' || t.status === 'closed')) continue;
    const day = new Date(t.closed_at || t.opened_at).toISOString().slice(0, 10);
    const cur = byDay.get(day) || { wins: 0, total: 0 };
    cur.total++; if (Number(t.profit) > 0) cur.wins++;
    byDay.set(day, cur);
  }
  return [...byDay.entries()].sort().map(([t, v]) => ({ t, winRate: +(v.wins / v.total * 100).toFixed(2), trades: v.total }));
}

// Profit/loss trend by day -> cumulative + per-day.
export function pnlTrend(trades) {
  const byDay = new Map();
  for (const t of trades) {
    if (t.profit == null) continue;
    if (!(t.status === 'won' || t.status === 'lost' || t.status === 'closed')) continue;
    const day = new Date(t.closed_at || t.opened_at).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + Number(t.profit || 0));
  }
  let cum = 0;
  return [...byDay.entries()].sort().map(([t, p]) => { cum += p; return { t, daily: +p.toFixed(2), cumulative: +cum.toFixed(2) }; });
}
