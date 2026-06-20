// Admin analytics dashboard + admin device/session management. Every series is
// computed by the backend from real users, subscriptions, audit activity and
// the real trade ledger.
window.AdminAnalytics = (function () {
  async function loadGraphs(container) {
    container.innerHTML = '<p class="muted">Loading analytics…</p>';
    let d;
    try { d = await api('/analytics/admin?days=30'); }
    catch (e) { container.innerHTML = `<div class="notice err">${e.message}</div>`; return; }
    const dayLabel = (x) => ({ label: x.t.slice(5), value: x.value });
    container.innerHTML = `
      ${MiniCharts.card('Platform totals', MiniCharts.stats([
        { label:'Users', value: d.totals.users },
        { label:'Active subs', value: d.totals.activeSubscriptions },
        { label:'MRR', value: '$' + d.totals.mrr },
      ]))}
      ${MiniCharts.card('Revenue growth', MiniCharts.line(d.revenueGrowth, { color:'#10b981', area:true }), 'cumulative, last 30d')}
      ${MiniCharts.card('Subscription growth', MiniCharts.line(d.subscriptionGrowth, { color:'#22d3ee', area:true }))}
      ${MiniCharts.card('User growth', MiniCharts.line(d.userGrowth, { color:'#a78bfa', area:true }))}
      ${MiniCharts.card('Daily active users', MiniCharts.bars(d.dau.map(dayLabel), { color:'#6366f1' }))}
      ${MiniCharts.card('Monthly active users', MiniCharts.bars(d.mau.map((x)=>({label:x.t,value:x.value})), { color:'#818cf8' }))}
      ${MiniCharts.card('Scanner activity', MiniCharts.bars(d.scannerActivity.map(dayLabel), { color:'#f59e0b' }))}
      ${MiniCharts.card('Trading activity', MiniCharts.bars(d.tradingActivity.map(dayLabel), { color:'#10b981' }))}
      ${MiniCharts.card('Bot usage', MiniCharts.bars(d.botUsage.map(dayLabel), { color:'#22d3ee' }))}
      ${MiniCharts.card('Copy trading usage', MiniCharts.bars(d.copyUsage.map(dayLabel), { color:'#f43f5e' }))}
      ${d.hasData ? '' : '<div class="mc-empty" style="grid-column:1/-1">Limited data so far — graphs grow as real users, subscriptions and trades accumulate.</div>'}`;
  }

  async function loadDevices(container) {
    container.innerHTML = '<p class="muted">Loading sessions…</p>';
    try {
      const [sessions, susp] = await Promise.all([api('/devices/admin/sessions'), api('/devices/admin/suspicious')]);
      const rows = (sessions.items || []).map((s) => `
        <tr style="${s.revoked?'opacity:.45':''}">
          <td>${s.expand?.user?.email || s.user}</td>
          <td>${s.label || 'Device'}</td>
          <td class="muted-sm">${s.ip || '—'}</td>
          <td class="muted-sm">${s.last_seen ? new Date(s.last_seen).toLocaleString() : '—'}</td>
          <td>${s.revoked ? '<span class="badge warn">revoked</span>' : `<button class="btn danger sm" data-term="${s.id}">Terminate</button>`}</td>
        </tr>`).join('');
      const suspRows = (susp.suspicious || []).map((u) => `<tr><td>${u.email}</td><td>${u.distinctIps}</td><td>${u.devices}</td><td class="muted-sm">${new Date(u.last_seen).toLocaleString()}</td></tr>`).join('');
      container.innerHTML = `
        <div class="card"><h3 style="margin-top:0">Suspicious logins</h3>
          ${susp.suspicious?.length ? `<div class="table-wrap"><table><thead><tr><th>User</th><th>Distinct IPs</th><th>Devices</th><th>Last seen</th></tr></thead><tbody>${suspRows}</tbody></table></div>` : '<div class="mc-empty">No suspicious login patterns detected.</div>'}
        </div>
        <div class="card"><h3 style="margin-top:0">All sessions</h3>
          <div class="table-wrap"><table><thead><tr><th>User</th><th>Device</th><th>IP</th><th>Last seen</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="muted">No sessions recorded yet.</td></tr>'}</tbody></table></div></div>`;
      container.querySelectorAll('button[data-term]').forEach((b) => b.onclick = async () => {
        if (!confirm('Terminate this session?')) return;
        await api(`/devices/admin/terminate/${b.dataset.term}`, { method: 'POST' }); loadDevices(container);
      });
    } catch (e) { container.innerHTML = `<div class="notice err">${e.message}</div>`; }
  }

  return { loadGraphs, loadDevices };
})();
