// 战斗特效（WebGL）：弹道、法术、领域、护盾、受击。读取 Combat 的状态绘制，并在新特效出现时触发粒子爆发。
import { bloodFx, goreFx, drawStains } from './goregl';
import { bakeSpawn, bakeVfx, bakeField, bakeEvent, bakeStatus, drawDecals } from './bakefx';
import { prof } from '../core/prof';
import type { Combat, Proj } from '../world/combat';
import type { Batch, GroundAnchor } from './batch';
import { FxSys, col, mixc, RGB, FlightPoint, fireCell, smokeCell, extOK } from './fx';
import { C } from './atlas';
import { lootGlow, lootTier } from '../hd2d/grade';
import { SUMMON_EVENTS, summonEvent, drawSummonsGL } from './summongl';
import { enemyVis } from '../world/combatfx';
import { drawFoeGL } from './foegl';
import { drawHeroGL, drawOrbitGL } from './herogl';
import { drawGuardShell, GUARD } from './guards';
import { dunOf, DUN_COL, wardY, wardR } from '../world/foemind';
import { drawEliteGL } from './elitegl';
import { BRAWL_EVENTS, brawlEvent, drawBrawlGL } from './brawlgl';
import { drawWreckGL } from './wreckgl';
import { IMPACT_EVENTS, impactEvent, drawImpactGL } from './impactgl';   // r7 通用打击表现（world/impactfx.ts）
import { P1_EVENTS, p1Event, drawP1GL } from './p1gl';   // r8-p1 撼山客第一阶段（照参考视频）的光效
import { HS3_EVENTS, hs3Event, drawHs3GL } from './hsmoves3gl';   // 撼山客招式第三批
import { drawHs2GL } from './hsmoves2gl';   // 撼山客招式第二批
import { hfHitGL, hfVfxSpawn, hfImpact, drawHfGL, drawHfStars } from './hitfeelgl';   // r9-hitfeel：全游戏打击感（命中三档的星和方向线、法术法器的四层立体爆炸）
import { hitFeelPeek } from '../world/hitfeel';
import { drawLockGL } from './lockgl';   // r11-lock：锁定标记（脚下锁定环、头顶箭头、透视层、画面外的边缘箭头）
import { drawBeastGL } from './beastgl';
import { drawLingdunGL } from './lingdungl';
import { castFlourish, projSparkle } from './spellgl';
import { drawNitianGL } from './nitiangl';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const FIRE: RGB = [1, 0.55, 0.18];
const SMOKE: RGB = [0.13, 0.11, 0.1];

/** 每秒发射 rate 个：返回本帧数量（带随机余数） */
const nEmit = (rate: number, dt: number) => { const f = rate * dt; return Math.floor(f) + (Math.random() < f % 1 ? 1 : 0); };

// 末尾一组是贴身斗法（world/brawl.ts → gl/brawlgl.ts）：拳风、欺身、轰飞、砸地、坑、缩地、脱困、水花、破罡
export type FxKind = 'hit' | 'kill' | 'phit' | 'blood' | 'gore' | 'cast' | 'block' | 'dodge' | 'xueying' | 'impact' | 'roar' | 'sumpop' | 'foxfire' | 'sumhit' | 'sumboom' | 'sumgone' | 'ward' | 'shatter' | 'dunflash' | 'bxhit' | 'rush' | 'launch' | 'slam' | 'crater' | 'blinkstep' | 'tech' | 'splash' | 'bxguard'
  | 'clash' | 'pillar' | 'wake' | 'breach' | 'rubble' | 'bxcharge' | 'bxblock'
  | 'meteor' | 'voidpunch' | 'clashring'
  | 'bxwhit' | 'bxquake';   // 兵器接进近战：兵器命中的斩痕火花、重兵砸地的震波（gl/bladegl.ts）   // 近战 E2：拼招气场、砸海水柱、犁水、破水而出、碎石、蓄力闪光、撞阵被拦（gl/brawlgl.ts）
export interface FxEvent { k: FxKind; x: number; y: number; x2?: number; y2?: number; color?: string; power?: number; crit?: boolean; dir?: number; big?: boolean; kind?: string; r?: number; anchor?: GroundAnchor;
  /** r9-hitfeel（world/hitfeel.ts 定的）：'hit' / 'phit' 的档位（1 轻 / 2 重 / 3 终；0 = 远处只做数值）、什么打的、画面档、你挨打（偏红） */
  tier?: number; wk?: string; lod?: number; red?: boolean }

const boostTrail: FlightPoint[] = [];
/** 飞行疾遁：遁光拖尾（雷遁电蛇 / 血光遁血雾 / 寻常遁光）+ 掠过的风线 */
function drawBoost(F: FxSys, c: Combat, dt: number) {
  const g = c.game, pl = g.player, lift = pl.st.lift;
  const hx = pl.x, hy = pl.y - lift - 6;   // 遁光自脚下飞剑/法器处拖出
  const kind = g.boostKind;
  const Lmax = 170 + 0.16 * g.speed;
  // 按距离采样，限制总长：慢时短而柔，快时长而直
  const T = boostTrail;
  if (pl.boosting) {
    const last = T[T.length - 1];
    if (!last || Math.hypot(hx - last[0], hy - last[1] - last[2]) > 7) T.push([hx, pl.y, -lift - 6]); else { last[0] = hx; last[1] = pl.y; last[2] = -lift - 6; }
  } else if (T.length) T.splice(0, Math.max(1, Math.ceil(T.length * dt * 6)));
  let L = 0;
  for (let i = T.length - 1; i > 0; i--) { L += Math.hypot(T[i][0] - T[i - 1][0], T[i][1] + T[i][2] - T[i - 1][1] - T[i - 1][2]); if (L > Lmax) { T.splice(0, i - 1); break; } }
  if (T.length > 64) T.splice(0, T.length - 64);
  if (T.length < 2) return;
  const fade = pl.boosting ? 1 : Math.min(1, T.length / 10);
  const a0 = T[0], a1 = T[T.length - 1];
  const dx = a1[0] - a0[0], dy = a1[1] + a1[2] - a0[1] - a0[2], dir = F.B.direction(dx, dy), ux = Math.cos(dir), uy = Math.sin(dir);
  F.B.billboard = { x: pl.x, y: pl.y };
  const tm = g.time;
  if (kind === 'thunder') {
    const col: RGB = [1, 0.8, 0.38], VI: RGB = [1, 0.9, 0.62];   // 第三十五步：云雷双翼金色雷遁
    F.flightTrail(T, 90, VI, 0.16 * fade, C.Glow, 1, 0.6);
    F.flightTrail(T, 30, col, 0.3 * fade, C.Beam, 1, 1);
    // 雷光：沿轨迹的折线电弧，每帧换形（闪烁），不再是实心光柱
    const nb = pl.boosting ? 2 : 1;
    for (let b = 0; b < nb; b++) {
      const j = Math.floor(Math.random() * Math.max(1, T.length * 0.5)), p0 = T[j];
      F.bolt(p0[0], p0[1], hx, pl.y, Math.floor(tm * 40) * 7 + b * 131, 10 + 12 * Math.random(), 1.1, col, 0.75 * fade, 10, b === 0, [p0[2], -lift - 6]);
    }
    if (!pl.boosting) { F.B.billboard = null; return; }
    F.glow(hx, hy - 20, 70, col, 0.28); F.glow(hx, hy - 20, 26, WHITE, 0.35);
    if (Math.random() < dt * 7) { const a = rnd(0, TAU); F.bolt(hx, hy - 30, hx + Math.cos(a) * rnd(50, 110), hy - 30 + Math.sin(a) * rnd(30, 80), Math.random() * 1e6, 10, 0.9, VI, 0.8, 6, false); }
    if (Math.random() < dt * 26) F.emit({ x: hx + rnd(-24, 24), y: hy - rnd(0, 60), vx: -ux * 420 + rnd(-90, 90), vy: -uy * 420 + rnd(-90, 90), life: 0.2, s0: 2.6, s1: 0.8, c: WHITE, stretch: 3, cell: C.Glow });
  } else if (kind === 'blood') {
    const col: RGB = [0.9, 0.08, 0.14], DK: RGB = [0.28, 0.02, 0.04];
    F.flightTrail(T, 64, DK, 0.22 * fade, C.Glow, 0, 0.7);     // 暗红血雾底（非叠加，避免发白）
    F.flightTrail(T, 40, col, 0.34 * fade, C.Glow, 1, 0.8);
    F.flightTrail(T, 10, [1, 0.55, 0.5], 0.3 * fade, C.Beam, 1, 1);
    if (!pl.boosting) { F.B.billboard = null; return; }
    F.glow(hx, hy - 30, 60, col, 0.26);
    if (Math.random() < dt * 34) F.emit({ x: hx + rnd(-18, 18), y: hy - rnd(0, 60), vx: -ux * 180 + rnd(-40, 40), vy: -uy * 180 + rnd(-40, 20), life: rnd(0.45, 0.9), s0: rnd(16, 28), s1: 4, c: col, a: 0.4, drag: 2, cell: C.Wisp, rot: Math.random() * 6 });
    if (Math.random() < dt * 10) F.emit({ x: hx + rnd(-10, 10), y: hy - rnd(10, 50), vx: -ux * 60, vy: -uy * 60 + 40, life: 0.8, s0: 3, s1: 1.5, c: col, a: 0.9, grav: 160, cell: C.Glow });
  } else {
    const col: RGB = [0.6, 1, 0.86];
    F.flightTrail(T, 70, col, 0.14 * fade, C.Glow, 1, 0.5);
    F.flightTrail(T, 46, col, 0.3 * fade, C.Beam, 1, 1);
    F.flightTrail(T, 9, WHITE, 0.42 * fade, C.Beam, 1, 1);
    if (!pl.boosting) { F.B.billboard = null; return; }
    F.glow(hx, hy, 46, col, 0.26);
    if (Math.random() < dt * 22) F.emit({ x: hx + rnd(-18, 18), y: hy - rnd(-6, 40), vx: -ux * 150 + rnd(-20, 20), vy: -uy * 150 + rnd(-20, 20), life: rnd(0.35, 0.6), s0: 4.5, s1: 1, c: col, a: 0.7, cell: C.Glow });
  }
  // 风线：掠过的细长气流，越高越密
  const n = Math.round(dt * (36 + 56 * g.alt) + Math.random() * 0.6);
  for (let i = 0; i < n; i++) { const ox = rnd(-560, 560), oy = rnd(-340, 340); F.emit({ x: hx + ox + ux * 300, y: hy + oy + uy * 300, vx: -ux * 2000, vy: -uy * 2000, life: 0.2, s0: 2, s1: 1, c: WHITE, a: 0.28, stretch: 6, cell: C.Glow }); }
  F.B.billboard = null;
}

/** 投放边界：战斗中在神识圈内画一圈淡淡的虚线，标出功法/法器能打到的距离 */
let reachA = 0;
function drawReach(F: FxSys, c: Combat, t: number, dt: number) {
  const g = c.game, p = g.player;
  const want = c.inCombat && !g.halted ? 1 : 0;
  reachA += (want - reachA) * Math.min(1, dt * (want ? 3 : 1.5));
  if (reachA < 0.02) return;
  const R = c.reach, z = Math.max(0.2, g.cam.zoom), w = 4.5 / z, N = 90, rot = t * 0.05;
  const burst = g.senseBurstT > 0, col: RGB = burst ? [0.8, 0.9, 1] : [0.85, 0.95, 0.9];
  for (let i = 0; i < N; i++) {
    const a0 = rot + (i / N) * TAU, a1 = a0 + (TAU / N) * 0.55, am = (a0 + a1) / 2;
    const pts = [p.x + Math.cos(a0) * R, p.y + Math.sin(a0) * R, p.x + Math.cos(am) * R, p.y + Math.sin(am) * R, p.x + Math.cos(a1) * R, p.y + Math.sin(a1) * R];
    F.B.strip(C.Beam, pts, 3, () => w, () => 0.3 * reachA, col[0], col[1], col[2], 1);
  }
}

/** 第二十八步：统一打击感——三档冲击（小：闪光+气浪；中：再加空间扭曲、火花、焦痕；大：全屏级） */
function impactFx(F: FxSys, x: number, y: number, tier: number, cc: RGB) {
  const core = mixc(cc, [1, 1, 1], 0.6);
  if (tier <= 1) { F.flash(x, y - 30, 40, core, 0.14); F.shockRing(x, y, 110, cc, 0.35, 0.55, 0.7, true); F.sparks(x, y - 30, core, 10, 420, 0.3, 2.6); return; }
  if (tier === 2) {
    F.flash(x, y - 40, 80, core, 0.16); F.shockRing(x, y, 220, cc, 0.45, 0.55, 0.65, true); F.shockRing(x, y, 150, core, 0.3, 0.55, 0.5, true);
    F.shock(x, y, 340, 14, 0.5); F.sparks(x, y - 30, core, 26, 700, 0.45, 3.2);
    F.rays(x, y - 40, 260, cc, 0.32, 0.3); F.smokeRing(x, y, 200, [0.24, 0.2, 0.16], 0.3, 0.8);
    for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; F.emit({ x, y: y - 20, vx: Math.cos(a) * rnd(200, 500), vy: Math.sin(a) * rnd(100, 260) - 80, life: rnd(0.4, 0.8), s0: rnd(18, 30), s1: 50, c: [0.25, 0.2, 0.16], a: 0.35, add: 0, cell: smokeCell(), drag: 3 }); }
    return;
  }
  // 大：光柱贯天 + 三重气浪 + 强扭曲 + 放射金芒
  F.flash(x, y - 60, 260, core, 0.35);
  F.emit({ x, y: y - 300, life: 0.5, s0: 160, s1: 60, c: core, a: 0.9, cell: C.Beam, stretch: 0 } as any);
  F.beam(x, y + 10, x, y - 900, 140, cc, 0.55); F.beam(x, y + 10, x, y - 900, 40, core, 0.9);
  for (let i = 0; i < 3; i++) F.shockRing(x, y, 300 + i * 200, i ? cc : core, 0.5 + i * 0.15, 0.55, 1 - i * 0.2, true);
  F.shock(x, y, 900, 26, 0.85);
  F.rays(x, y - 60, 700, core, 0.4, 0.45); F.rays(x, y - 60, 480, cc, 0.3, 0.6);
  F.smokeRing(x, y, 520, [0.22, 0.18, 0.14], 0.4, 1.2); F.glint(x, y - 60, 160, core, 0.9, 0.35);
  F.sparks(x, y - 40, core, 80, 1200, 0.7, 4);
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; F.emit({ x, y: y - 30, vx: Math.cos(a) * 1400, vy: Math.sin(a) * 760, life: 0.35, s0: 10, s1: 3, c: core, stretch: 0.05, drag: 2 }); }
  for (let i = 0; i < 18; i++) { const a = Math.random() * TAU; F.emit({ x, y: y - 20, vx: Math.cos(a) * rnd(300, 800), vy: Math.sin(a) * rnd(150, 400) - 100, life: rnd(0.7, 1.3), s0: rnd(30, 50), s1: 110, c: [0.22, 0.18, 0.14], a: 0.35, add: 0, cell: smokeCell(), drag: 2.5 }); }
}

/** 焦痕：重击之后地上留下的灼烧裂纹，数秒后淡去 */
function drawScorch(F: FxSys, c: Combat, dt: number) {
  for (const s of c.scorch) {
    s.t += dt;
    const k = Math.min(1, s.t / 0.15) * Math.min(1, (s.dur - s.t) / 2);
    if (k <= 0) continue;
    F.ground(C.Smoke, s.x, s.y, s.r * 1.25, s.rot, [0.14, 0.11, 0.08], 0.38 * k, 0, 0.5);
    F.ground(C.Ink, s.x, s.y, s.r * 0.8, s.rot + 1, [0.1, 0.08, 0.06], 0.22 * k, 0, 0.5);
    F.ground(C.Crack, s.x, s.y, s.r * 0.7, s.rot, [0.08, 0.06, 0.05], 0.3 * k, 0, 0.5);
    if (extOK()) F.ground(C.KDirt, s.x, s.y, s.r * 0.95, s.rot * 3, [0.16, 0.12, 0.09], 0.22 * k, 0, 0.5);
    const hot = Math.max(0, 1 - s.t / 2.5);
    if (hot > 0) { F.ground(C.Crack, s.x, s.y, s.r * 0.66, s.rot, col(s.color), 0.4 * hot, 1, 0.5); F.ground(C.Glow, s.x, s.y, s.r * 0.6, 0, col(s.color), 0.25 * hot, 1, 0.5); if (Math.random() < dt * 20 * hot) { const a = Math.random() * TAU, r = Math.random() * s.r * 0.7; F.emit({ x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r * 0.5, vy: rnd(-70, -30), life: rnd(0.4, 0.8), s0: 3, s1: 1, c: col(s.color), cell: C.Glow }); } }
  }
  c.scorch = c.scorch.filter((s) => s.t < s.dur);
}

/** 第三十二步：敌方修士的遁光拖尾（剑遁青白、血遁暗红、雷遁电蛇、魔影遁紫雾） */
function drawFoeDun(F: FxSys, c: Combat, dt: number) {
  for (const e of c.units as any[]) {
    if (e.def.kind !== 'human') continue;
    const T: FlightPoint[] = e._tr ??= [];
    if (e.trailReset) { T.length = 0; e.trailReset = false; }
    const hx = e.x, hy = e.y - e.flyH - e.lift - 4;
    if (e.dun > 0.15 && !e.dead) { const last = T[T.length - 1]; if (!last || Math.hypot(hx - last[0], hy - last[1] - last[2]) > 8) T.push([hx, e.y, -e.flyH - e.lift - 4]); else { last[0] = hx; last[1] = e.y; last[2] = -e.flyH - e.lift - 4; } }
    else if (T.length) T.splice(0, Math.max(1, Math.ceil(T.length * dt * 6)));
    if (T.length > 40) T.splice(0, T.length - 40);
    if (T.length < 2) continue;
    const vis = enemyVis(c, e); if (vis <= 0.02) continue;
    const kind = dunOf(e), cc = col(DUN_COL[kind]), fade = Math.min(1, T.length / 8) * vis * (e.dun > 0.15 ? 1 : 0.6);
    F.B.billboard = { x: e.x, y: e.y };
    if (kind === 'blood' || kind === 'demon') {
      F.flightTrail(T, 60, kind === 'blood' ? [0.28, 0.02, 0.04] : [0.18, 0.06, 0.24], 0.22 * fade, C.Glow, 0, 0.7);
      F.flightTrail(T, 36, cc, 0.32 * fade, C.Glow, 1, 0.8);
      F.flightTrail(T, 9, mixc(cc, WHITE, 0.5), 0.28 * fade, C.Beam, 1, 1);
      if (e.dun > 0.15 && Math.random() < dt * 26) F.emit({ x: hx + rnd(-14, 14), y: hy - rnd(0, 50), vx: rnd(-40, 40), vy: rnd(-40, 10), life: rnd(0.4, 0.8), s0: rnd(14, 24), s1: 4, c: cc, a: 0.4, drag: 2, cell: C.Wisp, rot: Math.random() * 6 });
    } else if (kind === 'thunder') {
      F.flightTrail(T, 70, [0.72, 0.6, 1], 0.14 * fade, C.Glow, 1, 0.6);
      F.flightTrail(T, 22, cc, 0.3 * fade, C.Beam, 1, 1);
      if (Math.random() < dt * 20) { const j = Math.floor(Math.random() * T.length * 0.5), p0 = T[j]; F.bolt(p0[0], p0[1], hx, e.y, Math.random() * 1e6, 10, 1, cc, 0.7 * fade, 8, false, [p0[2], -e.flyH - e.lift - 4]); }
    } else {
      F.flightTrail(T, 64, [0.1, 0.16, 0.2], 0.14 * fade, C.Glow, 0, 0.6);
      F.flightTrail(T, 56, cc, 0.2 * fade, C.Glow, 1, 0.5);
      F.flightTrail(T, 30, cc, 0.36 * fade, C.Beam, 1, 1);
      F.flightTrail(T, 8, WHITE, 0.5 * fade, C.Beam, 1, 1);
      if (e.dun > 0.15 && Math.random() < dt * 16) F.emit({ x: hx + rnd(-12, 12), y: hy - rnd(-4, 30), vx: rnd(-20, 20), vy: rnd(-20, 20), life: rnd(0.3, 0.5), s0: 4, s1: 1, c: cc, a: 0.7, cell: C.Glow });
    }
    if (e.dun > 0.15) F.glow(hx, hy - 20, 44, cc, 0.22 * vis);
    F.B.billboard = null;
  }
}

export function drawCombatGL(F: FxSys, c: Combat, t: number, dt: number) {
  const p = c.game.player;
  let fxMark = prof.t(), fxVertex = F.B.n;
  // 御剑/飞行时人是浮空的：所有挂在人物身上的光效（护体光圈、灵光罩、增益环）都要跟着抬
  const lift = p.st.lift || 0;
  drawDecals(F, dt);
  drawScorch(F, c, dt);
  drawHfGL(F, dt);   // r9-hitfeel：地上的冰霜印 / 毒斑、雷的电弧
  drawStains(F, c);   // 地上的血迹（world/gore.ts）
  drawWreckGL(F, c, t, dt);   // 野外破坏：尘浪、飞土、倒树的尘与落叶、分海的水墙（gl/wreckgl.ts）
  drawBoost(F, c, dt);
  drawFoeDun(F, c, dt);
  drawReach(F, c, t, dt);
  drawFoeGL(F, c, t, dt);
  drawBrawlGL(F, c, t, dt);   // 近战：被击飞者的尾迹、欺身光带、残影、架势光环
  drawP1GL(F, c, t, dt);   // r8-p1：挥击弧光、速度带、竖环、菱光、X 斩、光柱
  drawImpactGL(F, c, t, dt);   // r7：拳压的气浪、超高速追击的线、金刚不坏的罡气、夹住的飞剑
  drawHs3GL(F, c, t, dt);   // 撼山客第三批：蓄劲、预警、冲天光柱、流星、借星的陨石、追击线（gl/hsmoves3gl.ts）
  drawHs2GL(F, c, t, dt);   // 撼山客招式第二批：残拳、交叉残影线、穴位、犁地的泥土火星、下坠火尾（gl/hsmoves2gl.ts）
  drawBeastGL(F, c, t, dt);   // v0.63：四级以上妖兽的妖气 / 起手 / 落招（取代像素特效）
  prof.add('FX战·环境', fxMark, F.B.n - fxVertex); fxMark = prof.t(); fxVertex = F.B.n;
  // ---- 事件（命中/击杀/受伤）
  // 同一帧多次命中同一处（剑阵、飞针）：只完整播放前几次，其余减弱，避免叠加过曝
  const hitSeen: [number, number, number][] = [];
  hitFeelPeek(c)?.flush();   // r9-hitfeel：逻辑那边这一帧还没定档的（命中发生在战斗更新之后）先定档，再画
  const up = c.game.renderer?.hd?.upDir ?? null;
  let hfN = 0;
  const goreSeen: [number, number][] = [];   // 这一帧炸开过的位置：同一处的斩杀白光压下去，不盖住血花
  for (const ev of c.fxq) {
    F.B.billboard = null;
    const cc = col(ev.color ?? '255,236,200');
    const dir = ev.dir === undefined ? undefined : F.B.direction(Math.cos(ev.dir), Math.sin(ev.dir));
    F.B.billboard = ev.anchor ?? (ev.k === 'dodge' || ev.k === 'impact' ? { x: ev.x, y: ev.y } : null);
    bakeEvent(ev);
    if (ev.k === 'hit' && ev.tier !== undefined) {
      // r9-hitfeel：定了档的命中（0 = 远处只做数值）。同一帧画了十下以上的，后面的只画星和一条线
      if (ev.tier > 0) hfHitGL(F, ev, up, hfN++ >= 10);
    }
    else if (ev.k === 'hit') {
      const near = hitSeen.find((h) => Math.abs(h[0] - ev.x) < 50 && Math.abs(h[1] - ev.y) < 50);
      if (near) { near[2]++; if (near[2] > 2) { F.sparks(ev.x, ev.y, cc, 4, 300, 0.3, 2.5, dir, 1.6); continue; } }
      else hitSeen.push([ev.x, ev.y, 1]);
      F.hit(ev.x, ev.y, cc, Math.min(ev.power ?? 1, near ? 1 : 3), ev.crit && !near, dir);
    }
    else if (ev.k === 'impact') { if (!hfImpact(F, c, ev.x, ev.y, ev.power ?? 1, ev.color ?? '255,236,190')) impactFx(F, ev.x, ev.y, ev.power ?? 1, cc); }   // r9-hitfeel：二、三档换成四层立体爆炸
    else if (ev.k === 'blood') bloodFx(F, ev);
    else if (ev.k === 'gore') { goreFx(F, ev); goreSeen.push([ev.x, ev.y]); }
    else if (SUMMON_EVENTS.has(ev.k)) summonEvent(F, ev);
    else if (BRAWL_EVENTS.has(ev.k)) brawlEvent(F, ev);   // 近战的拳风、轰飞、砸地、缩地……
    else if (P1_EVENTS.has(ev.k)) p1Event(F, ev);   // r8-p1：命中星闪、冲刺、四层爆炸……
    else if (IMPACT_EVENTS.has(ev.k)) impactEvent(F, ev);   // r7：背后炸开、拳压、超高速追击、踏空气环、气合……
    else if (HS3_EVENTS.has(ev.k)) hs3Event(F, ev);   // 撼山客第三批：破界、借星、无极一击、千钧坠、分海
    else if (ev.k === 'kill') {
      const gored = ev.kind === 'death' && goreSeen.some((q) => Math.abs(q[0] - ev.x) < 80 && Math.abs(q[1] - ev.y) < 120);
      if (!gored) F.explode(ev.x, ev.y, 46, cc, { smoke: true, shock: true });
      F.ink(ev.x, ev.y + 30, 120, 0.25);
      F.smokeRing(ev.x, ev.y + 40, 90, [0.2, 0.17, 0.15], 0.35, 0.8);
      if (extOK()) for (let i = 0; i < 3; i++) F.emit({ x: ev.x + rnd(-14, 14), y: ev.y - 10, vx: rnd(-14, 14), vy: rnd(-90, -50), life: rnd(1, 1.5), s0: 40, s1: 90, c: mixc(cc, WHITE, 0.3), a: 0.32, cell: i % 2 ? C.KWisp1 : C.KWisp2, rot: rnd(-0.3, 0.3), drag: 0.6 });
      for (let i = 0; i < 18; i++) F.emit({ x: ev.x + rnd(-20, 20), y: ev.y + rnd(-30, 20), vx: rnd(-30, 30), vy: rnd(-120, -40), life: rnd(0.8, 1.6), s0: rnd(4, 8), s1: 1, c: mixc(cc, WHITE, 0.4), drag: 1, grav: -30, cell: C.Glow });
    } else if (ev.k === 'phit' && ev.tier !== undefined) {
      if (ev.tier > 0) hfHitGL(F, ev, up, hfN++ >= 10);   // r9-hitfeel：你挨打——偏红的星和方向线（朝来向）
      F.ink(ev.x, ev.y + 10, ev.big ? 70 : 46, 0.3, [0.35, 0.03, 0.03]);
    } else if (ev.k === 'phit') {
      F.flash(ev.x, ev.y, ev.big ? 50 : 30, [1, 0.25, 0.2], 0.09);
      F.sparks(ev.x, ev.y, [1, 0.35, 0.3], ev.big ? 8 : 4, 300, 0.35, 2.6);
      F.ink(ev.x, ev.y + 10, ev.big ? 90 : 60, 0.25, [0.35, 0.03, 0.03]);
      if (extOK()) F.emit({ x: ev.x, y: ev.y, life: 0.14, s0: ev.big ? 70 : 44, s1: ev.big ? 110 : 70, c: [1, 0.4, 0.3], a: 0.3, cell: C.KBurst1, rot: Math.random() * TAU });
    } else if (ev.k === 'block') { F.flash(ev.x, ev.y, 30, cc, 0.03); F.shockRing(ev.x, ev.y, 56, cc, 0.3, 0.9, 0.22); F.glint(ev.x, ev.y, 30, mixc(cc, WHITE, 0.5), 0.15, 0.18); F.sparks(ev.x, ev.y, mixc(cc, WHITE, 0.5), 3, 240, 0.3, 2.2); }
    else if (ev.k === 'dodge') { for (let i = 0; i < 10; i++) F.emit({ x: ev.x + rnd(-14, 14), y: ev.y - rnd(10, 90), vx: rnd(-40, 40), vy: rnd(-20, 10), life: rnd(0.3, 0.55), s0: rnd(16, 30), s1: 4, c: [0.75, 0.9, 1], a: 0.5, cell: C.Wisp, rot: 0 }); if (extOK()) F.emit({ x: ev.x, y: ev.y - 50, life: 0.35, s0: 50, s1: 120, c: [0.75, 0.9, 1], a: 0.35, cell: C.KTwirl, rot: Math.random() * TAU, vr: 6 }); }
    else if (ev.k === 'xueying') {
      // 血影遁：原地一团血雾炸开，沿途血影残像，落点血光收拢
      const x2 = ev.x2 ?? ev.x, y2 = ev.y2 ?? ev.y, big = !!ev.big, BL: RGB = [0.86, 0.06, 0.12], DK: RGB = [0.3, 0.02, 0.04];
      F.flash(ev.x, ev.y - 50, big ? 70 : 34, BL, 0.25); F.shockRing(ev.x, ev.y, big ? 360 : 140, BL, 0.5, 0.6, 0.5); if (big) F.shockRing(ev.x, ev.y, 240, DK, 0.4, 0.7, 0.8);
      F.smoke(ev.x, ev.y - 30, big ? 28 : 10, DK, 0.9, big ? 80 : 50, big ? 190 : 120);
      for (let i = 0; i < (big ? 64 : 22); i++) { const a = Math.random() * TAU, v = rnd(80, big ? 560 : 380); F.emit({ x: ev.x, y: ev.y - 50, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 40, life: rnd(0.4, 0.9), s0: rnd(6, 12), s1: 2, c: BL, drag: 2.5, grav: 120, cell: C.Glow, a: 0.8 }); }
      // 沿途：血雾长痕（暗红底 + 血光拉丝），越靠近落点越新、越浓
      const PL = Math.hypot(x2 - ev.x, y2 - ev.y) || 1, ux = (x2 - ev.x) / PL, uy = (y2 - ev.y) / PL;
      const n = Math.min(70, Math.max(8, Math.round(PL / (big ? 55 : 45))));
      for (let i = 1; i < n; i++) {
        const u = i / n, side = rnd(-26, 26) * (big ? 1.7 : 1), x = ev.x + (x2 - ev.x) * u - uy * side, y = ev.y + (y2 - ev.y) * u - 50 + ux * side, age = 0.45 + u * 0.55;
        F.emit({ x, y, vx: rnd(-20, 20), vy: rnd(-30, -5), life: rnd(0.8, 1.3) * age, s0: rnd(70, 100) * (big ? 1.5 : 1), s1: rnd(150, 210) * (big ? 1.5 : 1), c: DK, a: 0.36, add: 0, drag: 1.5, cell: smokeCell(), rot: Math.random() * TAU });
        F.emit({ x, y, life: rnd(0.4, 0.7) * age, s0: 90, s1: 60, c: BL, a: 0.16, cell: C.Glow });
        F.emit({ x, y, vx: ux * 160, vy: uy * 160, life: rnd(0.35, 0.6) * age, s0: rnd(10, 16), s1: 3, c: BL, a: 0.55, drag: 3, stretch: 5, cell: C.Glow });
        if (i % 3 === 0) F.emit({ x, y: y + rnd(-14, 14), life: 0.45 * age, s0: 46, s1: 14, c: BL, a: 0.35, cell: C.Wisp, rot: Math.atan2(uy, ux) });
      }
      F.flash(x2, y2 - 50, big ? 56 : 28, BL, 0.3); F.shockRing(x2, y2, big ? 260 : 100, BL, 0.4, 0.55, 0.5);
      for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; F.emit({ x: x2 + Math.cos(a) * 120, y: y2 - 50 + Math.sin(a) * 60, vx: -Math.cos(a) * 300, vy: -Math.sin(a) * 150, life: 0.4, s0: 8, s1: 2, c: BL, cell: C.Glow, a: 0.8 }); }
    }
    else if (ev.k === 'ward') {   // 护体灵光升起：灵光自外向内收拢成罩
      const r = ev.r ?? 60;
      F.flash(ev.x, ev.y, r * 0.8, cc, 0.1);
      for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; F.emit({ x: ev.x + Math.cos(a) * r * 2, y: ev.y + Math.sin(a) * r * 1.6, vx: -Math.cos(a) * r * 3.2, vy: -Math.sin(a) * r * 2.6, life: 0.35, s0: 7, s1: 2, c: cc, cell: C.Glow, a: 0.45 }); }
      F.shockRing(ev.x, ev.y + r * 0.6, r * 1.6, cc, 0.4, 0.5, 0.28);
      if (extOK()) F.emit({ x: ev.x, y: ev.y, life: 0.4, s0: r * 3.2, s1: r * 2.1, c: cc, a: 0.26, cell: C.KBubble });
    } else if (ev.k === 'shatter') {   // 护体灵光破碎：碎光四溅
      const r = ev.r ?? 60;
      F.flash(ev.x, ev.y, r * 1.4, mixc(cc, WHITE, 0.6), 0.22);
      F.shockRing(ev.x, ev.y + r * 0.5, r * 3, cc, 0.45, 0.55, 0.8);
      for (let i = 0; i < 30; i++) { const a = Math.random() * TAU, v = rnd(180, 520); F.emit({ x: ev.x + Math.cos(a) * r * 0.9, y: ev.y + Math.sin(a) * r, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 60, life: rnd(0.5, 0.9), s0: rnd(14, 26), s1: 4, c: mixc(cc, WHITE, 0.3), a: 0.9, drag: 1.5, grav: 380, cell: C.Shard, rot: a, vr: rnd(-8, 8) }); }
      F.sparks(ev.x, ev.y, mixc(cc, WHITE, 0.5), 18, 460, 0.4, 3);
      F.rays(ev.x, ev.y, r * 4, mixc(cc, WHITE, 0.4), 0.45, 0.3); F.glint(ev.x, ev.y, r * 1.2, mixc(cc, WHITE, 0.6), 0.9, 0.3);
    } else if (ev.k === 'dunflash') {   // 雷遁 / 剑遁 / 魔影遁 / 土遁：原地一闪，沿途残光，落点收拢
      const x2 = ev.x2 ?? ev.x, y2 = ev.y2 ?? ev.y, kind = ev.kind;
      F.flash(ev.x, ev.y - 50, 40, cc, 0.22); F.shockRing(ev.x, ev.y, 140, cc, 0.45, 0.55, 0.5, true);
      if (kind === 'thunder') { for (let b = 0; b < 3; b++) F.bolt(ev.x, ev.y - 50, x2, y2 - 50, Math.random() * 1e6, 26, 1.4, cc, 0.9, 14, b === 0); F.crackle(ev.x, ev.y - 50, 70, cc, 0.9, 2); F.crackle(x2, y2 - 50, 80, cc, 0.9, 3); }
      else if (kind === 'earth') { F.smoke(ev.x, ev.y - 10, 14, [0.32, 0.26, 0.18], 0.55, 60, 90); F.smoke(x2, y2 - 10, 18, [0.32, 0.26, 0.18], 0.6, 70, 110); for (let i = 0; i < 22; i++) { const a = Math.random() * TAU, v = rnd(120, 380); F.emit({ x: x2, y: y2 - 10, vx: Math.cos(a) * v, vy: -rnd(160, 420), life: rnd(0.6, 1), s0: rnd(6, 12), s1: 3, c: [0.45, 0.36, 0.24], add: 0, a: 0.9, grav: 900, cell: C.Shard, rot: a }); } }
      const PL = Math.hypot(x2 - ev.x, y2 - ev.y) || 1, n = Math.min(40, Math.max(6, Math.round(PL / 50)));
      if (kind !== 'earth') for (let i = 1; i < n; i++) { const u = i / n, x = ev.x + (x2 - ev.x) * u, y = ev.y + (y2 - ev.y) * u - 50; F.emit({ x, y, life: rnd(0.25, 0.5) * (0.5 + u * 0.5), s0: 60, s1: 30, c: cc, a: 0.18, cell: C.Glow }); F.emit({ x, y, vx: (x2 - ev.x) / PL * 120, vy: (y2 - ev.y) / PL * 120, life: rnd(0.3, 0.5), s0: rnd(8, 12), s1: 2, c: mixc(cc, WHITE, 0.4), a: 0.6, stretch: 5, drag: 3, cell: C.Glow }); }
      F.flash(x2, y2 - 50, 46, cc, 0.25); F.shockRing(x2, y2, 160, cc, 0.4, 0.55, 0.5, true);
    }
    else if (ev.k === 'cast') { const k = ev.power ?? 1; castFlourish(F, ev.x, ev.y, cc, k); F.flash(ev.x, ev.y, 22 * k, cc, 0.16); F.shockRing(ev.x, ev.y + 40 * k, 70 * (0.6 + 0.4 * k), cc, 0.35, 0.55, 0.5); if (extOK()) F.emit({ x: ev.x, y: ev.y, life: 0.3, s0: 30 * k, s1: 90 * k, c: mixc(cc, WHITE, 0.3), a: 0.4, cell: C.KCompass, rot: Math.random(), vr: 3 }); }
  }
  drawHfStars(F, dt);   // r9-hitfeel：命中的实心白星（前两三帧实打实地亮着）
  F.B.billboard = null;
  prof.add('FX战·事件', fxMark, c.fxq.length); fxMark = prof.t(); fxVertex = F.B.n;
  c.fxq.length = 0;

  // ---- 领域（地面）
  for (const f of c.fields) drawField(F, f, t, dt);
  prof.add('FX战·领域', fxMark, F.B.n - fxVertex); fxMark = prof.t(); fxVertex = F.B.n;

  // ---- 敌人蓄力预警、受击白闪
  for (const e of c.units) {
    if (e.dead) continue;
    const vis = enemyVis(c, e);
    if (vis <= 0.02) continue;
    F.B.billboard = { x: e.x, y: e.y };
    const lift = e.lift + e.flyH;
    if (e.windup > 0) {
      const u = 1 - e.windup / 0.4;
      F.ground(C.Disc, e.x, e.y, 70 * u, 0, [0.9, 0.12, 0.08], 0.22 * vis, 0.5, 0.42);
      F.ground(C.Ring, e.x, e.y, 72, 0, [1, 0.2, 0.12], (0.5 + 0.4 * u) * vis, 1, 0.42);
    }
    if (e.hitFlash > 0) {
      const k = e.hitFlash / 0.12;
      const hy = e.y - (e.def.kind === 'human' ? 70 : e.anim.flying ? 80 : 40) - lift;
      F.glow(e.x, hy, 46 * (e.def.look?.size ?? 1), WHITE, 0.55 * k * vis);
    }
    if (e.def.evil && vis > 0.1) F.glow(e.x, e.y - 50 - lift, 60, [0.8, 0.1, 0.15], 0.25 * vis);
    if (e.affix) drawEliteGL(F, c, e, vis, t, dt);
    if (e.ward) {   // 护体灵光：半透明灵光罩 + 六枚符印绕行，受击时一亮
      const w = e.ward, k = w.hp / w.max, cc = col(w.col), r = wardR(e), y = e.y - wardY(e) - e.flyH - e.lift;
      const pul = 0.85 + 0.15 * Math.sin(t * 5 + e.id * 10);
      drawGuardShell(F, {
        x: e.x, y, color: cc, vis,
        shellGlow: { w: r * 2.6, h: r * 2.9, a: GUARD.wardShellGlow(k) },
        soft: { w: r * 2.1, h: r * 2.35, a: GUARD.wardRing(k, w.t, pul) },
        edge: { w: r * 2.0, h: r * 2.24, a: GUARD.wardEdge(k, w.t) },
        bubble: extOK() ? { w: r * 2.15, h: r * 2.4, rot: t * 0.3, a: GUARD.wardBubble(k, w.t, pul) } : null,
        seals: { n: 6, size: 15, rx: r * 0.98, ry: r * 1.1, spin: t * 0.7, a: GUARD.wardSeal(k, w.t) },
      });
    }
    if (e.st.burn && Math.random() < dt * 14) F.emit({ x: e.x + rnd(-18, 18), y: e.y - lift - rnd(10, 70), vx: rnd(-10, 10), vy: rnd(-90, -50), life: rnd(0.3, 0.6), s0: rnd(14, 24), s1: 4, c: FIRE, cell: fireCell(), a: 0.8 });
    if (e.st.poison && Math.random() < dt * 8) F.emit({ x: e.x + rnd(-18, 18), y: e.y - lift - rnd(10, 60), vy: rnd(-40, -20), life: rnd(0.5, 0.9), s0: rnd(12, 20), s1: 32, c: [0.35, 0.7, 0.15], cell: extOK() ? C.KWisp2 : C.Smoke, a: 0.4, add: 0.5, rot: rnd(-0.4, 0.4) });
    if (e.st.shock && Math.random() < dt * 4) F.crackle(e.x, e.y - 50 - lift, 46, [0.7, 0.75, 1], 0.8, 1);
    if (e.st.shock && Math.random() < dt * 10) { const a = Math.random() * TAU; F.bolt(e.x + Math.cos(a) * 30, e.y - 60 - lift + Math.sin(a) * 30, e.x, e.y - 50 - lift, Math.random() * 1e6, 10, 1.6, [0.7, 0.75, 1], 0.9, 4, false); }
    bakeStatus(F, e.x, e.y - e.lift - (e.flyH ?? 0), (e.def.kind === 'human' ? 120 : 70 * (e.def.look?.size ?? 1)), e.st as any, t, vis, Math.max(0.8, Math.min(2.2, e.def.look?.size ?? 1)), e.id, e.y);
    if (e.st.freeze) { F.sprite(C.Shard, e.x - 16, e.y - 30 - lift, 50, 22, -1.9, [0.75, 0.9, 1], 0.55, 0.5); F.sprite(C.Shard, e.x + 18, e.y - 40 - lift, 60, 24, -1.2, [0.75, 0.9, 1], 0.55, 0.5); F.glow(e.x, e.y - 40 - lift, 50, [0.6, 0.85, 1], 0.3); }
    F.B.billboard = null;
  }

  drawLockGL(F, c, t);   // r11-lock
  prof.add('FX战·单位', fxMark, F.B.n - fxVertex); fxMark = prof.t(); fxVertex = F.B.n;
  // ---- 法术特效
  for (const v of c.vfx as any[]) {
    F.B.billboard = v.anchor ?? { x: v.x, y: v.y };
    if (!v._seen) { v._seen = 1; if (!hfVfxSpawn(F, c, v)) spawnVfx(F, v); if (!v._hf) bakeSpawn(v); }   // r9-hitfeel：接管了的不再铺地上那几张平面贴花（莲花、漩涡、六角…）   // r9-hitfeel：会炸的法术先问全游戏打击感（四层立体爆炸）
    F.B.billboard = v.anchor ?? { x: v.x, y: v.y };
    drawVfx(F, v, t);
    F.B.billboard = v.anchor ?? { x: v.x, y: v.y };
    if (!v._hf || v.kind === 'strike') bakeVfx(F, v, t);
  }
  F.B.billboard = null;
  prof.add('FX战·法术', fxMark, F.B.n - fxVertex); fxMark = prof.t(); fxVertex = F.B.n;
  // ---- 弹道
  for (const pr of c.projs) {
    if (!pr._seen) { pr._seen = 1; const cc = col(pr.color); F.B.billboard = { x: pr.x, y: pr.y + pr.visual.groundOffsetY, offsetY: -pr.visual.elevation }; if (pr.fac === 'p') F.flash(pr.x, pr.y, 16 * pr.size, cc, 0.12); F.B.billboard = null; }
    drawProj(F, pr, t, dt);
  }
  prof.add('FX战·弹道', fxMark, F.B.n - fxVertex); fxMark = prof.t(); fxVertex = F.B.n;
  // ---- 返工：掉落物的光柱。原来画在掉落物的立板里，近镜头下是几根又粗又灰、半透明、带锯齿的板子；
  // 改成特效层里的细光束：叠加发光、下实上虚分三段渐隐，按品阶上色；在特效层里照常被站在前面的人和怪挡住，自己不挡任何东西
  if (F.B.hd) for (const l of c.loot) {
    const g = lootGlow(l.id), tier = Math.max(1, lootTier(l.id)), H = 150 + tier * 26, w = 8 + tier * 1.5;
    const pul = 0.78 + 0.22 * Math.sin(t * 2.4 + l.x * 0.01), born = Math.min(1, l.t * 3);
    for (let k = 0; k < 4; k++) F.lineSprite(C.Beam, l.x, l.y, -(18 + H * k / 4), l.x, l.y, -(18 + H * (k + 1) / 4), 1, w, g, 0.5 * pul * born * Math.pow(1 - k / 4, 1.6));
    F.lineSprite(C.Beam, l.x, l.y, -18, l.x, l.y, -(18 + H * 0.55), 1, w * 0.3, mixc(g, [1, 1, 1], 0.6), 0.45 * pul * born);
  }
  // ---- 法器出手（第十三步）
  projSparkle(F, c, dt);   // v0.63：飞行中的法术按五行各带尾迹
  c.acts.drawGL(F, t, dt);
  c.game.yuanying?.glow(F, t, dt); c.game.zhenfa?.glow(F, t, dt); c.game.shen?.glow(F, t, dt);
  // ---- 第二十八步：蚀金蛊群（虫群算法）
  c.swarm?.draw(F, t); c.petSwarm?.draw(F, t);
  drawSummonsGL(F, c, t, dt);   // 第三十步：召唤物特效
  drawHeroGL(F, c, t, dt);
  F.B.billboard = { x: p.x, y: p.y };
  drawNitianGL(F, c, t, dt);   // 「遁影惊雷」：逆天四法 / 秘术 / 音爆 / 水遁
  bakeStatus(F, p.x, p.y - p.st.lift, 120, c.pst as any, t, 1, 1, 7, p.y);
  F.B.billboard = null;
  // ---- 蚀金蛊
  for (const s of c.summons) if (s.kind === 'bugs' && s.dots) {
    for (const d of s.dots) { const a = d.a + t * d.s; const x = s.x + Math.cos(a) * d.r, y = s.y - 40 + Math.sin(a * 1.3) * d.r * 0.6; F.glow(x, y, 6, [1, 0.85, 0.35], 0.9, C.Dot); F.glow(x, y, 12, [1, 0.75, 0.3], 0.35); }
    F.glow(s.x, s.y - 40, 50, [1, 0.8, 0.35], 0.25);
  }
  // ---- 护体剑盾（第二十八步：双环剑网）
  drawOrbitGL(F, c, t);
  // ---- 护盾
  F.B.billboard = { x: p.x, y: p.y };
  if (c.shield?.art) {   // 法器盾：身前一面灵光盾影，挡格时迸开六角纹
    const s = c.shield, k = s.amt / s.max, cc = col(s.color), sp = c.shieldPos(), y = sp.y - sp.h - lift;
    drawGuardShell(F, {
      x: p.x, y: p.y - 50 - lift, color: cc,
      glowAt: { x: sp.x, y, r: 34 + c.blockT * 8, a: GUARD.shieldGlow(k, c.blockT) },
      soft: { w: 104, h: 122, a: GUARD.shieldRing(k, c.blockT) },
      seal1: c.blockT > 0.85 ? { x: sp.x, y, size: 46, rot: t, a: GUARD.shieldSeal(c.blockT) } : null,
    });
  } else if (c.shield) {
    const s = c.shield, k = s.amt / s.max, cc = col(s.color);
    const pul = 0.85 + 0.15 * Math.sin(t * 4);
    drawGuardShell(F, {
      x: p.x, y: p.y - 50 - lift, color: cc,
      shellGlow: { w: 170, h: 190, a: 0.18 + 0.1 * k },
      soft: { w: 140, h: 166, a: (0.45 + 0.35 * k) * pul },
      edge: { w: 132, h: 156, a: 0.35 * k },
      seals: s.fx === 'frost' || s.fx === 'vine' || s.fx === 'gold'
        // 寒冰/青藤/金光盾的绕行符印贴图不同（Shard / Leaf / Seal），由 seals.cell 指定
        ? { n: 6, size: 12, w: 22, rx: 64, ry: 76, spin: t * 0.5, a: 0.7, cell: s.fx === 'frost' ? C.Shard : s.fx === 'vine' ? C.Leaf : C.Seal }
        : null,
    });
  }
  drawLingdunGL(F, c, t, dt, lift);   // v0.63：灵力护盾（随 lift 抬升，御剑时跟着人走）
  // ---- 增益
  const b = c.buffs;
  if (b.atk || b.def || b.speed) {
    const cc: RGB = b.atk ? [1, 0.78, 0.35] : b.def ? [0.94, 0.82, 0.47] : [0.75, 0.9, 1];
    for (let i = 0; i < 2; i++) { const k = (t * 0.8 + i * 0.5) % 1; F.ring(p.x, p.y - lift - k * 100, 42 * (1 - k * 0.3), cc, (1 - k) * 0.55, 0.3); }
    if (Math.random() < dt * 10) F.emit({ x: p.x + rnd(-24, 24), y: p.y - lift - rnd(0, 20), vy: rnd(-90, -50), life: rnd(0.6, 1), s0: 5, s1: 1, c: cc, cell: C.Glow });
  }
  F.B.billboard = null;
  // ---- 旧式火花（来自战斗逻辑）
  for (const s of c.sparks) { const k = 1 - s.t / s.max; F.B.billboard = s.anchor ?? null; F.glow(s.x, s.y, (s.size * k + 0.6) * 2.2, col(s.color), 0.75 * k); }
  F.B.billboard = null;
  // ---- 冲刺残影
  if (c.dash) {
    F.B.billboard = { x: p.x, y: p.y };
    const cc = col(c.dash.color);
    for (let i = 0; i < 2; i++) F.emit({ x: p.x + rnd(-8, 8), y: p.y - p.st.lift - rnd(20, 80), vx: -c.dash.vx * 0.15, vy: -c.dash.vy * 0.15, life: 0.3, s0: 26, s1: 6, c: cc, a: 0.45, cell: C.Wisp, rot: Math.atan2(c.dash.vy, c.dash.vx) });
    F.B.billboard = null;
  }
  prof.add('FX战·其他', fxMark, F.B.n - fxVertex);
}

// ------------------------------------------------------------------ 弹道
function drawProj(F: FxSys, pr: Proj, t: number, dt: number) {
  const s = pr.size ?? 1, cc = col(pr.color), fx = pr.fx as string;
  const ang = F.B.direction(pr.vx, pr.vy), worldAng = Math.atan2(pr.vy, pr.vx), speed = Math.hypot(pr.vx, pr.vy);
  const screenVx = Math.cos(ang) * speed, screenVy = Math.sin(ang) * speed;
  F.B.billboard = { x: pr.x, y: pr.y + pr.visual.groundOffsetY, offsetY: -pr.visual.elevation };
  F.light(pr.x, pr.y, 30, 260 * Math.min(2, s), cc, 2, 0);   // P2：弹道一路照亮地面（只亮这一帧，下一帧随弹道重登）
  const trail = (points: [number, number][], w: number, color: RGB, alpha: number, cell: number = C.Beam, add = 1, taper = 1) => F.trail(points, w, color, alpha, cell, add, taper, pr.visual);
  const tr = pr.trail as [number, number][];
  const head: [number, number][] = tr.length ? [...tr, [pr.x, pr.y]] : [[pr.x - pr.vx * 0.02, pr.y - pr.vy * 0.02], [pr.x, pr.y]];
  switch (fx) {
    case 'fireball': case 'flame': case 'talisman': case 'icefire': default: {
      const fire = fx === 'fireball' || fx === 'flame' || pr.school === '火';
      trail(head, 26 * s, cc, 0.55);
      trail(head, 9 * s, mixc(cc, WHITE, 0.6), 0.8);
      F.orb(pr.x, pr.y, 13 * s, cc);
      if (fx === 'talisman' && pr.life < 0.15) F.sprite(C.Talisman, pr.x, pr.y, 20, 40, ang + Math.PI / 2, [0.95, 0.82, 0.4], 0.9, 0.2);
      for (let i = nEmit(fire ? 60 : 30, dt); i > 0; i--) F.emit({ x: pr.x + rnd(-6, 6) * s, y: pr.y + rnd(-6, 6) * s, vx: -screenVx * 0.08 + rnd(-30, 30), vy: -screenVy * 0.08 + rnd(-60, -10), life: rnd(0.25, 0.5), s0: rnd(10, 18) * s * (fire ? 1.25 : 1), s1: 2, c: fire ? mixc(FIRE, cc, 0.5) : cc, cell: fire ? fireCell() : C.Glow, rot: 0, drag: 2 });
      if (fire && extOK() && Math.random() < dt * 10) F.emit({ x: pr.x, y: pr.y, life: 0.1, s0: 30 * s, s1: 40 * s, c: mixc(cc, WHITE, 0.4), a: 0.5, cell: C.KBurst2, rot: Math.random() * TAU });
      if (fire && Math.random() < dt * 12) F.smoke(pr.x, pr.y, 1, SMOKE, 0.18, 4, 22 * s);
      break;
    }
    case 'blood': {
      // 「遁影惊雷」重做·血煞魔刃：急旋的血月弯刃裹着墨黑刃心，拖出双股缠绕的血焰，沿途滴血、腾黑烟（原先只是一颗带尾巴的小红点）
      const dark: RGB = [0.16, 0.01, 0.03], hot = mixc(cc, WHITE, 0.45), n = head.length;
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      const w1: [number, number][] = [], w2: [number, number][] = [];
      for (let i = 0; i < n; i++) { const o = Math.sin(t * 22 - i * 1.1) * 9 * s * (1 - (i / Math.max(1, n - 1)) * 0.6); w1.push([head[i][0] + nx * o, head[i][1] + ny * o]); w2.push([head[i][0] - nx * o, head[i][1] - ny * o]); }
      F.trail(head, 46 * s, dark, 0.5, C.Beam, 0, 0.9);
      F.trail(w1, 13 * s, cc, 0.75, C.Beam, 1, 0.9);
      F.trail(w2, 13 * s, mixc(cc, [1, 0.45, 0.2], 0.35), 0.6, C.Beam, 1, 0.9);
      F.trail(head, 5 * s, hot, 0.85);
      const rot = t * 26 + pr.x * 0.01;
      F.sprite(C.Smoke, pr.x, pr.y, 46 * s, 46 * s, -t * 5, dark, 0.75, 0);
      F.sprite(C.Moon, pr.x, pr.y, 56 * s, 56 * s, rot, cc, 0.95);
      F.sprite(C.Moon, pr.x, pr.y, 56 * s, 56 * s, rot + Math.PI, mixc(cc, [0.5, 0, 0.1], 0.4), 0.9);
      F.sprite(C.Moon, pr.x, pr.y, 34 * s, 34 * s, -rot * 1.3, hot, 0.9);
      F.glow(pr.x, pr.y, 48 * s, cc, 0.5);
      F.glow(pr.x, pr.y, 9 * s, [1, 0.85, 0.8], 0.95, C.Core);
      if (extOK()) F.sprite(C.KFlare, pr.x, pr.y, 96 * s, 26 * s, ang, cc, 0.4);
      for (let i = nEmit(46, dt); i > 0; i--) F.emit({ x: pr.x + rnd(-8, 8) * s, y: pr.y + rnd(-8, 8) * s, vx: -pr.vx * 0.12 + rnd(-40, 40), vy: -pr.vy * 0.12 + rnd(-70, -10), life: rnd(0.25, 0.5), s0: rnd(12, 20) * s, s1: 2, c: Math.random() < 0.3 ? hot : cc, a: 0.7, cell: fireCell(), rot: 0, drag: 2 });
      for (let i = nEmit(22, dt); i > 0; i--) F.emit({ x: pr.x, y: pr.y, vx: rnd(-60, 60), vy: rnd(-30, 60), life: rnd(0.4, 0.7), s0: rnd(3, 5) * s, s1: 1, c: [0.75, 0.04, 0.08], a: 0.95, add: 0.2, cell: C.Dot, grav: 520, stretch: 0.03 });
      if (Math.random() < dt * 16) F.smoke(pr.x, pr.y, 1, [0.12, 0.02, 0.04], 0.32, 6, 30 * s);
      break;
    }
    case 'gold': {
      F.trail(head, 22 * s, cc, 0.6);
      F.orb(pr.x, pr.y, 12 * s, cc);
      for (let i = nEmit(40, dt); i > 0; i--) F.emit({ x: pr.x, y: pr.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: rnd(0.2, 0.45), s0: rnd(4, 8), s1: 1, c: cc, cell: fx === 'gold' ? C.Star : C.Glow, rot: Math.random() * TAU });
      break;
    }
    case 'firesnake': case 'dragon': {
      const big = fx === 'dragon';
      const w = (big ? 44 : 22) * s;
      const wav: [number, number][] = head.map(([x, y], i) => { const k = i / head.length; const o = Math.sin(t * 14 - i * 0.9) * 8 * k; return [x - Math.sin(worldAng) * o, y + Math.cos(worldAng) * o]; });
      trail(wav, w * 1.6, cc, 0.45, C.Beam, 1, 0.8);
      trail(wav, w * 0.7, mixc(cc, WHITE, 0.5), 0.85, C.Beam, 1, 0.8);
      F.orb(pr.x, pr.y, (big ? 22 : 13) * s, cc);
      if (big) { F.sprite(C.Thorn, pr.x - Math.cos(ang) * 10 - 8, pr.y - 22, 10, 34, ang - 2.2, mixc(cc, WHITE, 0.6), 0.9); F.sprite(C.Thorn, pr.x - Math.cos(ang) * 10 + 8, pr.y - 22, 10, 34, ang - 1.9, mixc(cc, WHITE, 0.6), 0.9); }
      const headAnchor = F.B.billboard;
      for (let i = nEmit(big ? 90 : 50, dt); i > 0; i--) { const j = Math.floor(Math.random() * wav.length); const [x, y] = wav[j]; F.B.billboard = { x, y: y + pr.visual.groundOffsetY, offsetY: -pr.visual.elevation }; F.emit({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-20, 20), vy: rnd(-70, -20), life: rnd(0.25, 0.5), s0: rnd(10, 20) * s, s1: 2, c: big ? cc : mixc(FIRE, cc, 0.5), cell: big ? C.Glow : fireCell() }); }
      F.B.billboard = headAnchor;
      break;
    }
    case 'crow': {
      trail(head, 12, cc, 0.35);
      const f = Math.sin(t * 20 + pr.x * 0.1);
      F.sprite(C.Feather, pr.x, pr.y, 34, 30 + f * 10, ang, [0.12, 0.08, 0.1], 0.9, 0);
      F.glow(pr.x + Math.cos(ang) * 10, pr.y + Math.sin(ang) * 10, 8, cc, 0.9);
      F.glow(pr.x, pr.y, 26, cc, 0.35);
      if (Math.random() < dt * 14) F.emit({ x: pr.x, y: pr.y, vx: rnd(-30, 30), vy: rnd(10, 50), life: 0.7, s0: 10, s1: 6, c: [0.1, 0.08, 0.1], a: 0.7, add: 0, cell: C.Feather, rot: Math.random() * TAU, vr: rnd(-4, 4) });
      break;
    }
    case 'sword': case 'goldthunder': {
      const L = 64 * s;
      trail(head, 14 * s, cc, 0.5);
      trail(head, 4 * s, WHITE, 0.7);
      F.sprite(C.Blade, pr.x, pr.y, L, L * 0.26, ang, mixc(cc, WHITE, 0.45), 1);
      F.glow(pr.x, pr.y, 28 * s, cc, 0.55);
      if (extOK() && Math.random() < dt * 6) F.glint(pr.x + Math.cos(ang) * L * 0.4, pr.y + Math.sin(ang) * L * 0.4, 22 * s, mixc(cc, WHITE, 0.5), 0.7, 0.14);
      if (fx === 'goldthunder' && Math.random() < dt * 18) { const a = Math.random() * TAU; F.bolt(pr.x, pr.y, pr.x + Math.cos(a) * 40, pr.y + Math.sin(a) * 40, Math.random() * 1e6, 10, 1.5, [1, 0.9, 0.5], 1, 4, false); }
      break;
    }
    case 'icicle': case 'needle': case 'mind': case 'leaf': {
      if (fx === 'needle') { trail(head, 3, cc, 0.7); F.sprite(C.Streak, pr.x, pr.y, 36, 6, ang, WHITE, 1); F.glow(pr.x, pr.y, 10, cc, 0.6); break; }
      if (fx === 'mind') { trail(head, 18, cc, 0.25); F.sprite(C.Slash, pr.x, pr.y, 40, 40, ang, cc, 0.5); F.glow(pr.x, pr.y, 20, cc, 0.3); break; }
      if (fx === 'leaf') { trail(head, 6, cc, 0.4); F.sprite(C.Leaf, pr.x, pr.y, 30 * s, 14 * s, ang + Math.sin(t * 20) * 0.3, cc, 0.95, 0.3); break; }
      trail(head, 12 * s, cc, 0.45);
      F.sprite(C.Shard, pr.x, pr.y, 46 * s, 16 * s, ang, mixc(cc, WHITE, 0.6), 1, 0.6);
      F.glow(pr.x, pr.y, 22 * s, cc, 0.5);
      if (Math.random() < dt * 30) F.emit({ x: pr.x, y: pr.y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.5, s0: 5, s1: 1, c: [0.85, 0.95, 1], cell: C.Star, rot: Math.random() });
      break;
    }
    case 'wind': {
      for (let i = 0; i < 3; i++) F.sprite(C.Slash, pr.x - Math.cos(ang) * i * 14, pr.y - Math.sin(ang) * i * 14, 70 * s * (1 - i * 0.15), 70 * s * (1 - i * 0.15), ang, mixc(cc, WHITE, 0.3), 0.7 - i * 0.2);
      if (Math.random() < dt * 24) F.emit({ x: pr.x + rnd(-20, 20), y: pr.y + rnd(-20, 20), vx: screenVx * 0.3, vy: screenVy * 0.3, life: 0.35, s0: 30, s1: 10, c: cc, a: 0.4, cell: C.Wisp, rot: ang });
      if (extOK()) F.sprite(C.KTwirl, pr.x, pr.y, 80 * s, 80 * s, -t * 14, mixc(cc, WHITE, 0.3), 0.35);
      break;
    }
    case 'tornado': case 'water': {
      const h = fx === 'water' ? 90 : 120;
      for (let i = 0; i < 7; i++) { const k = i / 7; F.sprite(C.Swirl, pr.x + Math.sin(t * 8 + i) * 6, pr.y + 30 - k * h, (30 + k * 60) * s, (10 + k * 20) * s, t * 6 + i, cc, 0.55 - k * 0.25, fx === 'water' ? 0.5 : 1); }
      F.glow(pr.x, pr.y - h * 0.4, 60 * s, cc, 0.25);
      if (extOK()) F.ground(C.KVortex, pr.x, pr.y + pr.visual.groundOffsetY, 70 * s, -t * 7, cc, 0.4, fx === 'water' ? 0.6 : 0.3, 0.45);
      if (Math.random() < dt * 20) F.emit({ x: pr.x + rnd(-30, 30), y: pr.y + rnd(-80, 20), vx: rnd(-80, 80), vy: rnd(-40, 0), life: 0.5, s0: 8, s1: 2, c: fx === 'water' ? [0.7, 0.85, 1] : [0.8, 0.8, 0.7], a: 0.6, cell: fx === 'water' ? C.Dot : C.Leaf, rot: Math.random() * TAU, vr: 6, add: fx === 'water' ? 0.6 : 0 });
      break;
    }
    case 'vine': {
      const wav: [number, number][] = head.map(([x, y], i) => [x, y + Math.sin(i * 1.4 + t * 10) * 6]);
      trail(wav, 10, [0.25, 0.5, 0.18], 0.9, C.Beam, 0, 0.3);
      trail(wav, 4, cc, 0.9);
      F.glow(pr.x, pr.y, 18, cc, 0.5);
      if (Math.random() < dt * 10) F.emit({ x: pr.x, y: pr.y, vx: rnd(-20, 20), vy: rnd(10, 40), life: 0.8, s0: 12, s1: 8, c: [0.35, 0.65, 0.25], a: 0.85, add: 0, cell: C.Leaf, rot: Math.random() * TAU, vr: 3 });
      break;
    }
    case 'ghost': {
      trail(head, 26, [0.2, 0.1, 0.25], 0.45, C.Beam, 0);
      F.glow(pr.x, pr.y, 24, cc, 0.7);
      F.sprite(C.Smoke, pr.x, pr.y, 46, 46, t * 2, [0.2, 0.12, 0.25], 0.55, 0);
      if (extOK()) { F.sprite(C.KWisp1, pr.x - Math.cos(ang) * 30, pr.y - Math.sin(ang) * 30, 70, 70, ang - Math.PI / 2, mixc(cc, [0.4, 0.2, 0.5], 0.5), 0.35); if (Math.random() < dt * 8) F.emit({ x: pr.x, y: pr.y, vx: -screenVx * 0.1, vy: -screenVy * 0.1 - 20, life: 0.7, s0: 30, s1: 70, c: [0.45, 0.3, 0.55], a: 0.3, cell: C.KWisp2, rot: rnd(-0.5, 0.5) }); }
      F.glow(pr.x - 5, pr.y - 3, 4, [1, 0.3, 0.3], 1, C.Dot); F.glow(pr.x + 5, pr.y - 3, 4, [1, 0.3, 0.3], 1, C.Dot);
      if (Math.random() < dt * 12) F.smoke(pr.x, pr.y, 1, [0.18, 0.1, 0.22], 0.3, 6, 26);
      break;
    }
    case 'rock': {
      F.sprite(C.Shard, pr.x, pr.y, 30 * s, 24 * s, t * 8, [0.45, 0.36, 0.25], 1, 0);
      if (Math.random() < dt * 14) F.smoke(pr.x, pr.y, 1, [0.45, 0.38, 0.28], 0.25, 4, 18);
      if (extOK() && Math.random() < dt * 8) F.emit({ x: pr.x, y: pr.y, vx: rnd(-40, 40), vy: rnd(-20, 40), life: 0.5, s0: 18, s1: 30, c: [0.4, 0.33, 0.24], a: 0.5, add: 0, cell: C.KDirt, rot: Math.random() * TAU });
      break;
    }
  }
  F.B.billboard = null;
}

// ------------------------------------------------------------------ 法术
function spawnVfx(F: FxSys, v: any) {
  const cc = col(v.color);
  switch (v.kind) {
    case 'flash':
      F.hit(v.x, v.y, cc, v.r > 80 ? 2 : 1, v.r > 80);
      if (v.fx === 'blood') {   // 血煞魔刃命中：血月崩碎、血溅一地
        F.ink(v.x, v.y + 20, 80, 0.4, [0.3, 0.02, 0.04]);
        F.sparks(v.x, v.y, cc, 14, 380, 0.5, 4);
        F.emit({ x: v.x, y: v.y, life: 0.3, s0: 30, s1: 130, c: cc, a: 0.7, cell: C.Moon, rot: rnd(0, TAU), vr: 9 });
        F.emit({ x: v.x, y: v.y, life: 0.3, s0: 30, s1: 130, c: mixc(cc, WHITE, 0.4), a: 0.6, cell: C.Moon, rot: rnd(0, TAU), vr: -9 });
      }
      break;
    case 'ring':
      F.shockRing(v.x, v.y, v.r, cc, Math.min(0.7, v.dur), 0.55, 1, true);
      F.sparks(v.x, v.y - 20, cc, 18, 200 + v.r, 0.5, 3);
      if (v.r > 120) F.shock(v.x, v.y, v.r * 1.6, 12, 0.5);
      if (v.fx === 'rock' || v.fx === 'palm') { F.ink(v.x, v.y, v.r * 1.1, 0.3, [0.25, 0.2, 0.15]); F.smoke(v.x, v.y, 8, [0.45, 0.38, 0.28], 0.3, v.r * 0.5, 60); }
      if (v.fx === 'flame' || v.fx === 'fireball') { F.embers(v.x, v.y - 10, FIRE, 20, v.r * 0.6); F.flames(v.x, v.y, v.r * 0.5, FIRE, 8, 0.75); }
      if (v.fx === 'roar' || v.fx === 'palm' || v.fx === 'rock') F.smokeRing(v.x, v.y, v.r * 0.9, v.fx === 'roar' ? mixc(cc, [0.2, 0.18, 0.15], 0.6) : [0.4, 0.33, 0.24], 0.35, 0.7);
      if (v.fx === 'roar') F.rays(v.x, v.y - 40, v.r * 1.4, cc, 0.3, 0.35);
      if (v.fx === 'frost' || v.fx === 'icicle') for (let i = 0; i < 6; i++) F.glint(v.x + rnd(-v.r, v.r) * 0.6, v.y + rnd(-v.r, v.r) * 0.3 - 20, rnd(14, 26), [0.85, 0.95, 1], 0.8, rnd(0.2, 0.4));
      if (v.fx === 'array' || v.fx === 'star' || v.fx === 'talisman') F.emit({ x: v.x, y: v.y, life: 0.5, s0: v.r * 0.6, s1: v.r * 1.6, c: mixc(cc, WHITE, 0.3), a: 0.45, cell: extOK() ? C.KDots : C.Rune, rot: 0, vr: 2.5 });
      break;
    case 'strike': {
      const fx = v.fx;
      if (fx === 'lightning' || fx === 'goldthunder') { F.explode(v.x, v.y, v.r * 0.5, cc, { smoke: false }); F.ink(v.x, v.y + 6, v.r * 1.2, 0.3); F.crackle(v.x, v.y - 20, v.r * 0.9, cc, 0.95, 3); F.glint(v.x, v.y - 30, v.r * 0.5, mixc(cc, WHITE, 0.6), 0.9, 0.25); }
      else if (fx === 'flame') { F.explode(v.x, v.y, v.r, mixc(FIRE, cc, 0.4), { debris: true }); F.embers(v.x, v.y, FIRE, 24, v.r * 0.6); F.flames(v.x, v.y, v.r * 0.8, FIRE, 14, 0.85); F.smoke(v.x, v.y - v.r * 0.4, 6, SMOKE, 0.32, v.r * 0.4, v.r * 0.9); }
      else if (fx === 'rock') { F.explode(v.x, v.y, v.r * 0.8, [0.6, 0.48, 0.32], { debris: true, smoke: true }); F.smoke(v.x, v.y - 10, 8, [0.45, 0.38, 0.28], 0.4, v.r * 0.5, v.r * 0.8); }
      else if (fx === 'frost') { F.explode(v.x, v.y, v.r * 0.7, cc, { smoke: false }); for (let i = 0; i < 16; i++) F.emit({ x: v.x + rnd(-v.r, v.r) * 0.7, y: v.y + rnd(-v.r, v.r) * 0.35, vy: rnd(-30, -5), life: rnd(0.6, 1.1), s0: 7, s1: 2, c: [0.85, 0.95, 1], cell: C.Star, rot: Math.random() }); }
      else F.explode(v.x, v.y, v.r * 0.8, cc);
      break;
    }
    case 'beam': { F.flash(v.x, v.y, 26, cc, 0.15); F.glint(v.x, v.y, 40, mixc(cc, WHITE, 0.5), 0.8, 0.3); F.B.billboard = v.endAnchor ?? { x: v.x2, y: v.y2 }; F.hit(v.x2, v.y2, cc, 1.2); break; }
    case 'bigsword': F.B.billboard = v.endAnchor ?? { x: v.x2, y: v.y2 }; F.shock(v.x2, v.y2, 260, 16, 0.6); F.rays(v.x2, v.y2, 300, cc, 0.35, 0.35); F.glint(v.x2, v.y2, 90, mixc(cc, WHITE, 0.6), 0.9, 0.3); F.smokeRing(v.x2, v.y2 + 20, 160, [0.3, 0.26, 0.2], 0.3, 0.7); break;
    case 'cone': {
      for (let i = 0; i < 26; i++) { const worldAngle = v.ang + rnd(-v.spread, v.spread), previous = F.B.billboard; F.B.billboard = null; const a = F.B.direction(Math.cos(worldAngle), Math.sin(worldAngle)), sp = rnd(200, 520); F.B.billboard = previous; F.emit({ x: v.x, y: v.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.25, 0.5), s0: v.fx === 'flame' ? rnd(18, 34) : 6, s1: v.fx === 'flame' ? 40 : 2, c: v.fx === 'flame' ? mixc(FIRE, cc, 0.4) : cc, cell: v.fx === 'flame' ? C.Flame : C.Glow, drag: 3, stretch: v.fx === 'flame' ? 0 : 0.04 }); }
      break;
    }
    case 'aura': F.shockRing(v.x, v.y, v.r * 1.4, cc, 0.5, 0.45, 1, true); for (let i = 0; i < 16; i++) F.emit({ x: v.x + rnd(-v.r, v.r) * 0.6, y: v.y + rnd(-10, 10), vy: rnd(-180, -70), life: rnd(0.5, 0.9), s0: rnd(4, 8), s1: 1, c: mixc(cc, WHITE, 0.3), cell: v.fx === 'leaf' ? C.Leaf : C.Glow, rot: Math.random() * TAU, drag: 1 }); break;
    case 'blinkfx': if (extOK()) F.emit({ x: v.x, y: v.y - 50, life: 0.4, s0: v.r * 0.6, s1: v.r * 1.6, c: cc, a: 0.4, cell: C.KTwirl, rot: Math.random() * TAU, vr: 8 }); F.flash(v.x, v.y - 50, v.r * 0.7, cc, 0.2); for (let i = 0; i < 12; i++) F.emit({ x: v.x + rnd(-20, 20), y: v.y - rnd(0, 100), vx: rnd(-60, 60), vy: rnd(-60, 20), life: rnd(0.3, 0.6), s0: rnd(20, 36), s1: 4, c: cc, a: 0.5, cell: C.Wisp, rot: rnd(-0.3, 0.3) }); break;
  }
}

interface LineVfx { x: number; y: number; x2: number; y2: number; anchor?: GroundAnchor; endAnchor?: GroundAnchor }
function linePoint(B: Batch, x: number, y: number, anchor?: GroundAnchor) {
  if (!anchor) return { x, y, offset: 0 };
  const hd = B.hd, dx = x - anchor.x;
  if (!hd) return { x, y: anchor.y, offset: y - anchor.y + (anchor.offsetY ?? 0) };
  const gx = anchor.x + dx * hd.rx, gy = anchor.y + dx * hd.ry;
  const terrainOffset = (hd.heightAt(gx, gy) - hd.heightAt(anchor.x, anchor.y)) / hd.heightBoost;
  return { x: gx, y: gy, offset: y - anchor.y + (anchor.offsetY ?? 0) + terrainOffset };
}
function linePoints(F: FxSys, v: LineVfx) {
  const p = linePoint(F.B, v.x, v.y, v.anchor), q = linePoint(F.B, v.x2, v.y2, v.endAnchor);
  return { x1: p.x, y1: p.y, z1: p.offset, x2: q.x, y2: q.y, z2: q.offset };
}

function drawVfx(F: FxSys, v: any, t: number) {
  const u = clamp(v.t / v.dur, 0, 1), a = 1 - u, cc = col(v.color);
  if (v._hf && (v.kind === 'ring' || v.kind === 'flash')) return;   // r9-hitfeel：接管了的爆炸不再画地上那一大片平铺的光盘（量在立体的那部分）
  switch (v.kind) {
    case 'ring': {
      const r = v.r * (0.3 + 0.7 * (1 - Math.pow(1 - u, 2.5)));
      F.ground(C.Glow, v.x, v.y, r, 0, cc, 0.35 * a, 1, 0.55);
      if (v.fx === 'roar') for (let i = 1; i < 3; i++) F.ground(C.Ring, v.x, v.y, r * (1 - i * 0.22), 0, cc, 0.5 * a, 1, 0.55);
      if (v.fx === 'lightning' || v.fx === 'array' || v.fx === 'star') F.ground(C.Rune, v.x, v.y, r * 0.9, t * 2, cc, 0.6 * a, 1, 0.55);
      if (v.fx === 'rock' || v.fx === 'palm') F.ground(C.Crack, v.x, v.y, v.r * 0.8, v.x, [0.2, 0.15, 0.1], 0.6 * a, 0, 0.55);
      break;
    }
    case 'warn': {
      if (v.t < 0) break;
      F.ground(C.Ring, v.x, v.y, v.r, 0, cc, 0.85, 1, 0.55);
      F.ground(C.Disc, v.x, v.y, v.r * u, 0, cc, 0.22, 0.6, 0.55);
      F.ground(C.Rune, v.x, v.y, v.r * 0.95, t * 1.5, cc, 0.35, 1, 0.55);
      break;
    }
    case 'strike': {
      const fx = v.fx;
      if (fx === 'lightning' || fx === 'goldthunder') {
        const seed = v.seed + Math.floor(v.t * 24) * 13;
        const fl = u < 0.3 ? 1 : (Math.floor(v.t * 30) % 2 ? 0.4 : 0.9) * a;
        F.bolt(v.x + 40, v.y - 720, v.x, v.y, seed, 80, 7 * (1 - u * 0.5), cc, fl, 14);
        if (extOK() && u < 0.6) { const kk = Math.floor(v.t * 20) % 2; F.sprite(kk ? C.KBoltV1 : C.KBoltV2, v.x + 20, v.y - 330, Math.max(90, v.r * 0.9), 720, 0, mixc(cc, WHITE, 0.35), fl * 0.85); }
        if (!v._hf) { F.glow(v.x, v.y, v.r * 1.1, cc, 0.3 * a); F.ground(C.Crack, v.x, v.y, v.r * 0.8, v.seed, [0.15, 0.12, 0.1], 0.6 * a, 0, 0.5); }
      } else if (fx === 'flame' && v._hf) {
        F.ground(C.FireRing, v.x, v.y, v.r * (0.55 + u * 0.2), t, FIRE, 0.22 * a, 1, 0.5);   // r9-hitfeel：火球交给四层立体爆炸，这里只留地上一圈压暗的火
      } else if (fx === 'flame') {
        F.sprite(C.Beam, v.x, v.y - 160 * (1 - u), v.r * 0.9 * a, 340, Math.PI / 2, FIRE, 0.4 * a);
        F.glow(v.x, v.y, v.r * 1.4, FIRE, 0.5 * a);
        F.ground(C.FireRing, v.x, v.y, v.r * (0.8 + u * 0.3), t, FIRE, 0.7 * a, 1, 0.5);
        if (extOK()) { for (let i = 0; i < 5; i++) { const an = i / 5 * TAU + (v.seed ?? 0), rr = v.r * 0.45; const h = v.r * (1.1 + 0.4 * Math.sin(i * 2.3)) * (u < 0.2 ? u / 0.2 : 1) * a; const x = v.x + Math.cos(an) * rr, y = v.y + Math.sin(an) * rr * (F.B.hd ? 1 : 0.45); F.B.billboard = { x, y }; F.sprite(i % 2 ? C.KFire1 : C.KFire3, x, y - h * 0.45, h * 0.55, h, 0, mixc(FIRE, cc, 0.3), 0.75 * a); } F.B.billboard = v.anchor ?? { x: v.x, y: v.y }; F.sprite(C.KFire2, v.x, v.y - v.r * 0.5, v.r * 1.1, v.r * 1.3, 0, mixc(FIRE, [1, 0.95, 0.7], 0.3), 0.6 * a); }
      } else if (fx === 'frost' || fx === 'rock') {
        const n = 8;
        for (let i = 0; i < n; i++) {
          const an = i / n * TAU + v.seed, r = v.r * 0.65;
          const x = v.x + Math.cos(an) * r * 0.8, y = v.y + Math.sin(an) * r * (F.B.hd ? 0.8 : 0.4);
          F.B.billboard = { x, y };
          const h = 70 * Math.sin(Math.min(1, u * 4) * Math.PI * 0.5) * (1 - Math.max(0, u - 0.7) / 0.3);
          F.sprite(C.Thorn, x, y - h / 2, 22, h, (i % 3 - 1) * 0.2, fx === 'frost' ? [0.8, 0.93, 1] : [0.45, 0.36, 0.25], 0.9, fx === 'frost' ? 0.5 : 0);
        }
        F.B.billboard = v.anchor ?? { x: v.x, y: v.y };
        if (!v._hf) F.ground(fx === 'frost' ? C.Glow : C.Crack, v.x, v.y, v.r, 0, fx === 'frost' ? cc : [0.2, 0.15, 0.1], 0.5 * a, fx === 'frost' ? 1 : 0, 0.5);
        if (extOK() && !v._hf) F.ground(fx === 'frost' ? C.KStarBurst : C.KDirt, v.x, v.y, v.r * (fx === 'frost' ? 0.8 : 1.1), v.seed ?? 0, fx === 'frost' ? [0.8, 0.93, 1] : [0.3, 0.24, 0.17], (fx === 'frost' ? 0.35 : 0.45) * a, fx === 'frost' ? 1 : 0, 0.5);
      } else if (fx === 'gold' && v._hf) { /* r9-hitfeel：地上的金圈和大光晕不画 */
      } else if (fx === 'gold') {
        for (let i = 0; i < 3; i++) F.ring(v.x, v.y, v.r * (1 - u) * (1 - i * 0.25), cc, a, 0.5, false, u * 6 + i);
        F.glow(v.x, v.y, v.r, cc, 0.6 * a);
      } else if (!v._hf) F.glow(v.x, v.y, v.r, cc, 0.8 * a);
      break;
    }
    case 'chain': {
      const w = (v.w ?? 2) * 1.2, p = linePoints(F, v), z: [number, number] = [p.z1, p.z2];
      F.B.billboard = null;
      if (v.fx === 'goldthunder') {
        // 伏魔金雷：三股金雷绞成一束 + 外晕光柱 + 天雷直落
        const fl = Math.floor(v.t * 40);
        F.beam(p.x1, p.y1, p.x2, p.y2, 26 * a, cc, 0.25 * a, C.Beam, 1, z);
        F.bolt(p.x1, p.y1, p.x2, p.y2, v.seed + fl * 7, 34, w * 1.6, cc, a, 12, true, z);
        F.bolt(p.x1, p.y1, p.x2, p.y2, v.seed + fl * 13 + 3, 22, w, [1, 0.97, 0.8], a, 10, false, z);
        F.bolt(p.x1, p.y1, p.x2, p.y2, v.seed + fl * 17 + 9, 44, w * 0.7, cc, a * 0.7, 9, false, z);
        F.B.billboard = v.endAnchor ?? { x: v.x2, y: v.y2 };
        if (u < 0.5) F.bolt(v.x2 + 8, v.y2 - 380, v.x2, v.y2, v.seed + fl * 5 + 1, 30, w * 1.3, cc, a * (1 - u * 2), 12, true);
        F.glow(v.x2, v.y2, 60, cc, 0.7 * a); F.glow(v.x2, v.y2, 20, WHITE, 0.9 * a, C.Star);
        if (Math.random() < 0.5) F.sparks(v.x2, v.y2, cc, 4, 380, 0.3, 2.6);
        break;
      }
      F.bolt(p.x1, p.y1, p.x2, p.y2, v.seed + Math.floor(v.t * 30) * 7, 26, w, cc, a, 9, false, z);
      if (extOK() && Math.floor(v.t * 30) % 2 === 0) F.lineSprite(C.KBoltH, p.x1, p.y1, p.z1, p.x2, p.y2, p.z2, 1.05, 40, mixc(cc, WHITE, 0.3), 0.7 * a);
      F.B.billboard = v.endAnchor ?? { x: v.x2, y: v.y2 };
      F.glow(v.x2, v.y2, 26, cc, 0.6 * a);
      if (Math.random() < 0.25) F.crackle(v.x2, v.y2, 40, cc, 0.8, 1);
      break;
    }
    case 'beam': {
      const w = v.r * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85 * 0.7), p = linePoints(F, v), z: [number, number] = [p.z1, p.z2];
      F.B.billboard = null;
      if (v.fx === 'magnet') {
        const cols: RGB[] = [[1, 0.35, 0.35], [1, 0.86, 0.35], [0.47, 0.86, 0.47], [0.47, 0.67, 1], [0.9, 0.9, 0.94]];
        cols.forEach((c2, i) => { const o = (i - 2) * w * 0.3; F.beam(p.x1, p.y1, p.x2, p.y2, w * 0.9, c2, 0.7 * a, C.Beam, 1, [p.z1 + o, p.z2 + o]); }); break;
      }
      if (v.fx === 'rock') {
        const n = 10; for (let i = 1; i <= n; i++) {
          const k = i / n; if (k > u * 2.2) break;
          const x = p.x1 + (p.x2 - p.x1) * k, y = p.y1 + (p.y2 - p.y1) * k;
          const height = 80 * Math.sin(Math.min(1, (u * 2.2 - k) * 3) * Math.PI * 0.5) * a;
          F.B.billboard = { x, y, offsetY: p.z1 + (p.z2 - p.z1) * k }; F.sprite(C.Thorn, x, y + 40 - 10 * k - height / 2, 26, height, 0, [0.45, 0.36, 0.25], 1, 0);
        }
        break;
      }
      F.beam(p.x1, p.y1, p.x2, p.y2, w * 4, cc, 0.55 * a, C.Beam, 1, z);
      F.beam(p.x1, p.y1, p.x2, p.y2, w * 1.2, mixc(cc, WHITE, 0.8), 0.95 * a, C.Beam, 1, z);
      F.B.billboard = v.anchor ?? { x: v.x, y: v.y }; F.glow(v.x, v.y, w * 2.5, cc, 0.7 * a);
      if (extOK()) {
        F.B.billboard = null; F.B.pt(p.x1, p.y1, p.z1); const ax = F.B.ox, ay = F.B.oy;
        F.B.pt(p.x2, p.y2, p.z2); const angle = Math.atan2(F.B.oy - ay, F.B.ox - ax);
        F.B.billboard = v.anchor ?? { x: v.x, y: v.y }; F.sprite(C.KFlare, v.x, v.y, w * 8, w * 3, angle + Math.PI / 2, mixc(cc, WHITE, 0.4), 0.5 * a);
        F.B.billboard = v.endAnchor ?? { x: v.x2, y: v.y2 }; F.sprite(C.KBurst3, v.x2, v.y2, w * 4, w * 4, t * 3, mixc(cc, WHITE, 0.4), 0.5 * a);
      }
      if (v.fx === 'goldthunder' || v.fx === 'icefire' || v.fx === 'lightning') F.bolt(p.x1, p.y1, p.x2, p.y2, v.seed + Math.floor(v.t * 30), w * 1.5, 1.8, cc, a, 14, false, z);
      break;
    }
    case 'bigsword': {
      const drop = Math.min(1, u * 3), p = linePoints(F, v);
      F.lineSprite(C.Glow, p.x1, p.y1, p.z1, p.x2, p.y2, p.z2, 1.2, v.r * 4, cc, 0.4 * a);
      F.lineSprite(C.Blade, p.x1, p.y1, p.z1, p.x2, p.y2, p.z2, 1.15, v.r * (0.9 + 1.4 * drop), mixc(cc, WHITE, 0.55), a);
      F.lineSprite(C.Streak, p.x1, p.y1, p.z1, p.x2, p.y2, p.z2, 1.3, v.r * 1.2, WHITE, 0.6 * a);
      break;
    }
    case 'cone': {
      const r = v.r * (0.4 + 0.6 * Math.min(1, u * 2.5)), n = 7, B = F.B, anchor = v.anchor ?? { x: v.x, y: v.y };
      const offsetY = v.y - anchor.y + (anchor.offsetY ?? 0);
      const draw = (cell: number, x: number, y: number, width: number, height: number, direction: number, turn: number, color: RGB, alpha: number) => {
        B.billboard = null; B.pt(x, y + anchor.y - v.y, offsetY);
        const angle = B.direction(Math.cos(direction), Math.sin(direction)) + turn;
        B.quadS(cell, B.ox, B.oy, width * B.os, height * B.os, angle, color[0], color[1], color[2], alpha, 1, undefined, 1, B.od);
      };
      for (let i = 0; i < n; i++) {
        const an = v.ang - v.spread + (i / (n - 1)) * v.spread * 2;
        draw(C.Streak, v.x + Math.cos(an) * r * 0.5, v.y + Math.sin(an) * r * 0.5, r, 26, an, 0, cc, 0.55 * a);
      }
      if (v.fx === 'sword' && extOK()) draw(C.KArc, v.x + Math.cos(v.ang) * r * 0.6, v.y + Math.sin(v.ang) * r * 0.6, r * 1.3, r, v.ang, Math.PI / 2, mixc(cc, WHITE, 0.5), 0.8 * a);
      if (v.fx === 'flame' && extOK()) for (let i = 0; i < 3; i++) { const an = v.ang + (i - 1) * v.spread * 0.6; draw(C.KFire1, v.x + Math.cos(an) * r * 0.5, v.y + Math.sin(an) * r * 0.5, r * 0.5, r * 0.9, an, Math.PI / 2, mixc(FIRE, cc, 0.3), 0.55 * a); }
      if (v.fx === 'sword') draw(C.Slash, v.x + Math.cos(v.ang) * r * 0.55, v.y + Math.sin(v.ang) * r * 0.55, r * 1.1, r * 1.1 * Math.min(1.4, v.spread * 1.4), v.ang, 0, mixc(cc, WHITE, 0.4), a);
      B.billboard = anchor; F.glow(v.x, v.y, 40, cc, 0.6 * a);
      break;
    }
    case 'aura': {
      for (let i = 0; i < 3; i++) { const k = (u + i / 3) % 1; F.ring(v.x, v.y - k * 90, v.r * (1 - k * 0.4), cc, 0.7 * (1 - k) * a, 0.35); }
      F.sprite(C.Beam, v.x, v.y - 60, 130, v.r * 1.4, Math.PI / 2, cc, 0.25 * a);
      if (extOK()) F.ground(C.KDots, v.x, v.y, v.r * 0.9, t * 1.5, cc, 0.5 * a, 1, 0.45);
      break;
    }
    case 'blinkfx': F.glow(v.x, v.y - 50, v.r * (1 + u), cc, a * 0.6); break;
  }
}

// ------------------------------------------------------------------ 领域
function drawField(F: FxSys, f: any, t: number, dt: number) {
  const k = clamp(f.t / 0.3, 0, 1) * clamp((f.dur - f.t) / 0.4, 0, 1);
  if (k <= 0.01) return;
  const cc = col(f.color);
  bakeField(F, f, t, k);
  switch (f.fx) {
    case 'flame': {
      F.ground(C.Glow, f.x, f.y, f.r * 1.1, 0, FIRE, 0.4 * k, 1, 0.55);
      F.ground(C.FireRing, f.x, f.y, f.r, t * 0.6, FIRE, 0.7 * k, 1, 0.55);
      F.ground(C.Ink, f.x, f.y, f.r * 0.9, 1.3, [0.12, 0.08, 0.05], 0.25 * k, 0, 0.55);
      if (extOK() && Math.random() < dt * 5) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * f.r * 0.8; const h = rnd(70, 130), x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r * (F.B.hd ? 1 : 0.55); F.B.billboard = { x, y }; F.emit({ x, y: y - h * 0.4, vy: -30, life: rnd(0.4, 0.7), s0: h, s1: h * 0.6, c: mixc(FIRE, [1, 0.9, 0.6], Math.random() * 0.3), a: 0.6 * k, cell: Math.random() < 0.5 ? C.KFire1 : C.KFire3 }); F.B.billboard = null; }
      for (let i = nEmit(f.r * 0.35, dt); i > 0; i--) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * f.r; F.emit({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r * (F.B.hd ? 1 : 0.55), vx: rnd(-10, 10), vy: rnd(-120, -60), life: rnd(0.35, 0.7), s0: rnd(22, 40), s1: 6, c: mixc(FIRE, [1, 0.3, 0.1], Math.random() * 0.5), cell: fireCell(), a: 0.9 * k }); }
      if (Math.random() < dt * 6) { const x = f.x + rnd(-f.r, f.r) * 0.6; F.B.billboard = { x, y: f.y }; F.smoke(x, f.y - 40, 1, SMOKE, 0.2 * k, 10, 60); F.B.billboard = null; }
      break;
    }
    case 'lightning': {
      F.ground(C.Rune, f.x, f.y, f.r, t * 0.8, cc, 0.65 * k, 1, 0.55);
      F.ground(C.Glow, f.x, f.y, f.r, 0, cc, 0.25 * k, 1, 0.55);
      if (Math.random() < dt * 9) { const a = Math.random() * TAU, r = Math.random() * f.r; const x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r * (F.B.hd ? 1 : 0.55); F.B.billboard = { x, y }; F.bolt(x + 20, y - 420, x, y, Math.random() * 1e6, 40, 3, cc, 0.95 * k, 10); F.hit(x, y, cc, 0.6); if (extOK()) F.emit({ x: x + 10, y: y - 210, life: 0.1, s0: 440, s1: 440, c: mixc(cc, WHITE, 0.3), a: 0.6 * k, cell: Math.random() < 0.5 ? C.KBoltV1 : C.KBoltV2 }); F.B.billboard = null; }
      if (Math.random() < dt * 6) F.crackle(f.x + rnd(-f.r, f.r) * 0.7, f.y + rnd(-f.r, f.r) * 0.35, 50, cc, 0.8 * k, 1);
      break;
    }
    case 'rock': {
      F.ground(C.Crack, f.x, f.y, f.r, 0.4, [0.22, 0.16, 0.1], 0.6 * k, 0, 0.55);
      F.ground(C.Glow, f.x, f.y, f.r, 0, [0.6, 0.45, 0.25], 0.25 * k, 1, 0.55);
      if (Math.random() < dt * 8) F.smoke(f.x + rnd(-f.r, f.r) * 0.7, f.y + rnd(-f.r, f.r) * 0.35, 1, [0.5, 0.42, 0.3], 0.25 * k, 6, 50);
      break;
    }
    case 'sword': case 'star': {
      F.ground(C.Ring, f.x, f.y, f.r, 0, cc, 0.7 * k, 1, 0.55);
      F.ground(C.Rune, f.x, f.y, f.r * 0.92, t * 0.4, cc, 0.5 * k, 1, 0.55);
      // 剑雨
      for (let i = 0; i < 16; i++) {
        const ph = (t * 2.5 + i * 0.37) % 1;
        const x = f.x + Math.sin(i * 12.9898) * f.r * 0.85, y = f.y + Math.cos(i * 78.233) * f.r * (F.B.hd ? 0.85 : 0.45);
        F.B.billboard = { x, y };
        const yy = y - 300 * (1 - ph);
        F.sprite(C.Blade, x, yy - 20, 54, 12, Math.PI / 2, mixc(cc, WHITE, 0.4), 0.9 * k);
        F.sprite(C.Streak, x, yy - 60, 90, 8, Math.PI / 2, cc, 0.4 * k);
        if (ph > 0.92) { F.glow(x, y, 22, cc, k); if (extOK()) F.sprite(C.KGlint, x, y, 34, 34, 0, mixc(cc, WHITE, 0.5), 0.7 * k); }
        F.B.billboard = null;
      }
      if (f.fx === 'star') for (let i = 0; i < 20; i++) F.glow(f.x + Math.sin(i * 3.1 + t * 0.3) * f.r, f.y + Math.cos(i * 1.7 + t * 0.2) * f.r * 0.5, 8 + 5 * Math.sin(t * 3 + i), cc, k, C.Star);
      break;
    }
    case 'array': {
      F.ground(C.Rune, f.x, f.y, f.r, t * 0.5, cc, 0.85 * k, 1, 0.55);
      F.ground(C.Bagua, f.x, f.y, f.r * 0.6, -t * 0.7, cc, 0.6 * k, 1, 0.55);
      if (extOK()) { F.ground(C.KDots, f.x, f.y, f.r * 0.82, -t * 0.35, cc, 0.55 * k, 1, 0.55); F.ground(C.KCompass, f.x, f.y, f.r * 0.35, t * 1.2, mixc(cc, WHITE, 0.3), 0.45 * k, 1, 0.55); }
      F.ground(C.Glow, f.x, f.y, f.r, 0, cc, 0.2 * k, 1, 0.55);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; const x = f.x + Math.cos(a) * f.r * 0.95, y = f.y + Math.sin(a) * f.r * (F.B.hd ? 0.95 : 0.52); F.B.billboard = { x, y }; F.sprite(C.Beam, x, y - 60, 120, 18, Math.PI / 2, cc, 0.5 * k); F.glow(x, y - 110, 12, cc, k, C.Core); F.B.billboard = null; }
      if (Math.random() < dt * 14) { const a = Math.random() * TAU, r = Math.random() * f.r; F.emit({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r * 0.55, vy: rnd(-60, -30), life: 1, s0: 5, s1: 1, c: cc }); }
      break;
    }
    default: {
      F.ground(C.Glow, f.x, f.y, f.r, 0, cc, 0.4 * k, 1, 0.55);
      F.ground(C.Ring, f.x, f.y, f.r, 0, cc, 0.4 * k, 1, 0.55);
      if (f.heal && Math.random() < dt * 10) F.emit({ x: f.x + rnd(-f.r, f.r) * 0.6, y: f.y, vy: rnd(-80, -40), life: 1, s0: 6, s1: 1, c: [0.6, 1, 0.6], cell: C.Star, rot: 0 });
    }
  }
}
