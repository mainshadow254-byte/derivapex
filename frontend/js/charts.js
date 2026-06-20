// Live, responsive tick chart from Deriv's PUBLIC websocket (market data only —
// no auth, no secrets). Smooth, mobile-friendly canvas rendering.
class LiveChart {
  constructor(canvas, symbol, appId) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.symbol = symbol;
    this.appId = appId || '1089';
    this.data = [];
    this.max = 180;
    this.ws = null;
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
    this.draw();
  }

  connect() {
    this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`);
    this.ws.onopen = () => this.ws.send(JSON.stringify({ ticks: this.symbol, subscribe: 1 }));
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.msg_type === 'tick' && m.tick) {
        this.data.push(parseFloat(m.tick.quote));
        if (this.data.length > this.max) this.data.shift();
        this.draw();
      }
    };
    this.ws.onclose = () => setTimeout(() => this.connect(), 4000);
  }

  setSymbol(symbol) {
    this.data = [];
    try { this.ws && this.ws.close(); } catch {}
    this.symbol = symbol;
    this.connect();
  }

  draw() {
    const { ctx, w, h, data } = this;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) {
      ctx.fillStyle = '#64748b'; ctx.font = '12px system-ui';
      ctx.fillText('Connecting to live market…', 12, 20);
      return;
    }
    const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
    const stepX = w / (this.max - 1);
    const y = (v) => h - ((v - min) / range) * (h - 20) - 10;
    const up = data[data.length - 1] >= data[0];
    // area fill
    ctx.beginPath();
    data.forEach((v, i) => { const px = i * stepX, py = y(v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.lineTo((data.length - 1) * stepX, h); ctx.lineTo(0, h); ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, up ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fill();
    // line
    ctx.beginPath();
    data.forEach((v, i) => { const px = i * stepX, py = y(v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.strokeStyle = up ? '#10b981' : '#f43f5e'; ctx.lineWidth = 2; ctx.stroke();
    // last price
    ctx.fillStyle = up ? '#10b981' : '#f43f5e'; ctx.font = '600 13px system-ui';
    ctx.fillText(data[data.length - 1].toFixed(4), w - 90, 18);
  }
}
window.LiveChart = LiveChart;
