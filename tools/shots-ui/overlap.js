(async () => {
  await new Promise((r) => setTimeout(r, 600));
  const SEL = ['.char-card', '.buff-row', '.pf-col', '.qc-item', '.date-box', '.minimap-wrap', '.realm-hud', '.jy-compass', '.boss-hud', '.pursuit', '.target-frame', '.toast', '.region-banner', '.ctx-item', '.hotbar', '.action-bar', '.touch-side', '.joystick', '.help-hint', '.fly-hud', '.bx-hud', '.bx-stance', '.bx-pad', '.bx-clash'];
  const lc = document.querySelector('.hz-lc')?.getBoundingClientRect();
  const els = [];
  for (const s of SEL) for (const e of document.querySelectorAll(s)) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
    let r = e.getBoundingClientRect(); r = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    if (lc && e.closest('.hz-lc')) { r.t = Math.max(r.t, lc.top); r.b = Math.min(r.b, lc.bottom); }
    if (r.r - r.l < 2 || r.b - r.t < 2) continue;
    els.push({ s, e, r });
  }
  const bad = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const w = Math.min(a.r.r, b.r.r) - Math.max(a.r.l, b.r.l), h = Math.min(a.r.b, b.r.b) - Math.max(a.r.t, b.r.t);
    if (w > 3 && h > 3) bad.push(`${a.s}×${b.s} ${Math.round(w)}x${Math.round(h)}`);
  }
  const out = els.filter((x) => x.r.l < -1 || x.r.r > innerWidth + 1 || x.r.t < -1 || x.r.b > innerHeight + 1).map((x) => x.s);
  return { overlap: bad, offscreen: out, scrollW: document.documentElement.scrollWidth, W: innerWidth };
})()
