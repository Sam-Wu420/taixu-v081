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
  const t = W.foes.find((e) => e.school === 'tixiu') || W.brawler;
  t.x = p.x + 520; t.y = p.y - 40;
  await sleep(1500);
  B.forceRush(t); const ai = B.peek(t).ai; ai.pat = 'jjg'; ai.proto = false;
  await until(() => ai.st === 'wind' && ai.windK === 'g', 5000);
  await sleep(120);
  freeze();
  return { st: ai.st, k: ai.windK, kite: g.combat.foe.hz.filter((h) => h.pool).length };
})()
