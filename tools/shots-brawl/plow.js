(async () => {
// 公共前置（拼进每个脚本的开头）：等入口好、修头像路径、冻结 / 解冻
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 400 && !window.__brawlReady; i++) await sleep(100);
document.querySelectorAll('img').forEach((im) => { if (im.src.includes('/tools/art/')) im.src = im.src.replace('/tools/art/', '/art/'); });
{ const st = document.createElement('style'); st.textContent = '.toasts{display:none!important}'; document.head.appendChild(st); }   // 截图：藏起新开局的提示条（它们压在画面正中）
const g = window.__game, B = g.combat.brawl, p = g.player, W = window.__brawl, fx = g.renderer.fx;
if (!fx.__wrapped) { const up0 = fx.update.bind(fx); fx.__wrapped = true; fx.__freeze = false; fx.__n = 0; fx.update = (dt) => up0(fx.__freeze ? (fx.__n++ < 4 ? Math.min(dt, 0.02) : 0) : dt); }
const freeze = () => { fx.__freeze = true; fx.__n = 0; g.paused = true; };
const thaw = () => { fx.__freeze = false; g.paused = false; };
thaw();
const until = async (f, ms = 4000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await sleep(16); return f(); };
  const d = W.dummy;
  await until(() => (B.peek(d)?.subT ?? 0) <= 0 && d.hideT <= 0, 4000);
  await sleep(500);
  d.x = p.x + 110; d.y = p.y + 4; d.flyH = 56; p.z = p.zTarget = 56;
  await sleep(300);
  const b = B.body(d); b.poise = 0; b.breakT = 2; b.staggerT = 0; g.combat.cds.clear();
  g.input.mouse.active = true; g.input.mouse.x = p.x + 1400; g.input.mouse.y = p.y + 200; g.input.mouse.t = g.time;
  B.heavy(false);
  await until(() => B.isAir(d), 2000);
  await sleep(420);
  freeze();
  return { air: B.isAir(d), z: Math.round(b.z) };
})()
