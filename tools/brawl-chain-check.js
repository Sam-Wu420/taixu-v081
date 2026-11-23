// 逐帧检查：连续缩地追击三次期间，自己和对手（身体中段）的屏幕坐标都在画面里。给 tools/edge-shot.mjs 的 --eval 用：
//   node tools/edge-shot.mjs "http://127.0.0.1:端口/tools/perf-acceptance.html?auto=new&map=tiannan&try=brawl&calm=1&foe=0" --size=1600x900 --wait=18 --eval=tools/brawl-chain-check.js
// 结果里 off 是出画的帧数（应为 0），frames 是总帧数，mps 是三次追击各耗的灵力（应一次比一次多）。
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 300 && !window.__brawlReady; i++) await sleep(100);
  const g = window.__game, B = g.combat.brawl, p = g.player, d = window.__brawl.dummy, hd = g.renderer.hd;
  d.x = p.x + 110; d.y = p.y + 10; g.hero.mp = 1; g.combat.cds.clear(); g.input.mouse.active = false;
  await sleep(800);
  const b = B.body(d); b.poise = 0; b.breakT = 1.6;
  let frames = 0, off = 0, first = null, run = true;
  const W = innerWidth, H = innerHeight, out = (q) => q.x < 0 || q.x > W || q.y < 0 || q.y > H;
  const tick = () => {
    if (!run) return;
    const a = hd.project(p.x, p.y, p.st.lift + 60), e = hd.project(d.x, d.y, d.z + 60);
    frames++;
    if (out(a) || out(e)) { off++; if (!first) first = { me: [Math.round(a.x), Math.round(a.y)], foe: [Math.round(e.x), Math.round(e.y)], zoom: +g.cam.zoom.toFixed(2) }; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  B.heavy(false);
  const mps = [];
  // E2 起重击有 0.14 息前摇：先等对方真被轰飞（倒飞中）再追
  for (let k = 0; k < 3; k++) { await sleep(320); for (let i = 0; i < 40 && !(B.peek(d)?.air && B.peek(d)?.freezeT <= 0); i++) await sleep(20); const m0 = g.hero.mp; B.pursue(); mps.push(+(m0 - g.hero.mp).toFixed(3)); }
  await sleep(1800);
  run = false;
  return { frames, off, first, mps, chain: B.peek(d)?.chain };
})()
