// Professional charting terminal. Renders real Deriv candles/ticks with
// lightweight-charts. Supports candle, hollow candle, OHLC, line, area, tick,
// live streaming, crosshair, zoom, pan, fullscreen and indicator overlays.
class ChartTerminal {
  constructor(opts) {
    this.container = opts.container;
    this.oscContainer = opts.oscContainer;
    this.appId = opts.appId || '1089';
    this.symbol = opts.symbol;
    this.granularity = opts.granularity || 60;
    this.type = 'candlestick';
    this.candles = [];
    this.series = null;
    this.overlays = {};
    this.oscSeries = {};
    this.LAYOUT_KEY = 'apex_chart_layout_v1';
    this.defaults = {
      enabled: ['ema20', 'ema50'],
      params: {
        ma20: { period: 20 }, ema20: { period: 20 }, ema50: { period: 50 },
        bollinger: { period: 20, mult: 2 }, rsi: { period: 14 }, atr: { period: 14 },
        macd: { fast: 12, slow: 26, signal: 9 }, sr: { lookback: 80 }, trendline: {},
      },
    };
    this.enabled = new Set(this.defaults.enabled);
    this.params = JSON.parse(JSON.stringify(this.defaults.params));
    this.onReadout = opts.onReadout || (() => {});
    this.onLayoutChange = opts.onLayoutChange || (() => {});
    this.ws = null;
    this._loadLayout();
    this._initCharts();
  }

  _loadLayout() {
    try {
      const raw = localStorage.getItem(this.LAYOUT_KEY);
      if (!raw) return;
      const layout = JSON.parse(raw);
      if (Array.isArray(layout.enabled)) this.enabled = new Set(layout.enabled);
      if (layout.params) this.params = { ...this.params, ...layout.params };
      if (layout.type) this.type = layout.type;
    } catch {}
  }

  saveLayout() {
    try { localStorage.setItem(this.LAYOUT_KEY, JSON.stringify({ enabled: [...this.enabled], params: this.params, type: this.type })); } catch {}
    this.onLayoutChange();
  }

  resetLayout() {
    this.enabled = new Set(this.defaults.enabled);
    this.params = JSON.parse(JSON.stringify(this.defaults.params));
    this.type = 'candlestick';
    try { localStorage.removeItem(this.LAYOUT_KEY); } catch {}
    this._buildMainSeries();
    this._renderCurrentData();
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
    const light = document.body.classList.contains('studio-light');
    return {
      layout: { background: { color: 'transparent' }, textColor: light ? '#666d74' : '#94a3b8' },
      grid: {
        vertLines: { color: light ? '#e8eaec' : 'rgba(148,163,184,.08)' },
        horzLines: { color: light ? '#e8eaec' : 'rgba(148,163,184,.08)' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: light ? '#d9dcdf' : 'rgba(148,163,184,.2)' },
      timeScale: { borderColor: light ? '#d9dcdf' : 'rgba(148,163,184,.2)', timeVisible: true, secondsVisible: this.granularity < 60 },
      handleScroll: true,
      handleScale: true,
    };
  }

  _initCharts() {
    const { createChart } = LightweightCharts;
    this.chart = createChart(this.container, { ...this._theme(), autoSize: true });
    this.osc = createChart(this.oscContainer, { ...this._theme(), autoSize: true, height: 140 });
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => range && this.osc.timeScale().setVisibleLogicalRange(range));
    this.osc.timeScale().subscribeVisibleLogicalRangeChange((range) => range && this.chart.timeScale().setVisibleLogicalRange(range));
    this.chart.subscribeCrosshairMove((point) => this._crosshair(point));
    this._buildMainSeries();
  }

  _buildMainSeries() {
    if (this.series) this.chart.removeSeries(this.series);
    const type = this.type;
    if (type === 'line' || type === 'tick') {
      this.series = this.chart.addLineSeries({ color: '#202428', lineWidth: 2, priceLineColor: '#111' });
    } else if (type === 'area') {
      this.series = this.chart.addAreaSeries({ lineColor: '#202428', topColor: 'rgba(103,113,119,.28)', bottomColor: 'rgba(103,113,119,.04)', priceLineColor: '#111' });
    } else if (type === 'ohlc') {
      this.series = this.chart.addBarSeries({ upColor: '#00a878', downColor: '#8d0030', priceLineColor: '#111' });
    } else if (type === 'hollow') {
      this.series = this.chart.addCandlestickSeries({
        upColor: 'rgba(255,255,255,0)', downColor: '#8d0030', borderVisible: true,
        borderUpColor: '#00a878', borderDownColor: '#8d0030', wickUpColor: '#00a878', wickDownColor: '#8d0030', priceLineColor: '#111',
      });
    } else {
      this.series = this.chart.addCandlestickSeries({ upColor: '#00a878', downColor: '#8d0030', borderVisible: false, wickUpColor: '#00a878', wickDownColor: '#8d0030', priceLineColor: '#111' });
    }
  }

  _fmt(candle) {
    if (this.type === 'line' || this.type === 'area' || this.type === 'tick') return { time: candle.t, value: candle.c };
    return { time: candle.t, open: candle.o, high: candle.h, low: candle.l, close: candle.c };
  }

  _renderCurrentData() {
    if (this.series && this.candles.length) this.series.setData(this.candles.map((candle) => this._fmt(candle)));
  }

  async load() {
    const isTick = this.type === 'tick';
    const path = isTick
      ? `/market/ticks?symbol=${this.symbol}&count=500`
      : `/market/candles?symbol=${this.symbol}&granularity=${this.granularity}&count=300`;
    const data = await api(path);
    this.candles = isTick
      ? data.ticks.map((tick) => ({ t: tick.t, o: tick.q, h: tick.q, l: tick.q, c: tick.q }))
      : data.candles;
    this._renderCurrentData();
    this.chart.timeScale().fitContent();
    this._renderIndicators();
    this._connectLive();
  }

  async setType(type) {
    this.type = type;
    this._buildMainSeries();
    await this.load();
    this.saveLayout();
  }

  async setSymbol(symbol) { this.symbol = symbol; await this.load(); }
  async setGranularity(value) { this.granularity = value; this.chart.applyOptions(this._theme()); this.osc.applyOptions(this._theme()); await this.load(); }
  toggleIndicator(name, enabled) { enabled ? this.enabled.add(name) : this.enabled.delete(name); this._renderIndicators(); this.saveLayout(); }

  _clearOverlays() {
    Object.values(this.overlays).forEach((series) => this.chart.removeSeries(series));
    Object.values(this.oscSeries).forEach((series) => this.osc.removeSeries(series));
    this.overlays = {};
    this.oscSeries = {};
  }

  _renderIndicators() {
    if (!this.candles.length || !window.Indicators) return;
    this._clearOverlays();
    const candles = this.candles;
    const indicators = window.Indicators;
    const enabled = this.enabled;
    const params = this.params;
    const addLine = (id, data, color, width = 1) => {
      const series = this.chart.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false });
      series.setData(data);
      this.overlays[id] = series;
    };
    if (enabled.has('ma20')) addLine('ma20', indicators.sma(candles, params.ma20.period), '#f59e0b');
    if (enabled.has('ema20')) addLine('ema20', indicators.ema(candles, params.ema20.period), '#00a6c7');
    if (enabled.has('ema50')) addLine('ema50', indicators.ema(candles, params.ema50.period), '#8658b6');
    if (enabled.has('bollinger')) {
      const bands = indicators.bollinger(candles, params.bollinger.period, params.bollinger.mult);
      addLine('bbU', bands.upper, 'rgba(78,94,101,.55)');
      addLine('bbM', bands.mid, 'rgba(78,94,101,.28)');
      addLine('bbL', bands.lower, 'rgba(78,94,101,.55)');
    }
    if (enabled.has('trendline')) {
      const line = indicators.trendline(candles);
      if (line) addLine('tl', line, '#eab308', 2);
    }
    if (enabled.has('sr')) {
      const levels = indicators.levels(candles, params.sr.lookback);
      levels.resistance.forEach((quote, index) => addLine(`r${index}`, [{ time: candles[0].t, value: quote }, { time: candles[candles.length - 1].t, value: quote }], 'rgba(225,31,79,.5)'));
      levels.support.forEach((quote, index) => addLine(`s${index}`, [{ time: candles[0].t, value: quote }, { time: candles[candles.length - 1].t, value: quote }], 'rgba(0,168,120,.5)'));
    }
    const addOsc = (id, data, color) => {
      const series = this.osc.addLineSeries({ color, lineWidth: 1, lastValueVisible: true });
      series.setData(data);
      this.oscSeries[id] = series;
    };
    if (enabled.has('rsi')) addOsc('rsi', indicators.rsi(candles, params.rsi.period), '#00a6c7');
    if (enabled.has('atr')) addOsc('atr', indicators.atr(candles, params.atr.period), '#f59e0b');
    if (enabled.has('macd')) {
      const macd = indicators.macd(candles, params.macd.fast, params.macd.slow, params.macd.signal);
      addOsc('macd', macd.line, '#5f5ed6');
      addOsc('signal', macd.signal, '#e11f4f');
      const hist = this.osc.addHistogramSeries({ color: 'rgba(96,105,111,.45)' });
      hist.setData(macd.hist);
      this.oscSeries.hist = hist;
    }
  }

  _crosshair(param) {
    if (!param.time || !param.seriesData) return;
    const data = param.seriesData.get(this.series);
    if (!data) return;
    this.onReadout({
      time: new Date(param.time * 1000).toLocaleString(),
      o: data.open,
      h: data.high,
      l: data.low,
      c: data.close ?? data.value,
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
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.msg_type === 'tick' && message.tick) {
        const tick = message.tick;
        this._tickCount += 1;
        this.onReadout({ live: true, quote: +tick.quote, bid: tick.bid != null ? +tick.bid : null, ask: tick.ask != null ? +tick.ask : null, tickVol: this._tickCount });
        if (this.type === 'tick') this.series.update({ time: tick.epoch, value: +tick.quote });
      }
      if (message.msg_type === 'ohlc' && message.ohlc) {
        const source = message.ohlc;
        const bar = { time: +source.open_time, open: +source.open, high: +source.high, low: +source.low, close: +source.close };
        if (this.type === 'line' || this.type === 'area') this.series.update({ time: bar.time, value: bar.close });
        else this.series.update(bar);
        const last = this.candles[this.candles.length - 1];
        const normalized = { t: bar.time, o: bar.open, h: bar.high, l: bar.low, c: bar.close };
        if (last && last.t === bar.time) this.candles[this.candles.length - 1] = normalized;
        else { this.candles.push(normalized); if (this.candles.length > 400) this.candles.shift(); }
      }
    };
    this.ws.onclose = () => setTimeout(() => this._connectLive(), 4000);
  }

  fullscreen() {
    const element = this.container.closest('.studio-main,.terminal-shell') || this.container;
    if (!document.fullscreenElement) element.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  destroy() {
    try { this.ws.close(); } catch {}
    this.chart.remove();
    this.osc.remove();
  }
}
window.ChartTerminal = ChartTerminal;
