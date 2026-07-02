(function () {
  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function apply() {
    const badge = document.getElementById('plan-badge');
    if (badge) {
      badge.className = 'badge real';
      setText(badge, 'OPEN ACCESS');
    }

    const mode = document.getElementById('mode-indicator');
    if (mode && !mode.querySelector('[data-open-access]')) {
      mode.innerHTML = '<span class="badge real" data-open-access>EARLY ACCESS · PLANS COMING SOON</span>';
    }

    const scanMode = document.getElementById('scan-mode');
    if (scanMode) {
      scanMode.className = 'badge real';
      setText(scanMode, 'EARLY ACCESS');
    }

    const meta = document.getElementById('acct-meta');
    if (meta && meta.innerHTML && !meta.innerHTML.includes('Open Early Access')) {
      meta.innerHTML = meta.innerHTML.replace(/Plan:\s*<strong>.*?<\/strong>/i, 'Plan: <strong>Open Early Access</strong>');
    }

    const billingTab = document.querySelector('.tab[data-tab="billing"]');
    setText(billingTab, 'Plans — Coming Soon');

    const billing = document.getElementById('billing-body');
    if (billing && !billing.querySelector('[data-coming-soon]')) {
      billing.innerHTML = `
        <div class="notice ok" data-coming-soon>
          <strong>Open early access is active.</strong><br>
          No subscription is required and no feature is currently locked by a paid plan.
        </div>
        <div class="card" style="margin-top:10px">
          <span class="eyebrow">COMING SOON</span>
          <h3 style="margin:6px 0">Plans and payments</h3>
          <p class="muted" style="font-size:13px;margin:0">Billing will be introduced only after the required APIs, production limits, payment provider, and support workflow are ready. Your current access and saved data remain available.</p>
        </div>`;
    }

    try {
      window.CopyTrading?.setCanCopy(true);
      window.BotMarketplace?.setCanPublish(true);
    } catch {}
  }

  const observer = new MutationObserver(() => requestAnimationFrame(apply));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  apply();
  setTimeout(apply, 500);
  setTimeout(apply, 1500);
})();
