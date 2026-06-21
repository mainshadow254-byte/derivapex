// Deriv historical + candle data (REAL). Used by the charting terminal and the
// AI chart analysis. All data comes from Deriv's public websocket — no fakes.
import WebSocket from 'ws';
import { config } from '../config.js';

function once(request, pickType) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(config.deriv.wsUrl);
    const timer = setTimeout(() => { try { sock.close(); } catch {} reject(new Error('Deriv timeout')); }, 12000);
    sock.on('open', () => sock.send(JSON.stringify(request)));
    sock.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.error) { clearTimeout(timer); sock.close(); return reject(new Error(msg.error.message)); }
      if (!pickType || msg.msg_type === pickType) {
        clearTimeout(timer); sock.close(); resolve(msg);
      }
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// OHLC candles. granularity in seconds (60=1m,300=5m,...). Returns [{t,o,h,l,c}].
export async function getCandles(symbol, granularity = 60, count = 200) {
  const msg = await once({
    ticks_history: symbol, style: 'candles', granularity,
    count, end: 'latest', adjust_start_time: 1,
  }, 'candles');
  return (msg.candles || []).map((c) => ({
    t: c.epoch, o: +c.open, h: +c.high, l: +c.low, c: +c.close,
  }));
}

// Raw tick history (for tick charts). Returns [{t,q}].
export async function getTickHistory(symbol, count = 500) {
  const msg = await once({ ticks_history: symbol, style: 'ticks', count, end: 'latest' }, 'history');
  const { times = [], prices = [] } = msg.history || {};
  return times.map((t, i) => ({ t, q: +prices[i] }));
}

// Active symbols grouped by market (synthetic, forex, crypto, indices, commodities).
export async function getSymbolsGrouped() {
  const msg = await once({ active_symbols: 'brief', product_type: 'basic' }, 'active_symbols');
  const groups = {};
  for (const s of msg.active_symbols || []) {
    const market = s.market_display_name || s.market || 'Other';
    (groups[market] ||= []).push({
      symbol: s.symbol, name: s.display_name, market, submarket: s.submarket_display_name,
      pip: s.pip, exchange_open: !!s.exchange_is_open,
    });
  }
  return groups;
}

// Contract availability for a selected Deriv symbol. This is intentionally
// backend-proxied so the frontend can show only contract families Deriv says
// are currently available for that market.
export async function getContractsFor(symbol) {
  const msg = await once({ contracts_for: symbol, currency: 'USD', product_type: 'basic' }, 'contracts_for');
  return (msg.contracts_for?.available || []).map((c) => ({
    contract_type: c.contract_type,
    contract_category: c.contract_category,
    contract_category_display: c.contract_category_display,
    contract_display: c.contract_display,
    barrier_category: c.barrier_category,
    barriers: c.barriers,
    sentiment: c.sentiment,
    start_type: c.start_type,
    expiry_type: c.expiry_type,
    min_contract_duration: c.min_contract_duration,
    max_contract_duration: c.max_contract_duration,
  }));
}
