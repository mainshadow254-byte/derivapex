// Content protection: dynamic identifying watermark + copy/right-click guard +
// blur-on-focus-loss. Kept from the original project (anti-copy requirement).
// NOTE: client-side protection deters casual copying only; it is NOT real
// security. All actual security is enforced on the backend.
(function () {
  const PROTECT = {
    watermark: true,      // overlay user-identifying watermark
    blockCopy: true,      // block copy/cut/context-menu/selection
    blurOnBlur: true,     // blur workspace when window loses focus
    blurAmount: '14px',
  };

  function applyWatermark(identity) {
    if (!PROTECT.watermark) return;
    let layer = document.getElementById('apex-watermark');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'apex-watermark';
      Object.assign(layer.style, {
        position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9998',
        opacity: '0.06', overflow: 'hidden',
      });
      document.body.appendChild(layer);
    }
    const text = identity || 'ApexBot';
    const tile = `<div style="transform:rotate(-30deg);font:600 14px system-ui;color:#fff;white-space:nowrap;padding:40px">${text}</div>`;
    layer.innerHTML = Array(120).fill(tile).join('');
    layer.style.display = 'flex';
    layer.style.flexWrap = 'wrap';
  }

  function guardCopy() {
    if (!PROTECT.blockCopy) return;
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('copy', (e) => e.preventDefault());
    document.addEventListener('cut', (e) => e.preventDefault());
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  }

  function guardBlur() {
    if (!PROTECT.blurOnBlur) return;
    window.addEventListener('blur', () => {
      document.body.style.filter = `blur(${PROTECT.blurAmount})`;
      document.body.style.transition = 'filter .15s';
    });
    window.addEventListener('focus', () => { document.body.style.filter = 'none'; });
  }

  // Expose so pages can set the watermark to the verified user's identity
  // (email + telegram) once /api/me returns. No identity is hardcoded.
  window.ContentProtection = {
    init(identity) { applyWatermark(identity); guardCopy(); guardBlur(); },
    setIdentity(identity) { applyWatermark(identity); },
  };
})();
