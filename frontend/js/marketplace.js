// Bot marketplace UI. Browse/search/filter, view detail + reviews, install/buy,
// rate + review, and publish/sell your own validated bots. Downloads, ratings,
// reviews and performance are all real aggregates from the backend.
window.BotMarketplace = (function () {
  let state = { q: '', category: '', sort: 'downloads', canPublish: false, myBots: [] };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const stars = (n) => `<span class="rate">${'★'.repeat(Math.round(n || 0))}<span class="off">${'★'.repeat(5 - Math.round(n || 0))}</span></span>`;

  function emptyMarketplace() {
    return `<div class="empty-upgrade" style="grid-column:1/-1">
      <strong>No published bots yet — that is better than fake stats.</strong><br>
      ApexBot should only rank marketplace bots after validated uploads and backend-recorded performance exist. Until then, users can use the public bot lab, open templates in the builder, and publish only validated bots.
      <div class="row"><a class="btn" href="demo-bots.html">Open bot lab</a><a class="btn ghost" href="bot-builder.html?template=over">Build a bot</a></div>
    </div>`;
  }

  function listingCard(l) {
    const hasHistory = !!l.performance?.hasHistory;
    return `<div class="card marketplace-card">
      <div class="row between"><strong>${esc(l.title)}</strong>
        <span class="badge ${l.risk_rating==='high'?'warn':l.risk_rating==='medium'?'demo':'real'}">${esc(l.risk_rating || 'medium')} risk</span></div>
      <div class="muted-sm">${esc(l.category)} · by ${esc(l.seller)} · ${Number(l.price) > 0 ? '$' + esc(l.price) : 'Free'}</div>
      <div class="row" style="margin:6px 0;font-size:12px">${stars(l.rating)} <span class="muted-sm">${esc(l.rating || 0)} (${esc(l.reviews || 0)})</span>
        <span class="muted-sm">· ${esc(l.downloads || 0)} installs</span></div>
      ${hasHistory
        ? `<div class="muted-sm">Ledger performance: ${esc(l.performance.winRate)}% win · P/L ${MiniCharts.fmt(l.performance.netProfit)} · ${esc(l.performance.trades)} trades</div>`
        : '<div class="muted-sm">No backend trade history recorded yet — not ranked as proven.</div>'}
      ${l.description ? `<p class="muted" style="font-size:12px">${esc(l.description)}</p>` : ''}
      <div class="risk-note">Marketplace stats must come from recorded trades, installs, and reviews. No fabricated testimonials.</div>
      <div class="row">
        <button class="btn ghost sm" data-detail="${esc(l.id)}">Details & reviews</button>
        <button class="btn sm" data-install="${esc(l.id)}" data-paid="${Number(l.price)>0}">${Number(l.price)>0?'Buy':'Install'}</button>
      </div>
      <div id="ld-${esc(l.id)}" class="perf-slot"></div>
    </div>`;
  }

  async function load(container) {
    container.innerHTML = `
      <div class="card" style="grid-column:1/-1">
        <div class="row between"><div><h3 style="margin:0">Bot Marketplace</h3><p class="muted" style="font-size:12px;margin:4px 0 0">Validated bots only. Rankings should use backend records, not screenshots or claims.</p></div>
          ${state.canPublish ? '<button id="pub-btn" class="btn sm">Publish / sell a bot</button>' : '<span class="muted-sm">Standard plan+ to publish</span>'}</div>
        <div class="row" style="margin-top:10px">
          <input id="mp-q" class="input" style="max-width:240px" placeholder="Search bots…">
          <select id="mp-cat" class="input" style="max-width:160px">
            <option value="">All categories</option>
            <option value="trading">Trading Bots</option><option value="signal">Signal Bots</option>
            <option value="ai">AI Bots</option><option value="automation">Automation Bots</option>
          </select>
          <select id="mp-sort" class="input" style="max-width:170px">
            <option value="downloads">Most installed</option><option value="rating">Top rated</option>
            <option value="performance">Best ledger performance</option><option value="price_low">Price: low→high</option>
          </select>
          <a class="btn ghost sm" href="demo-bots.html">Public bot lab</a>
        </div>
        <div id="pub-form"></div>
      </div>
      <div id="mp-list" class="grid cols-2" style="grid-column:1/-1"></div>`;

    const listEl = container.querySelector('#mp-list');
    const render = async () => {
      listEl.innerHTML = '<p class="muted">Loading marketplace…</p>';
      try {
        const { listings } = await api(`/marketplace/listings?q=${encodeURIComponent(state.q)}&category=${state.category}&sort=${state.sort}`);
        listEl.innerHTML = listings.length ? listings.map(listingCard).join('') : emptyMarketplace();
        wire(listEl, render);
      } catch (e) { listEl.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
    };
    container.querySelector('#mp-q').oninput = (e) => { state.q = e.target.value; clearTimeout(window._mpT); window._mpT = setTimeout(render, 300); };
    container.querySelector('#mp-cat').onchange = (e) => { state.category = e.target.value; render(); };
    container.querySelector('#mp-sort').onchange = (e) => { state.sort = e.target.value; render(); };
    if (state.canPublish) container.querySelector('#pub-btn').onclick = () => publishForm(container, render);
    render();
  }

  function wire(listEl, render) {
    listEl.querySelectorAll('button[data-detail]').forEach((b) => b.onclick = () => detail(b.dataset.detail, render));
    listEl.querySelectorAll('button[data-install]').forEach((b) => b.onclick = async () => {
      if (b.dataset.paid === 'true' && !confirm('Buy this bot? A real purchase record will be created.')) return;
      try { const r = await api(`/marketplace/listings/${b.dataset.install}/install`, { method: 'POST' }); alert('Added to your bots' + (r.botId ? '' : ' (no runnable bot attached).')); render(); }
      catch (e) { alert(e.message); }
    });
  }

  async function detail(id, render) {
    const slot = document.getElementById('ld-' + id);
    if (slot.innerHTML) { slot.innerHTML = ''; return; }
    slot.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const { listing } = await api(`/marketplace/listings/${id}`);
      slot.innerHTML = `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
        <div class="muted-sm">Reviews (${esc(listing.reviews || 0)})</div>
        ${listing.reviewList?.length ? listing.reviewList.map((r)=>`<div style="font-size:12px;margin:6px 0"><b>${esc(r.user)}</b> ${stars(r.rating)}<div class="muted">${esc(r.review||'')}</div></div>`).join('') : '<div class="muted-sm">No reviews yet.</div>'}
        <div class="row" style="margin-top:8px">
          <select id="rv-${esc(id)}" class="input" style="max-width:90px"><option value="5">★5</option><option value="4">★4</option><option value="3">★3</option><option value="2">★2</option><option value="1">★1</option></select>
          <input id="rt-${esc(id)}" class="input" style="max-width:200px" placeholder="Write a review…">
          <button class="btn sm" data-review="${esc(id)}">Submit</button>
        </div></div>`;
      slot.querySelector(`button[data-review]`).onclick = async () => {
        try { await api(`/marketplace/listings/${id}/review`, { method:'POST', body: JSON.stringify({ rating:+slot.querySelector('#rv-'+id).value, review: slot.querySelector('#rt-'+id).value }) }); slot.innerHTML=''; render(); }
        catch (e) { alert(e.message); }
      };
    } catch (e) { slot.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
  }

  function publishForm(container, render) {
    const f = container.querySelector('#pub-form');
    if (f.innerHTML) { f.innerHTML = ''; return; }
    f.innerHTML = `<div class="card" style="margin-top:10px">
      <div class="notice demo">Publish only validated bots. Do not describe a bot as profitable unless the backend has recorded trades for it.</div>
      <div class="row">
        <select id="pb-bot" class="input" style="max-width:220px"><option value="">— select your validated bot —</option>${state.myBots.map((b)=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select>
        <input id="pb-title" class="input" style="max-width:200px" placeholder="Listing title">
        <select id="pb-cat" class="input" style="max-width:150px"><option value="trading">Trading</option><option value="signal">Signal</option><option value="ai">AI</option><option value="automation">Automation</option></select>
        <select id="pb-risk" class="input" style="max-width:120px"><option value="low">Low risk</option><option value="medium" selected>Medium</option><option value="high">High</option></select>
        <input id="pb-price" class="input" type="number" min="0" style="max-width:110px" placeholder="Price $ (0=free)">
      </div>
      <textarea id="pb-desc" class="input" style="margin-top:8px" placeholder="Description"></textarea>
      <button id="pb-submit" class="btn sm" style="margin-top:8px">Publish</button>
      <div id="pb-msg"></div></div>`;
    f.querySelector('#pb-submit').onclick = async () => {
      try {
        await api('/marketplace/publish', { method:'POST', body: JSON.stringify({
          botId: f.querySelector('#pb-bot').value || null, title: f.querySelector('#pb-title').value,
          description: f.querySelector('#pb-desc').value, category: f.querySelector('#pb-cat').value,
          price: +f.querySelector('#pb-price').value || 0, risk_rating: f.querySelector('#pb-risk').value,
        }) });
        f.innerHTML = '<div class="notice ok">Published.</div>'; render();
      } catch (e) { f.querySelector('#pb-msg').innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
    };
  }

  return { load, setCanPublish(v) { state.canPublish = v; }, setMyBots(b) { state.myBots = b || []; } };
})();
