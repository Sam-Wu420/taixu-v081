// v0.63：灵力护盾的绘制（WebGL）。逻辑在 world/lingdun.ts。
// 所有东西都以「人物身体中心」为准：y = 脚下 − 50 − lift，所以御剑 / 飞遁时罩子跟着人一起升空。
import type { Combat } from '../world/combat';
import { FxSys, col, mixc, RGB, extOK } from './fx';
import { C } from './atlas';
import { LD_TIERS, LD_FIVE } from '../world/lingdun';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (u: number) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);

interface Pend { k: 'hit' | 'pop' | 'gone'; i: number; t: number; ang: number }
const pend: Pend[] = [];
/** 每层的升起进度（<0 表示还在排队等前一层） */
const rise: number[] = [1, 1, 1, 1, 1, 1, 1, 1];

/** 第 j 层的颜色：化神五色各一层；其余境界同色系，越靠外越浅 */
function layerCol(realm: number, j: number): RGB {
  if (realm >= 5) return col(LD_FIVE[j % LD_FIVE.length]);
  const base = col(LD_TIERS[clamp(realm, 0, LD_TIERS.length - 1)].col);
  return j ? mixc(base, WHITE, Math.min(0.4, j * 0.1)) : base;
}
/** 第 j 层的宽高（竖椭圆，层层外扩） */
const dims = (j: number, off: number): [number, number] => [112 + off + j * 22, 142 + off + j * 24];

export function drawLingdunGL(F: FxSys, c: Combat, t: number, dt: number, lift: number) {
  const ld = c.lingdun; if (!ld) return;
  const p = c.game.player, realm = c.game.hero.realm | 0, x = p.x, y = p.y - 50 - lift;
  const off = c.shield && !c.shield.art ? 28 : 0;   // 功法护盾在内圈，灵力罩让到外面
  for (const ev of ld.evq) {
    if (ev.k === 'up') { for (let j = ev.i; j < rise.length; j++) rise[j] = -(j - ev.i) * 0.2; }
    else if (pend.length < 24) pend.push({ k: ev.k, i: ev.i, t: ev.delay, ang: ev.ang });
  }
  ld.evq.length = 0;
  for (let j = 0; j < rise.length; j++) if (rise[j] < 1) rise[j] = Math.min(1, rise[j] + dt * 2.6);

  // —— 受击 / 碎裂（到点才放，连破几层时一层一层地炸开）
  for (let q = pend.length - 1; q >= 0; q--) {
    const e = pend[q]; e.t -= dt; if (e.t > 0) continue;
    pend.splice(q, 1);
    const cc = layerCol(realm, e.i), ed = mixc(cc, WHITE, 0.65), [w, h] = dims(e.i, off);
    if (e.k === 'hit') {
      const hx = x + Math.cos(e.ang) * w * 0.5, hy = y + Math.sin(e.ang) * h * 0.42;
      F.shockRing(hx, hy, 46, ed, 0.25, 0.9, 0.6);
      F.glint(hx, hy, 28, ed, 0.6, 0.18);
      F.sparks(hx, hy, ed, 5, 260, 0.3, 2.2, e.ang + Math.PI, 1.8);
      if (realm >= 3) F.emit({ x: hx, y: hy, life: 0.26, s0: 26, s1: 46, c: cc, a: 0.75, cell: C.Seal, rot: rnd(0, TAU) });
    } else if (e.k === 'pop') {
      // 一层碎开：罩壁化作一圈晶片向外迸溅 + 竖椭圆气浪 + 一记星爆
      const m = 16 + e.i * 3;
      for (let k = 0; k < m; k++) {
        const an = (k / m) * TAU + rnd(-0.15, 0.15), v = rnd(180, 420);
        F.emit({ x: x + Math.cos(an) * w * 0.5, y: y + Math.sin(an) * h * 0.5, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 60, life: rnd(0.45, 0.8), s0: rnd(9, 16), s1: 3, c: Math.random() < 0.4 ? ed : cc, a: 0.95, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-9, 9), grav: 520, drag: 1.2 });
      }
      F.sparks(x, y, ed, 14, 520, 0.4, 2.6);
      F.shockRing(x, y, w * 0.85, cc, 0.3, h / w, 0.9);
      F.shockRing(x, y, w * 0.6, ed, 0.22, h / w, 0.7);
      F.flash(x, y, w * 0.5, ed, 0.12);
      F.emit({ x, y, life: 0.22, s0: w * 0.8, s1: w * 1.5, c: ed, a: 0.6, cell: extOK() ? C.KStarBurst : C.Star, rot: rnd(0, TAU) });
      F.shock(x, y, 170, 8, 0.25);
    } else {
      // 尽碎：最后一口气散尽
      F.rays(x, y, 240, WHITE, 0.5, 0.35);
      F.shock(x, y, 320, 16, 0.45);
      F.smokeRing(x, y + 50, 120, [0.7, 0.8, 0.85], 0.2, 0.8);
      for (let k = 0; k < 26; k++) { const an = rnd(0, TAU), v = rnd(260, 620); F.emit({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 80, life: rnd(0.5, 1), s0: rnd(6, 12), s1: 2, c: Math.random() < 0.5 ? WHITE : cc, a: 0.9, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-10, 10), grav: 640, drag: 1 }); }
    }
  }

  const n = ld.hp.length, vis = ld.shown;
  if (!n || vis < 0.02) return;
  let W = 0, H = 0;
  // —— 各层罩壁：柔光壁 + 亮边 + 流光泡壳；剩余灵力越少越淡，受击时最外层一亮
  for (let j = 0; j < n; j++) {
    const k = clamp(ld.hp[j] / ld.cap, 0, 1), cc = layerCol(realm, j), ed = mixc(cc, WHITE, 0.65);
    const rs = clamp(rise[j] ?? 1, 0, 1); if (rs <= 0) continue;
    const grow = 1 + (1 - ease(rs)) * 0.35, [w0, h0] = dims(j, off), w = w0 * grow, h = h0 * grow;
    const pul = 0.86 + 0.14 * Math.sin(t * 2.6 + j * 1.3), fl = j === n - 1 ? ld.flash : ld.flash * 0.3, a = vis * rs;
    F.sprite(C.Glow, x, y, w * 1.25, h * 1.2, 0, cc, (0.035 + 0.03 * k) * a);
    F.sprite(C.RingSoft, x, y, w, h, 0, cc, ((0.16 + 0.2 * k) * pul + fl * 0.4) * a);
    F.sprite(C.Ring, x, y, w * 0.955, h * 0.955, 0, ed, (0.1 + 0.2 * k + fl * 0.5) * a);
    if (extOK()) F.sprite(C.KBubble, x, y, w * 0.98, h * 0.98, t * (j % 2 ? -0.25 : 0.3) + j, cc, ((0.07 + 0.08 * k) * pul + fl * 0.3) * a);
    // 罩面上一道缓缓游走的高光
    const ga = t * (0.9 + j * 0.15) + j * 2.1;
    F.glow(x + Math.cos(ga) * w * 0.46, y + Math.sin(ga) * h * 0.46, 9, WHITE, (0.3 + 0.3 * k) * a);
    W = w0; H = h0;
  }
  const top = layerCol(realm, n - 1), ed = mixc(top, WHITE, 0.6), base = layerCol(realm, 0);
  const fy = p.y - lift + 4;   // 脚下（飞行时是悬空的脚下）
  // —— 筑基起：罩外绕行的符（筑基叶符，结丹以上方印），境界越高越多
  if (realm >= 2) {
    const ns = Math.min(10, 4 + (realm - 2) * 2), cell = realm === 2 ? C.Leaf : C.Seal, sz = 11 + realm * 1.5;
    for (let i = 0; i < ns; i++) { const an = (i / ns) * TAU + t * 0.6; F.sprite(cell, x + Math.cos(an) * W * 0.52, y + Math.sin(an) * H * 0.52, sz * (realm === 2 ? 1.6 : 1), sz, an + Math.PI / 2, ed, 0.75 * vis); }
  }
  // —— 结丹起：脚下一轮随身的小阵
  if (realm >= 3) {
    F.ground(C.Rune, x, fy, 58 + n * 7, t * 0.5, base, 0.32 * vis, 1, 0.5);
    F.ground(C.Ring, x, fy, 62 + n * 7, 0, ed, 0.3 * vis, 1, 0.5);
  }
  // —— 元婴起：背后隐现八卦，罩面偶有电弧游走
  if (realm >= 4) {
    F.sprite(C.Bagua, x, y, W * 0.95, W * 0.95, -t * 0.3, base, 0.12 * vis);
    if (Math.random() < dt * 4) { const a0 = rnd(0, TAU), a1 = a0 + rnd(0.5, 1.2); F.bolt(x + Math.cos(a0) * W * 0.5, y + Math.sin(a0) * H * 0.5, x + Math.cos(a1) * W * 0.5, y + Math.sin(a1) * H * 0.5, Math.random() * 1e6, 8, 1, ed, 0.8 * vis, 6, false); }
  }
  // —— 化神：足踏莲台，五色灵珠绕身，顶上一轮光
  if (realm >= 5) {
    F.sprite(C.Lotus, x, fy, 170, 78, 0, [1, 0.92, 0.82], 0.4 * vis);
    for (let i = 0; i < 5; i++) { const an = (i / 5) * TAU - t * 1.1; F.orb(x + Math.cos(an) * W * 0.62, y + Math.sin(an) * H * 0.2 - 10, 4.5, col(LD_FIVE[i]), 0.9 * vis); }
    F.sprite(C.Ring, x, y - H * 0.56, 80, 24, 0, WHITE, 0.5 * vis);
    if (extOK()) F.sprite(C.KRays1, x, y, W * 1.7, W * 1.7, t * 0.2, [1, 0.95, 0.8], 0.07 * vis);
  }
  // —— 灵光自脚下沿罩壁升起（各境界都有，层数越多越密）
  if (Math.random() < dt * (5 + n * 3) * vis) {
    const an = rnd(0, TAU);
    F.emit({ x: x + Math.cos(an) * W * 0.48, y: y + H * 0.42 * Math.abs(Math.sin(an)), vx: rnd(-10, 10), vy: -rnd(60, 130), life: rnd(0.6, 1.1), s0: rnd(3, 5), s1: 1, c: Math.random() < 0.4 ? WHITE : top, a: 0.8, cell: C.Glow });
  }
}
