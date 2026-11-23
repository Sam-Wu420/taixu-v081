// 飞越交界地带（南荒 ⇄ 中州之间的天穹草原）：边界放开、后台分片建对面的地形、过中线悄悄换图、路上折算天数、
// 在草原上存档读档、不通的边照旧不通。用真实的 Game 无界面地跑。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const W = await import('../src/data/world');
const G = await import('../src/world/game');
assert.equal(W.ACTIVE_MAP, 'tiannan');
const D = W.SEAM_DEPTH, SHIFT = W.MAP_FRAME.dajin!.dy;
const g = await G.createGame(() => {});
g.reset();
g.hero.realm = 4; g.hero.stage = 0;   // 元婴：飞得快些，测试跑得动
const p = g.player;
/** 把人放到某处（飞着），清掉会打断赶路的东西 */
const place = (x: number, y: number) => { g.teleport(x, y); p.flying = true; g.combat.reset(); if (g.modal) g.closeModal(true); };
/** 朝一个方向飞若干帧（每帧 0.1 秒）；until 成立就停。途中敌人、对话一律清掉，只测赶路 */
const fly = (key: string, frames: number, until?: () => boolean) => {
  g.input.keys.clear(); g.input.keys.add(key);
  let n = 0;
  for (; n < frames; n++) { if (g.modal) g.closeModal(true); g.paused = false; g.input.keys.add(key); g.update(0.1); g.combat.enemies.length = 0; p.flying = true; if (until?.()) break; }
  g.input.keys.clear();
  return n;
};

// 1. 北边放开：从图内一路向北能飞进草原；其余三边照旧挡住
place(400000, 1500);
fly('w', 1500, () => p.y < -800);
assert.ok(p.y < -500, `应当飞出了南荒北缘：y=${p.y}`);
assert.ok(g.seamDepth > 500 && g.terrain.inOutland(p.x, p.y));
assert.ok(g.terrain.isLand(p.x, p.y) && g.terrain.walkFactor(p.x, p.y) > 0, '草原是能走的陆地');
assert.equal(g.isExplored(p.x, p.y), true, '图外不设迷雾');
// 绝域（B1）之后不设空气墙：不通的边外是外圈海，照样飞得出去，但到不了地形铺海的范围之外（六万），也不换图；深处由罡风吹回来（见 test-jueyu）
place(400000, W.WORLD_H - 1500); fly('s', 400); assert.ok(p.y > W.WORLD_H + 5000 && p.y < W.WORLD_H + 57001 && g.mapEpoch === 0, `南边是外圈海：y=${p.y}`);
place(1500, 100000); fly('a', 400); assert.ok(p.x < -5000 && p.x > -57001 && g.mapEpoch === 0, `西边是外圈海：x=${p.x}`);
place(100000, 1500); fly('w', 400); assert.ok(p.y < -5000 && p.y > -57001 && g.mapEpoch === 0 && W.ACTIVE_MAP === 'tiannan', `南荒比中州宽：中州够不着的那段北缘外是外圈海，不换图：y=${p.y}`);

// 2. 靠近中线：后台把中州的地形分片建好；过了中线悄悄换图，位置只差一个固定平移
const day0 = g.day;
place(400000, -(D / 2 - 6000));
const before = { y: p.y, sample: g.terrain.sample(400000, -(D / 2 + 2000)), height: g.terrain.surfaceHeight(400000, -(D / 2 + 2000)) };
let prevY = p.y, moved = 0, jump = 0;
const frames = fly('w', 20000, () => { const dy = p.y - prevY; if (g.mapEpoch === 0) moved += -dy; else if (!jump) jump = dy; prevY = p.y; return g.mapEpoch > 0; });
assert.equal(g.mapEpoch, 1, `飞了 ${frames} 帧应当已经换图`);
assert.equal(W.ACTIVE_MAP, 'dajin'); assert.equal(store['taixu.map'], 'dajin');
assert.equal(g.terrain.W, 1200);
assert.ok(Math.abs(jump - SHIFT) < 600, `换图那一帧纵坐标正好平移一个固定量：${jump} vs ${SHIFT}`);
assert.ok(Math.abs((p.y - SHIFT) - (before.y - moved)) < 600, '换算回交界坐标，人还在原来那条路上');
assert.ok(g.seamDepth > D * 0.3 && g.seamDepth <= D / 2 + 600, `换图后在中州一侧的草原里：纵深 ${g.seamDepth}`);
// 同一个地方，两张图给出的地貌和高度一样
const XD = 400000 + W.MAP_FRAME.dajin!.dx;   // 同一条经线在中州坐标里的 x（两图东西方向错开摆）
const s2 = g.terrain.sample(XD, -(D / 2 + 2000) + SHIFT);
for (const k of ['land', 'elev', 'arid', 'cold', 'forest'] as const) assert.ok(Math.abs(s2[k] - before.sample[k]) < 1e-6, `地貌 ${k} 应一致`);
assert.ok(Math.abs(g.terrain.surfaceHeight(XD, -(D / 2 + 2000) + SHIFT) - before.height) < 0.01, '高度应一致');
assert.equal(g.explored.length, G.FOG_W * G.FOG_H); assert.equal(G.FOG_W, 360);
assert.ok(g.combat.enemies.length === 0 && !g.halted && p.flying, '换图不打断飞行');

// 3. 接着向北飞出草原，进入中州；一路折算的天数：整趟约四个月
fly('w', 40000, () => g.seamDepth < -2000);
assert.ok(g.seamDepth < -2000 && p.y < W.WORLD_H, `应当已进入中州：纵深 ${g.seamDepth}`);
assert.ok(!g.terrain.inOutland(p.x, p.y));

// 4. 在草原上存档、读档：人还在草原上
place(120000, W.WORLD_H + 20000);
assert.ok(g.save(1));
place(120000, 100000);
assert.ok(g.load('taixu_save_1'));
assert.equal(W.ACTIVE_MAP, 'dajin'); assert.ok(Math.abs(p.y - (W.WORLD_H + 20000)) < 400 && g.seamDepth > 19000, `读档后仍在草原：y=${p.y}`);


// 6. 回程：向南飞过中线换回南荒（地形是留着的），再飞进南荒
place(XD, W.WORLD_H + D / 2 - 3000);
const epoch = g.mapEpoch;
fly('s', 20000, () => g.mapEpoch > epoch);
assert.equal(W.ACTIVE_MAP, 'tiannan'); assert.equal(g.terrain.W, 2000); assert.equal(store['taixu.map'], 'tiannan');
assert.ok(p.y < 0 && g.seamDepth > D * 0.3, `换回南荒一侧的草原：y=${p.y}`);
fly('s', 40000, () => g.seamDepth < -2000);
assert.ok(p.y > 2000, '回到了南荒图内');
const days = g.day - day0;
assert.ok(days > 150 && days < 400, `往返一趟折算的天数（去程约 120 日、回程约 120 日，再加路上本来流逝的）：${days.toFixed(1)}`);
console.log(`PASS 飞越交界：北缘放开、其余边外是外圈海（不换图）；过中线悄悄换图（纵坐标平移 ${SHIFT}，两边地貌与高度一致）；草原上可存读档；回程换回南荒；往返折算 ${days.toFixed(0)} 日`);
