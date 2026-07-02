(function () {
  const button = document.getElementById('builder-deriv-account');
  const menu = document.getElementById('builder-deriv-menu');
  if (!button || !menu) return;

  let status = { connected: false, loginid: '', currency: '' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));

  function renderButton() {
    button.classList.toggle('connected', status.connected);
    button.textContent = status.connected
      ? `${status.loginid || 'Deriv connected'}${status.currency ? ` · ${status.currency}` : ''}`
      : 'Connect Deriv';
  }

  function renderMenu() {
    if (!window.Auth?.isLoggedIn) {
      menu.innerHTML = `
        <strong>Connect a Deriv account</strong>
        <p>Log in to ApexBot first. Deriv authorization stays on Deriv's secure domain and the token is stored by the backend.</p>
        <a href="auth.html?mode=login&next=bot-builder.html">Log in to continue</a>`;
      return;
    }

    if (status.connected) {
      menu.innerHTML = `
        <strong>${esc(status.loginid || 'Deriv account connected')}</strong>
        <p>${status.currency ? `Account currency: ${esc(status.currency)}. ` : ''}ApexBot never displays or stores the raw token in this page.</p>
        <button type="button" data-account-action="reconnect">Reconnect account</button>
        <button type="button" data-account-action="disconnect">Disconnect</button>
        <a href="dashboard.html">Open dashboard</a>`;
    } else {
      menu.innerHTML = `
        <strong>Connect your Deriv account</strong>
        <p>ApexBot stays open while Deriv handles secure authorization. API-token fallback remains available if the browser blocks the popup.</p>
        <button type="button" data-account-action="connect">Connect with Deriv</button>
        <a data-deriv-affiliate>Create Deriv account</a>`;
      window.DerivOnboard?.wireAffiliate(menu);
    }

    menu.querySelector('[data-account-action="connect"]')?.addEventListener('click', connect);
    menu.querySelector('[data-account-action="reconnect"]')?.addEventListener('click', connect);
    menu.querySelector('[data-account-action="disconnect"]')?.addEventListener('click', disconnect);
  }

  async function loadStatus() {
    if (!window.Auth?.isLoggedIn) {
      status = { connected: false, loginid: '', currency: '' };
      renderButton();
      renderMenu();
      return;
    }
    try {
      status = await api('/deriv/status');
    } catch {
      status = { connected: false, loginid: '', currency: '' };
    }
    renderButton();
    renderMenu();
  }

  async function connect() {
    menu.classList.add('hidden');
    if (!window.DerivOnboard) {
      location.href = 'deriv-callback.html';
      return;
    }
    const result = await DerivOnboard.openOAuth({ trigger: button });
    if (result?.ok) await loadStatus();
  }

  async function disconnect() {
    const target = menu.querySelector('[data-account-action="disconnect"]');
    if (target) target.disabled = true;
    try {
      await api('/deriv/disconnect', { method: 'POST' });
      status = { connected: false, loginid: '', currency: '' };
      renderButton();
      renderMenu();
    } catch (error) {
      menu.insertAdjacentHTML('beforeend', `<p style="color:#fca5a5">${esc(error.message || 'Could not disconnect Deriv.')}</p>`);
    }
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    renderMenu();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && event.target !== button) menu.classList.add('hidden');
  });
  window.addEventListener('apex:deriv-connected', loadStatus);
  loadStatus();
})();
