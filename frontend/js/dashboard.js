// Dashboard logic. EVERYTHING authoritative comes from the backend:
//  - identity, role, plan -> GET /api/me
//  - feature access -> backend returns 402 if not allowed (we don't pre-judge)
// No role/permission/plan is read from localStorage.
(async function () {
  const $ = (s) => document.querySelector(s);
  const el = (id) => document.getElementById(id);

  if (!Auth.isLoggedIn) { location.href = 'auth.html?mode=login'; return; }

  let me;
  try {
    me = await api('/me');
  } catch (e) {
    if (e.status === 403) { location.href = 'verify.html'; return; }
    location.href = 'auth.html?mode=login'; return;
  }
  if (!me.verified) { location.href = 'verify.html?email=' + encodeURIComponent(me.email); return; }

  // Identity-based watermark (anti-copy) — identity from backend, not hardcoded.
  ContentProtection.init(`${me.email} · ${me.telegram_username || 'no-tg'} · ${new Date().toISOString().slice(0,10)}`);

  let publicCfg = null;
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const displayName = () => (me.name || '').trim() || me.email;
  const telegramStatus = () => !me.telegram_username ? 'not linked' : me.telegram_verified ? 'verified' : 'unverified';
  const telegramDisplay = () => me.telegram_username ? `@${me.telegram_username}` : 'Not linked';
  const telegramLink = () => me.telegram_username ? `https://t.me/${encodeURIComponent(me.telegram_username)}` : '';
  const telegramVerifiedDate = () => me.telegram_verified_at ? new Date(me.telegram_verified_at).toLocaleString() : 'Not verified';
  const normalizeTelegramUsername = (value = '') => String(value || '')
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@+/, '')
    .split(/[/?#]/)[0]
    .trim()
    .slice(0, 64);
  function showProfileMessage(text, kind = 'ok') {
    const target = el('profile-msg');
    if (!target) return;
    target.innerHTML = `<div class="notice ${kind}" style="margin-bottom:16px">${safe(text)}</div>`;
    setTimeout(() => { target.innerHTML = ''; }, 5000);
  }
  function renderHeader() {
    el('hello').textContent = `Hi, ${displayName()}`;
    el('acct-meta').innerHTML =
      `Plan: <strong>${safe(me.plan.plan)}</strong> · Telegram: ${telegramStatus()} · Deriv: ${me.deriv_connected ? 'connected' : 'not connected'}`;
  }
  async function getPublicCfg(){
    if (!publicCfg) publicCfg = await loadPublicConfig().catch(() => ({ telegram: {} }));
    return publicCfg;
  }
  async function startTelegramVerification(){
    try {
      const res = await api('/telegram/start-verification', {
        method: 'POST',
        body: JSON.stringify({ telegram: me.telegram_username || '' }),
      });
      if (res.startUrl) {
        window.open(res.startUrl, '_blank', 'noopener');
        alert('Telegram opened. You can finish verification there, then return to ApexBot.');
      } else {
        alert('Telegram bot link is not configured yet. You can keep using the dashboard.');
      }
    } catch (e) {
      alert(e.message || 'Could not start Telegram verification.');
    }
  }
  async function resendVerification(){
    try {
      await api('/auth/start-verification', { method: 'POST', body: JSON.stringify({ userId: me.id }) });
      alert('Verification email sent. Check your inbox and spam folder.');
    } catch (e) {
      alert(e.message || 'Could not resend verification email.');
    }
  }
  function openProfileModal(kind) {
    const modal = el('profile-modal');
    const title = el('profile-modal-title');
    const help = el('profile-modal-help');
    const field = el('profile-field');
    const formMsg = el('profile-form-msg');
    formMsg.innerHTML = '';
    if (kind === 'telegram') {
      title.textContent = 'Edit Telegram username';
      help.textContent = 'Telegram is optional. Recommended for alerts and community access. Save without @; verification stays optional.';
      field.innerHTML = `<label class="label">Telegram username</label><input id="profile-input" class="input" placeholder="yourhandle" value="${safe(me.telegram_username || '')}" />`;
    } else {
      title.textContent = 'Edit profile name';
      help.textContent = 'This name appears in your dashboard greeting and Account Settings.';
      field.innerHTML = `<label class="label">Full name</label><input id="profile-input" class="input" required placeholder="Your full name" value="${safe(me.name || '')}" />`;
    }
    modal.dataset.kind = kind;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    setTimeout(() => el('profile-input')?.focus(), 0);
  }
  function closeProfileModal() {
    const modal = el('profile-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  async function submitProfileModal(event) {
    event.preventDefault();
    const kind = el('profile-modal').dataset.kind;
    const input = el('profile-input');
    const formMsg = el('profile-form-msg');
    const value = input.value.trim();
    if (kind !== 'telegram' && !value) {
      formMsg.innerHTML = '<div class="notice err" style="margin-top:10px">Full name is required.</div>';
      return;
    }
    el('profile-save').disabled = true;
    try {
      const body = kind === 'telegram' ? { telegram_username: normalizeTelegramUsername(value) } : { name: value };
      const res = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) });
      if (kind === 'telegram') {
        me.telegram_username = res.user.telegram_username || '';
        me.telegram_verified = !!res.user.telegram_verified;
        me.telegram_verified_at = res.user.telegram_verified_at || '';
      } else {
        me.name = res.user.name || '';
      }
      renderHeader();
      renderTelegramStatus();
      renderAccountMenu();
      closeProfileModal();
      showProfileMessage(kind === 'telegram' ? 'Telegram username saved.' : 'Profile name updated.', 'ok');
    } catch (e) {
      formMsg.innerHTML = `<div class="notice err" style="margin-top:10px">${safe(e.message || 'Could not save profile.')}</div>`;
    } finally {
      el('profile-save').disabled = false;
    }
  }
  async function openCommunity(){
    const cfg = await getPublicCfg();
    const url = cfg.telegram?.community || cfg.telegram?.secondaryCommunity;
    if (url) window.open(url, '_blank', 'noopener');
    else alert('Telegram community link is not configured yet.');
  }
  async function openTelegramBot(){
    const cfg = await getPublicCfg();
    if (cfg.telegram?.bot) window.open(cfg.telegram.bot, '_blank', 'noopener');
    else alert('Telegram bot link is not configured yet.');
  }
  function openDevices(){
    document.querySelector('.tab[data-tab="devices"]')?.click();
  }
  function renderTelegramStatus(){
    const card = el('telegram-status-card');
    card.classList.remove('hidden');
    const status = telegramStatus();
    const verified = status === 'verified';
    card.className = `notice ${verified ? 'ok' : 'demo'}`;
    card.style.marginBottom = '16px';
    card.innerHTML = verified
      ? `<strong>Telegram Status: VERIFIED</strong><br><span>Telegram Username: <a href="${telegramLink()}" target="_blank" rel="noopener">${safe(telegramDisplay())}</a></span><br><span>Verification Date: ${safe(telegramVerifiedDate())}</span>`
      : `<strong>Telegram Status: ${status.toUpperCase()}</strong><br><span>Telegram Username: ${safe(telegramDisplay())}</span><br><span>Verification Date: ${safe(telegramVerifiedDate())}</span><br><span>Telegram is optional. You can finish this later in Account Settings. Recommended for alerts and community access.</span><br><button id="verify-telegram" class="btn" type="button" style="margin-top:10px">Verify Telegram</button>`;
    const btn = el('verify-telegram');
    if (btn) btn.onclick = startTelegramVerification;
  }
  function renderAccountMenu(){
    const menu = el('account-menu');
    menu.innerHTML = `
      <div style="font-weight:800;margin-bottom:8px">Account Settings</div>
      <div class="muted" style="font-size:12px;margin-bottom:10px">${safe(displayName())}<br>${safe(me.email)}</div>
      <button class="btn ghost" data-action="edit-name" style="width:100%;justify-content:flex-start;margin-bottom:6px">Edit profile name</button>
      <button class="btn ghost" data-action="edit-telegram" style="width:100%;justify-content:flex-start;margin-bottom:6px">Edit Telegram username</button>
      <div class="notice ${me.verified ? 'ok' : 'demo'}" style="font-size:12px;margin:8px 0">Email verification status: ${me.verified ? 'verified' : 'unverified'}</div>
      ${me.verified ? '' : '<button class="btn ghost" data-action="resend-email" style="width:100%;justify-content:flex-start;margin-bottom:6px">Resend verification email</button>'}
      <div class="notice ${me.telegram_verified ? 'ok' : 'demo'}" style="font-size:12px;margin:8px 0">Telegram Status: ${telegramStatus()}<br>Telegram Username: ${safe(telegramDisplay())}<br>Verification Date: ${safe(telegramVerifiedDate())}<br>Telegram is optional.</div>
      <button class="btn ghost" data-action="finish-telegram" style="width:100%;justify-content:flex-start;margin-bottom:6px">Finish Telegram verification</button>
      <button class="btn ghost" data-action="open-bot" style="width:100%;justify-content:flex-start;margin-bottom:6px">Open Telegram bot</button>
      <button class="btn ghost" data-action="join-community" style="width:100%;justify-content:flex-start;margin-bottom:6px">Join Telegram community</button>
      <button class="btn ghost" data-action="deriv" style="width:100%;justify-content:flex-start;margin-bottom:6px">Deriv connect/reconnect</button>
      <button class="btn ghost" data-action="devices" style="width:100%;justify-content:flex-start;margin-bottom:6px">Device/session management</button>
      <button class="btn danger" data-action="logout" style="width:100%;justify-content:center">Logout</button>
    `;
    menu.querySelectorAll('[data-action]').forEach((button) => {
      button.onclick = async () => {
        const action = button.dataset.action;
        if (action === 'edit-name') openProfileModal('name');
        if (action === 'edit-telegram') openProfileModal('telegram');
        if (action === 'resend-email') resendVerification();
        if (action === 'finish-telegram') startTelegramVerification();
        if (action === 'open-bot') openTelegramBot();
        if (action === 'join-community') openCommunity();
        if (action === 'deriv') {
          const url = window.DerivOnboard ? await DerivOnboard.oauthUrl() : 'deriv-callback.html';
          location.href = url;
        }
        if (action === 'devices') openDevices();
        if (action === 'logout') { Auth.logout(); location.href = 'index.html'; }
      };
    });
  }

  // Header
  renderHeader();
  const paid = me.plan.rank >= 1;
  el('plan-badge').className = 'badge ' + (paid ? 'real' : 'demo');
  el('plan-badge').textContent = paid ? me.plan.plan.toUpperCase() : 'FREE / DEMO';
  el('mode-indicator').innerHTML = paid
    ? `<span class="badge real">REAL TOOLS ENABLED</span>`
    : `<span class="badge demo">DEMO MODE — preview only</span>`;

  // Deriv onboarding: show the connect/create card whenever the user has NOT
  // connected a Deriv account (required for real trading / real account data).
  if (!me.deriv_connected && window.DerivOnboard) {
    DerivOnboard.mount(el('deriv-onboard'));
  } else { el('deriv-onboard').innerHTML = ''; }

  // Admin link visibility is driven by backend role (still backend-enforced server-side).
  if (me.isAdmin) el('admin-link').classList.remove('hidden');

  renderTelegramStatus();
  renderAccountMenu();
  el('profile-form').onsubmit = submitProfileModal;
  el('profile-cancel').onclick = closeProfileModal;
  el('profile-modal').onclick = (event) => { if (event.target === el('profile-modal')) closeProfileModal(); };
  el('account-menu-btn').onclick = () => el('account-menu').classList.toggle('hidden');
  document.addEventListener('click', (event) => {
    if (!el('account-menu').contains(event.target) && event.target !== el('account-menu-btn')) el('account-menu').classList.add('hidden');
  });
  el('open-tour').onclick = () => ApexOnboarding.open(true);
  ApexOnboarding.open();

  // Record this device/session (real heartbeat) + notification bell.
  Devices.heartbeat();
  Notifications.badge(el('bell'));
  el('bell').onclick = () => { document.querySelector('.tab[data-tab="notifications"]').click(); };

  // Module capability flags from the backend-resolved plan.
  CopyTrading.setCanCopy(me.plan.rank >= 2);
  BotMarketplace.setCanPublish(me.plan.rank >= 2);

  const TABS = ['scanner','overview','charts','analytics','copy','bots','marketplace','notifications','devices','billing'];
  // Tabs (lazy-load heavier panels on first open).
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.dataset.tab;
    TABS.forEach((n) => el('t-' + n).classList.toggle('hidden', n !== tab));
    if (tab === 'overview' && window.MarketOverview) MarketOverview.load(el('overview-body'));
    if (tab === 'analytics') UserAnalytics.load(el('analytics-body'));
    if (tab === 'copy') CopyTrading.load(el('copy-body'));
    if (tab === 'marketplace') BotMarketplace.load(el('marketplace-body'));
    if (tab === 'notifications') { Notifications.renderFeed(el('notif-feed')); Notifications.renderPrefs(el('notif-prefs')); }
    if (tab === 'devices') Devices.render(el('devices-body'));
  });

  // ---------- SCANNER ----------
  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }
  function advisorBlock(advisor){
    if(!advisor) return '';
    if (advisor.setupRequired) {
      return `<div class="card" style="border-color:#f59e0b;margin:10px 0">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong>AI Market Advisor</strong><span class="badge demo">AI SETUP REQUIRED</span></div>
        <div class="notice demo" style="margin-top:8px">${escapeHtml(advisor.summary || 'AI setup required.')}</div>
        <div class="muted" style="font-size:12px;margin-top:8px">AI analysis has not been configured by the service administrator. The deterministic scanner remains available.</div>
      </div>`;
    }
    const source = advisor.source === 'openai' ? `OPENAI ${advisor.model || ''}` : 'SAFETY ENGINE';
    const tone = advisor.marketState === 'volatile' || advisor.action === 'avoid' ? '#ef4444' : advisor.action === 'wait' ? '#f59e0b' : '#10b981';
    const rationale = (advisor.rationale || []).map((item)=>`<li>${escapeHtml(item)}</li>`).join('');
    return `<div class="card" style="border-color:${tone};margin:10px 0">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong>AI Market Advisor</strong><span class="badge ${advisor.source === 'openai' ? 'real' : 'demo'}">${escapeHtml(source.trim())}</span></div>
      <div style="font-size:14px;margin-top:7px">${escapeHtml(advisor.summary)}</div>
      ${advisor.volatileMarket?`<div class="notice err" style="margin-top:8px"><b>Volatility warning:</b> Avoid ${escapeHtml(advisor.volatileMarket)} for a new entry right now.</div>`:''}
      ${advisor.saferAlternative?`<div class="notice ok" style="margin-top:8px"><b>Lower-risk alternative:</b> ${escapeHtml(advisor.saferAlternative)} passed the current backend safety checks.</div>`:''}
      ${rationale?`<ul style="font-size:12px;margin:8px 0 0;padding-left:20px">${rationale}</ul>`:''}
      <div class="muted" style="font-size:11px;margin-top:8px">${escapeHtml(advisor.warning)} ${escapeHtml(advisor.disclaimer)}</div>
    </div>`;
  }
  function riskBadge(level){ return level==='high'?'<span class="badge warn">HIGH RISK</span>':level==='medium'?'<span class="badge demo">MEDIUM</span>':'<span class="badge real">LOW</span>'; }
  function explainBlock(x){
    if(!x) return '';
    const row=(label,txt)=>txt?`<div style="margin:5px 0;font-size:12px"><b>${label}:</b> ${txt}</div>`:'';
    return `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer;font-size:12px">Full scanner reasoning</summary>
      <div style="margin-top:6px;border-left:2px solid var(--brand);padding-left:10px">
        ${row('Why selected',x.selection)}
        ${row('Why trending',x.trending)}
        ${row('Why bullish',x.bullish)}
        ${row('Why bearish',x.bearish)}
        ${row('Volatility',x.volatility)}
        ${row('Confidence',x.confidence)}
        ${row('Risk',x.risk)}
        ${row('Entry reasoning',x.entry)}
        ${row('Exit reasoning',x.exit)}
      </div></details>`;
  }
  function levelsBlock(m){
    const s=(m.support||[]).map(v=>(+v).toFixed(4)).join(', ');
    const r=(m.resistance||[]).map(v=>(+v).toFixed(4)).join(', ');
    if(!s && !r) return '';
    return `<div class="muted" style="font-size:12px;margin-top:6px">🟢 Support: ${s||'—'} · 🔴 Resistance: ${r||'—'}</div>`;
  }
  function marketCard(m){
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${m.symbol}</strong> ${riskBadge(m.riskLevel)}
      </div>
      <div class="muted" style="font-size:13px;margin:6px 0">Direction: <strong>${m.direction}</strong> · Confidence: <strong>${m.confidence ?? '—'}%</strong></div>
      ${m.reason?`<div style="font-size:13px">${m.reason}</div>`:''}
      ${levelsBlock(m)}
      ${explainBlock(m.explain)}
      ${m.invalidation?`<div class="muted" style="font-size:12px;margin-top:6px">Invalidation: ${m.invalidation}</div>`:''}
      ${m.locked?`<div class="notice demo" style="font-size:12px">Upgrade to see confidence, full reasoning, S/R & invalidation.</div>`:''}
      <div class="muted" style="font-size:11px;margin-top:6px">${m.riskWarning||'No outcome is guaranteed.'}</div>
    </div>`;
  }
  async function runScan(){
    el('scan-results').innerHTML = '<p class="muted">Scanning live markets…</p>';
    el('ai-advisor').innerHTML = '';
    el('scan-warning').innerHTML = '';
    try {
      const endpoint = paid ? '/scanner/full' : '/scanner/demo';
      const r = await api(endpoint);
      el('scan-mode').className = 'badge ' + (r.mode==='real'?'real':'demo');
      el('scan-mode').textContent = r.mode.toUpperCase();
      el('ai-advisor').innerHTML = advisorBlock(r.advisor);
      if (r.warning) {
        const a = r.alternativeAnalysis;
        el('scan-warning').innerHTML = `<div class="notice err">⚠️ ${r.warning}</div>` + (a ? `
          <div class="card" style="border-color:#f59e0b">
            <strong>Alternative Market Analysis</strong>
            <div style="font-size:13px;margin-top:6px"><b>Why ${a.unsafeMarket} is unsafe:</b> ${a.whyUnsafe}</div>
            <div style="font-size:13px;margin-top:4px"><b>Risks:</b> ${a.risks}</div>
            ${a.alternative?`<div style="font-size:13px;margin-top:4px"><b>Suggested alternative:</b> ${a.alternative}</div>`:''}
            <div style="font-size:13px;margin-top:4px"><b>Why it's better:</b> ${a.whyBetter}</div>
          </div>` : '');
      }
      const list = r.markets || [];
      if (!list.length) { el('scan-results').innerHTML = '<p class="muted">Not enough live data yet — markets warm up after ~1–2 minutes of ticks. The scanner never invents signals.</p>'; return; }
      let html = '';
      if (r.best) html += `<div class="card" style="grid-column:1/-1;border-color:#6366f1"><div class="muted" style="font-size:12px">TOP PICK</div>${marketCard(r.best).replace('<div class="card">','<div>').replace(/<\/div>$/,'</div>')}</div>`;
      html += list.map(marketCard).join('');
      el('scan-results').innerHTML = html;
    } catch (e) {
      el('scan-results').innerHTML = `<div class="notice err">${e.message}${e.status===402?' — upgrade your plan to use the full scanner.':''}</div>`;
    }
  }
  el('rescan').onclick = runScan;
  runScan();
  setInterval(() => { if(!el('t-scanner').classList.contains('hidden')) runScan(); }, 20000);

  // ---------- CHARTS ----------
  const cfg = await getPublicCfg();
  let chart;
  try {
    const m = await api('/trading/markets');
    const sel = el('symbol-select');
    sel.innerHTML = m.tracked.map((s)=>`<option>${s}</option>`).join('');
    chart = new LiveChart(el('chart'), m.tracked[0], cfg.derivAppId);
    chart.connect();
    sel.onchange = () => chart.setSymbol(sel.value);
  } catch {}

  // ---------- BOTS ----------
  async function loadBots(){
    try {
      const { bots } = await api('/bots');
      // Share the user's bots with the marketplace publish form.
      BotMarketplace.setMyBots(bots.filter((b)=>b.validated));
      el('bots-table').querySelector('tbody').innerHTML = bots.map((b)=>`
        <tr><td>${b.name}</td><td>${b.symbol||'—'}</td><td>${b.status}</td>
        <td>${b.validated?`<button class="btn ${b.status==='running'?'danger':'ok'}" data-bot="${b.id}" data-act="${b.status==='running'?'stop':'start'}">${b.status==='running'?'Stop':'Start'}</button> <button class="btn ghost sm" data-perf="${b.id}" data-name="${b.name}">Performance</button>`:'<span class="badge warn">invalid</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No bots imported.</td></tr>';
      el('bots-table').querySelectorAll('button[data-bot]').forEach((btn)=>btn.onclick=async()=>{
        try { await api(`/bots/${btn.dataset.bot}/${btn.dataset.act}`, { method:'POST' }); loadBots(); }
        catch(e){ el('bot-msg').innerHTML=`<div class="notice err">${e.message}</div>`; }
      });
      el('bots-table').querySelectorAll('button[data-perf]').forEach((btn)=>btn.onclick=()=>loadBotPerf(btn.dataset.bot, btn.dataset.name));
    } catch (e) { el('bots-table').querySelector('tbody').innerHTML = `<tr><td colspan="4" class="notice err">${e.message}</td></tr>`; }
  }

  // ---------- BOT PERFORMANCE GRAPHS (real, from recorded bot trades) -------
  async function loadBotPerf(botId, name){
    const wrap = el('bot-perf');
    wrap.innerHTML = '<p class="muted">Loading bot performance…</p>';
    try {
      const d = await api(`/analytics/bot/${botId}`);
      if (!d.hasData) { wrap.innerHTML = `<div class="mc-empty">No recorded trades for "${name}" yet. Performance graphs populate once the bot executes trades.</div>`; return; }
      const s = d.summary;
      wrap.innerHTML = `<div class="grid cols-2">
        ${MiniCharts.card(`${name} — summary`, MiniCharts.stats([
          { label:'Trades', value: s.total }, { label:'Win rate', value: s.winRate+'%' },
          { label:'Net P/L', value: MiniCharts.fmt(s.netProfit), tone: s.netProfit>=0?'up':'down' },
          { label:'Max DD', value: d.maxDrawdown+'%', tone:'down' },
        ]))}
        ${MiniCharts.card('Profit history', MiniCharts.line(d.profitHistory, { color:'#10b981', area:true }))}
        ${MiniCharts.card('Win-rate trend', MiniCharts.line(d.winRateTrend.map(x=>({t:x.t,value:x.winRate})), { color:'#a78bfa' }))}
        ${MiniCharts.card('Drawdown', MiniCharts.line(d.drawdownCurve, { color:'#f43f5e' }))}
        ${MiniCharts.card('Activity (trades/day)', MiniCharts.bars(d.activity.map(x=>({label:x.t.slice(5),value:x.value})), { color:'#22d3ee' }))}
        ${MiniCharts.card('Performance over time', MiniCharts.line(d.performanceOverTime, { color:'#6366f1', area:true }))}
      </div>`;
    } catch (e) { wrap.innerHTML = `<div class="notice err">${e.message}</div>`; }
  }
  el('import-bot').onclick = async () => {
    const f = el('bot-file').files[0];
    if (!f) return el('bot-msg').innerHTML = '<div class="notice err">Choose a file first.</div>';
    const content = await f.text();
    try {
      const r = await api('/bots/import', { method:'POST', body: JSON.stringify({ filename: f.name, content }) });
      el('bot-msg').innerHTML = `<div class="notice ok">Imported & validated.${r.warnings?.length?' Warnings: '+r.warnings.join(' '):''}</div>`;
      loadBots();
    } catch (e) {
      const errs = e.body?.errors ? '<ul>'+e.body.errors.map((x)=>`<li>${x}</li>`).join('')+'</ul>' : '';
      el('bot-msg').innerHTML = `<div class="notice err">${e.message}${errs}</div>`;
    }
  };
  loadBots();

  // ---------- BILLING ----------
  try {
    const { subscriptions } = await api('/payments/me');
    const active = subscriptions.find((s)=>s.status==='active');
    el('billing-body').innerHTML = active
      ? `<div class="notice ok">Active: <strong>${active.plan}</strong> until ${new Date(active.expires_at).toDateString()}</div>`
      : `<div class="notice demo">No active subscription. You're on Free / Demo.</div>`;
    el('billing-body').innerHTML += `<a class="btn" href="index.html#plans" style="margin-top:8px">View plans</a>`;
  } catch (e) { el('billing-body').innerHTML = `<div class="notice err">${e.message}</div>`; }
})();
