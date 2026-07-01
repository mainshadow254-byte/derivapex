(function(){
  const key = 'apexbot_requests_v1';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function read(){ try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
  function write(rows){ localStorage.setItem(key, JSON.stringify(rows.slice(0, 20))); }
  function render(){
    const rows = read();
    const list = $('request-list');
    list.innerHTML = rows.length ? rows.map((r, i)=>'<article class="card"><div class="row between"><strong>'+esc(r.name)+'</strong><button class="btn ghost sm" data-del="'+i+'" type="button">Remove</button></div><p class="muted">'+esc(r.market || 'Any market')+' · '+esc(r.contract || 'Any contract')+'</p><p>'+esc(r.notes || '')+'</p><small class="muted-sm">Saved '+esc(r.created)+'</small></article>').join('') : '<p class="muted">No requests saved yet.</p>';
    document.querySelectorAll('[data-del]').forEach((b)=>b.onclick=()=>{ const next = read(); next.splice(+b.dataset.del, 1); write(next); render(); });
  }
  if (window.DEMO) DEMO.mountChrome('request-strategy.html');
  $('request-form').onsubmit = (event) => {
    event.preventDefault();
    const rows = read();
    rows.unshift({ name:$('req-name').value.trim(), market:$('req-market').value.trim(), contract:$('req-contract').value.trim(), notes:$('req-notes').value.trim(), created:new Date().toLocaleString() });
    write(rows);
    $('request-msg').innerHTML = '<div class="notice ok" style="margin-top:10px">Request saved on this device. Open support to send it to admin/community.</div>';
    $('request-form').reset();
    render();
  };
  render();
})();
