// Notification center UI. Renders the REAL notification feed and per-type
// preference switches from the backend. Nothing is mocked.
window.Notifications = (function () {
  const TYPE_LABELS = {
    market: 'Market Alerts', scanner: 'Scanner Alerts', volatility: 'Volatility Alerts',
    trading: 'Trading Alerts', copy: 'Copy Trading Alerts', bot: 'Bot Alerts',
    telegram: 'Telegram Alerts', payment: 'Payment Alerts', subscription: 'Subscription Alerts',
    security: 'Security Alerts',
  };
  let feedFlash = null;

  async function badge(el) {
    try {
      const { unread } = await api('/notifications/unread-count');
      el.querySelector('.count')?.remove();
      if (unread > 0) {
        const c = document.createElement('span');
        c.className = 'count'; c.textContent = unread > 99 ? '99+' : unread;
        el.appendChild(c);
      }
    } catch {}
  }

  async function renderFeed(container) {
    container.innerHTML = '<p class="muted">Loading notifications…</p>';
    let data;
    try { data = await api('/notifications?page=1'); }
    catch (e) { container.innerHTML = `<div class="notice err">${e.message}</div>`; return; }
    const items = data.items || [];
    const head = `<div class="row between" style="margin-bottom:10px">
      <strong>Notifications ${data.unread ? `(${data.unread} unread)` : ''}</strong>
      <button id="mark-all" class="btn ghost sm">Mark all read</button></div>`;
    const flash = feedFlash ? `<div class="notice ${feedFlash.kind}" style="margin-bottom:10px">${feedFlash.text}</div>` : '';
    feedFlash = null;
    if (!items.length) { container.innerHTML = head + flash + '<div class="mc-empty">No notifications yet. Real events (trades, payments, security, bots, copy trading) will appear here.</div>'; wire(container, data); return; }
    container.innerHTML = head + flash + items.map((n) => `
      <div class="notif ${n.read ? '' : 'unread'}" data-id="${n.id}">
        <span class="dot ${n.severity}"></span>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <strong style="font-size:13px">${n.title}</strong>
            <span class="muted-sm">${new Date(n.created).toLocaleString()}</span>
          </div>
          <div class="muted" style="font-size:13px">${n.body || ''}</div>
          <span class="badge ${n.severity === 'critical' ? 'crit' : n.severity === 'warning' ? 'demo' : n.severity === 'success' ? 'real' : 'info'}" style="margin-top:4px;display:inline-block">${TYPE_LABELS[n.type] || n.type}</span>
        </div>
      </div>`).join('');
    wire(container, data);
  }

  function refreshBadge() {
    const bell = document.getElementById('bell');
    if (bell) badge(bell);
  }

  function wire(container, data = {}) {
    container.querySelector('#mark-all') && (container.querySelector('#mark-all').onclick = async (event) => {
      const btn = event.currentTarget;
      if (!data.unread) {
        feedFlash = { kind: 'demo', text: 'No unread notifications.' };
        renderFeed(container);
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Marking...';
      try {
        const result = await api('/notifications/read-all', { method: 'POST' });
        feedFlash = result.marked > 0
          ? { kind: 'ok', text: 'All notifications marked as read.' }
          : { kind: 'demo', text: 'No unread notifications.' };
        refreshBadge();
        renderFeed(container);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Mark all read';
        feedFlash = { kind: 'err', text: e.message || 'Could not mark notifications as read.' };
        renderFeed(container);
      }
    });
    container.querySelectorAll('.notif.unread').forEach((row) => row.onclick = async () => {
      try {
        await api('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [row.dataset.id] }) });
        row.classList.remove('unread');
        refreshBadge();
      } catch (e) {
        feedFlash = { kind: 'err', text: e.message || 'Could not mark notification as read.' };
        renderFeed(container);
      }
    });
  }

  async function renderPrefs(container) {
    container.innerHTML = '<p class="muted">Loading preferences…</p>';
    let data;
    try { data = await api('/notifications/prefs'); }
    catch (e) { container.innerHTML = `<div class="notice err">${e.message}</div>`; return; }
    container.innerHTML = `<p class="muted" style="font-size:13px">Enable or disable each notification type. Security alerts are always delivered for your account safety.</p>` +
      data.types.map((t) => {
        const on = data.prefs[t] !== false;
        const locked = t === 'security';
        return `<div class="toggle-row">
          <span>${TYPE_LABELS[t] || t}${locked ? ' <span class="muted-sm">(always on)</span>' : ''}</span>
          <div class="switch ${on ? 'on' : ''}" data-type="${t}" ${locked ? 'style="opacity:.5;pointer-events:none"' : ''}></div>
        </div>`;
      }).join('');
    container.querySelectorAll('.switch').forEach((sw) => sw.onclick = async () => {
      const t = sw.dataset.type; const next = !sw.classList.contains('on');
      sw.classList.toggle('on', next);
      try { await api('/notifications/prefs', { method: 'POST', body: JSON.stringify({ prefs: { [t]: next } }) }); }
      catch { sw.classList.toggle('on', !next); }
    });
  }

  return { badge, renderFeed, renderPrefs };
})();
