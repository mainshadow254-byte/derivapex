// Trading workspace data: account summary, open/pending positions, closed
// positions and trade history. REAL data only:
//  - If the user has connected a Deriv account, real balance/equity/margin and
//    real open positions + profit table come straight from Deriv.
//  - Demo figures are computed from the recorded `trades` ledger and labeled.
// Nothing here is fabricated.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getServicePB } from '../pocketbase.js';
import { getAccountSummary, getOpenPositions, getProfitTable } from '../services/derivAccount.js';
import { listTrades, summarize, updateTrade } from '../services/trades.js';
import { getDerivToken } from '../services/crypto.js';

const router = Router();

const DAY = 86400000;
function periodPnl(trades, sinceMs) {
  return +trades
    .filter((t) => t.profit != null && new Date(t.closed_at || t.opened_at).getTime() >= sinceMs)
    .reduce((s, t) => s + Number(t.profit || 0), 0)
    .toFixed(2);
}

// Account summary. Real balance/equity/margin from Deriv when connected;
// demo balance derived from the recorded demo trade ledger otherwise.
router.get('/summary', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  const user = await pb.collection('users').getOne(req.auth.user.id);
  const trades = await listTrades(`user="${req.auth.user.id}"`);
  const now = Date.now();
  const weekStart = now - 7 * DAY;
  const monthStart = now - 30 * DAY;
  const todayStart = new Date(new Date().toISOString().slice(0, 10)).getTime();

  const pl = {
    daily: periodPnl(trades, todayStart),
    weekly: periodPnl(trades, weekStart),
    monthly: periodPnl(trades, monthStart),
  };

  const derivToken = getDerivToken(user);
  if (derivToken) {
    try {
      const real = await getAccountSummary(derivToken);
      return res.json({ mode: 'real', ...real, profitLoss: pl });
    } catch (e) {
      // Fall through to demo-derived summary if Deriv is unreachable.
    }
  }

  // Demo-derived summary from the recorded ledger (clearly labeled DEMO).
  const closed = trades.filter((t) => t.profit != null);
  const realized = closed.reduce((s, t) => s + Number(t.profit || 0), 0);
  const openStakes = trades.filter((t) => t.status === 'open').reduce((s, t) => s + Number(t.stake || 0), 0);
  const balance = +realized.toFixed(2); // demo balance = realized P/L from recorded demo trades
  res.json({
    mode: 'demo',
    connected: false,
    currency: 'USD',
    balance,
    equity: +(balance).toFixed(2),
    marginUsed: +openStakes.toFixed(2),
    freeMargin: +(balance - openStakes).toFixed(2),
    openPositions: trades.filter((t) => t.status === 'open').length,
    profitLoss: pl,
    note: 'Demo figures are computed from your recorded demo trades. Connect a Deriv account for real balance/equity/margin.',
  });
});

// Open positions. Real portfolio from Deriv when connected, else open rows from
// the recorded ledger (demo).
router.get('/positions', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  const user = await pb.collection('users').getOne(req.auth.user.id);
  const derivToken = getDerivToken(user);
  if (derivToken) {
    try { return res.json({ mode: 'real', positions: await getOpenPositions(derivToken) }); }
    catch (e) { /* fall through */ }
  }
  const open = await listTrades(`user="${req.auth.user.id}" && status="open"`);
  res.json({ mode: 'demo', positions: open.map((t) => ({
    id: t.id, symbol: t.symbol, contract_type: t.contract_type, buy_price: t.stake,
    entry_price: t.entry_price, purchase_time: t.opened_at, mode: t.mode, source: t.source,
  })) });
});

// Pending orders (limit/stop style). Recorded as status='open' with a pending
// flag in meta; real Deriv binaries fill instantly, so this is honest about
// being empty unless pending orders exist.
router.get('/orders', requireAuth, async (req, res) => {
  const pending = await listTrades(`user="${req.auth.user.id}" && status="open"`);
  const orders = pending.filter((t) => { try { return JSON.parse(t.meta || '{}').pending === true; } catch { return false; } });
  res.json({ orders });
});

// Closed positions (real profit_table when connected) + recorded ledger.
router.get('/closed', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  const user = await pb.collection('users').getOne(req.auth.user.id);
  let realClosed = [];
  const derivToken = getDerivToken(user);
  if (derivToken) {
    try { realClosed = await getProfitTable(derivToken, 100); } catch {}
  }
  const ledger = await listTrades(`user="${req.auth.user.id}" && (status="won" || status="lost" || status="closed")`);
  res.json({ deriv: realClosed, ledger });
});

// Full trade history from the recorded ledger (demo + real).
router.get('/history', requireAuth, async (req, res) => {
  const trades = await listTrades(`user="${req.auth.user.id}"`);
  res.json({ trades, summary: summarize(trades) });
});

// A private journal note stored inside the owning trade's backend-only metadata.
router.patch('/history/:id/note', requireAuth, async (req, res) => {
  const pb = await getServicePB();
  const trade = await pb.collection('trades').getOne(req.params.id).catch(() => null);
  if (!trade || trade.user !== req.auth.user.id) return res.status(404).json({ error: 'Trade not found.' });
  let meta = {};
  try { meta = JSON.parse(trade.meta || '{}'); } catch {}
  meta.journal_note = String(req.body?.note || '').trim().slice(0, 2000);
  const updated = await updateTrade(trade.id, { meta: JSON.stringify(meta) });
  res.json({ ok: true, trade: { id: updated.id, note: meta.journal_note } });
});

export default router;
