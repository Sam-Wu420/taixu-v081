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
  const d = W.dummy; d.x = p.x + 900; d.y = p.y; g.combat.lock = d; g.combat.manual = true;
  const src = W.dummy;
  g.combat.foe.hz.push({ k: 'circle', x: p.x + 450, y: p.y, r: 170, ang: 0, spread: 0, len: 0, w: 0, t: 1, tele: 0.5, dur: 0, el: 'fire', dmg: 1, realm: 1, src, fired: true, tick: 9, pool: 30, pooling: true, z: 0 });
  await sleep(800);
  g.combat.cds.clear(); B.rush();
  await until(() => B.pb.staggerT > 0, 3000);
  await sleep(70);
  freeze();
  return { blocked: B.pb.staggerT > 0, dx: Math.round(p.x - (d.x - 900)) };
})()
