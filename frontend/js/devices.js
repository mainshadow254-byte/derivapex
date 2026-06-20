// Device / session management UI (user side) + a stable device id + heartbeat.
// Lists REAL devices/sessions recorded by the backend; supports removing a
// device and logging out everywhere.
window.Devices = (function () {
  // Stable per-browser device id (local only; the server records sessions).
  function deviceId() {
    let id = localStorage.getItem('apex_device_id');
    if (!id) { id = 'dev-' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16)); localStorage.setItem('apex_device_id', id); }
    return id;
  }

  async function heartbeat() {
    try { return await api('/devices/heartbeat', { method: 'POST', body: JSON.stringify({ deviceId: deviceId() }) }); }
    catch { return null; }
  }

  async function render(container) {
    container.innerHTML = '<p class="muted">Loading devices…</p>';
    let data;
    try { data = await api('/devices/mine'); }
    catch (e) { container.innerHTML = `<div class="notice err">${e.message}</div>`; return; }
    const me = deviceId();
    const rows = (data.devices || []).map((d) => `
      <tr style="${d.revoked ? 'opacity:.45' : ''}">
        <td>${d.label || 'Device'} ${d.device_id === me ? '<span class="badge real">this device</span>' : ''}</td>
        <td class="muted-sm">${d.ip || '—'}</td>
        <td class="muted-sm">${d.last_seen ? new Date(d.last_seen).toLocaleString() : '—'}</td>
        <td>${d.revoked ? '<span class="badge warn">revoked</span>' : '<span class="badge real">active</span>'}</td>
        <td>${d.revoked ? '' : `<button class="btn danger sm" data-rm="${d.id}">Remove</button>`}</td>
      </tr>`).join('');
    container.innerHTML = `
      <div class="row between"><h3 style="margin:0">Active devices & sessions</h3>
        <button id="logout-all" class="btn danger sm">Log out everywhere</button></div>
      <p class="muted-sm">New devices and new sign-in locations are recorded and trigger a security alert. If you don't recognise a device, remove it and change your password.</p>
      <div class="table-wrap"><table><thead><tr><th>Device</th><th>IP</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted">No sessions recorded yet.</td></tr>'}</tbody></table></div>`;
    container.querySelectorAll('button[data-rm]').forEach((b) => b.onclick = async () => {
      if (!confirm('Remove this device/session?')) return;
      await api(`/devices/${b.dataset.rm}`, { method: 'DELETE' }); render(container);
    });
    container.querySelector('#logout-all').onclick = async () => {
      if (!confirm('Log out of ALL devices except this one?')) return;
      await api('/devices/logout-all', { method: 'POST', body: JSON.stringify({ keepDeviceId: me }) }); render(container);
    };
  }

  return { deviceId, heartbeat, render };
})();
