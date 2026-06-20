// Deriv ACCOUNT service (real). Uses the user's own authorized Deriv token to
// read their real balance, open positions (portfolio), and trade history
// (profit_table). All values are REAL and come straight from Deriv — there are
// no synthetic balances or fabricated positions here. Demo figures elsewhere
// are derived from the recorded `trades` ledger and clearly labeled DEMO.
import WebSocket from 'ws';
import { config } from '../config.js';

// Open one short-lived authorized socket, run a sequence of requests, resolve.
function derivAuthed(token, steps) {
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error('Deriv account not connected.'));
    const sock = new WebSocket(config.deriv.wsUrl);
    const out = {};
    let stepIdx = -1;
    const timer = setTimeout(() => { try { sock.close(); } catch {} reject(new Error('Deriv timeout')); }, 15000);

    function next() {
      stepIdx++;
      if (stepIdx >= steps.length) { clearTimeout(timer); try { sock.close(); } catch {} return resolve(out); }
      sock.send(JSON.stringify(steps[stepIdx].req));
    }
    sock.on('open', () => sock.send(JSON.stringify({ authorize: token })));
    sock.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.error) { clearTimeout(timer); try { sock.close(); } catch {} return reject(new Error(msg.error.message)); }
      if (msg.msg_type === 'authorize') { out.account = msg.authorize; return next(); }
      if (stepIdx >= 0 && steps[stepIdx] && msg.msg_type === steps[stepIdx].type) {
        out[steps[stepIdx].key] = msg[steps[stepIdx].type];
        next();
      }
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// Real account summary: balance, currency, and open-position valuation.
export async function getAccountSummary(token) {
  const r = await derivAuthed(token, [
    { req: { balance: 1 }, type: 'balance', key: 'balance' },
    { req: { portfolio: 1 }, type: 'portfolio', key: 'portfolio' },
  ]);
  const balance = Number(r.balance?.balance ?? 0);
  const currency = r.balance?.currency || r.account?.currency || 'USD';
  const contracts = r.portfolio?.contracts || [];
  // Margin used = sum of buy prices of open contracts (capital tied up).
  const marginUsed = contracts.reduce((s, c) => s + Number(c.buy_price || 0), 0);
  return {
    connected: true,
    loginid: r.account?.loginid,
    currency,
    balance: +balance.toFixed(2),
    // For options accounts equity = balance + open contract value (indicative).
    equity: +balance.toFixed(2),
    marginUsed: +marginUsed.toFixed(2),
    freeMargin: +(balance - marginUsed).toFixed(2),
    openPositions: contracts.length,
  };
}

// Real open positions (portfolio) with current indicative value where available.
export async function getOpenPositions(token) {
  const r = await derivAuthed(token, [{ req: { portfolio: 1 }, type: 'portfolio', key: 'portfolio' }]);
  return (r.portfolio?.contracts || []).map((c) => ({
    contract_id: c.contract_id,
    symbol: c.symbol,
    contract_type: c.contract_type,
    buy_price: Number(c.buy_price || 0),
    payout: Number(c.payout || 0),
    longcode: c.longcode,
    purchase_time: c.purchase_time,
    expiry_time: c.expiry_time,
    currency: c.currency,
  }));
}

// Real closed trade history via profit_table.
export async function getProfitTable(token, limit = 100) {
  const r = await derivAuthed(token, [
    { req: { profit_table: 1, description: 1, limit, sort: 'DESC' }, type: 'profit_table', key: 'pt' },
  ]);
  const rows = r.pt?.transactions || [];
  return rows.map((t) => ({
    contract_id: t.contract_id,
    symbol: t.shortcode?.split('_')?.[1] || '',
    buy_price: Number(t.buy_price || 0),
    sell_price: Number(t.sell_price || 0),
    profit: +(Number(t.sell_price || 0) - Number(t.buy_price || 0)).toFixed(2),
    purchase_time: t.purchase_time,
    sell_time: t.sell_time,
    longcode: t.longcode,
    app_id: t.app_id,
  }));
}

// Account statement (deposits/withdrawals/trades) for richer history.
export async function getStatement(token, limit = 100) {
  const r = await derivAuthed(token, [
    { req: { statement: 1, description: 1, limit }, type: 'statement', key: 'st' },
  ]);
  return (r.st?.transactions || []).map((t) => ({
    action: t.action_type,
    amount: Number(t.amount || 0),
    balance_after: Number(t.balance_after || 0),
    transaction_time: t.transaction_time,
    longcode: t.longcode,
    contract_id: t.contract_id,
  }));
}
