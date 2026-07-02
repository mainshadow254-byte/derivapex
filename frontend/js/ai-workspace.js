(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const fmt = (value, digits = 4) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits).replace(/0+$/, '').replace(/\.$/, '') : '—';

  function badge(text, tone = 'demo') {
    return `<span class="badge ${tone}">${esc(text)}</span>`;
  }

  function indicator(label, value) {
    return `<div class="ai-indicator"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
  }

  function reason(label, text) {
    if (!text) return '';
    return `<article><h5>${esc(label)}</h5><p>${esc(text)}</p></article>`;
  }

  function renderResult(symbolScan, chart) {
    const safe = !!symbolScan.safe;
    const riskLevel = symbolScan.riskLevel || chart.volatility?.level || 'unknown';
    const decision = safe ? 'Safer candidate' : 'Wait / no new entry';
    const tone = safe ? 'real' : riskLevel === 'high' ? 'warn' : 'demo';
    const indicators = chart.indicators || symbolScan.indicators || {};
    const macd = indicators.macd || {};
    const bollinger = indicators.bollinger || {};
    const stochastic = indicators.stochastic14 || indicators.stochastic || {};
    const reasons = chart.reasons || symbolScan.explain || {};
    const alternative = symbolScan.saferAlternative;

    return `<div class="ai-decision-card">
      <div class="ai-decision-top">
        <div>
          <h3>${esc(symbolScan.symbol || chart.symbol)}</h3>
          <p>${esc(chart.reasons?.selection || symbolScan.reason || symbolScan.rejectionReason || 'Validated live-market analysis.')}</p>
        </div>
        <div class="ai-decision-badges">
          ${badge(decision, tone)}
          ${badge(`${String(riskLevel).toUpperCase()} RISK`, riskLevel === 'high' ? 'warn' : riskLevel === 'low' ? 'real' : 'demo')}
          ${badge(chart.dataSourceLabel || symbolScan.dataSourceLabel || 'LIVE DERIV DATA', 'info')}
        </div>
      </div>
      <div class="ai-metric-grid">
        <div class="ai-metric"><small>Direction</small><strong>${esc(symbolScan.direction || chart.bias || chart.trend?.direction || 'WAIT')}</strong></div>
        <div class="ai-metric"><small>Confidence</small><strong>${esc(symbolScan.confidence ?? chart.confidence ?? '—')}%</strong></div>
        <div class="ai-metric"><small>Risk score</small><strong>${esc(symbolScan.riskScore ?? chart.risk ?? '—')}</strong></div>
        <div class="ai-metric"><small>Safety score</small><strong>${esc(symbolScan.safetyScore ?? '—')}</strong></div>
      </div>
      <div class="ai-indicator-grid">
        ${indicator('EMA 20', fmt(indicators.ema20))}
        ${indicator('EMA 50', fmt(indicators.ema50 || indicators.ema40))}
        ${indicator('EMA 100', fmt(indicators.ema100))}
        ${indicator('MACD', macd.state || '—')}
        ${indicator('MACD histogram', fmt(macd.histogram, 6))}
        ${indicator('RSI 14', fmt(indicators.rsi14, 2))}
        ${indicator('Bollinger width', bollinger.widthPct == null ? '—' : `${fmt(bollinger.widthPct, 3)}%`)}
        ${indicator('Stochastic', stochastic.state || '—')}
        ${indicator('ATR volatility', chart.volatility?.atrPct == null ? (symbolScan.atrLikePct == null ? '—' : `${fmt(symbolScan.atrLikePct, 3)}%`) : `${fmt(chart.volatility.atrPct, 3)}%`)}
        ${indicator('Support', (chart.support || symbolScan.support || []).slice(0, 2).map((value) => fmt(value)).join(', ') || '—')}
        ${indicator('Resistance', (chart.resistance || symbolScan.resistance || []).slice(0, 2).map((value) => fmt(value)).join(', ') || '—')}
        ${indicator('Setup', chart.setup || symbolScan.setup || '—')}
      </div>
      <div class="ai-reasoning">
        ${reason('Why this decision', reasons.selection || symbolScan.reason || symbolScan.rejectionReason)}
        ${reason('Trend and confluence', reasons.trending || reasons.bullish || reasons.bearish)}
        ${reason('Volatility and risk', reasons.volatility || reasons.risk)}
        ${reason('Invalidation', chart.invalidation || symbolScan.invalidation)}
      </div>
      ${alternative ? `<div class="ai-alternative"><strong>Lower-risk alternative: ${esc(alternative.symbol)}</strong><div class="muted" style="font-size:11px;margin-top:4px">Risk: ${esc(alternative.riskLevel || '—')} · Confidence: ${esc(alternative.confidence ?? '—')}%</div><button class="btn ghost sm" type="button" data-ai-alternative="${esc(alternative.symbol)}">Analyze ${esc(alternative.symbol)}</button></div>` : ''}
      <div class="ai-warning">Probabilistic analysis only. A “safer candidate” is not a guaranteed or risk-free trade. Recheck conditions immediately before any decision.</div>
    </div>`;
  }

  async function analyze(symbol) {
    const input = $('ai-focus-symbol');
    const timeframe = $('ai-focus-timeframe');
    const result = $('ai-focus-result');
    const cleanSymbol = String(symbol || input?.value || '').trim().toUpperCase();
    if (!cleanSymbol) return;
    input.value = cleanSymbol;
    result.innerHTML = '<p class="muted">Loading live ticks, candles, indicators, risk checks, and AI-ready reasoning…</p>';
    try {
      const granularity = Number(timeframe.value || 60);
      const [symbolScan, chart] = await Promise.all([
        api(`/scanner/symbol/${encodeURIComponent(cleanSymbol)}`),
        api(`/market/analysis?symbol=${encodeURIComponent(cleanSymbol)}&granularity=${granularity}`),
      ]);
      result.innerHTML = renderResult(symbolScan, chart);
      result.querySelector('[data-ai-alternative]')?.addEventListener('click', (event) => analyze(event.currentTarget.dataset.aiAlternative));
    } catch (error) {
      result.innerHTML = `<div class="notice err">${esc(error.message || 'Could not analyze this market.')}</div>`;
    }
  }

  function mount() {
    const advisor = $('ai-advisor');
    if (!advisor || $('ai-focus-panel')) return;
    advisor.insertAdjacentHTML('beforebegin', `
      <section id="ai-focus-panel" class="ai-focus-panel">
        <div class="ai-focus-head">
          <div><h4>Analyze one market deeply</h4><p class="muted">Combine live scanner safety checks with candle-based EMA, MACD, RSI, Bollinger, stochastic, ATR, support, resistance, and invalidation.</p></div>
          ${badge('OPEN EARLY ACCESS', 'real')}
        </div>
        <div class="ai-focus-controls">
          <input id="ai-focus-symbol" class="input" value="R_100" placeholder="R_100, R_75, BOOM500…" />
          <select id="ai-focus-timeframe" class="input"><option value="60">1 minute</option><option value="300">5 minutes</option><option value="900">15 minutes</option><option value="3600">1 hour</option></select>
          <button id="ai-focus-run" class="btn" type="button">Analyze market</button>
        </div>
        <div id="ai-focus-result" class="ai-focus-result"></div>
      </section>`);
    $('ai-focus-run').addEventListener('click', () => analyze());
    $('ai-focus-symbol').addEventListener('keydown', (event) => { if (event.key === 'Enter') analyze(); });
  }

  const observer = new MutationObserver(() => {
    document.querySelectorAll('#ai-advisor > .card').forEach((card) => card.classList.add('ai-advisor-polished'));
  });

  function init() {
    mount();
    const advisor = $('ai-advisor');
    if (advisor) observer.observe(advisor, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
