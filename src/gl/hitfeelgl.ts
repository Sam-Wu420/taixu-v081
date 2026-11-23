// r9-hitfeel 的画面（world/hitfeel.ts 定档，这里画）：
//   · 命中：实心白星（锯齿星，描一圈边色）+ 方向冲击线，三档 × 拳脚 / 剑 / 重兵 / 枪 / 法术 / 爪牙各一套；你挨打是偏红的一版、朝来向。
//     星压着大小、落在被打的人朝着来手的那一面（视频里对手始终看得见）；剑的线细长、重兵的粗短带碎屑、枪是一条贯穿过去的线。
//   · 法术、法器的爆炸：四层立体爆炸交给三维模块（hd2d/hsfx3d.ts 的 blast；木 / 毒、雷、土、风四种配色在这里登记进它的配色表），
//     这里配平面的点缀——雷的电弧（白紫，闪两三下）、落地的焦痕（三维模块的 scorch）或冰霜印 / 毒斑（几秒后淡掉）。
//   · 画质低档（hfLevel 0）、离镜头远：不报立体特效，走原来平面的那一版（轻量）。
// 抖动用自己的小随机序列（不碰 Math.random）；数量都有上限。
import type { Combat } from '../world/combat';
import type { FxEvent } from './combatgl';
import { FxSys, col, mixc, extOK, type RGB } from './fx';
import { C } from './atlas';
import { addBlastPalette } from '../hd2d/hsfx3d';
import { hitFeel, hfLevel, hfSetting, palOf, hfBlast3D, hfWarp, hfRing, hfScorch, hfDebris, HF, type HfPal } from '../world/hitfeel';

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
let seed = 0x2c1b3a95;
const rr = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const rnd = (a: number, b: number) => a + rr() * (b - a);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// 新配的四种四层爆炸配色（火焰色乘在白→橙→红的火焰底色上，余烬同理，烟是普通混合的颜色）
addBlastPalette('hf_venom', { core: [0.9, 1, 0.86], fire: [0.4, 1.15, 0.45], ember: [0.95, 0.3, 1.15], smoke: [0.14, 0.08, 0.18] });   // 木 / 毒：绿焰、紫色余烬、暗紫烟（通道别超过 1.2）
addBlastPalette('hf_void', { core: [0.92, 0.94, 1], fire: [0.3, 0.25, 0.8], ember: [0.6, 0.45, 1.1], smoke: [0.07, 0.05, 0.15] });   // 空间：压暗的焰、深靛的烟——一团往里塌的暗影（原来的 void 偏粉偏艳；加色的蓝紫叠在绿草地上只会变成青色，实拍试过几档）
addBlastPalette('hf_thunder', { core: [0.96, 0.94, 1], fire: [0.75, 0.72, 3.2], ember: [0.85, 0.8, 2.6], smoke: [0.2, 0.19, 0.28] });   // 雷：白紫
addBlastPalette('hf_earth', { core: [1, 0.95, 0.85], fire: [0.9, 0.72, 0.5], ember: [1, 0.72, 0.45], smoke: [0.42, 0.35, 0.26] });   // 土：赭黄、褐尘
addBlastPalette('hf_ink', { core: [1, 0.92, 0.92], fire: [1.0, 0.22, 0.42], ember: [1.0, 0.25, 0.5], smoke: [0.05, 0.03, 0.04] });   // 魔道 / 鬼道：暗红的焰、血色余烬、墨黑的烟（蓝通道一高，叠加过曝后被色调映射推成青色——实拍看过，改成偏红）
addBlastPalette('hf_wind', { core: [0.95, 1, 0.98], fire: [0.5, 0.95, 0.95], ember: [0.75, 1, 0.95], smoke: [0.62, 0.68, 0.64] });   // 风：青白

/** 各系的光色（星的描边、电弧、地上的印、点光源） */
export const PAL_COL: Record<HfPal, RGB> = {
  fire: [1, 0.55, 0.18], gold: [1, 0.85, 0.45], ink: [0.75, 0.2, 0.3], frost: [0.6, 0.88, 1], void: [0.55, 0.55, 1],
  venom: [0.45, 0.95, 0.35], thunder: [0.78, 0.72, 1], earth: [0.85, 0.65, 0.38], wind: [0.65, 1, 0.9],
};

// ================================================================ 命中
/**
 * 实心的锯齿星（普通混合：亮地面上加色的白会被洗掉）：一圈长短交错的尖刺 + 实心芯，先描一圈稍大的边色、再画白的。
 * 不走粒子（粒子按寿命一路淡出，普通混合的淡得更快，两三帧里就看不清了）：前 hold 秒实打实地亮着，之后很快收掉。
 * long：沿 a0 方向拉长几成（剑、枪）
 */
interface Star { anchor: { x: number; y: number; offsetY?: number } | null; x: number; y: number; ang: number[]; len: number[]; R: number; fill: RGB; edge: RGB; t: number; hold: number; fade: number }
const stars: Star[] = [];
function spikeStar(F: FxSys, x: number, y: number, R: number, n: number, fill: RGB, edge: RGB, hold: number, a0: number, long = 1) {
  const rot0 = rr() * TAU, ang: number[] = [], len: number[] = [];
  for (let i = 0; i < n; i++) {
    const an = rot0 + i / n * TAU + rnd(-0.14, 0.14);
    const along = Math.abs(Math.cos(an - a0));
    ang.push(an); len.push(R * (i % 2 ? rnd(0.48, 0.68) : rnd(0.85, 1.05)) * (1 + (long - 1) * along * along));
  }
  if (stars.length >= HF_STARS) stars.shift();
  const a = F.B.billboard;
  stars.push({ anchor: a ? { x: a.x, y: a.y, offsetY: a.offsetY } : null, x, y, ang, len, R, fill, edge, t: 0, hold, fade: 0.04 });
}
/** 同时亮着的星最多几颗 */
const HF_STARS = 24;
/** 每帧（drawCombatGL 里、这一帧的命中事件画完之后）：命中的星 */
export function drawHfStars(F: FxSys, dt: number) {
  if (!stars.length) return;
  const prev = F.B.billboard;
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i]; s.t += dt;
    if (s.t >= s.hold + s.fade) { stars.splice(i, 1); continue; }
    const a = s.t < s.hold ? 1 : 1 - (s.t - s.hold) / s.fade, grow = 0.85 + 0.15 * Math.min(1, s.t / 0.02);
    F.B.billboard = s.anchor;
    for (const [k, c] of [[1.34, s.edge], [1, s.fill]] as [number, RGB][]) {
      for (let j = 0; j < s.ang.length; j++) {
        const L = s.len[j] * k * grow, an = s.ang[j];
        F.B.quad(C.Thorn, s.x + Math.cos(an) * L * 0.4, s.y + Math.sin(an) * L * 0.4, L, L, an + Math.PI / 2, c[0], c[1], c[2], a, 0);
      }
      F.B.quad(C.Disc, s.x, s.y, s.R * 0.66 * k * grow, s.R * 0.66 * k * grow, 0, c[0], c[1], c[2], a, 0);
    }
  }
  F.B.billboard = prev;
}

const EDGE: Record<string, RGB> = { fist: [1, 0.66, 0.12], sword: [0.3, 0.72, 1], heavy: [1, 0.42, 0.08], spear: [1, 0.82, 0.25], scythe: [0.85, 0.35, 1], beast: [1, 0.3, 0.16], spell: [1, 0.7, 0.3] };
const SIZE: Record<string, number> = { fist: 1, sword: 0.85, heavy: 1.15, spear: 0.8, scythe: 1.05, beast: 1, spell: 0.92 };

/**
 * 一下命中（'hit' / 'phit' 事件带了 tier）。billboard 已按事件的 anchor 设好（命中点那一处的立板平面）。
 * up：镜头的「上」在地面上的方向——光整体往镜头那边挪一点，免得和被打的人同一个深度、被他的立板吃掉一半。
 * lite：这一帧已经画了好些下了，这一下只画星和一条线
 */
export function hfHitGL(F: FxSys, ev: FxEvent, up: { x: number; y: number } | null, lite: boolean) {
  (globalThis as { __hfDbg?: number[] }).__hfDbg?.push(ev.x, ev.y, ev.tier ?? -1);
  const tier = clamp(Math.round(ev.tier ?? 1), 1, 3), lod = lite ? 0 : ev.lod ?? 0, red = !!ev.red, wk = red && ev.wk === 'spell' ? 'spell' : ev.wk ?? 'spell';
  const prev = F.B.billboard;
  const a = prev ?? { x: ev.x, y: ev.y };
  let x = ev.x, y = ev.y;
  if (up) { const k = 46, dx = -up.x * k, dy = -up.y * k; F.B.billboard = { x: a.x + dx, y: a.y + dy, offsetY: a.offsetY }; x += dx; y += dy; }
  // 方向：打击方向（敌人挨打）/ 来向（你挨打）——星落在朝来手的那一面，线朝这个方向射出去
  const d = ev.dir ?? 0, sd0 = F.B.direction(Math.cos(d), Math.sin(d)), sd = red ? sd0 + Math.PI : sd0;
  const face = red ? sd : sd + Math.PI, off = 16 + tier * 6;
  x += Math.cos(face) * off; y += Math.sin(face) * off * 0.7;
  const cc = col(ev.color ?? '255,236,200');
  const edge: RGB = red ? [0.92, 0.1, 0.06] : wk === 'spell' ? mixc(cc, [1, 0.8, 0.35], 0.35) : EDGE[wk] ?? EDGE.fist;
  const fill: RGB = red ? [1, 0.72, 0.64] : WHITE;
  const lineC: RGB = red ? [1, 0.5, 0.42] : mixc(edge, WHITE, 0.55);
  const R = [0, 22, 31, 40][tier] * (SIZE[wk] ?? 1);
  // 星：两三帧（实心、描边），中间一点亮芯
  spikeStar(F, x, y, R, 8 + tier * 2, fill, edge, 0.034 + tier * 0.016, sd, wk === 'sword' ? 1.7 : wk === 'spear' ? 1.4 : 1);   // 轻的亮三帧、重的四帧、终的五帧（之后 0.04 息收掉）
  // 点光源不打：近镜头里点光源在草地上照出一个发白的圆盘（实拍看过），星和线本身够亮。只有终档照一下
  if (lod >= 1 && tier >= 3) F.light(x, y, 0, 90, mixc(edge, WHITE, 0.4), 0.6, 0.06);
  // 方向线
  let n = tier === 1 ? 2 + (rr() < 0.5 ? 1 : 0) : tier === 2 ? 4 + Math.floor(rr() * 3) : 7;
  if (lod === 0) n = Math.min(n, lite ? 1 : tier === 1 ? 2 : 3);
  /** 一条冲击线：外面一层边色的光（加色、宽），里面一道白芯（亮草地上也看得清） */
  // 线从星的边上起（不全挤在星芯：几条加色的线叠在同一点，经过泛光就成了一团发白的圆盘——实拍看过）
  const line = (an: number, v: number, life: number, w: number, str: number, c: RGB, x0 = x + Math.cos(an) * R * 0.7, y0 = y + Math.sin(an) * R * 0.7) => {
    F.emit({ x: x0, y: y0, vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: life * 1.1, s0: w * 1.7, s1: w * 0.8, c: edge, a: 0.32, add: 1, stretch: str, drag: 4, cell: C.Streak, rot: an });
    F.emit({ x: x0, y: y0, vx: Math.cos(an) * v, vy: Math.sin(an) * v, life, s0: w, s1: w * 0.4, c, a: 1, add: 0, stretch: str, drag: 4, cell: C.Streak, rot: an });
  };
  if (wk === 'spear') {
    // 枪：一条从身后贯穿过去的长线（白芯），旁边一两条细的
    line(sd, 3600, 0.11 + tier * 0.02, 6 + tier * 2, 0.13, WHITE, x - Math.cos(sd) * 70, y - Math.sin(sd) * 70);
    for (let i = 1; i < n; i += 2) line(sd + rnd(-0.18, 0.18), 2600, 0.08, 3, 0.08, lineC);
  } else {
    for (let i = 0; i < n; i++) {
      const spread = wk === 'sword' ? 0.22 : wk === 'heavy' ? 0.75 : 0.5, an = sd + rnd(-spread, spread) * (i === 0 ? 0.25 : 1);
      if (wk === 'sword') line(an, rnd(2600, 3500), rnd(0.08, 0.13), 3.5 + tier, 0.11, i % 2 ? WHITE : lineC);
      else if (wk === 'heavy') line(an, rnd(1000, 1500), rnd(0.08, 0.12), 14 + tier * 3, 0.04, i % 2 ? [1, 0.85, 0.6] : WHITE);
      else line(an, rnd(1600, 2500), rnd(0.09, 0.14), 7 + tier * 2, 0.07, i % 2 ? WHITE : lineC);
    }
  }
  if (lite) { F.B.billboard = prev; return; }
  // 火花（顺着打击方向）
  F.sparks(x, y, mixc(edge, WHITE, 0.4), (wk === 'heavy' ? 4 : 2) + tier * (lod ? 2 : 1), 700 + tier * 220, 0.2, wk === 'heavy' ? 3 : 2.2, sd, wk === 'sword' ? 0.6 : 1.2);
  // 重兵：碎屑往外崩（带重力）
  if (wk === 'heavy') for (let i = 0; i < 3 + tier * 2; i++) { const an = sd + rnd(-1, 1); F.emit({ x, y: y + rnd(-8, 8), vx: Math.cos(an) * rnd(300, 700), vy: Math.sin(an) * rnd(150, 350) - rnd(150, 400), grav: 1500, life: rnd(0.35, 0.6), s0: rnd(4, 8), s1: 3, c: [0.38, 0.3, 0.22], a: 1, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-12, 12) }); }
  // 妖兽爪牙：三道斜着的爪痕
  if (wk === 'beast' && tier >= 2) for (let i = -1; i <= 1; i++) F.emit({ x: x + Math.cos(sd + Math.PI / 2) * i * 12, y: y + Math.sin(sd + Math.PI / 2) * i * 12, life: 0.12, s0: 34, s1: 46, c: mixc(edge, WHITE, 0.3), a: 0.85, add: 0.4, cell: C.Slash, rot: sd + 0.5 });
  if (tier >= 2 && !red) {
    // 脚下往后崩的土粒（后滑拖土的起头；一路的尘团是立体的，在三维模块里）
    const bb = F.B.billboard, yf = bb ? bb.y + (bb.offsetY ?? 0) : y + 60;   // 脚底在立板平面里的那一行
    for (let i = 0; i < 4 + tier * 2; i++) { const an = sd + rnd(-0.6, 0.6); F.emit({ x: x + rnd(-10, 10), y: yf - 4, vx: Math.cos(an) * rnd(160, 360), vy: -rnd(160, 380), grav: 1500, life: rnd(0.3, 0.5), s0: rnd(3, 6), s1: 2, c: [0.4, 0.31, 0.2], a: 1, add: 0, cell: C.Shard, rot: rnd(0, TAU), vr: rnd(-10, 10) }); }
  }
  if (tier >= 2) {
    // 挥击弧光：横过打击方向的一道弧（剑是一道细长的斩光、枪不画弧）
    if (wk === 'sword') F.emit({ x, y, life: 0.09, s0: 120 + tier * 30, s1: 140 + tier * 30, c: mixc(edge, WHITE, 0.6), a: 0.9, add: 0.6, cell: C.Streak, rot: sd + Math.PI / 2 + rnd(-0.5, 0.5) });
    else if (wk !== 'spear') F.emit({ x: x + Math.cos(face) * 14, y: y + Math.sin(face) * 10, life: 0.08, s0: 26 + tier * 6, s1: 40 + tier * 10, c: edge, a: 0.5, add: 0.3, cell: C.Slash, rot: sd + Math.PI / 2 });   // 弧光收小、偏到来手那一侧（原来那片加色的大弧叠在人身上是一团发白的光）
    F.shockRing(x, y, 46 + tier * 22, mixc(edge, WHITE, 0.5), 0.16, 0.9, 0.3);
  }
  if (tier >= 3) {
    F.shock(x, y, 220, 8, 0.3);
    if (extOK()) F.emit({ x, y, life: 0.12, s0: 34, s1: 70, c: edge, a: 0.35, cell: C.KStarBurst, rot: rnd(0, TAU) });   // 小、带边色（原来一大团泛白的芒盖住人）
  }
  F.B.billboard = prev;
}

// ================================================================ 法术、法器的爆炸
/** 会炸开的法术（落点爆发 / 范围爆）；增益、护身、阵法的光圈不炸 */
const BOOM_FX = new Set(['fireball', 'firesnake', 'flame', 'dragon', 'crow', 'talisman', 'icicle', 'frost', 'water', 'icefire', 'lightning', 'goldthunder', 'gold', 'sword', 'bigsword', 'star', 'palm', 'rock', 'vine', 'leaf', 'blood', 'ghost', 'mind', 'tornado', 'roar']);
/** 弹着点会爆一小团的弹道 */
const POP_FX = new Set(['fireball', 'firesnake', 'flame', 'dragon', 'crow', 'talisman', 'icicle', 'icefire', 'lightning', 'goldthunder', 'gold', 'rock', 'vine', 'leaf', 'blood', 'ghost', 'mind', 'water', 'tornado']);

interface Mark { x: number; y: number; r: number; t: number; dur: number; pal: HfPal; rot: number }
interface Arc { x: number; y: number; r: number; t: number; dur: number; c: RGB; n: number; s: number }
const marks: Mark[] = [];
const arcs: Arc[] = [];
export const hfLive = () => marks.length + arcs.length + stars.length;

/** 地上的冰霜印 / 毒斑（几秒后淡掉） */
function addMark(x: number, y: number, r: number, pal: HfPal) { if (marks.length >= 12) marks.shift(); marks.push({ x, y, r, t: 0, dur: 4.5, pal, rot: rr() * TAU }); }
/** 雷的电弧：一团白紫的电弧从爆心往外窜，闪两三下 */
function addArcs(x: number, y: number, r: number, c: RGB) { if (arcs.length >= 8) arcs.shift(); arcs.push({ x, y, r, t: 0, dur: 0.3, c, n: 6, s: (rr() * 1e6) | 0 }); }

/**
 * 一个爆炸。量放在立体的部分：四层爆炸（白核 → 火焰 → 余烬 → 烟）、紧跟着往上翻的第二团火（烟柱）、往外崩的碎块、一圈扭曲冲击波；
 * 地上只留一圈压暗的接地光（原来一大片平铺的亮色光盘、加一盏大点光源，把草地洗亮一片，看着像贴在地上的图）。pop：弹着点的小爆
 */
function boom(F: FxSys, c: Combat, x: number, y: number, z: number, R: number, power: number, pal: HfPal, pop: boolean, lv: 1 | 2) {
  const g = c.game, pc = PAL_COL[pal], k = lv === 2 ? 1 : 0.8;
  hfBlast3D(g, x, y, z, power * k, pal, R * k);
  hitFeel(c).boomSfx(pal, x, y, pop, pop ? 0.8 : 0.7 + 0.3 * Math.min(1.6, power));
  const prev = F.B.billboard; F.B.billboard = { x, y, offsetY: -z };
  F.light(x, y - 40, 0, R * (pop ? 0.6 : 0.8), mixc(pc, WHITE, 0.3), pop ? 0.6 : 0.9, 0.1);
  if (pal === 'thunder') addArcs(x, y, R * (pop ? 0.8 : 1.2), pc);
  if (pal === 'venom') for (let i = 0; i < (pop ? 6 : 18); i++) { const a = rr() * TAU, v = rnd(120, 420) * (pop ? 0.6 : 1); F.emit({ x, y: y - 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - rnd(120, 300), grav: -60, drag: 1.2, life: rnd(0.6, 1.1), s0: rnd(4, 7), s1: 1.5, c: [0.78, 0.3, 1], a: 1, add: 1, cell: C.Glow }); }   // 紫色余烬（立体余烬里的紫在绿焰里看不出来，平面这层补上）
  F.B.billboard = prev;
  if (pop) return;
  // 往上翻的第二团（烟柱 / 蘑菇头），晚一点、高一截、小一点
  const calm = hitFeel(c).calm;   // 混战里（每秒好几个爆炸、几十个人）不加料：第二团火、碎块都是立体粒子，叠多了显卡吃不消（40 敌连续施法量出来的）
  if (calm && lv === 2 && pal !== 'wind' && pal !== 'frost') hfBlast3D(g, x, y, z + R * 0.9, power * k * 0.55, pal, R * k * 0.6, 0.1);
  // 往外崩的碎块（火、魔是带火的红褐色）
  if (calm && (lv === 2 || power >= 1)) hfDebris(g, x, y, { n: Math.round(6 + 5 * Math.min(2, power)), r: R * 0.5, power: 0.6 + 0.3 * Math.min(2, power), dir: 0, spread: Math.PI, up: 0.9, z, size: 0.55, hot: pal === 'fire' || pal === 'ink' });
  // 扭曲冲击波只给大的、收小收淡：后期的折射在亮草地上会拉出一圈发青的色散、整块发白（实拍：魔道、空间那两张的青色就是它）
  if (power >= 1.2) hfWarp(g, x, y, z + 60, R * 1.2, 0.4, 0.3);
  if (z < 60) {
    hfRing(g, x, y, 6, R * 0.95, [pc[0] * 0.5 + 0.5, pc[1] * 0.5 + 0.5, pc[2] * 0.5 + 0.5], 0.26);   // 一圈接地的激波（红通道压在 0.7 以上：三维模块的环在那以下换成另一种发青的画法）
    if (pal === 'frost' || pal === 'venom' || pal === 'wind') addMark(x, y, R * 0.7, pal);
    else if (pal !== 'void') hfScorch(g, x, y, R * 0.6, 4.5);   // 空间系不留焦痕
  }
}
/** 地面点：billboard 锚点 → (x, y, 离地高度)（和 FxSys.light 同一个换算） */
function groundOf(v: { x: number; y: number; anchor?: { x: number; y: number; offsetY?: number } }): [number, number, number] {
  const a = v.anchor; if (!a) return [v.x, v.y, 0];
  return [a.x, a.y, Math.max(0, (a.y - v.y) - (a.offsetY ?? 0))];
}
/** 离镜头多远 */
const camD = (c: Combat, x: number, y: number) => Math.hypot(x - c.game.cam.x, y - c.game.cam.y);

/**
 * 法术特效刚出现的那一帧（combatgl 的 spawnVfx 先问这里）：落点爆发、范围爆、弹着点换成四层立体爆炸。
 * 返回 true = 这里画了（原来平面的那一套不再画）；false = 照旧（画质低档、离得远、超出每秒的上限、不是会炸的法术）
 */
export function hfVfxSpawn(F: FxSys, c: Combat, v: { kind: string; x: number; y: number; r: number; fx?: string; school?: string; color: string; anchor?: { x: number; y: number; offsetY?: number }; _hf?: number }): boolean {
  const lv = hfLevel(c.game); if (lv === 0 || !hfSetting.on) return false;
  const [gx, gy, gz] = groundOf(v);
  if (camD(c, gx, gy) > HF.near * 1.2) return false;
  const pal = palOf(v.fx, v.school, v.color), hf = hitFeel(c);
  if (v.kind === 'strike' || (v.kind === 'ring' && v.fx && BOOM_FX.has(v.fx) && v.r >= 50)) {
    if (!hf.allowBlast(false)) return false;
    const strike = v.kind === 'strike';
    const power = clamp(v.r / (strike ? 110 : 150), 0.55, 2), R = clamp(v.r * (strike ? 0.95 : 0.75), 80, 260);
    boom(F, c, gx, gy, gz, R, power, pal, false, lv);
    v._hf = 1;
    return true;
  }
  if (v.kind === 'flash' && v.fx && POP_FX.has(v.fx)) {
    if (!hf.allowBlast(true)) return false;
    const R = clamp(v.r * 1.7, 55, 150);
    boom(F, c, gx, gy, gz, R, 0.45, pal, true, lv);
    const pc = PAL_COL[pal];
    F.flash(v.x, v.y, 20 + v.r * 0.4, mixc(pc, WHITE, 0.5), 0.1);
    F.sparks(v.x, v.y, mixc(pc, WHITE, 0.4), 8, 520, 0.28, 2.6);
    v._hf = 1;
    return true;
  }
  return false;
}
/**
 * 统一打击感的二、三档冲击（法器砸下、神通落地：combat.impact）。二档：立体爆炸 + 激波环；三档：再加一圈扭曲冲击波、焦痕。
 * 返回 false = 照旧画原来平面的那一套
 */
export function hfImpact(F: FxSys, c: Combat, x: number, y: number, tier: number, color: string): boolean {
  if (tier < 2 || !hfSetting.on) return false;
  const lv = hfLevel(c.game); if (lv === 0 || camD(c, x, y) > HF.near * 1.2) return false;
  const hf = hitFeel(c); if (!hf.allowBlast(false)) return false;
  const pal = palOf(undefined, undefined, color), big = tier >= 3;
  boom(F, c, x, y, 0, big ? 220 : 150, big ? 1.9 : 1.15, pal, false, lv);
  if (big) hfWarp(c.game, x, y, 80, lv === 2 ? 320 : 240, 0.5, 0.35);
  const prev = F.B.billboard; F.B.billboard = { x, y };
  const pc = mixc(col(color), PAL_COL[pal], 0.4);
  F.shockRing(x, y - 50, big ? 160 : 100, mixc(pc, WHITE, 0.5), 0.2, 0.9, 0.5);
  F.shock(x, y, big ? 700 : 360, big ? 22 : 14, 0.5);
  F.B.billboard = null;
  F.smokeRing(x, y, big ? 220 : 140, [0.2, 0.17, 0.14], 0.3, 0.6);
  F.B.billboard = prev;
  return true;
}

/** 每帧（drawCombatGL 里）：地上的冰霜印 / 毒斑、雷的电弧 */
export function drawHfGL(F: FxSys, dt: number) {
  if (!marks.length && !arcs.length) return;
  const prev = F.B.billboard; F.B.billboard = null;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]; m.t += dt;
    if (m.t >= m.dur) { marks.splice(i, 1); continue; }
    const k = Math.min(1, m.t / 0.12) * Math.min(1, (m.dur - m.t) / 1.6);
    if (m.pal === 'frost') {
      F.ground(C.Glow, m.x, m.y, m.r * 0.7, 0, [0.55, 0.85, 1], 0.1 * k, 1, 0.5);
      F.ground(C.Crack, m.x, m.y, m.r * 0.7, m.rot, [0.85, 0.95, 1], 0.4 * k, 1, 0.5);   // 冰霜印只留裂纹（原来还有一张发白的星芒贴花，平平地铺在地上）
    } else if (m.pal === 'venom') {
      F.ground(C.Ink, m.x, m.y, m.r * 0.9, m.rot, [0.2, 0.08, 0.24], 0.4 * k, 0, 0.5);
      F.ground(C.Glow, m.x, m.y, m.r * 0.5, 0, [0.4, 0.95, 0.3], 0.07 * k, 1, 0.5);
      if (rr() < dt * 6 * k) F.emit({ x: m.x + rnd(-m.r, m.r) * 0.5, y: m.y + rnd(-m.r, m.r) * 0.3, vy: rnd(-50, -20), life: rnd(0.5, 0.9), s0: rnd(12, 20), s1: 34, c: [0.4, 0.75, 0.2], a: 0.32 * k, add: 0.5, cell: extOK() ? C.KWisp2 : C.Smoke, rot: rnd(-0.4, 0.4) });
    } else {
      F.ground(C.RingSoft, m.x, m.y, m.r * 0.8, 0, [0.7, 0.95, 0.9], 0.08 * k, 1, 0.5);
    }
  }
  for (let i = arcs.length - 1; i >= 0; i--) {
    const q = arcs[i]; q.t += dt;
    if (q.t >= q.dur) { arcs.splice(i, 1); continue; }
    const u = q.t / q.dur, fl = (Math.floor(q.t * 40) % 2 ? 0.5 : 1) * (1 - u);
    F.B.billboard = { x: q.x, y: q.y };
    for (let j = 0; j < q.n; j++) {
      const an = j / q.n * TAU + q.s * 0.001, L = q.r * (0.7 + 0.5 * Math.sin(j * 2.3 + q.s));
      F.bolt(q.x, q.y - 40, q.x + Math.cos(an) * L, q.y - 40 + Math.sin(an) * L * 0.6, q.s + j * 131 + Math.floor(q.t * 30) * 7, 14, 2.2, j % 2 ? [1, 1, 1] : q.c, fl, 7, j === 0);
    }
    F.B.billboard = null;
  }
  F.B.billboard = prev;
}
/** 换场 / 读档时清掉 */
export function resetHfGL() { marks.length = 0; arcs.length = 0; stars.length = 0; }
