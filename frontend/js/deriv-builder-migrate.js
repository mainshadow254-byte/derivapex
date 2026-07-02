(function () {
  const key = 'apexbot_visual_strategy_v1';
  const version = 4;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    if (Number(saved.uiLayoutVersion || 0) >= version) return;
    const hiddenTypes = ['ai_signal','ai_trend','ai_volatility','ai_approval','template_marker','browser_alert','telegram_alert','market_filter','duration','stake'];
    let blocks = Array.isArray(saved.blocks) ? saved.blocks.filter((block) => block && !hiddenTypes.includes(block.type)) : [];
    if (!blocks.length) return;
    const preferred = ['start','trade_parameters','purchase_conditions','sell_conditions','restart_conditions','risk_management'];
    blocks.sort((a, b) => {
      const ai = preferred.indexOf(a.type);
      const bi = preferred.indexOf(b.type);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    blocks.forEach((block, index) => {
      block.x = 70 + (index % 2) * 30;
      block.y = 60 + index * 170;
    });
    saved.blocks = blocks;
    saved.uiLayoutVersion = version;
    localStorage.setItem(key, JSON.stringify(saved));
  } catch (_) {}
})();
