// Professional charting terminal. Renders REAL Deriv candles/ticks with
// lightweight-charts. Supports candlestick / OHLC bar / line / area / tick,
// live streaming, crosshair, zoom, pan, fullscreen, market switching, and
// indicator overlays. Bid/Ask/quote/tick-volume come from the live tick feed.
class ChartTerminal {
  constructor(opts) {
    this.container = opts.container;          // main chart element
    this.oscContainer = opts.oscContainer;    // oscillator pane element
    this.appId = opts.appId || '1089';
    this.symbol = opts.symbol;
    this.granularity = opts.granularity || 60;
    this.type = 'candlestick';
    this.candles = [];
    this.series = null;
    this.overlays = {};      // indicator overlay series on main chart
    this.oscSeries = {};     // RSI/MACD/ATR series on oscillator chart
    // Default indicator periods (user-configurable + persisted as a layout).
    this.LAYOUT_KEY = 'apex_chart_layout_v1';
    this.defaults = {
      enabled: ['ema20', 'ema50'],
      params: { ma20: { period: 20 }, ema20: { period: 20 }, ema50: { period: 50 },
        bollinger: { period: 20, mult: 2 }, rsi: { period: 14 }, atr: { period: 14 },
        macd: { fast: 12, slow: 26, signal: 9 }, sr: { lookback: 80 }, trendline: {} },
    };
    this.enabled = new Set(this.defaults.enabled);
    this.params = JSON.parse(JSON.stringify(this.defaults.params));
    this.onReadout = opts.onReadout || (() => {});
    this.onLayoutChange = opts.onLayoutChange || (() => {});
    this.ws = null;
    this.dark = true;
    this._loadLayout();
    this._initCharts();
  }

  // ---- Layout persistence (UI preference only — not market data) ------------
  _loadLayout() {
    try {
      const raw = localStorage.getItem(this.LAYOUT_KEY);
      if (!raw) return;
      const l = JSON.parse(raw);
      if (Array.isArray(l.enabled)) this.enabled = new Set(l.enabled);
      if (l.params) this.params = { ...this.params, ...l.params };
      if (l.type) this.type = l.type;
    } catch {}
  }
  saveLayout() {
    try { localStorage.setItem(this.LAYOUT_KEY, JSON.stringify({ enabled: [...this.enabled], params: this.params, type: this.type })); } catch {}
    this.onLayoutChange();
  }
  resetLayout() {
    this.enabled = new Set(this.defaults.enabled);
    this.params = JSON.parse(JSON.stringify(this.defaults.params));
    try { localStorage.removeItem(this.LAYOUT_KEY); } catch {}
    this._renderIndicators();
    this.onLayoutChange();
  }
  setIndicatorParam(id, key, value) {
    if (!this.params[id]) this.params[id] = {};
    this.params[id][key] = Number(value);
    this._renderIndicators();
    this.saveLayout();
  }

  _theme() {
    return {
      layout: { background: { color: 'transparent' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: 'rgba(148,163,184,.08)' }, horzLines: { color: 'rgba(148,163,184,.08)' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(148,163,184,.2)' },
      timeScale: { borderColor: 'rgba(148,163,184,.2)', timeVisible: true, secondsVisible: this.granularity < 60 },
      handleScroll: true, handleScale: true,
    };
  }

  _initCharts() {
    const { createChart } = LightweightCharts;
    this.chart = createChart(this.container, { ...this._theme(), autoSize: true });
    this.osc = createChart(this.oscContainer, { ...this._theme(), autoSize: true, height: 140 });
    // sync time scales
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((r) => r && this.osc.timeScale().setVisibleLogicalRange(r));
    this.osc.timeScale().subscribeVisibleLogicalRangeChange((r) => r && this.chart.timeScale().setVisibleLogicalRange(r));
    this.chart.subscribeCrosshairMove((p) => this._crosshair(p));
    this._buildMainSeries();
  }

  _buildMainSeries() {
    if (this.series) this.chart.removeSeries(this.series);
    const t = this.type;
    if (t === 'line' || t === 'tick') this.series = this.chart.addLineSeries({ color: '#6366f1', lineWidth: 2 });
    else if (t === 'area') this.series = this.chart.addAreaSeries({ lineColor: '#6366f1', topColor: 'rgba(99,102,241,.4)', bottomColor: 'rgba(99,102,241,0)' });
    else if (t === 'ohlc') this.series = this.chart.addBarSeries({ upColor: '#10b981', downColor: '#f43f5e' });
    else this.series = this.chart.addCandlestickSeries({ upColor: '#10b981', downColor: '#f43f5e', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#f43f5e' });
  }

  _fmt(c) {
    if (this.type === 'line' || this.type === 'area' || this.type === 'tick') return { time: c.t, value: c.c };
    return { time: c.t, open: c.o, high: c.h, low: c.l, close: c.c };
  }

  async load() {
    const isTick = this.type === 'tick';
    const path = isTick ? `/market/ticks?symbol=${this.symbol}&count=500` : `/market/candles?symbol=${this.symbol}&granularity=${this.granularity}&count=300`;
    const data = await api(path);
    this.candles = isTick ? data.ticks.map((x) => ({ t: x.t, o: x.q, h: x.q, l: x.q, c: x.q })) : data.candles;
    this.series.setData(this.candles.map((c) => this._fmt(c)));
    this.chart.timeScale().fitContent();
    this._renderIndicators();
    this._connectLive();
  }

  setType(type) { this.type = type; this._buildMainSeries(); this.load(); this.saveLayout(); }
  setSymbol(symbol) { this.symbol = symbol; this.load(); }
  setGranularity(g) { this.granularity = g; this.load(); }

  toggleIndicator(name, on) { on ? this.enabled.add(name) : this.enabled.delete(name); this._renderIndicators(); this.saveLayout(); }

  _clearOverlays() {
    Object.values(this.overlays).forEach((s) => this.chart.removeSeries(s));
    Object.values(this.oscSeries).forEach((s) => this.osc.removeSeries(s));
    this.overlays = {}; this.oscSeries = {};
  }

  _renderIndicators() {
    if (!this.candles.length || !window.Indicators) return;
    this._clearOverlays();
    const C = this.candles, I = window.Indicators, e = this.enabled, p = this.params;
    const addLine = (id, data, color, width = 1) => { const s = this.chart.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false }); s.setData(data); this.overlays[id] = s; };
    if (e.has('ma20')) addLine('ma20', I.sma(C, p.ma20.period), '#f59e0b');
    if (e.has('ema20')) addLine('ema20', I.ema(C, p.ema20.period), '#22d3ee');
    if (e.has('ema50')) addLine('ema50', I.ema(C, p.ema50.period), '#a78bfa');
    if (e.has('bollinger')) { const b = I.bollinger(C, p.bollinger.period, p.bollinger.mult); addLine('bbU', b.upper, 'rgba(148,163,184,.6)'); addLine('bbM', b.mid, 'rgba(148,163,184,.35)'); addLine('bbL', b.lower, 'rgba(148,163,184,.6)'); }
    if (e.has('trendline')) { const tl = I.trendline(C); if (tl) addLine('tl', tl, '#eab308', 2); }
    if (e.has('sr')) {
      const lv = I.levels(C, p.sr.lookback);
      lv.resistance.forEach((q, i) => addLine('r' + i, [{ time: C[0].t, value: q }, { time: C[C.length - 1].t, value: q }], 'rgba(244,63,94,.5)'));
      lv.support.forEach((q, i) => addLine('s' + i, [{ time: C[0].t, value: q }, { time: C[C.length - 1].t, value: q }], 'rgba(16,185,129,.5)'));
    }
    // Oscillators
    const addOsc = (id, data, color) => { const s = this.osc.addLineSeries({ color, lineWidth: 1, lastValueVisible: true }); s.setData(data); this.oscSeries[id] = s; };
    if (e.has('rsi')) addOsc('rsi', I.rsi(C, p.rsi.period), '#22d3ee');
    if (e.has('atr')) addOsc('atr', I.atr(C, p.atr.period), '#f59e0b');
    if (e.has('macd')) { const m = I.macd(C, p.macd.fast, p.macd.slow, p.macd.signal); addOsc('macd', m.line, '#6366f1'); addOsc('signal', m.signal, '#f43f5e'); const h = this.osc.addHistogramSeries({ color: 'rgba(148,163,184,.5)' }); h.setData(m.hist); this.oscSeries.hist = h; }
  }

  _crosshair(param) {
    if (!param.time || !param.seriesData) return;
    const d = param.seriesData.get(this.series);
    if (!d) return;
    this.onReadout({
      time: new Date(param.time * 1000).toLocaleString(),
      o: d.open, h: d.high, l: d.low, c: d.close ?? d.value,
    });
  }

  _connectLive() {
    try { this.ws && this.ws.close(); } catch {}
    this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`);
    this.ws.onopen = () => {
      if (this.type === 'tick') this.ws.send(JSON.stringify({ ticks: this.symbol, subscribe: 1 }));
      else this.ws.send(JSON.stringify({ ticks_history: this.symbol, style: 'candles', granularity: this.granularity, count: 1, end: 'latest', subscribe: 1 }));
    };
    this._tickCount = 0;
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.msg_type === 'tick' && m.tick) {
        const tk = m.tick; this._tickCount++;
        this.onReadout({ live: true, quote: +tk.quote, bid: tk.bid != null ? +tk.bid : null, ask: tk.ask != null ? +tk.ask : null, tickVol: this._tickCount });
        if (this.type === 'tick') { const pt = { time: tk.epoch, value: +tk.quote }; this.series.update(pt); }
      }
      if (m.msg_type === 'ohlc' && m.ohlc) {
        const o = m.ohlc;
        const bar = { time: +o.open_time, open: +o.open, high: +o.high, low: +o.low, close: +o.close };
        if (this.type === 'line' || this.type === 'area') this.series.update({ time: bar.time, value: bar.close });
        else this.series.update(bar);
        // keep candle cache fresh for indicator recompute
        const last = this.candles[this.candles.length - 1];
        const norm = { t: bar.time, o: bar.open, h: bar.high, l: bar.low, c: bar.close };
        if (last && last.t === bar.time) this.candles[this.candles.length - 1] = norm; else { this.candles.push(norm); if (this.candles.length > 400) this.candles.shift(); }
      }
    };
    this.ws.onclose = () => setTimeout(() => this._connectLive(), 4000);
  }

  fullscreen() {
    const el = this.container.closest('.terminal-shell') || this.container;
    if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.();
  }

  destroy() { try { this.ws.close(); } catch {} this.chart.remove(); this.osc.remove(); }
}
window.ChartTerminal = ChartTerminal;
