// 刀光剑影（兵器接进近战的画面）：沿刃轨迹画挥砍的光带。和判定共用 world/blade.ts 的同一份刃轨迹（刀光亮在哪，判定就认哪）。
//   · 剑：细亮的一道弧（刃尖一线白芯，刃外一层很淡的剑风）；
//   · 重兵：又宽又沉的一道（底下压一层暗色显分量，暖色的宽光带，白芯粗）；
//   · 枪：直刺留三道残影和枪尖一朵枪花；横拦、扫、挑照弧画；
//   · 魂镰（r16）：一弯月牙——沿刃尖轨迹一条两头尖、中间宽的弧带（紫黑芯、血红边、外缘一线白），底下压一层暗紫；
//   · 剑气：一道飞出去的月牙弧光；兵器命中的斩痕火花（bxwhit）、重兵砸地的震波（bxquake）。
// 颜色跟兵器品阶的金属色走，高阶更亮一点。都散得快（出手时段过后一两成秒就没了），不留一屏光——用户反感光晕糊画面。
import { hfSetting } from '../world/hitfeel';   // r9-hitfeel
import type { Combat, Enemy } from '../world/combat';
import type { FxEvent } from './combatgl';
import { FxSys, col, mixc, type RGB } from './fx';
import { C } from './atlas';
import { K } from './fxbake';
import { decal } from './bakefx';
import { bladeLocal, BLADE_N, formOfLook, PSCALE, ESCALE } from '../world/blade';
import { ACTION_HIT, isWeaponAction, charToScreen, type CharState, type Look, type WeaponAction } from '../gfx/character';
import { WEAPONS, weaponTier, type WeaponKind } from '../data/weapons';

const WHITE: RGB = [1, 1, 1];
const DUST: RGB = [0.3, 0.25, 0.19];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** 出手时段过后刀光还留多久（秒） */
const FADE = 0.12;
/** 每一份刃还亮多久（越早扫过的越淡） */
const TRAIL = 0.17;
/** 直刺类（画残影和枪花，不画弧） */
const THRUST = new Set<string>(['spearL1', 'spearL2', 'spearL4', 'spearR', 'swordL4', 'swordR', 'heavyR']);

/** 兵器的金属色（0–1）和亮度（高阶的流光） */
function metal(look: Look): { c: RGB; glow: number } {
  const w = look.weapon!, T = weaponTier(w.kind, w.tier), hex = w.color ?? T?.metal ?? '#d8dce0';
  const n = parseInt(hex.slice(1), 16);
  return { c: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], glow: w.color ? 0.6 : T?.glow ?? 0 };
}

// 复用的暂存（不每帧新建）
/** 刀光取的点数：刃轨迹表只有 BLADE_N 份，按时间插成更密的一串（弧才圆，最新一点正好在刃此刻的位置，不落后） */
const DN = 19;
const PA = new Float64Array(DN * 2), PB = new Float64Array(DN * 2), PC = new Float64Array(DN * 2), AL = new Float64Array(DN), DL = new Float32Array(DN * 7);
/** 出手时段从 h0 到 t1 均匀取 n 个时刻，各按刃轨迹表线性插出握点和刃尖，写进 DL（布局同刃轨迹表） */
function dense(T: Float32Array, h0: number, t1: number, n: number) {
  for (let j = 0; j < n; j++) {
    const t = h0 + (t1 - h0) * (n > 1 ? j / (n - 1) : 1);
    let i = 0; while (i < BLADE_N - 2 && T[(i + 1) * 7 + 6] < t) i++;
    const ta = T[i * 7 + 6], tb = T[(i + 1) * 7 + 6], u = tb > ta ? Math.max(0, Math.min(1, (t - ta) / (tb - ta))) : 0;
    for (let q = 0; q < 6; q++) DL[j * 7 + q] = T[i * 7 + q] + (T[(i + 1) * 7 + q] - T[i * 7 + q]) * u;
    DL[j * 7 + 6] = t;
  }
}
const V = { x: 0, y: 0, z: 0 };
/** 局部刃上 u 处（0 = 握点、1 = 刃尖，可以大于 1）的画布坐标 */
function at(T: Float32Array, i: number, u: number, st: CharState, look: Look, S: number, out: Float64Array, j: number) {
  const o = i * 7;
  V.x = T[o] + (T[o + 3] - T[o]) * u; V.y = T[o + 1] + (T[o + 4] - T[o + 1]) * u; V.z = T[o + 2] + (T[o + 5] - T[o + 2]) * u;
  const q = charToScreen(st, look, S, V); out[j * 2] = q.x; out[j * 2 + 1] = q.y;
}

/** 一个人此刻的刀光 */
function swing(F: FxSys, st: CharState, look: Look, scale: number) {
  const a = st.action; if (!isWeaponAction(a)) return;
  const fl = formOfLook(look); if (!fl) return;
  const [h0, h1] = ACTION_HIT[a as WeaponAction], now = st.actionT;
  if (now < h0 - 0.005 || now > h1 + FADE) return;
  const T = bladeLocal(fl.kind, fl.form, a); if (!T) return;
  const kind = fl.kind, ext = WEAPONS[kind].feel.bladeExt, M = metal(look);
  const cc: RGB = mixc(M.c, WHITE, 0.15 + 0.25 * M.glow), core = mixc(cc, WHITE, 0.55), bright = 0.75 + 0.5 * M.glow;
  const fade = now > h1 ? 1 - (now - h1) / FADE : 1;
  // 扫过了的那几份（按秒数），越早的越淡
  const t1 = Math.min(now, h1), n = Math.max(2, Math.min(DN, Math.round(DN * (t1 - h0) / Math.max(0.01, h1 - h0)) + 1));
  if (t1 <= h0) return;
  dense(T, h0, t1, n);
  for (let j = 0; j < n; j++) AL[j] = Math.max(0, 1 - (now - DL[j * 7 + 6]) / TRAIL) * fade;
  const prev = F.B.billboard; F.B.billboard = { x: st.x, y: st.y };
  const B = F.B, S = scale;
  if (THRUST.has(a)) {
    // 直刺：最后三份各留一道残影（刃根到刃尖外一截），枪尖一朵转着的枪花
    for (let k = 0; k < 3 && n - 1 - k * 5 >= 0; k++) {
      const i = n - 1 - k * 5, al = AL[i] * (1 - k * 0.3);
      at(DL, i, 0.35, st, look, S, PA, 0); at(DL, i, Math.min(ext, 1.25), st, look, S, PA, 1);
      F.beam(PA[0], PA[1], PA[2], PA[3], kind === 'spear' ? 10 : 7, cc, 0.4 * al * bright);
      F.beam(PA[0], PA[1], PA[2], PA[3], 3, WHITE, 0.75 * al);
    }
    if (n) {
      at(DL, n - 1, 1.02, st, look, S, PC, 0);
      const al = AL[n - 1];
      F.glow(PC[0], PC[1], kind === 'spear' ? 20 : 14, core, 0.45 * al * bright);
      if (kind === 'spear') { F.sprite(C.Ring, PC[0], PC[1], 34, 34, st.t * 18, cc, 0.5 * al, 1); F.sprite(C.Slash, PC[0], PC[1], 46, 10, st.t * 18 + 1.2, core, 0.45 * al, 1); }
    }
    F.B.billboard = prev; return;
  }
  if (n < 2) { F.B.billboard = prev; return; }
  // 弧：内边、外边各取一串点
  const lay = (u0: number, u1: number, cell: number, c: RGB, a0: number, a1: number, add: number) => {
    for (let i = 0; i < n; i++) { at(DL, i, u0, st, look, S, PA, i); at(DL, i, u1, st, look, S, PB, i); }
    B.ribbon(cell, PA, PB, n, (i) => AL[i] * a0, (i) => AL[i] * a1, c[0], c[1], c[2], add);
  };
  if (kind === 'scythe') {
    // 魂镰：先压一层暗紫（显分量），再沿刃尖轨迹铺一弯月牙——两头尖、中间宽，血红边、紫芯、外缘一线白
    lay(0.45, 1.12, C.Beam, [0.08, 0.02, 0.1], 0.42, 0.6, 0);
    lay(0.55, 1.15, C.Beam, mixc(cc, [0.5, 0.12, 0.85], 0.7), 0.3 * bright, 0.5 * bright, 1);
    for (let i = 0; i < n; i++) at(DL, i, 1.08, st, look, S, PC, i);
    const crest = (w: number) => (i: number) => w * Math.pow(Math.sin(Math.PI * Math.min(1, (i + 0.5) / n)), 0.7);
    B.strip(C.Beam, PC, n, crest(30), (i) => AL[i] * 0.5, 0.75, 0.04, 0.12, 1);          // 血红的外弧
    B.strip(C.Beam, PC, n, crest(18), (i) => AL[i] * 0.7, 0.42, 0.1, 0.85, 1);           // 紫芯
    B.strip(C.Beam, PC, n, crest(5), (i) => AL[i] * 0.85, 1, 0.92, 1, 1);                // 一线白
    lay(1.1, ext * 0.88, C.Beam, [0.6, 0.2, 0.9], 0.1, 0.03, 1);                          // 镰风
    F.B.billboard = prev; return;
  }
  if (kind === 'heavy') {
    lay(0.2, 1.14, C.Beam, [0.12, 0.08, 0.05], 0.3, 0.45, 0);             // 压一层暗色：显分量（亮底上加色的光看不出来）
    lay(0.15, 1.15, C.Beam, mixc(cc, [1, 0.55, 0.25], 0.4), 0.5 * bright, 0.7 * bright, 1);
    lay(1.1, ext * 0.9, C.Beam, cc, 0.12, 0.04, 1);                         // 刀风
  } else {
    lay(0.55, 1.08, C.Beam, cc, 0.3 * bright, 0.55 * bright, 1);
    lay(1.04, ext * 0.85, C.Beam, cc, 0.1, 0.03, 1);                        // 剑风：很淡
  }
  // 刃尖一线白芯
  for (let i = 0; i < n; i++) at(DL, i, 1.02, st, look, S, PC, i);
  B.strip(C.Beam, PC, n, () => (kind === 'heavy' ? 13 : 5), (i) => AL[i] * (kind === 'heavy' ? 0.6 : 0.85), core[0], core[1], core[2], 1);
  F.B.billboard = prev;
}

/** 剑气：一道往前飞的月牙弧光（贴着地面上方 z 那么高） */
function wave(F: FxSys, W: { x: number; y: number; z: number; ux: number; uy: number; w: number; t: number; left: number; color: string }) {
  const cc = col(W.color), core = mixc(cc, WHITE, 0.6);
  const k = Math.min(1, W.t / 0.05) * Math.min(1, W.left / 160), nx = -W.uy, ny = W.ux, R = W.w * (0.8 + 0.3 * Math.min(1, W.t * 4));
  const N = 9, pts = new Float64Array(N * 2), off = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const th = -1.1 + 2.2 * i / (N - 1), c = Math.cos(th), s = Math.sin(th);
    pts[i * 2] = W.x + nx * s * R + W.ux * (c - 1) * R * 0.55; pts[i * 2 + 1] = W.y + (ny * s * R + W.uy * (c - 1) * R * 0.55) * 0.82; off[i] = -W.z;
  }
  const prev = F.B.billboard; F.B.billboard = null;
  F.B.strip(C.Beam, pts, N, (i) => 34 * Math.sin(Math.PI * (0.08 + 0.84 * i / (N - 1))), () => 0.38 * k, cc[0], cc[1], cc[2], 1, off);
  F.B.strip(C.Beam, pts, N, (i) => 9 * Math.sin(Math.PI * (0.1 + 0.8 * i / (N - 1))), () => 0.85 * k, core[0], core[1], core[2], 1, off);
  F.B.billboard = prev;
}

/** 每帧：所有正在出兵器招式的人的刀光、飞着的剑气（drawBrawlGL 末尾调） */
export function drawBlades(F: FxSys, c: Combat) {
  if ((globalThis as { __noBlade?: boolean }).__noBlade) return;   // 截图对照用：关掉刀光
  const B = c.brawl, p = c.game.player;
  if (p.look?.weapon && isWeaponAction(p.st.action)) swing(F, p.st, p.look, PSCALE);
  for (const e of c.enemies) unit(F, e);
  for (const e of c.allies) unit(F, e);
  for (const W of B.waves) wave(F, W);
}
function unit(F: FxSys, e: Enemy) { if (!e.dead && e.cs && e.look?.weapon && isWeaponAction(e.cs.action) && !(e.hideT > 0)) swing(F, e.cs, e.look, ESCALE); }

/** 兵器的两个画面事件：命中的斩痕火花、重兵砸地的震波 */
export function bladeEvent(F: FxSys, ev: FxEvent) {
  const cc = col(ev.color ?? '230,235,240'), core = mixc(cc, WHITE, 0.6), p = ev.power ?? 1, kind = (ev.kind ?? 'sword') as WeaponKind;
  if (ev.k === 'bxwhit') {
    const a = F.B.direction(Math.cos(ev.dir ?? 0), Math.sin(ev.dir ?? 0));
    if (hfSetting.on) { /* r9-hitfeel：星和方向线由全游戏打击感画；点光源不打（近镜头里在草地上照出一个发白的圆盘） */ }
    else F.flash(ev.x, ev.y, 6 + p * 3, core, 0.06);
    // 斩痕：顺着刀路一道（重兵宽、剑细、枪是一点穿出去的光）
    if (kind === 'spear') { F.emit({ x: ev.x, y: ev.y, life: 0.12, s0: 50 + p * 14, s1: 90 + p * 20, c: core, a: 0.6, cell: C.Slash, rot: a }); F.shockRing(ev.x, ev.y, 26 + p * 8, cc, 0.16, 0.9, 0.6); }
    else F.emit({ x: ev.x, y: ev.y, life: kind === 'heavy' ? 0.16 : 0.12, s0: (kind === 'heavy' ? 46 : 34) + p * 10, s1: (kind === 'heavy' ? 110 : 80) + p * 20, c: core, a: kind === 'heavy' ? 0.6 : 0.7, cell: C.Slash, rot: a + Math.PI / 2 + rnd(-0.4, 0.4) });
    F.sparks(ev.x, ev.y, core, Math.round(6 + p * 4), 520 + p * 160, 0.25, 2.6, a, 0.9);
    // 重的一下才加一圈冲击（实拍看过：每下都套一圈，再叠上破罡的光，人被一团白糊住）
    if (p >= 2.4) { F.shock(ev.x, ev.y, 80 + p * 25, 4 + p, 0.2); F.shockRing(ev.x, ev.y, 34 + p * 10, cc, 0.18, 0.9, 0.3); }
    if (kind === 'heavy') for (let i = 0; i < 5; i++) { const q = rnd(0, Math.PI * 2); F.emit({ x: ev.x, y: ev.y + 40, vx: Math.cos(q) * rnd(80, 200), vy: rnd(-80, -20), life: rnd(0.35, 0.6), s0: rnd(16, 24), s1: 46, c: DUST, a: 0.22, add: 0, cell: C.Glow, drag: 3 }); }
    return;
  }
  if (ev.k === 'bxquake') {
    // 震波：贴地两圈往外推的气浪、一圈裂纹（留一会儿）、尘、碎石往上崩；短命，不糊画面
    const r = ev.r ?? 280, prev = F.B.billboard; F.B.billboard = null;
    decal(K.Crack, ev.x, ev.y, r * 0.35, r * 0.75, 5, [0.09, 0.07, 0.05], 0.7, { add: 0, sq: 0.5, rot: Math.random() * 6.28, ease: 8, fin: 0.02 });
    decal(K.Crack, ev.x, ev.y, r * 0.3, r * 0.6, 1.1, mixc(cc, [1, 0.7, 0.4], 0.5), 0.45, { add: 1, sq: 0.5, rot: Math.random() * 6.28, ease: 6, fin: 0.02 });
    F.shockRing(ev.x, ev.y, r * 0.9, mixc(cc, WHITE, 0.2), 0.3, 0.55, 0.38, true);
    F.shockRing(ev.x, ev.y, r * 1.35, DUST, 0.45, 0.55, 0.3, true);
    F.shock(ev.x, ev.y, r * 1.3, 10, 0.3);
    F.smokeRing(ev.x, ev.y, r * 1.1, DUST, 0.35, 0.8);
    F.B.billboard = { x: ev.x, y: ev.y };
    for (let i = 0; i < 16; i++) { const q = Math.random() * Math.PI * 2, v = rnd(160, 420); F.emit({ x: ev.x + Math.cos(q) * r * 0.25, y: ev.y - 10, vx: Math.cos(q) * v, vy: -rnd(260, 620), life: rnd(0.5, 0.9), s0: rnd(5, 11), s1: 3, c: [0.4, 0.33, 0.25], add: 0, a: 0.95, grav: 1500, drag: 0.6, cell: C.Shard, rot: q, vr: rnd(-10, 10) }); }
    F.sparks(ev.x, ev.y - 20, core, 16, 700, 0.3, 2.8);
    F.B.billboard = prev;
  }
}
