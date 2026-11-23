// 虚空里的即时斗法（world/voidfight.ts）：被虚空兽追上就交手——人和兽落进图外的斗法场、界内那一套战斗照常跑、
// 镜头拉到位后换手；斩了兽有掉落、回到虚空接着飞；飞开够远算甩脱；元婴以上的追兵会跟着破界追出来，追上照样斗法；
// 斗法中存档记的是界内的位置；斗法中倒下回到界内。用真实的 Game 无界面地跑。
import './env';
import assert from 'node:assert/strict';
// 固定随机源与时钟（默认种子 1，SEED=n 换一个）：交手时兽的小境界、斗法里的出招都取随机数
{ let s = (Number(process.env.SEED ?? 1) * 2654435761) >>> 0; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
await import('./fixed-clock');

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;

const G = await import('../src/world/game');
const C = await import('../src/world/cultivation');
const { VOID_OX, VOID_OY, VOIDFIGHT, HANDOFF } = await import('../src/world/voidfight');
const { VOID_SCALE } = await import('../src/data/zhujie');
const g = await G.createGame(() => {});
g.reset();
const p = g.player, xk = g.xukong, L = xk.life, F = xk.fight;
const step = (seconds: number, each?: () => void) => { for (let t = 0; t < seconds - 1e-9; t += 0.025) { g.paused = false; each?.(); g.update(0.025); } };
const clear = () => { (g.combat as any).enemies.length = 0; g.pursuit.reset(); };
const hold = (k: string, fn: () => void) => { g.input.keys.add(k); try { fn(); } finally { g.input.keys.delete(k); } };
const closeAll = () => { for (let i = 0; i < 6 && g.modal; i++) g.closeModal(true); };
const ascend = () => {
  g.hero.realm = 4; g.hero.stage = 2; g.hero.mp = 1; g.hero.hp = 1;
  if (!p.flying) g.toggleFly(); step(1, closeAll);
  hold('ascend', () => { for (let i = 0; i < 400 && !(xk.phase === 'void' && xk.lift > 0.995); i++) step(0.25, () => { closeAll(); clear(); }); });
  assert.ok(xk.phase === 'void' && xk.lift > 0.995, `应已升到巡航高度：${xk.phase} ${xk.lift}`);
};
const warp = (x: number, y: number) => { xk.x = x; xk.y = y; xk.vx = xk.vy = 0; (xk as any).scanT = 0; step(0.3, closeAll); };
type Thing = import('../src/world/voidlife').VoidThing;
const cell = (cx: number, cy: number) => (L as any).cell(cx, cy, xk.realms) as Thing[];
const all: Thing[] = [];

g.teleport(150000, 110000); clear();
const home = { x: p.x, y: p.y };
ascend();
for (let cy = -30; cy <= 30; cy++) for (let cx = -30; cx <= 30; cx++) all.push(...cell(cx, cy));
const lonely = (t: Thing, d: number) => !all.some((q) => q !== t && (q.kind === 'beast' || q.kind === 'storm') && Math.hypot(q.x - t.x, q.y - t.y) < d);
const beasts = all.filter((t) => t.kind === 'beast' && lonely(t, 14000) && t.tier === 4);
assert.ok(beasts.length >= 3, `要有几头离群的元婴品阶虚空兽：${beasts.length}`);

/** 飞到一头兽旁边，等它扑上来。虚空的格子按当时身边有哪些界来剔除离界太近的东西，换个地方看可能就没了它：换下一头 */
const used = new Set<string>();
const meet = (): Thing => {
  for (const b of beasts) {
    if (used.has(b.id)) continue;
    warp(b.x + 1800, b.y); step(0.5, closeAll);
    if (!L.roaming.some((q) => q.id === b.id)) continue;
    used.add(b.id);
    for (let i = 0; i < 120 && !F.on; i++) step(0.25, closeAll);
    assert.ok(F.on, `${b.name}该追上来交手`);
    return b;
  }
  throw new Error('找不到能遇上的虚空兽');
};

// 1. 交手：不弹框；人落进斗法场；兽成了界内的敌人；界内那一套照常跑
{
  const b0 = meet();
  assert.ok(!g.modal, '不弹抉择框');
  assert.ok(Math.abs(p.x - VOID_OX) < 1 && Math.abs(p.y - VOID_OY) < 1, `人在斗法场的原点：${p.x},${p.y}`);
  assert.equal(g.combat.enemies.length, 1);
  const e = g.combat.enemies[0];
  assert.ok(e.def.id.startsWith('xk_') && e.aggro, `对手是虚空兽：${e.def.id}`);
  const d0 = Math.hypot(e.x - p.x, e.y - p.y);
  assert.ok(d0 >= VOIDFIGHT.spawnMin - 1 && d0 <= VOIDFIGHT.spawnMax + 1, `对手离人两千多：${d0}`);
  assert.ok(!g.halted, '界内那一套在跑（不是停着的虚空）');
  assert.ok(g.offWorld, '算在地图之外');
  assert.ok(!F.handed, '镜头还在拉近');
  step(VOIDFIGHT.ease + 0.1);
  assert.ok(F.handed, '镜头到位后换手'); assert.ok(Math.abs(g.cam.zoom - VOIDFIGHT.zoom) < 0.15, `斗法的镜头远近：${g.cam.zoom}`);
  assert.ok(Math.hypot(e.x - p.x, e.y - p.y) < d0, '兽朝人扑过来');
  // 在斗法场里飞，虚空里的位置跟着走
  const vx0 = xk.x, px0 = p.x;
  hold('d', () => step(1));
  assert.ok(p.x > px0 + 100, '能在斗法场里飞');
  assert.ok(Math.abs((xk.x - vx0) - (p.x - px0) / VOID_SCALE) < 1.5, `虚空里的位置跟着人走（差一帧）：${xk.x - vx0} vs ${(p.x - px0) / VOID_SCALE}`);
  // 斗法中存档：记的是界内的位置
  assert.ok(g.save(1));
  const sv = JSON.parse(store['taixu_save_1']);
  assert.ok(Math.abs(sv.p.x - home.x) < 2 && Math.abs(sv.p.y - home.y) < 2, `存档记界内的位置：${sv.p.x},${sv.p.y} vs ${home.x},${home.y}`);
  // 2. 斩了它：掉落收进储物袋、回到虚空接着飞、一个月内不再出现
  const st0 = C.bagCount(g.hero, 'mat_lingshi');
  for (let i = 0; i < 40 && !e.dead; i++) { g.combat.hitEnemy(e, e.maxHp, { realm: 6, stCh: 0 }, p.x, p.y); step(0.05); }
  assert.ok(e.dead, '兽被斩了');
  step(2.2);
  assert.ok(!F.on, '打完交还');
  assert.equal(xk.phase, 'void'); assert.ok(xk.active, '回到虚空里飞');
  assert.ok(Math.abs(p.x - home.x) < 2, '人挂回界内出界的那一点');
  assert.ok(C.bagCount(g.hero, 'mat_lingshi') > st0, `灵核（灵石）收进储物袋：${st0} → ${C.bagCount(g.hero, 'mat_lingshi')}`);
  assert.ok((g.ws as any).voidSeen[b0.id], '斩掉的兽记下了');
  assert.ok(F.camK > 0, '镜头正往回拉');
  step(VOIDFIGHT.ease + 0.1);
  assert.equal(F.camK, 0, '镜头回到巡航的远近');
}

// 3. 甩脱：飞开够远就交还；兽回到虚空里，过一阵才会再追
{
  g.hero.hp = 1; g.hero.mp = 1;
  const b1 = meet();
  step(VOIDFIGHT.ease + 0.1);
  const e = g.combat.enemies[0];
  // 把人往兽的反方向挪远（等同于全力飞开）
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
  p.x = e.x + dx / d * (VOIDFIGHT.leave + 900); p.y = e.y + dy / d * (VOIDFIGHT.leave + 900);
  step(0.5);
  assert.ok(!F.on, '甩开了');
  const b = L.roaming.find((t) => t.id === b1.id) as any;
  assert.ok(b && !b.fight && !b.hot && b.calm > 0, '兽回到虚空里、暂时不追');
  assert.ok(!(g.ws as any).voidSeen[b1.id], '没斩的不记');
  assert.ok(!g.combat.enemies.some((q) => q.def.id.startsWith('xk_')), '界内的敌人里没有它');
}

// 4. 自己撞上一头还没察觉的兽：也交手
{
  g.hero.hp = 1; g.hero.mp = 1;
  const b = beasts.find((q) => !used.has(q.id) && (warp(q.x + 6000, q.y), step(0.3, closeAll), L.roaming.some((r) => r.id === q.id)))!;
  used.add(b.id);
  const r = L.roaming.find((q) => q.id === b.id)!;
  warp(r.x + 20, r.y);
  step(0.1, closeAll);
  assert.ok(F.on, '撞进它的身形就交手');
  F.finish('fled'); step(VOIDFIGHT.ease + 0.2, closeAll);
}

// 5. 元婴以上的追兵跟着破界追出来，追上照样斗法；斩了就了结这场追杀
{
  xk.reset(); g.teleport(home.x, home.y); clear(); g.hero.hp = 1; g.hero.mp = 1;
  if (!p.flying) g.toggleFly(); step(0.5, closeAll);
  const ok = g.pursuit.start({ reason: '测试', gap: 0, force: true });
  assert.ok(ok && g.pursuit.cur, '起了一场追杀');
  const P = g.pursuit.cur!;
  P.e.realm = 4; P.realm = 4;
  // 升出界（升的途中别让他先追上：钉住在原地）
  hold('ascend', () => { for (let i = 0; i < 400 && !(xk.phase === 'void' && xk.lift > 0.995); i++) step(0.25, () => { closeAll(); P.e.x = p.x + 3000; P.e.y = p.y; }); });
  assert.ok(xk.phase === 'void', '出了界');
  assert.ok(L.chaser && L.chaser.enemy === P.e, '追兵跟着追了出来');
  assert.ok(!P.lost, '没跟丢');
  for (let i = 0; i < 120 && !F.on; i++) step(0.25, closeAll);
  assert.ok(F.on, '追上了就斗法');
  assert.ok(g.combat.enemies.includes(P.e), '对手就是那个追兵');
  { const h = F.handoff(F.foes[0], 60, 0); assert.ok(!h.mesh && h.figAlpha === 1, '追兵本来就是立板，没有网格交接'); }
  for (let i = 0; i < 60 && !P.e.dead; i++) { g.combat.hitEnemy(P.e, P.e.maxHp, { realm: 6, stCh: 0 }, p.x, p.y); step(0.05); }
  step(2.2, closeAll);
  assert.ok(!F.on, '打完交还');
  assert.ok(!L.chaser, '追兵没了');
  assert.ok(!g.pursuit.cur, '追杀了结');
}

// 6. 元婴以下的追兵过不了界壁：出界就跟丢
{
  xk.reset(); g.teleport(home.x, home.y); clear(); g.hero.hp = 1; g.hero.mp = 1;
  if (!p.flying) g.toggleFly(); step(0.5, closeAll);
  assert.ok(g.pursuit.start({ reason: '测试', gap: 0, force: true }));
  const P = g.pursuit.cur!; P.e.realm = 3; P.realm = 3;
  hold('ascend', () => { for (let i = 0; i < 400 && !(xk.phase === 'void' && xk.lift > 0.995); i++) step(0.25, () => { closeAll(); P.e.x = p.x + 3000; P.e.y = p.y; }); });
  assert.ok(!L.chaser, '没追出来'); assert.ok(P.lost, '跟丢了');
}

// 7. 斗法中倒下：回到界内，不留在斗法场
{
  xk.reset(); g.teleport(home.x, home.y); clear(); (g.ws as any).voidSeen = {};
  ascend();
  used.clear(); meet();
  step(VOIDFIGHT.ease + 0.1);
  g.onPlayerDown(g.combat.enemies[0]);
  assert.ok(!F.on, '倒下就交还');
  assert.ok(p.x < VOID_OX - 100000, `人不在斗法场里：${p.x}`);
  assert.ok(!g.combat.enemies.some((q) => q.def.id.startsWith('xk_')), '虚空兽不会跟进界内');
}
// 8. 收官 P9：交手那一刻网格换立板——同一位置、同一朝向、同样大小地交接，立板淡入、网格亮起后收拢隐去；全程总有一样在画面上；镜头到位前立板已经不透明
{
  xk.reset(); g.teleport(home.x, home.y); clear(); (g.ws as any).voidSeen = {}; g.hero.hp = 1; g.hero.mp = 1;
  ascend(); used.clear();
  const b = meet() as any;
  const f = F.foes[0], W = 60, yaw = 0.3;
  assert.ok(f.from, '虚空兽记下了交手那一刻网格的样子');
  const live = L.roaming.find((q) => q.id === b.id) as any;
  assert.ok(Math.abs(f.from.x - live.x) < 1e-6 && Math.abs(f.from.y - live.y) < 1e-6 && f.from.r === live.r && f.from.a === live.a, '从网格原来的位置、大小、朝向开始');
  assert.equal(f.e.facing, p.x >= f.e.x ? 1 : -1, '立板朝着人');
  let rnd = 0; const rnd0 = Math.random;
  const look = () => { Math.random = () => { rnd++; return rnd0(); }; try { return F.handoff(f, W, yaw); } finally { Math.random = rnd0; } };
  const k0 = F.k; F.k = 0; const h0 = look(); F.k = k0;   // 交手的那一刻（meet 推进得粗，已经过了一点）
  assert.ok(h0.mesh && h0.figAlpha === 0 && Math.abs(h0.mesh.x - f.from.x) < 1e-6 && h0.mesh.r === f.from.r && h0.mesh.a === f.from.a, '交手那一刻：还是原来那头网格，立板没出来——不硬切');
  let alpha0 = 0, met = false, gone = false, frames = 0, both = 0;
  for (let i = 0; i < 80 && !F.handed; i++) {
    step(0.025);
    if (F.handed) break;
    const h = look(); frames++;
    assert.ok(h.mesh || h.figAlpha > 0.999, `每一帧总有一样在画面上（k=${F.camK.toFixed(2)}）`);
    if (h.mesh) assert.ok(Math.abs(h.mesh.fade + h.figAlpha - 1) < 1e-9, '网格淡出、立板淡入，两者加起来始终是一整个');
    assert.ok(h.figAlpha >= alpha0 - 1e-9, '立板只往里淡、不跳'); alpha0 = h.figAlpha;
    if (h.mesh && h.figAlpha > 0) both++;
    if (h.mesh && h.figAlpha > 0 && !met) {
      met = true;
      const toA = yaw + (f.e.facing > 0 ? 0 : Math.PI);
      assert.ok(Math.abs(h.mesh.x - h.x) < 1e-6 && Math.abs(h.mesh.y - h.y) < 1e-6, '交接时网格和立板在同一位置');
      assert.ok(Math.abs(h.mesh.r / (W * HANDOFF.size / 2) - 1) < 0.05, `同样大小：${h.mesh.r}`);
      assert.ok(Math.abs(Math.cos(h.mesh.a - toA) - 1) < 1e-9, '同一朝向（立板朝哪边，网格就转到哪边）');
      // 第五轮返工：按立板上实际画出来的身子收拢——身长对上身宽；细长的（身子矮）按高封顶
      { const kk = F.k; const hb = F.handoff(f, W, yaw, 21, 30), hc = F.handoff(f, W, yaw, 40, 9); F.k = kk;
        const sh = 1 - (1 - HANDOFF.shrink) * hb.figAlpha;
        assert.ok(hb.mesh && Math.abs(hb.mesh.r / sh - 21 / 3.5) < 1e-6, `网格身长 = 立板上画出来的身子宽：r=${hb.mesh?.r}`);
        assert.ok(hc.mesh && Math.abs(hc.mesh.r / sh - 9 / 1.8) < 1e-6, `细长的身子：按高封顶，网格不比它高出一大截：r=${hc.mesh?.r}`); }
    }
    if (!h.mesh && !gone) { gone = true; assert.ok(h.figAlpha > 0.999, '网格隐去时立板已经不透明'); }
  }
  assert.ok(met && gone, `交接走完了：${met} ${gone}`);
  assert.ok(both >= 4, `网格和立板同时在画面上交叠了几帧：${both}`);
  assert.ok(F.handed, '镜头到位、换手到界内那一套');
  assert.equal(rnd, 0, '交接不取 Math.random');
  { const h = look(); assert.ok(!h.mesh && h.figAlpha === 1, '换手之后只剩界内的立板'); }
  F.finish('fled'); step(VOIDFIGHT.ease + 0.2, closeAll);
}
// 9. 收官返工：交手那几帧都是慢帧——交接的进度单帧步长封顶（HANDOFF_STEP），网格换立板的交叠要一帧帧走完，不能一两帧就跳过去
{
  xk.reset(); g.teleport(home.x, home.y); clear(); (g.ws as any).voidSeen = {}; g.hero.hp = 1; g.hero.mp = 1;
  ascend();
  meet();
  const f = F.foes[0];
  F.k = 0;   // 从交手那一刻起
  let both = 0, frames = 0;
  // 每帧 0.3 秒（比主循环给的上限还慢，直接推交接的进度）
  for (let i = 0; i < 200 && F.k < HANDOFF.fade; i++) { F.update(0.3); frames++; const h = F.handoff(f, 60, 0); if (h.mesh && h.figAlpha > 0) both++; }
  assert.ok(F.k >= HANDOFF.fade, '慢帧下交接照样走完');
  assert.ok(both >= 4, `慢帧下网格和立板也交叠了好几帧：${both}（共 ${frames} 帧）`);
  F.finish('fled'); step(VOIDFIGHT.ease + 0.2, closeAll);
}
console.log('PASS 虚空斗法：追上即交手、斗法场里照常战斗、镜头到位换手、斩兽有掉落并回到虚空、飞开即甩脱、自己撞上也交手、元婴追兵跟出界并可斩杀、元婴以下追兵出界即跟丢、斗法中存档记界内位置、倒下回到界内、交手那一刻网格换立板不硬切');
