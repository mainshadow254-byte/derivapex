// Deriv service (server-side). Maintains a live tick cache from the public
// Deriv WS for market data + the scanner, and proxies REAL trades using the
// user's own Deriv API token. Real mode never uses random/fake data.
import WebSocket from 'ws';
import { config } from '../config.js';

const HISTORY = 240; // ticks kept per symbol for indicator math
const ticks = new Map(); // symbol -> [{ t, q }]
const symbolInfo = new Map(); // symbol -> active_symbols metadata
let ws = null;
let connecting = false;
let activeSymbols = [];
let dynamic = false;      // when true, discover ALL Deriv markets at connect
let seedSymbols = [];     // fallback set if discovery fails

export function getTrackedSymbols() {
  return activeSymbols.slice();
}

export function getSymbolInfo(symbol) {
  return symbolInfo.get(symbol) || inferSymbolInfo(symbol);
}

// Returns only symbols we actually have live ticks for (ready for analysis).
export function getReadySymbols() {
  return activeSymbols.filter((s) => (ticks.get(s) || []).length >= 60);
}

export function getTicks(symbol) {
  return (ticks.get(symbol) || []).slice();
}

export function getLatest(symbol) {
  const arr = ticks.get(symbol);
  return arr && arr.length ? arr[arr.length - 1] : null;
}

// Connect once at boot. By default it DYNAMICALLY discovers every tradable
// Deriv market (synthetics: Volatility/Boom/Crash/Step/Jump/Range Break, plus
// Forex & Crypto) and subscribes to all of them — so new Deriv markets appear
// automatically with no code change. Pass a fixed array to pin a smaller set.
export function startMarketFeed(symbolsOrOptions) {
  if (Array.isArray(symbolsOrOptions)) {
    // Backwards compatible: a fixed list is used as the seed but discovery is
    // still attempted so coverage stays complete and future-proof.
    seedSymbols = symbolsOrOptions;
    activeSymbols = symbolsOrOptions.slice();
    dynamic = true;
  } else {
    const o = symbolsOrOptions || {};
    dynamic = o.dynamic !== false;
    seedSymbols = o.seed || [];
    activeSymbols = seedSymbols.slice();
  }
  connect();
  // Periodically re-discover so markets Deriv adds later are picked up live.
  setInterval(() => { if (dynamic) rediscover(); }, 6 * 60 * 60 * 1000);
}

async function rediscover() {
  try {
    const symbols = await fetchActiveSymbols();
    rememberSymbols(symbols);
    const open = symbols.filter((s) => s.exchange_is_open !== 0).map((s) => s.symbol);
    const fresh = open.filter((s) => !activeSymbols.includes(s));
    if (fresh.length && ws && ws.readyState === WebSocket.OPEN) {
      fresh.forEach((s) => ws.send(JSON.stringify({ ticks: s, subscribe: 1 })));
      activeSymbols = [...new Set([...activeSymbols, ...fresh])];
      console.log('[deriv] discovered', fresh.length, 'new markets; tracking', activeSymbols.length);
    }
  } catch (e) { console.warn('[deriv] rediscover failed:', e?.message || e); }
}

function connect() {
  if (connecting || (ws && ws.readyState === WebSocket.OPEN)) return;
  connecting = true;
  ws = new WebSocket(config.deriv.wsUrl);

  ws.on('open', async () => {
    connecting = false;
    if (dynamic) {
      try {
        const symbols = await fetchActiveSymbols();
        rememberSymbols(symbols);
        const open = symbols.filter((s) => s.exchange_is_open !== 0).map((s) => s.symbol);
        activeSymbols = [...new Set([...seedSymbols, ...open])];
      } catch (e) {
        console.warn('[deriv] symbol discovery failed, using seed set:', e?.message || e);
        activeSymbols = seedSymbols.slice();
      }
    }
    activeSymbols.forEach((s) => ws.send(JSON.stringify({ ticks: s, subscribe: 1 })));
    console.log('[deriv] live feed connected, tracking', activeSymbols.length, 'markets');
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.msg_type === 'tick' && msg.tick) {
      const { symbol, quote, epoch } = msg.tick;
      const arr = ticks.get(symbol) || [];
      arr.push({ t: epoch, q: parseFloat(quote) });
      if (arr.length > HISTORY) arr.shift();
      ticks.set(symbol, arr);
    }
  });

  ws.on('close', () => {
    connecting = false;
    console.warn('[deriv] feed closed, reconnecting in 5s');
    setTimeout(connect, 5000);
  });
  ws.on('error', (e) => {
    connecting = false;
    console.error('[deriv] ws error:', e?.message || e);
  });
}

// Fetch the full list of tradable symbols from Deriv (real data).
export async function fetchActiveSymbols() {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(config.deriv.wsUrl);
    const timer = setTimeout(() => { sock.close(); reject(new Error('Deriv timeout')); }, 10000);
    sock.on('open', () => sock.send(JSON.stringify({ active_symbols: 'brief', product_type: 'basic' })));
    sock.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.msg_type === 'active_symbols') {
        clearTimeout(timer);
        sock.close();
        resolve(msg.active_symbols || []);
      }
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function rememberSymbols(symbols = []) {
  for (const info of symbols) {
    if (info?.symbol) symbolInfo.set(info.symbol, normalizeSymbolInfo(info));
  }
  for (const symbol of seedSymbols) {
    if (!symbolInfo.has(symbol)) symbolInfo.set(symbol, inferSymbolInfo(symbol));
  }
}

function normalizeSymbolInfo(info) {
  return {
    symbol: info.symbol,
    name: info.display_name || info.symbol,
    market: info.market_display_name || info.market || '',
    submarket: info.submarket_display_name || info.submarket || '',
    category: categorizeSymbol(info.symbol, info.market_display_name || info.market, info.submarket_display_name || info.submarket),
  };
}

function inferSymbolInfo(symbol = '') {
  return {
    symbol,
    name: symbol,
    market: '',
    submarket: '',
    category: categorizeSymbol(symbol),
  };
}

function categorizeSymbol(symbol = '', market = '', submarket = '') {
  const text = `${symbol} ${market} ${submarket}`.toLowerCase();
  if (text.includes('boom')) return 'Boom';
  if (text.includes('crash')) return 'Crash';
  if (text.includes('jump') || /^jd/i.test(symbol)) return 'Jump';
  if (text.includes('step') || /^stp/i.test(symbol)) return 'Step';
  if (text.includes('range break') || /^rd/i.test(symbol) || /^rb/i.test(symbol)) return 'Range Break';
  if (symbol.startsWith('frx') || text.includes('forex')) return 'Forex';
  if (symbol.startsWith('cry') || text.includes('crypto')) return 'Crypto';
  if (symbol.startsWith('R_') || /^\d+hz/i.test(symbol) || text.includes('volatility')) return 'Volatility';
  return market || 'Other';
}

// REAL trade. Requires the user's Deriv API token (stored encrypted / supplied
// per request). The backend places the order; the frontend cannot. This is a
// guarded proxy — it authorizes, then sends a proposal+buy.
export async function placeRealTrade({ derivToken, symbol, contractType, amount, duration, durationUnit }) {
  if (!derivToken) throw new Error('Deriv account not connected.');
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(config.deriv.wsUrl);
    const timer = setTimeout(() => { sock.close(); reject(new Error('Deriv trade timeout')); }, 15000);
    let authed = false;
    sock.on('open', () => sock.send(JSON.stringify({ authorize: derivToken })));
    sock.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.error) { clearTimeout(timer); sock.close(); return reject(new Error(msg.error.message)); }
      if (msg.msg_type === 'authorize' && !authed) {
        authed = true;
        sock.send(JSON.stringify({
          buy: 1,
          price: amount,
          parameters: {
            amount, basis: 'stake', contract_type: contractType,
            currency: msg.authorize.currency, duration, duration_unit: durationUnit, symbol,
          },
        }));
      }
      if (msg.msg_type === 'buy') {
        clearTimeout(timer);
        sock.close();
        resolve({ mode: 'real', contract_id: msg.buy.contract_id, buy_price: msg.buy.buy_price, longcode: msg.buy.longcode });
      }
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// DEMO trade simulation — explicitly labeled demo, never presented as real.
export function simulateDemoTrade({ symbol, contractType, amount, duration }) {
  const series = getTicks(symbol);
  const last = series.length ? series[series.length - 1].q : null;
  return {
    mode: 'demo',
    label: 'DEMO — simulated, no real money',
    symbol,
    contract_type: contractType,
    stake: amount,
    duration,
    entry_price: last,
    note: 'Demo trades are simulated against live prices for practice only.',
  };
}
