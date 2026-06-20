// Admin logic. The frontend only RENDERS what the backend allows. Every action
// is re-checked server-side: admins see management UI, but owner-only endpoints
// reject non-owners even if they craft the request. No role logic lives here.
(async function () {
  const el = (id) => document.getElementById(id);
  if (!Auth.isLoggedIn) { location.href = 'auth.html?mode=login'; return; }

  let me;
  try { me = await api('/me'); } catch { location.href = 'auth.html?mode=login'; return; }

  if (!me.isAdmin) { el('denied').classList.remove('hidden'); return; }
  el('panel').classList.remove('hidden');
  el('role-badge').className = 'badge ' + (me.isOwner ? 'real' : 'demo');
  el('role-badge').textContent = me.isOwner ? 'OWNER' : 'ADMIN';
  ContentProtection.init(`${me.email} · ADMIN`);

  // Tabs
  const ADMIN_TABS = ['analytics','users','subs','telegram','sessions','admins','mode','logs'];
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    ADMIN_TABS.forEach((n) => el('t-' + n).classList.toggle('hidden', n !== t.dataset.tab));
    if (t.dataset.tab === 'analytics') AdminAnalytics.loadGraphs(el('analytics-body'));
    if (t.dataset.tab === 'sessions') AdminAnalytics.loadDevices(el('sessions-body'));
  });

  // Analytics is the default active tab — load it immediately.
  AdminAnalytics.loadGraphs(el('analytics-body'));

  // USERS
  try {
    const list = await api('/admin/users');
    el('users-table').querySelector('tbody').innerHTML = (list.items||[]).map((u)=>`
      <tr><td>${u.email}</td><td>${u.verified?'✅':'—'}</td><td>${u.telegram_username||'—'} ${u.telegram_verified?'✅':''}</td>
      <td>${u.deriv_connected?'✅':'—'}</td>
      <td><button class="btn danger" data-disable="${u.id}">Disable</button></td></tr>`).join('');
    el('users-table').querySelectorAll('button[data-disable]').forEach((b)=>b.onclick=async()=>{
      if(!confirm('Disable this user?')) return;
      await api(`/admin/users/${b.dataset.disable}/disable`, { method:'POST' }); b.closest('tr').style.opacity='.4';
    });
  } catch(e){ el('users-table').querySelector('tbody').innerHTML=`<tr><td colspan="5" class="notice err">${e.message}</td></tr>`; }

  // SUBSCRIPTIONS
  try {
    const subs = await api('/admin/subscriptions');
    el('subs-table').querySelector('tbody').innerHTML = (subs.items||[]).map((s)=>`
      <tr><td>${s.expand?.user?.email||s.user}</td><td>${s.plan}</td><td>${s.status}</td>
      <td>${s.expires_at?new Date(s.expires_at).toDateString():'—'}</td><td>${s.provider||'—'}</td></tr>`).join('')
      || '<tr><td colspan="5" class="muted">No subscriptions yet.</td></tr>';
  } catch(e){ el('subs-msg').innerHTML=`<div class="notice err">${e.message}</div>`; }

  // TELEGRAM
  async function loadTg(){
    try {
      const { pending } = await api('/telegram/pending');
      el('tg-table').querySelector('tbody').innerHTML = pending.map((u)=>`
        <tr><td>${u.email}</td><td>${u.telegram_username}</td><td>${u.telegram_verified?'✅':'⏳ pending'}</td>
        <td><button class="btn ok" data-verify="${u.id}">Mark verified</button></td></tr>`).join('')
        || '<tr><td colspan="4" class="muted">No pending Telegram verifications.</td></tr>';
      el('tg-table').querySelectorAll('button[data-verify]').forEach((b)=>b.onclick=async()=>{
        await api('/telegram/admin-verify', { method:'POST', body: JSON.stringify({ userId:b.dataset.verify, verified:true }) }); loadTg();
      });
    } catch(e){ el('tg-table').querySelector('tbody').innerHTML=`<tr><td colspan="4" class="notice err">${e.message}</td></tr>`; }
  }
  loadTg();

  // ADMINS (owner-only UI; backend also enforces)
  if (me.isOwner) el('admin-owner-only').classList.remove('hidden');
  else el('admins-note').classList.remove('hidden');
  async function loadAdmins(){
    try {
      const data = await api('/admins');
      el('admins-table').querySelector('tbody').innerHTML = (data.admins||[]).map((a)=>`
        <tr><td>${a.email}</td><td>${a.level}</td><td>${a.active?'✅':'⛔'}</td>
        <td>${me.isOwner?`<button class="btn ghost" data-toggle="${a.id}" data-active="${a.active}">${a.active?'Disable':'Enable'}</button>
        <button class="btn danger" data-del="${a.id}">Remove</button>`:''}</td></tr>`).join('')
        || '<tr><td colspan="4" class="muted">No delegated admins. The owner is managed by backend configuration.</td></tr>';
      if (me.isOwner){
        el('admins-table').querySelectorAll('button[data-toggle]').forEach((b)=>b.onclick=async()=>{
          await api(`/admins/${b.dataset.toggle}`, { method:'PATCH', body: JSON.stringify({ active: b.dataset.active!=='true' }) }); loadAdmins();
        });
        el('admins-table').querySelectorAll('button[data-del]').forEach((b)=>b.onclick=async()=>{
          if(!confirm('Remove this admin?')) return;
          await api(`/admins/${b.dataset.del}`, { method:'DELETE' }); loadAdmins();
        });
      }
    } catch(e){ el('admin-msg').innerHTML=`<div class="notice err">${e.message}</div>`; }
  }
  el('add-admin') && (el('add-admin').onclick = async ()=>{
    const email = el('new-admin-email').value.trim();
    if(!email) return;
    try { await api('/admins', { method:'POST', body: JSON.stringify({ email }) }); el('admin-msg').innerHTML='<div class="notice ok">Admin approved.</div>'; el('new-admin-email').value=''; loadAdmins(); }
    catch(e){ el('admin-msg').innerHTML=`<div class="notice err">${e.message}</div>`; }
  });
  loadAdmins();

  // MODE
  async function loadMode(){
    try { const s = await api('/admin/system'); el('mode-now').textContent = s.trading_mode.toUpperCase(); el('mode-now').className='badge '+(s.trading_mode==='real'?'real':'demo'); } catch{}
  }
  el('set-demo').onclick = async ()=>{ await api('/admin/system/mode',{method:'POST',body:JSON.stringify({mode:'demo'})}); loadMode(); };
  el('set-real').onclick = async ()=>{ if(!confirm('Switch GLOBAL mode to REAL? Real trades use live funds.')) return; await api('/admin/system/mode',{method:'POST',body:JSON.stringify({mode:'real'})}); loadMode(); };
  loadMode();

  // LOGS
  try {
    const logs = await api('/admin/logs');
    el('logs-table').querySelector('tbody').innerHTML = (logs.items||[]).map((l)=>`
      <tr><td>${new Date(l.created).toLocaleString()}</td><td>${l.actor_email||l.actor||'system'}</td><td>${l.action}</td><td>${l.target||'—'}</td></tr>`).join('')
      || '<tr><td colspan="4" class="muted">No log entries yet.</td></tr>';
  } catch(e){ el('logs-table').querySelector('tbody').innerHTML=`<tr><td colspan="4" class="notice err">${e.message}</td></tr>`; }
})();
