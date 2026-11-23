(async () => {
// 公共前置（拼进每个脚本的开头）：等入口好、修头像路径、冻结 / 解冻
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 400 && !(window.__brawlReady || window.__vfReady); i++) await sleep(100);
document.querySelectorAll('img').forEach((im) => { if (im.src.includes('/tools/art/')) im.src = im.src.replace('/tools/art/', '/art/'); });
{ const st = document.createElement('style'); st.textContent = '.toasts{display:none!important}'; document.head.appendChild(st); }   // 截图：藏起新开局的提示条（它们压在画面正中）
const g = window.__game, B = g.combat.brawl, p = g.player, W = window.__brawl || window.__vf, fx = g.renderer.fx;
if (!fx.__wrapped) { const up0 = fx.update.bind(fx); fx.__wrapped = true; fx.__freeze = false; fx.__n = 0; fx.update = (dt) => up0(fx.__freeze ? (fx.__n++ < 4 ? Math.min(dt, 0.02) : 0) : dt); }
const freeze = () => { fx.__freeze = true; fx.__n = 0; g.paused = true; };
const thaw = () => { fx.__freeze = false; g.paused = false; };
thaw();
const until = async (f, ms = 4000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await sleep(16); return f(); };

// 界内（日常那一版）：御剑在高空的顶，把罡气已破的木人往下砸——流星直坠（火尾），截在半空（try=brawl&at=sea|默认&calm=1&foe=0）
g.combat.enemies = g.combat.enemies.filter((q) => q === W.dummy);
const d = W.dummy; p.flying = true; p.z = p.zTarget = 420; d.x = p.x + 110; d.y = p.y + 4; d.flyH = 420; g.combat.lock = d; g.combat.manual = true;
g.setZoom(0.7);
await sleep(900);
const b = B.body(d); b.poise = 0; b.breakT = 30; g.combat.cds.clear();
B.heavy(true);
await until(() => B.isAir(d) && B.peek(d).z < 260, 3000);
freeze();
return { z: B.peek(d).z, meteor: B.peek(d).meteor };

})()