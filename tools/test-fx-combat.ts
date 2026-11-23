import assert from 'node:assert/strict';
import { createCanvas } from './env';
import { Batch, FLOATS, type HdProjection } from '../src/gl/batch';
import { FxSys } from '../src/gl/fx';
import { C } from '../src/gl/atlas';
import type { ArtSkill } from '../src/data/arts';

Object.assign(globalThis, {
  window: { innerWidth: 640, innerHeight: 480, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { ART_LIST } = await import('../src/data/arts');
const { drawCombatGL } = await import('../src/gl/combatgl');
const { drawCombatUI } = await import('../src/world/combatfx');
const { hdUi } = await import('../src/hd2d/ui');
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain), combat = game.combat, player = game.player;
player.x = 300; player.y = 400; player.st.lift = 120;
const skill = ART_LIST.find((s) => s.id === 'huodan');
assert.ok(skill);
const internals = combat as unknown as { exec(skill: ArtSkill, lv: number, aim: { x: number; y: number; dx: number; dy: number; target: null }, atk: number, realm: number): void };
internals.exec(skill, 0, { x: 500, y: 500, dx: 0.6, dy: 0.8, target: null }, 10, 1);
assert.equal(combat.projs.length, 1);
const pr = combat.projs[0];
assert.equal(pr.x, 315.6); assert.equal(pr.y, 362);
assert.deepEqual(pr.visual, { groundOffsetY: 46, elevation: 120 });
const hd: HdProjection = { affine: [0, -1, 800, 0.707106781, 0, 28], heightAt: () => 180, heightScale: 0.707106781, heightBoost: Math.SQRT2, depthAt: (x, y, h) => 0.7 + (x + y - h) / 100000, groundBounds: () => ({ l: -10000, t: -10000, r: 10000, b: 10000 }) };
const B = new Batch(); B.reset(300, 400, 1, 640, 480, null); B.hd = hd;
const F = new FxSys(B);
drawCombatGL(F, combat, 0, 0);
B.billboard = { x: pr.x, y: pr.y + pr.visual.groundOffsetY, offsetY: -pr.visual.elevation };
B.pt(pr.x, pr.y); const expected = { x: B.ox, y: B.oy, depth: B.od }; B.billboard = null;
const near = (a: number, b: number, e = 0.001) => Math.abs(a - b) < e;
let found = false;
for (let i = 0; i + 5 < B.n; i += 6) {
  const k = i * FLOATS, opposite = (i + 2) * FLOATS;
  // 深度：跟着立板的特效整片取上沿的深度（Batch.quad：免得上半截被人物立板挡住），所以不比中心远、只近一点点
  const depth = B.data[k + 8];
  if (near((B.data[k] + B.data[opposite]) / 2, expected.x) && near((B.data[k + 1] + B.data[opposite + 1]) / 2, expected.y)
    && depth <= expected.depth + 1e-6 && depth > expected.depth - 0.001) { found = true; break; }
}
assert.ok(found, '真实火弹的立板顶点应落在发射脚点与飞行高度计算出的投影位置');
assert.equal(pr.y, 362, '绘制不得修改碰撞坐标');

combat.projs.length = 0;
const enemy = new Enemy(ENEMIES.wolf, 300, 330, 1, 3);
combat.enemies = [enemy]; game.life.sense.x = enemy.x; game.life.sense.y = enemy.y; game.life.sense.R = 1000;
const canvas = createCanvas(640, 480), raw = canvas.getContext('2d'), ctx = raw as unknown as CanvasRenderingContext2D;
const anchors: [number, number][] = [];
hdUi.at = (g, x, y) => { anchors.push([x, y]); g.setTransform(1, 0, 0, 1, 0, 0); };
enemy.flyH = 0; enemy.lift = 0;
drawCombatUI(ctx, combat, 0, 1);
const baseline = raw.getImageData(0, 0, 640, 480).data;
raw.clearRect(0, 0, 640, 480); enemy.flyH = 100; enemy.lift = 20;
drawCombatUI(ctx, combat, 0, 1);
const flying = raw.getImageData(0, 0, 640, 480).data;
assert.deepEqual(anchors, [[300, 330], [300, 330]]);
assert.ok(baseline.some((n) => n !== 0), '应绘制出真实名牌像素');
for (let y = 120; y < 480; y++) for (let x = 0; x < 640; x++) for (let channel = 0; channel < 4; channel++) {
  assert.equal(flying[((y - 120) * 640 + x) * 4 + channel], baseline[(y * 640 + x) * 4 + channel]);
}
hdUi.at = null;

combat.reset(); B.reset(300, 400, 1, 640, 480, null); B.hd = hd;
combat.vfx.push({ kind: 'strike', x: 300, y: 340, r: 100, t: 0.2, dur: 0.5, color: '160,210,255', fx: 'lightning', seed: 17 });
drawCombatGL(new FxSys(B), combat, 0, 0);
B.billboard = { x: 300, y: 340 }; B.pt(340, -380); const verticalStart = { x: B.ox, y: B.oy, depth: B.od }; B.billboard = null;
assert.ok(near((B.data[0] + B.data[FLOATS]) / 2, verticalStart.x));
assert.ok(near((B.data[1] + B.data[FLOATS + 1]) / 2, verticalStart.y));
assert.ok(near(B.data[8], verticalStart.depth, 1e-6));

combat.reset(); B.reset(300, 400, 1, 640, 480, null); B.hd = hd;
const from = { x: 300, y: 340, offsetY: -50 }, to = { x: 430, y: 390, offsetY: -20 };
combat.vfx.push({ kind: 'chain', anchor: from, endAnchor: to, x: 300, y: 310, x2: 430, y2: 360, r: 0, t: 0.2, dur: 0.6, color: '160,210,255', seed: 17 });
drawCombatGL(new FxSys(B), combat, 0, 0);
B.billboard = from; B.pt(300, 310); const first = { x: B.ox, y: B.oy, depth: B.od };
B.billboard = to; B.pt(430, 360); const last = { x: B.ox, y: B.oy, depth: B.od }; B.billboard = null;
assert.ok(near((B.data[0] + B.data[FLOATS]) / 2, first.x));
assert.ok(near((B.data[1] + B.data[FLOATS + 1]) / 2, first.y));
const endR = (8 * 6 + 2) * FLOATS, endL = (8 * 6 + 5) * FLOATS;
assert.ok(near((B.data[endR] + B.data[endL]) / 2, last.x));
assert.ok(near((B.data[endR + 1] + B.data[endL + 1]) / 2, last.y));
assert.ok(near(B.data[endR + 8], last.depth, 1e-6));

combat.reset(); B.reset(300, 400, 1, 640, 480, null);
const slope: HdProjection = { ...hd, heightAt: (x, y) => 180 + x * 0.03 - y * 0.02, depthAt: (x, _y, h) => 0.7 + (x - h) / 100000 };
B.hd = slope;
combat.vfx.push({ kind: 'chain', anchor: from, endAnchor: to, x: 360, y: 310, x2: 430, y2: 360, r: 0, t: 0.2, dur: 0.6, color: '160,210,255', seed: 17 });
drawCombatGL(new FxSys(B), combat, 0, 0);
B.billboard = from; B.pt(360, 310); const shoulder = { x: B.ox, y: B.oy, depth: B.od }; B.billboard = null;
assert.ok(near((B.data[0] + B.data[FLOATS]) / 2, shoulder.x));
assert.ok(near((B.data[1] + B.data[FLOATS + 1]) / 2, shoulder.y));
assert.ok(near(B.data[8], shoulder.depth, 1e-6));

B.reset(300, 400, 1, 640, 480, null); B.hd = hd;
new FxSys(B).lineSprite(C.Blade, from.x, from.y, -80, to.x, to.y, -50, 1, 20, [1, 1, 1], 1);
const angle = Math.atan2(B.data[FLOATS + 1] - B.data[1], B.data[FLOATS] - B.data[0]);
assert.ok(near(angle, Math.atan2(last.y - first.y, last.x - first.x)));

console.log('PASS 真实火弹、飞行名牌、竖雷、连线两端高度与投影方向');
