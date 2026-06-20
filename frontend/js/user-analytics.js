// User analytics graphs — trading performance, win-rate trend, P/L trend,
// scanner usage, bot performance, copy performance. All from the backend's real
// computation over the user's recorded trades + audit activity.
window.UserAnalytics = (function () {
  async function load(container) {
    container.innerHTML = '<p class="muted">Loading your analytics…</p>';
    let d;
    try { d = await api('/analytics/me'); }
    catch (e) { container.innerHTML = `<div class="notice err">${e.message}</div>`; return; }
    if (!d.hasData) {
      container.innerHTML = '<div class="mc-empty">No trading activity yet. Place demo or real trades and your performance graphs will populate from real records.</div>';
      return;
    }
    const s = d.summary;
    const tone = (v) => v > 0 ? 'up' : v < 0 ? 'down' : '';
    container.innerHTML = `
      ${MiniCharts.card('Performance summary', MiniCharts.stats([
        { label:'Trades', value: s.total },
        { label:'Win rate', value: s.winRate + '%' },
        { label:'Net P/L', value: MiniCharts.fmt(s.netProfit), tone: tone(s.netProfit) },
        { label:'Profit factor', value: s.profitFactor },
        { label:'Max DD', value: d.maxDrawdown + '%', tone:'down' },
      ]))}
      ${MiniCharts.card('Equity curve', MiniCharts.line(d.equityCurve, { color:'#22d3ee', area:true }))}
      ${MiniCharts.card('Profit / loss trend (cumulative)', MiniCharts.line(d.profitCurve, { color:'#10b981', area:true }))}
      ${MiniCharts.card('Win-rate trend', MiniCharts.line(d.winRateTrend.map((x)=>({t:x.t,value:x.winRate})), { color:'#a78bfa' }))}
      ${MiniCharts.card('Drawdown', MiniCharts.line(d.drawdownCurve, { color:'#f43f5e' }))}
      ${MiniCharts.card('Monthly returns', MiniCharts.bars(d.monthlyReturns.map((m)=>({label:m.month,value:m.profit}))))}
      ${MiniCharts.card('Scanner usage', MiniCharts.bars(d.scannerUsage.map((x)=>({label:x.t.slice(5),value:x.value})), { color:'#6366f1' }))}
      ${MiniCharts.card('Bot performance', MiniCharts.stats([
        { label:'Bot trades', value: d.botPerformance.total },
        { label:'Win rate', value: d.botPerformance.winRate + '%' },
        { label:'Net P/L', value: MiniCharts.fmt(d.botPerformance.netProfit), tone: tone(d.botPerformance.netProfit) },
      ]))}
      ${MiniCharts.card('Copy performance', MiniCharts.stats([
        { label:'Copy trades', value: d.copyPerformance.total },
        { label:'Win rate', value: d.copyPerformance.winRate + '%' },
        { label:'Net P/L', value: MiniCharts.fmt(d.copyPerformance.netProfit), tone: tone(d.copyPerformance.netProfit) },
      ]))}`;
  }
  return { load };
})();
